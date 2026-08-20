import { buildSearchEngine, loadAdvancedSearchQueryActions } from '@coveo/headless';
import { tapSearchAnalytics } from '@/lib/eventTape';

const organizationId = import.meta.env.VITE_COVEO_ORG_ID as string;
const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN as string;

if (!organizationId || !accessToken) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_COVEO_ORG_ID / VITE_COVEO_SEARCH_TOKEN. Copy .env.example to .env.local and fill them in.');
}

export const searchEngine = buildSearchEngine({
  configuration: {
    organizationId,
    accessToken,
    // The `/search` page's Pokédex-content half. Was `'default'` until 2026-08-18, which made the
    // app's single busiest classic-Search surface indistinguishable in the query logs from every
    // other unlabelled caller -- and left it invisible to per-hub ML scoping and QPM reporting
    // while still consuming quota. See presentation/search-hub-plan.md §2.2.
    //
    // As with vaultEngine.ts / newsEngine.ts, the matching `pokedex-content` pipeline must be
    // HAND-CREATED in the Admin Console -- item 12a established that API-created pipelines in this
    // org never leave `condition.ready: false`. Until it exists this hub falls back to the org
    // default `pokedex-querypipeline`, which is exactly where `'default'` already routed, so the
    // change is inert for ranking and becomes load-bearing the moment the pipeline exists.
    //
    // Moved BEFORE item 28 Phase A deliberately: ART/PQS/DNE train per hub+pipeline, so changing a
    // hub after click events start flowing would discard the history collected under the old one.
    // Today there is nothing to discard -- the classic engines send no click events at all yet.
    search: {
      searchHub: 'Pokedex Content',
    },
    // Defaults to 'next' otherwise, which the SDK warns isn't fully supported for Coveo-for-
    // Service-flavored features (e.g. Generated Answer, used by ContentGeneratedAnswer.tsx).
    analytics: {
      analyticsMode: 'legacy',
      // Observer only -- returns the payload untouched. Feeds the Event Tape overlay from the
      // real emission path rather than from duplicated call sites. See lib/eventTape.ts.
      analyticsClientMiddleware: tapSearchAnalytics('Pokédex'),
    },
  },
});

// The org's index holds both the character content (this source) and the commerce catalog
// (a separate Catalog source), so every query from this engine has to be scoped to character
// content only or the two bleed into each other.
//
// A CONSTANT QUERY, not the permanently-selected `buildTab` this file used until 2026-08-19 --
// the same swap vaultEngine.ts:49-64 and newsEngine.ts already made, for the same reason.
// `tab.select()` dispatches its own `interfaceChange` search, and on `/search` that search races
// the page's `executeFirstSearch()`.
//
// **vaultEngine.ts's comment claimed this page was exempt** ("/search gates its content-engine
// first search behind a zone/facet check ... long after the tab's own search has settled
// uncontested"). Measured 2026-08-19 on a cold `/search?q=<term>`, that is wrong: the tab's
// QUERY-LESS search goes out first, the real one goes out second, and the console carries
// `Action dispatch error search/executeSearch/rejected` on every cold load of all three probed
// queries. The exemption only ever held for the no-query browse path.
//
// Which of the two responses paints is a race decided by latency rather than by anything in this
// codebase -- the demo-relevancy sweep caught the losing side against production
// (`presentation/demo-relevancy-testbook.md` §7.3: the rail rendering the same ten unfiltered
// species under a confident "10 Pokémon matches" heading, identical for four different queries),
// while the same cold load against a local dev server resolves the right way round every time.
// That split is the signature of a race, which is why this is fixed at the cause rather than by
// re-ordering the effects that read it.
//
// `registerAdvancedSearchQueries` is a plain reducer action -- it sets `cq` on the request and
// dispatches nothing -- so the page sends exactly one content search. `cq` is also what a Tab
// expression compiles into anyway: constant, cached by the index, and excluded from ranking,
// which is right for a source filter. The one thing given up is the `tab` field on the analytics
// payload; `searchHub` (above) is what routes the pipeline, and that is unaffected.
const { registerAdvancedSearchQueries } = loadAdvancedSearchQueryActions(searchEngine);
searchEngine.dispatch(registerAdvancedSearchQueries({ cq: '@source=="pokedex-push"' }));
