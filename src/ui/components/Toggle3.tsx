import { useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { GateSetting } from '../../compiler/types';
import { LockIcon } from './icons';
import { FOCUS, ON_FILL, cx } from './cx';

export interface Toggle3Props {
  /** The action's name, for example "Send email". */
  label: string;
  description?: string;
  value: GateSetting;
  onChange: (value: GateSetting) => void;
  /** Visible text for each option. */
  labels: Record<GateSetting, string>;
  /** Locked: the current value shows, the other options are refused (pay is locked to forbid). */
  locked?: boolean;
  /** Why it is locked. Shown with a lock icon and read as the group's description. */
  lockedMessage?: string;
  className?: string;
}

const ORDER: readonly GateSetting[] = ['auto', 'approve', 'forbid'];

// Segmented control: auto / approve / forbid.
export function Toggle3({
  label,
  description,
  value,
  onChange,
  labels,
  locked = false,
  lockedMessage,
  className,
}: Toggle3Props) {
  const uid = useId();
  const labelId = `${uid}-l`;
  const lockId = `${uid}-k`;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function select(next: GateSetting, focus: boolean) {
    if (locked) return;
    if (focus) refs.current[ORDER.indexOf(next)]?.focus();
    if (next !== value) onChange(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const at = ORDER.indexOf(value);
    let to: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = Math.min(ORDER.length - 1, at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = Math.max(0, at - 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = ORDER.length - 1;
    else return;
    e.preventDefault();
    select(ORDER[to], true);
  }

  return (
    <div
      className={cx(
        'flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4',
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span id={labelId} className="text-base font-semibold text-[color:var(--text)]">
          {label}
        </span>
        {description && <span className="text-sm text-[color:var(--muted)]">{description}</span>}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={locked && lockedMessage ? lockId : undefined}
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] p-1"
      >
        {ORDER.map((option, i) => {
          const on = option === value;
          return (
            <button
              key={option}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={locked || undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => select(option, false)}
              className={cx(
                'flex min-h-[44px] items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium motion-safe:transition-colors',
                FOCUS,
                on
                  ? `${option === 'forbid' ? 'bg-[color:var(--danger)]' : 'bg-[color:var(--accent)]'} ${ON_FILL}`
                  : 'text-[color:var(--text)]',
                locked && 'cursor-not-allowed',
                locked && !on && 'opacity-50',
              )}
            >
              {on && locked && <LockIcon className="h-3.5 w-3.5 shrink-0" />}
              {labels[option]}
            </button>
          );
        })}
      </div>
      {locked && lockedMessage && (
        <p id={lockId} className="flex items-start gap-1.5 text-sm text-[color:var(--muted)]">
          <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{lockedMessage}</span>
        </p>
      )}
    </div>
  );
}
