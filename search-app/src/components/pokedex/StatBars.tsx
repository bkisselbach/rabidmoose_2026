import type { CSSProperties } from 'react';
import type { PokemonStat } from '@/lib/pokedexRecord';
import { statAbbreviation, statColor } from '@/lib/statMeta';

// Fixed floor of 150 for the scale so a weak Pokemon's bars read as short, not the row always
// stretching to its own strongest stat. The abbreviation and colour tables moved to
// `lib/statMeta.ts` when a third surface needed them -- see that file for why they are shared.

export function StatBars({ stats }: { stats: PokemonStat[] }) {
  if (stats.length === 0) return null;
  const scaleMax = Math.max(150, ...stats.map((s) => s.value));
  const total = stats.reduce((n, s) => n + s.value, 0);
  return (
    <div className="space-y-2">
      {stats.map((s, index) => (
        <div key={s.label} className="grid grid-cols-[42px_minmax(0,1fr)_36px] items-center gap-2">
          <span className="eyebrow">
            {statAbbreviation(s.label)}
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            {/* The bar GROWS from zero, top row first, like the games' own stat screen
                (2026-08-18, motion-system-plan.md M3).

                This replaced `transition-all duration-700`, which was wrong in two ways beyond
                being off the app's duration ladder. `all` animated every property of the bar,
                including its background colour on any re-render that changed it; and a transition
                fires on CHANGE, not on arrival, so it did nothing at all on first paint (there is
                no previous width to move from) and then animated later at moments the visitor had
                no reason to expect. A keyframe plays exactly once, on arrival, which is when a
                stat bar has something to say.

                The real width goes through `--stat-width` because the keyframe has to END on it;
                `width` itself stays set too, so the bar holds its value if the animation never
                runs at all (reduced motion collapses the duration to near zero and the `both`
                fill leaves it exactly here). */}
            <div
              className="stat-grow h-full rounded-full"
              style={
                {
                  // `--deal-index` is the same per-item stagger convention the grids use
                  // (lib/dealIn.ts), but NOT `.deal-in` itself: that class sets `animation`, and so
                  // does `.stat-grow`, so wearing both would leave one silently overwriting the
                  // other depending on rule order. Six bars is also a fixed, short list -- it takes
                  // the ramp built into `.stat-grow` rather than a capped one.
                  '--deal-index': index,
                  '--stat-width': `${Math.min(100, (s.value / scaleMax) * 100)}%`,
                  width: `${Math.min(100, (s.value / scaleMax) * 100)}%`,
                  backgroundColor: statColor(s.label),
                } as CSSProperties
              }
            />
          </div>
          <span className="text-right text-xs font-bold tabular-nums text-foreground">{s.value}</span>
        </div>
      ))}
      <p className="pt-0.5 text-right text-2xs text-muted-foreground">Total {total}</p>
    </div>
  );
}
