import { useEffect, useState } from 'react';
import { buildEngineQuery, parseQuery, toCardType, type ParsedQuery } from '@/lib/queryIntent';
import { resolveCounters, type CounterResolution } from '@/lib/typeMatchups';
import { resolveRarityTerms, type RarityResolution } from '@/lib/cardRarities';
import { loadPriceTiers, resolvePriceIntent, type PriceRange, type PriceTier } from '@/lib/priceIntent';

// Ties the synchronous parse (queryIntent.ts) to the one asynchronous step it needs -- resolving
// "counter Flying" into the types that actually beat Flying, aggregated out of the Pokedex index
// (typeMatchups.ts) -- and hands the page a single settled object to render and act on.

export interface QueryUnderstanding {
  parsed: ParsedQuery;
  /** Populated only for `advisory` queries; one entry per type the shopper wants to beat. */
  resolutions: CounterResolution[];
  /** Canonical Pokedex type names the results should actually be filtered to. For `advisory` these
   *  are the counters; for `filter` they are the types the shopper named outright. */
  pokedexTypes: string[];
  /** The same set expressed in the TCG's collapsed energy-type vocabulary, for the @cardtypes
   *  facet on the commerce engine. Deduped, since several game types map to one energy type. */
  cardTypes: string[];
  /** Rarity words as the shopper said them ("rare", "holo") -- every one that parsed, matched or
   *  not. Stable and synchronous, which is why the page keys its apply-once effect off it. */
  rarityTerms: string[];
  /** The subset of `rarityTerms` that actually resolved to at least one live facet value -- the
   *  only ones the UI may honestly draw as applied filters. A word the catalog has no tier for
   *  ("shiny", "promo"), or a failed vocabulary fetch, leaves this shorter than `rarityTerms`. */
  matchedRarityTerms: string[];
  /** Those words resolved to concrete @cardrarity facet values from the live catalog vocabulary. */
  cardRarities: string[];
  /** The concrete price range the sentence asked for, resolved against the live catalog tiers.
   *  Null when no budget was stated, or when one was but the catalog couldn't back it up. */
  priceRange: PriceRange | null;
  /** Where the live catalog's top price tier ends -- the banner needs it to know whether a range is
   *  the open-ended "$100+" one (whose end is that sentinel, not a real price) or a real interval.
   *  Undefined when the sentence named both bounds, since a bounded range is never open-ended. */
  topTierEnd: number | undefined;
  /** Query text to send to the engines once the constraints above are carried by facets instead. */
  engineQuery: string;
  /** True while the index aggregation for an advisory query is still in flight. */
  isResolving: boolean;
  /** True when this query should drive facets/rewrite at all -- i.e. anything but a plain lookup
   *  that parsed to nothing interesting. Pages use this to keep the existing code path untouched
   *  for ordinary keyword searches. */
  isActive: boolean;
}

/** Types are carried as facet selections rather than query terms on purpose: several types in one
 *  query have to OR together ("counter Flying" resolves to Rock, Ice AND Electric cards would be
 *  empty), and multi-select within one Coveo facet is exactly an OR. Putting them in the query text
 *  instead would AND them and return nothing -- which is the same failure mode this whole feature
 *  exists to fix, so it is worth stating in code. */
export function useQueryUnderstanding(query: string): QueryUnderstanding {
  const parsed = parseQuery(query);
  const [resolutions, setResolutions] = useState<CounterResolution[]>([]);
  const [rarityResolutions, setRarityResolutions] = useState<RarityResolution[]>([]);
  // Which query each lookup's result belongs to, rather than a plain in-flight boolean. A boolean
  // reads `false` on the very first render -- before the effect that would set it true has run --
  // so a caller checking "still resolving?" saw "no" and committed a filter state built from empty
  // results. That is exactly how "show me rare fire cards" ended up applying its type but none of
  // its rarities. Comparing keys can't have that gap: until the resolved key matches the current
  // one, the answer is by definition not ready.
  const [resolvedCounterKey, setResolvedCounterKey] = useState('');
  const [resolvedRarityKey, setResolvedRarityKey] = useState('');
  const [priceRange, setPriceRange] = useState<PriceRange | null>(null);
  const [topTierEnd, setTopTierEnd] = useState<number | undefined>(undefined);
  const [resolvedPriceKey, setResolvedPriceKey] = useState('');

  // Serialized so the effect re-runs on a genuinely different target set, not on every re-render
  // (parseQuery returns a fresh object each time).
  const targetKey = parsed.counterTargets.map((t) => t.pokedex).join(',');

  useEffect(() => {
    if (!targetKey) {
      setResolutions([]);
      setResolvedCounterKey('');
      return;
    }
    let cancelled = false;
    Promise.all(targetKey.split(',').map(resolveCounters)).then((results) => {
      if (cancelled) return;
      setResolutions(results);
      setResolvedCounterKey(targetKey);
    });
    return () => {
      cancelled = true;
    };
  }, [targetKey]);

  // Same shape as the counter resolution above: a loose word the shopper typed becomes the exact
  // set of field values the index actually holds, looked up once and cached.
  const rarityKey = parsed.rarityTerms.join(',');
  useEffect(() => {
    if (!rarityKey) {
      setRarityResolutions([]);
      setResolvedRarityKey('');
      return;
    }
    let cancelled = false;
    resolveRarityTerms(rarityKey.split(',')).then((results) => {
      if (cancelled) return;
      setRarityResolutions(results);
      setResolvedRarityKey(rarityKey);
    });
    return () => {
      cancelled = true;
    };
  }, [rarityKey]);

  // Third resolution, same contract as the two above. Serialized rather than object-identity keyed
  // because parseQuery hands back a fresh priceIntent object every render; without this the effect
  // would re-fire (and re-fetch) on every keystroke-driven re-render.
  const priceKey = parsed.priceIntent
    ? parsed.priceIntent.kind === 'explicit'
      ? `e:${parsed.priceIntent.start}:${parsed.priceIntent.end}`
      : `t:${parsed.priceIntent.term}`
    : '';
  useEffect(() => {
    if (!priceKey) {
      setPriceRange(null);
      setResolvedPriceKey('');
      return;
    }
    let cancelled = false;
    // The tiers are only read when the sentence actually left something for them to settle: an
    // open-ended ("over $100") or word-based ("premium") intent needs them to get its bound, and
    // only such a range can ever be labelled open-ended. A sentence that named BOTH bounds needs
    // neither -- and paying for the read anyway put a whole extra commerce round trip in front of
    // the first budget query, since `isResolving` below gates the derived facet write on it.
    const needsTiers = !(parsed.priceIntent?.kind === 'explicit' && parsed.priceIntent.end !== null);
    Promise.all([
      resolvePriceIntent(parsed.priceIntent),
      needsTiers ? loadPriceTiers() : Promise.resolve<PriceTier[]>([]),
    ]).then(([range, tiers]) => {
      if (cancelled) return;
      setPriceRange(range);
      setTopTierEnd(tiers.at(-1)?.end);
      setResolvedPriceKey(priceKey);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialized intent above
  }, [priceKey]);

  const pokedexTypes =
    parsed.intent === 'advisory'
      ? // Union across every named target, preserving the per-target ordering (most broadly
        // effective first) that the aggregation already applied.
        [...new Set(resolutions.flatMap((r) => r.counters))]
      : parsed.types.map((t) => t.pokedex);

  // Re-derive the TCG vocabulary from the resolved Pokedex names rather than from parsed.types --
  // for an advisory query the resolved types were never in the original sentence at all.
  const cardTypes = [...new Set(pokedexTypes.map(toCardType).filter((t): t is string => !!t))];

  // Deduped across terms: "rare holo" resolves both words onto overlapping tiers, and the facet
  // must not be handed the same value twice.
  const cardRarities = [...new Set(rarityResolutions.flatMap((r) => r.values))];
  const matchedRarityTerms = rarityResolutions.filter((r) => r.values.length > 0).map((r) => r.term);

  const engineQuery = buildEngineQuery(parsed);

  // True until ALL THREE index lookups have answered for this exact query. Price joins the gate for
  // the same reason the other two are in it: the page applies one filter state per query, so a
  // range that lands a beat after the types would be a second, different result set for one query.
  const isResolving =
    resolvedCounterKey !== targetKey || resolvedRarityKey !== rarityKey || resolvedPriceKey !== priceKey;

  const isActive =
    parsed.intent !== 'lookup' &&
    (pokedexTypes.length > 0 || parsed.rarityTerms.length > 0 || !!parsed.priceIntent || isResolving);

  return {
    parsed,
    resolutions,
    pokedexTypes,
    cardTypes,
    rarityTerms: parsed.rarityTerms,
    matchedRarityTerms,
    cardRarities,
    priceRange,
    topTierEnd,
    engineQuery,
    // Both lookups have to settle before the page commits a filter state, or it would apply the
    // types now and the rarities a beat later -- two different result sets for one query.
    isResolving,
    isActive,
  };
}
