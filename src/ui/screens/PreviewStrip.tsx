import { useEffect, useRef, useState } from 'react';
import type { BadgeId, TracedLine } from '../../compiler/types.js';
import library from '../../library/index.js';
import { BottomSheet } from '../components/BottomSheet';
import { Meter } from '../components/Meter';
import { Pill } from '../components/Pill';
import { cx } from '../components/cx';
import { ChevronIcon } from '../components/icons';
import { certificateResult } from '../certificate/input.js';
import { NEAR_CAP } from '../certificate/model.js';
import { copy } from '../copy.js';
import { capOf, isCompileError, useBuilder } from '../store.js';

const BADGE_NAMES = new Map<BadgeId, string>(library.badges.map((b) => [b.id, b.name]));

// The current personality, one line each. Blank lines are spacing. Chassis lines are muted, with the
// label once before the first of them. BottomSheet leaves focus on its bar when it opens, so this
// takes it on mount (it is only mounted while the sheet is open).
function SoulLines({ lines }: { lines: readonly TracedLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  const firstChassis = lines.findIndex((l) => l.kind === 'chassis');
  return (
    <div ref={ref} tabIndex={-1} role="group" aria-label={copy.preview.title} className="flex flex-col outline-none">
      {lines.map((line, i) => {
        if (line.kind === 'blank') return <div key={i} aria-hidden="true" className="h-3" />;
        const chassis = line.kind === 'chassis';
        return (
          <div key={i} className="flex flex-col">
            {i === firstChassis && (
              <p className="pb-1 text-xs font-semibold text-muted">{copy.preview.chassisLabel}</p>
            )}
            <p
              className={cx(
                'whitespace-pre-wrap text-sm leading-5 [overflow-wrap:anywhere]',
                chassis ? 'text-muted' : 'text-text',
                line.kind === 'heading' && 'font-semibold',
              )}
            >
              {line.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// The Meter's own text row, kept to one short line so the strip stays one control high: the label
// ends in an ellipsis before the over text does. Over the cap in a narrow meter the over text and the
// full bar say it all, so the label is hidden there (the sr-only summary and the meter keep it).
const METER_ROW =
  '@container text-xs [&>div>div:first-child]:text-xs [&>div>div:first-child>span:first-child]:truncate [&>div>div:first-child>span+span]:shrink-0';
const OVER_NARROW = '@max-[14rem]:[&>div>div:first-child>span:first-child]:hidden';
// Over the cap the over text must never run under the badge, so the meter keeps room for it (the
// over text and its icon, in ch of the wrapper's text-xs) and the badge name truncates instead. In a
// narrow strip the "Preview" word goes too; the chevron still says the bar opens.
const OVER_PREVIEW_NARROW = '@max-[20rem]:hidden';

// Compact strip above the footer button: length against the cap, the last badge to light, and a Peek
// button that opens the current personality in a bottom sheet. The whole bar is the Peek button (the
// BottomSheet component has no separate button slot), so its accessible name is the summary text.
// One row: the meter takes what the pill and the Preview text leave, and the badge name truncates.
export function PreviewStrip() {
  // The certificate's result, so a remix's Mine lines count toward the length when they are switched on.
  const result = useBuilder(certificateResult);
  const cap = useBuilder(capOf);
  const lastBadge = useBuilder((s) => s.lastBadge);
  const [open, setOpen] = useState(false);

  if (isCompileError(result)) {
    return (
      <button
        type="button"
        disabled
        className="flex min-h-[44px] w-full items-center justify-end gap-3 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-muted opacity-50"
      >
        {copy.preview.open}
        <ChevronIcon dir="up" className="shrink-0" />
      </button>
    );
  }

  const len = result.length;
  const over = len > cap;
  // Near the cap the bar goes amber and says how to shorten (library rule; same margin as the certificate).
  const near = !over && len > cap - NEAR_CAP;
  const lengthText = copy.preview.length(len, cap);
  const overText = over ? copy.preview.over(len - cap) : undefined;
  const badgeName = lastBadge === null ? undefined : (BADGE_NAMES.get(lastBadge) ?? lastBadge);

  const bar = (
    <span className="@container flex items-center gap-2">
      <span className="sr-only">
        {overText ? `${lengthText}. ${overText}` : near ? `${lengthText}. ${copy.certificate.meter.hint}` : lengthText}
      </span>
      <span
        aria-hidden="true"
        className={cx('min-w-[4rem] flex-1', METER_ROW, over && OVER_NARROW)}
        style={overText ? { minWidth: `${overText.length + 3}ch` } : undefined}
      >
        <Meter label={lengthText} value={len} cap={cap} overLabel={overText} near={near} />
      </span>
      {badgeName !== undefined && (
        <Pill className="min-w-0 max-w-[40%]">
          <span className="sr-only">{copy.preview.badgeLit}: </span>
          <span className="truncate">{badgeName}</span>
        </Pill>
      )}
      <span
        aria-hidden="true"
        className={cx('shrink-0 text-sm font-medium text-text', over && OVER_PREVIEW_NARROW)}
      >
        {open ? copy.preview.close : copy.preview.open}
      </span>
    </span>
  );

  return (
    <BottomSheet
      title={copy.preview.title}
      open={open}
      onOpenChange={setOpen}
      peek={bar}
      openLabel={copy.preview.open}
      closeLabel={copy.preview.close}
    >
      <SoulLines lines={result.soulLines} />
    </BottomSheet>
  );
}
