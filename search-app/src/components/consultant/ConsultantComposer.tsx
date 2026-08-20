import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { typeColor } from '@/lib/typeColors';
import { TYPE_COLORS } from '@/lib/typeColors';
import type { BudgetOption, ConsultantMode, ConsultantSelection } from '@/lib/consultantSentence';

// The control row: three dimensions the shopper can set without typing, composing into the same
// sentence the free-text box holds.
//
// A SINGLE EXCLUSIVE VERB rather than two type pickers: queryIntent.ts:288 -- a counter cue
// anywhere in a sentence retargets EVERY type in it, so "Fire cards that beat Water" cannot mean
// what it says; the parser collapses it to one mode. The UI encodes that limit rather than letting
// a shopper build a sentence the system can't honour.
//
// Vocabularies are not equally "live": types are a closed local set (TYPE_COLORS) -- what's
// index-derived is the COUNTER resolution, not the list. Budgets are the live ec_price facet tiers
// from the Merchandising Hub. Rarities are the live cardrarity vocabulary, filtered to words the
// catalog can actually honour (see useConsultantDraft).

const ALL_TYPES = Object.keys(TYPE_COLORS);

// Matches SiteHeader's hand-rolled NavMenu conventions (click to toggle, outside pointerdown and
// Escape to close) rather than pulling in another primitive.
function Dropdown({
  label,
  summary,
  children,
  className,
}: {
  label: string;
  summary: string;
  children: (close: () => void) => React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Panel is anchored `left-0` under its own button, which breaks once the button isn't near the
  // left edge: at 375px "any rarity" wraps to x=163, so a 16rem panel overflows the viewport and
  // clips its right-hand chips. Width clamps don't help -- the overflow comes from the offset, not
  // the width. So below `sm` this wrapper goes `static`, handing the absolute panel to the
  // composer row's own `relative` ancestor so it spans the full width under the controls instead.
  return (
    <div ref={ref} className="static sm:relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label}: ${summary}`}
        className={cn(
          'pressable',
          'inline-flex items-center gap-1 rounded-full border px-3 py-2 text-sm transition-colors sm:py-1.5',
          open ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground hover:border-primary/60',
          className
        )}
      >
        {summary}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="popover-content absolute left-0 top-full z-30 mt-2 w-full rounded-md border border-border bg-card p-3 text-left sm:w-64 sm:max-w-[calc(100vw-2rem)]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function ConsultantComposer({
  selection,
  onChange,
  budgetOptions,
  rarityOptions,
}: {
  selection: ConsultantSelection;
  onChange: (patch: Partial<ConsultantSelection>) => void;
  budgetOptions: BudgetOption[];
  rarityOptions: string[];
}) {
  const { mode, types, rarity, budget } = selection;

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const typeSummary =
    types.length === 0 ? 'pick types' : types.length <= 2 ? types.join(', ') : `${types.length} types`;
  const raritySummary = rarity.length === 0 ? 'any rarity' : rarity.length === 1 ? rarity[0] : `${rarity.length} rarities`;
  const budgetSummary = budget ?? 'any budget';

  // `relative` is what makes the mobile dropdown positioning above work: with each Dropdown's own
  // wrapper going `static` below sm, this row becomes the containing block their panels resolve
  // against.
  return (
    <div className="relative flex flex-wrap items-center gap-2 text-sm">
      {/* Two buttons rather than a select: the one control whose two states mean genuinely
          different searches, and should be readable at a glance. */}
      <div className="inline-flex overflow-hidden rounded-full border border-border" role="group" aria-label="Mode">
        {(['beat', 'collect'] as ConsultantMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ mode: m })}
            aria-pressed={mode === m}
            className={cn(
              'pressable',
              'px-3 py-2 text-sm transition-colors sm:py-1.5',
              mode === m ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {m === 'beat' ? 'Beat' : 'Collect'}
          </button>
        ))}
      </div>

      <Dropdown label="Types" summary={typeSummary}>
        {() => (
          <div className="flex flex-wrap gap-1.5">
            {ALL_TYPES.map((t) => {
              const on = types.includes(t);
              const c = typeColor(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ types: toggle(types, t) })}
                  aria-pressed={on}
                  className={cn(
                    'pressable',
                    'rounded-full px-2.5 py-1.5 text-xs font-bold transition-opacity sm:py-1',
                    !on && 'opacity-40 hover:opacity-75'
                  )}
                  style={{ backgroundColor: c.bg, color: c.text }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        )}
      </Dropdown>

      {/* Render only once their live vocabularies have arrived -- a menu that opens empty is worse
          than one that isn't there yet. */}
      {budgetOptions.length > 0 && (
        <Dropdown label="Budget" summary={budgetSummary}>
          {(close) => (
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => {
                  onChange({ budget: null });
                  close();
                }}
                className="pressable rounded px-2 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted sm:py-1.5"
              >
                Any budget
              </button>
              {budgetOptions.map((opt) => (
                <button
                  key={opt.phrase}
                  type="button"
                  onClick={() => {
                    onChange({ budget: opt.phrase });
                    close();
                  }}
                  className={cn(
                    'pressable',
                    'rounded px-2 py-2.5 text-left text-sm hover:bg-muted sm:py-1.5',
                    budget === opt.phrase && 'font-bold text-primary'
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <p className="mt-1.5 border-t border-border pt-1.5 text-2xs leading-relaxed text-muted-foreground">
                These are the live <code>ec_price</code> facet tiers &mdash; retune the Price facet in the
                Merchandising Hub and this menu changes with it.
              </p>
            </div>
          )}
        </Dropdown>
      )}

      {rarityOptions.length > 0 && (
        <Dropdown label="Rarity" summary={raritySummary}>
          {() => (
            <div className="flex flex-wrap gap-1.5">
              {rarityOptions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChange({ rarity: toggle(rarity, r) })}
                  aria-pressed={rarity.includes(r)}
                  className={cn(
                    'pressable',
                    'rounded-full border px-2.5 py-1.5 text-xs capitalize transition-colors sm:py-1',
                    rarity.includes(r)
                      ? 'border-primary bg-primary/10 font-bold text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </Dropdown>
      )}

      {(types.length > 0 || rarity.length > 0 || budget) && (
        <button
          type="button"
          onClick={() => onChange({ types: [], rarity: [], budget: null })}
          className="pressable inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </button>
      )}
    </div>
  );
}
