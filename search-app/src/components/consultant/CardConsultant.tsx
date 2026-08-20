import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CoveoChip } from '@/components/CoveoChip';
import { MooseMark } from '@/components/MooseMark';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConsultantComposer } from '@/components/consultant/ConsultantComposer';
import { useConsultantDraft } from '@/lib/useConsultantDraft';
import { useTypewriter } from '@/lib/useTypewriter';
import { useConsultantEcho } from '@/lib/ConsultantEchoContext';
import { logCustomInteraction } from '@/lib/customEvents';

// Deliberately NOT under components/home/: nothing in here knows where it is rendered -- it owns a
// sentence, shows how that sentence is read, and navigates. Also deliberately NOT a chat surface
// (no multi-turn, no history) -- the free-text box is a plain <input>, not a SearchBox, because
// submitting the raw sentence to the commerce engine is the AND-emptying failure queryIntent.ts
// exists to prevent; the sentence goes to /search as `q` and the results page does the retrieval.

/** Every phrase is a shape the parser genuinely handles, verified end to end -- a placeholder
 *  demoing a query the app can't answer would be worse than none. */
const PLACEHOLDER_PHRASES = [
  'I need to beat Water types',
  'Beat Rock types under $25',
  'Show me holo Fire cards',
];

export function CardConsultant({
  className,
  compact,
}: {
  className?: string;
  /** Dock/rail presentation: tighter padding and no example row. */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { draft, setDraft, selection, setSelection, understanding, isSettling, budgetOptions, rarityOptions, isEmpty } =
    useConsultantDraft();

  const goToSearch = (q: string) => navigate(`/search?q=${encodeURIComponent(q)}`);
  const submit = () => {
    const q = draft.trim();
    if (!q) return;
    // Only the EXPLICIT submit is reported, not the auto-navigate below it: the settled-sentence
    // effect fires on its own once typing stops, so logging there would count a question the
    // visitor never chose to ask -- and would fire again for every intermediate sentence a slow
    // typist passes through.
    logCustomInteraction('consultantAsk', { question: q });
    goToSearch(q);
  };

  // Auto-navigates once the reading has genuinely settled, so a manual submit isn't required.
  // `isSettling`/`understanding.isResolving` gate on the debounce and the async lookups both
  // finishing; `understanding.isActive` excludes a blank box or an unconstrained plain lookup.
  const settledQuery = !isSettling && !understanding.isResolving && understanding.isActive ? draft.trim() : '';
  useEffect(() => {
    if (settledQuery) goToSearch(settledQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per distinct settled sentence
  }, [settledQuery]);

  const placeholder = useTypewriter(PLACEHOLDER_PHRASES, draft.length === 0);

  // Publishes the settled consultation for any surface that wants to answer it (the home hero's
  // card scans). Only once settled -- publishing mid-resolution would make a consumer chase
  // intermediate states.
  const { publish } = useConsultantEcho();
  const settledCardTypes = !isSettling && !understanding.isResolving ? understanding.cardTypes : null;
  useEffect(() => {
    if (settledCardTypes) publish(settledCardTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialized type set
  }, [settledCardTypes?.join(','), publish]);

  return (
    <Card className={cn('w-full shadow-rest', className)}>
      <CardHeader className={cn('gap-1.5', compact ? 'p-4 pb-3' : 'p-5 pb-4')}>
        {/* The moose, not `MessageCircleQuestion`, and only HERE -- on the panel title, where the
            box is introducing a speaker. The small inline uses of that glyph (ConsultantFitStrip's
            "Consultant's read" eyebrow, ConsultantHero's "Ask:" chip) keep it: those run at
            12-14px, where a detailed illustration is mud, and the hero's eyebrow has a documented
            reason for the icon it carries. A title is big enough to hold a face. */}
        <CardTitle className={cn('flex items-center gap-2 text-primary', compact ? 'text-base' : 'text-lg')}>
          <MooseMark className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
          Card Consultant
        </CardTitle>
        {!compact && (
          <p className="text-sm text-muted-foreground">
            Tell us your strategy, your budget, or what you keep losing to &mdash; we&apos;ll find the cards that
            answer it.
          </p>
        )}
      </CardHeader>

      <CardContent className={cn('flex flex-col gap-3', compact ? 'p-4 pt-0' : 'p-5 pt-0')}>
        {/* Stacked below `sm`: sharing the row with "Find cards" left ~180px of input at 375px,
            truncating the teaching placeholder mid-phrase. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={placeholder}
            aria-label="Describe what you need"
            className="h-11 w-full rounded-md border border-foreground/25 bg-card px-3.5 text-sm shadow-rest placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <button
            type="button"
            onClick={submit}
            disabled={isEmpty && !draft.trim()}
            className="pressable inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Find cards
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <ConsultantComposer
          selection={selection}
          onChange={setSelection}
          budgetOptions={budgetOptions}
          rarityOptions={rarityOptions}
        />

        <div className="flex flex-wrap items-center gap-2">
          <CoveoChip
            capability={[
              {
                capability: 'query-understanding',
                detailSuffix:
                  "Powers this panel end to end. The controls and the text box are the same sentence — the controls write it, and typing re-derives them by running the same parser the results page runs. The counter types come from a groupBy over the index's own weakness data, the budget bands ARE the live ec_price facet tiers, and the rarity words are filtered to what the live cardrarity vocabulary can actually honour.",
              },
              { capability: 'index-matchup' },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}
