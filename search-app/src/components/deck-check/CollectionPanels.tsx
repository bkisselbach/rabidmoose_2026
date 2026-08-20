import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as Tabs from 'radix-ui/tabs';
import { PanelTitle } from '@/components/PanelTitle';
import { Layers, TrendingUp, Copy, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { CompactCardTile, fromCatalogCard } from '@/components/deck-check/CompactCardTile';
import { CARD_GRID_COLS } from '@/components/home/HomeCardRail';
import type { CollectionRead, SetCompletion, VariantGap } from '@/lib/gapEngine';
import type { CatalogCard } from '@/lib/catalogQuery';

// The collector half of the Advisor workbench -- phase B of presentation/gap-check-plan.md.
//
// Everything here is DETERMINISTIC. No model call renders any number on this page: completion
// percentages, cost-to-complete, the cheap tail, the chase split, the variant spreads and the
// portfolio delta are all arithmetic over one batched index read. Gemini writes the prose paragraph
// above these panels and nothing else, which is what makes this the most demo-resilient surface in
// the act -- with /api/deck-health down, every panel below still renders in full.
//
// ONE SET LEADS, THE REST ARE ROWS (2026-08-19, direct user feedback: "entirely too complicated").
// The first version gave all four of Dana's sets a full-size card, each carrying up to twelve
// checklist rows -- 48 rows of "#8 Kingdra -- Neo Genesis #8  $22.86" before the deck half even
// started. That is a reference document, not a page. Only ONE set is ever actionable in a session
// (the one you are closest to finishing), so that one gets the card and the others get a line each
// that expands on demand. Nothing was removed; the depth moved behind a disclosure.

/** Checklist rows shown in a set's panel before the rest collapse behind a count. Four is
 *  deliberately small: the set you are closest to finishing is the case this leads with, and four
 *  rows is what "you are almost there" looks like. */
const PANEL_CHECKLIST_LIMIT = 4;

/** Rows shown when an expanded set turns out to be a long way from done. */
const EXPANDED_CHECKLIST_LIMIT = 12;

/** Printing gaps listed inside the disclosure. Ranked by absolute dollar gap, so six is the six
 *  worth acting on rather than an arbitrary head of a long list. */
const VARIANT_ROWS = 6;

/** The page's disclosure idiom, matching the 18-type grid's own `<details>` further down the page
 *  rather than introducing a second one. */
function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 p-4 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        {label}
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

/** The grid a checklist renders in — THE HOME RAIL'S CARD SIZE, exactly (2026-08-19, direct
 *  request: "make the cards the same size as the trending now on the landing page").
 *
 *  `CARD_GRID_COLS` is HomeCardRail's own four widths (9.375 / 9.75 / 8.5 / 11.875rem) expressed as
 *  fixed grid tracks, exported by that file precisely so a second surface can match the rail
 *  without re-measuring it — the same thing the PLP grid does. Copying the numbers here instead
 *  would be a fifth place that has to be edited when the card size changes, and the one that would
 *  be missed.
 *
 *  Fixed tracks, not `1fr`: the rail's cards are a fixed size, so a checklist showing four of them
 *  must leave the remainder of the row empty rather than stretching four cards across it. `gap-3`
 *  is the rail's own gutter. */
const CHECKLIST_GRID = `grid ${CARD_GRID_COLS} gap-3`;

/** A missing card, in the Advisor's one tile shape (2026-08-19, direct request: "make them like the
 *  other pokemon cards on the marketplace").
 *
 *  The tile itself moved to CompactCardTile.tsx once the deck half's gap rails needed the same one;
 *  see that file for why it takes plain fields rather than either API's type. What stays here is
 *  the adapter call and nothing else. */
function CardTile({ card }: { card: CatalogCard }) {
  return <CompactCardTile card={fromCatalogCard(card)} />;
}

/** The bill, in the two numbers that make it actionable rather than discouraging.
 *
 *  "You need $1,040" is a wall; "68 of those cost $109 together, and one card is a third of the
 *  bill" is a decision. Each line only renders when it says something the total doesn't. */
function BillLines({ set }: { set: SetCompletion }) {
  const chaseTop = set.chase[0];
  // Share carried by the single dearest missing card -- a different question from the top three,
  // and the one that matters when the remainder is lopsided.
  const topShare = set.costToComplete > 0 && chaseTop ? chaseTop.price / set.costToComplete : 0;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      {set.cheapTail.count > 1 && (
        <p>
          <span className="font-semibold tabular-nums text-foreground">{set.cheapTail.count}</span> of them are under{' '}
          {formatCurrency(5)} — <span className="font-semibold tabular-nums text-foreground">{formatCurrency(set.cheapTail.cost)}</span>{' '}
          for the lot
        </p>
      )}
      {/* ONE CARD OR THREE, whichever is the true sentence. When a single card carries most of the
          bill, "the dearest 3 carry 100%" is arithmetically true and reads as broken sitting under
          "3 of them are under $5" -- Fossil's remainder is Dragonite at $184.86 plus three commons
          totalling $1.12, and the honest line there names the one card. */}
      {chaseTop && topShare > 0.5 ? (
        <p>
          <span className="font-semibold text-foreground">{chaseTop.name.split('—')[0].trim()}</span> alone is{' '}
          <span className="font-semibold tabular-nums text-foreground">{Math.round(topShare * 100)}%</span> of it, at{' '}
          {formatCurrency(chaseTop.price)}
        </p>
      ) : (
        chaseTop &&
        set.chaseShare > 0.2 &&
        set.chase.length > 1 && (
          <p>
            the dearest {set.chase.length} carry{' '}
            <span className="font-semibold tabular-nums text-foreground">{Math.round(set.chaseShare * 100)}%</span> of the
            bill — {chaseTop.name.split('—')[0].trim()} alone is {formatCurrency(chaseTop.price)}
          </p>
        )
      )}
    </div>
  );
}

function Progress({ percent }: { percent: number }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-coveo transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** How complete, in the two numbers that are honest together.
 *
 *  Denominated on what this marketplace STOCKS, with the printed total beside it as context: they
 *  disagree on eight of this catalog's 28 sets, and cost-to-complete can only ever sum the stocked
 *  half. Showing both, labelled, is the only way to say either. */
function SetHeading({ set }: { set: SetCompletion }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-bold tabular-nums text-foreground">{set.percent}%</span>
      {' — '}
      <span className="tabular-nums">
        {set.held} of {set.stocked}
      </span>{' '}
      in stock here
      {set.printed && set.printed !== set.stocked && (
        <span className="text-muted-foreground/70"> ({set.printed} printed)</span>
      )}
    </p>
  );
}

/** One set's full read — the panel behind each tab. */
function SetPanel({ set }: { set: SetCompletion }) {
  const remaining = set.missing.length;
  const shown = set.missing.slice(0, PANEL_CHECKLIST_LIMIT);

  return (
    <div className="min-w-0 p-4">
      <SetHeading set={set} />
      <Progress percent={set.percent} />

      {remaining === 0 ? (
        <p className="mt-3 text-xs font-semibold text-foreground">Complete — every card this marketplace stocks.</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-foreground">
            <span className="font-bold tabular-nums">{remaining}</span> card{remaining === 1 ? '' : 's'} to finish
            {' — '}
            <span className="font-bold tabular-nums">{formatCurrency(set.costToComplete)}</span>
          </p>
          <BillLines set={set} />
          <div className={`mt-3 ${CHECKLIST_GRID}`}>
            {shown.map((card) => (
              <CardTile key={card.productId} card={card} />
            ))}
          </div>
          {remaining > shown.length && (
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-2xs font-semibold text-muted-foreground hover:text-foreground">
                <ChevronDown className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                the other {remaining - shown.length}, in card-number order
              </summary>
              <div className={`mt-2 ${CHECKLIST_GRID}`}>
                {set.missing.slice(shown.length, shown.length + EXPANDED_CHECKLIST_LIMIT).map((card) => (
                  <CardTile key={card.productId} card={card} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * SET COLLECTOR — every tracked set as a tab, one panel at a time.
 *
 * Replaced a leading card plus a stack of accordion rows (2026-08-19, direct request). The
 * accordions were an improvement on four full cards, but they still asked the reader to open and
 * close things to compare sets, and two open at once put two unrelated checklists on screen.
 * Tabs make the comparison the TAB STRIP — every set's completion is visible at a glance in the
 * strip itself, and exactly one panel is ever open.
 *
 * TAB ORDER IS THE DATA'S ORDER, not alphabetical: `read.sets` arrives sorted closest-to-done
 * first, so the set you can actually finish is the default tab. Nothing here picks a favourite.
 *
 * Radix rather than hand-rolled buttons, because a tab strip has real keyboard semantics — arrow
 * keys, roving tabindex, `aria-selected` — and this app already depends on `radix-ui` for the
 * select. A `role="tablist"` spelled by hand would be the third disclosure idiom on one page.
 */
export function SetCollector({
  sets,
  chip,
  narration,
}: {
  sets: SetCompletion[];
  chip?: React.ReactNode;
  /** This surface's own generated read, above the tab strip -- the collection twin of Deck
   *  Advisor's. Optional for the same reason. */
  narration?: React.ReactNode;
}) {
  const [active, setActive] = useState(sets[0]?.setName ?? '');
  if (sets.length === 0) return null;

  return (
    <Tabs.Root
      value={sets.some((s) => s.setName === active) ? active : sets[0].setName}
      onValueChange={setActive}
      className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card"
    >
      {/* Shared panel-title rank -- see DeckAdvisor, its sibling panel on this page (2026-08-19). */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <PanelTitle icon={Layers}>Set Collector</PanelTitle>
        {chip}
      </div>
      {narration && <div className="border-b border-border px-4 py-3">{narration}</div>}
      {/* The strip IS the comparison: set, completion, and what finishing costs, all without
          opening anything. Horizontally scrollable rather than wrapping, so a collector tracking
          a dozen sets gets a strip and not a paragraph of tabs. */}
      <Tabs.List className="flex gap-1 overflow-x-auto border-b border-border px-1 pt-2">
        {sets.map((set) => (
          <Tabs.Trigger
            key={set.setName}
            value={set.setName}
            className="group shrink-0 rounded-t-md border-b-2 border-transparent px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-coveo data-[state=active]:text-foreground"
          >
            <span className="block font-bold">{set.setName}</span>
            <span className="block text-2xs tabular-nums text-muted-foreground">
              {set.percent}% · {set.missing.length} left
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {sets.map((set) => (
        <Tabs.Content key={set.setName} value={set.setName}>
          <SetPanel set={set} />
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
/** Which printings of a card the collection has no marker for.
 *
 *  Informational by design: the index holds one document per card, so a second printing is a
 *  checkbox and never a second cart line -- making a printing purchasable is backlog item 36. */
export function VariantChecklistPanel({ gaps }: { gaps: VariantGap[] }) {
  const withGaps = gaps.filter((g) => g.held && g.missing.length > 0);
  if (withGaps.length === 0) return null;

  return (
    <Disclosure label={`Printings you don't have (${withGaps.length} cards)`}>
      <p className="text-xs text-muted-foreground">
        Showing the {VARIANT_ROWS} biggest gaps by price. Same card, different printing — real per-printing market prices
        from the catalog. Tracking only; this marketplace lists one document per card, so a printing isn&apos;t a separate purchase.
      </p>
      <ul className="mt-3 space-y-2">
        {withGaps.slice(0, VARIANT_ROWS).map((gap) => (
          <li key={gap.card.productId} className="rounded-md border border-border/60 p-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <Link to={`/card/${encodeURIComponent(gap.card.productId)}`} className="text-xs font-semibold hover:underline">
                {gap.card.name}
              </Link>
              <span className="text-2xs text-muted-foreground">
                you have <span className="font-semibold text-foreground">{gap.held?.label}</span>
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {gap.missing.map((option) => (
                <span
                  key={option.key}
                  className="rounded border border-coveo/30 bg-coveo/5 px-1.5 py-0.5 text-2xs font-semibold text-foreground"
                >
                  {option.label} · <span className="tabular-nums">{formatCurrency(option.marketPrice)}</span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

/** Holdings value and movement — one line, with the honesty split kept ON SCREEN.
 *
 *  The market side of this number is real and live from the index; the purchase side is invented,
 *  because this app records no orders and the catalog carries no price history. That split is the
 *  whole reason the panel is allowed to exist, so it stays visible rather than moving into a
 *  tooltip -- it is just one sentence now instead of three. */
export function PortfolioStrip({ read }: { read: CollectionRead }) {
  const { movement, marketValue, cardsHeld } = read;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <TrendingUp className="h-4 w-4 shrink-0 self-center text-primary" aria-hidden="true" />
        <span className="font-bold tabular-nums">{cardsHeld}</span>
        <span className="text-muted-foreground">cards ·</span>
        <span className="font-bold tabular-nums">{formatCurrency(marketValue)}</span>
        <span className="text-muted-foreground">at today&apos;s market</span>
        {movement && (
          <>
            <span className="text-muted-foreground">·</span>
            <span
              className={`font-bold tabular-nums ${movement.delta >= 0 ? 'text-success' : 'text-destructive'}`}
            >
              {movement.delta >= 0 ? '+' : '−'}
              {formatCurrency(Math.abs(movement.delta))}
            </span>
            <span className="text-muted-foreground">against cost</span>
          </>
        )}
      </div>
      {movement && (
        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
          Market price is live from the index; the purchase price is{' '}
          <span className="font-semibold">mock demo data</span> — this app records no orders, and the catalog has no
          price history.
        </p>
      )}
    </div>
  );
}

/** Cards held more than once -- what a collector trades toward their gaps. */
export function SurplusStrip({ duplicates }: { duplicates: CollectionRead['duplicates'] }) {
  if (duplicates.length === 0) return null;
  const value = duplicates.reduce((s, d) => s + d.card.price * (d.quantity - 1), 0);
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
      <Copy className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span>
        {duplicates.length} spare{duplicates.length === 1 ? '' : 's'} —{' '}
        <span className="font-semibold text-foreground">{formatCurrency(value)}</span> of trade stock toward the gaps
        above.
      </span>
    </div>
  );
}

/** The no-holdings state. NOT an error and not a placeholder -- Guest is never seeded, deliberately,
 *  so "what am I missing" has a real answer for an anonymous visitor: everything, and here is what
 *  each set costs to finish from zero. Same engine, same rosters, empty holdings list.
 *
 *  Cheapest first, and only the cheapest gets the full card: the useful question from zero is where
 *  to START, not what the dearest set would cost. */
export function StartFromSet({ sets }: { sets: SetCompletion[] }) {
  // Cheapest first: from zero the useful question is where to START, not what the dearest set
  // would cost.
  const ordered = [...sets].sort((a, b) => a.costToComplete - b.costToComplete);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
          Start from a set
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;re browsing without a collection, so nothing here is assumed about you. This is what completing a set
          costs today, priced from the live catalog.
        </p>
      </div>
      <SetCollector sets={ordered} />
    </section>
  );
}
