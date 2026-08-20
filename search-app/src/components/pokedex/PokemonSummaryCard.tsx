import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TypeChips } from '@/components/pokedex/TypeChips';
import { PokedexPortrait } from '@/components/pokedex/PokedexPortrait';
import { EvolutionChain } from '@/components/pokedex/EvolutionChain';
import { StatBars } from '@/components/pokedex/StatBars';
import { CounterCardsLink } from '@/components/pokedex/CounterCardsLink';
import { PageTitle } from '@/components/PageTitle';
import { typeColor } from '@/lib/typeColors';
import type { PokemonRecord } from '@/lib/pokedexRecord';

interface Props {
  pokemon: PokemonRecord;
  /** Top-right slot in the header, e.g. a CoveoChip naming the index this data comes from. */
  chip?: ReactNode;
}

export function PokemonSummaryCard({ pokemon, chip }: Props) {
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

  const facts = [
    species ? { label: 'Species', value: species } : null,
    height ? { label: 'Height', value: height } : null,
    weight ? { label: 'Weight', value: weight } : null,
    abilityList.length > 0 ? { label: 'Abilities', value: abilityList.join(', ') } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="flex-row items-center gap-4 space-y-0 p-4 sm:p-5"
        style={{ background: `linear-gradient(135deg, ${accent.bg}2E 0%, ${accent.bg}0A 55%, transparent 85%)` }}
      >
        <PokedexPortrait images={galleryImages.length ? galleryImages : image ? [image] : []} name={characterName} types={typeList} size="sm" />
        <div className="min-w-0 flex-1">
          {(dexNumber != null || generation != null) && (
            <p className="eyebrow">
              {dexNumber != null && <>#{String(dexNumber).padStart(3, '0')}</>}
              {dexNumber != null && generation != null && ' · '}
              {generation != null && <>Gen {generation}</>}
            </p>
          )}
          <PageTitle className="leading-tight">{characterName}</PageTitle>
        </div>
        {chip && <div className="hidden self-start sm:block">{chip}</div>}
      </CardHeader>

      <CardContent className="space-y-4 p-4 pt-4 sm:p-5 sm:pt-4">
        {flavorText && (
          <blockquote
            className="border-l-2 pl-2.5 text-xs italic leading-relaxed text-muted-foreground"
            style={{ borderColor: accent.bg }}
          >
            "{flavorText}"
          </blockquote>
        )}

        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="eyebrow">{f.label}</dt>
                <dd className="mt-0.5 text-sm font-medium leading-snug text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(stats.length > 0 || weaknessList.length > 0 || evolutionChain.length > 1) && (
          <>
            <Separator />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {stats.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Base stats</p>
                  <StatBars stats={stats} />
                </div>
              )}
              {(weaknessList.length > 0 || evolutionChain.length > 1) && (
                <div className="space-y-4">
                  {weaknessList.length > 0 && (
                    <div>
                      <p className="eyebrow mb-1.5">Weak against</p>
                      <div className="flex flex-wrap items-center gap-1">
                        <TypeChips types={weaknessList} size="sm" />
                      </div>
                      <CounterCardsLink weaknesses={weaknessList} />
                    </div>
                  )}
                  {evolutionChain.length > 1 && (
                    <div>
                      <p className="eyebrow mb-1.5">Evolution line</p>
                      <EvolutionChain chain={evolutionChain} currentName={characterName} accent={accent} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
