import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as HeadlessPagination } from '@coveo/headless/commerce';
import { cn } from '@/lib/utils';
import { useCoveoState } from '@/lib/useCoveoState';

export function PaginationBar({
  controller,
  /** Disables Prev/Next/page buttons while a page's results are already in flight, so a fast
   *  double-click can't queue a second request behind the first (and race which one settles). */
  isLoading = false,
  /** 'bar' (default) is the full-width row under the grid: Prev/Next as words, a 7-page window,
   *  generous padding, a hairline above. 'inline' is the same pager compressed to toolbar height
   *  for the listing header row (ListingToolbar): chevron icon buttons, a 5-page window, no frame
   *  of its own -- the toolbar owns the framing. Two instances share one `controller`, so paging
   *  from either stays in sync -- HeadlessPagination supports multiple subscribers. */
  variant = 'bar',
}: {
  controller: HeadlessPagination;
  isLoading?: boolean;
  variant?: 'bar' | 'inline';
}) {
  const state = useCoveoState(controller);

  if (state.totalPages <= 1) return null;

  const maxButtons = variant === 'inline' ? 5 : 7;
  const half = Math.floor(maxButtons / 2);
  let start = Math.max(0, state.page - half);
  const end = Math.min(state.totalPages, start + maxButtons);
  start = Math.max(0, end - maxButtons);
  const pages = Array.from({ length: end - start }, (_, i) => start + i);

  const pageButtons = pages.map((p) => (
    <button
      key={p}
      type="button"
      disabled={isLoading}
      aria-current={p === state.page ? 'page' : undefined}
      onClick={() => controller.selectPage(p)}
      className={cn(
        'pressable',
        'tap-safe border-b-2 px-0.5 pb-0.5 font-semibold transition-colors disabled:pointer-events-none',
        p === state.page
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {p + 1}
    </button>
  ));

  if (variant === 'inline') {
    return (
      <nav aria-label="Results pages" className="flex items-center gap-1.5 text-sm">
        <button
          type="button"
          aria-label="Previous page"
          disabled={state.page === 0 || isLoading}
          onClick={controller.previousPage}
          className="pressable tap-safe flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2.5">{pageButtons}</div>
        <button
          type="button"
          aria-label="Next page"
          disabled={state.page === state.totalPages - 1 || isLoading}
          onClick={controller.nextPage}
          className="pressable tap-safe flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    );
  }

  return (
    <nav aria-label="Results pages" className="flex items-center justify-center gap-5 border-t border-border py-8 text-sm">
      <button
        type="button"
        disabled={state.page === 0 || isLoading}
        onClick={controller.previousPage}
        className="pressable tap-safe font-semibold uppercase tracking-wide text-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-30"
      >
        Prev
      </button>
      <div className="flex items-center gap-3">{pageButtons}</div>
      <button
        type="button"
        disabled={state.page === state.totalPages - 1 || isLoading}
        onClick={controller.nextPage}
        className="pressable tap-safe font-semibold uppercase tracking-wide text-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-30"
      >
        Next
      </button>
    </nav>
  );
}
