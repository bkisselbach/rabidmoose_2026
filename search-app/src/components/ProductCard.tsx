import { CardImage } from '@/components/CardImage';
import { memo } from 'react';
import { useInView } from '@/lib/useInView';
import { Link } from 'react-router-dom';
import type { InteractiveProduct, Product } from '@coveo/headless/commerce';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MerchBadge } from '@/components/MerchBadge';
import { ArtOverlay } from '@/components/ArtOverlay';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Check, Swords } from 'lucide-react';
import { addToDeck as addToDeckStorage, useDeck } from '@/lib/deckStorage';
// The app's single price formatter. Used directly rather than through PriceFormat_Basic
// because the button needs the STRING (it also goes in the aria-label), not a styled <span>.
import { formatCurrency } from '@/lib/currency';
import { useProductCardData } from '@/lib/useProductCardData';
import { cardVariantToken, raritySlot } from '@/lib/cardFields';
import { cardIdentityParts } from '@/lib/cardIdentity';
import { TILE_PRESETS, type TilePreset } from '@/lib/cardPresets';
import { isHoloRarity } from '@/lib/rarityLabel';
import { HoloFoil } from '@/components/HoloFoil';
import { CardPokedexLink, useCardSpecies } from '@/components/CardPokedexLink';
import { CardTypeIcons } from '@/components/CardTypeIcons';
import { cn } from '@/lib/utils';
import { PokeballMark } from '@/components/PokeballMark';

interface Props {
  product: Product;
  interactiveProduct: InteractiveProduct;
  /** Trending rank (1-based). Rendered as a small numbered chip so ranked rails (home trending)
   *  can show list position; everywhere else omits it and the card is unchanged. */
  rank?: number;
  /** Extra classes for the card's own root, merged over its base treatment -- positioning and
   *  sizing from the surface, never type scale or colour. */
  className?: string;
  /** Which surface this card is on -- a named entry in `TILE_PRESETS` (lib/cardPresets.ts), and the
   *  ONLY way to configure what a card renders.
   *
   *  Required, deliberately (card-system-plan.md §6.1). The three booleans this replaced --
   *  `showPrice`, `showPokedexLink`, `showHp` -- are how the card surfaces drifted apart in the
   *  first place: a new surface would arrive, pass whichever flags looked right, and no single
   *  place described what any of them looked like. Now one file does, and a new look has to be a
   *  named, deliberate act rather than an inline tweak nobody else sees.
   *
   *  Per-CARD data (`rank`'s number, the `className` ring) stays a prop, because it varies per card
   *  rather than per surface. That is the line between the two. */
  preset: TilePreset;
  /** The LCP escape hatch (item 31e). Lazy-loading is right for 17 of the 18 tiles in a grid and
   *  wrong for the one the visitor is actually waiting on, so the FIRST tile of the first screen
   *  opts out and loads eagerly at high fetch priority. Per-card, not per-surface, which is why it
   *  is a prop and not a preset entry. */
  priority?: boolean;
}

function ProductCardImpl({
  product,
  interactiveProduct,
  rank,
  className,
  preset,
  priority = false,
}: Props) {
  // One object decides what this card renders, from here down -- nothing below reads a prop to
  // decide whether to draw itself. Changing what a surface looks like is an edit to TILE_PRESETS,
  // in one file, rather than a hunt across the call sites.
  const features = TILE_PRESETS[preset];
  // Badge enrichment is one request PER PRODUCT (the Badges API has no batch shape), so a grid of
  // 18 tiles used to fire 18 of them whether or not anyone scrolled that far -- item 31d. The
  // badges themselves are real and render; only the ASKING is deferred, until this tile has been
  // within 200px of the viewport once.
  const { ref: cardRef, inView: badgesInView } = useInView<HTMLDivElement>();
  const {
    price,
    promoPrice,
    displayName,
    setName,
    cardNumber,
    rarity,
    cardCategory,
    hp,
    totalInSet,
    setYear,
    setCode,
    accent,
    badges,
    isPinned,
    productHref,
    quantityInCart,
    justAdded,
    addToCart,
  } = useProductCardData(product, badgesInView);
  // Deck membership, only read/used when this preset actually turns addToDeck on -- useDeck()
  // itself is cheap (one useSyncExternalStore read), so it's simplest to always call the hook
  // (rules of hooks) and only act on it below.
  const deckLines = useDeck();
  const productId = product.ec_product_id ?? product.permanentid;
  const deckQuantity = deckLines.find((l) => l.productId === productId)?.quantity ?? 0;
  // The buy price -- promo when there is one, otherwise list -- and it renders in exactly one place
  // on every surface: the Add button (card-system-plan.md §6.5, decided 2026-08-17).
  //
  // This replaced a `priceRow` feature flag that chose between a two-line "Market Price / High
  // Price" block and the button. Once the answer was "the button, everywhere", the flag had one
  // value at every call site -- which is the definition of speculative generality this file's own
  // Phase 1 rule rejects -- so it was deleted rather than defaulted.
  const buyPrice = promoPrice ?? price;
  // Rarity, the set and the printing designation are TEXT on this line, never chips (2026-08-17,
  // direct request: "the labels like 'rare' and 'new arrival' are not looking great ... some of
  // them are driven by Coveo, I think those are the only ones I want to keep"). The rule the whole
  // card follows: **a chip means a merchandiser decided something in the Coveo console; plain text
  // is a fact about the card.** The assembly itself lives in lib/cardIdentity.ts, shared with the
  // list row; only the two `title`-attribute values below are built here, because the tooltip
  // deliberately shows MORE than the visible line does.
  //
  // The set code prefers the real short form and degrades to the set name on older-pipeline data
  // that has no `setCode` yet (rabidmoose-visual-refresh-plan.md §3b).
  const topStripCode = setCode ?? setName;
  const fullStripNumber = cardNumber ? (totalInSet ? `#${cardNumber}/${totalInSet}` : `#${cardNumber}`) : undefined;
  // The Pokedex line replaces the name line outright on any card that has a species (2026-08-17,
  // direct request, after a first pass that only replaced it when the two strings matched produced
  // a visibly mixed grid). One rule, no exceptions -- see CardPokedexLink's header for what that
  // costs and why it was still the right call.
  //
  // The name still renders when this line does NOT (Trainer/Energy cards, unresolved lookups), so a
  // card can never come out with no name at all.
  const species = useCardSpecies(product);
  const pokedexLink = features.pokedexLink && species ? <CardPokedexLink species={species} /> : null;
  const showName = pokedexLink === null;
  // Only when the Pokedex line actually took the name away. A card still showing its own name
  // (Trainer/Energy, unresolved lookup) has the designation in plain sight already, and repeating
  // it in the strip would be the duplication this whole pass has been removing.
  const variantToken = pokedexLink !== null ? cardVariantToken(displayName, species?.characterName) : undefined;
  // Built by the shared assembly (lib/cardIdentity.ts) that the list row also uses, so the two can
  // no longer drift -- they had, silently: when the printing designation was added to this line the
  // row never got it.
  //
  // The tile's three options, each measured rather than chosen by taste:
  //  - `setForm` drops the set whenever a set LINE renders under the art, because otherwise this
  //    strip spends its scarce width restating a fact the card already carries. At the PLP's `lg`
  //    tile width (8.5rem = 136px) keeping it truncated the line to "RG · #105/116 · …", clipping
  //    the rarity the strip exists to show. `'code'` is the fallback for sparse products that have
  //    no set line to fall back to.
  //  - `shortenRarity` on, for the same 136px reason.
  //  - `includeTotal` off: with `/113` in place, adding the designation truncated 12 of 23 tiles at
  //    375px, and since it lands last it was the segment being cut.
  const identityLine = cardIdentityParts(
    { setName, setCode, cardNumber, totalInSet, rarity, cardCategory, variantToken },
    { setForm: setName ? 'none' : 'code', shortenRarity: true, includeTotal: false }
  );

  return (
    // rounded-2xl overrides Card's default rounded-lg (the site's global --radius, 8px) --
    // pixel-fidelity pass against the mockup (plan §3b), whose card uses a much more pronounced
    // rounded-3xl (24px). Overridden per-instance here, not by changing --radius globally, which
    // would re-round every button/input/badge site-wide for a change that was only asked of cards.
    <Card
      ref={cardRef}
      data-testid="product-card"
      // `shadow-rest` (2026-08-18, CSS/theming audit): every OTHER tile in the app -- PokedexCard,
      // NewsCard, ConsultantResultTile, SpeciesRow -- carried the rest elevation while this one had
      // none, so a product tile sat visibly flatter than a species tile in the same grid, and
      // `.card-hover`'s own `box-shadow: var(--elevation-rest)` read as the shadow APPEARING on
      // hover here and as a no-op everywhere else. One depth at rest, one gesture on hover.
      className={cn('card-hover group relative flex h-full flex-col overflow-hidden shadow-rest', className)}
    >
      {/* Stretched-link pattern: a real, crawlable <a href> covering the whole card, kept as a
          sibling (not an ancestor) of the "Add to cart" button below so no interactive element
          nests inside another. */}
      {/* `title` as well as `aria-label` (2026-08-17): on a card whose visible name has given way to
          the Pokedex line, this overlay is the only place the full catalog name -- variant suffix
          included -- is still reachable, by hover for a pointer and by name for a screen reader. It
          used to live on the <h3> that is now conditional. */}
      <Link
        to={productHref}
        onClick={() => interactiveProduct.select()}
        aria-label={product.ec_name ?? 'View card'}
        title={product.ec_name ?? undefined}
        className="absolute inset-0 z-10"
      />
      {/* Top strip, above the image -- card-layout rework (plan §3b): set code + number on the
          left, rank on the right when this tile is on a ranked rail. Replaces the old top-right
          price-trend badge, which the mockup shows but TCGdex has no data for at all (checked
          live) -- dropped rather than faked. */}
      {features.identityStrip && (identityLine.length > 0 || rank !== undefined) && (
        <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-2.5 text-2xs">
          {/* `title` carries the UNSHORTENED line, including the set code the visible strip drops
              and the full rarity behind its short form -- so nothing on this line is unrecoverable
              on a pointer. See lib/rarityLabel.ts for why the long values are abbreviated rather
              than allowed to truncate mid-word. */}
          <span
            title={[topStripCode, fullStripNumber, raritySlot(rarity, cardCategory), variantToken]
              .filter(Boolean)
              .join(' · ')}
            className="min-w-0 truncate font-mono font-bold uppercase tracking-wide text-muted-foreground"
          >
            {identityLine.join(' · ')}
          </span>
          {/* `-my-1` keeps the badge from making this strip taller than it is on an unranked card:
              the badge's own padding took the row 26px -> 32px, which is the entire reason the home
              page's ranked Trending panel used to end 6px below the unranked Recently Purchased one
              beside it, showing the same products. The badge is taller than the 16px text line it
              sits next to, so it bleeds ~3px into the strip's own pt-2.5 above and the image's mt-2
              below -- both empty space, nothing to clip. */}
          {/* Hidden below `sm`, where it moves onto the artwork instead -- see the rank mark on the
              image below. Measured: sharing this row costs the identity line 22px (104px -> 82px on
              a 150px rail tile), which was enough to truncate every ranked tile on the 375px
              Trending rail while the unranked rail beside it clipped none. The rank is the one
              element here that can move without losing meaning, since it reads as a position mark
              wherever it sits. */}
          {rank !== undefined && (
            <Badge className="-my-1 hidden shrink-0 tabular-nums sm:inline-flex">#{rank}</Badge>
          )}
        </div>
      )}
      {/* Matches the mockup's own card image treatment exactly -- NOT `.product-stage` (that's a
          light "product photography" mount, built on an assumption that doesn't hold for these
          tightly-cropped card scans; checked the actual source pixels this session and the white
          was never in the image file, it was the stage's own background + padding). The mockup
          does NOT run the image flush to the card's outer edge, though -- it insets the image box
          within the card's own padding (`mx-3`, matching `CardContent`'s `p-3` below) and gives
          THAT box its own rounded corners (it's no longer flush with the outer card, so it can't
          ride the outer `overflow-hidden` clip the old full-bleed attempt relied on). Inside its
          own box the image fills edge to edge, zero padding, `object-cover` not `object-contain`.
          Dark fallback (`bg-card`) instead of white -- there's essentially never a gap to see it
          through, since `object-cover` always fills the box. Plan §3b, "Round 3". PDP's own
          product-stage instance is untouched -- this is the grid tile only. */}
      <div className="relative mx-3 mt-2 aspect-[5/7] overflow-hidden rounded-xl bg-card">
        <CardImage
          src={product.ec_images?.[0]}
          alt={product.ec_name ?? ''}
          priority={priority}
          className="h-full w-full transform-gpu object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Foil sheen, and ONLY on a holo printing -- `isHoloRarity` reads the same `cardrarity`
            the identity line above renders as text, so about one tile in five shines and a Common
            never does. Inside the art box so it clips to the artwork's own rounded corners rather
            than washing over the card's chrome, and above the image but below the accent bar and
            the corner marks, which should stay legible through it. */}
        {features.foil && isHoloRarity(rarity) && <HoloFoil />}
        {/* The rank's narrow-viewport home (below `sm` only; above it the strip has room and keeps
            it). Bottom-left rather than top-left: the two top corners are already spoken for by
            Featured and the type icon, and a card's own art is busiest at the top. No collision
            with Featured in practice either -- Featured needs a query-pinned result and ranked
            tiles come from recommendation slots, which have no query. */}
        {rank !== undefined && (
          <Badge className="absolute bottom-1.5 left-1.5 z-[2] tabular-nums sm:hidden">#{rank}</Badge>
        )}
        <span className="absolute inset-x-0 bottom-0 z-[2] h-[3px]" style={{ backgroundColor: accent.bg }} />
        {/* Rarity and the merchandiser badge moved OFF the image entirely (see CardContent below)
            -- they were sitting on top of the art itself, and on a small tile that reads as the
            badges blocking the card rather than annotating it. The image now carries only the two
            things that behave like a real card's own corner marks: the type icon (top-right,
            direct request) and Featured (top-left, only for a query-pinned result, so it's rare
            enough not to compete with the type icon for the same corner). */}
        {features.featuredBadge && isPinned && (
          <ArtOverlay className="absolute left-1.5 top-1.5">
            <Badge variant="accent">Featured</Badge>
          </ArtOverlay>
        )}
        {features.typeIcons && (
          <div className="absolute right-1.5 top-1.5">
            <CardTypeIcons product={product} />
          </div>
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-1 p-3">
        {/* This row lives below the image rather than on it (direct request -- overlaid badges were
            blocking the art), and it no longer needs `ArtOverlay`'s frosted plate now that it sits
            on the card's own solid background instead of on photography.

            Merchandiser badges ONLY. The rarity chip that used to share this row moved into the
            identity line above as text -- see `rarityToken`. What is left is exactly the labels a
            human authored in Merchandising Hub (Rare Find / Vintage / New Arrival / High Value /
            Budget Pick), so a chip on a card now carries one meaning instead of two.
            Colours come from `badge.backgroundColor`/`textColor`, i.e. from the console, and are
            deliberately not themed -- see MerchBadge.
            The row disappears entirely when there are no badges rather than rendering an empty
            flex container, which is why this is gated on `badges.length` and not on a field that
            is always present. */}
        {features.merchBadges && badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {badges.map((b, i) => (
              <MerchBadge key={`${b.text}-${i}`} badge={b} />
            ))}
          </div>
        )}
        {((features.setLine && setName) || (features.hp && hp !== undefined)) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Set name (+ release year once the catalog carries it, plan §3b) -- rarity and the
                printing number moved to their own zones above, so this line no longer joins all
                three into one string. */}
            {features.setLine && setName && (
              <span className="eyebrow min-w-0 truncate">
                {setName}
                {setYear ? ` (${setYear})` : ''}
              </span>
            )}
            {/* HP is `cardhp`, another plain catalog field, so it follows rarity out of a chip and
                into text by the same rule. Only the species gallery asks for it (`showHp`). */}
            {features.hp && hp !== undefined && (
              <span className="eyebrow shrink-0 text-muted-foreground">HP {hp}</span>
            )}
          </div>
        )}
        {/* Base name only, one line -- the set/number suffix the catalog bakes into ec_name is
            already stated above, so repeating it here was pure noise. Full name stays in the
            title attr and on the stretched link's aria-label. When the card resolves to a Pokedex
            species, the name itself is the crosslink (book icon marks it as one) instead of a
            separate "Pokédex" link competing for space next to the type chips. */}
        {/* Two title lines that are really one: whichever of them is the card's name.
            - The name belongs to the PDP now, like the rest of the card (2026-08-17, after the book
              icon came off). It is plain text under the stretched <a>, styled as a link by
              `.card-title-link` -- see index.css for why it is NOT its own <a> element. It used to
              be the Pokedex crosslink itself, which is the mismatch that made the book icon read as
              wrong: the name went to /pokedex/<species> while every other pixel went to the PDP.
            - It then disappears entirely on cards where it only repeats the Pokedex line below it
              ("Slugma" over "POKEDEX: SLUGMA"), and stays on cards where it doesn't ("Cramorant V",
              "Dark Charizard"). See isNameRedundant for why that is a comparison, not a blanket
              rule.
            `title` keeps the FULL raw catalog name reachable on hover either way, so nothing is
            actually unreadable on a card whose name is hidden. */}
        {showName && (
          <h3 data-testid="product-name" title={product.ec_name ?? undefined} className="min-w-0 text-sm font-semibold text-foreground">
            <span className="card-title-link block truncate">{displayName}</span>
          </h3>
        )}
        {/* Null on Trainer/Energy cards and on any name the species guesser can't match -- the same
            quiet miss the name-as-link had. Those cards keep their name above, since `showName`
            can only go false when this line is actually rendering. */}
        {pokedexLink}
        {/* Dual price row -- card-layout pass from the RabidMoose mockup
            (presentation/rabidmoose-visual-refresh-plan.md §3b): buy price prominent, a real
            secondary reference figure (High -- honest TCGdex data, not a fabricated PSA number)
            alongside it when the catalog has one. Price moved off the Add-to-cart button to make
            room -- the mockup keeps price in exactly one place, not repeated on the button too. */}
        {/* No price element here any more -- card-system-plan.md §6.5, decided 2026-08-17: ONE
            price per card, and it is the Add button. The two-line "Market Price / High Price" row
            that used to sit here is gone from every tile.
            The market framing it provided is not lost, it moved to where a shopper deciding on a
            price actually is: the PDP already renders the full Low / Mid / High / Direct spread,
            from the same TCGdex fields, on a page with the room to label them. */}
      </CardContent>
      {/* Untinted footer: the buy button is already a solid full-width block of the brand accent,
          so the grey action band behind it was a second frame around something that framed itself
          -- and against the card's white body it read as a strip of unfinished background. The
          button carries the emphasis on its own; the footer just holds it.
          Add to cart is the only action here. The mockup's second footer button ("Compare") was
          built visually-only for one pass and then removed at the user's request -- an inert
          control on every card in the app is a worse placeholder than none. The real compare
          feature (list state, comparison UI) is still earmarked as its own followup in plan §6;
          the button comes back with it, not before.

          `addToDeck` (deck-builder-advisor-plan.md Phase B follow-up) is the one exception to
          "one action per card", and deliberately narrow: on for the `deck-check` preset only,
          where a shopper is looking at a tile specifically because it fixes a gap in the deck
          they're actively diagnosing on the same page -- not a second guessed-at feature bolted
          onto every card in the app. Icon-only, not a second full-width button, so it doesn't
          repeat the visual weight the Compare button was removed for. */}
      {features.addToCart && (
      <CardFooter className="gap-1.5 p-2">
        {/* The aria-label always leads with "Add to cart" and now names the price too. That matters
            more than it looks: when the button's visible text IS the price, the label is the only
            place the ACTION is stated -- and on the rails this button is the only place the price
            exists at all, so a screen reader that got just "Add to cart" would lose it entirely. */}
        <Button
          type="button"
          size="sm"
          variant={justAdded ? 'secondary' : 'default'}
          onClick={addToCart}
          aria-label={`Add to cart${buyPrice !== undefined ? `, ${formatCurrency(buyPrice)}` : ''}${quantityInCart > 0 ? `, ${quantityInCart} in cart` : ''}`}
          className="relative z-20 h-8 flex-1 gap-1.5"
        >
          {justAdded ? (
            <>
              {/* The catch, not a checkmark (2026-08-18, motion-system-plan.md M3). Adding a card
                  used to confirm itself with a generic tick here and a scale bump on the header
                  cart icon a whole viewport away -- nothing on the control that was pressed said
                  anything Pokémon at all. Keyed on the cart quantity so the ball REMOUNTS on every
                  add and the wobble actually replays; a CSS animation left applied to a live
                  element plays exactly once. See components/PokeballMark.tsx. */}
              <PokeballMark key={quantityInCart} wobble className="h-3.5 w-3.5" /> Caught!
            </>
          ) : (
            <>
              <ShoppingBag className="h-3.5 w-3.5" />
              {buyPrice !== undefined ? formatCurrency(buyPrice) : 'Add'}
              {quantityInCart > 0 && ` (${quantityInCart})`}
            </>
          )}
        </Button>
        {features.addToDeck && (
          <Button
            type="button"
            size="sm"
            variant={deckQuantity > 0 ? 'secondary' : 'outline'}
            onClick={() => addToDeckStorage(productId)}
            aria-label={deckQuantity > 0 ? `In deck, ${deckQuantity}` : 'Add to deck'}
            className="relative z-20 h-8 w-8 shrink-0 p-0"
          >
            {deckQuantity > 0 ? <Check className="h-3.5 w-3.5" /> : <Swords className="h-3.5 w-3.5" />}
          </Button>
        )}
      </CardFooter>
      )}
    </Card>
  );
}

// MEMOIZED (item 31c / performance-plan.md §4b). ProductCard is a pure function of its props, and the
// grids that render it re-render on every notification from any controller subscription on the
// page -- eighteen tiles re-rendering because a facet count changed somewhere else.
//
// THIS ONLY WORKS BECAUSE 31c's FIRST HALF LANDED. Until `useInteractiveProducts` cached the
// controllers, the `interactiveProduct` prop was a fresh object on every render, so a memo
// comparison could never match and this wrapper would have been decoration that read like an
// optimization. Sequence matters here; do not port this to a tile whose controller prop is still
// rebuilt inline.
export const ProductCard = memo(ProductCardImpl);
