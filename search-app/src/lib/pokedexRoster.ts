import { CONTENT_FIELDS } from '@/contentFields';

export interface RosterEntry {
  name: string;
  number?: number;
  typeList: string[];
}

// One request per generation, cached for the page's lifetime -- SpeciesSelectorRibbon's data
// source. CharacterDetailPage stays mounted across species-to-species moves (evolution line
// links), and those mostly stay within one generation, so the cache means only the first hop
// into a generation ever pays for the request.
const cache = new Map<number, Promise<RosterEntry[]>>();

function splitTypes(raw: unknown): string[] {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.flatMap((v) => String(v).split(';')).map((s) => s.trim()).filter(Boolean);
}

async function fetchRoster(generation: number): Promise<RosterEntry[]> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const res = await fetch(`https://platform.cloud.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: '',
      aq: `@source=="pokedex-push" @${CONTENT_FIELDS.generation}==${generation}`,
      numberOfResults: 250,
      fieldsToInclude: [CONTENT_FIELDS.name, CONTENT_FIELDS.number, CONTENT_FIELDS.type],
    }),
  });
  const data = await res.json();
  const entries: RosterEntry[] = (data.results ?? [])
    .map((r: { raw?: Record<string, unknown> }) => ({
      name: r.raw?.[CONTENT_FIELDS.name] as string,
      number: r.raw?.[CONTENT_FIELDS.number] as number | undefined,
      typeList: splitTypes(r.raw?.[CONTENT_FIELDS.type]),
    }))
    .filter((e: RosterEntry) => e.name);
  entries.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return entries;
}

/** Every species in one generation, dex-number order -- SpeciesSelectorRibbon's quick-switch
 *  list. Real Coveo data, not a hand-authored roster: generation membership and dex numbers
 *  already live in the same pokedex-push documents every other Pokedex surface reads.
 *
 *  Cleared from the cache on a failed/empty fetch (network blip, not "this generation is really
 *  empty") so the next mount retries instead of the ribbon staying silently gone all session --
 *  same discipline as pokedexVocabulary.ts's loadPokedexNames. */
export function loadGenerationRoster(generation: number): Promise<RosterEntry[]> {
  let entry = cache.get(generation);
  if (!entry) {
    entry = fetchRoster(generation).catch(() => [] as RosterEntry[]);
    cache.set(generation, entry);
    entry.then((list) => {
      if (list.length === 0) cache.delete(generation);
    });
  }
  return entry;
}
