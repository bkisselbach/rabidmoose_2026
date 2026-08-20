import { CONTENT_FIELDS } from '@/contentFields';

// Resolving "what beats Flying?" out of the Coveo index rather than out of a hardcoded type chart.
//
// Every Pokedex document carries a multi-value @pokemonweaknesses field. So the answer to "I need
// to counter air pokemon" is already a *facet aggregation*: restrict to @pokemontype=="Flying",
// group by @pokemonweaknesses, and read off the values that dominate. Live, that returns
//
//     Rock(101)  Ice(93)  Electric(90)  |  Fire(24)  Flying(24)  Fairy(20)  ...
//
// over 109 Flying-type species -- the three real counters, then a cliff. The long tail is the
// second typing of dual-type species (a Fire/Flying Charizard drags Water and Rock in), which is
// exactly why this thresholds on share-of-species rather than taking a fixed top 3.
//
// Doing it this way rather than shipping an 18x18 constant is a deliberate call: the answer stays
// correct if the indexed corpus changes, it is derived from the same data RGA grounds its
// explanation on (so the prose and the filter can't disagree), and it demonstrates that a
// domain question a shopper asks in English is often already a facet query in disguise.

/** A weakness has to be shared by at least this share of the type's species to count as a real
 *  counter. Tuned against the live distribution above: the true counters sit at 0.83-0.93 of
 *  species and the dual-type noise floor is at ~0.22, so anything in this range separates them
 *  cleanly without being fitted to one type. */
const DOMINANCE_THRESHOLD = 0.5;

export interface CounterResolution {
  /** The type the shopper wants to beat. */
  target: string;
  /** Types that beat it, strongest (most broadly effective) first. */
  counters: string[];
  /** How many indexed species the aggregation was computed over -- shown in the UI so the claim is
   *  auditable rather than magic. */
  speciesCount: number;
}

const cache = new Map<string, Promise<CounterResolution>>();

async function fetchCounters(target: string): Promise<CounterResolution> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;

  const res = await fetch(`https://platform.cloud.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: '',
      aq: `@source=="pokedex-push" @${CONTENT_FIELDS.type}=="${target}"`,
      numberOfResults: 0,
      // groupBy rather than facets: this is an aggregation for the app's own reasoning, not a
      // refinement surface the user interacts with, so it should never touch facet state.
      groupBy: [{ field: `@${CONTENT_FIELDS.weaknesses}`, maximumNumberOfValues: 18, sortCriteria: 'occurrences' }],
    }),
  });
  if (!res.ok) throw new Error(`weakness lookup failed: ${res.status}`);

  const data = await res.json();
  const speciesCount: number = data.totalCount ?? 0;
  const values: { value: string; numberOfResults: number }[] = data.groupByResults?.[0]?.values ?? [];

  const counters = values
    .filter((v) => speciesCount > 0 && v.numberOfResults / speciesCount >= DOMINANCE_THRESHOLD)
    // Never let a type "counter" itself -- Flying appears in Flying's own weakness aggregation via
    // dual-typed species, and telling a shopper to counter Flying with Flying is nonsense.
    .filter((v) => v.value !== target)
    .map((v) => v.value);

  return { target, counters, speciesCount };
}

/**
 * Types that beat `target`, resolved from the index and cached for the page's lifetime.
 *
 * A failure resolves to an empty counter list rather than rejecting: the caller degrades to
 * searching for the named type itself, which is a worse answer but still a working page.
 */
export function resolveCounters(target: string): Promise<CounterResolution> {
  let pending = cache.get(target);
  if (!pending) {
    pending = fetchCounters(target).catch(() => {
      cache.delete(target); // don't cache a network blip -- the next query retries
      return { target, counters: [], speciesCount: 0 };
    });
    cache.set(target, pending);
  }
  return pending;
}
