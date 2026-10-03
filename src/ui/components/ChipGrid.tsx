import { useId } from 'react';
import { Chip } from './Chip';
import { cx } from './cx';

export interface ChipGridItem {
  id: string;
  label: string;
  /** Already built in: shown checked and not tappable. */
  checked?: boolean;
  checkedLabel?: string;
  disabled?: boolean;
}

export interface ChipGridGroup {
  id: string;
  heading?: string;
  chips: readonly ChipGridItem[];
}

export interface ChipGridProps {
  /** Heading for the whole grid, shown left of the counter. */
  label?: string;
  groups: readonly ChipGridGroup[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  /** Cap. Dims unselected chips once reached and, with formatCounter, shows the counter. */
  max?: number;
  /** Formats the visible counter, for example copy.counter gives "3/6". No counter shows without it. */
  formatCounter?: (selected: number, max: number) => string;
  /** Accessible text for the counter, for example "3 of 6 chosen". */
  counterLabel?: string;
  /** Shown next to the counter when full, for example "full". */
  fullLabel?: string;
  className?: string;
}

export function ChipGrid({
  label,
  groups,
  selected,
  onToggle,
  max,
  formatCounter,
  counterLabel,
  fullLabel,
  className,
}: ChipGridProps) {
  const uid = useId();
  const full = max !== undefined && selected.length >= max;
  const showCounter = max !== undefined && formatCounter !== undefined;
  const hasHeader = label !== undefined || showCounter;
  return (
    <div className={cx('flex flex-col gap-4', className)}>
      {hasHeader && (
        <div className="flex items-baseline justify-between gap-3">
          {label !== undefined && <h2 className="text-base font-semibold text-[color:var(--text)]">{label}</h2>}
          {showCounter && (
            <p className="ml-auto flex items-baseline gap-2 text-sm text-[color:var(--muted)]" aria-live="polite">
              <span aria-hidden={counterLabel ? true : undefined} className="font-semibold tabular-nums text-[color:var(--text)]">
                {formatCounter(selected.length, max)}
              </span>
              {counterLabel && <span className="sr-only">{counterLabel}</span>}
              {full && fullLabel && <span>{fullLabel}</span>}
            </p>
          )}
        </div>
      )}
      {groups.map((group) => {
        const headingId = `${uid}-${group.id}`;
        return (
          <div
            key={group.id}
            role="group"
            aria-labelledby={group.heading ? headingId : undefined}
            aria-label={group.heading ? undefined : label}
            className="flex flex-col gap-2"
          >
            {group.heading && (
              <h3 id={headingId} className="text-sm font-semibold text-[color:var(--muted)]">
                {group.heading}
              </h3>
            )}
            <div className="flex flex-wrap gap-2">
              {group.chips.map((chip) => {
                const on = selected.includes(chip.id);
                return (
                  <Chip
                    key={chip.id}
                    label={chip.label}
                    selected={on}
                    dimmed={full && !on}
                    checked={chip.checked}
                    checkedLabel={chip.checkedLabel}
                    disabled={chip.disabled}
                    onToggle={() => onToggle(chip.id)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
