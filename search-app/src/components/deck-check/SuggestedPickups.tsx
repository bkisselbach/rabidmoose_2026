import { ShoppingBag } from 'lucide-react';
import { CardGridSkeleton } from '@/components/Skeleton';
import { CoveoChip } from '@/components/CoveoChip';
import { GapPanel } from '@/components/deck-check/GapPanel';
import { CARD_GRID_COLS } from '@/components/home/HomeCardRail';
import { useGapSuggestions, type Gap } from '@/lib/useGapSuggestions';

// Turns the Advisor's type-exposure gaps into buyable tiles instead of a click-through link. Each
// gap is its own labelled row of real, live products.
//
// SCOPE NARROWED (2026-08-18): evolution prerequisites used to be rows in here too, which put the
// sentence "Charizard evolves from Charmander" and the Charmander tiles in two different panels on
// opposite sides of the page -- the same information twice, with the affordance in one place and
// the explanation in the other. Prerequisites now render in their own panel beside this one, and
// this panel answers exactly one question: what do I buy about the types I fold to.
//
// LAYOUT LIVES IN GapPanel (2026-08-19). The two panels sit side by side and had drifted apart in
// header, intro, row spacing and footer, so the card rows started at different heights. Both now
// render through one shared shape; this file owns only the words and the rows.
//
// The rows are ANSWERS, not repairs, and the footer says so. Adding a card cannot lower another
// species' weakness count -- exposure counts YOUR species' weaknesses, so a pick that shares one
// even raises it. That used to be said twice, once per tile by a PickupTrade line under the card;
// the tiles are the Advisor's compact shape now (CompactCardTile) and the panel footer carries the
// point on its own.

interface Props {
  gaps: Gap[];
  /** Rendered as a Deck Advisor tab body: no header, no chrome, no chip of its own. */
  bare?: boolean;
}

export function SuggestedPickups({ gaps, bare = false }: Props) {
  const { resolved, isLoading } = useGapSuggestions(gaps);

  if (gaps.length === 0) return null;

  return (
    <GapPanel
      icon={bare ? undefined : ShoppingBag}
      title={bare ? undefined : "Suggested pickups"}
      bare={bare}
      chip={bare ? undefined : (
        <CoveoChip
          capability="deck-check"
          detailSuffix={`Each row re-runs the same query as its Advisor gap (${gaps.map((g) => g.query).join('; ')}) against the live catalog.`}
        />
      )}
      intro="Live catalog matches for the types this deck folds to — one row per exposure, ranked by the catalog's own relevance."
      rows={resolved}
      fallback={
        isLoading ? (
          // Same grid the resolved rows land in, so the skeleton reserves the real card size rather
          // than a narrower placeholder that jumps when the products arrive.
          <CardGridSkeleton count={4} className={`grid ${CARD_GRID_COLS} gap-3`} />
        ) : (
          <p className="text-xs text-muted-foreground">No live matches for your deck&apos;s gaps right now.</p>
        )
      }
      footer={
        <>
          These <span className="font-semibold">answer</span> the types you fold to — they don&apos;t erase the exposure
          above, which counts your own species&apos; weaknesses.
        </>
      }
    />
  );
}
