import { useId } from 'react';
import { MinusIcon, PlusIcon } from './icons';
import { FOCUS, cx } from './cx';

export interface StepperProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Formats the shown value, for example (n) => `${n} min`. Defaults to String. */
  format?: (value: number) => string;
  /** Accessible names for the two buttons. */
  decrementLabel: string;
  incrementLabel: string;
  className?: string;
}

// Snap to the min + k * step grid, then keep inside min..max.
function snap(v: number, min: number, max: number, step: number): number {
  const last = min + Math.floor((max - min) / step + 1e-9) * step;
  const k = Math.round((Math.min(last, Math.max(min, v)) - min) / step);
  return Number((min + k * step).toFixed(6));
}

const BTN =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--bg)] text-[color:var(--text)] aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

// Two buttons and a read-only value. Never a text field.
export function Stepper({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
  format = String,
  decrementLabel,
  incrementLabel,
  className,
}: StepperProps) {
  const uid = useId();
  const labelId = `${uid}-l`;
  const safeStep = step > 0 ? step : 1;
  const current = snap(value, min, max, safeStep);
  const dec = snap(current - safeStep, min, max, safeStep);
  const inc = snap(current + safeStep, min, max, safeStep);
  const canDec = dec < current;
  const canInc = inc > current;
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-base font-semibold text-[color:var(--text)]">
          {label}
        </span>
        {description && <span className="text-sm text-[color:var(--muted)]">{description}</span>}
      </div>
      <div role="group" aria-labelledby={labelId} className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={decrementLabel}
          aria-disabled={!canDec}
          onClick={() => canDec && onChange(dec)}
          className={cx(BTN, FOCUS)}
        >
          <MinusIcon />
        </button>
        <output className="min-w-[4ch] text-center text-base font-semibold tabular-nums text-[color:var(--text)]">
          {format(current)}
        </output>
        <button
          type="button"
          aria-label={incrementLabel}
          aria-disabled={!canInc}
          onClick={() => canInc && onChange(inc)}
          className={cx(BTN, FOCUS)}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}
