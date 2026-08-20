// Card names from the catalog scraper are `${card.name} — ${setName} #${card.localId}`
// (catalog-scraper/src/catalogItem.ts) and `card.name` itself carries TCG-specific prefixes/
// suffixes (e.g. "Pikachu VMAX", "Dark Charizard", "Mega Charizard X", "Latios & Latias-GX")
// that never appear in the Pokedex's plain species names. There's no shared join field between
// the two datasources, so this best-effort strips those decorations to recover the species name
// for an exact Pokedex lookup. A wrong guess just means the lookup below finds nothing and the
// panel stays hidden -- it never shows the wrong Pokemon.
const PREFIXES = [/^Mega\s+/i, /^M\s+/, /^Dark\s+/i, /^Light\s+/i, /^Shining\s+/i, /^Radiant\s+/i, /^Team Rocket'?s\s+/i, /^Rocket'?s\s+/i];

const SUFFIXES = [
  /\s*&\s*.+$/, // tag-team cards ("Latios & Latias-GX") -- keep only the first Pokemon
  /-?\s*(VMAX|VSTAR|V-UNION|V|GX|EX|ex|BREAK|Prime|LEGEND|Star|LV\.?X)$/,
  /\s*[δ*]$/,
  /\s+[XY]$/, // "Mega Charizard X" -- applied again after the "Mega " prefix strip below
];

function stripDecorations(name: string): string {
  let result = name;
  for (const re of SUFFIXES) result = result.replace(re, '').trim();
  return result;
}

/** Recovers the species name (e.g. "Charizard") a trading card depicts, from its `ec_name`. */
export function extractPokemonName(ecName: string): string {
  const cardName = ecName.split('—')[0].trim();
  let name = stripDecorations(cardName);
  for (const re of PREFIXES) name = name.replace(re, '').trim();
  name = stripDecorations(name);
  return name;
}
