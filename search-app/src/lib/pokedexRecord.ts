import { CONTENT_FIELDS } from '@/contentFields';

export interface EvolutionStage {
  name: string;
  dexNumber: number;
  imageUrl?: string;
}

export interface PokemonStat {
  label: string;
  value: number;
}

/** One pokedex-push document, mapped from the Search API's `result.raw` fields to parsed values. */
export interface PokemonRecord {
  characterName: string;
  dexNumber?: number;
  generation?: number;
  typeList: string[];
  species?: string;
  height?: string;
  weight?: string;
  image?: string;
  /** Every image in pokemondb's own gallery for this species, official artwork first (== [image]
   *  for most species). A few carry a same-page alternate form -- Mega evolution, regional form,
   *  gender difference -- as a second or third entry. */
  galleryImages: string[];
  abilityList: string[];
  weaknessList: string[];
  stats: PokemonStat[];
  evolutionChain: EvolutionStage[];
  flavorText?: string;
  description?: string;
}

/** Multi-value fields come back as arrays or single ';'-joined strings depending on field config. */
function splitMultiValue(raw: unknown): string[] {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((v) => String(v).split(';'))
    .map((s) => s.trim())
    .filter(Boolean);
}

// Comma-separated per stage (not colon) -- the image URL itself contains "://", so a plain
// colon split would chop it up. Pipe still separates stages.
function parseEvolutionChain(raw: string | undefined): EvolutionStage[] {
  if (!raw) return [];
  return raw
    .split('|')
    .map((part) => {
      const [name, dexNumber, imageUrl] = part.split(',');
      return { name: name?.trim() ?? '', dexNumber: Number(dexNumber), imageUrl: imageUrl?.trim() || undefined };
    })
    .filter((stage) => stage.name && !Number.isNaN(stage.dexNumber));
}

function parseStats(raw: string | undefined): PokemonStat[] {
  if (!raw) return [];
  return raw.split(',').map((part) => {
    const [label, value] = part.split(':').map((s) => s.trim());
    return { label, value: Number(value) || 0 };
  });
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** Maps a raw pokedex-push document to a PokemonRecord -- the shared shape both detail pages render. */
export function toPokemonRecord(raw: Record<string, unknown>, fallbackName: string): PokemonRecord {
  return {
    characterName: str(raw[CONTENT_FIELDS.name]) ?? fallbackName,
    dexNumber: num(raw[CONTENT_FIELDS.number]),
    generation: num(raw[CONTENT_FIELDS.generation]),
    typeList: splitMultiValue(raw[CONTENT_FIELDS.type]),
    species: str(raw[CONTENT_FIELDS.species]),
    height: str(raw[CONTENT_FIELDS.height]),
    weight: str(raw[CONTENT_FIELDS.weight]),
    image: str(raw[CONTENT_FIELDS.image]),
    galleryImages: splitMultiValue(raw[CONTENT_FIELDS.galleryImages]),
    abilityList: splitMultiValue(raw[CONTENT_FIELDS.abilities]),
    weaknessList: splitMultiValue(raw[CONTENT_FIELDS.weaknesses]),
    stats: parseStats(str(raw[CONTENT_FIELDS.stats])),
    evolutionChain: parseEvolutionChain(str(raw[CONTENT_FIELDS.evolution])),
    flavorText: str(raw[CONTENT_FIELDS.flavorText]),
    description: str(raw[CONTENT_FIELDS.description]),
  };
}
