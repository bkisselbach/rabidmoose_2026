// The compare tray -- 2-3 product ids the shopper wants judged side by side. Phase S4 of
// presentation/consultant-everywhere-plan.md, reopening demo-capabilities-map.md §7C.17's dropped
// compare tray deliberately, reframed as a consultant skill (see CompareView.tsx: the verdict is
// brief-fit-aware, not a bare spec table).
//
// Same plain-module-with-subscribe shape as consultationBrief.ts, for the same reason: a floating
// tray (CompareTray.tsx, mounted once in App.tsx like CartDrawer) and any "Add to compare" button
// on any product surface both need to read/write one shared list without a provider between them.
// sessionStorage-backed, not persona-keyed (unlike the brief/cart) -- a side-by-side comparison is
// a browsing-session tool, not part of "whose consultation is this" the way a goal or a cart is.

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'rabidmoose-compare-ids';
const MAX_ITEMS = 3;

function load(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function persist(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private browsing or a full quota: the tray still works in-memory for the rest of the tab.
  }
}

let current: string[] = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getCompareIds(): string[] {
  return current;
}

export function subscribeCompare(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCompareIds(): string[] {
  return useSyncExternalStore(subscribeCompare, getCompareIds, () => []);
}

export function isInCompare(productId: string): boolean {
  return current.includes(productId);
}

/** Toggles membership. Silently no-ops past MAX_ITEMS rather than bumping the oldest entry --
 *  a shopper who wants a fourth card compared should remove one on purpose, not have their first
 *  pick evicted without asking. */
export function toggleCompare(productId: string): void {
  current = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : current.length < MAX_ITEMS
      ? [...current, productId]
      : current;
  persist(current);
  emit();
}

export function clearCompare(): void {
  if (current.length === 0) return;
  current = [];
  persist(current);
  emit();
}

export { MAX_ITEMS as COMPARE_MAX_ITEMS };
