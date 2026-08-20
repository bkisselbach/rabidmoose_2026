// localStorage persistence for the shared recent-queries list -- same pattern as cartStorage.ts.
// The commerce RecentQueriesList controller is in-memory only; homeControllers.ts hydrates it
// from here at build time and writes back on every change.

const STORAGE_KEY = 'pokemon-tcg-recent-queries';
const MAX_QUERIES = 6; // Mirrors the controller's maxLength so a tampered store can't overfill it.

export function loadRecentQueries(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Corrupt/foreign values must degrade to "no history", never crash controller init.
    return parsed.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, MAX_QUERIES);
  } catch {
    return [];
  }
}

export function saveRecentQueries(queries: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded) -- recents still work in-memory.
  }
}
