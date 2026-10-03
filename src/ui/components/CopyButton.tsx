import { useEffect, useRef, useState } from 'react';
import { CheckIcon } from './icons';
import { FOCUS, ON_FILL, cx } from './cx';

export interface CopyButtonProps {
  /** The text put on the clipboard. */
  text: string;
  label: string;
  /** Shown with a checkmark after a successful copy. */
  copiedLabel: string;
  /** Shown if both copy paths fail. */
  failedLabel: string;
  onCopied?: () => void;
  variant?: 'primary' | 'secondary';
  className?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

const RESET_MS = 2000;

// Textarea fallback for browsers without the Clipboard API (or an insecure context).
function legacyCopy(text: string): boolean {
  const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  // 16px stops iOS from zooming the page on focus.
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  prev?.focus();
  return ok;
}

function canUseClipboardApi(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText && window.isSecureContext;
}

export function CopyButton({
  text,
  label,
  copiedLabel,
  failedLabel,
  onCopied,
  variant = 'secondary',
  className,
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function settle(ok: boolean) {
    setState(ok ? 'copied' : 'failed');
    if (ok) onCopied?.();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), RESET_MS);
  }

  function copy() {
    if (canUseClipboardApi()) {
      navigator.clipboard.writeText(text).then(
        () => settle(true),
        () => settle(legacyCopy(text)),
      );
    } else {
      // Run synchronously inside the tap so Safari still counts it as a user gesture.
      settle(legacyCopy(text));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={cx(
          'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold motion-safe:transition-colors',
          FOCUS,
          variant === 'primary'
            ? `bg-[color:var(--accent)] ${ON_FILL}`
            : 'bg-[color:var(--surface)] text-[color:var(--text)]',
          state === 'failed'
            ? 'border-[color:var(--danger)]'
            : variant === 'primary'
              ? 'border-[color:var(--accent)]'
              : 'border-[color:var(--border)]',
          className,
        )}
      >
        {state === 'copied' && <CheckIcon className="shrink-0" />}
        <span>{state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : label}</span>
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : ''}
      </span>
    </>
  );
}
