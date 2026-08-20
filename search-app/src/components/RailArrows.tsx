import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ScrollRail } from '@/lib/useScrollRail';
import { cn } from '@/lib/utils';

interface Props {
  rail: ScrollRail;
  /** Names what scrolls, for the button labels: "trending cards" -> "Scroll trending cards left". */
  label: string;
  className?: string;
}

/** The one button, shared by both arrangements below so a paired arrow and a flanking arrow can't
 *  drift into two different-looking controls. */
function ArrowButton({
  direction,
  label,
  onClick,
  disabled,
  className,
}: {
  direction: -1 | 1;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const Icon = direction === -1 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Scroll ${label} ${direction === -1 ? 'left' : 'right'}`}
      className={cn(
        'pressable',
        'flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-35 disabled:hover:bg-transparent',
        className
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** The two paging arrows for a `useScrollRail` rail, as an adjacent pair -- for a layout that puts
 *  them in a header row away from the rail itself (the /search Pokédex strip). Desktop-only by
 *  design: touch gets the native swipe, and per Baymard nothing here autorotates -- these buttons
 *  and the swipe are the only ways a rail moves. Renders nothing when the content already fits.
 *
 *  At an edge the arrow stays put and goes dim, because in a header row the pair is a fixed piece
 *  of furniture: removing one would slide the other sideways mid-interaction. `RailArrow` below
 *  makes the opposite call for the opposite reason. */
export function RailArrows({ rail, label, className }: Props) {
  if (!rail.canScroll) return null;

  return (
    <div className={cn('hidden items-center gap-1.5 sm:flex', className)}>
      <ArrowButton direction={-1} label={label} onClick={() => rail.scrollByPage(-1)} disabled={rail.atStart} />
      <ArrowButton direction={1} label={label} onClick={() => rail.scrollByPage(1)} disabled={rail.atEnd} />
    </div>
  );
}

/** ONE arrow, for the flanking arrangement: the caller positions it against the left or right edge
 *  of the rail it drives (2026-08-17, direct instruction -- the home rails' arrows moved out of the
 *  panel header to sit left- and right-aligned with the cards).
 *
 *  It HIDES at its own edge rather than dimming, which is the one deliberate difference from the
 *  pair above. A flanking arrow overlays the cards, so a permanently-visible disabled control would
 *  sit on the first card at rest -- every rail's resting state -- for no reason. Hiding also lines
 *  the arrows up with HomeCardRail's mask fade, which already reveals only the edge that has more
 *  content behind it: arrow and fade now appear and disappear together. */
export function RailArrow({ rail, label, direction, className }: Props & { direction: -1 | 1 }) {
  const atThisEdge = direction === -1 ? rail.atStart : rail.atEnd;
  if (!rail.canScroll || atThisEdge) return null;

  return (
    <ArrowButton
      direction={direction}
      label={label}
      onClick={() => rail.scrollByPage(direction)}
      // Opaque-ish surface + elevation because this one sits ON the artwork rather than on the
      // panel background; the paired version never needs either.
      className={cn('hidden bg-background/90 shadow-rest backdrop-blur-sm sm:flex', className)}
    />
  );
}
