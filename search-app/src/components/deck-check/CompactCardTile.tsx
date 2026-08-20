import { Link } from 'react-router-dom';
import type { Product } from '@coveo/headless/commerce';
import { CardImage } from '@/components/CardImage';
import { formatCurrency } from '@/lib/currency';
import { cardDisplayName, cardIdentityFromName, getCardFields } from '@/lib/cardFields';
import { cardPath } from '@/lib/paths';
import type { CatalogCard } from '@/lib/catalogQuery';

// THE ADVISOR'S CARD. One tile shape for every card the Advisor page shows -- Set Collector's set
// checklists, "To play these", and "Suggested pickups" (2026-08-19, direct request: "i want the
// same on the 'to play these' and 'Suggested pickups' cards list on the advisor page").
//
// The three surfaces had already been made the same WIDTH (the home rail's `CARD_BASIS`), but the
// gap rails still rendered the full marketplace `ProductCard` under the `deck-check` preset, which
// carries a merch-badge row, a set line, an Add-to-cart button and a second Add-to-deck button. So
// one page showed two cards of the same width and visibly different height and weight, a few
// hundred pixels apart -- and two gap rows filled the viewport on their own.
//
// What this tile keeps is what a diagnosis surface needs: the number, the art, the name, the price.
// Buying moves one click away, to the card page the tile links to. That is the explicit trade the
// request chose, and it is why the Add button, the badges and the per-tile PickupTrade cost line
// are gone from these rows rather than merely restyled.
//
// TWO SOURCES, ONE TILE. The checklist's rows are `CatalogCard`s off the classic Search API and the
// gap rails' are commerce `Product`s -- different APIs, different field names, and catalogQuery.ts
// is explicit that the two must not be cast into each other. So the tile itself takes neither: it
// takes the five plain fields it draws, and each surface adapts its own type through the small
// `fromCatalogCard` / `fromProduct` functions below. Adding a third source is a third adapter, not
// a branch inside the tile.

/** What the tile actually draws. Deliberately primitive -- no API type reaches this component. */
export interface CompactCardFields {
  /** Where the tile links. */
  href: string;
  imageUrl?: string;
  /** As printed on the card face -- a string, never a number ("H12", "TG08" both occur). */
  cardNumber?: string;
  /** The cleaned name, e.g. "Eevee" rather than "Eevee — Jungle #51". */
  name: string;
  /** The full catalog name, kept for the hover title so the suffix stays reachable. */
  fullName?: string;
  price?: number;
}

/** Classic-search catalog rows (the set checklists). */
export function fromCatalogCard(card: CatalogCard): CompactCardFields {
  return {
    href: cardPath(card.productId, card.name),
    imageUrl: card.imageUrl,
    cardNumber: card.cardNumber,
    name: cardDisplayName(card.name, card.setName, card.cardNumber) ?? card.name,
    fullName: card.name,
    price: card.price,
  };
}

/** Commerce products (the gap rails).
 *
 *  `getCardFields` then `cardIdentityFromName` is the same two-step `useProductCardData` uses, and
 *  for the same measured reason: a product whose `additionalFields` came back empty still has its
 *  set and number inside `ec_name`, and recovering them there is what keeps one surface from
 *  showing "Eevee — Jungle #51" where every other shows "Eevee". */
export function fromProduct(product: Product): CompactCardFields {
  const fields = getCardFields(product.additionalFields);
  const fullName = product.ec_name ?? undefined;
  const fallback = fields.setName || fields.cardNumber ? {} : cardIdentityFromName(fullName);
  const setName = fields.setName ?? fallback.setName;
  const cardNumber = fields.cardNumber ?? fallback.cardNumber;
  const id = product.ec_product_id ?? product.permanentid;
  return {
    href: cardPath(id, fullName),
    imageUrl: product.ec_images?.[0],
    cardNumber,
    name: cardDisplayName(fullName, setName, cardNumber) ?? fullName ?? id,
    fullName,
    // The buy price -- promo when there is one, otherwise list. Same rule the marketplace tile's
    // Add button follows, so a discounted card cannot read as one price here and another there.
    price: product.ec_promo_price ?? product.ec_price ?? undefined,
  };
}

export function CompactCardTile({ card }: { card: CompactCardFields }) {
  return (
    <Link
      to={card.href}
      // The full catalog name stays reachable on hover, the same contract the marketplace tile's
      // stretched link uses -- the visible line drops the "— Set #n" suffix.
      title={card.fullName}
      // `min-w-0` is load-bearing, not decoration: a flex/grid item's default `min-width: auto` is
      // its MIN-CONTENT width, so `truncate`/`line-clamp` alone do nothing here and a long card
      // name pushes the column -- and with it the page -- wider than its track. The rest is
      // ProductCard's own root treatment: rounded-2xl over the global radius, one depth at rest,
      // one gesture on hover. `h-full` so a rail of these ends level whatever each name wraps to.
      className="card-hover group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-rest"
    >
      {/* The identity strip, in the tile's own idiom: mono, uppercase, above the art. Just the
          number -- a marketplace tile puts set and rarity here too, and on both Advisor surfaces
          the set is already named by the row or the tab you are standing on. */}
      {card.cardNumber && (
        <span className="truncate px-3 pt-2.5 font-mono text-2xs font-bold uppercase tracking-wide tabular-nums text-muted-foreground">
          #{card.cardNumber}
        </span>
      )}
      {/* Same treatment as the marketplace tile's art box -- inset within the card's own padding,
          its own rounding, `object-cover`, and the hover scale that identifies a card as clickable
          across the app. `bg-muted` is only ever seen on a card the catalog has no scan for. */}
      <div className="relative mx-3 mt-2 aspect-[5/7] overflow-hidden rounded-xl bg-muted">
        <CardImage
          src={card.imageUrl}
          alt=""
          className="h-full w-full transform-gpu object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">{card.name}</span>
        {card.price !== undefined && (
          <span className="mt-auto text-sm font-bold tabular-nums text-foreground">{formatCurrency(card.price)}</span>
        )}
      </div>
    </Link>
  );
}
