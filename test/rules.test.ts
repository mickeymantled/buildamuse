// @vitest-environment jsdom
//
// Rules test: every row of the if-this-then-this table (docs/Build-a-Muse-Compiler-Library-v1.md,
// "If-this-then-this") expressed as a build and an assertion.
//
// UI rules: the frontend runs these on every tap or slide. They were it.todo rows until the M3 UI
// existed. Each row now drives the real app (<App/> in jsdom, store actions to seed a screen, taps
// through user-event or the screen's own controls) and asserts what the row says. The row text is the
// test name, with the old "(M2 UI)" tag dropped because nothing is deferred. Expected values come from
// the library doc's table, the library JSON (base defaults, chip groups, badge conditions, caps) and
// QUESTIONS.md; UI strings are read from src/ui/copy.ts. The one wording change is U4 (QUESTIONS):
// the floor line says "bot" where the library row says "Muse".
// Readings pinned here:
//   - "chips = 6 -> grid disables further taps" and "peeves = 5 -> same": the grid refuses the tap
//     (the store keeps 6 and 5) and shows the counter and "full". The chip is dimmed, not given the
//     disabled attribute, so a tapped chip can still be taken back at the cap.
//   - "length > 3,200 -> meter goes amber, tooltip": the library row was written for a 3,600 cap, and
//     the compiler now has one cap per profile. The meter's near state is 400 characters under the cap,
//     the same margin as that row (3,200 of 3,600), strictly greater, and not over the cap. The hint is
//     copy.certificate.meter.hint ("drop a chip to shorten"). The amber is a class, which jsdom cannot
//     paint, so the test reads the class name and the hint.
//
// Emit rules (compiler) get one it per row, named with the row text, exercising the actual compile()
// output.

import { createElement } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compile, library } from '../src/compiler/compile.js';
import type { BaseId, BuildV1, Library, StatId } from '../src/compiler/types.js';
import { App } from '../src/ui/App.js';
import { certificateModelOf } from '../src/ui/certificate/input.js';
import { copy } from '../src/ui/copy.js';
import type { ScreenId } from '../src/ui/flow.js';
import { compiled, isCompileError, useBuilder } from '../src/ui/store.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// Builds a valid Build with sane defaults (stats sum well under the cap, no risk unless a
// Markets chip and stats.risk are both supplied, a hard part whose own d1 is used unless
// overridden). Every field can be overridden per test.
function makeBuild(opts: {
  base?: BuildV1['base'];
  chips?: string[];
  stats?: Partial<BuildV1['stats']>;
  peeves?: string[];
  hardPart?: string;
  d1?: string;
  d2?: string;
  outfit?: string;
  name?: string;
} = {}): BuildV1 {
  return {
    v: 1,
    base: opts.base ?? 'trader',
    chips: opts.chips ?? [],
    stats: {
      blunt: 2,
      warm: 2,
      funny: 2,
      chatty: 2,
      proactive: 2,
      ...opts.stats,
    },
    peeves: opts.peeves ?? [],
    heart: {
      hardPart: (opts.hardPart ?? 'calmer') as BuildV1['heart']['hardPart'],
      d1: opts.d1 ?? 'd1.calmer',
      d2: opts.d2 ?? 'd2.blunt.2',
    },
    outfit: opts.outfit ?? 'butler',
    name: opts.name ?? 'Test',
  };
}

// ---- UI rules: helpers ----

const st = () => useBuilder.getState();

function store(fn: (s: ReturnType<typeof st>) => void): void {
  act(() => {
    fn(st());
  });
}

const renderApp = () => render(createElement(App));
const textOf = (el: Element) => el.textContent ?? '';
const STATS_NO_RISK = ['blunt', 'warm', 'funny', 'chatty', 'proactive'] as const;

// A blank build on Muse, with a base and chips picked the way the flow would, parked on a screen.
function seed(o: { base?: BaseId; chips?: readonly string[]; go: ScreenId }): void {
  store((s) => {
    s.reset();
    s.setTarget('muse');
    s.startBlank();
    if (o.base !== undefined) s.setBase(o.base);
    for (const chip of o.chips ?? []) s.toggleChip(chip);
    s.go(o.go);
  });
}

const baseOf = (id: BaseId) => {
  const found = library.bases.find((b) => b.id === id);
  if (!found) throw new Error(`test setup: no base ${id}`);
  return found;
};
const chipOf = (id: string) => {
  const found = library.chips.find((c) => c.id === id);
  if (!found) throw new Error(`test setup: no chip ${id}`);
  return found;
};
const MARKETS_CHIPS = library.chips.filter((c) => c.group === 'Markets');
const WORK_CHIPS = library.chips.filter((c) => c.group === 'Work');
// Peeves with no dedupe: tapping one never changes what the screen shows beyond its own pick.
const PLAIN_PEEVES = library.peeves.filter((p) => !p.dedupesWith);

const sliderGroup = (stat: StatId) => screen.queryByRole('radiogroup', { name: copy.stats.labels[stat] });
const sliderRadios = (stat: StatId) => {
  const group = sliderGroup(stat);
  if (!group) throw new Error(`no ${stat} slider on the screen`);
  return within(group).getAllByRole('radio');
};
// The level the slider shows as picked, 1 to 4.
const sliderLevel = (stat: StatId): number =>
  sliderRadios(stat).findIndex((r) => r.getAttribute('aria-checked') === 'true') + 1;
const statTotal = (): number => Object.values(st().draft.stats ?? {}).reduce<number>((n, v) => n + (v ?? 0), 0);
const chipButton = (label: string) => screen.getByRole('button', { name: label });
const pressedButtons = () => screen.queryAllByRole('button', { pressed: true });

beforeEach(() => {
  st().reset();
  // jsdom does not implement scrollTo, and every screen calls it on mount.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  st().reset();
});

describe('UI rules', () => {
  // The frontend runs these on every tap or slide. Each row is named from the library doc's table and
  // drives the real app.

  it('base chosen -> stats set to base defaults; chip group for that base shown first', async () => {
    const user = userEvent.setup();
    store((s) => {
      s.setTarget('muse');
      s.startBlank();
    });
    renderApp();
    expect(library.bases.length).toBeGreaterThanOrEqual(2);

    for (const base of library.bases) {
      store((s) => s.go('base'));
      await user.click(screen.getByRole('radio', { name: base.label }));
      expect(st().draft.base).toBe(base.id);
      // The table: stats go to the base's defaults (five stats, no risk).
      expect(st().draft.stats, base.id).toEqual(base.defaults);

      store((s) => s.go('stats'));
      for (const stat of STATS_NO_RISK) expect(sliderLevel(stat), `${base.id} ${stat}`).toBe(base.defaults[stat]);
      expect(sliderGroup('risk'), `${base.id} has no risk without a Markets chip`).toBeNull();

      // The base's chip group leads, and all four groups are still there.
      store((s) => s.go('world'));
      const groups = screen.getAllByRole('heading', { level: 3 }).map(textOf);
      expect(groups[0], `${base.id} leads with ${base.chipsFirst}`).toBe(copy.groups[base.chipsFirst]);
      expect([...groups].sort()).toEqual(Object.values(copy.groups).sort());
    }

    // Choosing another base after moving a slider puts the stats back to the new base's defaults.
    const [a, b] = library.bases;
    const moved = a.defaults.funny === 1 ? 2 : 1;
    store((s) => s.go('base'));
    await user.click(screen.getByRole('radio', { name: a.label }));
    store((s) => s.setStat('funny', moved));
    expect(st().draft.stats?.funny).toBe(moved);
    await user.click(screen.getByRole('radio', { name: b.label }));
    expect(st().draft.stats).toEqual(b.defaults);
  });

  it('any Markets chip tapped -> Risk slider appears, default 2, cap stays 14', async () => {
    const user = userEvent.setup();
    expect(MARKETS_CHIPS.length).toBeGreaterThan(1);

    // Every Markets chip adds risk at 2, and no chip of another group does.
    for (const chip of library.chips) {
      store((s) => {
        s.reset();
        s.setTarget('muse');
        s.startBlank();
        s.setBase('trader');
        s.toggleChip(chip.id);
      });
      if (chip.group === 'Markets') expect(st().draft.stats?.risk, chip.id).toBe(2);
      else expect(st().draft.stats?.risk, chip.id).toBeUndefined();
    }

    // On the screen: no Risk slider before the tap, and one at level 2 after it.
    seed({ base: 'trader', go: 'stats' });
    renderApp();
    expect(sliderGroup('risk')).toBeNull();
    expect(screen.getByText(copy.stats.riskHint)).toBeTruthy();
    store((s) => s.go('world'));
    await user.click(chipButton(MARKETS_CHIPS[0].label));
    store((s) => s.go('stats'));
    expect(sliderGroup('risk')).not.toBeNull();
    expect(sliderLevel('risk')).toBe(2);
    // The cap stays 14: the budget counts the risk points against it.
    const total = STATS_NO_RISK.reduce((n, stat) => n + baseOf('trader').defaults[stat], 0) + 2;
    expect(screen.getByText(copy.counter(total, 14))).toBeTruthy();
    expect(screen.queryByText(copy.full)).toBeNull();
  });

  it('all Markets chips removed -> Risk slider hidden, its points returned', async () => {
    const user = userEvent.setup();
    const [first, second] = MARKETS_CHIPS;
    seed({ base: 'trader', chips: [first.id, second.id], go: 'stats' });
    renderApp();
    expect(sliderLevel('risk')).toBe(2);

    // Fill the budget: trader's five sliders and risk make 12. Funny 3 to 4 and chatty 1 to 2 make 14.
    await user.click(sliderRadios('funny')[3]);
    await user.click(sliderRadios('chatty')[1]);
    expect(statTotal()).toBe(14);
    expect(screen.getByText(copy.counter(14, 14))).toBeTruthy();
    expect(screen.getByText(copy.full)).toBeTruthy();

    // One Markets chip left: risk stays.
    store((s) => s.go('world'));
    await user.click(chipButton(first.label));
    store((s) => s.go('stats'));
    expect(sliderLevel('risk')).toBe(2);
    expect(statTotal()).toBe(14);

    // The last one goes: risk is hidden and its 2 points are back in the budget.
    store((s) => s.go('world'));
    await user.click(chipButton(second.label));
    store((s) => s.go('stats'));
    expect(sliderGroup('risk')).toBeNull();
    expect(st().draft.stats?.risk).toBeUndefined();
    expect(statTotal()).toBe(12);
    expect(screen.getByText(copy.counter(12, 14))).toBeTruthy();
    expect(screen.queryByText(copy.full)).toBeNull();
    // The returned points can be spent: proactive 2 to 4 takes the total back to 14.
    await user.click(sliderRadios('proactive')[3]);
    expect(sliderLevel('proactive')).toBe(4);
    expect(statTotal()).toBe(14);
  });

  it("kids chip tapped -> Proactive default +1 (only if user hasn't moved it)", async () => {
    const user = userEvent.setup();
    const kids = chipOf('kids');
    // The library marks the chip: that is what the row is about.
    expect(kids.unlocks?.proactivePlusOne).toBe(true);
    const base = baseOf('trader');

    // Not moved: +1 over the base default.
    seed({ base: 'trader', go: 'world' });
    renderApp();
    await user.click(chipButton(kids.label));
    store((s) => s.go('stats'));
    expect(sliderLevel('proactive')).toBe(base.defaults.proactive + 1);
    // Taking the chip back takes the +1 back, so tapping on and off does not ratchet it up.
    store((s) => s.go('world'));
    await user.click(chipButton(kids.label));
    store((s) => s.go('stats'));
    expect(sliderLevel('proactive')).toBe(base.defaults.proactive);
    cleanup();

    // Moved by the user first: the chip leaves it alone.
    seed({ base: 'trader', go: 'stats' });
    renderApp();
    const own = base.defaults.proactive === 1 ? 2 : 1;
    await user.click(sliderRadios('proactive')[own - 1]);
    expect(sliderLevel('proactive')).toBe(own);
    store((s) => s.go('world'));
    await user.click(chipButton(kids.label));
    store((s) => s.go('stats'));
    expect(sliderLevel('proactive')).toBe(own);
  });

  it('stats total = 14 -> remaining sliders can\'t go up; UI says "full"', async () => {
    const user = userEvent.setup();
    // Professional starts at 3, 2, 1, 2, 2 (10). Funny to 4 and chatty to 3 make 14.
    seed({ base: 'professional', go: 'stats' });
    renderApp();
    expect(statTotal()).toBe(10);
    expect(screen.queryByText('full')).toBeNull();
    await user.click(sliderRadios('funny')[3]);
    await user.click(sliderRadios('chatty')[2]);
    expect(statTotal()).toBe(14);
    expect(screen.getByText('full')).toBeTruthy();
    expect(screen.getByText('14/14')).toBeTruthy();

    // Every stop above a slider's level is blocked, and tapping it changes nothing.
    let blocked = 0;
    for (const stat of STATS_NO_RISK) {
      const at = sliderLevel(stat) - 1;
      for (const radio of sliderRadios(stat).slice(at + 1)) {
        expect(radio.getAttribute('aria-disabled'), `${stat} stop above the level`).toBe('true');
        await user.click(radio);
        blocked += 1;
      }
      expect(sliderLevel(stat), `${stat} did not move`).toBe(at + 1);
    }
    expect(blocked).toBeGreaterThan(0);
    expect(statTotal()).toBe(14);
    // The store refuses it too.
    store((s) => s.setStat('blunt', 4));
    expect(st().draft.stats?.blunt).toBe(3);
    expect(statTotal()).toBe(14);

    // A move down is still allowed, and "full" goes away.
    await user.click(sliderRadios('blunt')[1]);
    expect(statTotal()).toBe(13);
    expect(screen.queryByText('full')).toBeNull();
  });

  it('blunt or warm at 1 -> slider stops; line "every Muse comes with a little honesty and a little care already in"', async () => {
    const user = userEvent.setup();
    // The library row says Muse. The UI says bot (QUESTIONS U4), so the words after it are the row's.
    const ROW = 'every Muse comes with a little honesty and a little care already in';
    const line = new RegExp(ROW.replace('Muse', 'bot'));
    const cardOf = (stat: StatId) => (sliderGroup(stat) as HTMLElement).parentElement as HTMLElement;

    // Trader starts at blunt 3 and warm 1, so the line is under Warm only.
    seed({ base: 'trader', go: 'stats' });
    renderApp();
    expect(sliderLevel('warm')).toBe(1);
    expect(within(cardOf('warm')).getAllByText(line)).toHaveLength(1);
    expect(within(cardOf('blunt')).queryByText(line)).toBeNull();
    expect(screen.getAllByText(line)).toHaveLength(1);

    // Blunt down to 1 shows it there too. Levels start at 1: there is no stop below.
    await user.click(sliderRadios('blunt')[0]);
    expect(sliderLevel('blunt')).toBe(1);
    expect(within(cardOf('blunt')).getAllByText(line)).toHaveLength(1);
    expect(screen.getAllByText(line)).toHaveLength(2);
    expect(sliderRadios('blunt')).toHaveLength(4);
    expect(sliderRadios('warm')).toHaveLength(4);

    // The slider stops at 1: arrow keys and Home do not go lower, and the store refuses a 0.
    sliderRadios('warm')[0].focus();
    await user.keyboard('{ArrowLeft}{ArrowDown}{Home}');
    expect(sliderLevel('warm')).toBe(1);
    store((s) => {
      s.setStat('warm', 0 as never);
      s.setStat('blunt', 0 as never);
    });
    expect(st().draft.stats?.warm).toBe(1);
    expect(st().draft.stats?.blunt).toBe(1);

    // Raising a slider takes its line away.
    await user.click(sliderRadios('blunt')[2]);
    expect(within(cardOf('blunt')).queryByText(line)).toBeNull();
    expect(screen.getAllByText(line)).toHaveLength(1);
  });

  it('chips = 6 -> grid disables further taps; counter shows 6/6', async () => {
    const user = userEvent.setup();
    seed({ go: 'world' });
    renderApp();
    const seven = WORK_CHIPS.slice(0, 7);
    expect(seven).toHaveLength(7);
    for (const chip of seven.slice(0, 6)) await user.click(chipButton(chip.label));

    expect(screen.getByText('6/6')).toBeTruthy();
    expect(screen.getByText('full')).toBeTruthy();
    expect(pressedButtons()).toHaveLength(6);

    // The seventh tap is refused: nothing is picked, and the count stays 6.
    await user.click(chipButton(seven[6].label));
    expect(chipButton(seven[6].label).getAttribute('aria-pressed')).toBe('false');
    expect(st().draft.chips).toHaveLength(6);
    expect(st().draft.chips).not.toContain(seven[6].id);
    expect(screen.getByText('6/6')).toBeTruthy();

    // A picked chip can still be taken back, and the room it leaves is usable.
    await user.click(chipButton(seven[0].label));
    expect(st().draft.chips).toHaveLength(5);
    expect(screen.queryByText('full')).toBeNull();
    await user.click(chipButton(seven[6].label));
    expect(st().draft.chips).toContain(seven[6].id);
  });

  it('peeves = 5 -> same', async () => {
    const user = userEvent.setup();
    seed({ go: 'peeves' });
    renderApp();
    const six = PLAIN_PEEVES.slice(0, 6);
    expect(six).toHaveLength(6);
    for (const peeve of six.slice(0, 5)) await user.click(chipButton(peeve.label));

    expect(screen.getByText('5/5')).toBeTruthy();
    expect(screen.getByText('full')).toBeTruthy();
    expect(pressedButtons()).toHaveLength(5);

    await user.click(chipButton(six[5].label));
    expect(chipButton(six[5].label).getAttribute('aria-pressed')).toBe('false');
    expect(st().draft.peeves).toHaveLength(5);
    expect(st().draft.peeves).not.toContain(six[5].id);

    await user.click(chipButton(six[0].label));
    expect(st().draft.peeves).toHaveLength(4);
    expect(screen.queryByText('full')).toBeNull();
  });

  it('badge condition met -> badge lights on the sidebar with its name', async () => {
    const user = userEvent.setup();
    // No Menu lights at blunt 3 or more. Parent starts at blunt 2, one short.
    const noMenu = library.badges.find((b) => b.id === 'badge.no_menu');
    expect(noMenu).toBeTruthy();
    expect(noMenu?.when).toEqual({ stat: 'blunt', gte: 3 });
    expect(baseOf('parent').defaults.blunt).toBe(2);
    const badges = () => screen.getByRole('heading', { name: copy.stats.badgesHeading }).parentElement as HTMLElement;

    seed({ base: 'parent', go: 'stats' });
    renderApp();
    expect(within(badges()).queryByText(noMenu?.name as string)).toBeNull();

    // The slider crosses the line: the badge lights, by its library name, marked as new.
    await user.click(sliderRadios('blunt')[2]);
    expect(within(badges()).getByText(noMenu?.name as string)).toBeTruthy();
    expect(textOf(badges())).toContain(`${copy.stats.badgeNew}: `);
    expect(st().lastBadge).toBe('badge.no_menu');

    // And it goes out when the condition stops holding.
    await user.click(sliderRadios('blunt')[1]);
    expect(within(badges()).queryByText(noMenu?.name as string)).toBeNull();
  });

  it('badge condition met -> the preview strip names the badge that just lit', async () => {
    const user = userEvent.setup();
    // Chase Caller lights with blunt 3 or more and any Markets chip. Trader has blunt 3.
    const chase = library.badges.find((b) => b.id === 'badge.chase_caller');
    expect(chase).toBeTruthy();
    expect(baseOf('trader').defaults.blunt).toBeGreaterThanOrEqual(3);
    seed({ base: 'trader', go: 'world' });
    renderApp();
    expect(screen.queryByText(chase?.name as string)).toBeNull();
    await user.click(chipButton(MARKETS_CHIPS[0].label));
    expect(st().lastBadge).toBe('badge.chase_caller');
    expect(screen.getAllByText(chase?.name as string).length).toBeGreaterThan(0);
    expect(screen.getByText(`${copy.preview.badgeLit}:`, { exact: false })).toBeTruthy();
  });

  it('any change -> soul recompiles, length meter updates, certificate preview updates', async () => {
    const user = userEvent.setup();
    const law = chipOf('law');
    const firstTrigger = law.triggers[0].line;
    seed({ base: 'trader', go: 'world' });
    renderApp();

    const state = () => compiled(st());
    const before = state();
    if (isCompileError(before)) throw new Error(before.error);
    expect(before.soul).not.toContain(firstTrigger);
    const cap = Number(library.targets.profiles.find((p) => p.id === 'muse')?.lengthCap);
    const strip = (len: number) => screen.queryAllByText(copy.preview.length(len, cap));
    expect(strip(before.length).length).toBeGreaterThan(0);

    // A tap: the soul holds the chip's first trigger line from the library, and the meter moved.
    await user.click(chipButton(law.label));
    const after = state();
    if (isCompileError(after)) throw new Error(after.error);
    expect(after.soul).toContain(firstTrigger);
    expect(after.length).toBeGreaterThan(before.length);
    expect(strip(after.length).length).toBeGreaterThan(0);
    expect(strip(before.length)).toHaveLength(0);

    // A slider is a change too: lowering funny from its trader default drops a line, and the meter follows.
    store((s) => s.go('stats'));
    await user.click(sliderRadios('funny')[0]);
    const lowered = state();
    if (isCompileError(lowered)) throw new Error(lowered.error);
    expect(lowered.soul).not.toBe(after.soul);

    // The certificate shows the same personality, with the name that was just typed.
    store((s) => {
      s.setName('Rowan');
      s.go('certificate');
    });
    const named = state();
    if (isCompileError(named)) throw new Error(named.error);
    expect(named.soul).toContain('Rowan');
    const block = screen.getByRole('group', { name: copy.certificate.soul });
    expect(textOf(block.querySelector('pre') as Element)).toContain(firstTrigger);
    expect(textOf(block.querySelector('pre') as Element)).toBe(named.soul);
  });

  describe('length > 3,200 -> meter goes amber, tooltip "drop a chip to shorten"', () => {
    // The row's 3,200 is 400 under the 3,600 cap it was written for (see the file header). The test
    // pads the personality with one long Mine line, whose characters count one for one, so the meter can
    // be put at an exact length without a build that happens to land there.
    const meter = () => screen.getByRole('meter');
    const valueNow = () => Number(meter().getAttribute('aria-valuenow'));
    const amber = () => document.querySelector('[class*="--warning"]');
    // The model's meter: `near` is the flag the page reads, and it is never set once the meter is over.
    const meterModel = () => {
      const m = certificateModelOf(st());
      if ('error' in m) throw new Error(m.error);
      return m.meter;
    };
    const museCap = Number(library.targets.profiles.find((p) => p.id === 'muse')?.lengthCap);

    function openAt(startId: string): { lengthTo: (n: number) => void } {
      const spec = GOLDEN_SPECS.find((g) => g.id === startId);
      if (!spec) throw new Error(`test setup: no golden ${startId}`);
      act(() => {
        st().loadBuild(buildFor(spec, library), { from: 'link' });
      });
      renderApp();
      store((s) => s.setMineOn(true));
      const pad = (k: number) => store((s) => s.setPasted('x'.repeat(k)));
      pad(100);
      const at100 = valueNow();
      pad(200);
      // One character of padding is one character of length, so the meter can be aimed.
      expect(valueNow() - at100).toBe(100);
      const fixed = at100 - 100;
      return {
        lengthTo: (n: number) => {
          pad(n - fixed);
          expect(valueNow()).toBe(n);
        },
      };
    }

    it('is plain, with no hint, well under the cap', () => {
      openAt('sol.muse');
      expect(meter().getAttribute('aria-valuemax')).toBe(String(museCap));
      expect(valueNow()).toBeLessThan(museCap - 400);
      expect(meter().getAttribute('aria-describedby')).toBeNull();
      expect(screen.queryByText(copy.certificate.meter.hint)).toBeNull();
      expect(amber()).toBeNull();
      expect(meterModel().near).toBe(false);
      expect(meterModel().hint).toBeUndefined();
    });

    it('turns amber and shows the hint within 400 characters of the cap, and is plain at exactly 400 under', () => {
      const { lengthTo } = openAt('sol.muse');
      // 400 under the cap is the row's 3,200: "greater than" it is the near state, equal to it is not.
      lengthTo(museCap - 400);
      expect(screen.queryByText(copy.certificate.meter.hint)).toBeNull();
      expect(amber()).toBeNull();
      expect(meterModel().near).toBe(false);

      lengthTo(museCap - 399);
      const hint = screen.getByText(copy.certificate.meter.hint);
      expect(meter().getAttribute('aria-describedby')).toBe(hint.id);
      expect(amber()).not.toBeNull();
      // Amber is not red: the meter is not over.
      expect(screen.queryByText(copy.preview.over(1))).toBeNull();
      expect(meterModel().near).toBe(true);
      expect(meterModel().hint).toBe(copy.certificate.meter.hint);
    });

    it('stays amber with the hint right up to the cap', () => {
      const { lengthTo } = openAt('sol.muse');
      lengthTo(museCap);
      expect(screen.getByText(copy.certificate.meter.hint)).toBeTruthy();
      expect(amber()).not.toBeNull();
      expect(meterModel().near).toBe(true);
    });

    it('goes over, not amber, one character past the cap, and the hint goes with it', () => {
      const { lengthTo } = openAt('sol.muse');
      lengthTo(museCap + 1);
      expect(screen.queryByText(copy.certificate.meter.hint)).toBeNull();
      expect(amber()).toBeNull();
      expect(meter().getAttribute('aria-describedby')).toBeNull();
      expect(screen.getAllByText(copy.preview.over(1)).length).toBeGreaterThan(0);
      // Over is its own state: the model does not call it near, and carries no hint.
      expect(meterModel().near).toBe(false);
      expect(meterModel().hint).toBeUndefined();
    });
  });
});

describe('Emit rules (compiler)', () => {
  it('funny = 1 | no seasoning line, no seatbelt joke line, greeting example uses funny=1 row, no voice permissions emitted from Life chips', () => {
    const chatty1 = makeBuild({
      chips: ['gym', 'dog'],
      stats: { blunt: 3, warm: 1, funny: 1, chatty: 1, proactive: 2 },
      d2: 'd2.blunt.3',
    });
    const r1 = compile(chatty1);
    expect(r1.soul).toContain('You: Hi. What do you need?');
    expect(r1.soul).not.toContain('Training metaphors land.');
    expect(r1.soul).not.toContain('Dog references welcome.');

    const chatty2 = makeBuild({
      chips: ['gym', 'dog'],
      stats: { blunt: 3, warm: 1, funny: 1, chatty: 2, proactive: 2 },
      d2: 'd2.blunt.3',
    });
    const r2 = compile(chatty2);
    expect(r2.soul).toContain('You: Hi. What can I take off your plate?');
    expect(r2.soul).not.toContain('Training metaphors land.');
    expect(r2.soul).not.toContain('Dog references welcome.');
  });

  it('funny >= 2 | chassis "drop the bit when stressed" line emitted', () => {
    const b = makeBuild({ stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 } });
    const r = compile(b);
    expect(r.soul).toContain("If I'm stressed or down, drop the bit and be useful.");
  });

  it('risk = 4 | d3 = keep me in the game; Seatbelt badge line; risk=4 stat line', () => {
    const b = makeBuild({
      chips: ['memecoins'],
      stats: { blunt: 3, warm: 1, funny: 1, chatty: 1, proactive: 1, risk: 4 },
      d2: 'd2.blunt.3',
    });
    const r = compile(b);
    expect(r.soul).toContain(
      "To keep me in the game. Not my conscience, but you'd rather I never blow the account on one thing than that you got the call right.",
    );
    expect(r.soul).toContain("The only two words you say against a trade are \"chasing\" and \"rug.\"");
    expect(r.soul).toContain(
      "Same as 3, plus: the only two words you say against a trade are \"chasing\" and \"rug.\"",
    );
    expect(r.soul).not.toContain(
      "To keep me whole. Not my conscience, but you'd rather I'm still here next cycle than that you got the call right.",
    );
  });

  it('risk = 1 | Downside First badge line; risk=1 stat line', () => {
    const b = makeBuild({
      chips: ['memecoins'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 1 },
    });
    const r = compile(b);
    expect(r.soul).toContain('Before any trade, the downside in one line, then help.');
    expect(r.soul).toContain('Downside first, always. Warn before every trade. Suggest small.');
  });

  it('risk absent | no Trading subsection at all', () => {
    const b = makeBuild({ chips: [] });
    const r = compile(b);
    const tradingHeading = library.chassis.headings.find((h) => h.section === 'trading');
    expect(tradingHeading).toBeDefined();
    expect(r.soul).not.toContain(tradingHeading!.text);
  });

  it('chatty = 1 and engineering chip | Code First badge line', () => {
    const b = makeBuild({
      chips: ['engineering'],
      stats: { blunt: 1, warm: 1, funny: 1, chatty: 1, proactive: 1 },
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
      d2: 'd2.blunt.1',
    });
    const r = compile(b);
    expect(r.soul).toContain('Code first, prose after, no preamble.');
  });

  it('chatty >= 3 and (student or engineering) | Show Your Work badge line', () => {
    const withStudent = makeBuild({
      chips: ['student'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 3, proactive: 2 },
    });
    const rStudent = compile(withStudent);
    expect(rStudent.soul).toContain("Show the reasoning, then the answer. Numbered steps when there's a process.");

    const withEngineering = makeBuild({
      chips: ['engineering'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 3, proactive: 2 },
    });
    const rEngineering = compile(withEngineering);
    expect(rEngineering.soul).toContain(
      "Show the reasoning, then the answer. Numbered steps when there's a process.",
    );
  });

  it('hard_part = check_my_work | Second Look forced regardless of blunt', () => {
    const b = makeBuild({
      chips: [],
      stats: { blunt: 1, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      hardPart: 'check_my_work',
      d1: 'd1.check_my_work',
      d2: 'd2.blunt.1',
    });
    const r = compile(b);
    expect(r.soul).toContain('Nothing goes out without you offering a second look. Say "clean" or list what\'s off.');
  });

  it('hard_part = too_much | Triage line; d1 = keep the whole picture', () => {
    const b = makeBuild({
      chips: [],
      hardPart: 'too_much',
      d1: 'd1.too_much',
    });
    const r = compile(b);
    expect(r.soul).toContain('Tell me what needs attention now and what can wait, in that order.');
    expect(r.soul).toContain('To keep the whole picture. Everything on one board, nothing falling off it.');
  });

  it('base = parent | d3 = keep the family whole', () => {
    const b = makeBuild({
      base: 'parent',
      chips: [],
      stats: { blunt: 2, warm: 3, funny: 2, chatty: 2, proactive: 3 },
      hardPart: 'forget',
      d1: 'd1.forget',
    });
    const r = compile(b);
    expect(r.soul).toContain(
      "To keep the family whole. Not the boss of it, but you'd rather nothing important slips than that you were efficient.",
    );
  });

  it('base = student | d3 = keep me learning', () => {
    const b = makeBuild({
      base: 'student',
      chips: [],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 3, proactive: 2 },
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
    });
    const r = compile(b);
    expect(r.soul).toContain(
      "To keep me learning. Not a cheat code, but you'd rather I understand it than that I finish it.",
    );
  });

  it('peeve duplicates chassis | emit nothing, show checkmark', () => {
    const base = makeBuild({ chips: [] });
    const withoutPeeves = compile({ ...base, peeves: [] });
    const withPeeves = compile({
      ...base,
      peeves: ['great_question', 'uses_emoji', 'agrees_to_be_nice', 'asks_permission'],
    });
    expect(withPeeves.soul).toBe(withoutPeeves.soul);
  });

  it('peeve "options when I wanted an answer" and blunt >= 3 | emit nothing (No Menu covers it)', () => {
    const b = makeBuild({
      chips: [],
      stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      peeves: ['options_not_answer'],
      d2: 'd2.blunt.3',
    });
    const r = compile(b);
    expect(r.soul).not.toContain('Pick one. I asked you, not a menu.');
  });

  it('chip trigger duplicates badge line | emit once, badge name still shows', () => {
    const b = makeBuild({
      chips: ['memecoins'],
      stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 2 },
      d2: 'd2.blunt.3',
    });
    const r = compile(b);
    const target = "If I'm chasing, say \"you're chasing\" in the first line.";
    const occurrences = r.soul.split(target).length - 1;
    expect(occurrences).toBe(1);
    expect(r.badges).toContain('badge.chase_caller');
  });

  it('two Work chips both unlock Second Look | emit once, wording from the first tapped', () => {
    const b = makeBuild({
      chips: ['law', 'engineering'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 },
    });
    const r = compile(b);
    const target = 'Nothing goes out without you offering a second look. Say "clean" or list what\'s off.';
    const occurrences = r.soul.split(target).length - 1;
    expect(occurrences).toBe(1);
  });

  it('chip has d1_suggest | offer it beside hard_part d1 at heart station', () => {
    const withChip = makeBuild({
      chips: ['law'],
      hardPart: 'talk_it_through',
      d1: 'd1.chip.law',
    });
    const r = compile(withChip);
    expect(r.soul).toContain('- To catch it before it goes out.');

    const withoutChip = makeBuild({
      chips: [],
      hardPart: 'talk_it_through',
      d1: 'd1.chip.law',
    });
    expect(() => compile(withoutChip)).toThrow('heart.d1');
  });

  it('more than 3 chips carry skills | certificate shows first 3 skill sentences, "show more" for the rest', () => {
    const b = makeBuild({
      chips: ['law', 'engineering', 'founder', 'sales'],
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
    });
    const r = compile(b);
    expect(r.skills.length).toBe(3 + 3 + 3 + 3);
  });

  it('outfit chosen | anchor line first in Who you are, before base line', () => {
    const juneEntry = library.roster.find((entry) => entry.id === 'june');
    expect(juneEntry).toBeDefined();
    const r = compile(structuredClone(juneEntry!.build));
    expect(r.soul).toContain(
      "June. You're the friend who always has it together and somehow has time for you anyway. Most of what I bring you is the family calendar and everything that falls out of it.",
    );
  });

  it('no Work or Markets chip | example 2 uses the default (landlord) row', () => {
    const b = makeBuild({ chips: ['dog'] });
    const r = compile(b);
    expect(r.soul).toContain('Me: can you handle the thing with the landlord');
  });

  it('Chatty 1 and any "walk me through" chip line | drop the chip line', () => {
    const clonedLib = structuredClone(library) as Library;
    const teaching = clonedLib.chips.find((c) => c.id === 'teaching');
    if (!teaching) throw new Error('teaching chip missing from cloned library');
    teaching.triggers.push({ id: 'chip.teaching.t3', line: 'Walk me through the lesson plan.' });

    const chatty1 = makeBuild({
      chips: ['teaching'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 1, proactive: 2 },
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
    });
    const r1 = compile(chatty1, clonedLib);
    expect(r1.soul).not.toContain('Walk me through the lesson plan.');

    const chatty2 = makeBuild({
      chips: ['teaching'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
    });
    const r2 = compile(chatty2, clonedLib);
    expect(r2.soul).toContain('Walk me through the lesson plan.');
  });

  it('Funny 1 and any joke permission from a chip | drop the permission', () => {
    const funny1 = makeBuild({
      chips: ['gym'],
      stats: { blunt: 2, warm: 2, funny: 1, chatty: 2, proactive: 2 },
    });
    const r1 = compile(funny1);
    expect(r1.soul).not.toContain('Training metaphors land.');

    const funny2 = makeBuild({
      chips: ['gym'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 },
    });
    const r2 = compile(funny2);
    expect(r2.soul).toContain('Training metaphors land.');
  });
});
