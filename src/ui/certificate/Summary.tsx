import { useId } from 'react';
import { FOCUS, ON_FILL, cx } from '../components/cx';
import { copy } from '../copy.js';
import type { CertSummaryItem } from './model.js';

export interface SummaryProps {
  items: readonly CertSummaryItem[];
  /** The steer item's Switch to Paid button. */
  onSwitchToPaid: () => void;
}

// What the user should know before copying anything, in plain words. One line each; a line with a
// list under it (auto gates, what was not included) shows the list as bullets. The wrapper is always
// in the page, so a change to the lines (Switch to Paid, a target switch) is announced politely. With
// no lines it is out of the layout but still there, so the next change still counts.
export function Summary({ items, onSwitchToPaid }: SummaryProps) {
  const headingId = useId();
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="empty:sr-only">
      {items.length > 0 && (
        <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <h2 id={headingId} className="text-lg font-semibold leading-6 text-text">
            {copy.certificateUi.summaryHeading}
          </h2>
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
      )}
    </div>
  );
}
