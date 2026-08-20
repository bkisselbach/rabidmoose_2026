import { useEffect, useState } from 'react';
import { Dice5 } from 'lucide-react';
import { typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';
import { vaultTypeFacet, getCachedVaultTypeValues } from '@/vaultControllers';

const MAX_TYPE_CHIPS = 5;

export function VaultEmptyState({ onClear, onSurpriseMe }: { onClear: () => void; onSurpriseMe: () => void }) {
  // Subscribed for re-render timing only; values come from getCachedVaultTypeValues, which
  // remembers the last non-empty read -- a zero-result query's own facet response is itself empty.
  const [, forceRender] = useState(0);
  useEffect(() => vaultTypeFacet.subscribe(() => forceRender((n) => n + 1)), []);

  const topTypes = [...getCachedVaultTypeValues()].sort((a, b) => b.numberOfResults - a.numberOfResults).slice(0, MAX_TYPE_CHIPS);

  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center">
      <p className="text-sm font-semibold text-foreground">No Pok&eacute;mon match that search.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Try one type at a time instead of stacking filters, check the spelling of a species name, or
        clear a filter in the panel.
      </p>

      {topTypes.length > 0 && (
        <div className="mx-auto mt-4 flex max-w-md flex-wrap items-center justify-center gap-1.5">
          {topTypes.map((value) => {
            const color = typeColor(value.value);
            const Icon = typeIcon(value.value);
            return (
              <button
                key={value.value}
                type="button"
                onClick={() => vaultTypeFacet.toggleSelect(value)}
                className="pressable inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:border-foreground/60 hover:bg-muted"
              >
                {Icon && <Icon className="h-3 w-3 shrink-0" style={{ color: color.bg }} />}
                {value.value}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={onClear} className="pressable text-sm font-semibold text-primary hover:underline">
          Browse the whole Pok&eacute;dex &rarr;
        </button>
        <button
          type="button"
          onClick={onSurpriseMe}
          className="pressable card-hover flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground hover:border-primary/40"
        >
          <Dice5 className="h-4 w-4 text-primary" aria-hidden />
          Surprise me
        </button>
      </div>
    </div>
  );
}
