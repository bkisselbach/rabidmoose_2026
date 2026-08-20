import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircleQuestion, ArrowRight } from 'lucide-react';
import { CoveoChip } from '@/components/CoveoChip';
import { useBrief } from '@/lib/consultationBrief';
import { formatPriceRange } from '@/lib/priceIntent';
import { useDeckCheck } from '@/lib/deckCoverage';
import { resolveCounters } from '@/lib/typeMatchups';
import { cart } from '@/cart';
import { getActivePersona } from '@/lib/visitorId';
import type { PokemonRecord } from '@/lib/pokedexRecord';

// Vintage/current-meta framing reuses the exact era split seedPersonalization.ts already applied
// when seeding Dana ("WOTC-era sets") vs Marcus ("current-meta sets"). Deliberately NOT a real
// trail/set comparison (would mean fetching every recently-viewed product) -- this reads the
// persona's own disclosed identity instead, which is honest and costs nothing.
const VINTAGE_CUTOFF_YEAR = 2003;
const MODERN_CUTOFF_YEAR = 2020;

interface Props {
  species: PokemonRecord | null | undefined;
  price: number | undefined;
  promoPrice: number | undefined;
  rarity: string | undefined;
  setYear: number | undefined;
}

// The PDP judging this specific card against the shopper's active consultation. Self-hides with no
// brief (nothing to judge against) and no species match (a Trainer/Energy card has no weaknesses
// to compare).
export function ConsultantFitStrip({ species, price, promoPrice, rarity, setYear }: Props) {
  const brief = useBrief();
  const navigate = useNavigate();
  const persona = getActivePersona();

  // Does this card's species type counter the shopper's cart's biggest shared weakness? Same
  // aggregation typeMatchups.ts runs for the /search advisor and DeckCoverage's counter link.
  const { topWeaknesses } = useDeckCheck(cart.state.items);
  const [countersDeckGap, setCountersDeckGap] = useState<string | null>(null);
  useEffect(() => {
    if (!species || topWeaknesses.length === 0) {
      setCountersDeckGap(null);
      return;
    }
    let cancelled = false;
    Promise.all(topWeaknesses.map(resolveCounters)).then((resolutions) => {
      if (cancelled) return;
      const match = resolutions.find((r) => species.typeList.some((t) => r.counters.includes(t)));
      setCountersDeckGap(match ? match.target : null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialized weakness list
  }, [species, topWeaknesses.join('|')]);

  if (!species) return null;

  const effectivePrice = promoPrice ?? price;
  const clauses: string[] = [];
  const receipts: string[] = [];

  if (brief?.goal?.counterTypes.length) {
    const matched = species.typeList.filter((t) => brief.goal!.counterTypes.includes(t));
    if (matched.length > 0) {
      clauses.push(`Fits your plan to beat ${brief.goal.targets.join(', ')} — ${species.characterName} is ${matched.join('/')}.`);
      receipts.push(`Counter-type match: your consultation's resolved counters (${brief.goal.counterTypes.join(', ')}) vs this card's species type.`);
    }
  }
  if (brief?.budget && effectivePrice !== undefined) {
    const inBudget = effectivePrice <= brief.budget.end && effectivePrice >= brief.budget.start;
    clauses.push(
      inBudget
        ? `Within your ${formatPriceRange(brief.budget)} budget.`
        : `Above your ${formatPriceRange(brief.budget)} budget by ${formatPriceRange({ start: 0, end: effectivePrice - brief.budget.end, endInclusive: true })}.`
    );
  }
  if (brief?.rarities.length && rarity && brief.rarities.some((r) => r.toLowerCase() === rarity.toLowerCase())) {
    clauses.push(`Matches the ${rarity} rarity you asked for.`);
  }
  if (countersDeckGap) {
    clauses.push(`Covers your deck's gap to ${countersDeckGap} — none of your cart's current cards do.`);
    receipts.push(`Deck synergy: aggregated from your cart's ${topWeaknesses.length} shared weaknesses, same index read as the cart's own Deck check.`);
  }
  if (persona.key !== 'guest' && setYear !== undefined) {
    if (persona.key === 'dana' && setYear <= VINTAGE_CUTOFF_YEAR) {
      clauses.push(`A vintage print — right in line with your collecting focus, ${persona.name.split(' ')[0]}.`);
    } else if (persona.key === 'marcus' && setYear >= MODERN_CUTOFF_YEAR) {
      clauses.push(`Current-meta era — matches what you've been building around, ${persona.name.split(' ')[0]}.`);
    }
  }

  if (clauses.length === 0) return null;

  return (
    <div className="rounded-md border border-coveo/25 bg-coveo/5 p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow flex items-center gap-1.5 text-coveo">
          <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Consultant&apos;s read
        </span>
        <CoveoChip
          capability={[
            { capability: 'query-understanding', detailSuffix: 'Compares this card against your active consultation (Card Advisor).' },
            ...(countersDeckGap ? [{ capability: 'index-matchup' as const }] : []),
          ]}
        />
      </div>
      <ul className="space-y-1 text-sm text-foreground">
        {clauses.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {receipts.length > 0 && (
        <p className="mt-1.5 text-2xs leading-relaxed text-muted-foreground">{receipts.join(' ')}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(`/search?q=${encodeURIComponent(`Beat ${species.typeList.join(' and ')} types`)}`)}
          className="pressable inline-flex items-center gap-1 text-xs font-semibold text-coveo hover:underline"
        >
          Counter this card <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
        <Link to="/search" className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline">
          View full consultation
        </Link>
      </div>
    </div>
  );
}
