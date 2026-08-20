import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ErrorPageShell } from '@/components/ErrorPanel';
import { NOT_FOUND_QUIPS, pickQuip } from '@/lib/errorQuips';
import { useSeo } from '@/lib/seo';

// Catch-all for unmatched routes. A SPA on static hosting can't return a real HTTP 404 -- Vercel
// rewrites every unknown path to index.html with a 200 (see vercel.json) -- so the next-best SEO
// behavior is an explicit "not found" page that noindexes itself; otherwise crawlers see every
// mistyped URL as a blank-but-200 page (a soft 404) and may index it.
export function NotFoundPage() {
  const { pathname } = useLocation();
  // Chosen once per mount, never per render -- see `pickQuip`.
  const [quip] = useState(() => pickQuip(NOT_FOUND_QUIPS));

  useSeo({
    title: 'Page not found',
    description: 'This page does not exist. Browse the Pokédex or shop live-priced Pokémon cards instead.',
    path: pathname,
    noindex: true,
  });

  return (
    <ErrorPageShell
      code="404"
      headline="Page not found"
      quip={quip}
      // The joke goes above, the fact goes below: whatever the quip says, the visitor still needs
      // to see the path they actually asked for -- that's what tells them it was a typo.
      detail={
        <>
          There&rsquo;s nothing at <span className="break-all font-mono">{pathname}</span>. It may have moved, or the
          link may be mistyped.
        </>
      }
      actions={
        <>
          <Link to="/" className="text-sm font-semibold text-primary hover:underline">
            Go home
          </Link>
          <Link to="/search" className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline">
            Browse all cards &rarr;
          </Link>
          {/* The third link the old page didn't have. Half the app is the Pokédex, and a dead
              /pokedex/* link (the most likely way to land here by hand) is a species lookup that
              missed -- sending those visitors only to the card marketplace answers the wrong half. */}
          <Link
            to="/pokedex"
            className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
          >
            Open the Pok&eacute;dex &rarr;
          </Link>
        </>
      }
    />
  );
}
