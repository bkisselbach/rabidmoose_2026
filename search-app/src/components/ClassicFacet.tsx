import { useEffect, useRef, useState } from 'react';
import type { Facet as HeadlessFacet, FacetValue, SpecificFacetSearchResult } from '@coveo/headless';
import { FacetShell } from '@/components/FacetShell';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';
import { useCoveoState } from '@/lib/useCoveoState';
import { TypeFlash } from '@/components/TypeFlash';
import { markTypeFlash, typeFlashKey } from '@/lib/typeFlash';

// Regular-facet UI for any CLASSIC Search API engine -- a twin of RegularFacet.tsx, not a reuse of
// it: that component is typed against `@coveo/headless/commerce`, and the classic engines take
// `Facet` from `@coveo/headless` (pokedex-vault-plan.md §7's own reasoning). FacetShell itself IS
// shared by both -- it's presentation-only, with no Headless types in it at all.
//
// Same value-chip visual language as RegularFacet, including the type-color/icon treatment, so a
// visitor moving between /search, /pokedex and /pokemon-news sees one facet vocabulary.
//
/** Facet-search debounce. Long enough that a typed word is one request rather than eight, short
 *  enough that the list feels like it is answering the keystroke. */
const FACET_SEARCH_DEBOUNCE_MS = 200;

// STARTED LIFE AS `VaultFacet` in components/vault/ and was renamed when /pokemon-news became the
// second classic-engine page (2026-08-17). Nothing about it was ever Vault-specific except the
// name, and the alternative was a near-identical `NewsFacet` -- which is exactly the duplication
// card-system-plan.md §1c complains about, where "a product card" ended up with three separate
// implementations before anyone noticed.
export function ClassicFacet({
  controller,
  label,
  withSearch = false,
  withTypeIcons = false,
  showCounts = true,
}: {
  controller: HeadlessFacet;
  /** Classic FacetState carries `label`, not commerce's `displayName` -- and unlike the
   *  commerce Facet manager, nothing here names the field for us, so callers pass one. */
  label: string;
  /** Ability's own long tail (plan §6.4) -- the only facet on this page that needs search-within-
   *  values rather than a longer static list. */
  withSearch?: boolean;
  /** The Type facet only -- the caller knows which controller this is, so it says so directly
   *  rather than this component guessing from the field name. */
  withTypeIcons?: boolean;
  /** Per-value result counts. On at every catalog surface, where "how many" is a real shopping
   *  signal and the numbers are large enough to compare. Off on /pokemon-news: that archive is 18
   *  stories, so almost every count renders as a "1" -- a column of 1s that reads as noise next to
   *  the label and tells a reader nothing they would act on. The counts are still IN the facet
   *  state either way; this only decides whether they are drawn. */
  showCounts?: boolean;
}) {
  // `facetSearch` state lives nested inside the same FacetState tree (not a separate
  // controller/subscription) -- one `controller.subscribe()` covers both.
  const state = useCoveoState(controller);
  const searchState = state.facetSearch;

  // THE FACET SEARCH BOX DID NOT WORK. `updateText` and `search` are separate calls in Headless --
  // the first sets the query, only the second asks the index -- and this component only ever called
  // the first. So typing into it set `searchState.query`, which flipped `showingSearchResults` true
  // and hid every facet value, while `searchState.values` stayed empty forever: measured, typing
  // "overgrow" into the Ability facet took the list from 11 values to none, with no results and no
  // request ever leaving the browser. A search box that hides the thing you were browsing and
  // returns nothing is worse than no search box.
  //
  // (This is also why performance-plan.md's claim that it "fires a request per keystroke" was
  // wrong: it fired no requests at all. The debounce below is still the right shape now that the
  // calls are real -- 8 keystrokes should not be 8 facet-search requests.)
  //
  // SEMI-CONTROLLED INPUT, the same lesson the typeahead rebuild recorded: the visible value is
  // local, so a keystroke never waits on a round trip, and the controller's own query is followed
  // back DOWN only when it resets to empty (selecting a value clears the search). Following it on
  // every emission would let an in-flight response overwrite what is being typed.
  const [draft, setDraft] = useState(searchState.query);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (searchState.query === '') setDraft('');
  }, [searchState.query]);

  useEffect(() => () => clearTimeout(debounce.current), []);

  const onSearchTextChange = (value: string) => {
    setDraft(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      controller.facetSearch.updateText(value);
      // Clearing the box is a reset, not a query: asking the index for facet values matching ""
      // returns the unfiltered list a second time, and `showingSearchResults` has already handed
      // the panel back to the normal values by then.
      if (value.trim().length > 0) controller.facetSearch.search();
    }, FACET_SEARCH_DEBOUNCE_MS);
  };

  if (state.values.length === 0 && !withSearch) return null;

  // Same type-colour bloom on selection as RegularFacet -- see that file and
  // components/TypeFlash.tsx for the counter, and for why the flash fires only on the way in.
  const onToggle = (value: FacetValue) => {
    if (value.state === 'idle') markTypeFlash(state.facetId, value.value);
    controller.toggleSelect(value);
  };
  const onSelectSearchResult = (result: SpecificFacetSearchResult) => controller.facetSearch.select(result);
  const activeCount = state.values.filter((v) => v.state !== 'idle').length;
  const showingSearchResults = withSearch && searchState.query.trim().length > 0;

  return (
    <FacetShell
      facetId={state.facetId}
      label={state.label ?? label}
      activeCount={activeCount}
      onClear={() => controller.deselectAll()}
      footer={
        <>
          {(state.canShowMoreValues || state.canShowLessValues) && !showingSearchResults && (
            <div className="flex items-center gap-3 px-1.5 pt-1">
              {state.canShowMoreValues && (
                <button
                  type="button"
                  onClick={() => controller.showMoreValues()}
                  className="pressable text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
                >
                  Show more
                </button>
              )}
              {state.canShowLessValues && (
                <button
                  type="button"
                  onClick={() => controller.showLessValues()}
                  className="pressable text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
                >
                  Show less
                </button>
              )}
            </div>
          )}
        </>
      }
    >
      {withSearch && (
        <li className="w-full">
          <Input
            value={draft}
            onChange={(e) => onSearchTextChange(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            aria-label={`Search ${label}`}
            className="h-8 text-xs"
          />
        </li>
      )}
      {showingSearchResults
        ? searchState.values.map((result: SpecificFacetSearchResult) => (
            <li key={result.rawValue}>
              <button
                type="button"
                onClick={() => onSelectSearchResult(result)}
                className="pressable inline-flex max-w-[10rem] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:border-foreground/60 hover:bg-muted"
              >
                <span className="truncate">{result.displayValue}</span>
                {showCounts && <span className="shrink-0 font-normal text-muted-foreground">{result.count}</span>}
              </button>
            </li>
          ))
        : state.values.map((value) => {
            const id = `${state.facetId}-${value.value}`;
            const selected = value.state !== 'idle';
            const color = withTypeIcons ? typeColor(value.value) : undefined;
            const Icon = withTypeIcons ? typeIcon(value.value) : undefined;
            const flashKey = withTypeIcons ? typeFlashKey(state.facetId, value.value) : null;
            return (
              <li key={id}>
                <button
                  type="button"
                  id={id}
                  aria-pressed={selected}
                  onClick={() => onToggle(value)}
                  className={cn(
                    'pressable',
                    // `relative` so TypeFlash's absolute overlay resolves against this pill.
                    'relative inline-flex max-w-[10rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:border-foreground/60 hover:bg-muted'
                  )}
                >
                  {withTypeIcons && color && flashKey !== null && <TypeFlash key={flashKey} color={color.bg} />}
                  {Icon && color && <Icon className="h-3 w-3 shrink-0" style={{ color: color.bg }} />}
                  <span className="truncate">{value.value}</span>
                  {showCounts && (
                    <span className="shrink-0 font-normal text-muted-foreground">{value.numberOfResults}</span>
                  )}
                </button>
              </li>
            );
          })}
    </FacetShell>
  );
}
