import { AnswerFeedback } from '@/components/AnswerFeedback';
import { CoveoChip } from '@/components/CoveoChip';
import { MooseMark } from '@/components/MooseMark';
import { useDelayedReveal } from '@/lib/useDelayedReveal';
import { useOptionalCoveoState } from '@/lib/useCoveoState';
import { vaultGeneratedAnswer } from '@/vaultControllers';

// Long enough to outlast a REFUSAL, not just a fast response. Coveo answers a query it won't
// answer -- it opens the stream and immediately sends `endOfStream {answerGenerated: false}` --
// and until that lands the state is indistinguishable from an answer on its way. Measured on this
// index 2026-08-19: a refusal ("fire dog") settles ~0.3s after submit, while a real answer's first
// token takes ~1.5-2s. At the old 300ms this surface flashed a skeleton and then tore itself back
// out of the hero; anything past the refusal window paints nothing at all for those queries and
// still shows the skeleton for the ~1s before a real answer starts.
const SKELETON_DELAY_MS = 900;

/** Own controller instance bound to `vaultEngine`, not a reuse of `ContentGeneratedAnswer.tsx`
 *  (whose controller is a singleton bound to `searchEngine`). Negative-polarity questions inherit
 *  the same silent-decline gate as elsewhere -- askAnchoring.ts's rewrite isn't wired in here.
 *
 *  `embedded`: rendered inside the Vault hero panel rather than as its own row below it, so it
 *  drops the bottom margin the standalone form needs and takes a slightly stronger coveo tint to
 *  hold its own edge against the hero's violet plate. */
export function VaultGeneratedAnswer({ embedded = false }: { embedded?: boolean }) {
  const state = useOptionalCoveoState(vaultGeneratedAnswer);

  const skeletonReady = useDelayedReveal(!!(state?.isLoading || state?.isStreaming), SKELETON_DELAY_MS);

  if (!vaultGeneratedAnswer || !state || !state.isVisible) return null;

  const hasAnswer = !!state.answer;
  // `isStreaming` is held to the same delay as `isLoading` rather than showing at once: an open
  // stream is not yet a promise of text, and a refusal arrives through that same open stream.
  // `cannotAnswer` closes it the moment the refusal is explicit.
  const showSkeleton =
    !hasAnswer && !state.cannotAnswer && (state.isLoading || state.isStreaming) && skeletonReady;
  if (!hasAnswer && !showSkeleton) return null;

  return (
    <div
      className={
        embedded
          ? 'rise-in rounded-2xl border border-coveo/25 bg-coveo/10 p-5 sm:p-6'
          : 'rise-in mb-8 rounded-2xl border border-coveo/25 bg-coveo/5 p-6 sm:p-8'
      }
    >
      {/* The house speaks, so the house shows its face: the RabidMoose mark plus the name, the
          same title treatment CardConsultant.tsx uses (its own comment -- a title is big enough to
          hold a face). No "Generated answer" label: what a visitor wants to know is WHO is
          answering, and the capability chip beside it already records how. Deliberately not the
          chat row /search's consultant uses (no bubble, no follow-up box) -- this answers the
          search box's query once, and a transcript treatment would promise a conversation this
          surface does not have. The mark holds still while the answer loads: the three shimmering
          `.skeleton` bars below already say "working on it", and a second, differently-timed pulse
          beside them was two loading indicators disagreeing about the beat. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-primary">
          <MooseMark className="h-6 w-6" title="RabidMoose Pokédex guide" />
          Pok&eacute;dex Guide
        </h3>
        <CoveoChip capability="generated-answer" />
      </div>
      <div className="min-h-[4.875rem]">
        {showSkeleton ? (
          <div className="space-y-2.5 pt-1" aria-hidden="true">
            <div className="skeleton h-4 rounded" />
            <div className="skeleton h-4 w-[92%] rounded" />
            <div className="skeleton h-4 w-2/3 rounded" />
          </div>
        ) : (
          <p className="fade-in-panel text-base leading-relaxed text-foreground">
            {state.answer}
            {state.isStreaming && (
              <span className="caret-blink ml-0.5 inline-block h-4 w-1.5 bg-coveo align-middle" aria-hidden="true" />
            )}
          </p>
        )}
      </div>
      {state.citations.length > 0 && (
        <ul className="fade-in-panel mt-3 flex flex-wrap gap-2">
          {state.citations.map((c) => (
            <li key={c.id}>
              <a
                href={c.clickUri}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-coveo/25 px-2.5 py-1 text-xs font-medium text-coveo transition-colors hover:border-coveo/60 hover:bg-coveo/10 hover:underline"
                onClick={() => vaultGeneratedAnswer?.logCitationClick(c.id)}
              >
                {c.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      {/* Only once the answer has finished streaming: voting on a half-written answer would file
          feedback against text the visitor never actually read. */}
      {hasAnswer && !state.isStreaming && (
        <AnswerFeedback controller={vaultGeneratedAnswer} state={state} answerText={state.answer} />
      )}
    </div>
  );
}
