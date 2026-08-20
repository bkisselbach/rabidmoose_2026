import { useEffect, useState } from 'react';
import {
  commerceListing,
  commerceSearch,
  contentGenerationFacet,
  contentQuerySummary,
  contentResultList,
  contentTypeFacet,
} from '@/searchResultsControllers';

/**
 * The six controller subscriptions that feed `SearchResultsPage`, and the state they write.
 *
 * Item 38, first unit. This is the part of that page that is genuinely mechanical: eight pieces of
 * state, six `subscribe` effects that write them, and no reader of any setter outside this block --
 * verified before the move, and the reason this unit could go without touching behaviour at all.
 * Every effect here takes `[]`, subscribes once and returns its unsubscribe, so nothing in it
 * participates in the ordering that the rest of that page's effects encode.
 *
 * WHAT DELIBERATELY DID NOT COME WITH IT, because item 38 is mostly a warning about exactly this:
 * the URL-sync pair, the query submit, the conversational derived-facet write and its reconcile,
 * the listing fallback and the preset appliers all stayed. Their interdependencies encode four
 * separately measured live failures -- the derived-facet reconcile (facets landed 6 of 11 values
 * when applied through `toggleSelect`), item 34's cold-load rail race, the atomic-write ordering
 * and item 35's zero-result state. Those are ordering bugs by nature, and a hook boundary is a
 * place where ordering is easy to change by accident and hard to notice. They move as a unit or
 * not at all.
 *
 * THE REVISION COUNTERS ARE NOT REDUNDANT. They are bumped on every controller notification
 * regardless of whether `isLoading` changed, because on this page `isLoading` can stay false across
 * TWO different requests' fulfilled actions landing back to back (one overwriting the other's
 * results) -- watching `isLoading` alone misses the second entirely. `useSettledLoading` consumes
 * them; see its own comment.
 */
export function useSearchResultsState() {
  const [contentState, setContentState] = useState(contentResultList.state);
  const [contentTotal, setContentTotal] = useState(contentQuerySummary.state.total);
  const [contentTypeFacetState, setContentTypeFacetState] = useState(contentTypeFacet.state);
  const [contentGenerationFacetState, setContentGenerationFacetState] = useState(
    contentGenerationFacet.state
  );
  const [commerceSearchState, setCommerceSearchState] = useState(commerceSearch.state);
  const [commerceListingState, setCommerceListingState] = useState(commerceListing.state);
  const [commerceRevision, setCommerceRevision] = useState(0);
  const [contentRevision, setContentRevision] = useState(0);

  useEffect(
    () =>
      contentResultList.subscribe(() => {
        setContentState(contentResultList.state);
        setContentRevision((n) => n + 1);
      }),
    []
  );
  useEffect(() => contentQuerySummary.subscribe(() => setContentTotal(contentQuerySummary.state.total)), []);
  useEffect(() => contentTypeFacet.subscribe(() => setContentTypeFacetState(contentTypeFacet.state)), []);
  useEffect(
    () => contentGenerationFacet.subscribe(() => setContentGenerationFacetState(contentGenerationFacet.state)),
    []
  );
  useEffect(
    () =>
      commerceSearch.subscribe(() => {
        setCommerceSearchState(commerceSearch.state);
        setCommerceRevision((n) => n + 1);
      }),
    []
  );
  useEffect(
    () =>
      commerceListing.subscribe(() => {
        setCommerceListingState(commerceListing.state);
        setCommerceRevision((n) => n + 1);
      }),
    []
  );

  return {
    contentState,
    contentTotal,
    contentTypeFacetState,
    contentGenerationFacetState,
    commerceSearchState,
    commerceListingState,
    commerceRevision,
    contentRevision,
  };
}
