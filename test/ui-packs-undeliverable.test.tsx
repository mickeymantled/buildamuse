// @vitest-environment jsdom
//
// Packs the target cannot deliver (M4 fix slice F2). Renders <App/> on the Packs screen in jsdom and
// drives it the way a person would, by role and accessible name, with @testing-library/user-event.
//
// Expected behavior comes from QUESTIONS.md W10 and W35 and the F2 fix brief:
//   - switching target leaves the draft alone, so a pack picked on one target stays in the build on a
//     target that cannot deliver it (the compiler names it as undelivered);
//   - the Packs screen lists every pack the target delivers, plus every pack already in the build,
//     in library order. A picked pack the target cannot deliver carries a note and can be unticked;
//   - an unpicked pack the target cannot deliver stays hidden;
//   - removing a picked pack is always allowed. Adding a pack the target cannot deliver is refused;
//   - a picked pack takes a slot while it is in the build and gives it back when it is removed.
//
// No pack in the library restricts its profiles today, so these tests push one synthetic pack into
// library.packs: a copy of the coding pack that only openclaw delivers. It is removed after every
// test. Pack ids, labels and library order are read from the library JSON, and UI strings are read
// from src/ui/copy.ts, the one home of every UI string. Nothing here is copied from what a screen or
// the compiler happened to output.
//
// Setup shortcuts: the store is seeded through its actions (setTarget, startBlank, setBase,
// togglePack, switchTarget and go) so each test can start on the Packs screen. Every interaction
// under test is a tap.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compile } from '../src/compiler/compile.js';
import { MAX_PACKS } from '../src/compiler/passes/validate.js';
import type { TargetId, WorkflowPack } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import { App } from '../src/ui/App.js';
import { copy } from '../src/ui/copy.js';
import { availablePacks, profileOf } from '../src/ui/flow.js';
import { previewBuild, useBuilder } from '../src/ui/store.js';
import type { BuilderStore } from '../src/ui/store.js';

// ---- The synthetic pack ----

const SYNTH_ID = 'synthetic-openclaw-only';
const SYNTH_LABEL = 'Synthetic openclaw only';

// A copy of the coding pack, renamed, with its line ids moved under the new pack id, delivered by
// openclaw only.
function makeSynthetic(): WorkflowPack {
  const base = library.packs.find((p) => p.id === 'coding');
  if (!base) throw new Error('test setup: library has no coding pack');
  const copyOf = JSON.parse(
    JSON.stringify(base).replaceAll('pack.coding.', `pack.${SYNTH_ID}.`),
  ) as WorkflowPack;
  return { ...copyOf, id: SYNTH_ID, label: SYNTH_LABEL, profiles: ['openclaw'] };
}

function removeSynthetic(): void {
  const at = library.packs.findIndex((p) => p.id === SYNTH_ID);
  if (at >= 0) library.packs.splice(at, 1);
}

// Real packs any target delivers, in library order. Coding is left out because the synthetic pack
// is its copy and the two would share skill ids.
function plainPacks(): WorkflowPack[] {
  return library.packs.filter((p) => p.id !== SYNTH_ID && p.id !== 'coding' && p.profiles === undefined);
}

const TARGETS: TargetId[] = library.targets.targets.map((t) => t.id);
const OTHER_TARGETS = TARGETS.filter((t) => t !== 'openclaw');

// ---- Rendering and driving ----

beforeEach(() => {
  removeSynthetic();
  library.packs.push(makeSynthetic());
  useBuilder.getState().reset();
  // jsdom does not implement scrollTo, and every screen calls it on mount.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  removeSynthetic();
  useBuilder.getState().reset();
});

const st = () => useBuilder.getState();

// Runs a store action inside act so mounted components update cleanly.
function store(fn: (s: BuilderStore) => void): void {
  act(() => {
    fn(useBuilder.getState());
  });
}

// A blank build on openclaw with these packs ticked, in this order. A tick is a pack tap, so the
// packs stop following the chips.
function tickOnOpenclaw(...ids: string[]): void {
  store((s) => {
    s.setTarget('openclaw');
    s.startBlank();
    s.setBase('trader');
    for (const id of ids) s.togglePack(id);
  });
  expect(st().draft.packs, 'setup: the packs are ticked on openclaw').toEqual(ids);
}

// The make-it-for-another-target switch, then the Packs screen.
function switchAndOpenPacks(target: TargetId): void {
  store((s) => {
    s.switchTarget(target);
    s.go('packs');
  });
  expect(st().target).toBe(target);
}

const packsGroup = () => screen.getByRole('group', { name: copy.screens.packs.title });
const card = (label: string) => within(packsGroup()).queryByRole('button', { name: label });
const cardOrFail = (label: string): HTMLButtonElement => {
  const el = card(label);
  if (!el) throw new Error(`no pack card named "${label}" on the Packs screen`);
  return el as HTMLButtonElement;
};
const noteCount = () => screen.queryAllByText(copy.packs.notCarried).length;

// ---- Setup is what the tests think it is ----

describe('the synthetic restricted pack', () => {
  it('the pack cap is 3', () => {
    expect(MAX_PACKS).toBe(3);
  });

  it('openclaw delivers it and every other target does not', () => {
    expect(availablePacks(profileOf({ target: 'openclaw' })).map((p) => p.id)).toContain(SYNTH_ID);
    for (const other of OTHER_TARGETS) {
      expect(availablePacks(profileOf({ target: other })).map((p) => p.id), other).not.toContain(SYNTH_ID);
    }
  });

  it('the note is a plain sentence with no em dash', () => {
    expect(copy.packs.notCarried.length).toBeGreaterThan(0);
    expect(copy.packs.notCarried).not.toContain(String.fromCharCode(0x2014));
  });

  it.each(OTHER_TARGETS)('picked on openclaw and switched to %s, the build keeps it and the compile names it undelivered', (other) => {
    tickOnOpenclaw(SYNTH_ID);
    store((s) => s.switchTarget(other));
    expect(st().draft.packs).toEqual([SYNTH_ID]);
    const undelivered = compile(previewBuild(st())).undelivered.filter((u) => u.kind === 'pack');
    expect(undelivered).toEqual([{ kind: 'pack', id: SYNTH_ID, name: SYNTH_LABEL }]);
  });
});

// ---- A picked pack the target cannot deliver shows, selected, and can be removed ----

describe('a picked pack the target cannot deliver', () => {
  it.each(OTHER_TARGETS)('picked on openclaw, switched to %s: it is on the Packs screen, selected, with the note', (other) => {
    tickOnOpenclaw(SYNTH_ID);
    switchAndOpenPacks(other);
    render(<App />);

    const el = cardOrFail(SYNTH_LABEL);
    expect(el.getAttribute('aria-pressed')).toBe('true');
    expect(el.disabled).toBe(false);
    expect(within(el).getByText(copy.packs.notCarried)).toBeTruthy();
    expect(st().draft.packs).toEqual([SYNTH_ID]);
  });

  it('is listed with every pack this target delivers, in library order, and only it has the note', () => {
    tickOnOpenclaw(SYNTH_ID);
    switchAndOpenPacks('muse');
    render(<App />);

    // Every real pack is deliverable on muse and the synthetic pack was pushed last, so the list is
    // the whole library, in order.
    expect(library.packs.at(-1)?.id).toBe(SYNTH_ID);
    const cards = library.packs.map((p) => cardOrFail(p.label));
    expect(within(packsGroup()).getAllByRole('button')).toHaveLength(library.packs.length);
    for (let i = 1; i < cards.length; i += 1) {
      expect(
        cards[i - 1].compareDocumentPosition(cards[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${library.packs[i - 1].label} comes before ${library.packs[i].label}`,
      ).toBeTruthy();
    }
    expect(noteCount()).toBe(1);
    expect(within(cardOrFail(SYNTH_LABEL)).getByText(copy.packs.notCarried)).toBeTruthy();
    for (const pack of plainPacks()) {
      expect(within(cardOrFail(pack.label)).queryByText(copy.packs.notCarried), pack.label).toBeNull();
    }
  });

  it('counts toward the counter and hides the empty-picks line while it is in the build', () => {
    tickOnOpenclaw(SYNTH_ID);
    switchAndOpenPacks('muse');
    render(<App />);

    expect(screen.getByText(copy.counter(1, MAX_PACKS))).toBeTruthy();
    expect(screen.queryByText(copy.packs.none)).toBeNull();
  });

  it('tapping it removes it from the build and from the list', async () => {
    const user = userEvent.setup();
    tickOnOpenclaw(SYNTH_ID);
    switchAndOpenPacks('muse');
    render(<App />);

    await user.click(cardOrFail(SYNTH_LABEL));

    expect(st().draft.packs).toEqual([]);
    expect(st().touched.packs).toBe(true);
    expect(card(SYNTH_LABEL)).toBeNull();
    expect(noteCount()).toBe(0);
    expect(screen.getByText(copy.counter(0, MAX_PACKS))).toBeTruthy();
    expect(screen.getByText(copy.packs.none)).toBeTruthy();
  });

  it('removing it leaves the other picks and the target alone', async () => {
    const user = userEvent.setup();
    const [a] = plainPacks();
    tickOnOpenclaw(SYNTH_ID, a.id);
    switchAndOpenPacks('muse');
    render(<App />);

    await user.click(cardOrFail(SYNTH_LABEL));

    expect(st().draft.packs).toEqual([a.id]);
    expect(st().target).toBe('muse');
    expect(cardOrFail(a.label).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(copy.counter(1, MAX_PACKS))).toBeTruthy();
  });

  it('keeps the note off a pack that is picked and delivered, and drops it when the target delivers the pack again', async () => {
    const user = userEvent.setup();
    tickOnOpenclaw(SYNTH_ID);
    switchAndOpenPacks('muse');
    render(<App />);
    expect(noteCount()).toBe(1);

    store((s) => s.switchTarget('openclaw'));

    expect(noteCount()).toBe(0);
    expect(cardOrFail(SYNTH_LABEL).getAttribute('aria-pressed')).toBe('true');
    expect(st().draft.packs).toEqual([SYNTH_ID]);

    // Delivered again, so it unticks and re-ticks like any other pack.
    await user.click(cardOrFail(SYNTH_LABEL));
    expect(st().draft.packs).toEqual([]);
    expect(card(SYNTH_LABEL)).not.toBeNull();
    expect(cardOrFail(SYNTH_LABEL).getAttribute('aria-pressed')).toBe('false');
    await user.click(cardOrFail(SYNTH_LABEL));
    expect(st().draft.packs).toEqual([SYNTH_ID]);
  });
});

// ---- A pack the target cannot deliver is hidden until it is picked ----

describe('an unpicked pack the target cannot deliver', () => {
  it.each(OTHER_TARGETS)('is not on the Packs screen on %s', (other) => {
    store((s) => {
      s.setTarget(other);
      s.startBlank();
      s.setBase('trader');
      s.go('packs');
    });
    render(<App />);

    expect(card(SYNTH_LABEL)).toBeNull();
    expect(noteCount()).toBe(0);
    // The packs the target does deliver are all there.
    for (const pack of plainPacks()) expect(card(pack.label), pack.label).not.toBeNull();
  });

  it('is listed without a note on openclaw, which delivers it', () => {
    store((s) => {
      s.setTarget('openclaw');
      s.startBlank();
      s.setBase('trader');
      s.go('packs');
    });
    render(<App />);

    const el = cardOrFail(SYNTH_LABEL);
    expect(el.getAttribute('aria-pressed')).toBe('false');
    expect(noteCount()).toBe(0);
  });

  it.each(OTHER_TARGETS)('is refused by togglePack on %s and nothing changes', (other) => {
    store((s) => {
      s.setTarget(other);
      s.startBlank();
      s.setBase('trader');
    });
    const before = structuredClone({ draft: st().draft, touched: st().touched });

    store((s) => s.togglePack(SYNTH_ID));

    expect({ draft: st().draft, touched: st().touched }).toEqual(before);
    expect(st().draft.packs).not.toContain(SYNTH_ID);
  });

  it('after it is removed, adding it back is still refused and it stays out of the list', async () => {
    const user = userEvent.setup();
    tickOnOpenclaw(SYNTH_ID);
    switchAndOpenPacks('muse');
    render(<App />);
    await user.click(cardOrFail(SYNTH_LABEL));
    expect(st().draft.packs).toEqual([]);

    store((s) => s.togglePack(SYNTH_ID));

    expect(st().draft.packs).toEqual([]);
    expect(card(SYNTH_LABEL)).toBeNull();
    expect(noteCount()).toBe(0);
  });

  it('removal through the store is allowed on a target that cannot deliver the pack, and sets touched', () => {
    tickOnOpenclaw(SYNTH_ID);
    store((s) => s.switchTarget('muse'));
    store((s) => s.togglePack(SYNTH_ID));
    expect(st().draft.packs).toEqual([]);
    expect(st().touched.packs).toBe(true);
  });
});

// ---- Slots ----

describe('slots', () => {
  it('a picked pack the target cannot deliver holds a slot until it is removed, then a third visible pack fits', async () => {
    const user = userEvent.setup();
    const [a, b, c] = plainPacks();
    tickOnOpenclaw(SYNTH_ID, a.id, b.id);
    expect(st().draft.packs).toHaveLength(MAX_PACKS);
    switchAndOpenPacks('muse');
    render(<App />);

    // At the cap, with the undeliverable pack in one of the slots.
    expect(screen.getByText(copy.counter(MAX_PACKS, MAX_PACKS))).toBeTruthy();
    expect(screen.getByText(copy.full)).toBeTruthy();
    await user.click(cardOrFail(c.label));
    expect(st().draft.packs).toEqual([SYNTH_ID, a.id, b.id]);

    // Removing it gives the slot back.
    await user.click(cardOrFail(SYNTH_LABEL));
    expect(st().draft.packs).toEqual([a.id, b.id]);
    expect(screen.getByText(copy.counter(2, MAX_PACKS))).toBeTruthy();
    expect(screen.queryByText(copy.full)).toBeNull();

    // A third visible pack now fits.
    await user.click(cardOrFail(c.label));
    expect(st().draft.packs).toEqual([a.id, b.id, c.id]);
    expect(cardOrFail(c.label).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(copy.counter(MAX_PACKS, MAX_PACKS))).toBeTruthy();
    expect(card(SYNTH_LABEL)).toBeNull();
  });

  it('with one visible pack picked beside it, removing it frees room for two more', async () => {
    const user = userEvent.setup();
    const [a, b, c] = plainPacks();
    tickOnOpenclaw(SYNTH_ID, a.id);
    switchAndOpenPacks('muse');
    render(<App />);

    await user.click(cardOrFail(SYNTH_LABEL));
    await user.click(cardOrFail(b.label));
    await user.click(cardOrFail(c.label));

    expect(st().draft.packs).toEqual([a.id, b.id, c.id]);
  });

  it('at the cap the undeliverable picked pack is not dimmed, and an unpicked pack is', () => {
    const [a, b, c] = plainPacks();
    tickOnOpenclaw(SYNTH_ID, a.id, b.id);
    switchAndOpenPacks('muse');
    render(<App />);

    expect(cardOrFail(SYNTH_LABEL).className).not.toContain('opacity-60');
    expect(cardOrFail(a.label).className).not.toContain('opacity-60');
    expect(cardOrFail(c.label).className).toContain('opacity-60');
  });
});
