import type { Badge as CoveoBadge } from '@coveo/headless/commerce';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// The merchandiser badge (Merchandising Hub > Product Enrichment), in one place. The grid card,
// the list row, the shop panel and the PDP each used to inline the same span with its own padding
// and its own copy of the uppercase-label classes -- and only two of the four carried the tooltip
// explaining where the badge comes from. This wraps the shadcn Badge so the shape, radius and
// label type come from the design system, and only the colours stay inline: they are chosen by the
// merchandiser in the Coveo console, so they are data, not theme.
// The SIZE lives here now (2026-08-17), not at the call sites. The grid tile used to pass
// `px-1.5 py-0 text-[10px]` while the list row and the PDP passed nothing, so the same merchandiser
// badge rendered at two different sizes depending on which surface you were looking at -- the exact
// drift this component was created to end, reintroduced through its className prop.
//
// The compact size wins for all three. It has to work on the tightest surface, and that surface got
// tighter: a product can now show every badge that fired rather than only the first, and three
// stacked rules on a 150px rail tile is a real case (Base Set Charizard fires Rare Find, Vintage and
// High Value together). `className` stays for positioning, never for type scale.
export function MerchBadge({ badge, className }: { badge: CoveoBadge; className?: string }) {
  return (
    <Badge
      title="Merchandiser badge — Coveo Product Enrichment"
      className={cn('min-w-0 border-transparent px-1.5 py-0', className)}
      style={{ backgroundColor: badge.backgroundColor, color: badge.textColor }}
    >
      {/* The label is a real flex item (not anonymous text) so `truncate` has something to bite
          on: the merchandiser writes this copy in the Coveo console, so it can be any length, and
          on the narrowest cards it has to ellipsise rather than wrap to a second line. The full
          text stays reachable via the badge's title tooltip. */}
      <span className="truncate">{badge.text}</span>
    </Badge>
  );
}
