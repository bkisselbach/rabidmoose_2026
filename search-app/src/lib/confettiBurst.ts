// One confetti door for the whole app. One caller today -- HoloStudioOverlay's sparkle burst; this
// header named a second, `RipPackModal`, for long enough that it outlived the component itself
// (no such file exists anywhere in the tree). Two properties every caller gets for free and must
// not reimplement:
//  - the library is dynamically imported, so its chunk never loads unless someone actually fires a
//    burst -- canvas-confetti is flavor, and flavor doesn't belong in the main bundle;
//  - a reduced-motion reader never gets particles at all. The CSS blanket kill-switch cannot reach
//    a canvas the library draws on, so the gate has to live here, in front of the import.

/** A moose-head SILHOUETTE, hand-authored on a 64x64 grid -- deliberately not a trace of
 *  `brand/rabidlogo.png`. A particle renders at roughly 10px: every interior line of the real mark
 *  (the eye, the teeth, the rim) is sub-pixel there, so an accurate trace would fill as a brown
 *  blob. What survives at that size is the OUTLINE, and the outline is the antlers, so this draws
 *  those bold enough to read and nothing else.
 *
 *  All three subpaths WIND THE SAME DIRECTION, and that is load-bearing rather than tidy: Path2D
 *  fills nonzero, so mirroring the left antler into the right one point-for-point (the obvious way
 *  to write it) gives the right antler the opposite winding and punches a hole through the skull
 *  wherever the two overlap. The right antler below is the mirror traversed in REVERSE order. If
 *  you ever edit this, render it large before trusting it -- the hole is invisible at particle
 *  size and obvious at 200px. */
const MOOSE_PATH =
  'M32 25c7 0 11 4 11 10 0 5-2 8-4 11-2 4-3 8-7 8s-5-4-7-8c-2-3-4-6-4-11 0-6 4-10 11-10z' +
  'M25 32L19 23L11 19L7 11L10 10L13 17L15 9L18 9L17 18L22 11L25 12L22 22L31 33Z' +
  'M33 33L42 22L39 12L42 11L47 18L46 9L49 9L51 17L54 10L57 11L53 19L45 23L39 32Z';

/** Built once, lazily: `shapeFromPath` needs Path2D, so it cannot run at module scope in any
 *  non-browser context, and it is only reachable after the dynamic import resolves anyway. */
let mooseShape: unknown;

export async function burstConfetti(options: {
  particleCount: number;
  spread: number;
  origin: { y: number };
  colors: string[];
}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const confetti = (await import('canvas-confetti')).default;
  mooseShape ??= confetti.shapeFromPath({ path: MOOSE_PATH });

  confetti({
    ...options,
    // The moose is ONE OF THREE shapes, not the only one. canvas-confetti draws each particle from
    // a uniformly random pick, so this is ~1/3 mascots against ~2/3 house confetti -- enough that
    // the burst is recognisably this site's, not so much that 80 identical moose heads rain down
    // the screen, which reads as a bug rather than a flourish.
    shapes: [mooseShape as never, 'square', 'circle'],
    // Slightly larger than the 1 default: the silhouette needs a little more area than a square to
    // resolve its antlers, and the two stock shapes carry the size change without looking wrong.
    scalar: 1.15,
  });
}
