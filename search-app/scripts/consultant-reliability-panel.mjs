// Phase R1 of presentation/consultant-everywhere-plan.md -- the reliability measurement
// AskPokedex's 49/50 (askAnchoring.ts) doesn't transfer to this feature: Gemini doing its own
// synthesis has different failure modes than RGA's classify-then-decline behavior, so this needs
// its own baseline, not an inherited one. Same discipline as catalog-scraper's relevancy scorecard
// and AskPokedex's own measurement: a FIXED query set, run and SCORED, not eyeballed once.
//
// Run: node --experimental-strip-types scripts/consultant-reliability-panel.mjs
// (requires scripts/dev-api-server.mjs running on :3001, or point API_URL at a deployed instance)
//
// Query set spans the shapes a real shopper's sentence takes -- not the full continuous
// "fluency/intent dial" card-consultant-plan.md Phase 5 originally sketched (that was never built
// as a literal dial; three fixed personas were), but the concrete cases that dial was a proxy for:
// a bare lookup, an advisory/matchup question, a budget constraint, a negative-polarity yes/no
// (the RGA-compare case), a vague/descriptive query, a specific-card search, a deck-building
// question, and a deliberately off-topic one -- the last is a PASS when the consultant declines or
// redirects rather than fabricates Pokemon-card facts about something unrelated.

const API_URL = process.env.CONSULTANT_API_URL || 'http://localhost:3001/api/consultant';

/** `expectGrounded: true` means a real answer should have called a tool and returned at least one
 *  product or species id -- scored a FAIL if it answered fluently but ungrounded (the exact failure
 *  mode "never invent a card, price, or species fact" exists to prevent). `expectGrounded: false`
 *  is the off-topic case, where grounding would be a red flag, not a pass. */
const QUERIES = [
  { label: 'Bare species lookup', query: 'Tell me about Pikachu', expectGrounded: true },
  { label: 'Advisory/matchup', query: 'What beats Fire types?', expectGrounded: true },
  { label: 'Budget constraint', query: 'Find me a cheap Charizard card', expectGrounded: true },
  { label: 'Negative-polarity yes/no', query: 'Is Squirtle a Dragon type?', expectGrounded: false },
  { label: 'Vague/descriptive', query: 'I want a card with a cute blue Pokemon on it', expectGrounded: true },
  { label: 'Specific card search', query: 'Find me a Pikachu ex card', expectGrounded: true },
  { label: 'Deck-building', query: 'What should I add to a Water-type deck?', expectGrounded: true },
  { label: 'Off-topic (should decline, not fabricate)', query: 'What is the capital of France?', expectGrounded: false },
];

const PERSONAS = {
  Guest: undefined,
  Dana: { name: 'Dana Whitfield', subtitle: 'Vintage collector' },
  Marcus: { name: 'Marcus Hale', subtitle: 'Competitive player' },
};

/** Only re-run the tone check across all three personas -- the eight queries above already run
 *  once (as Guest) to measure grounding reliability, which doesn't change by persona (P1's own
 *  rule: persona context shapes tone only). Running all 8 x 3 would 3x the runtime for no new
 *  signal beyond this one check. */
const TONE_CHECK_QUERY = 'Find me a good Charizard card';

// Gemini's free tier caps gemini-3.5-flash-lite at 15 requests/minute (RESOURCE_EXHAUSTED ->
// surfaces as an HTTP 502 through api/consultant.ts's generic error handling). This panel makes
// 11 *outer* calls (8 queries + 3 persona tone checks) with no concurrency, but pacing those alone
// wasn't enough -- measured live 2026-08-17, still tripped the quota with 4.5s between outer
// calls. Cause: each outer call is agentic (Gemini decides whether/how many times to call a Coveo
// tool before answering), so one "ask()" can cost 2+ real generateContent calls against the same
// per-minute budget -- "Deck-building"'s 8 grounded products in one answer implies more than one
// round trip. Pacing outer calls can't account for that; retrying on the platform's own advertised
// RESOURCE_EXHAUSTED retryDelay can, so that's the actual fix, layered on top of the pacing above.
const PACE_MS = 4500;
const MAX_RETRIES = 2;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(detail) {
  // api/consultant.ts forwards Gemini's raw error body as a JSON *string* in `detail` -- parse
  // through that to read the structured RetryInfo Gemini itself returns, rather than guessing.
  try {
    const parsed = JSON.parse(detail);
    const violation = parsed?.error?.details?.find((d) => d['@type']?.includes('RetryInfo'));
    const seconds = violation?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/)?.[1];
    return seconds ? Math.ceil(parseFloat(seconds) * 1000) + 1000 : null;
  } catch {
    return null;
  }
}

async function ask(query, personaContext, attempt = 0) {
  const started = Date.now();
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, personaContext }),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const delay = body?.detail ? retryDelayMs(body.detail) : null;
      if (delay != null && attempt < MAX_RETRIES) {
        await sleep(delay);
        return ask(query, personaContext, attempt + 1);
      }
      return { ok: false, ms, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      ok: true,
      ms,
      text: data.text ?? '',
      grounded: (data.productIds?.length ?? 0) > 0 || (data.speciesNames?.length ?? 0) > 0,
      productIds: data.productIds ?? [],
      speciesNames: data.speciesNames ?? [],
    };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: String(err) };
  }
}

const results = [];

console.log(`Consultant reliability panel -- against ${API_URL}\n`);

let firstCall = true;
async function paced() {
  if (!firstCall) await sleep(PACE_MS);
  firstCall = false;
}

for (const { label, query, expectGrounded } of QUERIES) {
  await paced();
  process.stdout.write(`${label.padEnd(38)} `);
  const r = await ask(query);
  if (!r.ok) {
    console.log(`FAIL  (request error: ${r.error})`);
    results.push({ label, pass: false, reason: r.error });
    continue;
  }
  const hasAnswer = r.text.trim().length > 0;
  const pass = expectGrounded ? hasAnswer && r.grounded : hasAnswer;
  const note = expectGrounded
    ? r.grounded
      ? `grounded (${r.productIds.length}p/${r.speciesNames.length}s)`
      : 'UNGROUNDED -- answered without a tool call'
    : r.grounded
      ? 'grounded when it should have declined/redirected instead'
      : 'declined/redirected as expected';
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${note}  (${r.ms}ms)`);
  if (!pass) console.log(`    -> "${r.text.slice(0, 140)}"`);
  results.push({ label, pass, note, ms: r.ms });
}

console.log(`\nPersona tone check -- "${TONE_CHECK_QUERY}"`);
for (const [name, ctx] of Object.entries(PERSONAS)) {
  await paced();
  const r = await ask(TONE_CHECK_QUERY, ctx);
  console.log(`  ${name.padEnd(8)} ${r.ok ? `"${r.text.slice(0, 160)}"` : `FAIL (${r.error})`}`);
}

const passCount = results.filter((r) => r.pass).length;
console.log(`\nScorecard: ${passCount}/${results.length} passed.`);
if (passCount < results.length) {
  console.log('Failures:', results.filter((r) => !r.pass).map((r) => r.label).join(', '));
}
