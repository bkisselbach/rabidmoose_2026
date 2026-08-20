import { useEffect, useState } from 'react';
import { CardImage } from '@/components/CardImage';
import { Link } from 'react-router-dom';
import type { Product } from '@coveo/headless/commerce';
import { Scale, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { CoveoChip } from '@/components/CoveoChip';
import { useCompareIds, toggleCompare, clearCompare } from '@/lib/compareStorage';
import { useBrief } from '@/lib/consultationBrief';
import { fetchProductsByIds } from '@/lib/fetchProductsByIds';
import { getCardFields, raritySlot } from '@/lib/cardFields';
import { extractPokemonName } from '@/lib/cardPokemonName';
import { subscribeToCharacter } from '@/lib/characterQueue';
import { formatCurrency } from '@/lib/currency';
import { cardPath, pokemonPath } from '@/lib/paths';
import type { PokemonRecord } from '@/lib/pokedexRecord';

// Mounted once, globally, in App.tsx (same pattern as CartDrawer). Self-hides with nothing to
// compare. Dual-engine by design: commerce fields (price/rarity/HP) come off the fetched Product,
// species fields (type/weaknesses) are a second, independent read against the Pokedex index.
export function CompareTray() {
  const ids = useCompareIds();
  const brief = useBrief();
  const [products, setProducts] = useState<Product[]>([]);
  const [species, setSpecies] = useState<Map<string, PokemonRecord | null>>(new Map());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (ids.length === 0) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    fetchProductsByIds(ids).then((found) => {
      if (!cancelled) setProducts(found);
    });
    return () => {
      cancelled = true;
    };
  }, [ids.join('|')]);

  useEffect(() => {
    const names = [...new Set(products.map((p) => extractPokemonName(p.ec_name ?? '')).filter(Boolean))];
    const unsubscribes = names.map((name) =>
      subscribeToCharacter(name, (record) => setSpecies((prev) => new Map(prev).set(name, record)))
    );
    return () => unsubscribes.forEach((off) => off());
  }, [products.map((p) => p.ec_name).join('|')]);

  if (ids.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Opposite corner from the cart drawer's own fixed elements (the mobile add-to-cart bar). */}
      <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-float">
        <div className="flex -space-x-2">
          {products.map((p) => (
            <div key={p.permanentid} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border-2 border-card bg-white">
              <CardImage src={p.ec_images?.[0]} alt="" className="h-full w-full object-contain" />
            </div>
          ))}
        </div>
        <SheetTrigger asChild>
          <button
            type="button"
            className="pressable flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-90"
            disabled={ids.length < 2}
            title={ids.length < 2 ? 'Add one more card to compare' : 'Compare'}
          >
            <Scale className="h-3.5 w-3.5" aria-hidden="true" />
            Compare ({ids.length})
          </button>
        </SheetTrigger>
        <button
          type="button"
          aria-label="Clear compare"
          onClick={() => clearCompare()}
          className="pressable rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <SheetContent className="sheet-panel-right w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4" aria-hidden="true" /> Compare
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-x-auto overflow-y-auto px-5 pb-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${products.length}, minmax(11rem, 1fr))` }}>
            {products.map((product) => {
              const fields = getCardFields(product.additionalFields);
              const name = extractPokemonName(product.ec_name ?? '');
              const record = species.get(name);
              const price = product.ec_promo_price ?? product.ec_price ?? undefined;
              const counterMatch = brief?.goal?.counterTypes.length
                ? record?.typeList.some((t) => brief.goal!.counterTypes.includes(t))
                : false;
              const budgetMatch = brief?.budget && price !== undefined ? price <= brief.budget.end && price >= brief.budget.start : null;

              return (
                <div key={product.permanentid} className="space-y-2 rounded-lg border border-border bg-card p-3">
                  <SheetClose asChild>
                    <Link to={cardPath(product.ec_product_id ?? product.permanentid, product.ec_name)}>
                      <div className="flex aspect-[5/7] items-center justify-center overflow-hidden rounded-md bg-white">
                        {product.ec_images?.[0] && (
                          <img src={product.ec_images[0]} alt="" className="max-h-full max-w-full object-contain" />
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs font-semibold text-foreground hover:underline">
                        {product.ec_name}
                      </p>
                    </Link>
                  </SheetClose>
                  <button
                    type="button"
                    onClick={() => toggleCompare(product.ec_product_id ?? product.permanentid)}
                    className="pressable text-2xs font-semibold text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>

                  <dl className="space-y-1.5 border-t border-border pt-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Price</dt>
                      <dd className="font-bold text-foreground">{price !== undefined ? formatCurrency(price) : '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Rarity</dt>
                      <dd className="text-right text-foreground">{raritySlot(fields.rarity, fields.cardCategory) ?? '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">HP</dt>
                      <dd className="text-foreground">{fields.hp ?? '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Set</dt>
                      <dd className="truncate text-right text-foreground">{fields.setName ?? '—'}</dd>
                    </div>
                    <div className="border-t border-border pt-1.5">
                      <dt className="mb-0.5 text-muted-foreground">Species type</dt>
                      <dd className="text-foreground">{record?.typeList.join(' / ') ?? (record === null ? '—' : 'loading…')}</dd>
                    </div>
                    <div>
                      <dt className="mb-0.5 text-muted-foreground">Weak to</dt>
                      <dd className="text-foreground">{record?.weaknessList.slice(0, 3).join(', ') || '—'}</dd>
                    </div>
                    {brief && (
                      <div className="border-t border-border pt-1.5">
                        <dt className="mb-0.5 text-muted-foreground">Fits your plan?</dt>
                        <dd className={counterMatch || budgetMatch ? 'font-semibold text-primary' : 'text-muted-foreground'}>
                          {[counterMatch && 'counters your target', budgetMatch && 'in budget'].filter(Boolean).join(' · ') || 'no match'}
                        </dd>
                      </div>
                    )}
                    {record && (
                      <Link to={pokemonPath(record.characterName)} className="block pt-1 font-semibold text-primary hover:underline">
                        Pokédex entry &rarr;
                      </Link>
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
          <div className="mt-3">
            <CoveoChip
              capability={[
                { capability: 'commerce-catalog', detailSuffix: 'Price, rarity, HP, set.' },
                { capability: 'pokedex-index', detailSuffix: 'Species type and weaknesses -- a second, independent index read.' },
              ]}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
