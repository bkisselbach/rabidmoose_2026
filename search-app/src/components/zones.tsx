import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/SectionHeader';
import type { Crumb } from '@/components/Breadcrumbs';

// The two-zone system. Every major section of every page belongs to exactly one
// zone -- Marketplace (commerce engine / Catalog source) or Pokédex (search
// engine / pokedex-push source) -- and declares it with the same eyebrow + icon
// treatment site-wide. This is what makes the federated app read as one product
// with two lenses instead of a shop with a wiki bolted on.

export type Zone = 'pokedex' | 'marketplace';

export const ZONES: Record<
  Zone,
  { label: string; icon: LucideIcon; /** default section eyebrow text */ eyebrow: string }
> = {
  marketplace: { label: 'Marketplace', icon: Store, eyebrow: 'From the Marketplace' },
  pokedex: { label: 'Pokédex', icon: BookOpen, eyebrow: 'From the Pokédex' },
};

/** Small zone label used above panels/strips that don't warrant a full SectionHeader
 *  (hero panels, the search page's species strip, cross-link strips). Colored in the same
 *  brand red as the header's pokeball mark (--primary) -- the base .eyebrow class is shared
 *  with unrelated small-caps labels (facet headers, product badges) that stay neutral, so the
 *  red lives here rather than on the shared class. The plain `text-primary` utility is enough
 *  now that .eyebrow lives in @layer components; it previously needed an inline style because
 *  the unlayered .eyebrow rule outranked every utility trying to recolour it.
 *
 *  `icon` overrides the ZONE's glyph with a section-specific one, and it is a deliberate
 *  exception to this file's own one-icon-per-zone rule above (2026-08-17, direct instruction:
 *  "the icons next to all the yellow titles ... are all the same. give each one a unique icon").
 *  The rule earns its keep on pages with ONE marketplace section and one Pokédex section, where
 *  the repeated glyph is the thing tying two engines' output together. The home page stacks five
 *  marketplace sections in a column, and there the same storefront icon five times running told
 *  the reader nothing they couldn't already see -- it marked "this page" rather than "this
 *  section". What still carries the zone there is the eyebrow's brand colour and the section's
 *  own CoveoChip, both untouched; only the glyph specialises. Every other page keeps the zone
 *  default by simply not passing this. */
export function ZoneEyebrow({
  zone,
  text,
  icon,
  className,
}: {
  zone: Zone;
  text?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const { icon: zoneIcon, eyebrow } = ZONES[zone];
  const Icon = icon ?? zoneIcon;
  return (
    <p className={cn('eyebrow flex items-center gap-1.5 text-primary', className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {text ?? eyebrow}
    </p>
  );
}

/** The zone's segment of a breadcrumb spine -- `Home › Pokédex › Gen 1 › Fire › Dreepy` and
 *  `Home › Marketplace › 151 › Fire › Charizard ex`. Deliberately not a link: neither zone has a
 *  single landing page (browsing either one means arriving at /search with facets applied), so a
 *  target here would have to invent one. It's a label, which is all the spine needs it to be. */
export function zoneCrumb(zone: Zone): Crumb {
  const { label, icon: Icon } = ZONES[zone];
  return { label, icon: <Icon className="h-3 w-3 shrink-0" /> };
}

/** Full-width section opener: SectionHeader pre-wired with the zone's icon and an
 *  optional zone eyebrow line above the title. Use for every major page zone so the
 *  two detail pages (and the search page's two halves) share one visual rhythm. */
export function ZoneSectionHeader({
  zone,
  title,
  meta,
  chip,
  showEyebrow = true,
  /** Overrides the zone's default eyebrow copy, for sections that want to name themselves
   *  ("Recommended — picked by Coveo ML") while still carrying the zone's icon signature. */
  eyebrowText,
  className,
}: {
  zone: Zone;
  title: ReactNode;
  meta?: ReactNode;
  chip?: ReactNode;
  showEyebrow?: boolean;
  eyebrowText?: string;
  className?: string;
}) {
  const { icon } = ZONES[zone];
  return (
    <div className={className}>
      {showEyebrow && <ZoneEyebrow zone={zone} text={eyebrowText} className="mb-1.5" />}
      <SectionHeader icon={icon} title={title} meta={meta} chip={chip} />
    </div>
  );
}
