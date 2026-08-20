import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Compass, MessageCircleQuestion } from 'lucide-react';
import { SearchBox } from '@/components/SearchBox';
import { CoveoChip } from '@/components/CoveoChip';
import { ZoneEyebrow } from '@/components/zones';
import { HOME_ROW_SPACE } from '@/components/home/rhythm';
import { useCatalogFacetValues, type CategoryEntry } from '@/components/ShopMegaMenu';
import { MenuRowsSkeleton } from '@/components/Skeleton';
import { productRecommendations, homeSearchBoxController, homeInstantProducts, recentQueriesList } from '@/homeControllers';
import { POPULAR_QUERIES } from '@/lib/localSuggestions';
import { useCountUp, useHomeCounts } from '@/lib/useHomeCounts';
import { fetchTopCards, fetchTopCardsByType, type TopCard } from '@/lib/topCards';
import { useConsultantEcho } from '@/lib/ConsultantEchoContext';
import { typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';
import { cardPath } from '@/lib/paths';
import { cn } from '@/lib/utils';

// An already-verified Card Consultant teaching phrase (see PLACEHOLDER_PHRASES in
// components/consultant/CardConsultant.tsx), reused rather than inventing new advisor copy --
// this app has no HP-threshold advisory parsing, so a phrase like "High HP" wouldn't be backed up.
const ASK_CHIP_QUERY = 'Beat Water types';

// The landing stage. Everything here is a real index read -- the counts and the flanking card
// scans -- because the cold open's whole claim is "everything moving on this page is a Coveo API
// response."
//
// Ordinary keyword search lives in the header pill, reachable from every route; this stage is the
// Card Consultant's, restored here as a real typeahead-backed SearchBox (the same component
// /search's own hero uses) alongside the advisor framing. The rule that keeps the split honest is
// editorial: the header pill never carries consultant framing, and this section never carries a
// generic "Search..." affordance.
//
// The plain keyword examples that used to sit here (`Base Set Charizard`, `rare holo`,
// `electric mouse`) are POPULAR_QUERIES (localSuggestions.ts), which the header box renders as its
// "Popular" rows on focus.
//
// CardConsultant's free-text composer doesn't render here by default -- ConsultantDock floats on
// every route including this one, so the advisor is one tap away. One Popular-row chip stays
// visually "ask"-tinted to carry that framing into the hero itself (ASK_CHIP_QUERY above).

/** The hero's decorative background: a flat violet fill (tuning on `.poke-hero-bg-layer` in
 *  index.css -- it holds the exact alpha the old gradient peaked at, so it IS the upper-left
 *  colour rather than a match to it). The hero carries no other texture; the site-wide pokeball
 *  still runs behind everything, so it reads as a calm plate cut out of a patterned page.
 *
 *  Two structural constraints of the hero, not of any one treatment:
 *  - This is its OWN absolutely-positioned layer, never a class on the hero box. The box also holds
 *    the search bar's typeahead dropdown, which must overflow past the box's bottom edge, so the
 *    rounded clip cannot live on any ancestor that dropdown depends on.
 *  - `border-radius: inherit` on the layer (see index.css) rather than a repeated `rounded-3xl`:
 *    the wrapper owns the radius once, so a future radius change can't leave a square corner
 *    poking out of a rounded card. */
function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-3xl"
    >
      <div className="poke-hero-bg-layer" />
    </div>
  );
}

// Cards only -- Pokedex art ships on white and clashed against the card photography's own shadows.
interface HeroMedia {
  key: string;
  name: string;
  image: string;
  href: string;
}

// One flanking card scan: real stock, tilted, lifting toward the pointer, linking to its PDP.
function FloatingCard({ media, className, baseRotate }: { media: HeroMedia; className: string; baseRotate: number }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  return (
    <Link
      to={media.href}
      className={className}
      onMouseEnter={() => setHovering(true)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -12, y: ((e.clientX - r.left) / r.width - 0.5) * 12 });
      }}
      onMouseLeave={() => {
        setHovering(false);
        setTilt({ x: 0, y: 0 });
      }}
      style={{
        transform: `perspective(900px) rotate(${baseRotate}deg) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        // Two speeds on purpose: while the pointer is on the card the transition is short so the
        // tilt tracks the hand instead of lagging behind it; on release it lengthens so the card
        // settles back in one glide rather than snapping flat.
        transition: hovering ? 'transform 120ms ease-out' : 'transform 500ms var(--ease-smooth)',
        willChange: 'transform',
      }}
    >
      <img
        src={media.image}
        alt={media.name}
        // Keyed on the image so a swap remounts and fades rather than hard-cutting in place.
        key={media.image}
        className="fade-in-panel w-full rounded-lg"
        style={{ filter: 'drop-shadow(0 18px 32px hsl(240 10% 8% / 0.22))' }}
      />
    </Link>
  );
}

/** Two overlapping scans, tilted opposite ways -- the left cluster reads top-left/bottom-right,
 *  the right cluster mirrors it (top-right/bottom-left) via `mirrored`. Renders nothing if the
 *  pool didn't have a card for this side; renders just the one card if the pool only had one. */
function CardCluster({ cards, mirrored }: { cards: HeroMedia[]; mirrored?: boolean }) {
  const [first, second] = cards;
  if (!first) return null;
  return (
    <div className="relative h-56 w-48 shrink-0 xl:h-64 xl:w-56">
      <FloatingCard
        media={first}
        baseRotate={mirrored ? 8 : -8}
        className={cn('pointer-events-auto absolute top-0 w-36 xl:w-44', mirrored ? 'right-0' : 'left-0')}
      />
      {second && (
        <FloatingCard
          media={second}
          baseRotate={mirrored ? -8 : 8}
          className={cn('pointer-events-auto absolute bottom-0 w-36 xl:w-44', mirrored ? 'left-0' : 'right-0')}
        />
      )}
    </div>
  );
}

/** Headline + subtext, rotating through the hero on a timer. `subtext` is a function of the two
 *  live counts (already `.toLocaleString()`-formatted) rather than a plain string, so every
 *  variant keeps the "this page is reading a real index" claim instead of only the one that
 *  happens to mention a number. */
const HERO_COPY: { headline: string; subtext: (cards: string, pokemon: string) => ReactNode }[] = [
  {
    headline: 'Find the card that beats them.',
    subtext: (cards) => (
      <>
        Every one of the <span className="font-semibold text-foreground tabular-nums">{cards}</span> cards in stock
        is priced live &mdash; tell us who you&apos;re up against and we&apos;ll find your counter.
      </>
    ),
  },
  {
    headline: 'Shop by matchup, not just by name.',
    subtext: (cards, pokemon) => (
      <>
        <span className="font-semibold text-foreground tabular-nums">{cards}</span> real cards and{' '}
        <span className="font-semibold text-foreground tabular-nums">{pokemon}</span> Pok&eacute;mon, indexed
        together &mdash; so a consultant, not a search bar, finds what beats what.
      </>
    ),
  },
  {
    headline: 'Stop guessing. Start winning.',
    subtext: (cards) => (
      <>
        <span className="font-semibold text-foreground tabular-nums">{cards}</span> cards in stock, priced live.
        Tell us your strategy &mdash; we&apos;ll build your counter.
      </>
    ),
  },
  {
    headline: 'Your next win is in here somewhere.',
    subtext: (cards, pokemon) => (
      <>
        <span className="font-semibold text-foreground tabular-nums">{cards}</span> cards,{' '}
        <span className="font-semibold text-foreground tabular-nums">{pokemon}</span> Pok&eacute;mon, real prices
        &mdash; matched to exactly what you&apos;re facing next.
      </>
    ),
  },
];

/** Rotates the hero copy across page LOADS, not while one is open -- a headline that changes out
 *  from under a shopper mid-read is a distraction, not a feature. `localStorage`, not `useState`
 *  alone: the NEXT load must pick up where this one left off. Sequential rather than random so a
 *  visitor refreshing a few times sees all four rather than the same one twice by chance.
 *
 *  Read and advance are deliberately two separate steps, not one function that does both. A
 *  `useState(() => { read; write; return })` initializer looks tempting but isn't pure, and
 *  React.StrictMode (main.tsx) double-invokes exactly that kind of initializer in dev -- confirmed
 *  live: it advanced the index by 2 per page load instead of 1, silently skipping a variant every
 *  refresh. `advanceHeroCopyIndex` runs from an effect instead, guarded by a MODULE-scope flag
 *  rather than a ref/state one: StrictMode's dev-only mount->unmount->remount rehearsal would reset
 *  a ref or state guard right along with the rest of the component, running the write again on the
 *  simulated remount -- the module flag survives that because it isn't part of the component's own
 *  state, and only resets on an actual fresh module evaluation. */
const HERO_COPY_STORAGE_KEY = 'hero-copy-index';
function readHeroCopyIndex(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const stored = Number(window.localStorage.getItem(HERO_COPY_STORAGE_KEY));
    return Number.isInteger(stored) ? ((stored % HERO_COPY.length) + HERO_COPY.length) % HERO_COPY.length : 0;
  } catch {
    return 0;
  }
}
let heroCopyAdvancedThisPageLoad = false;
function advanceHeroCopyIndex(current: number) {
  if (heroCopyAdvancedThisPageLoad) return;
  heroCopyAdvancedThisPageLoad = true;
  try {
    window.localStorage.setItem(HERO_COPY_STORAGE_KEY, String((current + 1) % HERO_COPY.length));
  } catch {
    // Private-browsing/quota denial -- next load just starts over at 0.
  }
}

/** A compact dropdown trigger + panel sized to live INSIDE the search input (SearchBox's
 *  `rightSlot`). Reads the same live catalog-wide facet data (`useCatalogFacetValues`) the toolbar
 *  and the /search sidebar do. Picking a value navigates to /search with that facet preset applied
 *  -- a picker, not a live filter on the hero itself. */
function HeroFilterDropdown({ facetId, label, showTypeIcon, entries }: { facetId: string; label: string; showTypeIcon: boolean; entries: CategoryEntry[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseDown={(e) => e.preventDefault()}
        aria-expanded={open}
        aria-label={`Filter by ${label}`}
        className="pressable flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-1 text-2xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          data-state="open"
          className="popover-content absolute right-0 z-20 mt-1.5 max-h-64 w-52 overflow-y-auto rounded-xl border border-border bg-card py-1.5 text-left"
        >
          {/* Skeleton rows on the same px-3 py-1.5 rhythm as the real <Link> rows below, so the
              popover opens at roughly its settled height instead of being one text line tall and
              then jumping to a full list under the cursor. */}
          {entries.length === 0 ? (
            <MenuRowsSkeleton count={7} />
          ) : (
            entries.map((entry) => {
              const color = showTypeIcon ? typeColor(entry.value) : undefined;
              const Icon = showTypeIcon ? typeIcon(entry.value) : undefined;
              return (
                <Link
                  key={`${facetId}-${entry.value}`}
                  to="/search"
                  state={{ presetFacet: { facetId: entry.facetId, value: entry.value } }}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                >
                  {Icon && color && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: color.bg }}>
                      <Icon className="h-2.5 w-2.5" style={{ color: color.text }} />
                    </span>
                  )}
                  <span className="flex-1 truncate">{entry.value}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground">{entry.count}</span>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Both dropdowns together, so ConsultantHero only has to pass one `rightSlot` node to SearchBox.
function HeroFilterDropdowns() {
  const types = useCatalogFacetValues('cardtypes', 20);
  const sets = useCatalogFacetValues('cardsetname', 20);
  return (
    <>
      <HeroFilterDropdown facetId="cardtypes" label="Type" showTypeIcon entries={types} />
      <HeroFilterDropdown facetId="cardsetname" label="Set" showTypeIcon={false} entries={sets} />
    </>
  );
}

export function ConsultantHero() {
  const navigate = useNavigate();
  const { cardTotal, pokemonTotal } = useHomeCounts();
  const cards = useCountUp(cardTotal);
  const pokemon = useCountUp(pokemonTotal);
  const [flanking, setFlanking] = useState<HeroMedia[]>([]);

  // Picked once, in the initializer, so it's stable for this mount's whole lifetime. See the block
  // above for why the read is pure here and the advance-for-next-time write happens separately.
  const [copyIndex] = useState(readHeroCopyIndex);
  useEffect(() => {
    advanceHeroCopyIndex(copyIndex);
  }, [copyIndex]);
  const activeCopy = HERO_COPY[copyIndex];

  // The flanking scans are MERCHANDISER-CONTROLLED, which is the point of this section rather
  // than a detail of it. Coveo has no banner/content CMS -- the "hero banner" pattern here is a
  // recommendation slot: these read the same Hub-configured trending slot the Trending row uses
  // (`productRecommendations`, already refreshed by HomePage), so pinning a card in the
  // Merchandising Hub shows it in the hero with no deploy.
  //
  // fetchTopCards is the fallback for when the slot is unconfigured or returns too little -- the
  // hero must never render bare. The fallback is a *query*; the primary is a *merchandising
  // decision*.
  useEffect(() => {
    let cancelled = false;

    const fromSlot = (): HeroMedia[] => {
      const products = productRecommendations?.state.products ?? [];
      return products
        .filter((p) => !!p.ec_images?.[0])
        .map((p) => {
          const id = p.ec_product_id ?? p.permanentid;
          return {
            key: `slot-${id}`,
            name: p.ec_name ?? '',
            image: p.ec_images[0],
            href: cardPath(id, p.ec_name ?? ''),
          };
        });
    };

    const applyFallback = () => {
      fetchTopCards().then((topCards) => {
        if (cancelled) return;
        const pool: HeroMedia[] = topCards
          .filter((c): c is TopCard & { image: string } => !!c.image)
          .map((c) => ({
            key: `card-${c.id}`,
            name: c.name,
            image: c.image,
            href: cardPath(c.id, c.name),
          }));
        setFlanking([...pool].sort(() => Math.random() - 0.5).slice(0, 4));
      });
    };

    const slot = productRecommendations;
    if (!slot) {
      applyFallback();
      return;
    }

    const apply = () => {
      if (cancelled) return;
      const slotMedia = fromSlot();
      // Two is the floor, not the target -- one scan alone reads as a rendering bug, so a slot
      // that can't even fill the left cluster hands the whole job to the fallback. Shuffled before
      // slicing so which two of the merchandiser's pool land in the visible cluster varies per load.
      if (slotMedia.length >= 2) setFlanking([...slotMedia].sort(() => Math.random() - 0.5).slice(0, 4));
      else if (!slot.state.isLoading) applyFallback();
    };

    apply();
    const unsubscribe = slot.subscribe(apply);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // The scans answer the consultation once it settles; empty draft keeps them on the Hub-configured
  // trending slot. Guarded three ways so this doesn't become a request-per-keystroke: the echo only
  // publishes AFTER the reading has settled (see CardConsultant), it is compared by value so a
  // re-render can't retrigger it, and a result that can't fill at least the left cluster is
  // discarded rather than half-applied.
  const { cardTypes } = useConsultantEcho();
  const [echoed, setEchoed] = useState<HeroMedia[]>([]);
  const echoKey = cardTypes.join(',');
  useEffect(() => {
    if (!echoKey) {
      setEchoed([]);
      return;
    }
    let cancelled = false;
    fetchTopCardsByType(echoKey.split(',')).then((cards) => {
      if (cancelled) return;
      const media = cards
        .filter((c): c is TopCard & { image: string } => !!c.image)
        .map((c) => ({
          key: `echo-${c.id}`,
          name: c.name,
          image: c.image,
          href: cardPath(c.id, c.name),
        }));
      setEchoed(media.length >= 2 ? media.slice(0, 4) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [echoKey]);

  // CardCluster only ever draws 2 cards, so only the left cluster is used here even though up to 4
  // come through the pool.
  const pool = echoed.length >= 2 ? echoed : flanking;
  const leftCards = pool.slice(0, 2);

  // overflow-x-clip, not overflow-hidden: the tilted card cluster still gets clipped at the
  // viewport edge, but nothing here should be clipped vertically -- `clip` on one axis leaves the
  // other visible, `hidden` would force vertical clipping too.
  //
  // `page-container`, not its own max-w/px-4: keeps this section's edges aligned with the shared
  // 1600px/px-4 width every other section (including the row directly below) uses.
  return (
    // The BOTTOM padding is the home page's shared row rhythm -- see components/home/rhythm.ts.
    // This section's padding is pure outer space, not the hero's own frame: the visible band is
    // the `rounded-3xl border bg-card` div below, so trimming pb only moves the next row closer.
    <section
      data-testid="home-hero"
      className={`page-container relative overflow-x-clip pt-6 sm:pt-8 ${HOME_ROW_SPACE}`}
    >
      {/* rounded-3xl is Tailwind's stock 24px step, used directly rather than adding a third
          custom radius token (see index.css's --radius comment). */}
      <div className="hero-border-glow relative flex flex-col items-start gap-6 rounded-3xl border border-border bg-card p-5 text-left sm:p-6 lg:flex-row lg:items-center lg:gap-10">
        {/* See HeroBackdrop above for the layer stack and the clipping rule, and index.css for the
            gradient's tuning. */}
        <HeroBackdrop />
        {/* Hidden below lg: no room for a cluster and the text to sit side by side. */}
        <div className="relative z-10 hidden lg:block">
          <CardCluster cards={leftCards} />
        </div>

        {/* max-w-2xl only below lg (a readable measure while stacked/no cluster); lg:max-w-none
            lets lg:flex-1 actually fill the row's remaining width instead of being capped at 672px
            regardless of how wide the hero card is -- flex-1 alone doesn't override a max-width. */}
        <div className="relative z-10 flex w-full max-w-2xl flex-col items-start lg:w-auto lg:max-w-none lg:flex-1">
          {/* Compass, not the marketplace zone's storefront glyph (see zones.tsx's `icon` prop): a
              consultant orients you. Deliberately not Sparkles or Wand2 -- both read as "AI wrote
              this", which this box, a Coveo typeahead search field, is not. */}
          {/* The landing stage had NO provenance marker at all, which made the one section whose
              whole claim is "everything moving here is a Coveo response" the only unmarked one on
              the page. Four things in this hero are live reads and they get ONE mark between them,
              on the eyebrow line where it sits clear of the headline and the card cluster:
                - the two headline counts (one commerce request, one Search API count),
                - the flanking scans (the Hub's trending slot, catalog query as fallback),
                - the Type/Set pickers inside the box (live catalog facet values + counts).
              The search box's own typeahead is deliberately NOT in this list -- SearchBox marks
              itself inside the dropdown, where what it is naming is actually on screen. */}
          <div className="mb-2 flex items-center gap-2">
            <ZoneEyebrow zone="marketplace" text="Card Consultant" icon={Compass} />
            <CoveoChip
              capability={[
                { capability: 'commerce-catalog', detailSuffix: 'The card count in the headline is this request’s own total.' },
                { capability: 'pokedex-index', detailSuffix: 'The species count beside it is a count-only Search API call.' },
                { capability: 'ml-recommendations', detailSuffix: 'The card scans either side are the Hub’s trending slot — pin one there and it shows up here, no deploy.' },
                { capability: 'dynamic-facets', detailSuffix: 'The Type and Set pickers in the box are live facet values with live counts.' },
              ]}
            />
          </div>

          {/* `key={copyIndex}` remounts both lines together on each rotation, retriggering
              `fade-in-panel`'s mount animation instead of it playing once and going inert. */}
          <div key={copyIndex} className="fade-in-panel">
            <h1 className="font-display text-4xl font-extrabold leading-[1.03] tracking-tight text-foreground sm:text-5xl">
              {activeCopy.headline}
            </h1>
            {/* The live counts are load-bearing, not ornamental: the cold open's first proof the
                page is reading a real index. */}
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              {activeCopy.subtext((cards || cardTotal).toLocaleString(), (pokemon || pokemonTotal).toLocaleString())}
            </p>
          </div>

          {/* Submitting navigates the same way the header box and CardConsultant both already do:
              push `q` onto /search and let that page run the actual retrieval. */}
          <div className="mt-6 w-full">
            <SearchBox
              controller={homeSearchBoxController}
              instantProducts={homeInstantProducts}
              recentQueries={recentQueriesList}
              onSubmit={(value) => navigate(`/search?q=${encodeURIComponent(value)}`)}
              size="lg"
              richDropdown
              placeholder="Search cards, Pokémon species, sets (151, Evolving Skies)..."
              // Overrides SearchBox's own `size="lg"` default (also max-w-2xl) via twMerge, same
              // reason as the wrapping column just above -- fill the column's real width.
              className="w-full max-w-none"
              rightSlot={<HeroFilterDropdowns />}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="eyebrow shrink-0">Popular:</span>
            {POPULAR_QUERIES.map((q) => (
              <Link
                key={q}
                to={`/search?q=${encodeURIComponent(q)}`}
                className="card-hover rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                {q}
              </Link>
            ))}
            <Link
              to={`/search?q=${encodeURIComponent(ASK_CHIP_QUERY)}`}
              className="card-hover flex items-center gap-1 rounded-lg border border-coveo/40 bg-coveo/10 px-2.5 py-1 text-xs font-medium text-coveo"
            >
              <MessageCircleQuestion className="h-3 w-3 shrink-0" aria-hidden />
              Ask: {ASK_CHIP_QUERY}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
