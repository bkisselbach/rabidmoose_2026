// Client-side mirror of the query-pipeline featured-result rules (Admin → Query Pipelines →
// Result ranking, created via the resultRankings API). The rules themselves are enforced
// server-side — the pin reorders the response before it reaches this app — but the Commerce API
// carries no per-product flag for them (verified 2026-08-13 by diffing a featured top product
// against its neighbors: queryPinned stays false — that field only reflects Merchandising Hub
// pin rules — and badgePlacements stays empty). So the "Featured" badge mirrors the rule table
// by hand, the same pattern as localSuggestions mirroring the pipeline thesaurus.
//
// Keep in sync with the pipeline: one entry per featured_result rule, `match` = the rule's
// "query contains" predicate, `productId` = the ec_product_id its target expression resolves to.
// `catalog-scraper` npm run check-featured-rules diffs this list against every live commerce
// pipeline's resultRankings and fails if either side has a rule the other doesn't — run it after
// touching Result Rankings in the Hub, or after editing this file.

const FEATURED_RULES: Array<{ match: string; productId: string }> = [
  // "Featured: Onix GX Hidden Fates" on the commerce search pipeline
  { match: 'onix', productId: 'sm115-36' },
];

const matchesQuery = (rule: { match: string }, query: string) =>
  // Word-boundary match to mirror Coveo's "contains" operator (whole term within the query),
  // not a raw substring test — "onixes" shouldn't badge.
  new RegExp(`\\b${rule.match}\\b`, 'i').test(query);

/** Whether this product is pinned by a featured-result rule for the given query. */
export function isFeaturedResult(query: string, productId: string | undefined): boolean {
  if (!productId || !query) return false;
  return FEATURED_RULES.some((rule) => rule.productId === productId && matchesQuery(rule, query));
}

/** Whether any featured-result rule fires for the given query (drives the provenance chip). */
export function hasFeaturedRule(query: string): boolean {
  return !!query && FEATURED_RULES.some((rule) => matchesQuery(rule, query));
}
