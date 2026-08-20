import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { EvolutionStage } from '@/lib/pokedexRecord';
import { pokemonPath } from '@/lib/paths';
import { dealInProps } from '@/lib/dealIn';

interface Props {
  chain: EvolutionStage[];
  /** Highlighted, non-linked stage -- the Pokemon the surrounding page is already about. */
  currentName?: string;
  accent: { bg: string };
}

export function EvolutionChain({ chain, currentName, accent }: Props) {
  if (chain.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chain.map((stage, i) => {
        const isCurrent = stage.name.toLowerCase() === currentName?.toLowerCase();
        const stageCard = (
          <div className="flex flex-col items-center gap-1 rounded-md p-1.5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md"
              style={{ background: `linear-gradient(160deg, ${accent.bg}22, hsl(var(--muted)))` }}
            >
              {stage.imageUrl && (
                <img src={stage.imageUrl} alt={stage.name} className="max-h-full max-w-full object-contain" />
              )}
            </div>
            <span
              className={
                isCurrent
                  ? 'text-xs font-semibold text-foreground'
                  : 'text-xs font-medium text-muted-foreground'
              }
            >
              {stage.name}
            </span>
          </div>
        );
        return (
          <div key={stage.dexNumber} {...dealInProps(i, 'flex items-center gap-1')}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {isCurrent ? (
              <div className="rounded-md border" style={{ borderColor: accent.bg }}>
                {stageCard}
              </div>
            ) : (
              <Link
                to={pokemonPath(stage.name)}
                className="rounded-md hover:bg-muted"
              >
                {stageCard}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
