import type { SeedHolding } from '@/lib/deckStorage';

// Seeded holdings for the two named personas -- phase C of presentation/gap-check-plan.md.
//
// MOCK BY DECISION, NOT BY GAP. deckStorage.ts already records why the holdings list is local: this
// app tracks no completed orders, so there is no order history to derive a collection from, and the
// user chose to mock it rather than fake a Coveo capability. What is new here is that each holding
// now carries a `costBasis` and an `acquiredAt` as well. Those two are ALSO mock, and the UI must
// say so wherever it shows a gain or a loss -- the market price they are compared against is real
// and live, the purchase they are compared FROM is invented. That split is the whole honesty claim
// of the portfolio panel and it has to survive onto the screen.
//
// BUILT BY QUERY, THEN COMMITTED. The plan's rule (§5a): deriving this list live from a recipe
// would fit the "index-derived, not hand-authored" thesis, but it would also let the numbers move
// between a rehearsal and the room. So the list was generated against the catalog and the result
// committed, with the recipe recorded here.
//
// DANA'S RECIPE -- 69 holdings, ~$4.6k, chosen to make two different sentences true at once:
//   * Fossil: 58 of the 62 cards this marketplace stocks. FOUR short, and deliberately so -- three
//     of the four are commons totalling $1.12, the fourth is Dragonite at $184.86. That contrast
//     ("you are four cards away; three cost a dollar, the fourth costs a hundred and eighty-five")
//     is the beat, and it is the same top-heavy shape §2.1 found across whole sets, at a scale a
//     shopper can act on in one session.
//   * Base Set: 5 of 102. The opposite end -- the $1,040 wall, where the useful advice is the cheap
//     tail rather than the total.
//   * Team Rocket (4) and Neo Genesis (2): both carry real variant depth, so the printing
//     checklist has something to show. Base Set deliberately cannot do this -- ZERO of its cards
//     carry 2+ printings (§2.2), which is why the demo needs two sets.
//   Where a card has two real printings, Dana holds the CHEAPER one. That is what makes the variant
//   checklist say something instead of nothing: the collector who bought before the 1st-edition
//   premium ran away still has a gap, and it is a gap with a real price on it.
//
// MARCUS'S RECIPE -- 18 holdings. His original six competitive cards, plus 12 concentrated into
// Evolving Skies. Concentration is the point (§5a): six cards spread across six sets gives a
// completion panel reading ~0.5% on each, which is honest and useless. His lead analysis is still
// deck exposure; the completion panel is the secondary read, and 12 of 237 is a true and rather
// pointed line about what completing a modern set costs.
//
// The size tension is deliberate and worth stating: the user picked "~30 cards, one set left 3-5
// short". Those two cannot both hold -- the smallest 100%-stocked set in this catalog is Fossil at
// 62 cards, so being near-complete on ANY set means holding at least ~58 of them. The near-complete
// beat was the point of the choice, so it won, and the count followed.

/** Dana Whitfield -- vintage collector. See the recipe above. */
export const DANA_HOLDINGS: SeedHolding[] = [
  { productId: 'base1-1', quantity: 1, costBasis: 41.38, acquiredAt: '2020-10' },
  { productId: 'base1-2', quantity: 1, costBasis: 159.57, acquiredAt: '2019-04' },
  { productId: 'base1-3', quantity: 1, costBasis: 37.41, acquiredAt: '2020-08' },
  { productId: 'base1-4', quantity: 1, costBasis: 514.75, acquiredAt: '2024-01' },
  { productId: 'base1-15', quantity: 1, costBasis: 152.7, acquiredAt: '2024-12' },
  { productId: 'base3-1', quantity: 1, costBasis: 25.69, acquiredAt: '2020-02', printing: 'unlimited-holofoil' },
  { productId: 'base3-2', quantity: 1, costBasis: 50.99, acquiredAt: '2020-06', printing: 'unlimited-holofoil' },
  { productId: 'base3-3', quantity: 1, costBasis: 37.08, acquiredAt: '2023-05', printing: 'unlimited-holofoil' },
  { productId: 'base3-5', quantity: 1, costBasis: 160.29, acquiredAt: '2025-02', printing: 'unlimited-holofoil' },
  { productId: 'base3-6', quantity: 1, costBasis: 44.97, acquiredAt: '2020-12', printing: 'unlimited-holofoil' },
  { productId: 'base3-7', quantity: 1, costBasis: 26.71, acquiredAt: '2021-01', printing: 'unlimited-holofoil' },
  { productId: 'base3-8', quantity: 1, costBasis: 23.3, acquiredAt: '2025-04', printing: 'unlimited-holofoil' },
  { productId: 'base3-9', quantity: 1, costBasis: 34.75, acquiredAt: '2022-09', printing: 'unlimited-holofoil' },
  { productId: 'base3-10', quantity: 1, costBasis: 19.83, acquiredAt: '2025-05', printing: 'unlimited-holofoil' },
  { productId: 'base3-11', quantity: 1, costBasis: 16.96, acquiredAt: '2022-04', printing: 'unlimited-holofoil' },
  { productId: 'base3-12', quantity: 1, costBasis: 53.26, acquiredAt: '2022-02', printing: 'unlimited-holofoil' },
  { productId: 'base3-13', quantity: 1, costBasis: 9.06, acquiredAt: '2020-06', printing: 'unlimited-holofoil' },
  { productId: 'base3-14', quantity: 1, costBasis: 34.59, acquiredAt: '2019-06', printing: 'unlimited-holofoil' },
  { productId: 'base3-15', quantity: 1, costBasis: 25.39, acquiredAt: '2019-12', printing: 'unlimited-holofoil' },
  { productId: 'base3-16', quantity: 1, costBasis: 25.76, acquiredAt: '2022-06', printing: 'unlimited' },
  { productId: 'base3-17', quantity: 1, costBasis: 36.09, acquiredAt: '2021-09', printing: 'unlimited' },
  { productId: 'base3-18', quantity: 1, costBasis: 28.28, acquiredAt: '2023-09', printing: 'unlimited' },
  { productId: 'base3-19', quantity: 1, costBasis: 73.31, acquiredAt: '2020-09', printing: 'unlimited' },
  { productId: 'base3-20', quantity: 1, costBasis: 156.94, acquiredAt: '2024-03', printing: 'unlimited' },
  { productId: 'base3-21', quantity: 1, costBasis: 26.61, acquiredAt: '2022-03', printing: 'unlimited' },
  { productId: 'base3-22', quantity: 1, costBasis: 25.88, acquiredAt: '2019-11', printing: 'unlimited' },
  { productId: 'base3-23', quantity: 1, costBasis: 19.61, acquiredAt: '2023-11', printing: 'unlimited' },
  { productId: 'base3-24', quantity: 1, costBasis: 25.32, acquiredAt: '2022-01', printing: 'unlimited' },
  { productId: 'base3-25', quantity: 1, costBasis: 8.71, acquiredAt: '2025-02', printing: 'unlimited' },
  { productId: 'base3-26', quantity: 1, costBasis: 17.19, acquiredAt: '2025-04', printing: 'unlimited' },
  { productId: 'base3-27', quantity: 1, costBasis: 40.43, acquiredAt: '2025-01', printing: 'unlimited' },
  { productId: 'base3-28', quantity: 1, costBasis: 6.85, acquiredAt: '2019-11', printing: 'unlimited' },
  { productId: 'base3-29', quantity: 1, costBasis: 30.15, acquiredAt: '2023-06', printing: 'unlimited' },
  { productId: 'base3-30', quantity: 1, costBasis: 25.3, acquiredAt: '2023-06', printing: 'unlimited' },
  { productId: 'base3-31', quantity: 1, costBasis: 1.26, acquiredAt: '2023-03', printing: 'unlimited' },
  { productId: 'base3-32', quantity: 1, costBasis: 1.4, acquiredAt: '2020-01', printing: 'unlimited' },
  { productId: 'base3-33', quantity: 1, costBasis: 1.35, acquiredAt: '2024-07', printing: 'unlimited' },
  { productId: 'base3-34', quantity: 1, costBasis: 0.74, acquiredAt: '2024-05', printing: 'unlimited' },
  { productId: 'base3-35', quantity: 1, costBasis: 1.6, acquiredAt: '2021-02', printing: 'unlimited' },
  { productId: 'base3-36', quantity: 1, costBasis: 2.45, acquiredAt: '2020-06', printing: 'unlimited' },
  { productId: 'base3-37', quantity: 1, costBasis: 0.66, acquiredAt: '2019-12', printing: 'unlimited' },
  { productId: 'base3-38', quantity: 1, costBasis: 0.81, acquiredAt: '2019-12', printing: 'unlimited' },
  { productId: 'base3-39', quantity: 1, costBasis: 1.06, acquiredAt: '2019-06', printing: 'unlimited' },
  { productId: 'base3-40', quantity: 1, costBasis: 1.09, acquiredAt: '2020-04', printing: 'unlimited' },
  { productId: 'base3-41', quantity: 1, costBasis: 1.08, acquiredAt: '2022-07', printing: 'unlimited' },
  { productId: 'base3-42', quantity: 1, costBasis: 0.82, acquiredAt: '2025-04', printing: 'unlimited' },
  { productId: 'base3-43', quantity: 1, costBasis: 0.98, acquiredAt: '2022-08', printing: 'unlimited' },
  { productId: 'base3-44', quantity: 1, costBasis: 1.2, acquiredAt: '2023-04', printing: 'unlimited' },
  { productId: 'base3-45', quantity: 1, costBasis: 1.18, acquiredAt: '2025-09', printing: 'unlimited' },
  { productId: 'base3-46', quantity: 1, costBasis: 0.33, acquiredAt: '2025-06', printing: 'unlimited' },
  { productId: 'base3-47', quantity: 1, costBasis: 0.4, acquiredAt: '2025-05', printing: 'unlimited' },
  { productId: 'base3-48', quantity: 1, costBasis: 0.33, acquiredAt: '2019-03', printing: 'unlimited' },
  { productId: 'base3-49', quantity: 1, costBasis: 0.34, acquiredAt: '2024-04', printing: 'unlimited' },
  { productId: 'base3-50', quantity: 1, costBasis: 1.23, acquiredAt: '2019-08', printing: 'unlimited' },
  { productId: 'base3-52', quantity: 1, costBasis: 0.72, acquiredAt: '2020-06', printing: 'unlimited' },
  { productId: 'base3-53', quantity: 1, costBasis: 1.81, acquiredAt: '2025-04', printing: 'unlimited' },
  { productId: 'base3-54', quantity: 1, costBasis: 0.59, acquiredAt: '2019-05', printing: 'unlimited' },
  { productId: 'base3-55', quantity: 1, costBasis: 0.56, acquiredAt: '2024-04', printing: 'unlimited' },
  { productId: 'base3-56', quantity: 1, costBasis: 0.81, acquiredAt: '2022-11', printing: 'unlimited' },
  { productId: 'base3-58', quantity: 1, costBasis: 2.07, acquiredAt: '2023-08', printing: 'unlimited' },
  { productId: 'base3-59', quantity: 1, costBasis: 0.22, acquiredAt: '2020-10', printing: 'unlimited' },
  { productId: 'base3-60', quantity: 1, costBasis: 1.07, acquiredAt: '2021-06', printing: 'unlimited' },
  { productId: 'base3-61', quantity: 1, costBasis: 0.23, acquiredAt: '2024-12', printing: 'unlimited' },
  { productId: 'base5-3', quantity: 1, costBasis: 171.5, acquiredAt: '2022-04', printing: 'unlimited-holofoil' },
  { productId: 'base5-4', quantity: 1, costBasis: 267.06, acquiredAt: '2020-08', printing: 'unlimited-holofoil' },
  { productId: 'base5-5', quantity: 1, costBasis: 166.61, acquiredAt: '2024-12', printing: 'unlimited-holofoil' },
  { productId: 'base5-21', quantity: 1, costBasis: 163.76, acquiredAt: '2023-01', printing: 'unlimited' },
  { productId: 'neo1-5', quantity: 1, costBasis: 114.36, acquiredAt: '2021-07', printing: '1st-edition-holofoil' },
  { productId: 'neo1-9', quantity: 1, costBasis: 297.08, acquiredAt: '2025-08', printing: 'unlimited-holofoil' },
];

/** Marcus Hale -- competitive player. See the recipe above. */
export const MARCUS_HOLDINGS: SeedHolding[] = [
  { productId: 'swsh1-204', quantity: 1, costBasis: 15.9, acquiredAt: '2019-04' },
  { productId: 'swsh4-138', quantity: 1, costBasis: 16.04, acquiredAt: '2025-10' },
  { productId: 'swsh7-95', quantity: 1, costBasis: 21.3, acquiredAt: '2023-02' },
  { productId: 'swsh7-174', quantity: 1, costBasis: 14.81, acquiredAt: '2023-03' },
  { productId: 'sv01-213', quantity: 1, costBasis: 16.97, acquiredAt: '2022-04' },
  { productId: 'sv01-244', quantity: 1, costBasis: 19.53, acquiredAt: '2022-09' },
  { productId: 'swsh7-7', quantity: 1, costBasis: 1.63, acquiredAt: '2021-06' },
  { productId: 'swsh7-8', quantity: 1, costBasis: 7.7, acquiredAt: '2024-10' },
  { productId: 'swsh7-18', quantity: 1, costBasis: 8.35, acquiredAt: '2023-07' },
  { productId: 'swsh7-28', quantity: 1, costBasis: 1.59, acquiredAt: '2025-10' },
  { productId: 'swsh7-29', quantity: 1, costBasis: 5.47, acquiredAt: '2022-10' },
  { productId: 'swsh7-30', quantity: 1, costBasis: 10.8, acquiredAt: '2020-01' },
  { productId: 'swsh7-40', quantity: 1, costBasis: 1.89, acquiredAt: '2024-03' },
  { productId: 'swsh7-41', quantity: 1, costBasis: 6.22, acquiredAt: '2020-03' },
  { productId: 'swsh7-51', quantity: 1, costBasis: 6.88, acquiredAt: '2019-11' },
  { productId: 'swsh7-64', quantity: 1, costBasis: 2.84, acquiredAt: '2022-03' },
  { productId: 'swsh7-65', quantity: 1, costBasis: 11.12, acquiredAt: '2021-02' },
  { productId: 'swsh7-74', quantity: 1, costBasis: 4.65, acquiredAt: '2024-09' },
];
