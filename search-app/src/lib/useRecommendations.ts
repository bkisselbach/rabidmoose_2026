import { useEffect, useMemo } from 'react';
import { buildRecommendations } from '@coveo/headless/commerce';
import { commerceEngine } from '@/commerceEngine';
import { useOptionalCoveoState } from '@/lib/useCoveoState';

// Shared build/subscribe/refresh wiring for a Merchandising Hub recommendation slot -- the same
// lifecycle every rec surface (PDP rails, cart cross-sell, no-results fallback) needs. Returns no
// controller when slotId is unset so callers can render their non-Coveo fallback instead; a new
// controller (and its one .refresh()) is built whenever the slot or seed product changes.
export function useRecommendationsSlot(slotId: string | undefined, productId?: string) {
  const controller = useMemo(
    () => (slotId ? buildRecommendations(commerceEngine, { options: { slotId, productId } }) : undefined),
    [slotId, productId]
  );
  const state = useOptionalCoveoState(controller);

  useEffect(() => {
    controller?.refresh();
  }, [controller]);

  return { controller, state };
}
