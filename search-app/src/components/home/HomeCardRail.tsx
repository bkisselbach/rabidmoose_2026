import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { InteractiveProduct, Product } from '@coveo/headless/commerce';
import { CardGridSkeleton } from '@/components/Skeleton';
import { ProductCard } from '@/components/ProductCard';
import { Card, CardContent } from '@/components/ui/card';
import { RailArrow } from '@/components/RailArrows';
import { ZoneEyebrow } from '@/components/zones';
import { useScrollRail } from '@/lib/useScrollRail';
import { dealInProps } from '@/lib/dealIn';

// Shared shell for the home page's two PANEL rails (Trending Now, Recently Sold). Callers own
// their own data fetching/derivation; this owns the title row and the horizontal rail once a
// caller has decided what to show.
//
// A fixed 2x2 grid was tried for the two-column pair and rejected: it left real, right-standard-
// size cards with a wide dead gap beside them because only 2 fit before the grid ran out of items.
// A RAIL fills that same width with real cards instead, showing arrows once there's more than fits.
//
// CARD WIDTH is a fixed size (`CARD_BASIS` below), not a percentage of the rail's own container --
// that's what lets the same card size serve a full-width rail (Recently Viewed, which imports
// CARD_BASIS even now that it renders itself) and a half-width column (Trending, Recently
// Purchased) pixel-identically. A percentage basis can't do that: 13.5% of a full ~1400px row and
// 13.5% of a ~700px column are two different numbers.
interface Props {
  dataTestId: string;
  /** The section's own headline text (a merchandiser's Hub slot copy for Trending, a fixed string
   *  for the others) -- rendered in the shared ZoneEyebrow treatment either way. */
  title: string;
  /** The eyebrow glyph. Required in practice for every rail on the home page: three rails plus the
   *  hero and the sets strip all sit in one column, and the marketplace zone's default storefront
   *  icon on all five made the icon a page marker rather than a section one (2026-08-17, direct
   *  instruction). Each caller names its own -- see zones.tsx's ZoneEyebrow for the zone-signature
   *  rule this is the exception to. */
  icon?: LucideIcon;
  /** The provenance chip, e.g. <CoveoChip .../> -- content differs per caller (which capability,
   *  what the detail suffix says), so it's a slot rather than a capability prop. */
  chip: ReactNode;
  products: Product[];
  isLoading?: boolean;
  /** Shown in place of the rail when `products` is empty and not loading. */
  emptyMessage?: string;
  /** Trending numbers its cards (Hub slot rank order); the other doesn't. */
  showRank?: boolean;
  getInteractiveProduct: (product: Product) => InteractiveProduct;
}

// Exported so other surfaces can match this exact card size (see ProductResultsGrid's PLP grid)
// instead of re-measuring and duplicating these numbers.
export const CARD_BASIS = 'basis-[9.375rem] sm:basis-[9.75rem] lg:basis-[8.5rem] xl:basis-[11.875rem]';
// Same four widths as CARD_BASIS, as CSS Grid fixed-size tracks instead of flex-basis -- for a
// wrapping multi-row grid (the PLP) rather than a single-row rail. `minmax(X,X)` pins each track
// to exactly X (not `1fr`, which would stretch cards to fill the row); `auto-fill` computes how
// many tracks fit the container and wraps the rest. MUST stay in sync with CARD_BASIS's four values.
export const CARD_GRID_COLS =
  'grid-cols-[repeat(auto-fill,minmax(9.375rem,9.375rem))] sm:grid-cols-[repeat(auto-fill,minmax(9.75rem,9.75rem))] lg:grid-cols-[repeat(auto-fill,minmax(8.5rem,8.5rem))] xl:grid-cols-[repeat(auto-fill,minmax(11.875rem,11.875rem))]';

export function HomeCardRail({
  dataTestId,
  title,
  icon,
  chip,
  products,
  isLoading = false,
  emptyMessage,
  showRank = false,
  getInteractiveProduct,
}: Props) {
  const rail = useScrollRail(products.length);

  // The provenance chip travels with the title, since it labels the section rather than the rail;
  // the arrows do NOT -- they flank the cards (see railBlock below), which is what leaves this
  // header a plain two-item row.
  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <ZoneEyebrow zone="marketplace" text={title} icon={icon} />
      {chip}
    </div>
  );

  const body = isLoading ? (
    <CardGridSkeleton count={5} />
  ) : products.length === 0 ? (
    emptyMessage && (
      <p className="border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    )
  ) : (
    // Scroll-snap rail, not a fixed grid: mobile gets native swipe, and per Baymard there is no
    // autorotation -- the flanking arrows and the scroll gesture are the only way it moves.
    // RailArrow hides itself once every card already fits without scrolling.
    //
    // The container width is essentially never an exact multiple of CARD_BASIS + gap, so a
    // trailing card sits half-visible at rest -- a hard clip there reads as broken, not as "scroll
    // for more". A mask-image edge fade turns that half card into a soft fade instead. Only fades
    // the edge that actually has more content (checked against the rail's own scroll position), so
    // a fully-fit rail (RailArrows already hidden) renders with no fade at all.
    <div
      ref={rail.railRef}
      onScroll={rail.onScroll}
      className="no-scrollbar flex snap-x gap-3 overflow-x-auto"
      style={{
        maskImage: `linear-gradient(to right, ${rail.atStart ? 'black 0' : 'transparent 0, black 32px'}, ${rail.atEnd ? 'black 100%' : 'black calc(100% - 32px), transparent 100%'})`,
        WebkitMaskImage: `linear-gradient(to right, ${rail.atStart ? 'black 0' : 'transparent 0, black 32px'}, ${rail.atEnd ? 'black 100%' : 'black calc(100% - 32px), transparent 100%'})`,
      }}
    >
      {products.map((product, index) => (
        <div key={product.permanentid} {...dealInProps(index, `min-w-0 shrink-0 snap-start ${CARD_BASIS}`)}>
          <ProductCard
            product={product}
            rank={showRank ? index + 1 : undefined}
            interactiveProduct={getInteractiveProduct(product)}
            preset="rail"
          />
        </div>
      ))}
    </div>
  );

  // The arrows overlay the rail's own edges from a `relative` wrapper -- NOT as flex siblings
  // taking their own column, which would cost ~80px of a half-page rail only ~3 cards wide.
  // Sitting OUTSIDE the scrolling element keeps them still while the cards move under them; a
  // child of the scroller would page itself off screen. `-left-2/-right-2` hangs each button 8px
  // past the cards into the surrounding padding -- inside the smallest padding either caller has,
  // so nothing can push the page into horizontal overflow.
  const railBlock = (
    <div className="relative">
      {body}
      <RailArrow rail={rail} direction={-1} label={title} className="absolute -left-2 top-1/2 -translate-y-1/2" />
      <RailArrow rail={rail} direction={1} label={title} className="absolute -right-2 top-1/2 -translate-y-1/2" />
    </div>
  );

  return (
    // `h-full` so the panel fills its column instead of stopping at its own content height. Both
    // callers are the home page's side-by-side pair, and each is a stretched flex item, so this
    // resolves to the taller column's height -- keeping the two panels' bottom edges level.
    <section data-testid={dataTestId} className="flex h-full flex-col">
      <Card className="panel-border-glow flex-1">
        <CardContent className="p-5 sm:p-6">
          {header}
          {railBlock}
        </CardContent>
      </Card>
    </section>
  );
}
