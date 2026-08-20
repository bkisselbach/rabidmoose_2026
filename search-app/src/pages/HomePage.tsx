import { useEffect } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { NotifyBanner } from '@/components/NotifyBanner';
import { ensureTrendingListingLoaded, ensureTrendingRecommendationsLoaded } from '@/homeControllers';
import { ConsultantHero } from '@/components/home/ConsultantHero';
import { PersonalizationBox } from '@/components/home/PersonalizationBox';
import { TrendingSpotlightRow } from '@/components/home/TrendingSpotlightRow';
import { BrowseTiles } from '@/components/home/BrowseTiles';
import { HOME_ROW_GAP, HOME_ROW_SPACE } from '@/components/home/rhythm';
import { DEFAULT_DESCRIPTION, useSeo } from '@/lib/seo';
import { dealInProps, HOME_SECTION_RAMP } from '@/lib/dealIn';

// Section order is the argument the page makes: search/browse first, then merchandising (trending),
// then the two zones as navigation. Every section is a different Coveo capability doing the work,
// which is what makes the Demo Mode pass read as a tour rather than a legend.
//
// As of 2026-08-16 (home-hero-marketplace-toolbar-plan.md) the hero leads with a real typeahead
// search bar, not the Card Consultant's composer -- see components/home/ConsultantHero.tsx's own
// version-history comment for the two prior arrangements this reverses and why.
//
// `HomeMarketplaceBar` (the "second bar": Set/Type/Rarity/Price dropdowns) briefly rendered here
// too, same session -- removed on direct feedback the same day: a filter bar reads as belonging to
// a results page (the PLP, i.e. `/search`), not a landing hero with no grid under it. Component
// kept, not deleted (components/home/HomeMarketplaceBar.tsx) -- it's a real candidate for /search,
// but wiring it there means it has to filter the page IN PLACE against the live commerceFacetGenerator
// controllers already on that page, not navigate-away the way it does here (this page has no grid to
// filter), which is a different binding, not a copy-paste move. Not done yet.
export function HomePage() {
  useSeo({
    title: 'RabidMoose — Pokémon Card Marketplace & Pokédex',
    description: DEFAULT_DESCRIPTION,
    path: '/',
  });

  useEffect(() => {
    ensureTrendingListingLoaded();
    ensureTrendingRecommendationsLoaded();
  }, []);

  return (
    <>
      {/* The home page's four sections stagger in, which is what index.css's `.page-enter` rule
          has claimed all along ("HomePage itself does NOT carry this class -- its sections already
          choreograph their own entrance") and what, until 2026-08-18, was simply not true: there
          was exactly one `rise-in`, on the Trending row, and the hero, the banner and the browse
          tiles had no entrance at all. So the landing page -- the first thing anyone sees -- was
          the one page in the app with neither a route transition nor a section entrance, and the
          comment describing the opposite had gone unchallenged for a day.

          Same `.deal-in` mechanism the grids use, on the section ramp (90ms steps, not 28ms):
          these are full-viewport-width rows a scroll apart, and a tile-scale step between them
          reads as no stagger at all. See lib/dealIn.ts. */}
      <main className="flex-1">
        <div {...dealInProps(0, 'page-container pt-6', HOME_SECTION_RAMP)}>
          <NotifyBanner />
        </div>

        <div {...dealInProps(1, undefined, HOME_SECTION_RAMP)}>
          <ConsultantHero />
        </div>
        {/* Trending Now + "Where you left off" (PersonalizationBox), side by side at xl+
            (2026-08-18, direct request -- "could we side by side trending now and the
            personalization block?"). Same two-column pattern this row already carried once, back
            when it was Trending + RecentlyPurchasedRow (2026-08-16 instruction). Both panels render
            through the exact same HomeCardRail shell now (direct instruction: "make them both have
            the look and feel of trending now" -- PersonalizationBox dropped its other zones and
            rebuilt on HomeCardRail the same session, see that file's own history note), so
            `xl:items-stretch` (the flex default) is correct here: HomeCardRail's own `h-full`
            +`flex-1` pair is what makes both panels resolve to the taller one's height and keeps
            their bottom edges level, same mechanism Trending/RecentlyPurchased used when they were
            the pair sharing this row.

            NO WRAPPER DIVS around either child (2026-08-18, fixing a bug caught in verification):
            each component owns its own `min-w-0 xl:flex-1` + `order-*` sizing at its own root
            (TrendingSpotlightRow already did; PersonalizationBox now does too -- see that file's
            own comment). A wrapper div here claiming `xl:flex-1` around a component that renders
            `null` (a cold Guest, or a persona under PersonalizationBox's trail threshold) would
            keep reserving half the row for nothing -- exactly what happened before this fix, caught
            live: Guest showed Trending pinned at half-width with a dead gap on the right instead of
            expanding to fill the row. Letting each component size itself means an empty render is
            truly absent from the flex row. */}
        <div
          {...dealInProps(2, `page-container flex flex-col ${HOME_ROW_GAP} ${HOME_ROW_SPACE} xl:flex-row`, HOME_SECTION_RAMP)}
        >
          <TrendingSpotlightRow />
          <PersonalizationBox />
        </div>
        <div {...dealInProps(3, undefined, HOME_SECTION_RAMP)}>
          <BrowseTiles />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
