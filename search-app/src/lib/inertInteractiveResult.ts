import type { InteractiveResult } from '@coveo/headless';

// The classic-Search twin of `inertInteractiveProduct`, and it exists for the same reason: some
// surfaces render a species or article that never came out of a search-engine result list, so
// there is no `Result` (and no searchUid) to attribute a click to.
//
// Two live cases, both on the Vault:
//   - `VaultSemanticFallback` — its match comes from a raw Passage Retrieval fetch, which returns
//     passages, not results.
//   - `VaultSpotlight` — its species is resolved from the trending Recommendations slot's top
//     PRODUCT and then looked up through the character queue; nothing in that chain is a search
//     result on the Vault's engine.
//
// Both could be made to log *something* by pointing them at whatever query happens to be in the
// engine's state, and that would be worse than logging nothing: it would attribute a click to a
// search that did not produce it, which is exactly the kind of dirt that degrades the ML models
// this instrumentation exists to feed. A no-op is the honest answer, same call the commerce side
// already made. One shared instance — it carries no state.
export const inertInteractiveResult: InteractiveResult = {
  select: () => {},
  beginDelayedSelect: () => {},
  cancelPendingSelect: () => {},
};
