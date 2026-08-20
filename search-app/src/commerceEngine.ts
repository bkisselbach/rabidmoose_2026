import { buildCommerceEngine } from '@coveo/headless/commerce';
import { loadCartItems } from '@/lib/cartStorage';
import { navigatorContext } from '@/lib/visitorId';
import { tapCommerceRelay } from '@/lib/eventTape';

const organizationId = import.meta.env.VITE_COVEO_ORG_ID as string;
const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN as string;
const trackingId = (import.meta.env.VITE_COVEO_TRACKING_ID as string) || 'pokemon-catalog';

if (!organizationId || !accessToken) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_COVEO_ORG_ID / VITE_COVEO_SEARCH_TOKEN. Copy .env.example to .env.local and fill them in.');
}

const sharedConfiguration = {
  organizationId,
  accessToken,
  analytics: {
    trackingId,
  },
  context: {
    currency: 'USD' as const,
    country: 'US',
    language: 'en',
    view: {
      url: typeof window !== 'undefined' ? window.location.href : 'https://pokemon-tcg-marketplace.local/',
    },
  },
};

export const commerceEngine = buildCommerceEngine({
  configuration: {
    ...sharedConfiguration,
    cart: {
      items: loadCartItems(),
    },
  },
  // Report ONE visitor id that this app owns, rather than letting Headless keep its own private
  // one. Two reasons: the raw fetches elsewhere have to attribute to the same visitor (they were
  // sending component names in this field), and personalization keys on this value, so the persona
  // switcher needs somewhere to change it. The provider is called per request, so a swap takes
  // effect without rebuilding the engine. See lib/visitorId.ts.
  navigatorContextProvider: navigatorContext,
});

// The Event Tape observes the Event Protocol events this engine really emits -- productView,
// productClick, cartAction, purchase -- from Relay's own emission path, so the overlay can never
// show a row for an event that wasn't sent. Only the transacting engine is tapped: `catalogEngine`
// below serves decorative catalog-wide reads. See lib/eventTape.ts.
tapCommerceRelay(commerceEngine.relay);

// All buildSearch (and buildProductListing) controllers on one engine share that engine's single
// search/listing state slice -- a second controller is another view over the same request, not an
// isolated channel. The catalog-wide trending controllers in homeControllers.ts feed surfaces
// that must never track the current page's query (the Shop mega menu's type/rarity counts, the
// home trending sections), so they get their own engine: on commerceEngine, SearchResultsPage's
// search controller overwrote their "whole catalog" facet counts with the active query's, and a
// zero-result query emptied them outright (Shop menu stuck on "Loading…" until a hard reload).
// Same isolation move as searchEngine.ts's pokedex tab, one layer down. No cart config here --
// nothing on this engine transacts, and cart state stays commerceEngine's alone.
export const catalogEngine = buildCommerceEngine({
  configuration: sharedConfiguration,
  navigatorContextProvider: navigatorContext,
});
