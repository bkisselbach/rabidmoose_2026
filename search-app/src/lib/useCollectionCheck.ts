import { useEffect, useMemo, useState } from 'react';
import { useDeck } from '@/lib/deckStorage';
import { fetchCardsByIds, fetchSetRosters, type CatalogCard } from '@/lib/catalogQuery';
import { readCollection, type CollectionRead } from '@/lib/gapEngine';

// The collector lens's data path -- TWO catalog requests, total, however large the collection.
//
//   1. every holding, by id, in one batched classic-search call
//   2. every roster for the sets those holdings land in, in one more
//
// Not "two per set" and emphatically not "one per card": building this on fetchProductsByIds would
// have made a 69-card collection a 69-request page (see catalogQuery.ts's header for the measured
// alternative -- five whole sets, 421 results, 290 ms).
//
// The two calls are SEQUENTIAL by necessity, not by oversight: which sets to fetch is not knowable
// until the holdings have resolved and told us which sets they belong to. That is one round trip of
// latency, and it buys a set list derived from the collection itself rather than a hardcoded
// constant that would go stale the moment someone adds a card from a 29th set.

/** What a visitor with no holdings is shown instead -- the "start from a set" state.
 *
 *  Guest is never seeded (deckStorage.ts; personalization-plan.md's "Guest is the proof"), so this
 *  is not a fallback for missing data, it IS the answer: here is what completing a set costs, from
 *  zero, computed by the same engine over the same rosters. Two vintage sets and two modern ones,
 *  spanning the real range this catalog contains -- Emerging Powers completes for $112.59, Evolving
 *  Skies for $8,240.62. */
const FROM_ZERO_SETS = ['Base Set', 'Fossil', 'Emerging Powers', 'Evolving Skies'];

export interface CollectionCheck {
  read: CollectionRead | null;
  /** True while either call is in flight. The page renders its skeleton rather than a zero state --
   *  "0% complete" and "not loaded yet" must never look the same. */
  isLoading: boolean;
  /** No holdings at all: the caller shows the from-zero state, not an error. */
  isEmptyCollection: boolean;
  /** The cards the shopper holds, resolved -- so the page can list the collection itself without a
   *  third request. */
  holdings: CatalogCard[];
}

export function useCollectionCheck(): CollectionCheck {
  const lines = useDeck();
  // Rosters are FETCHED state; the read is DERIVED. Keeping the computed read in state instead
  // would freeze it against whatever `lines` looked like when the fetch resolved -- so a quantity
  // edit (which changes duplicates and holdings value, but not the id list) would silently show a
  // stale answer, and refetching the whole catalog on a stepper press to avoid that is exactly the
  // waste the id-keying below exists to prevent.
  const [state, setState] = useState<{ rosters: CatalogCard[]; holdings: CatalogCard[]; loading: boolean }>({
    rosters: [],
    holdings: [],
    loading: true,
  });

  // Keyed on the id list, not the array identity: the deck array is rebuilt on every render by its
  // store, and keying on the array would refetch the whole catalog on every keystroke elsewhere on
  // the page. Same lesson useGapSuggestions and useDeckCheck both record.
  const idsKey = lines.map((l) => l.productId).join(',');

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(',') : [];

    (async () => {
      setState((s) => ({ ...s, loading: true }));

      // Call 1 -- holdings. Empty collection skips straight to the from-zero rosters.
      const holdings = ids.length > 0 ? await fetchCardsByIds(ids) : [];
      if (cancelled) return;

      // Call 2 -- rosters. Sets come from what the shopper actually holds, so the tracked list
      // grows with the collection instead of being authored here.
      const setNames =
        holdings.length > 0
          ? [...new Set(holdings.map((c) => c.setName).filter((s): s is string => Boolean(s)))]
          : FROM_ZERO_SETS;
      const rosters = await fetchSetRosters(setNames);
      if (cancelled) return;

      setState({ rosters, holdings, loading: false });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey is the real dependency
  }, [idsKey]);

  // Derived, so a quantity or printing edit re-reads instantly against rosters already in hand --
  // no request, no staleness.
  const read = useMemo(
    () => (state.rosters.length > 0 ? readCollection(lines, state.rosters) : null),
    [lines, state.rosters]
  );

  return {
    read,
    isLoading: state.loading,
    isEmptyCollection: lines.length === 0,
    holdings: state.holdings,
  };
}
