import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GoogleGenAI, mcpToTool, type Content } from '@google/genai';

// Phase G1 of presentation/consultant-everywhere-plan.md: the serverless foundation for the
// Gemini-narrated Card Consultant. Extended for phase G2 (the one-shot box on /search): grounded
// product/species ids, extracted from the MCP tool calls' own raw results, not from Gemini's prose.
// Extended again for phase G3 (multi-turn): an optional `history` reconstructs a real Gemini chat
// session per request, since a serverless function holds no state between invocations.
//
// MULTI-TURN, verified against the actual published types before writing this: `@google/genai`'s
// `ai.chats.create({model, config, history})` takes exactly the same `history?: Content[]` the
// stateless-invocation problem needs -- a `Chat` is not a live server-side session, it is a client
// object seeded with whatever history you hand it, then `chat.sendMessage({message})` appends one
// more turn and returns the same `GenerateContentResponse` shape `generateContent` does (same
// `automaticFunctionCallingHistory`, same `.text`), so the grounding extraction below needs no
// separate path for turn 1 vs turn N.
//
// ARCHITECTURE, verified against the actual published packages before writing this (not assumed):
// Gemini's own MCP support (`mcpToTool`, @google/genai) wraps an already-CONNECTED
// @modelcontextprotocol/sdk `Client` as a Gemini tool -- it does not take a server URL directly.
// So this function (1) connects an MCP client to Coveo's hosted server over Streamable HTTP,
// authenticated with a bearer token, then (2) hands that connected client to Gemini, which decides
// for itself which of the server's exposed tools to call while answering.
//
// PACKAGE NOTE: @google/genai peer-depends on the OLDER @modelcontextprotocol/sdk (`^1.25.2`), not
// the newer, more modular @modelcontextprotocol/client package that MCP's own current docs site
// leads with -- confirmed by reading @google/genai's actual published package.json before picking
// either. Passing a Client from the newer package here would not satisfy mcpToTool's type (and
// plausibly not its runtime expectations either); this matters more than it looks like it should.
//
// WHY GEMINI CAN NEVER ANSWER VIA RGA (open backlog item 3's negative-polarity gate): not enforced
// here in code, because it doesn't need to be. The Admin-side prerequisite for this phase (Passage
// Retrieval enabled on the `pokedex-mcp` MCP config) deliberately does NOT add the Answer tool to
// that config -- so `mcpToTool` has nothing to expose that could route into RGA's polarity gate in
// the first place. A tool this server never lists is a tool Gemini can never call.
//
// STILL OPEN, not guessed at: (1) whether the MCP server's own `search`/`fetch`/passage tools
// accept a clientId parameter this function could use to attribute grounding reads to the active
// persona (the plan's "capture: false, persona-attributed" requirement) -- the MCP tool surface's
// input schema wasn't inspected for this; (2) whether those reads are captured in Usage Analytics
// at all under this key, and if so whether that's desired. Both remain for a later pass.
//
// GROUNDING EXTRACTION -- inspected live against real responses before writing this, not assumed:
// @google/genai's GenerateContentResponse carries `automaticFunctionCallingHistory`, the full
// transcript of every tool call the SDK's automatic function-calling loop made (functionCall /
// functionResponse part pairs) to produce this answer. Each MCP `search` hit against the commerce
// catalog came back with a `pokemontcg://<id>` URL, where `<id>` is exactly the same
// `ec_product_id` this app already uses everywhere (cardPath, ProductCard, etc.) -- confirmed
// against a real "Find me a Charizard card" call, whose catalog hits included `base1-4`. Pokedex
// hits carry a real `https://pokemondb.net/pokedex/<slug>` URL and a clean species name in `title`.
// Extracting from these RAW TOOL RESULTS, not from the model's prose, is what makes the tiles G2
// renders "grounded by construction" per the plan -- an id that didn't come from an actual Coveo
// hit cannot appear here, and the client further only renders a tile once that id resolves through
// the app's own normal product/species fetch, so even a malformed extraction degrades to nothing
// rather than a wrong tile.

const COVEO_MCP_URL = 'https://mcp.cloud.coveo.com/mcp';

// PINNED, not the `gemini-flash-lite-latest` floating alias this used until 2026-08-19.
//
// The alias is convenient and wrong for a surface that gets demonstrated: Google can move what it
// points at with no notice and no change on our side, and a silent model swap can shift tone,
// tool-calling behaviour or latency on this build's signature feature. That is a bad failure to
// discover live.
//
// This id is not a guess. `gemini-flash-lite-latest` was measured resolving to `gemini-3.5-flash-lite`
// (the 2026-08-19 quota error named it explicitly, see presentation/demo-relevancy-testbook.md
// §7.2), and the id was then confirmed directly callable in its own right against ListModels rather
// than only reachable through the alias -- pinning to an alias-only name would have broken every
// call. So this pins the model that has actually been serving, changing nothing about behaviour
// today and only removing the ability for it to change by itself tomorrow.
const MODEL = 'gemini-3.5-flash-lite';

interface ConsultRequestBody {
  query: string;
  /** Tone context only -- P1/G2's persona-awareness. Never expands what gets retrieved, only how
   *  the answer is worded (consultant-everywhere-plan.md's own rule for this). Optional: the
   *  Guest persona has none. */
  personaContext?: { name: string; subtitle: string };
  /** Phase G3 -- prior turns of THIS conversation, oldest first, `query` being the newest one not
   *  yet included. Omitted or empty means "turn 1" (matches card-consultant-plan.md Phase 5's own
   *  "q stays turn-1's text" rule -- the client, not this function, decides what counts as a new
   *  topic vs. a continuation). Client sends plain text per turn; converted to Gemini's `Content`
   *  shape below rather than asking the client to know that shape. */
  history?: { role: 'user' | 'model'; text: string }[];
}

const PRODUCT_URL_RE = /pokemontcg:\/\/([a-zA-Z0-9._-]+)/g;
const POKEDEX_URL_RE = /pokemondb\.net\/pokedex\/([a-z0-9-]+)/i;

interface ToolResult {
  url?: string;
  title?: string;
}

/** Walks the automatic-function-calling transcript's tool RESULTS (never the model's own text) and
 *  pulls out every real product id and species name the tools actually returned. See this file's
 *  top comment for how the URL shapes were established. Defensive on purpose: a tool result that
 *  doesn't parse as the expected `{results: [...]}` JSON shape (retrieve_passages, or a future tool,
 *  might not) still gets scanned for bare `pokemontcg://` occurrences via regex, so a shape this
 *  wasn't written against degrades to "extract what's recognizable" rather than "extract nothing". */
function extractGroundedIds(history: unknown): { productIds: string[]; speciesNames: string[] } {
  const productIds = new Set<string>();
  const speciesNames = new Set<string>();

  const entries = Array.isArray(history) ? history : [];
  for (const entry of entries) {
    const parts = (entry as { parts?: unknown[] })?.parts ?? [];
    for (const part of parts) {
      const functionResponse = (part as { functionResponse?: { response?: { content?: unknown[] } } })
        .functionResponse;
      const content = functionResponse?.response?.content ?? [];
      for (const block of content) {
        const text = (block as { text?: string })?.text;
        if (typeof text !== 'string') continue;

        let results: ToolResult[] | null = null;
        try {
          const parsed = JSON.parse(text) as { results?: ToolResult[] };
          if (Array.isArray(parsed?.results)) results = parsed.results;
        } catch {
          results = null;
        }

        if (results) {
          for (const r of results) {
            const productMatch = r.url ? [...r.url.matchAll(PRODUCT_URL_RE)] : [];
            for (const m of productMatch) productIds.add(m[1]);
            if (r.url && POKEDEX_URL_RE.test(r.url) && r.title) speciesNames.add(r.title);
          }
        } else {
          // Unstructured fallback -- product ids only, since species names need the title/url
          // pairing structured JSON gives and a bare regex over prose can't safely recover that.
          for (const m of text.matchAll(PRODUCT_URL_RE)) productIds.add(m[1]);
        }
      }
    }
  }

  return { productIds: [...productIds], speciesNames: [...speciesNames] };
}

function systemInstructionFor(personaContext?: ConsultRequestBody['personaContext']): string {
  const base =
    "You are the Card Consultant for RabidMoose, a Pokémon card marketplace. Answer using the " +
    'Coveo tools available to you -- ground every factual claim in what they actually return, ' +
    "never invent a card, price, or species fact. Keep the answer to a few sentences.";
  if (!personaContext) return base;
  // Tone-only, per the plan's own constraint -- restated here so a future edit doesn't quietly
  // turn this into a retrieval-scoping instruction.
  return (
    `${base} The shopper is ${personaContext.name}, a ${personaContext.subtitle.toLowerCase()} -- ` +
    'let that shape your tone and phrasing only, never which facts you ground the answer in.'
  );
}

// A NAMED export per HTTP method, not `export default` -- caught live via Vercel's own production
// runtime warning, not assumed. `export default function handler(request: Request): Promise<Response>`
// silently fails on this runtime: it's read as the LEGACY `(req, res) => void` Node signature, so
// the Response this function returns is discarded and nothing ever calls `res.end()` -- the request
// just hangs until the caller's own timeout gives up, no error surfaced anywhere server-side except
// a WARN log ("default export returned a Response... You likely meant the Web fetch-style API").
// `POST` is the correct, current, Web-standard shape their own docs point at as the fix.
export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }

  const coveoKey = process.env.COVEO_CONSULTANT_API_KEY;
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!coveoKey || !geminiKey) {
    // Distinct from a runtime failure -- this is almost always "the env vars haven't been pushed
    // to this environment yet" (see the plan's G1 blockers), so say that plainly rather than
    // surfacing an opaque downstream auth error.
    return Response.json(
      {
        error: 'Server misconfigured',
        detail: `Missing env var(s): ${[!coveoKey && 'COVEO_CONSULTANT_API_KEY', !geminiKey && 'GOOGLE_GEMINI_API_KEY'].filter(Boolean).join(', ')}`,
      },
      { status: 500 }
    );
  }

  let body: ConsultRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const query = body.query?.trim();
  if (!query) {
    return Response.json({ error: '"query" is required' }, { status: 400 });
  }

  const mcpClient = new Client({ name: 'rabidmoose-consultant', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(COVEO_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${coveoKey}` } },
  });

  try {
    await mcpClient.connect(transport);

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const priorTurns: Content[] = (body.history ?? []).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }));
    const chat = ai.chats.create({
      model: MODEL,
      config: {
        systemInstruction: systemInstructionFor(body.personaContext),
        tools: [mcpToTool(mcpClient)],
      },
      history: priorTurns,
    });
    const response = await chat.sendMessage({ message: query });

    const { productIds, speciesNames } = extractGroundedIds(response.automaticFunctionCallingHistory);

    return Response.json({
      text: response.text ?? '',
      model: MODEL,
      productIds,
      speciesNames,
      // Surfaced for the verification pass -- confirms tool calls actually happened rather than
      // Gemini answering from parametric knowledge alone, which would be the honesty-rule failure
      // this whole feature exists to avoid.
      usage: response.usageMetadata ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/consultant] round trip failed:', err);
    const detail = err instanceof Error ? err.message : String(err);
    // Classified so the client can say something true rather than something generic. Quota
    // exhaustion is the failure this surface actually has -- the key sat on the free tier's
    // 500/day and hit it on 2026-08-19 (demo-relevancy-testbook.md §7.2) -- and it is the one
    // case where "try again in a moment" would be a lie, because a DAILY cap does not clear in a
    // moment. Matched on the upstream's own strings; anything unrecognised stays 'error', so a new
    // failure mode degrades to the cautious message rather than being mislabelled as quota.
    const reason = /RESOURCE_EXHAUSTED|429|quota/i.test(detail) ? 'quota' : 'error';
    return Response.json({ error: 'Consultant request failed', reason, detail }, { status: 502 });
  } finally {
    // No connection reuse across invocations yet -- deliberately the simplest correct thing for a
    // "does this work at all" skeleton. Caching a warm MCP session across serverless invocations is
    // a real optimization but not one to add before the bare round trip is proven; premature reuse
    // risks masking a real bug behind a stale-session symptom during exactly the verification pass
    // this file exists to support.
    await mcpClient.close().catch(() => {});
  }
}
