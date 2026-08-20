// Coveo's commerce query-correction engine only corrects within edit distance 1 (confirmed by
// direct API probing: "pikachuu"/"picachu"/"blastoize" all correct server-side, "pikachoo"
// doesn't -- and there's no admin-reachable setting to widen it). This covers the wider misses.

/** Levenshtein edit distance between two strings, case-insensitive. */
export function editDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const curr = [i];
    for (let j = 1; j <= t.length; j++) {
      curr[j] = s[i - 1] === t[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[t.length];
}

/** The closest candidate within maxDistance, or null if nothing qualifies -- ties go to whichever candidate sorts first. */
export function findClosestMatch(query: string, candidates: string[], maxDistance: number): string | null {
  let best: { name: string; dist: number } | null = null;
  for (const candidate of candidates) {
    const dist = editDistance(query, candidate);
    if (dist > 0 && dist <= maxDistance && (!best || dist < best.dist)) {
      best = { name: candidate, dist };
    }
  }
  return best?.name ?? null;
}
