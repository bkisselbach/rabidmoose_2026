import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { buildContext } from '@coveo/headless/commerce';
import { commerceEngine } from '@/commerceEngine';
import { ConsultantEchoProvider } from '@/lib/ConsultantEchoContext';
import { SiteHeader } from '@/components/SiteHeader';
import { CartNavButton } from '@/components/CartNavButton';
import { CompareTray } from '@/components/consultant/CompareTray';
import { EventTape } from '@/components/EventTape';
import { RouteErrorBoundary } from '@/components/AppErrorBoundary';

const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
const SearchResultsPage = lazy(() =>
  import('@/pages/SearchResultsPage').then((m) => ({ default: m.SearchResultsPage }))
);
const CharacterDetailPage = lazy(() =>
  import('@/pages/CharacterDetailPage').then((m) => ({ default: m.CharacterDetailPage }))
);
const ProductDetailPage = lazy(() =>
  import('@/pages/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage }))
);
const PokedexVaultPage = lazy(() =>
  import('@/pages/PokedexVaultPage').then((m) => ({ default: m.PokedexVaultPage }))
);
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const AdvisorPage = lazy(() => import('@/pages/AdvisorPage').then((m) => ({ default: m.AdvisorPage })));
const PokemonNewsPage = lazy(() => import('@/pages/PokemonNewsPage').then((m) => ({ default: m.PokemonNewsPage })));
const NewsArticlePage = lazy(() => import('@/pages/NewsArticlePage').then((m) => ({ default: m.NewsArticlePage })));
const CartPage = lazy(() => import('@/pages/CartPage').then((m) => ({ default: m.CartPage })));

const commerceContext = buildContext(commerceEngine);

// `/card/:id/:slug?` is the canonical card URL -- it names the entity the way the app talks
// about it ("the card page"), matching `/pokedex/:name` on the Pokédex side, and carries a
// human-readable name slug for SEO (the PDP normalizes the URL to the canonical slug on load).
// `/product/:id` was the original path and stays alive as a permanent redirect so older links
// keep resolving; on Vercel it's also a real 308 (see vercel.json) so crawlers transfer rank.
function ProductPathRedirect() {
  const { id } = useParams<{ id: string }>();
  // A bare `/product/` with no id can only be reached by hand-editing the URL, but redirecting it
  // to `/card/` produced a *second* unmatched path rather than a destination -- two navigations to
  // land on the same 404. Render the catch-all's page directly instead.
  if (!id) return <NotFoundPage />;
  return <Navigate to={`/card/${encodeURIComponent(id)}`} replace />;
}

// The dex entry moved from `/pokemon/:name` to `/pokedex/:name`, so it now sits under the index
// that owns it. Same shape as ProductPathRedirect above: client-side redirect here, real 308 on
// Vercel (see vercel.json). A bare `/pokemon/` renders the 404 directly rather than bouncing
// through a second unmatched path.
function PokemonPathRedirect() {
  const { name } = useParams<{ name: string }>();
  if (!name) return <NotFoundPage />;
  return <Navigate to={`/pokedex/${encodeURIComponent(name)}`} replace />;
}

// `flex-1`, not `min-h-screen` -- this now renders BELOW the persistent header (see App below)
// inside one shared flex-col shell, so it only needs to fill the remaining space, not the whole
// viewport again on top of the header's own height.
function RouteLoadingFallback() {
  return (
    // `role="status"` + a label because this is now the only thing on screen during a route swap,
    // and a spinning mark with no accessible name announces nothing at all.
    <div className="flex flex-1 items-center justify-center" role="status" aria-label="Loading">
      <div className="pokeball-mark pokeball-loader" />
    </div>
  );
}

export function App() {
  const location = useLocation();

  // The Commerce API needs the current URL on every request to attribute analytics events (search,
  // click, cart, purchase) to the right page. The engine only captures it once at construction time,
  // so this keeps it in sync as the user navigates this SPA without a full page reload.
  useEffect(() => {
    commerceContext.setView({ url: window.location.href });
  }, [location]);

  // ConsultantEchoProvider is above the routes so a page can listen to what the Consultant
  // resolved to while the Consultant itself stays surface-agnostic -- today that's the home
  // hero's card scans.
  return (
    <ConsultantEchoProvider>
      {/* SiteHeader lives here now, ONCE, instead of every page mounting its own copy. Each page
          used to render `<div className="flex min-h-screen flex-col"><SiteHeader>...` itself,
          which meant <Routes> swapping HomePage for SearchResultsPage (different component types)
          unmounted the whole tree INCLUDING the header, then mounted a brand new one -- so the
          desktop nav's sliding active-pill indicator (SiteHeader.tsx's DesktopNav) never actually
          had a persistent DOM node to slide; every cross-page nav click destroyed and recreated it
          at the destination, instantly, no transition possible. That's the literal bug report
          ("the animation only works for the first two menu items") --  Marketplace/Pokédex Vault
          share ONE page (/search, zone-switched via router state) so the header never unmounted
          between THEM, but every other item is its own page. Hoisting the header above <Routes>
          keeps one persistent instance across every navigation, which is what the indicator needs
          to animate at all. Each page keeps its own <main>/<SiteFooter> only now. */}
      <div className="flex min-h-screen flex-col">
        <SiteHeader>
          <CartNavButton />
        </SiteHeader>
        {/* Floating, self-hiding, same "mounted once at the app root" treatment as the cart --
            phase S4's compare tray needs to survive navigation between the PDP that adds a card
            and wherever the shopper opens the comparison from. */}
        <CompareTray />
        {/* Mounted at the app root, like the cart and the compare tray: the tape's whole point is
            that it follows you across pages, so a search on one route and the click it produces
            on the next read as one session. */}
        <EventTape />
        {/* Inside the header, not around it: a page that throws should cost you that page, not
            the nav you need to leave it. main.tsx's root boundary covers the header itself.
            OUTSIDE <Suspense>, so it also catches a lazy chunk that fails to fetch -- that
            rejection surfaces as a throw from the Suspense boundary below, not inside it. */}
        <RouteErrorBoundary>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchResultsPage />} />
              {/* Legacy alias from before the search page owned browsing; kept (like /product/:id
                  below) purely so old links resolve. Server-side 308 in vercel.json. */}
              <Route path="/marketplace" element={<Navigate to="/search" replace />} />
              {/* The Pokédex index, and the species detail page is its leaf -- `/pokedex` is to
                  `/pokedex/:name` what `/search` is to `/card/:id` (pokedex-vault-plan.md D1).
                  The dex entry used to live at `/pokemon/:name`; that path stays alive below as a
                  permanent redirect so older links keep resolving. */}
              <Route path="/pokedex" element={<PokedexVaultPage />} />
              <Route path="/pokedex/:name" element={<CharacterDetailPage />} />
              <Route path="/pokemon/:name" element={<PokemonPathRedirect />} />
              <Route path="/card/:id/:slug?" element={<ProductDetailPage />} />
              <Route path="/product/:id" element={<ProductPathRedirect />} />
              {/* Named for what the page IS, not the check it runs -- see AdvisorPage's own note.
                  /deck-check stays alive below (like /marketplace and /product/:id) so the links,
                  screenshots and slide captions taken before the rename still resolve. Server-side
                  308 in vercel.json for the same path. */}
              <Route path="/advisor" element={<AdvisorPage />} />
              <Route path="/deck-check" element={<Navigate to="/advisor" replace />} />
              <Route path="/cart" element={<CartPage />} />
              {/* The newsroom index and its leaf -- `/pokemon-news` is to `/pokemon-news/:slug`
                  what `/pokedex` is to `/pokedex/:name`. Its own Coveo engine over the app's third
                  source (pokemon-news-push). */}
              <Route path="/pokemon-news" element={<PokemonNewsPage />} />
              <Route path="/pokemon-news/:slug" element={<NewsArticlePage />} />
              {/* Catch-all: without it, unknown paths render an empty <Routes> -- a blank page and
                  a soft-404 for crawlers. The 404 page noindexes itself. */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </div>
    </ConsultantEchoProvider>
  );
}
