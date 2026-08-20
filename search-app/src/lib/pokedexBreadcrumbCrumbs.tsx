import type { Crumb } from '@/components/Breadcrumbs';
import { ALL_GENERATIONS } from '@/components/GenerationFacet';
import { TYPE_COLORS, typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';

const ALL_TYPES = Object.keys(TYPE_COLORS);

// Sentinel select value for the "clear this filter" option -- distinct from any real
// generation/type value so callers can tell a clear apart from a normal selection.
export const CLEAR_CRUMB_VALUE = '__all__';

export function buildPokedexCrumbs(opts: {
  generation?: number;
  // Only differs from `generation` when a legacy shared/bookmarked URL restored a multi-
  // generation range (the old GenerationFacet slider let you pick e.g. 2..5) -- shown so the
  // crumb doesn't silently mislabel a range as a single generation.
  generationRangeEnd?: number;
  primaryType?: string;
  onGenerationChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  // SearchResultsPage's Generation/Type crumbs are active *filters* that need a way back to
  // "no filter"; CharacterDetailPage's are just the viewed Pokemon's own attributes, which
  // can't be "cleared", so it omits this.
  clearable?: boolean;
}): Crumb[] {
  const { generation, generationRangeEnd, primaryType, onGenerationChange, onTypeChange, clearable } = opts;
  const generationLabel =
    generation != null && generationRangeEnd != null && generationRangeEnd !== generation
      ? `Generation ${generation}–${generationRangeEnd}`
      : `Generation ${generation}`;
  return [
    ...(generation != null
      ? [
          {
            label: generationLabel,
            select: {
              value: String(generation),
              options: [
                ...(clearable ? [{ value: CLEAR_CRUMB_VALUE, label: 'All Generations' }] : []),
                ...ALL_GENERATIONS.map((g) => ({ value: String(g), label: `Generation ${g}` })),
              ],
              onChange: onGenerationChange,
            },
          },
        ]
      : []),
    ...(primaryType
      ? [
          {
            label: primaryType,
            select: {
              value: primaryType,
              options: [
                ...(clearable ? [{ value: CLEAR_CRUMB_VALUE, label: 'All Types' }] : []),
                ...ALL_TYPES.map((t) => {
                  const c = typeColor(t);
                  const Icon = typeIcon(t);
                  return { value: t, label: t, icon: <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: c.bg }} /> };
                }),
              ],
              onChange: onTypeChange,
            },
          },
        ]
      : []),
  ];
}
