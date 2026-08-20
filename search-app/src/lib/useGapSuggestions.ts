import { useEffect, useState } from 'react';
import { resolveGapSuggestion, type GapSuggestion } from '@/lib/deckGapSuggestions';

// Resolves a list of Advisor gaps into live products. Lifted out of SuggestedPickups.tsx
// unchanged in behaviour, because there are now TWO callers: the weakness panel it was written for,
// and the evolution block, which as of this round shows its prerequisites as buyable tiles under
// the sentence that names them instead of as a second labelled row on the other side of the page.
// One resolution path means the two surfaces can never drift on how a gap becomes products.
//
// Empty results are dropped here rather than rendered as an apologetic per-row empty state: a niche
// counter type genuinely having no live match is a real outcome, and the honest presentation of it
// is one fewer row.

/** A gap to resolve -- the label to show it under, and the query it re-runs. */
export interface Gap {
  label: string;
  query: string;
  /** The weakness type this gap answers, passed through to the tiles so each one can price itself
   *  against it (see PickupTrade). Absent for evolution prerequisites. */
  gapType?: string;
}

export interface ResolvedGap extends GapSuggestion {
  gapType?: string;
}

export function useGapSuggestions(gaps: readonly Gap[]): { resolved: ResolvedGap[]; isLoading: boolean } {
  const [resolved, setResolved] = useState<ResolvedGap[]>([]);
  const [isLoading, setIsLoading] = useState(gaps.length > 0);

  // Keyed on the serialized query list, not the array: the caller derives these every render from
  // the deck, so a quantity edit hands us a new array with identical contents and keying on the
  // array itself would re-fetch on every press of a stepper. Same lesson as useDeckCheck's own key.
  const key = gaps.map((g) => g.query).join('|');

  useEffect(() => {
    if (gaps.length === 0) {
      setResolved([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setResolved([]);
    Promise.all(gaps.map((g) => resolveGapSuggestion(g.label, g.query))).then((results) => {
      if (cancelled) return;
      setResolved(
        results
          .map((r, i) => ({ ...r, gapType: gaps[i].gapType }))
          .filter((r) => r.products.length > 0)
      );
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the real dependency
  }, [key]);

  return { resolved, isLoading };
}
