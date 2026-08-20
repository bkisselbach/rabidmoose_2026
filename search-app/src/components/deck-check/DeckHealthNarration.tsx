import { useEffect, useRef, useState } from 'react';
import { AdvisorNarration } from '@/components/deck-check/AdvisorNarration';
import { narrateDeckHealth } from '@/lib/deckHealthNarration';
import { cachedNarration } from '@/lib/narrationCache';
import { getActivePersona } from '@/lib/visitorId';
import type { DeckSpecies, MissingStages } from '@/lib/deckCoverage';

// The Gemini-narrated read. Sits ABOVE the deterministic type-exposure grid, not in place of it:
// the grid stays the auditable ground truth this narration is grounded in, same relationship RGA's
// answer has to the passages underneath it elsewhere in this app.
//
// Self-hides on any failure (misconfigured env, network error) rather than showing a broken panel
// -- DeckCheckPage's existing deterministic "biggest hole" sentence is the honest fallback below.
// It now REPORTS that outcome upward (`onNarrated`) instead of only acting on it silently, because
// the fallback and the narration were saying the same thing in two similar-weight blocks whenever
// both rendered. The page needs to know which case it is in to demote one of them; see the compact
// ground-truth strip in DeckCheckPage. The contract is unchanged where it matters -- a failure
// still costs nothing but this panel.

interface Props {
  species: DeckSpecies[];
  topWeaknesses: string[];
  weaknessCounts: Map<string, number>;
  missingStages: MissingStages[];
  deckCardCount: number;
  /** Fires with whether a narration actually landed -- and with `null` the moment a new request
   *  starts, so the caller's "which shape is the deterministic read" decision goes back to pending
   *  instead of answering for a narration that is no longer on screen. Held in a ref below so a
   *  caller passing an inline arrow (every caller) can't retrigger the request. */
  onNarrated?: (narrated: boolean | null) => void;
}

export function DeckHealthNarration({ species, topWeaknesses, weaknessCounts, missingStages, deckCardCount, onNarrated }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const onNarratedRef = useRef(onNarrated);
  onNarratedRef.current = onNarrated;

  // A quantity-only deck change that doesn't move the species set or weaknesses shouldn't re-narrate.
  const key = `${species.map((s) => s.name).join(',')}|${topWeaknesses.join(',')}|${missingStages.map((m) => m.for).join(',')}`;

  useEffect(() => {
    if (species.length === 0) {
      setText(null);
      setIsLoading(false);
      onNarratedRef.current?.(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    onNarratedRef.current?.(null);
    const persona = getActivePersona();
    cachedNarration(`deck:${persona.key}:${key}`, () =>
      narrateDeckHealth(
        {
          species,
          topWeaknesses,
          weaknessCounts,
          missingStages,
          deckCardCount,
          personaContext: persona.key === 'guest' ? undefined : { name: persona.name, subtitle: persona.subtitle },
        },
        controller.signal
      )
    ).then((result) => {
      if (cancelled) return;
      setText(result);
      setIsLoading(false);
      onNarratedRef.current?.(result !== null);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the real dependency
  }, [key]);

  if (species.length === 0 || (!isLoading && !text)) return null;

  return (
    <AdvisorNarration
      label="Deck health"
      chipDetail="Gemini narrates the exact species/weakness/evolution-gap data computed in the tabs below -- it does not independently retrieve or invent facts about this deck."
      text={text}
      isLoading={isLoading}
    />
  );
}
