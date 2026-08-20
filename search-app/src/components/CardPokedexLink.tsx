import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { extractPokemonName } from '@/lib/cardPokemonName';
import { useCharacterLookup } from '@/lib/useCharacterLookup';
import type { PokemonRecord } from '@/lib/pokedexRecord';
import { pokemonPath } from '@/lib/paths';
import { cn } from '@/lib/utils';

// The one place every card tile/row resolves and renders its "back to the Pokedex" link, so a
// search grid, a list row, a trending rail, and a recommendation rail all behave identically
// instead of four copies of the same best-effort lookup.
//
// It is a LABELED link as of 2026-08-17, and by 2026-08-17 it is also the card's TITLE line
// whenever the card's own name adds nothing over it (user, from a screenshot: "i like the
// 'Pokedex: Slugma' ... remove the redudant name above it. keep it yellow and with the icon").
// Two revisions in one session, and the reasoning behind each is worth keeping:
//   - It used to render the card's NAME as the link, marked only by a trailing book icon. The
//     destination was a surprise -- every other pixel of a card navigates to the PDP via the
//     stretched <a>, while the name alone went to /pokedex/<species>, so one card had two
//     destinations with the smaller target nested inside the larger. And an icon cannot say WHERE:
//     a book beside a name announces "this goes somewhere" and leaves the reader guessing, where
//     the word "Pokedex" simply says it.
//   - Once it was labeled, "Slugma" sitting directly above "POKEDEX: SLUGMA" was one name printed
//     twice, so the name above it went.
//   - That removal was first written as a REDUNDANCY TEST -- drop the name only when it matched the
//     species exactly -- to protect the cards where the two differ ("Cramorant V" resolves to the
//     species Cramorant, "Dark Charizard" to Charizard). The user rejected the result on sight, and
//     correctly: it made the rule invisible and the grid look broken ("why do some cards have the
//     pokemon name and the new pokedex: <name> ... they should all be identical"). A rule a reader
//     cannot see is indistinguishable from a bug, and consistency across twenty tiles beat the
//     information the exception preserved. Every card with a species now renders this line and
//     nothing above it.
//     THE COST IS REAL AND DELIBERATE: a card face no longer shows its V / ex / VMAX / Dark
//     designation, so "Cramorant V" and a plain Cramorant card read identically apart from their
//     rarity badge and price. That name is still on the card's stretched <a> as `title` and
//     `aria-label`, so it survives on hover and for screen readers, and it is still the h1 on the
//     PDP -- but it is off the tile. Revisit by putting the variant suffix in the meta strip rather
//     than by reintroducing a conditional here.
//
// The lookup is exported separately from the link (`useCardSpecies`) because callers need the
// resolved species for themselves, to decide whether to render a name line at all. Resolving in the
// parent and passing the record down also means one subscription per card rather than two.
//
// No `cardtype` gate here -- deliberately: the Recommendations slot behind the home trending rail
// comes back with an empty `additionalFields` (confirmed via the raw API response), so gating on
// category there would hide the link on every trending card regardless of whether it's actually a
// Pokemon. extractPokemonName is just a best-effort guess for any card name, Trainer/Energy
// included, and useCharacterLookup's exact-match lookup resolves to null on a miss either way -- a
// Trainer card like "Ultra Ball" simply never matches a species and the link stays hidden, same as
// a wrong guess would. It never shows the wrong Pokemon, so there's nothing the gate was protecting
// against.

/** Resolves the species a card is about, or null/undefined when it is about none (Trainer, Energy,
 *  a name the guesser can't match) / hasn't resolved yet. Backed by characterQueue's serialized
 *  fetcher and cache, so a full grid calling this is one request per distinct species. */
export function useCardSpecies(product: { ec_name?: string | null }): PokemonRecord | null | undefined {
  const pokemonName = product.ec_name ? extractPokemonName(product.ec_name) : undefined;
  return useCharacterLookup(pokemonName);
}

export function CardPokedexLink({ species, className }: { species: PokemonRecord; className?: string }) {
  return (
    // `z-20` and stopPropagation are what let this one line opt OUT of the card's stretched PDP
    // link: the overlay sits at z-10 across the whole card, so anything that wants its own
    // destination has to sit above it and stop the click from bubbling on.
    <Link
      to={pokemonPath(species.characterName)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Pokédex: ${species.characterName}`}
      className={cn(
        // `eyebrow`, not a hand-rolled copy of it (2026-08-19, visual-consistency audit). This
        // line sits DIRECTLY under the set line on every product tile, and that one is a real
        // `.eyebrow` -- so the tile stacked two small uppercase labels that disagreed on both
        // values the class exists to fix: 600 against its 700, and `tracking-wide` (0.025em)
        // against its 0.12em. Same size, same case, visibly different rhythm, one on top of the
        // other. `text-primary` still recolours it: `.eyebrow` is in @layer components and Tailwind
        // declares utilities after it, which is exactly the override index.css put it there for.
        'eyebrow relative z-20 inline-flex w-fit max-w-full items-center gap-1 text-primary hover:underline',
        className
      )}
    >
      <BookOpen className="h-3 w-3 shrink-0" />
      <span className="truncate">{`Pokédex: ${species.characterName}`}</span>
    </Link>
  );
}
