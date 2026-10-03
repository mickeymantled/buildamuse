// Shared class helpers for the UI components. No store access, no text.

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// Keyboard focus ring. Every interactive element carries this.
export const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';

// Text on an accent or danger fill. An optional --on-accent token wins, else the page background.
export const ON_FILL = 'text-[color:var(--on-accent,var(--bg))]';

// 16px side gutters, widened by the safe-area insets.
export const GUTTER = 'pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]';
