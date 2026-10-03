import { FOCUS, ON_FILL, cx } from '../components/cx';
import { copy } from '../copy.js';
import type { CertSummaryItem } from './model.js';

export interface SummaryProps {
  items: readonly CertSummaryItem[];
  /** The steer item's Switch to Paid button. */
  onSwitchToPaid: () => void;
}

// What the user should know before copying anything, in plain words. One line each; a line with a
// list under it (auto gates, what was not included) shows the list as bullets.
export function Summary({ items, onSwitchToPaid }: SummaryProps) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <ul role="list" className="flex list-none flex-col gap-4 p-0">
        {items.map((item) => (
          <li key={item.key} className="flex flex-col items-start gap-2">
            <p
              className={cx(
                'text-base leading-6 [overflow-wrap:anywhere]',
                item.kind === 'over' ? 'font-medium text-danger' : 'text-text',
              )}
            >
              {item.text}
            </p>
            {item.items !== undefined && item.items.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-5 text-text">
                {item.items.map((entry, i) => (
                  <li key={`${i}-${entry}`} className="[overflow-wrap:anywhere]">
                    {entry}
                  </li>
                ))}
              </ul>
            )}
            {item.kind === 'steer' && (
              <button
                type="button"
                onClick={onSwitchToPaid}
                className={cx('min-h-[44px] rounded-xl bg-accent px-4 text-sm font-semibold', ON_FILL, FOCUS)}
              >
                {copy.gates.switchToPaid}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
