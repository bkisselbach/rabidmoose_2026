import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/lib/useViewMode';

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const OPTIONS: { mode: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { mode: 'grid', label: 'Grid view', Icon: LayoutGrid },
  { mode: 'list', label: 'List view', Icon: List },
];

export function ViewToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-border bg-background p-1">
      {OPTIONS.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          aria-label={label}
          onClick={() => onChange(mode)}
          className={cn(
            'pressable',
            'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
            value === mode
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
