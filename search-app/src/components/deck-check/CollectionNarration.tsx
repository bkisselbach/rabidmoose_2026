import { useEffect, useState } from 'react';
import { AdvisorNarration } from '@/components/deck-check/AdvisorNarration';
import { narrateCollection } from '@/lib/collectionNarration';
import { cachedNarration } from '@/lib/narrationCache';
import { getActivePersona } from '@/lib/visitorId';
import type { CollectionRead } from '@/lib/gapEngine';

// The Set Collector's own generated read — the collection twin of DeckHealthNarration.
//
// A SECOND NARRATION, NOT THE SAME ONE MOVED. The two answer different questions from different
// facts: the deck lens narrates species, weaknesses and evolution gaps; this one narrates set
// completion, what finishing costs, and the shape of that bill. They have different prompts and
// different hard rules on the server (see api/deck-health.ts) because their failure modes differ —
// the deck lens must be kept off its own trained type-chart knowledge, and this one must be kept
// off claiming anything appreciated in value, which this catalog cannot support at all.
//
// KEYED ON THE COMPLETION SHAPE, not on the read object. `useCollectionCheck` recomputes its read
// on every deck edit, so keying on identity would re-narrate — and bill Gemini — every time a
// quantity stepper moved. The key below changes only when a set's actual completion changes.

export function CollectionNarration({ read }: { read: CollectionRead | null }) {
  const [text, setText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const key = read ? read.sets.map((s) => `${s.setName}:${s.held}/${s.stocked}`).join('|') : '';

  useEffect(() => {
    if (!read || read.sets.length === 0) {
      setText(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    const persona = getActivePersona();
    cachedNarration(`collection:${persona.key}:${key}`, () =>
      narrateCollection(
        read,
        persona.key === 'guest' ? undefined : { name: persona.name, subtitle: persona.subtitle },
        controller.signal
      )
    ).then((result) => {
      if (cancelled) return;
      setText(result);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the real dependency
  }, [key]);

  if (!read || read.sets.length === 0) return null;

  return (
    <AdvisorNarration
      label="Collection read"
      chipDetail="Gemini narrates the exact set-completion arithmetic shown in the tabs below -- which sets, how many cards, what finishing costs. It is given no price history and is instructed never to claim a card gained or lost value, because this catalog has none."
      text={text}
      isLoading={isLoading}
    />
  );
}
