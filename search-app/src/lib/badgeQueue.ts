import { buildProductEnrichment } from '@coveo/headless/commerce';
import type { Badge } from '@coveo/headless/commerce';
import { commerceEngine } from '@/commerceEngine';

const placementIds = (import.meta.env.VITE_COVEO_ENRICHMENT_PLACEMENT_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// buildProductEnrichment reads/writes a single global slice on the shared engine (confirmed in
// the SDK source: `get state() { return getState().productEnrichment; }`) -- there's no
// per-controller partitioning, so building many instances concurrently for a grid makes them
// clobber each other's results. This module is the one place badge lookups happen: it serializes
// every request through a single promise chain (one full request/response cycle before the next
// starts) and caches by productId so a product that reappears -- pagination, the same card in a
// recommendation rail -- doesn't re-fetch.
// EVERY badge in the placement, not just the first (2026-08-17). This used to read
// `badgePlacements[0]?.badges[0]`, so a product could only ever show one badge -- while
// `demo-capabilities-map.md` promises "stacked Vintage + High Value" on a Base-era holo over $100,
// and the demo script's beat 7 expects both rules to fire on Base Set Charizard. No document
// recorded the limitation; the beat simply could not have worked. Placements are flattened because
// this app configures exactly one (every rule is scoped to location Product Detail, the only
// location the live Badges API accepts), so "the placement" and "all placements" are the same set
// here -- flattening just means a second placement wouldn't silently vanish.
const cache = new Map<string, Badge[]>();
const requested = new Set<string>();
const listeners = new Map<string, Set<(badges: Badge[]) => void>>();
let queue: Promise<void> = Promise.resolve();

// A FAILED REQUEST IS NOT "THIS PRODUCT HAS NO BADGE" (fixed 2026-08-17, the same correction made
// to characterQueue.ts the same day and predicted for this file in card-system-plan.md §5b.3).
// Until this pass every settle wrote to the cache, so an errored enrichment was stored as a
// permanent no-badge for that product -- with `requested` still set, so it could never be retried.
// The controller exposes `state.error` precisely so the two can be told apart, and they now are.
//
// The second bug was worse and quieter: this queue is a promise chain that only advances when a
// request settles, and nothing guaranteed one ever would. A single request that never came back
// would stall EVERY later badge lookup on the page -- not a stale badge, no badges at all from that
// point on. Hence the timeout, which is about the queue's liveness rather than about this one
// product.
const RETRIES = 2;
const RETRY_BASE_MS = 400;
// Generous, because it is a backstop rather than a latency budget: the point is that the chain
// cannot wedge forever, not that a slow response gets cut off.
const SETTLE_TIMEOUT_MS = 8000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function emit(productId: string, badges: Badge[]) {
  listeners.get(productId)?.forEach((callback) => callback(badges));
}

/** Tell every subscriber AND remember the answer -- only for a real answer from the service. An
 *  empty array here is meaningful: the request succeeded and this product genuinely has no badge. */
function settle(productId: string, badges: Badge[]) {
  cache.set(productId, badges);
  emit(productId, badges);
}

/** One attempt. Rejects on a service error or on never settling, so the caller can tell those apart
 *  from a successful fetch that returned nothing. */
function fetchOnce(productId: string): Promise<Badge[]> {
  return new Promise<Badge[]>((resolve, reject) => {
    const controller = buildProductEnrichment(commerceEngine, { options: { productId, placementIds } });
    // `subscribe` invokes its callback once synchronously on registration, delivering whatever
    // state currently exists (which may still be stale/pre-fetch or belong to a request that hasn't
    // dispatched yet) -- `started` gates that out so we only act on this request's own
    // loading -> settled transition. `unsubscribe` is pre-initialized (not `const`) so that first
    // synchronous callback can't hit a before-initialization error if it fires before
    // `controller.subscribe` itself returns.
    let started = false;
    let done = false;
    let unsubscribe = () => {};

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new Error(`badge fetch timed out for ${productId}`))), SETTLE_TIMEOUT_MS);

    unsubscribe = controller.subscribe(() => {
      const state = controller.state;
      if (state.isLoading) {
        started = true;
        return;
      }
      if (!started || state.productId !== productId) return;
      if (state.error) {
        finish(() => reject(new Error(`badge fetch failed for ${productId}`)));
        return;
      }
      const badges = state.products[0]?.badgePlacements?.flatMap((p) => p.badges ?? []) ?? [];
      finish(() => resolve(badges));
    });
    controller.getBadges();
  });
}

function enqueueFetch(productId: string) {
  queue = queue.then(async () => {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        settle(productId, await fetchOnce(productId));
        return;
      } catch {
        if (attempt < RETRIES) await wait(RETRY_BASE_MS * (attempt + 1));
      }
    }
    // Out of attempts. Release the lock and leave the cache alone so a later mount can retry;
    // subscribers get an empty list now so nothing waits on a badge that is not coming.
    requested.delete(productId);
    emit(productId, []);
  });
}

/** Subscribes to the badges for one product, kicking off a queued fetch on first request. */
export function subscribeToBadge(productId: string, callback: (badges: Badge[]) => void): () => void {
  if (!listeners.has(productId)) listeners.set(productId, new Set());
  listeners.get(productId)!.add(callback);

  if (cache.has(productId)) {
    callback(cache.get(productId) ?? []);
  } else if (placementIds.length > 0 && !requested.has(productId)) {
    requested.add(productId);
    enqueueFetch(productId);
  }

  return () => listeners.get(productId)?.delete(callback);
}

export function badgesConfigured(): boolean {
  return placementIds.length > 0;
}
