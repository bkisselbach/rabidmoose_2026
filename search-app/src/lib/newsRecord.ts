import type { Result } from '@coveo/headless';
import { NEWS_FIELDS, splitMultiValue } from '@/lib/newsFields';

// One `pokemon-news-push` document, mapped from the Search API's `result.raw` to parsed values.
// Mirrors pokedexRecord.ts, which does the same job for the species source -- one mapper, so every
// news surface reads the same shape and no component pokes at `raw` directly.

export interface NewsRecord {
  /** The Coveo result's own id, carried through so a news surface can find the `Result` behind a
   *  record and log a click event against it (see lib/useInteractiveResult.ts). `slug` is the
   *  routing key and is NOT a substitute: it comes from a pushed field, so it is only as unique as
   *  the corpus happens to be, while `uniqueId` is the index's own identity for the document. */
  uniqueId: string;
  slug: string;
  title: string;
  /** Milliseconds. Coveo returns `@date` as an epoch number, not an ISO string. */
  date: number | null;
  category: string;
  titles: string[];
  excerpt: string;
  species: string[];
  tags: string[];
  setName: string;
  cardQuery: string;
  sourceUrl: string;
  /** Local `/news/<slug>.<ext>` path, or `''` on a document pushed before download-images.ts ran. */
  heroImage: string;
}

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

/**
 * Maps a raw news document to a NewsRecord.
 *
 * NOTE THERE IS NO `body` HERE, and that is measured rather than an oversight. A search response
 * carries only `excerpt` -- a short, relevance-derived snippet (184 characters on a probed article,
 * 2026-08-17) -- never the full pushed `data`. The article body lives behind Coveo **Quickview**
 * (`hasHtmlVersion: true` on every one of these documents); `fetchNewsArticleBody` in
 * lib/newsArticle.ts is what retrieves it, and only the article page pays for that request.
 *
 * List surfaces therefore render `newsexcerpt` -- the REAL dek, stored as its own field -- rather
 * than anything derived from the document body. That is also why the dek is a field at all instead
 * of relying on Coveo's generated excerpt: the generated one is query-dependent and would change
 * from search to search, while a news tile's summary should not.
 */
export function newsRecordFromResult(result: Result): NewsRecord {
  const raw = result.raw as Record<string, unknown>;
  const rawDate = Number(raw.date);

  return {
    uniqueId: result.uniqueId,
    slug: str(raw[NEWS_FIELDS.slug]),
    title: result.title,
    date: Number.isFinite(rawDate) ? rawDate : null,
    category: str(raw[NEWS_FIELDS.category]),
    titles: splitMultiValue(raw[NEWS_FIELDS.titles]),
    excerpt: str(raw[NEWS_FIELDS.excerpt]),
    species: splitMultiValue(raw[NEWS_FIELDS.species]),
    tags: splitMultiValue(raw[NEWS_FIELDS.tags]),
    setName: str(raw[NEWS_FIELDS.setName]),
    cardQuery: str(raw[NEWS_FIELDS.cardQuery]),
    sourceUrl: str(raw[NEWS_FIELDS.sourceUrl]),
    heroImage: str(raw[NEWS_FIELDS.heroImage]),
  };
}

/** "August 17, 2026" -- the format pokemon.com's own listing uses. */
export function formatNewsDate(ms: number | null): string {
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
