import { useId } from 'react';
import type { FormEvent } from 'react';
import { FOCUS, cx } from '../components/cx';
import { copy } from '../copy.js';
import { NAME_MAX, isNameValid } from '../flow.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

// Station 7. The only text field in the flow. The store caps the input at 24; Next needs a trimmed
// length of 1 to 24 (Station reads canContinue). No Skip: the name is required.
export function Name() {
  const name = useBuilder((s) => s.draft.name);
  const setName = useBuilder((s) => s.setName);
  const next = useBuilder((s) => s.next);
  const inputId = useId();
  const countId = useId();

  // Enter in the field moves on when the name is valid. Nothing posts and the page never reloads.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isNameValid(name)) next();
  };

  const n = name.length;
  return (
    <Station screen="name" hint={copy.name.required}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={inputId} className="text-base font-semibold text-text">
            {copy.name.label}
          </label>
          <p id={countId} aria-live="polite" className="flex items-baseline gap-2 text-sm text-muted">
            <span aria-hidden="true" className="font-semibold tabular-nums text-text">
              {copy.name.count(n, NAME_MAX)}
            </span>
            <span className="sr-only">{copy.name.countLabel(n, NAME_MAX)}</span>
            {n >= NAME_MAX && <span>{copy.full}</span>}
          </p>
        </div>
        <input
          id={inputId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          aria-describedby={countId}
          className={cx(
            'min-h-[48px] w-full rounded-xl border border-border bg-surface px-4 text-base text-text',
            FOCUS,
          )}
        />
      </form>
    </Station>
  );
}
