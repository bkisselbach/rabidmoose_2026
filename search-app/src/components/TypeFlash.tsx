import type { CSSProperties } from 'react';

/** A one-shot bloom in a Pokémon type's own colour, painted over the control that was just
 *  selected (`.type-flash` / `@keyframes type-flash` in index.css).
 *
 *  WHY IT IS ITS OWN ELEMENT rather than a class on the button. Two constraints, and each one
 *  rules out the obvious approach on its own:
 *
 *   1. A CSS animation runs when it is first applied and never again while the element lives, so
 *      toggling `.type-flash` on the button would animate the first selection and then silently do
 *      nothing on every one after it. Replay needs a remount.
 *   2. Remounting the BUTTON to get that replay would destroy the element the browser is currently
 *      focused on, mid-click -- keyboard focus would fall back to <body> after every facet
 *      selection, which is a real accessibility regression in exchange for an animation.
 *
 *  A sibling overlay satisfies both: it can be freely remounted (via a caller-supplied `key`)
 *  because nothing is ever focused on it, and it inherits the control's border radius so the bloom
 *  follows a pill's shape rather than boxing it.
 *
 *  The caller must give the control `position: relative` and must key this element on something
 *  that changes per selection (a counter). Rendering it with `null`/no key would show one flash and
 *  then nothing.
 */
export function TypeFlash({ color }: { color: string | undefined }) {
  if (!color) return null;
  return (
    <span
      aria-hidden="true"
      className="type-flash pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{ '--type-flash-color': color } as CSSProperties}
    />
  );
}
