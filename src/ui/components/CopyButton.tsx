import { useEffect, useRef, useState, type RefObject } from 'react';
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
  /** Selected when both copy paths fail, so the reader can copy by hand. */
  selectRef?: RefObject<HTMLElement | null>;
  onCopied?: () => void;
  variant?: 'primary' | 'secondary';
  className?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

const RESET_MS = 2000;

// Must run synchronously inside the tap: Safari only honors execCommand('copy') in the gesture.
function textareaCopy(text: string): boolean {
  const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const ta = document.createElement('textarea');
  ta.value = text;
  // readonly keeps the iOS keyboard down. 16px stops iOS from zooming the page on focus.
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.tabIndex = -1;
  ta.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;font-size:16px';
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  prev?.focus({ preventScroll: true });
  return ok;
}

function canUseClipboardApi(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText && window.isSecureContext;
}

// Last resort: leave the block selected so a long press or Cmd+C still works.
function selectText(el: HTMLElement | null | undefined) {
  if (!el) return;
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // Selection is a courtesy; the failed label already tells the reader.
  }
}

export function CopyButton({
  text,
  label,
  copiedLabel,
  failedLabel,
  selectRef,
  onCopied,
  variant = 'secondary',
  className,
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  function settle(ok: boolean) {
    if (!mounted.current) return;
    if (!ok) selectText(selectRef?.current);
    setState(ok ? 'copied' : 'failed');
    if (ok) onCopied?.();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), RESET_MS);
  }

  // Both attempts start inside the click task. The textarea copy goes first because it is
  // synchronous; the Clipboard API is the second try. There is no async legacy fallback.
  function copy() {
    if (textareaCopy(text)) {
      settle(true);
      return;
    }
    if (canUseClipboardApi()) {
      try {
        navigator.clipboard.writeText(text).then(
          () => settle(true),
          () => settle(false),
        );
        return;
      } catch {
        // A synchronous throw counts as a failed second try.
      }
    }
    settle(false);
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
