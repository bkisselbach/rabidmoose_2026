import { loadPokedexNames } from '@/lib/pokedexVocabulary';
import { TYPE_COLORS } from '@/lib/typeColors';

// Ask-the-Pokédex sits on a page that is *already* about one species, so people type questions
// that only make sense in that context -- "how does it evolve?", "how tall", "base stat total?".
// Coveo RGA gets nothing but the query string, and its first-stage retrieval has no idea which
// page the question came from, so those questions either come back unanswerable or -- worse --
// come back answered about the wrong Pokemon ("how does it evolve?" answered about Eevee,
// "base stat total?" about Golurk, "what does it eat" about Munchlax; all observed live).
//
// The fix is to make the question self-contained before it reaches the platform, the same shape
// of client-side query understanding already used on /search (see useQueryUnderstanding.ts).
// Three rules, in order, so the rewrite is never louder than it needs to be:
//   1. the question already names this species  -> send it untouched;
//   2. it uses a pronoun for this species       -> substitute the name;
//   3. it names no species at all               -> prefix this page's species.
// A question that names a *different* species ("how does Bulbasaur evolve?" typed on the
// Charizard page) is deliberately left alone -- the user meant that Pokemon.

/** Pronoun forms that, on a species page, can only refer to the species in front of the user. */
const PRONOUN =
  /\b(it['’]s|its|it|this pok[eé]mon|this species|this one|they['’]re|their|them|they)\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-name match that survives the awkward species names (Mr. Mime, Farfetch'd, Nidoran♀):
 *  delimit on "not a letter or digit" rather than \b, which breaks on apostrophes and symbols. */
export function mentionsName(question: string, name: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}([^\\p{L}\\p{N}]|$)`, 'iu').test(question);
}

/** Anchors a question to the page's species. `knownNames` is the full species vocabulary; pass an
 *  empty array when it hasn't loaded yet -- rule 3 then stays off rather than risking a prefix on
 *  a question that was about some other Pokemon. */
export function anchorQuestion(question: string, species: string, knownNames: readonly string[]): string {
  const trimmed = question.trim();
  if (!trimmed || !species) return trimmed;

  // 1. Already self-contained.
  if (mentionsName(trimmed, species)) return trimmed;

  // 2. Pronoun substitution, keeping the possessive/contraction shape intact so the rewritten
  //    question still reads like English ("what is its type" -> "what is Charizard's type").
  const substituted = trimmed.replace(PRONOUN, (match) => {
    if (/^it['’]s$/i.test(match) || /^they['’]re$/i.test(match)) return `${species} is`;
    if (/^(its|their)$/i.test(match)) return `${species}'s`;
    return species;
  });
  if (substituted !== trimmed) return substituted;

  // 3. No pronoun and no name. If the vocabulary is loaded and the question names some other
  //    species, that species is the subject -- leave it. Otherwise the subject is this page.
  if (knownNames.length === 0) return trimmed;
  const namesAnother = knownNames.some(
    (name) => name.toLowerCase() !== species.toLowerCase() && mentionsName(trimmed, name)
  );
  if (namesAnother) return trimmed;

  // Prefixing beat suffixing and parentheticals in live A/B probing against the org: it reads as
  // a normal query and never strands the question's own punctuation mid-sentence.
  return `${species} ${trimmed}`;
}

/** Warms the species vocabulary so the first ask on a page can anchor without waiting on a
 *  network round trip. Cached module-wide by pokedexVocabulary.ts, so this is free after the
 *  first call anywhere in the session. */
export function warmAnchorVocabulary(): Promise<string[]> {
  return loadPokedexNames();
}

// RGA answers yes/no type questions when the answer is *yes* and silently declines when it's
// *no* -- established by live probing, with every platform-side lever already exhausted (content
// fix reverted: the Chunk Inspector proved the negative was already in the top-ranked chunks and
// the model cited nothing; a prompt instruction was added, the model rebuilt, hypothesis
// disproved; grounding scope ruled out). The gate is answer polarity, not retrieval or content.
//
// The one phrasing that provably answers either way is the open enumeration -- asked as "which
// types does X have, and which does it not have?", RGA states the positive types AND explicitly
// names what's missing. This reroutes any yes/no type question onto that form, regardless of the
// question's true polarity: a question that would have answered fine anyway just gets a fuller
// answer, and rerouting unconditionally avoids needing a local species-to-types lookup this
// anchoring layer doesn't otherwise carry.
const TYPE_NAMES = Object.keys(TYPE_COLORS);
const TYPE_ALTERNATION = TYPE_NAMES.map(escapeRegExp).join('|');
// Deliberately narrow: requires a REAL type name adjacent to the literal word "type"/"types"/
// "typing", which is exactly the "is/does X have [Type] type" shape and its bare keyword form
// ("Charizard dragon type") -- confirmed failing phrasings. An open question like "what type is
// Charizard?" or "which types does Charizard have?" never names a specific type, so it can't
// match this and is left untouched.
const TYPE_YESNO = new RegExp(
  `\\b(?:${TYPE_ALTERNATION})\\b[\\s-]*typ(?:e|es|ing)\\b|\\btyp(?:e|es|ing)\\b[\\s-]*\\b(?:${TYPE_ALTERNATION})\\b`,
  'i'
);

/** Run on an already-anchored question (species already substituted in), so `species` is safe to
 *  drop straight into the rewritten sentence. */
export function resolveTypePolarity(anchoredQuestion: string, species: string): string {
  if (!species || !TYPE_YESNO.test(anchoredQuestion)) return anchoredQuestion;
  return `Which types does ${species} have, and which does it not have?`;
}
