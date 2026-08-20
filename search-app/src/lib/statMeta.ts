// The six base stats' presentation vocabulary, in one place. This used to live as two identical
// copies -- one in `StatBars`, one in `StatRadarChart` -- which was survivable while both were
// species-page components rendering the same six axes side by side. `VaultSpotlight` picking out a
// species' single strongest stat would have made a third copy, and a third copy is where a table
// like this starts to drift: a colour changed in one place reads as a different stat in another,
// on the same page.
//
// Fixed per-stat colour, deliberately NOT the species' type accent, so the same axis is the same
// colour on every species -- the point of the table is that DEF is always blue, whoever is bulky.

/** Short form for the axis labels; the full names are what the index stores. */
export const STAT_ABBREVIATIONS: Record<string, string> = {
  HP: 'HP',
  Attack: 'ATK',
  Defense: 'DEF',
  'Sp. Atk': 'SPA',
  'Sp. Def': 'SPD',
  Speed: 'SPE',
};

export const STAT_COLORS: Record<string, string> = {
  HP: '#F43F5E',
  Attack: '#F59E0B',
  Defense: '#3B82F6',
  'Sp. Atk': '#A855F7',
  'Sp. Def': '#14B8A6',
  Speed: '#10B981',
};

/** Falls back to the first three letters so an unexpected stat label still renders as a label
 *  rather than as blank space -- the index is scraped, and its stat names are not a closed set we
 *  control. */
export const statAbbreviation = (label: string) =>
  STAT_ABBREVIATIONS[label] ?? label.slice(0, 3).toUpperCase();

export const statColor = (label: string) => STAT_COLORS[label] ?? 'hsl(var(--primary))';
