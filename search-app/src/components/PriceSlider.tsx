import { useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { fetchTopCards } from '@/lib/topCards';

// "Under: $X", a real single-thumb slider -- matches the mockup's layout (`TcgMarketplace.tsx`'s
// own price control is exactly this shape) but not its bound: the mockup hardcodes `max={4000}`
// against local mock data, and `ec_price` isn't a live CMH slider facet (no `domain` on the facet
// response -- see NumericFacet.tsx's isSliderFacet comment), so there's no live bound to read the
// way HP's slider does. The upper bound instead comes from `fetchTopCards()` -- already fetched
// (and memoized) by the home hero's own flanking-card logic in the common case, so this typically
// costs no extra request -- taking the single highest real `ec_price` in the catalog. Renders
// nothing until that real number lands, rather than showing a slider against a guessed ceiling.
//
// Extracted 2026-08-16 from HomeMarketplaceBar.tsx (its first caller) so NumericFacet.tsx's
// /search facet bar could reuse it rather than duplicating the fetch-a-real-bound logic.
export function PriceSlider({ onCommit }: { onCommit: (maxPrice: number) => void }) {
  const [bound, setBound] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchTopCards().then((cards) => {
      if (cancelled) return;
      const top = cards[0]?.price;
      if (top) setBound(Math.ceil(top / 10) * 10);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Starts at the top (no filter) once the real bound lands; re-synced if the bound itself changes
  // (e.g. a slow first fetch resolving after mount), not on every render.
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    if (bound !== null) setPending(bound);
  }, [bound]);

  if (bound === null || pending === null) return null;

  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
      data-testid="facet"
      data-facet-id="ec_price"
    >
      <span>
        Under: <strong className="text-foreground tabular-nums">${Math.round(pending).toLocaleString('en-US')}</strong>
      </span>
      <Slider
        min={0}
        max={bound}
        step={Math.max(1, Math.round(bound / 100))}
        value={[pending]}
        onValueChange={(next) => setPending(next[0])}
        onValueCommit={(next) => onCommit(next[0])}
        className="w-24"
      />
    </div>
  );
}
