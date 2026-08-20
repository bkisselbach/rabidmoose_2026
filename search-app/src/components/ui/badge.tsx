import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-0.5 text-2xs font-bold uppercase tracking-wide',
  {
    variants: {
      variant: {
        // `--scrim`, the pinned-dark token (see index.css): this variant's real job (rank numbers,
        // etc.) is sitting on TOP of product photography, which stays on light tokens regardless
        // of the site theme -- so it must never track `bg-foreground`, which inverted under the
        // dark canvas and turned this into a white-on-white chip.
        default: 'border-transparent bg-scrim text-white',
        secondary: 'border-border bg-muted text-muted-foreground',
        accent: 'border-transparent bg-primary text-primary-foreground',
        outline: 'border-foreground/25 text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
