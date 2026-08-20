// The National Dex currently spans exactly 9 generations (see README) and the NumericFacet
// controller doesn't expose the field's true min/max domain, so the bounds are fixed here
// rather than derived from facet state.
const MIN_GENERATION = 1;
const MAX_GENERATION = 9;

export const ALL_GENERATIONS = Array.from({ length: MAX_GENERATION - MIN_GENERATION + 1 }, (_, i) => MIN_GENERATION + i);
