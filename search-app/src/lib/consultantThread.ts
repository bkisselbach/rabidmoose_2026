// The multi-turn conversation state for the Gemini Consultant on /search -- phase G3 of
// presentation/consultant-everywhere-plan.md. Same plain-module-with-subscribe shape as
// consultationBrief.ts, persona-keyed the same way (a conversation is with *someone*), for the same
// reasons: components that need to read/write it live on different parts of the tree with no
// provider between them, and `useSyncExternalStore` lets them all see the same store.
//
// "q stays turn-1's text, permanently" (card-consultant-plan.md Phase 5's own rule): the URL's `q`
// and the SearchBox's displayed value never change when a follow-up is submitted -- only this
// thread grows. `resetForQuery` is what tells "a genuinely new turn-1 consultation" (clear the
// thread) apart from "the same page re-rendering the same query" (leave it alone): called with the
// turn-1 query text every time /search mounts or that text changes, it only actually clears when
// the text is DIFFERENT from what the thread already believes turn 1 was.

import { useSyncExternalStore } from 'react';
import { getActivePersona } from '@/lib/visitorId';

export interface ConsultantTurn {
  role: 'user' | 'model';
  text: string;
  productIds?: string[];
  speciesNames?: string[];
  at: number;
}

interface ThreadState {
  turnOneQuery: string;
  turns: ConsultantTurn[];
}

const BASE_STORAGE_KEY = 'rabidmoose-consultant-thread';

function storageKeyForActivePersona(): string {
  const persona = getActivePersona();
  return persona.key === 'guest' ? BASE_STORAGE_KEY : `${BASE_STORAGE_KEY}:${persona.key}`;
}

function load(): ThreadState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKeyForActivePersona());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ThreadState;
    return parsed && typeof parsed.turnOneQuery === 'string' && Array.isArray(parsed.turns) ? parsed : null;
  } catch {
    return null;
  }
}

function persist(state: ThreadState | null) {
  if (typeof window === 'undefined') return;
  try {
    const key = storageKeyForActivePersona();
    if (state) window.sessionStorage.setItem(key, JSON.stringify(state));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Private browsing or a full quota: the thread still works in-memory for the rest of the tab.
  }
}

let current: ThreadState | null = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getThread(): ThreadState | null {
  return current;
}

export function subscribeThread(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThread(): ThreadState | null {
  return useSyncExternalStore(subscribeThread, getThread, () => null);
}

/** Called on mount / whenever the URL's `q` changes. A no-op if the thread already belongs to this
 *  exact turn-1 text (a re-render, a browser back/forward to the same URL); starts a fresh empty
 *  thread otherwise (a genuinely new topic). */
export function resetForQuery(query: string): void {
  if (current?.turnOneQuery === query) return;
  current = query ? { turnOneQuery: query, turns: [] } : null;
  persist(current);
  emit();
}

/** Appends one turn (the shopper's message, or the consultant's reply) to the thread in progress.
 *  No-ops if called before `resetForQuery` has established a turn-1 anchor -- a follow-up needs
 *  something to follow up ON. */
export function appendTurn(turn: Omit<ConsultantTurn, 'at'>): void {
  if (!current) return;
  current = { ...current, turns: [...current.turns, { ...turn, at: Date.now() }] };
  persist(current);
  emit();
}

export function clearThread(): void {
  if (!current) return;
  current = null;
  persist(null);
  emit();
}
