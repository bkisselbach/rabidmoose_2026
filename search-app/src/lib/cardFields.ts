// Shared reader for the catalog's custom `additionalFields` -- ProductCard/ProductListItem (via
// useProductCardData) and the PDP both need the same rarity/set/number/HP/type/category values off
// the same Commerce API shape; this is the one place that knows the field names and their quirks
// (cardtype and cardtypes are both configured multi-value in Coveo despite carrying single-value
// and semicolon-joined data respectively).
export interface CardFields {
  rarity?: string;
  setName?: string;
  cardNumber?: string;
  hp?: number;
  /** 'Pokemon' | 'Trainer' | 'Energy' */
  cardCategory?: string;
  /** TCG energy types (Fire, Water, ...) -- empty for Trainer/Energy cards. */
  cardTypes: string[];
  /** Real TCGdex/tcgplayer price-range fields, same printing bucket as ec_price. Only set when
   *  they genuinely differ from ec_price (see catalog-scraper/src/catalogItem.ts) -- so a missing
   *  value here means the source data only ever had one real figure, not that something failed. */
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
  directPrice?: number;
  /** Card-layout rework (presentation/rabidmoose-visual-refresh-plan.md §3b) -- all real, all
   *  optional: absent until the catalog is re-pushed with the new fields (catalogItem.ts), and
   *  setYear/setCode specifically require the source set to have resolved on a rebuild (fetched
   *  once per set, not per card, so a transient failure there leaves them off individual cards
   *  rather than failing the push). */
  totalInSet?: number;
  illustrator?: string;
  setYear?: number;
  setCode?: string;
  /** Graded-market enrichment (flavor-round-plan.md item 21): real eBay sold-listing medians via
   *  PokemonPriceTracker, pushed offline for a hand-picked demo subset only — absent on every
   *  other card, and the UI renders nothing rather than estimating. The counts and as-of date are
   *  part of the datum (a PSA 10 median off one stale sale must be able to say so). */
  psa10Price?: number;
  psa9Price?: number;
  psa10Count?: number;
  psa9Count?: number;
  gradedAsOf?: string;
  /** Real per-printing TCGdex prices (printing-selector-plan.md, item 25) -- e.g. a WOTC-era card
   *  priced separately as 1st Edition vs Unlimited. Only present when the card has 2+ real
   *  printings (printing-enrich.cjs's own honesty guard); index 0 always matches whichever
   *  printing `ec_price` was already built from, so no separate "which one is default" field is
   *  needed. Display-only by design -- see the PDP block's own comment for why it never touches
   *  cart/price, the same "we sell the raw card" line the Graded Market panel draws. */
  printingOptions?: PrintingOption[];
}

export interface PrintingOption {
  /** The raw TCGdex key, e.g. "1st-edition-holofoil" -- kept for the React key/identity, not for display. */
  key: string;
  label: string;
  marketPrice: number;
}

// The full vocabulary of TCGdex printing keys observed live against this catalog (2026-08-18) --
// WOTC-era vintage sets carry the non-holo `1st-edition`/`unlimited` pair too, not just the
// `-holofoil` suffixed ones. Anything unobserved falls back to a title-cased raw key rather than
// silently dropping a real printing the vocabulary hasn't seen yet.
const PRINTING_LABELS: Record<string, string> = {
  normal: 'Normal',
  holofoil: 'Holofoil',
  // Real live key is kebab-case ("reverse-holofoil"), not catalogItem.ts's guessed camelCase --
  // confirmed 2026-08-18 (printing-enrich.cjs's own comment has the full story). The fallback
  // below would title-case either spelling correctly regardless, but this is the real one.
  'reverse-holofoil': 'Reverse Holofoil',
  '1st-edition': '1st Edition',
  '1st-edition-holofoil': '1st Edition Holofoil',
  unlimited: 'Unlimited',
  'unlimited-holofoil': 'Unlimited Holofoil',
};

function printingLabel(key: string): string {
  return (
    PRINTING_LABELS[key] ??
    key
      .split(/[-\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}

/** Parses `cardprintingoptions` (a genuine multi-value string field, NOT semicolon-joined -- each
 *  array entry off the wire is already one "<printingKey>|<marketPrice>" pair). Malformed entries
 *  are dropped rather than guessed at. */
export function parsePrintingOptions(raw: unknown): PrintingOption[] | undefined {
  const values = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const options = (values as string[])
    .map((entry): PrintingOption | undefined => {
      const [key, priceStr] = String(entry).split('|');
      const marketPrice = Number(priceStr);
      return key && Number.isFinite(marketPrice) ? { key, label: printingLabel(key), marketPrice } : undefined;
    })
    .filter((o): o is PrintingOption => o !== undefined);
  return options.length >= 2 ? options : undefined;
}

export function getCardFields(additionalFields: Record<string, unknown> | undefined): CardFields {
  const cardCategoryRaw = additionalFields?.cardtype as string[] | string | undefined;
  const cardCategory = Array.isArray(cardCategoryRaw) ? cardCategoryRaw[0] : cardCategoryRaw;
  const cardTypesRaw = additionalFields?.cardtypes as string[] | string | undefined;
  const cardTypes = (Array.isArray(cardTypesRaw) ? cardTypesRaw : cardTypesRaw ? [cardTypesRaw] : []).flatMap((t) =>
    t.split(';')
  );
  return {
    rarity: additionalFields?.cardrarity as string | undefined,
    setName: additionalFields?.cardsetname as string | undefined,
    cardNumber: additionalFields?.cardnumber as string | undefined,
    hp: additionalFields?.cardhp as number | undefined,
    cardCategory,
    cardTypes,
    lowPrice: additionalFields?.cardlowprice as number | undefined,
    midPrice: additionalFields?.cardmidprice as number | undefined,
    highPrice: additionalFields?.cardhighprice as number | undefined,
    directPrice: additionalFields?.carddirectprice as number | undefined,
    totalInSet: additionalFields?.cardtotalinset as number | undefined,
    illustrator: additionalFields?.cardillustrator as string | undefined,
    setYear: additionalFields?.cardsetyear as number | undefined,
    setCode: additionalFields?.cardsetcode as string | undefined,
    // `?? undefined`, not a bare cast: the commerce API returns NULL (not absence) for every
    // config-declared additionalField a document doesn't carry, so once cardpsa* joined the
    // config, every card in the catalog started carrying `cardpsa10price: null` -- and a
    // `!== undefined` render gate opened on all of them (caught live by item 21's verification:
    // the panel appeared on a never-enriched card). The older fields never hit this because their
    // consumers all guard with `> 0`-style value checks rather than presence checks.
    psa10Price: (additionalFields?.cardpsa10price ?? undefined) as number | undefined,
    psa9Price: (additionalFields?.cardpsa9price ?? undefined) as number | undefined,
    psa10Count: (additionalFields?.cardpsa10count ?? undefined) as number | undefined,
    psa9Count: (additionalFields?.cardpsa9count ?? undefined) as number | undefined,
    gradedAsOf: (additionalFields?.cardgradedasof ?? undefined) as string | undefined,
    // `?? undefined` again, same reason as the psa* fields directly above: a config-declared
    // multi-value field a document doesn't carry comes back as an explicit `null`, not absence.
    printingOptions: parsePrintingOptions(additionalFields?.cardprintingoptions ?? undefined),
  };
}

// Last-resort identity parser for surfaces whose products arrive WITHOUT additionalFields.
//
// Why it has to exist: `additionalFields` is opt-in per commerce configuration (README §1.7), and
// the API exposes exactly two of those -- `configurations/search/global` and
// `configurations/listings/global`. There is no `configurations/recommendations/*` endpoint (probed
// 2026-08-14: 404 INVALID_URI on every spelling), so every Recommendations-slot product comes back
// with `additionalFields: {}` no matter what the other two configs say. That's what made the home
// trending rail's cards read differently from the same component's cards on /search: no meta line,
// and the full catalog name instead of the base one.
//
// The catalog bakes the same identity into `ec_name` as "Base — Set #Number" ("Charizard ex — 151
// #199"), so the set and number are recoverable from data the rail already has, with no extra
// request. Strictly a fallback: real additionalFields always win, and anything that doesn't match
// the pattern yields nothing rather than a guess. Rarity and the energy types are genuinely absent
// from those responses and are NOT invented here -- a rec card still shows no type chips or accent.
export function cardIdentityFromName(ecName: string | undefined): { setName?: string; cardNumber?: string } {
  const dashIndex = ecName?.indexOf(' — ') ?? -1;
  if (!ecName || dashIndex <= 0) return {};
  const match = /^(.*?)\s+#(\S+)$/.exec(ecName.slice(dashIndex + 3).trim());
  return match ? { setName: match[1], cardNumber: match[2] } : {};
}

// A card identity line's rarity slot: the rarity if the card has one, else the category --
// Trainer/Energy cards don't carry a rarity-shaped classification the way Pokemon cards do, so the
// category fills that slot instead of leaving it blank.
export function raritySlot(rarity: string | undefined, cardCategory: string | undefined): string | undefined {
  return rarity ?? (cardCategory && cardCategory.toLowerCase() !== 'pokemon' ? cardCategory : undefined);
}

// Catalog names double the identity line ("Pikachu — Jungle #60" next to "Jungle · #60 · ..."), so
// card tiles/rows show just the base name when the meta line already carries set/number -- the
// suffix is only stripped when that data exists, so no information is lost on sparse products.
// Extracted out of useProductCardData (its only caller until the /search Trending pills needed the
// same derivation for Recommendations-slot products) so there is exactly one copy of this slice.
export function cardDisplayName(
  ecName: string | undefined,
  setName: string | undefined,
  cardNumber: string | undefined
): string | undefined {
  const dashIndex = ecName?.indexOf(' — ') ?? -1;
  return ecName && dashIndex > 0 && (setName || cardNumber) ? ecName.slice(0, dashIndex) : ecName;
}

/** The printing designation a card name carries beyond the species it depicts -- `ex`, `GX`,
 *  `VMAX`, `Dark`, `M …EX` -- or undefined when the name is just the species.
 *
 *  This exists because the tile stopped rendering the product name (2026-08-17): the Pokedex line
 *  took that slot, which is right for `Slugma` over `POKEDEX: SLUGMA` and lossy for `Charizard ex`.
 *  Measured across four queries before building anything: of 88 cards with a species link, 48 had
 *  nothing to lose and **40 lost a real designation** -- `ex`, `EX`, `GX`, `VMAX`, `Dark`, `M EX` --
 *  with none of it recoverable anywhere else on the card. On a marketplace that suffix IS the
 *  product: a Charizard ex is a different card at a different price from a Charizard.
 *
 *  Derived by subtraction rather than matched against a list of known suffixes, deliberately. The
 *  TCG invents new ones constantly (V, VMAX, VSTAR, ex, EX, GX, LV.X, BREAK, Prime, δ), and a list
 *  would silently omit whichever one shipped last; subtraction is right by construction for any of
 *  them. It also handles the cases a suffix list cannot: `Dark Charizard` is a PREFIX, and
 *  `M Charizard EX` wraps the species on both sides.
 *
 *  Only the species name is removed, so a card whose name does not contain it at all is left alone
 *  -- that means the lookup mis-resolved, and the safe answer is to claim nothing. */
export function cardVariantToken(
  displayName: string | undefined,
  speciesName: string | undefined
): string | undefined {
  if (!displayName || !speciesName) return undefined;
  const stripped = displayName.replace(new RegExp(escapeRegExp(speciesName), 'i'), ' ');
  // Unchanged means the species name never appeared -- do not guess.
  if (stripped === displayName) return undefined;
  const token = stripped.replace(/\s+/g, ' ').trim();
  return token || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
