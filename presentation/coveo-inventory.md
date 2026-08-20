# Coveo Inventory — what's implemented, where it lives, and how to talk about it

**Compiled 2026-08-19; updated the same day** after the `/advisor` reframe (item 37) and items 33/34/35. From `presentation-outline.md` §1/§3/§8, verified live against the org
2026-08-18 and against production 2026-08-19. This is the **reference sheet** — one row per Coveo
capability, what's actually implemented, where it shows up in the app, and the sentence to say
about it. It is not the deck (`deck-outline.md`) and not the talk track (`panel-script.md`); it's
what you read the night before so you can answer anything off-script.

**How to use it:** read §1 for the answer to "did you do the assignment." Read §2 when you need to
name a capability precisely. Read §3 if the panel asks anything about ML. **§7 is the one to
actually memorize** — it's what you say when you don't have a slide.

**Every number here has a measurement date.** Index and model state drift; the date is part of the
fact, and saying the date out loud is itself an FDE credibility signal.

---

## 1. The scorecard — every requirement, one line each

| Tier | Requirement | Status | Where it lives |
|---|---|---|---|
| Essential | Accept Cloud Org invitation | ✅ org `brettktechnicalchallengexndyydor` | — |
| Essential | Atomic **or** Headless | ✅ **Headless**, 2 SDKs, 5 engines | S5 |
| Essential | Index pokemondb.net, Pokémon only | ✅ `pokedex-push`, 1,025 species | S2/S3 |
| Essential | Webcrawler **or** Push | ✅ **both** — the org holds a sitemap-crawler source *and* push sources | S3 |
| Essential | Connect local page to cloud endpoint | ✅ | S5 |
| Essential | Facet: Pokémon Type | ✅ `/search` content column + Vault | S6 |
| Essential | Facet: Pokémon Generation | ✅ same | S6 |
| Essential | Picture in each result | ✅ | S6 |
| Intermediate | Code on GitHub | ✅ repo exists — **private pending Will's confirmation** | S1 footer |
| Intermediate | Host the search app | ✅ `www.rabidmoose.com` (Vercel prod) | S1 |
| Advanced | Deploy RGA | ✅ `pokedex-rga` + its Answer Configuration | S8, S13 |
| Advanced | Preload Query Suggest | ✅ 2 PQS-family models + seeded analytics + the cold-start story | S10 |
| Advanced | Pokémon detail page | ✅ `/pokemon/:name` — plus a card PDP beyond the ask | S6/S7 |
| Advanced | Presentation, 2 topics | ✅ | — |
| Advanced | Topic 2: real enterprise customer | ✅ anonymized SE-era account | S17–S22 |
| Bonus | Passage Retrieval + a POV | ✅ Ask-the-Pokédex evidence rows + the Vault semantic finder | S13 |

**Nothing skipped.** The one honest caveat, and say it before anyone asks: **the behavioral
reranking model is mechanism-proven, not results-proven** — it's live and trained but needs real
non-synthetic traffic before any number attached to it means anything.

---

## 2. The platform, by layer

### 2.1 Sources — 4 in the org, one federated index *(live 2026-08-18)*

| Source | Type | Docs | Fed by |
|---|---|---|---|
| `Pokemon-Catalog` | CATALOG | 3,754 | `catalog-scraper` → Stream API (TCGdex, 28 sets, real TCGplayer/Cardmarket pricing) |
| `pokedex-push` | PUSH | 1,025 | `content-scraper` → Push API (pokemondb + PokéAPI enrichment) |
| `pokemon-news-push` | PUSH | **15 pushed / 18 live — unreconciled** | one-off push (real pokemon.com headlines and dates; body prose written for the PoC and disclosed in-app) |
| `Pokedex` | SITEMAP | 1,031 | **the original Webcrawler path**, kept in the org |

> **Talk-track:** the challenge says "Webcrawler *or* Push." The org contains **both**, and that's
> the receipt. The crawler was the fast first index; push is the production answer — deterministic
> scope, exact field control over pricing that page HTML can't provide, fast partial re-pushes for
> iteration. The honest answer to "crawler or push?" is *"depends on the source."*

> ⚠️ **Before this goes on a slide:** reconcile the news count, or say "fifteen pushed, eighteen
> live, and I haven't reconciled that yet." Both are fine. Being surprised by it is not.

### 2.2 Fields

- **Commerce:** standard `ec_*` + custom card fields — `cardtype`, `cardrarity`, `cardtypes`,
  `cardsetname`, `cardhp`, `cardnumber`, and the newer `cardpsa*` graded-market fields.
- **Content:** `pokemontype`, `pokemongeneration`, `pokemonweaknesses`, `pokemonabilities`, base
  stats, sprites.
- **News:** 9 mapped `news*` fields.
- **Index-time enrichment:** spec sentences + the Pokédex join took the relevancy scorecard from
  **11/15 → 20/21.** The one remaining fail (`pikachoo`) is by design and handled client-side.

> **The flagship field story — `additionalFields`.** Facet counts were perfect; every product's
> fields came back empty. HTTP 200, no error, nothing in the logs. The values stay silently empty
> until set through the **Commerce Configurations API** — it isn't in the CMH UI at all. *"The
> Commerce API will happily return you a well-formed response full of nothing."*

### 2.3 Query pipelines — 8 *(live 2026-08-18)*

| Pipeline | Routed by | Serves |
|---|---|---|
| `pokedex-querypipeline` | **default, no condition** — reached by named hubs that fall back to it | content half of `/search`, Ask panels, RGA |
| `cmh-search-pokemon-catalog-…` | `$context[commerce-api] is "Search"` + trackingId | commerce search |
| `cmh-listing-pokemon-catalog-…` | same shape, `"Listing"` | no-query browse, home rails |
| `cmh-recommendations-pokemon-catalog-…` | same shape, `"Recommendations"` | all 7 rec slots |
| `cmh-recommendations` | **NO CONDITION — orphan** | **nothing** (the war story's villain) |
| `pokedex-passages` | `$searchHub is "Pokedex Passages"` | Passage Retrieval |
| `pokedex-vault` | `$searchHub is "Pokedex Vault"` | `/pokedex` |
| `pokemon-news` | `$searchHub is "Pokemon News"` (ASCII, no accent — a live trap) | `/pokemon-news` |

**What the pipelines carry:**

- **QPL statements** — two stop-word families (structural: *pokemon/card/…*; conversational:
  *show/me/need/want*). Commerce ANDs free-text terms, so filler emptied queries:
  **`show me rare fire cards` went 0 → 193.** Plus thesaurus (Lightning⇄Electric,
  holo⇄foil⇄holographic, sir⇄special illustration rare): **`foil charizard` went 0 → 9.**
- **Statements are snapshot copies across pipelines, not links** — tuning must be applied per
  pipeline, and a script drift-checks it.
- **Featured result** — a Result Rankings rule pins Hidden Fates Onix GX on `onix`. Note the API
  finding: QPL `top`/`boost` **422s on commerce**; the JSON admin endpoint is the working path.
- **Notify trigger** — banner text as pipeline config, zero deploy.
- **A pipeline is unreachable until its condition object is attached.** Created-empty pipelines
  silently fall back to default. Learned live on `pokemon-news`.

> **Two protocols, one idea — the line worth having ready.** The **Commerce API has no `searchHub`
> parameter at all.** Surface split (search / listing / recs) is built into the protocol, and CMH
> provisions one conditioned pipeline per surface. So "should search, listing and recs have
> separate hubs?" is already answered *by the platform* on the commerce side, and by the five named
> hubs on the content side. Same discipline, two protocols.

### 2.4 Search hubs — 5 named *(renamed 2026-08-18, production-verified 2026-08-19)*

| Hub | Resolves to |
|---|---|
| `Pokedex Content` | `pokedex-querypipeline` (fallback, deliberate) |
| `Ask Pokedex` | `pokedex-querypipeline` (fallback, deliberate) |
| `Pokedex Vault` | `pokedex-vault` |
| `Pokemon News` | `pokemon-news` |
| `Pokedex Passages` | `pokedex-passages` |
| `Offline Verification` | fallback — keeps tooling out of visitor hubs |

**Two fall back on purpose. No pipeline was created just to have one.** The wire confirms it live:
`searchHub: "Pokedex Content"` → `pipeline: "pokedex-querypipeline"`.

### 2.5 Engines — 5 *(one search box)*

| Engine | SDK | Hub → pipeline | Serves |
|---|---|---|---|
| `commerceEngine` + `catalogEngine` | `@coveo/headless/commerce` (tracking ID `pokemon-catalog`) | context-routed `cmh-*` | marketplace grid, home rails, PDP, cart |
| `searchEngine` | `@coveo/headless` | `Pokedex Content` → default | Pokédex half of `/search`, the typeahead's Pokédex row, **and every custom event** |
| `vaultEngine` | `@coveo/headless` | `Pokedex Vault` → `pokedex-vault` | `/pokedex` |
| `newsEngine` | `@coveo/headless` | `Pokemon News` → `pokemon-news` | `/pokemon-news` + Quickview article reads |
| per-species `AskPokedex` (2 stages) | `@coveo/headless` | `Ask Pokedex` (RGA) + `Pokedex Passages` (PR) | isolated Q&A on species pages and the PDP |

> **Why Headless, not Atomic:** two engines running concurrently in one app shell, direct state
> control, and it mirrors the real client situation — an existing design system to integrate into.
> **Atomic is the right answer for the opposite client, and say so** — volunteering when the other
> tool wins is worth more than defending the choice.

### 2.6 APIs touched beyond the SDKs

Commerce Search / Listing / Recommendations / querySuggest · classic Search API (incl. ~12 raw
vocabulary and aggregation reads) · **groupBy** server-side aggregation (the type-matchup panel is a
groupBy over the index, **not a hardcoded chart** — good Q&A ammo) · **Quickview** (news article
bodies served from the index) · Passage Retrieval v3 · Push + Stream · ML Admin · pipeline /
statements / resultRankings admin APIs · Usage Analytics write.

---

## 3. ML — 9 models, all ONLINE *(live 2026-08-18)*

| Model | Engine type | What it does here | How to talk about it |
|---|---|---|---|
| `pokedex-rga` | genqa | grounded generative answers with citations | **"Model Active ≠ feature usable"** — RGA needs a separate **Answer Configuration** object with its own privilege. That trips people |
| `pokedex-passage-retrieval` | chunksretrieval | ranked semantic passages | the Bonus ask; evidence rows + the Vault "describe it" finder |
| `pokedek-semantic-encoder` *(typo is real, in the org)* | embeddings | **reranker among keyword matches** on this org — verified via debug ranking info | recall is Passage Retrieval's job, not the encoder's. Knowing the difference is the expert signal |
| `pokedex-query-suggestions` | querysuggest | classic typeahead | |
| `pokedex-pqs` | predictivequerysuggest | commerce-family typeahead | the cold-start diagnosis story |
| `pokedex-automatic-relevance` | topclicks (ART) | behavioral reranking off 12,530 commerce events | **mechanism, not results** — and ART rebuilds weekly |
| `pokedex-listing-page` | learningtoretrieve | listing-page LTR, tracking-ID scoped | |
| `pokedex-product-recommendation` | productrecommendations | all 7 rec slots, 19 trained swimlanes | the personalization war story |
| `facetsense` | facetsense (DNE) | facet/value ordering on the Vault | **cold — claim the mechanism, not results** |

### The four war stories *(each answers "what was your decision process?")*

**1. Wrong-pipeline plumbing.** ART, LTR and the embeddings model were originally associated to the
*content* pipeline, where their commerce conditions could never match — so the whole catalog ranked
lexically. Re-pointed via the pipeline ML-associations API. `rare fire cards` went from Fire Energy
commons to Blaziken / Magmar ex / Arcanine ex **with zero app changes.**

**2. The personalization arc — the best FDE story in the build.** The model was trained and healthy
but bound to the **orphan** `cmh-recommendations` pipeline that no request traverses, so every slot
served one static list. Methodical elimination over three sessions: reversible association tests,
seeded personas (~19k events), real-browser event replay, and `debug: true` execution reports
showing `strategy` never reached the ML call. Re-pointed to the tracking-ID pipeline — and then hit
the second layer: **the missing lever was a `condition` field on each association rule**
(`when $recommendation is "recently_viewed"`). Without one, the lowest-position rule wins
unconditionally. End state, verified live: all 7 slots differentiated, Recently Viewed genuinely
per-visitor, Trending honestly population-level, the PDP showing two *different correct* rails.

**3. Cold-start diagnosis (PQS).** Wired correctly, 200 OK, empty completions. Seeded ~19k real
events → ML Admin API showed a fixed retrain cadence with no API trigger → shipped a **local
vocabulary fallback that auto-yields** to the model (server rows rank first the day it serves).
Related: commerce spelling correction is **hard-capped at edit distance 1**, which is a real
platform limit, not a bug — hence the client-side fuzzy did-you-mean, explicitly labeled *not
Coveo* in the lens.

**4. The click loop that wasn't closed** *(found and fixed 2026-08-18)*. An audit found
`buildInteractiveResult` at **zero call sites** — three of the four engines were sending search
events with **no click events**, so ART / PQS / DNE on the content pipelines had nothing to train
on. *"The content side was permanently on lexical relevance — the exact failure mode I'd
root-caused on the commerce pipelines and never checked on the content side."* Fixed same day
(0 → 6 call sites).

### The Vault regression story *(expert-panel gold)*

Associating the semantic encoder to the Vault pipeline silently ballooned `charizard` from **5 → 441
matches** — identical ranking, corrupted honest counts. Reverted.

> **Moral:** semantic recall belongs in a *labeled* row (Passage Retrieval), never silently merged
> into keyword counts.

⚠️ **Current-state caveat.** The association dump shows the encoder **is** on `pokedex-vault` again
today, and `charizard`/`pikachu` still return 5/19 — the association is back, the regression is not.
Tell it as the discipline it demonstrates. If asked *"is it associated now?"*, the honest answer is
**"yes, and I re-measured recall to be sure it's clean."**

---

## 4. Merchandising & business-user control

- **7 recommendation slots configured** — trending, recently-viewed, recently-purchased,
  PLP-empty-state, PDP recs, PDP bought-together, cart. **6 render on a surface today.**
  > Say **"seven slots in the Hub, six on the storefront"** — never "all seven." The Recently
  > Purchased rail lost its home surface when the personalization box was stripped to the viewed
  > rail; its controller is still built and now unused.
- **Badge/enrichment rules** — Vintage, High Value, Rare Find, Budget Pick, New Arrival — via
  product enrichment placements. Merchandiser-owned, no deploy.
- **Facet collections** (Set / Rarity / Type / Price) managed in the Hub; the app renders whatever
  the response declares via `facetGenerator`.
- **Notify triggers** and **featured-result rules** — same "business intent as config" story.
- **Answer Configuration** for RGA — its own object, its own privilege.

> **The merchandising sentence:** *"Business tuning lives in configuration, not in my code. A
> merchandiser pinned that card this morning in the Hub — no deploy, no ticket, no engineer."*

---

## 5. Events & analytics — two protocols, one app

**The organizing fact:** the commerce engine runs the **Event Protocol** (`ec.productView`,
`ec.productClick`, `ec.cartAction`, `ec.purchase`); the three classic-Search engines run **legacy
Coveo UA** (`search`, `click`, `customEvent`, generated-answer feedback). Deliberately — Generated
Answer isn't fully supported under `analyticsMode: 'next'`. **EP carries no custom events; UA
does.** Everything else follows from that split.

| Area | State |
|---|---|
| **Commerce side** | Was already right. `ec.productView` once per PDP (ref-guarded across StrictMode), `ec.productClick` on every card surface, cart and purchase events wired. Signal hygiene: display reads send `capture: false` |
| **Search side** | **Phase A, shipped 2026-08-18** — 0 → 6 `buildInteractiveResult` call sites via `lib/useInteractiveResult.ts`. `VaultSpotlight`/`VaultSemanticFallback` deliberately *not* wired (no searchUid to attribute to — they're plain links) |
| **RGA feedback** | `AnswerFeedback.tsx` on both RGA surfaces — like / dislike / structured form / copy, gated on streaming finished. `likeGeneratedAnswer` seen on the wire |
| **Custom events** | `personaSwitch`, `holoStudioOpen`, `finishSelected`, `deckCheckRun`, `consultantAsk` — one `type` (`rabidmoose-interaction`) so they're one family in the event browser |
| **Hygiene** | Five named hubs; Passage Retrieval and news-article reads now carry the app's visitor id (**nested `analytics` block — a top-level `clientId` fails silently on those endpoints**) |
| **One visitor, both protocols** | **Item 30, fixed 2026-08-18.** EP used the app's `clientId`; the UA client kept its own cookie id — so Phase A's clicks were attributing to a visitor who never viewed a product. `lib/visitorId.ts` now seeds the UA client's public visitor-id slot at import time. All three ids verified in agreement |
| **The Event Tape** | `lib/eventTape.ts` + a bottom-right "Events" pill → every event this session sent, protocol-tagged, **with the model it trains.** Taps the *real* emission paths (`relay.on('*')` for EP, `analyticsClientMiddleware` per classic engine) so it structurally cannot show an event that wasn't sent |
| **Blocked, honestly** | **No recommendation impression events.** The Event Protocol defines exactly four commerce events and has no impression type, so slot CTR isn't computable. Shipping one would mean inventing an event name. **Left undone rather than faked** |

> **The best analytics sentence you have:** *"What isn't Coveo says so, and what wasn't sent isn't
> on the tape."* The missing impression event is a feature of the honesty layer, not a gap — show
> the hole rather than let them assume you covered it.

**Personas:** Dana Whitfield (vintage collector), Marcus Hale (competitive player), Guest (**the
proof-of-no-hardcoding**) — fixed clientIds with ~19k seeded events behind them.

**Measurement tooling built:** 21-query relevancy scorecard · featured-rule and pipeline-drift
tripwires · RGA answer-freshness verifier · consultant reliability panel · card-surface audit ·
a scripted Playwright analytics pass that captures every Coveo request off the network and diffs it
against what the app claims to send.

---

## 6. The AI layer — and exactly where Coveo stops

| Component | What it is |
|---|---|
| **Coveo Hosted MCP Server** (`mcp.cloud.coveo.com/mcp`, config `pokedex-mcp`) | **Three tools exposed: `search`, `fetch`, `retrieve_passages`.** The RGA Answer tool is deliberately **not listed** |
| `api/consultant.ts` (Vercel serverless) | **Agentic.** Connects an MCP SDK client over Streamable HTTP, hands the tools to Gemini via `mcpToTool()`. Gemini's *native* tool-calling decides which tool, in what order, per turn. Server-side EXECUTE_QUERY-only Coveo key |
| `api/deck-health.ts` | **Deliberately non-agentic.** Narrates already-aggregated, index-derived deck facts. No tools, nothing to retrieve |
| **Gemini** | **`gemini-3.5-flash-lite`** — **pinned 2026-08-19** off the `gemini-flash-lite-latest` floating alias (Google can move an alias with no notice). **Gemini Developer API** (`@google/genai`) — **not Vertex.** Get both right if asked |

**Three things to be precise about:**

1. **It is genuinely agentic.** There is no hand-written "if intent X, call tool Y" loop anywhere in
   the codebase. *"I don't route it. I couldn't route it if I wanted to without taking the tools
   away."*
2. **The federation proof is one call.** A verified probe on `charizard` returned **16 catalog hits,
   3 Pokédex entries and 1 news article from a single `search` tool call.** The agent isn't choosing
   between a commerce tool and a news tool — it's one federated index, queried once, and **Coveo
   does the blending.**
3. **The Answer tool's absence is a config-layer safety property, not client-side filtering.** The
   `pokedex-mcp` config never lists it, so there's nothing for `mcpToTool()` to expose. *"Prompts
   are suggestions; configs aren't."*

**The honest finding:** Gemini's tool-calling is **non-deterministic** — the same question sometimes
skips the catalog search entirely. Verified that when it does, extraction and rendering both
correctly produce **nothing** rather than fabricate a tile. *"The honesty contract holds even when
the agent's own behavior varies run to run. If you're putting agents in front of customers, that's
the property you actually have to test for."*

**Grounding discipline:** every product and species tile comes from real MCP tool-call results in
`automaticFunctionCallingHistory` — **real ids, by construction, never parsed out of the model's
prose.**

### 🔴 Live status as of 2026-08-19

Both `/api/consultant` and `/api/deck-health` return **HTTP 502** — Gemini's **daily** free-tier cap
(500 requests) is exhausted, not the per-minute limit the app's retry logic handles, so it can't
self-recover. **Coveo's own AI is completely unaffected** — RGA and Passage Retrieval answered fine
throughout, on the same page, minutes apart.

> That contrast is worth saying out loud if it's still true on the day: *"Different key, different
> protocol, no shared dependency. When you're designing an agent architecture, which half can fail
> independently is not a small question."*

---

## 7. The Coveo lens — the app's own inventory *(memorize this section)*

`components/CoveoChip.tsx` renders the Coveo favicon in a small round button on every Coveo-powered
section; hover opens a tooltip naming the capability. Hidden unless **Demo Mode** is on (the gear in
the header) — except **8 `alwaysVisible` marks** that predate the lens. **~52 marks across 40
files.**

Behind it: a **32-entry capability registry** — the app's own written inventory of what Coveo
powers.

**The 32:** `commerce-catalog` · `commerce-listing` · `commerce-controllers` · `pokedex-index` ·
`news-index` · `ml-recommendations` · `passage-retrieval` · `generated-answer` ·
`product-enrichment` · `product-view` · `query-suggest` · `instant-products` · `instant-pokedex` ·
`did-you-mean` · `fuzzy-fallback` · `query-understanding` · `deck-check` · `graded-pricing` ·
`printing-pricing` · `recently-viewed` · `index-matchup` · `ml-ranking` · `semantic-encoder` ·
`local-typeahead` · `thesaurus` · `stop-words` · `featured-result` · `dynamic-facets` ·
`url-manager` · `cart-analytics` · `notify-trigger` · `ai-consultant`

**8 flagged `ai: true`:** recommendations, passage retrieval, RGA, query-suggest, did-you-mean,
ml-ranking, semantic-encoder, ai-consultant.

**The five app-layer entries — what is NOT Coveo, and says so** *(verified in source 2026-08-19)*:

| Entry | Honesty |
|---|---|
| `fuzzy-fallback` | pure app layer — Coveo's commerce correction caps at 1 character, with no admin setting to widen it |
| `query-understanding` | pure app layer — "Coveo does the retrieval; this only decides what to ask it" |
| `local-typeahead` | pure app layer — fills the dropdown while PQS has no output, tops it up once trained |
| `deck-check` (the Advisor's coverage math) | app layer, but everything it reasons over is a Coveo read |
| `ai-consultant` | app layer — Gemini synthesizes, but never retrieves on its own |

> **Say "five."** Verified against `CoveoChip.tsx` 2026-08-19: exactly five registry entries open
> with *"Not a Coveo capability"* — `fuzzy-fallback`, `query-understanding`, `deck-check` (the
> Advisor's coverage math), `local-typeahead`, and `ai-consultant`. **`recently-viewed` is not one of
> them.** Earlier drafts said three and four; both were wrong.

> **The lens sentence:** *"Everything you watched, labeled. What isn't Coveo says so. This is the
> lens I'd flip on for an engineering team on day one — an FDE demo you can audit is worth two you
> can't."*

**Two known gaps in the registry** *(fix before any tooltip screenshot ships)*:

1. Each entry also carries `api`, `config` and `where` fields — **none of which render anywhere.**
   Only `label` and `detail` reach the tooltip. That's 32 × 3 lines of exactly the content a Coveo
   panel would love, sitting unused. Rendering `where` as a second line is the highest
   value-per-minute change available.
2. `passage-retrieval`'s `where` text is stale — it still says *"web crawler · search hub
   'default'"*, but PR runs on the push source via the `Pokedex Passages` hub. Worth a one-pass
   proofread of all 32 before a tooltip screenshot ships.

---

## 7a. The Advisor (`/advisor`) — new 2026-08-19, item 37

**Renamed from `/deck-check`** — page h1, header nav, icon (**Compass**) and URL. The old route
**permanently redirects**, so prior links and screenshot captions still resolve. Internal names
(`components/deck-check/`, the `deck-check` chip id) deliberately unchanged.

**One gap engine, two definitions of "gap":**

```
holdings → index-derived "what complete looks like" → diff
        → resolve gaps against live marketplace inventory → narrate
```

| Capability | Where | Status |
|---|---|---|
| Set-completion diff | `lib/gapEngine.ts` over one batched roster read | live |
| Cost to complete, split cheap-tail vs chase | same | live |
| Printing checklist | `cardprintingoptions`, **2,928 of 3,754 cards** | live, tracking only |
| Batched catalog retrieval | `lib/catalogQuery.ts` — classic Search API, `aq` value lists | live — **2 catalog calls, not N** |
| From-zero completion (empty state) | `StartFromSet` | live |
| Collection-as-a-deck | existing `useDeckCheck` pointed at holdings | live |

**The claim to get exactly right:** *"Both analyses run over the same holdings for every persona.
Persona chooses only which one **leads** the page — never which one exists."*

**Zero model calls.** Completion %, gap table, cost-to-complete and the variant checklist are all
index arithmetic; Gemini writes only the prose on top. **This makes the Advisor the most
demo-resilient surface in Act 4** — it survives the quota outage that takes the Consultant down.

**The numbers** *(measured live 2026-08-19)*:

| Figure | Value |
|---|---|
| Dana → Fossil (the default tab) | 4 missing, **$185.98** — three of them $1.12, Dragonite alone 99% |
| Dana → Base Set (contrast tab) | 97 missing, **$736.15** — 68 of them $108.82, dearest three 27% |
| …but the cheap tail | **68 of those 100 = $108.82** |
| …and the chase | 3 cards = **31%** of the bill |
| Cheapest complete set | **Emerging Powers, $112.59** (98 cards) |
| Dearest complete set | **Evolving Skies, $8,240.62** (237 cards) |
| Guest empty state | renders in **4 Coveo requests** |
| Retrieval fix found live | Dana was at **177 requests with 429s**; the per-id path was removed |

⚠️ **Demo-set discipline:** Base Set has **zero** cards carrying 2+ printings. Drive **completion on
Base Set**, **variants on Team Rocket or Neo Genesis.** One set cannot carry both beats.

**Limits to claim rather than hide:**

- A printing is **not purchasable** — one document per card (item 36, deferred).
- **No price history in the catalog** — "what went up" runs against a *labelled mock* cost basis,
  never a real past sale.
- **Grading arbitrage is cut** — `cardpsa10price` is live on **1 of 3,754** documents. *(The PDP's
  graded-market panel is separate and unaffected.)*
- **No format-legality field** — describe type exposure, never imply tournament legality.
- **No master-set denominator** in the data — no master-set percentage.

---

## 7b. Changes since the first compile *(all 2026-08-19)*

| # | Change | Effect on what you say |
|---|---|---|
| 34 | **Cold-load `/search` rail — FIXED.** `buildTab` → `cq`, matching `vaultEngine`/`newsEngine`. Measured after: **one** scoped search per cold load (was two), zero rejected thunks | **The "never open a `/search` URL cold" rule is lifted.** Shareable-URL beat is back. Costs the `tab` analytics field; `searchHub` routes the pipeline and is unaffected |
| 35 | **Zero-result state — HALF fixed.** `FuzzyDidYouMean` was gated on `products.length === 0` and had been **silently disabled outright** because commerce now never returns zero. Gate is now "the results don't echo what you typed" | ✅ `pikachoo` is demoable again. 🚫 `zzzqqxnothinghere` still is not — **the empty-state rec slot cannot be triggered.** Don't claim both halves closed |
| — | **Gemini pinned** to `gemini-3.5-flash-lite` (off the floating `-latest` alias) + a **visible degraded state** that classifies quota vs. generic and offers **no retry on the quota path** | A failed turn used to render nothing. Now it says something honest |
| 33 | **Provenance markers expanded** — five live Coveo surfaces carried no mark: **the home hero** (worst — the cold open's whole claim), Browse-the-Pokédex, the newsroom facet rail, article cross-links, Shop menu type/rarity. Consolidated to one icon per section | S15 is stronger. **The registry is still 32 entries** — the *marks* grew, not the registry |
| 31a | **`/search` performance** — the page fired **46 serialized API calls** to draw one 18-tile grid. Species lookups now batch: **24 calls → 3**, last title **7,276 ms → 1,175 ms**, no species lost | Q&A ammo, and every live beat is visibly faster |
| — | **`strongest psychic pokemon` now passes** (Mewtwo #1) | One of the two untested sweep queries resolved |
| 39 | **OPEN — Vault deep link drops the facet.** `/pokedex?q=char&f-pokemontype=Fire` lands on `/pokedex?q=char`. Pre-existing, confirmed against a stashed baseline | **Share a `/search` link, never a filtered `/pokedex` link** |
| 38 | **OPEN, deliberately not urgent.** `SearchResultsPage` is 1,157 lines / 18 `useEffect` / 9 `useState` / 13 `useRef` | Only relevant if asked "what would you refactor?" — the honest answer is "the highest-risk, lowest-user-value change in the app, which is why it's still open" |

---

## 7c. The business case *(from `gap-check-plan.md` §10–11)*

**The four-part "why Coveo" — S16's new spine:**

1. **Zero-curation completion at catalog scale.** Every denominator is a facet count or an indexed
   field. 28 sets covered with no per-set merchandising; a set that ships next year is covered the
   day it's indexed. The alternative is a merchandiser maintaining one page per set, forever,
   against ~4 new sets a year.
2. **Gaps → cart is a conversion mechanic, not a browse surface.** Every resolved gap trains ART,
   recs and PQS — the flywheel extends to the collector, not just the player.
3. **🔑 The gaps that resolve to zero results are the product.** Demand with no supply, aggregated
   across every collector who ran the check — **a procurement buy-list generated as a byproduct of
   a shopper-facing feature.** No price site can produce it: it needs *this* index diffed against
   *these* holdings. It turns the honesty gate into a revenue line.
4. **One index, two jobs, no rebuild.**

**Market numbers — use the grading figures, never a TAM:**

✅ Pokémon = **16.1M of 26.8M cards graded in 2025** · volume **+32% YoY** · **97 of PSA's top 100**
most-submitted cards (H1 2025).

🚫 **Never say "the $7 billion Pokémon market."** That figure is the physical-TCG segment across
*every* game and overstates Pokémon ~3× against its own share in the same report. Four "global TCG
market" estimates for 2025 disagree by **2.2×** depending on methodology. A panelist who knows the
category will catch it, and this deck's thesis is that its numbers are measured.

**"Is it going up?" — the answer that survives:**

> *"I can't tell you what a card sold for last month — I'd have to buy that feed. I **can** tell you
> demand for it on this marketplace is up, from the same event stream that trains the
> recommendations. And demand is what moves the price."*

Honest, a leading indicator rather than a lagging one, and the one signal RabidMoose owns that no
price-tracking site can replicate. **Two things it must not become:** a fabricated price series, or
a claim that demand *is* price — the wording concedes the second explicitly, which is what makes it
survivable.

---

## 8. Everything that is *not* Coveo

| Tech | Role |
|---|---|
| **Gemini** (Developer API, not Vertex) | narrates consultations and deck health — reasons, never retrieves |
| TCGdex API | catalog + real TCGplayer/Cardmarket pricing |
| pokemondb.net + PokéAPI | species content + the enrichment that makes RGA answerable |
| pokemon.com | real newsroom headlines and dates |
| **PokemonPriceTracker API** | PSA 9/10 graded-market medians — third-party enrichment served through the same commerce response (`cardpsa*`, the PDP "Graded market" panel) |
| Vercel | prod hosting + the two serverless functions |
| Vercel Analytics + Speed Insights | web-vitals telemetry for the host — **not on any slide**; mention only if asked |
| Vite + React + TS + Tailwind v4 + shadcn | app shell |
| Playwright + Edge | live-verification discipline — screenshots at 1440/375, network interception |
| **App-layer features flagged non-Coveo in the lens** | query understanding, fuzzy did-you-mean, local typeahead vocabulary, deck check, recently-viewed trail, featured-badge mirror |

> **The framing:** *"The platform does retrieval. This layer decides what to ask."*

---

## 9. Cheat sheet — the numbers, and what each one is for

| Number | What it is | What it proves |
|---|---|---|
| **4 sources, 1 index** | the data model | federation is real, not three deployments |
| **3,754 / 1,025 / 15–18 / 1,031** | live doc counts | measured, dated, defensible |
| **8 pipelines** | routing | one of them is an orphan, and that's the war story |
| **5 named hubs** | content-side routing | two fall back on purpose |
| **5 engines, 2 SDKs** | Headless architecture | two engines concurrently in one shell |
| **9 ML models, all ONLINE** | the ML map | 2 carry war stories, 2 are honestly cold |
| **11/15 → 20/21** | relevancy scorecard | index-time enrichment worked |
| **0 → 193** (`show me rare fire cards`) | conversational stop words | pipeline tuning, not code |
| **0 → 9** (`foil charizard`) | thesaurus | shopper vocabulary vs catalog vocabulary |
| **5 → 441 → 5** | the Vault regression | semantic recall belongs in a labeled row |
| **7 configured / 6 rendered** | rec slots | say both numbers, never round up |
| **~19k seeded events · 12,530 commerce** | ML training data | enough to prove mechanism, not results |
| **0 → 6 call sites** | the click loop | found my own bug and fixed it same-day |
| **3 MCP tools** | `search`, `fetch`, `retrieve_passages` | the fourth is deliberately absent |
| **16 + 3 + 1** | one `search` call on `charizard` | **the federation proof** |
| **32 registry entries, ~52 marks, 40 files** | the lens | the app's own written inventory |

---

## 10. If you only remember five sentences

1. **"The org holds both a crawler source and push sources — the honest answer to 'crawler or push'
   is *depends on the source*, and this org is the receipt."**
2. **"The model was fine. No request could reach it."** *(the orphan pipeline)*
3. **"Semantic recall belongs in a labeled row, never silently merged into keyword counts."**
4. **"One search call, three corpora — the agent doesn't pick a tool per corpus, Coveo does the
   blending."**
5. **"What isn't Coveo says so, and what wasn't sent isn't on the tape."**

---

## Open items before the panel

1. **Reconcile the news doc count** (15 vs 18) — it prints on S2.
2. **Proofread all 32 registry entries**, starting with `passage-retrieval.where`.
3. **Decide whether to render `where` in the tooltip** — highest value-per-minute change available.
4. **Gemini quota** — governs whether the AI-layer material is live or screenshots.
5. **Event Tape is currently always-visible on the public site**, not lens-gated. Fine for the
   panel, odd for a stray visitor. Recommend gating it.
