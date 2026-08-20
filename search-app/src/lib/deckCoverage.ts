import { useEffect, useState } from 'react';
import { extractPokemonName } from '@/lib/cardPokemonName';
import { subscribeToCharacter } from '@/lib/characterQueue';
import type { PokemonRecord } from '@/lib/pokedexRecord';

// Reads the cart as a deck and tells the shopper what it's exposed to.
//
// WHY SPECIES AND NOT CARD TYPES. The obvious source is each card's own `cardtypes` field, which is
// right there on the product. It can't answer the question, though: the TCG collapses the 18 game
// types into 11 energy types (Rock, Ground and Fighting all become "Fighting"), so going from a
// card's energy type back to what beats it is a one-to-many guess the UI could never justify. Every
// card does name a species, and that species' real weaknesses are already in the Pokedex index --
// unambiguous, and the same data the /search matchup advisor resolves against. So each cart line is
// resolved to a species instead, and the species answers for it.
//
// Both steps reuse machinery already solving this exact problem elsewhere: extractPokemonName
// (cardPokemonName.ts) strips the TCG decorations a card name carries -- "Charizard ex",
// "Dark Charizard", "Latios & Latias-GX" -- and subscribeToCharacter (characterQueue.ts) is the
// cached, request-serialized species lookup the product cards already use. A cart of twelve
// different Charizard prints costs one request.
//
// App-layer aggregation over Coveo reads, chipped `deck-check` and labeled as such.

/** One cart species that resolved against the Pokedex. */
export interface DeckSpecies {
  name: string;
  weaknesses: string[];
}

/** An evolution card in the cart whose earlier stages aren't. */
export interface MissingStages {
  /** The species already in the cart, e.g. "Charizard". */
  for: string;
  /** Earlier stages of its line that the cart has no card for, in evolution order. */
  need: string[];
}

export interface DeckCheck {
  /** Cart lines that resolved to a Pokedex species, deduped. */
  species: DeckSpecies[];
  /** Every type any cart species is weak to, ordered by how much of the deck shares it. */
  weaknesses: string[];
  /** How many distinct cart species share each weakness -- the number `weaknesses`' own ordering is
   *  sorted by. Exposed for surfaces that need the count itself, not just the ranking (the
   *  /advisor exposure grid, phase S1) -- computed once here rather than re-aggregated per
   *  caller. */
  weaknessCounts: Map<string, number>;
  /** The few weaknesses worth actually acting on -- see the note where this is computed. */
  topWeaknesses: string[];
  /** Evolution prerequisites the cart is missing. */
  missingStages: MissingStages[];
  /** True until every candidate name has answered. Lets the UI hold still rather than flicker
   *  a half-built verdict, without blocking on the whole set (see the progressive note below). */
  isResolving: boolean;
}

/** The minimum a cart line has to look like. Structural rather than importing Headless's CartItem:
 *  this only ever needs the display name, and staying decoupled keeps it testable. */
interface CartLine {
  name: string;
}

const EMPTY: DeckCheck = {
  species: [],
  weaknesses: [],
  weaknessCounts: new Map(),
  topWeaknesses: [],
  missingStages: [],
  isResolving: false,
};

export function useDeckCheck(items: readonly CartLine[]): DeckCheck {
  // Candidate species names, deduped, in cart order. Derived every render (cheap, pure string work)
  // but the effect below is keyed on the SERIALIZED list, not this array -- a quantity change
  // produces a new array with identical contents, and keying on the array itself would re-subscribe
  // (and re-render) on every press of the quantity stepper. Same lesson as useQueryUnderstanding's
  // targetKey.
  const candidates = [...new Set(items.map((i) => extractPokemonName(i.name)).filter(Boolean))];
  const key = candidates.join('|');

  const [records, setRecords] = useState<Map<string, PokemonRecord | null>>(new Map());
  const [resolvedKey, setResolvedKey] = useState('');

  useEffect(() => {
    if (!key) {
      setRecords(new Map());
      setResolvedKey('');
      return;
    }
    let cancelled = false;
    const names = key.split('|');
    const found = new Map<string, PokemonRecord | null>();
    const unsubscribes = names.map((name) =>
      subscribeToCharacter(name, (record) => {
        if (cancelled) return;
        found.set(name, record);
        // Publish as each one lands rather than waiting for the whole set: the queue resolves them
        // one at a time, and a twelve-species cart would otherwise show nothing for several
        // seconds. `isResolving` below stays true until the last one answers, so the UI can still
        // tell "still counting" from "done".
        setRecords(new Map(found));
        if (found.size === names.length) setResolvedKey(key);
      })
    );
    return () => {
      cancelled = true;
      unsubscribes.forEach((off) => off());
    };
  }, [key]);

  if (!key) return EMPTY;

  // Cart order, and only the names that actually matched a species -- a Trainer or Energy card
  // ("Giovanni's Charisma", "Professor's Research") resolves to null and is simply not a Pokemon.
  const species: DeckSpecies[] = [];
  for (const name of candidates) {
    const record = records.get(name);
    if (record) species.push({ name: record.characterName, weaknesses: record.weaknessList });
  }

  // Ranked by how many cart species share the weakness, because a flat union stops being advice
  // very quickly: one Charizard already carries five weaknesses, and feeding all five to the
  // matchup advisor resolved to EIGHT counter types -- close to half the type chart, which is not
  // a filter. The shared ones are also the ones that actually matter: a type two-thirds of your
  // deck folds to is a real hole, one that hits a single card is a bad matchup.
  const weaknessCounts = new Map<string, number>();
  for (const s of species) {
    for (const w of new Set(s.weaknesses)) weaknessCounts.set(w, (weaknessCounts.get(w) ?? 0) + 1);
  }
  const weaknesses = [...weaknessCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type]) => type);
  // Three keeps the resulting advisory search meaningfully narrow while still naming a real hole.
  const topWeaknesses = weaknesses.slice(0, 3);

  // An evolution card can't be played without the stages under it -- a real deck-building rule, and
  // the reason this is worth surfacing on a cart rather than a wiki. Each record carries its whole
  // line in `evolutionChain`, so the prerequisites are the stages before this species in its own
  // chain that no cart line resolved to.
  const inCart = new Set(species.map((s) => s.name.toLowerCase()));
  const missingStages: MissingStages[] = [];
  for (const name of candidates) {
    const record = records.get(name);
    if (!record) continue;
    const chain = record.evolutionChain;
    const position = chain.findIndex((stage) => stage.name.toLowerCase() === record.characterName.toLowerCase());
    if (position <= 0) continue; // a basic, or a species whose own chain doesn't name it
    const need = chain
      .slice(0, position)
      .map((stage) => stage.name)
      .filter((stageName) => !inCart.has(stageName.toLowerCase()));
    if (need.length > 0) missingStages.push({ for: record.characterName, need });
  }

  return { species, weaknesses, weaknessCounts, topWeaknesses, missingStages, isResolving: resolvedKey !== key };
}
