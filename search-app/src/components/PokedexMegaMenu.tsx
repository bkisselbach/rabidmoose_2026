import { Link } from 'react-router-dom';
import { ALL_GENERATIONS } from '@/components/GenerationFacet';
import { TYPE_COLORS, typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';

const ALL_TYPES = Object.keys(TYPE_COLORS);

// The Pokédex half of the header nav, mirroring ShopMegaMenu on the commerce side -- browse the
// content index by generation or species type. Both lists navigate to /search carrying a
// `presetContentFacet` router state, the exact mechanism the detail pages' Generation/Type
// breadcrumb selects already use (see SearchResultsPage's presetContentFacet effect): the content
// facets are static Headless controllers, and a numeric range or a type value has to be applied
// through them rather than through a cold `f-pokemongeneration=` URL param, which the URL manager
// can't restore before the facet's own first response has landed.
//
// Why this menu matters beyond convenience: without it the header offered one way in (Shop) for a
// two-sided product, which is most of what made the Pokédex read as a bolt-on rather than half the
// catalog.

function BrowseTile({
  to,
  state,
  onNavigate,
  children,
  className,
}: {
  to: string;
  /** Router state for the generation tiles' `presetContentFacet` handoff. Optional because the
   *  type tiles carry their intent in the URL instead (`?q=Fire`) -- see BrowseByType. */
  state?: unknown;
  onNavigate: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      state={state}
      onClick={onNavigate}
      className={
        className ??
        'card-hover flex items-center justify-center rounded-md border border-border bg-card px-2 py-1.5 text-sm font-semibold text-foreground'
      }
    >
      {children}
    </Link>
  );
}

export function BrowseByGeneration({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div>
      <span className="eyebrow">Browse by generation</span>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {ALL_GENERATIONS.map((gen) => (
          <BrowseTile
            key={gen}
            to="/search"
            state={{ presetContentFacet: { kind: 'generation', gen } }}
            onNavigate={onNavigate}
          >
            Gen {gen}
          </BrowseTile>
        ))}
      </div>
    </div>
  );
}

export function BrowseByType({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div>
      <span className="eyebrow">Browse by type</span>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ALL_TYPES.map((type) => {
          const c = typeColor(type);
          const Icon = typeIcon(type);
          return (
            <BrowseTile
              key={type}
              // A query, not a preset facet -- see the note on the home page's type tiles
              // (BrowseTiles.tsx). This is the route that filters BOTH zones; the preset-facet one
              // left the marketplace showing the whole catalog.
              to={`/search?q=${encodeURIComponent(type)}`}
              onNavigate={onNavigate}
              className="card-hover flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 text-xs font-semibold text-foreground"
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: c.bg }}
              >
                <Icon className="h-2.5 w-2.5" style={{ color: c.text }} />
              </span>
              {type}
            </BrowseTile>
          );
        })}
      </div>
    </div>
  );
}
