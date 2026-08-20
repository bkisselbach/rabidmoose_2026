/** Canonical Pokemon type color palette -- used as accent bars/badges to tie the whole UI together. */
export const TYPE_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  Normal: { bg: '#A8A77A', text: '#3D3D2E', ring: '#8E8D5F' },
  Fire: { bg: '#EE8130', text: '#5C2D06', ring: '#C4661A' },
  Water: { bg: '#6390F0', text: '#0B2A6B', ring: '#3E6BD1' },
  Electric: { bg: '#F7D02C', text: '#5C4A00', ring: '#D4AF0C' },
  Grass: { bg: '#7AC74C', text: '#1E4A0C', ring: '#589A2E' },
  Ice: { bg: '#96D9D6', text: '#0C4F4C', ring: '#5FB8B4' },
  Fighting: { bg: '#C22E28', text: '#FFE3E1', ring: '#961F1A' },
  Poison: { bg: '#A33EA1', text: '#F8E3F7', ring: '#7E2B7C' },
  Ground: { bg: '#E2BF65', text: '#4A3A0A', ring: '#BE9C3F' },
  Flying: { bg: '#A98FF3', text: '#2C1D5C', ring: '#8267E0' },
  Psychic: { bg: '#F95587', text: '#5C0A26', ring: '#D63162' },
  Bug: { bg: '#A6B91A', text: '#333D05', ring: '#84930F' },
  Rock: { bg: '#B6A136', text: '#3D3410', ring: '#8F7E22' },
  Ghost: { bg: '#735797', text: '#EAE0F7', ring: '#54406F' },
  Dragon: { bg: '#6F35FC', text: '#EBE1FF', ring: '#4F1FD1' },
  Dark: { bg: '#705746', text: '#EDE2DA', ring: '#4F3C2F' },
  Steel: { bg: '#B7B7CE', text: '#2B2B3D', ring: '#8F8FAE' },
  Fairy: { bg: '#D685AD', text: '#5C1638', ring: '#B75D89' },
};

const FALLBACK = { bg: '#9CA3AF', text: '#1F2937', ring: '#6B7280' };

/** The TCG `cardtypes` facet uses an 11-value energy-type vocabulary that only partly overlaps
    this palette's 18 Pokedex species types (e.g. "Lightning"/"Darkness"/"Metal"/"Colorless" here
    vs. "Electric"/"Dark"/"Steel"/"Normal" there). Without this alias those 4 TCG types silently
    fell back to flat gray instead of a real color. Shared with typeIcons.ts for the same reason.

    A `TCG_CARD_TYPES` list of that 11-value vocabulary used to live here as the home type grid's
    display order; that grid reads the Pokédex's 18 types (`Object.keys(TYPE_COLORS)`) now, so the
    list had no callers left and was removed. localSuggestions.ts keeps its own typeahead
    vocabulary, which is a different list -- it adds the "Trainer"/"Energy" card kinds. */
export const TCG_TYPE_ALIASES: Record<string, string> = {
  Lightning: 'Electric',
  Darkness: 'Dark',
  Metal: 'Steel',
  Colorless: 'Normal',
};

export function typeColor(type: string | undefined): { bg: string; text: string; ring: string } {
  if (!type) return FALLBACK;
  return TYPE_COLORS[TCG_TYPE_ALIASES[type] ?? type] ?? FALLBACK;
}
