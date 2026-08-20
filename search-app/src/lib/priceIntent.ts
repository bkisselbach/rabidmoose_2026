// Budget understanding: turns the money half of a conversational query into a real price range.
//
// The third dimension of the same idea as queryIntent.ts's types and cardRarities.ts's rarity
// ladder -- a shopper says "budget deck under $25" and means one filter, not three keywords. Same
// two-layer split as its siblings: the *parse* is pure and synchronous (below), the *resolution*
// against what the catalog actually holds is async and cached.
//
// WHY THE TIERS ARE READ, NOT HARDCODED. The obvious implementation is a constant -- "cheap" means
// under $25, done. That constant would be a lie the moment a merchandiser retunes the Price facet
// in the Merchandising Hub, and the whole point of this app is that merchandiser config drives the
// experience. So the loose words resolve against the live `ec_price` facet's own buckets (fetched
// once per session), which are exactly the tiers a merchandiser sees in the Hub. Explicit numbers
// ("under $25") are taken at face value -- the shopper named a boundary, and no vocabulary can
// second-guess that -- but even they need one live read, for the open-ended case (see PriceIntent).
//
// DELIBERATELY NOT HERE: "vintage". It reads as a price word and is not one -- it means *old*, and
// the cheapest cards in this catalog are Base Set commons from 1999. Routing it to a price range
// would filter on the wrong axis and be wrong in a way the UI couldn't explain; era belongs to the
// set/series facets. Better to leave it unparsed than to confidently mishandle it.

import { getVisitorId } from '@/lib/visitorId';

/** A concrete, applicable price range. `endInclusive` mirrors the Coveo numeric-facet contract. */
export interface PriceRange {
  start: number;
  end: number;
  endInclusive: boolean;
}

/** What the sentence asked for, before the catalog has been consulted.
 *  - `explicit`: the shopper named numbers. `end: null` means open-ended ("over $100") and gets its
 *    ceiling from the live top tier rather than a hardcoded sentinel.
 *  - `term`: a loose word ("budget"), resolved to whichever live tier it names. */
export type PriceIntent =
  | { kind: 'explicit'; start: number; end: number | null; matched: string }
  | { kind: 'term'; term: string; matched: string };

/** Loose price words, grouped by which end of the live tier list they point at. Values are the
 *  words a shopper actually types; the dollar amounts they resolve to come from the catalog. */
const CHEAP_TERMS = ['cheap', 'budget', 'affordable', 'inexpensive', 'bargain'];
const PREMIUM_TERMS = ['premium', 'expensive', 'pricey', 'chase', 'grail'];

const ALL_TERMS = [...CHEAP_TERMS, ...PREMIUM_TERMS];

/** `$1,250.50` / `25` -> number. Commas are thousands separators here, never decimals. */
function toAmount(raw: string): number {
  return Number(raw.replace(/[$,]/g, ''));
}

const AMOUNT = String.raw`\$?\s*(\d[\d,]*(?:\.\d{1,2})?)`;
/** The same amount with the `$` made mandatory rather than optional. Used by the two-sided "25-100"
 *  shape, which is the one pattern here with no cue word of its own: a bare pair of numbers around
 *  a dash is far more often a card or set number than a budget -- `ec_name` is literally
 *  "<name> — <set> #<number>" -- so "base set 1-100" and "cards 1999-2000" were both being read as
 *  price ranges. Requiring a currency marker on one side is what makes the numbers money. */
const DOLLARS = String.raw`\$\s*(\d[\d,]*(?:\.\d{1,2})?)`;
const BARE = String.raw`(\d[\d,]*(?:\.\d{1,2})?)`;

// Ordered most-specific-first: a two-sided range has to be tested before the one-sided patterns,
// or "between $25 and $100" matches the "over $25" rule and silently loses its ceiling.
const RANGE_PATTERNS: { re: RegExp; build: (m: RegExpMatchArray) => PriceIntent }[] = [
  {
    re: new RegExp(String.raw`\bbetween\s+${AMOUNT}\s+(?:and|to|-)\s+${AMOUNT}`, 'i'),
    build: (m) => ({ kind: 'explicit', start: toAmount(m[1]), end: toAmount(m[2]), matched: m[0] }),
  },
  {
    re: new RegExp(String.raw`${DOLLARS}\s*(?:-|–|to)\s*${AMOUNT}`, 'i'),
    build: (m) => ({ kind: 'explicit', start: toAmount(m[1]), end: toAmount(m[2]), matched: m[0] }),
  },
  {
    re: new RegExp(String.raw`${BARE}\s*(?:-|–|to)\s*${DOLLARS}`, 'i'),
    build: (m) => ({ kind: 'explicit', start: toAmount(m[1]), end: toAmount(m[2]), matched: m[0] }),
  },
  {
    re: new RegExp(String.raw`\b(?:under|below|less than|cheaper than|up to|max|maximum|within)\s+${AMOUNT}`, 'i'),
    build: (m) => ({ kind: 'explicit', start: 0, end: toAmount(m[1]), matched: m[0] }),
  },
  {
    re: new RegExp(String.raw`${AMOUNT}\s+or\s+(?:less|under|below|cheaper)`, 'i'),
    build: (m) => ({ kind: 'explicit', start: 0, end: toAmount(m[1]), matched: m[0] }),
  },
  {
    // No bare "from" here on purpose: it is a cue for provenance far more often than for price
    // ("cards from 1999", "charizard from 151"), and it was turning those into a "$1999 and up"
    // filter that returns nothing. "starting at"/"at least" carry the same meaning unambiguously.
    re: new RegExp(String.raw`\b(?:over|above|more than|at least|starting at)\s+${AMOUNT}`, 'i'),
    build: (m) => ({ kind: 'explicit', start: toAmount(m[1]), end: null, matched: m[0] }),
  },
  {
    re: new RegExp(String.raw`${AMOUNT}\s+or\s+(?:more|over|above)`, 'i'),
    build: (m) => ({ kind: 'explicit', start: toAmount(m[1]), end: null, matched: m[0] }),
  },
];

/**
 * Reads the budget out of a sentence. Pure and synchronous, like queryIntent.ts's parseQuery --
 * everything decided here comes from the text alone.
 *
 * Explicit numbers win over loose words: "cheap charizard under $50" means $50, not "the cheapest
 * tier", because the shopper stated a boundary and the word was only ever a stand-in for one.
 */
export function parsePriceIntent(raw: string): PriceIntent | null {
  const text = raw.trim();
  if (!text) return null;

  for (const { re, build } of RANGE_PATTERNS) {
    const match = text.match(re);
    // A bare "5" in "base set 5" is not a budget; every pattern above requires a price *cue* --
    // a cue word ("under", "over", "between") or a literal "$" -- so a match here is intentional.
    if (match) return build(match);
  }

  const lowered = text.toLowerCase();
  const term = ALL_TERMS.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(lowered));
  return term ? { kind: 'term', term, matched: term } : null;
}

/** The words this module will claim it understood -- used by the parser to keep them out of the
 *  engine query, the same way queryIntent.ts's FILLER drops its own cue words. Price cues have to
 *  go too: "under" and "budget" are ordinary catalog words that would AND against the results. */
export const PRICE_CUE_WORDS = [
  ...ALL_TERMS,
  'under', 'below', 'over', 'above', 'between', 'less', 'more', 'than', 'up', 'to', 'max',
  // 'at' and 'from' complete the "at least"/"starting at" cues: without them the leftover word
  // survived into the engine query and AND-ed a stop-word-free "at" against the whole catalog.
  'maximum', 'least', 'starting', 'cheaper', 'within', 'or', 'at', 'from',
];

/** One band of the live Price facet, as the Merchandising Hub has it configured. */
export interface PriceTier {
  start: number;
  end: number;
}

let cachedTiers: Promise<PriceTier[]> | null = null;

async function fetchPriceTiers(): Promise<PriceTier[]> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  const trackingId = import.meta.env.VITE_COVEO_TRACKING_ID || 'pokemon-catalog';

  const res = await fetch(
    `https://platform.cloud.coveo.com/rest/organizations/${organizationId}/commerce/v2/search`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackingId,
        // Named so this read is identifiable in Usage Analytics and never mistaken for a shopper
        // search -- `capture: false` keeps it out of the behavioral signal that trains the models.
        clientId: getVisitorId(),
        context: { view: { url: window.location.href }, capture: false, cart: [] },
        language: 'en',
        country: 'US',
        currency: 'USD',
        query: '',
        perPage: 1,
      }),
    }
  );
  if (!res.ok) throw new Error(`price tier fetch failed: ${res.status}`);
  const data = await res.json();
  const facet = (data.facets ?? []).find(
    (f: { facetId?: string; field?: string }) => f.facetId === 'ec_price' || f.field === 'ec_price'
  );
  const tiers = ((facet?.values ?? []) as { start: number; end: number }[])
    .map((v) => ({ start: v.start, end: v.end }))
    .filter((t) => Number.isFinite(t.start) && Number.isFinite(t.end))
    .sort((a, b) => a.start - b.start);
  // A 200 that carries no usable ec_price facet is a failed read, not an empty catalog -- and
  // returning [] here would be *cached* for the session (loadPriceTiers only clears its cache on a
  // rejection), silently dropping every budget for the rest of the visit. Throw so the next query
  // retries, which is the graceful-degradation contract this module documents.
  if (tiers.length === 0) throw new Error('price tier fetch returned no ec_price facet values');
  return tiers;
}

/** The live price tiers. A failure resolves to [] and is NOT cached, so the next query retries --
 *  same graceful-degradation contract as cardRarities.ts's loadCardRarities. */
export function loadPriceTiers(): Promise<PriceTier[]> {
  if (!cachedTiers) {
    cachedTiers = fetchPriceTiers().catch(() => {
      cachedTiers = null;
      return [] as PriceTier[];
    });
  }
  return cachedTiers;
}

/**
 * Turns a parsed intent into the concrete range to apply, consulting the live tiers only where the
 * sentence genuinely left something open:
 *   - "under $25"  -> [0, 25]           (no lookup needed, but see the open-ended case)
 *   - "over $100"  -> [100, <live top>] (the ceiling is the catalog's, not a magic 100000)
 *   - "budget"     -> the cheap half of the live tier ladder
 *   - "premium"    -> the highest live tier
 *
 * Returns null when the catalog can't back the request up -- a failed tier fetch leaves an
 * open-ended or word-based intent unresolvable, and an unapplied filter the UI stays silent about
 * is strictly better than one it draws but never applied.
 */
export async function resolvePriceIntent(intent: PriceIntent | null): Promise<PriceRange | null> {
  if (!intent) return null;

  if (intent.kind === 'explicit') {
    if (intent.end !== null) {
      // Tolerate a reversed range ("$100 to $25") rather than sending an empty one.
      const [start, end] = intent.start <= intent.end ? [intent.start, intent.end] : [intent.end, intent.start];
      return { start, end, endInclusive: true };
    }
    const tiers = await loadPriceTiers();
    const ceiling = tiers.at(-1)?.end;
    return ceiling === undefined ? null : { start: intent.start, end: ceiling, endInclusive: true };
  }

  const tiers = await loadPriceTiers();
  if (tiers.length === 0) return null;
  if (!CHEAP_TERMS.includes(intent.term)) {
    const top = tiers.at(-1)!;
    return { start: top.start, end: top.end, endInclusive: true };
  }
  // "cheap" is not "the single cheapest bucket". This catalog's price distribution is severely
  // skewed (median around $0.59), so the lowest live tier is $0-1 -- and reading "cheap charizard"
  // as that one band filters to a range almost no named card is in and returns the empty grid this
  // whole feature exists to avoid. The cheap *half* of the live ladder is still entirely the
  // merchandiser's own tiers (retune them in the Hub and this retunes with them) while being wide
  // enough to mean what a shopper means. "premium" needs no equivalent: the top tier is open-ended
  // by construction, so it already spans everything above its floor.
  const cheapSpan = tiers.slice(0, Math.max(1, Math.ceil(tiers.length / 2)));
  return { start: cheapSpan[0].start, end: cheapSpan.at(-1)!.end, endInclusive: true };
}

/** The `mnf-` (manual numeric facet) value for a range. Manual, not `nf-`: `nf-` only restores a
 *  range that already exists among the buckets the response happens to be offering, so a derived
 *  range like [0, 25] -- which crosses the live $0-1/$1-5/$5-25 boundaries -- would silently no-op.
 *  `mnf-` carries arbitrary bounds, which is exactly what a shopper-stated budget needs. */
export function priceRangeToParam(range: PriceRange): string {
  return `${range.start}${range.endInclusive ? '...' : '..'}${range.end}`;
}

/** Human-readable, for the "we read this as..." banner. Same currency dialect as NumericFacet's own
 *  labelling (Intl, thousands separators, open-ended tail printed as "+") but deliberately more
 *  compact: a banner reading "under $25" says the same thing as the rail's "$0.00 – $25.00". */
export function formatPriceRange(range: PriceRange, topTierEnd?: number): string {
  const money = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n);
  // An open-ended range ("over $100", "premium") is the one whose END is the catalog's ceiling -- a
  // sentinel, not a real price -- so print it open-ended rather than quoting "$100,000". Keyed off
  // the end, not the start: keying off the start read a genuinely bounded "between $150 and $300"
  // as "$150+" whenever the top tier happened to begin below $150.
  if (topTierEnd !== undefined && range.end >= topTierEnd) return `${money(range.start)}+`;
  if (range.start === 0) return `under ${money(range.end)}`;
  return `${money(range.start)} – ${money(range.end)}`;
}
