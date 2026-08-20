import { Sparkles } from 'lucide-react';
import { CoveoChip } from '@/components/CoveoChip';

// The purple narration plate, shared by BOTH advisor surfaces.
//
// WHY IT IS SHARED. The Advisor page now carries two generated reads with genuinely different
// criteria -- one about how a deck plays, one about how close a collection is to complete -- and
// they sit inside two different cards. Two independently-built plates would drift in eyebrow,
// chip, skeleton shape and padding the same way the two gap panels did before GapPanel, and here
// the drift would be worse: these are the two most visually prominent blocks on the page, side by
// side down the same column. One shell, two callers, no divergence available.
//
// THE SKELETON IS THREE LINES, NOT ONE, and that is load-bearing. What it stands in for is a short
// paragraph, so a single bar grows the card at the moment the text lands and shoves everything
// below it down the page. Descending widths so three bars read as a paragraph rather than a block.
//
// SELF-HIDES ON FAILURE, and the caller must be able to live without it. Both surfaces keep a
// deterministic read underneath -- the pinned biggest-hole line on Deck Advisor, the completion
// numbers on Set Collector -- so a dead narrator costs a paragraph and nothing else. That is the
// whole demo-resilience argument for this page and it only holds if nothing here is required.

interface Props {
  /** The section this narration belongs to, e.g. "Deck health" or "Collection read". */
  label: string;
  /** What the chip should say about how this particular narration is grounded. */
  chipDetail: string;
  text: string | null;
  isLoading: boolean;
}

export function AdvisorNarration({ label, chipDetail, text, isLoading }: Props) {
  if (!isLoading && !text) return null;

  return (
    <div className="rounded-lg border border-coveo/25 bg-coveo/5 p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="eyebrow flex items-center gap-1.5 text-coveo">
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {label}
        </span>
        <CoveoChip capability="ml-recommendations" detailSuffix={chipDetail} />
      </div>
      {isLoading ? (
        <div className="space-y-2 pt-0.5" aria-hidden="true">
          <div className="skeleton h-3.5 w-full rounded" />
          <div className="skeleton h-3.5 w-11/12 rounded" />
          <div className="skeleton h-3.5 w-2/3 rounded" />
        </div>
      ) : (
        <p className="text-sm text-foreground">{text}</p>
      )}
    </div>
  );
}
