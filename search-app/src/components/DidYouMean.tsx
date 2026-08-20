import { useEffect, useState } from 'react';
import type { DidYouMeanState } from '@coveo/headless';
import { CoveoChip } from '@/components/CoveoChip';
import { cn } from '@/lib/utils';

// Minimal structural shape shared by both the generic and commerce DidYouMean controllers
// (their concrete types differ slightly -- e.g. only the generic one has updateQueryCorrectionMode).
interface DidYouMeanLike {
  state: DidYouMeanState;
  applyCorrection(): void;
  subscribe(listener: () => void): () => void;
}

export function DidYouMean({
  controller,
  className,
}: {
  controller: DidYouMeanLike;
  /** Wrapper spacing. Defaults to `mb-4` (the standalone-row look every existing caller relies
   *  on -- e.g. the Pokédex strip's contentDidYouMean, sitting directly above PokedexMatches).
   *  The /search Consultant panel passes `""`: it renders this inside a `space-y-3` response zone
   *  that already governs the gap between rows. */
  className?: string;
}) {
  const [state, setState] = useState(controller.state);
  useEffect(() => controller.subscribe(() => setState(controller.state)), [controller]);

  if (!state.hasQueryCorrection || state.wasAutomaticallyCorrected) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted px-4 py-2.5 text-sm text-foreground',
        className ?? 'mb-4'
      )}
    >
      <p>
        Did you mean{' '}
        <button
          type="button"
          className="pressable font-semibold text-primary hover:underline"
          onClick={() => controller.applyCorrection()}
        >
          {state.queryCorrection.correctedQuery}
        </button>
        ?
      </p>
      <CoveoChip capability="did-you-mean" />
    </div>
  );
}
