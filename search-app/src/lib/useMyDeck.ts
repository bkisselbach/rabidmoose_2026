import { useEffect, useState } from 'react';
import type { Product } from '@coveo/headless/commerce';
import { useDeck } from '@/lib/deckStorage';
import { fetchProductsByIds } from '@/lib/fetchProductsByIds';

// Hydrates the locally-stored "My Deck" product ids (deckStorage.ts) into real Coveo Product data --
// same borrow-by-id mechanism RecentlyViewedRow and TrendingSpotlightRow already use
// (fetchProductsByIds), so deck tiles render live prices/images/additionalFields exactly like any
// other card on the site. Only the LIST of what's in the deck is local; everything about each card
// is live.

export interface DeckLineWithProduct {
  productId: string;
  quantity: number;
  product: Product;
}

export function useMyDeck() {
  const lines = useDeck();
  const [products, setProducts] = useState<Map<string, Product>>(new Map());

  const idsKey = lines.map((l) => l.productId).join(',');

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    const missing = ids.filter((id) => !products.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    fetchProductsByIds(missing).then((found) => {
      if (cancelled) return;
      setProducts((prev) => {
        const next = new Map(prev);
        found.forEach((p) => next.set(p.ec_product_id ?? p.permanentid, p));
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey is the real dependency
  }, [idsKey]);

  // Only lines whose product has actually resolved -- a line still in flight is simply not shown yet
  // rather than rendered with a hole where the card should be.
  const resolved: DeckLineWithProduct[] = lines
    .map((l) => {
      const product = products.get(l.productId);
      return product ? { productId: l.productId, quantity: l.quantity, product } : null;
    })
    .filter((l): l is DeckLineWithProduct => l !== null);

  return {
    lines: resolved,
    isResolving: resolved.length < lines.length,
  };
}
