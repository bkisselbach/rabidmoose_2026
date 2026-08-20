import type { ComponentProps } from 'react';
import type { Pagination as HeadlessPagination, Sort as HeadlessSort } from '@coveo/headless/commerce';
import type { ViewMode } from '@/lib/useViewMode';
import { CoveoChip } from '@/components/CoveoChip';
import { PaginationBar } from '@/components/PaginationBar';
import { SortDropdown } from '@/components/SortDropdown';
import { ViewToggle } from '@/components/ViewToggle';
import { truncateQuery } from '@/lib/truncateQuery';

/** The listing header: one row directly above the product grid holding everything that describes
 *  or steers it -- "Showing N results" hard left (with the CoveoChip disclosing which commerce
 *  endpoint served the grid), the pager centered, Sort + grid/list toggle hard right.
 *
 *  A `1fr auto 1fr` grid, not justify-between: the summary and the sort controls are different
 *  widths, so flex spacing would drift the pager off the section's true midline by half that
 *  difference. Equal outer tracks pin it regardless of what either side is doing -- including
 *  when the pager isn't rendered at all (single page of results: PaginationBar returns null and
 *  the empty middle track collapses without unbalancing the row).
 *
 *  Below `md` only the summary renders: Sort/View already sit in the mobile controls row beside
 *  the Filters button, and paging lives in the full-width bar under the grid -- the one surface of
 *  the three that never had a mobile duplicate, which is why the bottom bar stays in both modes
 *  while the top pager is desktop-only.
 *
 *  `h-9` on the INNER row pins it to the SelectTrigger's own height (Sort's control) instead of
 *  letting the row grow to fit it, so the row is the same height whether Sort/pager are showing
 *  (`md+`) or hidden (mobile, summary text alone). DesktopFacetsPanel's Filters header uses the
 *  same h-9 inner row, so the two sit level as one row split across both columns.
 *
 *  `border-b`/`pb-3`/`mb-4` live on an OUTER wrapper, not on the `h-9` row itself: combined on one
 *  element, "h-9" measured the BORDER box (36px) while the centered content had to fit the smaller
 *  CONTENT box (36 - 12px padding - 1px border = 23px), because `align-items: center` in a CSS
 *  Grid column centers within the content box, but a `grid-template-rows` pin sizes the track, not
 *  the content box -- so the two ended up centering in different-height boxes despite an identical
 *  `h-9` class, and text sat 6-7px lower on this side. Splitting padding onto its own wrapper means
 *  the `h-9` row is ALWAYS pure content box on both sides. */
export function ListingToolbar({
  pending,
  totalEntries,
  query,
  capability,
  sort,
  viewMode,
  onViewModeChange,
  pagination,
  paginationDisabled,
}: {
  pending: boolean;
  totalEntries: number;
  query: string;
  capability: ComponentProps<typeof CoveoChip>['capability'];
  sort: HeadlessSort;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  pagination: HeadlessPagination;
  /** Mirrors the bottom bar's isLoading: paging is locked while a page's results are in flight. */
  paginationDisabled: boolean;
}) {
  return (
    <div className="mb-4 border-b border-border pb-3">
      {/* `minmax(0,1fr)`, not `1fr` -- see the same fix on the newsroom's toolbar (2026-08-19,
          visual-consistency audit). A `1fr` track keeps `min-width: auto` and cannot shrink below
          its content, so the row overflows the page rather than compressing. This one does not
          overflow today, at any width measured; it is the same three-slot toolbar with the same
          failure available to it the moment a control in an outer slot gets wider. */}
      <div className="flex h-9 flex-wrap items-center gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {pending ? (
            <div className="skeleton h-4 w-40 rounded" aria-hidden="true" />
          ) : (
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-semibold text-primary tabular-nums">{totalEntries}</span>{' '}
              {query ? (
                <>
                  results for{' '}
                  <span className="font-semibold text-primary" title={query.length > 60 ? query : undefined}>
                    &ldquo;{truncateQuery(query)}&rdquo;
                  </span>
                </>
              ) : (
                'cards'
              )}
            </p>
          )}
          {/* ml-ranking applies to both search and listing, so it isn't gated on a query -- it
              ranks every card result on this page. thesaurus/stop-words apply to search only, and
              featured-result only when a rule actually fires for this query -- a permanent entry
              would claim a pin on results that have none. (Capability list built by the caller,
              which knows useListing/isBrowsing/hasFeaturedRule.) */}
          <CoveoChip capability={capability} />
        </div>

        <div className="hidden md:block md:justify-self-center">
          <PaginationBar controller={pagination} isLoading={paginationDisabled} variant="inline" />
        </div>

        <div className="hidden items-center gap-2 md:flex md:justify-self-end">
          <SortDropdown controller={sort} />
          <ViewToggle value={viewMode} onChange={onViewModeChange} />
        </div>
      </div>
    </div>
  );
}
