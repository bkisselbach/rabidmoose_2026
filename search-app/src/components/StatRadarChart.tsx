import { statAbbreviation } from '@/lib/statMeta';
interface Stat {
  label: string;
  value: number;
}

interface Props {
  stats: Stat[];
  /** Single-hue accent (the Pokemon's primary type color) -- one series, so no legend needed. */
  accent: { bg: string };
  size?: number;
}

const RINGS = [0.25, 0.5, 0.75, 1];

// A hexagon radar is the one place a multi-axis polar chart earns its keep: it's not
// comparing series, it's showing one Pokemon's stat *shape* (physical vs special, bulky vs
// frail) at a glance -- the same convention every Pokedex site uses this exact data for.
// Values are direct-labeled (abbreviation + number) since there are only 6, fixed axes --
// not the "flood the chart" case the label-sparingly rule warns about.
// Internal drawing coordinate space -- deliberately larger than the rendered pixel size (the
// `size` prop) so the two-line vertex labels (abbreviation + value) have vertical room at the
// top/bottom axes without clipping the viewBox; the SVG scales this down to `size` on render.
const VIEW = 260;

// Chart text is specified in viewBox units, which the SVG then scales down to `size` on render --
// so a raw `fontSize={9}` here landed at ~7px on screen, below the smallest step on the page's
// type scale and the one genuinely hard-to-read text left in the app. These convert the intended
// rendered pixel size (the 2xs/xs steps, matching the eyebrow and body-small everywhere else)
// back into viewBox units, so the chart sits on the same scale as the rest of the page.
const toViewUnits = (px: number, size: number) => (px * VIEW) / size;

export function StatRadarChart({ stats, accent, size = 200 }: Props) {
  if (stats.length < 3) return null;

  const total = stats.length;
  const scaleMax = Math.max(150, Math.ceil(Math.max(...stats.map((s) => s.value)) / 50) * 50);

  const cx = VIEW / 2;
  const cy = VIEW / 2;
  const r = VIEW * 0.27;

  const angleFor = (i: number) => (Math.PI * 2 * i) / total - Math.PI / 2;
  const pointAt = (i: number, fraction: number) => {
    const angle = angleFor(i);
    return { x: cx + r * fraction * Math.cos(angle), y: cy + r * fraction * Math.sin(angle) };
  };
  const ringPoints = (fraction: number) =>
    stats.map((_, i) => pointAt(i, fraction)).map(({ x, y }) => `${x},${y}`).join(' ');

  const dataPoints = stats.map((s, i) => pointAt(i, Math.min(1, s.value / scaleMax)));

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size} role="img" aria-label="Base stats">
      <title>Base stats: {stats.map((s) => `${s.label} ${s.value}`).join(', ')}</title>
      {RINGS.map((f) => (
        <polygon key={f} points={ringPoints(f)} fill="none" stroke="hsl(var(--border))" strokeWidth={1} />
      ))}
      {stats.map((_, i) => {
        const p = pointAt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="hsl(var(--border))" strokeWidth={1} />;
      })}
      <polygon
        points={dataPoints.map(({ x, y }) => `${x},${y}`).join(' ')}
        fill={accent.bg}
        fillOpacity={0.16}
        stroke={accent.bg}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={accent.bg} stroke="hsl(var(--card))" strokeWidth={2} />
      ))}
      {stats.map((s, i) => {
        const labelPoint = pointAt(i, 1.32);
        const angle = angleFor(i);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
        const firstLineDy = sin < -0.3 ? '-0.6em' : sin > 0.3 ? '0.7em' : '0.05em';
        return (
          <text key={s.label} x={labelPoint.x} y={labelPoint.y} textAnchor={anchor}>
            <tspan
              x={labelPoint.x}
              dy={firstLineDy}
              fontSize={toViewUnits(11, size)}
              fontWeight={700}
              fill="hsl(var(--muted-foreground))"
              letterSpacing="0.05em"
            >
              {statAbbreviation(s.label)}
            </tspan>
            <tspan x={labelPoint.x} dy="1.15em" fontSize={toViewUnits(12, size)} fontWeight={700} fill="hsl(var(--foreground))">
              {s.value}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
