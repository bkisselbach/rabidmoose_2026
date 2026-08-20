import { getVisitorId } from '@/lib/visitorId';

export interface TopCard {
  id: string;
  name: string;
  setName?: string;
  price?: number;
  promoPrice?: number;
  image?: string;
}

// The home page's "most valuable cards in the index" read, used by both the hero's flanking card
// scans and the market ticker. Memoized at module scope so those two surfaces cost one request
// between them, not two.
//
// Sorted server-side: the Commerce Search API takes `sort: { sortCriteria: 'fields', fields: [...] }`,
// so the top of this list really is the most expensive stock in the catalog rather than the first
// page re-ordered client-side. (Verified against the live API -- the unsorted request opens with a
// $0.11 common; sorted, it opens above $2,300.)
let pending: Promise<TopCard[]> | null = null;

export function fetchTopCards(count = 24): Promise<TopCard[]> {
  if (pending) return pending;

  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const trackingId = import.meta.env.VITE_COVEO_TRACKING_ID || 'pokemon-catalog';

  pending = fetch(`https://platform.cloud.coveo.com/rest/organizations/${organizationId}/commerce/v2/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trackingId,
      clientId: getVisitorId(),
      context: { view: { url: window.location.href }, capture: false, cart: [] },
      language: 'en',
      country: 'US',
      currency: 'USD',
      query: '',
      perPage: count,
      sort: { sortCriteria: 'fields', fields: [{ field: 'ec_price', direction: 'desc' }] },
    }),
  })
    .then((res) => res.json())
    .then((data) =>
      (data.products ?? []).map(
        (p: Record<string, unknown>): TopCard => ({
          id: (p.ec_product_id as string) ?? (p.permanentid as string),
          name: (p.ec_name as string) ?? '',
          setName: (p.additionalFields as Record<string, unknown> | undefined)?.cardsetname as string | undefined,
          price: (p.ec_price as number | null) ?? undefined,
          promoPrice: (p.ec_promo_price as number | null) ?? undefined,
          image: (p.ec_images as string[] | undefined)?.[0],
        })
      )
    )
    .catch(() => {
      // Let a later mount retry rather than caching the failure for the session.
      pending = null;
      return [] as TopCard[];
    });

  return pending;
}

/**
 * The priciest cards filed under one of `cardTypes` -- the hero's flanking scans use it to answer
 * whatever the Card Consultant has just resolved to.
 *
 * Same request shape as `fetchTopCards` (including `capture: false`, so browsing the hero never
 * writes behavioural events), with the energy types carried as a facet selection rather than query
 * text. That is the same reason `useQueryUnderstanding` documents for the results page: several
 * types have to OR together, and multi-select within one facet IS an OR, whereas query terms AND
 * and would return nothing.
 *
 * Not memoized -- the type set changes with the consultation, so a per-call fetch is the point.
 * Failure resolves to [] so the caller simply keeps whatever it was already showing.
 */
export function fetchTopCardsByType(cardTypes: string[], count = 4): Promise<TopCard[]> {
  if (cardTypes.length === 0) return Promise.resolve([]);

  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const trackingId = import.meta.env.VITE_COVEO_TRACKING_ID || 'pokemon-catalog';

  return fetch(`https://platform.cloud.coveo.com/rest/organizations/${organizationId}/commerce/v2/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trackingId,
      clientId: getVisitorId(),
      context: { view: { url: window.location.href }, capture: false, cart: [] },
      language: 'en',
      country: 'US',
      currency: 'USD',
      query: '',
      perPage: count,
      facets: [{ facetId: 'cardtypes', field: 'cardtypes', type: 'regular', values: cardTypes.map((value) => ({ value, state: 'selected' })) }],
      sort: { sortCriteria: 'fields', fields: [{ field: 'ec_price', direction: 'desc' }] },
    }),
  })
    .then((res) => res.json())
    .then((data) =>
      (data.products ?? []).map(
        (p: Record<string, unknown>): TopCard => ({
          id: (p.ec_product_id as string) ?? (p.permanentid as string),
          name: (p.ec_name as string) ?? '',
          setName: (p.additionalFields as Record<string, unknown> | undefined)?.cardsetname as string | undefined,
          price: (p.ec_price as number | null) ?? undefined,
          promoPrice: (p.ec_promo_price as number | null) ?? undefined,
          image: (p.ec_images as string[] | undefined)?.[0],
        })
      )
    )
    .catch(() => [] as TopCard[]);
}
