/**
 * Pokémon News field API names -- must match the fields created in Coveo Admin for the
 * `pokemon-news-push` source, and the names `news-scraper/src/push.ts` writes.
 *
 * ONE MAP, NO INLINE STRING LITERALS, and this is not just tidiness. Measured on this org
 * 2026-08-17: naming a field that does not exist in a request's `fieldsToInclude` does not omit
 * that field -- it returns ZERO RESULTS for the entire query, with HTTP 200, no error and no
 * console warning. A single typo in a `buildResultList` option therefore renders an empty news
 * page that looks exactly like "no articles match", and nothing anywhere reports why. Routing every
 * field name through this map makes that a TypeScript error instead.
 *
 * Mirrors `contentFields.ts`, which does the same job for the pokedex-push source.
 *
 * NOT LISTED HERE, deliberately -- four Coveo built-ins carry the rest, and using them beats a
 * custom field in every case:
 *   @title        the headline
 *   @date         the publish date, ALREADY SORTABLE -- this is what the Newest/Oldest sort runs
 *                 on, and why no `newsdate` field exists. The org has a recorded InvalidSortField
 *                 failure on @pokemonname caused by creating a custom field without its Sortable
 *                 flag; a built-in cannot fail that way.
 *   @clickableuri our own /pokemon-news/:slug page (NOT pokemon.com -- see newsSourceUrl below)
 *   @source       "pokemon-news-push", which is how every engine scopes to this corpus
 */
export const NEWS_FIELDS = {
  /** Single-value facet -- the six real pokemon.com categories. */
  category: 'newscategory',
  /** Multi-value facet -- the real "Video Game & App Titles" filter values. */
  titles: 'newstitles',
  /** Multi-value facet -- species named in the story; drives artwork and the Pokédex links. */
  species: 'newsspecies',
  /** Multi-value facet -- topic chips, which are real round-tripping facet URLs. */
  tags: 'newstags',
  /** Facet -- the TCG set named in the story; drives the set logo and a /search cross-link. */
  setName: 'newssetname',
  /** Facet -- the article's identity. The article page resolves `/pokemon-news/:slug` by querying
   *  `@newsslug=="<slug>"`, so this one being facetable is load-bearing: if it isn't, every article
   *  page fails to find its article. */
  slug: 'newsslug',
  /** The one-line dek shown on every tile. Free-text searchable so a query can match it. */
  excerpt: 'newsexcerpt',
  /** Free-text commerce query feeding the article's "Cards in this story" rail (ShopCardsPanel).
   *  Deliberately NOT free-text searchable -- it is plumbing, and indexing it would let a card
   *  query term pollute news relevance. */
  cardQuery: 'newscardquery',
  /** The real pokemon.com article, credited on every article page. Separate from @clickableuri,
   *  which points at our own page -- a result click must land on RabidMoose, not off-site. */
  sourceUrl: 'newssourceurl',
  /** Local `/news/<slug>.<ext>` path to the article's self-hosted hero image -- see
   *  news-scraper/src/download-images.ts. NEVER a pokemon.com URL: NewsArt.tsx renders this
   *  directly as an <img src>, and hotlinking their CDN was rejected the same way the sprite/set
   *  art already is (not ours to serve, breaks without warning). */
  heroImage: 'newsheroimage',
} as const;

/**
 * Every field name a news request must ask for.
 *
 * `date` IS IN THIS LIST and has to be. It is a Coveo built-in, which makes it easy to assume it
 * arrives for free -- it does, but only on a request that specifies no `fieldsToInclude` at all.
 * The moment a request names its fields, `raw` contains those fields and nothing else. Without it
 * here, `raw.date` was undefined on every listing result and every tile silently rendered with no
 * date line: not an error, not a warning, just a newsroom with no dates on it, which a human eye
 * skims straight past. Caught by asserting the rendered order was newest-first.
 */
export const NEWS_FIELD_LIST = [...Object.values(NEWS_FIELDS), 'date'];

/** The corpus's source, and the `cq` scope for the news engine. */
export const NEWS_SOURCE = 'pokemon-news-push';

/** Multi-value fields arrive either as a real array or as a `;`-joined string depending on how the
 *  response is shaped -- the same contract `SpeciesTile` already handles for `pokemontype`. */
export function splitMultiValue(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.flatMap((v) => String(v).split(';')).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(';').map((s) => s.trim()).filter(Boolean);
  return [];
}
