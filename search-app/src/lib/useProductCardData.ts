import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Product } from '@coveo/headless/commerce';
import { cart } from '@/cart';
import { useCoveoState } from '@/lib/useCoveoState';
import { isFeaturedResult } from '@/lib/featuredRules';
import { cardDisplayName, cardIdentityFromName, getCardFields } from '@/lib/cardFields';
import { typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';
import { useProductBadge } from '@/lib/useProductBadge';
import { cardPath } from '@/lib/paths';

export function useProductCardData(product: Product, badgesEnabled = true) {
  const cartState = useCoveoState(cart);
  const [justAdded, setJustAdded] = useState(false);

  const badges = useProductBadge(product.ec_product_id ?? product.permanentid, badgesEnabled);

  const quantityInCart = cartState.items.find((i) => i.productId === product.ec_product_id)?.quantity ?? 0;
  const price = product.ec_price ?? undefined;
  const promoPrice = product.ec_promo_price ?? undefined;
  const discountPercent =
    promoPrice !== undefined && price !== undefined && promoPrice < price
      ? Math.round((1 - promoPrice / price) * 100)
      : undefined;
  const cardFields = getCardFields(product.additionalFields);
  const { rarity, cardCategory, cardTypes, hp, highPrice, totalInSet, illustrator, setYear, setCode } = cardFields;
  const fullName = product.ec_name ?? undefined;
  // Recommendation-slot products carry no additionalFields at all (no configuration endpoint exists
  // to turn them on -- see cardIdentityFromName), which is what made the home trending rail render
  // the same component differently from /search: no meta line, and the full "Charizard ex — 151
  // #199" catalog name where the grid shows "Charizard ex". Recovering set/number from ec_name puts
  // those surfaces back on the same identity treatment. Real fields always win.
  const fallbackIdentity =
    cardFields.setName || cardFields.cardNumber ? {} : cardIdentityFromName(fullName);
  const setName = cardFields.setName ?? fallbackIdentity.setName;
  const cardNumber = cardFields.cardNumber ?? fallbackIdentity.cardNumber;
  const cardType = cardTypes[0];
  const accent = typeColor(cardType);
  const TypeIcon = typeIcon(cardType);
  const displayName = cardDisplayName(fullName, setName, cardNumber);
  // queryPinned is delivered inline on every product by the Commerce API (confirmed via raw
  // response inspection) but isn't in this SDK version's Product type yet -- cast rather than
  // wait on an SDK bump. Sourced from a Merchandising Hub pinning rule, distinct from the
  // useProductBadge fetch above. Query-pipeline featured-result rules pin server-side too but
  // set no response flag at all (see featuredRules.ts), so those are recognized against the
  // URL's q -- the same query that drove the commerce request this product arrived on.
  const [searchParams] = useSearchParams();
  const isPinned =
    ((product as unknown as { queryPinned?: boolean }).queryPinned ?? false) ||
    isFeaturedResult(searchParams.get('q') ?? '', product.ec_product_id ?? product.permanentid);
  const productHref = cardPath(product.ec_product_id ?? product.permanentid, product.ec_name);

  const addToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    cart.updateItemQuantity({
      productId: product.ec_product_id ?? product.permanentid,
      name: product.ec_name ?? product.permanentid,
      price: promoPrice ?? price ?? 0,
      quantity: quantityInCart + 1,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  return {
    price,
    promoPrice,
    discountPercent,
    displayName,
    // The raw identity fields. Both card shapes now assemble their own line from these through
    // lib/cardIdentity.ts; the joined `metaParts` string that used to sit here is gone
    // (card-system-plan.md §1c.7). It was a SECOND assembly over these same fields, and the two had
    // already drifted -- the tile gained the printing designation and the row silently did not.
    setName,
    cardNumber,
    rarity,
    // Needed because Trainer and Energy cards carry a category instead of a rarity, and
    // `raritySlot` fills the same slot with it -- the PDP breadcrumb makes the identical call.
    cardCategory,
    hp,
    highPrice,
    totalInSet,
    illustrator,
    setYear,
    setCode,
    cardType,
    accent,
    TypeIcon,
    badges,
    isPinned,
    productHref,
    quantityInCart,
    justAdded,
    addToCart,
  };
}
