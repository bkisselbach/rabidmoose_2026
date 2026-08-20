import { ZoneEyebrow } from '@/components/zones';

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Same 5/7 aspect as ProductCard's own image stage -- a mismatched skeleton shape was
          itself part of the "flashy" swap: the card visibly resized the instant real content
          replaced it, on top of the content swap itself. */}
      <div className="skeleton aspect-[5/7] w-full" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-3 w-16 rounded-full" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({
  count = 4,
  className = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
}: {
  count?: number;
  /** Override so a denser grid (e.g. the PLP's smaller cards) doesn't shift under its own loading state. */
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** One skeleton facet card, matching FacetShell's own card chrome (rounded-lg border shadow-rest)
 *  so the PLP's first-load skeleton is the same shape as the real aside instead of a placeholder
 *  that gets replaced by a differently-sized column. Varying chip widths (not a uniform row) read
 *  less like a barcode and more like an actual set of facet values. */
function FacetCardSkeleton({ chipWidths }: { chipWidths: number[] }) {
  return (
    <div className="w-full rounded-lg border border-border bg-card px-3 py-2 shadow-rest">
      <div className="flex items-center gap-1.5 py-1">
        <div className="skeleton h-3 w-3 shrink-0 rounded-sm" />
        <div className="skeleton h-3 w-20 rounded-full" />
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1.5">
        {chipWidths.map((w, i) => (
          <div key={i} className="skeleton h-6 rounded-full" style={{ width: `${w}px` }} />
        ))}
      </div>
    </div>
  );
}

/** Stand-in for FacetGenerator's own `<nav>` while the commerce response that would populate it
 *  is still in flight -- same vertical stack, same card shapes, different chip widths per card so
 *  it doesn't read as one mechanically repeated block. */
export function FacetGeneratorSkeleton() {
  return (
    <nav className="flex flex-col gap-2.5" aria-hidden="true">
      <FacetCardSkeleton chipWidths={[64, 52, 70, 48]} />
      <FacetCardSkeleton chipWidths={[58, 66, 44]} />
      <FacetCardSkeleton chipWidths={[50, 74, 56, 62]} />
      <FacetCardSkeleton chipWidths={[68, 46]} />
    </nav>
  );
}

/** A row of pill-shaped placeholders, for the chip/pill strips this app uses in several places
 *  (the header's Shop mega-menu columns, the home page's "Shop by set" strip). Varying widths for
 *  the same reason FacetCardSkeleton varies them -- a row of identical pills reads as a barcode,
 *  not as a set of labels. The caller supplies the widths so a strip whose real values are long
 *  ("Neo Revelation") doesn't get stubby placeholders that visibly grow on load. */
export function ChipRowSkeleton({
  widths = [64, 52, 78, 46, 68, 56],
  className = 'flex flex-wrap gap-1.5',
  height = 'h-6',
}: {
  widths?: number[];
  className?: string;
  height?: string;
}) {
  return (
    <div className={className} aria-hidden="true">
      {widths.map((w, i) => (
        <div key={i} className={`skeleton ${height} rounded-full`} style={{ width: `${w}px` }} />
      ))}
    </div>
  );
}

/** Rows for a dropdown list that is still fetching its options (the hero typeahead's facet
 *  dropdowns). Same `px-3 py-1.5` rhythm as the real <Link> rows so the popover doesn't resize
 *  when they arrive -- which is the whole reason this replaced a single "Loading…" line: one line
 *  of text where eight rows are about to appear is itself a pop. */
export function MenuRowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
          <div className="skeleton h-4 w-4 shrink-0 rounded-full" />
          {/* Descending widths so the column reads as a list of differently-named values. */}
          <div className="skeleton h-3 flex-1 rounded-full" style={{ maxWidth: `${88 - i * 7}%` }} />
        </div>
      ))}
    </div>
  );
}

/** The shared card chrome the two detail-page skeletons below sit in -- `rounded-2xl border
 *  bg-card`, matching components/ui/card.tsx's own base so a skeleton panel is the same box as the
 *  panel that replaces it. */
const PANEL = 'overflow-hidden rounded-2xl border border-border bg-card';

/** A section heading placeholder shaped like ZoneSectionHeader (eyebrow line, then title + meta
 *  badge on one row), so the "Shop {species} cards" / "More from this set" headings don't appear
 *  a beat after the grid they label. */
function SectionHeadingSkeleton({ showEyebrow = true }: { showEyebrow?: boolean }) {
  return (
    <div>
      {showEyebrow && <div className="skeleton mb-1.5 h-3 w-32 rounded-full" />}
      {/* Mirrors SectionHeader exactly -- 8x8 icon tile, title, meta badge, and the bottom rule --
          because that rule is a hard visual line: without it the heading area shifted by 3px plus
          a border when the real header landed. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-x-2.5">
          <div className="skeleton h-8 w-8 shrink-0 rounded-md" />
          <div className="skeleton h-6 w-52 rounded" />
          <div className="skeleton h-5 w-28 rounded-full" />
        </div>
        <div className="skeleton h-5 w-5 shrink-0 rounded-full" />
      </div>
    </div>
  );
}

/** Page-shaped stand-in for CharacterDetailPage (`/pokedex/:name`) while its single Search API
 *  lookup is in flight. Mirrors that page's real skeleton-of-a-layout: the 3/2 knowledge grid
 *  (species summary card + Ask the Pokédex rail) over the card gallery.
 *
 *  This replaced a centred "Loading..." line, which meant the app's largest page went from one
 *  line of grey text to a full two-column layout plus a 40-card gallery in a single frame -- the
 *  single biggest pop in the app, and the odd one out next to /pokemon-news/:slug, which has had a
 *  page-shaped skeleton all along. */
export function PokemonDetailSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-5">
        <div className={`min-w-0 lg:col-span-3 ${PANEL}`}>
          {/* Header band: 64px portrait (PokedexPortrait size="sm"), dex/gen eyebrow, name. */}
          <div className="flex flex-row items-center gap-4 p-4 sm:p-5">
            <div className="skeleton h-16 w-16 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-3 w-24 rounded-full" />
              <div className="skeleton h-7 w-48 rounded" />
            </div>
          </div>
          <div className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
            {/* Flavor quote (one line), then the facts strip, then the stats/weakness split --
                measured off the settled card rather than guessed, which is what moved the facts
                from a 2-up grid to the 4-up row they actually render as. */}
            <div className="border-l-2 border-border pl-2.5">
              <div className="skeleton h-3 w-4/5 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[112, 88, 104, 128].map((w, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="skeleton h-2.5 w-14 rounded-full" />
                  <div className="skeleton h-3.5 rounded-full" style={{ maxWidth: '100%', width: `${w}px` }} />
                </div>
              ))}
            </div>
            <div className="h-px bg-border" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* BASE STATS: six labelled bars. The track is a real `bg-muted` rail with a shimmer
                  fill at varied lengths, so it reads as stats rather than six identical bars. */}
              <div className="space-y-2">
                <div className="skeleton h-2.5 w-20 rounded-full" />
                {[62, 68, 62, 84, 66, 78].map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="skeleton h-2.5 w-7 shrink-0 rounded-full" />
                    <div className="h-2 flex-1 rounded-full bg-muted">
                      <div className="skeleton h-2 rounded-full" style={{ width: `${w}%` }} />
                    </div>
                    <div className="skeleton h-2.5 w-6 shrink-0 rounded-full" />
                  </div>
                ))}
              </div>
              {/* WEAK AGAINST chips, the counter-cards link, then the evolution line's tiles. */}
              <div className="space-y-3">
                <div className="skeleton h-2.5 w-24 rounded-full" />
                <ChipRowSkeleton widths={[62, 74, 56, 70]} height="h-5" />
                <div className="skeleton h-3 w-44 rounded-full" />
                <div className="skeleton h-2.5 w-24 rounded-full" />
                <div className="flex items-end gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="skeleton h-14 w-14 rounded-md" />
                      <div className="skeleton h-2.5 w-14 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ask the Pokédex rail: tinted header band, the starter-question chips, and the ask row
            pinned to the bottom (`mt-auto`) exactly as the real card pins its composer -- without
            it the rail's lower half was empty and the input appeared out of nowhere. */}
        <div className={`flex min-w-0 flex-col lg:col-span-2 ${PANEL}`}>
          <div className="flex flex-row items-start justify-between gap-2 border-b border-coveo/25 bg-coveo/5 p-5 sm:p-6">
            <div className="skeleton h-6 w-44 rounded" />
            <div className="skeleton h-5 w-5 shrink-0 rounded-full" />
          </div>
          <div className="flex-1 p-4 sm:p-6">
            {/* Real starter questions are full sentences ("What is Charizard weak against?"), so
                these are sentence-width, not the short pills a facet row would use. */}
            <ChipRowSkeleton widths={[172, 196, 168, 188, 208]} />
          </div>
          <div className="mt-auto flex items-center gap-2 p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="skeleton h-10 flex-1 rounded-md" />
            <div className="skeleton h-10 w-20 shrink-0 rounded-md" />
          </div>
        </div>
      </div>

      <div>
        <SectionHeadingSkeleton showEyebrow={false} />
        <CardGridSkeleton count={5} />
      </div>
    </>
  );
}

/** The PDP's washed "From the Pokédex" band in its pending state -- ONE definition, rendered both
 *  by CardDetailSkeleton (product still loading) and by ProductDetailPage itself (product loaded,
 *  species lookup still in flight). It has to be one component, not two copies: hand-matching them
 *  was measurably wrong, and the two states render back to back, so any drift is a visible jump.
 *  Measured before this was shared: the band moved 796 -> 824 and shrank 204 -> 176 on the swap, a
 *  0.095 layout shift on its own -- most of the page's total.
 *
 *  The eyebrow strip renders the REAL ZoneEyebrow, not a placeholder for it: it's static copy that
 *  needs no data, so there is nothing to wait for and nothing that can resize. */
export function PokedexZoneBandCard() {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
      <div className="skeleton h-24 w-24 shrink-0 rounded-md" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-6 w-48 rounded" />
        <div className="skeleton h-3 w-32 rounded" />
      </div>
    </div>
  );
}

/** The band itself, wrapper and eyebrow included, for the earlier state where the PRODUCT hasn't
 *  loaded either. Same wrapper classes as the page's own band, and the same `PokedexZoneBandCard`
 *  inside it, so the whole block is stable from first paint through both lookups settling. */
export function PokedexZoneBandSkeleton() {
  return (
    <div className="scroll-mt-24 rounded-2xl bg-muted/40 p-5 sm:p-8">
      <div className="mb-4 flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
        <ZoneEyebrow zone="pokedex" className="mb-0" />
      </div>
      <PokedexZoneBandCard />
    </div>
  );
}

/** Page-shaped stand-in for ProductDetailPage (`/card/:id`) while its product lookup is in flight:
 *  the two-column buy layout (sticky card stage on the left, identity/price/add-to-cart on the
 *  right) over the tinted Pokédex zone that page already skeletons internally.
 *
 *  Worth the detail because that page was inconsistent WITH ITSELF before this: its species zone
 *  had a proper skeleton (see the `character === undefined` branch there) while the whole page
 *  above it was a centred "Loading..." line. */
export function CardDetailSkeleton() {
  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        {/* The card stage keeps its own `product-stage` padding and 5/7 ratio, so the artwork
            doesn't resize the column when it lands. */}
        <div className="mx-auto w-full max-w-md">
          <div className="product-stage flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-lg p-8">
            {/* `.skeleton-on-light`, not `.skeleton`: the stage is the app's one white surface, and
                the standard dark-navy shimmer inside it reads as a black slab, not a pending image. */}
            <div className="skeleton-on-light h-full w-full rounded-lg" />
          </div>
          <div className="skeleton mx-auto mt-3 h-3 w-40 rounded-full" />
        </div>

        {/* Buy column. Shaped against the settled page rather than invented: breadcrumb, H1, then
            ONE tall bordered panel carrying market price -> the four price tiles -> graded market ->
            add-to-cart -> the trust row, and the evolution line below it. An earlier draft here was
            a loose stack of bars with a small panel at the bottom, which had roughly the right
            total height but none of the right masses -- the real page's dominant element is that
            single panel, so a skeleton without it still read as a different page. */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="skeleton h-3 w-64 rounded-full" />
            <div className="skeleton h-9 w-56 rounded" />
          </div>

          <div className={`space-y-4 p-5 ${PANEL}`}>
            <div className="skeleton h-2.5 w-20 rounded-full" />
            <div className="flex items-center gap-3">
              <div className="skeleton h-9 w-44 rounded" />
              <div className="skeleton h-6 w-32 rounded-full" />
            </div>
            <div className="skeleton h-3 w-56 rounded-full" />
            {/* LOW / MID / HIGH / DIRECT, then RAW / PSA 9 / PSA 10 -- fixed tile heights, so the
                real numbers land inside boxes that are already the right size. */}
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="skeleton h-16 rounded-lg" />
              ))}
            </div>
            <div className="skeleton h-2.5 w-28 rounded-full" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-16 rounded-lg" />
              ))}
            </div>
            <div className="skeleton h-3 w-72 max-w-full rounded-full" />
            {/* h-12 is the real `size="lg"` button, so the trust row below doesn't shift. */}
            <div className="skeleton h-12 w-full rounded-md" />
            <div className="flex gap-6">
              {[104, 116, 96].map((w, i) => (
                <div key={i} className="skeleton h-3 rounded-full" style={{ width: `${w}px` }} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="skeleton h-2.5 w-28 rounded-full" />
            <div className="flex items-end gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="skeleton h-14 w-14 rounded-md" />
                  <div className="skeleton h-2.5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PokedexZoneBandSkeleton />

      <div>
        <SectionHeadingSkeleton />
        <CardGridSkeleton count={5} />
      </div>
    </div>
  );
}
