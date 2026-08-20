import { useState } from 'react';
import * as Tabs from 'radix-ui/tabs';
import { Activity } from 'lucide-react';
import { PanelTitle } from '@/components/PanelTitle';

// DECK ADVISOR — the deck half's three panels as one tabbed surface, mirroring Set Collector.
//
// Replaced a full-width exposure panel plus a two-column pair ("To play these, you also need" and
// "Suggested pickups") stacked under it. Three panels for one subject read as three subjects, and
// on Marcus's deck they ran to nearly 3,000px.
//
// ONE DELIBERATE DIFFERENCE FROM SET COLLECTOR, and it is the reason this is not simply the same
// component pointed at different data. Set Collector's tabs are PARALLEL INSTANCES of one thing —
// sets — so hiding all but one hides nothing a reader needs at the same time. These three are not
// parallel: exposure is a DIAGNOSIS and pickups are the ANSWER to that diagnosis, so a plain tab
// strip would let someone read "buy these cards" with no idea why those cards.
//
// So the diagnosis is pinned ABOVE the strip and stays on screen whichever tab is open. The tabs
// choose the depth; the headline is not something you can navigate away from. That keeps the causal
// link the old stacked layout got for free.

export interface AdvisorTab {
  id: string;
  label: string;
  /** The small second line in the tab, same shape as Set Collector's "94% · 4 left". */
  stat: string;
  content: React.ReactNode;
}

interface Props {
  /** The always-visible deterministic read — the biggest hole, stated plainly. */
  headline: React.ReactNode;
  chip?: React.ReactNode;
  /** The generated read for THIS surface, rendered inside the card above the tab strip. Optional:
   *  a dead narrator costs a paragraph, never the panel. */
  narration?: React.ReactNode;
  tabs: AdvisorTab[];
}

export function DeckAdvisor({ headline, chip, narration, tabs }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  if (tabs.length === 0) return null;

  return (
    <Tabs.Root
      value={tabs.some((t) => t.id === active) ? active : tabs[0].id}
      onValueChange={setActive}
      className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="border-b border-border px-4 py-3">
        {/* The shared panel-title rank (2026-08-19, visual-consistency audit). This read at 14px --
            one step under the body copy beneath it -- so the title of one of the /advisor page's
            two panels was the quietest text in its own header. */}
        <div className="flex items-center gap-2">
          <PanelTitle icon={Activity}>Deck Advisor</PanelTitle>
          {chip}
        </div>
        {/* Pinned, not tabbed. See the header note. */}
        <p className="mt-1 text-xs text-muted-foreground">{headline}</p>
        {narration && <div className="mt-3">{narration}</div>}
      </div>

      <Tabs.List className="flex gap-1 overflow-x-auto border-b border-border px-1 pt-2">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.id}
            value={tab.id}
            className="group shrink-0 rounded-t-md border-b-2 border-transparent px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-coveo data-[state=active]:text-foreground"
          >
            <span className="block font-bold">{tab.label}</span>
            <span className="block text-2xs tabular-nums text-muted-foreground">{tab.stat}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {tabs.map((tab) => (
        <Tabs.Content key={tab.id} value={tab.id} className="p-4">
          {tab.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
