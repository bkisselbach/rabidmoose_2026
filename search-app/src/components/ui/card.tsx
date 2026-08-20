import * as React from 'react';
import { cn } from '@/lib/utils';

// `rounded-2xl`, not `rounded-lg` (2026-08-18, CSS/theming audit). index.css's radius scale assigns
// 2xl to "grid tiles and full-width panels" and lg to "row cards, facet shells, inner art boxes" --
// and this primitive is the app's panel/tile, so it was naming the wrong role. The cost of the
// wrong default was real drift: every panel built from <Card> (the home rails, the browse strips,
// the consultant panels, both Pokedex panels, the cart's order summary) sat at 12px while every
// panel hand-rolled as a <div> (the newsroom article body, the marketplace bar, the Vault
// spotlight) sat at 16px, and ProductCard had to override to 2xl to look like the tile it is.
// Surfaces that really are rows opt back down with an explicit `rounded-lg` (ProductListItem).
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-2xl border border-border bg-card', className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col gap-1 p-4', className)} {...props} />
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-sm font-semibold leading-tight', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center border-t border-border p-4', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
