import { useInView } from '@/lib/useInView';
import { CardImage } from '@/components/CardImage';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { InteractiveProduct, Product } from '@coveo/headless/commerce';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MerchBadge } from '@/components/MerchBadge';
import { Button } from '@/components/ui/button';
import { ShoppingBag } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { useProductCardData } from '@/lib/useProductCardData';
import { CardPokedexLink, useCardSpecies } from '@/components/CardPokedexLink';
import { CardTypeIcons } from '@/components/CardTypeIcons';
import { cardVariantToken } from '@/lib/cardFields';
import { cardIdentityParts } from '@/lib/cardIdentity';
import { ROW_PRESETS, type RowPreset } from '@/lib/cardPresets';
import { PokeballMark } from '@/components/PokeballMark';

interface Props {
  product: Product;
  interactiveProduct: InteractiveProduct;
  /** Which row surface this is, as a named entry in `ROW_PRESETS`.
   *
   *  A DIFFERENT type from ProductCard's `TilePreset`, deliberately (card-system-plan.md §6.3):
   *  the row and the tile support different features, so handing this component `plp-grid` --
   *  or asking it for `foil` -- does not compile. It used to accept the tile's booleans and
   *  silently ignore them, which is the defect this split exists to remove. */
  preset: RowPreset;
}

function ProductListItemImpl({ product, interactiveProduct, preset }: Props) {
  // Same contract as ProductCard: one object decides what renders, and nothing below reads a prop
  // to decide whether to draw itself.
  const features = ROW_PRESETS[preset];
  // Same deferral as the grid tile (item 31d): one badge request per product, asked only once the
  // row has been near the viewport.
  const { ref: rowRef, inView: badgesInView } = useInView<HTMLDivElement>();
  const {
    price,
    promoPrice,
    displayName,
    setName,
    setCode,
    cardNumber,
    totalInSet,
    rarity,
    cardCategory,
    accent,
    badges,
    isPinned,
    productHref,
    quantityInCart,
    justAdded,
    addToCart,
  } = useProductCardData(product, badgesInView);
  // The buy price -- promo when there is one, otherwise list. Lives on the Add to cart button
  // itself now, not as a separate price column.
  const buyPrice = promoPrice ?? price;
  // Same title/Pokedex-line rule as ProductCard -- see the comment on its own copy of this.
  const species = useCardSpecies(product);
  const pokedexLink = features.pokedexLink && species ? <CardPokedexLink species={species} /> : null;
  const showName = pokedexLink === null;
  // The identity line, from the SAME assembly the grid tile uses (lib/cardIdentity.ts). It replaced
  // `metaParts`, a second hand-rolled array over the same fields -- and the two had already drifted:
  // when the printing designation was added to the tile, this row silently did not get it, so a
  // `Dark Charizard` row said "Dark" nowhere, exactly the loss the tile change existed to fix.
  //
  // The row's options differ from the tile's, and the differences are the width story:
  //  - `setForm: 'name'` -- this row has no separate set line, and it has room for the full name.
  //  - `shortenRarity: false` -- abbreviating on a full-width row would discard information to
  //    solve a problem the row does not have. `Special illustration rare` fits here; on a 136px
  //    tile it does not.
  //  - `includeTotal: false` -- unchanged from what this row already showed.
  const variantToken = pokedexLink !== null ? cardVariantToken(displayName, species?.characterName) : undefined;
  const identityParts = cardIdentityParts(
    { setName, setCode, cardNumber, totalInSet, rarity, cardCategory, variantToken },
    { setForm: 'name', shortenRarity: false, includeTotal: false }
  );

  // `rounded-lg` explicitly: <Card> now defaults to the 2xl tile/panel step, and a list row is the
  // "row cards" role in index.css's radius scale, one step tighter than a tile.
  return (
    <Card ref={rowRef} data-testid="product-card" className="card-hover group relative flex items-center gap-4 overflow-hidden rounded-lg p-3">
      {/* Stretched-link pattern, same as ProductCard: a real, crawlable <a href> covering the
          whole row, kept as a sibling (not an ancestor) of the "Add to cart" button below. */}
      {/* `title` for the same reason as ProductCard's overlay: the row's visible name gives way to
          the Pokédex line, so the full catalog name lives here now. */}
      <Link
        to={productHref}
        onClick={() => interactiveProduct.select()}
        aria-label={product.ec_name ?? 'View card'}
        title={product.ec_name ?? undefined}
        className="absolute inset-0 z-10"
      />
      <div className="product-stage relative flex aspect-[5/7] w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm p-1.5 sm:w-20">
        <CardImage src={product.ec_images?.[0]} alt={product.ec_name ?? ''} className="max-h-full max-w-full object-contain" />
        <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ backgroundColor: accent.bg }} />
        {features.featuredBadge && isPinned && <Badge variant="accent" className="absolute -left-1 -top-1">Featured</Badge>}
        {/* xs, and inside the padding rather than hung off the corner: this thumb is 64px wide and
            clips its overflow, so a negative offset would be cut off square (as the Featured badge
            above already is). */}
        {features.typeIcons && <CardTypeIcons product={product} size="xs" className="absolute right-0.5 top-0.5" />}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {features.metaLine && identityParts.length > 0 && (
            <span className="eyebrow truncate">{identityParts.join(' · ')}</span>
          )}
          {features.merchBadges &&
            badges.map((b, i) => <MerchBadge key={`${b.text}-${i}`} badge={b} />)}
        </div>
        {/* Same split as ProductCard (2026-08-17): the name is the PDP (plain text under the row's
            stretched <a>, styled as a link by `.card-title-link`), the Pokédex crosslink is its own
            labeled row rather than an icon hung off the name, and the name gives way entirely when
            it would only repeat that row. */}
        {showName && (
          <h3 data-testid="product-name" title={product.ec_name ?? undefined} className="min-w-0 text-sm font-semibold text-foreground">
            <span className="card-title-link block truncate">{displayName}</span>
          </h3>
        )}
        {pokedexLink}
        {features.description && product.ec_description && (
          <p className="line-clamp-2 hidden text-xs text-muted-foreground sm:block">
            {product.ec_description}
          </p>
        )}
      </div>

      {features.addToCart && (
      <div className="flex shrink-0 flex-col items-end gap-2">
        {/* Same accessible-name contract as the grid tile's button: lead with the action, then name
            the price. On this row the button IS the price, so a label of just "Add to cart" would
            drop it entirely for a screen reader. */}
        <Button
          type="button"
          size="sm"
          variant={justAdded ? 'secondary' : 'default'}
          onClick={addToCart}
          aria-label={`Add to cart${buyPrice !== undefined ? `, ${formatCurrency(buyPrice)}` : ''}${quantityInCart > 0 ? `, ${quantityInCart} in cart` : ''}`}
          className="relative z-20 gap-1.5"
        >
          {justAdded ? (
            <>
              {/* Same catch as the grid tile's button -- see ProductCard.tsx for why it is keyed
                  on the cart quantity. */}
              <PokeballMark key={quantityInCart} wobble className="h-3.5 w-3.5" /> Caught!
            </>
          ) : (
            <>
              <ShoppingBag className="h-3.5 w-3.5" />
              {/* `formatCurrency`, not `<PriceFormat_Basic>` -- card-system-plan.md §1c.4. The two
                  produced the same string (the component wraps this very function) but through two
                  paths, which is two places to drift; and the button needs the STRING anyway, for
                  the aria-label above. PriceFormat_Basic stays where it earns its keep: the styled
                  price ROWS on the tile and the PDP. */}
              {buyPrice !== undefined ? formatCurrency(buyPrice) : 'Add'}
              {quantityInCart > 0 && ` (${quantityInCart})`}
            </>
          )}
        </Button>
      </div>
      )}
    </Card>
  );
}

// MEMOIZED (item 31c / performance-plan.md §4b). ProductListItem is a pure function of its props, and the
// grids that render it re-render on every notification from any controller subscription on the
// page -- eighteen tiles re-rendering because a facet count changed somewhere else.
//
// THIS ONLY WORKS BECAUSE 31c's FIRST HALF LANDED. Until `useInteractiveProducts` cached the
// controllers, the `interactiveProduct` prop was a fresh object on every render, so a memo
// comparison could never match and this wrapper would have been decoration that read like an
// optimization. Sequence matters here; do not port this to a tile whose controller prop is still
// rebuilt inline.
export const ProductListItem = memo(ProductListItemImpl);
