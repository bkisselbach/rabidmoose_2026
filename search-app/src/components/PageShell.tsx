import { SiteFooter } from '@/components/SiteFooter';
import { cn } from '@/lib/utils';

// The page shell — item 31f / performance-plan.md Part 6.
//
// Ten places wrote this out by hand:
//
//     <>
//       <main className="page-enter page-container flex-1 py-8">…</main>
//       <SiteFooter />
//     </>
//
// CartPage, AdvisorPage, HomePage, PokedexVaultPage, PokemonNewsPage, CharacterDetailPage,
// NewsArticlePage (three times, one per branch) and ErrorPanel. And they had already drifted: seven
// carried `py-8`, two carried no vertical padding at all, and one added `space-y-12`. Nothing
// decided that — it is what happens when a shell is copied rather than named.
//
// WHY A COMPONENT AND NOT A ROUTE-LEVEL WRAPPER. App.tsx's own comment records the reason each page
// still owns its `<main>`: the page transition animates the main element, and hoisting it above the
// router would leave nothing to animate. So the shell stays inside each page — this just means it
// is one import instead of four lines and a footer everyone has to remember.
//
// The padding stays a PROP rather than a preset table, because unlike the card system there is no
// per-surface vocabulary here: it is one axis with three observed values, and a table of one field
// would be ceremony.

interface Props {
  children: React.ReactNode;
  /** Extra classes for `<main>`. The vertical rhythm lives here — `py-8` is the default because
   *  seven of the ten call sites had it; the two that deliberately sit flush pass `padded={false}`. */
  className?: string;
  /** `false` for pages whose first child owns its own top spacing (the Vault's and the news
   *  archive's full-bleed heroes). */
  padded?: boolean;
}

export function PageShell({ children, className, padded = true }: Props) {
  return (
    <>
      <main className={cn('page-enter page-container flex-1', padded && 'py-8', className)}>{children}</main>
      <SiteFooter />
    </>
  );
}
