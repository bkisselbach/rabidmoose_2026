import { useState, type ReactNode } from 'react';
import { Boxes, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCatalogFacetValues } from '@/components/ShopMegaMenu';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { CoveoChip } from '@/components/CoveoChip';
import { ZoneEyebrow } from '@/components/zones';
import { TYPE_COLORS, typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';
import { HOME_ROW_GAP, HOME_ROW_SPACE } from '@/components/home/rhythm';
import { useSetArt } from '@/lib/setArt';
import { useTypeCounts } from '@/lib/typeCounts';
import { cn } from '@/lib/utils';

// The tiles are facet values with live counts, not a hardcoded menu -- sets come from the
// catalog's own cardsetname facet, so a new set in the index becomes a tile with no code change.
//
// The type column is the Pokédex's own 18 species types (not the commerce `cardtypes` energy
// vocabulary), so it carries the pokedex ZoneEyebrow and navigates via a query rather than
// presetFacet (see the type link's own note below). Its species counts come from useTypeCounts'
// one cached facet-only query, since pokemontype lives on the content source and can't ride the
// catalog request -- garnish, not gating: the strip renders fine without them.
//
// Both "All ..." links carry a `browseZone` router state so SearchResultsPage shows only the zone
// the link named (cards for "All sets", species for "All Pokémon") -- forcing that even overrides
// any facet left active on the other engine's module-scope controller from earlier browsing in the
// same session, so the two links stay deterministic regardless of what was clicked before.

const ALL_TYPES = Object.keys(TYPE_COLORS);

// Shared shell for the two strips: one header row (zone title, optional provenance chip, caption,
// "All ..." link) over one wrapped pill row.
function StripPanel({
  testId,
  title,
  zone,
  icon,
  chip,
  caption,
  allLabel,
  allTo,
  allState,
  bodyClassName,
  children,
}: {
  testId: string;
  title: string;
  zone: 'marketplace' | 'pokedex';
  /** Section-specific eyebrow glyph, overriding the zone's own (see zones.tsx). Only the sets
   *  strip needs one: the Pokédex strip's zone icon is already unique on this page. */
  icon?: LucideIcon;
  chip?: ReactNode;
  caption: string;
  allLabel: string;
  allTo: string;
  allState: unknown;
  /** The pill row's own layout -- both strips fill their full width, but not the same way. */
  bodyClassName: string;
  children: ReactNode;
}) {
  return (
    // `panel-border-glow` REPLACES `shadow-rest / transition-shadow / hover:shadow-float` rather
    // than joining them: `box-shadow` is a single property, so the glow and the hover lift can't
    // be two classes without one silently winning. See index.css.
    <Card data-testid={testId} className="panel-violet-fill panel-border-glow">
      <CardHeader className="flex-row flex-wrap items-center gap-x-3 gap-y-2 p-4 sm:px-5">
        <ZoneEyebrow zone={zone} text={title} icon={icon} />
        {chip}
        {/* Kept as one right-hand group so the title and the "All ..." link still share line one
            at 375 (the caption drops below `sm`). */}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-2xs text-muted-foreground sm:inline">{caption}</span>
          <Link
            to={allTo}
            state={allState}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {allLabel} &rarr;
          </Link>
        </div>
      </CardHeader>
      <CardContent className={cn('gap-2 p-4 pt-0 sm:px-5', bodyClassName)}>{children}</CardContent>
    </Card>
  );
}

// Sunken (`bg-background`) rather than `bg-card` -- these sit ON a card, and a chip in the same
// colour as the panel behind it reads as floating text with a stray outline.
const PILL =
  'card-hover flex items-center gap-1.5 rounded-full border border-border bg-background py-1.5 pl-2 pr-2.5 text-xs font-semibold text-foreground';

// Both strips are grids whose column count DIVIDES THEIR ITEM COUNT EXACTLY -- 10 sets over 2/5
// columns, 18 types over 2/3/6/9 -- because that is the one arrangement where no viewport width
// can leave a short last row. A plain `flex-wrap` row of natural-width pills ends wherever its
// last item happens to land instead. Flex-grow was tried and measured to fail: it looks right when
// all 10 sets fit one line, but at 1280-1300 the row wraps 9+1 and that last pill grows to fill the
// whole second line alone (measured: 1,206px for one set). A fixed 10-column grid for the sets was
// also tried: at xl the cells come out 116px, squeezing the wide wordmarks (Sword & Shield,
// Diamond & Pearl) below the legibility floor; five columns give ~240px cells instead, at the cost
// of two rows rather than one.
//
// Fragility worth knowing: this holds because the counts are 10 and 18. The 18 is fixed (the
// Pokedex's own types), but the 10 is however many values the cardsetname facet returns -- if that
// ever comes back 9, the last row of five carries one gap. Not defended against.
const SETS_ROW = 'grid grid-cols-2 sm:grid-cols-5';
const TYPES_ROW = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-9';

export function BrowseTiles() {
  // 10 = every value the cardsetname facet response actually carries.
  const sets = useCatalogFacetValues('cardsetname', 10);
  const setArt = useSetArt();
  const typeCounts = useTypeCounts();
  // A logo URL that 404s (or a CDN hiccup) used to just `display: none` the image, which left a
  // pill holding nothing but a number. Recording the failure instead falls back to the same plain
  // text a set with no art at all gets.
  const [artFailed, setArtFailed] = useState<Record<string, true>>({});

  return (
    <section
      data-testid="home-browse"
      className={`page-container flex flex-col ${HOME_ROW_GAP} ${HOME_ROW_SPACE}`}
    >
      <StripPanel
        testId="home-browse-sets"
        title="Shop by set"
        zone="marketplace"
        // `Layers` would have been the other reading of "set" and is the header's Marketplace nav
        // glyph, which would have made this strip look like that nav item.
        icon={Boxes}
        chip={
          <CoveoChip
            capability="dynamic-facets"
            detailSuffix="These pills are cardsetname facet values with live counts"
          />
        }
        caption="Top sets by card count"
        allLabel="All sets"
        allTo="/search"
        allState={{ browseZone: 'marketplace' }}
        bodyClassName={SETS_ROW}
      >
        {sets.length === 0
          ? Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton h-8 rounded-full" />
            ))
          : sets.map((entry) => {
              const art = setArt.get(entry.value.toLowerCase());
              // Wordmark only, no `symbol` fallback: a wordmark names itself, which is why it can
              // replace the label; the square emblem does not, and at pill scale left one set
              // reading as an unlabelled gold crown beside a bare number.
              const artUrl = artFailed[entry.value] ? undefined : art?.logo;
              return (
                <Link
                  key={entry.value}
                  to="/search"
                  state={{ presetFacet: { facetId: 'cardsetname', value: entry.value } }}
                  aria-label={`${entry.value} — ${entry.count} cards`}
                  // A couple of these wordmarks (Neo Revelation's crown, Base Set's generic TCG
                  // lockup) don't read as their set name at any size, hence the hover title too.
                  title={`${entry.value} — ${entry.count} cards`}
                  className={`${PILL} justify-center`}
                >
                  {artUrl ? (
                    <img
                      src={artUrl}
                      alt={entry.value}
                      loading="lazy"
                      // Height AND a width cap: these wordmarks' aspect ratios are wildly different
                      // -- measured at h-8, Diamond & Pearl renders 208px wide, Neo Revelation 43px.
                      // Height alone made one pill's logo five times the width of its neighbour's.
                      className="h-8 max-w-[9rem] object-contain"
                      onError={() => setArtFailed((f) => ({ ...f, [entry.value]: true }))}
                    />
                  ) : (
                    <span>{entry.value}</span>
                  )}
                  <span className="font-normal tabular-nums text-muted-foreground">
                    {entry.count}
                  </span>
                </Link>
              );
            })}
      </StripPanel>

      <StripPanel
        testId="home-browse-types"
        title="Browse the Pokédex"
        zone="pokedex"
        // The tiles themselves are ALL_TYPES, a constant -- but the number on each one is a live
        // pokemontype facet over the Pokédex index, which is the whole reason "dual-typed Pokémon
        // count in both types" is a real caption and not a claim. Its sibling strip above has been
        // marked all along; this one hadn't, so the page marked one live count and not the other.
        chip={
          <CoveoChip
            capability={[
              { capability: 'pokedex-index', detailSuffix: 'One count-only Search API call, cached for the page.' },
              { capability: 'dynamic-facets', detailSuffix: 'Every number here is a pokemontype facet value’s own count.' },
            ]}
          />
        }
        caption="Dual-typed Pokémon count in both types"
        allLabel="All Pokémon"
        allTo="/search"
        allState={{ browseZone: 'pokedex' }}
        bodyClassName={TYPES_ROW}
      >
        {ALL_TYPES.map((type) => {
          const c = typeColor(type);
          const Icon = typeIcon(type);
          const count = typeCounts.get(type.toLowerCase());
          return (
            <Link
              key={type}
              // A type tile is a QUERY, not a preset facet. The old `presetContentFacet` route
              // filtered the Pokedex column and left the marketplace showing the entire catalog
              // under a "Fire-type Pokemon" heading; adding a commerce `presetFacet` alongside it
              // empties the grid (same fragility documented all over SearchResultsPage). `?q=Fire`
              // goes through query understanding instead, which is the one path that applies both
              // engines' facets atomically.
              to={`/search?q=${encodeURIComponent(type)}`}
              aria-label={count !== undefined ? `${type} — ${count} Pokémon` : type}
              className={`${PILL} justify-center`}
            >
              {/* Filled disc, same treatment the header menus' type chips use, so the two surfaces
                  read as one system. c.text on c.bg is the pair that stays legible filled. */}
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: c.bg }}
              >
                <Icon className="h-3 w-3" style={{ color: c.text }} />
              </span>
              {type}
              {/* The tiles themselves are static (ALL_TYPES), so this row never needed a full
                  skeleton the way its "Shop by set" sibling does -- but the counts arrive from the
                  index a beat later, and appending them to a settled pill re-flowed every pill in
                  the row. A same-width shimmer holds the slot instead, which also makes the two
                  strips behave the same way while they wait. `w-6` is two tabular digits, the
                  common case; a three-digit count nudges only its own pill. */}
              {count !== undefined ? (
                <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
              ) : (
                <span className="skeleton h-3 w-6 shrink-0 rounded-full" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </StripPanel>
    </section>
  );
}
