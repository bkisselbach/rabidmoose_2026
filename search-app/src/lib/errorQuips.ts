// The copy pools for every dead end in the app. Kept in one module, away from the components that
// render them, for a boring reason: the 404 page, the crash boundary and the three detail pages'
// "that entity doesn't exist" states are five different files, and when the jokes lived at the call
// sites the app's voice drifted -- the newsroom apologised politely while the 404 said nothing at
// all. One pool per *kind* of dead end keeps the register consistent and makes it obvious, when
// adding a line, which bucket it belongs in.
//
// Register rule, since it is easy to get wrong: these are allowed to be funny because nothing is
// lost. A mistyped URL costs the visitor a click. So the 404 and entity pools joke freely. The
// CRASH pool is the one place where something actually went wrong on our side, so its lines land
// on "we broke it, here's the button" rather than on a punchline at the visitor's expense.

/** Unmatched route -- the visitor typed or followed something that was never a page here. */
export const NOT_FOUND_QUIPS = [
  'A wild 404 appeared! It used Splash. Nothing happened.',
  "This page fled before you could throw a ball.",
  "You've walked into tall grass with an empty party. Respect.",
  'The page you want is in another Gym.',
  "There's nothing here but a Zubat and some regret.",
  "Professor Moose: 'There's a time and place for everything — this URL is neither.'",
];

/** A render threw, or a code chunk failed to load. Our fault, so: short, plain, and a way out. */
export const CRASH_QUIPS = [
  'The moose fainted. Somebody get a Revive.',
  'Something in the tall grass bit back.',
  'Our Psyduck used Confusion. On us.',
  "That one was super effective — against our own JavaScript.",
];

/** A real page, a real URL shape, but nothing behind the id/slug in the index. */
export const CARD_NOT_FOUND_QUIPS = [
  "That card isn't in the binder.",
  'Searched every sleeve twice. No such card.',
  "Either that card doesn't exist or somebody traded it away.",
];

export const SPECIES_NOT_FOUND_QUIPS = [
  'No Pokédex entry under that name.',
  "The Pokédex whirred, thought about it, and gave up.",
  "That's not a Pokémon, that's a typo.",
];

export const STORY_NOT_FOUND_QUIPS = [
  "That story isn't in the newsroom.",
  'Old link, or a slug that never was.',
  'The newsroom has no record of this one.',
];

/** The service answered with something other than an answer -- a fetch failure or a bad response. */
export const LOOKUP_FAILED_QUIPS = [
  'The lookup came back empty-handed.',
  'The connection to the index dropped mid-sentence.',
  'Something between here and the index went quiet.',
];

/** Picks one line at random. Call it from a `useState` initializer, never in the render body: the
 *  quip has to stay put for the life of the mount, or it reshuffles on every unrelated re-render
 *  (a resize, a context update) and the page looks like it is glitching rather than joking. */
export function pickQuip(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}
