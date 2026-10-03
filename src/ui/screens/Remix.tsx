import { useId } from 'react';
import { FOCUS, cx } from '../components/cx';
import { copy } from '../copy.js';
import { PASTE_MAX, useBuilder } from '../store.js';
import { Station } from './Station.js';

// Side screen between the certificate and base. Station gives it no Skip and no progress dots, Back goes
// to the certificate and Next goes to base. The paste box is the second and last text input in the app
// (the name is the first). It is optional, held in memory only and never reaches the link.
export function Remix() {
  const target = useBuilder((s) => s.target);
  const pasted = useBuilder((s) => s.pasted);
  const setPasted = useBuilder((s) => s.setPasted);
  const inputId = useId();
  const noteId = useId();

  return (
    <Station screen="remix">
      {target !== null && (
        <p
          role="note"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-base leading-6 text-text"
        >
          {copy.remixWarning(copy.targetNames[target])}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-base font-semibold text-text">
          {copy.remixPaste}
        </label>
        {/* 16px text so iOS Safari does not zoom on focus. */}
        <textarea
          id={inputId}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          maxLength={PASTE_MAX}
          rows={8}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={noteId}
          className={cx(
            'min-h-[44px] w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-base leading-6 text-text',
            FOCUS,
          )}
        />
        <p id={noteId} className="text-sm text-muted">
          {copy.remixPasteNote}
        </p>
      </div>
    </Station>
  );
}
