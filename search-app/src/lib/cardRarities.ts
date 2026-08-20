// The catalog's actual `cardrarity` vocabulary, fetched once and cached for the page's lifetime.
//
// Needed because a shopper's rarity word is looser than the field: "rare" legitimately means Rare,
// Rare Holo, Ultra Rare, Secret Rare, Illustration rare, Double rare, Rare Holo LV.X and more, and
// that ladder is set-dependent -- it is not a list worth freezing in source. Same one-request
// groupBy pattern (and the same graceful-degradation contract) as localSuggestions.ts, which
// already reads this exact field for the typeahead vocabulary.

let cached: Promise<string[]> | null = null;

async function fetchRarities(): Promise<string[]> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const res = await fetch(`https://platform.cloud.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: '',
      numberOfResults: 0,
      groupBy: [{ field: '@cardrarity', maximumNumberOfValues: 100, sortCriteria: 'occurrences' }],
    }),
  });
  if (!res.ok) throw new Error(`rarity vocabulary fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.groupByResults?.[0]?.values ?? [])
    .map((v: { value: string }) => v.value)
    .filter((v: string) => typeof v === 'string' && v.length > 0);
}

/** The full rarity vocabulary. A failure resolves to [] and is not cached, so the next query
 *  retries rather than the whole session running without it. */
export function loadCardRarities(): Promise<string[]> {
  if (!cached) {
    cached = fetchRarities().catch(() => {
      cached = null;
      return [] as string[];
    });
  }
  return cached;
}

/** One shopper word and the concrete `cardrarity` values it actually matched. Kept per-term rather
 *  than pre-flattened so the UI can name only the words that genuinely became filters -- a word
 *  that matched nothing must not be drawn as an active filter. */
export interface RarityResolution {
  term: string;
  values: string[];
}

/** Word-boundary, case-insensitive -- deliberately NOT a substring test. Plain `includes` made
 *  "common" match "Uncommon", so "show me common cards" quietly filtered to Common *and* Uncommon,
 *  i.e. the exact opposite of what was asked. Boundaries keep the loose matching that earns its
 *  keep ("rare" still selects the whole Rare ladder, "holo" every holo tier) while refusing to
 *  match a word that merely ends another one. */
function matchesTerm(label: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(label);
}

/** Resolves each of the shopper's rarity words against the live catalog vocabulary. A word that
 *  matches nothing comes back with empty `values` rather than being dropped, so callers can tell
 *  "matched nothing" apart from "was never asked" -- the distinction the banner needs to stay
 *  honest when the vocabulary fetch fails and every term resolves to nothing. */
export async function resolveRarityTerms(terms: string[]): Promise<RarityResolution[]> {
  if (terms.length === 0) return [];
  const vocabulary = await loadCardRarities();
  return terms.map((term) => ({
    term,
    values: vocabulary.filter((value) => matchesTerm(value, term)),
  }));
}
