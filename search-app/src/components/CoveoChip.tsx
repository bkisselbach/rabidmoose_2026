import { Tooltip } from 'radix-ui';
import { cn } from '@/lib/utils';

// Provenance marker: a single small Coveo mark on a page section, so anyone reading the page can
// see at a glance which parts of it come from the platform. Hovering (or focusing) it opens a
// tooltip listing every capability serving that section -- one mark per section rather than one
// visible pill per capability, so a section with several capabilities (search + ranking + facets,
// say) doesn't turn into a row of badges.
//
// ALWAYS VISIBLE, on every surface (2026-08-19, direct instruction: "I want all the coveo icons
// always visible, get rid of the toggle"). Markers used to be gated behind a Demo Mode ("Coveo
// lens") switch in the header, with an `alwaysVisible` escape for the handful that predated it --
// two classes of marker, and a default state in which the page disclosed nothing. Both are gone:
// the gate, the prop, and `lib/DemoModeContext.tsx` itself. Provenance is part of this product's
// normal presentation now, which is also what makes the "one mark per section" rule load-bearing
// rather than cosmetic -- there is no longer a toggle to hide an over-marked page behind.
//
// CAPABILITIES is the single registry for the whole app, and doubles as the written inventory of
// what Coveo powers here -- every surface that grows a marker adds its entry below rather than
// inventing copy inline.

type CoveoCapability =
  | 'commerce-catalog'
  | 'commerce-listing'
  | 'commerce-controllers'
  | 'pokedex-index'
  | 'news-index'
  | 'ml-recommendations'
  | 'passage-retrieval'
  | 'generated-answer'
  | 'product-enrichment'
  | 'product-view'
  | 'query-suggest'
  | 'instant-products'
  | 'instant-pokedex'
  | 'did-you-mean'
  | 'fuzzy-fallback'
  | 'query-understanding'
  | 'deck-check'
  | 'graded-pricing'
  | 'printing-pricing'
  | 'recently-viewed'
  | 'index-matchup'
  | 'ml-ranking'
  | 'semantic-encoder'
  | 'local-typeahead'
  | 'thesaurus'
  | 'stop-words'
  | 'featured-result'
  | 'dynamic-facets'
  | 'url-manager'
  | 'cart-analytics'
  | 'notify-trigger'
  | 'ai-consultant';

interface Capability {
  label: string;
  /** The SHORT summary, one line at tooltip width. This is what a merged marker shows per entry --
   *  a section served by five capabilities still has to fit on a laptop screen, so `detail` is too
   *  long to stack. Write it as a sentence a reader gets in one pass, and keep the honesty of the
   *  long form: the entries that are not Coveo say so here too. */
  brief: string;
  /** The FULL plain-language explanation, rendered when a marker names exactly one capability. */
  detail: string;
  /** Documents actual ML/LLM capabilities within the registry; not read for rendering. */
  ai?: boolean;
  /** The endpoint or event this surface actually calls. */
  api: string;
  /** The model or configuration object behind it. */
  config: string;
  /** Where a human changes it -- the point of the whole exercise: most of this is config, not code. */
  where: string;
}

const CAPABILITIES: Record<CoveoCapability, Capability> = {
  'commerce-catalog': {
    label: 'Commerce Search API',
    brief: "Live product data from the Commerce Catalog source.",
    detail: 'Live product data — names, imagery, market pricing, card fields — served from the Coveo Commerce Catalog source.',
    api: 'POST /commerce/v2/search',
    config: 'Catalog + product fields (ec_name, ec_price, cardrarity, cardsetname, cardhp…)',
    where: 'Merchandising Hub → Catalog · Admin → Sources',
  },
  'commerce-listing': {
    label: 'Commerce Listing API',
    brief: "No-query browsing on the dedicated Listing endpoint, so Listing-tier ML can score it.",
    detail:
      'No-query browsing served by the dedicated commerce/v2/listing endpoint so Listing-tier ML can score it — with a transparent Search fallback until the Listing configuration is provisioned.',
    api: 'POST /commerce/v2/listing',
    config: 'Listing configuration bound to this tracking ID (falls back to Search when absent)',
    where: 'Merchandising Hub → Listings',
  },
  'commerce-controllers': {
    label: 'Sort + pagination',
    brief: "Sort options and paging, merchandiser-configured rather than hardcoded here.",
    detail:
      'Sort criteria and paging ride the same Commerce request as the results — the available sorts are merchandiser-configured, not hardcoded in this UI.',
    api: 'sortCriteria + pagination on the Search/Listing request',
    config: 'Sort options and default page size',
    where: 'Merchandising Hub → Sorts · Headless pagination controller',
  },
  'pokedex-index': {
    label: 'Pokédex index',
    brief: "Species records served from the pokedex-push content source.",
    detail: 'Species data served by the Coveo Search API from the pokedex-push content source.',
    api: 'POST /rest/search/v2',
    config: 'Source: pokedex-push (Push API), mapped pokemon* fields, tab scoped to @source',
    where: 'Admin → Content → Sources · Fields',
  },
  'news-index': {
    label: 'Newsroom index',
    brief: "A third corpus in the same federated index: the newsroom source.",
    detail:
      'The app’s third source in one federated index: news articles served by the Coveo Search API from the pokemon-news-push Push source, on their own engine and search hub. Search, the Category/Game/Topic/Pokémon/Set facets, the Newest–Oldest sort, paging and did-you-mean are all real Coveo — the same controllers /search and the Pokédex Vault run on, against a third corpus. Worth being exact about what is and isn’t ours: the headlines, dates, categories and one-line summaries are real records from pokemon.com/us/news, while the article body text was written for this proof of concept. The retrieval is Coveo; the prose is not journalism.',
    api: 'POST /rest/search/v2 (+ /rest/search/v2/html for the article body via Quickview)',
    config: 'Source: pokemon-news-push (Push API), 9 mapped news* fields, cq-scoped to @source, searchHub "Pokemon News"',
    where: 'Admin → Content → Sources · Fields',
  },
  'ml-recommendations': {
    label: 'ML Recommendations',
    brief: "Products picked by a Coveo ML strategy on a Merchandising Hub slot.",
    detail: 'Products picked by a Coveo Machine Learning recommendation strategy (Merchandising Hub slot), seeded by this product.',
    ai: true,
    api: 'POST /commerce/v2/recommendations',
    config: 'Recommendation slot: strategy + PDP placement, seeded by the current product id',
    where: 'Merchandising Hub → Recommendations',
  },
  'passage-retrieval': {
    label: 'AI Passage Retrieval',
    brief: "The best passages from indexed pages, ranked by semantic ML.",
    detail: 'The most relevant passages from crawled web pages, ranked by Coveo semantic ML models via the Passage Retrieval API.',
    ai: true,
    api: 'POST /rest/search/v3/passages/retrieve',
    config: 'Semantic passage ranking over the indexed sources, scoped by search hub',
    where: 'Admin → Sources (web crawler) · search hub "default"',
  },
  'generated-answer': {
    label: 'Generative Answering',
    brief: "An LLM answer grounded in the indexed content, with citations.",
    detail: 'Coveo Relevance Generative Answering (RGA): an LLM answer grounded in the indexed Pokédex content, with citations.',
    ai: true,
    api: 'Headless buildGeneratedAnswer → RGA answer stream',
    config: 'Answer Configuration (scope, tone, citation behavior) + the GenQA model',
    where: 'Admin → Generative Answering → Answer configurations',
  },
  'product-enrichment': {
    label: 'Product Enrichment',
    brief: "Merchandiser badge rules evaluated per product at query time.",
    detail: 'Merchandiser badge rules (rarity, era, price) evaluated per product by the Coveo Product Enrichment service.',
    api: 'Enrichment fields returned per product',
    config: 'Badge rules evaluated per product — rarity, era and price thresholds',
    where: 'Merchandising Hub → Product enrichment',
  },
  'product-view': {
    label: 'Product view event',
    brief: "Each card page reports ec.productView — the signal the ML models train on.",
    detail: 'Every card page load reports an ec.productView event — the behavioral signal recommendations and query suggestions train on.',
    api: 'ec.productView (buildProductView)',
    config: 'Fires once per product detail page load',
    where: 'Client-side event → Usage Analytics',
  },
  'query-suggest': {
    label: 'Query Suggest',
    brief: "Completions from an ML model trained on this org’s own analytics.",
    detail:
      'Type-ahead completions from a Coveo ML Predictive Query Suggestion model, trained on this org’s search & click analytics.',
    ai: true,
    api: 'POST /commerce/v2/search/querySuggest',
    config: 'Predictive Query Suggestions (PQS) model trained on this org’s Usage Analytics',
    where: 'Admin → Machine Learning → Models',
  },
  'instant-products': {
    label: 'Instant Products',
    brief: "Live product previews rendered per keystroke.",
    detail:
      'Product previews rendered per keystroke by the Commerce Search API (buildInstantProducts), alongside recent-query history.',
    api: 'POST /commerce/v2/search (buildInstantProducts)',
    config: 'Bound to the header search box id; recent queries persist client-side',
    where: 'Headless controller — no server config',
  },
  'instant-pokedex': {
    label: 'Instant Pokédex',
    brief: "Live species previews per keystroke, from the second engine.",
    detail:
      'Species previews rendered per keystroke by the (non-commerce) Search API (buildInstantResults), against the same pokedex-push content this app’s other Pokédex surfaces read — one typeahead now answers "what card?" and "what Pokémon?" from the two engines side by side.',
    api: 'POST /rest/search/v2 (buildInstantResults)',
    config: 'Tab-scoped to @source=="pokedex-push"; driven by the same debounced query as Instant Products',
    where: 'Headless controller — no server config',
  },
  'did-you-mean': {
    label: 'Did You Mean',
    brief: "ML query correction on misspelled queries.",
    detail:
      'ML query correction (queryCorrectionMode: "next") — misspelled queries corrected by the trained query-suggestions model.',
    ai: true,
    api: 'queryCorrection on the search response',
    config: 'queryCorrectionMode: "next" — corrections come from the ML model, not an index dictionary',
    where: 'Headless option + Admin → Machine Learning',
  },
  'fuzzy-fallback': {
    label: 'Fuzzy match fallback',
    brief: "App-side typo safety net — not Coveo — for misspellings the server can’t reach.",
    detail:
      "Not a Coveo capability — Coveo's own commerce query correction only fixes 1-character typos, with no admin setting to widen it. This is a client-side Levenshtein match against the Pokedex species names (fetched via the Search API) that only kicks in when the server correction finds nothing.",
    api: 'Client-side match; vocabulary fetched via POST /rest/search/v2',
    config: 'None — implemented in app code (search-app/src/lib/fuzzyMatch.ts), not Admin-configurable',
    where: 'search-app source, not Coveo Admin',
  },
  'query-understanding': {
    label: 'Query understanding',
    brief: "App-side parsing that turns a sentence into a real Coveo request. Not Coveo itself.",
    detail:
      "Not a Coveo capability — app-layer parsing that reads the intent out of a conversational query and turns it into a real Coveo request: filler dropped, colloquial words mapped to indexed vocabulary (\"air\" → Flying), and stated constraints — type, rarity, and budget — lifted into facet selections you can remove like any other filter. Coveo does the retrieval; this only decides what to ask it. Note what is NOT hardcoded: the counter types come from a groupBy over the index's own weakness data, the rarity ladder from the live cardrarity vocabulary, and \"cheap\"/\"premium\" from the live ec_price facet tiers — so retuning the Price facet in the Merchandising Hub retunes what \"cheap\" means, with no deploy. The complementary server-side half — conversational stop words on the query pipelines — IS Coveo config, and is chipped separately.",
    api: 'Client-side parse; the resulting facet selections and query run through the normal Commerce/Search requests',
    config:
      'None — implemented in app code (queryIntent.ts + priceIntent.ts + typeMatchups.ts + cardRarities.ts), not Admin-configurable. The vocabularies it resolves against are all live index/facet reads.',
    where: 'search-app source, not Coveo Admin',
  },
  'graded-pricing': {
    label: 'Index enrichment — graded market',
    brief: "PSA-graded market data pushed into the same catalog documents.",
    detail:
      "Real eBay sold-listing medians for PSA-graded copies (via the PokemonPriceTracker API), fetched OFFLINE for a hand-picked demo subset and pushed into the same catalog documents every other field lives in — a Stream API partial update, served through the same commerce response. The honesty rules are the feature: only cards with actually-measured sales carry the fields (no multipliers, no estimates — the mockup's `marketPrice × 2.5` pattern is exactly what this replaces), the sold-listing count rides along so a median off one sale can say so, and the measured-on date is part of the datum because graded markets move.",
    api: 'Push API stream/update (partial) → POST /commerce/v2/search (additionalFields)',
    config: 'Five cardpsa* fields + the commerce additionalFields configs; enrichment in catalog-scraper/src/psa-enrich.cjs (subset: data/psa-subset.json)',
    where: 'Admin → Content → Fields · catalog-scraper (offline, credit-budgeted)',
  },
  'printing-pricing': {
    label: 'Index enrichment — real printing prices',
    brief: "Real per-printing prices pushed onto the same commerce document.",
    detail:
      "Not fetched from a third party like the Graded Market panel — this is TCGdex data the catalog scrape already had, previously collapsed to one printing bucket before ec_price was ever set. A vintage WOTC-era card is often priced separately as 1st Edition vs Unlimited (sometimes 2-3x apart); this surfaces those real, differently-priced printings as a second indexed field on the SAME commerce document, pushed via the identical Stream API partial-update mechanism as the graded panel. Display-only, deliberately: the catalog sells one SKU per physical card, so a printing pick shows its real price for context without changing what Add to Cart charges — the same 'we sell the raw card' line the graded panel draws, just for a different reason (there's genuinely one thing being sold, not a fabricated grade tier).",
    api: 'Push API stream/update (partial) → POST /commerce/v2/search (additionalFields)',
    config: 'One multi-value cardprintingoptions field + the commerce additionalFields configs; enrichment in catalog-scraper/src/printing-enrich.cjs (full catalog, no credit budget — TCGdex is unmetered)',
    where: 'Admin → Content → Fields · catalog-scraper (offline)',
  },
  'recently-viewed': {
    label: 'Recently viewed (local trail)',
    brief: "A local trail, shown only until the real personalization slot is confident.",
    detail:
      "A temporary stand-in, shown only until the real slot has enough of this visitor's own view history to answer confidently. The real **Recently Viewed** strategy is live and genuinely personalizing (verified 2026-08-17 — see this rail's `ml-recommendations` chip once it takes over): it reads the exact `ec.productView` events this app already emits on every card page, server-side, no login, keyed on clientId. Below the strategy's own confidence threshold — a brand-new visitor, or too few matching views yet — it correctly returns nothing rather than guessing, so this local trail fills that gap honestly instead of showing an empty rail. The cards themselves are not local either way — they're fetched live from the Commerce Search API by id, at live prices.",
    api: 'Trail in localStorage; products via POST /commerce/v2/search (capture: false, so it never pollutes the training signal)',
    config: 'None — app code (search-app/src/lib/recentlyViewedStorage.ts). The live version is a Hub slot on the Recently Viewed strategy, condition-scoped per item 1b',
    where: 'search-app source; the live one is Merchandising Hub → Recommendations',
  },
  'deck-check': {
    label: 'Cart → Pokédex read',
    brief: "App-side aggregation over one Pokédex index read per species in your cart.",
    detail:
      "Not a Coveo capability — the aggregation itself is app code, but everything it reasons over is a Coveo read. Each cart line's card name is stripped back to the species it depicts, and that species' record is fetched from the Pokédex index (one cached, queued Search API call per distinct species, so a cart of twelve Charizard prints costs one request). Its own weaknesses and its own evolution chain then answer two questions the cart couldn't: what this deck is exposed to, and which earlier stages it can't legally play without. Deliberately NOT derived from the cards' `cardtypes` field — the TCG collapses 18 game types into 11 energy types, so going backwards from an energy type to what beats it is a guess this panel couldn't justify.",
    api: 'POST /rest/search/v2, one exact-name lookup per distinct species (cached + serialized)',
    config: 'None — app code (search-app/src/lib/deckCoverage.ts). The fields it reads (pokemonweaknesses, pokemonevolution) are mapped on the pokedex-push source',
    where: 'search-app source; the fields it reads are Admin → Content → Fields',
  },
  'index-matchup': {
    label: 'Index aggregation',
    brief: "Type matchups answered by a groupBy over the index, not a hardcoded chart.",
    detail:
      'Type matchups resolved out of the index instead of a hardcoded chart: restrict to one @pokemontype, group by the multi-value @pokemonweaknesses field, and keep the values shared by most of that type\'s species. "What counters Flying?" is answered by a Coveo groupBy over 109 species, not by a constant in the source.',
    api: 'POST /rest/search/v2 with groupBy on @pokemonweaknesses',
    config: 'Multi-value pokemonweaknesses field on the pokedex-push source, populated from PokéAPI matchup data',
    where: 'Admin → Content → Fields · content-scraper enrichment',
  },
  'local-typeahead': {
    label: 'Local suggestions',
    brief: "Client-side matching over index vocabularies. Not Coveo’s own suggestions.",
    detail:
      "Not a Coveo capability — client-side prefix/fuzzy matching over the Pokédex species names, card set names and card attributes (vocabularies fetched via the Search API). Fills the dropdown while the org's Predictive Query Suggestions model has no output, and tops up the list alongside it once trained. Mirrors the pipeline's thesaurus aliases so typing \"electric\" surfaces \"Lightning\" — the term the server will expand to anyway.",
    api: 'Client-side match; vocabularies fetched via POST /rest/search/v2',
    config: 'Alias table mirrors the pipeline thesaurus by hand (search-app/src/lib/localSuggestions.ts) — the rest is app code, not Admin-configurable',
    where: 'search-app source, not Coveo Admin',
  },
  'thesaurus': {
    label: 'Thesaurus (synonyms)',
    brief: "Pipeline synonym rules expand a query before it hits the index.",
    detail:
      'Query Pipeline thesaurus rules — e.g. "lightning" ⇄ "electric" ⇄ (TCG card-type vocabulary aliased to Pokedex type vocabulary, and vice versa) — expand a query to its synonyms before it hits the index.',
    api: 'Query Pipeline statement, feature "thesaurus" (QPL: alias "a", "b")',
    config: '6 type-vocabulary aliases (Lightning/Electric, Darkness/Dark, Metal/Steel) on both the Pokedex and commerce-search pipelines, plus 2 commerce-only collector-term aliases (holo/holofoil/holographic, 1st edition/first edition/1st ed)',
    where: 'Admin → Search → Query Pipelines → (pipeline) → Search terms → Synonyms',
  },
  'stop-words': {
    label: 'Stop words',
    brief: "Pipeline rules drop filler words that would otherwise empty a query.",
    detail:
      'Query Pipeline stop-word rules drop terms that carry no discriminating signal, so they stop emptying queries. Two groups: structural filler (every document here is a "Pokemon" "card") and conversational filler ("show me…", "i need…"). The second group matters more than it sounds — commerce free-text ANDs its terms, so before this, "show me rare fire cards" returned ZERO products while "rare fire cards" returned 193.',
    api: 'Query Pipeline statement, feature "stop" (QPL: stop "word")',
    config:
      'Structural: pokemon/pokémon/type on both pipelines, plus card/trading/series on commerce. Conversational: show, me, need, want, looking, give, please, my, recommend, suggest, buy, shop on both — plus what/which/how/find on commerce only, since RGA needs question words on the Pokédex side. Chosen from a term-frequency pass over the catalog: every one appears in <0.5% of documents, and rare/fire/air/counter were deliberately NOT stopped because they are real facet values or intent signals.',
    where: 'Admin → Search → Query Pipelines → (pipeline) → Search terms → Stop words',
  },
  'ml-ranking': {
    label: 'ML ranking (ART + L2R)',
    brief: "ART + Learning to Rank reorder results from this org’s behavioral data.",
    detail:
      'Automatic Relevance Tuning and Learning to Rank reorder card results from this org’s own behavioral data — 12,530 commerce events including 7,954 add-to-carts and 4,576 purchases. Both models existed and were trained, but were associated to the Pokédex content pipeline instead of the commerce ones, so the entire card catalog was ranking on lexical relevance alone until they were re-pointed.',
    ai: true,
    api: 'Applied server-side to POST /commerce/v2/search and /listing',
    config:
      'pokedex-automatic-relevance (topclicks, commerceSupport enabled) + pokedex-listing-page (learningtoretrieve, trackingId pokemon-catalog) associated to the cmh-search and cmh-listing pipelines',
    where: 'Admin → Search → Query Pipelines → (pipeline) → Machine Learning',
  },
  'semantic-encoder': {
    label: 'Semantic encoder',
    brief: "Embeddings rerank keyword matches by meaning.",
    detail:
      'Coveo’s embeddings model, which vectorizes indexed content so documents can be scored by meaning, not just shared keywords. On this org’s content pipeline it was verified live (2026-08-17, debug ranking info) to act as a reranker among documents that already match by keyword — a query ranking expression scores cosine similarity against the query’s own embedding and breaks ties by meaning — rather than as a recall mechanism; a query sharing zero words with a document still matches nothing here. (Meaning-only recall — zero keyword overlap still finding the right result — is Passage Retrieval’s job, a separate capability; see the Pokédex Vault’s “Describe it” finder.) It was originally scoped to the two Pokédex sources only — the card catalog had no embeddings at all — so semantic reranking worked on the knowledge half of this app and not the shop half. Re-scoped to include the catalog; the model rebuilds on the platform’s own cadence, not on demand.',
    ai: true,
    api: 'Applied server-side during ranking',
    config: 'pokedek-semantic-encoder (embeddings), indexExport sources: Pokedex, pokedex-push, Pokemon-Catalog',
    where: 'Admin → Machine Learning → Models',
  },
  'featured-result': {
    label: 'Featured result',
    brief: "A pipeline rule pins a merchandiser-chosen card to the top.",
    detail:
      'A query-pipeline result ranking rule pins a merchandiser-chosen hero card to the top of matching queries — business intent expressed as config, ahead of (and visible to) the ML ranking.',
    api: 'Result ranking rule on the commerce search pipeline (/rest/search/v2/admin/pipelines/{id}/resultRankings)',
    config:
      'Rule "Featured: Onix GX Hidden Fates": queries containing "onix" pin the Hidden Fates Onix GX. The pin itself is server-side; the badge is a client-side mirror of the rule table (featuredRules.ts) since the commerce response carries no featured flag.',
    where: 'Admin → Search → Query Pipelines → (commerce search pipeline) → Result ranking',
  },
  'dynamic-facets': {
    label: 'Dynamic facets',
    brief: "Facets and counts come from the response, not from this UI.",
    detail:
      'Facets and counts generated per-response by the Commerce facetGenerator (Set/Rarity/Type/Price) and Headless facet controllers (Type/Generation) — configured in the Merchandising Hub, not hardcoded.',
    api: 'facets[] on each Search/Listing response',
    config: 'Facet set and display order — this UI renders whatever the response declares',
    where: 'Merchandising Hub → Facets',
  },
  'url-manager': {
    label: 'URL manager',
    brief: "Search state is serialized into the query string and restored from it.",
    // Deliberately describes the mechanism rather than promising "copy the link and it restores":
    // the content engine's facets round-trip today, the commerce engine's do not (its selections
    // never reach the query string), so the stronger claim would be false in front of an audience.
    detail: 'Search state is serialized into the query string by each engine’s Headless urlManager, and restored from it on load.',
    api: 'Client-side — no request of its own',
    config:
      'Serializes q, f-*, nf-*/mnf-*, sortCriteria and page for both engines into one query string. `mnf-` (manual numeric facet) is what carries a derived budget: unlike `nf-`, it accepts arbitrary bounds instead of only ranges the response is already offering as buckets.',
    where: 'Headless urlManager controllers',
  },
  'cart-analytics': {
    label: 'Cart + analytics',
    brief: "Cart and purchase events feed Usage Analytics, which trains the ML models.",
    detail:
      'Coveo Cart controller with cart/purchase events feeding Usage Analytics — the signal that trains recommendations and query suggestions.',
    api: 'ec.cartAction / ec.purchase → Usage Analytics',
    config: 'Cart controller state, persisted to localStorage so it survives a refresh',
    where: 'Client-side events → Usage Analytics → ML training',
  },
  'notify-trigger': {
    label: 'Notify trigger',
    brief: "A pipeline trigger the Admin Console owns — no deploy to change it.",
    detail: 'Banner driven by a query-pipeline trigger configured in the Coveo Admin Console — no code deploy to change it.',
    api: 'triggers[] on the commerce response',
    config: 'A notify trigger rule in the query pipeline; this UI just renders whatever it returns',
    where: 'Admin → Query pipelines → Triggers',
  },
  'ai-consultant': {
    label: 'AI Card Consultant',
    brief: "Gemini narrates; every fact comes from a live Coveo tool call. Not Coveo’s LLM.",
    detail:
      "Not a Coveo capability — Gemini (Google's LLM) synthesizes this answer, but it never retrieves anything on its own: every fact traces to a live Coveo tool call (search, fetch, or Passage Retrieval) it chose to make against Coveo's Hosted MCP Server, and the product/species tiles are real ids pulled straight from those tool results, never invented or parsed out of the model's own prose.",
    ai: true,
    api: 'Vercel serverless function → @google/genai + Coveo Hosted MCP Server (mcp.cloud.coveo.com/mcp)',
    config: 'None — app code (search-app/api/consultant.ts). Which Coveo tools it can reach is Admin config (below)',
    where: 'search-app source; the reachable tools are Admin → AI and ML → MCP Server → pokedex-mcp',
  },
};

/** One capability shown inside the marker's tooltip; the plain-string form is sugar for the
 *  common single-capability case. */
type ChipItem = CoveoCapability | { capability: CoveoCapability; detailSuffix?: string };

interface Props {
  /** A single capability, or every capability this section is served by -- the marker is always
   *  one mark, however many entries it lists. */
  capability: ChipItem | ChipItem[];
  /** Extra line in the tooltip, e.g. a rec rail naming its own slot. Only applies when `capability`
   *  is a single plain string -- for a multi-capability marker, attach suffixes per entry instead. */
  detailSuffix?: string;
  className?: string;
}

function normalize(capability: ChipItem | ChipItem[], topLevelSuffix?: string): { capability: CoveoCapability; detailSuffix?: string }[] {
  const list = Array.isArray(capability) ? capability : [capability];
  return list.map((entry) =>
    typeof entry === 'string' ? { capability: entry, detailSuffix: list.length === 1 ? topLevelSuffix : undefined } : entry
  );
}

export function CoveoChip({ capability, detailSuffix, className }: Props) {
  const items = normalize(capability, detailSuffix);
  // A caller building its array from several conditions (see SearchBox, SearchResultsPage) can
  // legitimately end up with none of them true right now -- no mark to show rather than an empty one.
  if (items.length === 0) return null;
  const label =
    items.length === 1 ? `Coveo · ${CAPABILITIES[items[0].capability].label}` : `Coveo · ${items.length} capabilities behind this section`;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={(e) => {
              // Markers sit inside clickable cards in a few places -- don't trigger the card's own nav.
              e.preventDefault();
              e.stopPropagation();
            }}
            className={cn(
              'pressable',
              'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-coveo/25 bg-coveo/10 transition-colors hover:border-coveo/60 hover:bg-coveo/20',
              className
            )}
          >
            <img src="/favicon_www_coveo_com_32x32.png" alt="" className="h-3 w-3" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="end"
            sideOffset={6}
            collisionPadding={8}
            // max-h/overflow, not a cap on how many capabilities a section may name: a surface
            // served by six is a fact about the surface, and truncating the list to fit would be
            // the marker lying about its own section. The tooltip scrolls instead.
            className="z-50 max-h-[min(70vh,32rem)] w-72 overflow-y-auto rounded-lg border border-coveo/25 bg-card p-3.5 text-left shadow-float"
          >
            <p className="eyebrow text-coveo">{items.length === 1 ? 'Coveo' : `Coveo · ${items.length} capabilities`}</p>
            {/* A single capability can afford its full explanation (`detail`). Several stacked
                cannot -- measured: 5 capabilities' worth of `detail` overflows a 900px-tall screen
                -- but the earlier fix for that, printing bare capability NAMES, went too far the
                other way: a merged marker is exactly where a reader has the least context, and
                "Sort + pagination / ML ranking (ART + L2R)" with no sentence attached tells them
                nothing. Each entry now carries its own one-line `brief`, so a consolidated marker
                is a real explanation of the whole section rather than an index of one. */}
            {items.length === 1 ? (
              <div className="mt-1.5">
                <p className="text-xs leading-relaxed text-muted-foreground">{CAPABILITIES[items[0].capability].detail}</p>
                {items[0].detailSuffix && (
                  <p className="mt-1 text-xs italic leading-relaxed text-muted-foreground">{items[0].detailSuffix}</p>
                )}
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {items.map(({ capability: cap, detailSuffix: suffix }) => (
                  <li key={cap}>
                    <p className="text-xs font-semibold text-foreground">{CAPABILITIES[cap].label}</p>
                    <p className="text-2xs leading-relaxed text-muted-foreground">{CAPABILITIES[cap].brief}</p>
                    {suffix && <p className="text-2xs italic leading-relaxed text-muted-foreground">{suffix}</p>}
                  </li>
                ))}
              </ul>
            )}
            <Tooltip.Arrow className="fill-card" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
