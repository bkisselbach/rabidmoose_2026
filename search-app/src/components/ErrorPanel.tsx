import { PageShell } from '@/components/PageShell';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MooseMark } from '@/components/MooseMark';
import { PageTitle } from '@/components/PageTitle';
import { cn } from '@/lib/utils';

// Every dead end in the app renders through here: the catch-all 404 route, the crash boundary, and
// the three detail pages' "no such card / species / story" states. Before this they were five
// hand-rolled blocks -- one with a mascot and two links, one with a heading and two links, and
// three that were a single line of grey `text-muted-foreground` with no way out of the page at all.
// A dead end is the one screen with nothing of its own to show, which makes it the screen where
// brand and a next action are the *only* things left to show; a bare sentence gives neither.
//
// Split in two on purpose:
//   * `ErrorPanel` is the block alone, for pages that already own their <main>/<SiteFooter> chrome
//     and are swapping their own body out (the PDP, the species page, the article page).
//   * `ErrorPageShell` wraps it in that chrome, for the surfaces that ARE the whole page (the
//     catch-all route, the crash fallback).

export function ErrorPanel({
  code,
  headline,
  quip,
  detail,
  actions,
  className,
}: {
  /** The big numeral, when there is an honest HTTP-ish one to show ("404"). Entity-level states
   *  inside a real page leave it off -- the URL matched a route, so a 404 numeral would be a lie. */
  code?: string;
  headline: string;
  quip: string;
  /** The specific, unfunny fact: which path, which id, what the service said. */
  detail?: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('py-16 text-center sm:py-24', className)}>
      {/* Decorative: `MooseMark` with no `title`, because the headline below already says the thing
          out loud and a second announcement of it is noise to a screen reader. */}
      <MooseMark className="mx-auto mb-4 h-24 w-24" />
      {code ? <p className="font-display text-6xl font-bold text-foreground">{code}</p> : null}
      <PageTitle className={cn(code && 'mt-3')}>{headline}</PageTitle>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{quip}</p>
      {detail ? <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{detail}</p> : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>
    </div>
  );
}

/** The standard pair of escapes. Every dead end offers at least these two, so wherever a visitor
 *  lands wrong they get the same way home -- and the marketplace, which is the page most of them
 *  were trying to reach in the first place. */
export function ErrorPanelDefaultActions() {
  return (
    <>
      <Link to="/" className="text-sm font-semibold text-primary hover:underline">
        Go home
      </Link>
      <Link to="/search" className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline">
        Browse all cards &rarr;
      </Link>
    </>
  );
}

/** `ErrorPanel` plus the page chrome, for the surfaces that occupy the whole route. Deliberately
 *  does NOT render `SiteHeader` -- App.tsx mounts exactly one, above the routes, and a second copy
 *  here would double the nav on the 404 page. */
export function ErrorPageShell(props: Parameters<typeof ErrorPanel>[0]) {
  return (
      <PageShell padded={false}>
        <ErrorPanel {...props} />
      </PageShell>
  );
}
