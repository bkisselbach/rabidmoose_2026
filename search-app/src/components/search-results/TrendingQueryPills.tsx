import { useEffect, useState } from 'react';
import { productRecommendations, ensureTrendingRecommendationsLoaded } from '@/homeControllers';
import { cardDisplayName, cardIdentityFromName } from '@/lib/cardFields';
import { CoveoChip } from '@/components/CoveoChip';

// Consultant panel's "Trending" row on a bare /search. Deliberately NOT labeled "Popular": the
// Predictive Query Suggestions model returns zero completions for every query on this org, so this
// app has no real signal for what's actually popular. What it DOES have is the same live
// Recommendations slot the home Trending rail already reads (productRecommendations,
// homeControllers.ts) -- so the pills are that slot's own products, labeled with that slot's own
// Merchandising Hub headline, never a claim the platform isn't making.
const MAX_PILLS = 6;

export function TrendingQueryPills({ onSelect }: { onSelect: (query: string) => void }) {
  const [state, setState] = useState(productRecommendations?.state);
  useEffect(() => {
    if (!productRecommendations) return;
    ensureTrendingRecommendationsLoaded();
    return productRecommendations.subscribe(() => setState(productRecommendations!.state));
  }, []);

  // No slot configured, or it hasn't produced anything for this visitor yet -- no fallback to a
  // hardcoded list under this label. A rec-fed row either shows real ML output or nothing at all.
  if (!productRecommendations || !state) return null;

  // Recommendations-slot products carry additionalFields: {} always, so every pill's identity
  // comes from the ec_name fallback parse, same as the home trending rail's cards.
  const seen = new Set<string>();
  const pills: string[] = [];
  for (const product of state.products) {
    const ecName = product.ec_name ?? undefined;
    const identity = cardIdentityFromName(ecName);
    const name = cardDisplayName(ecName, identity.setName, identity.cardNumber);
    if (!name) continue;
    // The live slot has repeated a card under two prints before (Wooloo #152 and #153) -- dedupe by
    // the name a shopper would actually read, not by product id.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pills.push(name);
    if (pills.length >= MAX_PILLS) break;
  }
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="eyebrow shrink-0">{state.headline || 'Trending'}:</span>
      {pills.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onSelect(name)}
          className="pressable card-hover rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          {name}
        </button>
      ))}
      <CoveoChip
        capability={[
          {
            capability: 'ml-recommendations',
            detailSuffix: `The Merchandising Hub "${state.headline || 'Trending'}" recommendation slot for this view — not query-specific, so every visitor browsing here today sees the same rail. Query Suggestions (PQS) is the capability that would normally answer "what's popular to search", and it currently returns no completions on this org — that is why this row reads its values here instead.`,
          },
        ]}
      />
    </div>
  );
}
