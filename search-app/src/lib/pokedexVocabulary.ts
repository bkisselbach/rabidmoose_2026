import { CONTENT_FIELDS } from '@/contentFields';

// Full list of Pokedex species names, fetched once and cached for the page's lifetime -- the
// match vocabulary for FuzzyDidYouMean.tsx. Same source/endpoint convention as
// characterQueue.ts, just paginated across the whole source instead of one exact-name lookup.
let cached: Promise<string[]> | null = null;

async function fetchAll(): Promise<string[]> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const pageSize = 500;
  const names = new Set<string>();

  for (let firstResult = 0; ; firstResult += pageSize) {
    const res = await fetch(`https://platform.cloud.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: '',
        aq: '@source=="pokedex-push"',
        numberOfResults: pageSize,
        firstResult,
        fieldsToInclude: [CONTENT_FIELDS.name],
      }),
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const result of data.results ?? []) {
      const name = result.raw?.[CONTENT_FIELDS.name];
      if (typeof name === 'string' && name) names.add(name);
    }
    if (firstResult + pageSize >= (data.totalCount ?? 0)) break;
  }
  return [...names];
}

/** Lazily fetches and caches the full Pokedex species name list -- only called once a search
 *  actually needs it. An empty result (network failure) is returned but not cached, so the next
 *  caller retries instead of the whole session running without a vocabulary. */
export function loadPokedexNames(): Promise<string[]> {
  if (!cached) {
    cached = fetchAll()
      .catch(() => [] as string[])
      .then((names) => {
        if (names.length === 0) cached = null;
        return names;
      });
  }
  return cached;
}
