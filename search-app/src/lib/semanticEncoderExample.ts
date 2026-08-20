// Client-side mirror of ONE live-verified semantic-encoder ranking outcome -- same "receipt"
// pattern as featuredRules.ts mirroring a query-pipeline rule. Giving this capability its first
// UI presence (phase G4 of consultant-everywhere-plan.md) needed a query that genuinely
// demonstrates it, not an assumed one: probed live 2026-08-17 with debug:true against
// /rest/search/v2 on pokedex-querypipeline, the embeddings model (pokedek-semantic-encoder) turns
// out to be associated for RERANKING only, not recall expansion -- a query sharing zero words
// with a document's indexed text still returns 0 matches here (the same "tiny blue mouse..."
// probe that finds Marill via Passage Retrieval, see vault/SemanticFinder.tsx's own comment,
// returns nothing on this pipeline). That's a different capability with a different mechanism.
//
// What the encoder demonstrably DOES do here: break ties among documents that already share
// keywords, by cosine similarity against the query's own embedding. Querying
// SEMANTIC_ENCODER_EXAMPLE_QUERY against `@source=="pokedex-push"` returns Charmander, Charizard,
// then Salandit -- and Salandit is not a weaker keyword match than the other two (it independently
// matches "lizard"/"flame"/"tail"/"fire", the same terms). What separates it is the "Ranking
// functions" component of Coveo's own per-document weight breakdown: a Query Ranking Expression
// scoring cosine similarity against the model's embeddings vector, floored at 0.8. Charmander
// scored 586, Charizard 282, Salandit 0 (under the floor) -- the exact order the results render
// in, and the exact reason two Fire/lizard-shaped Pokemon outrank a third that matches the same
// words.
export const SEMANTIC_ENCODER_EXAMPLE_QUERY =
  'orange lizard whose tail flame shows how it feels and eventually learns to fly breathing fire';

const normalize = (query: string) => query.trim().toLowerCase();

/** Whether the given query is (close enough to) the one verified semantic-reranking example --
 *  drives the semantic-encoder chip. Exact-ish match only, same discipline as
 *  featuredRules.ts's `isFeaturedResult`: this is a receipt for one proven case, not a claim that
 *  every description-style query gets the same treatment on this pipeline. */
export function isSemanticEncoderExample(query: string | undefined): boolean {
  return !!query && normalize(query) === normalize(SEMANTIC_ENCODER_EXAMPLE_QUERY);
}
