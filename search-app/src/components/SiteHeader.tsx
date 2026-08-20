import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Compass, Home, Layers, Menu, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ensureTrendingListingLoaded } from '@/homeControllers';
import { ShopByType, ShopByRarity, ShopAllCardsLink } from '@/components/ShopMegaMenu';
import { BrowseByGeneration, BrowseByType } from '@/components/PokedexMegaMenu';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { MooseMark } from '@/components/MooseMark';
import { useDeck } from '@/lib/deckStorage';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface Props {
  children?: React.ReactNode;
}

// The primary destinations, ported from the RabidMoose visual-refresh mockup's flat nav bar
// (presentation/rabidmoose-visual-refresh-plan.md) in place of the old Shop/Pokédex dropdown pair.
// `to`/`state` reuse the same browseZone router-state handoff SiteFooter already uses to land on
// one zone of /search -- no new routing mechanism. `match` decides the active-pill highlight,
// against every route it's plausibly "on", not just its own `to`.
interface NavItem {
  label: string;
  icon: typeof Layers;
  /** Decorative per-item icon accent, colorful-nav treatment ported from the mockup's Navbar.tsx
   *  (each item there gets its own `text-{color}-300`). A Tailwind class where a design token
   *  already carries the right hue (amber/violet/blue all exist as semantic tokens); a raw hex via
   *  inline style for the two that don't -- Hyper Charged Cyan is one of the app's own documented
   *  brand colors (rabidmoose-visual-refresh-plan.md §2) that had no token yet, and the rose is a
   *  plain decorative pick. Same "flat standalone palette" approach as typeColors.ts, for the same
   *  reason: this is per-item taxonomy color, not a structural UI role the token system covers. */
  iconClassName?: string;
  iconColor?: string;
  to?: string;
  state?: { browseZone: 'marketplace' | 'pokedex' };
  match?: (pathname: string, browseZone?: string) => boolean;
  /** Hangs the My Deck card count off this item. The Advisor was the one destination in this bar a
   *  shopper can CHANGE from somewhere else -- "Add to deck" lives on every PDP and on the Deck
   *  Check suggestion tiles -- and it was the only one that never acknowledged it. A cart add opens
   *  a drawer; a deck add flipped a button to "In deck (2)" and nothing anywhere else moved, so the
   *  card went somewhere the shopper had no reason to believe in. This closes that loop with the
   *  same affordance the cart already uses. */
  showDeckCount?: boolean;
}

// Marketplace is the default zone for card detail pages, but `/` itself is now the dedicated Home
// item's route, not Marketplace's -- so this deliberately excludes it. `/marketplace` and
// `/product/:id` are included for the transient instant before their redirect (see App.tsx) to
// `/search`/`/card/:id` lands, so the pill never flashes unmatched on the way through.
const isMarketplaceRoute = (pathname: string) =>
  pathname === '/marketplace' || pathname.startsWith('/card/') || pathname.startsWith('/product/');

// `/pokedex` is the Vault (the index over all 1,025 species); `/pokedex/:name` is one dex entry
// (its leaf). Both are "in the Pokédex" as far as the nav pill is concerned, so a species page keeps
// its parent item lit. The exact-match half is not redundant with the prefix one: `/pokedex` carries
// no trailing slash, and the slash in the prefix is load-bearing rather than cosmetic -- it is what
// keeps a future `/pokedex-<something>` route from lighting this pill.
const isPokedexRoute = (pathname: string) => pathname === '/pokedex' || pathname.startsWith('/pokedex/');

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Home',
    icon: Home,
    iconColor: '#FBBF24',
    to: '/',
    match: (pathname) => pathname === '/',
  },
  {
    label: 'Marketplace',
    icon: Layers,
    iconClassName: 'text-primary',
    to: '/search',
    state: { browseZone: 'marketplace' },
    match: (pathname, browseZone) => isMarketplaceRoute(pathname) || (pathname === '/search' && browseZone !== 'pokedex'),
  },
  {
    label: 'Pokédex Vault',
    icon: BookOpen,
    iconClassName: 'text-accent-secondary',
    // A real URL of its own as of pokedex-vault-plan.md Phase 1 -- this item used to point at
    // `/search` and carry its zone in router `state`, which meant it and Marketplace resolved to the
    // SAME address and the distinction survived neither a share nor a reload. No `state` anymore:
    // the path IS the destination.
    to: '/pokedex',
    // The `/search` + browseZone clause STAYS, even though this item no longer produces that state.
    // `/search` is deliberately untouched this round (plan D5), so its Pokédex zone is still
    // reachable -- PokedexMatches's "See all matches →" and the home BrowseTiles both still set it.
    // Dropping the clause here would not remove those entry points, it would just leave the pill
    // unlit when a shopper uses one, since Marketplace's own match explicitly excludes that state.
    match: (pathname, browseZone) => isPokedexRoute(pathname) || (pathname === '/search' && browseZone === 'pokedex'),
  },
  {
    // Renamed with the page, route included this time (gap-check-plan.md 5): the destination
    // answers set completion as well as deck exposure, and the nav label has to match the h1 a
    // click lands on. Compass is deliberately the Card Consultant's own glyph (ConsultantHero's
    // zone eyebrow) -- this page is that consultant at full size, so the nav pill and the hero
    // should read as the same voice rather than two unrelated surfaces.
    label: 'Advisor',
    icon: Compass,
    iconColor: '#06B6D4',
    to: '/advisor',
    // The retired path still routes (App.tsx redirects it), so keep it lighting this pill for the
    // frame or two before the redirect lands -- otherwise an old link flashes an unlit nav.
    match: (pathname) => pathname === '/advisor' || pathname === '/deck-check',
    showDeckCount: true,
  },
  {
    label: 'Pokémon News',
    icon: Newspaper,
    iconColor: '#FB7185',
    to: '/pokemon-news',
    // `startsWith`, so an article page keeps its parent item lit -- same parent/leaf rule
    // isPokedexRoute now owns /pokedex + /pokedex/:name, a different prefix entirely, so there is
    // nothing left for this item to collide with.
    match: (pathname) => pathname === '/pokemon-news' || pathname.startsWith('/pokemon-news/'),
  },
];

function useBrowseZone() {
  const location = useLocation();
  return (location.state as { browseZone?: 'marketplace' | 'pokedex' } | null)?.browseZone;
}

/** Renders `item.icon` in its own accent color, EXCEPT while active: an active pill's background
 *  is always violet (accent-secondary), so an icon whose own color happens to be that exact violet
 *  (Pokédex Vault) would vanish into its own selected state. Leaving off the color override while
 *  active lets the icon fall back to `currentColor`, inheriting the surrounding link/span's already
 *  correct active text color instead. */
function NavIcon({ item, active, className }: { item: NavItem; active: boolean; className: string }) {
  const Icon = item.icon;
  return (
    <Icon
      className={cn(className, !active && item.iconClassName)}
      style={!active && item.iconColor ? { color: item.iconColor } : undefined}
    />
  );
}

/** The My Deck card count, on whichever nav item asked for it. Renders nothing on an empty deck --
 *  a zero badge is noise, and a guest's deck is legitimately empty (deckStorage.ts seeds personas
 *  only).
 *
 *  `useDeck` is a `useSyncExternalStore` over a plain module, so this costs the app root a
 *  subscription and no request. Worth stating explicitly because item 31b is actively pulling
 *  imports OUT of this component's graph: `deckStorage` reaches only `visitorId`, which
 *  `ProfileSwitcher` already puts here, so this adds no SDK edge and nothing for 31b to undo. */
function DeckCountBadge({ item, active }: { item: NavItem; active: boolean }) {
  const deck = useDeck();
  if (!item.showDeckCount) return null;
  const count = deck.reduce((sum, l) => sum + l.quantity, 0);
  if (count === 0) return null;
  return (
    <span
      className={cn(
        'ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-2xs font-bold tabular-nums',
        active ? 'bg-accent-secondary-foreground/20 text-accent-secondary-foreground' : 'bg-primary text-primary-foreground'
      )}
      aria-label={`${count} card${count === 1 ? '' : 's'} in your deck`}
    >
      {count}
    </span>
  );
}

// The active state is now a single pill that SLIDES between items (DesktopNav below) instead of
// each item painting its own background -- so a NavPill never colors itself, it just sits above
// the shared indicator (`relative z-10`) and swaps text color once the indicator's transform
// transition lands under it. `data-nav-index` is how DesktopNav measures this exact element's
// position/width to animate toward, independent of DOM order (the indicator itself is a sibling).
function NavPill({ item, index, active }: { item: NavItem; index: number; active: boolean }) {
  const className = cn(
    'relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
    active ? 'text-accent-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  );

  if (!item.to) {
    return (
      <span data-nav-index={index} className={cn(className, 'cursor-default hover:bg-transparent hover:text-muted-foreground')} aria-disabled="true">
        <NavIcon item={item} active={active} className="h-3.5 w-3.5" />
        {item.label}
      </span>
    );
  }

  return (
    <Link data-nav-index={index} to={item.to} state={item.state} className={className}>
      <NavIcon item={item} active={active} className="h-3.5 w-3.5" />
      {item.label}
      <DeckCountBadge item={item} active={active} />
    </Link>
  );
}

// The desktop pill bar's shared sliding indicator. Measures the active item's own box (by
// `data-nav-index`, not `children[i]`, so it doesn't care where the indicator span itself sits in
// the DOM) and glides a violet pill to it via a CSS transform/width transition.
function DesktopNav({ pathname, browseZone }: { pathname: string; browseZone?: string }) {
  const containerRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  // Tracks whether the very first measurement has happened yet -- see the effect below.
  const hasMeasuredRef = useRef(false);
  const activeIndex = NAV_ITEMS.findIndex((item) => item.match?.(pathname, browseZone));

  useLayoutEffect(() => {
    const measure = () => {
      const el = containerRef.current?.querySelector<HTMLElement>(`[data-nav-index="${activeIndex}"]`);
      return el ? { left: el.offsetLeft, width: el.offsetWidth } : null;
    };

    // The very first measurement runs synchronously, pre-paint (useLayoutEffect), so the indicator
    // arrives already in the right place instead of flying in from (0,0).
    //
    // Every measurement AFTER that needs a DOUBLE rAF, not one. Doing it synchronously here, in the
    // same commit as the route change, collapses "old position" and "new position" into a single
    // paint -- the browser never gets a chance to paint the "new active pill, still-old indicator
    // box" intermediate frame, so it has nothing to transition FROM and the pill teleports instead
    // of sliding (this was silent because it still teleports to the CORRECT final position; only
    // the animation itself was missing, for every transition, not just some). A single rAF turned
    // out not to be enough to fix that: requestAnimationFrame scheduled from a layout effect that
    // is itself running synchronously inside a click handler frequently still lands in that SAME
    // frame, before anything has painted -- confirmed by instrumenting this exact effect. The
    // standard FLIP fix is to schedule the real update from INSIDE an already-running rAF callback,
    // which reliably lands on the frame after one: outer rAF -> (frame boundary, paint happens) ->
    // inner rAF -> setIndicator.
    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      setIndicator(measure());
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setIndicator(measure()));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [activeIndex]);

  // Resize isn't part of the same-commit collapse above (a native window event, not a React state
  // update sharing the route change's commit), and snapping instantly on resize is the correct
  // behavior anyway -- no animation intent there.
  useEffect(() => {
    const onResize = () => {
      const el = containerRef.current?.querySelector<HTMLElement>(`[data-nav-index="${activeIndex}"]`);
      setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeIndex]);

  return (
    <nav
      ref={containerRef}
      className="relative hidden items-center gap-1 rounded-2xl border border-border bg-muted/50 p-1.5 lg:flex"
    >
      {indicator && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 z-0 rounded-full bg-accent-secondary shadow-rest transition-[transform,width] duration-300 ease-smooth"
          style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
        />
      )}
      {NAV_ITEMS.map((item, i) => (
        <NavPill key={item.label} item={item} index={i} active={i === activeIndex} />
      ))}
    </nav>
  );
}

function MobileNavRow({ item, active }: { item: NavItem; active: boolean }) {
  const className = cn(
    'flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors',
    active ? 'bg-accent-secondary text-accent-secondary-foreground' : 'text-foreground hover:bg-muted'
  );

  if (!item.to) {
    return (
      <span className={cn(className, 'cursor-default text-muted-foreground hover:bg-transparent')} aria-disabled="true">
        <NavIcon item={item} active={active} className="h-4 w-4" />
        {item.label}
      </span>
    );
  }

  return (
    <SheetClose asChild>
      <Link to={item.to} state={item.state} className={className}>
        <NavIcon item={item} active={active} className="h-4 w-4" />
        {item.label}
        <DeckCountBadge item={item} active={active} />
      </Link>
    </SheetClose>
  );
}

// Scroll elevation for the sticky header: a subtle shadow (shadow-rest) at rest, no hairline yet --
// direct instruction to give the header some lift even at the very top, where it used to sit
// perfectly flush. The moment content starts sliding underneath, the nav needs to read as its own
// layer more emphatically, so it gains a hairline and the site's other, more pronounced shadow
// (shadow-float) -- the same two-level system every popover/sheet in the app already uses.
function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

// The header no longer owns search (moved into the /search page body -- see SearchResultsPage's
// hero omnibox, matching the mockup's own Navbar/marketplace split: its nav has no search box
// either, the marketplace view does). Nav-only header, so every other page loses the header's
// search entry point too -- reachable via the Marketplace nav item or the home hero's Card
// Consultant instead.
export function SiteHeader({ children }: Props) {
  const location = useLocation();
  const browseZone = useBrowseZone();
  const [menuOpen, setMenuOpen] = useState(false);

  // DEFERRED TO THE DRAWER'S FIRST OPEN (item 31b). This used to run on mount, on every page, so
  // every visit to /cart, /search, a card page or the 404 fired a catalog-wide listing request to
  // populate facet counts that appear in exactly one place: the Shop section of the mobile menu
  // drawer below. The nav bar is flat -- there is no desktop mega menu any more -- so on desktop
  // those counts were never rendered at all and the request was pure waste.
  //
  // `ensureTrendingListingLoaded` is idempotent behind its own module-scope flag, so re-running on
  // every open costs nothing and HomePage's own call still wins the race when someone lands there
  // first -- Home genuinely needs it on mount for the trending rail and the type grid, and that
  // call is deliberately left alone.
  useEffect(() => {
    if (!menuOpen) return;
    ensureTrendingListingLoaded();
  }, [menuOpen]);

  const scrolled = useScrolled();

  return (
    <div className="sticky top-0 z-20">
      {/* One hairline under the header, in the same violet the hero plate and the two home panels
          are filled with (2026-08-17, direct request). It reads `--violet-fill` -- the shared token
          those surfaces use -- rather than the `color-mix(in oklab, var(--color-purple-900) 40%,
          transparent)` it replaces, which was a one-off purple answerable to nothing: it came from
          Tailwind's stock palette, not this theme's, so it could not follow --accent-secondary and
          was already a near-match by coincidence rather than by construction.

          Worth knowing before tuning: the token is a 24%-alpha violet, and what you SEE is it
          composited over whatever is behind the border -- here the header's own translucent
          `bg-background/85|95` (plus whatever shows through it), not the opaque `--card` the hero
          and panels sit on. Same paint, different result, which is the reason to reach for the
          token rather than hardcoding the plate's composited hex. Measured off the rendered page at
          1440: the border row is #2F1B53 against a #08091F header interior and a #251544 page wash
          below it, so it reads as a lit line in both directions; over dark page content on scroll
          (#0B101D) it separates hardest. The line is deliberately NOT boosted to match the plate
          exactly -- the request was for the same purple, and an alpha bump here would make this the
          one surface carrying its own value.

          `color:` prefix in the arbitrary value is load-bearing -- `border-b-` takes both a width
          and a colour, and Tailwind cannot infer which a bare `var()` is meant to be. */}
      <header
        className={cn(
          'border-b border-b-[color:var(--violet-fill)] backdrop-blur-md transition-[box-shadow,background-color] duration-200',
          scrolled ? 'bg-background/95 shadow-float' : 'bg-background/85 shadow-rest'
        )}
      >
        <div className="page-container">
          {/* Three-column grid, not two flex groups anymore -- direct request to center the nav
              in the header, between the logo and the icon cluster, rather than tucked immediately
              after the logo. `1fr auto 1fr` is what makes that centering real regardless of the
              two side groups' widths (which aren't equal): both `1fr` tracks are forced equal,
              so the `auto` middle column sits centered on the FULL row, not just centered in
              whatever space happens to be left over after unequal-width siblings. A plain flex
              `justify-between` (the old layout) can't do this -- it only pins two groups to the
              ends, it can't center a third one independent of their widths. */}
          <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-6">
            <div className="flex shrink-0 items-center justify-self-start gap-3 lg:gap-6">
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted lg:hidden"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="sheet-panel-left">
                  <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-6 overflow-y-auto px-5 py-4">
                    <nav className="flex flex-col gap-1">
                      {NAV_ITEMS.map((item) => (
                        <MobileNavRow key={item.label} item={item} active={item.match?.(location.pathname, browseZone) ?? false} />
                      ))}
                    </nav>
                    {/* Category quick-browse, unchanged by the nav rework -- still the fastest way
                        into a type/rarity/generation from the drawer, just demoted under the primary
                        destinations above instead of being the whole drawer. */}
                    <div className="flex flex-col gap-6 border-t border-border pt-6">
                      <SheetClose asChild>
                        <ShopAllCardsLink onNavigate={() => setMenuOpen(false)} className="rounded-md bg-foreground py-2.5 text-center text-sm font-bold text-background transition-opacity hover:opacity-90" />
                      </SheetClose>
                      <ShopByType onNavigate={() => setMenuOpen(false)} />
                      <ShopByRarity onNavigate={() => setMenuOpen(false)} />
                      <div className="border-t border-border pt-6">
                        <BrowseByGeneration onNavigate={() => setMenuOpen(false)} />
                      </div>
                      <BrowseByType onNavigate={() => setMenuOpen(false)} />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Logo lockup: a simple round moose-head mark (no ring badge, no status dot -- the
                  mockup's chrome, deliberately left out per user direction) plus a two-line
                  wordmark/subtitle stack. No "TCG" chip and no lightning-bolt icon before the
                  subtitle -- both dropped from the mockup on request.
                  The mark carries its own circular edge and is transparent outside it, so this
                  frame paints NO background: a `bg-foreground` fill here used to show through the
                  source art's cream margin as a white ring around the badge (removed on request --
                  "just the moose").
                  It is also NOT clipped, and `MooseMark` is why that rule survives -- the mark's
                  antlers overflow its own circle, so a `rounded-full` frame shears them. That
                  component owns the rule for every surface; don't inline an <img> here again. */}
              <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="RabidMoose -- home">
                <MooseMark className="h-9 w-9" />
                <span className="hidden flex-col md:flex">
                  {/* Bold/dimensional wordmark (.wordmark* in index.css) -- direct request to move
                      off the flat two-tone text toward a chunkier, skewed, shadow-beveled logotype;
                      supersedes the earlier "match the mockup's flat Navbar.tsx rendering" note. */}
                  <span className="text-base uppercase leading-tight">
                    <span className="wordmark wordmark-rabid">Rabid</span><span className="wordmark wordmark-moose">Moose</span>
                  </span>
                  <span className="text-2xs leading-tight text-muted-foreground">Pokémon Card Marketplace &amp; Pokédex</span>
                </span>
              </Link>

            </div>

            {/* Desktop flat nav bar -- one rounded pill container holding all five destinations,
                the mockup's own grouping, at lg+ where there's room for icon+label x5 without
                crowding the search pill. Below lg the Sheet drawer above is the only nav entry
                point, same as it already was below md for the two-item dropdown pair. Its own grid
                column now (was bundled into the left group, flush against the logo) so it's
                centered against the header's full width instead of just sitting next to the logo. */}
            <DesktopNav pathname={location.pathname} browseZone={browseZone} />

            {/* Icon cluster: cart, then the persona switcher. The cart trigger is `children`
                (CartDrawer, passed in by every page) -- the real Coveo-wired cart, not a
                decorative stand-in. A settings gear used to sit at the end of this row holding
                the Coveo lens switch; the lens is gone (markers are unconditional now, see
                CoveoChip.tsx) and the gear went with it rather than staying on as an empty menu. */}
            <div className="flex shrink-0 items-center justify-self-end gap-1">
              {children}
              <ProfileSwitcher />
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
