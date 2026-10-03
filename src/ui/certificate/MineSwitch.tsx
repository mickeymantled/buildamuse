import { useId } from 'react';
import { FOCUS, cx } from '../components/cx';
import { copy } from '../copy.js';
import { MAX_MINE_LINES } from '../../share/mine.js';
import type { CertificateInput } from './input.js';

export interface MineSwitchProps {
  mine: CertificateInput['mine'];
  onChange: (on: boolean) => void;
}

// The switch for the lines the user pasted that the build does not have. Off by default. Beside it:
// these are the user's own words and are not checked against their approvals.
export function MineSwitch({ mine, onChange }: MineSwitchProps) {
  const noteId = useId();
  const c = copy.certificate.mine;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <button
        type="button"
        role="switch"
        aria-checked={mine.on}
        aria-describedby={noteId}
        onClick={() => onChange(!mine.on)}
        className={cx(
          'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg text-left text-base font-semibold text-text',
          FOCUS,
        )}
      >
        <span>{c.label}</span>
        <span
          aria-hidden="true"
          className={cx(
            'relative h-8 w-[52px] shrink-0 rounded-full border motion-safe:transition-colors',
            mine.on ? 'border-accent bg-accent' : 'border-muted bg-muted',
          )}
        >
          <span
            className={cx(
              'absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full motion-safe:transition-[left]',
              mine.on ? 'left-6 bg-on-accent' : 'left-0.5 bg-surface',
            )}
          />
        </span>
      </button>
      <p id={noteId} className="text-sm leading-5 text-text">
        {c.note}
      </p>
      <p className="text-sm leading-5 text-muted">{c.found(mine.lines.length)}</p>
      {mine.on && <p className="text-sm leading-5 text-text">{c.included}</p>}
      {mine.replacedDashes && <p className="text-sm leading-5 text-text">{c.dashes}</p>}
      {mine.dropped > 0 && <p className="text-sm leading-5 text-text">{c.dropped(mine.dropped, MAX_MINE_LINES)}</p>}
    </div>
  );
}
