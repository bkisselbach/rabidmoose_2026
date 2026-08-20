import type { CSSProperties } from 'react';

/** The default ramp: two adjacent tiles in a grid or a rail. */
export const TILE_RAMP = { stepMs: 28, capMs: 200 };

/** The props that make one item of a collection "deal in" -- `.deal-in` in index.css, which is
 *  `rise-in` with a per-item delay read off `--deal-index`, so a grid arrives like a hand of cards
 *  being dealt rather than as one block.
 *
 *  This exists because the mechanism needs a `CSSProperties` cast to pass a custom property through
 *  React's `style` prop, and that cast was about to be retyped at eleven call sites. One typo in one
 *  of them -- `--dealIndex`, `--deal_index` -- would silently produce a grid where every tile shares
 *  the default delay of 0 and the ripple quietly disappears, with nothing to catch it: no type error,
 *  no runtime warning, just an animation that plays as a block again.
 *
 *  The cap that keeps this safe on a long page lives in the CSS, not here (see `.deal-in`): the delay
 *  is `min(index * 28ms, 200ms)`, so a 200-tile rail ripples over the same ~200ms a 6-tile one does.
 *  Callers therefore pass the real index and never have to clamp it themselves.
 *
 *  ONE TRAP, and every call site has to answer it: a `.deal-in` child inside a `.fade-in-panel`
 *  parent double-dims its own first frames -- two entrance animations composing on nested elements
 *  read as a smear rather than a deal. Where a collection sits inside a panel that already animates
 *  its own arrival, drop one of the two. `ProductResultsGrid` drops the parent's on its grid branch
 *  and keeps it on the list branch (rows have no per-item entrance of their own), which is the
 *  pattern to copy.
 *
 *  `extraClassName` is for the rails specifically, and it is not a convenience. In a horizontal
 *  rail the wrapper this returns becomes the flex item, and the tile it wraps is the thing that
 *  used to carry `shrink-0` / `snap-start` -- so without a way to put those on the wrapper, adding
 *  the entrance would quietly let every tile in a rail compress to fit instead of scrolling.
 */
export function dealInProps(
  index: number,
  extraClassName?: string,
  /** Overrides for the delay ramp. Defaults (28ms step, 200ms cap) are the tile numbers and are
   *  what every grid and rail should use. Pass these only for a stagger at a different physical
   *  scale -- see `.deal-in` in index.css for why the home page's four full-width sections need a
   *  bigger step than two adjacent tiles do. */
  ramp: { stepMs: number; capMs: number } = TILE_RAMP
): { className: string; style: CSSProperties } {
  return {
    className: extraClassName ? `deal-in ${extraClassName}` : 'deal-in',
    // The ramp is ALWAYS written, never left to the CSS defaults, and that is a bug fix rather than
    // a style choice. Custom properties inherit: once the home page's sections set a 90ms step on
    // their wrappers, every `.deal-in` nested inside one -- the card rails in Trending and
    // Recently Viewed -- inherited the SECTION ramp instead of falling back to the tile defaults.
    // Caught live: rail tiles 4 through 9 all computed to the same 0.32s delay, so the ripple those
    // rails are supposed to have collapsed into one clump arriving late. Emitting both properties
    // on every deal-in element re-declares them at each level and stops the inheritance at the
    // nearest wrapper.
    style: {
      '--deal-index': index,
      '--deal-step': `${ramp.stepMs}ms`,
      '--deal-cap': `${ramp.capMs}ms`,
    } as CSSProperties,
  };
}


/** The ramp the home page's full-width sections use. Exported rather than spelled at each of the
 *  four call sites so they cannot drift apart -- a stagger where section 3 steps at a different
 *  rate than section 2 is worse than no stagger at all. */
export const HOME_SECTION_RAMP = { stepMs: 90, capMs: 320 };
