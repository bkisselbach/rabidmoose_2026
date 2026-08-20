import { useCallback, useEffect, useRef, useState } from 'react';

/** Scroll state for a horizontal scroll-snap rail.
 *
 *  The home page's trending cards and the /search Pokédex match strip are the same interaction --
 *  a snap rail that the user swipes on touch and drives with arrows on desktop -- so they share one
 *  implementation rather than two copies that drift apart. Mount the returned `railRef`/`onScroll`
 *  on the scrolling element and render the buttons wherever the layout wants them: the home rails
 *  flank the cards with two <RailArrow>s off a `relative` wrapper, the Pokédex strip keeps the
 *  <RailArrows> pair in its header row.
 *
 *  `itemCount` re-measures when the rail's contents change: a response that returns fewer species
 *  than the last one can make the rail stop overflowing, and the arrows have to notice and hide. */
export function useScrollRail(itemCount: number) {
  const railRef = useRef<HTMLDivElement>(null);
  // Both flags true at once means the content fits without scrolling (start and end are the same
  // position), which is how `canScroll` knows to hide the arrows entirely.
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  const updateEdges = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setEdges({
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [updateEdges, itemCount]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const el = railRef.current;
    // 90% of the viewport per click keeps the last partially visible item in view as context.
    el?.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: 'smooth' });
  }, []);

  return {
    railRef,
    onScroll: updateEdges,
    atStart: edges.atStart,
    atEnd: edges.atEnd,
    canScroll: !(edges.atStart && edges.atEnd),
    scrollByPage,
  };
}

export type ScrollRail = ReturnType<typeof useScrollRail>;
