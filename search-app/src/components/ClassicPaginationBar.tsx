import type { Pager as HeadlessPager } from '@coveo/headless';
import { cn } from '@/lib/utils';
import { useCoveoState } from '@/lib/useCoveoState';

// Pager for any CLASSIC Search API engine. The classic Pager is 1-indexed (`currentPage`/`maxPage`)
// and already returns a bounded `currentPages` window -- unlike the commerce Pagination controller
// PaginationBar.tsx wraps (0-indexed `page`/`totalPages`, no windowing done for you), so this
// doesn't need to recompute a button range by hand. That index-base difference is the whole reason
// the two cannot simply be one component.
//
// Renamed from `VaultPaginationBar` when /pokemon-news became the second classic-engine page
// (2026-08-17); it was never Vault-specific.
export function ClassicPaginationBar({
  controller,
  isLoading = false,
  className,
}: {
  controller: HeadlessPager;
  isLoading?: boolean;
  /** Overrides the default bottom-of-listing chrome (border-t, py-8) for placements like a toolbar row. */
  className?: string;
}) {
  const state = useCoveoState(controller);

  if (state.maxPage <= 1) return null;

  return (
    <div className={cn('flex items-center justify-center gap-5 text-sm', className ?? 'border-t border-border py-8')}>
      <button
        type="button"
        disabled={!state.hasPreviousPage || isLoading}
        onClick={controller.previousPage}
        className="pressable tap-safe font-semibold uppercase tracking-wide text-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-30"
      >
        Prev
      </button>
      <div className="flex items-center gap-3">
        {state.currentPages.map((p) => (
          <button
            key={p}
            type="button"
            disabled={isLoading}
            onClick={() => controller.selectPage(p)}
            className={cn(
              'pressable',
              'tap-safe border-b-2 px-0.5 pb-0.5 font-semibold transition-colors disabled:pointer-events-none',
              p === state.currentPage
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!state.hasNextPage || isLoading}
        onClick={controller.nextPage}
        className="pressable tap-safe font-semibold uppercase tracking-wide text-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-30"
      >
        Next
      </button>
    </div>
  );
}
