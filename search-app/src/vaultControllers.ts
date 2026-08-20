import {
  buildDidYouMean,
  buildFacet,
  buildGeneratedAnswer,
  buildNumericFacet,
  buildNumericRange,
  buildPager,
  buildQueryError,
  buildQuerySummary,
  buildResultList,
  buildResultsPerPage,
  buildSearchBox,
  buildSort,
  buildUrlManager,
  buildFieldSortCriterion,
  buildRelevanceSortCriterion,
  SortOrder,
  type GeneratedAnswer as HeadlessGeneratedAnswer,
} from '@coveo/headless';
import { vaultEngine } from '@/vaultEngine';
import { CONTENT_FIELDS } from '@/contentFields';
import type { ClassicSortOption } from '@/components/ClassicSortDropdown';

// Module-scope Coveo controllers for /pokedex -- built once, same convention as
// searchResultsControllers.ts and homeControllers.ts, so PokedexVaultPage.tsx stays a page rather
// than a page plus a controller factory. Module scope also means a StrictMode double-mount (or any
// remount) reuses the same controllers instead of building a second set that would each run their
// own first search.
//
// PHASE 2: facets (Type / Weakness / Ability + facet search / Generation / Dex #), sort,
// pagination and the url manager, added on top of Phase 1's plain browse/search set below.

/** One screen of species. 24 is the mockup's own grid page size (plan §6), and it tiles evenly at
 *  every breakpoint this grid uses (2/3/4/6 across). Phase 2 turns this into a real paged set; until
 *  then the page labels it honestly as "the first 24 of N" rather than implying it is the whole
 *  result (the same rule PokedexMatches applies to its own capped rail). */
export const VAULT_PAGE_SIZE = 24;

// Phase 4: `pokedex-query-suggestions` is associated to `pokedex-vault` (confirmed live via GET
// on the pipeline's ml/model/associations, 2026-08-17 -- it was already there from §8 step 3,
// just unconsumed until now), so the box can ask for real server rows. `VaultSearchSuggestions.tsx`
// merges them with the local species vocabulary via `buildTypeaheadItems` (lib/localSuggestions.ts)
// -- same fallback policy the commerce search box already uses, since PQS has a known history of
// serving empty (see that module's own comment).
//
// `clearFilters: false` -- item 39. Headless defaults this to TRUE, so every submit deselected
// every facet, and the measured symptom was a deep link: `/pokedex?q=char&f-pokemontype=Fire`
// landed on `/pokedex?q=char`. The backlog recorded that as a mount race between the query submit
// and the facet synchronize; it isn't one. Two measurements settle it -- the facet ALONE deep
// links fine (`/pokedex?f-pokemontype=Fire` survives a cold load), and selecting Fire by hand and
// THEN typing a query drops it just the same, with no mount and no deep link anywhere in it. The
// URL was never the mechanism. The submit was.
//
// Headless's own doc calls setting this false "not recommended ... can lead to an increasing
// number of queries returning no results", and that warning is aimed at a real hazard: a filter
// the user has forgotten silently starving every later query. It does not describe this page.
// Every facet here is the visitor's own click, each value carries its live count, an empty
// combination renders the zero-state rather than an empty grid, and `Reset Filters` sits directly
// above the list. The hazard the default protects against is visible and one click from undone --
// whereas the behaviour it was costing us, a shareable filtered link, is a scripted capability.
export const vaultSearchBox = buildSearchBox(vaultEngine, {
  options: { numberOfSuggestions: 8, clearFilters: false },
});

export const vaultResultList = buildResultList(vaultEngine, {
  options: { fieldsToInclude: Object.values(CONTENT_FIELDS) },
});

// No UI renders this controller directly -- registering it is enough for the page size to apply to
// every query this engine sends. Same pattern as the content engine's POKEDEX_RAIL_RESULTS.
buildResultsPerPage(vaultEngine, { initialState: { numberOfResults: VAULT_PAGE_SIZE } });

// The *matched* species count, which is not the number returned (see VAULT_PAGE_SIZE). Browsing the
// Vault with nothing selected matches the whole dex, so this is what lets the page say 1,025 while
// showing 24.
export const vaultQuerySummary = buildQuerySummary(vaultEngine);

// Zero results and a failed request are different answers, and the result list alone cannot tell
// them apart -- both arrive as an empty `results` array. This controller is the only thing that
// can, so the page can stop reporting an outage as "No Pokémon match that". See
// `components/ResultsUnavailable.tsx` for the measurement that prompted it.
export const vaultQueryError = buildQueryError(vaultEngine);

// Type/Weakness/Ability are plain `buildFacet` (classic Search API), not the commerce
// RegularFacet this app's other facet rails use -- RegularFacet.tsx is typed against
// `@coveo/headless/commerce` and the Vault runs on the classic engine (see VaultFacet.tsx's own
// comment for why that means a new component too, not a shared one).
// numberOfValues: 20 for Type (18 real values -- see contentTypeFacet's identical reasoning:
// the default 8 can leave a real type unreachable on a browsing page with no query).
export const vaultTypeFacet = buildFacet(vaultEngine, {
  options: { field: CONTENT_FIELDS.type, numberOfValues: 20 },
});
// Weakness: 17 values (every type except the species' own), probed live in
// pokedex-vault-plan.md -- also needs the full set, not the top-8 default.
export const vaultWeaknessFacet = buildFacet(vaultEngine, {
  options: { field: CONTENT_FIELDS.weaknesses, numberOfValues: 20 },
});
// Ability is the one facet with a genuine long tail (plan §6.4) -- `facetSearch: {}` turns on
// the controller's own search-within-values capability rather than raising numberOfValues to
// something that would just dump hundreds of abilities into the panel.
export const vaultAbilityFacet = buildFacet(vaultEngine, {
  options: { field: CONTENT_FIELDS.abilities, numberOfValues: 10, facetSearch: {} },
});

// Generation and Dex # are both Long fields (see SpeciesTile.tsx's own NaN-guard comment), so
// they're numeric facets with MANUALLY defined ranges (generateAutomaticRanges: false) rather
// than index-generated buckets -- exactly `contentGenerationFacet`'s established pattern in
// searchResultsControllers.ts, reused here on the Vault's own engine/controller instance.

/** Generations run 1-9 today (see GenerationFacet.tsx's own MIN/MAX) -- one single-value range
 *  per generation, rendered as a row of toggleable buttons rather than a slider, since the real
 *  domain is nine discrete named things, not a continuum. */
const GENERATION_RANGES = Array.from({ length: 9 }, (_, i) =>
  buildNumericRange({ start: i + 1, end: i + 1, endInclusive: true })
);
export const vaultGenerationFacet = buildNumericFacet(vaultEngine, {
  options: {
    field: CONTENT_FIELDS.generation,
    generateAutomaticRanges: false,
    currentValues: GENERATION_RANGES,
    numberOfValues: 9,
  },
});

/** Dex # spans the whole National Dex (1-1,025) -- five even buckets rather than a continuous
 *  slider. The commerce NumericFacet's slider mode depends on a live `domain` object the CMH
 *  Facet manager attaches to slider-type facets (see that file's own `isSliderFacet` comment);
 *  the classic Search API facet used here has no equivalent, so bucketed ranges (the same shape
 *  `InlineBucketFacet` falls back to when no domain exists) is the honest fit, not a slider
 *  pretending to have bounds it doesn't expose. */
const DEX_RANGES = [
  buildNumericRange({ start: 1, end: 205, endInclusive: true }),
  buildNumericRange({ start: 206, end: 410, endInclusive: true }),
  buildNumericRange({ start: 411, end: 615, endInclusive: true }),
  buildNumericRange({ start: 616, end: 820, endInclusive: true }),
  buildNumericRange({ start: 821, end: 1025, endInclusive: true }),
];
export const vaultDexFacet = buildNumericFacet(vaultEngine, {
  options: {
    field: CONTENT_FIELDS.number,
    generateAutomaticRanges: false,
    currentValues: DEX_RANGES,
    numberOfValues: 5,
  },
});

export const VAULT_REGULAR_FACETS = [vaultTypeFacet, vaultWeaknessFacet, vaultAbilityFacet];

// A zero-result query's own facet response is itself empty -- nothing matched, so there's
// nothing to count -- which is exactly the one moment VaultEmptyState.tsx needs real type counts
// to offer "try Water instead." That component only MOUNTS once results are already empty, so a
// cache living inside it would never have observed the facet's last genuinely non-empty read to
// remember. Subscribed here instead, at module scope, active for the page's whole lifetime
// regardless of which component is currently mounted -- same "remember the widest/last-good
// reading" shape as NumericFacet.tsx's own `stableDomains`, just triggered by the controller
// itself rather than by a component's render.
let cachedNonEmptyTypeValues: (typeof vaultTypeFacet.state.values) = [];
vaultTypeFacet.subscribe(() => {
  if (vaultTypeFacet.state.values.length > 0) cachedNonEmptyTypeValues = vaultTypeFacet.state.values;
});
export function getCachedVaultTypeValues() {
  return vaultTypeFacet.state.values.length > 0 ? vaultTypeFacet.state.values : cachedNonEmptyTypeValues;
}

// Three fixed criteria, not a dynamic list -- the classic Sort controller has no commerce-style
// `availableSorts` to read from, so the option list is owned here and handed to the shared
// ClassicSortDropdown, which renders it and matches the active one back via `isSortedBy`.
export const VAULT_SORT_CRITERIA = {
  relevance: buildRelevanceSortCriterion(),
  dexAscending: buildFieldSortCriterion(CONTENT_FIELDS.number, SortOrder.Ascending),
  dexDescending: buildFieldSortCriterion(CONTENT_FIELDS.number, SortOrder.Descending),
} as const;

/** Rendered by ClassicSortDropdown. Lives here rather than in the component because the desktop
 *  panel and the page body both mount a dropdown, and two hand-kept lists would drift. */
export const VAULT_SORT_OPTIONS: readonly ClassicSortOption[] = [
  { key: 'relevance', label: 'Relevance', criterion: VAULT_SORT_CRITERIA.relevance },
  { key: 'dexAscending', label: 'Dex # (low to high)', criterion: VAULT_SORT_CRITERIA.dexAscending },
  { key: 'dexDescending', label: 'Dex # (high to low)', criterion: VAULT_SORT_CRITERIA.dexDescending },
];
export const vaultSort = buildSort(vaultEngine, {
  initialState: { criterion: VAULT_SORT_CRITERIA.relevance },
});

// numberOfPages: 7, matching PaginationBar's own MAX_BUTTONS -- VaultPaginationBar mirrors that
// component's window-around-current-page logic but reads it directly off the controller instead
// of recomputing it, since the classic Pager already returns a bounded `currentPages` window.
export const vaultPager = buildPager(vaultEngine, { options: { numberOfPages: 7 } });

// Classic UrlManager is a single `fragment` string plus `synchronize()` -- much smaller than the
// commerce one (no atomic-write/derived-facet machinery here, see SearchResultsPage.tsx's own
// comments on why THAT one needs it: this page has no query-understanding layer writing facets
// on the shopper's behalf, only their own clicks). Reads the query string once at module init;
// PokedexVaultPage.tsx's existing q-sync effect and this share the same URL without conflicting,
// since `q` and every `f-`/`nf-` key never collide.
export const vaultUrlManager = buildUrlManager(vaultEngine, {
  initialState: { fragment: typeof window !== 'undefined' ? window.location.search.slice(1) : '' },
});

// Same controller /search's content engine already uses (searchResultsControllers.ts), backed by
// the same `pokedex-query-suggestions` model -- 'next' mode corrects automatically for a
// zero-result query rather than only suggesting. `DidYouMean.tsx` is already generic (structural
// typing against a `DidYouMeanLike` shape), so it's reused here with zero new component code.
export const vaultDidYouMean = buildDidYouMean(vaultEngine, { options: { queryCorrectionMode: 'next' } });

// A second `GeneratedAnswer` controller, NOT a reuse of ContentGeneratedAnswer.tsx's module-level
// `rgaController` -- that one is permanently bound to `searchEngine`, and RGA needs a live
// per-request pipeline association to answer at all (just associated `pokedex-rga` to
// `pokedex-vault`, 2026-08-17). Same `answerConfigurationId` env var either way: this org has
// exactly one Answer Configuration (`pokedex-rga`, confirmed 2026-08-14), so both engines route to
// the same config -- what changes per engine is only which pipeline's association makes the model
// reachable for that engine's own searchHub.
const vaultAnswerConfigurationId = import.meta.env.VITE_COVEO_ANSWER_CONFIG_ID;
export const vaultGeneratedAnswer: HeadlessGeneratedAnswer | undefined = vaultAnswerConfigurationId
  ? (buildGeneratedAnswer(vaultEngine, { answerConfigurationId: vaultAnswerConfigurationId }) as HeadlessGeneratedAnswer)
  : undefined;
