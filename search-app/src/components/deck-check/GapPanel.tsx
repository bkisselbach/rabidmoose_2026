import type { LucideIcon } from 'lucide-react';
import { GapProductRow } from '@/components/deck-check/GapProductRow';
import type { ResolvedGap } from '@/lib/useGapSuggestions';

// The shared shape for the two gap panels that now sit SIDE BY SIDE — "To play these, you also
// need" and "Suggested pickups".
//
// WHY THIS EXISTS (2026-08-19, direct request: they must be identical in shape and the cards must
// line up). Before this the two panels were built independently and diverged in every structural
// way that matters when they are adjacent:
//
//   * one had a CoveoChip in its header, the other didn't
//   * one opened with a variable-length <ul> of "Leafeon evolves from Eevee" sentences — seven of
//     them on Marcus's deck — and the other opened with a single paragraph, so the first card row
//     started at a completely different height in each column
//   * one separated its rows with a border-t, the other with space-y-5
//   * neither had a footer, so the honesty line and the "these close the gap" line sat in
//     different places relative to the cards
//
// So the two columns read as two different components that happened to be next to each other. One
// panel definition fixes it by construction: same header row, same clamped intro block, same row
// treatment, same footer pinned to the bottom. A caller chooses the icon, the words and the rows —
// never the layout.
//
// EQUAL HEIGHT IS LOAD-BEARING, not cosmetic. The panel is `h-full` inside a stretch grid and the
// footer is pushed down with `mt-auto`, so both columns end level however many rows each has. The
// intro is clamped to a fixed two-line box for the same reason: it is what makes the first card row
// begin at the same y in both columns, which is the thing that was actually asked for.

interface Props {
  /** Header icon and title. Omitted when this renders as a Deck Advisor TAB BODY — the tab strip
   *  is the header there, and a second one inside the panel would title the same thing twice. */
  icon?: LucideIcon;
  title?: string;
  /** Drops the panel's own border, radius and padding for the same reason: inside a tab, the
   *  Tabs.Content wrapper already provides them. */
  bare?: boolean;
  /** The provenance marker. Both panels carry one — they are both Coveo reads. */
  chip?: React.ReactNode;
  /** One or two lines saying what this panel is. Clamped so the two columns stay aligned. */
  intro: React.ReactNode;
  rows: ResolvedGap[];
  /** The caveat or the claim, whichever this panel owes the reader. Pinned to the bottom. */
  footer: React.ReactNode;
  /** Rendered in place of the rows while they resolve, or when there are none. */
  fallback?: React.ReactNode;
}

export function GapPanel({ icon: Icon, title, bare = false, chip, intro, rows, footer, fallback }: Props) {
  return (
    <div
      className={
        bare
          ? 'flex h-full min-w-0 flex-col'
          : 'flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4'
      }
    >
      {Icon && title && (
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="eyebrow flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {title}
          </span>
          {chip}
        </div>
      )}

      {/* Two lines when this is a standalone panel, so side-by-side columns start their card rows
          at the same height. Bare (in a tab) there is nothing to align against, so it takes its
          natural height rather than reserving a second line it may not use. */}
      <p
        className={`mb-3 text-2xs leading-relaxed text-muted-foreground${
          bare ? '' : ' line-clamp-2 min-h-[2.25rem]'
        }`}
      >
        {intro}
      </p>

      {rows.length > 0 ? (
        <div className="space-y-5">
          {rows.map((gap) => (
            <GapProductRow key={gap.label} gap={gap} />
          ))}
        </div>
      ) : (
        fallback
      )}

      {/* `mt-auto` is what levels the two columns: whichever panel has fewer rows grows its gap
          here rather than ending short. */}
      <p className="mt-auto pt-4 text-2xs leading-relaxed text-muted-foreground">{footer}</p>
    </div>
  );
}
