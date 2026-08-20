import { useEffect, useRef, useState } from 'react';
import { getVisitorId } from '@/lib/visitorId';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { buildProductView } from '@coveo/headless/commerce';
import { ProductRecommendations } from '@/components/ProductRecommendations';
import { CardDetailSkeleton, PokedexZoneBandCard } from '@/components/Skeleton';
import { PokemonDataPanel } from '@/components/pokedex/PokemonDataPanel';
import { EvolutionChain } from '@/components/pokedex/EvolutionChain';
import { TypeIconCircles } from '@/components/pokedex/TypeIconCircles';
import { AskPokedex } from '@/components/AskPokedex';
import { CoveoChip } from '@/components/CoveoChip';
import { ErrorPanel } from '@/components/ErrorPanel';
import { CARD_NOT_FOUND_QUIPS, LOOKUP_FAILED_QUIPS, pickQuip } from '@/lib/errorQuips';
import { ZONES, ZoneEyebrow } from '@/components/zones';
import { SiteFooter } from '@/components/SiteFooter';
import { Badge } from '@/components/ui/badge';
import { MerchBadge } from '@/components/MerchBadge';
import { ArtOverlay } from '@/components/ArtOverlay';
import { Button } from '@/components/ui/button';
import { cart } from '@/cart';
import { commerceEngine } from '@/commerceEngine';
import { useCoveoState } from '@/lib/useCoveoState';
import PriceFormat_Basic from '@/components/commerce-ui/price-format-basic';
import PriceFormat_Sale from '@/components/commerce-ui/price-format-sale';
import QuantityInputBasic from '@/components/commerce-ui/quantity-input-basic';
import ImageViewer_Basic from '@/components/commerce-ui/image-viewer-basic';
import { HoloStudioButton } from '@/components/HoloStudioOverlay';
import { useProductBadge } from '@/lib/useProductBadge';
import { getCardFields, raritySlot } from '@/lib/cardFields';
import { typeColor } from '@/lib/typeColors';
import { extractPokemonName } from '@/lib/cardPokemonName';
import { cleanCardName } from '@/lib/cardName';
import { trimEnrichmentSuffix } from '@/lib/cardDescription';
import { useCharacterLookup } from '@/lib/useCharacterLookup';
import { ConsultantFitStrip } from '@/components/consultant/ConsultantFitStrip';
import { toggleCompare, useCompareIds, COMPARE_MAX_ITEMS } from '@/lib/compareStorage';
import { addToDeck, useDeck } from '@/lib/deckStorage';
import { Scale, Swords, Check } from 'lucide-react';
import { recordProductView } from '@/lib/recentlyViewedStorage';
import { logCustomInteraction } from '@/lib/customEvents';
import { ShieldCheck, Truck, RotateCcw, ZoomIn, ArrowRight, ChevronRight, Home } from 'lucide-react';
import { SITE_URL, useJsonLd, useSeo } from '@/lib/seo';
import { cardPath, pokemonPath, slugify } from '@/lib/paths';
import { PageTitle } from '@/components/PageTitle';

interface CommerceProduct {
  ec_name: string | null;
  ec_description: string | null;
  ec_price: number | null;
  ec_promo_price: number | null;
  ec_images: string[];
  ec_product_id: string | null;
  ec_category: string[];
  permanentid: string;
  additionalFields: Record<string, unknown>;
}

const TRUST_ROW = [
  { icon: Truck, label: 'Free shipping over $75' },
  { icon: ShieldCheck, label: 'Authenticity guaranteed' },
  { icon: RotateCcw, label: '30-day returns' },
];

export function ProductDetailPage() {
  const { id, slug } = useParams<{ id: string; slug?: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<CommerceProduct | null>(null);
  // A dead id and a dead endpoint are different failures and get different pages -- see the same
  // split on CharacterDetailPage. `missing` is permanent (noindex it, offer somewhere else to go);
  // `failed` is transient (offer the retry that actually fixes it).
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  // In the fetch effect's deps, so the retry button refetches by bumping it.
  const [attempt, setAttempt] = useState(0);
  // Fixed at mount, not re-picked per render -- see `pickQuip`.
  const [missingQuip] = useState(() => pickQuip(CARD_NOT_FOUND_QUIPS));
  const [failedQuip] = useState(() => pickQuip(LOOKUP_FAILED_QUIPS));
  const cartState = useCoveoState(cart);
  const [primaryRecIds, setPrimaryRecIds] = useState<string[]>([]);

  // Publish the mobile add-to-cart bar's height so other viewport-pinned UI can sit above it (see
  // the comment on the bar itself). Keyed on `product` because the bar only renders once there is
  // one, so measuring before then would report 0 and the offset would never apply.
  const mobileBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const height = mobileBarRef.current?.offsetHeight;
    if (!height) return;
    document.documentElement.style.setProperty('--fixed-bottom-bar', `${height}px`);
    return () => {
      document.documentElement.style.removeProperty('--fixed-bottom-bar');
    };
  }, [product]);

  useEffect(() => {
    if (!id) return;
    // Reset immediately so a card-to-card navigation (the route element stays mounted, only `id`
    // changes) doesn't leave the previous product's state -- and every child derived from it, e.g.
    // HoloStudioOverlay's foil/flip state -- rendered against the new id while this fetch is in flight.
    setProduct(null);
    setError(null);
    let cancelled = false;
    const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
    const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
    const trackingId = import.meta.env.VITE_COVEO_TRACKING_ID || 'pokemon-catalog';

    fetch(`https://platform.cloud.coveo.com/rest/organizations/${organizationId}/commerce/v2/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackingId,
        clientId: getVisitorId(),
        context: { view: { url: window.location.href }, capture: true, cart: [] },
        language: 'en',
        country: 'US',
        currency: 'USD',
        query: id,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        // The id lookup runs as a free-text `query: id` against the commerce index, so the
        // response is a RELEVANCE-ranked list, not a lookup result -- `products[0]` is whatever
        // ranked first for that string, related or not. This used to fall back to it whenever the
        // exact id missed, which meant NO card URL could ever be wrong: `/card/abc123` rendered
        // Abra 151 #063, canonicalized the URL to it, and served it `index, follow` (measured
        // 2026-08-19). A mistyped or dead id has to reach the not-found state, not silently become
        // a different card. Case-insensitive because that is the one difference an id can carry and
        // still be the same id -- nothing else is accepted.
        const wanted = id.toLowerCase();
        const match = data.products?.find(
          (p: CommerceProduct) => String(p.ec_product_id ?? '').toLowerCase() === wanted
        );
        if (!match) {
          setError('missing');
          return;
        }
        setProduct(match);
      })
      .catch(() => {
        if (!cancelled) setError('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  // Coveo requires a `ec.productView` event any time a product detail page loads. Guarded by a
  // ref (rather than firing straight from the fetch) so it emits exactly once per product, even
  // if this component re-renders before the id-keyed effect below would otherwise re-run it.
  const productViewLoggedFor = useRef<string | null>(null);
  useEffect(() => {
    const productId = product?.ec_product_id;
    if (!productId || productViewLoggedFor.current === productId) return;
    buildProductView(commerceEngine).view({
      productId,
      name: product?.ec_name ?? productId,
      price: product?.ec_promo_price ?? product?.ec_price ?? 0,
    });
    // The same moment, recorded locally as well. Coveo's Recently Viewed strategy is driven by the
    // very event above; until a Hub slot exists to serve it, the home rail reads this trail
    // instead (see recentlyViewedStorage.ts for why, and for how little changes when the slot
    // arrives).
    recordProductView(productId);
    productViewLoggedFor.current = productId;
  }, [product]);

  // Canonicalize the URL once the product is known: /card/base1-4 (or a stale/wrong slug)
  // becomes /card/base1-4/charizard-base-set-4. Replace, not push -- back button skips it.
  // The lookup effect above keys on `id` alone, so this never refetches.
  useEffect(() => {
    if (!id || !product?.ec_name) return;
    if (slug !== slugify(product.ec_name)) navigate(cardPath(id, product.ec_name), { replace: true });
  }, [id, slug, product, navigate]);

  const badges = useProductBadge(product?.ec_product_id ?? product?.permanentid ?? undefined);
  const compareIds = useCompareIds();
  const productId = product?.ec_product_id ?? product?.permanentid;
  const inCompare = !!productId && compareIds.includes(productId);
  const deckLines = useDeck();
  const deckQuantity = productId ? deckLines.find((l) => l.productId === productId)?.quantity ?? 0 : 0;

  // Computed with optional chaining (rather than after the loading/error guards below) since
  // hooks must run unconditionally on every render. Everything this page needs off
  // additionalFields comes from one shared reader (also used by the grid card's
  // useProductCardData) so the field names/quirks are defined in exactly one place.
  const { rarity, setName, cardNumber, cardCategory: cardType, cardTypes, lowPrice, midPrice, highPrice, directPrice, setYear, illustrator, psa10Price, psa9Price, psa10Count, psa9Count, gradedAsOf, printingOptions } =
    getCardFields(product?.additionalFields);
  // Which printing option is highlighted -- always starts at index 0, the same printing ec_price
  // was already built from (printing-enrich.cjs writes the array in that preference order, so no
  // separate "which one is default" field was needed). Re-keyed per product via `product?.ec_product_id`
  // so navigating PDP-to-PDP (e.g. a "More from this set" click) doesn't carry the previous card's
  // selection index onto a card with a different/shorter printing list.
  const [selectedPrinting, setSelectedPrinting] = useState(0);
  useEffect(() => setSelectedPrinting(0), [product?.ec_product_id]);
  // Only Pokemon-category cards have a species to link back to. Even so, extractPokemonName is
  // only a best-effort guess -- useCharacterLookup resolves to null on a miss either way.
  const pokemonName = cardType === 'Pokemon' && product?.ec_name ? extractPokemonName(product.ec_name) : undefined;
  const character = useCharacterLookup(pokemonName);
  // Computed here (not after the loading/error guards) because the breadcrumb JSON-LD hook below
  // needs it on every render.
  const cleanedName = product?.ec_name ? cleanCardName(product.ec_name, setName, cardNumber) : 'Card';

  const seoName = product?.ec_name ?? id ?? 'Card';
  const seoPrice = product?.ec_promo_price ?? product?.ec_price ?? undefined;
  const seoImage = product?.ec_images?.[0];
  const seoPath = cardPath(id ?? '', product?.ec_name);
  useSeo({
    // "Card not found" rather than the raw id when the lookup missed: the id is not a name, and a
    // <title> of `abc123 | RabidMoose` reads like a real product page in a tab strip or a history
    // list. Same reason the species page swaps its title below.
    title: error === 'missing' ? 'Card not found' : seoName,
    description: product?.ec_description
      ? product.ec_description.slice(0, 155)
      : `Shop ${seoName} — real, live-priced Pokémon trading card.`,
    path: seoPath,
    image: seoImage,
    type: 'product',
    // `/card/<anything>` matches the route and is served 200, so a dead card id would otherwise be
    // an indexable page whose entire content is "no such card" -- a soft 404. Noindex both error
    // states, the transient one included: a crawl that lands mid-outage shouldn't cache the failure
    // as this card's page.
    noindex: error !== null,
  });
  useJsonLd(
    'product',
    product
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.ec_name ?? seoName,
          description: product.ec_description ?? undefined,
          image: product.ec_images?.length ? product.ec_images : undefined,
          sku: product.ec_product_id ?? undefined,
          ...(seoPrice !== undefined
            ? {
                offers: {
                  '@type': 'Offer',
                  url: `${SITE_URL}${seoPath}`,
                  priceCurrency: 'USD',
                  price: seoPrice,
                  availability: 'https://schema.org/InStock',
                },
              }
            : {}),
        }
      : null
  );
  // The visible breadcrumb merged into the identity block's meta line (one taxonomy line instead
  // of a page-level trail restating it), but search results still get the structured trail the
  // old <Breadcrumbs> component emitted here.
  useJsonLd(
    'breadcrumbs',
    product
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: ZONES.marketplace.label },
            ...(setName ? [{ '@type': 'ListItem', position: 3, name: setName, item: `${SITE_URL}/search` }] : []),
            { '@type': 'ListItem', position: setName ? 4 : 3, name: cleanedName },
          ],
        }
      : null
  );

  const shell = (content: React.ReactNode) => (
    // `flex flex-1 flex-col` (not `min-h-screen` -- the persistent App-level shell owns that and
    // the header now, see App.tsx) so this still fills the remaining viewport height on its own,
    // with `pb-20 sm:pb-0` for the mobile sticky add-to-cart bar's clearance preserved exactly.
    <div className="flex flex-1 flex-col pb-20 sm:pb-0">
      <main className="page-enter-fade page-container flex-1 py-8">{content}</main>
      <SiteFooter />
    </div>
  );

  if (error === 'missing')
    return shell(
      <ErrorPanel
        headline="No such card"
        quip={missingQuip}
        detail={
          <>
            Nothing in the catalog matches <span className="break-all font-mono">{id}</span>.
          </>
        }
        actions={
          <>
            <Link to="/search" className="text-sm font-semibold text-primary hover:underline">
              Browse all cards
            </Link>
            <Link
              to="/pokedex"
              className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
            >
              Open the Pok&eacute;dex &rarr;
            </Link>
          </>
        }
      />
    );

  if (error === 'failed')
    return shell(
      <ErrorPanel
        headline="Couldn't load this card"
        quip={failedQuip}
        detail="The catalog didn't answer. This is usually temporary."
        actions={
          <>
            <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
            <Link
              to="/search"
              className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
            >
              Browse all cards &rarr;
            </Link>
          </>
        }
      />
    );
  // Page-shaped skeleton for the same reason the species page has one -- and to settle an
  // inconsistency inside this page: the Pokédex zone below already skeletoned its own pending
  // state (the `character === undefined` branch) while everything above it was one line of text,
  // so a slow product lookup and a slow species lookup looked like two different apps.
  if (!product)
    return shell(
      <div role="status" aria-label="Loading card">
        <CardDetailSkeleton />
      </div>
    );

  const quantityInCart = cartState.items.find((i) => i.productId === product.ec_product_id)?.quantity ?? 0;
  const price = product.ec_price ?? undefined;
  const promoPrice = product.ec_promo_price ?? undefined;
  const discountPercent =
    promoPrice !== undefined && price !== undefined && promoPrice < price
      ? Math.round((1 - promoPrice / price) * 100)
      : undefined;
  const accent = typeColor(cardTypes[0]);

  const description = product.ec_description ? trimEnrichmentSuffix(product.ec_description) : '';

  // The meta line doubles as the breadcrumb now: Home › Marketplace › {set, linked} › #4 · Rare.
  // The trail's leaf is the printing's own identity (number · rarity, with category filling
  // rarity's slot for Trainer/Energy cards) -- the H1 right below carries the name.
  const cardRaritySlot = raritySlot(rarity, cardType);
  const trailLeaf = [cardNumber ? `#${cardNumber}` : null, cardRaritySlot].filter(Boolean).join(' · ');
  const { label: marketplaceLabel, icon: MarketplaceIcon } = ZONES.marketplace;

  // A card's flavor text is usually the species' Pokédex flavor, sometimes lightly reworded
  // (base1-4: "unintentionally cause forest fires" vs the species' "cause forest fires
  // unintentionally") -- when the About section below is going to quote the same sentence,
  // repeating it up here reads as a bug, not information. Compared as sorted word multisets so
  // reorderings still match. While the species lookup is in flight, err toward not flashing it in.
  const flavorTokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).sort().join(' ');
  const flavorPending = !!pokemonName && character === undefined;
  const flavorDuplicated =
    !!description && !!character?.flavorText && flavorTokens(description) === flavorTokens(character.flavorText);
  const showDescription = !!description && !flavorPending && !flavorDuplicated;

  const adjustQuantity = (delta: number) => {
    cart.updateItemQuantity({
      productId: product.ec_product_id ?? product.permanentid,
      name: product.ec_name ?? product.permanentid,
      price: promoPrice ?? price ?? 0,
      quantity: quantityInCart + delta,
    });
  };

  const addToCartControl = (size: 'default' | 'lg') =>
    quantityInCart === 0 ? (
      <Button size={size} className="flex-1" onClick={() => adjustQuantity(1)}>
        Add to cart
      </Button>
    ) : (
      <div className="flex flex-1 items-center justify-between gap-3 rounded-md border border-border p-1">
        <QuantityInputBasic
          quantity={quantityInCart}
          min={0}
          onChange={(next) => adjustQuantity(next - quantityInCart)}
          className="shadow-none"
        />
        <div className="flex items-center gap-3 pr-2">
          <span className="text-sm text-muted-foreground">In cart</span>
          <button
            type="button"
            onClick={() => navigate('/cart')}
            className="pressable inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-primary hover:underline"
          >
            View cart <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );

  return shell(
    <>
      <div className="space-y-12">
        <div>
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
            {/* Sticky so the card stays in view while the buy column scrolls -- the two columns
                are never the same height, and this keeps the imbalance from reading as a gap.
                The sticky moved from the stage itself onto this wrapper when the illustrator
                credit was added below it (2026-08-17), so the credit travels with the artwork it
                credits instead of scrolling away from it. */}
            <div className="mx-auto w-full max-w-md lg:sticky lg:top-24">
            <div className="product-stage relative flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-lg p-8">
              {/* Stacks when more than one rule fires -- `demo-capabilities-map.md` calls for
                  exactly that on a Base-era holo over $100 ("Vintage + High Value"), which was
                  impossible until badgeQueue stopped keeping only the first badge (2026-08-17).
                  Column, not row: the plate hangs off the art's top-left corner and a second badge
                  reads better below the first than pushing across the card face. */}
              {badges.length > 0 && (
                <ArtOverlay className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1">
                  {badges.map((b, i) => (
                    <MerchBadge key={`${b.text}-${i}`} badge={b} />
                  ))}
                </ArtOverlay>
              )}
              {product.ec_images?.[0] && (
                <ImageViewer_Basic
                  imageUrl={product.ec_images[0]}
                  imageTitle={product.ec_name ?? undefined}
                  classNameThumbnailViewer="max-h-full w-auto rounded-none"
                />
              )}
              {/* The type marker sits on the scan here too, so the PDP matches every tile that led
                  to it. It keeps the chips' "browse this type" navigation -- the circle is still a
                  link, and the tooltip/aria-label carry the type's name now that the word is gone. */}
              <TypeIconCircles
                types={cardTypes}
                size="lg"
                className="absolute right-3 top-3 z-10"
                linkTo={(type) => ({ to: '/search', state: { presetFacet: { facetId: 'cardtypes', value: type } } })}
              />
              {/* pointer-events-none so the click still reaches the ImageViewer_Basic trigger underneath.
                  `--scrim` (index.css), the pinned-dark token for chrome that overlays product
                  photography -- same token as Badge's default variant. */}
              <span className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full bg-scrim/70 px-2 py-1 text-2xs font-medium text-white">
                <ZoomIn className="h-3 w-3" /> Zoom
              </span>
              {/* The 3D Holo Studio entry (flavor-round-plan.md item 23) -- bottom-LEFT because
                  every other stage corner is taken (badges top-left, types top-right, Zoom
                  bottom-right). Unlike the Zoom pill it IS interactive: a sibling of the
                  ImageViewer trigger, so clicking it opens the studio, not the zoom. */}
              {product.ec_images?.[0] && (
                <HoloStudioButton
                  imageUrl={product.ec_images[0]}
                  cardName={cleanedName}
                  rarity={rarity}
                  price={seoPrice}
                  className="absolute bottom-3 left-3 z-10"
                />
              )}
              <span className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: accent.bg }} />
            </div>
            {/* The artist credit, in the one place it belongs: under the artwork it credits, which
                is also where a real card prints it.
                `cardillustrator` has been indexed since the 2026-08-16 catalog rebuild -- at the
                cost of a full push cycle -- and until now was parsed, returned by
                `useProductCardData`, and rendered by NOTHING. Measured before building this: 82 of
                90 products on a live query carry a real name (Ken Sugimori, Mitsuhiro Arita,
                PLANETA, 5ban Graphics), so it is dense enough to be worth a line and sparse enough
                to need the guard.
                Deliberately NOT a link: browsing by illustrator would need `cardillustrator` to be
                facetable, and the set-link lesson from card-system-plan.md §6.10 applies -- a
                control that looks navigable and lands nowhere useful is worse than plain text.
                Deliberately NOT on the tile either: at 136px it would displace something that
                identifies the printing, and this is a detail for someone already looking at the
                card. */}
            {illustrator && (
              <p className="mt-2 text-center text-2xs text-muted-foreground">Illus. {illustrator}</p>
            )}
            </div>

            <div className="space-y-5">
              {/* Printing identity must be confirmed BEFORE the price asks to be believed -- and
                  the meta line doubles as the page's breadcrumb (Home › Marketplace › set ›
                  number · rarity), so the taxonomy appears exactly once, attached to the title
                  it describes. The clean H1 (set/number suffix stripped for display) follows. */}
              <div className="space-y-2">
                <nav aria-label="Breadcrumb" className="eyebrow flex flex-wrap items-center gap-1.5">
                  <Link to="/" aria-label="Home" className="tap-safe transition-colors hover:text-primary">
                    <Home className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                  <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {/* Not a link for the same reason the old crumb wasn't: the zone has no landing
                      page of its own (browsing it means /search with facets), so it's a label. */}
                  <span className="inline-flex items-center gap-1">
                    <MarketplaceIcon className="h-3 w-3 shrink-0" />
                    {marketplaceLabel}
                  </span>
                  {setName && (
                    <>
                      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <Link
                        to="/search"
                        state={{ presetFacet: { facetId: 'cardsetname', value: setName } }}
                        className="tap-safe transition-colors hover:text-primary hover:underline"
                      >
                        {setName}
                      </Link>
                    </>
                  )}
                  {trailLeaf && (
                    <>
                      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{trailLeaf}</span>
                    </>
                  )}
                </nav>
                <PageTitle>{cleanedName}</PageTitle>
              </div>

              {/* Buy box: price, CTA, and the trust row as one bounded unit. */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    {price !== undefined && (
                      <span className="mb-0.5 block eyebrow">
                        Market
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {promoPrice !== undefined && price !== undefined && promoPrice < price ? (
                        <PriceFormat_Sale
                          originalPrice={price}
                          salePrice={promoPrice}
                          className="items-baseline gap-2"
                          classNameOriginalPrice="text-sm"
                          classNameSalePrice="font-display text-3xl font-bold text-primary"
                        />
                      ) : price !== undefined ? (
                        <PriceFormat_Basic value={price} className="font-display text-3xl font-bold text-foreground" />
                      ) : (
                        <span className="font-display text-3xl font-bold text-foreground">Price not available</span>
                      )}
                      {discountPercent !== undefined && (
                        <Badge variant="accent" className="normal-case">
                          {discountPercent}% below market
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Loading this page is itself a Coveo event (product-view) -- it has nothing
                      else visible to point at, so it rides the same marker as the catalog read
                      that served the price. product-enrichment only when a badge actually fired. */}
                  <CoveoChip
                    capability={[
                      { capability: 'commerce-catalog' },
                      { capability: 'product-view' },
                      ...(badges.length > 0
                        ? [
                            {
                              capability: 'product-enrichment' as const,
                              // Names every badge that fired, not just the first -- on a card where
                              // two rules hit, the chip claiming one of them undersold the feature
                              // it exists to disclose.
                              detailSuffix: `This card's ${badges.length === 1 ? 'badge' : 'badges'}: ${badges
                                .map((b) => `"${b.text}"`)
                                .join(', ')}`,
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Live market pricing via TCGplayer</p>

                {/* Honest price-range strip -- real TCGdex/TCGplayer figures for this same
                    printing, not a fabricated grade/condition ladder (see
                    presentation/rabidmoose-visual-refresh-plan.md §4). Filters out whichever of
                    low/mid/high/direct the source data didn't have for this specific card, and
                    disappears entirely rather than showing an empty or invented row. */}
                {(() => {
                  const priceSpread = [
                    { label: 'Low', value: lowPrice },
                    { label: 'Mid', value: midPrice },
                    { label: 'High', value: highPrice },
                    { label: 'Direct', value: directPrice },
                    // `> 0`, not just `!== undefined` (2026-08-17). The source returns 0 for a
                    // figure it doesn't have rather than omitting it, so the undefined check alone
                    // let "$0.00" through into this strip -- the same defect the grid tile's High
                    // Price had. Each cell here is a standalone datum rather than a comparison, so
                    // the guard is against zero specifically: a Low genuinely can sit below the
                    // market price, which is why this is not the tile's `> buyPrice` rule.
                  ].filter((p): p is { label: string; value: number } => p.value !== undefined && p.value > 0);
                  if (priceSpread.length < 2) return null;
                  return (
                    <div className="mt-3 grid gap-2 border-t border-border pt-3" style={{ gridTemplateColumns: `repeat(${priceSpread.length}, minmax(0, 1fr))` }}>
                      {priceSpread.map((p) => (
                        <div key={p.label} className="rounded-md bg-muted px-2 py-1.5 text-center">
                          <div className="eyebrow">{p.label}</div>
                          <PriceFormat_Basic value={p.value} className="text-xs font-bold text-foreground" />
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Printings (printing-selector-plan.md, item 25) -- real TCGdex per-printing
                    prices the catalog scrape already had, previously collapsed to one bucket
                    before ec_price was ever set (catalogItem.ts's pickTcgplayerBucket). Renders
                    ONLY when the card has 2+ real printings -- most don't (measured: a typical
                    modern card has exactly one), so this is absent far more often than shown,
                    same honesty guard as the strip above it. Display-only, deliberately, like the
                    Graded Market panel below it: the catalog sells one SKU per physical card, so
                    picking a printing here shows its real price for context without touching
                    `price`/`promoPrice`/cart at all -- confirmed nowhere below this block reads
                    `selectedPrinting`. */}
                {printingOptions && printingOptions.length >= 2 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="eyebrow">Printings</span>
                      <CoveoChip capability="printing-pricing" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Printing">
                      {printingOptions.map((option, i) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => {
                            setSelectedPrinting(i);
                            logCustomInteraction('finishSelected', {
                              finish: option.key,
                              productName: product?.ec_name,
                            });
                          }}
                          aria-pressed={selectedPrinting === i}
                          className={`pressable rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors ${
                            selectedPrinting === i
                              ? 'border-accent-secondary bg-accent-secondary text-accent-secondary-foreground'
                              : 'border-border text-muted-foreground hover:border-foreground/60 hover:text-foreground'
                          }`}
                        >
                          {option.label}
                          {i === 0 && <span className="ml-1 opacity-70">· listed</span>}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <PriceFormat_Basic
                        value={printingOptions[selectedPrinting].marketPrice}
                        className="text-sm font-bold text-foreground"
                      />
                      <span className="text-2xs text-muted-foreground">
                        real {printingOptions[selectedPrinting].label.toLowerCase()} market price
                        {selectedPrinting !== 0 && ' — shown for context, not what Add to Cart charges'}
                      </span>
                    </div>
                  </div>
                )}
                {/* Graded market (flavor-round-plan.md item 21) -- the §6 PSA earmark, built the
                    honest way §4 demanded: these are eBay sold-listing MEDIANS from an offline
                    PokemonPriceTracker enrichment of a hand-picked subset, pushed into the same
                    catalog document as every other field. Renders ONLY where the fields exist --
                    most cards have none, and no multiplier ever fills the gap (the mockup's
                    `marketPrice × 2.5` is precisely what was refused). Sold counts render beside
                    each figure because a median of one sale must say so (base1-4's PSA 10 is a
                    single $17,500 sale); the as-of date renders because graded markets move.
                    Display-only, deliberately: we sell the raw card, so no grade selector feeds
                    the cart. */}
                {(psa10Price !== undefined || psa9Price !== undefined) && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="eyebrow">Graded market</span>
                      <CoveoChip capability="graded-pricing" />
                    </div>
                    <div
                      className="mt-2 grid gap-2"
                      style={{ gridTemplateColumns: `repeat(${1 + (psa9Price !== undefined ? 1 : 0) + (psa10Price !== undefined ? 1 : 0)}, minmax(0, 1fr))` }}
                    >
                      <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                        <div className="eyebrow">Raw</div>
                        <PriceFormat_Basic value={promoPrice ?? price ?? 0} className="text-xs font-bold text-foreground" />
                        <div className="text-2xs text-muted-foreground">live market</div>
                      </div>
                      {psa9Price !== undefined && (
                        <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                          <div className="eyebrow">PSA 9</div>
                          <PriceFormat_Basic value={psa9Price} className="text-xs font-bold text-foreground" />
                          <div className="text-2xs text-muted-foreground">{psa9Count === 1 ? '1 sale' : `${psa9Count} sold`}</div>
                        </div>
                      )}
                      {psa10Price !== undefined && (
                        <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                          <div className="eyebrow">PSA 10</div>
                          <PriceFormat_Basic value={psa10Price} className="text-xs font-bold text-foreground" />
                          <div className="text-2xs text-muted-foreground">{psa10Count === 1 ? '1 sale' : `${psa10Count} sold`}</div>
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 text-2xs text-muted-foreground">
                      eBay sold-listing medians via PokemonPriceTracker{gradedAsOf ? ` · measured ${gradedAsOf}` : ''}
                    </p>
                  </div>
                )}
                {/* Hidden on mobile in favor of the fixed bar below, which stays reachable while scrolling. */}
                <div className="mt-4 hidden gap-3 sm:flex">{addToCartControl('lg')}</div>

                {/* Compare entry point -- phase S4. Independent of the Consultant's read below
                    (which self-hides with no active brief): comparing two cards is useful with or
                    without a consultation running. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {productId && (
                    <button
                      type="button"
                      onClick={() => toggleCompare(productId)}
                      disabled={!inCompare && compareIds.length >= COMPARE_MAX_ITEMS}
                      className="pressable flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                      {inCompare ? 'Remove from compare' : `Add to compare${compareIds.length >= COMPARE_MAX_ITEMS ? ` (max ${COMPARE_MAX_ITEMS})` : ''}`}
                    </button>
                  )}
                  {/* "My Deck" entry point -- deck-builder-advisor-plan.md Phase A. Deliberately
                      separate from Add to cart above: a deck is cards a shopper owns/is building,
                      not what they're about to check out with. Always adds (no remove here --
                      quantity/removal lives on /advisor itself, same as a cart's own drawer vs.
                      its full page split). */}
                  {productId && (
                    <button
                      type="button"
                      onClick={() => addToDeck(productId)}
                      className="pressable flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
                    >
                      {deckQuantity > 0 ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Swords className="h-3.5 w-3.5" aria-hidden="true" />}
                      {deckQuantity > 0 ? `In deck (${deckQuantity})` : 'Add to deck'}
                    </button>
                  )}
                </div>

                <ul className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-3 sm:gap-3">
                  {TRUST_ROW.map(({ icon: Icon, label }) => (
                    <li key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="h-4 w-4 shrink-0 text-foreground" />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>

              {/* The PDP judging this card against the shopper's active consultation, if any --
                  see ConsultantFitStrip's own comment. Only meaningful once a species is resolved
                  (character !== undefined/null), so it sits right where that data becomes
                  available -- between the buy box and the evolution line, which reads the same
                  `character`. */}
              {character && (
                <ConsultantFitStrip
                  species={character}
                  price={price}
                  promoPrice={promoPrice}
                  rarity={rarity}
                  setYear={setYear}
                />
              )}

              {/* Card details (Category/HP/Card #) replaced by the species' own evolution line --
                  Card # and rarity already appear in the breadcrumb above, so the facts grid was
                  mostly repeating context the page already gives. Same EvolutionChain component
                  the "About" section below (and the species page) render, so the chain looks
                  identical everywhere it appears. */}
              {!!character && character.evolutionChain.length > 1 && (
                <div>
                  <p className="eyebrow mb-2">Evolution line</p>
                  <EvolutionChain chain={character.evolutionChain} currentName={character.characterName} accent={accent} />
                </div>
              )}
              {showDescription && (
                <p className="text-sm italic leading-relaxed text-muted-foreground">
                  &ldquo;{description}&rdquo;
                </p>
              )}

            </div>
          </div>
        </div>

        {pokemonName && character !== null && (
          // The tinted band makes the Pokédex zone read as its own chapter -- section 1 is
          // commerce on plain canvas, this is knowledge on a washed panel. No "About {species}"
          // title anymore (direct instruction) -- the evolution line up in the buy column and the
          // panel's own species portrait/name already establish that. The zone eyebrow itself came
          // back as its own full-width strip, above the panels rather than paired with the removed
          // title, so the zone signature stays even without a heading. scroll-mt-24 stays even with
          // the in-page jump link gone -- it still clears the sticky header for anyone landing
          // directly on a shared #about-the-pokemon link.
          <div id="about-the-pokemon" className="scroll-mt-24 rounded-2xl bg-muted/40 p-5 sm:p-8">
            <div className="mb-4 flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <ZoneEyebrow zone="pokedex" className="mb-0" />
            </div>
            {character === undefined ? (
              // The band's pending panel is shared with CardDetailSkeleton (see
              // PokedexZoneBandSkeleton) rather than spelled out twice. These two states render
              // back to back on a cold load -- page skeleton, then this -- and when they were two
              // hand-matched copies they were measurably different: the band moved 28px down and
              // shrank 28px on the swap, a 0.095 layout shift, most of this page's total.
              <PokedexZoneBandCard />
            ) : (
              // Same 3/2 split the species page uses for its knowledge zone, so Ask the Pokédex
              // appears at the same width, in the same right-rail position, on both detail pages
              // -- the species page owns the canonical presentation and this one aligns to it.
              <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-5">
                <div className="min-w-0 lg:col-span-3">
                  <PokemonDataPanel
                    pokemon={character}
                    nameAs="h3"
                    chip={<CoveoChip capability="pokedex-index" />}
                    cta={
                      <Link
                        to={pokemonPath(character.characterName)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Full Pokédex entry <ArrowRight className="h-4 w-4" />
                      </Link>
                    }
                  />
                </div>
                <div className="flex min-w-0 flex-col lg:col-span-2">
                  <div className="lg:sticky lg:top-6">
                    <AskPokedex
                      characterName={character.characterName}
                      subtitle={`Ask about ${character.characterName} — the Pokémon behind this card.`}
                      className="h-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-12">
          <ProductRecommendations
            productId={product.ec_product_id ?? product.permanentid}
            slotId={import.meta.env.VITE_COVEO_PDP_RECOMMENDATIONS_SLOT_ID}
            fallbackHeadline="More from this set"
            expectedSetName={setName}
            onProductsLoaded={setPrimaryRecIds}
          />
          <ProductRecommendations
            productId={product.ec_product_id ?? product.permanentid}
            slotId={import.meta.env.VITE_COVEO_PDP_BOUGHT_TOGETHER_SLOT_ID}
            fallbackHeadline="Frequently bought together"
            excludeIds={primaryRecIds}
            personaAware
          />
        </div>
      </div>

      {/* Declares its own height to `--fixed-bottom-bar` so anything else pinned to the bottom of
          the viewport can clear it instead of landing on top -- the floating Card Consultant dock
          used to be the consumer at 375px; the var is set on <html> (not this page's tree) and
          cleared on unmount so it can't leak into a route that has no bar, ready for whatever pins
          itself to the bottom next. `ref` measures rather than hardcodes, so padding or type-scale
          changes to the bar can't silently desync the offset. */}
      <div ref={mobileBarRef} className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-card p-4 sm:hidden">
        <div className="shrink-0">
          {promoPrice !== undefined && price !== undefined && promoPrice < price ? (
            <PriceFormat_Sale
              originalPrice={price}
              salePrice={promoPrice}
              className="items-baseline gap-1.5"
              classNameOriginalPrice="text-xs"
              classNameSalePrice="text-lg font-bold text-primary"
            />
          ) : price !== undefined ? (
            <PriceFormat_Basic value={price} className="text-lg font-bold text-foreground" />
          ) : null}
        </div>
        {addToCartControl('default')}
      </div>
    </>
  );
}
