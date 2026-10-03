import { useId } from 'react';
import { AlertIcon } from './icons';
import { cx } from './cx';

export interface MeterProps {
  label: string;
  value: number;
  cap: number;
  /** Text at the right, for example "3,210 of 4,000". */
  valueLabel?: string;
  /** Text shown in place of valueLabel when value is over the cap, for example "Over by 120". */
  overLabel?: string;
  /** Close to the cap but not over it. Over wins if both are set. */
  near?: boolean;
  /** One line under the bar when near, for example "drop a chip to shorten". */
  hint?: string;
  className?: string;
}

// Amber for the near state. index.css has no --warning token, so the fallback is light-dark(), which
// follows the same color-scheme as the dark media query. Both are amber-700 and amber-400, which keep
// 4.5:1 as caption text and 3:1 as the bar against the track. A --warning token in index.css wins over
// them, and the two literals can go then. The caption also carries the alert icon and a heavier
// weight, so it never relies on color alone.
// Written out in full: Tailwind finds a class only as one literal string.
const NEAR_TEXT_CLASS = 'font-semibold text-[color:var(--warning,light-dark(#b45309,#fbbf24))]';
const NEAR_BAR_CLASS = 'bg-[color:var(--warning,light-dark(#b45309,#fbbf24))]';

// Length against a cap. Near the cap the caption gets the alert icon and the hint shows under the bar.
// Over the cap the bar turns danger and the over text shows with an icon.
export function Meter({ label, value, cap, valueLabel, overLabel, near = false, hint, className }: MeterProps) {
  const hintId = useId();
  const over = value > cap;
  const isNear = near && !over;
  const showHint = isNear && hint !== undefined && hint !== '';
  const pct = cap > 0 ? Math.min(100, Math.max(0, (value / cap) * 100)) : over ? 100 : 0;
  const shown = over && overLabel ? overLabel : valueLabel;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-[color:var(--text)]">{label}</span>
        {shown && (
          <span
            className={cx(
              'flex items-center gap-1 tabular-nums',
              over
                ? 'font-semibold text-[color:var(--danger)]'
                : isNear
                  ? NEAR_TEXT_CLASS
                  : 'text-[color:var(--muted)]',
            )}
          >
            {(over || isNear) && <AlertIcon className="h-3.5 w-3.5 shrink-0" />}
            {shown}
          </span>
        )}
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={value}
        aria-valuetext={shown}
        aria-describedby={showHint ? hintId : undefined}
        className="h-2 overflow-hidden rounded-full bg-[color:var(--border)]"
      >
        <div
          className={cx(
            'h-full rounded-full motion-safe:transition-[width]',
            over ? 'bg-[color:var(--danger)]' : isNear ? NEAR_BAR_CLASS : 'bg-[color:var(--accent)]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showHint && (
        <p id={hintId} className="text-sm leading-5 text-[color:var(--text)] first-letter:uppercase">
          {hint}
        </p>
      )}
    </div>
  );
}
