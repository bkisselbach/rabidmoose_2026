import { useState } from 'react';
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { GeneratedAnswer } from '@coveo/headless';
import { cn } from '@/lib/utils';

// Feedback controls for a Coveo Generated Answer (RGA), shared by every RGA surface in the app --
// AskPokedex on the character page and VaultGeneratedAnswer on /pokedex.
//
// WHY. Until 2026-08-18 the only RGA analytics this app sent was `logCitationClick`. The whole
// rest of the controller's feedback API -- like / dislike / the structured feedback form / copy --
// was unused, which left the Admin Console's Generated Answer feedback report empty. That report
// is the only place RGA answer QUALITY is measured; without it there is no signal distinguishing
// an answer visitors trusted from one they didn't. See presentation/analytics-events-plan.md §2 G2.
//
// One component rather than two copies, for the same reason the app has one CoveoChip: the two
// surfaces should agree on what feedback looks like and what it sends.

/** The four quality axes Coveo's own feedback payload asks about, in its own vocabulary. Kept as
 *  a plain list so the form stays a loop rather than four near-identical blocks. */
const CRITERIA = [
  { key: 'correctTopic', label: 'On topic' },
  { key: 'hallucinationFree', label: 'No invented facts' },
  { key: 'documented', label: 'Backed by the sources' },
  { key: 'readable', label: 'Easy to read' },
] as const;

type CriterionKey = (typeof CRITERIA)[number]['key'];

interface Props {
  controller: GeneratedAnswer;
  state: GeneratedAnswer['state'];
  /** The answer text, for the copy button. Passed in rather than read off `state` so a surface
   *  that renders a trimmed or rewritten answer copies what the visitor actually sees. */
  answerText?: string;
  className?: string;
}

export function AnswerFeedback({ controller, state, answerText, className }: Props) {
  const [copied, setCopied] = useState(false);
  // `unknown` is Coveo's own neutral value, and it is the right default: an unanswered axis must
  // not be reported as a "no", which is what defaulting to false would do.
  const [criteria, setCriteria] = useState<Record<CriterionKey, 'yes' | 'no' | 'unknown'>>({
    correctTopic: 'unknown',
    hallucinationFree: 'unknown',
    documented: 'unknown',
    readable: 'unknown',
  });
  const [details, setDetails] = useState('');

  const copy = async () => {
    if (!answerText) return;
    try {
      await navigator.clipboard.writeText(answerText);
      // Only log the Coveo event once the copy actually SUCCEEDED. `writeText` rejects on a denied
      // clipboard permission or a non-secure context, and reporting a copy that didn't happen is
      // the same class of error as a fabricated click event.
      controller.logCopyToClipboard();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Silent: a failed clipboard write is the browser's call, not an app error worth surfacing.
    }
  };

  const submit = () => {
    controller.sendFeedback({
      helpful: false, // the structured form only opens on a dislike
      documented: criteria.documented,
      correctTopic: criteria.correctTopic,
      hallucinationFree: criteria.hallucinationFree,
      readable: criteria.readable,
      ...(details.trim() ? { details: details.trim() } : {}),
    });
  };

  return (
    <div className={cn('mt-3 border-t border-border pt-2.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Was this helpful?
        </span>

        <button
          type="button"
          onClick={() => controller.like()}
          aria-pressed={state.liked}
          aria-label="This answer was helpful"
          className={cn(
            'pressable inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
            state.liked
              ? 'border-coveo bg-coveo/10 text-coveo'
              : 'border-border text-muted-foreground hover:border-coveo/60 hover:text-foreground'
          )}
        >
          <ThumbsUp className="h-3 w-3 shrink-0" aria-hidden="true" />
          Yes
        </button>

        {/* Dislike also opens the structured form -- Coveo's own flow, and the reason the report is
            worth anything: a bare downvote says an answer was bad, the form says which way. */}
        <button
          type="button"
          onClick={() => {
            controller.dislike();
            controller.openFeedbackModal();
          }}
          aria-pressed={state.disliked}
          aria-label="This answer was not helpful"
          className={cn(
            'pressable inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
            state.disliked
              ? 'border-destructive bg-destructive/10 text-destructive'
              : 'border-border text-muted-foreground hover:border-destructive/60 hover:text-foreground'
          )}
        >
          <ThumbsDown className="h-3 w-3 shrink-0" aria-hidden="true" />
          No
        </button>

        {answerText && (
          <button
            type="button"
            onClick={copy}
            aria-label="Copy this answer"
            className="pressable ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-coveo/60 hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      {state.feedbackSubmitted && (
        <p className="mt-2 text-xs text-muted-foreground">Thanks — that goes back to the answer model.</p>
      )}

      {/* Inline rather than an actual modal: this sits inside an answer card that is already a
          panel, and a dialog over it would be heavier than the four toggles it contains. The
          controller's open/close state still drives it, so the analytics flow is Coveo's. */}
      {state.feedbackModalOpen && !state.feedbackSubmitted && (
        <div className="fade-in-panel mt-3 rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold text-foreground">What went wrong?</p>
          <div className="space-y-1.5">
            {CRITERIA.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{label}</span>
                <div className="flex shrink-0 gap-1">
                  {(['yes', 'no'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        // Clicking the active choice clears it back to `unknown`, so a misclick
                        // can be undone without submitting an opinion the visitor doesn't hold.
                        setCriteria((prev) => ({ ...prev, [key]: prev[key] === value ? 'unknown' : value }))
                      }
                      className={cn(
                        'pressable rounded-full border px-2 py-0.5 text-2xs font-semibold capitalize transition-colors',
                        criteria[key] === value
                          ? 'border-coveo bg-coveo/10 text-coveo'
                          : 'border-border text-muted-foreground hover:border-coveo/60'
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={2}
            placeholder="Anything else? (optional)"
            className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-coveo focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => controller.closeFeedbackModal()}
              className="pressable rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              className="pressable rounded-full bg-coveo px-2.5 py-1 text-xs font-semibold text-coveo-foreground"
            >
              Send feedback
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
