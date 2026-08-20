import type { NumericFacet as HeadlessNumericFacet, NumericFacetValue } from '@coveo/headless';
import { FacetShell } from '@/components/FacetShell';
import { cn } from '@/lib/utils';
import { useCoveoState } from '@/lib/useCoveoState';

// Bucketed ranges, not a slider: slider mode needs a live `domain` object the classic Search API
// facet used here has no equivalent of (see vaultControllers.ts).
export function VaultDexRangeFacet({ controller }: { controller: HeadlessNumericFacet }) {
  const state = useCoveoState(controller);

  if (state.values.length === 0) return null;

  const onToggle = (value: NumericFacetValue) => controller.toggleSelect(value);
  const activeCount = state.values.filter((v) => v.state !== 'idle').length;

  return (
    <FacetShell facetId={state.facetId} label="Dex #" activeCount={activeCount} onClear={() => controller.deselectAll()}>
      {state.values.map((value) => {
        const selected = value.state !== 'idle';
        return (
          <li key={`${value.start}-${value.end}`}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(value)}
              className={cn(
                'pressable',
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors',
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground hover:border-foreground/60 hover:bg-muted'
              )}
            >
              {value.start}&ndash;{value.end}
              <span className="font-normal text-muted-foreground">{value.numberOfResults}</span>
            </button>
          </li>
        );
      })}
    </FacetShell>
  );
}
