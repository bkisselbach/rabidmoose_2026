import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { InstantResults } from '@coveo/headless';
import type {
  InstantProducts,
  Product,
  RecentQueriesList,
  SearchBox as HeadlessSearchBox,
} from '@coveo/headless/commerce';
import { Clock, Search, TrendingUp, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ProductCardMini } from '@/components/ProductCardMini';
import { PokedexCard } from '@/components/pokedex/PokedexCard';
import { CoveoChip } from '@/components/CoveoChip';
import { normalizeForMatch, POPULAR_QUERIES } from '@/lib/localSuggestions';
import { useMediaQuery, useTypeahead } from '@/lib/useTypeahead';
import { useOptionalCoveoState } from '@/lib/useCoveoState';
import { useInteractiveResults } from '@/lib/useInteractiveResult';
import { searchEngine } from '@/searchEngine';
import { cn } from '@/lib/utils';
import { CONTENT_FIELDS } from '@/contentFields';

interface Props {
  controller: HeadlessSearchBox;
  /** Powers the "Products" row of live product previews shown alongside text suggestions. Omit to show text suggestions only. */
  instantProducts?: InstantProducts;
  /** Powers the "Pokédex" row of live species previews shown alongside text suggestions and
   *  product previews -- the content-engine counterpart to instantProducts. Omit to skip it (a
   *  card-only surface, e.g. one scoped to a single set, has no use for species matches). */
  instantContent?: InstantResults;
  /** Powers the "Recent searches" panel shown when the box is focused and empty. Omit to skip it. */
  recentQueries?: RecentQueriesList;
  size?: 'default' | 'lg' | 'pill';
  /** Hero layout: when both suggestions and product previews are present, put queries in a left
   *  column and previews in a right one instead of stacking them. Falls back to the stacked
   *  layout whenever only one of the two has anything to show. */
  richDropdown?: boolean;
  /** Overrides the wrapper's width/sizing classes (e.g. to let it flex/fill in a header layout). */
  className?: string;
  /** Overrides the input placeholder -- the header box and the hero box want different framing. */
  placeholder?: string;
  /** Optional controls rendered right-aligned INSIDE the input (e.g. Type/Set quick-filter
   *  dropdowns on the home hero's box) -- pushes the input's own right padding out to make room,
   *  and sits to the left of the clear button so the two never collide. Omit for every other
   *  caller; only the hero passes this today. */
  rightSlot?: ReactNode;
  /** Default true. Whether the focused-but-empty panel's local "Popular" section renders. The
   *  /search Consultant panel (ConsultantPanel.tsx) passes false: its own live Trending pill row,
   *  fed by the real Recommendations slot, sits right under this box, and the dropdown's hardcoded
   *  local list would read as a second, contradictory "popular" claim beside it. Recent searches are
   *  unaffected either way. */
  showPopular?: boolean;
  /** Called with the submitted value (Enter, suggestion click, or recent query click), in addition to the controller's own submit -- lets a page sync the URL or navigate. */
  onSubmit?: (value: string) => void;
}

/** One row of the keyboard-navigable list. 'coveo' and 'local' are typed-query suggestions
 *  (distinguished for selection semantics + provenance chips); 'recent' and 'popular' populate
 *  the focused-but-empty panel. */
interface NavEntry {
  text: string;
  kind: 'coveo' | 'local' | 'recent' | 'popular';
}

/** Renders a suggestion with the *completion* bold and the typed portion regular (Baymard: the
 *  eye should land on what's new, not what was already typed). Matching is accent- and
 *  case-insensitive; a suggestion the query doesn't appear in (e.g. a fuzzy repair or a
 *  non-contiguous server match) renders all-regular rather than pretending a match. */
function SuggestionText({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    // Per-character normalization with an index map back into the original string, so accents
    // that decompose to multiple code points (Flabébé) can't skew the split offsets.
    const chars = [...text];
    let norm = '';
    const map: number[] = [];
    chars.forEach((ch, i) => {
      const nc = normalizeForMatch(ch);
      for (let k = 0; k < nc.length; k++) map.push(i);
      norm += nc;
    });
    const normQuery = normalizeForMatch(trimmed);
    const idx = norm.indexOf(normQuery);
    if (idx === -1 || normQuery.length === 0) return null;
    const start = map[idx];
    const end = map[idx + normQuery.length - 1];
    return {
      before: chars.slice(0, start).join(''),
      match: chars.slice(start, end + 1).join(''),
      after: chars.slice(end + 1).join(''),
    };
  }, [text, query]);

  if (!parts) return <>{text}</>;
  return (
    <>
      {parts.before && <b className="font-semibold">{parts.before}</b>}
      {parts.match}
      {parts.after && <b className="font-semibold">{parts.after}</b>}
    </>
  );
}

// The typeahead's product preview. The CARD itself is `ProductCardMini` (the card system's
// `mini` shape) -- this wrapper exists only for the one concern that is genuinely the typeahead's:
// building the interactiveProduct once per product rather than per keystroke.
function InstantProductPreview({
  product,
  instantProducts,
  onSelect,
}: {
  product: Product;
  instantProducts: InstantProducts;
  onSelect: () => void;
}) {
  // Built once per product rather than per parent render -- interactiveProduct instances carry
  // their own analytics bindings, so re-creating them on every keystroke is the classic
  // duplicate-event footgun.
  const interactiveProduct = useMemo(
    () => instantProducts.interactiveProduct({ options: { product } }),
    [instantProducts, product]
  );

  return <ProductCardMini product={product} interactiveProduct={interactiveProduct} onSelect={onSelect} />;
}

// The dropdown lives on the input's focus, so anything clickable inside it has to suppress the
// mousedown that would blur the input and unmount the panel mid-click.
function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pt-1.5 empty:hidden" onMouseDown={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}

export function SearchBox({
  controller,
  instantProducts,
  instantContent,
  recentQueries,
  size = 'default',
  richDropdown = false,
  className,
  placeholder = 'Search for a Pokémon or a card...',
  onSubmit,
  rightSlot,
  showPopular = true,
}: Props) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  // Baymard: <=10 suggestions on desktop, 4-8 on mobile -- users pick from the first few.
  const maxItems = isMobile ? 5 : 8;
  const { query, items, onInputChange, ensureTextCommitted, warm, previewQuery, resetPreview } = useTypeahead(
    controller,
    instantProducts,
    maxItems,
    instantContent
  );

  const instantProductsState = useOptionalCoveoState(instantProducts);
  const instantContentState = useOptionalCoveoState(instantContent);
  const recentQueriesState = useOptionalCoveoState(recentQueries);

  const [isFocused, setIsFocused] = useState(false);
  // Escape closes the panel without surrendering focus (first press); `dismissed` holds it shut
  // until the user types again, presses ArrowDown, or refocuses.
  const [dismissed, setDismissed] = useState(false);
  // -1 = the input itself; >=0 indexes into navEntries. The typed text is never overwritten by
  // arrowing -- the input just *displays* the active entry and falls back to state.value at -1.
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;
  const isLarge = size === 'lg';
  const isPill = size === 'pill';

  const hasQuery = query.trim().length > 0;
  const instantProductsToShow = instantProductsState?.products.slice(0, 4) ?? [];
  // buildInstantResults has a real gap (confirmed by reading @coveo/headless's own source,
  // features/search-and-folding/legacy/search-and-folding-request.js): unlike a normal search
  // request, it never reads state.tabSet, so it does NOT inherit searchEngine.ts's permanently-
  // selected pokedex-push Tab the way every other content-engine controller on this page does. The
  // org's index has a SECOND, unrelated source also named "Pokedex" (a crawled pokemondb.net
  // sitemap, sourcetype "Sitemap") that has no pokemon* fields at all -- so an ungated query like
  // "char" came back mostly crawled-page hits (dirty page-title text, no portrait) outranking the
  // one real pokedex-push match. Filtered back to pokedex-push here, client-side, since the
  // controller itself has no option to scope it and enabling global query syntax just to smuggle
  // an @source clause into updateQuery's `q` would change how every other typed query on this page
  // parses. Also re-ranked the same way local suggestions already rank typed text
  // (localSuggestions.ts): name starts with the query beats name contains the query beats the
  // server's own order.
  const instantContentToShow = useMemo(() => {
    const results = instantContentState?.results ?? [];
    const normQuery = normalizeForMatch(query.trim());
    // Belt-and-braces past the source filter: PokedexMatches.tsx already documented that a few
    // pokedex-push docs are missing pokemonimage (a real data gap, not this bug) -- worth keeping
    // this even though the source filter should make it rare now, since a blank tile reads as
    // broken and one fewer real tile doesn't.
    const ownSource = results.filter(
      (r) => (r.raw.source ?? r.raw.syssource) === 'pokedex-push' && !!r.raw[CONTENT_FIELDS.image]
    );
    const nameOf = (r: (typeof ownSource)[number]) =>
      normalizeForMatch(((r.raw[CONTENT_FIELDS.name] as string) ?? r.title) || '');
    // pokedex-push has no partial/prefix matching the way the local vocabulary or the commerce
    // catalog's own instant products apparently do -- it's a full-text index, so a short query like
    // "char" or "pika" often has ZERO documents whose NAME actually contains it (the one or two raw
    // hits that come back matched on unrelated flavor text instead, e.g. "char" -> Thundurus).
    // Widening maxResultsPerQuery (searchResultsControllers.ts) doesn't fix this -- verified live,
    // "char"'s total index-wide hit count for pokedex-push is 0-1 regardless of window size. A
    // confidently-wrong single tile reads worse than an empty row, so this row only renders once a
    // result's name is an ACTUAL match for what was typed, not merely "the best of what came back".
    const nameMatches = ownSource.filter((r) => nameOf(r).includes(normQuery));
    const ranked = [...nameMatches].sort((a, b) => {
      const rank = (r: (typeof ownSource)[number]) => (nameOf(r).startsWith(normQuery) ? 0 : 1);
      return rank(a) - rank(b);
    });
    return ranked.slice(0, 4);
  }, [instantContentState, query]);
  // Click tracking for the instant Pokédex row. `searchEngine` is the right engine: the
  // `contentInstantResults` controller behind these rows is built on it
  // (searchResultsControllers.ts). Keyed on the filtered/ranked array rather than the raw state,
  // so the controllers are rebuilt exactly when the visible rows change.
  const getInteractiveContentResult = useInteractiveResults(searchEngine, instantContentToShow);
  const recentToShow = recentQueriesState?.queries ?? [];
  // Popular defaults sit under recents; anything the user already searched recently is dropped
  // so the two sections never show the same row twice. Gated to [] in one place (rather than at
  // each of the three sites that read it) so `showPopular={false}` can't leave arrow-key nav
  // entries out of sync with what's actually rendered -- every downstream reader (navEntries,
  // showRecentPanel, the rendered section below) already treats an empty array as "nothing here".
  const popularToShow = showPopular
    ? POPULAR_QUERIES.filter((q) => !recentToShow.some((r) => normalizeForMatch(r) === normalizeForMatch(q)))
    : [];

  // Recent searches that contain what's being typed rank above everything else -- they're the
  // strongest personal signal there is ("char" -> your own "base set charizard" from yesterday).
  const MAX_RECENT_WHILE_TYPING = 2;
  const suggestionEntries: NavEntry[] = useMemo(() => {
    if (!hasQuery) return [];
    const normTyped = normalizeForMatch(query.trim()).replace(/\s+/g, ' ');
    const recents = recentToShow
      .filter((r) => {
        const nr = normalizeForMatch(r);
        return nr !== normTyped && nr.includes(normTyped);
      })
      .slice(0, MAX_RECENT_WHILE_TYPING);
    const rest = items.filter((item) => !recents.some((r) => normalizeForMatch(r) === normalizeForMatch(item.text)));
    return [
      ...recents.map((q): NavEntry => ({ text: q, kind: 'recent' })),
      ...rest.map((item): NavEntry => ({ text: item.text, kind: item.source })),
    ].slice(0, maxItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the rendered rows below
  }, [hasQuery, query, items, recentToShow.join('|'), maxItems]);

  const showSuggestionsPanel =
    isFocused &&
    !dismissed &&
    hasQuery &&
    (suggestionEntries.length > 0 || instantProductsToShow.length > 0 || instantContentToShow.length > 0);
  // The split layout engages only where a two-column row can actually fit comfortably -- a
  // narrower condition than "not mobile". Below xl the panel stays w-full and stacked (a single
  // column of suggestions, then products/species below), which reads fine at tablet/mobile widths
  // and avoids squeezing two ~18rem halves into a column that has no room for them yet.
  const isWide = useMediaQuery('(min-width: 1280px)');
  const twoColumn =
    richDropdown &&
    isWide &&
    suggestionEntries.length > 0 &&
    (instantProductsToShow.length > 0 || instantContentToShow.length > 0);
  const showRecentPanel =
    isFocused && !dismissed && !hasQuery && !!recentQueries && recentToShow.length + popularToShow.length > 0;
  const panelOpen = showSuggestionsPanel || showRecentPanel;

  // The single flat list the arrow keys walk: merged suggestions while typing, recents +
  // populars when empty. Instant products stay pointer-only.
  const navEntries: NavEntry[] = useMemo(() => {
    if (hasQuery) return suggestionEntries;
    if (!recentQueries) return [];
    return [
      ...recentToShow.map((q): NavEntry => ({ text: q, kind: 'recent' })),
      ...popularToShow.map((q): NavEntry => ({ text: q, kind: 'popular' })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the rendered rows below
  }, [hasQuery, suggestionEntries, recentQueries, recentToShow.join('|'), popularToShow.join('|')]);

  // Server suggestions land async -- when the row set changes under the highlight, snap back to
  // the input rather than leaving a stale row highlighted.
  const navKey = navEntries.map((e) => `${e.kind}:${e.text}`).join('|');
  useEffect(() => setActiveIndex(-1), [navKey]);

  const closePanel = () => {
    setIsFocused(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  /** Enter on the raw typed text (no highlighted row). The typed value may still be sitting in
   *  the debounce, so it's committed to the controller first. */
  const submitTyped = (value: string) => {
    ensureTextCommitted();
    controller.submit();
    onSubmit?.(value);
    closePanel();
  };

  /** A highlighted/clicked row. Server suggestions go through selectSuggestion -- it runs the
   *  search *and* emits the query-suggestion analytics click itself, so adding submit() on top
   *  (the old behavior) double-fired both. Local rows must NOT call selectSuggestion: they're
   *  not in the controller's state and mustn't masquerade as ML suggestion clicks. */
  const selectEntry = (entry: NavEntry) => {
    if (entry.kind === 'coveo') {
      controller.selectSuggestion(entry.text);
      onSubmit?.(entry.text);
      closePanel();
    } else {
      controller.updateText(entry.text);
      controller.submit();
      onSubmit?.(entry.text);
      closePanel();
    }
  };

  const clearInput = () => {
    onInputChange('');
    setActiveIndex(-1);
    setDismissed(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (dismissed) {
        setDismissed(false);
        return;
      }
      if (!panelOpen || navEntries.length === 0) return;
      e.preventDefault();
      let next = activeIndex + (e.key === 'ArrowDown' ? 1 : -1);
      // Loop through -1 (the input itself): ...last -> input -> first...
      if (next >= navEntries.length) next = -1;
      else if (next < -1) next = navEntries.length - 1;
      setActiveIndex(next);
      if (next === -1) resetPreview();
      else previewQuery(navEntries[next].text);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && navEntries[activeIndex]) selectEntry(navEntries[activeIndex]);
      else submitTyped(query);
    } else if (e.key === 'Escape') {
      if (panelOpen) {
        setDismissed(true);
        setActiveIndex(-1);
      } else {
        closePanel();
      }
    }
  };

  const suggestionRowClass = (index: number) =>
    cn(
      'cursor-pointer px-4 text-sm',
      isMobile ? 'py-2.5' : 'py-2',
      index === activeIndex && 'bg-muted'
    );

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full', isLarge ? 'max-w-2xl' : isPill ? 'max-w-xl flex-1' : 'max-w-3xl flex-1', className)}
    >
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          isLarge ? 'left-5 h-5 w-5' : isPill ? 'left-3.5 h-4 w-4' : 'left-4 h-[1.1rem] w-[1.1rem]'
        )}
      />
      <Input
        ref={inputRef}
        className={cn(
          isPill ? 'h-10 rounded-full border-border pl-9 text-sm shadow-none' : 'border-foreground/25 shadow-rest',
          !isPill && (isLarge ? 'h-14 pl-[3.25rem] text-base' : 'h-12 pl-11 text-sm'),
          // rightSlot reserves its own room, wide enough for the hero's Type+Set dropdown pair
          // plus the clear button when both are showing at once -- the two never actually
          // overlap, rightSlot is rendered to the LEFT of the clear button (see below).
          rightSlot
            ? hasQuery
              ? 'pr-[10.5rem]'
              : 'pr-32'
            : hasQuery
              ? isPill
                ? 'pr-8'
                : 'pr-10'
              : isPill
                ? 'pr-4'
                : undefined
        )}
        // type="text", not "search": WebKit's native clear button on type="search" wipes the field
        // without firing React's onChange, stranding the controller state. The X button below is
        // the sanctioned replacement.
        type="text"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={panelOpen}
        aria-controls={panelOpen ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        placeholder={placeholder}
        value={activeIndex >= 0 && navEntries[activeIndex] ? navEntries[activeIndex].text : query}
        onChange={(e) => {
          setActiveIndex(-1);
          setDismissed(false);
          onInputChange(e.target.value);
        }}
        onFocus={() => {
          setIsFocused(true);
          setDismissed(false);
          warm();
        }}
        onBlur={(e) => {
          if (containerRef.current?.contains(e.relatedTarget as Node)) return;
          setIsFocused(false);
          setActiveIndex(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {rightSlot && (
        <div
          className={cn('absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5', hasQuery ? 'right-9' : 'right-2.5')}
          // Suppresses the input's blur when a dropdown trigger inside rightSlot is clicked --
          // same guard every other in-panel control in this file already uses (ChipRow, the
          // suggestion rows), so clicking a filter doesn't close the input first.
          onMouseDown={(e) => e.preventDefault()}
        >
          {rightSlot}
        </div>
      )}
      {hasQuery && (
        <button
          type="button"
          aria-label="Clear search"
          className={cn(
            'pressable',
            'absolute top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground',
            isLarge ? 'right-4' : isPill ? 'right-2.5' : 'right-3'
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearInput}
        >
          <X className={isLarge ? 'h-5 w-5' : 'h-4 w-4'} />
        </button>
      )}
      {/* The page-dimming backdrop that used to sit here is gone (2026-08-14). It was gated on
          size="lg" and documented as hero-only -- "under the sticky header it would just flicker" --
          and the home hero's search box is what handed search to the header, so it had no caller
          left. Deliberately NOT re-pointed at the pill: that flicker judgement still holds for a
          dropdown attached to a sticky header. The `lg` and `default` size variants themselves stay;
          only `pill` is used today, but they're a shared component's public shape, not dead code to
          strip because of one refactor. */}
      {showSuggestionsPanel && (
        <div
          data-state="open"
          className={cn(
            'popover-content absolute z-10 mt-1.5 w-full rounded-md border border-border bg-card py-1.5 text-left',
            // Both live richDropdown callers (the home hero, the /search Consultant panel) run
            // their input at the full width of a wide column, not the header's old narrow pill --
            // so the two-column split now tracks the input's own w-full instead of a fixed 42rem
            // that used to just barely clear that pill. min-w keeps the split usable if a future
            // caller ever does run this narrower than ~36rem, without capping the wide case.
            twoColumn && 'grid min-w-[36rem] grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 divide-x divide-border'
          )}
        >
          {suggestionEntries.length > 0 && (
            <ul
              role="listbox"
              id={listboxId}
              aria-label="Search suggestions"
              className={cn(twoColumn && 'py-0.5')}
              onMouseLeave={() => setActiveIndex(-1)}
            >
              {suggestionEntries.map((entry, i) => (
                <li
                  key={`${entry.kind}:${entry.text}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={cn(suggestionRowClass(i), entry.kind === 'recent' && 'flex items-center gap-2')}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    setActiveIndex(i);
                    previewQuery(entry.text);
                  }}
                  onClick={() => selectEntry(entry)}
                >
                  {entry.kind === 'recent' && (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <SuggestionText text={entry.text} query={query} />
                </li>
              ))}
            </ul>
          )}
          {(instantProductsToShow.length > 0 || instantContentToShow.length > 0) && (
            <div
              className={cn(
                'space-y-2.5',
                !twoColumn && suggestionEntries.length > 0 && 'mt-1.5 border-t border-border pt-1.5',
                twoColumn && 'pl-2'
              )}
            >
              {instantProductsToShow.length > 0 && (
                <div>
                  <div className="px-4 pb-1 eyebrow">Products</div>
                  <div className="no-scrollbar flex gap-2 overflow-x-auto px-2 pb-1">
                    {instantProductsToShow.map((product) => (
                      <InstantProductPreview
                        key={product.ec_product_id ?? product.permanentid}
                        product={product}
                        instantProducts={instantProducts!}
                        onSelect={closePanel}
                      />
                    ))}
                  </div>
                </div>
              )}
              {instantContentToShow.length > 0 && (
                <div>
                  <div className="px-4 pb-1 eyebrow">Pok&eacute;dex</div>
                  {/* PokedexCard is a shared tile (also the Vault grid, the /search rail) built as
                      a plain Link with no dropdown awareness -- the mousedown guard belongs at this
                      call site, same as every other in-panel control here, not baked into the tile
                      itself for one caller's benefit. */}
                  <div
                    className="no-scrollbar flex gap-2 overflow-x-auto px-2 pb-1"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {instantContentToShow.map((result) => (
                      <PokedexCard
                        key={result.uniqueId}
                        result={result}
                        size="sm"
                        showMeta={false}
                        className="snap-start"
                        onClick={closePanel}
                        interactiveResult={getInteractiveContentResult(result)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Demo Mode only: the capabilities behind this one dropdown -- and honestly. The ML
              query-suggest entry only appears when at least one row actually came from the PQS
              model; purely local rows count toward local-typeahead instead. onMouseDown-prevented
              like every other control in here, or the input's blur closes the panel first. */}
          <ChipRow>
            <CoveoChip
              capability={[
                ...(suggestionEntries.some((e) => e.kind === 'coveo') ? (['query-suggest'] as const) : []),
                ...(suggestionEntries.some((e) => e.kind === 'local') ? (['local-typeahead'] as const) : []),
                ...(instantProductsToShow.length > 0 ? (['instant-products'] as const) : []),
                ...(instantContentToShow.length > 0 ? (['instant-pokedex'] as const) : []),
              ]}
            />
          </ChipRow>
        </div>
      )}
      {showRecentPanel && (
        <div
          data-state="open"
          id={listboxId}
          role="listbox"
          aria-label="Recent and popular searches"
          className="popover-content absolute z-10 mt-1.5 w-full rounded-md border border-border bg-card py-1.5"
          onMouseLeave={() => setActiveIndex(-1)}
        >
          {recentToShow.length > 0 && (
            <>
              <div role="presentation" className="flex items-center justify-between px-4 py-1">
                <span className="eyebrow">
                  Recent searches
                </span>
                <button
                  type="button"
                  className="pressable text-2xs text-muted-foreground hover:text-foreground"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => recentQueries!.clear()}
                >
                  Clear
                </button>
              </div>
              <ul role="presentation">
                {recentToShow.map((q, i) => (
                  <li
                    key={`recent-${q}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={cn('flex items-center gap-2', suggestionRowClass(i))}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => selectEntry({ text: q, kind: 'recent' })}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {q}
                  </li>
                ))}
              </ul>
            </>
          )}
          {popularToShow.length > 0 && (
            <>
              <div role="presentation" className={cn('px-4 py-1', recentToShow.length > 0 && 'mt-1 border-t border-border pt-2')}>
                <span className="eyebrow">
                  Popular
                </span>
              </div>
              <ul role="presentation">
                {popularToShow.map((q, i) => {
                  const navIndex = recentToShow.length + i;
                  return (
                    <li
                      key={`popular-${q}`}
                      id={optionId(navIndex)}
                      role="option"
                      aria-selected={navIndex === activeIndex}
                      className={cn('flex items-center gap-2', suggestionRowClass(navIndex))}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveIndex(navIndex)}
                      onClick={() => selectEntry({ text: q, kind: 'popular' })}
                    >
                      <TrendingUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {q}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
