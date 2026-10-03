import { useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { FOCUS, ON_FILL, cx } from './cx';

export interface SliderProps {
  label: string;
  description?: string;
  /** One label per level. Level n is stops[n - 1]. Four for the stat sliders. */
  stops: readonly string[];
  /** Current level, 1 to stops.length. */
  value: number;
  onChange: (level: number) => void;
  /** Sample reply for the current level, picked by the caller. */
  sample?: string;
  /** Small caption above the sample, for example "Sounds like". */
  sampleLabel?: string;
  /** Highest level the budget allows. Levels above it are disabled. Defaults to stops.length. */
  maxLevel?: number;
  /** Shown when the budget blocks moving up, for example "full". */
  fullMessage?: string;
  /** Shown at level 1, for the sliders that never go lower (blunt and warm). */
  floorMessage?: string;
  disabled?: boolean;
  className?: string;
}

// A row of tap stops (radio buttons) on a track. Each stop is at least 44px tall.
export function Slider({
  label,
  description,
  stops,
  value,
  onChange,
  sample,
  sampleLabel,
  maxLevel,
  fullMessage,
  floorMessage,
  disabled = false,
  className,
}: SliderProps) {
  const uid = useId();
  const labelId = `${uid}-l`;
  const sampleId = `${uid}-s`;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const n = stops.length;
  if (n < 2) return null;
  const level = Math.min(n, Math.max(1, Math.round(value)));
  const top = Math.min(n, Math.max(level, maxLevel ?? n));
  const upBlocked = level < n && top <= level;
  const atFloor = level === 1;

  function select(next: number, focus: boolean) {
    if (disabled || next < 1 || next > top) return;
    if (focus) refs.current[next - 1]?.focus();
    if (next !== level) onChange(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = level + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = level - 1;
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = top;
    else return;
    e.preventDefault();
    select(next, true);
  }

  const fillPct = ((100 - 100 / n) * (level - 1)) / (n - 1);
  return (
    <div
      className={cx(
        'flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4',
        disabled && 'opacity-60',
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
        aria-describedby={sample ? sampleId : undefined}
        onKeyDown={onKeyDown}
        className="relative flex"
      >
        <span
          aria-hidden="true"
          className="absolute top-[18px] h-1 rounded-full bg-[color:var(--border)]"
          style={{ left: `${50 / n}%`, right: `${50 / n}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-[18px] h-1 rounded-full bg-[color:var(--accent)]"
          style={{ left: `${50 / n}%`, width: `${fillPct}%` }}
        />
        {stops.map((stop, i) => {
          const l = i + 1;
          const current = l === level;
          const blocked = disabled || l > top;
          return (
            <button
              key={l}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={current}
              aria-disabled={blocked || undefined}
              tabIndex={current ? 0 : -1}
              onClick={() => select(l, false)}
              className={cx(
                'relative z-10 flex min-h-[44px] flex-1 flex-col items-center gap-1 rounded-lg py-1',
                FOCUS,
                blocked && 'cursor-not-allowed',
              )}
            >
              <span
                className={cx(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold motion-safe:transition-colors',
                  l <= level
                    ? `border-[color:var(--accent)] bg-[color:var(--accent)] ${ON_FILL}`
                    : l > top
                      ? 'border-dashed border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--muted)]'
                      : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)]',
                  current && 'ring-2 ring-[color:var(--accent)] ring-offset-2 ring-offset-[color:var(--surface)]',
                )}
              >
                {l}
              </span>
              <span
                className={cx(
                  'px-0.5 text-center text-xs leading-4',
                  current ? 'font-semibold text-[color:var(--text)]' : 'text-[color:var(--muted)]',
                )}
              >
                {stop}
              </span>
            </button>
          );
        })}
      </div>
      {sample && (
        <p id={sampleId} aria-live="polite" className="flex flex-col gap-0.5 border-l-2 border-[color:var(--accent)] pl-3">
          {sampleLabel && <span className="text-xs font-semibold text-[color:var(--muted)]">{sampleLabel}</span>}
          <span className="text-sm italic leading-5 text-[color:var(--text)]">{sample}</span>
        </p>
      )}
      <div aria-live="polite" className="text-sm text-[color:var(--muted)]">
        {atFloor && floorMessage && <p>{floorMessage}</p>}
        {upBlocked && fullMessage && <p>{fullMessage}</p>}
      </div>
    </div>
  );
}
