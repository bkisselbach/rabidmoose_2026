import { useEffect, useState } from 'react';
import { SortBy, type Sort as HeadlessSort, type SortCriterion } from '@coveo/headless/commerce';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function sortLabel(criterion: SortCriterion): string {
  switch (criterion.by) {
    case SortBy.Relevance:
      return 'Relevance';
    case SortBy.Fields:
      return criterion.fields.map((f) => f.displayName ?? f.name).join(', ');
    default:
      return 'Sort';
  }
}

export function SortDropdown({ controller }: { controller: HeadlessSort }) {
  const [state, setState] = useState(controller.state);
  useEffect(() => controller.subscribe(() => setState(controller.state)), [controller]);

  if (state.availableSorts.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="hidden sm:inline">Sort by</span>
      <Select
        value={JSON.stringify(state.appliedSort)}
        onValueChange={(value) => controller.sortBy(JSON.parse(value))}
      >
        <SelectTrigger className="min-w-[9rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {state.availableSorts.map((sort) => (
            <SelectItem key={JSON.stringify(sort)} value={JSON.stringify(sort)}>
              {sortLabel(sort)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
