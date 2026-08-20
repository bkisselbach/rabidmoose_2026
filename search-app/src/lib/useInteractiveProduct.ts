import { useRef } from 'react';
import type { InteractiveProduct, Product } from '@coveo/headless/commerce';
import { inertInteractiveProduct } from '@/lib/inertInteractiveProduct';

/**
 * Commerce-side mirror of `lib/useInteractiveResult.ts` — item 31c / performance-plan.md §4a.
 *
 * WHY THIS EXISTS. Six commerce call sites built a controller *per product, per render*:
 *
 *     getInteractiveProduct={(product) => controller.interactiveProduct({ options: { product } })}
 *
 * Per build, from the SDK source: a `debounce` closure, an options spread, an `addReducers` call
 * (cheap, it early-returns) and `getWarningMessage()`, which destructures the product and can build
 * strings. Small individually; eighteen tiles times every render is not — and `SearchResultsPage`
 * re-renders on every notification from any of six controller subscriptions.
 *
 * It also silently reset `wasOpened`, the per-instance flag whose entire job is to stop one click
 * logging twice. A controller rebuilt between the click and the log has no memory that it already
 * fired, so this was a correctness problem wearing a performance problem's clothes.
 *
 * THE PATTERN IS NOT NEW — it was written, documented and adopted on the classic-Search half of
 * this app in `useInteractiveResult.ts` and never crossed over. This file mirrors it deliberately,
 * including the reasoning below, rather than inventing a second convention.
 *
 * CONTROLLERS ARE REBUILT PER RESPONSE, DELIBERATELY. A click event attributes to the searchUid of
 * the query that produced the result, so a controller cached across responses would file the click
 * under a stale search. The cache is therefore keyed on the `products` ARRAY IDENTITY — Headless
 * allocates a new array per response, and `useCoveoState` hands out one stable snapshot per
 * notification, so array identity is exactly "same response" and nothing finer. Within one
 * response the instances are reused, which is both the performance win and the thing that lets
 * `wasOpened` survive long enough to do its job.
 *
 * A GETTER, NOT A PER-PRODUCT HOOK, for the same reason as the classic side: the parent calls this
 * once and hands the resulting function down, so shared tiles stay controller-agnostic and take an
 * `interactiveProduct` as a prop.
 */

/** Anything that can mint an `InteractiveProduct`. Structural on purpose: the six call sites hand
 *  in a product-listing controller, a search controller and a recommendations controller, and
 *  naming a union of the three would couple this file to the SDK's controller taxonomy for no
 *  benefit — this is the only method any of them needs to expose here. */
export interface InteractiveProductSource {
  interactiveProduct(props: { options: { product: Product } }): InteractiveProduct;
}

/**
 * `source` may be undefined, because `useRecommendationsSlot` returns no controller when its slot
 * id is unset — and a hook cannot be called conditionally, so the callers cannot guard around this.
 * In that case every product resolves to the shared `inertInteractiveProduct`, which is the
 * convention this app already uses for products with no controller behind them (a raw Commerce
 * Search fetch, a local trail): it logs nothing, rather than writing a click into the analytics
 * that train the models against a response that never happened.
 */
/**
 * PASS THE RESPONSE ARRAY, NOT THE ARRAY YOU RENDER. `responseProducts` must be the controller's
 * own `state.products` — the array Headless allocated for this response — and not a derived one.
 *
 * This is easy to get wrong and fails silently, which is why it has its own paragraph. Half the
 * call sites here render a FILTERED or MAPPED list: `CartRecommendations` drops cart items,
 * `ProductRecommendations` drops the seed product, `TrendingSpotlightRow` rewrites fields onto its
 * products. Every one of those allocates a fresh array on every render, so keying the cache on it
 * would miss every single time and this hook would be an elaborate way to do exactly what it
 * replaced. The getter is still called with the derived products — same objects, so the
 * `permanentid` lookup lands — only the cache KEY comes from the response.
 */
export function useInteractiveProducts(
  source: InteractiveProductSource | undefined,
  responseProducts: readonly Product[]
): (product: Product) => InteractiveProduct {
  const cache = useRef<{
    source: InteractiveProductSource | undefined;
    responseProducts: readonly Product[];
    map: Map<string, InteractiveProduct>;
  } | null>(null);

  if (
    cache.current === null ||
    cache.current.source !== source ||
    cache.current.responseProducts !== responseProducts
  ) {
    cache.current = { source, responseProducts, map: new Map() };
  }
  const { map } = cache.current;

  // A plain closure rather than a `useCallback`: it is only ever invoked during the render of the
  // component that called this hook, so a stable identity would buy nothing.
  return (product: Product) => {
    if (!source) return inertInteractiveProduct;
    // `permanentid` is the product's SKU and is what every call site already uses as its React
    // key, so it is the identity the surrounding code has already agreed on.
    const existing = map.get(product.permanentid);
    if (existing) return existing;
    const controller = source.interactiveProduct({ options: { product } });
    map.set(product.permanentid, controller);
    return controller;
  };
}
