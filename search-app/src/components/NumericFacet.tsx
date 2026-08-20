import { useEffect, useState } from 'react';
import type { NumericFacet as HeadlessNumericFacet, NumericFacetValue } from '@coveo/headless/commerce';
import { Slider } from '@/components/ui/slider';
import { FacetShell } from '@/components/FacetShell';
import { PriceSlider } from '@/components/PriceSlider';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency';
import { useCoveoState } from '@/lib/useCoveoState';

// Only ec_price is money. Every other numeric facet is a bare quantity, and formatting one as
// currency is not a cosmetic slip: when the HP facet went live it rendered as "$10.00 – $50.00".
function formatBound(facetId: string, n: number): string {
  return facetId === 'ec_price' ? formatCurrency(n) : String(Math.round(n));
}

// The top bucket's upper bound is a sentinel picked to satisfy the Facet manager's "ranges must
// be bounded and gap-free" rule (100000 for price, 370 for HP -- no card exceeds 340), so printing
// it verbatim gives "$100.00 – $100,000.00". That tail is open-ended in intent, so label it that
// way. Position is the reliable signal here, not `endInclusive`: the previous code keyed the "+"
// off `!endInclusive`, which put one on *every* auto-generated bucket.
//
// Position is only reliable *within a generated bucket set*, though, which is why `isOnly` vetoes
// it. A manual range (one the app derived and applied as `mnf-ec_price`, see queryIntent/
// priceIntent) comes back as the facet's ONLY value, replacing the bucket list entirely -- so
// "last" is trivially true and a genuine 0-25 filter rendered as "$0.00+", i.e. the exact opposite
// of what it was doing. A lone value is never a sentinel-topped bucket set, so print its real end.
function rangeLabel(facetId: string, value: NumericFacetValue, isLast: boolean, isOnly: boolean): string {
  const start = formatBound(facetId, value.start);
  return isLast && !isOnly ? `${start}+` : `${start} – ${formatBound(facetId, value.end)}`;
}

// The Facet manager response has no explicit "this is a slider" flag on the controller's public
// state -- but a continuous-interval facet (CMH display type "Slider") is unmistakable once you've
// seen both shapes side by side: it comes back as exactly one bucket spanning the whole field, with
// a `domain` object attached (verified live -- HP was the first facet switched to a slider in CMH,
// returning a single 30–340 bucket plus `domain: {min:30, max:340}`; Price was switched to match
// 2026-08-16 and returned `domain: {min:0, max:853}` on the same live check). `domain` isn't just a
// signal, either: it's the only place the field's true bounds live once a range is selected and the
// single bucket narrows to the selection.
function isSliderFacet(state: { domain?: { min: number; max: number } }): state is { domain: { min: number; max: number } } {
  return state.domain !== undefined;
}

// `domain` is the range of *unfiltered-by-this-facet* results, so it visibly narrows the moment a
// range is applied (e.g. 30–340 becomes 80–330 after selecting 100–200 on "charizard" -- confirmed
// live). Re-binding the slider's track to that on every render would rescale the track out from
// under the thumb mid-drag. Caching the widest bounds ever seen per facet keeps the track stable;
// the first, unfiltered response already carries the true bounds, so this locks onto them
// immediately and ignores every narrower reading after.
const stableDomains: Record<string, { min: number; max: number }> = {};
function stableDomain(facetId: string, domain: { min: number; max: number }): { min: number; max: number } {
  const cached = stableDomains[facetId];
  if (!cached || domain.min < cached.min || domain.max > cached.max) {
    stableDomains[facetId] = domain;
    return domain;
  }
  return cached;
}

/** The 'stack' layout's slider block -- inside a FacetShell card, label above, bounds below. */
function RangeSlider({
  facetId,
  domain,
  active,
  onCommit,
}: {
  facetId: string;
  domain: { min: number; max: number };
  active?: { start: number; end: number };
  onCommit: (start: number, end: number) => void;
}) {
  const [pending, setPending] = useState<[number, number]>([active?.start ?? domain.min, active?.end ?? domain.max]);
  // Re-syncs after an external change (Clear button, or a range picked elsewhere) -- not on every
  // render, only when the applied range itself changes, so it doesn't fight the drag gesture.
  useEffect(() => {
    setPending([active?.start ?? domain.min, active?.end ?? domain.max]);
  }, [active?.start, active?.end, domain.min, domain.max]);

  return (
    <div className="px-1.5 pb-1 pt-2">
      <Slider
        min={domain.min}
        max={domain.max}
        step={facetId === 'ec_price' ? 0.01 : 1}
        minStepsBetweenThumbs={1}
        value={pending}
        onValueChange={(next) => setPending(next as [number, number])}
        onValueCommit={(next) => onCommit(next[0], next[1])}
      />
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatBound(facetId, pending[0])}</span>
        <span>{formatBound(facetId, pending[1])}</span>
      </div>
    </div>
  );
}

/** The 'dropdown' layout's slider -- one row, always visible in the toolbar (no trigger/panel to
 *  open first), matching the mockup's own inline price control
 *  (`rabidmoose-tcg/src/components/TcgMarketplace.tsx`) for every slider-type facet, not just
 *  price. Same domain-locking/re-sync rules as RangeSlider (they're siblings, not a hierarchy --
 *  this one just lays out horizontally with the bounds flanking the track instead of below it). */
function InlineRangeFacet({
  facetId,
  label,
  domain,
  active,
  onCommit,
}: {
  facetId: string;
  label: string;
  domain: { min: number; max: number };
  active?: { start: number; end: number };
  onCommit: (start: number, end: number) => void;
}) {
  const [pending, setPending] = useState<[number, number]>([active?.start ?? domain.min, active?.end ?? domain.max]);
  useEffect(() => {
    setPending([active?.start ?? domain.min, active?.end ?? domain.max]);
  }, [active?.start, active?.end, domain.min, domain.max]);

  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
      data-testid="facet"
      data-facet-id={facetId}
    >
      <span className="shrink-0 font-medium text-foreground">{label}</span>
      <span className="tabular-nums">{formatBound(facetId, pending[0])}</span>
      <Slider
        min={domain.min}
        max={domain.max}
        step={facetId === 'ec_price' ? 0.01 : 1}
        minStepsBetweenThumbs={1}
        value={pending}
        onValueChange={(next) => setPending(next as [number, number])}
        onValueCommit={(next) => onCommit(next[0], next[1])}
        className="w-24"
      />
      <span className="tabular-nums">{formatBound(facetId, pending[1])}</span>
    </div>
  );
}

/** The 'dropdown' layout's fallback for a bucketed (no live domain) numeric facet that ISN'T
 *  price -- inline bucket pills instead of a slider, same reasoning PriceSlider's own comment
 *  gives for why price can't be a slider bound to a guessed ceiling. Not expected to fire for this
 *  catalog's live facets (price is the only bucketed one today), but the generator is dynamic and
 *  a future facet shouldn't silently vanish from the toolbar if CMH adds one. */
function InlineBucketFacet({
  facetId,
  label,
  values,
  onToggle,
}: {
  facetId: string;
  label: string;
  values: NumericFacetValue[];
  onToggle: (value: NumericFacetValue) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5"
      data-testid="facet"
      data-facet-id={facetId}
    >
      <span className="shrink-0 text-xs font-medium text-foreground">{label}</span>
      {values.map((value, index) => {
        const selected = value.state !== 'idle';
        return (
          <button
            key={`${value.start}-${value.end}`}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(value)}
            className={cn(
              'pressable',
              'rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors',
              selected
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-foreground hover:border-foreground/60 hover:bg-muted'
            )}
          >
            {rangeLabel(facetId, value, index === values.length - 1, values.length === 1)}
          </button>
        );
      })}
    </div>
  );
}

export function NumericFacet({ controller, layout = 'stack' }: { controller: HeadlessNumericFacet; layout?: 'stack' | 'dropdown' }) {
  const state = useCoveoState(controller);

  if (state.values.length === 0) return null;

  const onToggle = (value: NumericFacetValue) =>
    controller.toggleSelect({
      start: value.start,
      end: value.end,
      endInclusive: value.endInclusive,
      state: value.state === 'selected' ? 'idle' : 'selected',
    });
  const activeCount = state.values.filter((v) => v.state !== 'idle').length;

  if (layout === 'dropdown') {
    // Always visible in the row, not behind a trigger -- matches the mockup's own inline price
    // control, and extends the same treatment to every slider-type facet (HP included), not just
    // price. `ec_price` gets the real, catalog-grounded single-thumb PriceSlider (see its own
    // comment for why it can't just reuse InlineRangeFacet's domain-based approach); any other
    // slider-type facet (HP today) gets a genuine two-thumb range, since Coveo hands it a real
    // domain and "under X" isn't what a stat range means.
    if (state.facetId === 'ec_price') {
      return (
        <PriceSlider
          onCommit={(max) => controller.setRanges([{ start: 0, end: max, endInclusive: true, state: 'selected' }])}
        />
      );
    }
    if (isSliderFacet(state)) {
      return (
        <InlineRangeFacet
          facetId={state.facetId}
          label={state.displayName ?? state.facetId}
          domain={stableDomain(state.facetId, state.domain)}
          active={state.values[0]?.state === 'selected' ? state.values[0] : undefined}
          onCommit={(start, end) => controller.setRanges([{ start, end, endInclusive: true, state: 'selected' }])}
        />
      );
    }
    return (
      <InlineBucketFacet
        facetId={state.facetId}
        label={state.displayName ?? state.facetId}
        values={state.values}
        onToggle={onToggle}
      />
    );
  }

  return (
    <FacetShell
      facetId={state.facetId}
      label={state.displayName ?? state.facetId}
      activeCount={activeCount}
      onClear={() => controller.deselectAll()}
    >
      {isSliderFacet(state) ? (
        <li className="w-full min-w-[12rem]">
          <RangeSlider
            facetId={state.facetId}
            domain={stableDomain(state.facetId, state.domain)}
            active={state.values[0]?.state === 'selected' ? state.values[0] : undefined}
            onCommit={(start, end) =>
              controller.setRanges([{ start, end, endInclusive: true, state: 'selected' }])
            }
          />
        </li>
      ) : (
        state.values.map((value, index) => {
          const id = `${state.facetId}-${value.start}-${value.end}`;
          const selected = value.state !== 'idle';
          return (
            <li key={id}>
              <button
                type="button"
                id={id}
                aria-pressed={selected}
                onClick={() => onToggle(value)}
                className={cn(
                  'pressable',
                  'inline-flex max-w-[10rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:border-foreground/60 hover:bg-muted'
                )}
              >
                <span className="truncate">
                  {rangeLabel(state.facetId, value, index === state.values.length - 1, state.values.length === 1)}
                </span>
                <span className={cn('shrink-0 font-normal', selected ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                  {value.numberOfResults}
                </span>
              </button>
            </li>
          );
        })
      )}
    </FacetShell>
  );
}
