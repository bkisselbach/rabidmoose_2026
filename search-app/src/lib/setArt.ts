import { useEffect, useState } from 'react';

// Official set art for the home "Browse the catalog" tiles. The index only carries set *names*
// (cardsetname facet values), but the catalog is scraped from TCGdex, which serves every set's
// logo/symbol from the same asset host the card images already load from. One fetch of the public
// set list builds a name -> art map, so a new set in the index picks up its logo with no code
// change -- the same Demo Mode rule as the tiles themselves. If the fetch fails the tiles just
// render without art; nothing here is load-bearing.

const SETS_URL = 'https://api.tcgdex.net/v2/en/sets';
const CACHE_KEY = 'tcgdex-set-art-v1';

export interface SetArt {
  /** Wide wordmark, e.g. the "Evolving Skies" title treatment. */
  logo?: string;
  /** Small square emblem; fallback when a set has no logo. */
  symbol?: string;
}

const EMPTY = new Map<string, SetArt>();
let mapPromise: Promise<Map<string, SetArt>> | null = null;

async function fetchSetArt(): Promise<Map<string, SetArt>> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return new Map(JSON.parse(cached));
  } catch {
    // sessionStorage unavailable (private mode etc.) -- fall through to the fetch
  }
  const res = await fetch(SETS_URL);
  if (!res.ok) throw new Error(`tcgdex sets ${res.status}`);
  const sets: Array<{ name: string; logo?: string; symbol?: string }> = await res.json();
  const map = new Map<string, SetArt>();
  for (const s of sets) {
    if (!s.logo && !s.symbol) continue;
    // TCGdex asset URLs come extension-less; the CDN serves .webp for all of them.
    map.set(s.name.toLowerCase(), {
      ...(s.logo ? { logo: `${s.logo}.webp` } : {}),
      ...(s.symbol ? { symbol: `${s.symbol}.webp` } : {}),
    });
  }
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify([...map]));
  } catch {
    // cache is best-effort
  }
  return map;
}

/** Name-keyed set art, shared across all callers via one module-level fetch. Empty until loaded. */
export function useSetArt(): Map<string, SetArt> {
  const [map, setMap] = useState(EMPTY);
  useEffect(() => {
    let alive = true;
    if (!mapPromise) {
      mapPromise = fetchSetArt().catch(() => {
        mapPromise = null; // allow a retry on next mount instead of pinning the failure
        return EMPTY;
      });
    }
    mapPromise.then((m) => {
      if (alive && m.size > 0) setMap(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return map;
}

// A `setAccentHue` name-hash lived here to give each set tile a stable colour wash before (or
// without) its logo. BrowseTiles renders the logo alone on plain card stock now -- no wash -- so
// it had no callers left and was removed.
