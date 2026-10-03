// @vitest-environment jsdom
//
// UI flow tests (M3 slice 3.19b). Renders <App/> in jsdom and drives it the way a person would, by
// role and accessible name, with @testing-library/user-event.
//
// Expected behavior comes from docs/UI-PLAN.md, docs/Build-a-Bot-v2-Brief.md Part E, the spec's
// Screens section, QUESTIONS.md (U1 to U11, V29) and the library JSON. UI strings are read from
// src/ui/copy.ts, which the plan names as the one home of every UI string. Nothing here is copied
// from what a screen happened to render. Where a precondition needs the build's compiled length,
// it comes from compile() through the store's own selectors, and is checked against a library cap.
//
// Setup shortcuts: a few tests seed the store through its actions (setTarget, startBlank, setBase,
// toggleChip and go) so they can start on a given screen. Every interaction under test is a tap.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import library from '../src/library/index.js';
import { App } from '../src/ui/App.js';
import { copy } from '../src/ui/copy.js';
import type { ScreenId } from '../src/ui/flow.js';
import { capOf, compiled, isCompileError, useBuilder } from '../src/ui/store.js';
import type { BuilderStore } from '../src/ui/store.js';
import type { BaseId, ChatgptMode, Level, Plan, Stats, TargetId } from '../src/compiler/types.js';

// ---- Library lookups (labels and lines are read from the library, never typed in here) ----

const ALL_SCREENS: readonly ScreenId[] = [
  'target',
  'roster',
  'base',
  'world',
  'packs',
  'limits',
  'gates',
  'stats',
  'peeves',
  'heart',
  'outfit',
  'roles',
  'name',
  'certificate',
];

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`library has no ${what}`);
  return value;
}

const targetLabel = (id: TargetId) =>
  must(library.targets.targets.find((t) => t.id === id), `target ${id}`).label;
const modeLabel = (mode: ChatgptMode) =>
  must(
    must(library.targets.targets.find((t) => t.id === 'chatgpt'), 'chatgpt').modes?.find((m) => m.id === mode),
    `mode ${mode}`,
  ).label;
const baseLabel = (id: string) => must(library.bases.find((b) => b.id === id), `base ${id}`).label;
const chipLabel = (id: string) => must(library.chips.find((c) => c.id === id), `chip ${id}`).label;
const packLabel = (id: string) => must(library.packs.find((p) => p.id === id), `pack ${id}`).label;
const peeveOf = (id: string) => must(library.peeves.find((p) => p.id === id), `peeve ${id}`);
const hardPartOf = (id: string) =>
  must(library.heart.hardParts.find((h) => h.id === id), `hard part ${id}`);
const outfitOf = (id: string) => must(library.outfits.find((o) => o.id === id), `outfit ${id}`);
const gateLabel = (id: string) => must(library.gates.find((g) => g.id === id), `gate ${id}`).label;
const profileById = (id: string) =>
  must(library.targets.profiles.find((p) => p.id === id), `profile ${id}`);

function profileIdFor(target: TargetId, mode?: ChatgptMode): string {
  return target === 'chatgpt' ? `chatgpt-${mode ?? 'dot'}` : target;
}

function libraryCap(profileId: string, plan: Plan = 'free'): number {
  const cap = profileById(profileId).lengthCap;
  return typeof cap === 'number' ? cap : cap[plan];
}

// Work chips, then Markets chips, in library order. The first ones are used as picks.
const WORK_CHIPS = library.chips.filter((c) => c.group === 'Work').map((c) => c.id);
const MARKETS_CHIPS = library.chips.filter((c) => c.group === 'Markets').map((c) => c.id);
// Peeves with no dedupe: tapping one never shows "already built in".
const PLAIN_PEEVES = library.peeves.filter((p) => !p.dedupesWith).map((p) => p.id);

// ---- Rendering and driving ----

type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  useBuilder.getState().reset();
  // jsdom does not implement scrollTo, and every screen calls it on mount.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useBuilder.getState().reset();
});

// Runs a store action inside act so mounted components update cleanly.
function store(fn: (s: BuilderStore) => void): void {
  act(() => {
    fn(useBuilder.getState());
  });
}

interface Seed {
  target?: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
  base?: BaseId;
  chips?: readonly string[];
  packs?: readonly string[];
  go?: ScreenId;
}

// Puts the store on a blank build with a target, base and picks, then jumps to a screen.
function seed(o: Seed = {}): void {
  store((s) => {
    s.setTarget(o.target ?? 'muse', o.mode, o.plan);
    s.startBlank();
    s.setBase(o.base ?? 'trader');
    for (const chip of o.chips ?? []) s.toggleChip(chip);
    for (const pack of o.packs ?? []) s.togglePack(pack);
    s.go(o.go ?? 'base');
  });
}

const TITLE_TO_SCREEN = new Map<string, ScreenId>(
  (Object.keys(copy.screens) as ScreenId[]).map((id) => [copy.screens[id].title, id]),
);

// Which screen is showing, read from its level 1 heading.
function currentScreen(): ScreenId {
  const heading = screen.getByRole('heading', { level: 1 });
  const id = TITLE_TO_SCREEN.get(heading.textContent ?? '');
  if (!id) throw new Error(`unknown screen heading "${heading.textContent}"`);
  return id;
}

interface Seen {
  screen: ScreenId;
  textboxes: number;
  fields: number;
}
let seen: Seen[] = [];

// Records the screen and how many text inputs it renders.
function snap(): ScreenId {
  const id = currentScreen();
  seen.push({
    screen: id,
    textboxes: screen.queryAllByRole('textbox').length,
    fields: document.querySelectorAll('input, textarea, select, [contenteditable]').length,
  });
  return id;
}

beforeEach(() => {
  seen = [];
});

const nextButton = () => screen.getByRole('button', { name: copy.buttons.next });
const skipButton = () => screen.queryByRole('button', { name: copy.buttons.skip });

// The primary button keeps its focus and uses aria-disabled while blocked.
function isBlocked(el: HTMLElement): boolean {
  return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
}

async function next(user: User): Promise<ScreenId> {
  await user.click(nextButton());
  return snap();
}

// Taps Next until the given screen shows. Fails if Next stops moving.
async function nextTo(user: User, id: ScreenId): Promise<void> {
  for (let i = 0; i < ALL_SCREENS.length && currentScreen() !== id; i++) await next(user);
  expect(currentScreen()).toBe(id);
}

async function chooseTarget(
  user: User,
  target: TargetId,
  opts: { mode?: ChatgptMode; plan?: Plan } = {},
): Promise<void> {
  await user.click(screen.getByRole('radio', { name: targetLabel(target) }));
  if (opts.mode) await user.click(screen.getByRole('radio', { name: modeLabel(opts.mode) }));
  if (opts.plan) await user.click(screen.getByRole('radio', { name: copy.target.plans[opts.plan] }));
  await next(user); // roster
}

async function buildYourOwn(user: User): Promise<void> {
  await user.click(screen.getByRole('button', { name: copy.buttons.buildYourOwn }));
  snap(); // base
}

const pressed = () => screen.queryAllByRole('button', { pressed: true });

const rolesSwitch = () => screen.queryByRole('switch', { name: copy.roles.toggle });

interface FlowPicks {
  name: string;
  base: string;
  workChips: string[];
  marketsChip: string;
  peeve: string;
  hardPart: string;
  outfit: string;
}

// Taps from the target screen to the certificate on a blank build.
async function runFullFlow(
  user: User,
  o: { target?: TargetId; roles?: boolean; name?: string } = {},
): Promise<FlowPicks> {
  const picks: FlowPicks = {
    name: o.name ?? 'Zephyr',
    base: 'trader',
    workChips: WORK_CHIPS.slice(0, 2),
    marketsChip: MARKETS_CHIPS[0],
    peeve: 'adds_disclaimers',
    hardPart: 'forget',
    outfit: 'staff_engineer',
  };
  snap(); // target
  await chooseTarget(user, o.target ?? 'muse');
  await buildYourOwn(user);
  await user.click(screen.getByRole('radio', { name: baseLabel(picks.base) }));
  await next(user); // world
  for (const id of [...picks.workChips, picks.marketsChip]) {
    await user.click(screen.getByRole('button', { name: chipLabel(id) }));
  }
  await next(user); // packs
  if (o.roles) await user.click(must(rolesSwitch() ?? undefined, 'roles switch on screen'));
  for (let guard = 0; currentScreen() !== 'name' && guard < ALL_SCREENS.length; guard++) {
    const at = currentScreen();
    if (at === 'peeves') {
      await user.click(screen.getByRole('button', { name: peeveOf(picks.peeve).label }));
    }
    if (at === 'heart') {
      await user.click(screen.getByRole('radio', { name: hardPartOf(picks.hardPart).label }));
    }
    if (at === 'outfit') {
      await user.click(screen.getByRole('radio', { name: outfitOf(picks.outfit).card }));
    }
    await next(user);
  }
  await user.type(screen.getByRole('textbox', { name: copy.name.label }), picks.name);
  await next(user); // certificate
  return picks;
}

const statSum = (s: Stats): number =>
  s.blunt + s.warm + s.funny + s.chatty + s.proactive + (s.risk ?? 0);

// ---- 1. Full flow, blank build ----

describe('full flow, blank build', () => {
  it('taps from target to the certificate, and the personality text holds the typed name', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(snap()).toBe('target');

    await user.click(screen.getByRole('radio', { name: targetLabel('muse') }));
    expect(await next(user)).toBe('roster');
    await user.click(screen.getByRole('button', { name: copy.buttons.buildYourOwn }));
    expect(snap()).toBe('base');

    const trader = baseLabel('trader');
    await user.click(screen.getByRole('radio', { name: trader }));
    expect(screen.getByRole('radio', { name: trader }).getAttribute('aria-checked')).toBe('true');
    expect(await next(user)).toBe('world');

    const [work1, work2] = WORK_CHIPS;
    const markets = MARKETS_CHIPS[0];
    for (const id of [work1, work2, markets]) {
      await user.click(screen.getByRole('button', { name: chipLabel(id) }));
    }
    expect(pressed().map((b) => b.textContent)).toEqual(
      expect.arrayContaining([chipLabel(work1), chipLabel(work2), chipLabel(markets)]),
    );
    expect(screen.getByText(copy.counter(3, 6))).toBeTruthy();

    // Packs follow the chips (the memecoins chip brings the memecoins pack), and the memecoins pack
    // exposes limit chips and a trade gate, so limits and gates both show.
    expect(await next(user)).toBe('packs');
    expect(
      screen.getByRole('button', { name: packLabel('memecoins'), pressed: true }),
    ).toBeTruthy();
    expect(await next(user)).toBe('limits');
    expect(await next(user)).toBe('gates');

    expect(await next(user)).toBe('stats');
    // A Markets chip is tapped, so the Risk slider exists now.
    expect(screen.getByRole('radiogroup', { name: copy.stats.labels.risk })).toBeTruthy();

    expect(await next(user)).toBe('peeves');
    const peeve = peeveOf('adds_disclaimers');
    await user.click(screen.getByRole('button', { name: peeve.label }));

    expect(await next(user)).toBe('heart');
    const hardPart = hardPartOf('forget');
    await user.click(screen.getByRole('radio', { name: hardPart.label }));

    expect(await next(user)).toBe('outfit');
    const outfit = outfitOf('staff_engineer');
    await user.click(screen.getByRole('radio', { name: outfit.card }));

    // Roles are off by default, so outfit goes straight to the name.
    expect(await next(user)).toBe('name');
    expect(isBlocked(nextButton())).toBe(true);
    await user.type(screen.getByRole('textbox', { name: copy.name.label }), 'Zephyr');
    expect(isBlocked(nextButton())).toBe(false);
    expect(await next(user)).toBe('certificate');

    // The certificate placeholder shows the compiled personality text.
    const block = screen.getByRole('heading', { name: copy.certificate.soul, level: 2 }).parentElement;
    const soul = block?.querySelector('pre')?.textContent ?? '';
    expect(soul).toContain('Zephyr');
    // Spec: the name is the first word of Who you are, then the outfit anchor.
    expect(soul).toContain(`Zephyr. ${outfit.anchor}`);
    expect(soul).toContain(must(library.chassis.headings.find((h) => h.id === 'heading.who'), 'who').text);
    // The chassis opening line, the tapped peeve's library line and the hard part's drive line.
    const opening = must(library.chassis.lines.find((l) => l.id === 'chassis.opening.1'), 'opening').line;
    expect(soul).toContain(opening);
    expect(soul).toContain(must(peeve.line, 'peeve line'));
    const d1 = must(library.heart.drives.find((d) => d.id === hardPart.d1), 'd1 drive').line;
    expect(soul).toContain(d1);
    // The seed block is the memory sentence the user says to Muse.
    const seedBlock = screen.getByRole('heading', { name: copy.certificate.seed, level: 2 }).parentElement;
    expect(seedBlock?.querySelector('pre')?.textContent).toMatch(/^Remember that /);

    expect(seen.map((s) => s.screen)).toEqual([
      'target',
      'roster',
      'base',
      'world',
      'packs',
      'limits',
      'gates',
      'stats',
      'peeves',
      'heart',
      'outfit',
      'name',
      'certificate',
    ]);
  });

  it('shows no Risk slider when no Markets chip is tapped', async () => {
    seed({ chips: [WORK_CHIPS[0]], go: 'stats' });
    render(<App />);
    expect(screen.queryByRole('radiogroup', { name: copy.stats.labels.risk })).toBeNull();
    expect(screen.getByRole('radiogroup', { name: copy.stats.labels.blunt })).toBeTruthy();
  });
});

// ---- 2. Tap-only ----

describe('tap-only', () => {
  it('renders exactly one textbox across every screen, and only on the name screen', async () => {
    const user = userEvent.setup();
    render(<App />);
    // OpenClaw supports roles; memecoins has limits, a gate and a role set. Roles on adds the roles screen.
    await runFullFlow(user, { target: 'openclaw', roles: true });

    expect(new Set(seen.map((s) => s.screen))).toEqual(new Set(ALL_SCREENS));
    for (const s of seen) {
      const expected = s.screen === 'name' ? 1 : 0;
      expect(s.textboxes, `textboxes on ${s.screen}`).toBe(expected);
      expect(s.fields, `input fields on ${s.screen}`).toBe(expected);
    }
    expect(seen.filter((s) => s.textboxes > 0).map((s) => s.screen)).toEqual(['name']);
    // The text field is gone again on the certificate.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('keeps the limits steppers off the text-field path (buttons and a read-only value)', () => {
    seed({ chips: [MARKETS_CHIPS[0]], go: 'limits' });
    render(<App />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });
});

// ---- 3. Required screens ----

describe('required screens', () => {
  it('blocks Next on target until a pick', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(isBlocked(nextButton())).toBe(true);
    await user.click(nextButton());
    expect(currentScreen()).toBe('target');

    await user.click(screen.getByRole('radio', { name: targetLabel('muse') }));
    expect(isBlocked(nextButton())).toBe(false);
    await user.click(nextButton());
    expect(currentScreen()).toBe('roster');
  });

  it('blocks Next on base until a pick', async () => {
    const user = userEvent.setup();
    render(<App />);
    await chooseTarget(user, 'muse');
    await buildYourOwn(user);
    expect(currentScreen()).toBe('base');
    expect(isBlocked(nextButton())).toBe(true);
    await user.click(nextButton());
    expect(currentScreen()).toBe('base');

    await user.click(screen.getByRole('radio', { name: baseLabel('builder') }));
    expect(isBlocked(nextButton())).toBe(false);
    await user.click(nextButton());
    expect(currentScreen()).toBe('world');
  });

  it('blocks Next on name while the trimmed name is empty', async () => {
    const user = userEvent.setup();
    seed({ go: 'name' });
    render(<App />);
    expect(currentScreen()).toBe('name');
    const box = screen.getByRole('textbox', { name: copy.name.label });
    expect(isBlocked(nextButton())).toBe(true);

    // setName applies cleanName (W24): a run of whitespace collapses to one space, so three typed
    // spaces leave one. The trimmed name is still empty, so Next stays blocked.
    await user.type(box, '   ');
    expect((box as HTMLInputElement).value).toBe(' ');
    expect(isBlocked(nextButton())).toBe(true);
    await user.click(nextButton());
    expect(currentScreen()).toBe('name');

    await user.type(box, 'Ab');
    expect(isBlocked(nextButton())).toBe(false);

    await user.clear(box);
    expect(isBlocked(nextButton())).toBe(true);
  });

  it('caps the name at 24 characters', async () => {
    const user = userEvent.setup();
    seed({ go: 'name' });
    render(<App />);
    const box = screen.getByRole('textbox', { name: copy.name.label }) as HTMLInputElement;
    await user.type(box, 'x'.repeat(30));
    expect(box.value.length).toBeLessThanOrEqual(24);
    expect(useBuilder.getState().draft.name.length).toBeLessThanOrEqual(24);
    expect(isBlocked(nextButton())).toBe(false);
  });

  it.each(['target', 'roster', 'base', 'name'] as const)('has no Skip on %s', (id) => {
    if (id === 'target') {
      render(<App />);
    } else {
      seed({ go: id });
      render(<App />);
    }
    expect(currentScreen()).toBe(id);
    expect(skipButton()).toBeNull();
  });

  it.each(['world', 'packs', 'stats', 'peeves', 'heart', 'outfit'] as const)(
    'has Skip on %s',
    (id) => {
      seed({ go: id });
      render(<App />);
      expect(currentScreen()).toBe(id);
      expect(skipButton()).not.toBeNull();
    },
  );

  // The plan extends skip to the v2 screens: world, packs, limits, gates, stats, peeves, heart, outfit, roles.
  it.each(['limits', 'gates', 'roles'] as const)('has Skip on %s (UI-PLAN)', (id) => {
    seed({ target: 'openclaw', chips: [MARKETS_CHIPS[0]], go: id });
    render(<App />);
    expect(currentScreen()).toBe(id);
    expect(skipButton()).not.toBeNull();
  });

  it('Skip moves on, keeps the defaults and records the screen as skipped (S9)', async () => {
    const user = userEvent.setup();
    seed({ go: 'world' });
    render(<App />);
    await user.click(must(skipButton() ?? undefined, 'skip button'));
    expect(currentScreen()).toBe('packs');
    expect(useBuilder.getState().skipped).toContain('world');
    expect(useBuilder.getState().draft.chips).toEqual([]);
  });
});

// ---- 4. Caps through the UI ----

describe('caps through the UI', () => {
  it('a 7th chip tap leaves 6 selected, and shows full', async () => {
    const user = userEvent.setup();
    seed({ go: 'world' });
    render(<App />);
    const seven = WORK_CHIPS.slice(0, 7);
    for (const id of seven.slice(0, 6)) {
      await user.click(screen.getByRole('button', { name: chipLabel(id) }));
    }
    expect(pressed()).toHaveLength(6);
    expect(screen.getByText(copy.counter(6, 6))).toBeTruthy();
    expect(screen.getByText(copy.full)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: chipLabel(seven[6]) }));
    expect(pressed()).toHaveLength(6);
    expect(screen.getByRole('button', { name: chipLabel(seven[6]) }).getAttribute('aria-pressed')).toBe('false');
    expect(useBuilder.getState().draft.chips).toHaveLength(6);

    // A tapped chip can still be taken back at the cap.
    await user.click(screen.getByRole('button', { name: chipLabel(seven[0]) }));
    expect(pressed()).toHaveLength(5);
    expect(screen.queryByText(copy.full)).toBeNull();
  });

  it('a 6th peeve tap leaves 5 selected', async () => {
    const user = userEvent.setup();
    seed({ go: 'peeves' });
    render(<App />);
    const six = PLAIN_PEEVES.slice(0, 6);
    expect(six).toHaveLength(6);
    for (const id of six.slice(0, 5)) {
      await user.click(screen.getByRole('button', { name: peeveOf(id).label }));
    }
    expect(pressed()).toHaveLength(5);
    expect(screen.getByText(copy.counter(5, 5))).toBeTruthy();
    expect(screen.getByText(copy.full)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: peeveOf(six[5]).label }));
    expect(pressed()).toHaveLength(5);
    expect(useBuilder.getState().draft.peeves).toHaveLength(5);
    expect(useBuilder.getState().draft.peeves).not.toContain(six[5]);
  });

  it('shows "already built in" on a picked peeve that the chassis already covers', async () => {
    const user = userEvent.setup();
    seed({ go: 'peeves' });
    render(<App />);
    const builtIn = must(library.peeves.find((p) => p.dedupesWith?.some((id) => id.startsWith('chassis.'))), 'built-in peeve');
    expect(screen.queryByText(copy.alreadyBuiltIn)).toBeNull();
    await user.click(screen.getByRole('button', { name: builtIn.label }));
    expect(screen.getAllByText(copy.alreadyBuiltIn).length).toBeGreaterThan(0);
  });

  it('a 4th pack tap leaves 3 selected', async () => {
    const user = userEvent.setup();
    seed({ go: 'packs' });
    render(<App />);
    const four = library.packs.slice(0, 4).map((p) => p.id);
    expect(four).toHaveLength(4);
    for (const id of four.slice(0, 3)) {
      await user.click(screen.getByRole('button', { name: packLabel(id) }));
    }
    expect(pressed()).toHaveLength(3);
    expect(screen.getByText(copy.counter(3, 3))).toBeTruthy();

    await user.click(screen.getByRole('button', { name: packLabel(four[3]) }));
    expect(pressed()).toHaveLength(3);
    expect(useBuilder.getState().draft.packs).toHaveLength(3);
    expect(useBuilder.getState().draft.packs).not.toContain(four[3]);
  });

  describe('stats at a total of 14', () => {
    async function fillToFourteen(user: User): Promise<void> {
      // Professional starts at 3, 2, 1, 2, 2 (total 10). Funny to 4 and chatty to 3 make 14.
      const funny = screen.getByRole('radiogroup', { name: copy.stats.labels.funny });
      await user.click(within(funny).getAllByRole('radio')[3]);
      const chatty = screen.getByRole('radiogroup', { name: copy.stats.labels.chatty });
      await user.click(within(chatty).getAllByRole('radio')[2]);
    }

    it('shows full, and an up move on any slider does not change the total', async () => {
      const user = userEvent.setup();
      seed({ base: 'professional', go: 'stats' });
      render(<App />);
      expect(statSum(must(useBuilder.getState().draft.stats, 'stats'))).toBe(10);
      await fillToFourteen(user);

      expect(statSum(must(useBuilder.getState().draft.stats, 'stats'))).toBe(14);
      expect(screen.getByText(copy.counter(14, 14))).toBeTruthy();
      expect(screen.getByText(copy.full)).toBeTruthy();

      const stats: Array<keyof typeof copy.stats.labels> = ['blunt', 'warm', 'funny', 'chatty', 'proactive'];
      let tried = 0;
      for (const stat of stats) {
        const group = screen.getByRole('radiogroup', { name: copy.stats.labels[stat] });
        const radios = within(group).getAllByRole('radio');
        const at = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
        if (at < 0 || at >= radios.length - 1) continue; // already at the top
        await user.click(radios[at + 1]);
        tried += 1;
        const after = within(group).getAllByRole('radio');
        expect(after.findIndex((r) => r.getAttribute('aria-checked') === 'true'), `${stat} level`).toBe(at);
        expect(statSum(must(useBuilder.getState().draft.stats, 'stats')), `${stat} total`).toBe(14);
        expect(screen.getByText(copy.counter(14, 14))).toBeTruthy();
      }
      // Most sliders have room above them, so the loop really tried up moves.
      expect(tried).toBeGreaterThanOrEqual(3);
    });

    it('still allows a move down at full, and full goes away', async () => {
      const user = userEvent.setup();
      seed({ base: 'professional', go: 'stats' });
      render(<App />);
      await fillToFourteen(user);
      expect(screen.getByText(copy.full)).toBeTruthy();

      const blunt = screen.getByRole('radiogroup', { name: copy.stats.labels.blunt });
      await user.click(within(blunt).getAllByRole('radio')[1]); // blunt 3 down to 2
      expect(statSum(must(useBuilder.getState().draft.stats, 'stats'))).toBe(13);
      expect(screen.getByText(copy.counter(13, 14))).toBeTruthy();
      expect(screen.queryByText(copy.full)).toBeNull();
    });
  });
});

// ---- 5. Floors through the UI ----

describe('floors through the UI', () => {
  it('Blunt and Warm have no level below 1, and the floor line shows at 1', async () => {
    const user = userEvent.setup();
    // Trader starts at blunt 3 and warm 1, so the floor line is already there for Warm only.
    seed({ base: 'trader', go: 'stats' });
    render(<App />);
    expect(screen.getAllByText(copy.floorLine)).toHaveLength(1);

    const blunt = screen.getByRole('radiogroup', { name: copy.stats.labels.blunt });
    const warm = screen.getByRole('radiogroup', { name: copy.stats.labels.warm });
    expect(within(blunt).getAllByRole('radio')).toHaveLength(4);
    expect(within(warm).getAllByRole('radio')).toHaveLength(4);

    // Blunt down to its first stop: level 1, and now the line shows for both.
    await user.click(within(blunt).getAllByRole('radio')[0]);
    expect(within(blunt).getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true');
    expect(useBuilder.getState().draft.stats?.blunt).toBe(1);
    expect(screen.getAllByText(copy.floorLine)).toHaveLength(2);

    // Raising it takes the line away from that slider.
    await user.click(within(blunt).getAllByRole('radio')[2]);
    expect(useBuilder.getState().draft.stats?.blunt).toBe(3);
    expect(screen.getAllByText(copy.floorLine)).toHaveLength(1);
  });

  it('pressing the lower arrow key at level 1 keeps Warm and Blunt at 1', async () => {
    const user = userEvent.setup();
    seed({ base: 'trader', go: 'stats' });
    render(<App />);
    const warm = screen.getByRole('radiogroup', { name: copy.stats.labels.warm });
    const first = within(warm).getAllByRole('radio')[0];
    expect(first.getAttribute('aria-checked')).toBe('true');
    first.focus();
    await user.keyboard('{ArrowLeft}{ArrowDown}{Home}');
    expect(within(warm).getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true');
    expect(useBuilder.getState().draft.stats?.warm).toBe(1);
    expect(screen.getAllByText(copy.floorLine).length).toBeGreaterThan(0);
  });

  it('the store refuses a level below 1 for Blunt and Warm, and the screen does not change', () => {
    seed({ base: 'trader', go: 'stats' });
    render(<App />);
    store((s) => {
      s.setStat('warm', 0 as unknown as Level);
      s.setStat('blunt', 0 as unknown as Level);
    });
    const stats = must(useBuilder.getState().draft.stats, 'stats');
    expect(stats.warm).toBe(1);
    expect(stats.blunt).toBe(3);
    const warm = screen.getByRole('radiogroup', { name: copy.stats.labels.warm });
    expect(within(warm).getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByText(copy.floorLine)).toHaveLength(1);
  });

  it('shows the floor line only under Blunt and Warm, not under the other sliders', () => {
    // Trader has chatty 1 as well. The line is for the two stats that can never go lower.
    seed({ base: 'trader', go: 'stats' });
    render(<App />);
    const chatty = screen.getByRole('radiogroup', { name: copy.stats.labels.chatty });
    expect(within(chatty).getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByText(copy.floorLine)).toHaveLength(1);
  });
});

// ---- 6. Gates ----

describe('gates', () => {
  const MEMECOINS = { chips: ['memecoins'], go: 'gates' } as const;

  it('locks the pay row at forbid, and tapping Auto on it changes nothing', async () => {
    const user = userEvent.setup();
    seed({ ...MEMECOINS });
    render(<App />);
    const group = screen.getByRole('radiogroup', { name: gateLabel('pay') });
    const checked = () =>
      within(screen.getByRole('radiogroup', { name: gateLabel('pay') }))
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-checked'));
    expect(checked()).toEqual(['false', 'false', 'true']); // auto, approve, forbid
    expect(screen.getByText(copy.gates.payLocked)).toBeTruthy();

    await user.click(within(group).getByRole('radio', { name: copy.gates.settings.auto }));
    expect(checked()).toEqual(['false', 'false', 'true']);
    await user.click(within(group).getByRole('radio', { name: copy.gates.settings.approve }));
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(useBuilder.getState().draft.gates.pay).toBeUndefined();
  });

  it('lets a non-pay row change (so the lock test is not vacuous)', async () => {
    const user = userEvent.setup();
    seed({ ...MEMECOINS });
    render(<App />);
    const trades = screen.getByRole('radiogroup', { name: gateLabel('trade') });
    // Brief Part D: trade defaults to approve.
    expect(within(trades).getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    await user.click(within(trades).getByRole('radio', { name: copy.gates.settings.auto }));
    expect(
      within(screen.getByRole('radiogroup', { name: gateLabel('trade') }))
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-checked')),
    ).toEqual(['true', 'false', 'false']);
    expect(useBuilder.getState().draft.gates.trade).toBe('auto');
  });

  it.each([
    ['muse', undefined],
    ['openclaw', undefined],
    ['hermes', undefined],
    ['grok', undefined],
    ['chatgpt', 'dot'],
    ['chatgpt', 'project'],
    ['chatgpt', 'instructions'],
  ] as const)('shows the per-target gates line for %s %s', (target, mode) => {
    seed({ target, mode, ...MEMECOINS });
    render(<App />);
    const profileId = profileIdFor(target, mode) as keyof typeof copy.gatesCopy;
    expect(screen.getByText(copy.gatesCopy[profileId])).toBeTruthy();
    // Exactly one gates line shows, never another target's.
    for (const [id, line] of Object.entries(copy.gatesCopy)) {
      if (id !== profileId && line !== copy.gatesCopy[profileId]) {
        expect(screen.queryByText(line), `line for ${id}`).toBeNull();
      }
    }
  });

  it('labels the three options Auto, Approve and Forbid on Muse', () => {
    seed({ target: 'muse', ...MEMECOINS });
    render(<App />);
    const trades = screen.getByRole('radiogroup', { name: gateLabel('trade') });
    expect(within(trades).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      copy.gates.settings.auto,
      copy.gates.settings.approve,
      copy.gates.settings.forbid,
    ]);
  });

  it('uses the library customRuleSettings as the option labels on ChatGPT dot, with its note', () => {
    seed({ target: 'chatgpt', ...MEMECOINS });
    render(<App />);
    const dot = profileById('chatgpt-dot');
    const labels = must(dot.customRuleSettings, 'dot customRuleSettings');
    for (const id of ['trade', 'pay']) {
      const group = screen.getByRole('radiogroup', { name: gateLabel(id) });
      expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual([
        labels.auto,
        labels.approve,
        labels.forbid,
      ]);
    }
    // The generic labels are not used on dot.
    expect(screen.queryByRole('radio', { name: copy.gates.settings.auto })).toBeNull();
    // The library's dot note ("Hand off means ...") shows beside the gates.
    for (const note of must(dot.notes, 'dot notes')) expect(screen.getByText(note.line)).toBeTruthy();
  });

  describe('Paid steer on ChatGPT Custom instructions', () => {
    async function remixMartyOnFreeInstructions(user: User): Promise<void> {
      render(<App />);
      await chooseTarget(user, 'chatgpt', { mode: 'instructions' });
      // The Free plan is the default for Custom instructions.
      await user.click(screen.getByRole('button', { name: `${copy.buttons.remix} Marty` }));
      expect(snap()).toBe('base');
      expect(screen.getByRole('radio', { name: baseLabel('trader') }).getAttribute('aria-checked')).toBe('true');
      await nextTo(user, 'gates');
    }

    it('shows on the Free plan with a gate-heavy pick, and its button switches to Paid', async () => {
      const user = userEvent.setup();
      await remixMartyOnFreeInstructions(user);

      // Precondition (QUESTIONS V29): Marty's remix is over the free cap of 1,500.
      const state = useBuilder.getState();
      expect(state.plan).toBe('free');
      const result = compiled(state);
      if (isCompileError(result)) throw new Error(result.error);
      expect(libraryCap('chatgpt-instructions', 'free')).toBe(1500);
      expect(result.length).toBeGreaterThan(1500);

      expect(screen.getByText(copy.target.paidSteer)).toBeTruthy();
      await user.click(screen.getByRole('button', { name: copy.gates.switchToPaid }));
      expect(useBuilder.getState().plan).toBe('paid');
      expect(screen.queryByText(copy.target.paidSteer)).toBeNull();
      expect(screen.queryByRole('button', { name: copy.gates.switchToPaid })).toBeNull();
      expect(currentScreen()).toBe('gates');
    });

    it('does not show once the plan is Paid', async () => {
      const user = userEvent.setup();
      render(<App />);
      await chooseTarget(user, 'chatgpt', { mode: 'instructions', plan: 'paid' });
      await user.click(screen.getByRole('button', { name: `${copy.buttons.remix} Marty` }));
      await nextTo(user, 'gates');
      expect(useBuilder.getState().plan).toBe('paid');
      expect(screen.queryByText(copy.target.paidSteer)).toBeNull();
    });

    it('does not show on ChatGPT Project, which has no free plan cap', async () => {
      const user = userEvent.setup();
      render(<App />);
      await chooseTarget(user, 'chatgpt', { mode: 'project' });
      await user.click(screen.getByRole('button', { name: `${copy.buttons.remix} Marty` }));
      await nextTo(user, 'gates');
      expect(screen.queryByText(copy.target.paidSteer)).toBeNull();
    });
  });
});

// ---- 7. Roles ----

describe('roles', () => {
  const TARGET_MODES = [
    ['muse', undefined],
    ['openclaw', undefined],
    ['hermes', undefined],
    ['grok', undefined],
    ['chatgpt', 'dot'],
    ['chatgpt', 'project'],
    ['chatgpt', 'instructions'],
  ] as const;

  it.each(TARGET_MODES)(
    'shows the advanced switch only when the profile supports roles: %s %s',
    (target, mode) => {
      seed({ target, mode, chips: ['memecoins'], go: 'packs' });
      render(<App />);
      const supports = profileById(profileIdFor(target, mode)).supportsRoles;
      expect(rolesSwitch() !== null).toBe(supports);
    },
  );

  it('has no advanced switch on chatgpt-dot, even with a pack that has a role set', () => {
    seed({ target: 'chatgpt', chips: ['memecoins'], go: 'packs' });
    render(<App />);
    expect(profileById('chatgpt-dot').supportsRoles).toBe(false);
    expect(useBuilder.getState().draft.packs).toContain('memecoins');
    expect(rolesSwitch()).toBeNull();
  });

  it('is off by default', () => {
    seed({ target: 'openclaw', chips: ['memecoins'], go: 'packs' });
    render(<App />);
    expect(must(rolesSwitch() ?? undefined, 'switch').getAttribute('aria-checked')).toBe('false');
    expect(useBuilder.getState().advancedRoles).toBe(false);
  });

  it('on openclaw, turning it on shows the roles screen after outfit', async () => {
    const user = userEvent.setup();
    seed({ target: 'openclaw', chips: ['memecoins'], go: 'packs' });
    render(<App />);
    await user.click(must(rolesSwitch() ?? undefined, 'switch'));
    expect(must(rolesSwitch() ?? undefined, 'switch').getAttribute('aria-checked')).toBe('true');

    await nextTo(user, 'outfit');
    expect(await next(user)).toBe('roles');
    // The role set the memecoins pack belongs to is the trading desk.
    const trading = must(library.roleSets.find((s) => s.id === 'trading'), 'trading set');
    expect(trading.packs).toContain('memecoins');
    expect(screen.getByRole('heading', { name: trading.label, level: 2 })).toBeTruthy();
    expect(await next(user)).toBe('name');
  });

  it('with the switch off, outfit goes straight to name', async () => {
    const user = userEvent.setup();
    seed({ target: 'openclaw', chips: ['memecoins'], go: 'packs' });
    render(<App />);
    await nextTo(user, 'outfit');
    expect(await next(user)).toBe('name');
    expect(seen.map((s) => s.screen)).not.toContain('roles');
  });

  describe('the roles screen', () => {
    async function openRoles(user: User): Promise<void> {
      seed({ target: 'openclaw', chips: ['memecoins'], go: 'packs' });
      render(<App />);
      await user.click(must(rolesSwitch() ?? undefined, 'switch'));
      await nextTo(user, 'roles');
    }
    const trading = () => must(library.roleSets.find((s) => s.id === 'trading'), 'trading set');
    const roleLabel = (id: string) => must(library.roles.find((r) => r.id === id), `role ${id}`).label;

    it('cannot turn the coordinator off', async () => {
      const user = userEvent.setup();
      await openRoles(user);
      const coordinator = trading().coordinator;
      const card = () => screen.getByRole('button', { name: roleLabel(coordinator) });
      expect(card().getAttribute('aria-pressed')).toBe('true');
      expect((card() as HTMLButtonElement).disabled).toBe(true);

      await user.click(card());
      expect(card().getAttribute('aria-pressed')).toBe('true');
      expect(useBuilder.getState().draft.roles).toContain(coordinator);
    });

    it('keeps the coordinator when another role is toggled on and off', async () => {
      const user = userEvent.setup();
      await openRoles(user);
      const coordinator = trading().coordinator;
      const executor = roleLabel('executor');

      // Brief Part D: trading sets never include the executor by default.
      expect(screen.getByRole('button', { name: executor }).getAttribute('aria-pressed')).toBe('false');
      await user.click(screen.getByRole('button', { name: executor }));
      expect(screen.getByRole('button', { name: executor }).getAttribute('aria-pressed')).toBe('true');
      expect(useBuilder.getState().draft.roles).toEqual(expect.arrayContaining([coordinator, 'executor']));

      await user.click(screen.getByRole('button', { name: executor }));
      expect(screen.getByRole('button', { name: executor }).getAttribute('aria-pressed')).toBe('false');
      expect(useBuilder.getState().draft.roles).toContain(coordinator);
      expect(useBuilder.getState().draft.roles).not.toContain('executor');
      expect(screen.getByRole('button', { name: roleLabel(coordinator) }).getAttribute('aria-pressed')).toBe('true');
    });

    it('turning the switch off again drops the roles screen from the flow', async () => {
      const user = userEvent.setup();
      seed({ target: 'openclaw', chips: ['memecoins'], go: 'packs' });
      render(<App />);
      await user.click(must(rolesSwitch() ?? undefined, 'switch'));
      await user.click(must(rolesSwitch() ?? undefined, 'switch'));
      expect(must(rolesSwitch() ?? undefined, 'switch').getAttribute('aria-checked')).toBe('false');
      await nextTo(user, 'outfit');
      expect(await next(user)).toBe('name');
    });
  });
});

// ---- 8. Preview strip ----

describe('preview strip', () => {
  const strip = () => screen.queryByRole('region', { name: copy.preview.title });

  it.each(['world', 'packs', 'limits', 'gates', 'stats', 'peeves', 'heart', 'outfit'] as const)(
    'shows on %s',
    (id) => {
      seed({ chips: ['memecoins'], go: id });
      render(<App />);
      expect(currentScreen()).toBe(id);
      expect(strip()).not.toBeNull();
    },
  );

  it('shows on roles (UI-PLAN, QUESTIONS U11)', () => {
    seed({ target: 'openclaw', chips: ['memecoins'], go: 'roles' });
    render(<App />);
    expect(currentScreen()).toBe('roles');
    expect(strip()).not.toBeNull();
  });

  it.each(['target', 'roster', 'base', 'name'] as const)('does not show on %s', (id) => {
    if (id === 'target') {
      render(<App />);
    } else {
      seed({ chips: ['memecoins'], go: id });
      render(<App />);
    }
    expect(currentScreen()).toBe(id);
    expect(strip()).toBeNull();
  });

  it('does not show on the certificate (stations 2 to 6 only)', () => {
    seed({ chips: ['memecoins'], go: 'certificate' });
    render(<App />);
    expect(currentScreen()).toBe('certificate');
    expect(strip()).toBeNull();
  });

  it('shows the compiled length against the profile cap, and updates when a pick changes it', async () => {
    const user = userEvent.setup();
    seed({ chips: ['memecoins'], go: 'peeves' });
    render(<App />);
    const lengthOf = () => {
      const r = compiled(useBuilder.getState());
      if (isCompileError(r)) throw new Error(r.error);
      return r.length;
    };
    const cap = libraryCap('muse');
    expect(cap).toBe(4000);
    expect(capOf(useBuilder.getState())).toBe(cap);

    const before = lengthOf();
    expect(strip()?.textContent).toContain(copy.preview.length(before, cap));

    // A peeve with its own library line adds a line, so the length grows and the strip follows.
    await user.click(screen.getByRole('button', { name: peeveOf('adds_disclaimers').label }));
    const after = lengthOf();
    expect(after).toBeGreaterThan(before);
    expect(strip()?.textContent).toContain(copy.preview.length(after, cap));
    expect(strip()?.textContent).not.toContain(copy.preview.length(before, cap));
  });

  it('says how far over the cap it is (free Custom instructions, cap 1,500)', () => {
    seed({ target: 'chatgpt', mode: 'instructions', plan: 'free', chips: ['memecoins'], go: 'stats' });
    store((s) => s.remixStarter('marty'));
    store((s) => s.go('stats'));
    render(<App />);
    const r = compiled(useBuilder.getState());
    if (isCompileError(r)) throw new Error(r.error);
    const cap = libraryCap('chatgpt-instructions', 'free');
    expect(cap).toBe(1500);
    expect(r.length).toBeGreaterThan(cap);
    const text = strip()?.textContent ?? '';
    expect(text).toContain(copy.preview.length(r.length, cap));
    expect(text).toContain(copy.preview.over(r.length - cap));
  });

  it('shows the badge that just lit, and clears it when the screen changes', async () => {
    const user = userEvent.setup();
    // Parent starts at blunt 2. The library's No Menu badge lights at blunt 3 or more, with no chip needed.
    seed({ base: 'parent', go: 'stats' });
    render(<App />);
    const noMenu = must(library.badges.find((b) => b.id === 'badge.no_menu'), 'No Menu badge');
    expect(noMenu.when).toEqual({ stat: 'blunt', gte: 3 });
    expect(useBuilder.getState().draft.stats?.blunt).toBe(2);
    expect(strip()?.textContent).not.toContain(noMenu.name);

    const blunt = screen.getByRole('radiogroup', { name: copy.stats.labels.blunt });
    await user.click(within(blunt).getAllByRole('radio')[2]); // blunt 3
    expect(strip()?.textContent).toContain(noMenu.name);
    expect(strip()?.textContent).toContain(copy.preview.badgeLit);

    // Moving to another screen starts the strip clean.
    await user.click(nextButton());
    expect(currentScreen()).toBe('peeves');
    expect(strip()?.textContent).not.toContain(noMenu.name);
  });

  describe('peek', () => {
    async function openPeek(user: User): Promise<void> {
      const bar = within(must(strip() ?? undefined, 'strip')).getByRole('button', { expanded: false });
      await user.click(bar);
    }

    // The open panel, found through the bar's aria-controls (the disclosure pattern), so the content
    // tests do not depend on which role the panel carries.
    function peekPanel(): HTMLElement {
      const bar = within(must(strip() ?? undefined, 'strip')).getByRole('button', { expanded: true });
      const id = must(bar.getAttribute('aria-controls') ?? undefined, 'aria-controls on the open bar');
      return must(document.getElementById(id) ?? undefined, 'peek panel');
    }

    it('opens a sheet with the chassis label and a chassis line from the library', async () => {
      const user = userEvent.setup();
      seed({ chips: ['memecoins'], go: 'stats' });
      render(<App />);
      expect(within(must(strip() ?? undefined, 'strip')).queryByText(copy.preview.chassisLabel)).toBeNull();
      await openPeek(user);

      const panel = peekPanel();
      expect(within(panel).getByText(copy.preview.chassisLabel)).toBeTruthy();
      const text = panel.textContent ?? '';
      const chassis = library.chassis.lines.filter(
        (l) => text.includes(l.line) || (l.short !== undefined && text.includes(l.short)),
      );
      expect(chassis.length).toBeGreaterThan(0);
    });

    // Found by 3.19b; lead fix in BottomSheet: the open panel is a modal dialog named by its title.
    it('exposes the open sheet as a dialog', async () => {
      const user = userEvent.setup();
      seed({ chips: ['memecoins'], go: 'stats' });
      render(<App />);
      await openPeek(user);
      const dialog = screen.getByRole('dialog', { name: copy.preview.title });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(within(dialog).getByText(copy.preview.chassisLabel)).toBeTruthy();
    });

    it('mutes the chassis lines and not the lines the build chose', async () => {
      const user = userEvent.setup();
      seed({ chips: ['memecoins'], go: 'stats' });
      render(<App />);
      await openPeek(user);
      const panel = peekPanel();
      const para = (needle: string) =>
        Array.from(panel.querySelectorAll('p')).find((p) => p.textContent?.includes(needle));
      const tiebreak = must(library.chassis.lines.find((l) => l.id === 'chassis.want.tiebreak'), 'tiebreak');
      const chassisPara = must(
        para(tiebreak.line) ?? para(must(tiebreak.short, 'short form')),
        'tiebreak line in the sheet',
      );
      expect(chassisPara.className).toMatch(/muted/);
      const level = useBuilder.getState().draft.stats?.blunt;
      const blunt = must(library.stats.find((r) => r.stat === 'blunt' && r.level === level), 'blunt line');
      const stat = must(para(blunt.line), 'blunt stat line in the sheet');
      expect(stat.className).not.toMatch(/muted/);
    });

    it('closes on Escape', async () => {
      const user = userEvent.setup();
      seed({ chips: ['memecoins'], go: 'stats' });
      render(<App />);
      await openPeek(user);
      expect(peekPanel()).toBeTruthy();
      await user.keyboard('{Escape}');
      const bar = within(must(strip() ?? undefined, 'strip')).getByRole('button', { expanded: false });
      expect(bar.getAttribute('aria-controls')).toBeNull();
      expect(within(must(strip() ?? undefined, 'strip')).queryByText(copy.preview.chassisLabel)).toBeNull();
      expect(document.body.textContent).not.toContain(copy.preview.chassisLabel);
    });
  });
});

// ---- 9. Roster ----

describe('roster', () => {
  async function toRoster(user: User): Promise<void> {
    render(<App />);
    await chooseTarget(user, 'muse');
    expect(currentScreen()).toBe('roster');
  }

  it('shows nine starter cards', async () => {
    const user = userEvent.setup();
    await toRoster(user);
    expect(library.roster).toHaveLength(9);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(9);
    for (const entry of library.roster) {
      expect(screen.getByRole('article', { name: entry.build.name })).toBeTruthy();
      expect(screen.getByRole('button', { name: `${copy.buttons.use} ${entry.build.name}` })).toBeTruthy();
      expect(screen.getByRole('button', { name: `${copy.buttons.remix} ${entry.build.name}` })).toBeTruthy();
    }
  });

  it('offers both doors: Pick a starter and Build your own', async () => {
    const user = userEvent.setup();
    await toRoster(user);
    expect(screen.getByRole('group', { name: copy.buttons.pickStarter })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.buttons.buildYourOwn })).toBeTruthy();
    // There is no Next on the roster: the two doors are the way on.
    expect(screen.queryByRole('button', { name: copy.buttons.next })).toBeNull();
  });

  it.each(library.roster.map((e) => [e.build.name, e.id, e.build.base] as const))(
    'Use %s lands on the certificate with that name',
    async (name, id) => {
      const user = userEvent.setup();
      await toRoster(user);
      await user.click(screen.getByRole('button', { name: `${copy.buttons.use} ${name}` }));
      expect(currentScreen()).toBe('certificate');
      const entry = must(library.roster.find((e) => e.id === id), 'roster entry');
      const soul = screen.getByRole('heading', { name: copy.certificate.soul, level: 2 }).parentElement
        ?.querySelector('pre')?.textContent;
      expect(soul).toContain(entry.build.name);
    },
  );

  it.each(library.roster.map((e) => [e.build.name, e.build.base] as const))(
    'Remix %s lands on base with that starter\'s base selected',
    async (name, base) => {
      const user = userEvent.setup();
      await toRoster(user);
      await user.click(screen.getByRole('button', { name: `${copy.buttons.remix} ${name}` }));
      expect(currentScreen()).toBe('base');
      for (const b of library.bases) {
        expect(screen.getByRole('radio', { name: b.label }).getAttribute('aria-checked'), b.label).toBe(
          b.id === base ? 'true' : 'false',
        );
      }
      // Next is open, since a base is picked.
      expect(isBlocked(nextButton())).toBe(false);
    },
  );

  it('Build your own goes to base with nothing picked', async () => {
    const user = userEvent.setup();
    await toRoster(user);
    await buildYourOwn(user);
    expect(currentScreen()).toBe('base');
    for (const b of library.bases) {
      expect(screen.getByRole('radio', { name: b.label }).getAttribute('aria-checked')).toBe('false');
    }
  });
});

// ---- 10. No storage ----

describe('no storage', () => {
  it('writes nothing to localStorage, sessionStorage or document.cookie during a full flow', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    const cookieWrite = vi.spyOn(Document.prototype, 'cookie', 'set');

    render(<App />);
    await runFullFlow(user, { target: 'muse' });
    expect(currentScreen()).toBe('certificate');

    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(cookieWrite).not.toHaveBeenCalled();
    // And nothing got in by another route.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('writes nothing on a starter path either (Use on the roster)', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cookieWrite = vi.spyOn(Document.prototype, 'cookie', 'set');
    render(<App />);
    await chooseTarget(user, 'openclaw');
    await user.click(screen.getByRole('button', { name: `${copy.buttons.use} Marty` }));
    expect(currentScreen()).toBe('certificate');
    expect(setItem).not.toHaveBeenCalled();
    expect(cookieWrite).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
