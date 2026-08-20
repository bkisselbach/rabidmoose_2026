import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MessagesSquare, RotateCcw, Sparkles } from 'lucide-react';
import type { InstantResults } from '@coveo/headless';
import type { InstantProducts, RecentQueriesList, SearchBox as HeadlessSearchBox } from '@coveo/headless/commerce';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { PanelTitle } from '@/components/PanelTitle';
import { SearchBox } from '@/components/SearchBox';
import { TrendingQueryPills } from '@/components/search-results/TrendingQueryPills';
import { SEMANTIC_ENCODER_EXAMPLE_QUERY } from '@/lib/semanticEncoderExample';
import { useThread, clearThread } from '@/lib/consultantThread';
import { sendConsultantTurn, useTurnInFlight } from '@/lib/consultantTurn';
import type { PersonaContext } from '@/lib/consultantChat';

/** /search's top-of-page consultation: the search box, its typeahead, the live Trending pills, and
 *  every piece of "here's what we did with your words" feedback (Did You Mean, the fuzzy fallback,
 *  the query-understanding banner, the generated answer), all inside one card instead of four
 *  separately-framed boxes stacked down the page. Header lockup reuses
 *  consultant/CardConsultant.tsx's copy verbatim -- same feature, same words, two surfaces.
 *
 *  TWO sizes, both settled rather than content-tracking (2026-08-18, direct request: "make that
 *  card smaller by default and let it grow to a fixed height once content appears"). Before this
 *  the card sat at the full 28rem in every state, which on a bare browse -- header, trending
 *  pills, one chip -- left roughly 200px of empty plate under the chip.
 *
 *  Once the response zone has anything in it the card is a fixed-height chat shell, and that is
 *  still NOT a `max-h`: sizing to content let it grow turn by turn until it happened to pass the
 *  cap, reading as "still resizing" through the whole first stretch of any conversation. The
 *  collapsed state has no such problem -- its content (pills + chip) is static -- so it just sizes
 *  to content below `md`, where the pills wrap to two or three lines, and takes a matching fixed
 *  height above it so the grow-on-content step has two real numbers to animate between.
 *
 *  That fixed number went 256px -> 288px (`md:h-64` -> `md:h-72`) when the composer moved out of
 *  the header and into the footer. It is not a taste change: the header shed the search box (~68px)
 *  but the footer gained it (~73px with its own padding and border), so the scrolling middle came
 *  out ~17px short of its own static content and clipped the semantic-encoder chip in half. Both
 *  states of a two-number animation have to be measured against what is actually in them.
 *
 *  Header (title + search box) and footer (GeminiConsultantAnswer's own follow-up input) stay
 *  pinned, and only the middle scrolls. `children` is that scrolling middle: each child already
 *  self-hides (returns null) when it has nothing to say for the current query, so wrapping them in
 *  one `space-y-3 empty:hidden` div needs no coordination from here.
 *
 *  Which size is showing is OBSERVED off that wrapper, not derived from "is there a query". A
 *  query is not the signal: GeminiConsultantAnswer returns null until its first turn arrives (or
 *  its delayed skeleton fires), so growing on `!isBrowsing` would reopen the exact 200px void this
 *  closed, just on the query route instead of the browse one.
 *
 *  Nor is "the wrapper has child elements" the signal, which was this component's first attempt at
 *  it. When a consultant turn FAILS (the /api/consultant proxy 502s -- reproduced live against an
 *  exhausted Gemini quota), GeminiConsultantAnswer still renders its outer container: the user turn
 *  exists, so it is past its `return null` gate, but the pair has no answer to print and its one
 *  header child, an icon-only CoveoChip, paints no text. That is a real element, zero visible ink,
 *  and counting it grew the card to 28rem to show nothing at all -- the void again, on the one code
 *  path where the page has the least to say for itself.
 *
 *  So the test is for actual INK: rendered text, or a visible loading skeleton (`.skeleton`, the
 *  shimmer class in index.css) for the delayed-reveal turn that has not landed yet. Text arriving
 *  is a `characterData` mutation rather than a `childList` one -- react-markdown mutates existing
 *  text nodes across a re-render -- hence the subtree/characterData observer rather than a
 *  childList-only one. Nothing in the callback writes back into the wrapper, so there is no
 *  mutation or resize loop to guard against.
 *
 *  ONE COMPOSER, MODE-AWARE (2026-08-19, direct request: the panel had two text inputs -- this
 *  card's header search box and a separate follow-up input at the bottom of the transcript -- and
 *  "it feels like it should be like a chat with the ability to start over").
 *
 *  They were never two views of one thing, which is why the merge is a mode and not a deletion.
 *  The header box is the PAGE's search box: `commerceSearchBoxController` is the same controller
 *  instance the grid, facets, Pokédex rail and URL `q` all read, and it carries Coveo query
 *  suggestions, instant results (products AND species) and recent queries. The follow-up input
 *  appended a Gemini turn and touched nothing else.
 *
 *  So the single composer, now in the footer where a chat composer belongs, switches on `isBrowsing`:
 *
 *    no query  -> it IS the search box, dropdown and all. Submitting runs a real search, which is
 *                 what starts the conversation. Identical to what the header box did.
 *    a query   -> it is the chat composer. Submitting appends a turn. `q` deliberately stays at
 *                 turn-1's text (card-consultant-plan.md Phase 5's own rule) so the grid keeps
 *                 showing sensible results while the conversation goes conversational ("why?",
 *                 "which is best against water?"), and GeminiConsultantAnswer's per-turn
 *                 "Search for this ->" is how a follow-up gets pushed into the grid on demand.
 *
 *  "Start over" (header, conversation only) is the way back to the first mode: it clears the thread
 *  AND the query, so the composer becomes a search box again. Without it the merge would strand a
 *  shopper mid-conversation with no way to start a new search on this page -- SiteHeader.tsx
 *  deliberately owns no search box (see its own comment), so this composer is the only one /search
 *  has.
 *
 *  The Coveo typeahead is deliberately suppressed in conversation mode (`richDropdown` and the
 *  instant-result/recent-query controllers are simply not passed): query suggestions computed off
 *  conversational text are junk, and the panel would open over the transcript the shopper is
 *  reading. One "Start over" click brings the full box back.
 *
 *  The composer is a real `CardFooter`, a SIBLING of the scrolling CardContent, not the
 *  `sticky bottom-0` element inside it that the old follow-up input was. It has to be: the
 *  suggestion panel is `position: absolute`, so inside an `overflow-y-auto` ancestor it would be
 *  clipped instead of overlaying -- which is also why this Card no longer sets `overflow-hidden`.
 *
 *  The panel still opens DOWNWARD, over the results grid, exactly as the home hero's box does.
 *  Opening it upward was tried first, on the reasoning that a box at a card's bottom edge should
 *  open into the card -- and measured wrong: in browse mode this card is only `md:h-64` (256px)
 *  and the rich dropdown is ~230px, so upward buried the card's own title and description under
 *  the suggestions and ran the panel up behind the sticky site header. There is a whole page
 *  below the composer and 256px above it; the dropdown belongs in the former. */
export function ConsultantPanel({
  controller,
  instantProducts,
  instantContent,
  recentQueries,
  onSubmit,
  isBrowsing,
  personaContext,
  onStartOver,
  children,
}: {
  controller: HeadlessSearchBox;
  instantProducts: InstantProducts;
  /** Instant Pokédex-species previews, alongside the card previews above. */
  instantContent?: InstantResults;
  recentQueries: RecentQueriesList;
  onSubmit: (value: string) => void;
  /** No active query. Drives BOTH the Trending pills (jump-off points into a search, pointless once
   *  a query is running) and which mode the single composer below is in. One flag rather than two
   *  props, because they are the same fact: no query means no conversation to be following up on. */
  isBrowsing: boolean;
  /** Tone-only persona framing for the turns this composer sends -- same value
   *  GeminiConsultantAnswer gets, passed to both from one place in SearchResultsPage rather than
   *  each deriving the guest rule for itself. */
  personaContext?: PersonaContext;
  /** Clears the page's own query. Paired with `clearThread()` below to return the panel to browse
   *  mode; the page owns `q`, so this half has to come from there. */
  onStartOver: () => void;
  children: ReactNode;
}) {
  const responseRef = useRef<HTMLDivElement>(null);
  const [hasResponse, setHasResponse] = useState(false);
  const [composerText, setComposerText] = useState('');
  const thread = useThread();
  const isSending = useTurnInFlight();
  const showTrendingPills = isBrowsing;
  useEffect(() => {
    const el = responseRef.current;
    if (!el) return;
    const read = () =>
      setHasResponse((el.textContent ?? '').trim().length > 0 || !!el.querySelector('.skeleton'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return (
    <Card
      className={cn(
        // panel-violet-bloom: the home hero's plate treatment, same class family as
        // .panel-violet-fill -- see index.css for why a Card takes this as a background IMAGE.
        //
        // NO overflow-hidden anymore. The footer composer's suggestion panel opens upward and is
        // meant to overlay the transcript, and this card clipping its own children would swallow
        // it exactly the way an overflow-y-auto ancestor would. Nothing here depended on the clip:
        // the bloom is a background IMAGE, which border-radius already contains on its own.
        // `rounded-3xl` + `hero-border-glow`, replacing <Card>'s default 16px corner and this
        // panel's own `shadow-rest` (2026-08-19, visual-consistency audit). Every other hero in the
        // app -- home, Vault, newsroom, and now /advisor -- is a 24px-cornered plate wearing the
        // violet edge glow and NO elevation shadow; this one was 16px with a drop shadow and no
        // glow, which is the most prominent box on the most demo-critical page opening in a
        // treatment nothing else uses. The shadow GOES rather than composing, because `box-shadow`
        // is a single property: `hero-border-glow` and `shadow-rest` on one element means one
        // silently wins (index.css records the same collision as the reason `panel-border-glow`
        // exists for the home panels that genuinely need both).
        'panel-violet-bloom hero-border-glow mb-8 flex flex-col rounded-3xl transition-[height] duration-300',
        hasResponse ? 'h-[28rem]' : 'h-auto md:h-72'
      )}
    >
      {/* No `bg-muted/40` band on the header anymore: the bloom's brightest point sits at 18%/12%
          of the card, which is inside this header, so a grey wash over it flattened the treatment
          exactly where it reads. `border-b` alone still separates the pinned header from the
          scrolling middle. */}
      {/* `p-5` on all three sections of this card -- header, content and footer (2026-08-19,
          visual-consistency audit; the footer was `p-4` and this header spelled a redundant `pb-5`
          on top of its own `p-5`). One inset, so the composer's left edge lines up with the title
          above it instead of sitting 4px further out on the app's most prominent panel. */}
      <CardHeader className="shrink-0 gap-3 border-b border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
          {/* A GENERIC icon here, not the MooseMark this title used to carry. Now that the
              response zone below is a real chat, the moose is the CONSULTANT'S SPEAKER AVATAR --
              it sits beside every model turn. Repeating it in the title would put one mark on the
              plate twice carrying two different meanings ("this panel is ours" / "this message is
              mine"), and the title's is the expendable half: it is one line under a header
              wordmark that already says whose store this is. A conversation glyph instead, in the
              title's own colour, saying what the panel now literally does. */}
          {/* On the shared panel-title rank (2026-08-19, visual-consistency audit): this was the
              app's fourth heading spelling -- `text-lg` with no `font-display` and its weight left
              to CardTitle's default 600, measuring 18px/600 where every other panel title in the
              tree is display-face bold. The amber stays: it is a colour decision about whose
              surface this is, and colour was never the thing drifting. */}
          <PanelTitle icon={MessagesSquare} className="text-primary">
            Card Consultant
          </PanelTitle>
            <p className="text-sm text-muted-foreground">
              Tell us your strategy, your budget, or what you keep losing to &mdash; we&apos;ll find
              the cards that answer it.
            </p>
          </div>
          {/* Only in conversation mode: in browse mode there is nothing to start over FROM, and a
              permanently-present reset would read as a control that does nothing. Clearing the
              thread here as well as the query is belt-and-braces -- GeminiConsultantAnswer's
              `resetForQuery('')` effect nulls it on the next render anyway -- but doing it in the
              same tick means the composer flips back to search mode without a frame of stale
              transcript. */}
          {!isBrowsing && (
            <button
              type="button"
              onClick={() => {
                clearThread();
                setComposerText('');
                onStartOver();
              }}
              className="pressable flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Start over
            </button>
          )}
        </div>
      </CardHeader>
      {/* pb-0 once there IS a response: the `children` wrapper supplies its own pb-5 underneath
          the transcript, so keeping this container's would double it. With no response that wrapper
          is `empty:hidden` and contributes no padding at all, so the bottom padding has to come from
          here instead -- otherwise the Trending chip sits flush on the border above the composer.
          (This used to also be what let the old sticky follow-up input reach the container's bottom
          edge. That input is now a real CardFooter below, outside this scroller entirely.) */}
      <CardContent
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5 pt-4',
          hasResponse ? 'pb-0' : 'pb-5'
        )}
      >
        {showTrendingPills && <TrendingQueryPills onSelect={onSubmit} />}
        {showTrendingPills && (
          // The semantic-encoder chip's only verified example (see lib/semanticEncoderExample.ts).
          <button
            type="button"
            onClick={() => onSubmit(SEMANTIC_ENCODER_EXAMPLE_QUERY)}
            className="pressable card-hover flex items-center gap-1.5 self-start rounded-lg border border-coveo/25 bg-coveo/5 px-2.5 py-1 text-xs font-medium text-coveo hover:border-coveo/40"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Try describing a Pok&eacute;mon instead of naming it
          </button>
        )}
        <div
          ref={responseRef}
          className={cn(
            'flex min-h-0 flex-1 flex-col space-y-3 pb-5 empty:hidden',
            showTrendingPills && 'border-t border-border pt-4'
          )}
        >
          {children}
        </div>
      </CardContent>

      {/* THE one composer. Both branches are the same slot in the same place -- what changes is
          what submitting does, not where the shopper types. */}
      <CardFooter className="shrink-0 border-t border-border p-5">
        {isBrowsing ? (
          <SearchBox
            controller={controller}
            instantProducts={instantProducts}
            instantContent={instantContent}
            recentQueries={recentQueries}
            onSubmit={onSubmit}
            size="lg"
            richDropdown
            placeholder="Search cards, Pokémon, sets..."
            className="w-full max-w-none"
            // The Trending row above is this box's own local "Popular" section, upgraded to a real
            // ML source -- showing both would say the same thing twice, once honestly and once not.
            showPopular={false}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = composerText;
              setComposerText('');
              sendConsultantTurn(text, personaContext);
            }}
            className="flex w-full gap-2"
          >
            <input
              type="text"
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder="Ask a follow-up…"
              aria-label="Ask the Consultant a follow-up question"
              className="h-10 flex-1 rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            {/* Disabled while a turn is in flight, NOT unmounted the way the old follow-up form
                was (`!isLoadingTurn && ...` gated the whole element). A composer that disappears
                for the length of a Gemini round-trip is the one thing a chat never does, and the
                thread already shows a typing indicator to say why the button is inert. */}
            <button
              type="submit"
              disabled={!composerText.trim() || isSending}
              className="pressable h-10 shrink-0 rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ask
            </button>
          </form>
        )}
      </CardFooter>
    </Card>
  );
}
