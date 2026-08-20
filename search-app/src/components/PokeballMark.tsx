import { cn } from '@/lib/utils';

/** The pokeball motif as an inline icon, drawn by the same CSS mask the route loader uses
 *  (`.pokeball-mark` in index.css). Sized and coloured like any lucide icon in this app -- it takes
 *  `currentColor` and its box from the `className` the call site passes -- so it drops into a
 *  button's icon slot without that button knowing it is anything special.
 *
 *  `wobble` replays `poke-wobble` on mount. That is why the caller has to REMOUNT it (a changing
 *  React `key`) rather than just flipping the prop: a CSS animation only runs when it is first
 *  applied, so toggling a class on a live element replays nothing on the second add. Both call
 *  sites key it on the cart quantity, which changes on every add by definition.
 *
 *  `aria-hidden`: this is decoration next to text that already names the action, and the buttons
 *  that use it carry a full `aria-label` besides.
 */
export function PokeballMark({
  className,
  wobble = false,
}: {
  className?: string;
  wobble?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('pokeball-mark', wobble && 'pokeball-mark-wobble', className)}
    />
  );
}
