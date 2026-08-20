// Display forms for the `cardrarity` vocabulary, for the places that render rarity as TEXT in a
// card's identity line rather than as its own chip (2026-08-17 -- see the plan note on
// ProductCard's top strip for why rarity stopped being a chip).
//
// Only the pathologically long values get a short form; everything else passes through untouched.
// The live vocabulary is 15 values, and the three that dominate it -- Common (1148), Uncommon
// (1012), Rare (853), roughly 80% of the catalog between them -- are already short. The ones that
// needed shortening are the rare ones, which is the whole reason the chip they used to live in
// looked broken: it sized itself for "Common" and then had to swallow
// "Special illustration rare" (25 characters) inside a 10px pill.
//
// Matching is case-insensitive on purpose. The index is inconsistent about it -- `Ultra Rare` and
// `Secret Rare` are title case while `Illustration rare`, `Special illustration rare`, `Double
// rare` and `Hyper rare` are not -- and that inconsistency is invisible today only because every
// render is CSS-uppercased. A map keyed on exact strings would silently miss half of them.
//
// `SIR` is not invented here: it is already this domain's own abbreviation, and the commerce query
// pipeline carries `sir ⇄ special illustration rare` as a thesaurus entry, so a shopper typing it
// already finds these cards.
//
// Deliberately NOT abbreviating `Holo Rare V`/`VMAX` down to bare `V`/`VMAX`: the card-system plan
// derives a variant token (`V`, `ex`, `VMAX`) from the product NAME, and two adjacent elements both
// reading "V" would be worse than one long label. The `HOLO ` prefix keeps them distinguishable.
const SHORT_FORMS: Array<[match: string, short: string]> = [
  // Longest first -- `Special illustration rare` contains `Illustration rare`, so an unordered
  // lookup that happened to test the shorter one first would mislabel it.
  ['special illustration rare', 'SIR'],
  ['illustration rare', 'IR'],
  ['rare holo lv.x', 'HOLO LV.X'],
  ['holo rare vstar', 'HOLO VSTAR'],
  ['holo rare vmax', 'HOLO VMAX'],
  ['holo rare v', 'HOLO V'],
  // The "…Rare" compounds drop the redundant half. Nearly every value in this vocabulary ends in
  // "Rare", so the word carries no information once it is sitting in a rarity slot -- while the
  // qualifier in front of it carries all of it. Added after measuring: `ULTRA RARE` next to a long
  // print number (`#198/216 · ULTRA RARE`) was still overflowing the strip on 2 of 23 PLP tiles,
  // which is the same "some tiles show it, some don't" inconsistency this whole change is about.
  ['ultra rare', 'ULTRA'],
  ['secret rare', 'SECRET'],
  ['double rare', 'DOUBLE'],
  ['hyper rare', 'HYPER'],
  ['amazing rare', 'AMAZING'],
  // `Holo Rare` and `Rare Holo` are deliberately NOT shortened, even though they are the same
  // length as the ones above. They are two separate values in the index (53 and 52 products) that
  // mean the same thing -- a real taxonomy duplication -- and collapsing both to `HOLO` would make
  // two distinct, separately-selectable facet values render identically. Better a label that
  // occasionally truncates than one that quietly merges two filters.
];

/** The short display form of a rarity, or the value unchanged when it is already short enough.
 *  Returns undefined for a missing rarity so callers can drop the segment entirely. */
export function rarityLabel(rarity: string | undefined): string | undefined {
  if (!rarity) return undefined;
  const key = rarity.trim().toLowerCase();
  return SHORT_FORMS.find(([match]) => match === key)?.[1] ?? rarity;
}

// The three values that are NOT a holo printing. Everything else in the vocabulary is -- Ultra,
// Secret, Illustration, Special Illustration, Double, Holo Rare (both spellings), Holo Rare
// V/VMAX/LV.X, Hyper and Amazing.
//
// Expressed as the complement deliberately, and it is the neater half of the taxonomy by a wide
// margin: these three cover 3,013 of 3,754 products (~80%), so the list to maintain is three
// entries instead of twelve, and a rarity added to the catalog tomorrow is treated as special
// rather than silently missing out. The failure mode of the inverse list -- a new Hyper-something
// printing that quietly never shines -- is the one that would go unnoticed.
const NON_HOLO = new Set(['common', 'uncommon', 'rare']);

/** Whether a card is a holo printing, and therefore whether its art earns the foil treatment.
 *
 *  Gating the shine on real indexed data is the entire point: roughly one card in five qualifies,
 *  so the effect means "this printing is special" instead of being chrome applied to everything.
 *  A $0.01 Common never shines. Unknown/missing rarity does not shine either -- the recommendation
 *  surfaces that arrive without `additionalFields` should stay calm rather than guess. */
export function isHoloRarity(rarity: string | undefined): boolean {
  if (!rarity) return false;
  return !NON_HOLO.has(rarity.trim().toLowerCase());
}
