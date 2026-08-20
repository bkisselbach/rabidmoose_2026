import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { StatRadarChart } from '@/components/StatRadarChart';
import { CounterCardsLink } from '@/components/pokedex/CounterCardsLink';
import { TypeChips } from '@/components/pokedex/TypeChips';
import { PokedexPortrait } from '@/components/pokedex/PokedexPortrait';
import { EvolutionChain } from '@/components/pokedex/EvolutionChain';
import { typeColor } from '@/lib/typeColors';
import type { PokemonRecord } from '@/lib/pokedexRecord';

interface Props {
  pokemon: PokemonRecord;
  /** 'h1' on the Pokédex page (the Pokemon *is* the page); 'h3' on the card PDP (the card owns the h1/h2). */
  nameAs?: 'h1' | 'h2' | 'h3';
  /** Top-right slot in the hero band, e.g. a CoveoChip naming the index this data comes from. */
  chip?: ReactNode;
  /** Optional footer slot, e.g. the card PDP's link to the full Pokédex entry. */
  cta?: ReactNode;
}

export function PokemonDataPanel({ pokemon, nameAs = 'h1', chip, cta }: Props) {
  const {
    characterName,
    dexNumber,
    generation,
    typeList,
    species,
    height,
    weight,
    image,
    galleryImages,
    abilityList,
    weaknessList,
    stats,
    evolutionChain,
    flavorText,
  } = pokemon;
  const accent = typeColor(typeList[0]);
  const NameTag = nameAs;

  const facts = [
    species ? { label: 'Species', value: species } : null,
    height ? { label: 'Height', value: height } : null,
    weight ? { label: 'Weight', value: weight } : null,
    abilityList.length > 0 ? { label: 'Abilities', value: abilityList.join(', ') } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  const hasBattleData = stats.length >= 3 || weaknessList.length > 0 || evolutionChain.length > 1;

  return (
    <Card className="overflow-hidden">
      <div
        className="relative p-5 sm:p-6"
        style={{ background: `linear-gradient(135deg, ${accent.bg}2E 0%, ${accent.bg}0A 45%, transparent 75%)` }}
      >
        {chip && <div className="absolute right-4 top-4 hidden sm:block">{chip}</div>}
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
          <PokedexPortrait images={galleryImages.length ? galleryImages : image ? [image] : []} name={characterName} types={typeList} size="md" />
          <div className="min-w-0 flex-1 space-y-2">
            {(dexNumber != null || generation != null) && (
              <p className="eyebrow">
                {dexNumber != null && <>#{String(dexNumber).padStart(3, '0')}</>}
                {dexNumber != null && generation != null && ' · '}
                {generation != null && <>Gen {generation}</>}
              </p>
            )}
            <NameTag className="font-display text-lg font-bold text-foreground sm:text-xl">
              {characterName}
            </NameTag>
            {flavorText && (
              <blockquote
                className="mx-auto max-w-prose pt-1 text-sm italic leading-relaxed text-muted-foreground sm:mx-0 sm:border-l-2 sm:pl-3"
                style={{ borderColor: accent.bg }}
              >
                "{flavorText}"
              </blockquote>
            )}
          </div>
        </div>
      </div>

      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 border-t border-border p-4 sm:grid-cols-4 sm:px-6">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0 rounded-md bg-muted/60 px-3 py-2.5">
              <dt className="eyebrow">{f.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold text-foreground" title={f.value}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {hasBattleData && (
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-border p-5 sm:p-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          {stats.length >= 3 && (
            <div className="flex flex-col items-center gap-1 lg:items-start">
              <p className="eyebrow">Base stats</p>
              <StatRadarChart stats={stats} accent={accent} />
              <p className="text-xs text-muted-foreground">
                Total {stats.reduce((n, s) => n + s.value, 0)}
              </p>
            </div>
          )}
          {(weaknessList.length > 0 || evolutionChain.length > 1) && (
            <div className="space-y-6">
              {weaknessList.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Weak against</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TypeChips types={weaknessList} size="sm" />
                  </div>
                  <CounterCardsLink weaknesses={weaknessList} />
                </div>
              )}
              {evolutionChain.length > 1 && (
                <div>
                  <p className="eyebrow mb-2">Evolution line</p>
                  <EvolutionChain chain={evolutionChain} currentName={characterName} accent={accent} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {cta && (
        <div className="flex justify-end border-t border-border bg-muted/40 px-5 py-3">
          {cta}
        </div>
      )}
    </Card>
  );
}
