// @vitest-environment jsdom
// Lead additions at the M4 close (QUESTIONS W40): a dot that runs a gate on auto with no limits to
// check is told so in one line; the Limits screen says a dot can't carry the numbers; the preview strip
// shows the near-cap state the certificate meter shows.

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

function modelFor(build: Build) {
  const result = compile(build);
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

describe('a dot with an auto gate and no limits to check (W40)', () => {
  it('ties the auto gate to the missing limits in one summary line', () => {
    const build = { ...martyOn('chatgpt', 'dot'), gates: { trade: 'auto' as const } };
    const m = modelFor(build);
    const line = m.summary.find((s) => s.key === 'summary-dot-auto');
    expect(line).toBeDefined();
    expect(line!.text).toBe(copy.certificate.summary.dotAutoNoLimits(1));
    expect(line!.items).toEqual([library.gates.find((g) => g.id === 'trade')!.label]);
  });

  it('says nothing extra when no gate is on auto', () => {
    const m = modelFor(martyOn('chatgpt', 'dot'));
    expect(m.summary.some((s) => s.key === 'summary-dot-auto')).toBe(false);
  });

  it('says nothing extra off the dot, where limits are delivered', () => {
    const build = { ...martyOn('openclaw'), gates: { trade: 'auto' as const } };
    expect(modelFor(build).summary.some((s) => s.key === 'summary-dot-auto')).toBe(false);
  });
});

describe('the Limits screen on a dot (W40)', () => {
  it('says a dot cannot carry the numbers, and says nothing on other targets', () => {
    const s = useBuilder.getState();
    s.loadBuild(martyOn('chatgpt', 'dot'), { from: 'link' });
    useBuilder.getState().go('limits');
    const { container, unmount } = render(<App />);
    expect(container.textContent).toContain(copy.limits.dotNote);
    unmount();

    useBuilder.getState().loadBuild(martyOn('openclaw'), { from: 'link' });
    useBuilder.getState().go('limits');
    const other = render(<App />);
    expect(other.container.textContent).not.toContain(copy.limits.dotNote);
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
