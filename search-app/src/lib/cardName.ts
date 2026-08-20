// Card names from the catalog scraper are `${card.name} — ${setName} #${card.localId}`
// (catalog-scraper/src/catalogItem.ts) -- the set/number are redundant once the PDP has its own
// meta line for that data, so the H1 only needs the printing-agnostic product name. Exact-suffix
// match, not a generic regex: a near-miss (different set string, missing number) means the tokens
// don't actually describe this ec_name, so falling back to the full raw name is the safe read.
export function cleanCardName(ecName: string, setName: string | undefined, cardNumber: string | undefined): string {
  if (!setName || !cardNumber) return ecName;
  const suffix = ` — ${setName} #${cardNumber}`;
  return ecName.endsWith(suffix) ? ecName.slice(0, -suffix.length) : ecName;
}
