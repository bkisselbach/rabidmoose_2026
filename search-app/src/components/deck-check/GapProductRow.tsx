import { CompactCardTile, fromProduct } from '@/components/deck-check/CompactCardTile';
import { CARD_BASIS } from '@/components/home/HomeCardRail';
import { RailArrow } from '@/components/RailArrows';
import { useScrollRail } from '@/lib/useScrollRail';
import { dealInProps } from '@/lib/dealIn';
import type { ResolvedGap } from '@/lib/useGapSuggestions';

// One gap's worth of suggestions. Purely presentational -- resolution lives in useGapSuggestions,
// so the weakness panel and the evolution block render identical rows from identically-resolved
// data rather than each growing its own fetch.
//
// A RAIL OF THE ADVISOR'S OWN TILE (2026-08-19, across three direct requests: same size as the home
// page's Trending Now, "use the width not height for those two lists. side scroll them like
// trending now", and finally "i want the same on the 'to play these' and 'Suggested pickups' cards
// list on the advisor page").
//
// TWO THINGS CHANGED, IN THAT ORDER. The layout was a `grid-cols-2 sm:grid-cols-4` that sized tiles
// by FRACTION, so the same card came out smaller here than on the home page or the PLP, and spent
// HEIGHT as the column narrowed -- four tiles became two rows of two, once per gap row. It is now a
// rail: fixed-size cards (`CARD_BASIS`, HomeCardRail's own four widths, exported so a surface can
// match the rail without re-measuring it), always exactly one card tall however narrow the column
// gets, with what does not fit reached by scrolling sideways. Same mechanics as the home rails from
// the same two pieces (`useScrollRail` + `RailArrow`) rather than a second implementation: native
// swipe on touch, desktop arrows that hide themselves when everything already fits, and a
// mask-image edge fade so a half-visible trailing card reads as "there is more" and not as a clip.
//
// Then the CARD itself. These rendered the full marketplace `ProductCard` under the `deck-check`
// preset -- merch badges, set line, Add to cart, and a second Add-to-deck button -- while Set
// Collector's checklists a few hundred pixels up the same page showed the compact tile at the same
// width. Two cards, one page, same width, visibly different weight. Both surfaces now render
// `CompactCardTile`, which is why the per-tile `PickupTrade` cost line went with the Add button:
// the tile links to the card page, and the buying (and the trade it implies) happens there.

interface Props {
  gap: ResolvedGap;
}

export function GapProductRow({ gap }: Props) {
  const rail = useScrollRail(gap.products.length);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-foreground">{gap.label}</p>
      {/* The arrows overlay the rail's edges from this `relative` wrapper rather than taking their
          own flex column, which would cost ~80px of a panel that is already the narrower half of
          the page. `-left-2/-right-2` hangs each button into the surrounding padding -- inside the
          panel's own p-4, so nothing here can push the page into horizontal overflow. */}
      <div className="relative">
        <div
          ref={rail.railRef}
          onScroll={rail.onScroll}
          className="no-scrollbar flex snap-x gap-3 overflow-x-auto"
          style={{
            maskImage: `linear-gradient(to right, ${rail.atStart ? 'black 0' : 'transparent 0, black 32px'}, ${rail.atEnd ? 'black 100%' : 'black calc(100% - 32px), transparent 100%'})`,
            WebkitMaskImage: `linear-gradient(to right, ${rail.atStart ? 'black 0' : 'transparent 0, black 32px'}, ${rail.atEnd ? 'black 100%' : 'black calc(100% - 32px), transparent 100%'})`,
          }}
        >
          {gap.products.map((product, index) => (
            <div
              key={product.ec_product_id ?? product.permanentid}
              {...dealInProps(index, `min-w-0 shrink-0 snap-start ${CARD_BASIS}`)}
            >
              <CompactCardTile card={fromProduct(product)} />
            </div>
          ))}
        </div>
        <RailArrow rail={rail} direction={-1} label={gap.label} className="absolute -left-2 top-1/2 -translate-y-1/2" />
        <RailArrow rail={rail} direction={1} label={gap.label} className="absolute -right-2 top-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
}
