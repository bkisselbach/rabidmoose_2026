import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { typeColor } from '@/lib/typeColors';

// The pills that state what a sentence was read as. Two surfaces render this vocabulary -- the
// hero/dock reading strip (ConsultantReading) before submit, and the results banner
// (QueryUnderstanding) after it -- and the whole point of the second one is that it says the same
// thing the first one said. Each file used to define its own copies, which had already drifted to
// two different horizontal paddings; they now share these, so "the hero and the results page agree"
// is true visually as well as textually.

/** A Pokémon type, in that type's own colour. `muted` is the pre-settle state: the target types
 *  are known synchronously, the counters arrive with the index aggregation, and dimming the ones
 *  still being resolved is what makes that two-stage settle legible. */
export function TypePill({ name, muted }: { name: string; muted?: boolean }) {
  const { bg, text } = typeColor(name);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ backgroundColor: bg, color: text, ...(muted ? { opacity: 0.55 } : null) }}
    >
      {name}
    </span>
  );
}

/** The neutral outline pill: budgets and rarities. Deliberately NOT a TypePill -- these are
 *  different axes of the same sentence, and colouring them like a type would imply they came out
 *  of the type vocabulary. */
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-foreground/25 px-2.5 py-0.5 text-xs font-bold text-foreground',
        className
      )}
    >
      {children}
    </span>
  );
}
