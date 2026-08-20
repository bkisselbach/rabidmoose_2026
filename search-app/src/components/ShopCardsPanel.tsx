import { useEffect, useState } from 'react';
import { getVisitorId } from '@/lib/visitorId';
import type { Product } from '@coveo/headless/commerce';
import { ProductCard } from '@/components/ProductCard';
import { CardGridSkeleton } from '@/components/Skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CoveoChip } from '@/components/CoveoChip';
import { ZoneSectionHeader } from '@/components/zones';
import { cn } from '@/lib/utils';
import { inertInteractiveProduct } from '@/lib/inertInteractiveProduct';

interface Props {
  query: string;
  heading: string;
  /** Excludes this product from the results, e.g. so a PDP's cross-sell doesn't list the card you're already viewing. */
  excludeProductId?: string;
  /** Hides the "From the Marketplace" zone eyebrow above the title, for callers that already
   *  establish the zone elsewhere on the page. */
  showEyebrow?: boolean;
}

// The Pokedex character page's card gallery: queries the Commerce Search API directly (same
// single-lookup pattern as ProductDetailPage/CharacterDetailPage) for cards matching a free-text
// query, then renders every match with the SAME ProductCard /search and the trending/recently-
// viewed rails use -- modeled on artofpkm.com's single-page-per-Pokemon gallery, adapted for a
// catalog with real per-card pricing/cart.
// How many cards this panel opens with ON MOBILE ONLY. There is no result cap on the fetch -- it
// renders every product the Commerce Search API returns, which for a popular species is ~40. That
// was survivable at the old 3-up mobile density and is not at 2-up: ~20 rows took
// /pokedex/charizard from 6,897px to 9,060px, so fixing the truncated tiles made the page a third
// longer. Capping the first screenful rather than the panel keeps this surface's actual job
// ("browse and buy this Pokemon's cards") intact while making the page navigable with a thumb.
const MOBILE_INITIAL = 12;

export function ShopCardsPanel({ query, heading, excludeProductId, showEyebrow = true }: Props) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
    const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
    const trackingId = import.meta.env.VITE_COVEO_TRACKING_ID || 'pokemon-catalog';

    fetch(`https://platform.cloud.coveo.com/rest/organizations/${organizationId}/commerce/v2/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackingId,
        clientId: getVisitorId(),
        context: { view: { url: window.location.href }, capture: true, cart: [] },
        language: 'en',
        country: 'US',
        currency: 'USD',
        query,
      }),
    })
      .then((res) => res.json())
      .then((data) => setProducts((data.products ?? []).filter((p: Product) => p.ec_product_id !== excludeProductId)))
      .catch(() => setProducts([]));
  }, [query, excludeProductId]);

  // The skeleton has to carry THIS panel's grid, not CardGridSkeleton's default. It didn't: the
  // default is a 5-up xl grid, while the real gallery below is `sm:grid-cols-4 lg:grid-cols-6`, so
  // four wide placeholders were replaced by six narrow cards -- the loading state was a different
  // layout from the thing it stood in for, which is the one job it has. 12 = two full rows at the
  // lg density, and the same count the mobile view opens with.
  if (products === null) return <CardGridSkeleton count={12} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" />;
  if (products.length === 0) return null;

  const collapsedOnMobile = !expanded && products.length > MOBILE_INITIAL;

  return (
    <div>
      <ZoneSectionHeader
        zone="marketplace"
        title={heading}
        showEyebrow={showEyebrow}
        meta={
          <Badge variant="secondary">
            {products.length} card{products.length === 1 ? '' : 's'} for sale
          </Badge>
        }
        chip={<CoveoChip capability="commerce-catalog" />}
      />
      {/* 2 up on a phone, like every other product surface in the app -- same grid density as the
          /search grid, now the same card component too. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {products.map((p, i) => (
          <div
            key={p.permanentid}
            // Hidden in CSS rather than sliced out of the array, deliberately: the overflow tiles
            // stay mounted and stay in the DOM, so `sm` and up render exactly what they rendered
            // before this cap existed -- every card, no button, no behaviour change at all. The
            // cap is a mobile presentation rule, not a change to what the panel fetched.
            className={cn(collapsedOnMobile && i >= MOBILE_INITIAL && 'max-sm:hidden')}
          >
            {/* No controller behind these raw-fetched products (same situation as
                RecentlyViewedRow's local trail), so the stretched link gets the shared no-op
                rather than a fake interactiveProduct that would misreport analytics. showHp
                restores the one thing the old bespoke tile showed that ProductCard doesn't by
                default. */}
            <ProductCard preset="species-gallery" product={p} interactiveProduct={inertInteractiveProduct} />
          </div>
        ))}
      </div>
      {collapsedOnMobile && (
        <Button variant="outline" className="mt-4 w-full sm:hidden" onClick={() => setExpanded(true)}>
          Show all {products.length} cards
        </Button>
      )}
    </div>
  );
}
