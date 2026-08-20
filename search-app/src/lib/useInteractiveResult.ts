import { useRef } from 'react';
import { buildInteractiveResult, type InteractiveResult, type Result, type SearchEngine } from '@coveo/headless';

/**
 * Click-event tracking for classic-Search results — the counterpart to the Commerce side's
 * `interactiveProduct`, which every product tile has always had.
 *
 * WHY THIS EXISTS. Until 2026-08-18 `buildInteractiveResult` was used ZERO times in this app.
 * Every Pokédex, Vault and News result navigated through a plain react-router `<Link>`, so the
 * three classic-Search engines sent search events with no click events at all. That is not a
 * cosmetic gap: ART / Learning-to-Rank and DNE train on the query→click PAIR, so with the click
 * half missing there was nothing for them to learn from, and the content side ranked on lexical
 * relevance alone — the same failure that was root-caused on the commerce pipelines (see
 * CoveoChip.tsx's `ml-ranking` copy) and never checked here. Content Gap Analysis, most-clicked
 * and click-through-rate reports were empty for every content source for the same reason.
 * Full audit: presentation/analytics-events-plan.md §2 G1.
 *
 * A GETTER, NOT A PER-RESULT HOOK. Mirrors `getInteractiveProduct` in HomeCardRail /
 * ProductResultsGrid rather than inventing a second convention: the parent calls this once and
 * hands the resulting function down, so shared tiles (`PokedexCard` is rendered by three
 * different engines' surfaces) stay engine-agnostic and take a controller as a prop, exactly as
 * `ProductCard` takes `interactiveProduct`.
 *
 * CONTROLLERS ARE REBUILT PER RESPONSE, deliberately. A click event attributes to the searchUid
 * of the query that produced the result, so a controller cached across responses would file the
 * click under a stale search. The cache is therefore keyed on the `results` ARRAY IDENTITY —
 * Headless allocates a new array per response, and `useCoveoState` hands out one stable snapshot
 * per notification, so array identity is exactly "same response" and nothing finer. Within one
 * response the instances are reused, because `InteractiveResult` carries per-result state (the
 * same reason SearchBox.tsx memoizes its `interactiveProduct`).
 */
export function useInteractiveResults(
  engine: SearchEngine,
  results: readonly Result[]
): (result: Result) => InteractiveResult {
  const cache = useRef<{ engine: SearchEngine; results: readonly Result[]; map: Map<string, InteractiveResult> } | null>(
    null
  );

  if (cache.current === null || cache.current.engine !== engine || cache.current.results !== results) {
    cache.current = { engine, results, map: new Map() };
  }
  const { map } = cache.current;

  // A plain closure rather than a `useCallback`: it is only ever invoked during the render of the
  // component that called this hook, so a stable identity would buy nothing.
  return (result: Result) => {
    const existing = map.get(result.uniqueId);
    if (existing) return existing;
    const controller = buildInteractiveResult(engine, { options: { result } });
    map.set(result.uniqueId, controller);
    return controller;
  };
}

/**
 * Props that turn any element into a click-tracked result link.
 *
 * `onClick` + `onAuxClick`, and NOT the `beginDelayedSelect`/`cancelPendingSelect` pair the plan
 * doc originally reached for. Measured against how these links actually behave:
 *
 *  - Plain left click and modified (cmd/ctrl/shift) click both fire React's `onClick`. React
 *    Router's `<Link>` inspects the modifier and lets the browser take a modified click to a new
 *    tab, but the handler has already run either way.
 *  - Middle click fires `onAuxClick` and never `onClick`, which is the one case a naive `onClick`
 *    would drop.
 *
 * That is full coverage. `beginDelayedSelect` exists for hover/long-press intent — it starts a
 * timer and needs a matching cancel — which is a different interaction from a link click and would
 * add a way to log a click nobody made. Logging on the real click is both simpler and honest.
 */
export function interactiveResultProps(interactive: InteractiveResult) {
  return {
    onClick: () => interactive.select(),
    onAuxClick: (event: { button: number }) => {
      if (event.button === 1) interactive.select();
    },
  };
}
