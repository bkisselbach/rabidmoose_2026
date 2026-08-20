import { useEffect, useRef, useState } from 'react';
import { CONTENT_FIELDS } from '@/contentFields';
import { useTrendingListing } from '@/homeControllers';

// The home page's two headline numbers, both read live from the index rather than hardcoded --
// the whole point of the cold open is that the counts are real. The card total rides the trending
// request the page already fires; the species total is a single count-only Search API call (no
// engine, so it can't disturb the /search page's shared content controllers).

const REDUCED_MOTION = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts 0 -> target once, the first time target lands. Honors prefers-reduced-motion by
 *  snapping straight to the value. */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const animatedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!target || animatedFor.current === target) return;
    animatedFor.current = target;
    if (REDUCED_MOTION()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic -- fast start, soft landing, so the number reads as settling rather than ticking
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

export function useHomeCounts(): { cardTotal: number; pokemonTotal: number } {
  const { totalEntries: cardTotal } = useTrendingListing();
  const [pokemonTotal, setPokemonTotal] = useState(0);

  useEffect(() => {
    const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
    const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
    let cancelled = false;

    fetch(`https://platform.cloud.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      // numberOfResults: 0 -- this call exists only for totalCount.
      body: JSON.stringify({ q: '', aq: `@${CONTENT_FIELDS.name}<>""`, numberOfResults: 0 }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setPokemonTotal(Number(data.totalCount) || 0);
      })
      .catch(() => {
        // A missing species count just hides that half of the sub-line; it never blocks the hero.
        if (!cancelled) setPokemonTotal(0);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { cardTotal, pokemonTotal };
}
