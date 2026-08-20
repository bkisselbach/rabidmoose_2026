import { useEffect, useState } from 'react';
import { CoveoChip } from '@/components/CoveoChip';
import { loadPokedexNames } from '@/lib/pokedexVocabulary';
import { buildTypeaheadItems, normalizeForMatch, type TypeaheadItem } from '@/lib/localSuggestions';
import { vaultSearchBox } from '@/vaultControllers';
import { useCoveoState } from '@/lib/useCoveoState';

const MAX_SUGGESTIONS = 8;

export function useVaultTypeahead(input: string): TypeaheadItem[] {
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const suggestBoxState = useCoveoState(vaultSearchBox);

  useEffect(() => {
    if (input.trim().length === 0 || vocabulary.length > 0) return;
    loadPokedexNames().then(setVocabulary);
  }, [input, vocabulary.length]);

  if (input.trim().length === 0) return [];
  const serverRows = suggestBoxState.suggestions.map((s) => s.rawValue);
  return buildTypeaheadItems(input, serverRows, vocabulary, MAX_SUGGESTIONS);
}

/** Server suggestions merge with local species vocabulary (server first, local fills the rest --
 *  PQS has a history of serving empty). Presentation-only: PokedexVaultPage owns the `<input>`. */
export function VaultSearchSuggestions({
  open,
  items,
  highlighted,
  onHighlight,
  onSelect,
}: {
  open: boolean;
  items: TypeaheadItem[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onSelect: (value: string) => void;
}) {
  if (!open || items.length === 0) return null;

  return (
    <div className="popover-content absolute left-0 right-0 top-full z-20 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border bg-card p-1.5">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="eyebrow">Suggestions</span>
        {items.some((i) => i.source === 'coveo') && <CoveoChip capability="query-suggest" />}
      </div>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.source}-${normalizeForMatch(item.text)}`}>
            <button
              type="button"
              onMouseDown={(e) => {
                // mousedown fires before the input's onBlur closes this panel.
                e.preventDefault();
                onSelect(item.text);
              }}
              onMouseEnter={() => onHighlight(index)}
              className={`pressable flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                highlighted === index ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
              }`}
            >
              {item.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
