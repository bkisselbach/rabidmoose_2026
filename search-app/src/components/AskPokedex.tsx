import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildGeneratedAnswer,
  buildSearchBox,
  buildSearchEngine,
  buildTab,
  type GeneratedAnswer,
  type SearchBox,
  type SearchEngine,
} from '@coveo/headless';
import { ExternalLink, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AnswerFeedback } from '@/components/AnswerFeedback';
import { CoveoChip } from '@/components/CoveoChip';
import { PanelTitle } from '@/components/PanelTitle';
import { cn } from '@/lib/utils';
import { retrievePassages, type Passage } from '@/passageRetrieval';
import { anchorQuestion, mentionsName, resolveTypePolarity, warmAnchorVocabulary } from '@/lib/askAnchoring';
import { citationLabel } from '@/lib/citationLabel';
import { tapSearchAnalytics } from '@/lib/eventTape';

// Interactive AI Q&A for a single Pokemon, pairing Coveo's two answer capabilities on the same
// question: the user picks a suggested question or types their own, the question runs as a real
// query against the Pokédex content, RGA (Relevance Generative Answering) streams back a
// grounded, cited answer -- and Coveo Passage Retrieval independently returns the top-ranked
// index passages for that same question, asked in parallel so it's ready the instant it's
// needed. When RGA succeeds, its own citations already carry the evidence job, so the raw
// passages stay hidden -- showing both was the same source twice, once as a link and once as a
// quote. Passages only surface as the answer of last resort when RGA can't generate one at all.
// Same graceful degradation as ContentGeneratedAnswer.tsx -- renders nothing until an Answer
// Configuration exists in Admin and VITE_COVEO_ANSWER_CONFIG_ID is set.
const answerConfigurationId = import.meta.env.VITE_COVEO_ANSWER_CONFIG_ID;

// Two grounding scopes, asked in parallel, curated preferred.
//
// The curated push articles are the better prose -- every fact is an explicit self-contained
// sentence, written for exactly this -- but they carry no move lists, so "what moves does it
// learn" was flatly unanswerable. Letting the crawled pokemondb source in fixes that and eleven
// more questions besides, but measured over 50 questions x 10 species it also *costs* two that
// used to work ("what does Ivysaur look like", "what does Eevee look like"): the crawled page's
// chunks crowd the curated appearance prose out of first-stage retrieval. Neither scope dominates.
//
// So both run, and the curated answer wins whenever it exists -- the wider one is only read once
// the curated scope has finished with nothing. Union scored 49/50 against 38 (curated alone) and
// 47 (widened alone), with no regression on any previously verified question. Asking in parallel
// rather than escalating on failure keeps the slow path off the demo: the wider answer is already
// in flight by the time the curated one gives up.
const CURATED_SOURCE_FILTER = '@source=="pokedex-push"';
const WIDENED_SOURCE_FILTER = '(@source=="pokedex-push" OR @source=="Pokedex")';

interface Stage {
  engine: SearchEngine;
  searchBox: SearchBox;
  generatedAnswer: GeneratedAnswer;
}

// Dedicated engines, NOT the shared one from searchEngine.ts: asking here executes a real search,
// and doing that on the shared engine would leak the question into the /search page's box/results
// state. Config mirrors searchEngine.ts -- legacy analytics mode (required for Generated Answer).
// Built lazily at first use, then held at module scope like the app's other engines so StrictMode
// remounts reuse them.
let bundle: { curated: Stage; widened: Stage } | null = null;

function buildStage(tabId: string, expression: string): Stage {
  const engine = buildSearchEngine({
    configuration: {
      organizationId: import.meta.env.VITE_COVEO_ORG_ID,
      accessToken: import.meta.env.VITE_COVEO_SEARCH_TOKEN,
      // ONE hub for both stages: the curated and widened passes are two attempts at the same
      // question, i.e. one search *experience*, and Coveo's guidance is one hub per experience
      // rather than one per request. Was `'default'` until 2026-08-18 -- see
      // presentation/search-hub-plan.md §2.2, and searchEngine.ts for the full standing note on
      // hand-created pipelines and the fallback.
      search: { searchHub: 'Ask Pokedex' },
      analytics: {
        analyticsMode: 'legacy',
        // These two stages are engines of their own, so they need their own tap -- the middleware
        // is per-engine, and without this the Ask Pokédex searches were the one classic-Search
        // surface missing from the Event Tape (caught in the live pass, 2026-08-18).
        analyticsClientMiddleware: tapSearchAnalytics('Ask Pokédex'),
      },
    },
  });
  buildTab(engine, { options: { id: tabId, expression } }).select();
  return {
    engine,
    searchBox: buildSearchBox(engine),
    generatedAnswer: buildGeneratedAnswer(engine, { answerConfigurationId }),
  };
}

function getBundle() {
  if (!answerConfigurationId) return null;
  if (!bundle) {
    bundle = {
      curated: buildStage('pokedex-curated', CURATED_SOURCE_FILTER),
      widened: buildStage('pokedex-all', WIDENED_SOURCE_FILTER),
    };
  }
  return bundle;
}

/** Same gate this panel renders behind -- exported so entry points elsewhere (the PDP buy-column
 *  teaser) can hide themselves instead of pointing at a panel that won't exist. */
export function isAskPokedexAvailable(): boolean {
  return Boolean(answerConfigurationId);
}

/** Kept to questions the indexed content can actually answer -- since the content-scraper's
 *  PokeAPI enrichment (evolution methods, matchup multipliers, per-game encounter locations,
 *  training data), that includes "where can I find X". A suggested chip should never lead to
 *  "no answer". Shared with the teaser so both surfaces promise the same questions. */
export function askPokedexSuggestions(characterName: string): string[] {
  return [
    `How does ${characterName} evolve?`,
    `What is ${characterName} weak against?`,
    `Where can I find ${characterName}?`,
    `What does ${characterName} look like?`,
    // Answerable only since the crawled pokemondb source joined the grounding set -- the curated
    // push article has no move list. The teaser takes the first two, so this lands last.
    `What moves does ${characterName} learn?`,
  ];
}

interface Props {
  characterName: string;
  /** PDP-only: clarifies that the panel answers questions about the species, not the card/price
   *  in front of it -- the two-zone split isn't obvious from the panel alone on a page whose top
   *  half is entirely commerce. The species page omits it; there the whole page is already about
   *  the Pokemon. */
  subtitle?: string;
  /** Lets the page stretch the card to match a sibling panel's height (e.g. `h-full` inside an
   *  `items-stretch` grid row) instead of the card always sizing to its own content. */
  className?: string;
}

export function AskPokedex({ characterName, subtitle, className }: Props) {
  const controllers = useMemo(getBundle, []);
  const [curatedState, setCuratedState] = useState(controllers?.curated.generatedAnswer.state);
  const [widenedState, setWidenedState] = useState(controllers?.widened.generatedAnswer.state);
  const [question, setQuestion] = useState('');
  // Which question this *page* asked -- the module-scope engine keeps the previous Pokemon's
  // answer around, so rendering is gated on a question asked since the last name change.
  // `sent` is what actually went to Coveo: equal to `asked` unless anchoring rewrote it.
  const [asked, setAsked] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  // The answer request only starts after the search response lands, so for a beat after submit
  // the state is settled-and-empty; only that flag flipping distinguishes "still on its way"
  // from "finished with nothing", keeping the failure copy from flashing in the gap. Tracked per
  // scope, since the two settle independently.
  const [sawLoading, setSawLoading] = useState({ curated: false, widened: false });
  // Top index passages for the asked question -- null while in flight, [] when nothing clears
  // the quality bar. Sequence-guarded so a slow response can't land under a newer question.
  const [evidence, setEvidence] = useState<Passage[] | null>(null);
  const askSeq = useRef(0);
  // The species vocabulary that lets anchoring tell "no Pokemon named at all" (prefix this page's
  // species) from "a different Pokemon named" (leave the question alone). Held in a ref because
  // only `ask` reads it and a late arrival should not re-render the panel.
  const knownNames = useRef<readonly string[]>([]);

  useEffect(() => {
    let live = true;
    warmAnchorVocabulary().then((names) => {
      if (live) knownNames.current = names;
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!controllers) return;
    const watch = (
      scope: 'curated' | 'widened',
      apply: (state: GeneratedAnswer['state']) => void
    ) =>
      controllers[scope].generatedAnswer.subscribe(() => {
        const state = controllers[scope].generatedAnswer.state;
        if (state.isLoading || state.isStreaming) setSawLoading((seen) => (seen[scope] ? seen : { ...seen, [scope]: true }));
        apply(state);
      });
    const unsubscribes = [watch('curated', setCuratedState), watch('widened', setWidenedState)];
    return () => unsubscribes.forEach((off) => off());
  }, [controllers]);

  useEffect(() => {
    setAsked(null);
    setSent(null);
    setQuestion('');
    setSawLoading({ curated: false, widened: false });
    setEvidence(null);
    askSeq.current++;
  }, [characterName]);

  const ask = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || !controllers) return;
    // Everything downstream -- RGA and Passage Retrieval alike -- gets the anchored question, so
    // the two halves of the panel can never end up talking about different Pokemon. Yes/no type
    // questions get a second rewrite on top: RGA answers "yes" and silently declines "no", so
    // those are rerouted onto the open form that answers either way (see askAnchoring.ts).
    const anchored = resolveTypePolarity(anchorQuestion(trimmed, characterName, knownNames.current), characterName);
    setAsked(trimmed);
    setSent(anchored);
    setQuestion(trimmed);
    setSawLoading({ curated: false, widened: false });
    setEvidence(null);
    const seq = ++askSeq.current;
    // A rejected passage request settles to [] rather than staying null -- null means "still in
    // flight" to the copy below, so swallowing the failure silently would pin the panel on
    // "checking the index for a matching passage..." forever. Evidence uses the wider scope: it
    // is the answer of last resort, so it should reach for anything the Pokédex has.
    // Ask for more than the two slots, because the species check below can reject some. Passage
    // Retrieval always returns *something* -- for a question the Pokédex has no content for
    // ("is Charizard good in competitive play?") it drifts to whatever ranks next, which on the
    // Charizard page meant quoting Blastoise under the failure copy. A passage that never names
    // the species the question is about is not evidence for it; showing nothing is the honest
    // outcome. Skipped when the question is about some other Pokemon, where the page's species is
    // not the subject at all.
    const subject = mentionsName(anchored, characterName) ? characterName : null;
    retrievePassages(anchored, 4, 450, { filter: WIDENED_SOURCE_FILTER })
      .catch(() => [] as Passage[])
      .then((passages) => {
        const onTopic = subject ? passages.filter((p) => mentionsName(p.text, subject)) : passages;
        if (askSeq.current === seq) setEvidence(onTopic.slice(0, 2));
      });
    for (const scope of ['curated', 'widened'] as const) {
      controllers[scope].searchBox.updateText(anchored);
      controllers[scope].searchBox.submit();
    }
  };

  if (!controllers) return null;

  const suggestions = askPokedexSuggestions(characterName);

  // `sawLoading` gates the answer, not just the failure copy: the module-scope controllers still
  // hold the *previous* question's answer for the beat between submit and the first loading tick,
  // and without this gate the panel briefly captions the new question with the old answer --
  // worse than a skeleton, because it looks like a confidently wrong response.
  const readable = (state: typeof curatedState, scope: 'curated' | 'widened') =>
    sawLoading[scope] && !!state?.answer && !state.isLoading ? state : null;
  const finished = (state: typeof curatedState, scope: 'curated' | 'widened') =>
    sawLoading[scope] && !state?.isLoading && !state?.isStreaming;

  const curatedAnswer = readable(curatedState, 'curated');
  const widenedAnswer = readable(widenedState, 'widened');
  // Curated wins outright; the wider scope is only read once the curated one has finished with
  // nothing, so a crawled-page answer can never displace a better curated one that is still
  // streaming in.
  const active = curatedAnswer
    ? { state: curatedAnswer, controller: controllers.curated.generatedAnswer }
    : finished(curatedState, 'curated') && !curatedState?.answer && widenedAnswer
      ? { state: widenedAnswer, controller: controllers.widened.generatedAnswer }
      : null;

  const showAnswer = !!active;
  const showFailure =
    !showAnswer &&
    finished(curatedState, 'curated') &&
    finished(widenedState, 'widened') &&
    !curatedState?.answer &&
    !widenedState?.answer;
  const showSkeleton = !showFailure && !showAnswer;
  // Hoisted out of the render below because the card's single header marker needs the same fact:
  // whether Passage Retrieval is currently the thing answering.
  const showPassages = showFailure && (evidence?.length ?? 0) > 0;

  // RGA cites the same document more than once when several of its chunks ground the answer;
  // rendered verbatim that reads as "Charizard, Charizard, Charizard".
  const citations = (active?.state.citations ?? []).filter(
    (c, i, all) => all.findIndex((other) => (other.clickUri ?? other.id) === (c.clickUri ?? c.id)) === i
  );

  return (
    // Plain card chrome, same as PokemonDataPanel's sibling card -- the Coveo identity now lives
    // only in the tinted header band (mirroring how PokemonDataPanel tints its own identity band
    // by type), not the whole card, so the two sit as siblings rather than two different kinds of
    // box. flex flex-col + CardContent's overflow-y-auto let the card stretch to fill a taller
    // sibling (the `h-full` callers pass in) without the answer's variable length ever forcing the
    // card past its box.
    // Chat-box shell: header and input are fixed, the answer area in between is the only part
    // that scrolls (min-h-0 is required on the flex child for its own overflow-y-auto to kick in
    // instead of pushing the card taller than its `h-full` box).
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0 border-b border-coveo/25 bg-coveo/5 p-5 sm:p-6">
        <div>
          {/* The shared panel-title rank (2026-08-19). This spelling is the one PanelTitle was
              built from -- it moves here unchanged, and three other panels move onto it. */}
          <PanelTitle icon={Sparkles} iconClassName="text-coveo">
            Ask the Pokédex
          </PanelTitle>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {/* THE card's one marker. Two capabilities take turns inside this box -- RGA answers when
            it can, and when it can't, Passage Retrieval shows the closest passages instead -- and
            that second act used to raise a second icon of its own down in the passages block. One
            card, one mark: the tooltip picks up Passage Retrieval exactly when the passages are on
            screen, so the marker still describes what is actually in front of the reader. */}
        <CoveoChip
          capability={[
            'generated-answer',
            ...(showPassages ? (['passage-retrieval'] as const) : []),
          ]}
        />
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {/* THE SUGGESTION-PILL SHAPE (2026-08-19, visual-consistency audit): `rounded-lg` +
            `text-xs font-medium` + `card-hover`, the same three values the home hero's Popular
            pills, /search's Trending Now pills and both "Try describing a Pokémon instead of naming
            it" chips already spelled. These were `rounded-full` at weight 400 -- one canned query a
            visitor taps to run it, in two shapes depending on which surface it was tapped from, and
            on the species page BOTH shapes are on screen at once. Facet VALUES keep the pill shape
            (`rounded-full`, 600); that is a different control and the round end is what tells them
            apart. */}
        {!asked && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="pressable card-hover rounded-lg border border-coveo/25 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-coveo/60 hover:bg-coveo/10 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {asked && (
          <div aria-live="polite">
            {/* When anchoring rewrote the question, say so. The demo claim is query understanding,
                not sleight of hand -- and it explains why "how does it evolve?" comes back about
                this species instead of whichever Pokemon the raw phrase happened to retrieve. */}
            {sent && sent !== asked && (
              <p className="mb-2.5 text-xs text-muted-foreground">
                Asked as <span className="font-medium text-foreground">&ldquo;{sent}&rdquo;</span>
                <span className="ml-1.5 opacity-70">— scoped to {characterName}</span>
              </p>
            )}
            {showSkeleton && (
              <div className="space-y-2">
                <div className="skeleton h-3.5 w-full rounded" />
                <div className="skeleton h-3.5 w-11/12 rounded" />
                <div className="skeleton h-3.5 w-3/5 rounded" />
              </div>
            )}
            {showAnswer && (
              <>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {active!.state.answer}
                  {active!.state.isStreaming && (
                    // A caret BLINKS -- see `.caret-blink` in index.css. This was Tailwind's stock
                    // `animate-pulse`, which breathes on a 2s ease-in-out curve the app does not
                    // otherwise use, and which reads as a glowing rectangle rather than a cursor.
                    <span className="caret-blink ml-0.5 inline-block h-3.5 w-1.5 bg-coveo align-middle" />
                  )}
                </p>
                {citations.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3">
                    {citations.map((c) => (
                      <li key={c.id}>
                        <a
                          href={c.clickUri}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-coveo hover:underline"
                          onClick={() => active!.controller.logCitationClick(c.id)}
                        >
                          {citationLabel(c.title)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Gated on streaming having finished, same rule as the Vault's answer card: the
                    vote should be about an answer the visitor has actually read to the end. */}
                {!active!.state.isStreaming && (
                  <AnswerFeedback
                    controller={active!.controller}
                    state={active!.state}
                    answerText={active!.state.answer}
                  />
                )}
              </>
            )}
            {showFailure && (
              <p className="text-sm text-muted-foreground">
                {evidence?.length
                  ? 'No generated answer for that one — the closest passages from the index are below.'
                  : evidence === null
                    ? 'No generated answer for that one — checking the index for a matching passage…'
                    : "The Pokédex couldn't generate an answer for that one — try rephrasing the question."}
              </p>
            )}

            {showPassages && (
              <div className="mt-4 border-t border-border pt-3">
                {/* No marker of its own -- the card header's one mark names Passage Retrieval
                    whenever this block is up. See there. */}
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="eyebrow">Top passages for this question</p>
                </div>
                <div className="space-y-2.5">
                  {evidence!.map((p, i) => (
                    <figure key={`${p.clickUri ?? p.title}-${i}`} className="rounded-md bg-muted/50 p-3">
                      <blockquote className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                        {p.text}
                      </blockquote>
                      {p.clickUri && (
                        <figcaption className="mt-1.5">
                          <a
                            href={p.clickUri}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-coveo hover:underline"
                          >
                            {citationLabel(p.title)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <div className="shrink-0 border-t border-border p-4 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="flex gap-2"
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Ask anything about ${characterName}...`}
            aria-label={`Ask a question about ${characterName}`}
          />
          <Button type="submit" disabled={!question.trim()} aria-label="Ask">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Ask</span>
          </Button>
        </form>

        {asked && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="pressable card-hover rounded-lg border border-coveo/25 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-coveo/60 hover:bg-coveo/10 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
