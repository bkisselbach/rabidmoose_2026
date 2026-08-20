import { raritySlot } from '@/lib/cardFields';
import { rarityLabel } from '@/lib/rarityLabel';

// ONE assembly for a card's identity line, shared by the grid tile and the list row.
//
// card-system-plan.md §1c.7 and the remainder of Phase 5. The two surfaces each hand-rolled their
// own array from the same fields -- the tile inline, the row via `metaParts` in useProductCardData
// -- which is two places to change whenever the line changes, and they had already drifted: when
// the printing designation was added to the tile (2026-08-17), the row silently did not get it.
//
// THE DIFFERENCES ARE OPTIONS, NOT SEPARATE CODE. These two lines legitimately differ, and the
// point of this module is that the differences are now declared and reviewable in one place
// instead of being implied by two hand-built arrays:
//
//   tile  #12 · ULTRA · EX            setForm 'none' (a set LINE renders under the art),
//                                     rarity shortened (136px at the PLP's lg tile), no set total
//   row   TEAM ROCKET · #21 · RARE · DARK
//                                     setForm 'name' (the row has no separate set line),
//                                     rarity in full (the row is full-width; abbreviating there
//                                     would be discarding information to solve a problem it
//                                     does not have)

export interface CardIdentityInput {
  setName?: string;
  setCode?: string;
  cardNumber?: string;
  /** `string | number` because the catalog field arrives as a number while `cardNumber` beside it
   *  is a string -- printing numbers are not always numeric ("SV107", "TG12"), the set total always
   *  is. Both are only ever interpolated, so the union costs nothing here and saves every caller a
   *  cast. */
  totalInSet?: string | number;
  rarity?: string;
  cardCategory?: string;
  /** The printing designation (`ex`, `GX`, `VMAX`, `Dark`) -- see `cardVariantToken`. Callers pass
   *  it only when the card's own name is NOT rendering, since otherwise the name already says it. */
  variantToken?: string;
}

export interface CardIdentityOptions {
  /** How the set appears, if at all.
   *  - `'none'`  -- the surface renders a set line of its own (the tile).
   *  - `'name'`  -- full set name (the row, which has no set line and has the width).
   *  - `'code'`  -- short code, the tile's fallback when a product has no set name to render below.
   */
  setForm: 'none' | 'name' | 'code';
  /** Abbreviate the long rarity values (`Special illustration rare` -> `SIR`). On where width is
   *  scarce, off where it is not. */
  shortenRarity: boolean;
  /** `#12/113` rather than `#12`. The tile dropped the total to make room for the designation; the
   *  row never showed it. */
  includeTotal: boolean;
}

/** The identity segments, in canonical order: set · number · rarity · printing.
 *
 *  Order matches `product-card-plan.md` §1's definition of the identity line ("which printing?" =
 *  set + card number + rarity) with the designation appended, and it matches the PDP breadcrumb.
 *  Empty segments drop out, so a Trainer card with no rarity produces no dangling separator. */
export function cardIdentityParts(input: CardIdentityInput, options: CardIdentityOptions): string[] {
  const set =
    options.setForm === 'none'
      ? undefined
      : options.setForm === 'code'
        ? (input.setCode ?? input.setName)
        : input.setName;

  const number = input.cardNumber
    ? options.includeTotal && input.totalInSet
      ? `#${input.cardNumber}/${input.totalInSet}`
      : `#${input.cardNumber}`
    : undefined;

  // `raritySlot`, not `rarity`: Trainer and Energy cards carry a category instead of a rarity, and
  // it fills the same slot rather than leaving a gap. Every card surface in the app agrees on this.
  const slot = raritySlot(input.rarity, input.cardCategory);
  const rarity = options.shortenRarity ? rarityLabel(slot) : slot;

  return [set, number, rarity, input.variantToken].filter(Boolean) as string[];
}
