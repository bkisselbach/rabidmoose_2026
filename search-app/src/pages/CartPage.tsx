import { PageShell } from '@/components/PageShell';
import { CardImage } from '@/components/CardImage';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Trash2, CheckCircle2, Layers } from 'lucide-react';
import { MooseMark } from '@/components/MooseMark';
import type { Product } from '@coveo/headless/commerce';
import { cart } from '@/cart';
import { CartRecommendations } from '@/components/CartRecommendations';
import { DeckCoverage } from '@/components/DeckCoverage';
import { CoveoChip } from '@/components/CoveoChip';
import { PageTitle } from '@/components/PageTitle';
import PriceFormat_Basic from '@/components/commerce-ui/price-format-basic';
import QuantityInputBasic from '@/components/commerce-ui/quantity-input-basic';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useSeo } from '@/lib/seo';
import { useCoveoState } from '@/lib/useCoveoState';
import { fetchProductsByIds } from '@/lib/fetchProductsByIds';

// Full-page cart, replacing the header Sheet drawer -- same Coveo-wired cart controller, same
// item/recommendations/checkout markup, just laid out as a page instead of a slide-over. Follows
// the DeckCheckPage shell (`page-enter page-container`, PageTitle, SiteFooter) so it reads as one
// more page in the app rather than a moved-but-not-restyled panel.
export function CartPage() {
  useSeo({
    title: 'Your Cart',
    description: 'Review your cart, deck exposure, and Coveo-recommended pickups before checkout.',
    path: '/cart',
  });

  const state = useCoveoState(cart);
  const [orderConfirmed, setOrderConfirmed] = useState<{ id: string; revenue: number } | null>(null);

  // Coveo's cart items carry productId/name/price/quantity and nothing else -- no image -- so the
  // thumbnail has to be borrowed the same way TrendingSpotlightRow borrows fields onto
  // Recommendations-slot products (fetchProductsByIds, one request per id, the same lookup the PDP
  // itself does). Keyed on the ids actually in the cart so it only re-fetches when the cart's
  // membership changes, not on every quantity tick.
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const itemIds = state.items.map((i) => i.productId);
  const missingIds = itemIds.filter((id) => !images.has(id));
  const missingKey = missingIds.join(',');
  useEffect(() => {
    if (!missingIds.length) return;
    let cancelled = false;
    fetchProductsByIds(missingIds).then((found) => {
      if (cancelled) return;
      setImages((prev) => {
        const next = new Map(prev);
        found.forEach((p: Product) => {
          const id = p.ec_product_id ?? p.permanentid;
          if (p.ec_images?.[0]) next.set(id, p.ec_images[0]);
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- missingKey is the real dependency; missingIds is a fresh array every render
  }, [missingKey]);

  const remove = (item: (typeof state.items)[number]) => cart.updateItemQuantity({ ...item, quantity: 0 });

  // Fires the `ec.purchase` event via the Cart controller, then clears the cart. There's no real
  // payment/order backend here, so this is the full "checkout" -- just enough to close the loop on
  // the required purchase analytics event.
  const checkout = () => {
    const id = crypto.randomUUID();
    const revenue = state.totalPrice;
    cart.purchase({ id, revenue }); // also empties the cart, without emitting extra ec.cartAction events
    setOrderConfirmed({ id, revenue });
  };

  return (
      <PageShell>
        <div className="mb-6 flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-primary" aria-hidden="true" />
          <PageTitle>Your cart</PageTitle>
          {/* Demo Mode only. The cart isn't just local state -- every change emits a Coveo cart
              event, and checkout emits ec.purchase, which is what trains the rec/suggest models. */}
          <div className="empty:hidden">
            <CoveoChip capability="cart-analytics" />
          </div>
        </div>

        {orderConfirmed ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-16 text-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-foreground">Order placed!</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <PriceFormat_Basic value={orderConfirmed.revenue} className="text-xs text-muted-foreground" />
              &middot; Order #{orderConfirmed.id.slice(0, 8)}
            </p>
            <Link to="/search" className="mt-2">
              <Button variant="secondary">Continue shopping</Button>
            </Link>
          </div>
        ) : state.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-16 text-center">
            {/* The mark, not the muted `ShoppingBag` glyph this used to show. An empty cart is a
                dead end the same way the 404 is, and the bag icon two lines above it in the page
                header (the cart's own title) was already saying "cart" -- repeating it greyed-out
                added nothing. The mark makes the empty state feel like a place rather than a gap. */}
            <MooseMark className="h-16 w-16 opacity-90" />
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
            <Link to="/search" className="mt-2 text-sm font-semibold text-primary hover:underline">
              Browse cards &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Diagnosis before the receipt -- the Consultant's read on what's already in the cart,
                same "insight strip before content" order the PDP uses for ConsultantFitStrip. */}
            <DeckCoverage items={state.items} />

            {/* Its own bordered card with a real header, like the rest of the site's panels
                (DeckCheckPage's "My Deck"/"Cards on hand" cards) -- not a bare div of rows. Each
                line gets a real card thumbnail, borrowed via fetchProductsByIds since Coveo's cart
                items carry productId/name/price/quantity and nothing else -- kept small (48px,
                same footprint the earlier icon placeholder used), with the icon as a fallback for
                the brief window before the lookup resolves or if it ever fails/product data is
                gone. */}
            <Card className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between gap-2 border-b border-border bg-muted/30">
                <CardTitle className="text-base">Order summary</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {state.totalQuantity} item{state.totalQuantity === 1 ? '' : 's'}
                </span>
              </CardHeader>
              <div>
                {state.items.map((item, i) => (
                  <div
                    key={`${item.productId}-${item.name}-${item.price}`}
                    className={`group flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:bg-muted/30 sm:flex-nowrap ${i > 0 ? 'border-t border-border' : ''}`}
                  >
                    {images.has(item.productId) ? (
                      <CardImage
                        src={images.get(item.productId)}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md bg-card object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Layers className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      <p className="mt-0.5 flex items-baseline gap-1 text-xs text-muted-foreground">
                        <PriceFormat_Basic value={item.price} className="text-xs text-muted-foreground" /> each
                      </p>
                    </div>
                    <QuantityInputBasic
                      quantity={item.quantity}
                      min={0}
                      onChange={(next) => cart.updateItemQuantity({ ...item, quantity: next })}
                    />
                    <PriceFormat_Basic
                      value={item.price * item.quantity}
                      className="ml-auto shrink-0 text-right text-base font-bold text-foreground sm:ml-0 sm:w-20"
                    />
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      aria-label="Remove item"
                      className="pressable flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground opacity-60 transition-opacity hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border bg-muted/30 p-4">
                <span className="eyebrow">Subtotal</span>
                <div className="flex items-center gap-4">
                  <PriceFormat_Basic value={state.totalPrice} className="font-display text-lg font-bold text-foreground" />
                  <Button onClick={checkout}>Checkout</Button>
                </div>
              </div>
            </Card>

            {/* The ML slot's answer, last -- diagnosis, then receipt, then the upsell. */}
            <CartRecommendations items={state.items} />
          </div>
        )}
      </PageShell>
  );
}
