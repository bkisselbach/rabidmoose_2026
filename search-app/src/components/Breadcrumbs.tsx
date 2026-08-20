import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SITE_URL, useJsonLd } from '@/lib/seo';

interface CrumbSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface CrumbSelect {
  value: string;
  options: CrumbSelectOption[];
  onChange: (value: string) => void;
}

export interface Crumb {
  label: string;
  to?: string;
  state?: unknown;
  select?: CrumbSelect;
  /** Leading glyph for non-select crumbs, e.g. the zone icon on the Pokédex/Marketplace crumb. */
  icon?: ReactNode;
}

// Shared base so every crumb -- link, select, or the plain current-page span -- reads as the same
// typographic segment. Interactive crumbs (Link/Select) layer the hover tint on top; the
// non-interactive current-page span uses the base alone so it doesn't imply it's clickable.
// `tap-safe` on the interactive crumbs only. At eyebrow scale these render 16-21px tall, and the
// species page's two SELECT crumbs (Generation / Type) are real navigation -- measured 20px and
// 21px, against a 44px touch floor. The utility grows the hit box on touch devices without
// touching the type, which is the point: a breadcrumb that is actually 44px tall reads as a
// toolbar. The current-page span stays untouched -- it isn't a target.
const CRUMB_TEXT_BASE = 'eyebrow';
const CRUMB_TEXT = `${CRUMB_TEXT_BASE} tap-safe transition-colors hover:text-primary`;

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  // BreadcrumbList structured data lets search results show the trail (Home > Shop > Card
  // name) instead of the raw URL. Per Google's guidelines the last item (the current page) may
  // omit `item` since it has no separate URL to link to.
  useJsonLd('breadcrumbs', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(item.to ? { item: `${SITE_URL}${item.to}` } : {}),
    })),
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5">
      {items.map((item, i) => {
        // The card's own value may fall outside the curated options list (e.g. a TCG energy
        // type the option list didn't anticipate) -- fall back to a plain, icon-less entry for
        // that value so both the trigger and its dropdown still show the real current value
        // instead of Radix leaving the trigger blank.
        const selectedOption = item.select
          ? (item.select.options.find((o) => o.value === item.select!.value) ?? { value: item.select.value, label: item.select.value })
          : null;

        return (
          <Fragment key={item.label}>
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
            {item.select ? (
              <Select value={item.select.value} onValueChange={item.select.onChange}>
                <SelectTrigger
                  aria-label={item.label}
                  className={`h-auto w-auto gap-1 whitespace-nowrap rounded-sm border-none bg-transparent px-0 py-0 ${CRUMB_TEXT} focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:text-primary [&>span]:line-clamp-1 [&_svg]:h-3 [&_svg]:w-3 [&_svg]:text-current`}
                >
                  {/* Explicit children (rather than the Radix default of mirroring the selected
                      item's rendered content) so the trigger can reuse the same fallback-aware
                      lookup as the dropdown below. */}
                  <SelectValue>
                    <span className="inline-flex items-center gap-1">
                      {selectedOption!.icon}
                      {selectedOption!.label}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" className="min-w-[9rem] text-sm normal-case tracking-normal">
                  {!item.select.options.some((o) => o.value === item.select!.value) && (
                    <SelectItem value={selectedOption!.value}>{selectedOption!.label}</SelectItem>
                  )}
                  {item.select.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="inline-flex items-center gap-1.5">
                        {option.icon}
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : item.to ? (
              <Link to={item.to} state={item.state} className={`inline-flex items-center gap-1 ${CRUMB_TEXT}`}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <span className={`inline-flex items-center gap-1 truncate ${CRUMB_TEXT_BASE}`}>
                {item.icon}
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
