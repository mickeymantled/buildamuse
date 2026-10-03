// @vitest-environment jsdom
//
// M4 review gaps (test-gap slice). Five behaviors the first M4 review found untested:
//
//   1. Body order. The certificate body runs in the order of docs/M4-PLAN.md section 5: summary, steps,
//      extra, left out, notes, still checking (ending in the docs link), skipped lines, details, then
//      the meter and the actions. The check reads document order with compareDocumentPosition. A second
//      group of tests proves the check can fail: it reorders a copy of the rendered page and expects a
//      violation to be reported.
//   2. Mine trace negatives (QUESTIONS W28 and W36). The user.mine.* carve-out covers the main
//      personality artifact only. A user.mine id on a spoken memory, skill, routine or first task, on a
//      role personality file, or on any other file must make traceBundle throw, and trace() has no
//      carve-out at all.
//   3. Show more boundary. A group of exactly three blocks shows no Show more (Vera on Muse, Odds on the
//      ChatGPT dot), and a group of more than three does (control).
//   4. Extra section. An artifact no step shows renders under "Also included", exactly once. The test
//      swaps in a synthetic copy of a profile whose install steps do not show the artifact, and puts the
//      real profile back afterwards. Normal builds render no such heading.
//   5. Mine dropped line. The Mine switch says lines were left out only when the 50 line limit dropped
//      some, never at 50 or fewer.
//
// Expected values come from the plan, QUESTIONS and the library, never from running the compiler and
// copying its output:
//   - the order is the plan's section 5 list, and the section headings, button names and sentences are
//     read from src/ui/copy (UI strings) or from the library (install step and gate text);
//   - the limit of 50 Mine lines is W12 text. The cap test also pins that the code's constant says 50;
//   - the group sizes (Vera has three skills, Odds has three skills and two routines) are checked against
//     the chips and packs in the library tables before the page is read.
// Where a test checks that the page shows what the compiler produced (the memory block of the synthetic
// profile), the oracle is compile() on the same build: a rendering check, not a content check.
//
// What jsdom cannot do: it has no layout engine, so "last on the page" is document order, not pixels.
//
// No long dashes appear in this file.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';

import { compile } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { trace, traceBundle } from '../src/compiler/trace.js';
import type { Build, CompileResult, Profile, ProfileId, SpokenItem } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import { MAX_MINE_LINES } from '../src/share/mine.js';
import { App } from '../src/ui/App.js';
import { certificateModelOf } from '../src/ui/certificate/input.js';
import { copy } from '../src/ui/copy.js';
import { useBuilder } from '../src/ui/store.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---- Library lookups ----

function golden(id: string): Build {
  const spec = GOLDEN_SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`test setup: no golden ${id}`);
  return buildFor(spec, library);
}

function rosterEntry(id: string) {
  const found = library.roster.find((r) => r.id === id);
  if (!found) throw new Error(`test setup: no roster entry ${id}`);
  return found;
}

// The hidden Custom GPT mode has no golden. Each starter gets a gpt build here.
function gptBuild(starter: string): Build {
  return migrate(rosterEntry(starter).build, { target: 'chatgpt', mode: 'gpt' });
}

function profileById(id: ProfileId): Profile {
  const found = library.targets.profiles.find((p) => p.id === id);
  if (!found) throw new Error(`test setup: no profile ${id}`);
  return found;
}

function chipOf(id: string) {
  const found = library.chips.find((c) => c.id === id);
  if (!found) throw new Error(`test setup: no chip ${id}`);
  return found;
}

// ---- Store and DOM helpers ----

const st = () => useBuilder.getState();

function store(fn: (s: ReturnType<typeof st>) => void): void {
  act(() => {
    fn(st());
  });
}

// Loads a build as a link (so the app opens on the certificate) and renders the app.
function open(build: Build): void {
  act(() => {
    st().loadBuild(build, { from: 'link' });
  });
  render(<App />);
}

const main = () => screen.getByRole('main');
const textOf = (el: Element) => el.textContent ?? '';
const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;

function h2(root: ParentNode, text: string): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>('h2')).find((h) => textOf(h) === text) ?? null;
}

const blocksIn = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>('[role="group"]'));

// The library profile a test swapped for a synthetic copy is put back by afterEach, even when the test
// throws before it gets to.
const restores: Array<() => void> = [];

// Replaces one profile in the shared library with an edited deep copy. The compiler and the store read
// the same library object, so both see the copy. Returns nothing: afterEach restores it.
function useSyntheticProfile(id: ProfileId, edit: (profile: Profile) => void): void {
  const list = library.targets.profiles;
  const at = list.findIndex((p) => p.id === id);
  if (at < 0) throw new Error(`test setup: no profile ${id}`);
  const original = list[at];
  const synthetic = structuredClone(original);
  edit(synthetic);
  list[at] = synthetic;
  restores.push(() => {
    list[at] = original;
  });
}

beforeEach(() => {
  st().reset();
  window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  while (restores.length > 0) restores.pop()?.();
  st().reset();
  window.history.replaceState(null, '', '/');
});

// ============================================================================
// 1. Body order (docs/M4-PLAN.md section 5)
// ============================================================================

interface Landmark {
  name: string;
  el: HTMLElement;
}

// B follows A in the document and neither holds the other.
const after = (a: Node, b: Node): boolean => a.compareDocumentPosition(b) === FOLLOWING;

// The landmarks of the certificate body, in the order the plan lists them. Plain DOM queries, so the
// same function reads the live page and a detached copy of it. A landmark the page does not show is
// absent from the list.
function landmarksIn(root: HTMLElement): Landmark[] {
  const out: Landmark[] = [];
  const push = (name: string, el: HTMLElement | null | undefined): void => {
    if (el) out.push({ name, el });
  };
  const c = copy.certificate;

  push('summary', h2(root, copy.certificateUi.summaryHeading));
  push('steps', root.querySelector<HTMLElement>('ol'));
  push('extra', h2(root, c.sections.extra));
  push('left out', h2(root, c.groups.leftOut));
  push('notes', h2(root, c.notes));
  const still = h2(root, c.stillChecking.heading);
  push('still checking', still);
  // The docs link ends the Still checking section. It is the one link that opens a new tab.
  push('docs link', root.querySelector<HTMLElement>('a[target="_blank"]'));
  const skippedLine = Array.from(root.querySelectorAll<HTMLElement>('li')).find((li) =>
    Object.values(c.skippedNames).some((name) => textOf(li) === c.skipped(name)),
  );
  push('skipped', skippedLine?.closest('ul') as HTMLElement | null | undefined);
  push('details', root.querySelector<HTMLElement>('details'));
  push('meter', root.querySelector<HTMLElement>('[role="meter"]'));
  push(
    'actions',
    Array.from(root.querySelectorAll<HTMLElement>('button')).find((b) => textOf(b).trim() === copy.buttons.remix),
  );
  return out;
}

// The first pair of neighbors in the list that is out of order, as words, or undefined when the whole
// list is in document order.
function firstViolation(marks: readonly Landmark[]): string | undefined {
  for (let i = 1; i < marks.length; i += 1) {
    if (!after(marks[i - 1].el, marks[i].el)) return `${marks[i].name} does not come after ${marks[i - 1].name}`;
  }
  return undefined;
}

const names = (marks: readonly Landmark[]) => marks.map((m) => m.name);

// What a footer may hold: the actions, and nothing from the body.
function isActionButton(label: string): boolean {
  const makePrefix = copy.makeFor('\u0000').split('\u0000')[0];
  return (
    label.startsWith(copy.actions.copyLink) ||
    label === copy.actions.share ||
    label === copy.actions.downloadZip ||
    label === copy.buttons.remix ||
    label === copy.buttons.buildYourOwn ||
    label.startsWith(makePrefix)
  );
}

const ALL_SEVEN = ['summary', 'steps', 'left out', 'notes', 'still checking', 'skipped', 'details'] as const;

describe('certificate body order', () => {
  // Skipped lines come from the store (a link carries none), so the tests that need them set them.
  function openWithSkips(build: Build): void {
    open(build);
    act(() => {
      useBuilder.setState({ skipped: ['world', 'packs'] });
    });
  }

  it('shows summary, steps, left out, notes, still checking, skipped and details together on Marty on Grok', () => {
    // Without this, the order checks below could pass on a page that lacks the sections they order.
    openWithSkips(golden('marty.grok'));
    const marks = names(landmarksIn(main()));
    for (const name of ALL_SEVEN) expect(marks, `${name} is on the page`).toContain(name);
    expect(marks).toContain('docs link');
    expect(marks).toContain('meter');
    expect(marks).toContain('actions');
  });

  it('puts them in the plan order, then the meter and the actions last (Marty on Grok)', () => {
    openWithSkips(golden('marty.grok'));
    const marks = landmarksIn(main());
    expect(names(marks)).toEqual([
      'summary',
      'steps',
      'left out',
      'notes',
      'still checking',
      'docs link',
      'skipped',
      'details',
      'meter',
      'actions',
    ]);
    expect(firstViolation(marks)).toBeUndefined();
  });

  it('keeps the docs link inside the Still checking section, after its list', () => {
    openWithSkips(golden('marty.grok'));
    const heading = h2(main(), copy.certificate.stillChecking.heading) as HTMLElement;
    const section = heading.closest('section') as HTMLElement;
    const link = section.querySelector<HTMLElement>('a[target="_blank"]') as HTMLElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(after(heading, link)).toBe(true);
    for (const li of Array.from(section.querySelectorAll('li'))) expect(after(li, link)).toBe(true);
  });

  it('puts nothing from the body after the meter, and only actions after it', () => {
    openWithSkips(golden('marty.grok'));
    const meter = main().querySelector('[role="meter"]') as HTMLElement;
    const trailing = Array.from(main().querySelectorAll('h2, h3, pre, details, ol, [role="group"]')).filter((el) =>
      after(meter, el),
    );
    expect(trailing).toEqual([]);
    const buttons = Array.from(main().querySelectorAll('button')).filter((b) => after(meter, b));
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(isActionButton(textOf(b).trim()), `"${textOf(b)}" belongs in the footer`).toBe(true);
  });

  it('puts the closer after the numbered steps and before everything else on Muse', () => {
    open(golden('marty.muse'));
    const closer = profileById('muse').installSteps.find((s) => s.closer === true);
    expect(closer).toBeTruthy();
    const line = Array.from(main().querySelectorAll<HTMLElement>('p')).find((p) => textOf(p) === closer?.line);
    expect(line, 'the closer line is on the page').toBeTruthy();
    const marks = landmarksIn(main());
    const stepsAt = marks.findIndex((m) => m.name === 'steps');
    expect(after(marks[stepsAt].el, line as HTMLElement)).toBe(true);
    for (const m of marks.slice(stepsAt + 1)) expect(after(line as HTMLElement, m.el), m.name).toBe(true);
    expect(firstViolation(marks)).toBeUndefined();
  });

  const SPREAD = ['marty.grok', 'june.grok', 'rook.grok', 'odds.grok', 'marty.muse', 'june.muse', 'rook.hermes', 'marty.chatgpt-dot'];
  it.each(SPREAD)('keeps the plan order on %s', (id) => {
    openWithSkips(golden(id));
    const marks = landmarksIn(main());
    expect(names(marks)).toContain('steps');
    expect(names(marks).slice(-2)).toEqual(['meter', 'actions']);
    expect(firstViolation(marks)).toBeUndefined();
  });

  // The extra section sits between the steps and Left out. No real build has one, so the synthetic
  // profile makes Grok's install steps stop showing the memory and the first task.
  it('puts Also included after the steps and before Left out', () => {
    useSyntheticProfile('grok', (p) => {
      p.installSteps = p.installSteps.map((s) => ({
        ...s,
        shows: s.shows?.filter((k) => k !== 'memory' && k !== 'firstTask'),
      }));
    });
    openWithSkips({ ...golden('marty.grok'), name: 'Synth Order' });
    const marks = landmarksIn(main());
    expect(names(marks)).toEqual([
      'summary',
      'steps',
      'extra',
      'left out',
      'notes',
      'still checking',
      'docs link',
      'skipped',
      'details',
      'meter',
      'actions',
    ]);
    expect(firstViolation(marks)).toBeUndefined();
  });

  // ---- The check can fail. Each case reorders a detached copy of the page. ----

  describe('the order check catches a reordered page', () => {
    function pageCopy(): HTMLElement {
      openWithSkips(golden('marty.grok'));
      const clone = main().cloneNode(true) as HTMLElement;
      // The copy starts in order, so a violation below comes from the move and nothing else.
      expect(firstViolation(landmarksIn(clone))).toBeUndefined();
      return clone;
    }
    const need = (el: Element | null | undefined, what: string): HTMLElement => {
      if (!el) throw new Error(`test setup: no ${what}`);
      return el as HTMLElement;
    };

    it('reports Details moved above Notes', () => {
      const clone = pageCopy();
      const notes = need(h2(clone, copy.certificate.notes)?.closest('section'), 'notes section');
      notes.before(need(clone.querySelector('details'), 'details'));
      const found = firstViolation(landmarksIn(clone));
      expect(found).toBeDefined();
      expect(found).toMatch(/details|notes|still checking|skipped/);
    });

    it('reports the meter moved above the summary', () => {
      const clone = pageCopy();
      const meter = need(clone.querySelector('[role="meter"]')?.parentElement, 'meter');
      need(h2(clone, copy.certificateUi.summaryHeading)?.closest('section'), 'summary section').before(meter);
      expect(firstViolation(landmarksIn(clone))).toBeDefined();
    });

    it('reports Left out moved below the skipped lines', () => {
      const clone = pageCopy();
      const group = need(h2(clone, copy.certificate.groups.leftOut)?.parentElement, 'left out group');
      const skipped = need(landmarksIn(clone).find((m) => m.name === 'skipped')?.el, 'skipped lines');
      skipped.after(group);
      const found = firstViolation(landmarksIn(clone));
      expect(found).toBeDefined();
      expect(found).toMatch(/left out|notes|steps/);
    });

    it('reports the steps moved below the notes', () => {
      const clone = pageCopy();
      const steps = need(clone.querySelector('ol'), 'steps');
      need(h2(clone, copy.certificate.notes)?.closest('section'), 'notes section').after(steps);
      expect(firstViolation(landmarksIn(clone))).toBeDefined();
    });
  });
});

// ============================================================================
// 2. Mine trace negatives (W28, W36)
// ============================================================================

describe('the user.mine trace carve-out is the main personality artifact only', () => {
  const MINE = 'user.mine.1';
  const MINE_HEADING = 'user.mine.heading';

  // A copy of the result with one id appended to a spoken item.
  function withSpokenId(r: CompileResult, at: number, id: string): CompileResult {
    return { ...r, spoken: r.spoken.map((s, i) => (i === at ? { ...s, ids: [...s.ids, id] } : s)) };
  }
  // A copy of the result with the id of the first non-blank line of one file replaced. The text is
  // unchanged, so the file still reconstructs from its lines and only the id can fail.
  function withFileLineId(r: CompileResult, at: number, id: string): CompileResult {
    const file = r.files[at];
    const line = file.lines.findIndex((l) => l.kind !== 'blank');
    if (line < 0) throw new Error('test setup: a file with no lines');
    const lines = file.lines.map((l, i) => (i === line ? { ...l, id } : l));
    return { ...r, files: r.files.map((f, i) => (i === at ? { ...f, lines } : f)) };
  }
  const isMainPersonality = (x: { kind: string; role?: string }): boolean => x.kind === 'personality' && x.role === undefined;

  const spokenAt = (r: CompileResult, kind: SpokenItem['kind']): number => {
    const at = r.spoken.findIndex((s) => s.kind === kind && s.role === undefined);
    if (at < 0) throw new Error(`test setup: no spoken ${kind}`);
    return at;
  };

  const UNKNOWN_MINE = /unknown id "user\.mine\.1"/;

  describe('controls: the carve-out is on for the main personality artifact', () => {
    it('accepts the untouched compile', () => {
      expect(() => traceBundle(compile(golden('marty.muse')), library)).not.toThrow();
    });

    it('accepts user.mine.1 on the personality file', () => {
      const r = compile(golden('marty.muse'));
      const at = r.files.findIndex(isMainPersonality);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(() => traceBundle(withFileLineId(r, at, MINE), library)).not.toThrow();
    });

    it('accepts user.mine.heading on the personality file', () => {
      const r = compile(golden('marty.muse'));
      const at = r.files.findIndex(isMainPersonality);
      expect(() => traceBundle(withFileLineId(r, at, MINE_HEADING), library)).not.toThrow();
    });

    it('accepts user.mine.1 on the spoken personality of the ChatGPT dot', () => {
      const r = compile(golden('marty.chatgpt-dot'));
      const at = spokenAt(r, 'personality');
      expect(() => traceBundle(withSpokenId(r, at, MINE), library)).not.toThrow();
    });
  });

  describe('a user.mine id elsewhere fails the trace', () => {
    // Muse speaks the memory, skills and routines, so one build holds three of the four spoken kinds.
    it.each(['memory', 'skill', 'routine'] as const)('on a spoken %s item (Marty on Muse)', (kind) => {
      const r = compile(golden('marty.muse'));
      expect(() => traceBundle(withSpokenId(r, spokenAt(r, kind), MINE), library)).toThrow(UNKNOWN_MINE);
    });

    it('on a spoken first task (Marty on Grok)', () => {
      const r = compile(golden('marty.grok'));
      expect(() => traceBundle(withSpokenId(r, spokenAt(r, 'firstTask'), MINE), library)).toThrow(UNKNOWN_MINE);
    });

    it('on a spoken item with the heading id too', () => {
      const r = compile(golden('marty.muse'));
      expect(() => traceBundle(withSpokenId(r, spokenAt(r, 'memory'), MINE_HEADING), library)).toThrow(
        /unknown id "user\.mine\.heading"/,
      );
    });

    it('on a role personality file (Marty on OpenClaw with a team)', () => {
      const r = compile(golden('marty.openclaw.roles'));
      const at = r.files.findIndex((f) => f.kind === 'personality' && f.role !== undefined);
      expect(at, 'the team build has a role personality file').toBeGreaterThanOrEqual(0);
      expect(() => traceBundle(withFileLineId(r, at, MINE), library)).toThrow(UNKNOWN_MINE);
    });

    it('on every role personality file of every team golden', () => {
      let checked = 0;
      for (const spec of GOLDEN_SPECS.filter((s) => s.roles !== undefined)) {
        const r = compile(buildFor(spec, library));
        r.files.forEach((f, at) => {
          if (f.kind !== 'personality' || f.role === undefined) return;
          checked += 1;
          expect(() => traceBundle(withFileLineId(r, at, MINE), library), `${spec.id} ${f.path}`).toThrow(UNKNOWN_MINE);
        });
      }
      // Four team goldens, each with a role file per role.
      expect(checked).toBeGreaterThanOrEqual(4);
    });

    it('on the soul lines when checked by trace() alone, which has no carve-out', () => {
      const r = compile(golden('marty.muse'));
      expect(() => trace(r.soul, r.soulLines, library)).not.toThrow();
      const at = r.soulLines.findIndex((l) => l.kind !== 'blank');
      for (const id of [MINE, MINE_HEADING]) {
        const lines = r.soulLines.map((l, i) => (i === at ? { ...l, id } : l));
        expect(() => trace(r.soul, lines, library), id).toThrow(new RegExp(`unknown id "${id.replace(/\./g, '\\.')}"`));
      }
    });

    // The sweep: for every golden build and a gpt build per starter, a user.mine id on any artifact
    // except the main personality fails, so a future artifact kind cannot slip through the carve-out.
    it('on every spoken item and every file except the main personality, across every golden and gpt build', () => {
      const builds: Array<[string, Build]> = [
        ...GOLDEN_SPECS.map((s): [string, Build] => [s.id, buildFor(s, library)]),
        ...library.roster.map((r): [string, Build] => [`${r.id}.chatgpt-gpt`, gptBuild(r.id)]),
      ];
      let spoken = 0;
      let files = 0;
      for (const [id, build] of builds) {
        const r = compile(build);
        r.spoken.forEach((item, at) => {
          if (isMainPersonality(item)) return;
          spoken += 1;
          expect(() => traceBundle(withSpokenId(r, at, MINE), library), `${id} spoken ${item.label}`).toThrow(UNKNOWN_MINE);
        });
        r.files.forEach((f, at) => {
          if (isMainPersonality(f)) return;
          files += 1;
          expect(() => traceBundle(withFileLineId(r, at, MINE), library), `${id} file ${f.path}`).toThrow(UNKNOWN_MINE);
        });
      }
      // Every kind in the task was reached, so the sweep is not empty.
      expect(spoken).toBeGreaterThan(100);
      expect(files).toBeGreaterThan(100);
    });
  });
});

// ============================================================================
// 3. Show more boundary
// ============================================================================

describe('Show more at the three block boundary', () => {
  const showMore = () => screen.queryAllByRole('button', { name: copy.certificate.showMore });
  // The group a heading leads: the heading's parent holds the heading, its blocks and Show more.
  const groupOf = (heading: string): HTMLElement => {
    const el = h2(main(), heading);
    if (!el?.parentElement) throw new Error(`no group headed "${heading}"`);
    return el.parentElement;
  };

  // The skills a build delivers, counted from the library tables: a chip's skills, then the skills of
  // each picked pack. A precondition, so a library change that moves a build off three fails loudly here.
  const skillsFromChips = (b: Build): number => b.chips.reduce((n, id) => n + (chipOf(id).skills?.length ?? 0), 0);

  it('Vera has exactly three skills in the library: the law chip carries three and meetings none', () => {
    const vera = rosterEntry('vera').build;
    expect(skillsFromChips(migrate(vera, { target: 'muse' }))).toBe(3);
  });

  it('shows three skills under Standing instructions on Vera on Muse, and no Show more', () => {
    const build = golden('vera.muse');
    // The bundle holds three skill items and no routine, so the group is exactly full.
    const result = compile(build);
    expect(result.spoken.filter((s) => s.kind === 'skill')).toHaveLength(3);
    expect(result.spoken.filter((s) => s.kind === 'routine')).toHaveLength(0);

    open(build);
    const group = groupOf(copy.certificate.groups.standing);
    expect(blocksIn(group)).toHaveLength(3);
    expect(showMore()).toHaveLength(0);
    expect(within(group).queryByRole('button', { name: copy.certificate.showMore })).toBeNull();
  });

  it('shows three skills under Skills on Odds on the ChatGPT dot, and no Show more anywhere', () => {
    const build = golden('odds.chatgpt-dot');
    const result = compile(build);
    expect(result.spoken.filter((s) => s.kind === 'skill')).toHaveLength(3);

    open(build);
    const group = groupOf(copy.certificate.groups.skills);
    expect(blocksIn(group)).toHaveLength(3);
    // The Routines group beside it holds two, which is under the limit as well.
    expect(blocksIn(groupOf(copy.certificate.groups.routines))).toHaveLength(2);
    expect(showMore()).toHaveLength(0);
  });

  // Controls: the boundary is the fourth block, so a group of four or more does show the button, and
  // tapping it shows every block.
  it('shows Show more on a group of more than three, and tapping it shows them all (control)', () => {
    open(golden('marty.muse'));
    const group = groupOf(copy.certificate.groups.standing);
    const total = compile(golden('marty.muse')).spoken.filter((s) => s.kind === 'skill' || s.kind === 'routine').length;
    expect(total).toBeGreaterThan(3);
    expect(blocksIn(group)).toHaveLength(3);
    const button = within(group).getByRole('button', { name: copy.certificate.showMore });
    act(() => button.click());
    expect(blocksIn(groupOf(copy.certificate.groups.standing))).toHaveLength(total);
    expect(showMore()).toHaveLength(0);
  });

  it('shows exactly three of four skills before Show more on Marty on the ChatGPT dot (control)', () => {
    open(golden('marty.chatgpt-dot'));
    const group = groupOf(copy.certificate.groups.skills);
    expect(blocksIn(group)).toHaveLength(3);
    expect(within(group).getAllByRole('button', { name: copy.certificate.showMore })).toHaveLength(1);
  });
});

// ============================================================================
// 4. Extra section
// ============================================================================

describe('the Also included section', () => {
  const heading = () => h2(main(), copy.certificate.sections.extra);

  it('renders the memory block under Also included when no step shows it, exactly once', () => {
    useSyntheticProfile('muse', (p) => {
      p.installSteps = p.installSteps.map((s) => ({ ...s, shows: s.shows?.filter((k) => k !== 'memory') }));
    });
    const build = { ...golden('marty.muse'), name: 'Synth Memory' };
    open(build);

    const title = heading();
    expect(title, 'the extra heading is on the page').toBeTruthy();
    const section = title?.closest('section') as HTMLElement;
    const block = within(section).getByRole('group', { name: copy.certificate.seed });

    // The text is the memory sentence the compiler built, and it carries the first chip's own seed
    // clause from the library table (without its closing period).
    const memory = compile(build).spoken.find((s) => s.kind === 'memory');
    expect(memory).toBeTruthy();
    expect(textOf(block.querySelector('pre') as Element)).toBe(memory?.text);
    expect(textOf(block)).toContain((chipOf(build.chips[0]).seed ?? '').replace(/\.$/, ''));

    // Once on the whole page, and not under any step.
    expect(screen.getAllByRole('group', { name: copy.certificate.seed })).toHaveLength(1);
    const steps = main().querySelector('ol') as HTMLElement;
    expect(within(steps).queryByRole('group', { name: copy.certificate.seed })).toBeNull();
    expect(after(steps, title as HTMLElement)).toBe(true);
  });

  it('keeps the Skills heading and Show more for skills no step shows, and the other artifacts under their steps', () => {
    useSyntheticProfile('openclaw', (p) => {
      p.installSteps = p.installSteps.map((s) => ({ ...s, shows: s.shows?.filter((k) => k !== 'skills') }));
    });
    const build = { ...golden('marty.openclaw'), name: 'Synth Skills' };
    open(build);

    const section = heading()?.closest('section') as HTMLElement;
    expect(section).toBeTruthy();
    const group = h2(section, copy.certificate.groups.skills)?.parentElement as HTMLElement;
    expect(group, 'the Skills group is in the extra section').toBeTruthy();
    expect(blocksIn(group)).toHaveLength(3);
    expect(within(group).getByRole('button', { name: copy.certificate.showMore })).toBeTruthy();
    // The personality block stays under its step.
    const steps = main().querySelector('ol') as HTMLElement;
    expect(within(steps).getByRole('group', { name: copy.certificate.soul })).toBeTruthy();
    expect(within(section).queryByRole('group', { name: copy.certificate.soul })).toBeNull();
  });

  describe('normal builds render no such heading', () => {
    const builds: Array<[string, Build]> = [
      ...GOLDEN_SPECS.map((s): [string, Build] => [s.id, buildFor(s, library)]),
      ...library.roster.map((r): [string, Build] => [`${r.id}.chatgpt-gpt`, gptBuild(r.id)]),
    ];

    it('has an empty extra list in the model for every golden build and a gpt build per starter', () => {
      expect(builds.length).toBe(GOLDEN_SPECS.length + library.roster.length);
      for (const [id, build] of builds) {
        act(() => {
          st().loadBuild(build, { from: 'link' });
        });
        const model = certificateModelOf(st());
        if ('error' in model) throw new Error(`${id}: ${model.error}`);
        expect(model.extra, id).toEqual([]);
      }
    });

    const onePerProfile: Array<[string, string]> = [
      ['muse', 'marty.muse'],
      ['openclaw', 'marty.openclaw'],
      ['hermes', 'marty.hermes'],
      ['grok', 'marty.grok'],
      ['chatgpt dot', 'marty.chatgpt-dot'],
      ['chatgpt project', 'marty.chatgpt-project'],
      ['chatgpt instructions free', 'marty.chatgpt-instructions-free'],
      ['chatgpt instructions paid', 'marty.chatgpt-instructions-paid'],
      ['marty openclaw with a team', 'marty.openclaw.roles'],
    ];
    it.each(onePerProfile)('does not render the heading on %s', (_name, id) => {
      open(golden(id));
      expect(h2(main(), copy.certificate.sections.extra)).toBeNull();
      expect(screen.queryByRole('heading', { name: copy.certificate.sections.extra })).toBeNull();
    });

    it('does not render the heading on a Custom GPT either', () => {
      open(gptBuild('marty'));
      expect(heading()).toBeNull();
    });
  });
});

// ============================================================================
// 5. Mine switch: the dropped line
// ============================================================================

describe('the Mine switch dropped line', () => {
  const build = golden('june.muse');
  const switchEl = () => screen.getByRole('switch', { name: copy.certificate.mine.label });
  // The switch's own panel: the switch button's parent holds its note and every status line.
  const panel = () => switchEl().parentElement as HTMLElement;
  const pasteOf = (n: number): string =>
    Array.from({ length: n }, (_, i) => `Mine gap check line number ${i + 1}.`).join('\n');
  const LEFT_OUT = /left out/i;

  it('pins the limit at 50 lines (W12)', () => {
    expect(MAX_MINE_LINES).toBe(50);
  });

  it('says nothing was left out when a short paste is kept whole', () => {
    open(build);
    store((s) => s.setPasted(pasteOf(3)));
    expect(screen.getByText(copy.certificate.mine.found(3))).toBeTruthy();
    expect(textOf(panel())).not.toMatch(LEFT_OUT);
    expect(textOf(panel())).not.toContain('The limit is');
    expect(screen.queryByText(copy.certificate.mine.dropped(0, 50))).toBeNull();
  });

  it('says nothing was left out at exactly 50 lines, the last count that fits', () => {
    open(build);
    store((s) => s.setPasted(pasteOf(50)));
    expect(screen.getByText(copy.certificate.mine.found(50))).toBeTruthy();
    expect(textOf(panel())).not.toMatch(LEFT_OUT);
    expect(screen.queryByText(copy.certificate.mine.dropped(0, 50))).toBeNull();
  });

  it('says one line was left out at 51 lines, the first count that does not fit (control)', () => {
    open(build);
    store((s) => s.setPasted(pasteOf(51)));
    expect(screen.getByText(copy.certificate.mine.found(50))).toBeTruthy();
    expect(screen.getByText(copy.certificate.mine.dropped(1, 50))).toBeTruthy();
    expect(textOf(panel())).toMatch(LEFT_OUT);
  });

  it('keeps the line away with the switch on and off, and with Mine on at 50 lines', () => {
    open(build);
    store((s) => s.setPasted(pasteOf(50)));
    store((s) => s.setMineOn(true));
    expect(switchEl().getAttribute('aria-checked')).toBe('true');
    expect(textOf(panel())).not.toMatch(LEFT_OUT);
    store((s) => s.setMineOn(false));
    expect(textOf(panel())).not.toMatch(LEFT_OUT);
  });

  it('takes the line away again when the paste shrinks back under the limit', () => {
    open(build);
    store((s) => s.setPasted(pasteOf(55)));
    expect(screen.getByText(copy.certificate.mine.dropped(5, 50))).toBeTruthy();
    store((s) => s.setPasted(pasteOf(40)));
    expect(textOf(panel())).not.toMatch(LEFT_OUT);
    expect(screen.queryByText(copy.certificate.mine.dropped(5, 50))).toBeNull();
  });
});
