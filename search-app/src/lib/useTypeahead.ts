import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InstantResults } from '@coveo/headless';
import type { InstantProducts, SearchBox as HeadlessSearchBox } from '@coveo/headless/commerce';
import { buildTypeaheadItems, loadVocabulary } from '@/lib/localSuggestions';
import { useCoveoState } from '@/lib/useCoveoState';

// State + timing brain of the SearchBox dropdown: owns the controller subscription, debounces
// the per-keystroke network work (querySuggest + instant products + instant Pokédex content),
// computes the merged server/local suggestion list, and debounces the hover/arrow preview.
//
// The input is deliberately *semi*-controlled: the commerce SearchBox controller's updateText()
// fires a querySuggest request internally on every call (headless has no way to opt out), so the
// keystroke-fresh value lives here in React state and updateText only runs on the trailing
// debounce. Typing 10 characters costs 2-3 requests instead of 10.

/** Trailing debounce for querySuggest + instant-products requests. */
const SUGGEST_DEBOUNCE_MS = 200;
/** Arrowing/hovering through suggestions updates the product preview on this shorter fuse --
 *  Coveo caches instant-products results per query (~1 min), so repeats are free. */
const PREVIEW_DEBOUNCE_MS = 150;

/** Reactive media query -- the dropdown caps at 8 suggestions on desktop, 5 on mobile. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useTypeahead(
  controller: HeadlessSearchBox,
  instantProducts: InstantProducts | undefined,
  maxItems: number,
  instantContent?: InstantResults
) {
  const searchBoxState = useCoveoState(controller);

  // What the user actually typed, updated per keystroke; the ref mirrors it for callbacks that
  // must read the latest value without re-binding.
  const [query, setQuery] = useState(controller.state.value);
  const queryRef = useRef(query);
  queryRef.current = query;
  // True while a debounced updateText is scheduled but hasn't run -- distinguishes "controller
  // is behind because the user is mid-word" from "someone else updated the controller".
  const pendingRef = useRef(false);

  // The local vocabulary is fetched once per page lifetime (module-cached), but only after a
  // search box is actually focused -- the home page shouldn't pay for ~1,100 names eagerly.
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const warmedRef = useRef(false);
  const warm = useCallback(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;
    loadVocabulary().then((vocab) => {
      setVocabulary(vocab);
      // Fetch failed (static entries only) -- let the next focus retry; loadVocabulary drops
      // its own cache in that case too.
      if (vocab.length < 100) warmedRef.current = false;
    });
  }, []);

  const networkTimer = useRef<number | undefined>(undefined);
  const previewTimer = useRef<number | undefined>(undefined);

  /** The input's onChange. The visible value updates immediately; the controller (and with it
   *  the querySuggest request updateText always fires) follows on the trailing debounce. An
   *  emptied field commits immediately via clear(), which resets suggestions without a fetch. */
  const onInputChange = useCallback(
    (text: string) => {
      setQuery(text);
      window.clearTimeout(networkTimer.current);
      pendingRef.current = false;
      if (text.trim() === '') {
        controller.clear();
        return;
      }
      pendingRef.current = true;
      networkTimer.current = window.setTimeout(() => {
        pendingRef.current = false;
        controller.updateText(text);
        instantProducts?.updateQuery(text);
        instantContent?.updateQuery(text);
      }, SUGGEST_DEBOUNCE_MS);
    },
    [controller, instantProducts, instantContent]
  );

  /** Commits the typed text to the controller before a submit/selection, cancelling any pending
   *  debounce so the search runs on what the user sees, not a 200ms-old value. */
  const ensureTextCommitted = useCallback(() => {
    window.clearTimeout(networkTimer.current);
    pendingRef.current = false;
    if (controller.state.value !== queryRef.current) controller.updateText(queryRef.current);
  }, [controller]);

  // Follow controller-side changes that didn't come from typing here: SearchResultsPage's URL
  // sync, selectEntry's own updateText, restores on navigation. Skipped while a debounce is
  // pending so a slow render can't stomp fresh keystrokes with the older controller value.
  const controllerValue = searchBoxState.value;
  useEffect(() => {
    if (pendingRef.current) return;
    if (controllerValue !== queryRef.current) setQuery(controllerValue);
  }, [controllerValue]);

  /** Hover/arrow-focus preview: retarget instant products/content to the highlighted suggestion. */
  const previewQuery = useCallback(
    (text: string) => {
      window.clearTimeout(previewTimer.current);
      previewTimer.current = window.setTimeout(() => {
        instantProducts?.updateQuery(text);
        instantContent?.updateQuery(text);
      }, PREVIEW_DEBOUNCE_MS);
    },
    [instantProducts, instantContent]
  );

  /** Highlight back on the input itself -- point the preview back at what the user typed. */
  const resetPreview = useCallback(() => {
    window.clearTimeout(previewTimer.current);
    instantProducts?.updateQuery(queryRef.current);
    instantContent?.updateQuery(queryRef.current);
  }, [instantProducts, instantContent]);

  useEffect(
    () => () => {
      window.clearTimeout(networkTimer.current);
      window.clearTimeout(previewTimer.current);
    },
    []
  );

  // Merged dropdown list: server PQS rows first, local vocabulary fills, fuzzy only when both
  // are empty -- see buildTypeaheadItems for the policy. Keyed on the *controller's* value (the
  // debounced one), so the list doesn't churn on every keystroke and fuzzy repairs don't flash
  // mid-word.
  const items = useMemo(
    () =>
      buildTypeaheadItems(
        controllerValue,
        searchBoxState.suggestions.map((s) => s.rawValue),
        vocabulary,
        maxItems
      ),
    [controllerValue, searchBoxState.suggestions, vocabulary, maxItems]
  );

  return { query, items, onInputChange, ensureTextCommitted, warm, previewQuery, resetPreview };
}
