import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Selecting any facet value makes the commerce FacetGenerator hand back a fresh batch of facet
// controllers -- confirmed live: every FacetShell remounts within ~150ms of a toggleSelect call,
// well before the new response could have arrived, so it's the generator swapping controller
// instances, not a network round-trip. A plain useState for `open` would spring every OTHER
// facet back open the moment one collapses, defeating an explicit collapse. This module-level
// set is outside React's tree, so a facet's collapsed choice survives that remount; it's keyed
// by facetId, which stays stable (verified) even though the controller objects don't. Facets
// start expanded (nothing in the set) and only join it once a shopper explicitly collapses one.
const closedFacetIds = new Set<string>();

// Shared collapsible card for RegularFacet and NumericFacet -- was duplicated fieldset/legend
// markup in both. Dropped fieldset/legend in favor of a plain group: legend's content model
// (phrasing only) can't hold both the collapse toggle and a right-aligned Clear button on one
// row, and that one row is most of what makes this feel compact instead of a tall static list.
// `role="group" aria-label` keeps the accessible name a real fieldset would have given for free.
// Styled as its own bordered/shadowed card (same shadow-rest/shadow-float pair as the site's
// other Cards) rather than a divider-separated row, matching the dashboard's card language while
// still stacking full-width in the facet sidebar/mobile sheet.
interface FacetShellProps {
  facetId: string;
  label: string;
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  /** Rendered inside the collapsible area, after the value list (e.g. Show more/less). */
  footer?: ReactNode;
  /** 'stack' (default): this file's original always-visible collapsible card, for the /search
   *  sidebar and the mobile filter sheet. 'dropdown': a closed-by-default trigger plus a floating
   *  panel, for a horizontal toolbar (the /search desktop facet bar,
   *  home-hero-marketplace-toolbar-plan.md's follow-up). Same value-rendering children either way
   *  -- RegularFacet/NumericFacet don't know or care which shell they landed in. */
  layout?: 'stack' | 'dropdown';
}

export function FacetShell({ layout = 'stack', ...props }: FacetShellProps) {
  if (layout === 'dropdown') return <FacetDropdownShell {...props} />;
  return <FacetStackShell {...props} />;
}

function FacetStackShell({
  facetId,
  label,
  activeCount,
  onClear,
  children,
  footer,
}: Omit<FacetShellProps, 'layout'>) {
  const [open, setOpen] = useState(() => !closedFacetIds.has(facetId));
  const toggleOpen = () =>
    setOpen((wasOpen) => {
      const nowOpen = !wasOpen;
      if (nowOpen) closedFacetIds.delete(facetId);
      else closedFacetIds.add(facetId);
      return nowOpen;
    });
  return (
    <div
      role="group"
      aria-label={label}
      className="w-full rounded-lg border border-border bg-card px-3 py-2 shadow-rest transition-shadow duration-300 hover:shadow-float"
      data-testid="facet"
      data-facet-id={facetId}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className="pressable eyebrow flex flex-1 items-center gap-1.5 py-1 text-left hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform duration-200',
              !open && '-rotate-90'
            )}
          />
          <span className="truncate">{label}</span>
          {/* Solid fill, matching the selected pills below -- with the applied-chips row gone from
              /search this badge is what says "this facet is filtering" on a collapsed card. */}
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-2xs font-bold normal-case leading-4 tracking-normal text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="pressable shrink-0 text-2xs font-bold uppercase tracking-wide text-muted-foreground hover:text-primary hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      {/* 0fr/1fr grid-rows trick animates height without measuring the content -- on the house
          motion curve so opening/closing a facet matches the rest of the app's easing. */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          {/* Values wrap as a chip row instead of stacking as a checklist -- each chip truncates
              its own label rather than wrapping onto a second line, so one long set/rarity name
              can't blow out the row's height. */}
          <ul className="flex flex-wrap gap-1.5 pt-1.5">{children}</ul>
          {footer}
        </div>
      </div>
    </div>
  );
}

/** Closed-by-default trigger + floating panel, for a horizontal row of facets instead of a
 *  vertical stack. Colors/roundness match the home hero's marketplace toolbar
 *  (`components/home/HomeMarketplaceBar.tsx`), which established this "bg-background sunken
 *  control on a bg-card bar" language first -- this is that same language reused for the real,
 *  dynamic /search facet generator instead of a hardcoded three-field bar. */
function FacetDropdownShell({ facetId, label, activeCount, onClear, children, footer }: Omit<FacetShellProps, 'layout'>) {
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
    <div ref={ref} className="relative" data-testid="facet" data-facet-id={facetId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
      >
        {label}
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-2xs font-bold text-primary-foreground">{activeCount}</span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          data-state="open"
          className="popover-content absolute z-20 mt-1.5 max-h-72 w-64 overflow-y-auto rounded-xl border border-border bg-card p-2 text-left"
        >
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="eyebrow">{label}</span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="pressable text-2xs font-bold uppercase tracking-wide text-muted-foreground hover:text-primary"
              >
                Clear
              </button>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5">{children}</ul>
          {footer}
        </div>
      )}
    </div>
  );
}
