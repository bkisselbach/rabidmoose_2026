import { CardImage } from '@/components/CardImage';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { InteractiveProduct, Product } from '@coveo/headless/commerce';
import { CardTypeIcons } from '@/components/CardTypeIcons';
import { useProductCardData } from '@/lib/useProductCardData';
import { formatCurrency } from '@/lib/currency';

// The `mini` card shape -- art, name, price, nothing else. Currently one caller: the search
// typeahead's instant-product previews.
//
// Phase 4 of card-system-plan.md, and the surface that motivated the plan's §1c.1: this markup used
// to live inline in SearchBox.tsx and rendered `product.ec_name` raw, so the dropdown was the ONE
// place in the app showing "Charizard ex — 151 #199" where every other surface showed
// "Charizard ex". It already called `useProductCardData` for price and href -- it just never used
// the cleaned name sitting right there in the same destructure. That is the whole bug, and it is a
// good argument for the card system existing: the divergence was not a design decision anybody
// made, it was a component that quietly missed one field.
//
// A SIBLING OF ProductCard, NOT A BRANCH INSIDE IT. §3a's reasoning is that the variants are
// genuinely different DOM -- a tile stacks art over text, this is a 112px column with no footer, no
// badges, no identity strip -- and expressing that as booleans inside one component produces a
// render where six flags silently change meaning depending on a seventh. What the two share is the
// layer that actually matters: `useProductCardData`, so name, price and href are derived once, in
// one place, for every card shape in the app.
//
// FROZEN ON PURPOSE -- no `preset`, no feature type. §6.2's pick was that mini joins "as a fixed
// preset rather than a flag-driven variant", and its features would not survive contact with the
// vocabulary anyway: half of `TileFeatures` describes elements this shape does not have (no badge
// row, no identity strip, no set line, no Add button). One configuration, or it should not have
// joined. If a second caller ever needs this to look different, that is the signal to revisit --
// not to add a flag.
function ProductCardMiniImpl({
  product,
  interactiveProduct,
  onSelect,
}: {
  product: Product;
  interactiveProduct: InteractiveProduct;
  /** Fired after the click is recorded -- the typeahead uses it to close its dropdown. */
  onSelect: () => void;
}) {
  // `false`: this tile has no badge row at all -- it shows a name and a price. Until item 31d it
  // still fired one badge request per suggestion anyway, which is the literal "asking for badges
  // nobody shows" case that item is named after.
  const { displayName, price, promoPrice, productHref } = useProductCardData(product, false);
  const buyPrice = promoPrice ?? price;

  return (
    // The dropdown lives on the input's focus, so a mousedown that blurs the input would unmount
    // this element before the click ever lands.
    <Link
      to={productHref}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        interactiveProduct.select();
        onSelect();
      }}
      title={product.ec_name ?? undefined}
      className="flex w-28 shrink-0 flex-col gap-1 rounded-md p-1.5 hover:bg-muted"
    >
      <div className="relative flex aspect-[5/7] items-center justify-center overflow-hidden rounded-sm bg-muted">
        <CardImage src={product.ec_images?.[0]} alt={product.ec_name ?? ''} className="max-h-full max-w-full object-contain" />
        {/* `linkToType={false}`: this tile's ROOT is a <Link>, so a linked type circle would put an
            <a> inside an <a>. The stretched-link surfaces get away with it because their overlay is
            a sibling, not an ancestor. */}
        <CardTypeIcons product={product} size="xs" linkToType={false} className="absolute right-1 top-1" />
      </div>
      {/* The cleaned name. `title` above keeps the full catalog string reachable, the same contract
          the tile's stretched link uses. */}
      <span className="line-clamp-2 text-xs font-medium text-foreground">{displayName}</span>
      {buyPrice !== undefined && (
        <span className="text-xs font-bold text-foreground">{formatCurrency(buyPrice)}</span>
      )}
    </Link>
  );
}

// MEMOIZED (item 31c / performance-plan.md §4b). ProductCardMini is a pure function of its props, and the
// grids that render it re-render on every notification from any controller subscription on the
// page -- eighteen tiles re-rendering because a facet count changed somewhere else.
//
// THIS ONLY WORKS BECAUSE 31c's FIRST HALF LANDED. Until `useInteractiveProducts` cached the
// controllers, the `interactiveProduct` prop was a fresh object on every render, so a memo
// comparison could never match and this wrapper would have been decoration that read like an
// optimization. Sequence matters here; do not port this to a tile whose controller prop is still
// rebuilt inline.
export const ProductCardMini = memo(ProductCardMiniImpl);
