import { useEffect, useState } from 'react';
import type { FacetGenerator as HeadlessFacetGenerator } from '@coveo/headless/commerce';
import { RegularFacet } from './RegularFacet';
import { NumericFacet } from './NumericFacet';
import { CoveoChip } from '@/components/CoveoChip';

export function FacetGenerator({
  controller,
  layout = 'stack',
  showChip = true,
}: {
  controller: HeadlessFacetGenerator;
  /** 'stack' (default): the /search sidebar and mobile filter sheet. 'dropdown': a horizontal row
   *  of closed-by-default facet dropdowns (see FacetShell.tsx) -- the /search desktop facet bar. */
  layout?: 'stack' | 'dropdown';
  /** Off for a caller that already marks this rail from its own header, so the column doesn't
   *  carry two Coveo marks a few pixels apart for what a reader sees as one thing (see
   *  DesktopFacetsPanel, which merges `dynamic-facets` into its "Filters" marker). The mobile
   *  filter sheet has no such header, so it keeps this one. */
  showChip?: boolean;
}) {
  const [facets, setFacets] = useState(controller.facets);
  useEffect(() => controller.subscribe(() => setFacets(controller.facets)), [controller]);

  const regularFacets = facets.filter((f) => f.type === 'regular');
  const numericFacets = facets.filter((f) => f.type === 'numericalRange');
  if (regularFacets.length === 0 && numericFacets.length === 0) return null;

  return (
    <nav className={layout === 'dropdown' ? 'flex flex-wrap items-center gap-2' : 'flex flex-col gap-2.5'}>
      {/* Demo Mode only: this whole rail is response-driven -- the chip is the reminder that
          nothing below it is hardcoded in the UI. */}
      {showChip && <CoveoChip capability="dynamic-facets" />}
      {numericFacets.map((facet) => (
        <NumericFacet key={facet.state.facetId} controller={facet} layout={layout} />
      ))}
      {regularFacets.map((facet) => (
        <RegularFacet key={facet.state.facetId} controller={facet} layout={layout} />
      ))}
    </nav>
  );
}
