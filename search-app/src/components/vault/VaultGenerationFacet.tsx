import type { NumericFacet as HeadlessNumericFacet, NumericFacetValue } from '@coveo/headless';
import { FacetShell } from '@/components/FacetShell';
import { cn } from '@/lib/utils';
import { useCoveoState } from '@/lib/useCoveoState';

// Manually-ranged NumericFacet (one [g,g] range per generation): `pokemongeneration` is a Long
// field on the source, not a regular facetable string.
export function VaultGenerationFacet({ controller }: { controller: HeadlessNumericFacet }) {
  const state = useCoveoState(controller);

  if (state.values.length === 0) return null;

  const onToggle = (value: NumericFacetValue) => controller.toggleSelect(value);
  const activeCount = state.values.filter((v) => v.state !== 'idle').length;

  return (
    <FacetShell facetId={state.facetId} label="Generation" activeCount={activeCount} onClear={() => controller.deselectAll()}>
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
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground hover:border-foreground/60 hover:bg-muted'
              )}
            >
              Gen {value.start}
              <span className="font-normal text-muted-foreground">{value.numberOfResults}</span>
            </button>
          </li>
        );
      })}
    </FacetShell>
  );
}
