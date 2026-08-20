import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CoveoChip } from '@/components/CoveoChip';

interface FacetValueLike {
  value: string;
  state: string;
}

interface FacetLike<V extends FacetValueLike> {
  state: { facetId: string; values: V[] };
  toggleSelect(value: V): void;
  deselectAll(): void;
  subscribe(listener: () => void): () => void;
}

interface Props<V extends FacetValueLike> {
  facets: FacetLike<V>[];
}

// A row of removable chips summarizing every active facet selection across one or more facet
// controllers (works for both the commerce RegularFacet and generic content Facet shapes, since
// both expose the same toggleSelect/deselectAll/subscribe surface).
// /pokedex only as of 2026-08-17: /search dropped this row by direct instruction -- there the left
// facet column is the single applied-filter surface (filled pills sorted first, per-facet Clear,
// Reset Filters, a count on the mobile Filters button). Don't re-wire it into /search.
export function ActiveFilters<V extends FacetValueLike>({ facets }: Props<V>) {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const unsubscribes = facets.map((f) => f.subscribe(() => forceRender((n) => n + 1)));
    return () => unsubscribes.forEach((u) => u());
  }, [facets]);

  const chips = facets.flatMap((facet) =>
    facet.state.values.filter((v) => v.state !== 'idle').map((value) => ({ facet, value }))
  );

  if (chips.length === 0) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {chips.map(({ facet, value }) => (
        <button
          key={`${facet.state.facetId}-${value.value}`}
          type="button"
          onClick={() => facet.toggleSelect(value)}
          className="pressable inline-flex items-center gap-1.5 rounded-sm border border-foreground/25 bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-foreground/60"
        >
          {value.value}
          <X className="h-3 w-3" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => facets.forEach((f) => f.deselectAll())}
        className="pressable text-xs font-bold uppercase tracking-wide text-primary hover:underline"
      >
        Clear all
      </button>
      {/* Demo Mode only, and deliberately here: active filters are exactly the state the URL
          manager is serializing, so this is where "copy the link and it restores" is demonstrable. */}
      <CoveoChip capability="url-manager" />
    </div>
  );
}
