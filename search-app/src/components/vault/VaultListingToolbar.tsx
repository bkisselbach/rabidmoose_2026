import type { Sort as HeadlessSort } from '@coveo/headless';
import type { ViewMode } from '@/lib/useViewMode';
import { ClassicSortDropdown } from '@/components/ClassicSortDropdown';
import { ViewToggle } from '@/components/ViewToggle';
import { VAULT_SORT_OPTIONS } from '@/vaultControllers';

export function VaultListingToolbar({
  sort,
  viewMode,
  onViewModeChange,
}: {
  sort: HeadlessSort;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="hidden items-center gap-2 md:flex">
      <ClassicSortDropdown controller={sort} options={VAULT_SORT_OPTIONS} />
      <ViewToggle value={viewMode} onChange={onViewModeChange} />
    </div>
  );
}
