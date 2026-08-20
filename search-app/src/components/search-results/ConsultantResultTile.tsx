import { CardImage } from '@/components/CardImage';
import { Link } from 'react-router-dom';
import type { Product } from '@coveo/headless/commerce';
import { cardPath } from '@/lib/paths';
import { pokemonPath } from '@/lib/paths';
import type { PokemonRecord } from '@/lib/pokedexRecord';
import { cn } from '@/lib/utils';

// One small rounded tile -- image on top, name centered underneath -- shared by both grounded-id
// kinds the Consultant cites: a card (Product) and a species (PokemonRecord). Kept identical so
// citations read as one list of "here's what backs that answer" rather than two bolted-together
// shapes.

const WRAPPER = 'card-hover group flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-2 text-center shadow-rest';
const ART = 'flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-white';
const NAME = 'line-clamp-1 w-full text-2xs font-semibold text-foreground';

export function ConsultantProductTile({ product }: { product: Product }) {
  return (
    <Link to={cardPath(product.ec_product_id ?? product.permanentid, product.ec_name)} className={WRAPPER}>
      <span className={ART}>
        <CardImage
          src={product.ec_images?.[0]}
          alt=""
          className="h-full w-full transform-gpu object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </span>
      <span className={NAME}>{product.ec_name}</span>
    </Link>
  );
}

export function ConsultantSpeciesTile({ record }: { record: PokemonRecord }) {
  return (
    <Link to={pokemonPath(record.characterName)} className={WRAPPER}>
      <span className={cn(ART, 'p-1')}>
        {record.image && (
          <img
            src={record.image}
            alt=""
            className="max-h-[85%] max-w-[85%] transform-gpu object-contain transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </span>
      <span className={NAME}>{record.characterName}</span>
    </Link>
  );
}
