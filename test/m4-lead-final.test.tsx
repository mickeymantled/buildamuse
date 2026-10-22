// @vitest-environment jsdom
// Lead additions at the M4 close (QUESTIONS W40), as moved by B17 and K3: a dot that runs a gate on
// auto while a limit line is missing from its message is told so in one line (the dot message now
// carries the limits, so a real build has none missing); the Limits screen no longer carries a dot note
// (the dot has the numbers); the preview strip shows the near-cap state the certificate meter shows.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { capOf, resolveProfile } from '../src/compiler/profile.js';
import type { Build } from '../src/compiler/types.js';
import { certificateModel } from '../src/ui/certificate/model.js';
import { copy } from '../src/ui/copy.js';
import { App } from '../src/ui/App.js';
import { useBuilder } from '../src/ui/store.js';

afterEach(() => {
  cleanup();
  useBuilder.getState().reset();
});

function martyOn(target: Build['target'], mode?: Build['mode']): Build {
  const marty = library.roster.find((r) => r.id === 'marty')!.build;
  return migrate(structuredClone(marty), { target, mode });
}

// The model for a build. `without` lists text taken out of the personality message first, to reach a
// message that lacks some lines (the real dot compile carries them all).
function modelFor(build: Build, without: readonly string[] = []) {
  const compiled = compile(build);
  const soul = without.reduce((text, line) => text.split(line).join(''), compiled.soul);
  const result = { ...compiled, soul };
  const profile = resolveProfile(build, library);
  return certificateModel({
    result,
    build,
    profile,
    cap: capOf(profile, build),
    skipped: [],
    drops: [],
    decodeWarnings: [],
  });
}

// The limit lines of a dot on the sales and support packs, from the library limit templates
// (limits.json rulesTemplate) at the pack defaults: 30 sends a day (sales) and a 100 refund ceiling
// (support). The dot floors Trades to forbid (docs/DOT-FIX-PLAN.md section 2), so the auto gate that
// W40 is about is Outbound messages (send), which the dot does not floor and which has an auto line.
const SEND_LIMIT_LINE = 'Never send more than 30 outbound messages in one day.';
const REFUND_LIMIT_LINE = library.limits.find((l) => l.id === 'refund_ceiling')!.rulesTemplate.replaceAll('{value}', '100');
const DOT_LIMIT_LINES = [SEND_LIMIT_LINE, REFUND_LIMIT_LINE];

describe('a dot with an auto gate and a limit line missing from its message (W40, B17)', () => {
  const auto = { ...martyOn('chatgpt', 'dot'), packs: ['sales', 'support'], gates: { send: 'auto' as const } };

  it('guards the literal limit lines against the library templates and pack defaults', () => {
    const fill = (id: string, value: number) =>
      library.limits.find((l) => l.id === id)!.rulesTemplate.replaceAll('{value}', String(value));
    expect(library.packs.find((p) => p.id === 'sales')!.limitsDefault).toEqual({ max_sends_per_day: 30 });
    expect(library.packs.find((p) => p.id === 'support')!.limitsDefault).toEqual({ refund_ceiling: 100 });
    expect(DOT_LIMIT_LINES).toEqual([fill('max_sends_per_day', 30), fill('refund_ceiling', 100)]);
  });

  it('ties the auto gate to the missing limits in one summary line', () => {
    const m = modelFor(auto, DOT_LIMIT_LINES);
    const line = m.summary.find((s) => s.key === 'summary-dot-auto');
    expect(line).toBeDefined();
    expect(line!.text).toBe(copy.certificate.summary.dotAutoNoLimits(1));
    // The plan's wording: the dot is asked, not enforcing, and "Ask before taking action" is requested.
    expect(line!.text).toBe(
      'You asked for this one to run without asking, and your dot\'s message has no limits to check it against. Request "Ask before taking action" instead, or add your limits by hand first:',
    );
    expect(line!.items).toEqual([library.gates.find((g) => g.id === 'send')!.label]);
  });

  it('uses the plural wording for several auto gates', () => {
    const several = { ...auto, packs: ['sales', 'devops'], gates: { send: 'auto' as const, deploy: 'auto' as const } };
    const m = modelFor(several, DOT_LIMIT_LINES);
    const line = m.summary.find((s) => s.key === 'summary-dot-auto');
    expect(line!.text).toBe(
      'You asked for these to run without asking, and your dot\'s message has no limits to check them against. Request "Ask before taking action" instead, or add your limits by hand first:',
    );
    // The devops pack's own default puts Rollbacks on auto too (packs/devops.json gatesDefault).
    const label = (id: string) => library.gates.find((g) => g.id === id)!.label;
    expect(line!.items).toEqual([label('send'), label('deploy'), label('rollback')]);
  });

  it('also fires when only one limit line is missing', () => {
    const m = modelFor(auto, [REFUND_LIMIT_LINE]);
    expect(m.summary.some((s) => s.key === 'summary-dot-auto')).toBe(true);
  });

  it('says nothing extra on a real build, whose message carries the limits (B17)', () => {
    const m = modelFor(auto);
    for (const line of DOT_LIMIT_LINES) expect(compile(auto).soul).toContain(line);
    expect(m.summary.some((s) => s.key === 'summary-dot-auto')).toBe(false);
  });

  it('says nothing extra when only pack rules are missing from the message', () => {
    const rules = ['sales', 'support'].flatMap((id) => library.packs.find((p) => p.id === id)!.rulesLines.map((l) => l.line));
    const m = modelFor(auto, rules);
    expect(m.summary.some((s) => s.key === 'summary-dot-auto')).toBe(false);
  });

  it('says nothing extra when no gate is on auto, even with limit lines missing', () => {
    const m = modelFor({ ...auto, gates: {} }, DOT_LIMIT_LINES);
    expect(m.summary.some((s) => s.key === 'summary-dot-auto')).toBe(false);
  });

  it('says nothing extra off the dot, where limits are delivered', () => {
    const build = { ...martyOn('openclaw'), packs: ['sales', 'support'], gates: { send: 'auto' as const } };
    expect(modelFor(build).summary.some((s) => s.key === 'summary-dot-auto')).toBe(false);
  });

  it('says nothing extra for trade on auto: the dot floors it to forbid, so no gate runs on auto', () => {
    // Trade on auto used to be the W40 case. Now it compiles to forbid, carries the floor line, and has
    // no auto gate to tie to a missing limit, even with every limit line taken out of the message.
    const trade = { ...martyOn('chatgpt', 'dot'), gates: { trade: 'auto' as const } };
    expect(compile(trade).gates['trade']).toBe('forbid');
    const m = modelFor(trade, [
      'Never put more than 1% of the account into one trade.',
      'Stop trading for the day once losses reach 3% of the account, and tell the user.',
      'Never place more than 10 trades in one day.',
    ]);
    expect(m.summary.some((s) => s.key === 'summary-dot-auto')).toBe(false);
    expect(m.summary.some((s) => s.key === 'summary-auto')).toBe(false);
    expect(m.summary.some((s) => s.kind === 'floor')).toBe(true);
  });
});

describe('the Limits screen on a dot (B17 removed the W40 note)', () => {
  const OLD_NOTE = "ChatGPT dot can't carry these numbers. Your certificate lists them so you can add them by hand.";

  it('has no dotNote copy any more', () => {
    expect('dotNote' in copy.limits).toBe(false);
  });

  it('shows the limit steppers and no note about the numbers on a dot, and the same on other targets', () => {
    const labels = ['Max size per trade', 'Daily loss limit', 'Max trades per day'];
    for (const [target, mode] of [
      ['chatgpt', 'dot'],
      ['openclaw', undefined],
      ['muse', undefined],
    ] as const) {
      useBuilder.getState().loadBuild(martyOn(target, mode), { from: 'link' });
      useBuilder.getState().go('limits');
      const { container, unmount } = render(<App />);
      const text = container.textContent ?? '';
      for (const label of labels) expect(text, `${target} ${mode ?? ''}`).toContain(label);
      expect(text, `${target} ${mode ?? ''}`).not.toContain(OLD_NOTE);
      expect(text, `${target} ${mode ?? ''}`).not.toMatch(/can't carry these numbers|add them by hand/i);
      unmount();
    }
  });

  it('shows the same notes on a dot as the pack gives it, nothing more', () => {
    useBuilder.getState().loadBuild(martyOn('chatgpt', 'dot'), { from: 'link' });
    useBuilder.getState().go('limits');
    const { container } = render(<App />);
    const venue = library.packs.find((p) => p.id === 'memecoins')?.venueNotes?.['chatgpt-dot'];
    const asides = Array.from(container.querySelectorAll('aside')).map((a) => a.textContent ?? '');
    expect(asides).toHaveLength(venue === undefined ? 0 : 1);
    if (venue !== undefined) expect(asides[0]).toContain(venue.line);
  });
});

describe('the preview strip near the cap (library rule, W40)', () => {
  it('tells screen readers how to shorten when the personality is within 400 of the cap', () => {
    // June on Muse compiles to 3,770 of 4,000: within 400 of the cap and not over it.
    const june = library.roster.find((r) => r.id === 'june')!.build;
    useBuilder.getState().loadBuild(migrate(structuredClone(june), { target: 'muse' }), { from: 'link' });
    useBuilder.getState().go('world');
    const { container } = render(<App />);
    expect(container.textContent).toContain(copy.certificate.meter.hint);
  });

  it('does not show the hint far from the cap', () => {
    const vera = library.roster.find((r) => r.id === 'vera')!.build;
    const build = migrate(structuredClone(vera), { target: 'chatgpt', mode: 'project' });
    expect(compile(build).length).toBeLessThan(8000 - 400);
    useBuilder.getState().loadBuild(build, { from: 'link' });
    useBuilder.getState().go('world');
    const { container } = render(<App />);
    expect(container.textContent).not.toContain(copy.certificate.meter.hint);
  });
});
