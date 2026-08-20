import { GoogleGenAI } from '@google/genai';

// Phase C of presentation/deck-builder-advisor-plan.md -- deck-check's own "phase G4", now built.
// Deliberately NOT api/consultant.ts's shape: that function hands Gemini live MCP tools and lets it
// decide what to retrieve. This one hands Gemini already-aggregated, already-verified structured
// data (species/weaknesses/missing stages, computed client-side by lib/deckCoverage.ts against the
// real Pokedex index) and asks it to narrate THAT -- no tools, no independent retrieval, nothing to
// ground because there is nothing left to look up. This is what "grounded by construction" means
// when there's no MCP round trip to extract ids from: the facts are fixed before Gemini ever sees
// the request, and the system instruction is written to keep it that way (see systemInstruction
// below) rather than trusting a general "don't invent things" plea.
//
// WHY THIS MATTERS HERE SPECIFICALLY, not just as a general rule: G4's own persona-tone testing
// (consultant-everywhere-plan.md) already caught Gemini reaching for its own trained Pokémon
// knowledge on a retrieval-shaped question, even when it happened to be correct -- "the shape of a
// hallucination" even when the fact was true. A deck-health narrator is a MORE tempting surface for
// that failure than the search consultant was: "what should I add to beat Water types" invites
// Gemini's own trained type-chart knowledge exactly where this app's real answer (deckCoverage.ts's
// index-derived weaknessList) must win instead. The system instruction below says this explicitly,
// from the first version, rather than being tightened after a bad demo answer.

// PINNED, not the floating alias -- same rule api/consultant.ts follows, and here it is a COST
// control as much as a stability one. `gemini-flash-lite-latest` is a pointer Google can move with
// no notice and no change on our side; if it ever points at a larger model, this endpoint silently
// starts billing at that model's rate. Pinning means a price change has to be a decision we make.
const MODEL = 'gemini-3.5-flash-lite';

// Both lenses ask for two to four sentences. This is the ceiling that makes that a fact rather than
// a request: without it a runaway generation is billed in full. Roughly 150 tokens is a four-
// sentence paragraph, so 220 leaves headroom without leaving the meter running.
const MAX_OUTPUT_TOKENS = 220;

interface DeckHealthRequestBody {
  species: { name: string; weaknesses: string[] }[];
  /** Ranked, index-derived -- deckCoverage.ts's own `topWeaknesses`. */
  topWeaknesses: string[];
  /** How many of the deck's species share each weakness -- deckCoverage.ts's `weaknessCounts`,
   *  serialized as plain entries since a Map doesn't survive JSON. */
  weaknessCounts: [string, number][];
  missingStages: { for: string; need: string[] }[];
  deckCardCount: number;
  personaContext?: { name: string; subtitle: string };
}

/**
 * TWO LENSES, ONE ENDPOINT. The Advisor page carries two generated reads with genuinely different
 * criteria: how a deck PLAYS, and how close a collection is to COMPLETE. They share this function
 * rather than getting an endpoint each because the degraded-state story has to stay simple -- the
 * page is scripted as "everything still renders with /api/deck-health down", and that claim is
 * only checkable if there is one thing to take down.
 *
 * What is NOT shared is the prompt. Each lens gets its own system instruction and its own facts,
 * because the failure modes differ: the deck lens has to be stopped from reaching for its trained
 * type-chart knowledge, and the collection lens has to be stopped from talking about prices going
 * up -- this catalog has no price history at all, so any appreciation claim would be invented.
 */
export type AdvisorLens = 'deck' | 'collection';

interface CollectionRequestBody {
  lens: 'collection';
  cardsHeld: number;
  /** Live market value of the holdings. Real, from the index. */
  /** Pre-formatted for display by the client ("$185.98"), so the model reproduces rather than
   *  reformats. See lib/collectionNarration.ts. */
  marketValue: string;
  sets: {
    setName: string;
    percent: number;
    held: number;
    stocked: number;
    missingCount: number;
    costToComplete: string;
    cheapTail: { count: number; cost: string };
    chaseTop?: { name: string; price: string };
  }[];
  /** The set with the highest completion percentage, and the set that costs least to finish --
   *  both COMPUTED BY THE CLIENT (lib/collectionNarration.ts) rather than left for the model to
   *  work out from the array. Optional so an older client body still narrates. */
  closestToFinishing?: string;
  cheapestToFinish?: string;
  /** Cards whose other printings the collection has no marker for. */
  variantGaps: { card: string; held: string; missing: { label: string; price: string }[] }[];
  duplicateCount: number;
  personaContext?: { name: string; subtitle: string };
}

function collectionSystemInstruction(): string {
  return (
    'You are the Card Consultant for RabidMoose, a Pokémon card marketplace, narrating a COLLECTION read for a collector. You will be given their holdings ALREADY ANALYZED as JSON -- how many cards they hold, what those are worth at today\'s market, and for each set they collect: how many of the cards this marketplace stocks they already have, how many are left, what finishing it costs, how much of that bill is cheap commons, and the single dearest card still missing. You may also be given cards whose other printings they do not have. This JSON is the ONLY source of truth. ' +
    'Narrate it for someone deciding what to buy next. The JSON names the set they are CLOSEST to finishing in its "closest to finishing" field -- lead with THAT set and what finishing it costs. Never describe any other set as the closest, the nearest, or the one they are furthest along on, however the numbers look to you; the field is the answer and it has already been worked out. Likewise "cheapest set to finish" is the answer to which set is cheapest to start on. Where the bill is lopsided say so (a long cheap tail versus one expensive chase card is the useful shape). Mention printing gaps only if the JSON lists them. ' +
    'The JSON field names are written as ordinary English so you can quote them if that reads well -- but prefer your own phrasing, and never write a field name in a form no shopper would say out loud. ' +
    'Every monetary value in the JSON is ALREADY FORMATTED for display. Copy each one character for character, thousands separators included -- "$2,244.47" is written "$2,244.47" and never "$2244.47" -- and never reformat, round, or recompute it. The prose sits directly above tabs rendering these same strings, so a reader is comparing them side by side. ' +
    'HARD RULES. Never invent a card name, a price, a set, or a completion number that is not in the JSON. Never say a card or a collection has gone UP or DOWN in value, is a good investment, or will appreciate -- this catalog carries no price history whatsoever, so any such claim would be fabricated no matter how plausible. Never reach for your own trained knowledge of Pokémon card values or rarity. Two to four sentences, no bullet points. If every set is essentially untouched, say plainly that this collection is early and name the "cheapest set to finish" as where to start.'
  );
}

function systemInstruction(): string {
  return (
    'You are the Card Consultant for RabidMoose, a Pokémon card marketplace, narrating a deck health ' +
    "check. You will be given the shopper's deck ALREADY ANALYZED as JSON -- species, each species' " +
    "real indexed weaknesses, which weaknesses the deck shares and how many species share each one, " +
    'and which evolution stages the deck is missing. This JSON is the ONLY source of truth. ' +
    'Narrate it: name the biggest real hole and why it matters, note evolution gaps if any, and ' +
    'suggest what kind of card would help in general terms (a type, a role) -- never invent a specific ' +
    "card name, price, or species fact that isn't in the JSON, and never reach for your own trained " +
    'knowledge of Pokémon types or matchups even if you believe it to be correct -- if the JSON doesn\'t ' +
    'say it, you don\'t know it for this deck. Two to four sentences, no bullet points. If the JSON ' +
    'shows no real weaknesses, say the deck looks solid rather than inventing a concern.'
  );
}

function toneSuffix(personaContext?: DeckHealthRequestBody['personaContext']): string {
  if (!personaContext) return '';
  return (
    ` The shopper is ${personaContext.name}, a ${personaContext.subtitle.toLowerCase()} -- let that ` +
    'shape your tone and phrasing only, never which facts you state.'
  );
}

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }

  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!geminiKey) {
    return Response.json(
      { error: 'Server misconfigured', detail: 'Missing env var: GOOGLE_GEMINI_API_KEY' },
      { status: 500 }
    );
  }

  let raw: DeckHealthRequestBody | CollectionRequestBody;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // The collection lens is a different question with different facts and a different prompt.
  // Handled before the deck path rather than inside it: sharing a validation branch between two
  // payload shapes is how one of them quietly starts accepting the other one's missing fields.
  if ((raw as CollectionRequestBody).lens === 'collection') {
    const body = raw as CollectionRequestBody;
    if (!Array.isArray(body.sets) || body.sets.length === 0) {
      return Response.json({ error: '"sets" is required and must be non-empty' }, { status: 400 });
    }
    // KEYS ARE ENGLISH, NOT IDENTIFIERS -- and that is a fix, not a style preference.
    //
    // Measured on Marcus 2026-08-20, live on prod: the read came back saying "256 cards to grab at
    // a costToComplete of $716.80", "a bulky cheapTail of 218 cards", "your biggest hurdle is the
    // Gardevoir ex ... chaseTop at $70.59". The model was quoting the field names straight out of
    // the payload into prose shown to a shopper. Intermittent -- the next run read clean -- which
    // makes it exactly the kind of thing a prompt rule alone does not close.
    //
    // So the leak is made harmless instead of forbidden: every key the model can echo is already
    // the English phrase we would have wanted it to write. The instruction below still tells it
    // not to quote field names; this is the half that holds when the instruction does not.
    const collectionFacts = {
      'cards held': body.cardsHeld,
      'market value': body.marketValue,
      'closest to finishing': body.closestToFinishing,
      'cheapest set to finish': body.cheapestToFinish,
      sets: body.sets.map((set) => ({
        set: set.setName,
        'percent complete': set.percent,
        'cards held': set.held,
        'cards this marketplace stocks': set.stocked,
        'cards still missing': set.missingCount,
        'cost to finish': set.costToComplete,
        'cheap tail': { 'how many cards': set.cheapTail.count, 'cost for all of them': set.cheapTail.cost },
        'dearest card still missing': set.chaseTop
          ? { name: set.chaseTop.name, price: set.chaseTop.price }
          : undefined,
      })),
      'printing gaps': body.variantGaps.map((gap) => ({
        card: gap.card,
        'printing they own': gap.held,
        'printings they do not own': gap.missing,
      })),
      'duplicate cards': body.duplicateCount,
    };
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(collectionFacts) }] }],
        config: {
          systemInstruction: collectionSystemInstruction() + toneSuffix(body.personaContext),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      });
      return Response.json({ text: response.text ?? '', model: MODEL });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[api/deck-health] collection round trip failed:', err);
      return Response.json(
        { error: 'Collection read failed', detail: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      );
    }
  }

  const body = raw as DeckHealthRequestBody;
  if (!Array.isArray(body.species) || body.species.length === 0) {
    return Response.json({ error: '"species" is required and must be non-empty' }, { status: 400 });
  }

  // Exactly the aggregated shape deckCoverage.ts already computed -- nothing recomputed here,
  // nothing added. The prompt is the JSON, verbatim, plus the system instruction's framing.
  const deckFacts = {
    species: body.species,
    topWeaknesses: body.topWeaknesses,
    weaknessCounts: body.weaknessCounts,
    missingStages: body.missingStages,
    deckCardCount: body.deckCardCount,
  };

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(deckFacts) }] }],
      config: {
        systemInstruction: systemInstruction() + toneSuffix(body.personaContext),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });

    return Response.json({ text: response.text ?? '', model: MODEL });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/deck-health] round trip failed:', err);
    return Response.json(
      { error: 'Deck health request failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
