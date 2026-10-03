import { cx } from './cx';

export interface ProgressDotsProps {
  total: number;
  /** Zero-based index of the current station. */
  current: number;
  /** Accessible text, for example "Step 3 of 9". */
  label: string;
  className?: string;
}

export function ProgressDots({ total, current, label, className }: ProgressDotsProps) {
  if (total < 1) return null;
  const at = Math.min(total - 1, Math.max(0, Math.round(current)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={at + 1}
      aria-valuetext={label}
      className={cx('flex items-center justify-center gap-1.5', className)}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cx(
            'h-2 rounded-full motion-safe:transition-all',
            i === at ? 'w-5 bg-[color:var(--accent)]' : 'w-2',
            i < at && 'bg-[color:var(--accent)]',
            i > at && 'bg-[color:var(--border)]',
          )}
        />
      ))}
    </div>
  );
}
