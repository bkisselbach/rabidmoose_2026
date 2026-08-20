import type { Product } from '@coveo/headless/commerce';
import { getVisitorId } from '@/lib/visitorId';

// Phase B of deck-builder-advisor-plan.md: turns the Advisor's already-computed gaps (a weakness
// shared by the deck, an evolution stage the deck is missing) into real, buyable product tiles
// instead of a click-through link. Pure recombination of pieces that already exist and are
// already proven correct -- no new Coveo capability, no new index field.
//
// QUERY SHAPE, deliberately reused rather than reinvented: this is exactly the free-text query
// DeckCheckPage's own `counterQueryFor` already builds for the "Find cards that counter it" link
// (e.g. "Beat Electric types under $25") -- the same sentence /search's query understanding
// resolves into a @cardtypes filter today. Fetching it here server-side, instead of only linking
// to it, is the only thing that changes; the resolution itself is not new.
//
// Same per-query commerce search shape fetchProductsByIds.ts uses, because that file's own note
// still applies here: commerce free-text ANDs its terms, so this can only be one query string, not
// a list of ids -- there is nothing to fetch "by weakness" directly, only by re-running the same
// query a shopper would have typed.

async function fetchByQuery(query: string, limit: number): Promise<Product[]> {
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
          clientId: getVisitorId(),
          // capture: false -- these are suggestion reads, not the shopper's own search; they must
          // not be attributed to them as a real query the way /search's own request is.
          context: { view: { url: window.location.href }, capture: false, cart: [] },
          language: 'en',
          country: 'US',
          currency: 'USD',
          query,
          perPage: limit,
        }),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.products ?? []) as Product[];
  } catch {
    return [];
  }
}

export interface GapSuggestion {
  /** What this gap is, for the section heading -- a weakness type name or a missing evolution
   *  stage's own name. */
  label: string;
  /** The exact query these products were resolved from, so a "see more" link stays honest about
   *  what it will re-run. */
  query: string;
  products: Product[];
}

const MAX_PER_GAP = 4;

/** Resolves one gap (a weakness to counter, or a missing evolution stage to pick up) into real,
 *  buyable products via the same query the existing text link already sends the shopper to. */
export async function resolveGapSuggestion(label: string, query: string): Promise<GapSuggestion> {
  const products = await fetchByQuery(query, MAX_PER_GAP);
  return { label, query, products };
}
