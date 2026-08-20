// FIRST import, deliberately. This module seeds `coveo.analytics`' visitor id from the one this app
// owns (see lib/visitorId.ts) as an import-time side effect, and ES module bodies evaluate in import
// order -- so it has to precede anything that transitively constructs a Coveo engine. Moving it
// below the others silently reopens the split-visitor defect it closes.
import './lib/visitorId';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './index.css';

// Both are no-ops outside a Vercel deployment (no env var wiring needed -- they detect the
// platform at runtime), so localhost stays exactly as quiet as before this was added.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* The last resort, and the reason it sits INSIDE the router rather than around it: this one
          catches what App's own route-level boundary cannot -- a throw from the providers, the
          persistent header, the cart button or the event tape, none of which are inside <Routes>.
          With no boundary here at all, React unmounts the whole root on such a throw and the site
          goes white. Inside the router so its fallback can offer real <Link>s home instead of only
          a reload. The wrapper div is the same flex-col shell App renders, so the fallback's footer
          lands at the bottom of the viewport exactly like every other page's. */}
      <div className="flex min-h-screen flex-col">
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </div>
    </BrowserRouter>
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>
);
