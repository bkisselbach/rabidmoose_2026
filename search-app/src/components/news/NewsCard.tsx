import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { InteractiveResult } from '@coveo/headless';
import { NewsArt, categoryStyle } from '@/components/news/NewsArt';
import { interactiveResultProps } from '@/lib/useInteractiveResult';
import { newsPath } from '@/lib/paths';
import { formatNewsDate, type NewsRecord } from '@/lib/newsRecord';
import { cn } from '@/lib/utils';

// One article, at three densities:
//   'hero'  the lead story: big art, full dek
//   'tile'  the grid unit
//   'row'   a compact horizontal row, for rails and "related" lists

type NewsCardVariant = 'hero' | 'tile' | 'row';

function CategoryPill({ category }: { category: string }) {
  const { icon: Icon, tint, fg } = categoryStyle(category);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide', tint, fg)}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {category}
    </span>
  );
}

function NewsCardImpl({
  record,
  variant = 'tile',
  interactiveResult,
}: {
  record: NewsRecord;
  variant?: NewsCardVariant;
  /** Logs the Coveo click event for this article. Optional because this card also renders in
   *  "related" rails whose records come from a raw article fetch rather than a result list --
   *  those have no search behind them to attribute a click to, and omitting it is correct there. */
  interactiveResult?: InteractiveResult;
}) {
  const date = formatNewsDate(record.date);
  const clickProps = interactiveResult ? interactiveResultProps(interactiveResult) : {};

  if (variant === 'row') {
    return (
      <Link
        to={newsPath(record.slug)}
        data-testid="news-card"
        {...clickProps}
        className="card-hover group flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 shadow-rest"
      >
        <NewsArt record={record} className="h-14 w-14 shrink-0 rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="card-title-link line-clamp-2 text-sm font-semibold text-foreground">{record.title}</span>
          {date && <span className="mt-0.5 block text-2xs text-muted-foreground">{date}</span>}
        </span>
      </Link>
    );
  }

  const isHero = variant === 'hero';

  return (
    <Link
      to={newsPath(record.slug)}
      data-testid="news-card"
      {...clickProps}
      className={cn(
        'card-hover group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-rest',
        isHero && 'sm:flex-row'
      )}
    >
      {/* THE HERO ART FILLS A CONTENT-DRIVEN BOX; it does not size the card.

          It used to: the art column was `sm:h-auto` and stretched, so the sprite inside NewsArt
          -- capped at `max-h-[82%]` -- had no definite parent height for that percentage to
          resolve against, fell back to its INTRINSIC size, and pushed the lead story to ~335px on
          a 1440px viewport while the text beside it needed ~215. The lead story was tall because
          of a sprite's pixel dimensions, which is not an editorial reason for anything.

          Positioning the art absolutely inside a stretched wrapper inverts that: the text column
          sets the row height, the art fills whatever that is, and `max-h-[82%]` finally has a
          definite height to measure, so the sprite scales down instead of stretching the card.
          Below `sm` the card stacks and the art keeps its own fixed `h-48` band. */}
      {isHero ? (
        <span className="relative block w-full shrink-0 sm:w-2/5">
          <NewsArt record={record} className="h-48 w-full sm:absolute sm:inset-0 sm:h-full" />
        </span>
      ) : (
        <NewsArt record={record} className="aspect-[16/10] w-full shrink-0" />
      )}
      <span className={cn('flex min-w-0 flex-1 flex-col p-4', isHero && 'sm:p-6')}>
        <span className="flex flex-wrap items-center gap-2">
          <CategoryPill category={record.category} />
          {date && <span className="text-2xs text-muted-foreground">{date}</span>}
        </span>
        {/* `.card-title-link` rather than `group-hover:text-primary` (2026-08-18, CSS/theming
            audit): news tiles were the only cards whose title recoloured on hover instead of
            picking up the dotted-to-solid underline every product and species card uses. One
            affordance, so "this title opens the thing" reads the same on all three. */}
        <span
          className={cn(
            'card-title-link mt-2 font-display font-bold text-foreground',
            isHero ? 'line-clamp-3 text-xl sm:text-2xl' : 'line-clamp-2 text-base'
          )}
        >
          {record.title}
        </span>
        {record.excerpt && (
          <span className={cn('mt-2 text-sm text-muted-foreground', isHero ? 'line-clamp-4' : 'line-clamp-2')}>
            {record.excerpt}
          </span>
        )}
        {/* Tags only on the hero -- on a grid tile they push the title around without earning it. */}
        {isHero && record.tags.length > 0 && (
          <span className="mt-3 flex flex-wrap gap-1.5">
            {record.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
                {tag}
              </span>
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}

export function NewsCardSkeleton({ variant = 'tile' }: { variant?: NewsCardVariant }) {
  if (variant === 'row') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
        <div className="skeleton h-14 w-14 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-3/4 rounded-full" />
          <div className="skeleton h-3 w-1/3 rounded-full" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="skeleton aspect-[16/10] w-full" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-4 w-full rounded-full" />
        <div className="skeleton h-3 w-2/3 rounded-full" />
      </div>
    </div>
  );
}

// MEMOIZED (item 31c / performance-plan.md §4b). NewsCard is a pure function of its props, and the
// grids that render it re-render on every notification from any controller subscription on the
// page -- eighteen tiles re-rendering because a facet count changed somewhere else.
//
// THIS ONLY WORKS BECAUSE 31c's FIRST HALF LANDED. Until `useInteractiveProducts` cached the
// controllers, the `interactiveProduct` prop was a fresh object on every render, so a memo
// comparison could never match and this wrapper would have been decoration that read like an
// optimization. Sequence matters here; do not port this to a tile whose controller prop is still
// rebuilt inline.
export const NewsCard = memo(NewsCardImpl);
