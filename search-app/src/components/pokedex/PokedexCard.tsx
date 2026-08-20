import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { InteractiveResult, Result } from '@coveo/headless';
import { interactiveResultProps } from '@/lib/useInteractiveResult';
import { CONTENT_FIELDS } from '@/contentFields';
import { TypeIconCircles } from '@/components/pokedex/TypeIconCircles';
import { typeColor } from '@/lib/typeColors';
import { pokemonPath } from '@/lib/paths';
import { cn } from '@/lib/utils';

// Shared species-card tile for the Vault grid (`md`) and the /search results rail (`sm`).

const SIZES = {
  sm: {
    wrapper: 'w-20 sm:w-24',
    padding: 'p-2',
    rounded: 'rounded-xl',
    art: 'rounded-lg',
    badgeSize: 'xs' as const,
    pill: 'px-1 py-0.5 text-2xs',
    name: 'text-xs',
  },
  md: {
    wrapper: 'w-full',
    padding: 'p-3',
    rounded: 'rounded-2xl',
    art: 'rounded-xl',
    badgeSize: 'xs' as const,
    pill: 'px-1.5 py-0.5 text-2xs',
    name: 'text-sm',
  },
} as const;

function pokedexCardFields(result: Result, filteredTypes: readonly string[]) {
  const name = (result.raw[CONTENT_FIELDS.name] as string) ?? result.title;
  const image = result.raw[CONTENT_FIELDS.image] as string | undefined;
  const rawTypes = (result.raw[CONTENT_FIELDS.type] as string[] | string | undefined) ?? [];
  const typeList = (Array.isArray(rawTypes) ? rawTypes : [rawTypes]).flatMap((t) => t.split(';')).filter(Boolean);
  const rawNumber = Number(result.raw[CONTENT_FIELDS.number]);
  const rawGeneration = Number(result.raw[CONTENT_FIELDS.generation]);

  // Lead with the filtered type when the species matched via one of two types, so the tile
  // visibly reflects the active filter. Stable sort preserves Pokédex order otherwise.
  const ordered = filteredTypes.length
    ? [...typeList].sort((a, b) => Number(filteredTypes.includes(b)) - Number(filteredTypes.includes(a)))
    : typeList;

  return {
    name,
    image,
    typeList: ordered,
    number: Number.isFinite(rawNumber) ? rawNumber : null,
    generation: Number.isFinite(rawGeneration) ? rawGeneration : null,
  };
}

export function PokedexCardSkeleton({ size = 'md' }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <div className={cn('flex shrink-0 flex-col gap-2 border border-border bg-card shadow-rest', s.wrapper, s.padding, s.rounded)}>
      <div className={cn('skeleton aspect-square w-full', s.art)} />
      <div className="skeleton h-3 w-3/4 rounded-full" />
    </div>
  );
}

interface Props {
  result: Result;
  size?: keyof typeof SIZES;
  filteredTypes?: readonly string[];
  showMeta?: boolean;
  className?: string;
  onClick?: () => void;
  /** Logs the Coveo click event for this species. Taken as a PROP rather than built here, exactly
   *  as `ProductCard` takes `interactiveProduct`: this tile is rendered by three different
   *  engines' surfaces (/search's rail on `searchEngine`, the Vault grid on `vaultEngine`, the
   *  search box's instant panel), and each must attribute its click to the engine that actually
   *  produced the result. Optional so a caller with no result list behind it can omit it rather
   *  than pass something misattributed — see lib/inertInteractiveResult.ts. */
  interactiveResult?: InteractiveResult;
}

function PokedexCardImpl({
  result,
  size = 'md',
  filteredTypes = [],
  showMeta = true,
  className,
  onClick,
  interactiveResult,
}: Props) {
  const { name, image, typeList, number, generation } = pokedexCardFields(result, filteredTypes);
  const accent = typeColor(typeList[0]);
  const s = SIZES[size];

  return (
    <Link
      to={pokemonPath(name)}
      data-testid="pokedex-card"
      // The Coveo click event first, then whatever the call site wanted the click for (SearchBox
      // closes its panel). `onAuxClick` comes from the shared helper because middle click never
      // fires `onClick`; the left/modified-click path is written out here rather than spread, so
      // the call site's own `onClick` composes with it instead of replacing it.
      onAuxClick={interactiveResult ? interactiveResultProps(interactiveResult).onAuxClick : undefined}
      onClick={() => {
        interactiveResult?.select();
        onClick?.();
      }}
      className={cn(
        'card-hover group relative flex shrink-0 snap-start flex-col gap-1.5 border border-border bg-card shadow-rest',
        s.wrapper,
        s.padding,
        s.rounded,
        className
      )}
      style={{ borderColor: `color-mix(in oklab, ${accent.bg} 35%, transparent)` }}
    >
      {/* White plate, not tinted: sprite art mixes transparent PNGs and pre-matted art. */}
      <span className={cn('relative flex aspect-square w-full items-center justify-center overflow-hidden bg-white', s.art)}>
        {image && (
          <img
            src={image}
            alt={name}
            loading="lazy"
            className="max-h-[80%] max-w-[80%] transform-gpu object-contain transition-transform duration-300 group-hover:scale-110"
          />
        )}
        <TypeIconCircles types={typeList} size={s.badgeSize} className="absolute right-1 top-1" />
      </span>

      {showMeta && (
        <div className="flex items-center justify-between gap-1.5">
          {number != null && (
            <span
              className={cn('rounded font-mono font-bold tabular-nums', s.pill)}
              style={{ backgroundColor: accent.bg, color: accent.text }}
            >
              No. {String(number).padStart(4, '0')}
            </span>
          )}
          {generation != null && size === 'md' && <span className="text-2xs text-muted-foreground">Gen {generation}</span>}
        </div>
      )}

      {/* Same name treatment as ProductCard/ProductListItem (2026-08-18, CSS/theming audit):
          `font-semibold` and `.card-title-link`'s dotted underline, which `.card-hover:hover`
          solidifies. The two card families rendered their names at different weights and only the
          product one looked clickable, so a grid mixing them read as two designs.

          AN <h3>, NOT A <span> (2026-08-19, visual-consistency audit) -- and the tag is the whole
          fix. ProductCard's name is an h3, so it picks up `letter-spacing: -0.025em` from
          index.css's `h1, h2, h3` base rule; this one, as a span, did not. Measured side by side:
          14px/600/-0.35px on a product tile against 14px/600/NORMAL on a species tile, in grids
          that mix the two families on /search and the article page. Same size, same weight, one
          tracked and one not. Spelling `tracking-tight` here would have matched today's pixels and
          silently desynced the next time that base rule moved; taking the tag both agree on cannot.
          It also gives the Vault grid a document outline, which it had none of. */}
      <h3
        className={cn(
          'card-title-link line-clamp-1 w-full font-semibold text-foreground',
          showMeta ? '' : 'text-center',
          s.name
        )}
      >
        {name}
      </h3>
    </Link>
  );
}

// MEMOIZED (item 31c / performance-plan.md §4b). PokedexCard is a pure function of its props, and the
// grids that render it re-render on every notification from any controller subscription on the
// page -- eighteen tiles re-rendering because a facet count changed somewhere else.
//
// THIS ONLY WORKS BECAUSE 31c's FIRST HALF LANDED. Until `useInteractiveProducts` cached the
// controllers, the `interactiveProduct` prop was a fresh object on every render, so a memo
// comparison could never match and this wrapper would have been decoration that read like an
// optimization. Sequence matters here; do not port this to a tile whose controller prop is still
// rebuilt inline.
export const PokedexCard = memo(PokedexCardImpl);
