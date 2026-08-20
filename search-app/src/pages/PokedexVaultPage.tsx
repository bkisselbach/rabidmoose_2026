import { useUrlManagerSync } from '@/lib/useUrlManagerSync';
import { PageShell } from '@/components/PageShell';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Dice5, Search, Sparkles, X } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { CoveoChip } from '@/components/CoveoChip';
import { ResultsUnavailable } from '@/components/ResultsUnavailable';
import { Input } from '@/components/ui/input';
import { SpeciesTile, SpeciesRow, SpeciesTileSkeleton } from '@/components/vault/SpeciesTile';
import { VaultSemanticFallback } from '@/components/vault/VaultSemanticFallback';
import { VaultSpotlight } from '@/components/vault/VaultSpotlight';
import { VaultSearchSuggestions, useVaultTypeahead } from '@/components/vault/VaultSearchSuggestions';
import { VaultGeneratedAnswer } from '@/components/vault/VaultGeneratedAnswer';
import { VaultEmptyState } from '@/components/vault/VaultEmptyState';
import { DidYouMean } from '@/components/DidYouMean';
import { ActiveFilters } from '@/components/ActiveFilters';
import { MobileFilterSheet } from '@/components/MobileFilterSheet';
import { ClassicSortDropdown } from '@/components/ClassicSortDropdown';
import { ViewToggle } from '@/components/ViewToggle';
import { VaultDesktopFacetsPanel } from '@/components/vault/VaultDesktopFacetsPanel';
import { VaultListingToolbar } from '@/components/vault/VaultListingToolbar';
import { VaultFacetsList } from '@/components/vault/VaultFacetsList';
import { ClassicPaginationBar } from '@/components/ClassicPaginationBar';
import { useSeo } from '@/lib/seo';
import { useDelayedReveal, reservedRevealClass } from '@/lib/useDelayedReveal';
import { useViewMode } from '@/lib/useViewMode';
import { loadPokedexNames } from '@/lib/pokedexVocabulary';
import { pokemonPath } from '@/lib/paths';
import { truncateQuery } from '@/lib/truncateQuery';
import { SEMANTIC_ENCODER_EXAMPLE_QUERY, isSemanticEncoderExample } from '@/lib/semanticEncoderExample';
import { useCoveoState } from '@/lib/useCoveoState';
import { useInteractiveResults } from '@/lib/useInteractiveResult';
import { vaultEngine } from '@/vaultEngine';
import {
  VAULT_PAGE_SIZE,
  VAULT_REGULAR_FACETS,
  VAULT_SORT_OPTIONS,
  vaultDidYouMean,
  vaultQueryError,
  vaultQuerySummary,
  vaultResultList,
  vaultSearchBox,
  vaultSort,
  vaultPager,
  vaultUrlManager,
} from '@/vaultControllers';
import { dealInProps } from '@/lib/dealIn';

// The Pokédex Vault -- a species-only search page over all 1,025 dex entries, at its own URL.
// pokedex-vault-plan.md, Phases 1 (route/engine/hero/plain grid), 2 (facets, sort, view toggle,
// pagination, url manager, ActiveFilters, MobileFilterSheet) and 4 (typeahead, did-you-mean, the
// generated answer, Surprise Me, the advice-carrying empty state -- this file's own addition).
//
// The semantic "describe it" finder now lives on the hero box itself (VaultSemanticFallback.tsx,
// fires only when the keyword search comes back empty -- was a separate always-visible panel,
// SemanticFinder.tsx, folded in so the hero has one input, not two). The spotlight (S3 of
// consultant-everywhere-plan.md) also now sits inside the hero, right-aligned, as a compact card.
// Phase 3 is otherwise done via that same S3 work (see item 17's note on why it's chipped
// `passage-retrieval`, not `semantic-encoder`). Phase 5 (verification/polish/doc rows) is what's
// left after this.

/** Strips `q` out of a url-manager fragment string. The classic UrlManager tracks `q` as one of
 *  its own keys (the query-parameters feature registers it), but this page already has a
 *  battle-tested, Phase-1 mechanism for `q` via `searchParams`/`vaultSearchBox` directly -- same
 *  reasoning as SearchResultsPage.tsx's `stripContentOnlyKeys`: one key, one owner, so the two
 *  mechanisms never race over which one's `q` wins. */
function stripQueryParam(fragment: string): string {
  const params = new URLSearchParams(fragment);
  params.delete('q');
  return params.toString();
}

/** Picks a real species at random and navigates straight to its dex entry -- the official
 *  Pokédex's own "Surprise me" affordance (plan §6.2). `sortCriteria: 'random'` isn't needed:
 *  the full name list is already cached for the typeahead (loadPokedexNames), so this is a
 *  client-side pick, not a query. */
function useSurpriseMe() {
  const navigate = useNavigate();
  return async () => {
    const names = await loadPokedexNames();
    if (names.length === 0) return;
    const pick = names[Math.floor(Math.random() * names.length)];
    navigate(pokemonPath(pick));
  };
}

export function PokedexVaultPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [viewMode, setViewMode] = useViewMode();
  const surpriseMe = useSurpriseMe();

  useSeo({
    title: 'Pokédex Vault',
    description:
      'Search and browse every one of the 1,025 Pokémon species — types, dex numbers and generations — in the RabidMoose Pokédex Vault.',
    // The bare path, deliberately, not `pathname + search`: every `?q=` variant of a search page
    // pointing at itself as canonical is how a site tells a crawler that unbounded query strings are
    // all distinct pages worth indexing. One canonical for the index, and the species pages
    // (/pokedex/:name) carry their own.
    path: '/pokedex',
  });

  // The URL is the source of truth for the query, so a shared /pokedex?q=… link, a back/forward and
  // a typed submit all take the same path into the engine.
  //
  // The text field is semi-controlled against it: `input` is what the user is typing, `query` is
  // what has been submitted. They are only force-synced when the URL changes from OUTSIDE the field
  // (a shared link, a back button), which is what stops a keystroke from being overwritten by the
  // previous committed value on every render.
  const [input, setInput] = useState(query);
  useEffect(() => setInput(query), [query]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const typeaheadItems = useVaultTypeahead(input);

  // Drive the engine from `query`. Tracked against a ref of its own -- NOT
  // `vaultSearchBox.state.value` (Phase 1's original check) -- because Phase 4's typeahead now
  // calls `vaultSearchBox.updateText()` on every keystroke too, for live suggestions. That made
  // `vaultSearchBox.state.value` already equal `query` by the time this effect ran after a submit
  // (the user had just typed it), so the old "already matches, nothing to do" branch fired instead
  // of the real submit -- a real bug, caught live: submitting a query silently browsed the whole
  // dex instead. This ref answers a narrower question the search box's own text state can't:
  // "has *this* query actually been sent to the engine," independent of what's currently typed.
  const lastSubmittedQuery = useRef<string | null>(null);
  useEffect(() => {
    if (lastSubmittedQuery.current === query) return;
    if (lastSubmittedQuery.current === null && !query) {
      // Cold load, no query -- the ordinary whole-dex browse. Nothing else would ever send a
      // first request.
      vaultEngine.executeFirstSearch();
    } else {
      vaultSearchBox.updateText(query);
      vaultSearchBox.submit();
    }
    lastSubmittedQuery.current = query;
  }, [query]);

  // Phase 2: mirror facet/sort/page state into the URL (outgoing), and restore it from the URL on
  // a deep link / back-forward / fresh mount (incoming). Deliberately NOT the atomic-write/derived-
  // facet machinery SearchResultsPage.tsx needs -- this page has no query-understanding layer
  // writing facets on the shopper's behalf, only their own clicks, so the plain two-effect pattern
  // is the honest fit (see this file's own "Known traps" note in the plan: don't improvise the
  // heavier mechanism where the simpler one already covers the actual hazard).
  // Both directions now live in `lib/useUrlManagerSync.ts`, shared with the newsroom (item 31f).
  // `stripQuery` because this page's own search box owns `q`, and `extraParams` puts it back on the
  // way out. The rule that this is NOT SearchResultsPage's mechanism is unchanged and restated in
  // that file's header.
  useUrlManagerSync(vaultUrlManager, { stripQuery: true, extraParams: { q: query } });

  const results = useCoveoState(vaultResultList);
  // Click tracking on the Vault's own engine -- see lib/useInteractiveResult.ts. Until 2026-08-18
  // every species opened from this page was invisible to `pokedex-vault`'s ML and reports.
  const getInteractiveResult = useInteractiveResults(vaultEngine, results.results);
  const summary = useCoveoState(vaultQuerySummary);
  // Separate from `results.length === 0` on purpose -- see ResultsUnavailable.
  const queryError = useCoveoState(vaultQueryError);

  // Plain `isLoading` is trustworthy here in a way it deliberately is not on /search: this page runs
  // ONE engine and sends one request per query, so there are no overlapping out-of-order responses
  // settling against a shared slice -- the exact condition useSettledLoading exists to survive. A
  // delayed reveal is all this needs, and it keeps the skeleton from flashing on a fast index read.
  const showSkeleton = useDelayedReveal(summary.isLoading);
  const total = summary.total;

  const submit = (value: string) => {
    const trimmed = value.trim();
    setSearchParams(trimmed ? { q: trimmed } : {});
  };

  const resetFilters = () => {
    VAULT_REGULAR_FACETS.forEach((f) => f.deselectAll());
  };

  return (
      <PageShell>
        {/* Hero panel -- the mockup's rounded dark panel wrapping eyebrow + title + subtitle + box
            (pokedex-vault-plan.md §2/§6.1), with the box hero-scale and centered to match /search's
            own rather than the mockup's cramped right-aligned one. The eyebrow string is shared
            verbatim with SearchResultsPage's Pokédex zone, so the two surfaces name the zone
            identically. Now a two-column row on large screens, split 50/50 (search) : (spotlight,
            filling its whole column) -- was its own full-width row below the hero. `panel-violet-fill`
            (index.css) matches this box's background to the home page's own hero tint -- same token,
            layered as a background IMAGE rather than a `background-color` because this div already
            carries its own `bg-card`, exactly the case that class exists for (see its own comment). */}
        {/* Same hero material as the home page's and the newsroom's (2026-08-18, CSS/theming
            audit): `rounded-3xl` (index.css reserves that step for hero marquees; this was the one
            hero on `rounded-2xl`, the grid-tile step), the violet plate, `hero-border-glow`'s violet
            edge in place of the plain `shadow-rest` it used to carry, and the p-5/sm:p-6 the other
            two use -- it was the only one at p-6/sm:p-8. `panel-violet-fill` paints the identical
            gradient `.poke-hero-bg-layer` does; it stays the background-IMAGE form because this div
            has its own `bg-card` to composite over (see index.css). */}
        {/* The hero is a vertical stack now, rather than being the row itself: the row (search
            column + spotlight column) is its first child and the generated answer its second, so
            an answered query reads as one purple panel together with the box that produced it,
            instead of a separate card floating below the hero. */}
        <div className="panel-violet-fill hero-border-glow mb-8 flex flex-col gap-6 rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
            {/* Half the row only while the spotlight is filling the other half. With a query
                live the spotlight is gone, so the column takes the whole hero width -- at 50% of a
                1440px viewport the box (max-w-2xl) pushed "Surprise me" onto its own line. */}
            <div className={query ? 'min-w-0 flex-1' : 'min-w-0 lg:basis-1/2'}>
              <PageTitle>Pok&eacute;dex Vault</PageTitle>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Every one of the 1,025 species &mdash; search it by name or number, and open any entry
                for stats, evolutions, type matchups and the cards that depict it.
              </p>

              <div className="mt-5 flex flex-wrap items-start gap-2">
                {/* A plain form, not the shared SearchBox component: that one is typed against
                    `@coveo/headless/commerce` (its controller, instant products and recent queries are
                    all commerce types) and the Vault runs on the classic Search API.
                    VaultSearchSuggestions (Phase 4) supplies the dropdown; this form still owns the
                    actual input, exactly as Phase 1 built it. One input for both a name/number lookup
                    and a "describe it" query -- see VaultSemanticFallback below, which fires only when
                    this box's own keyword search comes back empty. */}
                <form
                  role="search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSuggestionsOpen(false);
                    submit(highlighted >= 0 ? typeaheadItems[highlighted].text : input);
                  }}
                  className="relative w-full max-w-2xl"
                >
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    type="search"
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      setSuggestionsOpen(true);
                      setHighlighted(-1);
                      vaultSearchBox.updateText(e.target.value);
                    }}
                    onFocus={() => {
                      setSuggestionsOpen(true);
                      vaultSearchBox.showSuggestions();
                    }}
                    onKeyDown={(e) => {
                      if (!suggestionsOpen || typeaheadItems.length === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlighted((i) => Math.min(i + 1, typeaheadItems.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlighted((i) => Math.max(i - 1, -1));
                      } else if (e.key === 'Escape') {
                        setSuggestionsOpen(false);
                      }
                    }}
                    aria-label="Search Pokémon by name, number, or description"
                    placeholder="Search by name, number, or describe it..."
                    className="h-12 pl-11 pr-11 text-base"
                  />
                  {input && (
                    <button
                      type="button"
                      onClick={() => {
                        setInput('');
                        setSuggestionsOpen(false);
                        submit('');
                      }}
                      aria-label="Clear search"
                      className="pressable absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <VaultSearchSuggestions
                    open={suggestionsOpen}
                    items={typeaheadItems}
                    highlighted={highlighted}
                    onHighlight={setHighlighted}
                    onSelect={(value) => {
                      setInput(value);
                      setSuggestionsOpen(false);
                      submit(value);
                    }}
                  />
                </form>
                <button
                  type="button"
                  onClick={surpriseMe}
                  className="pressable card-hover flex h-12 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-semibold text-foreground hover:border-primary/40"
                >
                  <Dice5 className="h-4 w-4 text-primary" aria-hidden />
                  Surprise me
                </button>
              </div>
              {/* One discoverable trigger for the semantic-encoder chip's only verified example
                  (lib/semanticEncoderExample.ts, same module /search's ConsultantPanel uses) --
                  distinct from the "describe it" fallback that now lives on the search box itself
                  (VaultSemanticFallback.tsx, fires on zero keyword results): that one demonstrates
                  Passage Retrieval (a recall capability), this one demonstrates the semantic encoder
                  (a reranking capability, applied to the MAIN search box's own ordinary keyword
                  results). Two different mechanisms, kept visually apart so a demo doesn't conflate
                  them. Browse-only, same gate as Surprise Me -- another way into a fresh search, not
                  a response to one. */}
              {!query && (
                <button
                  type="button"
                  onClick={() => submit(SEMANTIC_ENCODER_EXAMPLE_QUERY)}
                  className="pressable card-hover mt-2 flex items-center gap-1.5 self-start rounded-lg border border-coveo/25 bg-coveo/5 px-2.5 py-1 text-xs font-medium text-coveo hover:border-coveo/40"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Try describing a Pok&eacute;mon instead of naming it
                </button>
              )}
            </div>

            {/* The spotlight lives inside the hero, filling the other half of the row next to the
                search column, rather than its own full-width row below it. Same browse-only gate as
                before -- it's a landing treatment, and doesn't belong next to an active search's own
                results. */}
            {!query && (
              <div className="min-w-0 lg:basis-1/2">
                <VaultSpotlight />
              </div>
            )}
          </div>

          {/* Folded into the hero, so it drops its own bottom margin and takes the inset
              treatment (a slightly stronger coveo tint) to hold its edge over the violet plate.
              Keyed on the query so each search remounts it: its skeleton is on a delay that has to
              outlast a Coveo refusal, and a delay measured from a PREVIOUS query's loading state
              has already elapsed -- which is what let a refused query flash a skeleton into the
              hero and then collapse it again. */}
          {query && <VaultGeneratedAnswer key={query} embedded />}
        </div>

        {query && <DidYouMean controller={vaultDidYouMean} />}
        {/* One search box now serves both a name/number lookup and a "describe it" query (was a
            second always-visible panel, SemanticFinder.tsx). It only fires once the keyword
            pipeline has already come back empty, so it can never widen the plain keyword count --
            same zero-net-inflation discipline as the semantic-encoder regression this page's
            history already recorded. */}
        {query && !summary.isLoading && total === 0 && <VaultSemanticFallback query={query} />}

        {/* Mobile-only: the left column below is `hidden` under md, so Filters/Sort/View need
            their own compact row here instead of vanishing on small screens. Same pattern as
            /search's own mobile row. */}
        <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
          <MobileFilterSheet title="Filters">
            <VaultFacetsList />
          </MobileFilterSheet>
          <div className="flex items-center gap-2">
            <ClassicSortDropdown controller={vaultSort} options={VAULT_SORT_OPTIONS} />
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        <div className="md:flex md:items-start md:gap-6 lg:gap-8">
          <VaultDesktopFacetsPanel onReset={resetFilters} />

          <div className="min-w-0 flex-1">
            <ActiveFilters facets={VAULT_REGULAR_FACETS} />

            {/* Same border-b/pb-3-outer, h-9-inner split as /search's DesktopFacetsPanel +
                ListingToolbar pair (see VaultDesktopFacetsPanel's own comment): it's what puts
                "Filters" and this row's text on one shared baseline across the two columns,
                instead of each sizing to its own content. */}
            <div className="mb-4 border-b border-border pb-3">
              <div className="flex h-9 flex-wrap items-center justify-between gap-3">
                <p data-testid="vault-summary" className="text-sm text-muted-foreground">
                  {showSkeleton ? (
                    <span className="skeleton inline-block h-4 w-40 rounded-full align-middle" />
                  ) : total === 0 ? (
                    <>
                      <span className="font-semibold text-primary tabular-nums">0</span> Pok&eacute;mon
                      {query && (
                        <>
                          {' '}
                          for{' '}
                          <span className="font-semibold text-primary" title={query.length > 60 ? query : undefined}>
                            &ldquo;{truncateQuery(query)}&rdquo;
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Showing{' '}
                      <span className="font-semibold text-primary tabular-nums">{summary.firstResult}</span>
                      &ndash;
                      <span className="font-semibold text-primary tabular-nums">{summary.lastResult}</span> of{' '}
                      <span className="font-semibold text-primary tabular-nums">{total.toLocaleString()}</span> Pok&eacute;mon
                      {query && (
                        <>
                          {' '}
                          for{' '}
                          <span className="font-semibold text-primary" title={query.length > 60 ? query : undefined}>
                            &ldquo;{truncateQuery(query)}&rdquo;
                          </span>
                        </>
                      )}
                    </>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  {/* ONE marker for this listing, however many capabilities are serving it right
                      now -- the semantic-encoder example query used to add a second icon beside
                      the first, which is two marks for one set of results. */}
                  <CoveoChip
                    capability={[
                      'pokedex-index',
                      ...(isSemanticEncoderExample(query)
                        ? [
                            {
                              capability: 'semantic-encoder' as const,
                              detailSuffix:
                                'On this query: Charmander and Charizard out-rank Salandit despite all three matching the same words ("lizard", "flame", "tail", "fire") — the embeddings model breaks that tie by meaning. Verified live, and note what it is NOT: this pipeline reranks keyword matches, it doesn’t retrieve on meaning alone.',
                            },
                          ]
                        : []),
                    ]}
                  />
                  <VaultListingToolbar sort={vaultSort} viewMode={viewMode} onViewModeChange={setViewMode} />
                </div>
              </div>
            </div>

            {/* `isLoading` decides that the skeleton EXISTS (so the grid holds its height from
                first paint); `showSkeleton` only decides whether it's painted. Gating existence on
                the delayed flag left this area empty for the reveal delay and then pushed the
                pager and footer down -- see reservedRevealClass. */}
            {summary.isLoading ? (
              <div
                className={`${viewMode === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6' : 'space-y-2'} ${reservedRevealClass(showSkeleton)}`}
              >
                {Array.from({ length: VAULT_PAGE_SIZE }).map((_, i) => (
                  <SpeciesTileSkeleton key={i} />
                ))}
              </div>
            ) : queryError.hasError ? (
              // Ahead of the empty state: a failed request has no results to be zero of, and
              // VaultEmptyState's "clear your filters" advice cannot fix one.
              <ResultsUnavailable what="Pokémon" onRetry={() => vaultSearchBox.submit()} />
            ) : results.results.length === 0 ? (
              <VaultEmptyState
                onClear={() => {
                  submit('');
                  resetFilters();
                }}
                onSurpriseMe={surpriseMe}
              />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {results.results.map((result, index) => (
                  <div key={result.uniqueId} {...dealInProps(index)}>
                    <SpeciesTile result={result} interactiveResult={getInteractiveResult(result)} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {results.results.map((result) => (
                  <SpeciesRow key={result.uniqueId} result={result} interactiveResult={getInteractiveResult(result)} />
                ))}
              </div>
            )}

            <ClassicPaginationBar controller={vaultPager} isLoading={summary.isLoading} />
          </div>
        </div>
      </PageShell>
  );
}
