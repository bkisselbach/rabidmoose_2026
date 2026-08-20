import {
  buildDateSortCriterion,
  buildDidYouMean,
  buildFacet,
  buildPager,
  buildQueryError,
  buildQuerySummary,
  buildRelevanceSortCriterion,
  buildResultList,
  buildResultsPerPage,
  buildSearchBox,
  buildSort,
  buildUrlManager,
  SortOrder,
} from '@coveo/headless';
import { newsEngine } from '@/newsEngine';
import { NEWS_FIELDS, NEWS_FIELD_LIST } from '@/lib/newsFields';
import type { ClassicSortOption } from '@/components/ClassicSortDropdown';

// Module-scope Coveo controllers for /pokemon-news -- built once, same convention as
// vaultControllers.ts / searchResultsControllers.ts / homeControllers.ts, so PokemonNewsPage.tsx
// stays a page rather than a page plus a controller factory. Module scope also means a StrictMode
// double-mount reuses these rather than building a second set that would each run their own first
// search.

/** One screen of articles: 1 full-width hero + two 3-wide rows on an unfiltered page 1, or 7 plain
 *  grid tiles on any other page (filtered, searched, or page 2+) -- see PokemonNewsPage's
 *  `showHero`/`gridRecords` split. One number for every page, hero or not, so the pager's own count
 *  never has to special-case which page it's on. */
export const NEWS_PAGE_SIZE = 7;

/**
 * How deep Coveo scans the ranked result set when computing facet values.
 *
 * NOT COSMETIC, and not a copied default. Measured live 2026-08-17: `@newssetname` carries exactly
 * one value across the corpus ("Stellar Crown", on 1 of 15 articles) and a groupBy returned ZERO
 * values at the default depth while returning it correctly at 10000. The default scans a bounded
 * slice of the ranked results, and this org's index holds ~5,800 documents of which news is a thin
 * slice -- so a rare value in a small source simply falls outside it. Nothing errors and the facet
 * still renders; it just silently stops offering a value that genuinely exists.
 *
 * That failure mode is exactly what this app's honesty rules forbid -- a rail that quietly omits
 * real values is a rail that lies about the corpus -- so every facet here opts in.
 */
const NEWS_FACET_INJECTION_DEPTH = 10000;

// `numberOfSuggestions: 0` because nothing renders suggestions yet -- Headless fires a
// /querySuggest request on every submit otherwise, and a request whose response no component reads
// is a wasted round trip plus a stray analytics event. The Vault ran at 0 for the same reason until
// its Phase 4 gave the box a real typeahead; raise this the day a news typeahead exists.
export const newsSearchBox = buildSearchBox(newsEngine, { options: { numberOfSuggestions: 0 } });

// EVERY field name comes from NEWS_FIELD_LIST, never an inline literal. Measured 2026-08-17: naming
// a field that does not exist here does not omit that field, it returns ZERO RESULTS for the whole
// query with HTTP 200 and no error -- so one typo renders an empty news page that looks exactly
// like "no articles match". Routing through the constant map makes that a compile error instead.
export const newsResultList = buildResultList(newsEngine, {
  options: { fieldsToInclude: NEWS_FIELD_LIST },
});

// No UI renders this controller directly -- registering it applies the page size to every query
// this engine sends. Same pattern as the Vault's own VAULT_PAGE_SIZE registration.
buildResultsPerPage(newsEngine, { initialState: { numberOfResults: NEWS_PAGE_SIZE } });

/** The *matched* article count, which past the page size is not the number returned. */
export const newsQuerySummary = buildQuerySummary(newsEngine);

// Tells a genuinely empty newsroom search apart from one whose request never landed -- see the same
// controller on the Vault, and `components/ResultsUnavailable.tsx` for why both exist.
export const newsQueryError = buildQueryError(newsEngine);

// All classic `buildFacet` (not the commerce RegularFacet this app's /search rail uses) because
// this is a classic Search API engine -- the same split VaultFacet/ClassicFacet.tsx documents.
//
// numberOfValues is set well above each field's real cardinality rather than left at the default 8.
// searchResultsControllers.ts:101-106 records why: the default returns only the most frequent
// values FOR THE CURRENT QUERY CONTEXT, so a less-common value can become permanently unreachable
// on a browsing page with no query. Measured cardinalities in this corpus: category 5, titles 3,
// tags 17.
//
// THE RAIL IS THREE FACETS, deliberately. Species (`Pokémon`, 17 values) and set name (`Card set`,
// exactly one value in this corpus) were both built and both removed: a newsroom filter is an
// editorial cut -- section, platform, topic -- and neither of those two cut the archive along one.
// Species duplicated the search box (a reader after Pikachu stories types "pikachu"), and a
// one-value facet is a control that cannot change the result set. They are DELETED rather than
// dropped from the array below, so the engine stops requesting two facets nothing renders and the
// url manager stops carrying their keys.

export const newsCategoryFacet = buildFacet(newsEngine, {
  options: { field: NEWS_FIELDS.category, numberOfValues: 10, injectionDepth: NEWS_FACET_INJECTION_DEPTH },
});

export const newsTitlesFacet = buildFacet(newsEngine, {
  options: { field: NEWS_FIELDS.titles, numberOfValues: 12, injectionDepth: NEWS_FACET_INJECTION_DEPTH },
});

export const newsTagsFacet = buildFacet(newsEngine, {
  options: { field: NEWS_FIELDS.tags, numberOfValues: 20, injectionDepth: NEWS_FACET_INJECTION_DEPTH },
});

/** Rendered by the facet rail, in display order. */
export const NEWS_FACETS = [
  { controller: newsCategoryFacet, label: 'Category' },
  { controller: newsTitlesFacet, label: 'Game or app' },
  { controller: newsTagsFacet, label: 'Topic' },
] as const;

// Date sort runs on Coveo's BUILT-IN `@date`, which is already sortable -- which is why the corpus
// pushes `date` rather than defining a `newsdate` field. Verified live 2026-08-17: descending leads
// with 2026-08-17, ascending with 2026-02-27. The org has a recorded `InvalidSortField` failure on
// `@pokemonname` caused by creating a custom field without its Sortable flag; a built-in cannot
// fail that way.
export const NEWS_SORT_CRITERIA = {
  newest: buildDateSortCriterion(SortOrder.Descending),
  oldest: buildDateSortCriterion(SortOrder.Ascending),
  relevance: buildRelevanceSortCriterion(),
} as const;

/** Newest first is the default -- this is a newsroom, and relevance over an empty query is
 *  arbitrary ordering dressed up as a decision. */
export const NEWS_SORT_OPTIONS: readonly ClassicSortOption[] = [
  { key: 'newest', label: 'Newest first', criterion: NEWS_SORT_CRITERIA.newest },
  { key: 'oldest', label: 'Oldest first', criterion: NEWS_SORT_CRITERIA.oldest },
  { key: 'relevance', label: 'Relevance', criterion: NEWS_SORT_CRITERIA.relevance },
];

// NO `initialState` HERE, deliberately -- the page applies the default sort itself (see
// PokemonNewsPage's mount effect). Measured: passing `initialState.criterion` makes the controller
// dispatch its own search once it settles, which `executeFirstSearch()` then aborts -- and Headless
// logs every aborted thunk as `Action dispatch error search/executeSearch/rejected`. The page
// opened with a console error the app's other routes don't have, plus a wasted round trip: two
// requests on every cold load, the first with `sortCriteria: "relevancy"` and the second with
// `"date descending"`.
//
// Exactly the failure vaultEngine.ts:49-64 documents for `buildTab`, arriving through a different
// controller. The page now sends one request.
export const newsSort = buildSort(newsEngine, {
  initialState: { criterion: NEWS_SORT_CRITERIA.newest },
});

// numberOfPages: 7, matching ClassicPaginationBar's expectations -- the classic Pager returns its
// own bounded `currentPages` window, so the component reads it rather than recomputing one.
export const newsPager = buildPager(newsEngine, { options: { numberOfPages: 7 } });

// Real Coveo query correction, replacing the client-side Levenshtein fallback /search needs. The
// shared `DidYouMean.tsx` is already generic (structural typing against a `DidYouMeanLike` shape),
// so this costs no new component code.
export const newsDidYouMean = buildDidYouMean(newsEngine, { options: { queryCorrectionMode: 'next' } });

// BUILT LAST, DELIBERATELY -- restored URL state must win over the defaults above (notably the
// `newest` sort criterion and the page size). searchResultsControllers.ts:118-125 and
// vaultControllers.ts both order their url managers this way for the same reason.
//
// This page gets the EASY version of the url manager, and that is worth stating: /search needs
// CONTENT_ONLY_URL_KEYS and stripContentOnlyKeys because two engines share one query string and a
// commerce manager handed a Pokédex facet key silently empties the card grid. /pokemon-news runs
// exactly one engine, so `q`, `f-news*`, `sortCriteria` and `firstResult` round-trip with none of
// that machinery.
export const newsUrlManager = buildUrlManager(newsEngine, {
  initialState: { fragment: typeof window !== 'undefined' ? window.location.search.slice(1).replace(/\+/g, '%20') : '' },
});

/** The default sort, as the url manager spells it. The page hands this to `synchronize()` on a cold
 *  load, which both applies the criterion and performs the page's single first search -- see
 *  PokemonNewsPage's mount effect for why the two obvious alternatives don't work. */
export const NEWS_DEFAULT_SORT_FRAGMENT = 'date descending';
