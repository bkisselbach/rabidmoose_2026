import { stripKeys } from '@/searchResultsControllers';

// Pure URL-fragment helpers used by SearchResultsPage.tsx's URL<->engine sync. Hoisted out of the
// component (they were previously redefined as closures on every render despite closing over
// nothing but their own arguments) into plain module-scope functions.

/** A conversational query is the one case where the URL's `q` and the engines' `q` are
 *  deliberately different: the address bar has to keep what the user typed ("i need to counter
 *  air pokemon") while the engines run the rewrite (empty text + counter-type facets). The url
 *  managers only know about their own engine state, so left alone they immediately serialize the
 *  *rewritten* text back over the URL -- which wipes `q`, makes the page think it's browsing, and
 *  re-parses an empty query on the next render, undoing the whole feature. Observed exactly that:
 *  both rewritten queries fell through to the "Every card, live-priced" browse heading.
 *
 *  So `q` is swapped at both boundaries and nowhere else: the URL always shows the user's words,
 *  the managers always see the engines'. When nothing was rewritten the two are identical and
 *  every call site is a no-op. */
export const withQueryParam = (fragment: string, value: string) => {
  const pairs = fragment.split('&').filter((pair) => pair && pair.split('=')[0] !== 'q');
  // Same encoding dialect as toEngineFragment below -- %20 for spaces, literal commas.
  if (value) pairs.unshift(`q=${encodeURIComponent(value).replace(/%2C/g, ',')}`);
  return pairs.join('&');
};

/** Order-, duplicate- and encoding-insensitive comparison key for a query-string fragment.
 *
 *  Needed because the two sides being compared are not written in the same dialect and never were:
 *  `mergedFragment()` (in SearchResultsPage.tsx) concatenates BOTH url managers' fragments, so it
 *  legitimately carries `q=` twice, while anything that has been through `withQueryParam` (or the
 *  browser's own `URLSearchParams`) carries it once -- and the browser writes spaces as '+' where
 *  Coveo writes '%20'. A raw string compare between those can never be equal, so the restore effect
 *  fired `synchronize()` on every single response, each of which produced another response. That is
 *  a self-sustaining search loop: measured at ~3 content searches/second, climbing without bound
 *  until the browser tab crashed outright. Comparing normalized keys is what makes both the
 *  "already in sync, do nothing" cases actually detectable. */
export const fragmentKey = (fragment: string) =>
  [
    ...new Set(
      fragment
        .split('&')
        .filter(Boolean)
        .map((pair) => {
          const splitAt = pair.indexOf('=');
          const key = splitAt === -1 ? pair : pair.slice(0, splitAt);
          const raw = splitAt === -1 ? '' : pair.slice(splitAt + 1);
          // '+' is only a space in the browser's www-form-urlencoded dialect; decoding it here
          // (and tolerating a malformed escape) puts both dialects in the same space.
          let value = raw.replace(/\+/g, ' ');
          try {
            value = decodeURIComponent(value);
          } catch {
            /* leave a malformed escape as-is rather than throwing inside a render path */
          }
          return `${key}=${value}`;
        })
    ),
  ]
    .sort()
    .join('&');

/** The same key with the derived budget filtered out -- the one key whose two comparisons in
 *  SearchResultsPage.tsx have to disagree with each other.
 *
 *  OUTGOING (syncUrl) must be blind to it. The commerce url manager doesn't serialize
 *  `f-cardtypes`/`f-cardrarity`, so those are written to the URL once, deserialized once, and
 *  thereafter both sides agree they are absent -- an accidental equilibrium the derived-facet
 *  effect depends on. `mnf-` breaks that symmetry because the manager DOES serialize it: the
 *  moment a range is applied the manager's fragment and the URL disagree, syncUrl rewrites the
 *  URL, and that rewrite is what drags the *other* derived facets through a synchronize() that
 *  clears them as collateral. Comparing price-blind here keeps that rewrite from firing on a
 *  budget alone.
 *
 *  INCOMING (the restore effect) must NOT be blind to it, and once was -- `fragmentKey` itself
 *  used to strip the key, which made the range invisible to both comparisons. The cost was the
 *  whole feature on any query whose ONLY derived filter is a budget: "charizard under $25" put
 *  `mnf-ec_price` in the URL, both keys came out identical, synchronize() never ran, and the
 *  range the banner was already drawing never reached the engine. The same blindness meant an
 *  applied range could never be *cleared* either, so one query's budget silently survived into
 *  every search after it. The restore effect therefore compares on the full `fragmentKey`, and
 *  syncUrl writes the manager's own `mnf-` through unchanged so the two sides stay agreed once a
 *  range has landed. */
export const stripPriceKey = (fragment: string) => stripKeys(fragment, ['mnf-ec_price']);

/** A URL's params rewritten into the dialect Coveo's url managers actually deserialize, with the
 *  engine-facing query swapped in. The one place these rules live -- both the restore effect and
 *  the derived-state reconcile hand fragments to `synchronize()`, and duplicating them is how
 *  `f-cardtypes=Lightning,Grass` came back as a single facet value named "Lightning,Grass".
 *
 *  Two rules, each learned the hard way:
 *  1. Coveo deserializes with plain decodeURIComponent, which (unlike URLSearchParams) does NOT
 *     treat '+' as a space. `searchParams.toString()` writes spaces as '+' (React Router follows
 *     www-form-urlencoded), so passing that straight through bakes literal '+' into the restored
 *     query text. Re-encoding each value keeps it in Coveo's dialect (%20 for space).
 *  2. But encodeURIComponent also escapes ',', and Coveo represents a multi-select facet as
 *     comma-joined values it splits on when restoring -- so a %2C reads back as one bogus value.
 *     Un-escaping just the comma preserves rule 1 without breaking multi-select. */
export const toEngineFragment = (params: URLSearchParams, engineQuery: string) =>
  withQueryParam(
    Array.from(params.entries())
      .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%2C/g, ',')}`)
      .join('&'),
    engineQuery
  );

export const priceBlindKey = (fragment: string) => fragmentKey(stripPriceKey(fragment));
