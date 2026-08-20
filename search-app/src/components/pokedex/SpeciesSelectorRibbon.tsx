import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TypeChips } from '@/components/pokedex/TypeChips';
import { RailArrows } from '@/components/RailArrows';
import { useScrollRail } from '@/lib/useScrollRail';
import { loadGenerationRoster, type RosterEntry } from '@/lib/pokedexRoster';
import { pokemonPath } from '@/lib/paths';
import { cn } from '@/lib/utils';

interface Props {
  generation?: number;
  currentName: string;
}

// Every species in the current generation, dex-number order, for hopping sideways without /search.
export function SpeciesSelectorRibbon({ generation, currentName }: Props) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const rail = useScrollRail(roster.length);

  useEffect(() => {
    if (generation == null) {
      setRoster([]);
      return;
    }
    let live = true;
    loadGenerationRoster(generation).then((list) => {
      if (live) setRoster(list);
    });
    return () => {
      live = false;
    };
  }, [generation]);

  if (roster.length < 2) return null;

  return (
    <div className="fade-in-panel mb-5 flex items-center gap-2">
      <p className="eyebrow shrink-0">Gen {generation}</p>
      <div ref={rail.railRef} onScroll={rail.onScroll} className="no-scrollbar flex snap-x gap-2 overflow-x-auto py-1">
        {roster.map((entry) => {
          const isCurrent = entry.name.toLowerCase() === currentName.toLowerCase();
          return (
            <Link
              key={entry.name}
              to={pokemonPath(entry.name)}
              aria-current={isCurrent ? 'page' : undefined}
              className={cn(
                'flex shrink-0 snap-start items-center gap-2 rounded-xl border px-3 py-2 transition-colors',
                isCurrent
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground'
              )}
            >
              {entry.number != null && (
                <span className="font-mono text-2xs font-bold text-primary">
                  #{String(entry.number).padStart(3, '0')}
                </span>
              )}
              <span className="text-xs font-bold">{entry.name}</span>
              <TypeChips types={entry.typeList} size="sm" />
            </Link>
          );
        })}
      </div>
      <RailArrows rail={rail} label="the generation roster" />
    </div>
  );
}
