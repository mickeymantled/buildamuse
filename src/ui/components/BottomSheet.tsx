import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { ChevronIcon } from './icons';
import { FOCUS, cx } from './cx';

export interface BottomSheetProps {
  /** Names the sheet and heads the open panel. */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What shows in the collapsed bar, for example the first line of the preview. */
  peek?: ReactNode;
  /** Accessible names for the bar's button when closed and when open. */
  openLabel: string;
  closeLabel: string;
  /** The full content, shown in the open panel. */
  children: ReactNode;
  className?: string;
}

// A peek bar that sits in the flow (put it above a footer button). Open, a panel grows upward over the page.
// Escape, the close button, the bar and the backdrop all close it.
export function BottomSheet({
  title,
  open,
  onOpenChange,
  peek,
  openLabel,
  closeLabel,
  children,
  className,
}: BottomSheetProps) {
  const uid = useId();
  const panelId = `${uid}-p`;
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      onOpenChange(false);
      toggleRef.current?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  function close() {
    onOpenChange(false);
    toggleRef.current?.focus();
  }

  return (
    <section aria-label={title} className={cx('relative', className)}>
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={close}
          className="fixed inset-0 z-0 cursor-default bg-black/40"
        />
      )}
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => onOpenChange(!open)}
        className={cx(
          'relative z-10 flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-left',
          FOCUS,
        )}
      >
        <span className="sr-only">{open ? closeLabel : openLabel}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--text)]">{peek}</span>
        <ChevronIcon dir={open ? 'down' : 'up'} className="shrink-0 text-[color:var(--muted)]" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute inset-x-0 bottom-full z-10 mb-2 flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] py-1 pl-4 pr-1">
            <h2 className="text-base font-semibold text-[color:var(--text)]">{title}</h2>
            <button
              type="button"
              onClick={close}
              className={cx('min-h-[44px] rounded-lg px-3 text-sm font-medium text-[color:var(--text)]', FOCUS)}
            >
              {closeLabel}
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain p-4">{children}</div>
        </div>
      )}
    </section>
  );
}
