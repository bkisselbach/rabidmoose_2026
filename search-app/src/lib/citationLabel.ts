/** The crawled pokemondb pages all title themselves "<Name> Pokédex: stats, moves, evolution &
 *  locations | Pokémon Database" -- unreadable as a citation chip next to the push doc's plain
 *  "Charizard". Trim both halves of the boilerplate and keep whatever name is left. */
export function citationLabel(title: string): string {
  const trimmed = title
    .replace(/\s*\|\s*Pok[eé]mon Database\s*$/i, '')
    .replace(/\s+Pok[eé]dex:\s*stats,\s*moves,\s*evolution\s*&(amp;)?\s*locations\s*$/i, '')
    .trim();
  return trimmed || title;
}
