import { useEffect, useState } from 'react';
import { CONTENT_FIELDS } from '@/contentFields';

// Live per-type species counts for the home type cards. The home page's catalog request can't
// carry this facet -- pokemontype lives on the pokedex content source, not the commerce catalog,
// and the two engines don't share requests -- so this is one facet-only Search API query
// (numberOfResults: 0) using the same source/token convention as pokedexVocabulary.ts, fetched
// once and cached for the page's lifetime. Counts are display garnish: on failure the type cards
// simply render without them.

interface FacetValue {
  value: string;
  numberOfResults: number;
}

const EMPTY = new Map<string, number>();
let cached: Promise<Map<string, number>> | null = null;

async function fetchTypeCounts(): Promise<Map<string, number>> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const res = await fetch(`https://platform.cloud.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: '',
      aq: '@source=="pokedex-push"',
      numberOfResults: 0,
      facets: [{ facetId: CONTENT_FIELDS.type, field: CONTENT_FIELDS.type, numberOfValues: 24 }],
    }),
  });
  if (!res.ok) throw new Error(`pokemontype facet ${res.status}`);
  const data = await res.json();
  const values: FacetValue[] =
    (data.facets as Array<{ facetId: string; values: FacetValue[] }> | undefined)?.find(
      (f) => f.facetId === CONTENT_FIELDS.type,
    )?.values ?? [];
  const map = new Map<string, number>();
  for (const v of values) {
    // keyed lowercase so callers match regardless of the index's value casing
    if (typeof v.value === 'string' && typeof v.numberOfResults === 'number') {
      map.set(v.value.toLowerCase(), v.numberOfResults);
    }
  }
  return map;
}

/** Lowercase-type-keyed species counts, shared via one module-level fetch. Empty until loaded;
 *  a failed fetch resets the cache so the next mount retries instead of pinning the failure. */
export function useTypeCounts(): Map<string, number> {
  const [map, setMap] = useState(EMPTY);
  useEffect(() => {
    let alive = true;
    if (!cached) {
      cached = fetchTypeCounts().catch(() => {
        cached = null;
        return EMPTY;
      });
    }
    cached.then((m) => {
      if (alive && m.size > 0) setMap(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return map;
}
