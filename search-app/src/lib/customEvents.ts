import { noteEvent } from '@/lib/eventTape';

// NOTHING FROM `@coveo/headless` IS IMPORTED AT MODULE SCOPE HERE, deliberately -- item 31b.
//
// This file is reached from the app root: SiteHeader -> ProfileSwitcher -> here. A static
// `import { searchEngine } from '@/searchEngine'` therefore put the CLASSIC Coveo SDK into the
// eager entry graph, so /cart, /advisor, /pokemon-news and the 404 page all parsed a search
// engine none of them use before rendering anything.
//
// Nothing here needs it at import time. Every event below is user-initiated -- a persona switch, a
// Holo Studio open, a finish selection, a deck check, a consultant question -- and not one fires on
// mount. So the engine is pulled in at the moment of the first real interaction instead, by which
// point the route that raised it has almost always loaded the SDK anyway.

/**
 * The app's signature interactions, reported to Coveo as custom events.
 *
 * WHY THESE LIVE ON THE SEARCH ENGINE. The Event Protocol -- which the commerce engine runs on --
 * explicitly does NOT support custom events, custom data or custom context. The three classic
 * Search engines run on legacy Coveo UA, which does. So every custom event in this app is
 * dispatched against `searchEngine`, regardless of which surface raised it. That is a protocol
 * constraint, not a modelling choice, and it is worth saying out loud: the two halves of this app
 * have genuinely different analytics vocabularies.
 * See presentation/analytics-events-plan.md §0 and §2 G6.
 *
 * WHAT THESE ARE FOR. None of the interactions below are searches or clicks on results, so no
 * built-in event describes them -- yet they are the parts of the demo people actually remember
 * (opening a pack, switching persona, running a deck check). Before 2026-08-18 not one of them was
 * measured, so "visitors love the Rip Pack" was an assertion with no data under it.
 *
 * ONE `type` FOR THE WHOLE FAMILY, so they are queryable together in the Admin Console event
 * browser rather than scattered across six unrelated causes.
 */
const EVENT_TYPE = 'rabidmoose-interaction';

// NO `ripPackOpen`, despite the plan doc listing it. MASTER-STATUS's "What's built" claims a Rip
// Pack booster-opening modal, but there is no such component in the tree as of 2026-08-18 -- the
// only surviving trace is `confettiBurst.ts`, whose stale RipPackModal reference item 29d already
// cleaned up. Instrumenting a feature that does not exist would put a permanently-zero event in
// the Admin Console, so it is left out and the doc discrepancy reported instead.
export type CustomEventName =
  | 'personaSwitch'
  | 'holoStudioOpen'
  | 'deckCheckRun'
  | 'consultantAsk'
  | 'finishSelected';

/**
 * Reports one signature interaction.
 *
 * Deliberately fire-and-forget and deliberately un-awaited: analytics must never be able to fail a
 * user interaction, so a rejected dispatch is swallowed rather than propagated. The `catch` is not
 * defensive padding -- `logCustomEvent` returns a thunk that performs a network call.
 */
export function logCustomInteraction(name: CustomEventName, meta: Record<string, unknown> = {}) {
  // The Event Tape reads this first, so the overlay stays truthful even if the network call
  // fails: it records what the app TRIED to send, which is the thing being demonstrated.
  noteEvent({ protocol: 'ua', name: `customEvent · ${name}`, detail: describe(name, meta), trains: null });

  // Fire-and-forget, exactly as before -- the function stays SYNCHRONOUS and returns void, so all
  // five call sites are untouched by this. The only change is that the engine now arrives via a
  // dynamic import instead of a static one, which moves it out of the entry graph.
  //
  // The `noteEvent` above stays synchronous on purpose: the Event Tape is the demo-visible half and
  // must show the row the instant the interaction happens, not one network round trip later.
  void (async () => {
    try {
      const [{ loadGenericAnalyticsActions }, { searchEngine }] = await Promise.all([
        import('@coveo/headless'),
        import('@/searchEngine'),
      ]);
      const { logCustomEvent } = loadGenericAnalyticsActions(searchEngine);
      searchEngine.dispatch(logCustomEvent({ evt: name, type: EVENT_TYPE, meta }));
    } catch {
      // Never let instrumentation break an interaction. Now also covers a failed chunk fetch, which
      // is a real possibility a static import did not have -- and still the right outcome: the tape
      // row already rendered, and a missing analytics event must not surface to the visitor.
    }
  })();
}

/** A short human phrase for the Event Tape row -- the interaction, not the payload dump. */
function describe(name: CustomEventName, meta: Record<string, unknown>): string {
  switch (name) {
    case 'personaSwitch':
      return String(meta.persona ?? '');
    case 'holoStudioOpen':
    case 'finishSelected':
      return String(meta.productName ?? meta.finish ?? '');
    case 'deckCheckRun':
      return String(meta.deckSize != null ? `${meta.deckSize} cards` : '');
    case 'consultantAsk':
      return String(meta.question ?? '').slice(0, 48);
    default:
      return '';
  }
}
