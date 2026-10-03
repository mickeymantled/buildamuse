import { CheckIcon } from './icons';
import { FOCUS, ON_FILL, cx } from './cx';

export interface ChipProps {
  label: string;
  selected?: boolean;
  /** Visually muted, still tappable. Used when the group is full. */
  dimmed?: boolean;
  /** Picked, and already covered by something else ("already built in"). Shown with a check; a tap still toggles it off. */
  checked?: boolean;
  /** Text for the checked state, for example "already built in". Shown small under the label. */
  checkedLabel?: string;
  disabled?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function Chip({
  label,
  selected = false,
  dimmed = false,
  checked = false,
  checkedLabel,
  disabled = false,
  onToggle,
  className,
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected || checked}
      disabled={disabled}
      onClick={onToggle}
      className={cx(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-1 text-left text-sm font-medium leading-5 motion-safe:transition-colors',
        FOCUS,
        checked
          ? 'border-dashed border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[color:var(--text)]'
          : selected
            ? `border-[color:var(--accent)] bg-[color:var(--accent)] ${ON_FILL}`
            : dimmed
              ? 'border-[color:var(--border)] bg-transparent text-[color:var(--muted)]'
              : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)]',
        disabled && !checked && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {checked && <CheckIcon className="shrink-0 text-[color:var(--accent)]" />}
      <span className="flex flex-col">
        <span>{label}</span>
        {checked && checkedLabel && (
          <span className="text-xs font-normal leading-4 text-[color:var(--muted)]">{checkedLabel}</span>
        )}
      </span>
    </button>
  );
}
