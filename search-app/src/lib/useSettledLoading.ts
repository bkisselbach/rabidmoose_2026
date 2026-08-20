import { useEffect, useState } from 'react';

/** True while a section is genuinely busy -- immune to brief flickers on BOTH edges, and to a
 *  sharper problem than a simple flicker: on this page, `isLoading` itself is not a trustworthy
 *  "is another response still coming" signal.
 *
 *  SearchResultsPage fires more than one commerce/content request per query on purpose (the
 *  search box's own submit and the url manager's synchronize() both fire, and a derived-facet
 *  query -- e.g. "rare holo" resolving to cardrarity + cardtypes -- can trigger up to three more
 *  correction passes, each its own round trip; see that file's syncUrl/reconcile comments). Those
 *  requests overlap and settle out of order against the SAME redux slice, and instrumenting it
 *  live showed why gating on `isLoading` alone still isn't enough: one request's fulfilled action
 *  can flip `isLoading` false while a DIFFERENT, still-in-flight request's pending phase never
 *  produced an observable `isLoading: true` tick of its own (it was dispatched while the flag was
 *  already true from the first one). That later request's own fulfilled action then overwrites
 *  `products` -- 20 real results silently becoming 0 -- with `isLoading` reading `false` on both
 *  sides of the change. A hook that only watches `isLoading` has no way to see that coming.
 *
 *  `revision` is the fix for that: bump it on EVERY subscribe notification a caller cares about,
 *  whether or not that notification's `isLoading` changed. Deliberately NOT wired into the rising
 *  edge, though -- a first attempt fed it into one shared timer for both edges, and a burst of
 *  revision bumps arriving faster than `onDelay` kept resetting that same timer, so `busy` could
 *  never actually fire true during a query still being classified (`understanding.isResolving`
 *  OR'd into `isLoading`, itself bumping `revision` on every intermediate response). Two
 *  independent timers fix it: the rising edge only watches `isLoading`, so it always fires
 *  `onDelay` after loading starts no matter how often data changes underneath it; the falling
 *  edge watches both, so a silent data change with no isLoading tick still pushes the "settled"
 *  deadline back out.
 *
 *  Starts `false` regardless of `isLoading`'s value at mount (rather than snapshotting it), so a
 *  fast first response that never keeps `isLoading` true for onDelay still goes straight from
 *  nothing to real content with no skeleton flash at all. */
export function useSettledLoading(
  isLoading: boolean,
  revision: number,
  // offDelay has to clear SearchResultsPage's own reconcile effect, which debounces its
  // correction passes at a hard-coded 400ms (see that file's `schedule()`) -- 450ms measured live
  // as too tight a margin: normal scheduling jitter pushed the real gap past it often enough that
  // the grid still revealed an intermediate, soon-to-be-corrected response before the burst
  // finished. 650ms clears that 400ms debounce with real headroom.
  { onDelay = 200, offDelay = 650 } = {}
): boolean {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setBusy(true), onDelay);
    return () => clearTimeout(t);
  }, [isLoading, onDelay]);

  useEffect(() => {
    if (isLoading) return;
    const t = setTimeout(() => setBusy(false), offDelay);
    return () => clearTimeout(t);
  }, [isLoading, revision, offDelay]);

  return busy;
}
