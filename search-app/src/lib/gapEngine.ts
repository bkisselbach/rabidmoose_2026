import type { DeckLine } from '@/lib/deckStorage';
import { byCardNumber, type CatalogCard } from '@/lib/catalogQuery';
import { parsePrintingOptions, type PrintingOption } from '@/lib/cardFields';

// ONE GAP ENGINE, TWO DEFINITIONS OF "GAP" -- phases A and B of presentation/gap-check-plan.md.
//
// The workbench's shape is the same whichever shopper is looking at it:
//
//     holdings -> index-derived "what complete looks like" -> diff
//               -> resolve the gaps against live marketplace inventory
//
// Marcus's version of "complete" is type coverage and evolution lines, and that half already exists
// in deckCoverage.ts -- untouched by this file, still reading the same holdings list. This file is
// the COLLECTOR's version: a set is complete when you hold every card in it, and a card is complete
// when you hold every printing of it.
//
// Persona does not select which analysis EXISTS. Both run over the same holdings, always; persona
// only selects which one leads the page. That is a deliberately stronger claim than "Dana gets a
// different feature", and it is also what keeps the S14 honesty gate true: no persona changes what
// a query returns.
//
// ---------------------------------------------------------------------------------------------
// THE DENOMINATOR RULE (user decision, plan §5.2). A set has TWO honest sizes and they disagree on
// eight of the 28 sets in this catalog:
//
//     printed  -- `cardtotalinset`, how many cards the set actually had (Hidden Fates: 69)
//     stocked  -- how many of them this marketplace carries               (Hidden Fates: 54)
//
// Completion is denominated on STOCKED, with printed shown beside it, because cost-to-complete can
// only ever sum the cards we can actually sell. Quoting "12 of 69" next to a price that only covers
// 54 of them would be two different claims in one sentence. The two are carried separately all the
// way to the UI here so they can never silently mix.
//
// THE PRICE RULE (plan §3.4). Any premium or spread is computed WITHIN one card's
// `cardprintingoptions` array -- never `ec_price` against a printing price. Those two numbers come
// from different fetches months apart, and they disagree on more than half the catalog: measured,
// `ec_price` matches `printingOptions[0]` on only 47.3% of multi-printing cards, sits BELOW every
// listed printing on 859 of them and above all of them on 78. Comparing across them would put a
// card on screen whose "listed" price is higher than every printing it supposedly has -- on the
// surface whose whole argument is that its numbers are real.

/** Missing cards at or under this price are the "cheap tail" -- the part of a set that finishes
 *  cheaply. Five dollars is where this catalog's own distribution puts the break: 68 of Base Set's
 *  100 missing cards fall under it and cost $108.82 in total, against three chase cards carrying
 *  31% of the same bill. */
const CHEAP_TAIL_MAX = 5;

/** How many of the dearest missing cards are called out as the chase. Three is enough to show the
 *  shape of the bill without turning the panel into a second price list. */
const CHASE_COUNT = 3;

export interface SetCompletion {
  setName: string;
  /** Cards of this set in the catalog -- the denominator every percentage and price here uses. */
  stocked: number;
  /** The PRINTED set size. Context only; never the denominator. Absent if the set's cards don't
   *  carry `cardtotalinset`. */
  printed?: number;
  held: number;
  /** Percent complete against `stocked`, rounded for display. */
  percent: number;
  /** Everything not held, in card-number order -- the checklist. Ordered here rather than by the
   *  index, which cannot sort this field (catalogQuery.ts, trap 1). */
  missing: CatalogCard[];
  costToComplete: number;
  /** The cheap end of the bill: how many missing cards are under CHEAP_TAIL_MAX, and their total.
   *  This is the number that makes the panel useful rather than discouraging. */
  cheapTail: { count: number; cost: number };
  /** The dearest few missing cards, and what share of the whole bill they carry. */
  chase: CatalogCard[];
  chaseShare: number;
}

export interface VariantGap {
  card: CatalogCard;
  /** The printing this collection holds, when the holding says. */
  held?: PrintingOption;
  /** Real printings of this card the collection has no marker for. */
  missing: PrintingOption[];
  /** Cheapest and dearest printing OF THIS CARD, and the multiple between them. Both values come
   *  from the same `cardprintingoptions` array -- see THE PRICE RULE above. */
  spread: { low: PrintingOption; high: PrintingOption; multiple: number };
}

export interface CollectionRead {
  sets: SetCompletion[];
  cardsHeld: number;
  /** Live market value of the holdings -- real, from the index. */
  marketValue: number;
  /** Mock basis vs real market. `coverage` is how many holdings actually carry a basis, so the UI
   *  can say what the number is computed over instead of implying it covers everything. */
  movement?: { basis: number; market: number; delta: number; coverage: number };
  /** Cards held more than once -- the trade-surplus read. */
  duplicates: { card: CatalogCard; quantity: number }[];
  variantGaps: VariantGap[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The diff. `rosters` is every card of every set being tracked (one batched call), `holdings` is
 * the shopper's own list.
 *
 * Sets are derived from what the shopper HOLDS, not from a hardcoded list -- a collection that
 * grows into a new set starts being tracked without anyone editing a constant. That is the same
 * "the denominator is a facet count, not an authored list" property the whole feature argues for,
 * applied to itself.
 */
export function readCollection(holdings: DeckLine[], rosters: CatalogCard[]): CollectionRead {
  const byId = new Map(rosters.map((c) => [c.productId, c]));
  const heldIds = new Set(holdings.map((h) => h.productId));

  // --- per-set completion -------------------------------------------------------------------
  // Derived from the ROSTERS, not from the holdings: the caller already decided which sets to fetch
  // (a collector's own sets; a chosen shortlist for a visitor with nothing), and deriving from
  // holdings instead would make the from-zero read below return an empty list -- there are no
  // holdings there to derive from.
  const trackedSets = new Set(rosters.map((c) => c.setName).filter((s): s is string => Boolean(s)));

  const sets: SetCompletion[] = [...trackedSets]
    .map((setName) => {
      const roster = rosters.filter((c) => c.setName === setName);
      const missing = roster.filter((c) => !heldIds.has(c.productId)).sort(byCardNumber);
      const costToComplete = round2(missing.reduce((s, c) => s + c.price, 0));
      const cheap = missing.filter((c) => c.price <= CHEAP_TAIL_MAX);
      const chase = [...missing].sort((a, b) => b.price - a.price).slice(0, CHASE_COUNT);
      const chaseCost = chase.reduce((s, c) => s + c.price, 0);
      const held = roster.length - missing.length;
      return {
        setName,
        stocked: roster.length,
        // Read off the roster rather than assumed: a set whose cards lack the field simply has no
        // printed total, and the UI omits that half of the sentence rather than guessing it.
        printed: roster.find((c) => c.totalInSet)?.totalInSet,
        held,
        percent: roster.length > 0 ? Math.round((held / roster.length) * 100) : 0,
        missing,
        costToComplete,
        cheapTail: { count: cheap.length, cost: round2(cheap.reduce((s, c) => s + c.price, 0)) },
        chase,
        chaseShare: costToComplete > 0 ? chaseCost / costToComplete : 0,
      };
    })
    // Closest to done first: that is the actionable end, and it puts "four cards away" above
    // "a hundred cards away" without either being hidden.
    .sort((a, b) => b.percent - a.percent);

  // --- holdings value, and movement against the mock basis ------------------------------------
  const resolved = holdings.map((h) => ({ line: h, card: byId.get(h.productId) })).filter((x) => x.card);
  const marketValue = round2(resolved.reduce((s, x) => s + (x.card as CatalogCard).price * x.line.quantity, 0));

  const withBasis = resolved.filter((x) => typeof x.line.costBasis === 'number');
  const movement =
    withBasis.length > 0
      ? (() => {
          const basis = round2(withBasis.reduce((s, x) => s + (x.line.costBasis as number) * x.line.quantity, 0));
          const market = round2(withBasis.reduce((s, x) => s + (x.card as CatalogCard).price * x.line.quantity, 0));
          return { basis, market, delta: round2(market - basis), coverage: withBasis.length };
        })()
      : undefined;

  // --- duplicates ------------------------------------------------------------------------------
  const duplicates = resolved
    .filter((x) => x.line.quantity > 1)
    .map((x) => ({ card: x.card as CatalogCard, quantity: x.line.quantity }));

  // --- variant gaps ----------------------------------------------------------------------------
  const variantGaps: VariantGap[] = [];
  for (const { line, card } of resolved) {
    const options = parsePrintingOptions((card as CatalogCard).printingOptionsRaw);
    // parsePrintingOptions returns undefined below two real printings -- a single-printing card has
    // no variant gap to report, and saying "1 of 1 printings" everywhere would bury the cards that
    // genuinely do.
    if (!options) continue;
    const held = line.printing ? options.find((o) => o.key === line.printing) : undefined;
    const missingPrintings = options.filter((o) => o.key !== line.printing);
    const sorted = [...options].sort((a, b) => a.marketPrice - b.marketPrice);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    variantGaps.push({
      card: card as CatalogCard,
      held,
      missing: missingPrintings,
      spread: { low, high, multiple: low.marketPrice > 0 ? high.marketPrice / low.marketPrice : 1 },
    });
  }
  // Ranked by ABSOLUTE dollar gap, not by multiple (plan §3.5). By multiple the top of this list is
  // a Hoothoot whose reverse holo is 83x its normal printing -- real, and useless to a collector
  // holding four-figure vintage. The dollar gap puts the cards worth acting on first.
  const dollarGap = (g: VariantGap) => g.spread.high.marketPrice - g.spread.low.marketPrice;
  variantGaps.sort((a, b) => dollarGap(b) - dollarGap(a));

  return {
    sets,
    cardsHeld: holdings.reduce((s, h) => s + h.quantity, 0),
    marketValue,
    movement,
    duplicates,
    variantGaps,
  };
}

/**
 * The "start from a set" read, for a visitor with no holdings at all -- Guest's empty state.
 *
 * Guest is never seeded (deckStorage.ts, and personalization-plan.md's "Guest is the proof"), so
 * the honest answer to "what am I missing" is "everything, and here is what that costs". Runs over
 * the same roster data with an empty holdings list, so it is the same engine rather than a second
 * code path pretending to be one.
 */
export function readSetsFromZero(rosters: CatalogCard[]): SetCompletion[] {
  return readCollection([], rosters).sets;
}
