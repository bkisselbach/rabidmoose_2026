import { useEffect, useState } from 'react';

/** True only once `active` has stayed true continuously for `delayMs`. Guards a loading skeleton
 *  against flashing for a single frame on a fast response -- most of this app's own index reads
 *  (content search, commerce facets) settle well under the eye's flicker threshold, so a skeleton
 *  gated on raw `isLoading` shows for one paint and vanishes, which reads as a glitch rather than
 *  a loading state. Flips back to `false` the instant `active` goes false (no symmetric delay on
 *  the way down), so it never lags behind once the real content is ready.
 *
 *  IMPORTANT for callers: do NOT gate whether the skeleton *exists* on this -- gate whether it is
 *  VISIBLE (see `reservedRevealClass`). Using it to decide existence leaves the results area
 *  genuinely empty for `delayMs` on a cold load, so the page is short, the footer sits high, and
 *  the skeleton then shoves everything down when it appears. Measured on /pokemon-news: a 0.18
 *  layout shift, the worst in the app, on a page that already had a perfectly good skeleton. */
export function useDelayedReveal(active: boolean, delayMs = 250): boolean {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!active) {
      setRevealed(false);
      return;
    }
    const t = setTimeout(() => setRevealed(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  return revealed;
}

/** Class for a skeleton that is MOUNTED (so it holds its space) but not yet shown. `invisible`
 *  keeps it in layout while painting nothing, which is what makes both outcomes shift-free: a fast
 *  response swaps invisible-skeleton straight for content with no flash, and a slow one fades the
 *  same, already-sized block into view. Pair with `useDelayedReveal`:
 *
 *      {isLoading ? <div className={reservedRevealClass(showSkeleton)}>…skeleton…</div> : …}
 */
export function reservedRevealClass(revealed: boolean): string {
  return revealed ? 'opacity-100 transition-opacity duration-200' : 'invisible';
}
