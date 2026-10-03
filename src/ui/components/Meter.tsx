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
  className?: string;
}

// Length against a cap. Over the cap the bar turns danger and the over text shows with an icon.
export function Meter({ label, value, cap, valueLabel, overLabel, className }: MeterProps) {
  const over = value > cap;
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
              over ? 'font-semibold text-[color:var(--danger)]' : 'text-[color:var(--muted)]',
            )}
          >
            {over && <AlertIcon className="h-3.5 w-3.5 shrink-0" />}
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
        className="h-2 overflow-hidden rounded-full bg-[color:var(--border)]"
      >
        <div
          className={cx(
            'h-full rounded-full motion-safe:transition-[width]',
            over ? 'bg-[color:var(--danger)]' : 'bg-[color:var(--accent)]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
