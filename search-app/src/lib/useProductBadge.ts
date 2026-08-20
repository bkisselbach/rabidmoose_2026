import { useEffect, useState } from 'react';
import type { Badge } from '@coveo/headless/commerce';
import { badgesConfigured, subscribeToBadge } from './badgeQueue';

// Reads the shared badge taxonomy (Merchandising Hub > Product Enrichment; every placement is
// scoped to location Product Detail, the only location the live Badges API accepts) for a single
// product. Backed by badgeQueue's serialized fetcher/cache -- safe to call from many components
// mounted at once (a PLP grid, a recommendation rail), not just a single spotlighted product.
//
// Returns an ARRAY as of 2026-08-17. It used to return one badge, because badgeQueue kept only
// `badges[0]` -- which quietly made the demo's "stacked Vintage + High Value" beat impossible to
// show. Callers map over the result; an empty array is the no-badge case, so the common render is
// `badges.length > 0 && ...` rather than a truthiness check on a possibly-undefined object.
export function useProductBadge(productId: string | undefined, enabled = true): Badge[] {
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    // `enabled` is item 31d's gate: a tile that has never been on screen does not ask. Defaulting
    // to true keeps every existing caller (the PDP, which is always "in view" by definition)
    // behaving exactly as before.
    if (!productId || !enabled || !badgesConfigured()) {
      setBadges([]);
      return;
    }
    setBadges([]);
    return subscribeToBadge(productId, setBadges);
  }, [productId, enabled]);

  return badges;
}
