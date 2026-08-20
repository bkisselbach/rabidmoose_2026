import type { CartItem } from '@coveo/headless/commerce';
import { ProductCard } from '@/components/ProductCard';
import { CardGridSkeleton } from '@/components/Skeleton';
import { CoveoChip } from '@/components/CoveoChip';
import { useRecommendationsSlot } from '@/lib/useRecommendations';
import { useInteractiveProducts } from '@/lib/useInteractiveProduct';
import { getActivePersona } from '@/lib/visitorId';
import { dealInProps } from '@/lib/dealIn';

// The "Cart - Complete Your Order" recommendation slot (Merchandising Hub > Recommendations,
// slot location: Cart). Coveo's Cart-based strategies want a single seed product rather than the
// whole cart, so this seeds from the most-recently-added item -- the last entry in `items`, since
// the Cart controller appends new products to the end of that array.
const slotId = import.meta.env.VITE_COVEO_CART_RECOMMENDATIONS_SLOT_ID;

interface Props {
  items: CartItem[];
}

export function CartRecommendations({ items }: Props) {
  const seedProductId = items[items.length - 1]?.productId;
  // No seed product (empty cart) disables the slot entirely rather than firing an unseeded request.
  const { controller, state } = useRecommendationsSlot(seedProductId ? slotId : undefined, seedProductId);

  const cartProductIds = new Set(items.map((i) => i.productId));
  const getInteractiveProduct = useInteractiveProducts(controller, state?.products ?? []);

  const products = (state?.products ?? []).filter((p) => {
    const id = p.ec_product_id ?? p.permanentid;
    return !cartProductIds.has(id);
  });

  if (!controller) return null;
  // Same grid string as the real row below (up to 8 across), not CardGridSkeleton's 5-up default --
  // this row is deliberately the densest in the app, so the default made its loading state visibly
  // coarser than the tiles that replaced it.
  if (state?.isLoading)
    return <CardGridSkeleton count={8} className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8" />;
  if (products.length === 0) return null;

  const activePersona = getActivePersona();
  const detailSuffix =
    activePersona.key === 'guest'
      ? 'Bought Together strategy on a Merchandising Hub slot — seeded by the last item added to cart, personalized to this visitor.'
      : `Bought Together strategy on a Merchandising Hub slot — personalized to ${activePersona.name}'s own history, seeded by the last item added to cart.`;

  return (
    <div>
      {/* Same full-width row treatment as the PDP's own recommendation rails
          (ProductRecommendations.tsx) -- one shared rhythm for "more cards, picked by Coveo ML"
          wherever it shows up, instead of the cart inventing its own boxed-in mini-grid. No
          eyebrow/icon here (on request) -- just the headline and the chip. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-3">
        <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">
          {state?.headline || 'Complete your order'}
        </h2>
        <CoveoChip capability="ml-recommendations" detailSuffix={detailSuffix} />
      </div>
      {/* Denser than the PDP's own rails (up to 8 across instead of 5) -- on request, smaller tiles
          here since this row is competing with the receipt above it for attention, not carrying
          the page on its own the way the PDP's rails do. */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {products.slice(0, 8).map((product, index) => (
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
