import { useEffect, useMemo } from 'react';
import type { Product } from '@coveo/headless/commerce';
import { ProductCard } from '@/components/ProductCard';
import { CardGridSkeleton } from '@/components/Skeleton';
import { CoveoChip } from '@/components/CoveoChip';
import { ZoneSectionHeader } from '@/components/zones';
import { useRecommendationsSlot } from '@/lib/useRecommendations';
import { useInteractiveProducts } from '@/lib/useInteractiveProduct';
import { getCardFields } from '@/lib/cardFields';
import { getActivePersona } from '@/lib/visitorId';
import { dealInProps } from '@/lib/dealIn';

// Renders one PDP recommendation row for a given Merchandising Hub slot (Recommendations > slot
// location: PDP), seeded by the current product's id. Unlike the free-text cross-sell in
// ShopCardsPanel, these are backed by a Coveo ML strategy (e.g. same-set similarity, bought
// together) and get click tracking for free via the same `interactiveProduct`/ProductCard wiring
// used on the search results and home pages. The PDP renders this twice -- once per slot -- so
// slotId/fallbackHeadline are props rather than a module-scope constant.

interface Props {
  productId: string;
  slotId: string | undefined;
  fallbackHeadline: string;
  /** Product ids to omit even if the strategy returns them -- lets a later rail on the same page
      (e.g. "Bought together") avoid repeating an earlier rail's ("More from this set") picks
      when both slots fall back to the same popularity ranking on a thin catalog. */
  excludeIds?: string[];
  /** Reports this rail's own (post self-filter, pre excludeIds-filter) product ids once loaded,
      so a later rail on the page can exclude them. */
  onProductsLoaded?: (ids: string[]) => void;
  /** The seed product's set name. When the slot's headline claims same-set kinship ("More From
      Set") but the strategy has clearly fallen back to popularity -- under half the returned
      cards actually share this set -- the rail swaps in a truthful generic headline rather than
      letting the label lie about what's under it. */
  expectedSetName?: string;
  /** Names the active persona in this rail's chip -- ONLY for the Bought Together slot, whose
      strategy (`bought_together`, item 1b) is genuinely visitor-personalized. "More From Set" is
      same-set filtering, not persona-differentiated, so it must not claim otherwise. */
  personaAware?: boolean;
}

export function ProductRecommendations({
  productId,
  slotId,
  fallbackHeadline,
  excludeIds,
  onProductsLoaded,
  expectedSetName,
  personaAware,
}: Props) {
  const { controller, state } = useRecommendationsSlot(slotId, productId);

  // The strategy can return the seed product itself alongside its recommendations; filter it out
  // since a card's PDP shouldn't recommend itself. Memoized on the raw list (stable reference
  // from the headless controller until it actually changes) so the onProductsLoaded effect below
  // doesn't fire every render.
  const ownProducts = useMemo(
    () => (state?.products ?? []).filter((p) => p.ec_product_id !== productId && p.permanentid !== productId),
    [state?.products, productId]
  );

  useEffect(() => {
    if (ownProducts.length) onProductsLoaded?.(ownProducts.map((p) => p.ec_product_id ?? p.permanentid));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onProductsLoaded is a stable setState from the parent, not a reactive dep
  }, [ownProducts]);

  const excludeSet = excludeIds?.length ? new Set(excludeIds) : null;
  // Keyed on the RESPONSE array, not the filtered one below -- see useInteractiveProduct.ts.
  const getInteractiveProduct = useInteractiveProducts(controller, state?.products ?? []);

  const products = excludeSet ? ownProducts.filter((p) => !excludeSet.has(p.ec_product_id ?? p.permanentid)) : ownProducts;

  if (!controller) return null;
  // 5, not 4: the grid below is 5-up at xl (which is CardGridSkeleton's default, so the shape was
  // already right here) and four placeholders left the row visibly short of the row of five that
  // replaced them.
  if (state?.isLoading) return <CardGridSkeleton count={5} />;
  if (products.length === 0) return null;

  // Slot headlines are named for merchandisers ("PDP – More From Set"); keep the admin-authored
  // copy but strip the internal placement prefix now that the headline renders full-size.
  const adminHeadline = (state?.headline || fallbackHeadline).replace(/^PDP\s*[–—-]\s*/i, '');
  // The Recommendations API returns every product with empty additionalFields (confirmed by raw
  // capture; no admin config exists to add them), so the field read can never match -- parse the
  // set out of the `${name} — ${set} #${number}` suffix the catalog scraper writes into every
  // ec_name instead, keeping the field as first choice should the API ever start returning it.
  const productSetName = (p: Product) =>
    getCardFields(p.additionalFields).setName ?? p.ec_name?.match(/ — (.+) #[^#]*$/)?.[1];
  const sameSetCount = expectedSetName ? products.filter((p) => productSetName(p) === expectedSetName).length : 0;
  const headlineLies = !!expectedSetName && /\bset\b/i.test(adminHeadline) && sameSetCount < products.length / 2;
  const headline = headlineLies ? 'You may also like' : adminHeadline;

  const activePersona = getActivePersona();
  const detailSuffix = personaAware
    ? activePersona.key === 'guest'
      ? `Bought Together strategy — personalized to this visitor, seeded by the current card. Slot ID: ${slotId}`
      : `Bought Together strategy — personalized to ${activePersona.name}'s own history, seeded by the current card. Slot ID: ${slotId}`
    : slotId
      ? `Slot ID: ${slotId}`
      : undefined;

  return (
    <div>
      {/* Marketplace zone, but named for what it is -- the rails are the one commerce section
          whose ordering is ML's rather than the shopper's, and Demo Mode surfaces the exact
          Merchandising Hub slot behind each one. */}
      <ZoneSectionHeader
        zone="marketplace"
        eyebrowText="Recommended — picked by Coveo ML"
        title={headline}
        chip={<CoveoChip capability="ml-recommendations" detailSuffix={detailSuffix} />}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((product, index) => (
          <div key={product.permanentid} {...dealInProps(index)}>
            <ProductCard
              preset="recommendation"
              product={product}
              interactiveProduct={getInteractiveProduct(product)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
