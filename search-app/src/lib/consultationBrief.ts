// The Card Consultant's memory of the current consultation -- what the shopper has asked for,
// and what the index resolved it to. Written by /search's settled query understanding (see the
// reconcile effect in SearchResultsPage.tsx); read by the header pill (SiteHeader) and the home
// resume strip (HomePage). Phase W2 of presentation/consultant-everywhere-plan.md.
//
// PLAIN MODULE WITH SUBSCRIBE, NOT A REACT CONTEXT. Every other piece of cross-cutting shared state
// in this app that multiple components read reactively is a module-scope object (the Coveo
// controllers, cart.ts) rather than Context -- Context would work for the React consumers here, but
// it can't be read from a place with no component tree above it (a future writer that isn't a React
// component, e.g. a plain event handler outside render). `useSyncExternalStore` is the React 18
// primitive for exactly this shape: a store that lives outside React but still notifies subscribed
// components.
//
// SESSION-SCOPED AND PERSONA-KEYED (phase P1, 2026-08-17). sessionStorage rather than localStorage:
// a consultation is this browsing session's, not a permanent record. Keyed per header ProfileSwitcher
// persona -- same `${BASE}:${persona.key}` shape recentlyViewedStorage.ts already uses, Guest keeping
// the unsuffixed base key so any pre-existing organic session survives untouched. This works with no
// live re-keying logic because `switchPersona()` already reloads the page (visitorId.ts) -- the
// module simply re-reads under the new key on the fresh module evaluation after reload, exactly like
// the recently-viewed trail already does.
//
// HONEST BY CONSTITUTION. Every field is either something the shopper's own words expressed
// (rarities, the raw query) or something the index actually resolved (counterTypes, via
// typeMatchups.ts's aggregation) -- never invented, never a guess dressed up as a finding.

import { useSyncExternalStore } from 'react';
import type { PriceRange } from '@/lib/priceIntent';
import { formatPriceRange } from '@/lib/priceIntent';
import { getActivePersona } from '@/lib/visitorId';

export interface CounterGoal {
  kind: 'counter';
  /** Pokedex type names the shopper wants to beat, as queryIntent.ts's counterTargets resolved
   *  them (canonical names, not necessarily the words typed). */
  targets: string[];
  /** What the index aggregation (typeMatchups.ts) says actually beats them. Empty when the
   *  aggregation found no clear counter -- that is itself worth remembering honestly, not hidden. */
  counterTypes: string[];
}

export interface BriefReceipt {
  /** Short summary for the header pill / resume strip. */
  label: string;
  /** One sentence naming the mechanism, shown in the /search consultation's receipts view. */
  detail: string;
  at: number;
}

export interface ConsultationBrief {
  /** The exact query text that produced this consultation -- what "Continue" re-runs. Turn-1 text
   *  in the same sense `q` is turn-1 text on /search itself (see SearchResultsPage.tsx); there is no
   *  multi-turn thread yet (that is phase G3), so this is simply the last query that resolved to
   *  something the consultant remembered. */
  queryText: string;
  goal?: CounterGoal;
  budget?: PriceRange;
  rarities: string[];
  /** Most recent first. W2 keeps exactly one -- the latest consultation replaces the last, same
   *  as the derived-facets pipeline it mirrors ("written once per query… after that the engines
   *  own the state"). A real history arrives with the multi-turn thread (phase G3). */
  receipts: BriefReceipt[];
  updatedAt: number;
}

const BASE_STORAGE_KEY = 'rabidmoose-consultation-brief';

function storageKeyForActivePersona(): string {
  const persona = getActivePersona();
  return persona.key === 'guest' ? BASE_STORAGE_KEY : `${BASE_STORAGE_KEY}:${persona.key}`;
}

function loadFromStorage(): ConsultationBrief | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKeyForActivePersona());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsultationBrief;
    // Minimal shape guard -- a corrupted or foreign value degrades to "no brief" rather than
    // crashing every page that reads this on mount.
    return parsed && typeof parsed === 'object' && Array.isArray(parsed.receipts) ? parsed : null;
  } catch {
    return null;
  }
}

function persist(brief: ConsultationBrief | null) {
  if (typeof window === 'undefined') return;
  try {
    const key = storageKeyForActivePersona();
    if (brief) window.sessionStorage.setItem(key, JSON.stringify(brief));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Private browsing or a full quota: the brief still works in-memory for the rest of this tab's
    // life, it just won't survive a reload.
  }
}

let current: ConsultationBrief | null = loadFromStorage();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getBrief(): ConsultationBrief | null {
  return current;
}

export function subscribeBrief(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read for components -- header pill, home resume strip. `useSyncExternalStore`'s third
 *  argument (server snapshot) is `() => null`: this app has no SSR, but the signature requires one. */
export function useBrief(): ConsultationBrief | null {
  return useSyncExternalStore(subscribeBrief, getBrief, () => null);
}

/** Overwrites the brief with the current consultation. Called once per settled query understanding
 *  (see SearchResultsPage.tsx's reconcile effect) -- a plain overwrite, not a merge, because a new
 *  query's understanding replaces the old one exactly the way the derived-facets URL write does: the
 *  brief is the CURRENT consultation, not an accumulating log. Returns without writing when the
 *  query resolved nothing worth remembering (a plain lookup, or an advisory query the index found no
 *  counter for AND that named no budget/rarity either) -- an empty brief is the honest result for a
 *  query the consultant genuinely has nothing to say about. */
export function writeConsultation(input: {
  queryText: string;
  isAdvisory: boolean;
  targets: string[];
  counterTypes: string[];
  budget: PriceRange | null;
  topTierEnd: number | undefined;
  rarities: string[];
}): void {
  const goal: CounterGoal | undefined =
    input.isAdvisory && input.targets.length > 0
      ? { kind: 'counter', targets: input.targets, counterTypes: input.counterTypes }
      : undefined;

  if (!goal && !input.budget && input.rarities.length === 0) return;

  const labelParts: string[] = [];
  if (goal) labelParts.push(`beat ${goal.targets.join(', ')}`);
  if (input.budget) labelParts.push(formatPriceRange(input.budget, input.topTierEnd));
  if (input.rarities.length > 0) labelParts.push(input.rarities.join(', '));
  const label = labelParts.join(' · ') || input.queryText;

  const detail = goal
    ? goal.counterTypes.length > 0
      ? `Resolved to ${goal.counterTypes.join(', ')} — aggregated from the indexed weaknesses of ${goal.targets.join(', ')}.`
      : `No clear counter found in the index for ${goal.targets.join(', ')}.`
    : `From the search "${input.queryText}".`;

  current = {
    queryText: input.queryText,
    goal,
    budget: input.budget ?? undefined,
    rarities: input.rarities,
    receipts: [{ label, detail, at: Date.now() }],
    updatedAt: Date.now(),
  };
  persist(current);
  emit();
}

export function clearBrief(): void {
  if (!current) return;
  current = null;
  persist(null);
  emit();
}
