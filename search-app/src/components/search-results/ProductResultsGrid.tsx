import type { InteractiveProduct, Pagination as HeadlessPagination, Product } from '@coveo/headless/commerce';
import type { ViewMode } from '@/lib/useViewMode';
import { CardGridSkeleton } from '@/components/Skeleton';
import { EmptyStateRecommendations } from '@/components/EmptyStateRecommendations';
import { ResultsUnavailable } from '@/components/ResultsUnavailable';
import { ProductListItem } from '@/components/ProductListItem';
import { ProductCard } from '@/components/ProductCard';
import { PaginationBar } from '@/components/PaginationBar';
import { dealInProps } from '@/lib/dealIn';

// 5-across at `xl` and up, `1fr` tracks rather than the home rail's fixed-px/auto-fill tracks
// (CARD_GRID_COLS) -- `auto-fill` + fixed track width leaves whatever remainder doesn't divide
// evenly into the container as dead space at the row's right edge instead of sharing it out, which
// read as gaps. `1fr` tracks always sum to exactly the container width, so the cards fill the row
// edge-to-edge every time.
//
// THE LADDER BELOW `xl` IS NEW (2026-08-19, visual-consistency audit). This was `grid-cols-5` flat,
// with no responsive steps at all -- the one product grid in the app without them; the vault, the
// PDP rails, the recommendations and the skeleton's own default all ladder. Flat 5-across meant
// `1fr` did exactly what it promises at every width, including 375px, where it divided the row into
// five 49px tracks: card art a 35px sliver, every label truncated to "#10..." / "R." / "B...", the
// page's entire purpose unusable on a phone. Measured again at 390px before this change and it was
// still that. The fixed 5-across is a recorded user instruction, which is why it is KEPT verbatim
// at `xl` -- the width it was given at and the only width it describes -- rather than reversed.
// The steps under it are the same ladder `CardGridSkeleton`'s default and `ProductRecommendations`
// already run for this exact tile, so the three now agree instead of two agreeing and one not.
const GRID_CLASS = 'grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

/** /search's commerce product area: skeleton <-> empty state <-> grid/list swap, with a
 *  full-width pagination bar below. The grid grows with its content and the page scrolls normally,
 *  same as the facet column and everything else around it. A second pager sits above the grid
 *  inside ListingToolbar; both share the same `pagination` controller (HeadlessPagination supports
 *  more than one subscriber), so paging from either one is the same action and they never fall out
 *  of sync. `busy` is a settled-loading flag rather than raw `isLoading` (see SearchResultsPage's
 *  comment on `commerceBusy`: this page fires more than one commerce request per query and they
 *  can settle out of order, so raw isLoading flickers skeleton/content/empty-state in sequence as
 *  each intermediate response lands). */
export function ProductResultsGrid({
  busy,
  skeletonCount,
  products,
  viewMode,
  getInteractiveProduct,
  pagination,
  isRefetching,
  unavailable,
  onRetry,
}: {
  busy: boolean;
  skeletonCount: number;
  products: Product[];
  viewMode: ViewMode;
  getInteractiveProduct: (product: Product) => InteractiveProduct;
  pagination: HeadlessPagination;
  isRefetching: boolean;
  /** Both commerce controllers reported an error, so there is nothing to show and no reason to
   *  pretend the catalog came back empty. Checked before `products.length === 0` because the empty
   *  branch renders recommendations, which need the same API that just failed. */
  unavailable?: boolean;
  onRetry?: () => void;
}) {
  return (
    <>
      {busy ? (
        <CardGridSkeleton key="skeleton" count={skeletonCount} className={`fade-in-panel ${GRID_CLASS}`} />
      ) : unavailable ? (
        <ResultsUnavailable what="cards" onRetry={onRetry ?? (() => window.location.reload())} />
      ) : products.length === 0 ? (
        <EmptyStateRecommendations />
      ) : viewMode === 'list' ? (
        <div key="list" className="fade-in-panel space-y-3">
          {products.map((product) => (
            <ProductListItem preset="plp-list" key={product.permanentid} product={product} interactiveProduct={getInteractiveProduct(product)} />
          ))}
        </div>
      ) : (
        <div key="grid" className={GRID_CLASS}>
          {/* Each tile deals in on its own short delay (see `.deal-in` in index.css). The wrapper's
              own `fade-in-panel` is dropped on this branch: two entrance animations on nested
              elements read as a smear rather than a deal. The list branch above keeps
              `fade-in-panel`, since rows have no per-item entrance of their own. */}
          {products.map((product, index) => (
            <div key={product.permanentid} {...dealInProps(index)}>
              {/* `priority` on the first tile only (item 31e): it is the grid's LCP candidate, and
                  lazy-loading the one image the visitor is waiting for makes the page slower, not
                  faster. Every other tile stays lazy. */}
              <ProductCard
                preset="plp-grid"
                product={product}
                interactiveProduct={getInteractiveProduct(product)}
                priority={index === 0}
              />
            </div>
          ))}
        </div>
      )}

      <PaginationBar controller={pagination} isLoading={isRefetching} />
    </>
  );
}
