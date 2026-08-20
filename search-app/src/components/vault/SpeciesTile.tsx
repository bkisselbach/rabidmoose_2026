import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { InteractiveResult, Result } from '@coveo/headless';
import { interactiveResultProps } from '@/lib/useInteractiveResult';
import { CONTENT_FIELDS } from '@/contentFields';
import { TypeIconCircles } from '@/components/pokedex/TypeIconCircles';
import { PokedexCard, PokedexCardSkeleton } from '@/components/pokedex/PokedexCard';
import { typeColor } from '@/lib/typeColors';
import { pokemonPath } from '@/lib/paths';

function speciesFields(result: Result) {
  const name = (result.raw[CONTENT_FIELDS.name] as string) ?? result.title;
  const image = result.raw[CONTENT_FIELDS.image] as string | undefined;
  const rawTypes = (result.raw[CONTENT_FIELDS.type] as string[] | string | undefined) ?? [];
  const typeList = (Array.isArray(rawTypes) ? rawTypes : [rawTypes]).flatMap((t) => t.split(';')).filter(Boolean);
  // Coerce and reject NaN rather than rendering "No. NaN" if a record is missing the field.
  const rawNumber = Number(result.raw[CONTENT_FIELDS.number]);
  const rawGeneration = Number(result.raw[CONTENT_FIELDS.generation]);
  const species = result.raw[CONTENT_FIELDS.species] as string | undefined;
  const flavorText = result.raw[CONTENT_FIELDS.flavorText] as string | undefined;
  return {
    name,
    image,
    typeList,
    number: Number.isFinite(rawNumber) ? rawNumber : null,
    generation: Number.isFinite(rawGeneration) ? rawGeneration : null,
    species,
    flavorText: flavorText?.split(/\n+/).find((line) => line.trim().length > 0),
  };
}

export function SpeciesTileSkeleton() {
  return <PokedexCardSkeleton size="md" />;
}

function SpeciesTileImpl({ result, interactiveResult }: { result: Result; interactiveResult: InteractiveResult }) {
  return <PokedexCard result={result} size="md" interactiveResult={interactiveResult} />;
}

/** List-view row: wider, with the genus and the flavor text's first line. */
export function SpeciesRow({ result, interactiveResult }: { result: Result; interactiveResult: InteractiveResult }) {
  const { name, image, typeList, number, generation, species, flavorText } = speciesFields(result);
  const accent = typeColor(typeList[0]);

  return (
    <Link
      to={pokemonPath(name)}
      data-testid="species-row"
      {...interactiveResultProps(interactiveResult)}
      className="card-hover group flex items-center gap-4 rounded-xl border border-border bg-card p-3 shadow-rest"
      style={{ borderColor: `color-mix(in oklab, ${accent.bg} 35%, transparent)` }}
    >
      <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
        {image && (
          <img src={image} alt={name} loading="lazy" className="max-h-[82%] max-w-[82%] object-contain" />
        )}
        <TypeIconCircles types={typeList} size="xs" className="absolute right-1 top-1" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {number != null && (
            <span
              className="rounded px-1.5 py-0.5 font-mono text-2xs font-bold tabular-nums"
              style={{ backgroundColor: accent.bg, color: accent.text }}
            >
              No. {String(number).padStart(4, '0')}
            </span>
          )}
          <span className="card-title-link truncate text-sm font-semibold text-foreground">{name}</span>
          {generation != null && <span className="shrink-0 text-2xs text-muted-foreground">Gen {generation}</span>}
        </div>
        {species && <p className="mt-0.5 truncate text-xs text-muted-foreground">{species}</p>}
        {flavorText && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{flavorText}</p>}
      </div>
    </Link>
  );
}

// MEMOIZED (item 31c / performance-plan.md §4b). SpeciesTile is a pure function of its props, and the
// grids that render it re-render on every notification from any controller subscription on the
// page -- eighteen tiles re-rendering because a facet count changed somewhere else.
//
// THIS ONLY WORKS BECAUSE 31c's FIRST HALF LANDED. Until `useInteractiveProducts` cached the
// controllers, the `interactiveProduct` prop was a fresh object on every render, so a memo
// comparison could never match and this wrapper would have been decoration that read like an
// optimization. Sequence matters here; do not port this to a tile whose controller prop is still
// rebuilt inline.
export const SpeciesTile = memo(SpeciesTileImpl);
