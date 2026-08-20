import { editDistance } from '@/lib/fuzzyMatch';
import { normalizeForMatch } from '@/lib/utils';
import { loadPokedexNames } from '@/lib/pokedexVocabulary';

// Re-exported so the search box keeps one import site; the definition lives in utils.ts.
export { normalizeForMatch };

// Client-side typeahead vocabulary + ranking. The org's Predictive Query Suggestions model
// currently returns zero completions (ONLINE_DEGRADED, next retrain 2026-08-19), so the search
// box needs a deterministic local source: Pokédex species names, card set names, rarities, and
// energy/card types. When the ML model comes back, its suggestions rank first and this list
// only fills the remaining slots -- see buildTypeaheadItems below.

export interface TypeaheadItem {
  text: string;
  /** 'coveo' = server PQS suggestion (real ML capability); 'local' = this module. The demo-mode
   *  provenance chips key off this, so a purely local dropdown never wears the ML chip. */
  source: 'coveo' | 'local';
}

/** Curated defaults for the focused-but-empty state, shown under "Popular" next to recent
 *  searches. First three mirror HeroSearch's scripted example chips so the demo story stays
 *  consistent wherever a visitor starts typing. */
export const POPULAR_QUERIES = ['Base Set Charizard', 'rare holo', 'electric mouse', 'Pikachu'];

// TCG energy types (the `cardtypes` field) plus two of the three card kinds -- small, stable
// lists not worth a network round-trip. "Pokemon" is deliberately absent: it's a stop word on
// the commerce pipeline (every document here is a Pokemon card), so suggesting it would offer a
// query the server immediately discards.
const STATIC_VOCABULARY = [
  'Fire',
  'Water',
  'Grass',
  'Lightning',
  'Psychic',
  'Fighting',
  'Colorless',
  'Darkness',
  'Metal',
  'Dragon',
  'Fairy',
  'Trainer',
  'Energy',
];

// Mirrors the query-pipeline thesaurus rules (Admin -> Query Pipelines -> Search terms ->
// Synonyms), so the dropdown speaks the same language as the search it leads to: the server
// expands "electric" to Lightning-type matches on submit, so the typeahead should surface
// "Lightning" while the user is still typing "electric". There is no API our keys can read the
// rules from, so keep this table in sync with the Admin Console by hand.
const SYNONYM_GROUPS: string[][] = [
  ['electric', 'lightning'],
  ['dark', 'darkness'],
  ['steel', 'metal'],
  ['holo', 'holofoil', 'holographic'],
  ['1st edition', 'first edition', '1st ed'],
];

/** Alias terms worth ranking for this query: the query names (or is a >=4-char prefix of) a
 *  synonym-group member, and the alias isn't something direct prefix matching already covers. */
function aliasQueriesFor(normQuery: string): string[] {
  const aliases: string[] = [];
  for (const group of SYNONYM_GROUPS) {
    const hit = group.some((term) => term === normQuery || (normQuery.length >= 4 && term.startsWith(normQuery)));
    if (!hit) continue;
    for (const term of group) {
      if (!term.startsWith(normQuery)) aliases.push(term);
    }
  }
  return aliases;
}


// Set names + rarities actually present in the catalog, via one group-by request -- same
// endpoint/token convention as pokedexVocabulary.ts. Both fields are facet-enabled (they back
// the /search facets), which is what makes them group-by-able. Failure degrades to [] so a
// network hiccup can never block typing.
async function fetchCatalogFieldValues(): Promise<string[]> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const res = await fetch(`https://platform.cloud.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: '',
      numberOfResults: 0,
      groupBy: [
        { field: '@cardsetname', maximumNumberOfValues: 50 },
        { field: '@cardrarity', maximumNumberOfValues: 50 },
      ],
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const values: string[] = [];
  for (const group of data.groupByResults ?? []) {
    for (const entry of group.values ?? []) {
      if (typeof entry.value === 'string' && entry.value) values.push(entry.value);
    }
  }
  return values;
}

let cachedVocabulary: Promise<string[]> | null = null;

/** The full suggestion vocabulary (~1,100 entries), fetched once and cached for the page's
 *  lifetime. Warmed on first search-box focus rather than module load so the home page doesn't
 *  pay for it eagerly. A fetch that comes back with only the static list (network blip at first
 *  focus) is NOT cached, so the next focus retries instead of stranding the session with a
 *  gutted vocabulary. */
export function loadVocabulary(): Promise<string[]> {
  if (!cachedVocabulary) {
    cachedVocabulary = Promise.all([loadPokedexNames(), fetchCatalogFieldValues().catch(() => [])]).then(
      ([names, fieldValues]) => {
        if (names.length === 0 && fieldValues.length === 0) cachedVocabulary = null;
        const seen = new Set<string>();
        const merged: string[] = [];
        for (const value of [...names, ...fieldValues, ...STATIC_VOCABULARY]) {
          const key = normalizeForMatch(value);
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(value);
        }
        return merged;
      }
    );
  }
  return cachedVocabulary;
}

// Exact-match ranking: whole-string prefix beats word-boundary prefix ("base" -> "Base Set")
// beats substring, alphabetical within each tier so the order is stable while typing. Returned
// tiered so the caller can slot thesaurus-alias matches between prefix and the weaker tiers.
function rankExactMatches(normQuery: string, vocabulary: string[]) {
  const prefix: string[] = [];
  const wordPrefix: string[] = [];
  const substring: string[] = [];
  for (const candidate of vocabulary) {
    const norm = normalizeForMatch(candidate);
    const index = norm.indexOf(normQuery);
    if (index === -1) continue;
    if (index === 0) prefix.push(candidate);
    else if (norm[index - 1] === ' ') wordPrefix.push(candidate);
    else substring.push(candidate);
  }
  for (const tier of [prefix, wordPrefix, substring]) tier.sort((a, b) => a.localeCompare(b));
  return { prefix, wordPrefix, substring };
}

/** How many synonym-driven rows may join the list -- they support the query, not answer it. */
const ALIAS_MAX_RESULTS = 3;

const FUZZY_MIN_QUERY_LENGTH = 4; // Same floor as FuzzyDidYouMean -- below this, fuzzy matches are mostly noise.
const FUZZY_MAX_RESULTS = 3;

function rankFuzzyMatches(query: string, vocabulary: string[]): string[] {
  if (query.length < FUZZY_MIN_QUERY_LENGTH) return [];
  // Error budget scales with length: a 2-char repair of a 4-letter word is a different word,
  // not a typo ("fire" -> "five"), while 2 errors in "charmandre" is clearly Charmander.
  const maxDistance = query.length >= 7 ? 2 : 1;
  const scored: { candidate: string; dist: number }[] = [];
  for (const candidate of vocabulary) {
    const dist = editDistance(query, candidate);
    if (dist > 0 && dist <= maxDistance) scored.push({ candidate, dist });
  }
  scored.sort((a, b) => a.dist - b.dist || a.candidate.localeCompare(b.candidate));
  return scored.slice(0, FUZZY_MAX_RESULTS).map((s) => s.candidate);
}

/** How many composed last-token completions may join the list. */
const LAST_TOKEN_MAX_RESULTS = 3;

/**
 * The merged suggestion list the dropdown renders.
 *
 * Policy: server PQS suggestions first in server order (when the ML model recovers it visibly
 * takes over), local exact matches fill the remaining slots (deduped against the server rows),
 * and fuzzy candidates (edit distance <= 2) appear only when that combined list is empty --
 * they're typo repair, not completions, and shouldn't outrank real matches.
 *
 * Thesaurus aliases (mirroring the pipeline rules) rank between the prefix tier and the weaker
 * exact tiers: typing "electric" puts "Lightning" right under any Electr...-prefixed species,
 * matching what the server-side expansion will do to the submitted query.
 */
export function buildTypeaheadItems(
  query: string,
  serverSuggestions: string[],
  vocabulary: string[],
  max: number
): TypeaheadItem[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // Collapse runs of whitespace so "base   set" matches like "base set".
  const normQuery = normalizeForMatch(trimmed).replace(/\s+/g, ' ');

  const items: TypeaheadItem[] = [];
  const seen = new Set<string>();
  const push = (text: string, source: TypeaheadItem['source']) => {
    const key = normalizeForMatch(text);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ text, source });
  };

  for (const suggestion of serverSuggestions.slice(0, max)) push(suggestion, 'coveo');

  const direct = rankExactMatches(normQuery, vocabulary);
  const aliasMatches = aliasQueriesFor(normQuery)
    .flatMap((alias) => {
      const tiers = rankExactMatches(normalizeForMatch(alias), vocabulary);
      return [...tiers.prefix, ...tiers.wordPrefix];
    })
    .slice(0, ALIAS_MAX_RESULTS);

  for (const match of [...direct.prefix, ...aliasMatches, ...direct.wordPrefix, ...direct.substring]) {
    if (items.length >= max) break;
    push(match, 'local');
  }

  // Multi-word query and nothing matched it as a whole: treat the last token as the word still
  // being typed and complete it in place -- "base set char" -> "base set Charizard", including
  // a typo'd last word ("base set charzard"). The vocabulary holds single terms, so this is the
  // only way multi-word queries ever get completions.
  if (items.length === 0) {
    const tokens = normQuery.split(' ');
    if (tokens.length >= 2) {
      const lastToken = tokens[tokens.length - 1];
      const head = trimmed.split(/\s+/).slice(0, -1).join(' ');
      let completions = lastToken.length >= 2 ? rankExactMatches(lastToken, vocabulary).prefix : [];
      if (completions.length === 0) completions = rankFuzzyMatches(lastToken, vocabulary);
      for (const completion of completions.slice(0, LAST_TOKEN_MAX_RESULTS)) {
        push(`${head} ${completion}`, 'local');
      }
    }
  }

  // Whole-string typo repair, last resort: only when nothing above produced a row.
  if (items.length === 0) {
    for (const match of rankFuzzyMatches(trimmed, vocabulary)) push(match, 'local');
  }
  return items.slice(0, max);
}
