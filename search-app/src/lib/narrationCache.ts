// Per-session narration cache — the one change that actually moves the Gemini bill.
//
// WHY THIS AND NOT SMALLER PAYLOADS. Measured 2026-08-19, the narration requests are 263–1,037
// tokens of input and roughly 150 of output. At flash-lite rates a single call rounds to nothing;
// what costs money is calling it again for an answer we already have. Two things generate those
// repeats, and neither is the user changing their deck:
//
//   * REHEARSAL. The Advisor page gets loaded over and over while practising, and every load used
//     to re-narrate identical data — two calls a view, one per lens.
//   * REACT STRICT MODE. In dev, effects are invoked twice on mount. Measured: three narration
//     requests for a single page load, because the collection lens fired twice. That is pure waste
//     and it only happens on the machine you rehearse on.
//
// A cache keyed on the actual inputs fixes both: the second StrictMode invocation and the tenth
// reload of an unchanged deck are all served locally.
//
// SESSION STORAGE, NOT LOCAL. It clears when the tab closes, so the first load of any state in a
// fresh session is a real, live call — which matters for a demo whose whole claim is that these are
// generated, not canned. Within one rehearsal session it stays quiet; open a new tab and it is live
// again.
//
// FAILURES ARE NOT CACHED. A 502 from a blown quota must not pin "no narration" for the rest of the
// session — the next attempt should be allowed to succeed.

const PREFIX = 'rabidmoose-narration:';

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(PREFIX + key);
  } catch {
    // Private browsing / storage disabled: no cache, just live calls. Never a broken page.
    return null;
  }
}

function write(key: string, text: string): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, text);
  } catch {
    // Quota or private browsing -- losing the cache is not worth failing the narration over.
  }
}

/**
 * Returns the cached narration for `key`, or runs `fetcher` and caches a successful result.
 *
 * `key` must encode everything the narration depends on — the lens, the persona (tone differs), and
 * a signature of the facts. If two different decks share a key, one will read the other's answer.
 */
export async function cachedNarration(
  key: string,
  fetcher: () => Promise<string | null>
): Promise<string | null> {
  const hit = read(key);
  if (hit) return hit;
  const text = await fetcher();
  if (text) write(key, text);
  return text;
}
