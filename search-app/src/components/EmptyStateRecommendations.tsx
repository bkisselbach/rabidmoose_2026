import { ProductCard } from '@/components/ProductCard';
import { CardGridSkeleton } from '@/components/Skeleton';
import { CoveoChip } from '@/components/CoveoChip';
import { MooseMark } from '@/components/MooseMark';
import { useRecommendationsSlot } from '@/lib/useRecommendations';
import { useInteractiveProducts } from '@/lib/useInteractiveProduct';
import { Sparkles } from 'lucide-react';
import { dealInProps } from '@/lib/dealIn';

// The "PLP - No Results Recommendations" slot (Merchandising Hub > Recommendations, no product
// seed -- same browse-style shape as the home page's trending slot). Shown in place of the plain
// "No cards found" message so a dead-end query still surfaces something merchandised.
const slotId = import.meta.env.VITE_COVEO_PLP_EMPTY_STATE_SLOT_ID || undefined;

/** The genuine dead end: the recommendation slot is unconfigured, or it came back with nothing to
 *  merchandise. Both branches below used to render the same bare "No cards found." paragraph, so it
 *  is one component now rather than two copies that can drift. The mark is what makes this read as
 *  a considered state rather than a rendering failure -- a dashed box with six grey words looks
 *  like something broke. */
function NoCardsFound() {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-border py-12 text-center">
      {/* Dimmed: this is a dead end, and a full-strength mascot here would be louder than the
          moment deserves -- the empty cart (a state the shopper can act on) gets 90%. */}
      <MooseMark className="h-14 w-14 opacity-70" />
      <p className="text-sm text-muted-foreground">No cards found.</p>
    </div>
  );
}

export function EmptyStateRecommendations() {
  const { controller, state } = useRecommendationsSlot(slotId);
  const getInteractiveProduct = useInteractiveProducts(controller, state?.products ?? []);

  if (!controller) {
    return (
      <NoCardsFound />
    );
  }

  if (state?.isLoading) {
    // 6 fills the xl row this grid actually renders; 4 left it two tiles short of the real row.
    return <CardGridSkeleton count={6} className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" />;
  }
  if (!state?.products.length) {
    return (
      <NoCardsFound />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="eyebrow">{state.headline || 'No cards matched -- you might like these instead'}</h2>
        </div>
        <CoveoChip
          capability="ml-recommendations"
          detailSuffix="Popular-picks strategy on a Merchandising Hub slot — same list for every visitor by design, not personalized."
        />
      </div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {state.products.map((product, index) => (
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
