// catalog-scraper's enrich.ts appends a deterministic spec sentence (rarity/type/HP/set, plus an
// optional Pokedex species line) to every card's ec_description so free-text search picks up
// vocabulary the structured fields don't cover -- see enrichDescription() there. On the PDP that
// sentence just repeats facts already on screen, so this trims it for display only (the index and
// the SEO meta description both keep the full enriched text).
//
// Matched by shape, not by reconstructing the exact values (this module doesn't have ec_brand or
// the Pokedex join data the scraper used) -- the literal "Pokémon trading card" / "Trainer card" /
// "Energy card" phrasing is distinctive enough that it shouldn't appear in real flavor text, and a
// non-match just leaves the description untouched.
//
// The trailing dex-name clause uses `.` instead of `[^.]` -- enrich.ts interpolates the Pokedex's
// own display name there (e.g. "Mr. Mime", "Mime Jr.", "Mr. Rime"), which contains a period. Every
// other segment stays period-free on purpose: that's what anchors the match to start right at the
// appended sentence instead of swallowing the card's real flavor text ahead of it.
const ENRICHMENT_SUFFIX_RE =
  / [^.]+ (?:Pokémon trading card|Trainer card|Energy card)(?:, \d+ HP)?, from [^.]+\.(?: .+? is the [^.]+\.)?\s*$/;

export function trimEnrichmentSuffix(description: string): string {
  return description.replace(ENRICHMENT_SUFFIX_RE, '').trim();
}
