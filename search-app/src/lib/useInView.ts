import { useEffect, useRef, useState } from 'react';

/**
 * "Has this element been on screen yet?" — a one-way latch, not a live visibility flag.
 *
 * Built for item 31d: badge enrichment costs ONE request per product (the Badges API takes a single
 * `productId` and has no batch shape, so that is a platform constraint rather than something to
 * optimise away), and a `/search` grid asked for 29 of them on every query while showing about
 * eight tiles above the fold. The fix is not to stop asking — the badges are real, they render, and
 * "Vintage + High Value" on a Base-era holo is a scripted demo beat — it is to stop asking for
 * tiles nobody has scrolled to.
 *
 * WHY IT LATCHES. Once a tile has been seen, its badges are fetched and cached, and un-fetching
 * them on scroll-away would buy nothing while risking a badge row that appears, vanishes and
 * reappears as the grid scrolls. So this flips false → true exactly once and then stops observing.
 *
 * WHY IT DEFAULTS TO TRUE WITHOUT AN OBSERVER. In a JSDOM/SSR context, or any browser without
 * IntersectionObserver, the honest fallback is the old behaviour — fetch everything — rather than
 * silently rendering a grid that never gets badges at all.
 */
export function useInView<T extends Element>(rootMargin = '200px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      // A generous margin so a tile's badges are already in flight by the time it reaches the
      // viewport -- the queue is serialized, so arriving late looks like a badge popping in.
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
