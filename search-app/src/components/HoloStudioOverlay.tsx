import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from 'radix-ui/dialog';
import { FlipHorizontal2, Rotate3d, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MooseMark } from '@/components/MooseMark';
import { Slider } from '@/components/ui/slider';
import { formatCurrency } from '@/lib/currency';
import { burstConfetti } from '@/lib/confettiBurst';
import { logCustomInteraction } from '@/lib/customEvents';
import { cn } from '@/lib/utils';

// The 3D Holo Studio (presentation/flavor-round-plan.md item 23), ported from the mockup's
// HoloCard3D -- as a PDP overlay over THIS card's real art, not the mockup's dedicated page with
// one fixed fake card (user decision, 2026-08-17). What was deliberately not ported: the
// fabricated appraisal box ($349.99/$950.00 -- invented numbers) and the stat editor. The one
// price shown here is the product's real market price.
//
// The tilt/glare mechanics follow this app's own precedents rather than the mockup's
// per-mousemove setState: pointer math is written to CSS custom properties, coalesced to one
// write per animation frame (HoloFoil.tsx's exact pattern), with a short CSS transform
// transition doing the smoothing. Fine-pointer only -- a touch viewport gets `.studio-sweep`,
// a slow autonomous glare drift, instead of tilt; a reduced-motion reader gets a static card
// (no listeners, no sweep -- the CSS blanket rule collapses the keyframe, and the JS checks the
// same query before attaching anything).
//
// The foil picker is COSMETIC and says so on the page: the card's real printing is whatever
// `cardrarity` indexed, and the dialog's description line names it, so trying on "Gold" over a
// Common never reads as a claim about the product.

const FOIL_STYLES = ['cosmic', 'rainbow', 'gold', 'prismatic', 'vintage'] as const;
type FoilStyle = (typeof FOIL_STYLES)[number];

// Blend-mode-per-style comes straight from the mockup's getFoilOverlay; the gradient classes are
// the shared utilities in index.css (both carry background-size: 200% so the glare travel shows,
// the fix the mockup itself needed). Prismatic/vintage express their gradients inline-in-class;
// their background-size rides the inline style below.
const FOIL_OVERLAYS: Record<FoilStyle, string> = {
  cosmic: 'holo-rainbow mix-blend-color-dodge',
  rainbow: 'holo-rainbow mix-blend-overlay',
  gold: 'gold-foil mix-blend-color-dodge',
  prismatic: 'prismatic-foil mix-blend-hard-light',
  vintage: 'vintage-foil mix-blend-screen',
};

/** The starting foil, derived from the card's REAL rarity so the studio opens looking like the
 *  printing it shows -- secret/hyper rarities read gold, the illustration/V-family reads rainbow,
 *  everything else gets the neutral cosmic. Purely a default; the picker overrides freely. */
function defaultFoil(rarity: string | undefined): FoilStyle {
  const r = rarity?.toLowerCase() ?? '';
  if (r.includes('secret') || r.includes('hyper')) return 'gold';
  if (r.includes('illustration') || r.includes('vmax') || r.includes('vstar') || r.includes(' v')) return 'rainbow';
  return 'cosmic';
}

const TILT_DEG = 16;

interface Props {
  imageUrl: string;
  cardName: string;
  rarity?: string;
  price?: number;
  /** Positioning classes for the trigger pill -- the PDP stage places it next to its Zoom pill. */
  className?: string;
}

export function HoloStudioButton({ imageUrl, cardName, rarity, price, className }: Props) {
  const [open, setOpen] = useState(false);
  const [foil, setFoil] = useState<FoilStyle>(() => defaultFoil(rarity));
  const [reflectivity, setReflectivity] = useState(0.65);
  const [flipped, setFlipped] = useState(false);
  // Once, at mount: which interaction mode this environment gets. Pointer tilt needs a real
  // hover-capable fine pointer AND motion being acceptable; the sweep stand-in only needs the
  // latter (its keyframe is additionally collapsed by the CSS blanket rule).
  const [pointerTilt] = useState(
    () =>
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  // A STATE-backed element, not a plain ref, and the difference is load-bearing: radix's Presence
  // mounts DialogContent's children one commit AFTER `open` flips true, so an effect keyed on
  // `open` runs while a plain ref is still null and never re-runs -- the listeners silently never
  // attach (caught live by the item-23 verification script, not by the compiler). A callback ref
  // through setState re-fires the effect at the moment the card element actually exists, and
  // hands it null again when the dialog closes, which doubles as the cleanup trigger.
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);

  // HoloFoil.tsx's rAF-coalescing pattern, verbatim in shape: pointer math goes to CSS custom
  // properties on the card element, one write per frame, never through React state -- state would
  // re-render the whole dialog per mousemove.
  useEffect(() => {
    if (!cardEl || !pointerTilt) return;
    const card = cardEl;
    const stage = card.parentElement;
    if (!stage) return;

    let frame = 0;
    let pending: { rx: number; ry: number; gx: number; gy: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      card.style.setProperty('--studio-rx', `${pending.rx}deg`);
      card.style.setProperty('--studio-ry', `${pending.ry}deg`);
      card.style.setProperty('--studio-gx', `${pending.gx}%`);
      card.style.setProperty('--studio-gy', `${pending.gy}%`);
      pending = null;
    };

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      pending = {
        // Negative on X: tilt AWAY from the pointer vertically, the mockup's own "push" feel.
        rx: ((y - r.height / 2) / (r.height / 2)) * -TILT_DEG,
        ry: ((x - r.width / 2) / (r.width / 2)) * TILT_DEG,
        gx: (x / r.width) * 100,
        gy: (y / r.height) * 100,
      };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onLeave = () => {
      pending = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      card.style.setProperty('--studio-rx', '0deg');
      card.style.setProperty('--studio-ry', '0deg');
      card.style.setProperty('--studio-gx', '50%');
      card.style.setProperty('--studio-gy', '50%');
    };

    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    return () => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [cardEl, pointerTilt]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Mirrors the Zoom pill's exact treatment (`--scrim`, the pinned-dark photography token --
          see the Zoom pill's own comment on the PDP), except this one is a real button. */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          logCustomInteraction('holoStudioOpen', { productName: cardName });
        }}
        aria-label="Open the 3D Holo Studio"
        className={cn(
          'pressable',
          'flex items-center gap-1 rounded-full bg-scrim/70 px-2 py-1 text-2xs font-medium text-white transition-colors hover:bg-scrim/90',
          className
        )}
      >
        <Rotate3d className="h-3 w-3" /> 3D
      </button>
      <DialogPortal>
        <DialogOverlay className="modal-overlay" />
        <DialogContent className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto p-4">
          <DialogTitle className="sr-only">3D Holo Studio — {cardName}</DialogTitle>
          <DialogDescription className="sr-only">
            Tilt the card and try foil finishes. The finishes are cosmetic presets, not the card's real printing.
          </DialogDescription>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close"
              className="pressable photo-control absolute right-4 top-4 z-10"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogClose>

          {/* The stage: pointer events are listened for on this wrapper (a bigger target than the
              card itself), perspective lives here so the card's rotate reads as depth. */}
          <div className="perspective-1000 flex items-center justify-center px-8 py-2">
            <div
              ref={setCardEl}
              className="transform-style-3d relative aspect-[5/7] w-64 transition-transform duration-150 ease-out sm:w-80"
              style={{
                transform:
                  'rotateX(var(--studio-rx, 0deg)) rotateY(calc(var(--studio-ry, 0deg) + var(--studio-flip, 0deg)))',
                ['--studio-flip' as string]: flipped ? '180deg' : '0deg',
                willChange: 'transform',
              }}
            >
              {/* Front: the real scan, foil overlay, specular hotspot. */}
              <div className="backface-hidden absolute inset-0 overflow-hidden rounded-2xl bg-card shadow-float">
                <img src={imageUrl} alt={cardName} className="h-full w-full object-cover" />
                <div
                  aria-hidden="true"
                  className={cn('pointer-events-none absolute inset-0', FOIL_OVERLAYS[foil], !pointerTilt && 'studio-sweep')}
                  style={{
                    opacity: reflectivity,
                    backgroundSize: '200% 200%',
                    // Inline background-position would defeat the sweep animation, so only the
                    // pointer-tracked mode sets it.
                    ...(pointerTilt && { backgroundPosition: 'var(--studio-gx, 50%) var(--studio-gy, 50%)' }),
                  }}
                />
                {pointerTilt && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at var(--studio-gx, 50%) var(--studio-gy, 50%), hsl(0 0% 100% / 0.4) 0%, hsl(0 0% 100% / 0.08) 25%, transparent 55%)',
                    }}
                  />
                )}
              </div>
              {/* Back: a RabidMoose SLEEVE, on purpose -- inventing a fake card back would be
                  fabricating a printing; a branded sleeve reads as real merch either way. */}
              <div
                className="pack-stage backface-hidden absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border-2 shadow-float"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <span className="holo-rainbow absolute inset-0 opacity-30" aria-hidden="true" />
                {/* Un-ringed as well as unclipped: `MooseMark` owns the no-clip rule, and the ring
                    this used to carry traced a circle the art no longer fills. The badge has a rim
                    of its own. */}
                <MooseMark className="h-24 w-24 drop-shadow-[0_2px_6px_hsl(0_0%_0%/0.45)]" />
                <span className="font-display text-xs font-bold uppercase tracking-widest text-primary">
                  RabidMoose sleeve
                </span>
              </div>
            </div>
          </div>

          {/* Identity line: real name, real printing, real price -- the studio's one honest
              anchor while the foil above is openly dress-up. */}
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-base font-bold text-white">{cardName}</span>
            <span className="text-sm text-white/60">
              {rarity ? `Real printing: ${rarity}` : 'Printing unknown'}
              {price !== undefined && ` · ${formatCurrency(price)}`}
            </span>
          </div>

          <div className="flex max-w-full flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Foil style">
              {FOIL_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setFoil(style)}
                  aria-pressed={foil === style}
                  className={cn(
                    'pressable',
                    'rounded-full border px-3 py-1 text-2xs font-semibold uppercase tracking-wide transition-colors',
                    foil === style
                      ? 'border-accent-secondary bg-accent-secondary text-accent-secondary-foreground'
                      : 'border-white/25 text-white/70 hover:border-white/60 hover:text-white'
                  )}
                >
                  {style}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 text-2xs font-semibold uppercase tracking-wide text-white/70">
              Foil reflectivity
              <Slider
                value={[reflectivity]}
                min={0.2}
                max={1}
                step={0.05}
                onValueChange={([v]) => setReflectivity(v)}
                className="w-40"
                aria-label="Foil reflectivity"
              />
            </label>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setFlipped((f) => !f)} className="gap-1.5">
                <FlipHorizontal2 className="h-4 w-4" /> {flipped ? 'Show front' : 'Flip card'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void burstConfetti({
                    particleCount: 80,
                    spread: 70,
                    origin: { y: 0.4 },
                    colors: ['#FBBF24', '#A855F7', '#38BDF8', '#F43F5E', '#FFFFFF'],
                  })
                }
                className="gap-1.5"
              >
                <Sparkles className="h-4 w-4" /> Sparkle burst
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
