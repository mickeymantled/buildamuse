import { cx } from './cx';

export interface RadarAxis {
  id: string;
  /** The axis name, drawn at its tip with the level after it. */
  label: string;
  /** 1 to max. Clamped. */
  level: number;
}

export interface RadarProps {
  /** Five or six axes, drawn clockwise from the top. */
  axes: readonly RadarAxis[];
  /** Accessible text for the whole chart: every axis with its level. */
  label: string;
  /** The top level. Default 4. */
  max?: number;
  className?: string;
}

// A fixed drawing box. The SVG scales to its container, so it fits a 375px screen.
const W = 360;
const H = 236;
const CX = W / 2;
const CY = 118;
const R = 82;
const LABEL_R = R + 12;

function clamp(level: number, max: number): number {
  return Math.min(max, Math.max(0, level));
}

// Point at a fraction of the radius on axis i of n, clockwise from the top.
function point(i: number, n: number, radius: number): [number, number] {
  const angle = (i * 2 * Math.PI) / n;
  return [CX + radius * Math.sin(angle), CY - radius * Math.cos(angle)];
}

function polygon(n: number, radius: (i: number) => number): string {
  return Array.from({ length: n }, (_, i) => point(i, n, radius(i)).map((v) => v.toFixed(1)).join(',')).join(' ');
}

// Stat levels as a radar. Drawn with the page tokens, so it follows light and dark.
// The graphic is one image to a screen reader: the label carries every axis and level.
export function Radar({ axes, label, max = 4, className }: RadarProps) {
  const n = axes.length;
  const rings = Array.from({ length: max }, (_, k) => k + 1);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      focusable="false"
      className={cx('block h-auto w-full max-w-[360px]', className)}
    >
      {n >= 3 && (
        <g aria-hidden="true">
          {rings.map((ring) => (
            <polygon key={ring} points={polygon(n, () => (R * ring) / max)} className="fill-none stroke-border" strokeWidth={1} />
          ))}
          {axes.map((axis, i) => {
            const [x, y] = point(i, n, R);
            return <line key={axis.id} x1={CX} y1={CY} x2={x} y2={y} className="stroke-border" strokeWidth={1} />;
          })}
          <polygon
            points={polygon(n, (i) => (R * clamp(axes[i].level, max)) / max)}
            className="fill-accent/20 stroke-accent"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {axes.map((axis, i) => {
            const [x, y] = point(i, n, (R * clamp(axis.level, max)) / max);
            return <circle key={axis.id} cx={x} cy={y} r={3.5} className="fill-accent" />;
          })}
          {axes.map((axis, i) => {
            const [x, y] = point(i, n, LABEL_R);
            const angle = (i * 2 * Math.PI) / n;
            const side = Math.sin(angle);
            const up = Math.cos(angle);
            return (
              <text
                key={axis.id}
                x={x}
                y={y}
                textAnchor={side > 0.3 ? 'start' : side < -0.3 ? 'end' : 'middle'}
                dy={up > 0.3 ? '0' : up < -0.3 ? '0.8em' : '0.35em'}
                className="fill-text text-[13px] font-medium"
              >
                {axis.label} {axis.level}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}
