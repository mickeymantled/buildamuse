import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Screen } from '../components/Screen';
import { copy } from '../copy.js';
import { canContinue, canSkip, progressScreens, type ScreenId } from '../flow.js';
import { useBuilder } from '../store.js';

export interface StationProps {
  /** Which screen this is. Title, subtitle, Skip and the progress dots follow from it. */
  screen: ScreenId;
  children: ReactNode;
  /** Replaces the Next button, for screens with their own footer controls. */
  footer?: ReactNode;
  /** No Next button, for a screen that moves on some other way. */
  hideNext?: boolean;
  /** One line above Next, shown only while Next is blocked (why it is blocked). */
  hint?: string;
  /** Slot above the footer button, for the preview strip. */
  peek?: ReactNode;
}

// Wires the Screen component to the store. Every station renders inside this.
export function Station({ screen, children, footer, hideNext = false, hint, peek }: StationProps) {
  const ok = useBuilder((s) => canContinue({ ...s, screen }));
  const dots = useBuilder(useShallow((s) => progressScreens(s)));
  const next = useBuilder((s) => s.next);
  const back = useBuilder((s) => s.back);
  const skip = useBuilder((s) => s.skip);

  // Dots show only for the stations from base to name that this build visits.
  const at = dots.indexOf(screen);
  const progress =
    at >= 0 ? { total: dots.length, current: at, label: copy.step(at + 1, dots.length) } : undefined;
  const showNext = !hideNext && footer === undefined;

  return (
    <Screen
      title={copy.screens[screen].title}
      subtitle={copy.screens[screen].subtitle}
      back={screen === 'target' ? undefined : { label: copy.buttons.back, onClick: back }}
      skip={canSkip(screen) ? { label: copy.buttons.skip, onClick: skip } : undefined}
      progress={progress}
      primary={
        showNext
          ? { label: copy.buttons.next, onClick: next, disabled: !ok, hint: ok ? undefined : hint }
          : undefined
      }
      footer={footer}
      peek={peek}
    >
      {children}
    </Screen>
  );
}
