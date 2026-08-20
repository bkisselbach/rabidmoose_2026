import { buildSearchEngine, loadAdvancedSearchQueryActions } from '@coveo/headless';
import { tapSearchAnalytics } from '@/lib/eventTape';

const organizationId = import.meta.env.VITE_COVEO_ORG_ID as string;
const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN as string;

if (!organizationId || !accessToken) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_COVEO_ORG_ID / VITE_COVEO_SEARCH_TOKEN. Copy .env.example to .env.local and fill them in.');
}

// The Pokédex Vault's OWN engine, deliberately not the shared `searchEngine` from searchEngine.ts.
// Two independent reasons, both from pokedex-vault-plan.md D4:
//
// 1. Executing a search on the shared engine leaks that query, its results and its facet
//    selections into /search's Pokédex strip -- the two surfaces would share one redux slice and
//    fight over it. AskPokedex.tsx:53-75 already builds dedicated engines for exactly this reason
//    and records the same finding; this is the third instance of the same rule, so it is a
//    convention now rather than a one-off.
// 2. The Vault needs its own `searchHub`, and searchHub is engine-level configuration -- there is
//    no per-request override. Routing to a dedicated pipeline is therefore only expressible as a
//    separate engine.
//
// `searchHub: 'Pokedex Vault'` is the routing key for the `pokedex-vault` query pipeline
// (condition `when $searchHub is "Pokedex Vault"`). Until that pipeline is hand-created in the
// Admin Console -- and it MUST be hand-created; item 12a established that API-created pipelines in
// this org never leave `condition.ready: false` -- an unmatched hub simply falls back to the
// default `pokedex-querypipeline`, which is the same tuning /search's content half already runs on.
// So this value is correct and inert today, and becomes load-bearing the moment the pipeline
// exists, with no code change.
export const vaultEngine = buildSearchEngine({
  configuration: {
    organizationId,
    accessToken,
    search: {
      searchHub: 'Pokedex Vault',
    },
    // Mirrors searchEngine.ts: 'next' is the SDK default but isn't fully supported for the
    // Coveo-for-Service-flavored features this engine will grow in Phase 4 (Generated Answer).
    analytics: {
      analyticsMode: 'legacy',
      analyticsClientMiddleware: tapSearchAnalytics('Vault'),
    },
  },
});

// Species only, enforced at the request level rather than by filtering the response (plan D2): the
// org's index holds the card catalog alongside the species content, so without this the Vault would
// return cards.
//
// A CONSTANT QUERY, not the permanently-selected `buildTab` that searchEngine.ts and AskPokedex.tsx
// both use for the same job. The tab is the more idiomatic spelling and was the first thing built
// here, but on THIS page it is measurably wrong: `tab.select()` dispatches its own `interfaceChange`
// search, and the page's `executeFirstSearch()` then aborts that in-flight request. Headless logs
// every aborted thunk as `Action dispatch error search/executeSearch/rejected`, so /pokedex opened
// with a console error the app's other routes don't have -- measured on a cold load, deterministic,
// every time, and it also spent a wasted round trip. The other two engines don't hit this because
// neither searches on mount: /search gates its content-engine first search behind a zone/facet
// check, and AskPokedex only searches when the visitor asks something, both long after the tab's
// own search has settled uncontested.
//
// `registerAdvancedSearchQueries` is a plain reducer action -- it sets `cq` on the request and
// dispatches nothing -- so the page sends exactly one search. `cq` is also what a Tab expression
// compiles into anyway: constant, cached by the index, and excluded from ranking, which is right for
// a source filter. The one thing given up is the `tab` field on the analytics payload; searchHub
// (above) is what actually routes the pipeline, and that is unaffected.
const { registerAdvancedSearchQueries } = loadAdvancedSearchQueryActions(vaultEngine);
vaultEngine.dispatch(registerAdvancedSearchQueries({ cq: '@source=="pokedex-push"' }));
