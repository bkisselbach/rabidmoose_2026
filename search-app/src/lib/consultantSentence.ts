import { parseQuery } from '@/lib/queryIntent';
import type { PriceTier } from '@/lib/priceIntent';

// The Card Consultant's composer speaks to the rest of the app in exactly one currency: a
// SENTENCE. Not a filter object, not a query DSL -- the same English string a shopper could have
// typed, handed to /search as `q` and re-parsed there by queryIntent.ts like any other query.
//
// WHY THAT CONSTRAINT IS THE DESIGN. The consultant has no state of its own and must not grow any:
// every chip in the hero has always been `navigate('/search?q=<sentence>')`, and all the
// intelligence lives downstream (parseQuery -> useQueryUnderstanding -> derived facets). Keeping
// the composer on that same wire means it needs zero new plumbing, and it keeps the two halves of
// the panel -- the dropdown controls and the free-text box -- from ever disagreeing, because they
// are literally the same string. Type into the box and the controls re-derive from the parse;
// touch a control and the box rewrites. One source of truth, both directions.
//
// It also means the whole feature stays shareable for free: the sentence travels in `q`, so a
// copied URL reproduces the consultation even though the commerce facet state itself is not
// serialized (the pre-existing gap documented in card-consultant-plan.md).
//
// THE ROUND-TRIP CONTRACT. Everything composed here MUST parse back to the selection it was built
// from. That is not a nicety -- a drift would make the hero claim one thing and the results page
// do another. Two hard rules fall out of the parser's own documented behaviour:
//
//   1. ONE MODE PER SENTENCE (queryIntent.ts:288). A counter cue anywhere retargets *every* type
//      in the sentence, so "Fire cards that beat Water" collapses to one mode and cannot mean what
//      it says. That is why `mode` below is an exclusive verb, not two independent pickers -- the
//      UI encodes the parser's limit instead of letting a user walk into it.
//   2. A BUDGET NEEDS A CURRENCY MARKER OR A CUE WORD (priceIntent.ts:54). Bare number ranges are
//      deliberately NOT read as budgets, because `ec_name` is "<name> — <set> #<number>" and
//      "base set 1-100" was being read as a price band. So compose "$1-$5", never "1-5".
//
// The contract is also *visible*, which is the cheapest safeguard available: the panel renders the
// literal string it will send, and runs the real parser on it for the reading strip. A drift shows
// up in the hero before anyone submits. Never render a prettified version of what is actually sent.

/** What the shopper is doing. Exclusive by construction -- see rule 1 above. */
export type ConsultantMode = 'beat' | 'collect';

/** The composer's state, and the thing `composeSentence` round-trips through the parser. */
export interface ConsultantSelection {
  mode: ConsultantMode;
  /** Canonical Pokédex type names ("Water"). In `beat` mode these are the types to counter; in
   *  `collect` mode the types to find. */
  types: string[];
  /** Loose rarity words as the parser knows them ("holo", "rare"), not resolved facet values. */
  rarity: string[];
  /** The budget phrase to append, already in a form parsePriceIntent accepts ("under $25"). Null
   *  for no budget. Built by `budgetPhrase` rather than by hand, so rule 2 can't be violated. */
  budget: string | null;
}

/** A budget option offered by the composer: what it says, and the phrase it composes into. */
export interface BudgetOption {
  label: string;
  phrase: string;
}

/** Turns the LIVE `ec_price` facet tiers into budget options.
 *
 *  These are the merchandiser's own bands, straight out of the Merchandising Hub -- retune the
 *  Price facet there and this menu retunes with it, no deploy. That is the same claim the hero's
 *  Hub-driven card scans make, now on a control the shopper actually operates.
 *
 *  The phrasing per tier is chosen for the parser, not for prose: the lowest band composes as
 *  "under $N" (an explicit one-sided cue), the top band as "over $N" (open-ended, whose ceiling
 *  resolvePriceIntent then reads back off the live tiers), and the middle bands as "$A-$B" with a
 *  currency marker on the left so rule 2 holds. */
export function budgetOptionsFromTiers(tiers: PriceTier[]): BudgetOption[] {
  const money = (n: number) =>
    n % 1 === 0 ? `$${n.toLocaleString()}` : `$${n.toFixed(2)}`;
  return tiers.map((tier, i) => {
    if (i === 0) return { label: `under ${money(tier.end)}`, phrase: `under ${money(tier.end)}` };
    if (i === tiers.length - 1) return { label: `${money(tier.start)}+`, phrase: `over ${money(tier.start)}` };
    return {
      label: `${money(tier.start)} – ${money(tier.end)}`,
      phrase: `${money(tier.start)}-${money(tier.end)}`,
    };
  });
}

/**
 * Builds the sentence for a selection. The ONLY place a consultant sentence is constructed.
 *
 * Shapes, each verified to parse back to its own selection (see the round-trip table in
 * consultant-hero-plan.md):
 *
 *   beat    | "Beat Water and Psychic types with holo cards under $25"
 *   collect | "Show me holo Fire cards under $25"
 *   budget  | "Show me cheap cards"                    (no types, no rarity)
 *
 * Every connective word here -- "me", "with", "cards", "and", "types" -- is already in
 * queryIntent.ts's FILLER set, so none of them survive into the engine query. They exist purely so
 * the string reads like something a person would say, which is the point: the shopper should be
 * able to edit it as prose and have it still work.
 */
export function composeSentence(selection: ConsultantSelection): string {
  const { mode, types, rarity, budget } = selection;
  const parts: string[] = [];

  // A word-budget ("cheap", "premium") is an ADJECTIVE and has to sit in front of the noun --
  // appending it like a phrase produced "Show me cards cheap", which parses correctly but reads
  // like a machine wrote it. The sentence is shown to the shopper and is meant to be editable as
  // prose, so it has to survive being read. Amount-based budgets ("under $25", "$1-$5") are
  // trailing phrases and stay at the end, where they read naturally.
  const isWordBudget = !!budget && !/\d/.test(budget);
  const adjectives = [...(isWordBudget ? [budget as string] : []), ...rarity].join(' ');
  const trailingBudget = budget && !isWordBudget ? budget : null;

  if (mode === 'beat') {
    if (types.length === 0) {
      // No types yet: there is nothing to counter, so a "Beat ... types" frame would be a sentence
      // about nothing. Degrade to the collect frame, which still carries rarity and budget.
      parts.push('Show me');
      if (adjectives) parts.push(adjectives);
      parts.push('cards');
    } else {
      parts.push('Beat', types.join(' and '), 'types');
      if (adjectives) parts.push('with', adjectives, 'cards');
    }
  } else {
    parts.push('Show me');
    if (adjectives) parts.push(adjectives);
    if (types.length > 0) parts.push(types.join(' and '));
    parts.push('cards');
  }

  if (trailingBudget) parts.push(trailingBudget);
  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * The other direction: read a selection back out of whatever is currently in the box.
 *
 * This is what lets free text drive the controls -- type "my deck keeps losing to water, cheap"
 * and the mode, type and budget pickers all move to match. It deliberately runs the SAME
 * `parseQuery` the results page will run, rather than a lookalike, so the controls can never show
 * a reading the results page won't reproduce.
 *
 * The budget comes back as the parser's own `matched` substring ("under $25", "cheap"), which is
 * exactly what `composeSentence` wants to append -- so a parse/compose cycle is stable.
 */
export function selectionFromSentence(sentence: string): ConsultantSelection {
  const parsed = parseQuery(sentence);
  const isBeat = parsed.counterTargets.length > 0;
  return {
    mode: isBeat ? 'beat' : 'collect',
    types: (isBeat ? parsed.counterTargets : parsed.types).map((t) => t.pokedex),
    rarity: parsed.rarityTerms,
    budget: parsed.priceIntent ? parsed.priceIntent.matched : null,
  };
}

/** True when the sentence carries nothing the consultant can act on -- used to disable submit
 *  rather than sending a query that would just browse the whole catalog. */
export function isEmptySelection(selection: ConsultantSelection): boolean {
  return selection.types.length === 0 && selection.rarity.length === 0 && !selection.budget;
}
