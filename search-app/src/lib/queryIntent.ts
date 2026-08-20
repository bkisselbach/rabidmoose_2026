// Query understanding: turns a conversational search box entry into a structured query the two
// Coveo engines can actually retrieve on.
//
// WHY THIS EXISTS. Coveo's commerce free-text search ANDs the query terms against the searchable
// commerce fields. That is exactly right for "base set charizard" and exactly wrong for the way
// people actually talk to a search box: probing the live index showed `rare fire cards` returning
// 193 products while `show me rare fire cards` returned **zero** -- two filler words were enough
// to empty the grid. Two fixes were applied, at two different layers, and they are complementary:
//
//   1. Server side (Coveo Admin, not code): conversational stop words on the query pipelines, so
//      filler is dropped from matching instead of emptying the query. That fixes *retrieval* for
//      every client of the org, including ones that never run this file. (Intelligent Term
//      Detection was tried here too and reverted -- it silently disabled commerce query correction
//      for every typo, and still AND-ed multi-term queries, so it cost more than it gave.)
//   2. This module: lifting the *meaning* out of the sentence -- which facet values the shopper
//      named, and what they were actually asking for -- so "rare fire cards" becomes a real
//      cardrarity + cardtypes refinement instead of three keywords hoping to hit a description.
//
// This file is app-layer logic, not a Coveo feature, and is labeled as such in CoveoChip.tsx
// (capability `query-understanding`) so the demo lens can't misattribute it. What it produces is
// then executed entirely by Coveo -- facet selections on the commerce engine, a rewritten query on
// both engines, and RGA for the reasoning classes.

import { normalizeForMatch } from '@/lib/utils';
import { parsePriceIntent, PRICE_CUE_WORDS, type PriceIntent } from '@/lib/priceIntent';

/** What the shopper is doing, which decides how the results page is composed. */
export type QueryIntent =
  /** A name or keyword: "onix", "base set charizard". Plain federated search, no rewrite. */
  | 'lookup'
  /** A question to answer, not a filter to apply: "what characters will be onix". RGA leads. */
  | 'question'
  /** A goal that needs a domain step before it can be retrieved: "i need to counter air pokemon".
   *  Resolved against the index (see typeMatchups.ts) into the types that actually answer it. */
  | 'advisory'
  /** Constraints stated in prose: "show me rare fire cards". Becomes facet selections. */
  | 'filter';

export interface TypeConstraint {
  /** Canonical Pokedex type as indexed in @pokemontype -- "Flying", "Electric". */
  pokedex: string;
  /** The TCG energy type the cards are actually filed under in @cardtypes -- Electric cards are
   *  "Lightning", Rock/Ground/Fighting all collapse to "Fighting". Null when the Pokedex type has
   *  no distinct TCG equivalent worth filtering on. */
  tcg: string | null;
  /** The word the shopper actually typed ("air"), kept so the UI can explain the mapping. */
  matched: string;
}

export interface ParsedQuery {
  raw: string;
  intent: QueryIntent;
  /** What is left after conversational framing and recognised constraints are lifted out. Empty is
   *  a valid, meaningful result: "show me rare fire cards" is 100% constraints and 0% keywords. */
  keywords: string;
  /** Types the shopper named directly ("fire cards"). */
  types: TypeConstraint[];
  /** Types the shopper wants to BEAT ("counter air pokemon" -> Flying). The types that answer this
   *  are not these -- they are resolved from the index by typeMatchups.ts. */
  counterTargets: TypeConstraint[];
  /** Loose rarity words ("rare", "holo", "secret"). Matched against the live cardrarity facet
   *  values rather than a hardcoded list, since the catalog's rarity vocabulary is long and
   *  set-dependent ("Illustration rare", "Rare Holo LV.X", "Double rare"). */
  rarityTerms: string[];
  /** The budget the shopper stated, if any -- "under $25", "over $100", "budget". Still abstract
   *  here: turning it into a concrete range can need the catalog's own tiers, which is
   *  priceIntent.ts's resolve step, not this parse. */
  priceIntent: PriceIntent | null;
  /** True when the sentence carried conversational framing that was stripped. Drives whether the
   *  UI bothers to show "we read this as ...". */
  wasRewritten: boolean;
}

/** Pokedex type -> TCG energy type. The TCG collapses the 18 game types into 11 energy types, so
 *  this is many-to-one and genuinely lossy: a Flying-type Pokemon is almost always a Colorless
 *  card. Filtering @cardtypes on a collapsed value is still much better than a keyword match,
 *  which is why the mapping is kept rather than dropping the card side of these queries.
 *
 *  Related but not the same thing as typeColors.ts's TCG_TYPE_ALIASES, which is the 4-entry
 *  *reverse* rename (Lightning->Electric) used for display. This one is the full 18-entry
 *  collapse used for filtering, and the two are not interchangeable. */
const POKEDEX_TO_TCG: Record<string, string | null> = {
  Normal: 'Colorless',
  Flying: 'Colorless',
  Fire: 'Fire',
  Water: 'Water',
  Ice: 'Water',
  Grass: 'Grass',
  Bug: 'Grass',
  Electric: 'Lightning',
  Psychic: 'Psychic',
  Ghost: 'Psychic',
  Fighting: 'Fighting',
  Rock: 'Fighting',
  Ground: 'Fighting',
  Dark: 'Darkness',
  Poison: 'Darkness',
  Steel: 'Metal',
  Dragon: 'Dragon',
  Fairy: 'Fairy',
};

/** Colloquial -> canonical Pokedex type. The left-hand side is what people type; several of these
 *  ("air", "bird", "psychic type") never appear anywhere in either index, which is why the query
 *  has to be translated before it is sent rather than relying on the pipeline thesaurus alone.
 *  The thesaurus handles the TCG/Pokedex vocabulary split (lightning<->electric); this handles the
 *  natural-language split (air->Flying), which a synonym rule can't express as cleanly because the
 *  target differs per engine. */
const TYPE_ALIASES: Record<string, string> = {
  normal: 'Normal',
  colorless: 'Normal',
  fire: 'Fire',
  flame: 'Fire',
  fiery: 'Fire',
  burning: 'Fire',
  water: 'Water',
  aqua: 'Water',
  sea: 'Water',
  ocean: 'Water',
  grass: 'Grass',
  plant: 'Grass',
  leaf: 'Grass',
  electric: 'Electric',
  lightning: 'Electric',
  thunder: 'Electric',
  electricity: 'Electric',
  ice: 'Ice',
  icy: 'Ice',
  frozen: 'Ice',
  fighting: 'Fighting',
  fight: 'Fighting',
  martial: 'Fighting',
  poison: 'Poison',
  toxic: 'Poison',
  ground: 'Ground',
  earth: 'Ground',
  flying: 'Flying',
  air: 'Flying',
  sky: 'Flying',
  bird: 'Flying',
  wind: 'Flying',
  aerial: 'Flying',
  psychic: 'Psychic',
  psy: 'Psychic',
  bug: 'Bug',
  insect: 'Bug',
  rock: 'Rock',
  stone: 'Rock',
  ghost: 'Ghost',
  spirit: 'Ghost',
  spooky: 'Ghost',
  dragon: 'Dragon',
  dark: 'Dark',
  darkness: 'Dark',
  evil: 'Dark',
  steel: 'Steel',
  metal: 'Steel',
  fairy: 'Fairy',
};

/** Rarity words worth lifting into a cardrarity refinement. Deliberately loose: these are matched
 *  as substrings against whatever values the live facet returns, so "rare" legitimately selects
 *  "Rare", "Secret Rare", "Ultra Rare", "Illustration rare" and friends. */
export const RARITY_TERMS = [
  'common',
  'uncommon',
  'rare',
  'holo',
  'holofoil',
  'holographic',
  'foil',
  'secret',
  'ultra',
  'illustration',
  'promo',
  'amazing',
  'radiant',
  'shiny',
];

/** Conversational framing with no retrieval value. Mirrors (and slightly exceeds) the stop words
 *  configured on the commerce pipeline -- the server drops them from *matching*, but this module
 *  still needs them gone before it decides what the leftover keywords are. */
const FILLER = new Set([
  'a', 'an', 'the', 'some', 'any', 'me', 'my', 'i', 'im', 'is', 'are', 'be', 'to', 'for', 'of',
  'and', 'or', 'with', 'that', 'this', 'it', 'do', 'does', 'can', 'could', 'would', 'will',
  'show', 'find', 'get', 'give', 'want', 'need', 'looking', 'look', 'please', 'recommend',
  'suggest', 'buy', 'shop', 'card', 'cards', 'pokemon', 'pokémon', 'type', 'types', 'help',
  'got', 'have', 'there', 'their', 'good', 'best', 'great',
  // The cue words that classified the query in the first place. Once a sentence has been read as
  // "counter Flying", the word "counter" has done its job and must not survive into the query
  // text -- there is a literal "Counter" card in the catalog, so leaving it in would AND a
  // one-document term against the counter results and empty the grid. Same for the question and
  // effectiveness vocabulary.
  'counter', 'counters', 'countering', 'beat', 'beats', 'beating', 'defeat', 'defeats',
  'against', 'versus', 'vs', 'effective', 'super', 'strong', 'weak', 'weakness', 'weaknesses',
  'resist', 'resists', 'what', 'whats', 'which', 'who', 'how', 'why', 'when', 'where',
]);

/** Words that mean "beat this", i.e. the answer is the *counter* to the named type, not the type
 *  itself. This is the distinction that makes "i need to counter air pokemon" a different query
 *  from "air pokemon". */
const COUNTER_CUES = /\b(counter|counters|countering|beat|beats|beating|defeat|against|versus|vs)\b/;

/** Comparative/effectiveness phrasing that is also asking for a counter, e.g. "strong against
 *  water", "what's effective against ghosts", "weak to fire". */
const EFFECTIVENESS_CUES = /\b(effective|strong|super effective|weak|weakness|weaknesses|resist|resists)\b/;

const QUESTION_LEAD = /^(what|which|who|whose|how|why|where|when|does|do|did|is|are|can|could|should|will|would)\b/;

/** Explicit request framing -- the "show me" family. Its presence is what separates a stated
 *  filter ("show me rare fire cards") from a bare keyword lookup ("rare fire"). */
const REQUEST_CUES = /\b(show|find|get|give|want|need|looking for|recommend|suggest|buy|shop)\b/;

/** Accent- and case-insensitive comparison key. Shared with the typeahead so the two vocabularies
 *  agree on what 'Flabébé' normalizes to. */
const normalize = normalizeForMatch;

function toConstraint(pokedexType: string, matched: string): TypeConstraint {
  return { pokedex: pokedexType, tcg: toCardType(pokedexType), matched };
}

/** The TCG energy type a Pokedex type's cards are filed under, or null when there is no distinct
 *  equivalent. Exported because an advisory query needs it for types that were never in the
 *  original sentence -- "counter air" resolves to Rock/Ice/Electric, none of which the shopper
 *  typed, and all three still have to reach the @cardtypes facet in the TCG's vocabulary. */
export function toCardType(pokedexType: string): string | null {
  return POKEDEX_TO_TCG[pokedexType] ?? null;
}

/**
 * Parse a raw search box entry into intent + constraints.
 *
 * Pure and synchronous -- everything here is decided from the text alone. The one step that needs
 * the index (turning `counterTargets` into the types that actually beat them) is deliberately kept
 * out, in typeMatchups.ts, so this stays trivially testable.
 */
export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  const norm = normalize(trimmed);
  const tokens = norm.split(/[^a-z0-9$]+/).filter(Boolean);

  const wantsCounter = COUNTER_CUES.test(norm) || EFFECTIVENESS_CUES.test(norm);
  const isQuestion = QUESTION_LEAD.test(norm) || trimmed.endsWith('?');
  const hasRequestFraming = REQUEST_CUES.test(norm);

  // Read against the raw sentence, not the token list: a budget is a *phrase* ("under $25",
  // "between 5 and 20"), and its meaning lives in the word order, which tokenizing destroys.
  const priceIntent = parsePriceIntent(trimmed);
  // Once the budget has been lifted out, its words must not survive into the query text. "under"
  // and "budget" are ordinary words the index will happily AND against -- the same failure mode
  // documented at the top of this file, where two filler words emptied a 193-result query. Gated
  // on a price actually being found, so "less" or "or" in some unrelated sentence is left alone.
  //
  // The *numbers* dropped are only the ones the budget phrase actually claimed, tokenized the same
  // way the sentence is. Dropping every digit token instead cost unrelated ones: card and set
  // numbers are load-bearing here (`ec_name` is "<name> — <set> #<number>"), so "base set 2
  // charizard under $25" quietly lost its "2" and searched the whole catalog.
  const pricePhraseTokens = new Set(
    priceIntent ? normalize(priceIntent.matched).split(/[^a-z0-9$]+/).filter(Boolean) : []
  );
  const isPriceToken = (token: string) =>
    !!priceIntent && (PRICE_CUE_WORDS.includes(token) || pricePhraseTokens.has(token));

  const types: TypeConstraint[] = [];
  const counterTargets: TypeConstraint[] = [];
  const rarityTerms: string[] = [];
  const leftovers: string[] = [];
  const seenTypes = new Set<string>();

  for (const token of tokens) {
    // "flying"/"birds" -- tolerate a trailing plural before giving up on a token.
    const singular = token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token;
    const typeName = TYPE_ALIASES[token] ?? TYPE_ALIASES[singular];

    if (typeName && !seenTypes.has(typeName)) {
      seenTypes.add(typeName);
      // A counter cue anywhere in the sentence retargets every type it names: "counter air" means
      // Flying is the thing to beat, not the thing to find. Queries that name both a counter
      // target and a separate wanted type are rare enough that treating the whole sentence as one
      // mode is the honest simplification -- and it degrades to a superset, never to zero results.
      (wantsCounter ? counterTargets : types).push(toConstraint(typeName, token));
      continue;
    }
    if (typeName) continue;

    const rarity = RARITY_TERMS.find((r) => r === token || r === singular);
    if (rarity) {
      if (!rarityTerms.includes(rarity)) rarityTerms.push(rarity);
      continue;
    }

    if (isPriceToken(token)) continue;

    if (!FILLER.has(token)) leftovers.push(token);
  }

  let intent: QueryIntent;
  if (wantsCounter && counterTargets.length > 0) {
    intent = 'advisory';
  } else if (isQuestion) {
    intent = 'question';
  } else if ((types.length > 0 || rarityTerms.length > 0) && (hasRequestFraming || leftovers.length === 0)) {
    intent = 'filter';
  } else if (priceIntent) {
    // A stated budget is a filter even when nothing else in the sentence is -- and it MUST NOT
    // stay a lookup, because lookup sends the raw text through untouched and "charizard under $25"
    // would then AND "under" and "25" against the catalog and return nothing.
    intent = 'filter';
  } else {
    intent = 'lookup';
  }

  const keywords = leftovers.join(' ');
  return {
    raw: trimmed,
    intent,
    keywords,
    types,
    counterTargets,
    rarityTerms,
    priceIntent,
    // A lookup that survived parsing unchanged has nothing to explain to the user.
    wasRewritten: intent !== 'lookup' && normalize(keywords) !== norm,
  };
}

/**
 * The query *text* to send to the engines, given that recognised constraints travel as facet
 * selections instead (see useQueryUnderstanding.ts for why: several types in one query have to OR,
 * and query terms AND).
 *
 * - `lookup` keeps the untouched original. This is the existing behaviour for ordinary keyword
 *   searches and must not regress.
 * - `question` also keeps its full natural phrasing: RGA and Passage Retrieval are the surfaces
 *   that answer it, and both ground better on a real sentence than on a bag of keywords. The
 *   pipeline stop words already strip the filler for the lexical half of the same request. The one
 *   exception is a stated budget ("which charizard is good under $25?"): those words are NOT
 *   pipeline stop words, so they would AND against the catalog and empty the grid, and the range
 *   is already travelling as a facet anyway. Only that phrase is cut -- the question survives.
 * - `filter` / `advisory` send only the leftover keywords. Empty is a correct and common result --
 *   "show me rare fire cards" is entirely constraints, so the text is empty and the facets carry
 *   the whole query. Deliberately NOT falling back to the raw text here: that would re-AND the
 *   filler words this feature exists to remove.
 */
export function buildEngineQuery(parsed: ParsedQuery): string {
  if (parsed.intent === 'question') {
    if (!parsed.priceIntent) return parsed.raw;
    // Case-insensitively, and escaped: a `term` intent's `matched` is the canonical lower-case word
    // ("premium"), so a plain string replace missed "Premium" as the shopper actually typed it and
    // left exactly the word this branch exists to remove. Trailing punctuation is re-closed up so
    // the question still reads as one ("...is good under $25?" -> "...is good?").
    const escaped = parsed.priceIntent.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return parsed.raw
      .replace(new RegExp(escaped, 'i'), '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([?!.,])/g, '$1')
      .trim();
  }
  return parsed.intent === 'lookup' ? parsed.raw : parsed.keywords;
}
