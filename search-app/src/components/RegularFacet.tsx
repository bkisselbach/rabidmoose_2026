import { X } from 'lucide-react';
import type { RegularFacet as HeadlessRegularFacet, RegularFacetValue } from '@coveo/headless/commerce';
import { FacetShell } from '@/components/FacetShell';
import { cn } from '@/lib/utils';
import { typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';
import { useCoveoState } from '@/lib/useCoveoState';
import { TypeFlash } from '@/components/TypeFlash';
import { markTypeFlash, typeFlashKey } from '@/lib/typeFlash';

export function RegularFacet({ controller, layout }: { controller: HeadlessRegularFacet; layout?: 'stack' | 'dropdown' }) {
  const state = useCoveoState(controller);

  if (state.values.length === 0) return null;

  const onToggle = (value: RegularFacetValue) => {
    // Recorded outside React on purpose -- this component is unmounted and replaced by a skeleton
    // within ~15ms of this click, so component state describing the selection would not survive
    // long enough to animate. See lib/typeFlash.ts.
    if (value.state === 'idle') markTypeFlash(state.facetId, value.value);
    controller.toggleSelect(value);
  };
  const isTypeFacet = state.facetId === 'cardtypes';
  const activeCount = state.values.filter((v) => v.state !== 'idle').length;
  // Selected values float to the top of the pill row: with /search's applied-chips row gone
  // (2026-08-17), this rail is where a selection has to be findable, and a checked value sitting
  // mid-list -- or below the Show more fold -- would be invisible. Stable sort, so the response's
  // own order holds within each group.
  const orderedValues = [...state.values].sort(
    (a, b) => Number(b.state !== 'idle') - Number(a.state !== 'idle')
  );

  return (
    <FacetShell
      facetId={state.facetId}
      // Names come from the CMH Facet manager (Set / Type / Rarity / Category), not from a map
      // in here -- the facet rail says exactly what Coveo is configured to say.
      label={state.displayName ?? state.facetId}
      activeCount={activeCount}
      onClear={() => controller.deselectAll()}
      layout={layout}
      footer={
        // The response caps each facet at its configured numberOfValues (10 today), so without
        // these the long facets are silently truncated -- 18 of 28 sets and 5 of 15 rarities were
        // simply unreachable. `canShowMoreValues` mirrors the response's `moreValuesAvailable`.
        (state.canShowMoreValues || state.canShowLessValues) && (
          <div className="flex items-center gap-3 px-1.5 pt-1">
            {state.canShowMoreValues && (
              <button
                type="button"
                onClick={() => controller.showMoreValues()}
                className="pressable text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
              >
                Show more
              </button>
            )}
            {state.canShowLessValues && (
              <button
                type="button"
                onClick={() => controller.showLessValues()}
                className="pressable text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
              >
                Show less
              </button>
            )}
          </div>
        )
      }
    >
      {orderedValues.map((value) => {
        const id = `${state.facetId}-${value.value}`;
        const selected = value.state !== 'idle';
        const color = isTypeFacet ? typeColor(value.value) : undefined;
        const Icon = isTypeFacet ? typeIcon(value.value) : undefined;
        const flashKey = isTypeFacet ? typeFlashKey(state.facetId, value.value) : null;
        return (
          <li key={id}>
            <button
              type="button"
              id={id}
              aria-pressed={selected}
              onClick={() => onToggle(value)}
              className={cn(
                'pressable',
                // `relative`: TypeFlash below is an absolutely-positioned overlay and needs this
                // element as its containing block.
                'relative inline-flex max-w-[10rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-foreground/60 hover:bg-muted'
              )}
            >
              {/* The type's own colour, blooming once on selection -- the app had a full
                  type→colour map (lib/typeColors.ts) driving nothing but static swatches until
                  2026-08-18 (motion-system-plan.md M3). Only ever on the type facet: a Set or
                  Rarity value has no colour of its own to flash. */}
              {isTypeFacet && color && flashKey !== null && <TypeFlash key={flashKey} color={color.bg} />}
              {/* Selected pills drop the type tint and inherit the fill's foreground -- some type
                  colors (Electric's yellow) disappear against the solid primary. */}
              {Icon && color && <Icon className="h-3 w-3 shrink-0" style={selected ? undefined : { color: color.bg }} />}
              <span className="truncate">{value.value}</span>
              <span className={cn('shrink-0 font-normal', selected ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                {value.numberOfResults}
              </span>
              {/* The removal affordance the chips row used to carry. */}
              {selected && <X className="h-3 w-3 shrink-0" />}
            </button>
          </li>
        );
      })}
    </FacetShell>
  );
}
