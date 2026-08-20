import type { FacetGenerator as HeadlessFacetGenerator } from '@coveo/headless/commerce';
import { FacetGenerator } from '@/components/FacetGenerator';
import { FacetGeneratorSkeleton } from '@/components/Skeleton';
import { CoveoChip } from '@/components/CoveoChip';

/** /search's desktop-only left column: a Filters header with Reset and the live facet rail
 *  underneath -- sticky so it stays reachable while the grid beside it scrolls past underneath the
 *  header. This column is filters alone; Sort + view toggle live above the grid in ListingToolbar.
 *  Mobile gets its own compact row + MobileFilterSheet instead of this column, which is `hidden`
 *  below `md`.
 *
 *  "Filters" and "Reset Filters" are plain `text-sm text-muted-foreground`, matching
 *  ListingToolbar's own "Showing .../Sort by" row so the two read as one design across both
 *  columns instead of two headers that happen to be the same height. */
export function DesktopFacetsPanel({
  facetGenerator,
  facetsPending,
}: {
  facetGenerator: HeadlessFacetGenerator;
  facetsPending: boolean;
}) {
  return (
    <aside className="mb-6 hidden w-64 shrink-0 md:block lg:w-72">
      <div className="sticky top-20 space-y-4">
        <div className="border-b border-border pb-3">
          <div className="flex h-9 items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filters</span>
              {/* ONE marker for the whole column. Two things about this rail are Coveo's -- the
                  facets themselves come from the response (nothing below is hardcoded here), and
                  the selections are URL-serialized, which is where "copy the link and it restores"
                  is demonstrable -- and they used to be two icons a few pixels apart: this one,
                  and FacetGenerator's own. It renders without its chip here (`showChip={false}`)
                  and this marker names both. */}
              <CoveoChip capability={['dynamic-facets', 'url-manager']} />
            </span>
            <button
              type="button"
              onClick={() => facetGenerator.facets.forEach((f) => f.deselectAll())}
              className="pressable text-sm text-muted-foreground hover:text-primary hover:underline"
            >
              Reset Filters
            </button>
          </div>
        </div>
        {facetsPending ? <FacetGeneratorSkeleton /> : <FacetGenerator controller={facetGenerator} showChip={false} />}
      </div>
    </aside>
  );
}
