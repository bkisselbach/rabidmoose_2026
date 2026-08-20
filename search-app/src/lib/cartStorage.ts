import type { CartItem } from '@coveo/headless/commerce';
import { getActivePersona } from '@/lib/visitorId';

// PERSONA-SCOPED (phase P1, 2026-08-17) -- same `${BASE}:${persona.key}` shape
// recentlyViewedStorage.ts already established, Guest keeping the original unsuffixed key so any
// browser's pre-existing cart survives untouched. Previously shared across every persona (recorded
// as MASTER-STATUS item 1's explicit "not done" -- Marcus's deck diagnosis reading Dana's cart was
// wrong, not just untidy, and the cart-fed deck review this phase adds makes that concrete). Needs
// no live re-keying logic: `commerceEngine.ts` reads `loadCartItems()` once at module construction,
// and `switchPersona()` already forces a full reload (visitorId.ts), so the fresh module evaluation
// after a switch simply reads under the new key.
const BASE_STORAGE_KEY = 'pokemon-tcg-cart';

function storageKeyForActivePersona(): string {
  const persona = getActivePersona();
  return persona.key === 'guest' ? BASE_STORAGE_KEY : `${BASE_STORAGE_KEY}:${persona.key}`;
}

export function loadCartItems(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKeyForActivePersona());
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function saveCartItems(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKeyForActivePersona(), JSON.stringify(items));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded) -- cart still works in-memory.
  }
}
