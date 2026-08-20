import {
  buildDidYouMean,
  buildFacet,
  buildInstantResults,
  buildNumericFacet,
  buildResultList,
  buildResultsPerPage,
  buildQuerySummary as buildContentQuerySummary,
  buildSearchBox as buildContentSearchBox,
  buildUrlManager as buildContentUrlManager,
  loadNumericFacetSetActions,
} from '@coveo/headless';
import { buildProductListing, buildSearch, buildSearchBox as buildCommerceSearchBox } from '@coveo/headless/commerce';
import { searchEngine } from '@/searchEngine';
import { commerceEngine } from '@/commerceEngine';
import { sharedSearchBoxOptions } from '@/homeControllers';
import { CONTENT_FIELDS } from '@/contentFields';

// Module-scope Coveo controllers for /search -- built once, same convention as homeControllers.ts.
// SearchResultsPage.tsx imports these rather than declaring them itself, so that file can stay
// focused on the state-orchestration logic layered on top of them (URL<->engine sync, preset
// hand-offs, derived-facet reconciliation) instead of opening with ~190 lines of setup.

/** Drops the named `key=value` pairs from a URL fragment. */
export const stripKeys = (fragment: string, keys: string[]) =>
  fragment
    .split('&')
    .filter((pair) => !keys.includes(pair.split('=')[0]))
    .join('&');

/** Facet keys that belong to the Pokedex (content) engine and mean nothing to the commerce one.
 *
 *  The commerce url manager does not validate that a facet id it is told about exists on the
 *  commerce side: handed `f-pokemontype=Fire` it builds a commerce facet request for a field the
 *  card catalog doesn't have, matches zero products, and silently empties the whole card grid.
 *  Every fragment handed to a commerce manager goes through stripContentOnlyKeys first -- including
 *  the `initialState` below, which is the case this originally missed. A cold load of
 *  `/search?f-pokemontype=Fire` (a shared link, a breadcrumb, a Pokedex type tile) constructed the
 *  managers straight from `window.location.search` and lost the marketplace half before any effect
 *  could intervene: the Pokedex column filtered correctly while the cards next to it were replaced
 *  by the no-results recommendation rail. Reproduced with `f-pokemongeneration` too, so it was the
 *  key class and not one field. */
//
//  BOTH PREFIXES FOR BOTH FIELDS, and the `nf-` half is not hypothetical. Type is a regular facet
//  and serializes as `f-pokemontype`; Generation is a *numeric* facet (buildNumericFacet, below) and
//  serializes as `nf-pokemongeneration`. This list originally held `f-pokemongeneration` -- a key
//  Coveo never emits -- so it stripped a key that cannot occur while letting the real one straight
//  through to the commerce managers. Measured on `/search?nf-pokemongeneration=1..1`: both
//  `commerce/v2/listing` and `commerce/v2/search` went out carrying a `pokemongeneration` facet, the
//  exact leak this constant exists to stop. (The grid did not visibly empty in that measurement, so
//  this was a latent hazard rather than a live breakage -- but it is the same failure mode that DID
//  empty the grid for `f-pokemontype`, and it should not be left to chance.) Listing both prefixes
//  for both fields costs nothing and cannot over-strip: neither field exists on the commerce side
//  under any prefix, so a commerce manager has no legitimate use for either spelling.
export const CONTENT_ONLY_URL_KEYS = [
  `f-${CONTENT_FIELDS.type}`,
  `nf-${CONTENT_FIELDS.type}`,
  `f-${CONTENT_FIELDS.generation}`,
  `nf-${CONTENT_FIELDS.generation}`,
];
export const stripContentOnlyKeys = (fragment: string) => stripKeys(fragment, CONTENT_ONLY_URL_KEYS);

/** Does the URL itself carry a Pokédex facet selection?
 *
 *  Deliberately asks the URL rather than the facet controllers, and that distinction is the whole
 *  point. A Coveo facet's `hasActiveValues` is derived from the facet RESPONSE, so on a cold load it
 *  reads false until a search has come back -- while the selection restored from `initialState`
 *  lives in the facet REQUEST the whole time. Gating "should the content engine run its first
 *  search?" on the response is therefore a deadlock: no search runs because nothing looks selected,
 *  and nothing looks selected because no search ran. The URL is the one source that is both correct
 *  and synchronously available at mount -- it is the very string the url manager was built from. */
export const hasContentFacetParam = (params: URLSearchParams) =>
  CONTENT_ONLY_URL_KEYS.some((key) => !!params.get(key));

/** The page's own query string at module-eval time, already safe to hand a commerce manager. */
const initialCommerceFragment = () =>
  typeof window !== 'undefined' ? stripContentOnlyKeys(window.location.search.slice(1)) : '';

export const contentSearchBox = buildContentSearchBox(searchEngine);
export const contentResultList = buildResultList(searchEngine, {
  options: { fieldsToInclude: Object.values(CONTENT_FIELDS) },
});
// Instant Pokédex-species previews for the Card Consultant panel's typeahead -- the content-engine
// counterpart to headerInstantProducts (homeControllers.ts) below. Driven the same way: SearchBox's
// useTypeahead calls .updateQuery() directly on keystroke/hover, no searchBoxId linkage needed
// (unlike buildInstantProducts, this controller isn't scoped to one commerce search box).
//
// NOT scoped to pokedex-push by searchEngine.ts's own Tab, despite every other controller on this
// page inheriting it -- confirmed by reading @coveo/headless's own source
// (features/search-and-folding/legacy/search-and-folding-request.js): unlike a normal search
// request, buildInstantResults's request builder never reads state.tabSet at all. This org's index
// also has a second, unrelated source (a crawled pokemondb.net sitemap, confusingly also named
// close to "Pokedex") with no pokemon* fields -- so an ungated short query mixes real species hits
// with crawled-page noise that has no portrait and a dirty page-title. SearchBox.tsx filters back
// to pokedex-push client-side (the controller has no server-side scoping option, and turning on
// global query syntax just to smuggle an @source clause into updateQuery's `q` would change how
// every other typed query on this page parses).
//
// 30, not the 4 actually shown: that client-side filter needs real headroom. Measured live on
// "char" -- the crawled source's docs so outrank the few real pokedex-push matches that a top-8
// window came back with 7 crawled hits and exactly 1 (often irrelevant) pokedex-push one, leaving
// nothing good for the client to rerank. 30 raw hits reliably surfaces enough same-source
// candidates for the rerank to find the right 4.
export const contentInstantResults = buildInstantResults(searchEngine, {
  options: { maxResultsPerQuery: 30 },
});
// The species strip (see PokedexMatches) is a side-scrolling rail, not a page of results, so it
// asks for the whole match set in one request instead of a page of it -- a rail that says "top 12
// of 19" is worse than a rail you can just scroll to the end of. 200 covers every realistic query
// and every single-facet browse (the largest generation is 156 species, the largest type ~150) and
// still bounds the one case that can't be honest: browsing the dex with nothing selected matches
// ~1025, where PokedexMatches keeps labelling the remainder. Sprite images lazy-load, so a long
// rail costs DOM nodes, not a hundred image requests. No UI renders this controller directly --
// registering it is enough for it to apply to the content engine's queries.
const POKEDEX_RAIL_RESULTS = 200;
buildResultsPerPage(searchEngine, { initialState: { numberOfResults: POKEDEX_RAIL_RESULTS } });
// The *matched* species count, which past the cap above is still not the number returned: browsing
// the dex with nothing selected matches ~1025. The rail labels itself off this rather than off
// results.length, so an unselected "Pokédex" browse can't claim the dex has 200 entries in it.
export const contentQuerySummary = buildContentQuerySummary(searchEngine);
// 'next' mode uses the trained pokedex-query-suggestions ML model for corrections; falls back
// to index content alone if the model has no suggestion for a given query.
export const contentDidYouMean = buildDidYouMean(searchEngine, {
  options: { queryCorrectionMode: 'next', automaticallyCorrectQuery: false },
});
// numberOfValues: 20 comfortably covers all 18 Pokedex species types in one page -- the default
// (8) only returns the most frequent types for the *current* query context, so a preset select
// (a breadcrumb, or a card's type chip) landing on a query-less/browsing page would never find a
// less-common type like Fairy or Dragon among the top 8 and could never apply. Confirmed via a
// live repro: browsing with no query, Fire itself fell outside the default top 8.
export const contentTypeFacet = buildFacet(searchEngine, { options: { field: CONTENT_FIELDS.type, numberOfValues: 20 } });
// Manual range only (no auto-generated buckets) -- GenerationFacet drives a drag slider rather
// than a checkbox list, so it selects one custom [start, end] range directly instead of picking
// from index-generated buckets.
export const contentGenerationFacet = buildNumericFacet(searchEngine, {
  options: { field: CONTENT_FIELDS.generation, generateAutomaticRanges: false, currentValues: [] },
});
// NumericFacet.toggleSelect only flips values already present in the facet's *request*
// (findRange over request.currentValues) -- toggling a range that was never registered is a
// silent no-op. Same reasoning as GenerationFacet.tsx's commit(), which this mirrors for the
// presetContentFacet effect below.
export const { updateNumericFacetValues } = loadNumericFacetSetActions(searchEngine);
// Restores the Pokedex facets (q is handled separately, see the `[query]` effect below) from
// the URL on load, and keeps them in sync as the user interacts. Built last so its restored
// state wins over the facet defaults above. Uses standard Coveo Search parameter keys
// (f-pokemontype, f-pokemongeneration, ...), which live alongside -- not in conflict with --
// the commerce url managers' own keys below, since facet ids never collide between the two.
export const contentUrlManager = buildContentUrlManager(searchEngine, {
  initialState: { fragment: typeof window !== 'undefined' ? window.location.search.slice(1) : '' },
});

// Same suggestion count/highlighting as the hero and header boxes -- this controller replaces
// the header's default one while on /search, so any option drift shows up as the dropdown
// changing behavior between pages.
//
// FIX 2026-08-16 (home-hero-marketplace-toolbar-plan.md, found while adding the home hero's own
// search box pair): this used to build with no `id` override, while `headerInstantProducts` below
// is bound to `searchBoxId: 'header-search-box'`. Headless's default search-box id is not that
// string, so the two never matched -- `headerInstantProducts` was listening for text changes on a
// box nothing ever typed into, which means the "Products" instant-preview row in this page's own
// hero dropdown has been silently empty regardless of what the shopper typed. Explicit id fixes it.
export const commerceSearchBoxController = buildCommerceSearchBox(commerceEngine, {
  options: { id: 'header-search-box', ...sharedSearchBoxOptions },
});

export const commerceSearch = buildSearch(commerceEngine);
// 15 = 3 full rows of the PLP's fixed 5-column grid (direct instruction) -- paginate the rest
// rather than let the grid run long.
export const commerceSearchPagination = commerceSearch.pagination({ options: { pageSize: 15 } });
export const commerceSearchSort = commerceSearch.sort();
export const commerceSearchFacetGenerator = commerceSearch.facetGenerator();
export const commerceDidYouMean = commerceSearch.didYouMean();
// Restores facets/sort/page (and query) from the URL on load, and keeps them in sync as the
// user interacts. Built last so its restored state wins over the hardcoded defaults above
// (e.g. the pageSize passed to .pagination()).
export const commerceSearchUrlManager = commerceSearch.urlManager({
  initialState: { fragment: initialCommerceFragment() },
  excludeDefaultParameters: true,
});

// "All cards" (no query) is browsing, not searching, so it's driven by the Listing controller
// (commerce/v2/listing) instead of Search -- that's what lets pokedex-listing-page apply to it.
// Only one of {listing, search} is ever the "active" one rendered/synced to the URL at a time,
// picked by whether `query` is set (see isBrowsing in SearchResultsPage.tsx).
export const commerceListing = buildProductListing(commerceEngine);
// Same 15 (3 rows of 5) as commerceSearchPagination above, so paging behaves identically whether
// the page is browsing (Listing) or searching (Search).
export const commerceListingPagination = commerceListing.pagination({ options: { pageSize: 15 } });
export const commerceListingSort = commerceListing.sort();
export const commerceListingFacetGenerator = commerceListing.facetGenerator();
export const commerceListingUrlManager = commerceListing.urlManager({
  initialState: { fragment: initialCommerceFragment() },
  excludeDefaultParameters: true,
});
