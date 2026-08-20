import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import type { Product } from '@coveo/headless/commerce';
import { HomeCardRail } from '@/components/home/HomeCardRail';
import { CoveoChip } from '@/components/CoveoChip';
import { getActivePersona } from '@/lib/visitorId';
import { loadRecentlyViewed } from '@/lib/recentlyViewedStorage';
import { recentlyViewedRecommendations } from '@/homeControllers';
import { useInteractiveProducts } from '@/lib/useInteractiveProduct';
import { fetchProductsByIds } from '@/lib/fetchProductsByIds';

// "Where you left off" -- the visitor's own recently-viewed cards, rendered through the exact same
// shared shell (HomeCardRail) Trending Now uses.
//
// The export is `PersonalizationBox` though the file is now a single-purpose recently-viewed rail
// (several other zones -- a consultation-brief title, recent searches, a "you may also like"
// teaser, a deck-health nudge -- were tried and removed) -- worth revisiting if this shape holds.
//
// The trail itself is client-side (see recentlyViewedStorage.ts for why: Coveo's Recently Viewed
// recommendation strategy needs a Merchandising Hub slot, and slot management in this org is
// UI-only). The PRODUCTS are not: they are fetched live from the Commerce Search API by id, so
// prices, badges and imagery are all real Coveo data.

const MIN_VIEWED_TRAIL = 3;

// Also bounds the request count, since each id costs its own lookup (see fetchProductsByIds.ts).
const MAX_RAIL = 6;

async function fetchViewedProducts(ids: string[]): Promise<Product[]> {
  return fetchProductsByIds(ids.slice(0, MAX_RAIL));
}

export function PersonalizationBox() {
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [slotProducts, setSlotProducts] = useState<Product[]>([]);

  // The real thing, when the slot is configured: Coveo's Recently Viewed strategy, personalized
  // server-side from this visitor's own view events.
  useEffect(() => {
    const slot = recentlyViewedRecommendations;
    if (!slot) return;
    const read = () => setSlotProducts(slot.state.products);
    read();
    const unsubscribe = slot.subscribe(read);
    slot.refresh();
    return unsubscribe;
  }, []);

  // The local trail is always resolved, because it is also the evidence used below to decide
  // whether the slot is telling the truth.
  useEffect(() => {
    const ids = loadRecentlyViewed();
    if (ids.length < MIN_VIEWED_TRAIL) return;
    let cancelled = false;
    fetchViewedProducts(ids).then((found) => {
      if (!cancelled) setLocalProducts(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // THE SLOT ONLY WINS WHEN IT ACTUALLY REFLECTS THIS VISITOR: a brand-new visitor who had viewed
  // nothing could still get a full rail off popular-item backfill, which is fine for a "Trending"
  // rail but not under a heading that says "Where you left off". So the slot's products are used
  // only where they agree with what this browser actually recorded viewing.
  const viewedIds = new Set(localProducts.map((p) => p.ec_product_id ?? p.permanentid));
  const slotConfirmedByTrail = slotProducts.filter((p) => viewedIds.has(p.ec_product_id ?? p.permanentid));
  const usingSlot = slotConfirmedByTrail.length >= MIN_VIEWED_TRAIL;
  // Keyed on `slotProducts` -- the array the slot's own subscription handed us, so it changes
  // exactly once per response. Passing `undefined` for the source while the local trail is showing
  // resolves every tile to the shared inert controller, which is precisely what the inline
  // ternary here used to do: those products came from a raw commerce fetch, and there is no
  // response behind them to attribute a click to.
  const getInteractiveProduct = useInteractiveProducts(
    usingSlot ? recentlyViewedRecommendations : undefined,
    slotProducts
  );
  // Recommendations responses always carry `additionalFields: {}` (cardFields.ts), which would make
  // the type circle vanish the moment the slot took over. The local trail resolved the SAME ids
  // through commerce search, which does carry them -- so borrow them by id rather than let the tile
  // lose information on the upgrade.
  const localById = new Map(localProducts.map((p) => [p.ec_product_id ?? p.permanentid, p]));
  const products = usingSlot
    ? slotConfirmedByTrail.slice(0, MAX_RAIL).map((p) => {
        const id = p.ec_product_id ?? p.permanentid;
        const own = p.additionalFields;
        return own && Object.keys(own).length > 0
          ? p
          : { ...p, additionalFields: localById.get(id)?.additionalFields ?? p.additionalFields };
      })
    : localProducts;

  if (products.length < MIN_VIEWED_TRAIL) return null;

  const activePersona = getActivePersona();
  const localTrailDetail =
    activePersona.key === 'guest'
      ? `${products.length} cards from the local trail, most recent first.`
      : `${products.length} cards from ${activePersona.name}'s local trail — a fictional, pre-seeded demo visitor, most recent first.`;

  return (
    // Owns its own flex-child sizing (`min-w-0 xl:flex-1`) rather than relying on a wrapper div in
    // HomePage.tsx. This is load-bearing: this component can return `null` above (a cold Guest, or
    // a persona under the trail threshold), and a wrapper div in the PARENT claiming `xl:flex-1`
    // around a null child would keep reserving half the row even when nothing renders inside it.
    // Owning the sizing here means an empty render is truly absent from the flex row, letting
    // Trending's own `xl:flex-1` claim the full width.
    <div className="order-1 min-w-0 xl:order-2 xl:flex-1">
      <HomeCardRail
        dataTestId="home-recently-viewed"
        title="Where you left off"
        icon={History}
        chip={
          usingSlot ? (
            <CoveoChip
              capability="ml-recommendations"
              detailSuffix="Recently Viewed strategy on a Merchandising Hub slot — personalized to this visitor's own view history, anonymously and server-side."
            />
          ) : (
            <CoveoChip capability="recently-viewed" detailSuffix={localTrailDetail} />
          )
        }
        products={products}
        getInteractiveProduct={getInteractiveProduct}
      />
    </div>
  );
}
