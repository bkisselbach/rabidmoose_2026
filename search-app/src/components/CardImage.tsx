import { cn } from '@/lib/utils';

// The one product image element — item 31e / performance-plan.md Part 5.
//
// WHAT IT REPLACES. Five surfaces spelled the same thing by hand:
//
//     {product.ec_images?.[0] && <img src={product.ec_images[0]} alt={...} className={...} />}
//
// ProductCard, ProductListItem, ProductCardMini, ConsultantResultTile, CompareTray (twice) and
// CartPage. Measured 2026-08-19: 18 images on `/search`, **0 lazy and 0 carrying intrinsic
// dimensions**, while the Pokédex and news surfaces had been lazy-loading all along. The commerce
// surfaces are exactly the ones rendered 18–50 at a time, so the half of the app that needed it
// most was the half that did not have it.
//
// THREE THINGS IT DOES THAT THE HAND-WRITTEN COPIES DID NOT:
//
//   1. `loading="lazy"` and `decoding="async"` by default, so a grid of 50 tiles fetches what is
//      on screen. The `priority` escape exists because the rule inverts for the LCP image: lazy-
//      loading the one picture the visitor is waiting for makes the page measurably slower, so
//      that one asks for `eager` + `fetchPriority="high"` instead.
//   2. Intrinsic dimensions. The ratio, not a promise about pixels — every caller sizes the box in
//      CSS (`h-full w-full`, `max-h-full`), so these attributes never fight the layout; they just
//      let the browser reserve the right shape before the CSS lands.
//   3. The missing-source guard, once. Every call site wrapped its `<img>` in `src && (...)`, and
//      one of them (CartPage) spelled it differently again with a Map lookup. Returning null for a
//      missing source is the component's job, not the caller's.
//
// WHAT IT DELIBERATELY DOES NOT ABSORB. `NewsArt`'s resolution chain — species sprite, then the
// set's wordmark, then the self-hosted hero, then the category icon — stays in `NewsArt`. That is
// editorial domain logic about what a story should look like, not image plumbing, and pulling it
// in here would make this component know about Pokédex sprites and news categories. The generic
// half of it, "this source 404'd at runtime, fall back", is available through `onError`.

interface Props {
  /** A missing/empty source renders nothing at all — that guard lives here, not at the call site. */
  src?: string | null;
  /** Empty string is a legitimate value: a tile whose product name is already adjacent in the DOM
   *  should not repeat it to a screen reader. */
  alt: string;
  className?: string;
  /** The LCP image only. Switches to eager + high fetch priority. */
  priority?: boolean;
  /** Intrinsic ratio hint. Defaults to a card's 5:7 — the shape of every product image in this
   *  catalog. */
  width?: number;
  height?: number;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

export function CardImage({ src, alt, className, priority = false, width = 500, height = 700, onError }: Props) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      // Lowercase `fetchpriority`, and only when it says something. React 18 does not know the
      // camelCase `fetchPriority` prop -- it forwards the attribute correctly but logs "React does
      // not recognize the fetchPriority prop ... spell it as lowercase" for every image on the
      // page, and a console full of framework warnings is where real ones go to hide. Spreading a
      // lowercase key skips React's prop allow-list entirely. Drop this for the camelCase form
      // whenever this app moves to React 19, which added it.
      {...(priority ? ({ fetchpriority: 'high' } as React.ImgHTMLAttributes<HTMLImageElement>) : {})}
      decoding="async"
      onError={onError}
      className={cn(className)}
    />
  );
}
