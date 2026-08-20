import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// Two-way sync between a classic-Search `urlManager` and the address bar — item 31f.
//
// SCOPE, AND IT IS A HARD LINE: this is for the Vault and the newsroom ONLY. `SearchResultsPage`
// keeps its own machinery and must not be migrated onto this. That page has a query-understanding
// layer writing facets on the shopper's behalf, and its atomic-write/derived-facet reconcile exists
// because of a measured live failure — the derived facets landed 6 of 11 values when applied
// through `toggleSelect`. Generalising this hook to cover that would mean absorbing a mechanism
// whose whole point is that it is heavier than this one. The Vault's own comment already states the
// rule: don't improvise the heavier mechanism where the simpler one covers the actual hazard.
//
// WHAT THE TWO CALLERS HAD SEPARATELY, AND WHY BOTH BEHAVIOURS SURVIVE AS OPTIONS RATHER THAN
// BEING AVERAGED AWAY. They were not the same code with cosmetic differences; each carried a fix
// for a hazard the other does not have:
//
//   * The Vault tracks `q` itself (its search box drives the query), so the manager's fragment has
//     to have `q` stripped out of it before comparison or the two fight over the same parameter.
//   * The newsroom must SKIP ITS FIRST incoming pass. Its mount effect applies the default sort,
//     and on a cold load this effect's first run sees the bare URL, decides it differs from the
//     manager, and synchronises the sort straight back out — measured, the request came back
//     `sort="relevancy"` and the URL lost its `sortCriteria`, so the newsroom silently stopped
//     being sorted at all.
//
// ONE REAL FIX FALLS OUT OF MERGING THEM. The outgoing comparison is against
// `window.location.search`, not against the `searchParams` snapshot captured at render. The
// newsroom already did it this way and says why — "so a stale closure can't cause a write loop" —
// while the Vault compared against its closed-over snapshot. Both callers now get the safe one.

/** The manager surface this needs. Structural, so it fits any classic-Search `urlManager` without
 *  naming the controller type. */
interface UrlManagerLike {
  state: { fragment: string };
  synchronize(fragment: string): void;
  subscribe(listener: () => void): () => void;
}

interface Options {
  /** Strip `q` from the fragment on both directions — for a page whose search box owns `q`
   *  independently of the manager (the Vault). */
  stripQuery?: boolean;
  /** Extra parameters to merge into the outgoing URL, e.g. the Vault's own `q`. */
  extraParams?: Record<string, string | undefined>;
  /** Ignore the first incoming pass, for a page whose mount effect has already applied state the
   *  URL does not carry yet (the newsroom's default sort). */
  skipFirstIncoming?: boolean;
}

/**
 * Serializes the way Headless's url manager expects: a space as `%20`, never as `+`.
 *
 * `URLSearchParams.toString()` is form-encoding, so a space comes out as `+`. Headless reads the
 * fragment with `decodeURIComponent`, which does NOT treat `+` as a space, so a sort criterion
 * round-tripped through URLSearchParams arrives as the literal `date+descending` and the Search API
 * rejects the entire query with `400 InvalidSortValueException`.
 *
 * The newsroom measured this the hard way — its default sort IS `date descending`, so every cold
 * load 400'd and the page rendered "0 stories" against a perfectly healthy index. This hook would
 * have reintroduced it the moment the newsroom moved onto it, which is the whole reason the
 * normalization lives here rather than at one call site.
 */
function toFragment(params: URLSearchParams | string): string {
  return (typeof params === 'string' ? params : params.toString()).replace(/\+/g, '%20');
}

function withoutQ(fragment: string): string {
  const params = new URLSearchParams(fragment);
  params.delete('q');
  return toFragment(params);
}

/** Fragments compare equal when their parameters match, regardless of order. */
function fragmentsEqual(a: string, b: string): boolean {
  const pa = [...new URLSearchParams(a).entries()].sort();
  const pb = [...new URLSearchParams(b).entries()].sort();
  return JSON.stringify(pa) === JSON.stringify(pb);
}

export function useUrlManagerSync(manager: UrlManagerLike, options: Options = {}) {
  const { stripQuery = false, extraParams, skipFirstIncoming = false } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const didFirstIncoming = useRef(false);

  // Serialized so the effects below key on the CONTENT of extraParams rather than the object
  // identity a caller rebuilds every render.
  const extrasKey = JSON.stringify(extraParams ?? {});

  // Outgoing: manager -> URL.
  useEffect(() => {
    const write = () => {
      const raw = manager.state.fragment;
      const params = new URLSearchParams(stripQuery ? withoutQ(raw) : raw);
      for (const [key, value] of Object.entries(JSON.parse(extrasKey) as Record<string, string | undefined>)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // A STRING, not the URLSearchParams object: handing React Router the object re-encodes
      // spaces as `+` and undoes `toFragment`'s whole purpose.
      const next = toFragment(params);
      // Against the LIVE address bar, never a render-time snapshot -- see the header note.
      if (!fragmentsEqual(next, window.location.search)) setSearchParams(next, { replace: true });
    };
    return manager.subscribe(write);
  }, [manager, stripQuery, extrasKey, setSearchParams]);

  // Incoming: URL -> manager, for a deep link and for back/forward.
  useEffect(() => {
    if (skipFirstIncoming && !didFirstIncoming.current) {
      didFirstIncoming.current = true;
      return;
    }
    const raw = toFragment(searchParams);
    const incoming = stripQuery ? withoutQ(raw) : raw;
    const current = stripQuery ? withoutQ(manager.state.fragment) : manager.state.fragment;
    if (!fragmentsEqual(incoming, current)) manager.synchronize(incoming);
  }, [searchParams, manager, stripQuery, skipFirstIncoming]);
}
