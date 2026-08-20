import { TypeIconCircles } from '@/components/pokedex/TypeIconCircles';
import { getCardFields } from '@/lib/cardFields';

interface Props {
  /** Duck-typed against both the headless `Product` type and the raw commerce-API shape used by
   *  ShopCardsPanel/RecentlyViewedRow, so any card surface in the app can pass its product through
   *  as-is. */
  product: { additionalFields?: Record<string, unknown> | null };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /** Set false on tiles whose ROOT element is itself a `<Link>` (the typeahead previews, the
   *  recently-viewed rail). Those can't take a nested anchor -- it's invalid HTML and React says
   *  so -- so the circle renders as a plain marker there. The card
   *  surfaces that use the stretched-link pattern instead (ProductCard, ProductListItem,
   *  ShopCardsPanel) keep the link, because there the overlay is a SIBLING, not an ancestor. */
  linkToType?: boolean;
}

// The one place every card surface resolves and renders its TCG type marker, wired so a click takes
// you to /search with the card-type facet (commerce) *and* the Pokedex type facet (content) preset
// to the same value at once -- one click surfaces every other card of that type alongside every
// Pokemon of that type, not just one half of the catalog. Mirrors how the rest of the app already
// drives both engines off one router-state object (see SearchResultsPage's presetFacet /
// presetContentFacet handling).
//
// Renders nothing when the product carries no types, which covers two real cases and is deliberate
// in both: Trainer/Energy cards genuinely have no energy type, and every product from the
// Recommendations API arrives with `additionalFields: {}` (no configuration endpoint exists to turn
// them on -- see cardFields.ts). Rec-fed surfaces -- the home trending rail, the PDP rails, the cart
// rail -- therefore show no circle, the same way they showed no chips before. A type is not guessed.
export function CardTypeIcons({ product, size = 'md', className, linkToType = true }: Props) {
  const { cardTypes } = getCardFields(product.additionalFields ?? undefined);

  return (
    <TypeIconCircles
      types={cardTypes}
      size={size}
      className={className}
      linkTo={
        linkToType
          ? (type) => ({
              to: '/search',
              state: {
                presetFacet: { facetId: 'cardtypes', value: type },
                presetContentFacet: { kind: 'type', value: type },
              },
            })
          : undefined
      }
    />
  );
}
