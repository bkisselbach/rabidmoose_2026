import { useEffect, useState } from 'react';
import { subscribeToCharacter } from '@/lib/characterQueue';
import type { PokemonRecord } from '@/lib/pokedexRecord';

// Looks up a species by exact name in the Pokedex content source -- the same query
// CharacterDetailPage.tsx uses for its own deep link -- and returns the full parsed record, so
// a card PDP or card tile can render a real "about the Pokemon" link/section, not just a
// name-and-sprite teaser. The name is only a best-effort guess (see lib/cardPokemonName.ts): a
// miss resolves to `null` and callers skip the section silently -- it never shows the wrong
// Pokemon. Backed by characterQueue's serialized fetcher/cache -- safe to call from many
// components mounted at once (a PLP grid, a recommendation rail), not just a single PDP.
export function useCharacterLookup(name: string | undefined): PokemonRecord | null | undefined {
  const [result, setResult] = useState<PokemonRecord | null | undefined>(undefined);

  useEffect(() => {
    if (!name) {
      setResult(null);
      return;
    }
    setResult(undefined);
    return subscribeToCharacter(name, setResult);
  }, [name]);

  return result;
}
