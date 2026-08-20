import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ErrorPageShell } from '@/components/ErrorPanel';
import { CRASH_QUIPS, pickQuip } from '@/lib/errorQuips';
import { useSeo } from '@/lib/seo';

// The app's "500". A SPA on static hosting never actually serves one -- the HTML is always a 200 --
// so the whole class of server-error failures shows up here instead, as a React render that throws.
// Until this existed there was NO error boundary anywhere in the tree, and React's documented
// behaviour when a render throws with no boundary above it is to unmount the ENTIRE root. So a
// single bad field on one Coveo response, on one page, blanked the whole site to white: no header,
// no footer, no nav, nothing to click, and no hint that reloading might help. The 404 route was
// carefully handled and its far uglier sibling was not handled at all.
//
// Two instances are mounted (see main.tsx and App.tsx) and they catch different things:
//   * the ROOT one, inside <BrowserRouter> but outside <App>, is the true last resort -- it covers
//     the providers, the persistent header, the cart button and the event tape.
//   * the ROUTE one, around <Routes>, catches the common case (one page threw) while leaving the
//     header mounted, so the visitor can just navigate away from the broken page.
// Both are inside the router on purpose: the fallback uses <Link>, and a fallback whose only escape
// hatch is a full page reload is a worse fallback.

/** Lazy chunks are fetched by URL, and those URLs are content-hashed per build. So a visitor who
 *  had the app open across a deploy asks for a chunk that no longer exists, `import()` rejects, and
 *  React throws it during render -- indistinguishable from a real bug at the type level, entirely
 *  distinguishable by its message. It is worth telling apart because the fix is different and
 *  certain: "Try again" re-runs the same doomed import, while a hard reload fetches the new
 *  index.html and its new chunk names, and always works. */
function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|error loading dynamically imported/i.test(
    message
  );
}

function CrashFallback({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { pathname } = useLocation();
  // Fixed at mount -- see `pickQuip`. A quip that reshuffled while the visitor read it would make a
  // broken page look even more broken.
  const [quip] = useState(() => pickQuip(CRASH_QUIPS));
  const stale = isStaleChunkError(error);

  // Same reasoning as the 404 route: nothing here should ever enter an index. This page's URL is a
  // real page that happens to be failing right now, so `noindex, follow` (what `useSeo` emits) is
  // exactly right -- don't index this state, do keep following the links out of it.
  useSeo({
    title: stale ? 'Please reload' : 'Something went wrong',
    description: 'This page hit an error. Reload, or head back to the Pokédex or the marketplace.',
    path: pathname,
    noindex: true,
  });

  return (
    <ErrorPageShell
      code={stale ? undefined : '500'}
      headline={stale ? 'The app updated under you' : 'Something went wrong'}
      quip={stale ? 'A newer build shipped while this tab was open. One reload and you are back.' : quip}
      detail={
        stale ? null : (
          <>
            The error is logged in the browser console. Reloading fixes most of these; if it doesn&rsquo;t, the page
            itself is broken and that&rsquo;s on us.
          </>
        )
      }
      actions={
        <>
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
          {/* Cheaper than a reload and enough for a transient throw: drop the captured error and
              re-render the same subtree. Hidden on a stale-chunk error, where it cannot work. */}
          {stale ? null : (
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Link to="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline">
            Go home
          </Link>
        </>
      }
    />
  );
}

interface BoundaryProps {
  children: ReactNode;
  /** Changing this clears a captured error. App.tsx passes the pathname, so navigating away from a
   *  page that threw actually renders the destination instead of pinning the fallback forever --
   *  an error boundary has no other way to know the tree underneath it has been replaced. */
  resetKey?: string;
}

class ErrorBoundary extends Component<BoundaryProps, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // React logs the error itself; the component stack is the part that is actually hard to get
    // back afterwards, and it is what identifies WHICH page threw.
    // Deliberate: without it the component stack -- the only thing identifying WHICH page threw --
    // is gone by the time anyone looks.
    // eslint-disable-next-line no-console
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return <CrashFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

/** The route-level boundary: resets itself whenever the path changes. Not folded into `ErrorBoundary`
 *  because `useLocation` is a hook and the boundary has to be a class (there is still no hook form
 *  of `componentDidCatch`). */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

export { ErrorBoundary as AppErrorBoundary };
