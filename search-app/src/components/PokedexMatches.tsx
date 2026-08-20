import { Link, useLocation } from 'react-router-dom';
import type { Result } from '@coveo/headless';
import { CoveoChip } from '@/components/CoveoChip';
import { RailArrows } from '@/components/RailArrows';
import { PokedexCard, PokedexCardSkeleton } from '@/components/pokedex/PokedexCard';
import { searchEngine } from '@/searchEngine';
import { useInteractiveResults } from '@/lib/useInteractiveResult';
import { useScrollRail } from '@/lib/useScrollRail';
import { isSemanticEncoderExample } from '@/lib/semanticEncoderExample';
import { dealInProps } from '@/lib/dealIn';

interface Props {
  results: Result[];
  /** Pre-debounced by the caller (see useSettledLoading) -- true only once loading has persisted
   *  past its onDelay, and stays true across brief gaps in a multi-request burst rather than
   *  dropping the instant one intermediate response lands. This component trusts that contract:
   *  it shows the skeleton for as long as this is true and never renders `null` while it is, so a
   *  stale or momentarily-empty in-flight response can't make the whole rail vanish and reappear. */
  isLoading: boolean;
  /** Total species matched. The page now requests enough results to render every match for any
   *  realistic query or facet browse (see POKEDEX_RAIL_RESULTS in SearchResultsPage), so this only
   *  exceeds `results.length` past that cap -- browsing the whole dex, essentially. Labels
   *  honestly when it does. */
  total?: number;
  /** Every Pokédex type this rail is currently filtered to -- the Card Consultant's derived counter
   *  types, a hand-clicked Type facet, or a type tile alike. Used only to ORDER each species' own
   *  types (see PokedexCard's pokedexCardFields); it never adds or removes a species, and it never
   *  hides a type. */
  filteredTypes?: readonly string[];
  /** The raw text query driving this rail, if any -- only read to gate the semantic-encoder chip
   *  (see lib/semanticEncoderExample.ts) against the one query that's actually been verified to
   *  demonstrate it. */
  query?: string;
}

function PokedexSkeleton() {
  return (
    <div className="mb-6 flex gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <PokedexCardSkeleton key={i} size="sm" />
      ))}
    </div>
  );
}

export function PokedexMatches({ results, isLoading, total, filteredTypes = [], query }: Props) {
  // Same rail mechanics as the home page's trending cards, from the same hook -- the two are one
  // interaction with two sets of contents, so they scroll, page, and hide their arrows alike.
  const rail = useScrollRail(results.length);
  const location = useLocation();

  // `searchEngine`, because that is the engine whose query produced this rail -- /search's Pokédex
  // half. Called above the early returns below, since it holds a ref.
  const getInteractiveResult = useInteractiveResults(searchEngine, results);

  // `isLoading` is already debounced on both edges by the caller (useSettledLoading), so a fast
  // response never shows this skeleton at all -- it goes straight from nothing to the real rail
  // with one fade-in -- and a slower one shows the skeleton for the whole burst rather than
  // flickering it on and off as intermediate responses land. Checked BEFORE `results.length`, on
  // every load and not just the first, so a request still settling can never make the rail drop
  // to `null` and reappear even if its results happen to be empty mid-flight.
  if (isLoading) return <PokedexSkeleton />;
  if (results.length === 0) return null;

  // Every match is in the rail up to the request cap, so the capped case is now the rare one:
  // browsing the dex with nothing selected matches ~1025 species and no rail should be that long.
  // Silently labeling a capped set as the whole thing would misrepresent the index, so it says so
  // -- and the uncapped case still gets a real count rather than an empty header.
  const isCapped = total != null && total > results.length;

  return (
    // No card chrome (direct instruction) -- a bordered box around the strip cost padding on both
    // axes for no information the strip doesn't already carry on its own, so this now sits directly
    // in the page flow: a plain header row, the rail right under it.
    <div className="fade-in-panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {isCapped ? (
              <>
                Showing the top <span className="font-semibold text-foreground tabular-nums">{results.length}</span> of{' '}
                <span className="font-semibold text-foreground tabular-nums">{total}</span> Pok&eacute;mon
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground tabular-nums">{results.length}</span> Pok&eacute;mon match
                {results.length === 1 ? '' : 'es'}
              </>
            )}
          </p>
          {/* Moved out of the card's own footer and combined with the count here (2026-08-16,
              direct instruction) -- footer removed since this link was its only content.
              Same query/facets, but the Pokédex zone gets the whole page (see browseZone in
              SearchResultsPage) -- a plain facet browse is where the 200-species cap actually
              bites, and this is where a shopper goes to see that zone on its own. A text query
              still shows both zones per that page's own rule (typing a search doesn't hand the
              page to one zone), so this is a meaningful destination in the common case rather
              than a link that visibly does nothing. */}
          <Link
            to={{ pathname: location.pathname, search: location.search }}
            state={{ ...(location.state as Record<string, unknown> | null), browseZone: 'pokedex' }}
            className="text-sm font-semibold text-primary hover:underline"
          >
            See all matches &rarr;
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {/* One marker for the rail, listing whatever is serving it -- see PokedexVaultPage for
              the same merge on the same pair. */}
          <CoveoChip
            capability={[
              'pokedex-index',
              ...(isSemanticEncoderExample(query)
                ? [
                    {
                      capability: 'semantic-encoder' as const,
                      detailSuffix:
                        'On this query: Charmander and Charizard out-rank Salandit despite all three matching the same words ("lizard", "flame", "tail", "fire") — real cosine similarity, 586 and 282 vs. Salandit’s 0. It reranks keyword matches by meaning; retrieving on meaning alone is Passage Retrieval’s job (the Vault’s “Describe it” finder).',
                    },
                  ]
                : []),
            ]}
          />
          <RailArrows rail={rail} label="Pokémon" />
        </div>
      </div>
      <div
        ref={rail.railRef}
        onScroll={rail.onScroll}
        className="no-scrollbar flex snap-x gap-4 overflow-x-auto pb-1"
      >
        {results.map((r, index) => (
          <div key={r.uniqueId} {...dealInProps(index, 'flex shrink-0 snap-start')}>
            <PokedexCard
              result={r}
              size="sm"
              filteredTypes={filteredTypes}
              showMeta={false}
              interactiveResult={getInteractiveResult(r)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
