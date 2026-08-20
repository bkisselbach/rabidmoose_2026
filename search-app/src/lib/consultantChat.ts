// Thin client for the phase G1 serverless function (api/consultant.ts). Phase G2 (one-shot), G3
// (multi-turn -- the optional `history` param).

export interface ConsultResult {
  text: string;
  /** Real ec_product_id values, extracted server-side from the MCP tool calls' own raw results --
   *  never parsed out of Gemini's prose. See api/consultant.ts's own comment for how. */
  productIds: string[];
  /** Species names as the tool results named them -- may carry the crawled source's raw page-title
   *  boilerplate (citationLabel.ts already exists to clean that; the caller applies it, not this
   *  module, since citationLabel is presentation cleanup, not part of the fetch contract). */
  speciesNames: string[];
}

export interface PersonaContext {
  name: string;
  subtitle: string;
}

export interface ChatHistoryTurn {
  role: 'user' | 'model';
  text: string;
}

/** Why a turn produced no answer. `aborted` is not a failure -- the caller navigated or superseded
 *  the request -- and must never surface a message. */
export type ConsultFailure = 'quota' | 'error' | 'aborted';

/** Returns null on any failure -- misconfigured env, network error, non-200 -- so the caller can
 *  self-hide exactly like every other graceful-degradation surface in this app (ContentGeneratedAnswer,
 *  AskPokedex). Never throws.
 *
 *  `history` is every turn BEFORE this one, oldest first -- the caller's own `query` is the new
 *  message, not part of `history`. Omit (or pass []) for turn 1. */
export async function askConsultant(
  query: string,
  personaContext?: PersonaContext,
  signal?: AbortSignal,
  history?: ChatHistoryTurn[]
): Promise<ConsultResult | null> {
  return (await askConsultantDetailed(query, personaContext, signal, history)).result;
}

/** Same call, with the failure kind kept instead of flattened into `null`.
 *
 *  Added 2026-08-19. `askConsultant` above deliberately erased WHY a turn failed, which was right
 *  while every failure led to the same silent self-hide -- and became wrong once the Consultant
 *  needed a visible degraded state (see sendConsultantTurn). It is kept, unchanged, as the shape
 *  the read-only surfaces still want; this is the variant for the one caller that has to say
 *  something. */
export async function askConsultantDetailed(
  query: string,
  personaContext?: PersonaContext,
  signal?: AbortSignal,
  history?: ChatHistoryTurn[]
): Promise<{ result: ConsultResult | null; failure: ConsultFailure | null }> {
  try {
    const res = await fetch('/api/consultant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, personaContext, history }),
      signal,
    });
    if (!res.ok) {
      // The route classifies its own upstream failure (api/consultant.ts); trust that over
      // re-deriving it from a status code, which cannot tell quota from any other 502.
      const reason = await res
        .json()
        .then((d) => (d?.reason === 'quota' ? 'quota' : 'error'))
        .catch(() => 'error' as const);
      return { result: null, failure: reason };
    }
    const data = await res.json();
    if (typeof data?.text !== 'string') return { result: null, failure: 'error' };
    return {
      result: {
        text: data.text,
        productIds: Array.isArray(data.productIds) ? data.productIds : [],
        speciesNames: Array.isArray(data.speciesNames) ? data.speciesNames : [],
      },
      failure: null,
    };
  } catch (err) {
    // An abort is the caller's own doing, not an outage -- surfacing "unavailable" for it would
    // flash an error every time a visitor retypes.
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { result: null, failure: aborted ? 'aborted' : 'error' };
  }
}
