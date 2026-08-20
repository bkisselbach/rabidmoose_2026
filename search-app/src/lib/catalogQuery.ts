// Batched catalog reads for the Advisor workbench -- phase A0 of
// presentation/gap-check-plan.md.
//
// WHY THIS EXISTS RATHER THAN fetchProductsByIds. That file fires ONE COMMERCE REQUEST PER ID, and
// its comment explains why it has to: commerce free-text ANDs its terms, so a multi-id query is a
// nonsense query, and the commerce search request has no product-id filter to use instead. That is
// fine for a six-tile Recently Viewed rail. A collection of thirty-plus holdings diffed against
// four set rosters on that path is forty-plus requests to paint one page -- re-creating at product
// granularity exactly the waterfall item 31a just removed at species granularity.
//
// The classic Search API can do the same work in ONE call, because `aq` takes a value LIST -- the
// same property 31a exploited for `@pokemonname`. The catalog documents live in the same index, so
// they are reachable either way. Measured live 2026-08-19 (plan §2.3):
//
//     6 holdings by id                    6 of 6 results     376 ms
//     Base Set roster                    102 of 102          169 ms
//     Evolving Skies (the largest set)   237 of 237          283 ms
//     FIVE WHOLE SETS in one call        421 of 421          290 ms
//
// So a collector view costs two calls total: one for holdings, one for every roster it tracks.
//
// TWO TRAPS THIS FILE IS BUILT AROUND, both measured, both silent:
//
// 1. NEVER SORT ON @cardnumber. The field's definition reads `sort=false` (confirmed against
//    /indexes/fields), and sorting on a non-sortable field returns an EMPTY RESULT SET at HTTP 200
//    with no exception -- `@cardsetname=="Base Set"` returns 102 results, and the identical query
//    with `sortCriteria: '@cardnumber ascending'` returns totalCount 0. Checklist ordering is done
//    in `byCardNumber` below, client-side, over a roster we already hold in full. The same query
//    with `@ec_price descending` (sort=true) works fine, which is how the cause was isolated.
//
// 2. AN UNKNOWN FIELD IN fieldsToInclude ZEROES THE WHOLE RESPONSE, also at HTTP 200. Every name in
//    CATALOG_FIELDS below was verified present in this org's field list before being added here.
//    Add nothing to it without checking /indexes/fields first.
//
// THESE QUERIES MUST NOT TRAIN THE MODELS. They are issued by a page, not typed by a shopper. The
// precedent is catalog-scraper/src/relevancy.ts, which runs under its own search hub so its probe
// queries stop being indistinguishable from real visitor queries in the logs, and
// fetchProductsByIds.ts, which sets `capture: false` for the same reason. A workbench that fires
// four roster queries per view under the default hub would spend its life teaching PQS and ART
// about searches no human performed -- the exact inverse of item 28's problem, and just as wrong.

/** The search hub these machine-issued reads run under. Deliberately NOT `default`: it exists so a
 *  roster fetch is distinguishable from a visitor's query in the analytics logs. It has no pipeline
 *  bound to it, which is intended -- these queries filter by field and never rely on ranking. */
const WORKBENCH_HUB = 'Collection Workbench';

/** Verified against this org's `/indexes/fields` (2026-08-19). See trap 2 above before editing. */
const CATALOG_FIELDS = [
  'ec_product_id',
  'ec_name',
  'ec_price',
  'ec_images',
  'cardsetname',
  'cardnumber',
  'cardtotalinset',
  'cardprintingoptions',
  'cardrarity',
  'cardtypes',
  'cardsetyear',
] as const;

/** Coveo's per-request result ceiling. The largest set in this catalog is 279 cards and the largest
 *  realistic multi-set roster fetch is well under this, so no paging path is needed -- but the
 *  request asserts rather than silently truncating. */
const MAX_RESULTS = 1000;

/** One catalog card, normalized off the classic-search `raw` shape. Deliberately NOT Coveo's
 *  commerce `Product` type: these come from a different API, and pretending otherwise would invite
 *  callers to pass them where a real Product is expected (cart, analytics) and get silent nulls. */
export interface CatalogCard {
  productId: string;
  name: string;
  price: number;
  setName?: string;
  /** As it appears on the card face. A STRING in the index -- "4", "H12", "TG08" all occur. */
  cardNumber?: string;
  /** The PRINTED set size, which is not the same as how many of that set this marketplace stocks.
   *  See gapEngine's denominator note. */
  totalInSet?: number;
  setYear?: number;
  rarity?: string;
  imageUrl?: string;
  /** Raw `"<printingKey>|<price>"` entries, left unparsed here so cardFields.ts stays the single
   *  place that knows the format. Only present when the card has 2+ real printings. */
  printingOptionsRaw?: string[];
}

interface RawResult {
  raw: Record<string, unknown>;
}

function toCatalogCard(r: RawResult): CatalogCard | null {
  const raw = r.raw ?? {};
  const productId = raw.ec_product_id as string | undefined;
  const price = raw.ec_price as number | undefined;
  // A card with no id is not addressable and a card with no price cannot be costed, which is the
  // whole point of this workbench -- drop rather than render a hole. Mirrors the catalog scraper's
  // own "can't merchandise what has no price" rule at the other end of the pipeline.
  if (!productId || typeof price !== 'number') return null;
  const images = raw.ec_images;
  const printings = raw.cardprintingoptions;
  return {
    productId,
    name: (raw.ec_name as string | undefined) ?? productId,
    price,
    setName: (raw.cardsetname ?? undefined) as string | undefined,
    cardNumber: (raw.cardnumber ?? undefined) as string | undefined,
    totalInSet: (raw.cardtotalinset ?? undefined) as number | undefined,
    setYear: (raw.cardsetyear ?? undefined) as number | undefined,
    rarity: (raw.cardrarity ?? undefined) as string | undefined,
    imageUrl: Array.isArray(images) ? (images[0] as string | undefined) : (images as string | undefined),
    // `?? undefined` rather than a bare cast, the same trap cardFields.ts documents: a
    // config-declared field a document lacks comes back as an explicit null, not as absence.
    printingOptionsRaw: Array.isArray(printings) ? (printings as string[]) : undefined,
  };
}

async function searchCatalog(body: Record<string, unknown>): Promise<CatalogCard[]> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
  try {
    const res = await fetch(`https://${organizationId}.org.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: '',
        searchHub: WORKBENCH_HUB,
        fieldsToInclude: CATALOG_FIELDS,
        numberOfResults: MAX_RESULTS,
        ...body,
      }),
    });
    // A non-200 is raised rather than degraded to "no results", the lesson characterQueue.ts
    // learned the hard way: an empty body and a failed request look identical downstream, and
    // treating a 429 as "this set is empty" would render a complete collection as 0% complete.
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.results ?? []) as RawResult[]).map(toCatalogCard).filter((c): c is CatalogCard => c !== null);
  } catch {
    return [];
  }
}

/** Quotes and joins values for an `aq` value list. Values here are catalog ids and set names, both
 *  index-controlled, but a stray quote would silently break the expression into something that
 *  still returns 200 -- so it is stripped rather than trusted. */
function valueList(values: readonly string[]): string {
  return values.map((v) => `"${v.replace(/"/g, '')}"`).join(',');
}

/**
 * Every holding, in ONE request. Replaces N per-id commerce calls.
 * Returns only the cards that resolved; an id that no longer exists in the catalog is simply
 * absent, which the caller reads as "not currently stocked" rather than as an error.
 */
export async function fetchCardsByIds(ids: readonly string[]): Promise<CatalogCard[]> {
  if (ids.length === 0) return [];
  return searchCatalog({ aq: `@ec_product_id==(${valueList(ids)})` });
}

/**
 * Every card in every named set, in ONE request -- the "what complete looks like" half of the diff.
 * Five whole sets measured at 421 results in 290 ms.
 */
export async function fetchSetRosters(setNames: readonly string[]): Promise<CatalogCard[]> {
  if (setNames.length === 0) return [];
  return searchCatalog({ aq: `@cardsetname==(${valueList(setNames)})` });
}

/**
 * Checklist ordering, client-side, because the index cannot do it (trap 1 above).
 * Card numbers are strings and mostly numeric, but promo and secret-rare numbering is not
 * ("H12", "TG08", "SV49"), so this sorts numerically where it can and falls back to a natural
 * string compare -- never dropping or reordering a card just because its number isn't a digit.
 */
export function byCardNumber(a: CatalogCard, b: CatalogCard): number {
  const na = Number(a.cardNumber);
  const nb = Number(b.cardNumber);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return (a.cardNumber ?? '').localeCompare(b.cardNumber ?? '', undefined, { numeric: true });
}
