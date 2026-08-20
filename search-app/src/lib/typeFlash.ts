/** Which type facet value was just selected, held OUTSIDE React so it survives the control being
 *  destroyed.
 *
 *  This started as ordinary `useState` inside the facet components and did not work at all, for a
 *  reason worth writing down because it is invisible from the code: on `/search`, toggling a facet
 *  flips `facetsPending`, and `DesktopFacetsPanel` renders `facetsPending ? <FacetGeneratorSkeleton
 *  /> : <FacetGenerator />`. Measured live, the entire facet rail is replaced by skeletons within
 *  15ms of the click and comes back as a fresh mount about 200ms later. So the pill the visitor
 *  clicked -- and any component state describing it -- is gone before a 420ms animation could get
 *  more than a couple of frames in. Nothing about the flash was broken; there was simply nothing
 *  left to flash on.
 *
 *  A module-scoped record outlives that swap. The remounted pill reads it during render, sees that
 *  it was selected a moment ago, and blooms as it arrives -- which reads as the pill coming back
 *  lit rather than as a delayed effect.
 *
 *  DELIBERATELY NOT REACTIVE, and this is the part to preserve if it is ever changed: there is no
 *  subscription and nothing here triggers a render. It is only ever read during a render that
 *  something else already caused (the facet response landing, which is exactly the remount this
 *  exists to survive). A store that pushed updates would re-render the whole facet rail to start an
 *  animation, which is a large cost for a decoration.
 *
 *  The freshness window is what ends the effect. `mark` is not paired with a `clear`: reads are
 *  pure, and a stale record simply stops matching once the window passes. Anything long enough to
 *  cover the remount and short enough that navigating away and back does not bloom a pill the
 *  visitor never touched -- 1.2s covers a measured ~200ms remount with wide margin.
 */
const FRESH_MS = 1200;

let pending: { facetId: string; value: string; at: number } | null = null;

/** Record a selection. Call on the way IN only -- de-selecting is a removal, and celebrating it in
 *  the colour of the thing being removed says the opposite of what happened. */
export function markTypeFlash(facetId: string, value: string) {
  pending = { facetId, value, at: Date.now() };
}

/** The React key for this value's flash, or `null` if it should not be flashing. The key is the
 *  click's timestamp, so selecting Fire, then Water, then Fire again blooms three times: each click
 *  produces a different key, which remounts the overlay, which is the only way a CSS animation
 *  replays. */
export function typeFlashKey(facetId: string, value: string): number | null {
  if (!pending || pending.facetId !== facetId || pending.value !== value) return null;
  if (Date.now() - pending.at > FRESH_MS) return null;
  return pending.at;
}
