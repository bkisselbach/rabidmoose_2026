import { CONTENT_FIELDS } from '@/contentFields';
import { toPokemonRecord, type PokemonRecord } from '@/lib/pokedexRecord';

// "Cache by key, notify every listener" -- the same shape as badgeQueue.ts, with one deliberate
// divergence recorded at the bottom of this comment. A search results grid or rail can mount dozens
// of ProductCards at once, several of which often resolve to the same species (different prints of
// the same Pokemon), so this de-dupes by name and reuses one answer for every card asking.
//
// ONE REQUEST FOR THE WHOLE GRID (item 31a, 2026-08-19). Until this pass the unit of work was one
// species: each distinct name got its own `@pokemonname=="X"` call, serialized behind a single
// promise chain with a 120ms gap between them. Measured on a cold /search load, that was **23
// calls whose last response landed 6,734 ms after navigation** -- and it is the card TITLE that
// waits on them, because 2026-08-17 replaced the product name on the tile face with the Pokedex
// line. So a grid spent the better part of seven seconds filling in its own headings.
//
// The fix is not to loosen the queue but to widen the request: `aq` takes a value LIST, so every
// pending name goes out in one query. A/B'd against the live index before the rewrite:
//
//     18 names, serialized + 120ms spacing:  5,421 ms
//     18 names, one batched query:             172 ms   (200, 18 of 18 records returned)
//
// 31x, and the 429s that motivated the spacing cannot happen at all now -- there is no burst to
// rate-limit. `SPACING_MS` is therefore gone rather than retuned: its own comment tied it
// explicitly to "the burst rate a full grid produces (one call per distinct species)", and that
// premise no longer holds. The serialization stays, so the file keeps its "one request in flight"
// property, but it is now serializing two or three batches instead of twenty-three singles.
//
// A FAILED REQUEST IS NOT A MISS (fixed 2026-08-17, preserved here at batch granularity). Until
// that pass, any non-200 fell through the same path as a genuine "no such species": the response
// body has no `results` key, so `raw` came out undefined and the name was cached as `null` --
// permanently, and with `requested` still set so it could never be retried. One blip poisoned that
// species for the rest of the session.
//
// It was not hypothetical. Instrumented on a single home-page load: 12 species lookups went out and
// 3 came back **429**, so Shiftry and Stonjourner V rendered as "no species" on one load and
// resolved fine on the next. That intermittency was invisible until the card layout changed to swap
// the product name FOR the Pokedex line -- at which point a poisoned lookup was the difference
// between a tile showing "POKEDEX: SHIFTRY" and the tile beside it showing "Shiftry", which is
// exactly the mixed grid the user reported.
//
// So: `res.ok` is checked so a 429 raises instead of masquerading as an empty result; a failure is
// retried with backoff; and if it still fails, the names are neither cached nor left locked, so the
// next component to mount tries again. Listeners are told `null` so nothing hangs in a loading
// state -- but that null is deliberately NOT written to the cache, which is the whole distinction.
// Batching moves all of that from one name to one batch and changes nothing else about it.
//
// WHERE THIS NOW DIFFERS FROM badgeQueue.ts, and why that file must NOT copy this one: the badges
// API takes a single `productId` in its request `context` (checked in the SDK source --
// `buildProductEnrichmentBadgesRequest`), so it has no batch shape to widen into, and its
// serialization is a hard SDK constraint rather than a rate-limit courtesy
// (`buildProductEnrichment` reads and writes one global slice on the shared engine, so concurrent
// instances clobber each other). Its lever is how many products ask -- see item 31d.
const cache = new Map<string, PokemonRecord | null>();
const requested = new Set<string>();
const listeners = new Map<string, Set<(record: PokemonRecord | null) => void>>();
let queue: Promise<void> = Promise.resolve();

const RETRIES = 3;
const RETRY_BASE_MS = 400;

// How long to keep collecting names before sending a batch. One animation frame: React mounts a
// whole grid in a single commit and `useCharacterLookup`'s effects all fire in that commit's effect
// pass, so every tile's name is already pending by the time this fires. It is a window rather than
// a microtask because a page's names do not all arrive together -- /search's commerce grid and its
// Pokedex rail resolve off two different responses -- and a window that spans a frame catches each
// group whole instead of splitting one grid across two requests. Two or three batches per page is
// the expected shape, not one.
const BATCH_WINDOW_MS = 16;

// Names per request. Well above any real grid (the measured page wanted 23), so this is a guard on
// `aq` length rather than a working limit; anything beyond it simply goes out as a second batch.
const MAX_BATCH = 50;

let pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function emit(name: string, record: PokemonRecord | null) {
  listeners.get(name)?.forEach((callback) => callback(record));
}

/** Tell every subscriber AND remember the answer -- only ever called with a real answer from the
 *  index, never with a failure. */
function settle(name: string, record: PokemonRecord | null) {
  cache.set(name, record);
  emit(name, record);
}

/** `aq` is a query-expression string, so a name carrying a quote or a backslash would otherwise end
 *  the value early and corrupt every name after it in the same batch. The single-name version could
 *  only ever corrupt its own lookup; batching makes one bad name everyone else's problem, which is
 *  why this exists now and did not before. Nothing in the National Dex needs it today -- it is here
 *  so that `extractPokemonName` handing back something unexpected degrades to one wrong lookup
 *  rather than one wrong request. */
const escapeForQueryExpression = (name: string) => name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** One attempt at one batch. Throws on transport failure or any non-2xx, so the caller can tell
 *  those apart from a successful search that simply matched nothing -- the distinction the
 *  2026-08-17 fix turns on. Returns a record (or null for "the index has no such species") for
 *  every name asked about, so the caller never has to reason about partial responses. */
async function lookupBatch(names: string[]): Promise<Map<string, PokemonRecord | null>> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const values = names.map((name) => `"${escapeForQueryExpression(name)}"`).join(',');
  const res = await fetch(`https://platform.cloud.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    // `@field==("a","b")` is the value-list form of the same exact match the single-name version
    // sent. `numberOfResults` is exactly the batch size: the names are distinct and the index holds
    // one document per species, so one result per name is the whole response.
    body: JSON.stringify({
      q: '',
      aq: `@${CONTENT_FIELDS.name}==(${values})`,
      numberOfResults: names.length,
    }),
  });
  if (!res.ok) throw new Error(`Coveo Search ${res.status} for ${names.length} name(s)`);
  const data = await res.json();

  // Index the response by name so it can be matched back to what was asked for. Case-insensitively,
  // because the request matched on the index's own casing rules and the caller's name comes from
  // `extractPokemonName` parsing a product title -- the two agreeing exactly is not something to
  // depend on when the cost of being wrong is a silently missing title.
  const byName = new Map<string, Record<string, unknown>>();
  for (const result of (data.results ?? []) as { raw?: Record<string, unknown> }[]) {
    const raw = result.raw;
    const indexed = raw?.[CONTENT_FIELDS.name];
    if (raw && typeof indexed === 'string') byName.set(indexed.toLowerCase(), raw);
  }

  const resolved = new Map<string, PokemonRecord | null>();
  for (const name of names) {
    const raw = byName.get(name.toLowerCase());
    // The requested name is still what's handed to `toPokemonRecord` as the fallback, exactly as
    // the single-name version did -- the record keeps the index's own `characterName` when it has
    // one, and the caller's guess only fills in when it doesn't.
    resolved.set(name, raw ? toPokemonRecord(raw, name) : null);
  }
  return resolved;
}

function enqueueBatch(names: string[]) {
  queue = queue.then(async () => {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const resolved = await lookupBatch(names);
        // A name absent from a SUCCESSFUL response is a genuine miss (no such species), so it is
        // cached as null like any other answer. Only a failed request is left uncached, below.
        for (const name of names) settle(name, resolved.get(name) ?? null);
        return;
      } catch {
        if (attempt < RETRIES) await wait(RETRY_BASE_MS * (attempt + 1));
      }
    }
    // Out of attempts. Release the locks and leave the cache alone so a later mount can retry the
    // whole batch; subscribers get null now so their cards render their own name instead of waiting
    // forever. Per name, exactly as before -- the batch is how they were fetched, not a unit
    // anything downstream knows about.
    for (const name of names) {
      requested.delete(name);
      emit(name, null);
    }
  });
}

function flush() {
  flushTimer = undefined;
  const names = pending;
  pending = [];
  for (let i = 0; i < names.length; i += MAX_BATCH) enqueueBatch(names.slice(i, i + MAX_BATCH));
}

/** Subscribes to the Pokedex record for one species name, kicking off a batched fetch on first
 *  request. Unchanged signature and unchanged contract -- every caller predates the batching and
 *  none of them needed to know about it. */
export function subscribeToCharacter(name: string, callback: (record: PokemonRecord | null) => void): () => void {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(callback);

  if (cache.has(name)) {
    callback(cache.get(name) ?? null);
  } else if (!requested.has(name)) {
    requested.add(name);
    pending.push(name);
    if (flushTimer === undefined) flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
  }

  return () => listeners.get(name)?.delete(callback);
}
