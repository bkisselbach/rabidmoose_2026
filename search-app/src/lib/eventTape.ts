/**
 * THE EVENT TAPE — a live, in-page record of the Coveo analytics events this session has emitted.
 *
 * This is the presentation payoff of the analytics item (see
 * presentation/analytics-events-plan.md §3 Phase F). Every other capability in this app can be
 * pointed at on screen; the analytics that make relevance improve over time could not be, because
 * they are invisible by construction. The tape makes them pointable: each row names the event and,
 * crucially, THE MODEL IT TRAINS.
 *
 * HONESTY RULES, which are the whole reason this is worth showing:
 *
 *  1. The tape records what the app SENDS, at the moment it sends it. It is written from the same
 *     call sites that emit, never reconstructed or inferred afterwards.
 *  2. It records nothing the app doesn't send. There is no row for a recommendation impression,
 *     because the Event Protocol has no impression event and this app refuses to invent one.
 *  3. `trains: null` is used honestly. A custom event trains no model; saying so is more useful
 *     than implying everything feeds ML.
 *
 * A plain module-scope store with a `useSyncExternalStore` subscribe, matching lib/useCoveoState.ts
 * rather than introducing a state library for one overlay.
 */

export type EventProtocol = 'ep' | 'ua';

export interface TapedEvent {
  id: number;
  at: number;
  /** 'ep' = Event Protocol (commerce engine), 'ua' = legacy Coveo UA (the three search engines). */
  protocol: EventProtocol;
  /** The event as Coveo names it, e.g. `ec.productView` or `click`. */
  name: string;
  /** What it was about, in human terms — a card name, a species, a query. */
  detail: string;
  /** The Coveo ML model(s) this event feeds, or null when it genuinely trains nothing. */
  trains: string | null;
}

/** Enough to cover a demo run without growing without bound on a long-lived tab. */
const MAX_EVENTS = 60;

// SESSION-BACKED, because the app reloads itself mid-demo. `switchPersona` ends with
// `window.location.reload()` on purpose (visitorId.ts explains why: it remounts every rail against
// the new identity in one guaranteed step). Module state does not survive that, so a tape held only
// in memory blanked at exactly the moment someone would be pointing at it -- and the persona
// switch's own custom event, which fires immediately before the reload, was always the first
// casualty. Measured in the live pass, 2026-08-18.
//
// sessionStorage, not localStorage: the tape is a record of THIS session, and a stale tape from
// yesterday restored into a fresh tab would be a lie about what the app just sent.
const STORAGE_KEY = 'rabidmoose-event-tape';

function load(): TapedEvent[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TapedEvent[]) : [];
  } catch {
    return [];
  }
}

let events: TapedEvent[] = typeof window === 'undefined' ? [] : load();
let nextId = events.reduce((max, e) => Math.max(max, e.id), 0) + 1;
const listeners = new Set<() => void>();

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Quota or a privacy mode. The in-memory tape still works for this page's lifetime.
  }
}

export function noteEvent(event: Omit<TapedEvent, 'id' | 'at'>) {
  // Newest first: the tape is read top-down while something is being demonstrated, so the row that
  // just appeared should be the one under the cursor, not the one scrolled off the bottom.
  events = [{ ...event, id: nextId++, at: Date.now() }, ...events].slice(0, MAX_EVENTS);
  persist();
  listeners.forEach((l) => l());
}

export function clearEvents() {
  events = [];
  persist();
  listeners.forEach((l) => l());
}

export function subscribeToEventTape(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One stable array reference per change — the same contract `useCoveoState` documents, and for
 *  the same reason: `useSyncExternalStore` compares snapshots by identity. */
export function getEventTape() {
  return events;
}

/**
 * Which Coveo ML model each event actually feeds.
 *
 * Kept as one table rather than a string at each call site so the claims stay consistent and
 * reviewable in one place — this is the part of the overlay that makes a claim about the platform,
 * so it is the part most worth being able to check. Anything not listed reports `null` (trains
 * nothing) rather than guessing.
 */
const TRAINS: Record<string, string> = {
  // Event Protocol — the commerce engine.
  'ec.productView': 'Recently Viewed · ART',
  'ec.productClick': 'ART · Learning to Rank · PQS',
  'ec.cartAction': 'Cart recommendations · ART',
  'ec.purchase': 'Recently Purchased · Bought Together',
  // Legacy Coveo UA — the three classic Search engines.
  click: 'ART (content) · DNE · PQS',
  search: 'PQS · DNE',
};

export function modelsTrainedBy(eventName: string): string | null {
  return TRAINS[eventName] ?? null;
}

/**
 * Attaches the tape to an engine's REAL emission path, rather than re-calling `noteEvent` beside
 * every `select()` / `view()` / `purchase()` in the app.
 *
 * This distinction is the point. A tape built from duplicated call sites drifts the moment someone
 * adds an event and forgets the second line, and — worse for a thing shown on stage — it can show a
 * row for an event that was never actually sent. Observing the emitter instead means the overlay
 * cannot claim more than the network did.
 *
 *  - Event Protocol: `relay.on('*')` fires for every EP event the commerce engine emits, including
 *    the ones Headless controllers send on their own.
 *  - Legacy Coveo UA: `analyticsClientMiddleware` is the documented hook into a UA payload just
 *    before it goes out. It MUST return the payload untouched — it is a pass-through here, purely
 *    an observer, never a mutator.
 */
export function tapCommerceRelay(relay: { on: (type: string, cb: (event: unknown) => void) => unknown }) {
  relay.on('*', (event) => {
    // The event type lives on `meta`, NOT at the top level. Relay auto-populates `meta` (type, ts,
    // clientId, trackingId) and leaves the caller's own payload as the event's remaining keys.
    // Reading `event.type` instead silently taps nothing -- it is always undefined, every event is
    // skipped, and the overlay just stays empty with no error anywhere. Caught live, not by tsc.
    const e = event as {
      meta?: { type?: string };
      product?: { name?: string };
      products?: { product?: { name?: string } }[];
    };
    const type = e?.meta?.type;
    if (!type) return;
    noteEvent({
      protocol: 'ep',
      name: type,
      detail: e.product?.name ?? (Array.isArray(e.products) ? `${e.products.length} items` : ''),
      trains: modelsTrainedBy(type),
    });
  });
}

/**
 * Builds the `analyticsClientMiddleware` for a classic-Search engine. Pass-through by contract.
 *
 * The generic return type is not decoration: `AnalyticsClientSendEventHook` is declared as
 * `<TResult>(eventType: string, payload: any) => TResult | Promise<TResult>`, so a concretely-typed
 * function is not assignable to it. The hook must hand back the payload it was given, unmodified —
 * this is an observer, and a middleware that rewrote a UA payload would be falsifying the very
 * events the tape claims to be reporting.
 */
export function tapSearchAnalytics(engineLabel: string) {
  return <TResult>(eventType: string, payload: unknown): TResult => {
    // Only the events worth a row: a UA payload carries a lot of plumbing, and a tape that shows
    // everything shows nothing.
    if (eventType === 'click' || eventType === 'search') {
      const p = (payload ?? {}) as { documentTitle?: string; queryText?: string };
      const label = p.documentTitle ?? p.queryText ?? '';
      noteEvent({
        protocol: 'ua',
        name: eventType,
        detail: [label, engineLabel].filter(Boolean).join(' · '),
        trains: modelsTrainedBy(eventType),
      });
    }
    return payload as TResult;
  };
}
