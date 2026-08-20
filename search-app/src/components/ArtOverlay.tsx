import { cn } from '@/lib/utils';

// The padded plate that anything overlaying a card scan sits in -- the merchandiser badge, the
// trending rank chip, the Featured pin.
//
// Why it exists: on every product surface the image is `object-contain` inside a `.product-stage`
// whose padding is 8px or less at the corners, so a card scan runs all the way into the corner a
// badge is pinned to. A bare badge there reads as printed onto the artwork rather than layered
// over it -- it collides with the card's own border, name and holo pattern, which are themselves
// dense and high-contrast. The plate gives the badge real padding on all four sides in the stage's
// own near-white, so the badge has somewhere to sit.
//
// Frosted rather than opaque (85% + a small backdrop blur) so it reads as glass over the scan
// instead of a sticker covering it, and the elevation is `shadow-rest` -- one of the site's two
// sanctioned levels, not a bespoke shadow. Positioning stays with the caller (each surface pins
// its own corner); everything visual lives here so the four call sites can't drift apart.
export function ArtOverlay({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        // max-w keeps the plate inside the stage at the narrowest card in the app -- the home
        // trending rail is ~99px wide at 375px, where a rank chip plus a two-word badge is wider
        // than the card itself. Without the cap the badges spilled past the stage and were cut off
        // square by its overflow-hidden (pre-existing, just less visible without a plate behind
        // them); with it the merch badge ellipsises instead, and the plate keeps its own corner.
        'flex max-w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-md bg-card/85 p-1.5 shadow-rest backdrop-blur-sm',
        className
      )}
    >
      {children}
    </div>
  );
}
