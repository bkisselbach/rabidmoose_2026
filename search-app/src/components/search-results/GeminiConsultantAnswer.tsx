import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product } from '@coveo/headless/commerce';
import { ArrowRight, UserRound } from 'lucide-react';
import Markdown from 'react-markdown';
import { CoveoChip } from '@/components/CoveoChip';
import { MooseMark } from '@/components/MooseMark';
import { TypePill, Pill } from '@/components/QueryPills';
import { ConsultantProductTile, ConsultantSpeciesTile } from '@/components/search-results/ConsultantResultTile';
import { type PersonaContext } from '@/lib/consultantChat';
import { sendConsultantTurn, useTurnFailure, useTurnInFlight } from '@/lib/consultantTurn';
import { fetchProductsByIds } from '@/lib/fetchProductsByIds';
import { subscribeToCharacter } from '@/lib/characterQueue';
import { citationLabel } from '@/lib/citationLabel';
import { getActivePersona } from '@/lib/visitorId';
import { formatPriceRange } from '@/lib/priceIntent';
import { useDelayedReveal } from '@/lib/useDelayedReveal';
import { useQueryUnderstanding, type QueryUnderstanding } from '@/lib/useQueryUnderstanding';
import { useThread, resetForQuery, type ConsultantTurn } from '@/lib/consultantThread';
import type { PokemonRecord } from '@/lib/pokedexRecord';
import { dealInProps } from '@/lib/dealIn';

const SKELETON_DELAY_MS = 300;
const MAX_TILES = 6;

/** One user turn + its model reply, grouped for the transcript rendering below. `question` is
 *  genuinely null only for the defensive fallback case (a model turn with no preceding user turn,
 *  which sendTurn's own contract should never produce), and that case renders as a lone consultant
 *  message rather than being dropped. */
interface QaPair {
  at: number;
  question: string | null;
  answer: ConsultantTurn | undefined;
}

function pairTurns(turns: ConsultantTurn[]): QaPair[] {
  const pairs: QaPair[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      pairs.push({ at: turn.at, question: turn.text, answer: undefined });
    } else if (pairs.length > 0 && pairs[pairs.length - 1].answer === undefined) {
      pairs[pairs.length - 1].answer = turn;
    } else {
      // Shouldn't happen given sendTurn always appends user-then-model, but rendering it under a
      // null title degrades rather than drops it.
      pairs.push({ at: turn.at, question: null, answer: turn });
    }
  }
  return pairs;
}

/** The scrollport this transcript lives in, found by walking up rather than being handed down.
 *  It is ConsultantPanel's CardContent -- but that component deliberately knows nothing about this
 *  one (it takes the whole response zone as opaque `children`), and the follow-up input below
 *  already relies on the same ancestor implicitly via `sticky bottom-0`. Reading the computed
 *  style rather than matching a class keeps that dependency on the CSS contract that is already
 *  load-bearing, instead of adding a second one on a Tailwind class name. */
function nearestScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

/** How close to the bottom still counts as "following the conversation". */
const PINNED_SLACK_PX = 48;

/** Keeps the newest turn in view -- the one thing a chat has to do that a Q&A list does not, and
 *  measured as genuinely broken before this: with the panel at its fixed 28rem, a settled second
 *  exchange left the scroller at `scrollTop 0` of `scrollHeight 541` against a `clientHeight 283`,
 *  so the answer a shopper had just asked for rendered entirely below the fold with nothing moving
 *  to say so. The sticky follow-up input made it worse rather than better: it stays visible at any
 *  scroll position, so the panel looked idle and ready rather than scrolled away from the reply.
 *
 *  Follows on CONTENT SIZE, not on turn count. A turn's text arrives in one `appendTurn`, but its
 *  TurnTiles resolve later (`fetchProductsByIds` / the character queue), so a turn-count effect
 *  scrolls to a bottom that is about to move. Setting `scrollTop` does not resize the observed
 *  element, so there is no observer loop.
 *
 *  Pinning is what keeps it from fighting the reader: scroll up to re-read an earlier answer and
 *  the follow stops until you come back down. `pin()` is the deliberate override for submitting a
 *  follow-up -- the input is sticky, so it can be used from a scrolled-up position, and a shopper
 *  who just asked something wants to be taken to the reply. */
function useStickToLatest() {
  const pinnedRef = useRef(true);
  // A CALLBACK ref into state, not a useRef -- measured, not stylistic. This component returns
  // null until its first turn (or its delayed skeleton) exists, so on the render where an effect
  // with a stable-ref dependency first runs, the transcript node has not mounted yet: the effect
  // reads `null`, bails, and never re-runs, leaving the follow silently dead. Held in state, the
  // node's arrival IS the dependency change that attaches the observer.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const scroller = nearestScrollParent(anchor);
    if (!anchor || !scroller) return;

    const onScroll = () => {
      pinnedRef.current =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= PINNED_SLACK_PX;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });

    const follow = () => {
      if (pinnedRef.current) scroller.scrollTop = scroller.scrollHeight;
    };
    const observer = new ResizeObserver(follow);
    observer.observe(anchor);
    follow();

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [anchor]);

  const pin = useCallback(() => {
    pinnedRef.current = true;
  }, []);

  return { anchorRef: setAnchor, pin };
}

/** Who is speaking. The transcript's only visual attribution, so both branches are load-bearing.
 *
 *  Consultant = the MooseMark, carrying a `title` (the one case its own docs name: "a speaker
 *  avatar") so it is announced rather than hidden from assistive tech.
 *
 *  Shopper = the ACTIVE persona's avatar -- literally ProfileSwitcher's art, same files under
 *  `/personas` -- so the face in the header and the face in the transcript are the same person.
 *  Not reactive by design and not a bug: `switchPersona` reloads the page (it changes the clientId
 *  every subsequent event is attributed to), so a read at render is always current.
 *
 *  GUEST GETS THE NEUTRAL GLYPH, not the MooseMark that ProfileSwitcher's own PersonaAvatar falls
 *  back to. In the header that fallback is right and stays untouched -- the moose there means "the
 *  house default shopper", and nothing else nearby claims it. In here the moose is already the
 *  consultant, one row above and one row below, so reusing it would put the same mark on both
 *  sides of the conversation and read as the model talking to itself. The glyph also satisfies the
 *  original rule that fallback exists to serve (`public/personas/README.md`: the anonymous visitor
 *  should not look like a person) at least as well as a moose does. */
function ChatAvatar({ speaker }: { speaker: 'consultant' | 'shopper' }) {
  if (speaker === 'consultant') return <MooseMark className="mt-0.5 h-7 w-7" title="Card Consultant" />;

  const persona = getActivePersona();
  return persona.avatar ? (
    <img
      src={persona.avatar}
      alt=""
      className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
      role="img"
      aria-label={persona.name}
    />
  ) : (
    <span
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
      role="img"
      aria-label={persona.name}
    >
      <UserRound className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

// Resolves and renders one model turn's grounded ids -- factored out since this is needed per
// turn, not once globally.
function TurnTiles({ productIds, speciesNames }: { productIds: string[]; speciesNames: string[] }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [species, setSpecies] = useState<PokemonRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (productIds.length > 0) {
      fetchProductsByIds(productIds.slice(0, MAX_TILES)).then((found) => {
        if (!cancelled) setProducts(found);
      });
    }
    const cleanedNames = [...new Set(speciesNames.map(citationLabel))].slice(0, MAX_TILES);
    for (const name of cleanedNames) {
      subscribeToCharacter(name, (record) => {
        if (cancelled || !record) return;
        setSpecies((prev) => (prev.some((s) => s.characterName === record.characterName) ? prev : [...prev, record]));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialized id lists
  }, [productIds.join('|'), speciesNames.join('|')]);

  if (products.length === 0 && species.length === 0) return null;

  // No `fade-in-panel` on this wrapper: its children now deal in individually, and two
  // entrance animations on nested elements read as a smear rather than a deal (the same
  // call ProductResultsGrid makes on its grid branch -- see lib/dealIn.ts). The species
  // tiles continue the products' index so the whole row ripples once, left to right,
  // instead of restarting halfway through.
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {products.map((product, index) => (
        <div key={product.permanentid} {...dealInProps(index, 'flex shrink-0')}>
          <ConsultantProductTile product={product} />
        </div>
      ))}
      {species.map((record, index) => (
        <div key={record.characterName} {...dealInProps(products.length + index, 'flex shrink-0')}>
          <ConsultantSpeciesTile record={record} />
        </div>
      ))}
    </div>
  );
}

/** The deterministic "here's what your sentence became" receipt, folded in as a compact footnote
 *  under turn 1's answer rather than a second competing headline. Only ever attaches to turn 1 --
 *  a follow-up doesn't re-derive facets, so `understanding` describes the page's `query`, not
 *  later turns. */
function receiptShowing({ parsed, pokedexTypes, priceRange, isResolving }: QueryUnderstanding): boolean {
  if (parsed.intent !== 'advisory' || isResolving) return false;
  return pokedexTypes.length > 0 || !!priceRange;
}

function AdvisoryReceipt({ understanding }: { understanding: QueryUnderstanding }) {
  const { resolutions, pokedexTypes, priceRange, topTierEnd } = understanding;
  if (!receiptShowing(understanding)) return null;

  const budget = priceRange ? formatPriceRange(priceRange, topTierEnd) : null;
  const speciesNote = resolutions
    .filter((r) => r.speciesCount > 0)
    .map((r) => `${r.speciesCount} indexed ${r.target}-type species`)
    .join(' · ');

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
      {/* No marker on this line. The receipt is one of the consultation's capabilities, not a
          section of its own, so it is named in the panel's single marker above (see
          `receiptShowing` at this component's own render) rather than raising a second icon
          inside the same card. */}
      <span>Filtering to</span>
      {pokedexTypes.map((name) => (
        <TypePill key={name} name={name} />
      ))}
      {budget && (
        <>
          <span>at</span>
          <Pill>{budget}</Pill>
        </>
      )}
      {speciesNote && <span className="text-2xs">&middot; from {speciesNote}</span>}
    </div>
  );
}

/** The Gemini-narrated Card Consultant, multi-turn. Replaces ContentGeneratedAnswer (RGA) in the
 *  Consultant panel's response zone.
 *
 *  "q stays turn-1's text, permanently": the URL's `q` and the SearchBox above never change as
 *  this thread grows -- only `consultantThread.ts`'s own sessionStorage state does. `resetForQuery`
 *  is what tells a genuinely new topic (URL's `q` changed) apart from the same query re-rendering
 *  (thread survives).
 *
 *  THE COMPOSER NO LONGER LIVES HERE. This component owned a follow-up input at the bottom of the
 *  transcript while ConsultantPanel's header owned the page's search box, which is how one card
 *  ended up with two text inputs doing two different things. They are now one mode-aware composer
 *  in the panel's footer (see ConsultantPanel.tsx for the mode rule); this component is the
 *  transcript and nothing else. Sending a turn moved to lib/consultantTurn.ts so the panel -- this
 *  component's PARENT -- can send one without the thread being hoisted through SearchResultsPage.
 *
 *  FILTER-IMPLYING FOLLOW-UPS -- deliberately NOT wired into the existing derived-facets pipeline
 *  in place (three failed approaches are documented in SearchResultsPage.tsx before the current
 *  one, and reaching into it from a second trigger point risks reproducing that fragility).
 *  Instead: when the latest follow-up itself parses as an advisory/filter query (the same
 *  useQueryUnderstanding this page's own facets already run on), a "Search for this" action
 *  appears and NAVIGATES to /search?q=<the follow-up> -- a genuinely new turn-1, reusing the EXACT
 *  existing URL-driven pipeline with zero new plumbing, just arrived at by a click instead of a
 *  page load. */
export function GeminiConsultantAnswer({
  query,
  personaContext,
  understanding,
}: {
  query: string;
  personaContext?: PersonaContext;
  /** Turn-1's query understanding -- used only to attach the AdvisoryReceipt footnote under turn
   *  1's answer. Passed in rather than recomputed here: a second independent parse of the same
   *  text would be redundant work that could in principle drift from the facets the page applied. */
  understanding: QueryUnderstanding;
}) {
  const thread = useThread();
  const navigate = useNavigate();
  const isLoadingTurn = useTurnInFlight();
  const turnFailure = useTurnFailure();
  const { anchorRef: transcriptRef, pin: pinToLatest } = useStickToLatest();

  useEffect(() => {
    resetForQuery(query.trim());
  }, [query]);

  // Turn 1 fires automatically once the thread has been (re)anchored to this page's own query and
  // has no turns yet -- a thread restored from sessionStorage already has turns, so this only
  // fires for a genuinely fresh topic.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !thread || thread.turnOneQuery !== trimmed || thread.turns.length > 0) return;
    sendConsultantTurn(trimmed, personaContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- personaContext is a fresh object each render
  }, [query, thread?.turnOneQuery, thread?.turns.length]);

  // Re-pin on the shopper's OWN message, wherever it was sent from. This replaces the direct
  // `pinToLatest()` call the local send used to make: the composer now lives in this component's
  // parent, so the send and the scroller no longer share a function to hang that call on. Keying
  // off the transcript instead of the send is also the more honest signal -- what should take a
  // reader to the bottom is a new message of their own appearing, not the act of dispatching one.
  const lastTurn = thread?.turns[thread.turns.length - 1];
  const turnCount = thread?.turns.length ?? 0;
  useEffect(() => {
    if (lastTurn?.role === 'user') pinToLatest();
  }, [turnCount, lastTurn?.role, pinToLatest]);

  const showSkeleton = useDelayedReveal(isLoadingTurn, SKELETON_DELAY_MS);

  // Inert (isActive: false) on '', so this hook runs unconditionally (React's own rule) but does
  // nothing until there is a real follow-up to judge.
  const lastUserText = [...(thread?.turns ?? [])].reverse().find((t) => t.role === 'user')?.text ?? '';
  const followUpUnderstanding = useQueryUnderstanding(lastUserText);

  if (!thread || (thread.turns.length === 0 && !showSkeleton)) return null;

  const pairs = pairTurns(thread.turns);

  return (
    <div className="rise-in flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {/* No repeated title here -- that's ConsultantPanel's own CardTitle, one line above. */}
        {/* THE consultation's one marker, listing everything serving this panel right now. The
            query-understanding half used to be a second icon on the advisory receipt a few lines
            below the answer -- same card, same conversation, two marks. Composed here because
            this is the only place that knows both facts. */}
        <CoveoChip
          capability={[
            {
              capability: 'ai-consultant',
              // Persona context shapes HOW this is worded, never WHAT was retrieved to answer it.
              detailSuffix: personaContext
                ? `Answering as if speaking with ${personaContext.name} (${personaContext.subtitle.toLowerCase()}) — tone and phrasing only, never which Coveo tools were called or what they returned.`
                : undefined,
            },
            ...(receiptShowing(understanding)
              ? [
                  {
                    capability: 'query-understanding' as const,
                    detailSuffix: 'The "Filtering to…" line under the first answer is this: your sentence, read into real facet selections.',
                  },
                ]
              : []),
          ]}
        />
      </div>

      {/* A TRANSCRIPT, not "question as a title, response below" -- avatared, sided, bubbled, the
          shape anyone reading it already knows. The hairline `divide-y` between pairs goes with it:
          alternating sides and speaker marks now say where one exchange ends, and a rule across a
          chat only adds a second, weaker answer to the same question.

          TURN 1'S QUESTION IS NOW SHOWN, reversing the deliberate `i > 0` suppression this block
          used to carry. That rule was right for a titled Q&A list -- SearchBox.tsx, one card-header
          above, still holds that exact text, so a title repeated it inside the same panel. It is
          wrong for a chat: a transcript whose first line is the model answering nobody reads as
          broken, and the sided bubble does something the persistent search box does not -- it marks
          who said it and starts the thread. The duplication is real and accepted. */}
      <div ref={transcriptRef} className="space-y-4">
        {pairs.map((pair, i) => (
          <div key={pair.at} className="space-y-3">
            {pair.question && (
              <div className="flex flex-row-reverse items-start gap-2.5">
                <ChatAvatar speaker="shopper" />
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/10 px-3.5 py-2 text-base leading-relaxed text-foreground">
                  {pair.question}
                </div>
              </div>
            )}
            {pair.answer && (
              <div className="flex items-start gap-2.5">
                <ChatAvatar speaker="consultant" />
                {/* `min-w-0` -- TurnTiles below is an `overflow-x-auto` row, and a flex child
                    defaults to `min-width: auto`, which lets that row's content set the column's
                    width instead of scrolling inside it. Without this one class a long tile row
                    pushes the whole message past the card's right edge. */}
                <div className="min-w-0 flex-1 space-y-2">
                  {/* Rendered through react-markdown so Gemini's markdown prose (*emphasis*, lists)
                      renders as actual formatting instead of literal asterisks. Component overrides
                      keep the result inside this card's own type scale. */}
                  <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5 text-base leading-relaxed text-foreground">
                    <Markdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        a: ({ children, href }) => (
                          <a href={href} target="_blank" rel="noreferrer" className="text-coveo hover:underline">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {pair.answer.text}
                    </Markdown>
                  </div>
                  {/* Tiles and the receipt sit OUTSIDE the bubble, in the same column -- the
                      attachment treatment every chat client uses for rich payloads. Bubbling a
                      horizontally-scrolling tile row would clip its own scroll edge against a
                      rounded corner, and the receipt is a footnote about the query, not something
                      the consultant said.

                      `!!(...)` and not the bare length OR -- `0 || 0` is `0`, and JSX renders a
                      literal falsy NUMBER (unlike false/null/undefined) as visible text. Confirmed
                      live: every answer with no grounded ids was rendering a stray "0". */}
                  {!!(pair.answer.productIds?.length || pair.answer.speciesNames?.length) && (
                    <TurnTiles
                      productIds={pair.answer.productIds ?? []}
                      speciesNames={pair.answer.speciesNames ?? []}
                    />
                  )}
                  {/* Only turn 1 -- `understanding` describes the page's `query`, not any later
                      follow-up, so attaching it anywhere else would misattribute the derivation. */}
                  {i === 0 && <AdvisoryReceipt understanding={understanding} />}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* The typing indicator, built as a real consultant row so it occupies the same column the
            answer lands in and nothing shifts sideways when it does. The mark breathes (see
            `.moose-breathing`) so "composing" is attributed to a speaker rather than being two
            anonymous grey bars, and the bars stay -- they are what conveys "text is coming".
            `aria-hidden` on the whole row: a screen reader gets nothing useful from a loading
            placeholder, which is also why this uses MooseMark directly rather than ChatAvatar,
            whose consultant branch is deliberately announceable. */}
        {showSkeleton && (
          <div className="flex min-h-[2.5rem] items-start gap-2.5" aria-hidden="true">
            <MooseMark className="mt-0.5 h-7 w-7" breathing />
            <div className="min-w-0 flex-1 space-y-2.5 rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5">
              <div className="skeleton h-4 rounded" />
              <div className="skeleton h-4 w-[85%] rounded" />
            </div>
          </div>
        )}

        {/* THE DEGRADED STATE. Until 2026-08-19 a failed turn rendered nothing at all: the
            shopper's own message sat there, the typing indicator vanished, and the panel looked
            idle and ready rather than broken. Measured as a live risk in
            `presentation/demo-relevancy-testbook.md` §7.2, where the Gemini key exhausted its
            free-tier daily quota and every ask 502'd.

            Rendered as a consultant-side row, in the column the answer would have occupied, so a
            failure reads as this speaker having nothing to say rather than as the page losing its
            layout. It carries NO retry button on the quota path: a daily cap does not clear in a
            moment, and a button that cannot work is worse than none. `role="status"` rather than
            `alert` -- it is a state of this panel, not an interruption worth stealing focus for.

            Never enters the thread (see lib/consultantTurn.ts's useTurnFailure): the turns are
            replayed to Gemini as history, and an error notice among them would be fed back as
            something the consultant said. */}
        {!isLoadingTurn && turnFailure && (
          <div className="flex items-start gap-2.5" role="status">
            <ChatAvatar speaker="consultant" />
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-dashed border-border bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground">
              {turnFailure === 'quota'
                ? "The Card Consultant has hit today's request limit, so there's no answer to this one. Search and the Pokédex are unaffected — the results below are live."
                : "The Card Consultant couldn't be reached, so there's no answer to this one. Search and the Pokédex are unaffected — the results below are live."}
            </div>
          </div>
        )}
      </div>

      {!isLoadingTurn && lastTurn?.role === 'model' && followUpUnderstanding.isActive && (
        <button
          type="button"
          onClick={() => navigate(`/search?q=${encodeURIComponent(lastUserText)}`)}
          className="pressable mt-3 inline-flex items-center gap-1 self-start text-xs font-semibold text-coveo hover:underline"
        >
          Search for this <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      )}

    </div>
  );
}
