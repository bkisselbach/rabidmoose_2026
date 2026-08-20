// ONE vertical rhythm for the whole landing page, shared rather than retyped in each section --
// the moment one section spells its own number, the next edit to that section is free to drift
// from the rest.
//
// The two are the same 20px and are deliberately separate names: one is the gap BETWEEN a row's
// own elements (the two rails side by side, the two browse strips stacked), the other is the space
// a row leaves BEFORE the next row. A section can need one, the other, or both.

/** Gap between the elements inside one home row. */
export const HOME_ROW_GAP = 'gap-5';

/** Space a home row leaves before the next one. The hero keeps its own larger `pt` -- that is the
 *  page's top breathing room under the header, not a gap between two rows. */
export const HOME_ROW_SPACE = 'pb-5';
