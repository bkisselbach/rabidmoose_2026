// The visitor identity every Coveo request in this app is attributed to.
//
// WHY THIS EXISTS. Coveo keys behavioural data — and therefore personalization, recommendations
// and ranking — on a `clientId`. Headless generates and persists one of its own, which is fine
// until you notice that the hand-rolled `fetch` calls in this app were passing *descriptive
// strings* in that field: `'pdp-lookup'`, `'shop-cards-panel'`, `'home-market-ticker'`. Coveo
// expects a visitor UUID there, so every one of those was a fictional "visitor" in the analytics.
// Mostly harmless for the `capture: false` reads, but ShopCardsPanel sends `capture: true`, which
// means real add-to-cart-adjacent behaviour was being filed under a visitor named after a
// component.
//
// So: one id, ours, used by BOTH the engines (via navigatorContextProvider) and the raw fetches —
// every one of them calls `getVisitorId()`, which is now also where persona switching resolves.
//
// PERSONAS. Server-side personalization on the recommendation carousels stayed cold across three
// separate re-tests (see presentation/MASTER-STATUS.md item 1) -- then got fixed live in the Admin
// Console, 2026-08-17 (the "BREAKTHROUGH" entry): the gate was a missing `condition` on each
// pipeline-level model association, not a data or routing problem. With conditions in place, this
// clientId genuinely drives Recently Viewed, Cart ("Complete Your Order"), and PDP "Bought
// Together" through the real Recommendations API (items 1/1b) -- switching Dana/Marcus/Guest here
// reshapes those rails server-side, not just the local trail. Trending, the PLP empty state and
// Recently Purchased are population-level by design (`popular_viewed`/`popular_bought`) and
// correctly do NOT vary by persona -- see each rail's own CoveoChip copy for which is which.

// `import type` for SeedHolding is deliberate: deckStorage.ts imports getActivePersona from here,
// so a value import would close a runtime cycle. The type is erased at build, and personaHoldings
// only imports the type too, so the real graph stays one-way.
import type { SeedHolding } from '@/lib/deckStorage';
import { DANA_HOLDINGS, MARCUS_HOLDINGS } from '@/lib/personaHoldings';

const STORAGE_KEY = 'pokemon-tcg-visitor-id';
const ACTIVE_PERSONA_KEY = 'pokemon-tcg-active-persona';

export type PersonaKey = 'guest' | 'dana' | 'marcus';

export interface Persona {
  key: PersonaKey;
  name: string;
  subtitle: string;
  /** Path under /public, or null for Guest -- a neutral icon, deliberately not a person (see
   *  personalization-plan.md: "the anonymous visitor should not look like a person"). */
  avatar: string | null;
  /** The fixed, contractual clientId seeded by `catalog-scraper npm run seed-personalization`, or
   *  null for Guest -- meaning "use this browser's own organic id" (see getVisitorId below). */
  clientId: string | null;
  /** Pre-fills the Recently Viewed rail (recentlyViewedStorage.ts) the first time this persona is
   *  active, so switching to Dana/Marcus shows something immediately rather than an empty rail
   *  waiting on manual browsing. Real ids, picked live from the catalog 2026-08-16 the same way
   *  seedPersonalization.ts chooses each persona's shape (Dana: WOTC-era sets sorted by price desc;
   *  Marcus: current-meta sets, mid price band) -- not the exact same random draw that script's
   *  `pickRandom` made for Marcus (unrecoverable, not seeded deterministically), but the same taste.
   *  Guest gets none: an empty rail is the point (personalization-plan.md, "Guest is the proof"). */
  seedProductIds: string[];
  /** This persona's seeded COLLECTION -- the holdings the Advisor workbench diffs against
   *  (gap-check-plan.md phase C). Richer than `seedProductIds`, which stays exactly as it is for
   *  the Recently Viewed rail: a holding also carries which printing it is and a mock cost basis
   *  and acquisition date. The list and the reasoning behind its shape live in personaHoldings.ts.
   *
   *  Guest deliberately has none, the same rule `seedProductIds` states above and deckStorage.ts
   *  restates: an empty collection is the honest starting point for an anonymous visitor, and the
   *  workbench answers with its "start from a set" empty state instead of inventing holdings. */
  seedHoldings?: SeedHolding[];
}

export const PERSONAS: Persona[] = [
  { key: 'guest', name: 'Guest', subtitle: 'Browsing as guest', avatar: null, clientId: null, seedProductIds: [] },
  {
    key: 'dana',
    name: 'Dana Whitfield',
    subtitle: 'Vintage collector',
    avatar: '/personas/dana.jpg',
    clientId: '82e8ce8f-19ba-4045-aa08-65c15c3567d9',
    seedProductIds: ['base1-4', 'neo1-9', 'base5-4', 'base5-21', 'base1-2', 'base3-5'],
    seedHoldings: DANA_HOLDINGS,
  },
  {
    key: 'marcus',
    name: 'Marcus Hale',
    subtitle: 'Competitive player',
    avatar: '/personas/marcus.jpg',
    clientId: 'dc0d055a-e042-43d6-a750-41618695f8d6',
    seedProductIds: ['swsh1-204', 'sv01-213', 'swsh4-138', 'swsh7-95', 'sv01-244', 'swsh7-174'],
    seedHoldings: MARCUS_HOLDINGS,
  },
];

const DEFAULT_PERSONA = PERSONAS[0];

function makeId(): string {
  // crypto.randomUUID needs a secure context; localhost and https both qualify, but a plain-http
  // preview host would not, and a thrown error here would take the whole engine down at import.
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }
}

let cached: string | null = null;

/** This browser's own organic id, stable across reloads and untouched by persona switching --
 *  restored the instant you flip back to Guest, no matter which persona was active before. */
function getOrganicVisitorId(): string {
  if (cached) return cached;
  if (typeof window === 'undefined') return 'ssr';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const fresh = makeId();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // Private browsing: fall back to a per-session id rather than breaking every request.
    cached = cached ?? makeId();
    return cached;
  }
}

/** The currently active persona, Guest by default. Safe to call anywhere `getVisitorId()` is --
 *  same SSR/storage guards. */
export function getActivePersona(): Persona {
  if (typeof window === 'undefined') return DEFAULT_PERSONA;
  try {
    const stored = window.localStorage.getItem(ACTIVE_PERSONA_KEY);
    return PERSONAS.find((p) => p.key === stored) ?? DEFAULT_PERSONA;
  } catch {
    return DEFAULT_PERSONA;
  }
}

/** The current visitor id, stable across reloads: the active persona's fixed id, or this browser's
 *  own organic one for Guest. Every raw fetch and both engines' `navigatorContextProvider` call this
 *  one function, so a persona switch changes every event this app emits with no other code change. */
export function getVisitorId(): string {
  return getActivePersona().clientId ?? getOrganicVisitorId();
}

/** Switches the active persona and reloads. A reload, not an in-place swap, deliberately:
 *
 *  1. The Cart controller has no wholesale "set items" -- only `updateItemQuantity()` and
 *     `empty()`, and `empty()` emits real analytics events. Swapping identity in place would have
 *     to either leave a stale cart attributed to the new persona or fire a burst of fake
 *     cart-removal events, either of which pollutes the exact behavioural signal this feature
 *     exists to demonstrate.
 *  2. Both commerce engines are built once at module scope; `navigatorContextProvider` is called
 *     per request, so new requests *would* pick up a changed id without a rebuild -- but nothing
 *     would prompt already-mounted components (the Recently Viewed rail, any rec rail) to refetch.
 *     A reload remounts everything against the new identity in one guaranteed step, matching what
 *     real account switching does anyway. See personalization-plan.md's "Risks" section. */
export function switchPersona(key: PersonaKey): void {
  if (getActivePersona().key === key) return;
  try {
    window.localStorage.setItem(ACTIVE_PERSONA_KEY, key);
  } catch {
    // The switch just won't survive a reload; not worth failing the click over.
  }
  window.location.reload();
}

/** The storage key `coveo.analytics` resolves its own visitor id from. Library-internal, but read
 *  through a public, documented path: `determineVisitorId()` resolves
 *  `url client id -> storage.getItem('visitorId') -> random v4`, and the same slot is what the
 *  client's public `currentVisitorId` setter writes to. The runtime's storage is
 *  `CookieAndLocalStorage`, whose `getItem` is `localStorage || cookie 'coveo_visitorId'` -- so
 *  localStorage wins, and seeding it alone is sufficient. */
const COVEO_ANALYTICS_VISITOR_KEY = 'visitorId';

/** Points the classic-Search analytics client at the SAME visitor this app already owns.
 *
 *  WHY THIS EXISTS. The app straddles two analytics protocols. Commerce/EP takes its identity from
 *  `navigatorContext()` below -- ours. The three classic-Search engines use `coveo.analytics`,
 *  which mints and persists a visitor id of its OWN and never consults Headless' navigator context.
 *  Measured live 2026-08-18, before this fix: commerce reported `57e2fd13-...` while every UA search
 *  and click event reported `e27c4fe1-...`. So the click events item 28 Phase A had just finished
 *  wiring attributed to a visitor who had never viewed a product, and the productViews attributed to
 *  a visitor who had never clicked. ART sees two half-sessions instead of one whole one.
 *
 *  WHY SEEDING STORAGE, AND NOT THE MIDDLEWARE. `analyticsClientMiddleware` is the documented
 *  pre-send hook and is already installed on all three engines, so rewriting `payload.clientId`
 *  there looks like the obvious fix. It is not sufficient: the id ALSO rides in the request's query
 *  string (`/rest/v15/analytics/search?visitor=...`), which the middleware cannot reach. Both the
 *  query param and the body field derive from the client's resolved visitor id, so correcting it at
 *  the source fixes both at once. (Verified on the wire, not assumed -- the query param is what
 *  ruled the middleware out.)
 *
 *  GUEST IS NOT CLOBBERED. This resolves through `getVisitorId()`, so Guest still seeds this
 *  browser's own organic id rather than a fixed value -- turning Guest into a fourth pseudo-persona
 *  would reintroduce exactly the fictional-visitor defect the top of this file exists to document.
 *
 *  Called at module scope, below, so it runs on import -- before any engine module body constructs
 *  an analytics client. `main.tsx` imports this module first for the same reason. */
function seedCoveoAnalyticsVisitorId(): void {
  if (typeof window === 'undefined') return;
  try {
    const ours = getVisitorId();
    if (window.localStorage.getItem(COVEO_ANALYTICS_VISITOR_KEY) !== ours) {
      window.localStorage.setItem(COVEO_ANALYTICS_VISITOR_KEY, ours);
    }
  } catch {
    // Private browsing: the classic engines keep their own id and the two protocols stay split.
    // Degraded, not broken -- and strictly no worse than before this existed.
  }
}

// Runs on import. A persona switch reloads the page (see `switchPersona`), so this re-seeds to the
// new identity on the way back up with no extra wiring.
seedCoveoAnalyticsVisitorId();

/** The `NavigatorContext` shape Headless asks for, filled from the live document. Shared by both
 *  commerce engines so a single visitor is reported consistently across search, listing, cart and
 *  recommendation calls alike. */
export function navigatorContext() {
  return {
    clientId: getVisitorId(),
    capture: true,
    referrer: typeof document === 'undefined' ? null : document.referrer || null,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    location: typeof window === 'undefined' ? null : window.location.href,
  };
}
