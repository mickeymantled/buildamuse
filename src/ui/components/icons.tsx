// Inline icons. Decorative only: always aria-hidden, callers supply the accessible text.
import type { ReactNode } from 'react';

interface IconProps {
  className?: string;
}

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 8.5l3.2 3.2L13 4.5" />
    </Svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </Svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 2.5l6 10.5H2z" />
      <path d="M8 6.5v3M8 11.5v.01" />
    </Svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 8h9" />
    </Svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 8h9M8 3.5v9" />
    </Svg>
  );
}

export function ChevronIcon({ dir, className }: IconProps & { dir: 'up' | 'down' | 'left' }) {
  const d = dir === 'up' ? 'M3.5 10l4.5-4.5L12.5 10' : dir === 'down' ? 'M3.5 6l4.5 4.5L12.5 6' : 'M10 3.5L5.5 8l4.5 4.5';
  return (
    <Svg className={className}>
      <path d={d} />
    </Svg>
  );
}
