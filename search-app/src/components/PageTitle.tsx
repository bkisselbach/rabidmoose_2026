import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// The one h1 treatment for the app. Before this, each page picked its own: the search results and
// product pages agreed on text-3xl, the Pokemon page came in at text-xl/sm:text-2xl, and the 404
// used text-xl at semibold with no display face at all -- so "the page title" looked like four
// different ranks depending on where you landed. The home hero is the deliberate exception: it is
// a marketing headline rather than a page label, and keeps its own larger scale.
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn('font-display text-3xl font-bold tracking-tight text-foreground', className)}>{children}</h1>
  );
}
