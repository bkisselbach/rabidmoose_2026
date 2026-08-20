# RabidMoose — a Coveo FDE Proof of Concept

**The frame: I am the Coveo FDE assigned to the RabidMoose evaluation.** RabidMoose (a fictional client,
sized from real collectibles marketplaces) is a national collectibles marketplace + grading/authentication
service whose #1 category is Pokémon cards. They have two systems that don't talk to each other: a
transactional marketplace (listings, live market pricing) and a collector knowledge base — two search
experiences, two tools, and their shoppers, collectors, and support agents bounce between them.

This app is the proof-of-concept built for that evaluation: **RabidMoose's future storefront on Coveo** — one
search box over both content types, commerce + knowledge federated, AI answers grounded in their own content,
and merchandising controlled by their team in the Merchandising Hub instead of by engineering tickets.

The FDE-craft detail: no waiting on a signed data-sharing agreement — the PoC runs on public stand-in data
*shaped exactly like RabidMoose's*: the [TCGdex API](https://tcgdex.dev/) for the priced card catalog (real
TCGplayer/Cardmarket market pricing) and [pokemondb.net](https://pokemondb.net/) for the collector knowledge
content. Prove the architecture on the data's shape; swap in the client's feeds when legal clears.

Built for the Coveo Forward Deployed Engineer technical challenge — full task description in
[`/docs`](docs/), panel materials in [`/presentation`](presentation/).

## Architecture

```
TCGdex API      --scrape-->  /catalog-scraper  --Stream API-->  Coveo Commerce Catalog source  --\
pokemondb.net   --scrape-->  /content-scraper  --Push API-->    Coveo Push content source        --}-- /search-app
pokemon.com     --scrape-->  /news-scraper     --Push API-->    Coveo Push content source        --/   (React + Headless Search + Headless Commerce)
```

- **`/catalog-scraper`** — pulls card + real pricing data (TCGplayer low/mid/high/market, Cardmarket avg) from the
  free [TCGdex API](https://tcgdex.dev/) for the four classic Gen 1 Base-era sets (Base Set, Jungle, Fossil, Team
  Rocket) plus 2-3 sets per subsequent generation's main TCGdex series (Neo, EX, Diamond & Pearl, Black & White,
  XY, Sun & Moon, Sword & Shield, Scarlet & Violet — 28 sets total, 3,754 cards live in the index), maps them to Coveo's standard commerce
  (`ec_*`) fields plus a handful of custom card fields (`cardtype`, `cardrarity`, `cardtypes`, `cardsetname`,
  `cardhp`, `cardnumber`), and pushes them via the Coveo Push API's Stream API (open → upload → close) into a
  Catalog source. `ec_brand`/`ec_category` are the real TCGdex series name per set (Base, Neo, EX, ...), not one
  constant, so series/set is a real filterable fact. Bounded on purpose — the full TCGdex history is 218 sets /
  ~23,700 cards, most of which are promos/reprints/digital-only that don't add to the marketplace story.
- **`/content-scraper`** — scrapes Pokémon character content (species, stats, abilities, height, weight,
  description) for the full National Dex — all 9 generations, ~1,025 Pokémon — from
  [pokemondb.net](https://pokemondb.net/)'s National Dex listing, and pushes it via the Coveo Push API into a
  separate content source (`pokedex-push`), independent of the commerce catalog. Each document's *body* is a
  sectioned Pokédex article (`src/article.ts`) synthesized from that scrape **plus [PokéAPI](https://pokeapi.co)
  enrichment** (`src/pokeapi.ts`: evolution methods like stones/friendship/time-of-day, type-matchup
  multipliers, per-game wild encounter locations, ability effect text, training/breeding data, per-game
  Pokédex entries) — the body is what RGA grounds generated answers on and what Passage Retrieval quotes, so
  the enrichment is what makes "how do I evolve Eevee into Espeon" / "where can I find Eevee" answerable.
  Preview an article without pushing: `npx tsx src/index.ts --single --slug=eevee --dry` (call tsx directly —
  PowerShell npm can swallow `--`-forwarded flags). Enrichment failures degrade that document to the old thin
  body rather than aborting a run. Not every Pokémon has a matching
  card in the (bounded) catalog above — that's intentional and mirrors real e-commerce inventory: the search box
  still surfaces the Pokédex fact even when nothing's currently for sale.
- **`/news-scraper`** — pushes a 15-article RabidMoose newsroom corpus into its own Push source
  (`pokemon-news-push`), the third source in the same federated index. Headlines/dates/categories/deks are real
  records sourced from pokemon.com/us/news; article body prose was written for this PoC (disclosed on the page).
  Powers `/pokemon-news` — its own engine, searchHub, facets/sort/pager/did-you-mean, and article pages whose
  body renders via Coveo Quickview — with cross-links into commerce and the Pokédex.
- **`/search-app`** — Vite + React + shadcn/ui. Federates Headless engines against one search box: a Headless
  Search engine (`buildSearchEngine`) scoped to the `pokedex-push` content source for character results, a
  second Search engine scoped to `pokemon-news-push` for the newsroom, a dedicated `vaultEngine` for the
  standalone `/pokedex` species-search page, and a Headless Commerce engine (`@coveo/headless/commerce`,
  `buildSearch`/`buildProductListing`, `FacetGenerator`, `Sort`, `Pagination`, `Cart`) against the Commerce
  Catalog for card products. Also wires up RGA (`AskPokedex.tsx` against the Pokédex source — Commerce Headless
  has no built-in RGA controller, so the commerce side isn't a second RGA surface, see Status below), Passage
  Retrieval, Did You Mean, live query suggestions, and a persisted (`localStorage`-backed) cart.
- **`/presentation`** — the panel deck (`rabidmoose-fde-readout.pptx`), the Coveo capability inventory, and
  supporting screenshots/GIFs.

This repo ships `/search-app` — the storefront that reads from the Coveo org described above. The three
scraper pipelines (`catalog-scraper`, `content-scraper`, `news-scraper`) that populated the Commerce Catalog
and Push sources aren't included here; the sections below describe what they did and how the org is
configured to receive their data.

## Setup

### 1. Coveo org — Commerce Catalog

Unlike a plain Push source, Commerce requires three linked pieces of Admin configuration:

1. **Catalog source**: Content → Sources → Add source → **Catalog**. Create an API key at the same time (push/edit
   scope).
2. **Property**: Admin → Analytics/Usage → Properties → Add property. Tracking ID: `pokemon-catalog`.
3. **Catalog entity**: Merchandising Hub or `/admin/#/<org>/commerce/catalogs/` → Add catalog → Products only →
   primary source = the Catalog source above → objecttype value `Product`, product ID metadata `ec_product_id` →
   confirm standard field mappings (`ec_name`, `ec_price`, `ec_promo_price`, `ec_description`, `ec_images`,
   `ec_thumbnails`, `ec_brand`, `ec_category`, `ec_in_stock`).
4. **Storefront association**: Commerce → Storefront associations → tracking ID `pokemon-catalog`, locale en/US/USD,
   catalog = the entity above.
5. **Custom fields**: Content → Fields, create `cardtype`, `cardrarity` (facet), `cardtypes` (multi-value, facet),
   `cardsetname` (facet), `cardhp`, `cardnumber`.
6. **Facets**: Merchandising Hub → Search manager → Facets for search → Create facet collection → add
   `cardsetname`, `cardrarity`, `cardtypes`. (This is a separate step from the Content → Fields facet checkbox —
   CMH won't offer a field as a facet option until it's added here.)
7. **Additional fields (raw field values on products)**: not exposed in the CMH UI at time of writing — set via the
   Commerce Configurations API instead, once per global Search config and once per global Listing config:

   ```
   PUT /rest/organizations/<ORG_ID>/commerce/v2/configurations/search/global?trackingId=pokemon-catalog
   PUT /rest/organizations/<ORG_ID>/commerce/v2/configurations/listings/global?trackingId=pokemon-catalog
   ```

   Both bodies need `queryConfiguration.additionalFields: ["cardrarity", "cardtypes", "cardsetname", "cardhp"]`
   (the listing config also mirrors it at the top level as `additionalFields`). Without this, `additionalFields`
   on every product response is empty — only the separate facet aggregation works — so the type-color accent,
   rarity line, and set-name eyebrow are blank on every product card.

### 2. Coveo org — Pokédex content source

A plain Push source named/tagged so `search-app`'s hardcoded `@source=="pokedex-push"` tab expression matches it:

1. **Push source**: Content → Sources → Add source → **Push**. Create an API key (push/edit scope).
2. **Custom fields**: Content → Fields, create `pokemonname`, `pokemonnumber`, `pokemontype` (multi-value, facet),
   `pokemongeneration` (facet), `pokemonimage`, `pokemonspecies`, `pokemonheight`, `pokemonweight`,
   `pokemonabilities`, `pokemonstats`, `pokemonweaknesses` (multi-value), `pokemonevolution`, `pokemonflavortext`.

### 3. Data pipeline notes

The catalog and content pipelines that fed the sources above aren't part of this repo. The findings below are
kept because they're the more interesting story than the fetch-and-push mechanics: how the index ended up
relevant, not just populated.

**Relevancy enrichment**: commerce free-text search only matches the searchable commerce
fields (`ec_name`, `ec_description`, ...) — the custom card fields power facets but not keyword matching, so
real shopper queries like "fire type", "rare holo charizard" or "electric mouse" returned zero results.
`enrich-push` re-pushes the cached catalog (`output/products.json`, no re-scrape) with a factual spec sentence
appended to each description — rarity (holo-class rarities labeled "holo"), TCG type, HP, set/series — plus a
Pokédex join fetched live from the `pokedex-push` source: the official species nickname and *game* typing
("Pikachu is the Mouse Pokémon, an Electric-type Pokémon" — the TCG says "Lightning", shoppers say "electric").
`npm run relevancy` before/after: 11 pass / 4 fail → 13 pass / 2 fail. As of 2026-08-13 the scorecard is
**20 pass / 1 fail** over a wider case set (see "Conversational queries" below): `strongest psychic pokemon`
now passes (Mewtwo #1) after the ML models were rebuilt against the enriched articles, and the only remaining
fail is the by-design `pikachoo` case (edit distance 2 — the app covers it client-side, this raw-API case
does not). The scorecard now also covers conversational phrasing and the type-matchup aggregation that backs
advisory queries.

### Conversational queries and the ML re-plumb (2026-08-13)

A search for `onix` always worked. `show me rare fire cards` returned **zero products** — commerce free-text
ANDs its terms, so two filler words emptied a query that otherwise matched 193 cards. Root-causing that
surfaced a bigger finding: **all three commerce query pipelines had zero ML models associated**, while the
Pokédex content pipeline had seven — including two models that had been *built for commerce* and attached to
the wrong pipeline:

| Model | Engine | Was | Now |
|---|---|---|---|
| `pokedex-automatic-relevance` | `topclicks` (ART), `commerceSupport: true`, trained on 12,530 commerce events (7,954 add-to-cart, 4,576 purchase) | content pipeline only | **+ both commerce pipelines** |
| `pokedex-listing-page` | `learningtoretrieve` (L2R), scoped to `trackingId: pokemon-catalog` | content pipeline only, where its tracking-ID condition could never match | **moved to both commerce pipelines** |
| `pokedek-semantic-encoder` | `embeddings` | sources: `Pokedex`, `pokedex-push` — the ~1,500 cards had **no vector embeddings at all** | **+ `Pokemon-Catalog`**, associated to both commerce pipelines |

Fixed via `/rest/search/v2/admin/pipelines/{id}/ml/model/associations` (the `COVEO_QUERY_PIPELINE_API_KEY`
key). Effect is visible without any app change: `rare fire cards` used to rank common Fire Energy cards
first, and now returns Blaziken / Magmar ex / Arcanine ex.

Also added: **conversational stop words** on both pipelines (`show`, `me`, `need`, `want`, `looking`, …, plus
`what`/`which`/`how`/`find` on commerce only — RGA needs question words on the Pokédex side). Every word was
picked from a term-frequency pass over the catalog, all appearing in <0.5% of documents; `rare`, `fire`,
`air` and `counter` were deliberately **not** stopped, being real facet values or intent signals.
Result: `show me rare fire cards` 0 → 193, `show me fire` 0 → 406, and `what characters will be onix` went
from 20 loosely-related species to exactly Onix + Steelix.

**Intelligent Term Detection was tried and reverted.** Enabling it on the ART association silently disabled
commerce query correction entirely — `charzard`, `pikachuu`, `picachu` and `blastoize` all stopped correcting
— while not delivering the hoped-for benefit (it still ANDs: `Fighting Water Lightning` returned 13 results,
not the union). Caught by the relevancy scorecard as a regression, and turned back off.

**Triggering an ML model rebuild.** The RGA and Passage Retrieval models were still grounded on
pre-enrichment document bodies (RGA answered "onix" with only type/height/weight and declined every evolution
question), with the next scheduled rebuild a week out. There is no rebuild endpoint — every `.../rebuild`,
`/build`, `/refresh` URL 404s. But a model whose **config changes** is queued for rebuild immediately, and the
source list is a set, so `PUT`ting it in a different order is a semantically-identical edit that triggers one:
`["pokedex-push","Pokedex"]` → `["Pokedex","pokedex-push"]` flipped the model to `IN_QUEUE_UPDATING`. After
the rebuild, RGA answers *"Onix evolves into Steelix when traded while holding a Metal Coat."*

Note: the documented Stream API flow (open stream → upload to S3 → close) returned success codes but the first
full push silently processed 0 documents — it just needed several minutes to finish (poll the source's
`numberOfDocuments` via the Platform API rather than assuming failure from an immediate check).

### 4. Search app

```
cd search-app
npm install
cp .env.example .env.local   # fill in VITE_COVEO_ORG_ID / VITE_COVEO_SEARCH_TOKEN / VITE_COVEO_TRACKING_ID
npm run dev
```

Optional env vars (see `.env.example`): `VITE_COVEO_ANSWER_CONFIG_ID` enables RGA once a generative answering
config exists in the org; six `VITE_COVEO_*_SLOT_ID` vars back the recommendation rails (Home Trending, Recently
Viewed, PLP empty-state, Cart, PDP More-From-Set, PDP Bought-Together) and `VITE_COVEO_ENRICHMENT_PLACEMENT_IDS`
backs the product badges; each falls back gracefully (ad-hoc queries, or no badge) when unset.

The home page (`/`) hero is the **Card Consultant** (`src/components/home/ConsultantHero.tsx`): an index-fed
sentence composer (mode · types · budget · rarity) with a live "we read that as" strip that runs the real query
parser before submit, so the panel and the results page always agree on what a sentence means. Normal keyword
search lives in the header instead (`SearchBox.tsx`, visible on every route), not in the hero — the two are
deliberately different surfaces for different jobs: the header is instant per-keystroke lookup, the hero is a
built sentence for advisory/budget/type questions. Typeahead is server-suggested (`pokedex-pqs` bound to the
commerce pipeline); `SearchBox.tsx` falls back to a local vocabulary (names/sets/rarities/types) only if
the server ever returns zero rows.

## Deployment

**Vercel**: **https://www.rabidmoose.com** (custom domain). Public, no auth gate.

## Status

Everything below is built and verified live.

- **Data pipelines**: 3,754 real cards / 28 sets with live TCGdex market pricing (`catalog-scraper`); full
  National Dex, 1,025 species across all 9 generations, PokéAPI-enriched for RGA/Passage Retrieval grounding
  (`content-scraper`); a 15-article newsroom corpus with Quickview bodies (`news-scraper`) — three independent
  Coveo sources federated into one search experience.
- **Federated search**: one search box drives a Headless Commerce engine (cards) and a Headless Search engine
  (Pokédex content), plus dedicated engines for the newsroom (`/pokemon-news`) and the standalone species-search
  page (`/pokedex`, the "Pokédex Vault") — facets, sort, pagination, cart, all verified against live APIs.
- **Personalization**: genuinely live across all 7 recommendation slots (Trending, Recently Viewed, Recently
  Purchased, PLP empty state, Cart, PDP More-From-Set, PDP Bought Together) — each slot returns real,
  visitor-differentiated results via a per-slot model-association `condition`, switchable in the header via
  `ProfileSwitcher.tsx` (Dana / Marcus / Guest personas).
- **RGA + Passage Retrieval**: live on the Pokédex side (`AskPokedex.tsx`, streamed answers with citations,
  on a scoped engine so questions don't leak into `/search` state) — deliberately no commerce-side RGA
  counterpart, since Commerce Headless has no built-in RGA controller. Query-suggest typeahead is
  server-suggested (`pokedex-pqs` bound to the commerce pipeline) with a local-vocabulary fallback.
- **Conversational query understanding**: one search box handles a name (`onix`), a question (`what characters
  will be onix` → RGA answers), a goal (`i need to counter air pokemon`), and stated constraints (`show me rare
  fire cards`) — server-side Coveo config (stop words, ML model routing) plus app-side intent parsing
  (`queryIntent.ts`, `typeMatchups.ts`, `useQueryUnderstanding.ts`) that turns intent into real facet selections.
- **Card Consultant**: a Gemini + Coveo MCP-narrated advisory box present everywhere (home hero, header pill,
  PDP fit strip, cart deck review, Vault suggestions) via a shared session "brief."
- **Advisor** (`/advisor`), **Rip Pack**, **3D Holo Studio**, merch storefront, and a PDP
  printing/finish selector with real PSA-graded pricing round out the feature set.
- **Product enrichment badges**: five rules (Rare Find, Vintage, New Arrival, High Value, Budget Pick) stack
  correctly against live pricing/rarity/set data.
- **Presentation materials**: technical deep dive covers the marketplace/federated-search build (architecture,
  data model, feature walkthrough, inclusion/exclusion notes); Section 6 uses a deliberately composite customer
  example (RabidMoose Group) and closes with a "beyond this build" roadmap of Coveo capabilities not implemented
  here (Coveo for Service/Insight Panel, entitlements).
