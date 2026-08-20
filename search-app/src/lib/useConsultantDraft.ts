import { useEffect, useMemo, useState } from 'react';
import {
  budgetOptionsFromTiers,
  composeSentence,
  isEmptySelection,
  selectionFromSentence,
  type BudgetOption,
  type ConsultantMode,
  type ConsultantSelection,
} from '@/lib/consultantSentence';
import { loadPriceTiers } from '@/lib/priceIntent';
import { resolveRarityTerms } from '@/lib/cardRarities';
import { RARITY_TERMS } from '@/lib/queryIntent';
import { useQueryUnderstanding, type QueryUnderstanding } from '@/lib/useQueryUnderstanding';

// The Consultant's state machine. One string of state, two ways to edit it, one reading derived
// from it -- see consultantSentence.ts for why the sentence is the only currency.
//
//        setSelection()                          parseQuery()
//   controls ──────────► draft: string ───────────────────────► reading
//        ▲                    ▲                                    │
//        └── selectionFromSentence() ◄── typing ──┘                │
//                                                                   └─► rendered as chips
//
// The controls are NOT separate state. They are derived from the draft on every render, which is
// what makes the two inputs incapable of disagreeing: there is nothing to keep in sync.

/** How long the box sits quiet before the reading strip runs its index lookups. */
const READING_DEBOUNCE_MS = 300;

export interface ConsultantDraft {
  /** The literal sentence that will be sent. Rendered to the user verbatim -- never prettified. */
  draft: string;
  /** Free-text edit. */
  setDraft: (next: string) => void;
  /** The draft read back as composer state. Derived, never stored. */
  selection: ConsultantSelection;
  /** Control edit: patch the selection and rewrite the sentence from it. */
  setSelection: (patch: Partial<ConsultantSelection>) => void;
  /** Live "how we read that", from the SAME parser + resolvers the results page uses. */
  understanding: QueryUnderstanding;
  /** True while the debounce is still holding, so the strip can avoid flashing a stale reading. */
  isSettling: boolean;
  /** Budget bands straight off the live ec_price facet -- the merchandiser's own tiers. */
  budgetOptions: BudgetOption[];
  /** Rarity words the live catalog can actually honour (see below). */
  rarityOptions: string[];
  /** Nothing actionable selected -- submit stays disabled rather than browsing the whole catalog. */
  isEmpty: boolean;
}

export function useConsultantDraft(initial = ''): ConsultantDraft {
  const [draft, setDraft] = useState(initial);

  // Debounced only for the *reading*, never for the text itself -- the box must stay perfectly
  // responsive. The index lookups behind useQueryUnderstanding are already keyed on serialized
  // constraint sets (so "fir" -> "fire" is what costs a request, not every keystroke) and
  // typeMatchups caches for the page's lifetime, but a partial word like "fir" would still fire a
  // Fire lookup on its way to "Fire". 300ms is enough to skip those.
  const [settled, setSettled] = useState(initial);
  useEffect(() => {
    const t = setTimeout(() => setSettled(draft), READING_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft]);

  // Mode is the one dimension a sentence cannot always express, and it needs its own home for
  // exactly that case. "Show me cards" is modeless -- there are no types in it for a counter cue to
  // attach to -- so deriving mode purely from the text meant an empty box always read as `collect`,
  // and pressing "Beat" on an empty box composed back to the collect frame and silently sprang back.
  // So: the sentence wins whenever it actually says something (it has types), and this preference
  // covers the gap when it doesn't. Everything else stays derived.
  const [modePref, setModePref] = useState<ConsultantMode>('beat');

  const parsed = useMemo(() => selectionFromSentence(draft), [draft]);
  const selection: ConsultantSelection = {
    ...parsed,
    mode: parsed.types.length > 0 ? parsed.mode : modePref,
  };

  // Typed text that DOES express a mode ("I need to defeat Rock types") moves the toggle with it,
  // so clearing the types afterwards doesn't snap back to a preference the shopper never chose.
  useEffect(() => {
    if (parsed.types.length > 0 && parsed.mode !== modePref) setModePref(parsed.mode);
  }, [parsed.types.length, parsed.mode, modePref]);

  const understanding = useQueryUnderstanding(settled);

  const setSelection = (patch: Partial<ConsultantSelection>) => {
    if (patch.mode) setModePref(patch.mode);
    setDraft(composeSentence({ ...selection, ...patch }));
  };

  // Live vocabularies. Both loaders are session-cached promises shared with the results page, so
  // warming them here costs one request each per visit and makes the reading strip resolve
  // instantly afterwards.
  const [budgetOptions, setBudgetOptions] = useState<BudgetOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadPriceTiers().then((tiers) => {
      if (!cancelled) setBudgetOptions(budgetOptionsFromTiers(tiers));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only offer rarity words the catalog can actually honour. The parser's RARITY_TERMS list is
  // deliberately loose and includes words this catalog has no tier for ("shiny", "promo"); putting
  // those in a menu would be offering a filter that silently does nothing, which is exactly the
  // mistake the results-page banner already refuses to make with `matchedRarityTerms`. Same rule,
  // moved one step earlier: don't offer it, rather than offer it and then not apply it.
  const [rarityOptions, setRarityOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    resolveRarityTerms([...RARITY_TERMS]).then((resolutions) => {
      if (!cancelled) setRarityOptions(resolutions.filter((r) => r.values.length > 0).map((r) => r.term));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    draft,
    setDraft,
    selection,
    setSelection,
    understanding,
    isSettling: settled !== draft,
    budgetOptions,
    rarityOptions,
    isEmpty: isEmptySelection(selection),
  };
}
