import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// The one PANEL title, the rank below `SectionHeader`'s (2026-08-19, visual-consistency audit).
//
// The app has two heading jobs inside a page and, until this file, four spellings of them:
//
//   SectionHeader  h2   font-display text-xl font-bold sm:text-2xl  + a 32px icon TILE
//   AskPokedex     h3   font-display text-lg font-bold sm:text-xl   + a 16px inline icon
//   ConsultantPanel h3  text-lg text-primary (no display face, weight from CardTitle) + 24px icon
//   DeckAdvisor /
//   CollectionPanels h3 text-sm font-bold                            + a 16px inline icon
//
// Measured live: 24px / 20px / 18px / 14px. The last one is the tell -- "Deck Advisor" and "Set
// Collector" are the titles of the two panels the /advisor page is entirely made of, and they
// rendered one step SMALLER than the body copy around them, so the page's two main surfaces were
// announced more quietly than the sentences inside them. And AskPokedex sits on the species page
// and the PDP directly beside a SectionHeader, where two sibling section titles came in two ranks
// apart.
//
// So: SECTION headers (a zone of the page, `SectionHeader`, 24px, icon in a tile) and PANEL titles
// (the header of one bounded surface, this, 20px, inline icon). AskPokedex's spelling is the one
// kept, because it was already the only one of the four that agreed with SectionHeader on family
// (`font-display`) and on how it steps down from it.
//
// `className` still recolours -- ConsultantPanel's title is deliberately amber, and that is a
// colour decision, not a rank one. The rank is what was drifting.
export function PanelTitle({
  icon: Icon,
  children,
  className,
  /** Icon tint. `text-primary` for the site's own panels, `text-coveo` for a panel whose whole
   *  subject is a platform capability (Ask the Pokédex). */
  iconClassName = 'text-primary',
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <h3 className={cn('flex items-center gap-2 font-display text-lg font-bold text-foreground sm:text-xl', className)}>
      <Icon className={cn('h-4 w-4 shrink-0', iconClassName)} aria-hidden="true" />
      {children}
    </h3>
  );
}
