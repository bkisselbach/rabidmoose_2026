import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { SortBy, type SortCriterion } from '@coveo/headless/commerce';
import { useCatalogFacetValues, type CategoryEntry } from '@/components/ShopMegaMenu';
import { trendingListingSort } from '@/homeControllers';
import { typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';
import { priceRangeToParam } from '@/lib/priceIntent';
import { useViewMode } from '@/lib/useViewMode';
import { ViewToggle } from '@/components/ViewToggle';
import { PriceSlider } from '@/components/PriceSlider';
import { CoveoChip } from '@/components/CoveoChip';
import { useCoveoState } from '@/lib/useCoveoState';
import { cn } from '@/lib/utils';

// The home hero's "second bar" -- the same live Coveo facet data the /search sidebar reads
// (RegularFacet/NumericFacet, via the shared trending facet generators in homeControllers.ts), laid
// out as horizontal dropdown triggers instead of a vertical checkbox-pill stack. Picking a value
// navigates to /search rather than filtering anything on this page: every control here is a
// picker, not a live filter surface, and none of them ever call a mutating method on the shared
// `trendingListing` controllers -- that state also feeds the Trending rail and the Shop mega
// menu's counts, and resorting or refiltering it out from under those would be a real, visible
// regression on an unrelated part of the page.

// Not built on the sidebar's FacetShell (an always-open collapsible card): a closed-by-default
// dropdown, matching this row's horizontal layout. Mirrors the bespoke trigger-plus-absolute-panel
// pattern SearchBox.tsx's own suggestions dropdown uses (`popover-content`), not a new dependency.
function ToolbarDropdown({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
      >
        {label}
        {count !== undefined && count > 0 && <span className="text-muted-foreground">({count})</span>}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          data-state="open"
          className="popover-content absolute z-10 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-xl border border-border bg-card py-1.5 text-left"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// One live facet value, as a full-width dropdown row -- CategoryChip's data, restyled: the mega
// menu wants a pill, this wants a row a mouse can scan down a short list.
function FacetRow({ entry, showTypeIcon, onNavigate }: { entry: CategoryEntry; showTypeIcon: boolean; onNavigate: () => void }) {
  const color = showTypeIcon ? typeColor(entry.value) : undefined;
  const Icon = showTypeIcon ? typeIcon(entry.value) : undefined;
  return (
    <Link
      to="/search"
      state={{ presetFacet: { facetId: entry.facetId, value: entry.value } }}
      onClick={onNavigate}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
    >
      {Icon && color && (
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: color.bg }}
        >
          <Icon className="h-2.5 w-2.5" style={{ color: color.text }} />
        </span>
      )}
      <span className="flex-1 truncate">{entry.value}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{entry.count}</span>
    </Link>
  );
}

function FacetDropdown({ facetId, label, showTypeIcon, entries }: { facetId: string; label: string; showTypeIcon: boolean; entries: CategoryEntry[] }) {
  return (
    <ToolbarDropdown label={label} count={entries.length}>
      {(close) =>
        entries.length === 0 ? (
          <p className="px-3 py-1.5 text-sm text-muted-foreground">Loading&hellip;</p>
        ) : (
          entries.map((entry) => (
            <FacetRow key={`${facetId}-${entry.value}`} entry={entry} showTypeIcon={showTypeIcon} onNavigate={close} />
          ))
        )
      }
    </ToolbarDropdown>
  );
}

function sortLabel(criterion: SortCriterion): string {
  switch (criterion.by) {
    case SortBy.Relevance:
      return 'Relevance';
    case SortBy.Fields:
      return criterion.fields.map((f) => f.displayName ?? f.name).join(', ');
    default:
      return 'Sort';
  }
}

export function HomeMarketplaceBar() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useViewMode();

  const sets = useCatalogFacetValues('cardsetname', 20);
  const types = useCatalogFacetValues('cardtypes', 20);
  const rarities = useCatalogFacetValues('cardrarity', 20);

  // Read-only: see trendingListingSort's own comment in homeControllers.ts for why this instance
  // must never have `.sortBy()` called on it directly.
  const sortState = useCoveoState(trendingListingSort);

  const goToPriceMax = (maxPrice: number) =>
    navigate(`/search?mnf-ec_price=${priceRangeToParam({ start: 0, end: maxPrice, endInclusive: true })}`);
  const goToSort = (criterion: SortCriterion, close: () => void) => {
    close();
    navigate('/search', { state: { presetSort: criterion } });
  };

  return (
    <section className="page-container pb-8 sm:pb-10">
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-4 shadow-rest sm:p-5">
        <FacetDropdown facetId="cardsetname" label="All Sets" showTypeIcon={false} entries={sets} />
        <FacetDropdown facetId="cardtypes" label="All Energy Types" showTypeIcon entries={types} />
        <FacetDropdown facetId="cardrarity" label="All Rarities" showTypeIcon={false} entries={rarities} />
        <PriceSlider onCommit={goToPriceMax} />

        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <CoveoChip capability="dynamic-facets" detailSuffix="Set/Type/Rarity read off the same live catalog-wide request the Trending rail and Shop mega menu already use; the price slider's bound is the catalog's own highest ec_price." />
          {sortState.availableSorts.length > 0 && (
            <ToolbarDropdown label={sortLabel(sortState.appliedSort)}>
              {(close) =>
                sortState.availableSorts.map((criterion) => (
                  <button
                    key={JSON.stringify(criterion)}
                    type="button"
                    onClick={() => goToSort(criterion, close)}
                    className="pressable flex w-full items-center px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                  >
                    {sortLabel(criterion)}
                  </button>
                ))
              }
            </ToolbarDropdown>
          )}
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Link
            to="/search"
            className="rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Reset Filters
          </Link>
        </div>
      </div>
    </section>
  );
}
