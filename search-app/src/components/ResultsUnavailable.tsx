import { useState } from 'react';
import { CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOOKUP_FAILED_QUIPS, pickQuip } from '@/lib/errorQuips';

/** The results-area counterpart to `ErrorPanel`: shown where a grid or list would go when the
 *  index did not answer at all.
 *
 *  It exists because every listing surface in this app was answering an outage with its EMPTY
 *  state. Measured 2026-08-19 by aborting every `*.coveo.com` request in the browser: `/pokedex`
 *  rendered "0 Pokémon · No Pokémon match that", `/pokemon-news` rendered "0 stories · No stories
 *  match that. Try a Pokémon name, a set, or a topic", and `/search` fell through to the empty-state
 *  recommendations (which need the same dead API). That is the same lie the three detail pages used
 *  to tell -- "we looked and there is nothing" when what happened is "we never got to look" -- and
 *  the advice it hands out is actively wrong: retyping the query cannot fix a request that failed.
 *
 *  Deliberately NOT `ErrorPanel`: this sits inside a page that still has its header, hero, facets
 *  and search box, so a mascot and a 6xl numeral would outrank the page it interrupts. Same voice,
 *  a quarter the volume.
 */
export function ResultsUnavailable({
  /** Plural noun for what could not be fetched, e.g. "cards", "Pokémon", "stories". */
  what,
  /** Re-runs the query. Every caller passes a real re-execute rather than a page reload -- the rest
   *  of the page (facets, query, scroll position) is still valid, and throwing it away to recover
   *  from a failed request is a worse trade than it looks. */
  onRetry,
  className,
}: {
  what: string;
  onRetry: () => void;
  className?: string;
}) {
  const [quip] = useState(() => pickQuip(LOOKUP_FAILED_QUIPS));

  return (
    <div
      // Same plate as the empty states it replaces, so the swap doesn't move the page around.
      className={`rounded-2xl border border-border bg-card px-6 py-16 text-center ${className ?? ''}`}
      role="status"
    >
      <CloudOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">Couldn&rsquo;t load {what}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{quip}</p>
      <Button className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
