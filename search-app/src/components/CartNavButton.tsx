import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { cart } from '@/cart';
import { useCoveoState } from '@/lib/useCoveoState';

// Header cart entry point -- a plain nav link to the full /cart page, not a Sheet trigger. Same
// icon + count-bubble treatment as the old drawer trigger (RabidMoose mockup's `btn-nav-cart`):
// card surface + primary accents, not the mockup's raw slate/amber, matching the rest of the
// header's token discipline.
//
// THE BUMP IS NOW CSS (2026-08-18, motion-system-plan.md M3), and that is worth more than the
// animation itself. What stood here was:
//
//   const [state, setState] = useState(cart.state);
//   const [bump, setBump] = useState(false);
//   useEffect(() => cart.subscribe(() => { setState(cart.state); setBump(true); }), []);
//   useEffect(() => { if (!bump) return; const t = setTimeout(() => setBump(false), 220); ... });
//
// -- the app's only JS-driven animation, a hand-rolled subscribe, and a timer, to move one element
// by 5%. It was also the exact reason this file was the ONE component left out of the
// `useCoveoState` migration (see MASTER-STATUS): the subscribe callback carried a second,
// unrelated `setBump` side effect, so it did not fit the pure state-mirror shape the hook replaces.
// Deleting the side effect deletes the exemption -- this component is now an ordinary
// `useCoveoState` consumer like the other ~31 call sites, and the entire bump is one keyframe.
//
// The replay mechanism is the React `key` on the icon wrapper. A CSS animation runs when it is
// first applied and never again while the element lives, so a class toggle would animate the first
// add and silently do nothing on the second. Keying on `totalQuantity` remounts the wrapper on
// every quantity change, which is precisely "something was added" -- no timer, no cleanup, and
// nothing to leak if the header unmounts mid-animation.
export function CartNavButton() {
  const state = useCoveoState(cart);

  // Suppress the very first play. The cart restores from localStorage (lib/cartStorage.ts), so a
  // reload with items already in it would otherwise mount straight into a catch animation -- the
  // header appearing to react to something the shopper did not just do, which reads as a glitch
  // rather than as confirmation. A ref, not state: this must not cause a render of its own, and it
  // is read during render only to decide whether a class is on the element React is already
  // building. Every subsequent quantity change animates normally.
  const seen = useRef(false);
  const isFirstRender = !seen.current;
  seen.current = true;

  return (
    <Link
      to="/cart"
      className="pressable flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
      aria-label="View cart"
    >
      {/* The wrapper, not the icon itself, carries the animation: `cart-catch` animates `scale`,
          and scaling the <svg> alone would leave the count bubble beside it sitting still while
          the bag jumps. */}
      <span
        key={state.totalQuantity}
        className={`flex items-center gap-2 ${isFirstRender ? '' : 'cart-catch'}`}
      >
        <ShoppingBag className="h-4 w-4 text-primary" />
        <span className="hidden text-xs font-bold sm:inline">Cart</span>
        {state.totalQuantity > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-2xs font-bold leading-none text-primary-foreground shadow-rest">
            {state.totalQuantity > 9 ? '9+' : state.totalQuantity}
          </span>
        )}
      </span>
    </Link>
  );
}
