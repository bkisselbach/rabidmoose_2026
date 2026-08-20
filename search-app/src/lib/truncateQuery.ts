/** Shortens a query for echoing back in a "results for …" line. The Card Consultant's semantic
 *  finder accepts full sentences ("orange lizard whose tail flame shows how it feels and
 *  eventually learns to fly breathing fire"), and every surface that echoes `query` verbatim
 *  (ListingToolbar, the Vault summary, the News summary) sized itself for a normal few-word
 *  search term -- a long one wraps the row or blows past its container. Word-boundary truncation
 *  so the echo never cuts mid-word, with the full text still reachable via `title`. */
export function truncateQuery(query: string, maxLength = 60): string {
  if (query.length <= maxLength) return query;
  const cut = query.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
