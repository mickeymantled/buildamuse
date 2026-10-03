import type { ReactNode } from 'react';
import { cx } from './cx';

export type PillTone = 'accent' | 'muted' | 'danger';

export interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}

const TONES: Record<PillTone, string> = {
  accent:
    'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--accent)]',
  muted: 'border-[color:var(--border)] bg-transparent text-[color:var(--muted)]',
  danger:
    'border-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[color:var(--danger)]',
};

// Small non-interactive badge.
export function Pill({ children, tone = 'accent', className }: PillProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold leading-4',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
