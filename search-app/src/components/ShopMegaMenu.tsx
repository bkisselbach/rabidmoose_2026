import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  trendingSearchFallback,
  trendingFacetGenerator,
  trendingSearchFallbackFacetGenerator,
  useTrendingListing,
} from '@/homeControllers';
import { typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';
import { ChipRowSkeleton } from '@/components/Skeleton';
import { CoveoChip } from '@/components/CoveoChip';

// Piggybacks on the "Trending now" request HomePage/TypeGrid already fire (see
// ensureTrendingListingLoaded in homeControllers.ts, called from SiteHeader too so this has data
// on every page, not just Home) -- just another reactive view over the same catalog-wide facet
// counts, no extra request of its own. Two generators, not one: the Listing endpoint 404s
// (LISTING_CONFIGURATION_DOES_NOT_EXIST) until a Listing configuration exists for this tracking ID,
// in which case trendingListing's own facets never populate -- useTrendingListing's `source`
// (below) tells us which of the two actually has data. The generators themselves live in
// homeControllers.ts (moved there 2026-08-16) since HomeMarketplaceBar.tsx now reads them too.

const TYPE_MENU_SIZE = 8;
const RARITY_MENU_SIZE = 6;

export interface CategoryEntry {
  facetId: string;
  value: string;
  count: number;
}

/** Whichever of the two trending facet generators is currently backed by real data -- the one
 *  piece of routing logic every catalog-facet reader in this file needs, factored out of
 *  useCatalogFacetValues so a second reader (there was one; see git history) doesn't have to
 *  re-derive it. */
function useActiveFacetGenerator() {
  const { source } = useTrendingListing();
  return source === trendingSearchFallback ? trendingSearchFallbackFacetGenerator : trendingFacetGenerator;
}

/** The catalog's own facet values for one field, highest count first, read off whichever of the
 *  two trending controllers actually has data. Shared with the home TypeGrid so both surfaces read
 *  the same live counts from the same single request. */
export function useCatalogFacetValues(facetId: string, limit: number): CategoryEntry[] {
  const facetGenerator = useActiveFacetGenerator();

  const [facets, setFacets] = useState(facetGenerator.facets);
  useEffect(() => {
    setFacets(facetGenerator.facets);
    return facetGenerator.subscribe(() => setFacets(facetGenerator.facets));
  }, [facetGenerator]);

  const facet = facets.find((f) => f.type === 'regular' && f.state.facetId === facetId);
  if (!facet || facet.type !== 'regular') return [];
  return [...facet.state.values]
    .sort((a, b) => b.numberOfResults - a.numberOfResults)
    .slice(0, limit)
    .map((v) => ({ facetId, value: v.value, count: v.numberOfResults }));
}

function useShopCategories() {
  return {
    types: useCatalogFacetValues('cardtypes', TYPE_MENU_SIZE),
    rarities: useCatalogFacetValues('cardrarity', RARITY_MENU_SIZE),
  };
}

// Deep-links a category pick as router state rather than a `f-<field>=` URL param: Coveo's
// commerce URL manager can only restore a *dynamic* facet (one that only exists once a
// facetGenerator response has produced it) after that response has already landed once, so a
// cold link straight into `/search?f-cardrarity=...` silently drops the filter. SearchResultsPage
// reads this `presetFacet` state once its own facet generator reports that value as available and
// selects it explicitly instead.
// Chip metrics mirror PokedexMegaMenu's BrowseByType tiles (text-xs, py-1 pl-1 pr-2.5 with a
// h-4 icon disc) so the header's two dropdowns read as one system; the count is the only
// Shop-side addition. Icon-less rarity chips swap the asymmetric padding for an even px-2.5.
function CategoryChip({ entry, showTypeIcon, onNavigate }: { entry: CategoryEntry; showTypeIcon: boolean; onNavigate: () => void }) {
  const color = showTypeIcon ? typeColor(entry.value) : undefined;
  const Icon = showTypeIcon ? typeIcon(entry.value) : undefined;

  return (
    <Link
      to="/search"
      state={{ presetFacet: { facetId: entry.facetId, value: entry.value } }}
      onClick={onNavigate}
      className={`card-hover flex items-center gap-1.5 rounded-full border border-border bg-card py-1 text-xs font-semibold text-foreground ${Icon ? 'pl-1 pr-2.5' : 'px-2.5'}`}
    >
      {Icon && color && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: color.bg }}>
          <Icon className="h-2.5 w-2.5" style={{ color: color.text }} />
        </span>
      )}
      {entry.value}
      <span className="font-normal text-muted-foreground">{entry.count}</span>
    </Link>
  );
}

// Both menu sections below are live facet reads -- values AND counts come off a catalog-wide
// commerce response, which is why a type nobody stocks never appears here and the numbers move on
// their own. They went unmarked while every other surface reading the same data carried a marker,
// so each gets one, on its own label row (the two are a full pill row apart, never adjacent).
function MenuLabel({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="eyebrow">{text}</span>
      <CoveoChip capability="dynamic-facets" detailSuffix="These pills, and the number on each, are facet values off a live catalog-wide request." />
    </span>
  );
}

export function ShopByType({ onNavigate }: { onNavigate: () => void }) {
  const { types } = useShopCategories();
  return (
    <div>
      <MenuLabel text="Shop by type" />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {/* Skeleton chips rather than a "Loading…" line: the facet response arrives while the menu
            is already open, so a single line of text becoming eighteen pills visibly re-flowed the
            whole panel under the cursor. The widths are sized to the real type names. */}
        {types.length ? (
          types.map((t) => <CategoryChip key={t.value} entry={t} showTypeIcon onNavigate={onNavigate} />)
        ) : (
          <ChipRowSkeleton widths={[70, 62, 78, 58, 84, 66, 72, 60, 88, 64, 76, 56]} />
        )}
      </div>
    </div>
  );
}

export function ShopByRarity({ onNavigate }: { onNavigate: () => void }) {
  const { rarities } = useShopCategories();
  return (
    <div>
      <MenuLabel text="Shop by rarity" />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {rarities.length ? (
          rarities.map((r) => <CategoryChip key={r.value} entry={r} showTypeIcon={false} onNavigate={onNavigate} />)
        ) : (
          // Wider than the type chips: rarity values are phrases ("Rare Holo EX"), not single words.
          <ChipRowSkeleton widths={[64, 92, 78, 110, 70, 86, 96, 74]} />
        )}
      </div>
    </div>
  );
}

export function ShopAllCardsLink({ onNavigate, className }: { onNavigate: () => void; className?: string }) {
  return (
    <Link
      to="/search"
      onClick={onNavigate}
      className={
        className ??
        'flex items-center justify-center rounded-md border border-border py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted'
      }
    >
      Shop all cards
    </Link>
  );
}
