import { buildSearchEngine, loadAdvancedSearchQueryActions } from '@coveo/headless';
import { tapSearchAnalytics } from '@/lib/eventTape';
import { NEWS_SOURCE } from '@/lib/newsFields';

const organizationId = import.meta.env.VITE_COVEO_ORG_ID as string;
const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN as string;

if (!organizationId || !accessToken) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_COVEO_ORG_ID / VITE_COVEO_SEARCH_TOKEN. Copy .env.example to .env.local and fill them in.');
}

// The Pokémon News engine -- the app's THIRD Coveo engine, and its third source in one federated
// index (cards via Commerce, species via `pokedex-push`, news via `pokemon-news-push`).
//
// Its own engine rather than a reuse of `searchEngine`, for the two reasons vaultEngine.ts already
// records and which apply identically here:
//
// 1. Executing a search on a shared engine leaks that query, its results and its facet selections
//    into every other surface bound to it -- they share one redux slice and fight over it.
//    AskPokedex.tsx established the pattern, the Vault was the second instance, this is the third,
//    so it is settled convention rather than a judgement call.
// 2. `searchHub` is engine-level configuration with no per-request override, so routing to a
//    dedicated pipeline is only expressible as a separate engine.
//
// `searchHub: 'Pokemon News'` is the routing key for a `pokemon-news` query pipeline whose
// condition is `when $searchHub is "Pokemon News"`. VERIFIED 2026-08-17 that the pipeline does NOT
// exist yet: probing the hub returns `pipeline: "pokedex-querypipeline"`, the default fallback.
// That is correct and inert -- the fallback carries the Pokédex's own tuning, which is harmless
// here -- and this value becomes load-bearing the moment the pipeline is hand-created, with no code
// change. (Hand-created: item 12a established API-created pipelines in this org never leave
// `condition.ready: false`.)
export const newsEngine = buildSearchEngine({
  configuration: {
    organizationId,
    accessToken,
    search: {
      searchHub: 'Pokemon News',
    },
    // Mirrors searchEngine.ts / vaultEngine.ts: 'next' is the SDK default but isn't fully supported
    // for the Coveo-for-Service-flavored features these engines can grow.
    analytics: {
      analyticsMode: 'legacy',
      analyticsClientMiddleware: tapSearchAnalytics('News'),
    },
  },
});

// News only, enforced at the request level rather than by filtering the response: the org's index
// holds 5,826 documents across four sources, so without this the news page would return cards and
// species.
//
// A CONSTANT QUERY, not the permanently-selected `buildTab` that searchEngine.ts and AskPokedex.tsx
// use for the same job. vaultEngine.ts:49-64 measured why, and the reasoning transfers exactly:
// `tab.select()` dispatches its own `interfaceChange` search, which this page's
// `executeFirstSearch()` then aborts, and Headless logs every aborted thunk as
// `Action dispatch error search/executeSearch/rejected` -- so the page would open with a console
// error the app's other routes don't have, plus a wasted round trip. This page searches on mount,
// which is precisely the condition that triggers it.
//
// `registerAdvancedSearchQueries` is a plain reducer action -- it sets `cq` on the request and
// dispatches nothing -- so the page sends exactly one search. `cq` is also what a Tab expression
// compiles into anyway: constant, cached by the index, and excluded from ranking, which is right
// for a source filter.
const { registerAdvancedSearchQueries } = loadAdvancedSearchQueryActions(newsEngine);
newsEngine.dispatch(registerAdvancedSearchQueries({ cq: `@source=="${NEWS_SOURCE}"` }));
