import type { InteractiveProduct } from '@coveo/headless/commerce';

// Shared stand-in for surfaces whose products came from a raw Commerce Search API fetch rather
// than a headless controller (ShopCardsPanel's species gallery, RecentlyViewedRow's local-trail
// fallback) -- there is no controller/response behind those products to log a real select()
// against. `ProductCard` still needs SOMETHING implementing `InteractiveProduct` to wire its
// stretched link up, and this is deliberately inert rather than a fake stand-in: a no-op logs
// nothing, rather than writing wrong data into the analytics that train the models. One shared
// instance -- it carries no state, so there's nothing to gain from building a new one per card.
export const inertInteractiveProduct: InteractiveProduct = {
  select: () => {},
  beginDelayedSelect: () => {},
  cancelPendingSelect: () => {},
};
