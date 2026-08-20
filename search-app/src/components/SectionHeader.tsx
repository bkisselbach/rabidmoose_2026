import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  icon: LucideIcon;
  title: ReactNode;
  /** Inline slot next to the title, e.g. a count badge. */
  meta?: ReactNode;
  /** Right-aligned slot, e.g. a CoveoChip naming the capability behind the section. */
  chip?: ReactNode;
  className?: string;
}

// The shared section frame for both detail pages: every major zone (the card, the Pokemon data,
// more cards) opens with the same icon-tile + display-font title + provenance-chip row, so a page
// reads as a few clearly-bounded sections instead of a stack of look-alike panels.
export function SectionHeader({ icon: Icon, title, meta, chip, className }: Props) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-3',
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">{title}</h2>
        {meta}
      </div>
      {chip}
    </div>
  );
}
