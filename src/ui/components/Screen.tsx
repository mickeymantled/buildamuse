import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { ProgressDots } from './ProgressDots';
import { ChevronIcon } from './icons';
import { FOCUS, GUTTER, ON_FILL, cx } from './cx';

export interface ScreenAction {
  label: string;
  onClick: () => void;
}

export interface ScreenPrimary extends ScreenAction {
  /** Blocks the tap but keeps the button focusable so the hint can be read. */
  disabled?: boolean;
  /** One short line above the button, for example why it is blocked. */
  hint?: string;
}

export interface ScreenProgress {
  total: number;
  /** Zero-based index of this station. */
  current: number;
  /** Accessible text, for example "Step 3 of 9". */
  label: string;
}

export interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Left of the header. Omit on the first screen. */
  back?: ScreenAction;
  /** Right of the header. Omit when the screen cannot be skipped. */
  skip?: ScreenAction;
  progress?: ScreenProgress;
  /** The footer's main button. */
  primary?: ScreenPrimary;
  /** Replaces the main button, for screens with their own footer controls. */
  footer?: ReactNode;
  /** Slot above the footer button for the preview strip (a BottomSheet). */
  peek?: ReactNode;
  children: ReactNode;
}

const HEADER_BTN =
  'inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-[color:var(--text)]';

// One centered column, 390px design width, 430px max. Header, scrolling content, sticky footer.
export function Screen({ title, subtitle, back, skip, progress, primary, footer, peek, children }: ScreenProps) {
  const hintId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A new screen starts at the top with its heading focused, so screen readers announce it.
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [title]);

  const hasFooter = Boolean(primary || footer || peek);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-x-clip bg-[color:var(--bg)] text-[color:var(--text)]">
      <header
        className={cx(
          'grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-[max(8px,env(safe-area-inset-top))]',
          GUTTER,
        )}
      >
        <div className="justify-self-start">
          {back && (
            <button type="button" onClick={back.onClick} className={cx(HEADER_BTN, '-ml-2', FOCUS)}>
              <ChevronIcon dir="left" />
              {back.label}
            </button>
          )}
        </div>
        <div>{progress && <ProgressDots total={progress.total} current={progress.current} label={progress.label} />}</div>
        <div className="justify-self-end">
          {skip && (
            <button type="button" onClick={skip.onClick} className={cx(HEADER_BTN, '-mr-2', FOCUS)}>
              {skip.label}
            </button>
          )}
        </div>
      </header>
      <main className={cx('flex flex-1 flex-col gap-4 pb-6 pt-2', GUTTER)}>
        <div className="flex flex-col gap-1">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-bold leading-8 text-[color:var(--text)] outline-none [overflow-wrap:anywhere]"
          >
            {title}
          </h1>
          {subtitle && <p className="text-base leading-6 text-[color:var(--muted)]">{subtitle}</p>}
        </div>
        {children}
      </main>
      {hasFooter && (
        <footer
          className={cx(
            'sticky bottom-0 z-20 flex flex-col gap-3 border-t border-[color:var(--border)] bg-[color:var(--bg)] pt-3 pb-[max(12px,env(safe-area-inset-bottom))]',
            GUTTER,
          )}
        >
          {peek}
          {primary && (
            <div className="flex flex-col gap-2">
              {primary.hint && (
                <p id={hintId} className="text-center text-sm text-[color:var(--muted)]">
                  {primary.hint}
                </p>
              )}
              <button
                type="button"
                aria-disabled={primary.disabled || undefined}
                aria-describedby={primary.hint ? hintId : undefined}
                onClick={() => {
                  if (!primary.disabled) primary.onClick();
                }}
                className={cx(
                  'min-h-[48px] w-full rounded-xl bg-[color:var(--accent)] px-4 text-base font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                  ON_FILL,
                  FOCUS,
                )}
              >
                {primary.label}
              </button>
            </div>
          )}
          {footer}
        </footer>
      )}
    </div>
  );
}
