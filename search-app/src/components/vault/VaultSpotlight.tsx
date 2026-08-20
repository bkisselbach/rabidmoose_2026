import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, ArrowRight, ChevronRight } from 'lucide-react';
import { CoveoChip } from '@/components/CoveoChip';
import { TypePill } from '@/components/QueryPills';
import { PokedexPortrait } from '@/components/pokedex/PokedexPortrait';
import { StatBars } from '@/components/pokedex/StatBars';
import { productRecommendations, ensureTrendingRecommendationsLoaded } from '@/homeControllers';
import { extractPokemonName } from '@/lib/cardPokemonName';
import { subscribeToCharacter } from '@/lib/characterQueue';
import { pokemonPath } from '@/lib/paths';
import { statAbbreviation, statColor } from '@/lib/statMeta';
import { typeColor } from '@/lib/typeColors';
import type { PokemonRecord, PokemonStat } from '@/lib/pokedexRecord';

/** Driven by the trending Recommendations slot's top product, resolved to a species. As of
 *  2026-08-19 that top slot is a **merchandiser decision**, not just an ML one: a Merchandising Hub
 *  pin on the Trending Now slot holds a chosen card at position 1 and the ML strategy ranks the
 *  rest behind it. The chip copy stays true either way, deliberately -- the pin can be lifted in
 *  the Hub at any time and this card must not then be claiming a campaign that no longer exists.
 *  Self-hides if the slot is empty or the top product doesn't resolve to a species.
 *
 *  One shape: the compact card that sits inside the Vault hero. It used to carry a `compact` flag
 *  guarding a second, full-width layout, but that branch had no call site left -- `compact` was
 *  passed at the one place this renders -- so it was dead markup carrying its own radius, padding
 *  and heading weight that nothing kept in step with the live one (2026-08-18, CSS/theming
 *  audit). */

/** The metric half of the index's "8.8 m (28'10")" / "210.0 kg (463.0 lbs)" strings. Both units
 *  are genuinely interesting on a card like Onix, but the parenthesised imperial half doubles the
 *  chip's width to say the same thing twice, and these chips share a row with the evolution step. */
const metricOnly = (measure: string | undefined) => measure?.split('(')[0].trim();

/** The species' single highest base stat -- the one number that makes a Pokemon interesting at a
 *  glance (Onix is a 160 Defense wall; Alakazam is a 135 Sp. Atk glass cannon). Ties resolve to the
 *  first in index order, which is the games' own stat order, so the pick is stable rather than
 *  dependent on how the scrape happened to serialise. */
function signatureStat(stats: PokemonStat[]): PokemonStat | undefined {
  return stats.reduce<PokemonStat | undefined>(
    (best, s) => (best === undefined || s.value > best.value ? s : best),
    undefined
  );
}

export function VaultSpotlight() {
  const [slotState, setSlotState] = useState(productRecommendations?.state);
  useEffect(() => {
    if (!productRecommendations) return;
    ensureTrendingRecommendationsLoaded();
    return productRecommendations.subscribe(() => setSlotState(productRecommendations!.state));
  }, []);

  const topProduct = slotState?.products[0];
  const candidateName = topProduct?.ec_name ? extractPokemonName(topProduct.ec_name) : '';

  const [species, setSpecies] = useState<PokemonRecord | null | undefined>(undefined);
  useEffect(() => {
    if (!candidateName) {
      setSpecies(undefined);
      return;
    }
    return subscribeToCharacter(candidateName, setSpecies);
  }, [candidateName]);

  if (!species) return null;

  const accent = typeColor(species.typeList[0]);
  // Dual-type species get BOTH colours in the wash -- a Rock/Ground card should not read as a
  // single-type one. Single-type species pass their own colour twice, which degrades to the plain
  // one-hue gradient rather than needing a second code path.
  const accent2 = typeColor(species.typeList[1] ?? species.typeList[0]);
  const tagline = [species.dexNumber ? `#${String(species.dexNumber).padStart(3, '0')}` : null, species.species]
    .filter(Boolean)
    .join(' · ');

  const top = signatureStat(species.stats);
  const topColor = top ? statColor(top.label) : undefined;
  // The stage AFTER this one, found by POSITION in the chain rather than by "first stage that
  // isn't this one" -- for a middle-stage species (Ivysaur in Bulbasaur/Ivysaur/Venusaur) the
  // latter returns the PRE-evolution, and the chip would then point a "->" at what it evolved
  // FROM. A species at the end of its chain, or absent from it, gets no chip at all.
  // Rendered as art rather than as a name because the sprite is the recognisable half -- and
  // deliberately NOT the shared `EvolutionChain` component, whose stages are each a `<Link>`:
  // this whole card is already one link, and a nested anchor is invalid markup (the same
  // constraint recorded in the card-system plan).
  const stageIndex = species.evolutionChain.findIndex(
    (stage) => stage.name.toLowerCase() === species.characterName.toLowerCase()
  );
  const nextStage = stageIndex >= 0 ? species.evolutionChain[stageIndex + 1] : undefined;
  const height = metricOnly(species.height);
  const weight = metricOnly(species.weight);

  return (
    <Link
      to={pokemonPath(species.characterName)}
      className="card-hover group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-background p-4"
    >
      {/* The type wash. Sits under everything and carries most of the card's colour, so the card
          reads as "a Rock/Ground Pokemon" before a single word is read. Alpha-suffixed hex on the
          type palette rather than a token, the same way the summary card's header tints itself. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background: `linear-gradient(135deg, ${accent.bg}42 0%, ${accent2.bg}26 42%, transparent 76%)`,
        }}
      />
      {/* The dex number as a watermark numeral -- the Pokedex's own visual signature, and the
          cheapest way to fill the card's dead left-bottom corner with something that is real data
          rather than decoration. Sits behind the artwork on purpose: the sprite overlapping it is
          what makes it read as a plate the Pokemon stands on. */}
      {species.dexNumber && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-7 -left-4 select-none font-display text-[7.5rem] font-extrabold leading-none tracking-tighter"
          style={{ color: accent.bg, opacity: 0.13 }}
        >
          {String(species.dexNumber).padStart(3, '0')}
        </span>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: `inset 0 0 0 1px ${accent.bg}40`, opacity: 0.7 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full opacity-30 blur-2xl transition-opacity duration-300 group-hover:opacity-50"
        style={{ backgroundColor: accent2.bg }}
      />
      <div className="relative mb-2 flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" aria-hidden="true" />
        <span className="eyebrow" style={{ color: accent.bg }}>
          Spotlight
        </span>
        <CoveoChip
          capability={{
            capability: 'ml-recommendations',
            detailSuffix: `Seeded from this org's trending Recommendations slot — its top card's species, resolved against the Pokédex index.`,
          }}
        />
      </div>
      <div className="relative flex items-start gap-5">
        {/* The species page's own portrait frame, not a bare `<img>`. pokemondb's artwork is JPG
            on a white ground, so an unframed sprite on this card's dark type wash reads as a stray
            white box; the frame turns that into a deliberate plate, and brings two things the bare
            image never had -- the type icon circles, and auto-rotation through a species' alternate
            forms (Mega, regional, gender) for the ones that have them. It owns hover handlers but
            no anchor, so it is safe inside this card's single link. */}
        <PokedexPortrait
          images={species.galleryImages.length ? species.galleryImages : species.image ? [species.image] : []}
          name={species.characterName}
          types={species.typeList}
          size="md"
          className="transition-transform duration-300 ease-out group-hover:scale-105"
        />
        <div className="min-w-0 flex-1">
          {/* `font-extrabold` as a plain utility (2026-08-18, CSS/theming audit). This was an
              inline `style={{ fontWeight: 800 }}` because index.css's `h1, h2, h3, .font-display`
              rule was UNLAYERED and beat every weight utility in the app; that rule now sits in
              `@layer base`, so the utility wins and the escape hatch is no longer needed. */}
          <h3 className="truncate font-display text-2xl font-extrabold text-foreground">
            {species.characterName}
          </h3>
          {tagline && (
            <p className="mt-0.5 truncate text-xs font-semibold uppercase tracking-wide" style={{ color: accent.bg }}>
              {tagline}
            </p>
          )}
          {species.typeList.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {species.typeList.map((t) => (
                <TypePill key={t} name={t} />
              ))}
            </div>
          )}
          {species.flavorText && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{species.flavorText}</p>
          )}
        </div>
        {/* The stat shape, at a glance -- the same six bars, in the same six colours, that the
            species page shows, so a visitor who clicks through meets a chart they have already
            read. `StatRadarChart` was tried here first and rejected: its axis labels are sized in
            viewBox units, so below roughly 160px they outgrow the chart and clip against the card
            edge, and this row is only ~150px tall.
            Hidden below `xl:` -- the hero puts this card in a half-width column from `lg:` up, so
            it is at its NARROWEST in the middle of the range, and the text column needs the room
            there more than the stats do. */}
        {species.stats.length >= 3 && (
          <div className="hidden w-[168px] shrink-0 self-center xl:block">
            <StatBars stats={species.stats} />
          </div>
        )}
      </div>
      <div className="relative mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/* The signature stat wears its OWN axis colour, not the species' type accent -- the
              whole point of the shared stat palette is that DEF is the same blue wherever it is
              shown, including here, where it is the only stat on screen. */}
          {top && topColor && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold"
              style={{
                backgroundColor: `${topColor}1F`,
                color: topColor,
                boxShadow: `inset 0 0 0 1px ${topColor}59`,
              }}
            >
              {statAbbreviation(top.label)}
              <span className="tabular-nums">{top.value}</span>
            </span>
          )}
          {height && <MetaChip label="HT" value={height} />}
          {weight && <MetaChip label="WT" value={weight} />}
          {nextStage && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-background/60 py-0.5 pl-1 pr-2 text-2xs font-semibold text-muted-foreground">
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              {nextStage.imageUrl && (
                <img src={nextStage.imageUrl} alt="" className="h-5 w-5 shrink-0 object-contain" />
              )}
              {nextStage.name}
            </span>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary underline decoration-primary/0 decoration-dotted underline-offset-4 transition-colors duration-200 group-hover:decoration-primary/70">
          See the full dex entry{' '}
          <ArrowRight className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

/** The neutral measurement chip. Deliberately not a `Pill` -- these sit at 11px against the
 *  signature stat's coloured chip, and `Pill`'s 12px/foreground-border treatment would make the
 *  height read as loud as the stat that was chosen for being remarkable.
 *
 *  On `2xs` (11px) rather than the `text-[11px]`/`text-[9px]` pair it used to spell (2026-08-19,
 *  visual-consistency audit). `2xs` IS 11px, so the chip itself is unchanged; the 9px label was the
 *  app's last hand-picked size below the scale's floor -- exactly the six-invented-sizes problem
 *  index.css closed the scale to prevent -- and it now separates from its value by weight, tracking
 *  and opacity instead of by a size nothing else in the tree uses. */
function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
      <span className="text-2xs font-bold uppercase tracking-wider opacity-70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}
