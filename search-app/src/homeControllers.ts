import {
  buildInstantProducts,
  buildProductListing,
  buildRecentQueriesList,
  buildRecommendations,
  buildSearch,
  buildSearchBox,
} from '@coveo/headless/commerce';
import { catalogEngine, commerceEngine } from '@/commerceEngine';
import { loadRecentQueries, saveRecentQueries } from '@/lib/recentQueriesStorage';
import { useCoveoState } from '@/lib/useCoveoState';

// Shared across HomePage.tsx and its section components in src/components/home/ -- module-scope
// singletons, built once, same convention as the controllers at the top of every page.

// One options object for every search box in the app (hero, header, and SearchResultsPage's own
// controller), so suggestion count and highlighting can't drift between surfaces. The delimiters
// mark the *matched* part of each suggestion in state; the SearchBox component ignores them and
// bolds the completion client-side instead (Baymard direction), but they stay here so any other
// consumer of highlightedValue sees consistent markup.
export const sharedSearchBoxOptions = {
  numberOfSuggestions: 8,
  highlightOptions: { exactMatchDelimiters: { open: '<b>', close: '</b>' } },
};

// Despite the name, `headerSearchBoxController` is no longer rendered by SiteHeader -- the
// visual-refresh nav rework (rabidmoose-visual-refresh-plan.md) made the header nav-only and moved
// keyword search onto /search's own hero box instead. The name and id ('header-search-box') are
// stale, but it's kept (not renamed) because `headerInstantProducts` binds to that exact id and
// SearchResultsPage.tsx's own `commerceSearchBoxController` is built with the SAME id to match it --
// renaming either side without the other silently breaks the "Products" instant-preview row again,
// which is the failure this comment exists to prevent someone from reintroducing.
//
// There used to be a second pair here (`heroSearchBoxController` + `heroInstantProducts`) for the
// home hero's own box, deleted 2026-08-14 when the hero gave up search for the Card Consultant
// (consultant-hero-plan.md Phase 5A). `homeSearchBoxController`/`homeInstantProducts` below is that
// pair's replacement, re-added 2026-08-16 when the hero gave up the Consultant for a real search box
// in turn (home-hero-marketplace-toolbar-plan.md) -- a fresh pair rather than reusing this one, since
// a shared instance would mirror the header-era box's (currently orphaned) text into the hero and
// vice versa.
export const headerSearchBoxController = buildSearchBox(commerceEngine, {
  options: { id: 'header-search-box', ...sharedSearchBoxOptions },
});
export const headerInstantProducts = buildInstantProducts(commerceEngine, {
  options: { searchBoxId: 'header-search-box' },
});

export const homeSearchBoxController = buildSearchBox(commerceEngine, {
  options: { id: 'home-search-box', ...sharedSearchBoxOptions },
});
export const homeInstantProducts = buildInstantProducts(commerceEngine, {
  options: { searchBoxId: 'home-search-box' },
});

// Recent queries are tracked per commerceEngine (not per search box -- the controller has no
// searchBoxId concept). Populated automatically whenever a search box's `submit()` results in a
// successful commerce search. The controller itself
// is memory-only, so it's hydrated from localStorage here and written back on every change
// (submits append, the panel's Clear button empties the store too) -- recentQueriesStorage.ts,
// same pattern as the cart. Cross-tab sync (the `storage` event) is deliberately out of scope.
export const recentQueriesList = buildRecentQueriesList(commerceEngine, {
  options: { maxLength: 6 },
  initialState: { queries: loadRecentQueries() },
});
recentQueriesList.subscribe(() => saveRecentQueries(recentQueriesList.state.queries));

// This section never has a query -- it's browsing, not searching -- so it goes through the
// Listing controller (commerce/v2/listing) rather than Search, which is what lets
// pokedex-listing-page (Listing Page Optimizer) actually apply to it. Built on catalogEngine,
// not commerceEngine: these controllers' state must stay catalog-wide, and on the shared engine
// SearchResultsPage's own controllers would overwrite it (see catalogEngine's comment).
export const trendingListing = buildProductListing(catalogEngine);
// pageSize 10 matches the trending rail's product cap so the fallback fills the rail.
const trendingListingPagination = trendingListing.pagination({ options: { pageSize: 10 } });
// READ-ONLY peek at the live sort options, for the home marketplace toolbar (see
// HomeMarketplaceBar.tsx) -- it needs `availableSorts` to render a real Sort dropdown, but must
// never call `.sortBy()` on this instance: doing so would re-sort trendingListing's own request,
// which is the SAME state the Trending rail and the Shop mega menu's counts already read. The
// toolbar instead hands a picked criterion to /search as router state (`presetSort`) and lets that
// page's own sort controller apply it, exactly like `presetFacet` already does for facet values.
export const trendingListingSort = trendingListing.sort();

// Fires trendingListing's first request (and wires its Search fallback, see trendingSearchFallback
// below) at most once, however many places want it loaded -- HomePage needs it for the
// trending/type sections, SiteHeader needs it (on every page) for the Shop mega menu's live
// type/rarity counts. A module-scope flag rather than a per-component ref since the callers mount
// independently and neither should know about the other.
let trendingListingRequested = false;
export function ensureTrendingListingLoaded() {
  if (trendingListingRequested) return;
  trendingListingRequested = true;

  let settled = false;
  const finish = (useFallback: boolean) => {
    if (settled) return;
    settled = true;
    unsubscribe?.();
    clearTimeout(graceTimer);
    if (useFallback) trendingSearchFallback.executeFirstSearch();
  };

  // `isLoading: false` and `error` are not committed on the same tick: a rejected listing request
  // first flips loading off and only then records the error. The previous version unsubscribed on
  // that very first settled tick, read `error` as still-unset, concluded the listing had loaded
  // fine, and never fired the fallback -- which is why every facet-count surface fed by this
  // request (Shop mega menu, home type grid, hero stats) sat empty forever while /search, whose
  // subscription stays open, fell back correctly. So: keep listening until there is something
  // real to act on, and treat "settled with nothing, still nothing shortly after" as a failure
  // too, so a silently empty response can't strand the page either.
  const graceTimer = setTimeout(() => finish(trendingListing.state.products.length === 0), 2500);

  // NOT a const, despite prefer-const: finish() above calls unsubscribe?.(), and it can run
  // synchronously from inside the subscribe callback below on a first emission. Declared-then-
  // assigned, that reads as undefined and the optional call no-ops (the subscription is torn down
  // by the grace timer instead). As a const the same path hits the temporal dead zone and throws,
  // which would strand every facet-count surface this function feeds -- the exact failure the
  // comment above describes fixing.
  // eslint-disable-next-line prefer-const
  let unsubscribe: (() => void) | undefined;
  unsubscribe = trendingListing.subscribe(() => {
    const state = trendingListing.state;
    if (state.isLoading) return;
    if (state.error) finish(true);
    else if (state.products.length > 0) finish(false);
    // Settled, no error, no products yet -- the rejection may be one tick behind. Keep listening;
    // the grace timer above decides if nothing further arrives.
  });

  trendingListing.executeFirstRequest();
}

// Fallback: the Listing endpoint 404s (LISTING_CONFIGURATION_DOES_NOT_EXIST) until a Listing
// configuration exists for this tracking ID in the Merchandising Hub. HomePage.tsx switches to
// this -- the same Search request this section used before the Listing controller existed --
// once trendingListing reports an error, so trending stays populated either way. Same pattern as
// SearchResultsPage.tsx's "All cards" browse view.
export const trendingSearchFallback = buildSearch(catalogEngine);
const trendingSearchFallbackPagination = trendingSearchFallback.pagination({ options: { pageSize: 10 } });

// Facet generators for both trending sources -- moved here (2026-08-16) from ShopMegaMenu.tsx,
// which built these itself as its own module-scope consts. Hoisted so HomeMarketplaceBar.tsx can
// read the SAME live catalog-wide facet response (Set/Type/Rarity/Price, still one request) instead
// of the mega menu declaring a private copy a second consumer couldn't see. ShopMegaMenu.tsx's own
// useCatalogFacetValues now imports these rather than building its own.
export const trendingFacetGenerator = trendingListing.facetGenerator();
export const trendingSearchFallbackFacetGenerator = trendingSearchFallback.facetGenerator();

// Reactive read of "whichever trending source is active" -- both Hero.tsx and
// TrendingSpotlightRow.tsx need the identical listing-vs-fallback derivation, so it lives here
// once instead of being duplicated in each component.
export function useTrendingListing() {
  const listingState = useCoveoState(trendingListing);
  const searchState = useCoveoState(trendingSearchFallback);
  const listingPagination = useCoveoState(trendingListingPagination);
  const searchFallbackPagination = useCoveoState(trendingSearchFallbackPagination);

  const listingUnavailable = !!listingState.error;
  return {
    state: listingUnavailable ? searchState : listingState,
    totalEntries: listingUnavailable ? searchFallbackPagination.totalEntries : listingPagination.totalEntries,
    source: listingUnavailable ? trendingSearchFallback : trendingListing,
  };
}

// Set once a Recommendations slot exists in Merchandising Hub -- see .env.example. Falls back to
// trendingListing above wherever it's unset (or the slot is empty). Shared between the Hero
// backdrop and the trending section's spotlight card -- both read this one instance so the slot
// is only fetched once (ensureTrendingRecommendationsLoaded below owns the single guarded
// .refresh() call).
const trendingSlotId = import.meta.env.VITE_COVEO_TRENDING_SLOT_ID || undefined;
export const productRecommendations = trendingSlotId
  ? buildRecommendations(commerceEngine, { options: { slotId: trendingSlotId } })
  : undefined;

// Fires productRecommendations' one .refresh() call at most once, however many places want it
// loaded -- HomePage needs it for the Trending spotlight card, /search's Consultant panel
// (TrendingQueryPills.tsx) needs the same slot for its pill row. Same module-scope-flag pattern as
// ensureTrendingListingLoaded above, simpler here since Recommendations has no Listing-style
// error/fallback dance to wire up -- a stale or empty response is just handled by each caller's own
// self-hide, not this guard.
let trendingRecommendationsRequested = false;
export function ensureTrendingRecommendationsLoaded() {
  if (trendingRecommendationsRequested || !productRecommendations) return;
  trendingRecommendationsRequested = true;
  productRecommendations.refresh();
}

// The home "Recently Viewed" slot: Coveo's own personalization strategy, seeded by nothing but the
// visitor's own `ec.productView` history -- anonymous, no login, up to 50 items, and it follows
// them across sessions and devices rather than living in one browser's localStorage.
//
// Built on `commerceEngine`, NOT catalogEngine, and that is deliberate: personalized strategies are
// keyed on the visitor's action history, and commerceEngine is the engine whose analytics
// (product views, cart events) actually record it.
//
// Optional by design. Without the slot id the rail falls back to a client-side trail of the same
// views (recentlyViewedStorage.ts) -- honest, but an app-layer stand-in. See RecentlyViewedRow for
// which of the two is live and how the UI stays identical either way.
const recentlyViewedSlotId = import.meta.env.VITE_COVEO_RECENTLY_VIEWED_SLOT_ID || undefined;
export const recentlyViewedRecommendations = recentlyViewedSlotId
  ? buildRecommendations(commerceEngine, { options: { slotId: recentlyViewedSlotId } })
  : undefined;

// The home "Recently Purchased" slot -- a Merchandising Hub recommendations slot, same mechanism
// as `productRecommendations`/`recentlyViewedRecommendations` above, just a different strategy
// behind the id. Unlike Recently Viewed, there is no honest client-side stand-in for "purchased" --
// this app doesn't track completed orders locally -- so RecentlyPurchasedRow simply doesn't render
// when the slot is unset or comes back empty, rather than degrading to a fallback that would be
// naming purchases that didn't happen.
const recentlyPurchasedSlotId = import.meta.env.VITE_COVEO_RECENTLY_PURCHASED_SLOT_ID || undefined;
export const recentlyPurchasedRecommendations = recentlyPurchasedSlotId
  ? buildRecommendations(commerceEngine, { options: { slotId: recentlyPurchasedSlotId } })
  : undefined;
