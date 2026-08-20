import { useEffect, useState } from 'react';
import { loadPokedexNames } from '@/lib/pokedexVocabulary';
import { findClosestMatch } from '@/lib/fuzzyMatch';
import { CoveoChip } from '@/components/CoveoChip';

// Coveo's server-side commerce query correction (see DidYouMean.tsx) tops out at edit distance
// 1. When it finds nothing, this takes over: a client-side Levenshtein match against the Pokedex
// species vocabulary, so wider-distance misses ("pikachoo") still get a way forward.
//
// **The gate used to be `zeroResults`, and that was measured wrong on 2026-08-19**
// (`presentation/demo-relevancy-testbook.md` §7.4). This file's original comment assumed a failed
// correction leaves zero products. The commerce index matches loosely enough that it no longer
// does: `pikachoo` returns 6 cards (Pikipek, Pumpkaboo, Pidove...) and `zzzqqxnothinghere` returns
// 96 (Zweilous, Exeggcute, Zigzagoon...), both with `corrections: []`. A literal-zero gate can
// therefore never fire, which had silently disabled this component outright.
//
// The replacement gate is "nothing came back that is actually about what you typed", tested
// against the results themselves rather than against their count:
//
//   - zero products -> fire, exactly as before; nothing to contradict the suggestion.
//   - products, but not one of their names contains the typed term -> fire. This is the
//     partial-match case above: the index answered with "names starting Pi-", which is not an
//     answer to "pikachoo".
//   - any product name contains the typed term -> stay silent. The search worked; offering a
//     correction on top of real results is worse than offering nothing, because it implies the
//     visible results are wrong.
//
// The substring test is deliberately cruder than the Levenshtein one beside it. It only has to
// decide whether the results ECHO the query -- and an exact-name query ("charizard", "onix")
// is already excluded a second way, since `findClosestMatch` requires distance > 0 and so returns
// null for any query that is itself a species name.
//
// **Second gate, added after the first version was measured wrong on `pikachuu` (2026-08-19):**
// the results are tested for an echo of the SUGGESTION as well as of the query. `pikachuu` is a
// distance-1 miss, so Coveo's own server-side correction catches it and returns real Pikachu
// cards -- which do not contain the string "pikachuu", so the query-echo test above passes and
// this component offered "Did you mean Pikachu?" directly above two Pikachu cards. That is the
// precise failure the "stay silent when the search worked" rule exists to prevent; the typed term
// simply is not the right thing to look for once the platform has already corrected it. Testing
// for the suggestion covers both routes to a good result -- a server correction, or a loose match
// that happened to land on the right species -- without this file needing to read the
// `didYouMean` controller and couple itself to the other correction layer.
const MAX_DISTANCE = 2;
const MIN_QUERY_LENGTH = 4;

/** How many result names to test for an echo of the query. The whole first screen, not the top one:
 *  a featured/pinned result can legitimately sit above the term-matching ones. */
const ECHO_SAMPLE = 12;

export function FuzzyDidYouMean({
  query,
  resultNames,
  onPick,
}: {
  query: string;
  /** Names of the products the search returned, in rank order. Empty = zero results. */
  resultNames: string[];
  onPick: (query: string) => void;
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null);

  // Joined rather than passed as an array: the parent rebuilds this list on every render, so an
  // array identity in the dep list would re-run the effect (and re-await the vocabulary) on each
  // one. The string only changes when the results actually change.
  const echoHaystack = resultNames.slice(0, ECHO_SAMPLE).join('\n').toLowerCase();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestion(null);
      return;
    }
    if (echoHaystack.includes(trimmed.toLowerCase())) {
      setSuggestion(null);
      return;
    }
    let cancelled = false;
    loadPokedexNames().then((names) => {
      if (cancelled) return;
      const match = findClosestMatch(trimmed, names, MAX_DISTANCE);
      // The results already show the species we were about to suggest -- the correction happened,
      // by one route or another, and saying so on top of it only makes good results look doubted.
      if (match && echoHaystack.includes(match.toLowerCase())) {
        setSuggestion(null);
        return;
      }
      setSuggestion(match);
    });
    return () => {
      cancelled = true;
    };
  }, [echoHaystack, query]);

  if (!suggestion) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted px-4 py-2.5 text-sm text-foreground">
      <p>
        Did you mean{' '}
        <button
          type="button"
          className="pressable font-semibold text-primary hover:underline"
          onClick={() => onPick(suggestion)}
        >
          {suggestion}
        </button>
        ?
      </p>
      <CoveoChip capability="fuzzy-fallback" />
    </div>
  );
}
