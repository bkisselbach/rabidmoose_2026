import { useEffect, useState } from 'react';
import type { Sort as HeadlessSort, SortCriterion } from '@coveo/headless';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Sort control for any CLASSIC Search API engine.
//
// The classic Sort controller has no commerce-style `availableSorts` to read a menu from --
// `state.sortCriteria` is just the current criterion's own serialized string. So the caller owns a
// fixed, small option list and this matches the active one back with `isSortedBy`, which the
// classic Sort controller does expose.
//
// The option list used to be hardcoded in here (as `VaultSortDropdown`, reading VAULT_SORT_CRITERIA
// directly). It moved to a prop when /pokemon-news became the second classic-engine page
// (2026-08-17) and needed a completely different set -- Newest/Oldest rather than Dex #. The
// rendering, the active-option matching and the shadcn Select boilerplate are identical for both,
// which is the whole argument for one component: the only thing that ever differed was the list.

export interface ClassicSortOption {
  /** Stable key for the <Select> value; never shown. */
  key: string;
  label: string;
  criterion: SortCriterion;
}

export function ClassicSortDropdown({
  controller,
  options,
}: {
  controller: HeadlessSort;
  /** At least one; the first is the fallback when nothing matches `isSortedBy`. */
  options: readonly ClassicSortOption[];
}) {
  const [, forceRender] = useState(0);
  useEffect(() => controller.subscribe(() => forceRender((n) => n + 1)), [controller]);

  const active = options.find((o) => controller.isSortedBy(o.criterion)) ?? options[0];

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="hidden sm:inline">Sort by</span>
      <Select
        value={active.key}
        onValueChange={(key) => {
          const next = options.find((o) => o.key === key);
          if (next) controller.sortBy(next.criterion);
        }}
      >
        <SelectTrigger className="min-w-[10rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
