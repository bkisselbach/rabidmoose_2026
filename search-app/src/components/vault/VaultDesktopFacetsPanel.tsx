import { VaultFacetsList } from '@/components/vault/VaultFacetsList';
import { CoveoChip } from '@/components/CoveoChip';

/** border/padding on the outer wrapper, height/items-center on an inner padding-free row: keeps
 *  "Filters" baseline-aligned with VaultListingToolbar's adjacent text-sm line (an eyebrow font
 *  here would not line up the same way). */
export function VaultDesktopFacetsPanel({ onReset }: { onReset: () => void }) {
  return (
    <aside className="mb-6 hidden w-64 shrink-0 md:block lg:w-72">
      <div className="sticky top-20 space-y-4">
        <div className="border-b border-border pb-3">
          <div className="flex h-9 items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filters</span>
              {/* Same one-marker-per-column rule as the /search rail (DesktopFacetsPanel): the
                  values and counts in the list below are response-driven, and the selections
                  round-trip through the URL. */}
              <CoveoChip capability={['dynamic-facets', 'url-manager']} />
            </span>
            <button
              type="button"
              onClick={onReset}
              className="pressable text-sm text-muted-foreground hover:text-primary hover:underline"
            >
              Reset Filters
            </button>
          </div>
        </div>
        <VaultFacetsList />
      </div>
    </aside>
  );
}
