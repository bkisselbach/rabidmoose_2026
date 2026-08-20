import { Link } from 'react-router-dom';
import { typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';

interface Props {
  types: string[];
  size?: 'sm' | 'md';
  /** When provided, each chip becomes a link; omit for a purely decorative chip. */
  linkTo?: (type: string) => { to: string; state?: unknown };
}

// Renders a fragment -- the parent owns the flex-wrap container and its gap.
export function TypeChips({ types, size = 'md', linkTo }: Props) {
  const chipClass = size === 'sm' ? 'gap-1 px-1.5 py-0.5 text-2xs' : 'gap-1 px-2 py-0.5 text-xs';
  const iconClass = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const baseClass = `inline-flex items-center rounded-sm font-bold uppercase tracking-wide ${chipClass}`;
  return (
    <>
      {types.map((t) => {
        const c = typeColor(t);
        const Icon = typeIcon(t);
        const content = (
          <>
            <Icon className={iconClass} />
            {t}
          </>
        );
        const style = { backgroundColor: c.bg, color: c.text };
        const dest = linkTo?.(t);
        return dest ? (
          // z-20 + stopPropagation: some callers nest this inside a stretched full-card <Link>.
          <Link
            key={t}
            to={dest.to}
            state={dest.state}
            onClick={(e) => e.stopPropagation()}
            className={`${baseClass} relative z-20 transition-opacity hover:opacity-80`}
            style={style}
          >
            {content}
          </Link>
        ) : (
          <span key={t} className={baseClass} style={style}>
            {content}
          </span>
        );
      })}
    </>
  );
}
