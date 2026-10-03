import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Pill } from './Pill';
import type { PillTone } from './Pill';
import { CheckIcon } from './icons';
import { FOCUS, cx } from './cx';

export interface CardProps {
  title: string;
  description?: string;
  /** One quoted sample line, shown under the description. */
  sample?: string;
  badge?: string;
  badgeTone?: PillTone;
  selected: boolean;
  onSelect: () => void;
  /** 'radio' (default) puts the card in a CardList radiogroup. 'toggle' is an on/off card. */
  mode?: 'radio' | 'toggle';
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
}

// Fills its container in a grid or flex column. Set a width through className in a row.
export function Card({
  title,
  description,
  sample,
  badge,
  badgeTone,
  selected,
  onSelect,
  mode = 'radio',
  disabled = false,
  icon,
  className,
}: CardProps) {
  const uid = useId();
  const titleId = `${uid}-t`;
  const detailId = `${uid}-d`;
  const hasDetail = Boolean(description || sample || badge);
  const aria =
    mode === 'radio' ? ({ role: 'radio', 'aria-checked': selected } as const) : ({ 'aria-pressed': selected } as const);
  return (
    <button
      type="button"
      {...aria}
      aria-labelledby={titleId}
      aria-describedby={hasDetail ? detailId : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        'relative flex min-h-[44px] flex-col items-start gap-1.5 rounded-2xl border p-4 pr-12 text-left motion-safe:transition-colors',
        FOCUS,
        selected
          ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] ring-1 ring-[color:var(--accent)]'
          : 'border-[color:var(--border)] bg-[color:var(--surface)]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border',
          selected
            ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--on-accent,var(--bg))]'
            : 'border-[color:var(--border)]',
        )}
      >
        {selected && <CheckIcon className="h-3.5 w-3.5" />}
      </span>
      <span className="flex items-center gap-2">
        {icon}
        <span id={titleId} className="text-base font-semibold leading-6 text-[color:var(--text)]">
          {title}
        </span>
      </span>
      {hasDetail && (
        <span id={detailId} className="flex flex-col items-start gap-1.5">
          {badge && <Pill tone={badgeTone}>{badge}</Pill>}
          {description && <span className="text-sm leading-5 text-[color:var(--muted)]">{description}</span>}
          {sample && (
            <span className="block border-l-2 border-[color:var(--accent)] pl-3 text-sm italic leading-5 text-[color:var(--text)]">
              {sample}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

export interface CardListProps {
  /** Accessible name for the group. */
  label: string;
  /** 'stack' is a vertical list. 'row' scrolls sideways (the roster only). */
  layout?: 'stack' | 'row';
  /** 'radiogroup' (default) for Cards in radio mode, 'group' for toggle cards. */
  role?: 'radiogroup' | 'group';
  children: ReactNode;
  className?: string;
}

// Arrow keys move through radio cards and select them. Tab still reaches every card.
export function CardList({ label, layout = 'stack', role = 'radiogroup', children, className }: CardListProps) {
  const ref = useRef<HTMLDivElement>(null);
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (role !== 'radiogroup') return;
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const backward = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    if (!forward && !backward) return;
    const radios = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ?? []);
    const at = radios.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || radios.length < 2) return;
    e.preventDefault();
    const next = radios[(at + (forward ? 1 : radios.length - 1)) % radios.length];
    next.focus();
    next.click();
  }
  return (
    <div
      ref={ref}
      role={role}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx(
        layout === 'row'
          ? 'scroll-px-4 -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [&>*]:w-[260px] [&>*]:shrink-0 [&>*]:snap-start'
          : 'grid grid-cols-1 gap-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
