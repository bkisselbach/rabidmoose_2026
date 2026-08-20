// The visitor's own "My Deck" -- cards on hand, kept client-side. A deliberately SEPARATE list from
// the cart: a deck is what a shopper owns/is building, a cart is what they're about to buy.
// Conflating the two would make deck-builder-advisor-plan.md's Phase B ("buy this to fix your
// deck") a circular sentence -- the deck has to exist independent of checkout for "suggested
// pickups" to mean anything. (Open question resolved with the user 2026-08-18: separate list.)
//
// LOCAL BY DECISION, NOT BY GAP (unlike Recently Viewed's own local trail, which is a stand-in for
// a Coveo capability that doesn't work yet). There's no order-history data to seed this from --
// RecentlyPurchasedRow.tsx is explicit that this app tracks no completed orders -- and the user
// decided this doesn't need to be Coveo-backed at all: mock it locally from each persona's own
// taste profile (same open-questions resolution).
//
// PLAIN MODULE WITH SUBSCRIBE, same shape as compareStorage.ts: an "Add to deck" button on the PDP
// and the /advisor page are different components with no shared parent, and both need to react
// to the same list without a provider between them. useSyncExternalStore is the React 18 primitive
// for exactly this.
//
// PERSONA-SCOPED, same shape as recentlyViewedStorage.ts: each persona gets its own deck
// (`${BASE}:dana`, `${BASE}:marcus`), lazily seeded from Persona.seedProductIds the first time it's
// read so switching shows a real starting deck immediately. Guest keeps the unsuffixed base key and
// never seeds -- an empty deck is the honest starting point for an anonymous visitor, same rule
// visitorId.ts states for Recently Viewed. Because the active persona can change under this module
// (a reload, per switchPersona()'s own design), the in-memory `current` is always re-derived from
// the CURRENT persona's storage key rather than cached across a switch.

import { useSyncExternalStore } from 'react';
import { getActivePersona } from '@/lib/visitorId';

const BASE_STORAGE_KEY = 'rabidmoose-my-deck';

export interface DeckLine {
  productId: string;
  quantity: number;
  /** WHICH PRINTING this copy is (a raw TCGdex key -- "1st-edition-holofoil", "unlimited", ...).
   *
   *  Added for the collector lens (gap-check-plan.md §5a): a holdings list of `{productId,
   *  quantity}` cannot express "I have the unlimited, not the 1st edition", which is half of what a
   *  collector means by a gap. Optional, and absent on every organically-added card -- the PDP's
   *  Add-to-Deck button has no printing picker, and inventing one would claim the shopper told us
   *  something they didn't.
   *
   *  INFORMATIONAL, NOT A SKU. The index holds one document per card, so a printing is a checkbox
   *  and never a second cart line. Making it purchasable is backlog item 36, and deliberately not
   *  a dependency of this. */
  printing?: string;
  /** MOCK. What this copy notionally cost when acquired. Seeded only (personaHoldings.ts) and never
   *  written by any user action, because nothing in this app records a purchase. Any surface that
   *  compares it to the live market price must say on screen that the basis is mock and the market
   *  side is real -- see personaHoldings.ts's header. */
  costBasis?: number;
  /** MOCK, same rule as costBasis. `YYYY-MM`. */
  acquiredAt?: string;
}

/** The shape a persona's seeded collection is authored in -- identical to a DeckLine, named
 *  separately so personaHoldings.ts reads as data rather than as storage internals. */
export type SeedHolding = DeckLine;

function storageKeyForActivePersona(): string {
  const persona = getActivePersona();
  return persona.key === 'guest' ? BASE_STORAGE_KEY : `${BASE_STORAGE_KEY}:${persona.key}`;
}

function seedLines(): DeckLine[] {
  const persona = getActivePersona();
  // Prefer the richer authored collection (printing / costBasis / acquiredAt) when the persona has
  // one; fall back to the bare id list so a persona that only ever had `seedProductIds` -- and
  // Guest, which has neither -- keeps working unchanged.
  if (persona.seedHoldings && persona.seedHoldings.length > 0) {
    return persona.seedHoldings.map((h) => ({ ...h }));
  }
  return persona.seedProductIds.map((productId) => ({ productId, quantity: 1 }));
}


function load(): DeckLine[] {
  if (typeof window === 'undefined') return [];
  const persona = getActivePersona();
  const key = storageKeyForActivePersona();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null && (persona.seedHoldings?.length ?? persona.seedProductIds.length) > 0) {
      // First read for this persona: seed from their taste profile so "My Deck" shows real cards
      // immediately rather than an empty page waiting on manual adds. Persisted so a real add
      // afterwards merges onto it exactly like organic building from here on.
      const seeded = seedLines();
      window.localStorage.setItem(key, JSON.stringify(seeded));
      return seeded;
    }
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Corrupt or foreign values degrade to "empty deck" rather than breaking the page.
    return parsed.filter(
      (l): l is DeckLine =>
        !!l &&
        typeof l === 'object' &&
        typeof (l as DeckLine).productId === 'string' &&
        (l as DeckLine).productId.length > 0 &&
        typeof (l as DeckLine).quantity === 'number' &&
        (l as DeckLine).quantity > 0
    );
  } catch {
    return [];
  }
}

function persist(lines: DeckLine[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKeyForActivePersona(), JSON.stringify(lines));
  } catch {
    // Private browsing or a full quota: the deck still works in-memory for the rest of this tab's
    // life, it just won't survive a reload.
  }
}

let current: DeckLine[] = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getDeck(): DeckLine[] {
  return current;
}

export function subscribeDeck(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDeck(): DeckLine[] {
  return useSyncExternalStore(subscribeDeck, getDeck, () => []);
}

/** How many distinct printings of this card the deck holds a marker for -- used by the collector
 *  checklist to tell "owned, unspecified printing" apart from "owned, and it's the unlimited". */
export function heldPrintings(productId: string): string[] {
  return current.filter((l) => l.productId === productId && l.printing).map((l) => l.printing as string);
}

export function deckQuantity(productId: string): number {
  return current.find((l) => l.productId === productId)?.quantity ?? 0;
}

/** Adds one copy of a product to the active persona's deck, or increments if it's already there. */
export function addToDeck(productId: string): void {
  if (!productId) return;
  const existing = current.find((l) => l.productId === productId);
  current = existing
    ? current.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
    : [...current, { productId, quantity: 1 }];
  persist(current);
  emit();
}

/** Sets a product's deck quantity directly (0 removes it) -- the deck page's own stepper action. */
export function setDeckQuantity(productId: string, quantity: number): void {
  if (!productId) return;
  current = quantity > 0
    ? current.some((l) => l.productId === productId)
      ? current.map((l) => (l.productId === productId ? { ...l, quantity } : l))
      : [...current, { productId, quantity }]
    : current.filter((l) => l.productId !== productId);
  persist(current);
  emit();
}
