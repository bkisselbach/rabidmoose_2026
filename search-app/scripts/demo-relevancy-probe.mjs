// DEMO RELEVANCY PROBE -- the pre-panel sweep.
//
// Answers one question per row: "if I type this in front of the Coveo panel, what comes back, and
// is it the thing I said it would be?" Same discipline as catalog-scraper's relevancy scorecard,
// scripts/card-audit.mjs and scripts/consultant-reliability-panel.mjs: a FIXED set of inputs,
// ASSERTED against expectations, scored, not eyeballed once. Exits non-zero so it can gate.
//
// Run (against production, the default):
//   node scripts/demo-relevancy-probe.mjs
// Against a local dev server (needs `npm run dev` AND `npm run dev:api`):
//   PROBE_BASE=http://localhost:5173 CONSULTANT_API_URL=http://localhost:3001/api/consultant \
//   DECK_API_URL=http://localhost:3001/api/deck-health node scripts/demo-relevancy-probe.mjs
// Skip the LLM half (fast, no Gemini quota):
//   PROBE_SKIP_AI=1 node scripts/demo-relevancy-probe.mjs
//
// Writes presentation/demo-relevancy-results.json (raw) and prints a markdown table sized to paste
// straight into presentation/demo-relevancy-testbook.md §7.
//
// WHAT IT READS, AND WHY BOTH. Every search row captures the Coveo response off the wire AND the
// rendered DOM, because they answer different questions and this repo has already been bitten by
// the difference: a featured-result pin lives in the response's ORDER but the "Featured" badge is a
// CLIENT-SIDE MIRROR (featuredRules.ts) -- the commerce response carries no pin flag at all. So a
// rule that changed in the Admin Console and a mirror table that didn't would show up as "ranked
// #1, no badge", and only reading both surfaces catches it. Same reason the DOM order is recorded
// separately from the response order.

const BASE = (process.env.PROBE_BASE || 'https://www.rabidmoose.com').replace(/\/$/, '');
const CONSULTANT_API_URL = process.env.CONSULTANT_API_URL || `${BASE}/api/consultant`;
const DECK_API_URL = process.env.DECK_API_URL || `${BASE}/api/deck-health`;
const SKIP_AI = process.env.PROBE_SKIP_AI === '1';
const SETTLE_MS = Number(process.env.PROBE_SETTLE_MS || 4000);

// ---------------------------------------------------------------------------------------------
// The sweep. `beat` ties each row to panel-demo-script.md so a FAIL names the beat it breaks.
// `expect` is deliberately loose where the honest expectation is loose: `topIncludes` asserts the
// #1 result's text contains a string, `anyIncludes` only that it appears in the visible grid,
// `minResults` guards against a silent zero. Asserting an exact 12-card order would fail on ART
// retrains and teach you to ignore the script -- the point is to catch a demo-breaking regression,
// not to freeze ranking.
// ---------------------------------------------------------------------------------------------
const SWEEP = [
  // --- Onix thread (the requested test subject; also the merchandising-control answer) ---
  {
    id: 'onix-featured',
    beat: 'Q&A: "can merchandisers control ranking?"',
    q: 'onix',
    expect: { minResults: 3, topIncludes: 'Onix', domFeaturedBadge: true },
    watch: 'Result Rankings rule pins sm115-36 (Hidden Fates Onix GX) to #1. The badge is a client-side mirror -- rank without badge means featuredRules.ts drifted from the rule.',
  },
  {
    id: 'onix-plain-species',
    beat: 'Beat 3 shape, Onix variant',
    q: 'onix rock type',
    expect: { minResults: 1 },
    watch: 'Does the stop-word/thesaurus layer keep this from collapsing? "type" is a structural stop word.',
  },
  {
    id: 'onix-evolution',
    beat: 'Beat 6 (species page follow-on)',
    q: 'steelix',
    expect: { minResults: 1 },
    watch: 'Onix evolves into Steelix -- if Steelix has no cards, say so on stage rather than discovering it live.',
  },
  // --- The scripted money queries ---
  {
    id: 'charizard',
    beat: 'Beat 3 -- the money query',
    q: 'charizard',
    expect: { minResults: 8, anyIncludes: 'Charizard', domSpeciesRail: true },
    watch: 'No result count is printed on a query by design (commerce reports a 500 ceiling, not a total).',
  },
  {
    id: 'electric-mouse',
    beat: 'Beat 4 -- enriched relevance',
    q: 'electric mouse',
    expect: { minResults: 1, anyIncludes: 'Pikachu' },
    watch: 'The index-time description join. If Pikachu is not on screen this beat is dead -- do not improvise a substitute.',
  },
  {
    id: 'rare-fire-cards',
    beat: 'Beat 2.5 / query understanding',
    q: 'show me rare fire cards',
    expect: { minResults: 20 },
    watch: 'Conversational stop words: 0 products before the QPL rule, 193 after. A collapse back toward 0 means the pipeline lost its stop-word statements.',
  },
  {
    id: 'foil-charizard',
    beat: 'Q&A: synonyms/stop words',
    q: 'foil charizard',
    expect: { minResults: 5, anyIncludes: 'Charizard' },
    watch: 'Thesaurus holo<->foil. Verified 0 -> 9 results when the rule landed.',
  },
  {
    id: 'sir-charizard',
    beat: 'Q&A: synonyms',
    q: 'sir charizard',
    expect: { minResults: 1 },
    watch: 'sir <-> special illustration rare. Lower confidence than foil -- verify before scripting.',
  },
  {
    id: 'beat-water-budget',
    beat: 'Beat 2.5 -- the composer sentence',
    q: 'Beat Water types under $25',
    expect: { minResults: 5, domMatchupBanner: true, domFacetsApplied: true },
    watch: 'The whole composer beat. Banner + derived facet selections + every card inside the band. Measured once at 20 cards, $5.87-$24.50.',
  },
  // --- Typo handling, the two-layer story ---
  {
    id: 'pikachuu',
    beat: 'Q&A: typo handling (layer 1)',
    q: 'pikachuu',
    expect: { minResults: 1 },
    watch: 'Edit distance 1 -> server-side commerce query correction.',
  },
  {
    id: 'pikachoo',
    beat: 'Q&A: typo handling (layer 2)',
    q: 'pikachoo',
    expect: { minResults: 0, domDidYouMean: true },
    watch: 'Distance 2 -> past the platform cap. EXPECTED TO FAIL as of 2026-08-19: returns 6 loose matches (Pikipek/Pumpkaboo/Pidove...) with no correction and no fallback, because FuzzyDidYouMean is gated on products.length === 0 and commerce never returns zero. See testbook 7.4.',
  },
  // --- Opinion / semantic ---
  {
    id: 'strongest-psychic',
    beat: 'Q&A: opinion queries',
    q: 'strongest psychic pokemon',
    expect: { minResults: 1 },
    watch: 'Index-time type-ranking sentences. Marked verify-first in the script -- the semantic store lags a re-push.',
  },
  {
    id: 'empty-state',
    beat: 'Q&A: no results',
    q: 'zzzqqxnothinghere',
    expect: { minResults: 0, domRecsOnEmpty: true },
    watch: 'Empty-state recommendation slot must render. EXPECTED TO FAIL as of 2026-08-19: returns 96 results (Zweilous/Zorua/Zamazenta...). Same root cause as pikachoo. See testbook 7.4.',
  },
];

// The Vault's semantic finder -- its own page, own engine, own pipeline.
const VAULT_SWEEP = [
  {
    id: 'vault-semantic',
    beat: 'Beat 6.5 -- Pokedex Vault',
    path: '/pokedex?q=' + encodeURIComponent('tiny blue mouse that can breathe underwater and evolves twice'),
    watch: '0 keyword results, a real species surfaces semantically. Do NOT pre-commit to which one -- the top rank is a live cluster that drifts with the embeddings retrain.',
  },
  {
    id: 'vault-onix-desc',
    beat: 'Beat 6.5, Onix variant',
    path: '/pokedex?q=' + encodeURIComponent('giant snake made of boulders that burrows underground'),
    watch: 'Onix-flavoured semantic probe. Unverified -- this run decides whether it is scriptable.',
  },
];

// ---------------------------------------------------------------------------------------------
const rows = [];
const record = (r) => {
  rows.push(r);
  const mark = r.verdict === 'PASS' ? 'ok  ' : r.verdict === 'WARN' ? 'warn' : 'FAIL';
  console.log(`  ${mark} ${r.id.padEnd(22)} ${r.summary}`);
  if (r.detail) console.log(`       ${r.detail}`);
};

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ channel: process.env.PROBE_CHANNEL || 'msedge' });
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
const page = await context.newPage();

// Coveo responses, keyed by the navigation that produced them.
let captured = [];
page.on('response', async (res) => {
  const url = res.url();
  if (!/coveo\.com|\/api\/(consultant|deck-health)/.test(url)) return;
  try {
    const j = await res.json();
    if (Array.isArray(j.products)) {
      captured.push({
        kind: 'commerce',
        pipeline: j.pipeline ?? null,
        total: j.totalCount ?? null,
        order: j.products.map((p) => ({
          id: p.permanentid ?? p.ec_product_id,
          name: p.ec_name ?? '',
          price: p.ec_promo_price ?? p.ec_price ?? null,
        })),
      });
    } else if (Array.isArray(j.results)) {
      captured.push({
        kind: 'content',
        pipeline: j.pipeline ?? null,
        total: j.totalCount ?? null,
        order: j.results.map((r) => ({ title: r.title, source: r.raw?.source ?? null })),
      });
    } else if (Array.isArray(j.completions)) {
      captured.push({ kind: 'querySuggest', order: j.completions.map((c) => c.expression) });
    } else if (Array.isArray(j.items)) {
      captured.push({ kind: 'passages', order: j.items.map((i) => (i.text ?? '').slice(0, 120)) });
    }
  } catch {
    /* non-JSON (analytics beacons) -- ignore */
  }
});

/** Everything the DOM can tell us that the response can't. */
async function readDom() {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid="product-card"]')];
    // Trap from card-audit.mjs: /search renders product cards in BOTH the Consultant panel and the
    // PLP grid. Scope to the grid's own per-tile wrapper so order/count mean the grid.
    const gridCards = cards.filter((c) => c.closest('.deal-in'));
    const use = gridCards.length ? gridCards : cards;
    const body = document.body.innerText;
    return {
      gridCount: use.length,
      grid: use.slice(0, 12).map((c) => c.innerText.replace(/\s*\n+\s*/g, ' | ').trim().slice(0, 130)),
      speciesTiles: [...document.querySelectorAll('[data-testid="pokedex-card"]')]
        .slice(0, 8)
        .map((c) => c.innerText.replace(/\s*\n+\s*/g, ' ').trim().slice(0, 60)),
      // CASE-INSENSITIVE on purpose: `.eyebrow`/badge text is `text-transform: uppercase`, so
      // innerText returns "FEATURED". A case-sensitive test here reported a false negative on the
      // live 2026-08-19 sweep while the badge was plainly on screen -- card-audit.mjs's trap 2.
      featuredBadge: /\bfeatured\b/i.test(body),
      matchupBanner: /Read as a matchup question|We read that as/i.test(body),
      didYouMean: /did you mean/i.test(body),
      checkedFacets: [...document.querySelectorAll('input[type="checkbox"]')]
        .filter((i) => i.checked)
        .map((i) => i.closest('label')?.innerText?.trim() ?? '')
        .filter(Boolean),
      recommendationHeadings: [...document.querySelectorAll('h2, h3')]
        .map((h) => h.innerText.trim())
        .filter((t) => /recommend|you might|popular|trending|also|left off/i.test(t)),
      consultantText: (body.match(/Card Consultant[\s\S]{0,700}/) || [])[0] ?? null,
    };
  });
}

console.log(`\nDemo relevancy probe -- ${BASE}\n`);
console.log('SEARCH SWEEP');

for (const row of SWEEP) {
  captured = [];
  const url = `${BASE}/search?q=${encodeURIComponent(row.q)}`;
  let dom;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(SETTLE_MS);
    dom = await readDom();
  } catch (err) {
    record({ ...row, verdict: 'FAIL', summary: `navigation failed`, detail: String(err).slice(0, 160) });
    continue;
  }

  const commerce = captured.filter((c) => c.kind === 'commerce').pop() ?? null;
  const content = captured.filter((c) => c.kind === 'content').pop() ?? null;
  const top = commerce?.order?.[0]?.name ?? dom.grid[0] ?? '';
  const problems = [];
  const e = row.expect ?? {};

  if (e.minResults != null) {
    if (e.minResults === 0) {
      if (dom.gridCount > 0) problems.push(`expected an empty result set, got ${dom.gridCount} cards`);
    } else if (dom.gridCount < e.minResults) {
      problems.push(`only ${dom.gridCount} cards (expected >= ${e.minResults})`);
    }
  }
  if (e.topIncludes && !new RegExp(e.topIncludes, 'i').test(top)) {
    problems.push(`#1 is "${String(top).slice(0, 60)}" -- expected it to contain "${e.topIncludes}"`);
  }
  if (e.anyIncludes && !dom.grid.some((g) => new RegExp(e.anyIncludes, 'i').test(g))) {
    problems.push(`"${e.anyIncludes}" not visible in the grid`);
  }
  if (e.domFeaturedBadge && !dom.featuredBadge) problems.push('no "Featured" badge rendered (rule/mirror drift?)');
  if (e.domSpeciesRail && dom.speciesTiles.length === 0) problems.push('no species rail -- the federation half is missing');
  // COLD-LOAD STALE-RAIL GUARD (defect found live 2026-08-19). Loading /search?q=X directly renders
  // the same ten species for every query -- the content engine's first search runs without the
  // query. Any of these names appearing on an unrelated query means the rail is stale, not relevant.
  const STALE_RAIL = ['Krookodile', 'Iron Crown', 'Archaludon', 'Terapagos', 'Iron Boulder', 'Ogerpon', 'Gouging Fire', 'Pecharunt', 'Sinistcha', 'Raging Bolt'];
  const staleHits = dom.speciesTiles.filter((t) => STALE_RAIL.some((n) => t.includes(n)));
  if (staleHits.length >= 4) problems.push(`species rail looks STALE (cold-load bug): ${staleHits.slice(0, 3).join(', ')}...`);
  if (e.domMatchupBanner && !dom.matchupBanner) problems.push('no matchup/reading banner');
  if (e.domFacetsApplied && dom.checkedFacets.length === 0) problems.push('no derived facet selections applied');
  if (e.domDidYouMean && !dom.didYouMean) problems.push('no did-you-mean offered');
  if (e.domRecsOnEmpty && dom.recommendationHeadings.length === 0) problems.push('empty state rendered no recommendation rail');

  record({
    id: row.id,
    beat: row.beat,
    query: row.q,
    verdict: problems.length ? 'FAIL' : 'PASS',
    summary: `${dom.gridCount} cards · pipeline ${commerce?.pipeline ?? '?'} · #1 "${String(top).slice(0, 44)}"`,
    detail: problems.join('; ') || null,
    watch: row.watch,
    data: { commerce, content, dom },
  });
}

console.log('\nVAULT SWEEP');
for (const row of VAULT_SWEEP) {
  captured = [];
  try {
    await page.goto(`${BASE}${row.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(SETTLE_MS + 1500);
    const dom = await readDom();
    const passages = captured.filter((c) => c.kind === 'passages').pop() ?? null;
    record({
      id: row.id,
      beat: row.beat,
      query: row.path,
      verdict: dom.speciesTiles.length || passages ? 'PASS' : 'WARN',
      summary: `${dom.speciesTiles.length} species tiles · semantic rows ${passages?.order?.length ?? 0}`,
      detail: dom.speciesTiles.slice(0, 4).join(' / ') || null,
      watch: row.watch,
      data: { dom, passages },
    });
  } catch (err) {
    record({ ...row, verdict: 'FAIL', summary: 'navigation failed', detail: String(err).slice(0, 160) });
  }
}

// ---------------------------------------------------------------------------------------------
// The generated-answer half. Pacing + RetryInfo handling lifted from
// scripts/consultant-reliability-panel.mjs -- one agentic ask can cost several generateContent
// calls against the same per-minute Gemini budget, so pacing alone does not hold.
// ---------------------------------------------------------------------------------------------
const PACE_MS = 4500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function retryDelayMs(detail) {
  try {
    const parsed = JSON.parse(detail);
    const info = parsed?.error?.details?.find((d) => d['@type']?.includes('RetryInfo'));
    const s = info?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/)?.[1];
    return s ? Math.ceil(parseFloat(s) * 1000) + 1000 : null;
  } catch {
    return null;
  }
}
async function postJson(url, body, attempt = 0) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const delay = errBody?.detail ? retryDelayMs(errBody.detail) : null;
      if (delay != null && attempt < 2) {
        await sleep(delay);
        return postJson(url, body, attempt + 1);
      }
      return { ok: false, ms, error: `HTTP ${res.status}` };
    }
    return { ok: true, ms, data: await res.json() };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: String(err).slice(0, 120) };
  }
}

// Demo-shaped consultant asks. These are NOT the reliability panel's eight (that one measures the
// feature); these are the sentences that would actually be typed in front of the panel, plus the
// Onix thread.
const CONSULTANT_ASKS = [
  { id: 'consult-onix', beat: 'Onix thread', q: 'I want an Onix card for a rock deck', expectGrounded: true },
  { id: 'consult-onix-fact', beat: 'Onix thread', q: 'What is Onix weak to?', expectGrounded: true },
  { id: 'consult-budget', beat: 'Beat 2.5 in prose', q: 'Find me a Charizard card under $50', expectGrounded: true },
  { id: 'consult-vague', beat: 'the "search box cannot do this" claim', q: 'something cool for a kid just starting out', expectGrounded: true },
  { id: 'consult-offtopic', beat: 'honesty guardrail', q: 'What is the capital of France?', expectGrounded: false },
];

if (!SKIP_AI) {
  console.log('\nCARD CONSULTANT');
  let first = true;
  for (const ask of CONSULTANT_ASKS) {
    if (!first) await sleep(PACE_MS);
    first = false;
    const r = await postJson(CONSULTANT_API_URL, { query: ask.q });
    if (!r.ok) {
      record({ ...ask, verdict: 'FAIL', summary: `request failed (${r.error})` });
      continue;
    }
    const text = r.data?.text ?? '';
    const pids = r.data?.productIds ?? [];
    const species = r.data?.speciesNames ?? [];
    const grounded = pids.length > 0 || species.length > 0;
    const problems = [];
    if (!text.trim()) problems.push('empty answer');
    if (ask.expectGrounded && !grounded) problems.push('UNGROUNDED -- answered with no tool result behind it');
    if (!ask.expectGrounded && grounded) problems.push('grounded when it should have declined/redirected');
    record({
      id: ask.id,
      beat: ask.beat,
      query: ask.q,
      verdict: problems.length ? 'FAIL' : 'PASS',
      summary: `${r.ms}ms · ${pids.length}p/${species.length}s · "${text.replace(/\s+/g, ' ').slice(0, 90)}"`,
      detail: problems.join('; ') || null,
      data: { text, productIds: pids, speciesNames: species, ms: r.ms },
    });
  }

  // --- Deck advisor -----------------------------------------------------------------------
  // GROUNDED BY CONSTRUCTION, and the probe honours that: rather than typing Onix's weaknesses in
  // here from memory (which would test Gemini against MY facts, not the index's), the real
  // weakness chips are scraped off each species page first and sent as the payload. That means a
  // wrong narration is unambiguously the narrator's fault, and it doubles as a check that the
  // species pages still render weaknesses at all.
  console.log('\nDECK ADVISOR');
  const DECK = ['onix', 'geodude', 'machop'];
  const species = [];
  for (const slug of DECK) {
    try {
      await page.goto(`${BASE}/pokedex/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);
      const w = await page.evaluate(() => {
        const body = document.body.innerText;
        const block = body.match(/Weak(?:ness|nesses|\s+to)[:\s]*([\s\S]{0,160})/i);
        if (!block) return [];
        const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
        return TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(block[1]));
      });
      species.push({ name: slug[0].toUpperCase() + slug.slice(1), weaknesses: w });
      console.log(`  read ${slug}: ${w.join(', ') || '(no weaknesses found on page -- check the PDP)'}`);
    } catch (err) {
      console.log(`  read ${slug}: FAILED (${String(err).slice(0, 80)})`);
    }
  }

  const counts = new Map();
  species.forEach((s) => s.weaknesses.forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1)));
  const topWeaknesses = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);

  const deckBody = {
    species,
    topWeaknesses,
    weaknessCounts: [...counts.entries()],
    missingStages: [{ for: 'Steelix', need: ['Onix'] }],
    deckCardCount: species.length,
  };
  const dr = await postJson(DECK_API_URL, deckBody);
  if (!dr.ok) {
    record({ id: 'deck-onix', beat: 'Beat 8.2 / /advisor', query: 'Onix+Geodude+Machop', verdict: 'FAIL', summary: `request failed (${dr.error})` });
  } else {
    const text = dr.data?.text ?? '';
    const problems = [];
    if (!text.trim()) problems.push('empty narration');
    // The one thing worth asserting hard: it must not name a type that was never in the payload.
    const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
    const sent = new Set([...counts.keys()]);
    const invented = TYPES.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(text) && !sent.has(t) && !species.some((s) => s.name === t));
    if (invented.length) problems.push(`names type(s) not in the payload: ${invented.join(', ')} -- the exact failure mode the system instruction exists to prevent`);
    record({
      id: 'deck-onix',
      beat: 'Beat 8.2 / /advisor',
      query: `deck: ${species.map((s) => s.name).join(' + ')}`,
      verdict: problems.length ? 'FAIL' : 'PASS',
      summary: `${dr.ms}ms · sent [${topWeaknesses.join(', ')}] · "${text.replace(/\s+/g, ' ').slice(0, 100)}"`,
      detail: problems.join('; ') || null,
      data: { payload: deckBody, text, ms: dr.ms },
    });
  }
} else {
  console.log('\n(PROBE_SKIP_AI=1 -- consultant and deck advisor skipped)');
}

await browser.close();

// ---------------------------------------------------------------------------------------------
const fs = await import('node:fs');
const stamp = new Date().toISOString();
// This file lives in search-app/scripts/, so the presentation folder is two levels up. Falls back
// to the cwd rather than throwing away a completed run over a path.
const OUT_CANDIDATES = [
  new URL('../../presentation/demo-relevancy-results.json', import.meta.url),
  new URL('./demo-relevancy-results.json', `file://${process.cwd()}/`),
];
let wroteTo = null;
for (const candidate of OUT_CANDIDATES) {
  try {
    fs.writeFileSync(candidate, JSON.stringify({ base: BASE, ranAt: stamp, rows }, null, 2));
    wroteTo = candidate.pathname;
    break;
  } catch {
    /* try the next one */
  }
}
console.log(`\nRaw results: ${wroteTo ?? '(could not write a results file)'}`);

const fails = rows.filter((r) => r.verdict === 'FAIL');
console.log(`\nScorecard: ${rows.filter((r) => r.verdict === 'PASS').length}/${rows.length} passed, ${fails.length} failed.`);
console.log('\n--- paste into demo-relevancy-testbook.md §7 ---\n');
console.log('| Row | Beat | Query | Verdict | Measured |');
console.log('|---|---|---|---|---|');
for (const r of rows) {
  const measured = `${r.summary}${r.detail ? ` — **${r.detail}**` : ''}`.replace(/\|/g, '\\|');
  console.log(`| \`${r.id}\` | ${r.beat ?? ''} | \`${String(r.query ?? '').slice(0, 40)}\` | ${r.verdict} | ${measured} |`);
}
console.log(`\n_Run ${stamp} against ${BASE}._`);

process.exit(fails.length ? 1 : 0);
