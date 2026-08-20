// Thin client for api/deck-health.ts (deck-builder-advisor-plan.md Phase C). Same
// never-throws-self-hides contract as consultantChat.ts's askConsultant -- a narration failure
// degrades to no narration, not a broken page; DeckCheckPage's own deterministic sentence stays as
// the fallback (see its comment) either way.

import type { DeckSpecies, MissingStages } from '@/lib/deckCoverage';

export interface DeckHealthInput {
  species: DeckSpecies[];
  topWeaknesses: string[];
  weaknessCounts: Map<string, number>;
  missingStages: MissingStages[];
  deckCardCount: number;
  personaContext?: { name: string; subtitle: string };
}

export async function narrateDeckHealth(input: DeckHealthInput, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch('/api/deck-health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        species: input.species,
        topWeaknesses: input.topWeaknesses,
        weaknessCounts: [...input.weaknessCounts.entries()],
        missingStages: input.missingStages,
        deckCardCount: input.deckCardCount,
        personaContext: input.personaContext,
      }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.text === 'string' && data.text.length > 0 ? data.text : null;
  } catch {
    return null;
  }
}
