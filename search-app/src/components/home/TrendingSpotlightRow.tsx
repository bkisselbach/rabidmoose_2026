import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Product } from '@coveo/headless/commerce';
import { HomeCardRail } from '@/components/home/HomeCardRail';
import { CoveoChip } from '@/components/CoveoChip';
import { productRecommendations, useTrendingListing } from '@/homeControllers';
import { useInteractiveProducts } from '@/lib/useInteractiveProduct';
import { fetchProductsByIds } from '@/lib/fetchProductsByIds';
import { useOptionalCoveoState } from '@/lib/useCoveoState';

// The Hub slot decides how many products actually come back; this just keeps a generous slot
// config from fetching more than HomeCardRail's rail could ever show.
const MAX_RAIL_PRODUCTS = 10;

// Sourcing only -- the shared HomeCardRail owns everything about how the rail is presented.
export function TrendingSpotlightRow() {
  const recState = useOptionalCoveoState(productRecommendations);

  const { state: trendingState, source: trendingSource } = useTrendingListing();

  const usingRecommendations = !!recState?.products.length;
  const source = usingRecommendations ? productRecommendations! : trendingSource;
  // The RESPONSE array, before the slice below and before the field-borrowing map further down --
  // both of those allocate a fresh array every render, and keying the interactive-product cache on
  // either would miss every time (see useInteractiveProduct.ts).
  const responseProducts = usingRecommendations ? recState!.products : trendingState.products;
  const rawProducts = responseProducts.slice(0, MAX_RAIL_PRODUCTS);
  const getInteractiveProduct = useInteractiveProducts(source, responseProducts);
  const headline = (usingRecommendations ? recState!.headline : undefined) || 'Trending now';
  const isLoading = !usingRecommendations && trendingState.isLoading;

  // The Recommendations API always returns `additionalFields: {}` (no configuration endpoint
  // exists to turn them on -- cardFields.ts), which would render ProductCard with no rarity line
  // and no type circle. This rail has no free source for those fields -- the listing/search
  // fallback fetches an unrelated top-10, not the slot's actual picks -- so borrowing here costs
  // its own per-id lookup, fired only for the ids that actually need it.
  const [borrowed, setBorrowed] = useState<Map<string, Product>>(new Map());
  const missingIds = usingRecommendations
    ? rawProducts
        .filter((p) => !p.additionalFields || Object.keys(p.additionalFields).length === 0)
        .map((p) => p.ec_product_id ?? p.permanentid)
        .filter((id) => !borrowed.has(id))
    : [];
  const missingKey = missingIds.join(',');
  useEffect(() => {
    if (!missingIds.length) return;
    let cancelled = false;
    fetchProductsByIds(missingIds).then((found) => {
      if (cancelled) return;
      setBorrowed((prev) => {
        const next = new Map(prev);
        found.forEach((p) => next.set(p.ec_product_id ?? p.permanentid, p));
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- missingKey is the real dependency; missingIds is a fresh array every render
  }, [missingKey]);

  const products = rawProducts.map((p) => {
    const own = p.additionalFields;
    if (own && Object.keys(own).length > 0) return p;
    const donor = borrowed.get(p.ec_product_id ?? p.permanentid);
    return donor ? { ...p, additionalFields: donor.additionalFields } : p;
  });

  return (
    // `min-w-0` bounds the rail inside the column, same reason every scrollable rail on this page
    // needs it. This panel is visually second when the row stacks below xl (PersonalizationBox is
    // the more personal of the two and leads there) but first/left at xl+.
    <div className="order-2 min-w-0 xl:order-1 xl:flex-1">
      <HomeCardRail
        dataTestId="home-trending"
        title={headline}
        // Flame would have been the louder choice and is taken: it's the Fire type's icon, and the
        // type strip further down this same page renders it.
        icon={TrendingUp}
        chip={
          <CoveoChip
            capability="ml-recommendations"
            detailSuffix={usingRecommendations ? 'Headline, picks, and rank order come from the Hub slot' : 'Slot empty -- showing catalog trending'}
          />
        }
        products={products}
        isLoading={isLoading}
        emptyMessage="No trending cards right now."
        showRank
        getInteractiveProduct={getInteractiveProduct}
      />
    </div>
  );
}
