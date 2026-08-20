import { useEffect, useRef } from 'react';

// The foil sheen that sits over a holo card's art (2026-08-17, direct request: make the site more
// "pokemony ... slick animations ... fun but not over the top").
//
// WHO GETS IT is the part that matters: callers gate this on `isHoloRarity`, so it tracks the
// indexed `cardrarity` field rather than being decoration applied to every tile. Roughly one card
// in five qualifies. A Common never shines, which is what keeps the shine meaning something -- and
// it is the same field the identity line renders as text, so the effect and the label are two
// readings of one piece of data.
//
// RESTRAINT, against this app's written motion policy ("nothing loops fast, nothing bounces") and
// against the precedent that a pulsing hero glow was built and removed at the user's request:
//   - There is no idle animation. The layer is invisible until a pointer is over the card and
//     fades back out when it leaves; nothing moves on its own, ever.
//   - It is opt-in per rarity, not per surface.
//   - The palette does not grow: the sheen is white plus the two brand accents already defined
//     (--primary amber, --accent-secondary violet) at low alpha. No third colour enters the app.
//
// TOUCH AND REDUCED MOTION are handled in CSS rather than here (see `.holo-foil` in index.css):
// the effect is behind `@media (hover: hover) and (pointer: fine)`, so a phone never runs it and
// can never strand a half-lit frame after a tap, and it is disabled again under
// `prefers-reduced-motion`. This component still mounts in those cases -- it just paints nothing --
// which keeps the DOM identical across environments and avoids a layout difference between them.
//
// The pointer maths is written to CSS custom properties on the element rather than to React state
// on purpose: state would re-render the whole card on every mouse move, and a results grid has
// twenty of them. Writes are coalesced to one per animation frame for the same reason.
export function HoloFoil({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The card, not the foil layer: the layer is `pointer-events: none` (it must not intercept the
    // stretched link underneath), so it never receives a pointer event of its own.
    const host = el.parentElement;
    if (!host) return;

    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      el.style.setProperty('--holo-x', `${pending.x}%`);
      el.style.setProperty('--holo-y', `${pending.y}%`);
      pending = null;
    };

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      pending = {
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      };
      // One write per frame no matter how fast the pointer moves. Without this a fast drag across
      // a full grid queues a style write per pointermove event, per card under the cursor.
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onLeave = () => {
      pending = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      // Recentre so the next hover starts from the middle rather than snapping from wherever the
      // pointer happened to exit.
      el.style.setProperty('--holo-x', '50%');
      el.style.setProperty('--holo-y', '50%');
    };

    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} aria-hidden="true" className={`holo-foil ${className ?? ''}`} />;
}
