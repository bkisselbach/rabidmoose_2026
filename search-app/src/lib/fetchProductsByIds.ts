import type { Product } from '@coveo/headless/commerce';
import { getVisitorId } from '@/lib/visitorId';

// Shared by any surface that needs full Coveo product data (price, badges, and -- the reason this
// exists -- `additionalFields`) for a small, known set of ids: RecentlyViewedRow's local trail,
// and TrendingSpotlightRow borrowing real fields onto Recommendations-slot products (see
// cardFields.ts / useProductCardData.ts -- the Recommendations API always returns
// `additionalFields: {}`, with no configuration endpoint to fix it).
//
// One request PER id, which looks wasteful and isn't avoidable: commerce free-text ANDs its
// terms, so asking for "base1-2 sv03.5-199 base1-4" in a single query is a nonsense query --
// measured, it matched one of the three ids and filled the rest of the response with relevance
// noise. There is no product-id filter on the commerce search request to use instead. The same
// per-id lookup the PDP itself does.

async function fetchProductById(id: string): Promise<Product | null> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const trackingId = import.meta.env.VITE_COVEO_TRACKING_ID || 'pokemon-catalog';

  try {
    const res = await fetch(
      `https://platform.cloud.coveo.com/rest/organizations/${organizationId}/commerce/v2/search`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingId,
          // capture: false -- re-rendering a product the shopper already saw elsewhere on the page
          // is not a new search, and must not pollute the behavioral signal that trains the real
          // models.
          clientId: getVisitorId(),
          context: { view: { url: window.location.href }, capture: false, cart: [] },
          language: 'en',
          country: 'US',
          currency: 'USD',
          query: id,
          perPage: 10,
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // The id is a query here, not a filter, so the exact match has to be picked out of the
    // response rather than assumed to be first.
    return (data.products ?? []).find((p: Product) => p.ec_product_id === id) ?? null;
  } catch {
    return null;
  }
}

/** Resolves a list of ids to full Coveo `Product`s, dropping any that no longer exist and
 *  preserving the caller's own ordering (Promise.all keeps array order regardless of which
 *  request settles first). */
export async function fetchProductsByIds(ids: string[]): Promise<Product[]> {
  const found = await Promise.all(ids.map(fetchProductById));
  return found.filter((p): p is Product => p !== null);
}
