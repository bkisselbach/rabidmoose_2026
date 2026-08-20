import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { NumericFacetValue } from '@coveo/headless';
import type { SortCriterion } from '@coveo/headless/commerce';
import { searchEngine } from '@/searchEngine';
import { headerInstantProducts, recentQueriesList } from '@/homeControllers';
import { getActivePersona } from '@/lib/visitorId';
import {
  commerceDidYouMean,
  commerceListing,
  commerceListingFacetGenerator,
  commerceListingPagination,
  commerceListingSort,
  commerceListingUrlManager,
  commerceSearch,
  commerceSearchBoxController,
  commerceSearchFacetGenerator,
  commerceSearchPagination,
  commerceSearchSort,
  commerceSearchUrlManager,
  contentDidYouMean,
  contentGenerationFacet,
  contentInstantResults,
  contentSearchBox,
  contentTypeFacet,
  contentUrlManager,
  hasContentFacetParam,
  stripContentOnlyKeys,
  updateNumericFacetValues,
} from '@/searchResultsControllers';
import { useSearchResultsState } from '@/lib/useSearchResultsState';
import {
  fragmentKey,
  priceBlindKey,
  toEngineFragment,
  withQueryParam,
} from '@/lib/searchResultsUrlFragment';
import { FacetGenerator } from '@/components/FacetGenerator';
import { SortDropdown } from '@/components/SortDropdown';
import { ViewToggle } from '@/components/ViewToggle';
import { PokedexMatches } from '@/components/PokedexMatches';
import { ZoneEyebrow, ZONES } from '@/components/zones';
import { DidYouMean } from '@/components/DidYouMean';
import { FuzzyDidYouMean } from '@/components/FuzzyDidYouMean';
import { NotifyBanner } from '@/components/NotifyBanner';
import { useInteractiveProducts } from '@/lib/useInteractiveProduct';
import { GeminiConsultantAnswer } from '@/components/search-results/GeminiConsultantAnswer';
import { useQueryUnderstanding } from '@/lib/useQueryUnderstanding';
import { priceRangeToParam } from '@/lib/priceIntent';
import { writeConsultation } from '@/lib/consultationBrief';
import { FacetGeneratorSkeleton } from '@/components/Skeleton';
import { MobileFilterSheet } from '@/components/MobileFilterSheet';
import { SiteFooter } from '@/components/SiteFooter';
import { ConsultantPanel } from '@/components/search-results/ConsultantPanel';
import { DesktopFacetsPanel } from '@/components/search-results/DesktopFacetsPanel';
import { ListingToolbar } from '@/components/search-results/ListingToolbar';
import { ProductResultsGrid } from '@/components/search-results/ProductResultsGrid';
import { CONTENT_FIELDS } from '@/contentFields';
import { hasFeaturedRule } from '@/lib/featuredRules';
import { useSeo } from '@/lib/seo';
import { useViewMode } from '@/lib/useViewMode';
import { useDelayedReveal } from '@/lib/useDelayedReveal';
import { useSettledLoading } from '@/lib/useSettledLoading';
import { PageTitle } from '@/components/PageTitle';

export function SearchResultsPage() {
  const location = useLocation();
  // Read once per mount, not reactively -- switchPersona() reloads the page (visitorId.ts), so a
  // live subscription here would be dead weight; the value can only actually change via a reload
  // this component doesn't survive anyway. Feeds GeminiConsultantAnswer's tone-only persona context.
  const activePersona = getActivePersona();
  // Derived ONCE and handed to both consultant surfaces -- the panel's composer (which sends
  // follow-up turns) and the transcript (which uses it for the CoveoChip's detail copy). Guest maps
  // to undefined: the tone-only framing has nobody to address, and duplicating that rule at two
  // call sites is how the two would eventually disagree.
  const consultantPersona =
    activePersona.key === 'guest'
      ? undefined
      : { name: activePersona.name, subtitle: activePersona.subtitle };
  // `setSearchParams(..., { replace: true })` below defaults to clearing router state -- fine
  // normally, but the "mirror to URL" effect that calls it runs on a subscription callback (not a
  // dependency-driven re-render), so its closure only ever sees the `location` from whenever that
  // effect last (re)ran, not the one from the click that's currently in flight. A ref updated every
  // render, read at write time, is what lets that effect hand the *current* state back instead of
  // wiping it. See the effect below for why this matters: two preset facets applied by the same
  // click resolve on different schedules (content is data the page already has; commerce needs an
  // extra round trip to discover the facet exists at all) -- without this, whichever finishes first
  // triggers a URL write that erases the state the slower one still needs to read.
  const locationStateRef = useRef(location.state);
  locationStateRef.current = location.state;
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  // Read through a ref by the URL-sync subscription below. That effect deliberately does not
  // re-subscribe when the query changes, so a plain closure capture goes stale there and the next
  // controller notification writes the PREVIOUS query back over the URL -- reverting the search, or
  // dropping `q` entirely and flipping the page into browse mode. Same reason locationStateRef
  // exists just above.
  const queryRef = useRef(query);
  queryRef.current = query;
  // No query means the user is browsing the full catalog rather than searching it, which is
  // what routes that case through the Listing controller instead of Search (see the controller
  // setup above). Whichever one is active also owns the URL sync below.
  const isBrowsing = !query;

  // Canonical intentionally drops pagination/sort/facet params -- those produce many URL
  // variants over the same underlying content, which would otherwise compete with each other
  // and dilute ranking. `q` is kept since it materially changes the page's content.
  useSeo({
    title: query ? `Search results for "${query}"` : 'Shop All Pokémon Cards',
    description: query
      ? `Pokédex entries and live-priced Pokémon cards matching "${query}". Real cards, real market pricing.`
      : 'Browse every Pokémon card in stock with live TCGplayer & Cardmarket pricing.',
    path: query ? `/search?q=${encodeURIComponent(query)}` : '/search',
  });

  const [viewMode, setViewMode] = useViewMode();

  // Reads the intent out of a conversational query ("show me rare fire cards", "i need to counter
  // air pokemon") and resolves anything that needs the index to answer. Inert for ordinary keyword
  // lookups -- `isActive` is false and every code path below behaves exactly as it did before.
  const understanding = useQueryUnderstanding(query);
  // What the engines are actually asked for. A parsed query carries its constraints as facet
  // selections (see the effect below), so the text half is only the leftover keywords -- often
  // nothing at all, which is correct: "show me rare fire cards" is 100% filter and 0% keyword.
  const effectiveQuery = understanding.isActive ? understanding.engineQuery : query;

  // The six controller subscriptions and the eight pieces of state they write now live in
  // `lib/useSearchResultsState.ts` (item 38, first unit). That hook's header records what
  // deliberately did NOT move with them and why.
  const {
    contentState,
    contentTotal,
    contentTypeFacetState,
    contentGenerationFacetState,
    commerceSearchState,
    commerceListingState,
    commerceRevision,
    contentRevision,
  } = useSearchResultsState();

  // The Listing endpoint 404s (LISTING_CONFIGURATION_DOES_NOT_EXIST) until a Listing
  // configuration is created for this tracking ID in the Coveo Merchandising Hub -- until then,
  // fall back to Search with an empty query so browsing keeps working.
  const listingUnavailable = !!commerceListingState.error;
  // An error is not the only way the Listing controller comes up empty, and keying off it alone was
  // a real defect. Browsing that arrives with a Pokedex facet (a type tile, the header's Pokédex
  // menu, a breadcrumb) fires enough content requests alongside the listing one that the listing's
  // 404 can still be in flight many seconds later -- and until it lands, `error` is unset, so the
  // page went on rendering a Listing state holding nothing while the Search fallback sat there with
  // a full page of products. Measured: the type-tile path showed listingProducts 0 / error unset /
  // searchProducts 0 for 12s, while "All sets" (whose listing 404 lands immediately) rendered 20.
  // That is the entire "type tiles don't filter" defect -- the Pokedex column was filtering
  // correctly the whole time; the cards beside it had been replaced by the no-results rail.
  //
  // So the question is "has the Listing actually produced anything", and the previous spelling of
  // it (`!isLoading && products.length === 0`) still answered no for the one window that mattered:
  // WHILE THE REQUEST IS IN FLIGHT. isLoading is true and error is unset, so the listing read as
  // usable, and the page rendered a bundle holding nothing -- for the whole duration of a listing
  // request that, on this org, only ever ends in a 404.
  //
  // That window is the "facets sometimes don't load on refresh" bug, traced 2026-08-17 on a bare
  // `/search` with per-request latency injected so the responses settle out of order (localhost
  // returns the 404 fast enough to usually hide it). Measured during the window: listing
  // {isLoading: true, products: 0, error: false} while search held {products: 20, facets: 6} --
  // and the listing facet generator offered its six facet CONTROLLERS with `values: []` on every
  // one, so each RegularFacet/NumericFacet rendered null and the filter column went blank. The
  // skeleton did not cover it either, because `commerceDataPending` asks for `facets.length === 0
  // && totalEntries === 0` and both were non-zero: the facet ids and the 3754 total come from the
  // engine's SHARED commerce slice, which the *search* response had already populated (see
  // commerceEngine.ts -- controllers on one engine are views over one state slice, not isolated
  // channels). No skeleton, no facets, ~0.4-1.9s per reload, 6/10 reloads under jitter.
  //
  // A latch rather than a live read: once the Listing has delivered products it stays the preferred
  // controller, so a LATER in-flight listing request (a facet toggle on an org that does have a
  // Listing configuration) can't bounce the page back to Search mid-interaction. Mutated during
  // render on purpose, same as `hasLoadedCommerceOnce` below -- it has to latch before this same
  // render picks a bundle.
  const listingHasDelivered = useRef(false);
  if (commerceListingState.products.length > 0) listingHasDelivered.current = true;
  const listingUsable = !listingUnavailable && listingHasDelivered.current;
  const useListing = isBrowsing && listingUsable;
  const commerceState = useListing ? commerceListingState : commerceSearchState;
  const commercePagination = useListing ? commerceListingPagination : commerceSearchPagination;
  const commerceSort = useListing ? commerceListingSort : commerceSearchSort;
  const commerceFacetGenerator = useListing ? commerceListingFacetGenerator : commerceSearchFacetGenerator;
  const commerceActiveController = useListing ? commerceListing : commerceSearch;
  // One InteractiveProduct per product per RESPONSE, not per render (item 31c). This page
  // re-renders on a notification from any of six controller subscriptions, and every one of those
  // used to rebuild eighteen controllers -- resetting `wasOpened`, the flag whose only job is to
  // stop a click logging twice, along the way.
  const getInteractiveProduct = useInteractiveProducts(commerceActiveController, commerceState.products);
  const commerceUrlManager = useListing ? commerceListingUrlManager : commerceSearchUrlManager;

  // A category pick from the Shop mega menu (SiteHeader) arrives as router state rather than a
  // `f-<field>=` URL param -- Coveo's commerce URL manager can only restore a *dynamic* facet
  // (one a facetGenerator response hasn't produced yet) once that response has already landed
  // once, so a cold `f-cardrarity=...` link silently drops the filter. Instead, wait for this
  // page's own facet generator (whichever of listing/search is currently active -- it can flip
  // once, from listing to the search fallback, see listingUnavailable above) to report the target
  // value as an actual selectable option, then select it directly.
  const presetFacet = (location.state as { presetFacet?: { facetId: string; value: string } } | null)?.presetFacet;
  const appliedPresetFacetRef = useRef(false);
  useEffect(() => {
    if (!presetFacet) return;
    appliedPresetFacetRef.current = false;
    const tryApply = () => {
      if (appliedPresetFacetRef.current) return;
      const facet = commerceFacetGenerator.facets.find((f) => f.type === 'regular' && f.state.facetId === presetFacet.facetId);
      if (!facet || facet.type !== 'regular') return;
      const match = facet.state.values.find((v) => v.value === presetFacet.value);
      if (match && match.state === 'idle') {
        appliedPresetFacetRef.current = true;
        // Deselect any value already active on this facet (e.g. restored from a prior /search
        // visit on this same module-scope controller) so picking a new category from the Shop
        // mega menu swaps the filter, rather than silently OR-ing the two together.
        facet.deselectAll();
        facet.toggleSelect(match);
      }
    };
    tryApply();
    return commerceFacetGenerator.subscribe(tryApply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceFacetGenerator, presetFacet?.facetId, presetFacet?.value]);

  // Same hand-off shape as presetFacet above, for a sort criterion picked on the home page's
  // marketplace toolbar (HomeMarketplaceBar.tsx). No "wait for the value to exist" dance needed --
  // unlike facet VALUES, sort CRITERIA are a small fixed list the Merchandising Hub configures, not
  // something that varies per response, so this applies once as soon as the target controller
  // exists (it's built at module scope, so that's immediately). Applied to whichever of
  // listing/search is the currently-active sort controller, same `commerceSort` the rest of the
  // page already reads.
  const presetSort = (location.state as { presetSort?: SortCriterion } | null)?.presetSort;
  const appliedPresetSortRef = useRef(false);
  useEffect(() => {
    if (!presetSort || appliedPresetSortRef.current) return;
    appliedPresetSortRef.current = true;
    commerceSort.sortBy(presetSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetSort, commerceSort]);

  // Same idea as presetFacet above, but for the Pokedex (content) facets, which -- unlike the
  // commerce ones -- are static controllers built once at module scope rather than produced
  // dynamically per-response. The Generation breadcrumb select can apply its numeric range
  // immediately (no candidate values to wait for); the Type breadcrumb select still has to wait
  // for a real value to come back from the content engine's own first search (see the
  // executeFirstSearch bootstrap below) before it can toggle a match, exactly like the commerce
  // case above.
  type PresetContentFacet = { kind: 'generation'; gen: number } | { kind: 'type'; value: string };
  const presetContentFacet = (location.state as { presetContentFacet?: PresetContentFacet } | null)?.presetContentFacet;
  const appliedPresetContentFacetRef = useRef(false);
  useEffect(() => {
    if (!presetContentFacet) return;
    appliedPresetContentFacetRef.current = false;
    if (presetContentFacet.kind === 'generation') {
      appliedPresetContentFacetRef.current = true;
      const value: NumericFacetValue = {
        start: presetContentFacet.gen,
        end: presetContentFacet.gen,
        endInclusive: true,
        numberOfResults: 0,
        state: 'idle',
      };
      // Seed the range into the request first (see the module-scope comment above) -- otherwise
      // toggleSelect silently no-ops since this exact range was never registered.
      searchEngine.dispatch(updateNumericFacetValues({ facetId: contentGenerationFacet.state.facetId, values: [value] }));
      contentGenerationFacet.toggleSelect(value);
      return;
    }
    const tryApply = () => {
      if (appliedPresetContentFacetRef.current) return;
      const match = contentTypeFacet.state.values.find((v) => v.value === presetContentFacet.value);
      if (match && match.state === 'idle') {
        appliedPresetContentFacetRef.current = true;
        // Deselect any value already active on this facet (e.g. restored from a prior /search
        // visit on this same module-scope controller) so picking a new Type from a breadcrumb
        // swaps the filter, rather than silently OR-ing the two together.
        contentTypeFacet.deselectAll();
        contentTypeFacet.toggleSelect(match);
      }
    };
    tryApply();
    return contentTypeFacet.subscribe(tryApply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetContentFacet?.kind, presetContentFacet && 'value' in presetContentFacet ? presetContentFacet.value : undefined, presetContentFacet && 'gen' in presetContentFacet ? presetContentFacet.gen : undefined]);

  // The home page's "All sets" / "All Pokémon" links (BrowseTiles) each name one zone and mean
  // only that zone -- carried as router state rather than a URL param for the same reason
  // presetFacet/presetContentFacet are (see above), and read once here rather than in its own
  // effect since it only ever gates which sections render, nothing async.
  const browseZone = (location.state as { browseZone?: 'marketplace' | 'pokedex' } | null)?.browseZone;

  // A query drives the Pokedex-matches section as before; a Generation/Type pick from a detail
  // page's breadcrumb (presetContentFacet, or an already-active content facet restored straight
  // from a shared URL) also earns it, since browsing the Pokedex by facet alone is just as valid
  // as browsing it by text. An explicit browseZone overrides both directions: 'marketplace' hides
  // this section even if a content facet is still active from earlier browsing in the same
  // session (the module-scope content controllers persist across navigations), and 'pokedex'
  // shows it even with nothing else selected.
  // `deepLinkedContentFacet` is in here for the same reason it is in the first-search gate below: on
  // a cold load the facet states are response-derived and still empty, so a shared Pokédex link
  // would render no section at all until its first response landed -- meaning no skeleton either,
  // just the marketplace half and a silent gap where the species rail belongs.
  const deepLinkedContentFacet = hasContentFacetParam(searchParams);
  const showContentSection =
    browseZone === 'marketplace'
      ? false
      : !!query ||
        !!presetContentFacet ||
        contentTypeFacetState.hasActiveValues ||
        contentGenerationFacetState.hasActiveValues ||
        deepLinkedContentFacet ||
        browseZone === 'pokedex';
  // Same idea for the commerce half: 'pokedex' hides the cards section entirely while plainly
  // browsing (a query still shows both, same as ever -- naming a zone up front doesn't survive
  // typing an actual search).
  const showCommerceSection = !(browseZone === 'pokedex' && isBrowsing);

  // The full "savable" URL is the concatenation of both engines' own fragments -- each only
  // emits the Coveo parameter keys it owns (q, f-pokemontype... for content; q, sortCriteria,
  // page, f-cardtypes... for commerce), so joining them can't clobber the other's params.
  //
  // KNOWN GAP: the commerce manager emits its `f-<facetId>` segment the instant a card facet is
  // toggled and then drops it again as soon as the response lands (Headless 3.55.0, both search
  // and listing modes) -- so card filters never reach a shareable link, while the content
  // engine's own facets round-trip correctly. Serializing them here instead is not a drop-in:
  // `facetGenerator.facets` reads back as unselected from inside a subscription callback, and
  // routing the write through a post-commit effect makes it fire on mount, where
  // `setSearchParams(..., { replace: true })` discards the router state that presetContentFacet
  // navigation depends on. Left as-is deliberately rather than half-fixed.
  const mergedFragment = () => [contentUrlManager.state.fragment, commerceUrlManager.state.fragment].filter(Boolean).join('&');

  // The "each manager ignores keys it doesn't own" assumption above holds for facet *ids* (the
  // commerce and content field sets never collide) but not for the raw `f-<field>=` querystring
  // key itself: the commerce url manager's synchronize() doesn't validate that a facet id it's
  // told about actually exists on the commerce side -- fed `f-pokemontype=Fire` (a content-only
  // field, present because the content engine's own Type facet round-trips to the URL, see the
  // KNOWN GAP above) it happily builds a commerce facet request for a field the commerce index
  // doesn't have, which matches zero products and silently zeroes out the whole card grid. Only
  // reproduces when a card's type chip (CardTypeChips) sets both facets from one click while a
  // commerce query is active -- caught via a direct repro, not a hunch. Stripping the content-only
  // keys before handing the fragment to the commerce manager keeps the content engine's URL
  // round-trip intact (contentUrlManager still gets the unfiltered string) while removing the only
  // known way a content field name reaches the commerce manager.
  // (stripKeys/stripContentOnlyKeys live in searchResultsControllers.ts -- the commerce url
  // managers are built at module scope there and need them too. withQueryParam/fragmentKey/
  // stripPriceKey/toEngineFragment/priceBlindKey, used throughout the effects below, live in
  // lib/searchResultsUrlFragment.ts: they're pure functions of their own arguments (unlike
  // mergedFragment just above, which closes over the render-time commerceUrlManager choice), so
  // hoisting them out of the component stops them being reconstructed as new closures every render.

  /** The filters the CURRENT query derived, as URL key/value pairs -- the page's memory of what it
   *  asked for, held apart from the URL and the engines because both of those lose it (see syncUrl
   *  and the reconcile effect). Written by the derived-state effect, read by the two of them.
   *
   *  Declared up here, above its first reader, deliberately: this file has already been bitten once
   *  by a hook declared below an effect that referenced it (see the note on `derivedPass`). A ref
   *  read inside an effect *body* would be safe either way, but keeping the declaration above every
   *  use is the rule that doesn't require anyone to re-derive that distinction. */
  const desiredDerivedRef = useRef<Record<string, string>>({});

  // Mirror facet/sort/page changes into the URL, so a refresh or a shared link restores them.
  // Compares against window.location directly rather than the `searchParams` state to avoid a
  // stale closure. Re-subscribes to whichever commerce controller (search vs listing) is
  // currently active; the content manager's identity never changes.
  useEffect(() => {
    const syncUrl = () => {
      // Outgoing: the engines' own state, but with the user's typed query put back in place of
      // whatever rewrite is actually running (see withQueryParam above). Compared price-blind so a
      // budget alone never triggers a rewrite, but written through unstripped so that when a
      // rewrite does happen for some other reason it carries the applied range along rather than
      // dropping it out of the URL behind the restore effect's back (see priceBlindKey).
      const fragment = withQueryParam(mergedFragment(), queryRef.current);
      // Never mirror a response that has DROPPED the derived state back into the URL.
      //
      // The engines regress here as a matter of course: the page dispatches several commerce
      // searches per query and a stale one can settle last, rebuilding the facet values from a
      // request that never carried the derived filters. Traced live on "Beat Water types under $25"
      // -- one notification arrives holding `f-cardtypes` and `mnf-ec_price`, the next has neither.
      // Writing that second one through deletes the shopper's filters from the address bar, and it
      // also destroys the reconcile effect's only input, because it re-asserts from the URL: by the
      // time it looks, the state it is meant to restore is gone from the very place it reads.
      // Measured 0/5 -- the banner promised $25 over a grid holding a $378 card.
      //
      // So a fragment that is missing something this query derived is treated as in-flight, not as
      // truth. The reconcile below re-asserts it into the engine; the URL keeps saying what the
      // banner says in the meantime. Anything the shopper themselves changes still mirrors normally,
      // because their edits land on keys this ref doesn't claim -- and when they clear a derived
      // filter by hand, the write effect stops claiming it on the next pass.
      const holds = new URLSearchParams(fragment);
      if (Object.entries(desiredDerivedRef.current).some(([key, value]) => holds.get(key) !== value)) return;
      if (priceBlindKey(fragment) !== priceBlindKey(window.location.search.slice(1))) {
        setSearchParams(new URLSearchParams(fragment), { replace: true, state: locationStateRef.current });
      }
    };
    const unsubscribeContent = contentUrlManager.subscribe(syncUrl);
    const unsubscribeCommerce = commerceUrlManager.subscribe(syncUrl);
    return () => {
      unsubscribeContent();
      unsubscribeCommerce();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceUrlManager]);
  // The reverse direction: when the URL changes from outside our own writes above (a deep
  // link, browser back/forward, a fresh mount after client-side navigation, or a plain
  // navigation to /search), restore that state into both engines and re-run their requests.
  // Passing the whole combined string to each is safe -- each manager's deserializer only reads
  // the parameter keys it recognizes and ignores the rest.
  useEffect(() => {
    // (Encoding rules live in toEngineFragment -- see the note on it. They are subtle enough that
    // a second, hand-rolled copy of them at another call site is how this page grew a bug where
    // "Lightning,Grass" restored as one facet value instead of two.)
    // Incoming: the mirror of syncUrl -- the URL's `q` is the user's sentence, so swap in the
    // rewrite before handing it to the managers, and compare like for like so a rewritten query
    // doesn't read as a permanent mismatch and re-synchronize on every render.
    const forEngines = toEngineFragment(searchParams, effectiveQuery);
    if (fragmentKey(forEngines) !== fragmentKey(mergedFragment())) {
      contentUrlManager.synchronize(forEngines);
      commerceUrlManager.synchronize(stripContentOnlyKeys(forEngines));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, commerceUrlManager, effectiveQuery]);

  // The URL is the single source of truth for the query. Whenever it changes (initial load,
  // a deep link, browser back/forward, or a submit from the header search box that already
  // updated the URL) this re-drives whichever engine's own text doesn't already match it --
  // that guard is what stops a local submit (which already drove its own controller before
  // touching the URL) from triggering a redundant second fetch. A submit always targets Search
  // (the commerce search box has no listing equivalent); clearing back to no query hands off to
  // the Listing controller's own one-time fetch instead.
  const hasExecutedCommerce = useRef(false);
  const hasFetchedListing = useRef(false);
  const hasExecutedContent = useRef(false);
  useEffect(() => {
    if (query) {
      if (commerceSearchBoxController.state.value !== effectiveQuery) {
        commerceSearchBoxController.updateText(effectiveQuery);
        commerceSearchBoxController.submit();
      } else if (!hasExecutedCommerce.current) {
        commerceSearch.executeFirstSearch();
      }
      hasExecutedCommerce.current = true;
    } else if (!hasFetchedListing.current) {
      hasFetchedListing.current = true;
      commerceListing.executeFirstRequest();
    }

    // Mirrors the commerce branch above. The "already matches" case (query text equal to the
    // URL) happens whenever contentUrlManager already hydrated query.q from the URL at
    // construction time -- e.g. on the very first page load of a deep link -- so
    // contentSearchBox never sees a text change to submit and needs an explicit first search.
    if (query) {
      if (contentSearchBox.state.value !== effectiveQuery) {
        contentSearchBox.updateText(effectiveQuery);
        contentSearchBox.submit();
      } else if (!hasExecutedContent.current) {
        searchEngine.executeFirstSearch();
      }
      hasExecutedContent.current = true;
    } else if (
      browseZone !== 'marketplace' &&
      !hasExecutedContent.current &&
      (presetContentFacet ||
        contentTypeFacet.state.hasActiveValues ||
        contentGenerationFacet.state.hasActiveValues ||
        deepLinkedContentFacet ||
        browseZone === 'pokedex')
    ) {
      // No text query, but a Generation/Type filter is (or is about to be) active -- e.g. a
      // breadcrumb pick from a detail page, or a deep link straight into `nf-pokemongeneration=`.
      // The content engine otherwise never runs its first search while browsing, which is also
      // what candidate Type values (see the presetContentFacet effect above) wait on. An explicit
      // 'pokedex' browseZone (the home page's "All Pokémon" link) earns the same unfiltered first
      // search; 'marketplace' suppresses it even if a stale content facet is still active, since
      // that section renders nothing this visit regardless (see showContentSection above).
      //
      // `deepLinkedContentFacet` is the term that makes a COLD shared link work, and it is not
      // redundant with the two `hasActiveValues` reads beside it -- those are derived from the facet
      // RESPONSE and are still false at this point, because the only thing that could produce a
      // response is the search this branch is deciding whether to run (see hasContentFacetParam).
      // That deadlock is why `/search?f-pokemontype=Water` used to render no species rail at all:
      // measured, zero content searches ever went out, so the Pokédex half of a shared type link was
      // simply missing while the marketplace half rendered fine. A query never hit it because the
      // `if (query)` branch above short-circuits and searches unconditionally.
      //
      // The client-side-nav case does NOT come through here -- `urlManager.synchronize()` in the
      // restore effect executes its own search -- so this stays a cold-load repair, guarded by
      // `hasExecutedContent` exactly as the other terms are.
      hasExecutedContent.current = true;
      searchEngine.executeFirstSearch();
    }
    // presetContentFacet's primitives (not just `query`) are read above: a type chip clicked while
    // browsing with no text query (query stays '' the whole time, never changing) would otherwise
    // never re-run this effect, so the branch above that's supposed to catch exactly that case --
    // "no query, but a preset Type/Generation filter just arrived" -- would never fire, leaving
    // contentTypeFacet's values permanently empty and the preset effect with nothing to match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    // An advisory query's text is only final once its counters resolve out of the index, which
    // happens a beat after `query` changes -- without this the engines would run once on the
    // pre-resolution text and never re-run.
    effectiveQuery,
    presetContentFacet?.kind,
    presetContentFacet && 'value' in presetContentFacet ? presetContentFacet.value : undefined,
    presetContentFacet && 'gen' in presetContentFacet ? presetContentFacet.gen : undefined,
    // Same reasoning as the presetContentFacet primitives above: arriving at a Pokédex facet link
    // from another /search URL leaves `query` at '' throughout, so without this the branch that
    // exists to catch exactly that would never re-run.
    deepLinkedContentFacet,
  ]);

  // Turn the parsed query's constraints into actual facet selections on both engines.
  //
  // Facets rather than query terms, for a reason worth keeping in the code: query terms AND, facet
  // values within one facet OR. "Counter air pokemon" resolves to Rock + Ice + Electric, and a
  // three-type AND matches nothing -- which is the same zero-result failure this whole feature was
  // built to fix. Selecting three values on one facet is the OR the query actually means.
  //
  // Structured like the presetFacet effect above (wait for the generator to offer the value, then
  // select it) because the commerce facets are produced per-response and simply don't exist yet on
  // the first render after a query changes.
  const understandingKey = understanding.isActive
    ? [
        understanding.parsed.intent,
        understanding.cardTypes.join(','),
        understanding.rarityTerms.join(','),
        understanding.pokedexTypes.join(','),
        // Price is part of the identity of a derived filter state, not an afterthought: without it
        // "charizard under $25" and "charizard under $100" produce the same key, and the apply-once
        // guard below would skip the second one entirely.
        understanding.priceRange ? `${understanding.priceRange.start}-${understanding.priceRange.end}` : '',
      ].join('|')
    : '';
  // ONE selection per response cycle, not a synchronous loop. Every toggleSelect dispatches its own
  // request, and those requests race: selecting Water, Lightning and Fighting in one pass reliably
  // left only Water applied, because an early response landed last and overwrote the rest. Caught
  // in-browser -- the facet showed a single checked box against a query that had resolved three
  // types. So each pass makes at most one change and returns; the subscription fires on the
  // resulting response and makes the next, converging in a handful of round trips. `converge` also
  // deselects anything selected that this query doesn't want, which is what clears a previous
  // query's filters off these module-scope controllers.
  const appliedUnderstandingRef = useRef('');

  // Pass counter and reconcile bookkeeping for the two effects below. Declared HERE, above both of
  // them, and not next to the reconcile effect that owns the logic: the write effect lists
  // `derivedPass` in its dependency array, and dependency arrays are evaluated during render at the
  // `useEffect(...)` call itself. Declaring these after that effect put the read before the
  // declaration and threw `ReferenceError: Cannot access 'derivedPass' before initialization` on
  // every /search render -- a blank page. The effect *body* would have been fine; only the deps
  // array reads too early. `npm run build` does not catch it: tsc and vite both pass, because a
  // temporal dead zone violation is runtime-only.
  const [derivedPass, setDerivedPass] = useState(0);
  const reconcileRef = useRef({ key: '', passes: 0 });

  // Applied by writing ONE query string, not by toggling facet controllers.
  //
  // Three separate attempts at toggling proved that path unworkable here, each failing differently
  // in the browser: (1) a synchronous batch raced its own requests and left only the last value
  // selected; (2) a subscription-driven pass re-entered itself through toggleSelect's synchronous
  // notify -- 5,004 passes, tab crash; (3) a state-driven one-per-response pass terminated but kept
  // under-applying, because the commerce cardtypes facet only offers 6 of 11 values per response
  // and shuffles which 6, so a wanted value that wasn't on offer never got selected.
  //
  // The url managers already accept a complete facet state in one deserialize -- `f-cardtypes=A,B,C`
  // applies all three atomically, with no intermediate states to race. That is also the mechanism
  // the rest of this page already trusts for shareable links, so the derived filters land in exactly
  // the same place a user's own clicks would, and stay removable from the facet rail like any
  // hand-clicked selection.
  //
  // Written once per query. After that the engines own the state and the user's clicks are
  // authoritative, so unchecking a derived filter sticks instead of being re-asserted.
  useEffect(() => {
    if (!understandingKey || understanding.isResolving) return;
    // Keyed on the pass counter too, so the reconcile effect below can ask for exactly one more
    // atomic re-assert after a stale response clobbered this one (see its comment).
    const writeKey = `${understandingKey}#${derivedPass}`;
    if (appliedUnderstandingRef.current === writeKey) return;
    appliedUnderstandingRef.current = writeKey;

    // Start from the URL as it actually stands, not a blank set. Building fresh discarded every
    // parameter this effect doesn't own -- `page`, `sortCriteria`, and any facet already applied by
    // the shopper or carried in a deep link -- each time a query resolved. Read off
    // window.location for the same reason syncUrl does: `searchParams` is not in this effect's
    // deps and would be a render behind.
    const derived = new URLSearchParams(window.location.search);
    derived.set('q', query);
    // The three keys below ARE ours: each is written when this query derives values for it and
    // deleted when it doesn't, so a previous query's derived filters clear instead of lingering.
    // Recorded as it is written, so syncUrl and the reconcile share one answer to "what did this
    // query ask for" that neither the URL nor the engines can erase from under them.
    const desired: Record<string, string> = {};
    const applyDerived = (key: string, values: string[]) => {
      if (values.length > 0) {
        derived.set(key, values.join(','));
        desired[key] = values.join(',');
      } else derived.delete(key);
    };
    applyDerived('f-cardtypes', understanding.cardTypes);
    applyDerived('f-cardrarity', understanding.cardRarities);
    applyDerived(`f-${CONTENT_FIELDS.type}`, understanding.pokedexTypes);
    // The budget rides along in the SAME write, for exactly the reason the three keys above do:
    // one deserialize, no intermediate states. Applying it separately (through the facet
    // controller, in its own effect) was tried and is a race -- measured in-browser, a cold session
    // applied the types and dropped the budget, a warm one applied the budget and dropped the
    // types, depending on which settled first. Whatever the page derives has to land atomically.
    //
    // `mnf-`, not `nf-`: the manual numeric facet accepts arbitrary bounds, while `nf-` only
    // restores a range that already exists among the buckets the response is currently offering.
    // The catalog's live tiers are $0-1/$1-5/$5-25/..., so a derived "under $25" is not any one of
    // them and would silently no-op as `nf-`. Confirmed live before this was wired.
    if (understanding.priceRange) {
      derived.set('mnf-ec_price', priceRangeToParam(understanding.priceRange));
      desired['mnf-ec_price'] = priceRangeToParam(understanding.priceRange);
    } else derived.delete('mnf-ec_price');
    desiredDerivedRef.current = desired;
    setSearchParams(derived, { replace: true, state: locationStateRef.current });
    // ...and push the SAME state into the commerce engine in this tick, rather than waiting for the
    // restore effect to notice the URL changed.
    //
    // Routing it only through the URL loses it. syncUrl is subscribed to both managers, and the
    // requests already in flight keep notifying while the derived write is still on its way to the
    // engine; each notification carries a manager fragment that does not hold the derived facets
    // yet, so syncUrl reads "the URL disagrees with the engines" and rewrites the URL to match the
    // engines -- deleting `f-cardtypes` and `mnf-ec_price` moments after this effect wrote them.
    // Measured 0/5 on "Beat Water types under $25": the write logged both keys every time and the
    // final URL held neither, so the grid answered a matchup banner promising $25 with a $378 card.
    // `priceBlindKey` was the narrow version of this fix and is not enough on its own -- it shields
    // the price key from the comparison, but `f-cardtypes` is still unequal, so the rewrite fires
    // anyway and takes the (unstripped) price with it as collateral.
    //
    // The reconcile effect below cannot recover it either, by construction: it re-deserializes
    // `window.location.search`, which by then is the stripped URL, so it re-asserts the very state
    // that is missing and spends its 3 passes doing it.
    //
    // Synchronizing here closes the window instead of racing it -- the engine holds the derived
    // state before the next notification, so syncUrl's next comparison agrees and leaves the URL
    // alone. It also costs nothing extra: the restore effect compares the URL against the managers'
    // own fragment, so once this has landed it sees them equal and skips the duplicate deserialize
    // it would otherwise have done.
    commerceUrlManager.synchronize(stripContentOnlyKeys(toEngineFragment(derived, effectiveQuery)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [understandingKey, understanding.isResolving, derivedPass]);

  // Re-assert the derived state when a response comes back not holding it.
  //
  // The write above is correct but lands into a race, because the page dispatches more than one
  // commerce search per query -- the search box's own submit and the url manager's synchronize()
  // both fire -- and their responses can settle out of order. Traced in-browser on "charizard under
  // $25": two searches without the derived state went out at 447ms, the one carrying it at 482ms,
  // and the responses arrived 683/735/738/739ms, so a stale response settled LAST and overwrote the
  // good one. Nothing is wrong with the engines' own state; the facet VALUES are rebuilt from
  // whichever response settled last, so the grid showed $825 cards under a banner promising $25.
  // Both halves are exposed to it -- a budget-only query lost its budget, and once the budget
  // stopped losing, the combined matchup query started losing its types instead.
  //
  // So the correction has to re-assert the WHOLE derived state, not one facet: bump a pass counter
  // and let the write above run again, which re-deserializes every key atomically -- the one
  // mechanism this page trusts. Per-facet controller calls were tried first and are what taught
  // this lesson, by fixing the price and breaking the types in the same move.
  //
  // Capped at 3 passes per query so a value the server won't honor can never loop; `converged`
  // deliberately only requires the desired values the response actually OFFERS to be selected,
  // because the commerce cardtypes facet returns ~6 of its 11 values per response and shifts which
  // ones as the result set narrows -- demanding all of them would never converge.
  // (`derivedPass` and `reconcileRef` are declared above both effects -- see the note there.)
  useEffect(() => {
    if (!understandingKey || understanding.isResolving) return;

    const check = () => {
      if (reconcileRef.current.key !== understandingKey) reconcileRef.current = { key: understandingKey, passes: 0 };
      if (reconcileRef.current.passes >= 3) {
        // Out of corrections. Drop the claim as well, so a state the engines will never accept
        // can't leave syncUrl permanently refusing to mirror the shopper's own facet clicks.
        desiredDerivedRef.current = {};
        return;
      }
      // Only judge a SETTLED response. The generator notifies on intermediate states too, and
      // judging those burned the whole correction budget on a query that was still in flight.
      if ((useListing ? commerceListing : commerceSearch).state.isLoading) return;

      const price = commerceFacetGenerator.facets.find(
        (f) => f.type === 'numericalRange' && f.state.facetId === 'ec_price'
      );
      // Nothing to compare against until the generator has produced the facets for this response.
      if (!price || price.type !== 'numericalRange') return;

      const want = understanding.priceRange;
      const selected = price.state.values.filter((v) => v.state !== 'idle');
      const priceOk = want
        ? selected.length === 1 && selected[0].start === want.start && selected[0].end === want.end
        : selected.length === 0;

      const typeFacet = commerceFacetGenerator.facets.find(
        (f) => f.type === 'regular' && f.state.facetId === 'cardtypes'
      );
      const typesOk =
        understanding.cardTypes.length === 0 ||
        !typeFacet ||
        typeFacet.type !== 'regular' ||
        understanding.cardTypes
          .filter((t) => typeFacet.state.values.some((v) => v.value === t))
          .every((t) => typeFacet.state.values.some((v) => v.value === t && v.state === 'selected'));

      if (priceOk && typesOk) {
        // Converged, on a settled response, 400ms after the engine last went quiet -- so the
        // in-flight window this whole mechanism exists for is over. Release the claim and stop
        // correcting for this query.
        //
        // Both halves of that matter. Holding the claim would leave syncUrl refusing to mirror the
        // shopper's own facet clicks, since a filter THEY remove is indistinguishable from one the
        // engines dropped. Continuing to correct would be worse: this effect compares against what
        // the query derived, so it reads an intentional uncheck as a regression and puts the filter
        // straight back -- which would quietly falsify the claim these filters are ordinary facet
        // selections you can just remove. Past this point the engines own the state, exactly as the
        // write effect above says.
        reconcileRef.current.passes = 3;
        desiredDerivedRef.current = {};
        // The Consultation Brief (consultationBrief.ts, phase W2) is written HERE rather than in the
        // write effect above on purpose: that effect fires on every pass, including ones a stale
        // response later overwrites (see its own comment -- the whole reason this reconcile effect
        // exists). Writing the brief there would let a query that ultimately failed to apply still
        // get remembered as the shopper's consultation. This branch is reached only once the engines
        // actually hold what the query derived, which is the same "confirmed applied" bar
        // desiredDerivedRef's own release uses.
        writeConsultation({
          queryText: query,
          isAdvisory: understanding.parsed.intent === 'advisory',
          targets: understanding.parsed.counterTargets.map((t) => t.pokedex),
          counterTypes: understanding.pokedexTypes,
          budget: understanding.priceRange,
          topTierEnd: understanding.topTierEnd,
          rarities: understanding.cardRarities,
        });
        return;
      }
      reconcileRef.current.passes += 1;
      setDerivedPass((n) => n + 1);
      // Bumping the counter alone is not enough when the derived state is the ONLY thing that got
      // lost: the write above then re-writes byte-identical params, React Router treats that as a
      // no-op, the restore effect never re-runs, and nothing re-reaches the engine. That is exactly
      // the budget-only case ("charizard under $25" derives no types, so the URL is unchanged
      // between passes). Re-deserializing the current fragment directly is what actually re-applies
      // it -- still one atomic synchronize, just not routed through the URL.
      // Re-assert from what the query ASKED for, not from what the URL currently says. Reading the
      // URL here was the bug that made this whole effect inert: the regression it exists to correct
      // had, until now, already been mirrored into the URL by syncUrl, so it re-deserialized a
      // fragment with the derived filters missing and spent all three passes restoring nothing.
      // syncUrl no longer writes those regressions through, but this must not depend on that --
      // rebuilding from `desiredDerivedRef` means the correction is right even if the URL is not.
      const reassert = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(desiredDerivedRef.current)) reassert.set(key, value);
      commerceUrlManager.synchronize(stripContentOnlyKeys(toEngineFragment(reassert, effectiveQuery)));
    };

    // Debounced, and that is the whole trick. Correcting on every notification made this WORSE, not
    // better -- measured: a 6-correction budget dropped the cold path from 6/6 to 2/6, because each
    // re-assert is itself another request that can settle out of order against the ones already in
    // flight. Waiting for the engine to go quiet first means at most one correction per burst,
    // issued when nothing is racing it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(check, 400);
    };

    schedule();
    const unsubscribe = commerceFacetGenerator.subscribe(schedule);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [understandingKey, understanding.isResolving, commerceFacetGenerator, commerceUrlManager, effectiveQuery, useListing]);

  // If the Listing request comes back with an error (e.g. no Listing configuration exists yet
  // for this tracking ID in the Merchandising Hub), fall back to Search with an empty query --
  // the same request "All cards" used before the Listing controller existed -- so browsing
  // still works.
  //
  // Self-healing rather than once-only, because "once" was not enough. Browsing that ALSO carries a
  // Pokedex facet (a type tile, the header's Pokédex menu, a breadcrumb) toggles a content facet
  // after mount, which rewrites the URL, which re-runs the restore effect, which synchronizes the
  // commerce manager again -- and the fallback, having already spent its one shot, never re-ran.
  // The marketplace half was then left empty for the rest of the visit and rendered the no-results
  // recommendation rail: the Pokédex column filtered correctly while the cards beside it were
  // replaced by unrelated recommendations. That is the whole of the long-standing "type tiles don't
  // filter" defect -- the Pokédex side was filtering fine all along.
  //
  // So the condition is the symptom (in fallback mode, settled, and holding nothing) rather than a
  // one-time flag, capped so a genuinely empty catalog can't spin.
  const searchFallbackAttempts = useRef(0);
  useEffect(() => {
    const settled = !commerceListingState.isLoading && !commerceSearchState.isLoading;
    const emptyHanded = commerceSearchState.products.length === 0;
    // `listingUsable` rather than `listingUnavailable`: same reason as the flag's own comment --
    // a listing that simply hasn't produced anything leaves the page just as empty as one that
    // errored, and waiting for an error that may be seconds away is what stranded it.
    if (!isBrowsing || listingUsable || !settled || !emptyHanded) return;
    if (searchFallbackAttempts.current >= 3) return;
    searchFallbackAttempts.current += 1;
    // Carry over whatever page size the user picked while browsing via Listing -- the Search
    // fallback's own pagination controller is a separate instance that never saw that choice
    // and would otherwise silently reset to its own default.
    if (commerceSearchPagination.state.pageSize !== commerceListingPagination.state.pageSize) {
      commerceSearchPagination.setPageSize(commerceListingPagination.state.pageSize);
    }
    commerceSearch.executeFirstSearch();
  }, [
    isBrowsing,
    listingUsable,
    commerceListingState.isLoading,
    commerceSearchState.isLoading,
    commerceSearchState.products.length,
  ]);

  // A new browsing visit gets a fresh budget -- otherwise three corrections spent on one visit
  // would leave a later one unable to recover.
  useEffect(() => {
    if (!isBrowsing) searchFallbackAttempts.current = 0;
  }, [isBrowsing]);

  // Selected values across every commerce facet, regular and numeric alike -- the count badge on
  // the mobile Filters button, which is the only applied-filter signal left on small screens now
  // that the chips row is gone. Safe to read at render: any facet change lands via a new commerce
  // response, which re-renders this page through the state subscriptions above.
  const activeCommerceFacetCount = commerceFacetGenerator.facets.reduce(
    (n, f) => n + (f.state.values as Array<{ state: string }>).filter((v) => v.state !== 'idle').length,
    0
  );

  // Used by the pokedex-browsing h1 below to name what's being browsed.
  const activeContentGeneration = contentGenerationFacetState.values.find((v) => v.state === 'selected');
  const activeContentType = contentTypeFacetState.values.find((v) => v.state === 'selected');
  // ALL of them, for the species rail. Read off the facet rather than off `understanding` on
  // purpose: this is the one thing that is true of every way the Pokédex column gets filtered --
  // a matchup consultation's derived counters, a hand-clicked Type facet, a type tile, a deep link
  // -- and it is the state the rail is actually showing, not the state the page asked for.
  const activeContentTypes = contentTypeFacetState.values
    .filter((v) => v.state === 'selected')
    .map((v) => v.value);

  // Only the very first load of each section shows the full-page skeleton. Mutating the ref
  // directly during render (not in an effect) is intentional -- it must latch before this same
  // render decides whether to show the skeleton.
  const hasLoadedCommerceOnce = useRef(false);
  if (!commerceState.isLoading) hasLoadedCommerceOnce.current = true;
  // Split into two questions on purpose. `commerceFirstLoadPending` is the raw fact (used to
  // decide WHAT the loading placeholders look like -- facets skeleton vs. real facets, etc.);
  // `showCommerceSkeleton` is gated behind a short delay so a fast commerce response never shows
  // the skeleton shell at all -- it goes straight from nothing to the real section with one
  // fade-in, instead of nothing -> skeleton flash -> content. The section stays unmounted for the
  // brief pre-delay window rather than rendering half-populated (0 results, an empty facet
  // column), which would be its own kind of flash.
  const commerceFirstLoadPending = commerceState.isLoading && !hasLoadedCommerceOnce.current;
  const showCommerceSkeleton = useDelayedReveal(commerceFirstLoadPending, 200);
  // The page dispatches more than one commerce request per query (the search box's own submit and
  // the url manager's synchronize() both fire -- see the syncUrl comment far below), and they can
  // settle out of order. An early one landing empty flips `hasLoadedCommerceOnce` permanently true
  // before the request that actually carries facets/results has come back, which reclassified the
  // REAL first load as a "later" refetch -- the grid correctly kept its skeleton (that path is
  // driven by isLoading alone), but the facet column and the summary line fell through to their
  // "loaded" branch with nothing to show: a blank aside and a confident "Showing 0 results" that
  // was just wrong for a moment. Gating those two on DATA PRESENCE instead of the once-ever ref
  // sidesteps it -- as long as neither facets nor a count have actually arrived, both stay in
  // their skeleton state regardless of which request settled the ref.
  const commerceDataPending = commerceState.isLoading && commerceFacetGenerator.facets.length === 0 && commercePagination.state.totalEntries === 0;
  // Every LATER load (pagination, sort, a facet toggle) re-triggers `isLoading` too. That used to
  // just dim the whole section -- facets included -- which was the "page flashes" complaint from
  // when the facets still lived inside the same swapped-out tree: replacing it dropped slider
  // focus mid-drag. The facets now render in their own `<aside>`, a sibling the grid/list swap
  // below never touches, so this can safely swap the PRODUCT AREA ALONE for a skeleton on every
  // later load too -- pagination gets an actual loading state instead of a dimmed stale grid,
  // and the facets/Pokédex zone beside it stay mounted and interactive throughout.
  //
  // Gated on `useSettledLoading`, not raw `commerceState.isLoading`, for a reason specific to
  // this page: it fires more than one commerce request per query (see the syncUrl/reconcile
  // comments below -- the search box's own submit, the url manager's synchronize(), and up to
  // three derived-facet correction passes for a query like "rare holo"), and those responses can
  // settle out of order -- and, measured live, can do it WITHOUT ever toggling isLoading back to
  // true in between (one request's fulfilled action lands while a second, already-dispatched
  // request's own pending phase never produced its own observable isLoading tick, so its later
  // fulfilled action silently overwrites `products` with isLoading reading false on both sides).
  // That is why `commerceRevision` -- bumped on every notification, not just isLoading changes --
  // is threaded through here too; see useSettledLoading's own comment for the full trace. Raw
  // isLoading alone flipped false the instant ANY response landed -- including a stale or
  // momentarily-empty one -- which dropped the grid out of its skeleton, then back in, then
  // briefly into the zero-results empty state (with its own, differently-sized skeleton), before
  // the real settled response finally arrived. Measured live: the page swung between ~1500px and
  // ~4700px tall inside two seconds on that query alone.
  // `understanding.isResolving` is OR'd into the raw isLoading input, not just left for the
  // revision bridge to catch after the fact: a query like "rare holo" runs its very first
  // (unrefined, keyword-only) commerce request BEFORE the Card Consultant has finished deciding
  // which facets to derive, and that first request can settle in well under a second -- fast
  // enough to reveal an answer that's about to be thrown out the moment resolution finishes and
  // the derived-facet write effect fires its own request. Folding isResolving in means busy
  // engages for the whole "figuring out what this query means" phase too, not just the network
  // requests that phase eventually triggers.
  const commerceBusy = useSettledLoading(commerceState.isLoading || understanding.isResolving, commerceRevision);
  const isRefetchingCommerce = commerceBusy && hasLoadedCommerceOnce.current;
  // Same debounce for the Pokédex rail, which shares the same multi-request-per-query shape (the
  // content engine's own url manager synchronize() plus the preset/derived-facet effects above
  // can each trigger a re-search). Passed to PokedexMatches in place of the raw content isLoading.
  const contentBusy = useSettledLoading(contentState.isLoading || understanding.isResolving, contentRevision);

  // Scrolls the product area back into view on a page change, so "click Next" reads as a real
  // navigation even when the shopper was scrolled deep into a long grid -- otherwise the new page
  // renders off-screen below the fold and looks like nothing happened. Skipped on every OTHER
  // kind of commerce reload (sort, a facet toggle): those already land beside the control the
  // shopper just used, so yanking the scroll position there would be the opposite of smooth.
  //
  // Tracks the LAST PAGE VALUE it already reacted to, not a one-shot "have I run yet" boolean --
  // a boolean guard looked right but wasn't: React.StrictMode (main.tsx, dev only) double-invokes
  // an effect once as part of its mount rehearsal, and a boolean flips to "already ran" on the
  // FIRST of those two calls, so the second one sailed past the guard and fired a real
  // scrollIntoView on every page load. Confirmed live: a deep link straight into a heavily
  // faceted /search URL (several f-cardtypes/f-pokemontype values) scrolled the page down and
  // lost the top on load, with no pagination click involved. Comparing against the last-seen page
  // VALUE is idempotent against that replay -- StrictMode's extra call sees the same page number
  // it just recorded and is a no-op, while an actual page change (a different number) still
  // scrolls exactly as intended.
  const productsAnchorRef = useRef<HTMLDivElement>(null);
  const lastScrolledPageRef = useRef<number | null>(null);
  useEffect(() => {
    const page = commercePagination.state.page;
    if (lastScrolledPageRef.current === null || lastScrolledPageRef.current === page) {
      lastScrolledPageRef.current = page;
      return;
    }
    lastScrolledPageRef.current = page;
    productsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [commercePagination.state.page]);
  // The zone header only earns its frame when species matches are actually under it (or are on
  // their way, so the skeleton stays labeled). A commerce-only query like "holo rare" returns no
  // content results, and every child of that section self-hides when empty. PokedexMatches now
  // carries its own chip (moved into its CardHeader when it became a Card, see there) and gates
  // it on the same internal delayed-reveal its skeleton uses, so there's no separate zone-header
  // row up here to keep in sync with it anymore.

  // Arriving with a Generation/Type pick and no text query (header Pokédex menu, a detail page's
  // breadcrumb select, a shared f-pokemongeneration= link) is the one case where the knowledge
  // side leads the page rather than accompanying a search -- so it names itself in the h1 and the
  // species list opens as a grid instead of a chip strip.
  const isPokedexBrowsing = isBrowsing && showContentSection;
  const browseType = activeContentType?.value;
  const browseGen = activeContentGeneration?.start;
  const pokedexBrowseTitle =
    browseGen != null && browseType
      ? `${browseType}-type Pokémon, Generation ${browseGen}`
      : browseGen != null
        ? `Generation ${browseGen} Pokédex`
        : browseType
          ? `${browseType}-type Pokémon`
          : 'Pokédex';

  return (
    // A whole-page fixed-viewport shell (header pinned, footer pinned, only the grid scrolling
    // between them) was tried and reverted the same session: this page's real content -- hero
    // search box, title, an optional Generated Answer, an optional Pokédex rail, plus a tall
    // multi-column footer -- easily exceeds a typical ~900px viewport on its own, so a hard
    // height budget for "everything except the grid" either clipped the Pokédex rail entirely or
    // squeezed the grid down to a sliver. Scoped back to just the facets+grid row instead (see
    // its own comment below) -- the search box/title/Generated Answer/Pokédex rail stay in
    // normal page flow, so they never compete with the footer for the same fixed budget.
    <>
      <main className="page-enter page-container flex-1 py-8">
        {/* One consultation, not four stacked boxes (2026-08-17,
            presentation/consultant-everywhere-plan.md phase W1). The federated search omnibox
            (`commerceSearchBoxController` is the same controller instance the rest of this page's
            commerce section reads/writes; `onSubmit` keeps the existing behavior of syncing the `q`
            URL param), the live Trending pills, and every "here's what we did with your words"
            response -- Did You Mean, the fuzzy fallback, the query-understanding banner, the
            generated answer -- now live inside one card instead of a search box floating above three
            separately-framed boxes further down the page. See ConsultantPanel.tsx's own comment for
            why the response zone below needs no self-hide coordination. */}
        <ConsultantPanel
          controller={commerceSearchBoxController}
          instantProducts={headerInstantProducts}
          instantContent={contentInstantResults}
          recentQueries={recentQueriesList}
          onSubmit={(value) => setSearchParams({ q: value })}
          isBrowsing={isBrowsing}
          personaContext={consultantPersona}
          // Start over drops the query entirely rather than restoring some previous one: the panel
          // is asking for a blank slate, and an empty q is what puts this page back into the browse
          // state the composer's search mode belongs to (Trending pills, no results header).
          onStartOver={() => setSearchParams({})}
        >
          {!isBrowsing && <DidYouMean controller={commerceDidYouMean} className="" />}
          {!isBrowsing && (
            <FuzzyDidYouMean
              query={query}
              resultNames={commerceState.products.map((p) => p.ec_name ?? '')}
              onPick={(picked) => setSearchParams({ q: picked })}
            />
          )}
          {/* ContentGeneratedAnswer (RGA) intentionally does not render here anymore -- phase G2's
              own rule, "RGA leaves the default view". The component itself is deliberately not
              deleted: G4 brings it back as a compare toggle inside this same response zone. */}
          <GeminiConsultantAnswer query={query} personaContext={consultantPersona} understanding={understanding} />
        </ConsultantPanel>

        {/* One line of page identity, no breadcrumb or eyebrow above it. The query case no
            longer names itself here -- that's now the "Showing N results for..." line above the
            facets/grid split below, and having both said the same thing at two different scales
            was the duplicate this replaced. Browsing still gets its own headline here, since
            nothing else on the page states it. */}
        {!query && isPokedexBrowsing && (
          <>
            {/* Amber uppercase eyebrow above the browse headline -- card-layout/look-and-feel pass
                from the RabidMoose mockup (presentation/rabidmoose-visual-refresh-plan.md §3).
                Reverses an earlier explicit choice ("no breadcrumb or eyebrow above it," see the
                git history on PageTitle's old neighbor here) on direct user request for this
                specific treatment -- recorded, not silently overwritten. */}
            <ZoneEyebrow zone="pokedex" text="RabidMoose Lore & Collector Knowledge Base" className="mb-1.5" />
            <PageTitle className="mb-6">{pokedexBrowseTitle}</PageTitle>
          </>
        )}
        {/* AN INVISIBLE h1 FOR EVERY OTHER STATE (2026-08-19, visual-consistency audit). The block
            above is the page's only h1 and it renders in exactly one state -- Pokédex browse with
            no query -- so /search was the one route in the app that could reach a visitor with no
            h1 at all: the marketplace default and every query landed with an <h3> ("Card
            Consultant") as their first heading. That is a deliberate LAYOUT decision, per the note
            above: nothing on this page should restate at title scale what the "Showing N results
            for..." line already says. `sr-only` keeps that decision and still gives the document
            the one top-level heading every other page has. Zero pixels change. */}
        {(query || !isPokedexBrowsing) && (
          <h1 className="sr-only">
            {query ? `Search results for “${query}”` : ZONES.marketplace.label}
          </h1>
        )}

        <NotifyBanner />

        {showContentSection && (
          <div className="mb-8">
            <DidYouMean controller={contentDidYouMean} />
            <PokedexMatches
              results={contentState.results}
              isLoading={contentBusy}
              // Passed in both modes now: a text query can overflow the cap too (loose queries
              // match hundreds of species), and truncating one silently is the same dishonesty
              // the browsing case was already guarded against.
              total={contentTotal}
              // So a dual-typed species leads with the type that put it in the rail, rather than
              // whichever type the Pokédex happens to list first (see pokedexFields).
              filteredTypes={activeContentTypes}
              query={query}
            />
          </div>
        )}

        {/* The commerce section stays UNMOUNTED for the brief pre-delay window of a first load
            (commerceFirstLoadPending true, showCommerceSkeleton still false) rather than
            rendering a half-populated version of itself -- see the comment on those two flags
            above. Past that window it's always this one section, in this one shell: a fast
            response fades straight into real content, a slower one fades into the skeleton shell
            first and then cross-fades into real content once it lands, but the controls row, the
            facet column and the grid are the same three regions the whole time instead of a
            completely different structure (bare grid, no facets, no controls) swapping in for the
            real layout -- THAT swap, not the loading itself, was the "very flashy" complaint. */}
        {showCommerceSection && !(commerceFirstLoadPending && !showCommerceSkeleton) && (
          <section className="fade-in-panel">
            {/* No Marketplace zone eyebrow on this page: /search is its own page, and the h1 at the
                top of it ("Results for ...") is the identity -- a "From the Marketplace" band under
                it read as though the results were a section of some larger page. */}
            {/* Mobile-only: the left column below is `hidden` under md, so Filters/Sort/View need
                their own compact row here instead of vanishing on small screens. */}
            <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
              <MobileFilterSheet title="Filters" activeCount={activeCommerceFacetCount}>
                {commerceDataPending ? <FacetGeneratorSkeleton /> : <FacetGenerator controller={commerceFacetGenerator} />}
              </MobileFilterSheet>
              <div className="flex items-center gap-2">
                <SortDropdown controller={commerceSort} />
                <ViewToggle value={viewMode} onChange={setViewMode} />
              </div>
            </div>

            {/* Two-column layout on desktop: a left facet column instead of the horizontal
                dropdown bar. See DesktopFacetsPanel's own comment for the full history. */}
            <div className="md:flex md:items-start md:gap-6 lg:gap-8">
              <DesktopFacetsPanel
                facetGenerator={commerceFacetGenerator}
                facetsPending={commerceDataPending}
              />

              <div className="min-w-0 flex-1">
                {/* ContentGeneratedAnswer/QueryUnderstanding/DidYouMean/FuzzyDidYouMean all moved
                    into the Consultant panel's response zone above (2026-08-17,
                    presentation/consultant-everywhere-plan.md phase W1) -- see that render site
                    near the top of this component. (ShopTheAnswer, the answer's own buy-path rail,
                    was cut 2026-08-16 -- it read as a second, redundant card grid stacked on the
                    listing right below it even once it stopped literally duplicating cards; see the
                    search-results-answer-placement memory and card-consultant-plan.md's top
                    note.) */}
                <div ref={productsAnchorRef}>
                    {/* No ActiveFilters chips row on this page (removed 2026-08-17, direct
                        instruction): the left facet column is the single applied-filter surface
                        here -- selected values render as filled pills sorted to the top of each
                        facet, with per-facet Clear + Reset Filters in DesktopFacetsPanel and a
                        live count on the mobile Filters button. /pokedex keeps its own row. */}
                    <ListingToolbar
                      pending={commerceDataPending}
                      totalEntries={commercePagination.state.totalEntries}
                      query={query}
                      capability={[
                        useListing ? 'commerce-listing' : 'commerce-catalog',
                        'commerce-controllers',
                        'ml-ranking',
                        // The grid reads BOTH indexes and only said so about one. Every tile
                        // below resolves the species it depicts against the Pokédex source and
                        // renders it as the "Pokédex: <name>" line -- the federated claim this
                        // whole app is built on, happening in the most visible place on the page,
                        // and marked nowhere until now. It belongs on this marker rather than on
                        // each tile: one lookup per distinct species (characterQueue batches
                        // them), but 18-50 tiles, and an icon on every one is not a disclosure,
                        // it's a rash.
                        {
                          capability: 'pokedex-index' as const,
                          detailSuffix: 'The “Pokédex:” line on each tile is a second index read — the card comes from the catalog, the species it depicts comes from the Pokédex source.',
                        },
                        ...(!isBrowsing ? (['thesaurus', 'stop-words'] as const) : []),
                        ...(!isBrowsing && hasFeaturedRule(query) ? (['featured-result'] as const) : []),
                      ]}
                      sort={commerceSort}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      pagination={commercePagination}
                      paginationDisabled={isRefetchingCommerce}
                    />

                    {/* The first load and every LATER load (pagination, sort, a facet toggle) both
                        swap the product area alone for a skeleton, fading in either way -- driven
                        by `commerceBusy` rather than raw isLoading, so the whole burst of requests
                        one query can fire (see its definition above) reads as one continuous
                        skeleton phase instead of skeleton/content/skeleton/empty-state flashing in
                        sequence as each intermediate response lands. */}
                    <ProductResultsGrid
                      busy={commerceBusy}
                      skeletonCount={commerceDataPending ? 15 : commercePagination.state.pageSize || 15}
                      products={commerceState.products}
                      viewMode={viewMode}
                      getInteractiveProduct={getInteractiveProduct}
                      pagination={commercePagination}
                      isRefetching={isRefetchingCommerce}
                      // Only when the surface actually in use has failed: while browsing, a broken
                      // Listing is already handled by falling back to Search (see listingUsable), so
                      // the page is only truly unavailable once the controller it settled on errors.
                      unavailable={!!commerceState.error}
                      // The two controllers spell "run it again" differently and the union type has
                      // no shared method, so branch on the same flag that chose the surface.
                      onRetry={() => (useListing ? commerceListing.executeFirstRequest() : commerceSearch.executeFirstSearch())}
                    />
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
