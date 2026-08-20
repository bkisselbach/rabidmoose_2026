// Single source of truth for the app's entity URLs, so every surface builds the same
// SEO-friendly shape and the route table only has to change in one place.
//
//   /pokedex/mr-mime                     (species -- name slug is the whole identifier)
//   /card/base1-4/charizard-base-set-4   (card -- id is the lookup key, slug is for humans/SEO)

//   /pokemon-news/errata-for-diancie-...  (news article -- the slug IS the identifier)
//
// Lowercase, ASCII, hyphen-separated: "Charizard -- Base Set #4" -> "charizard-base-set-4",
// "Flabebe (accented)" -> "flabebe", "Nidoran (female)" -> "nidoran-f" (PokeAPI's convention for
// the gender pair, which also keeps the two Nidoran slugs distinct).
export function slugify(text: string): string {
  return text
    .replace(/\u2640/g, ' f') // female sign
    .replace(/\u2642/g, ' m') // male sign
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // combining marks left over from NFKD (e-acute -> e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function pokemonPath(name: string): string {
  return `/pokedex/${slugify(name)}`;
}

// No slugify() here, deliberately: a news slug is not derived from a title, it IS the article's
// stored identity (`@newsslug`), copied from the real pokemon.com article and used verbatim as the
// lookup key. Re-slugifying it would risk changing a value that has to match the index exactly.
export function newsPath(slug: string): string {
  return `/pokemon-news/${encodeURIComponent(slug)}`;
}

// The id alone still resolves (the slug segment is optional and never used for lookup), so
// links built before the product's name is known -- or old /card/:id bookmarks -- keep working.
export function cardPath(id: string, name?: string | null): string {
  const base = `/card/${encodeURIComponent(id)}`;
  const slug = name ? slugify(name) : '';
  return slug ? `${base}/${slug}` : base;
}
