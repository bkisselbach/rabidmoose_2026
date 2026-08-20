import { Link } from 'react-router-dom';
import { typeColor } from '@/lib/typeColors';
import { typeIcon } from '@/lib/typeIcons';
import { cn } from '@/lib/utils';

// Icon-only type badge for images (see TypeChips for the text version, still used where types are
// read as a list rather than labeling a picture). `title`/`aria-label` recover the lost word.
const SIZES = {
  xs: { circle: 'h-4 w-4', icon: 'h-2.5 w-2.5' },
  sm: { circle: 'h-5 w-5', icon: 'h-3 w-3' },
  md: { circle: 'h-7 w-7', icon: 'h-4 w-4' },
  lg: { circle: 'h-9 w-9', icon: 'h-[18px] w-[18px]' },
} as const;

interface Props {
  types: string[];
  size?: keyof typeof SIZES;
  linkTo?: (type: string) => { to: string; state?: unknown };
  className?: string;
}

export function TypeIconCircles({ types, size = 'md', linkTo, className }: Props) {
  if (types.length === 0) return null;
  const s = SIZES[size];
  // ring-2 ring-background: keeps the disc legible over both white card scans and darker sprites/holo art.
  const base = cn(
    'flex shrink-0 items-center justify-center rounded-full shadow-rest ring-2 ring-background',
    s.circle
  );

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {types.map((t) => {
        const c = typeColor(t);
        const Icon = typeIcon(t);
        const style = { backgroundColor: c.bg, color: c.text };
        const dest = linkTo?.(t);
        return dest ? (
          // z-20 + stopPropagation: this is often nested inside a stretched full-card <Link>, so it
          // must out-stack that overlay and stop the click from also opening the card.
          <Link
            key={t}
            to={dest.to}
            state={dest.state}
            onClick={(e) => e.stopPropagation()}
            title={t}
            aria-label={`Browse ${t} cards`}
            className={cn(base, 'relative z-20 transition-transform duration-200 hover:scale-110')}
            style={style}
          >
            <Icon className={s.icon} aria-hidden />
          </Link>
        ) : (
          <span key={t} title={t} aria-label={t} role="img" className={base} style={style}>
            <Icon className={s.icon} aria-hidden />
          </span>
        );
      })}
    </div>
  );
}
