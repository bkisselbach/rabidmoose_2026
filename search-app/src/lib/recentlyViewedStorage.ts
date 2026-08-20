// The visitor's own recently-viewed cards, kept client-side -- same localStorage pattern as
// cartStorage.ts and recentQueriesStorage.ts.
//
// WHY THIS IS CLIENT-SIDE, WHICH IS A COMPROMISE WORTH STATING. Coveo has a **Recently Viewed**
// recommendation strategy that does this server-side, personalized per anonymous visitor from the
// very `ec.productView` events this app already emits on every card page. That is the better
// implementation and it is what the demo should eventually show. It needs a recommendation slot
// created in the Merchandising Hub, and slot management in this org is UI-only: every
// `commerce/v2/configurations/recommendation(s)/...` path 404s with the Merchandising Hub key,
// while the `search/global` control on the same key returns 200 (probed 2026-08-14, and the same
// conclusion was reached independently on 2026-08-13 while chasing additionalFields).
//
// So the *trail* is local while the slot doesn't exist. Note what is NOT local: the products
// themselves are fetched from the Commerce API by id, so everything rendered is live Coveo data at
// live prices. This is the same shape as fuzzyMatch.ts and localSuggestions.ts -- a client-side
// stand-in for a platform capability, labeled as such in the Coveo lens rather than passed off as
// the real thing. Swapping to the real strategy later is a slot id and a controller, and the rail's
// own UI does not change.
//
// PERSONA-SCOPED, ADDED 2026-08-16. Each persona gets its own trail (`${BASE}:dana`, `${BASE}:marcus`)
// so switching the header profile switcher reshapes this rail -- the one surface the switcher can
// change honestly, since it never depended on the recommendation model that stayed cold across three
// re-tests (see visitorId.ts and MASTER-STATUS item 1). Guest keeps the original unsuffixed key,
// unchanged, so any browser's pre-existing organic history survives this change untouched.

import { getActivePersona } from '@/lib/visitorId';

const BASE_STORAGE_KEY = 'pokemon-tcg-recently-viewed';
/** Coveo's own Recently Viewed strategy tracks up to 50 items; the rail shows far fewer, but
 *  keeping a few spare means a rail can still fill after the shopper revisits something. */
const MAX_IDS = 12;

function storageKeyForActivePersona(): string {
  const persona = getActivePersona();
  return persona.key === 'guest' ? BASE_STORAGE_KEY : `${BASE_STORAGE_KEY}:${persona.key}`;
}

export function loadRecentlyViewed(): string[] {
  if (typeof window === 'undefined') return [];
  const persona = getActivePersona();
  const key = storageKeyForActivePersona();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null && persona.seedProductIds.length > 0) {
      // First time this persona's trail is read: seed it with a taste-matched starting point (see
      // visitorId.ts's Persona.seedProductIds doc) so the switch shows something immediately rather
      // than an empty rail waiting on manual browsing. Persisted so a real view recorded afterwards
      // (recordProductView below) prepends onto it exactly like organic history from here on.
      window.localStorage.setItem(key, JSON.stringify(persona.seedProductIds));
      return persona.seedProductIds.slice(0, MAX_IDS);
    }
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Corrupt or foreign values degrade to "no history" rather than breaking the home page.
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, MAX_IDS);
  } catch {
    return [];
  }
}

/** Records a view, most-recent-first, de-duplicated, against the currently active persona's own
 *  trail. Called from the PDP alongside the Coveo `ec.productView` event, so the local trail and the
 *  analytics trail record the same moment for the same visitor. */
export function recordProductView(productId: string) {
  if (typeof window === 'undefined' || !productId) return;
  const key = storageKeyForActivePersona();
  try {
    const next = [productId, ...loadRecentlyViewed().filter((id) => id !== productId)].slice(0, MAX_IDS);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota just means no rail -- never a broken PDP.
  }
}
