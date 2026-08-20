import { useUrlManagerSync } from '@/lib/useUrlManagerSync';
import { PageShell } from '@/components/PageShell';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { CoveoChip } from '@/components/CoveoChip';
import { ClassicFacet } from '@/components/ClassicFacet';
import { ClassicSortDropdown } from '@/components/ClassicSortDropdown';
import { ClassicPaginationBar } from '@/components/ClassicPaginationBar';
import { DidYouMean } from '@/components/DidYouMean';
import { NewsCard, NewsCardSkeleton } from '@/components/news/NewsCard';
import { Input } from '@/components/ui/input';
import { useSeo } from '@/lib/seo';
import { useDelayedReveal, reservedRevealClass } from '@/lib/useDelayedReveal';
import { newsRecordFromResult, type NewsRecord } from '@/lib/newsRecord';
import { useInteractiveResults } from '@/lib/useInteractiveResult';
import { truncateQuery } from '@/lib/truncateQuery';
import { useCoveoState } from '@/lib/useCoveoState';
import { ResultsUnavailable } from '@/components/ResultsUnavailable';
import { newsEngine } from '@/newsEngine';
import {
  NEWS_FACETS,
  NEWS_PAGE_SIZE,
  NEWS_SORT_CRITERIA,
  NEWS_SORT_OPTIONS,
  newsDidYouMean,
  newsPager,
  newsQueryError,
  newsQuerySummary,
  newsResultList,
  newsSearchBox,
  newsSort,
  newsUrlManager,
} from '@/newsControllers';
import { dealInProps } from '@/lib/dealIn';

// Pokémon News -- a real newsroom search surface over the app's THIRD Coveo source.
//
// Everything here is live Coveo: the facets, the sort, the pager, did-you-mean and the URL
// round-trip are the same Headless controllers /search and /pokedex run on, pointed at
// `pokemon-news-push`. What is NOT Coveo, and is disclosed on the page rather than buried here:
// the article body text was written for this PoC. The headlines, dates, categories and one-line
// summaries are real records from pokemon.com/us/news.

/**
 * Serializes params the way Headless's url manager expects.
 *
 * `URLSearchParams.toString()` is form-encoding: a space becomes `+`. Headless's url manager reads
 * the fragment with `decodeURIComponent`, which does NOT treat `+` as a space -- so a criterion
 * round-tripping through URLSearchParams arrives as the literal string `date+descending` and the
 * Search API rejects the whole query with
 * `400 InvalidSortValueException: Invalid sort criteria: "date+descending"`.
 *
 * Caught live: this page's DEFAULT sort is `date descending`, so every cold load 400'd and the page
 * rendered "0 stories" with a perfectly healthy index behind it. Percent-encoding the space instead
 * is what both sides agree on.
 *
 * Any criterion containing a space hits this -- which is every field sort, not just ours.
 */
function toFragment(params: URLSearchParams): string {
  return params.toString().replace(/\+/g, '%20');
}

/** The current query string, as the url manager spells it. */
function currentFragment(): string {
  return typeof window === 'undefined' ? '' : window.location.search.slice(1).replace(/\+/g, '%20');
}

/**
 * Compares two fragments by MEANING, not by string.
 *
 * The two sides spell the same state differently and always will: the url manager emits raw spaces
 * (`sortCriteria=date descending`) while anything routed through URLSearchParams emits `%20` or
 * `+`. A `!==` between them is therefore permanently true, which turns the incoming effect into an
 * infinite "they differ, synchronize, they still differ" loop -- measured as a duplicate search on
 * every shared `?sortCriteria=` link.
 */
function fragmentsEqual(a: string, b: string): boolean {
  const norm = (f: string) =>
    [...new URLSearchParams(f).entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('&');
  return norm(a) === norm(b);
}

export function PokemonNewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [filtersOpen, setFiltersOpen] = useState(false);

  useSeo({
    title: 'Pokémon News',
    description:
      'Set releases, market movers, organized play and Pokédex updates — searchable, filterable, and linked straight to the cards each story is about.',
    // The bare path, not `pathname + search`: a search page advertising every `?q=` variant as its
    // own canonical tells a crawler that unbounded query strings are all distinct pages worth
    // indexing. Same rule the Vault applies.
    path: '/pokemon-news',
  });

  // Semi-controlled against the URL: `input` is what is being typed, `query` is what was submitted.
  // Force-synced only when the URL changes from OUTSIDE the field (a shared link, a back button),
  // which is what stops a keystroke being overwritten by the previous committed value.
  const [input, setInput] = useState(query);
  useEffect(() => setInput(query), [query]);

  // THE URL MANAGER OWNS THE WHOLE FRAGMENT, `q` INCLUDED.
  //
  // The first version of this page drove `q` separately -- a `?q=` effect calling
  // `updateText`/`submit`, with `q` stripped out of the fragment handed to the manager, copying
  // PokedexVaultPage's split. It looked right and was measurably broken: every query returned the
  // whole corpus. `submit()` set the query, the manager's fragment changed, the outgoing sync wrote
  // the URL, that re-entered the incoming effect, and `synchronize()` was handed a fragment with
  // `q` deliberately removed -- which Headless reads as "the query is empty", wiping it and
  // re-searching. Traced live: `/pokemon-news?q=pikachu` sent two requests, both `q: ""`, and the
  // page reported 15 stories for a term that matches 4.
  //
  // The manager already serializes `q`. Letting it own the key outright removes the split-brain
  // entirely, and the search box just talks to the controller.
  const hasExecuted = useRef(false);
  useEffect(() => {
    if (hasExecuted.current) return;
    hasExecuted.current = true;
    // A KNOWN, MEASURED TRADE-OFF -- a cold load costs two requests, and that is the cheaper of
    // the two options rather than an oversight.
    //
    // No classic-engine mechanism applies a default sort criterion to the FIRST request. All three
    // were built and traced live:
    //
    //   buildSort({ initialState: { criterion } })   -> request 1 `sort="relevancy"`, then a
    //                                                   second `sort="date descending"`.
    //   url manager initialState carrying the sort   -> ONE request, but `sort="relevancy"`: the
    //                                                   criterion never reached the engine at all,
    //                                                   leaving the newsroom in index order.
    //   newsSort.sortBy() here                       -> two requests, second correctly sorted.
    //
    // So the real choice is "two requests, right order" versus "one request, wrong order", and on a
    // news page the ordering IS the product -- an unsorted newsroom is broken in a way one extra
    // request is not. The cost is one aborted first search, which Headless logs as
    // `Action dispatch error search/executeSearch/rejected`; /pokemon-news therefore opens with one
    // console error the app's other routes don't have. Worth revisiting if a `registerSortCriterion`
    // style reducer action ever ships for the classic engine (there is none today -- checked).
    //
    // A shared `?sortCriteria=` link skips this branch entirely: it is already correct in one
    // request, because the manager restored it at construction.
    const params = new URLSearchParams(currentFragment());
    if (params.has('sortCriteria')) {
      // The manager restored the shared link's own sort at construction; just run the search.
      newsEngine.executeFirstSearch();
    } else {
      // `sortBy` both applies the criterion and performs the search, so it IS the first search.
      newsSort.sortBy(NEWS_SORT_CRITERIA.newest);
    }
  }, []);

  // Outgoing: manager -> URL. Compared against `window.location.search` rather than the
  // `searchParams` snapshot so a stale closure can't cause a write loop.
  // Both directions now live in `lib/useUrlManagerSync.ts`, shared with the Vault (item 31f).
  // `skipFirstIncoming` preserves the measured fix documented below: the mount effect above has
  // already applied the default sort, and letting the first incoming pass run would synchronise it
  // straight back out and leave the newsroom unsorted.
  useUrlManagerSync(newsUrlManager, { skipFirstIncoming: true });

  const results = useCoveoState(newsResultList);
  // Separate from `records.length === 0` on purpose -- see ResultsUnavailable.
  const queryError = useCoveoState(newsQueryError);
  const summary = useCoveoState(newsQuerySummary);
  const pagerState = useCoveoState(newsPager);

  // Plain `isLoading` is trustworthy here in the way it is on the Vault and deliberately is not on
  // /search: one engine, one request per interaction, so no out-of-order responses settle against a
  // shared slice. A delayed reveal keeps the skeleton from flashing on a fast index read.
  const showSkeleton = useDelayedReveal(summary.isLoading);

  const records = results.results.map(newsRecordFromResult);

  // "Zero stories" has to be CONFIRMED before it's shown, because on this page it is routinely a
  // transient state rather than an answer. A cold load deliberately aborts its first search (see the
  // sort trade-off above), and that abort settles as `isLoading: false` with zero results -- so the
  // listing rendered its short "No stories match that" panel, then jumped to the full grid when the
  // real response landed a beat later. Measured at 0.35 cumulative layout shift, the worst in the
  // app, and gating the grid on `isLoading` alone could not fix it: the empty state, not the
  // skeleton, was what occupied the space.
  //
  // The grace is one-sided and costs the happy path nothing: any response WITH results renders
  // immediately (`emptyConfirmed` is only consulted when there are none), and a genuinely empty
  // search just holds the skeleton for a beat longer before saying so. Any new request in the
  // meantime flips `isLoading` and resets the timer, which is what bridges the abort/retry gap.
  const emptyConfirmed = useDelayedReveal(!summary.isLoading && records.length === 0, 400);
  const listingPending = summary.isLoading || (records.length === 0 && !emptyConfirmed);

  // Click tracking on the news engine -- see lib/useInteractiveResult.ts. The page renders mapped
  // NewsRecords rather than raw Results (the hero/grid split slices them), so the record carries
  // `uniqueId` and this walks back to the Result behind it. A linear scan over one page of news
  // results is cheaper than the Map that would avoid it.
  const getInteractiveResult = useInteractiveResults(newsEngine, results.results);
  const interactiveFor = (record: NewsRecord) => {
    const result = results.results.find((r) => r.uniqueId === record.uniqueId);
    return result ? getInteractiveResult(result) : undefined;
  };
  const hasFacetSelection = NEWS_FACETS.some(({ controller }) =>
    controller.state.values.some((v) => v.state !== 'idle')
  );
  // The lead story only leads an UNFILTERED first page. Once someone has searched or filtered, the
  // top result is just the top result -- promoting it to hero would imply an editorial decision the
  // page didn't make.
  const showHero = !query && !hasFacetSelection && pagerState.currentPage === 1 && records.length > 0;
  const heroRecord = showHero ? records[0] : null;
  const gridRecords = showHero ? records.slice(1) : records;

  // Straight to the controller. The url manager writes `q` into the URL as a consequence, which is
  // the opposite of the original direction and the reason this works.
  const submit = (value: string) => {
    newsSearchBox.updateText(value.trim());
    newsSearchBox.submit();
  };

  const resetFilters = () => NEWS_FACETS.forEach(({ controller }) => controller.deselectAll());

  const facetRail = (
    <div className="space-y-3">
      {/* `showCounts={false}` -- newsroom only. See the prop's note in ClassicFacet: an 18-story
          archive makes most per-value counts a literal "1", which is noise rather than a signal. */}
      {NEWS_FACETS.map(({ controller, label }) => (
        <ClassicFacet key={label} controller={controller} label={label} showCounts={false} />
      ))}
    </div>
  );

  return (
      <PageShell>
        {/* THE HERO IS FULL-WIDTH AND ABOVE THE COLUMNS (2026-08-19, visual-consistency audit).
            It used to be the first child of the RIGHT column, which made this the only one of the
            app's three listing pages whose hero was indented past a filter rail -- and it needed a
            `md:mt-8` fudge to square its top edge against the first facet card, a number derived
            from the exact height of the rail header this audit just replaced. /search puts
            ConsultantPanel above its columns and /pokedex puts its hero above its columns; this
            does the same, the magic offset is gone, and the "Filters" row now starts at the same
            height as the stories toolbar beside it the way it does on both other pages. */}
        <div className="hero-border-glow relative mb-8 rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
            <div className="poke-hero-bg-layer" />
          </div>
          <div className="relative z-10">
            {/* No size override (2026-08-18, CSS/theming audit). PageTitle exists precisely
                because this page used to come in at text-xl/sm:text-2xl while /search and the
                PDP ran text-3xl -- and the override had quietly reintroduced exactly that, so
                "the page title" was two ranks again depending on where you landed. */}
            <PageTitle>Pok&eacute;mon News</PageTitle>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Set releases, organized play, and what&rsquo;s coming to the TCG &mdash; every story
              linked to the cards and Pok&eacute;dex entries it&rsquo;s actually about.
            </p>

            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
              className="relative mt-3 w-full"
            >
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label="Search Pokémon news"
                placeholder="Search the newsroom..."
                className="h-11 pl-11 pr-11 text-base"
              />
              {input && (
                <button
                  type="button"
                  onClick={() => {
                    setInput('');
                    submit('');
                  }}
                  aria-label="Clear search"
                  className="pressable absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Same two-column wrapper /search and /pokedex use, character for character -- this page
            spelled it `flex gap-6`, which also meant it stayed a flex row below `md` where the
            aside is `hidden` and there is no second column to be a row of. */}
        <div className="md:flex md:items-start md:gap-6 lg:gap-8">
          <aside className="mb-6 hidden w-64 shrink-0 md:block lg:w-72">
            {/* The rail header is now character-for-character the one DesktopFacetsPanel and
                VaultDesktopFacetsPanel render (2026-08-19, visual-consistency audit). The app has
                exactly three filter rails and this was the only one that spelled its own: `eyebrow`
                (11px/700/uppercase) against their `text-sm text-muted-foreground`, a `text-2xs`
                uppercase Reset against their plain `text-sm` one, and neither the `border-b pb-3`
                divider, the `h-9` row, nor the `sticky top-20` the other two share. Same three
                columns, three different headers -- and the two that agreed were the ones a visitor
                is least likely to see back to back. */}
            <div className="sticky top-20 space-y-4">
              <div className="border-b border-border pb-3">
                <div className="flex h-9 items-center justify-between gap-3">
                  {/* Same one-marker-per-column treatment the /search and /pokedex rails carry
                      (DesktopFacetsPanel, VaultDesktopFacetsPanel) -- this was the third filter
                      column in the app and the only unmarked one. */}
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Filters</span>
                    <CoveoChip capability={['dynamic-facets', 'url-manager']} />
                  </span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="pressable text-sm text-muted-foreground hover:text-primary hover:underline"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
              {facetRail}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <DidYouMean controller={newsDidYouMean} />
            {/* `minmax(0,1fr)`, not `1fr` (2026-08-19, visual-consistency audit). A grid track
                spelled `1fr` keeps `min-width: auto`, so it cannot shrink below its content and the
                row pushes the page instead: measured at exactly 768px -- the width this `md:` grid
                switches on -- the Sort control's own 227px minimum drove `scrollWidth` to 769
                against a 768 viewport, one pixel of horizontal page scroll on the newsroom at the
                one width nothing else overflows at. */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <p data-testid="news-summary" className="text-sm text-muted-foreground">
                {showSkeleton ? (
                  <span className="skeleton inline-block h-4 w-40 rounded-full align-middle" />
                ) : (
                  <>
                    <span className="font-semibold text-primary tabular-nums">{summary.total.toLocaleString()}</span>{' '}
                    {summary.total === 1 ? 'story' : 'stories'}
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
              <div className="flex items-center gap-3 md:hidden">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                  className="pressable flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                  Filters
                </button>
                <CoveoChip capability="news-index" />
                <ClassicSortDropdown controller={newsSort} options={NEWS_SORT_OPTIONS} />
              </div>
              <ClassicPaginationBar
                controller={newsPager}
                isLoading={summary.isLoading}
                className="order-last flex w-full items-center justify-center gap-5 text-sm md:order-none md:w-auto"
              />
              <div className="hidden items-center justify-end gap-3 md:flex">
                <CoveoChip capability="news-index" />
                <ClassicSortDropdown controller={newsSort} options={NEWS_SORT_OPTIONS} />
              </div>
            </div>

            {filtersOpen && (
              <div className="mb-4 md:hidden">
                <div className="mb-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="pressable text-sm text-muted-foreground hover:text-primary hover:underline"
                  >
                    Reset
                  </button>
                </div>
                {facetRail}
              </div>
            )}

            {/* Gated on `isLoading`, NOT on `showSkeleton`: the skeleton has to occupy its space
                from the first paint, or the page is 700px shorter for the reveal delay and then
                jolts everything below it down. `showSkeleton` only decides whether it's painted.
                See reservedRevealClass. */}
            {listingPending ? (
              <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${reservedRevealClass(showSkeleton)}`}>
                {Array.from({ length: NEWS_PAGE_SIZE }).map((_, i) => (
                  <NewsCardSkeleton key={i} />
                ))}
              </div>
            ) : queryError.hasError ? (
              // Ahead of the empty state, not inside it: when the request itself failed there are no
              // "results" to be zero of, and the empty state's advice (retype the query, clear a
              // filter) cannot fix a request that never landed.
              <ResultsUnavailable what="stories" onRetry={() => newsSearchBox.submit()} />
            ) : records.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center">
                <p className="text-sm font-semibold text-foreground">No stories match that.</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  {hasFacetSelection
                    ? 'Try clearing a filter — the newsroom is a small archive, so several filters at once can rule everything out.'
                    : 'Try a Pokémon name, a set, or a topic like “Worlds 2026”.'}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                  {hasFacetSelection && (
                    <button type="button" onClick={resetFilters} className="pressable text-sm font-semibold text-primary hover:underline">
                      Clear filters
                    </button>
                  )}
                  {query && (
                    <button type="button" onClick={() => submit('')} className="pressable text-sm font-semibold text-primary hover:underline">
                      Browse everything &rarr;
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {heroRecord && (
                  <div className="mb-4">
                    <NewsCard record={heroRecord} variant="hero" interactiveResult={interactiveFor(heroRecord)} />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {gridRecords.map((record, index) => (
                    <div key={record.slug} {...dealInProps(index)}>
                      <NewsCard record={record} interactiveResult={interactiveFor(record)} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </PageShell>
  );
}
