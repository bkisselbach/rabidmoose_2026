// The card system's feature vocabulary and its per-surface presets.
//
// Phase 1 of presentation/card-system-plan.md. The problem it solves is recorded in that doc's
// §1c: seven `<ProductCard>` call sites, five of which passed nothing, and three separate
// implementations of "a product card" that had drifted apart in seven concrete ways. The fix is
// not more props -- props are how they drifted -- it is that ONE FILE answers "what does every
// surface look like", and a new look has to be a named, deliberate act rather than an inline tweak
// nobody else sees (§6.1's pick: presets for features, props only for genuinely per-item data).
//
// WHAT IS A FEATURE AND WHAT IS A PROP. A feature varies per SURFACE (does the species gallery show
// HP?) and lives here. A prop varies per CARD (this tile's rank number, this tile's extra ring
// class) and stays on the component. `rank` is the clearest case: whether a rail is ranked is a
// surface fact, but *which* number is a card fact, so the number stays a prop and the preset does
// not mention it.
//
// DRIFT FROM THE PLAN, recorded rather than silently reconciled. §3b sketched this interface before
// the 2026-08-17 label restyle, and two of its entries no longer describe anything:
//   - `rarityBadge` is gone. Rarity is TEXT in the identity strip now; a chip means a merchandiser
//     decided something, and rarity is a catalog field.
//   - `name` is not a flag. The product name renders exactly when the Pokedex line does NOT -- one
//     title slot with two possible occupants -- so a flag could only ever disagree with itself.
// `priceRow` / `priceOnButton` are not flags either, as of §6.5 (decided 2026-08-17): there is ONE
// price element per card and it is the Add button, on every surface. A `priceRow` flag briefly
// existed and was deleted once the answer was the same at every call site -- see the note on `TILE`
// below, and ProductCard's `buyPrice`.

/** The three card shapes. Different DOM, not the same DOM with pieces hidden -- a row puts the art
 *  beside the text and a tile puts it above, which no boolean can express. Only `tile` is
 *  implemented today; `row` (ProductListItem) and `mini` (the typeahead tile) join in later phases
 *  of the plan, and are named here so the type is honest about the target rather than being
 *  widened later. */
export type CardVariant = 'tile' | 'row' | 'mini';

/** The features every card shape has, whatever its layout -- the five that survive the trip from a
 *  190px tile to a 64px list thumbnail. Split out of the flat `CardFeatures` in Phase 3 (§6.3): the
 *  row and the tile turned out to share exactly these and differ on six others, so one interface
 *  covering both could only be a union of things half of it does not support. */
interface BaseCardFeatures {
  /** The Featured pin overlay. Only ever visible on a query-pinned result anyway; the flag governs
   *  whether the surface participates at all. */
  featuredBadge: boolean;
  /** Energy-type circles on the artwork. */
  typeIcons: boolean;
  /** Merchandiser badge row (Coveo Product Enrichment). */
  merchBadges: boolean;
  /** Species crosslink. When it renders it takes the title slot from the product name. */
  pokedexLink: boolean;
  /** Add to cart. */
  addToCart: boolean;
  /** A second, separate "Add to deck" action (deckStorage.ts) alongside Add to cart. OFF
   *  everywhere by default -- card-system-plan.md already recorded why a second inert-looking
   *  button on every card in the app is a worse placeholder than none (the mockup's "Compare"
   *  button was removed for exactly this reason). Scoped on for `deck-check` only
   *  (deck-builder-advisor-plan.md Phase B follow-up, by direct user decision 2026-08-18): a
   *  shopper diagnosing a gap on /advisor and looking at a real counter tile is the one place
   *  "add this to the thing you're fixing" is the obvious next action, not a guess at a feature
   *  nobody asked for. */
  addToDeck: boolean;
}

/** What a TILE can turn on or off, on top of the shared base.
 *
 *  Deliberately does NOT enumerate every div: a flag with one value at every call site is
 *  speculative generality that still has to be maintained. */
export interface TileFeatures extends BaseCardFeatures {
  /** Identity strip above the art: number · rarity · printing, plus the rank slot. */
  identityStrip: boolean;
  /** Holofoil sheen. Still gated per-card on `isHoloRarity` underneath -- this only decides whether
   *  the surface is eligible, never whether a given card shines. */
  foil: boolean;
  /** Set name (+ release year). */
  setLine: boolean;
  /** HP, as text alongside the set name. */
  hp: boolean;
}

/** What a ROW can turn on or off. A short list, and that is the finding rather than an oversight:
 *  the list row shares the base five and has exactly one thing of its own.
 *
 *  NOTE WHAT IS ABSENT, because absence is the point (§6.3). `foil`, `identityStrip`, `setLine` and
 *  `hp` are not `false` here -- they do not EXIST, so asking a row for one is a compile error at
 *  the call site rather than a flag that gets silently dropped. Silently dropping was the row's
 *  actual defect before this split: it accepted props and ignored them.
 *
 *  `foil` is the clearest case for absence over `false`. The row's thumbnail is 64-80px; a
 *  pointer-tracked sheen there is meaningless, so "you cannot ask for this" is more useful than
 *  "you asked and got nothing". */
export interface RowFeatures extends BaseCardFeatures {
  /** The identity eyebrow -- `set · #number · rarity · printing`. The row's own treatment, since it
   *  has no separate strip or set line to split those across. Assembled by the SAME
   *  `lib/cardIdentity.ts` the tile uses; only the options differ. */
  metaLine: boolean;
  /** The description snippet, `sm` and up. Row-only -- a tile has no room for prose. */
  description: boolean;
}

/** The canonical tile. Every preset below is expressed as a delta from this, so a reader can see
 *  at a glance what each surface actually changes rather than diffing ten booleans. */
const TILE: TileFeatures = {
  identityStrip: true,
  featuredBadge: true,
  typeIcons: true,
  foil: true,
  merchBadges: true,
  setLine: true,
  hp: false,
  pokedexLink: true,
  addToCart: true,
  addToDeck: false,
};

/** Every surface that renders a card, and the one thing each changes.
 *
 *  These reproduce 2026-08-17's rendering EXACTLY -- Phase 1 is a refactor, not a redesign, and the
 *  `cards:audit` script plus a screenshot pass are what hold that claim up. `recommendation` is
 *  identical to `plp-grid` today and is still its own entry on purpose: the three recommendation
 *  rails are a surface whose look may reasonably diverge, and giving them a name now means that
 *  divergence is one edit here rather than a hunt through three components. */
export const TILE_PRESETS = {
  /** /search grid. */
  'plp-grid': TILE,
  /** Home rails (Trending, Recently Sold, Where you left off). */
  rail: TILE,
  /** PDP rails, cart drawer, zero-results panel. */
  recommendation: TILE,
  /** The species page's card gallery -- the one surface that shows HP, because its old bespoke
   *  tile did and losing it when that tile was unified onto this component would have been a quiet
   *  regression. */
  'species-gallery': { ...TILE, hp: true },
  /** The Card Consultant's inline product tiles on /search.
   *
   *  Added during Phase 2, and worth recording why: this surface did not exist when Phase 1 was
   *  written a few hours earlier. It arrived carrying an inline `showPrice={false}` -- a new
   *  surface configuring itself with a loose boolean, which is precisely the drift §1c catalogues
   *  and precisely what this table exists to stop.
   *
   *  Four of the five entries are now the bare `TILE`, because §6.5 removed the one thing that
   *  distinguished them. They stay as separate named entries anyway: "these happen to match" is a
   *  fact about today, and collapsing them would mean a future divergence has to re-derive which
   *  surfaces exist instead of editing one line here. */
  consultant: TILE,
  /** /advisor's suggested-pickup tiles (deck-builder-advisor-plan.md Phase B) -- raw
   *  commerce-search results resolved from a deck gap, rendered with `inertInteractiveProduct`
   *  since there is no controller behind them. Only surface with `addToDeck` on -- see that
   *  field's own comment for why it stays off everywhere else. */
  'deck-check': { ...TILE, addToDeck: true },
} satisfies Record<string, TileFeatures>;

/** Row surfaces. One today -- `/search`'s list view is the only thing that renders a row.
 *
 *  A one-entry table with nothing varying is still worth having, because the value here is not
 *  configuration, it is the TYPE: `RowPreset` and `TilePreset` are different types over different
 *  feature sets, so handing `plp-grid` to a list row does not compile. That is §6.3's pick, and it
 *  is the row's real defect -- not missing features, but accepting flags it then ignores. */
export const ROW_PRESETS = {
  /** /search list view. */
  'plp-list': {
    featuredBadge: true,
    typeIcons: true,
    merchBadges: true,
    pokedexLink: true,
    addToCart: true,
    addToDeck: false,
    metaLine: true,
    description: true,
  },
} satisfies Record<string, RowFeatures>;

export type TilePreset = keyof typeof TILE_PRESETS;
export type RowPreset = keyof typeof ROW_PRESETS;

// The Phase 1 bridge (`featuresFromLegacyProps`) lived here and is gone: Phase 2 migrated all eight
// call sites onto presets and deleted `showPrice` / `showPokedexLink` / `showHp` from ProductCard,
// so a preset is now the only way to configure a card and there is nothing left to translate.
