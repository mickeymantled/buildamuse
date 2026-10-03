// UI store tests (M3 slice 3.19a). Drives the Zustand store in src/ui/store.ts and the flow in
// src/ui/flow.ts through useBuilder.getState() actions, in the node environment, with no React.
//
// Expected values come from docs/UI-PLAN.md (store actions and flow), QUESTIONS.md U1 to U6 and the
// library JSON (base defaults, chip groups, pack gates and limits, role sets, roster builds, profile
// caps). Nothing here is copied from store output. Two independent oracles are written out in this
// file on purpose: the brief's chip to pack migration map, and the stat total.
//
// Notes on what is deliberately not asserted because the docs leave it open:
//   - the order of the roles list (only membership is checked),
//   - which of funny, chatty and proactive sheds first on a tie (U1 says "the highest"),
//   - what setD2 or useStarter do before a target or heart exists.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import library from '../src/library/index.js';
import { copy } from '../src/ui/copy.js';
import {
  availablePacks,
  canContinue,
  canSkip,
  exposedGates,
  exposedLimits,
  isNameValid,
  nextScreen,
  prevScreen,
  progressScreens,
  roleSetsFor,
  SCREEN_ORDER,
  visibleScreens,
  type ScreenId,
} from '../src/ui/flow.js';
import {
  capOf,
  compiled,
  effectiveGatesOf,
  effectiveLimitsOf,
  isCompileError,
  isComplete,
  previewBuild,
  useBuilder,
  type BuilderState,
} from '../src/ui/store.js';
import type {
  ChatgptMode,
  Level,
  Plan,
  Profile,
  RolePack,
  RoleSet,
  StatId,
  Stats,
  TargetId,
  WorkflowPack,
} from '../src/compiler/types.js';

// --- Helpers ---------------------------------------------------------------

const st = () => useBuilder.getState();

function stats(): Stats {
  const s = st().draft.stats;
  if (!s) throw new Error('test setup: the draft has no stats yet');
  return s;
}

function total(s: Stats): number {
  return s.blunt + s.warm + s.funny + s.chatty + s.proactive + (s.risk ?? 0);
}

function baseDefaults(id: string): Stats {
  const b = library.bases.find((x) => x.id === id);
  if (!b) throw new Error(`test setup: no base ${id}`);
  return { ...b.defaults };
}

function packOf(id: string): WorkflowPack {
  const p = library.packs.find((x) => x.id === id);
  if (!p) throw new Error(`test setup: no pack ${id}`);
  return p;
}

function roleSetOfId(id: string): RoleSet {
  const s = library.roleSets.find((x) => x.id === id);
  if (!s) throw new Error(`test setup: no role set ${id}`);
  return s;
}

function roleOf(id: string): RolePack {
  const r = library.roles.find((x) => x.id === id);
  if (!r) throw new Error(`test setup: no role ${id}`);
  return r;
}

const MARKETS_CHIPS = library.chips.filter((c) => c.group === 'Markets').map((c) => c.id);
const NON_MARKETS_CHIPS = library.chips.filter((c) => c.group !== 'Markets').map((c) => c.id);

// The brief's migration map (Part B): memecoins or solana -> memecoins, prediction markets ->
// prediction-markets, options or stocks -> spot, engineering -> coding, sales -> sales,
// kids -> personal-ops, every other chip -> none. Packs are deduped and the first three are kept.
const CHIP_PACK: Record<string, string> = {
  memecoins: 'memecoins',
  solana: 'memecoins',
  prediction_markets: 'prediction-markets',
  options: 'spot',
  stocks: 'spot',
  engineering: 'coding',
  sales: 'sales',
  kids: 'personal-ops',
};

function expectedPacks(chips: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of chips) {
    const p = CHIP_PACK[c];
    if (p !== undefined && !out.includes(p)) out.push(p);
  }
  return out.slice(0, 3);
}

// Moves the draft's stats to the wanted levels without ever passing the cap: lowers first, then raises.
// Note: this goes through setStat, so touching proactive marks it touched.
function setStatsTo(want: Partial<Stats>): void {
  const entries = Object.entries(want) as [StatId, Level][];
  for (const [id, level] of entries) {
    if (level < (stats()[id] ?? 0)) st().setStat(id, level);
  }
  for (const [id, level] of entries) {
    if (level > (stats()[id] ?? 0)) st().setStat(id, level);
  }
  for (const [id, level] of entries) {
    if (stats()[id] !== level) throw new Error(`test setup: could not set ${id} to ${level}`);
  }
}

interface Cfg {
  name: string;
  target: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
}

const CONFIGS: Cfg[] = [
  { name: 'muse', target: 'muse' },
  { name: 'openclaw', target: 'openclaw' },
  { name: 'hermes', target: 'hermes' },
  { name: 'grok', target: 'grok' },
  { name: 'chatgpt dot', target: 'chatgpt', mode: 'dot' },
  { name: 'chatgpt project', target: 'chatgpt', mode: 'project' },
  { name: 'chatgpt instructions free', target: 'chatgpt', mode: 'instructions', plan: 'free' },
  { name: 'chatgpt instructions paid', target: 'chatgpt', mode: 'instructions', plan: 'paid' },
];

function applyCfg(c: { target: TargetId; mode?: ChatgptMode; plan?: Plan }): void {
  st().setTarget(c.target, c.mode, c.plan);
}

beforeEach(() => {
  st().reset();
});

// --- setTarget, setMode, setPlan -------------------------------------------

describe('setTarget', () => {
  it('starts with no target', () => {
    expect(st().target).toBeNull();
    expect(st().mode).toBeUndefined();
    expect(st().plan).toBeUndefined();
  });

  it('chatgpt with no mode defaults to dot and has no plan', () => {
    st().setTarget('chatgpt');
    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe('dot');
    expect(st().plan).toBeUndefined();
  });

  it('chatgpt dot ignores a plan', () => {
    st().setTarget('chatgpt', 'dot', 'paid');
    expect(st().mode).toBe('dot');
    expect(st().plan).toBeUndefined();
  });

  it('chatgpt instructions with no plan defaults to free', () => {
    st().setTarget('chatgpt', 'instructions');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('free');
  });

  it('chatgpt instructions keeps the plan it is given', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('paid');
  });

  it.each<ChatgptMode>(['dot', 'gpt', 'project'])('plan exists only for instructions: %s has none', (mode) => {
    st().setTarget('chatgpt', mode, 'paid');
    expect(st().mode).toBe(mode);
    expect(st().plan).toBeUndefined();
  });

  it.each<TargetId>(['muse', 'openclaw', 'hermes', 'grok'])(
    'a non-chatgpt target (%s) has no mode and no plan even when given one',
    (target) => {
      st().setTarget(target, 'instructions', 'paid');
      expect(st().target).toBe(target);
      expect(st().mode).toBeUndefined();
      expect(st().plan).toBeUndefined();
    },
  );

  it('switching from chatgpt instructions paid to a non-chatgpt target clears mode and plan', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    st().setTarget('grok');
    expect(st().target).toBe('grok');
    expect(st().mode).toBeUndefined();
    expect(st().plan).toBeUndefined();
  });

  it('coming back to chatgpt starts at dot again', () => {
    st().setTarget('chatgpt', 'project');
    st().setTarget('muse');
    st().setTarget('chatgpt');
    expect(st().mode).toBe('dot');
    expect(st().plan).toBeUndefined();
  });

  it('keeps the rest of the draft when the target changes', () => {
    st().setBase('builder');
    st().toggleChip('law');
    st().setName('Rex');
    st().setTarget('hermes');
    expect(st().draft.base).toBe('builder');
    expect(st().draft.chips).toEqual(['law']);
    expect(st().draft.name).toBe('Rex');
  });
});

describe('setMode and setPlan', () => {
  it('setMode works on chatgpt and instructions picks up the free plan', () => {
    st().setTarget('chatgpt');
    st().setMode('instructions');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('free');
  });

  it('setMode away from instructions clears the plan', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    st().setMode('project');
    expect(st().mode).toBe('project');
    expect(st().plan).toBeUndefined();
  });

  it('setMode keeps an existing plan when it stays on instructions', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    st().setMode('instructions');
    expect(st().plan).toBe('paid');
  });

  it('setMode does nothing on a target other than chatgpt', () => {
    st().setTarget('muse');
    st().setMode('project');
    expect(st().mode).toBeUndefined();
    expect(st().plan).toBeUndefined();
  });

  it('setPlan applies only in instructions mode', () => {
    st().setTarget('chatgpt', 'instructions');
    st().setPlan('paid');
    expect(st().plan).toBe('paid');
    st().setMode('dot');
    st().setPlan('paid');
    expect(st().plan).toBeUndefined();
  });

  it('setPlan does nothing on a non-chatgpt target', () => {
    st().setTarget('openclaw');
    st().setPlan('paid');
    expect(st().plan).toBeUndefined();
  });
});

// --- setBase (U1) ----------------------------------------------------------

describe('setBase', () => {
  it.each(library.bases.map((b) => b.id))('%s sets the library defaults and remembers the base', (id) => {
    st().setBase(id);
    expect(st().draft.base).toBe(id);
    expect(st().draft.stats).toEqual(baseDefaults(id));
    expect(stats().risk).toBeUndefined();
  });

  it.each(library.bases.map((b) => b.id))(
    '%s with a Markets chip already tapped adds risk at 2 (U1)',
    (id) => {
      st().toggleChip('stocks');
      st().setBase(id);
      expect(stats()).toEqual({ ...baseDefaults(id), risk: 2 });
      expect(total(stats())).toBeLessThanOrEqual(14);
    },
  );

  it('choosing a second base replaces the stats with the new base defaults', () => {
    st().setBase('trader');
    st().setStat('funny', 1);
    st().setBase('builder');
    expect(st().draft.base).toBe('builder');
    expect(st().draft.stats).toEqual(baseDefaults('builder'));
  });

  it('a new base resets a hand-set risk to 2 when a Markets chip is tapped', () => {
    st().setBase('trader');
    st().toggleChip('memecoins');
    st().setStat('risk', 4);
    st().setBase('parent');
    expect(stats().risk).toBe(2);
  });

  it('a base chosen after a base change moves d2 with the new blunt', () => {
    st().setBase('trader'); // blunt 3
    st().setHardPart('forget');
    expect(st().draft.heart?.d2).toBe('d2.blunt.3');
    st().setBase('parent'); // blunt 2
    expect(st().draft.heart?.d2).toBe('d2.blunt.2');
  });
});

// --- toggleChip: cap, order, risk (U1) -------------------------------------

describe('toggleChip cap and order', () => {
  const SIX = ['law', 'marketing', 'teaching', 'trades', 'creative', 'consulting'];

  it('taps keep tap order', () => {
    st().toggleChip('dog');
    st().toggleChip('law');
    st().toggleChip('gym');
    expect(st().draft.chips).toEqual(['dog', 'law', 'gym']);
  });

  it('allows six chips', () => {
    for (const c of SIX) st().toggleChip(c);
    expect(st().draft.chips).toEqual(SIX);
  });

  it('refuses a seventh chip', () => {
    for (const c of SIX) st().toggleChip(c);
    st().toggleChip('dog');
    expect(st().draft.chips).toEqual(SIX);
  });

  it('a full set can still untap a chip, and then a new one fits', () => {
    for (const c of SIX) st().toggleChip(c);
    st().toggleChip('law');
    expect(st().draft.chips).toHaveLength(5);
    st().toggleChip('dog');
    expect(st().draft.chips).toEqual(['marketing', 'teaching', 'trades', 'creative', 'consulting', 'dog']);
  });

  it('ignores a chip id that is not in the library', () => {
    st().toggleChip('not_a_chip');
    expect(st().draft.chips).toEqual([]);
  });

  it('a seventh Markets chip is refused and does not change risk', () => {
    st().setBase('professional');
    for (const c of ['law', 'marketing', 'teaching', 'trades', 'creative']) st().toggleChip(c);
    st().toggleChip('stocks');
    const before = { ...stats() };
    st().toggleChip('options');
    expect(st().draft.chips).toHaveLength(6);
    expect(st().draft.chips).not.toContain('options');
    expect(stats()).toEqual(before);
  });
});

describe('toggleChip: the first Markets chip adds risk (U1)', () => {
  it.each(MARKETS_CHIPS)('%s adds risk at 2 when there is room', (id) => {
    st().setBase('professional'); // {3,2,1,2,2} = 10
    st().toggleChip(id);
    expect(stats()).toEqual({ ...baseDefaults('professional'), risk: 2 });
  });

  it.each(NON_MARKETS_CHIPS)('%s never adds risk', (id) => {
    st().setBase('professional');
    st().toggleChip(id);
    expect(stats().risk).toBeUndefined();
  });

  it('risk 2 fits exactly at a total of 14 (parent defaults total 12)', () => {
    st().setBase('parent'); // {2,3,2,2,3} = 12
    st().toggleChip('stocks');
    expect(stats()).toEqual({ blunt: 2, warm: 3, funny: 2, chatty: 2, proactive: 3, risk: 2 });
    expect(total(stats())).toBe(14);
  });

  it('risk starts at 1 with nothing shed when risk 2 would pass 14 but risk 1 fits', () => {
    st().setBase('parent');
    st().setStat('funny', 3); // {2,3,3,2,3} = 13
    st().toggleChip('stocks');
    expect(stats()).toEqual({ blunt: 2, warm: 3, funny: 3, chatty: 2, proactive: 3, risk: 1 });
    expect(total(stats())).toBe(14);
  });

  // At 14 with no risk, risk 1 passes the cap, so the highest of funny, chatty and proactive drops by 1.
  it.each([
    {
      name: 'proactive is the highest',
      base: 'parent' as const,
      set: { blunt: 4 as Level }, // {4,3,2,2,3}
      want: { blunt: 4, warm: 3, funny: 2, chatty: 2, proactive: 2, risk: 1 },
    },
    {
      name: 'funny is the highest',
      base: 'trader' as const,
      set: { warm: 3, blunt: 4, chatty: 2 } as Partial<Stats>, // {4,3,3,2,2}
      want: { blunt: 4, warm: 3, funny: 2, chatty: 2, proactive: 2, risk: 1 },
    },
    {
      name: 'chatty is the highest',
      base: 'student' as const,
      set: { blunt: 4, warm: 3 } as Partial<Stats>, // {4,3,2,3,2}
      want: { blunt: 4, warm: 3, funny: 2, chatty: 2, proactive: 2, risk: 1 },
    },
  ])('at a full budget the highest of funny, chatty, proactive sheds one point: $name', ({ base, set, want }) => {
    st().setBase(base);
    setStatsTo(set);
    expect(total(stats())).toBe(14);
    st().toggleChip('stocks');
    expect(stats()).toEqual(want);
    expect(total(stats())).toBe(14);
  });

  it('never takes blunt or warm below 1 when it sheds', () => {
    st().setBase('trader');
    setStatsTo({ blunt: 1, warm: 1, funny: 4, chatty: 4, proactive: 4 }); // 14
    st().toggleChip('stocks');
    const s = stats();
    expect(s.blunt).toBe(1);
    expect(s.warm).toBe(1);
    expect(s.risk).toBe(1);
    expect([s.funny, s.chatty, s.proactive].sort()).toEqual([3, 4, 4]);
    expect(total(s)).toBe(14);
  });

  it('a second Markets chip leaves risk alone', () => {
    st().setBase('professional');
    st().toggleChip('stocks');
    st().setStat('risk', 3);
    const before = { ...stats() };
    st().toggleChip('options');
    expect(stats()).toEqual(before);
  });

  it('removing one of two Markets chips keeps risk', () => {
    st().setBase('professional');
    st().toggleChip('stocks');
    st().toggleChip('options');
    st().toggleChip('stocks');
    expect(stats().risk).toBe(2);
  });

  it('removing the last Markets chip removes risk', () => {
    st().setBase('professional');
    st().toggleChip('stocks');
    st().toggleChip('stocks');
    expect(stats()).toEqual(baseDefaults('professional'));
    expect('risk' in stats() && stats().risk !== undefined).toBe(false);
  });

  it('removing the last Markets chip returns the risk points to the budget', () => {
    st().setBase('parent');
    st().setStat('blunt', 4); // {4,3,2,2,3} = 14
    st().toggleChip('stocks'); // {4,3,2,2,2,1} = 14
    st().toggleChip('stocks'); // risk gone: five stats = 13
    expect(stats().risk).toBeUndefined();
    expect(total(stats())).toBe(13);
    st().setStat('proactive', 3); // room again: 14
    expect(stats().proactive).toBe(3);
  });

  it('a Markets chip tapped before any base still compiles through the preview with risk present', () => {
    st().toggleChip('stocks');
    const build = previewBuild(st());
    expect(build.stats.risk).toBeDefined();
    expect(isCompileError(compiled(st()))).toBe(false);
  });
});

// --- The kids nudge (U6b) --------------------------------------------------

describe('the kids nudge', () => {
  it('tapping kids raises proactive by 1 when proactive is untouched and the cap allows', () => {
    st().setBase('professional'); // proactive 2
    st().toggleChip('kids');
    expect(stats().proactive).toBe(3);
    expect(total(stats())).toBe(11);
  });

  it('does not touch the other stats', () => {
    st().setBase('professional');
    st().toggleChip('kids');
    const { proactive, ...rest } = stats();
    const { proactive: was, ...restWas } = baseDefaults('professional');
    expect(proactive).toBe(was + 1);
    expect(rest).toEqual(restWas);
  });

  it('the nudge does not mark proactive as touched', () => {
    st().setBase('professional');
    st().toggleChip('kids');
    expect(st().touched.proactive).toBe(false);
  });

  it('still nudges after other stats were moved by hand', () => {
    st().setBase('professional');
    st().setStat('funny', 3);
    st().toggleChip('kids');
    expect(stats().proactive).toBe(3);
  });

  it('is skipped when the nudge would pass the cap of 14', () => {
    st().setBase('parent');
    st().setStat('blunt', 4); // {4,3,2,2,3} = 14
    st().toggleChip('kids');
    expect(stats().proactive).toBe(3);
    expect(total(stats())).toBe(14);
  });

  it('a nudge the cap blocked is not applied later', () => {
    st().setBase('parent');
    st().setStat('blunt', 4);
    st().toggleChip('kids');
    st().setStat('funny', 1); // room appears
    expect(stats().proactive).toBe(3);
  });

  it('a nudge the cap blocked is not taken back when kids is untapped', () => {
    st().setBase('parent');
    st().setStat('blunt', 4);
    st().toggleChip('kids');
    st().toggleChip('kids');
    expect(stats().proactive).toBe(3);
  });

  it('untapping kids takes the nudge back (lead fix)', () => {
    st().setBase('professional');
    st().toggleChip('kids');
    st().toggleChip('kids');
    expect(stats().proactive).toBe(2);
    expect(stats()).toEqual(baseDefaults('professional'));
  });

  it('tapping kids on and off five times leaves proactive where it started', () => {
    st().setBase('professional');
    const start = stats().proactive;
    for (let i = 0; i < 5; i++) {
      st().toggleChip('kids');
      expect(stats().proactive).toBe(start + 1);
      st().toggleChip('kids');
      expect(stats().proactive).toBe(start);
    }
  });

  it('keeping kids tapped keeps the nudge across other chip taps', () => {
    st().setBase('professional');
    st().toggleChip('kids');
    st().toggleChip('dog');
    st().toggleChip('dog');
    expect(stats().proactive).toBe(3);
  });

  it('after setStat(proactive, x) kids no longer nudges', () => {
    for (const x of [1, 3, 4] as const) {
      st().reset();
      st().setBase('professional'); // proactive 2
      st().setStat('proactive', x);
      st().toggleChip('kids');
      expect(stats().proactive, `proactive ${x}`).toBe(x);
    }
  });

  // QUESTIONS U6 (d): the plan's "sets touched.proactive when stat is proactive" is read as a move of
  // proactive. A setStat to the level proactive already shows is a no-op, so it does not mark proactive
  // touched and kids still nudges. If the lead wants a same-level tap to count, change setStat and flip
  // this test (touched.proactive true, proactive stays 2).
  it('setStat(proactive, current level) is a no-op: proactive stays untouched and kids still nudges (U6d)', () => {
    st().setBase('professional'); // proactive 2
    st().setStat('proactive', 2);
    expect(st().touched.proactive).toBe(false);
    st().toggleChip('kids');
    expect(stats().proactive).toBe(3);
  });

  it('after setStat(proactive, x) untapping kids does not take a point back', () => {
    st().setBase('professional');
    st().toggleChip('kids'); // 3
    st().setStat('proactive', 2);
    st().toggleChip('kids');
    expect(stats().proactive).toBe(2);
  });

  it('setStat on another stat does not mark proactive touched', () => {
    st().setBase('professional');
    st().setStat('funny', 3);
    expect(st().touched.proactive).toBe(false);
  });

  it('setStat on proactive marks it touched', () => {
    st().setBase('professional');
    st().setStat('proactive', 4);
    expect(st().touched.proactive).toBe(true);
  });

  it('a new base clears touched.proactive, so kids nudges again', () => {
    st().setBase('professional');
    st().setStat('proactive', 4);
    st().setBase('professional');
    expect(st().touched.proactive).toBe(false);
    st().toggleChip('kids');
    expect(stats().proactive).toBe(3);
  });

  it('a new base clears the remembered nudge, so untapping kids takes nothing back', () => {
    st().setBase('professional');
    st().toggleChip('kids');
    st().setBase('professional'); // stats reset to defaults, kids still tapped
    expect(stats().proactive).toBe(2);
    st().toggleChip('kids');
    expect(stats().proactive).toBe(2);
  });

  it('never raises proactive past 4', () => {
    st().setTarget('muse');
    st().remixStarter('june'); // June has kids tapped and proactive 4
    st().toggleChip('kids');
    st().toggleChip('kids');
    expect(stats().proactive).toBe(4);
    expect(total(stats())).toBeLessThanOrEqual(14);
  });

  it('a loaded starter has no nudge to take back (June keeps proactive 4 when kids comes off)', () => {
    st().setTarget('muse');
    st().remixStarter('june');
    const june = library.roster.find((r) => r.id === 'june');
    expect(june?.build.stats.proactive).toBe(4);
    st().toggleChip('kids');
    expect(stats().proactive).toBe(4);
  });
});

// --- Packs follow chips ----------------------------------------------------

describe('packs follow chips until togglePack is used', () => {
  it.each(Object.entries(CHIP_PACK))('tapping %s gives pack %s', (chip, pack) => {
    st().toggleChip(chip);
    expect(st().draft.packs).toEqual([pack]);
  });

  it.each(NON_MARKETS_CHIPS.filter((c) => CHIP_PACK[c] === undefined))('%s derives no pack', (chip) => {
    st().toggleChip(chip);
    expect(st().draft.packs).toEqual([]);
  });

  it('dedupes: memecoins and solana give one memecoins pack', () => {
    st().toggleChip('memecoins');
    st().toggleChip('solana');
    expect(st().draft.packs).toEqual(['memecoins']);
  });

  it('dedupes: options and stocks give one spot pack', () => {
    st().toggleChip('options');
    st().toggleChip('stocks');
    expect(st().draft.packs).toEqual(['spot']);
  });

  it('keeps the first three, in chip tap order', () => {
    for (const c of ['memecoins', 'engineering', 'sales', 'kids']) st().toggleChip(c);
    expect(st().draft.packs).toEqual(['memecoins', 'coding', 'sales']);
  });

  it('untapping a chip removes its pack, and a fourth pack can then appear', () => {
    for (const c of ['memecoins', 'engineering', 'sales', 'kids']) st().toggleChip(c);
    st().toggleChip('engineering');
    expect(st().draft.packs).toEqual(['memecoins', 'sales', 'personal-ops']);
  });

  it('a pack stays while another chip still derives it', () => {
    st().toggleChip('memecoins');
    st().toggleChip('solana');
    st().toggleChip('memecoins');
    expect(st().draft.packs).toEqual(['memecoins']);
  });

  it('matches the oracle for every pair of chips tapped in either order', () => {
    const ids = library.chips.map((c) => c.id);
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        st().reset();
        st().toggleChip(a);
        st().toggleChip(b);
        expect(st().draft.packs, `${a} then ${b}`).toEqual(expectedPacks([a, b]));
      }
    }
  });

  it('stops following chips once togglePack is used', () => {
    st().toggleChip('engineering');
    expect(st().draft.packs).toEqual(['coding']);
    st().togglePack('coding'); // untap
    expect(st().draft.packs).toEqual([]);
    expect(st().touched.packs).toBe(true);
    st().toggleChip('sales');
    expect(st().draft.packs).toEqual([]);
    st().toggleChip('memecoins');
    expect(st().draft.packs).toEqual([]);
  });

  it('a hand-picked pack survives later chip taps', () => {
    st().togglePack('research');
    st().toggleChip('engineering');
    st().toggleChip('sales');
    expect(st().draft.packs).toEqual(['research']);
  });

  it('starts untouched', () => {
    expect(st().touched.packs).toBe(false);
  });
});

describe('packs the profile cannot deliver are dropped', () => {
  // No pack in the library restricts its profiles today (every pack's `profiles` is absent), so
  // this narrows one pack in memory for the length of the test and puts it back afterwards.
  const coding = packOf('coding');
  const original = coding.profiles;

  afterEach(() => {
    if (original === undefined) delete coding.profiles;
    else coding.profiles = original;
  });

  it('a pack that lists only muse is dropped on grok and returns on muse', () => {
    coding.profiles = ['muse'];
    st().setTarget('muse');
    st().toggleChip('engineering');
    expect(st().draft.packs).toEqual(['coding']);
    st().setTarget('grok');
    expect(st().draft.packs).toEqual([]);
    st().setTarget('muse');
    expect(st().draft.packs).toEqual(['coding']);
  });

  it('a chip on a target that cannot deliver its pack derives nothing', () => {
    coding.profiles = ['muse'];
    st().setTarget('openclaw');
    st().toggleChip('engineering');
    expect(st().draft.packs).toEqual([]);
  });

  it('togglePack refuses a pack the profile cannot deliver', () => {
    coding.profiles = ['muse'];
    st().setTarget('hermes');
    st().togglePack('coding');
    expect(st().draft.packs).toEqual([]);
  });

  it('a hand-picked pack is dropped when the target changes to one that cannot deliver it', () => {
    coding.profiles = ['muse'];
    st().setTarget('muse');
    st().togglePack('coding');
    expect(st().draft.packs).toEqual(['coding']);
    st().setTarget('chatgpt', 'dot');
    expect(st().draft.packs).toEqual([]);
  });

  it('availablePacks lists every library pack on every profile when none restrict themselves', () => {
    delete coding.profiles;
    for (const profile of library.targets.profiles) {
      expect(availablePacks(profile).map((p) => p.id)).toEqual(library.packs.map((p) => p.id));
    }
  });

  it('availablePacks honors a restriction', () => {
    coding.profiles = ['muse'];
    const grok = library.targets.profiles.find((p) => p.id === 'grok') as Profile;
    const muse = library.targets.profiles.find((p) => p.id === 'muse') as Profile;
    expect(availablePacks(grok).map((p) => p.id)).not.toContain('coding');
    expect(availablePacks(muse).map((p) => p.id)).toContain('coding');
  });
});

// --- setStat ---------------------------------------------------------------

describe('setStat', () => {
  it.each(['blunt', 'warm'] as const)('%s never goes below 1', (stat) => {
    st().setBase('professional');
    const before = stats()[stat];
    st().setStat(stat, 0 as never);
    st().setStat(stat, -1 as never);
    expect(stats()[stat]).toBe(before);
    st().setStat(stat, 1);
    expect(stats()[stat]).toBe(1);
  });

  it.each(['funny', 'chatty', 'proactive'] as const)('%s stays in 1 to 4', (stat) => {
    st().setBase('professional');
    const before = stats()[stat];
    for (const bad of [0, 5, -2, 2.5, Number.NaN, 99]) st().setStat(stat, bad as never);
    expect(stats()[stat]).toBe(before);
  });

  it('moves a stat to any level from 1 to 4 when the budget allows', () => {
    st().setBase('professional'); // total 10
    for (const level of [1, 2, 3, 4] as const) {
      st().setStat('chatty', level);
      expect(stats().chatty).toBe(level);
    }
  });

  it('refuses a move that would pass a total of 14 and changes nothing', () => {
    st().setBase('trader'); // {3,1,3,1,2} = 10
    st().setStat('chatty', 4); // 13
    st().setStat('proactive', 3); // 14
    const at14 = { ...stats() };
    expect(total(at14)).toBe(14);
    st().setStat('proactive', 4); // would be 15
    expect(stats()).toEqual(at14);
    st().setStat('warm', 2); // would be 15
    expect(stats()).toEqual(at14);
  });

  it('allows a lower move at a full budget, then a raise elsewhere', () => {
    st().setBase('trader');
    st().setStat('chatty', 4);
    st().setStat('proactive', 3);
    st().setStat('funny', 2); // 13
    st().setStat('warm', 2); // 14
    expect(total(stats())).toBe(14);
    expect(stats().warm).toBe(2);
    expect(stats().funny).toBe(2);
  });

  it('a total of exactly 14 is allowed', () => {
    st().setBase('parent'); // 12
    st().setStat('blunt', 4);
    expect(total(stats())).toBe(14);
  });

  it('the total never passes 14 however the stats are pushed', () => {
    st().setBase('trader');
    for (const stat of ['blunt', 'warm', 'funny', 'chatty', 'proactive'] as const) {
      for (const level of [4, 4, 3, 4] as const) {
        st().setStat(stat, level);
        expect(total(stats())).toBeLessThanOrEqual(14);
      }
    }
  });

  it('risk cannot be set without a Markets chip', () => {
    st().setBase('professional');
    st().setStat('risk', 3);
    expect(stats().risk).toBeUndefined();
    expect(stats()).toEqual(baseDefaults('professional'));
  });

  it('risk can be set once a Markets chip is tapped', () => {
    st().setBase('professional');
    st().toggleChip('stocks');
    st().setStat('risk', 4);
    expect(stats().risk).toBe(4);
  });

  it('risk stays within 1 to 4', () => {
    st().setBase('professional');
    st().toggleChip('stocks');
    st().setStat('risk', 0 as never);
    st().setStat('risk', 5 as never);
    expect(stats().risk).toBe(2);
  });

  it('risk counts toward the total of 14', () => {
    st().setBase('trader'); // 10
    st().toggleChip('memecoins'); // risk 2 -> 12
    st().setStat('risk', 4); // 14
    expect(total(stats())).toBe(14);
    st().setStat('proactive', 3); // 15, refused
    expect(stats().proactive).toBe(2);
  });
});

// --- togglePack ------------------------------------------------------------

describe('togglePack', () => {
  it('allows three packs and refuses a fourth', () => {
    st().togglePack('memecoins');
    st().togglePack('coding');
    st().togglePack('sales');
    st().togglePack('research');
    expect(st().draft.packs).toEqual(['memecoins', 'coding', 'sales']);
  });

  it('after untapping one, a new pack fits', () => {
    st().togglePack('memecoins');
    st().togglePack('coding');
    st().togglePack('sales');
    st().togglePack('coding');
    st().togglePack('research');
    expect(st().draft.packs).toEqual(['memecoins', 'sales', 'research']);
  });

  it('ignores an id that is not a pack', () => {
    st().togglePack('not_a_pack');
    expect(st().draft.packs).toEqual([]);
  });

  it('marks packs as touched', () => {
    st().togglePack('research');
    expect(st().touched.packs).toBe(true);
  });

  it('untapping a pack prunes the limits it alone exposed', () => {
    st().togglePack('memecoins');
    st().togglePack('sales');
    st().setLimit('per_trade_pct', 2);
    st().setLimit('max_sends_per_day', 10);
    st().togglePack('memecoins');
    expect(st().draft.limits).toEqual({ max_sends_per_day: 10 });
  });

  it('untapping a pack prunes the gates it alone exposed', () => {
    st().togglePack('memecoins'); // trade
    st().togglePack('sales'); // send
    st().setGate('trade', 'forbid');
    st().setGate('send', 'auto');
    st().togglePack('memecoins');
    expect(st().draft.gates).toEqual({ send: 'auto' });
  });

  it('keeps a gate that another picked pack still exposes', () => {
    // coding and sales both expose send.
    st().togglePack('coding');
    st().togglePack('sales');
    st().setGate('send', 'auto');
    st().togglePack('sales');
    expect(st().draft.gates).toEqual({ send: 'auto' });
  });

  it('keeps a limit that another picked pack still exposes', () => {
    // memecoins and perps both expose per_trade_pct.
    st().togglePack('memecoins');
    st().togglePack('perps');
    st().setLimit('per_trade_pct', 0.5);
    st().togglePack('memecoins');
    expect(st().draft.limits).toEqual({ per_trade_pct: 0.5 });
  });

  it('untapping the last pack leaves no limits and no gates', () => {
    st().togglePack('memecoins');
    st().setLimit('daily_loss_pct', 1);
    st().setGate('trade', 'forbid');
    st().togglePack('memecoins');
    expect(st().draft.limits).toEqual({});
    expect(st().draft.gates).toEqual({});
  });

  it('pruning also happens when the pack comes from a chip', () => {
    st().toggleChip('memecoins');
    st().setLimit('max_trades_per_day', 5);
    st().setGate('trade', 'auto');
    st().toggleChip('memecoins');
    expect(st().draft.limits).toEqual({});
    expect(st().draft.gates).toEqual({});
  });

  it('prunes roles from a set the packs no longer fit', () => {
    st().togglePack('memecoins');
    st().setAdvancedRoles(true);
    expect(st().draft.roles?.length).toBeGreaterThan(0);
    st().togglePack('memecoins');
    expect(st().draft.roles ?? []).toEqual([]);
  });
});

// --- setLimit --------------------------------------------------------------

describe('setLimit', () => {
  const limit = (id: string) => {
    const l = library.limits.find((x) => x.id === id);
    if (!l) throw new Error(`test setup: no limit ${id}`);
    return l;
  };

  it('clamps a value above the max to the max, for every limit', () => {
    for (const l of library.limits) {
      const pack = library.packs.find((p) => p.limitChips.includes(l.id));
      if (!pack) throw new Error(`test setup: no pack exposes ${l.id}`);
      st().reset();
      st().togglePack(pack.id);
      st().setLimit(l.id, l.max * 10 + 1000);
      expect(st().draft.limits[l.id], l.id).toBeCloseTo(l.max, 6);
    }
  });

  it('clamps a value below the min to the min, for every limit', () => {
    for (const l of library.limits) {
      const pack = library.packs.find((p) => p.limitChips.includes(l.id));
      if (!pack) throw new Error(`test setup: no pack exposes ${l.id}`);
      st().reset();
      st().togglePack(pack.id);
      st().setLimit(l.id, l.min - 1000);
      expect(st().draft.limits[l.id], l.id).toBeCloseTo(l.min, 6);
    }
  });

  it.each([
    // [limit id, pack, input, expected]. per_trade_pct is 0.25 to 3 step 0.25.
    ['per_trade_pct', 'memecoins', 1.1, 1],
    ['per_trade_pct', 'memecoins', 1.2, 1.25],
    ['per_trade_pct', 'memecoins', 0.3, 0.25],
    // daily_loss_pct is 0.5 to 5 step 0.5.
    ['daily_loss_pct', 'memecoins', 2.7, 2.5],
    // max_trades_per_day is 1 to 20 step 1.
    ['max_trades_per_day', 'memecoins', 7.4, 7],
    ['max_trades_per_day', 'memecoins', 7.6, 8],
    // kelly_fraction is 0.05 to 0.5 step 0.05.
    ['kelly_fraction', 'prediction-markets', 0.27, 0.25],
    ['kelly_fraction', 'prediction-markets', 0.33, 0.35],
    // min_edge_pct is 5 to 20 step 1.
    ['min_edge_pct', 'prediction-markets', 12.4, 12],
    // max_exposure_pct is 5 to 50 step 5.
    ['max_exposure_pct', 'prediction-markets', 33, 35],
    // max_sends_per_day is 5 to 60 step 5.
    ['max_sends_per_day', 'sales', 33, 35],
    // refund_ceiling is 25 to 200 step 25.
    ['refund_ceiling', 'support', 61, 50],
    // leverage_cap is 1 to 8 step 1.
    ['leverage_cap', 'perps', 5.2, 5],
  ] as [string, string, number, number][])('%s snaps %d to its step (%s)', (id, pack, input, want) => {
    expect(packOf(pack).limitChips).toContain(id);
    st().togglePack(pack);
    st().setLimit(id, input);
    expect(st().draft.limits[id]).toBeCloseTo(want, 6);
  });

  it('a stored value always lies on the limit step and inside min..max', () => {
    st().togglePack('prediction-markets');
    const l = limit('kelly_fraction');
    for (let v = -1; v < 2; v += 0.0373) {
      st().setLimit('kelly_fraction', v);
      const got = st().draft.limits['kelly_fraction'] as number;
      expect(got).toBeGreaterThanOrEqual(l.min - 1e-9);
      expect(got).toBeLessThanOrEqual(l.max + 1e-9);
      const steps = (got - l.min) / l.step;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
    }
  });

  it('a value already on a step is stored as given', () => {
    st().togglePack('memecoins');
    st().setLimit('per_trade_pct', 1.75);
    expect(st().draft.limits['per_trade_pct']).toBe(1.75);
  });

  it('ignores a number that is not finite', () => {
    st().togglePack('memecoins');
    st().setLimit('per_trade_pct', Number.NaN);
    st().setLimit('per_trade_pct', Number.POSITIVE_INFINITY);
    expect(st().draft.limits).toEqual({});
  });

  it('does not store a limit no picked pack exposes', () => {
    st().togglePack('memecoins');
    st().setLimit('leverage_cap', 3);
    expect(st().draft.limits).toEqual({});
  });

  it('does not store a limit when no pack is picked', () => {
    st().setLimit('per_trade_pct', 1);
    expect(st().draft.limits).toEqual({});
  });

  it('keeps the other limits when one changes', () => {
    st().togglePack('memecoins');
    st().setLimit('per_trade_pct', 2);
    st().setLimit('daily_loss_pct', 1);
    expect(st().draft.limits).toEqual({ per_trade_pct: 2, daily_loss_pct: 1 });
  });

  it('the stored limit reaches the effective limits the compiler uses', () => {
    st().togglePack('memecoins');
    st().setLimit('per_trade_pct', 2);
    expect(effectiveLimitsOf(st())['per_trade_pct']).toBe(2);
    // The pack default fills the ones the user did not set (memecoins default 3 for daily_loss_pct).
    expect(effectiveLimitsOf(st())['daily_loss_pct']).toBe(packOf('memecoins').limitsDefault['daily_loss_pct']);
  });
});

// --- setGate ---------------------------------------------------------------

describe('setGate', () => {
  it.each(['auto', 'approve', 'forbid'] as const)('refuses pay = %s and stores nothing for pay', (setting) => {
    st().togglePack('memecoins'); // exposes pay in its gates
    st().setGate('pay', setting);
    expect(st().draft.gates).toEqual({});
    expect('pay' in st().draft.gates).toBe(false);
  });

  it('pay stays forbid in the effective gates after every attempt to change it', () => {
    st().togglePack('memecoins');
    for (const s of ['auto', 'approve', 'forbid'] as const) st().setGate('pay', s);
    expect(effectiveGatesOf(st())['pay']).toBe('forbid');
    expect(previewBuild(st()).gates['pay']).toBeUndefined();
  });

  it('pay is forbid even with no pack picked', () => {
    expect(effectiveGatesOf(st())['pay']).toBe('forbid');
  });

  it('stores a gate for an action a picked pack exposes', () => {
    st().togglePack('memecoins');
    st().setGate('trade', 'auto');
    expect(st().draft.gates).toEqual({ trade: 'auto' });
    st().setGate('trade', 'forbid');
    expect(st().draft.gates).toEqual({ trade: 'forbid' });
  });

  it('the stored gate wins over the pack default in the effective gates', () => {
    st().togglePack('memecoins'); // pack default trade = approve
    st().setGate('trade', 'auto');
    expect(effectiveGatesOf(st())['trade']).toBe('auto');
  });

  it('does not store an action no picked pack exposes', () => {
    st().togglePack('memecoins');
    st().setGate('deploy', 'auto');
    expect(st().draft.gates).toEqual({});
  });

  it('does not store a gate when no pack is picked', () => {
    st().setGate('trade', 'auto');
    expect(st().draft.gates).toEqual({});
  });

  it('refuses a setting that is not auto, approve or forbid', () => {
    st().togglePack('memecoins');
    st().setGate('trade', 'prevent' as never);
    expect(st().draft.gates).toEqual({});
  });

  it('keeps the other gates when one changes', () => {
    st().togglePack('coding');
    st().setGate('deploy', 'auto');
    st().setGate('send', 'forbid');
    expect(st().draft.gates).toEqual({ deploy: 'auto', send: 'forbid' });
  });
});

// --- togglePeeve -----------------------------------------------------------

describe('togglePeeve', () => {
  const FIVE = ['great_question', 'uses_emoji', 'bullets_everything', 'adds_disclaimers', 'ends_with_question'];

  it('allows five peeves in tap order', () => {
    for (const p of FIVE) st().togglePeeve(p);
    expect(st().draft.peeves).toEqual(FIVE);
  });

  it('refuses a sixth', () => {
    for (const p of FIVE) st().togglePeeve(p);
    st().togglePeeve('over_explains');
    expect(st().draft.peeves).toEqual(FIVE);
  });

  it('untapping frees a slot', () => {
    for (const p of FIVE) st().togglePeeve(p);
    st().togglePeeve('uses_emoji');
    st().togglePeeve('over_explains');
    expect(st().draft.peeves).toEqual([
      'great_question',
      'bullets_everything',
      'adds_disclaimers',
      'ends_with_question',
      'over_explains',
    ]);
  });

  it('ignores an id that is not a peeve', () => {
    st().togglePeeve('not_a_peeve');
    expect(st().draft.peeves).toEqual([]);
  });
});

// --- Heart: setHardPart, setD1, setD2 --------------------------------------

describe('heart', () => {
  it.each(library.heart.hardParts.map((h) => h.id))(
    'setHardPart(%s) sets d1 from the hard part and d2 from blunt',
    (id) => {
      const hardPart = library.heart.hardParts.find((h) => h.id === id);
      st().setBase('trader'); // blunt 3
      st().setHardPart(id);
      expect(st().draft.heart).toEqual({ hardPart: id, d1: hardPart?.d1, d2: 'd2.blunt.3' });
    },
  );

  it.each([1, 2, 3, 4] as const)('d2 is d2.blunt.%i when blunt is %i', (blunt) => {
    st().setBase('professional');
    st().setStat('blunt', blunt);
    st().setHardPart('calmer');
    expect(st().draft.heart?.d2).toBe(`d2.blunt.${blunt}`);
  });

  it('every d2 id the store writes exists as a d2 drive in the library', () => {
    st().setBase('trader');
    st().setHardPart('forget');
    const d2 = st().draft.heart?.d2;
    expect(library.heart.drives.some((d) => d.id === d2 && d.slot === 'd2')).toBe(true);
  });

  it('a blunt change moves d2 while it is untouched', () => {
    st().setBase('professional');
    st().setHardPart('calmer');
    st().setStat('blunt', 4);
    expect(st().draft.heart?.d2).toBe('d2.blunt.4');
    st().setStat('blunt', 1);
    expect(st().draft.heart?.d2).toBe('d2.blunt.1');
    expect(st().touched.d2).toBe(false);
  });

  it('setD2 marks d2 touched and sets the drive', () => {
    st().setBase('professional'); // blunt 3
    st().setHardPart('calmer');
    st().setD2('d2.blunt.1');
    expect(st().touched.d2).toBe(true);
    expect(st().draft.heart?.d2).toBe('d2.blunt.1');
  });

  it('a later blunt change leaves a touched d2 alone', () => {
    st().setBase('professional');
    st().setHardPart('calmer');
    st().setD2('d2.blunt.1');
    st().setStat('blunt', 4);
    expect(st().draft.heart?.d2).toBe('d2.blunt.1');
  });

  it('setD2 to the drive blunt would pick still counts as swapped', () => {
    st().setBase('professional'); // blunt 3
    st().setHardPart('calmer');
    st().setD2('d2.blunt.3');
    expect(st().touched.d2).toBe(true);
    st().setStat('blunt', 4);
    expect(st().draft.heart?.d2).toBe('d2.blunt.3');
  });

  it('setD2 refuses a drive that is not a d2 drive', () => {
    st().setBase('professional');
    st().setHardPart('calmer');
    st().setD2('d1.calmer');
    st().setD2('d3.default');
    st().setD2('not_a_drive');
    expect(st().draft.heart?.d2).toBe('d2.blunt.3');
    expect(st().touched.d2).toBe(false);
  });

  it('a new hard part resets a swapped d2 to follow blunt again (U6a)', () => {
    st().setBase('professional'); // blunt 3
    st().setHardPart('calmer');
    st().setD2('d2.blunt.1');
    st().setHardPart('forget');
    expect(st().draft.heart?.d2).toBe('d2.blunt.3');
    expect(st().touched.d2).toBe(false);
    st().setStat('blunt', 2);
    expect(st().draft.heart?.d2).toBe('d2.blunt.2');
  });

  it('setD1 accepts a drive suggested by a tapped chip', () => {
    st().setBase('trader');
    st().toggleChip('memecoins');
    st().setHardPart('forget');
    st().setD1('d1.chip.memecoins');
    expect(st().draft.heart?.d1).toBe('d1.chip.memecoins');
  });

  it('setD1 accepts the hard part\'s own d1 again', () => {
    st().setBase('trader');
    st().toggleChip('memecoins');
    st().setHardPart('forget');
    st().setD1('d1.chip.memecoins');
    st().setD1('d1.forget');
    expect(st().draft.heart?.d1).toBe('d1.forget');
  });

  it('setD1 refuses a drive from a chip that is not tapped, and another hard part\'s', () => {
    st().setBase('trader');
    st().setHardPart('forget');
    st().setD1('d1.chip.law');
    expect(st().draft.heart?.d1).toBe('d1.forget');
    st().setD1('d1.calmer');
    expect(st().draft.heart?.d1).toBe('d1.forget');
  });

  it('setD1 does not mark d2 touched', () => {
    st().setBase('trader');
    st().toggleChip('memecoins');
    st().setHardPart('forget');
    st().setD1('d1.chip.memecoins');
    expect(st().touched.d2).toBe(false);
  });

  it('untapping the chip behind the chosen d1 puts the hard part\'s d1 back', () => {
    st().setBase('trader');
    st().toggleChip('memecoins');
    st().setHardPart('forget');
    st().setD1('d1.chip.memecoins');
    st().toggleChip('memecoins');
    expect(st().draft.heart?.d1).toBe('d1.forget');
    expect(isCompileError(compiled(st()))).toBe(false);
  });

  it('a skipped heart keeps the calmer default through the preview (U3)', () => {
    st().setBase('professional'); // blunt 3
    const heart = previewBuild(st()).heart;
    expect(heart).toEqual({ hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' });
  });
});

// --- setOutfit, setName ----------------------------------------------------

describe('setOutfit', () => {
  it.each(library.outfits.map((o) => o.id))('stores %s', (id) => {
    st().setOutfit(id);
    expect(st().draft.outfit).toBe(id);
  });

  it('ignores an id that is not an outfit', () => {
    st().setOutfit('not_an_outfit');
    expect(st().draft.outfit).toBeUndefined();
  });
});

describe('setName', () => {
  it('keeps a short name as typed', () => {
    st().setName('Rex');
    expect(st().draft.name).toBe('Rex');
  });

  it('keeps a name of exactly 24 characters', () => {
    const name = 'abcdefghijklmnopqrstuvwx';
    expect(name).toHaveLength(24);
    st().setName(name);
    expect(st().draft.name).toBe(name);
  });

  it('keeps at most 24 characters', () => {
    st().setName('abcdefghijklmnopqrstuvwxyz0123456789');
    expect(st().draft.name).toBe('abcdefghijklmnopqrstuvwx');
    expect(st().draft.name.length).toBeLessThanOrEqual(24);
  });

  it('typing past 24 one letter at a time never grows the name', () => {
    let typed = '';
    for (let i = 0; i < 40; i++) {
      typed = st().draft.name + 'z';
      st().setName(typed);
      expect(st().draft.name.length).toBeLessThanOrEqual(24);
    }
    expect(st().draft.name).toBe('z'.repeat(24));
  });

  it('allows clearing the name', () => {
    st().setName('Rex');
    st().setName('');
    expect(st().draft.name).toBe('');
  });

  it('a build name is the trimmed text, and a blank one falls back to the copy default (U3)', () => {
    st().setName('  Rex  ');
    expect(previewBuild(st()).name).toBe('Rex');
    st().setName('    ');
    expect(previewBuild(st()).name).toBe(copy.defaultName);
  });

  it('isNameValid wants a trimmed length of 1 to 24', () => {
    expect(isNameValid('')).toBe(false);
    expect(isNameValid('   ')).toBe(false);
    expect(isNameValid('a')).toBe(true);
    expect(isNameValid('  a  ')).toBe(true);
    expect(isNameValid('x'.repeat(24))).toBe(true);
    expect(isNameValid('x'.repeat(25))).toBe(false);
  });
});

// --- Roles -----------------------------------------------------------------

describe('roles', () => {
  const sameMembers = (a: readonly string[] | undefined, b: readonly string[]) =>
    expect([...(a ?? [])].sort()).toEqual([...b].sort());

  it.each(library.roleSets.map((s) => s.id))(
    'turning roles on for a %s pack seeds the coordinator and the pack default roles',
    (setId) => {
      const set = roleSetOfId(setId);
      const pack = packOf(set.packs[0] as string);
      st().togglePack(pack.id);
      st().setAdvancedRoles(true);
      const want = set.members.filter((m) => pack.defaultRoles.includes(m) || m === set.coordinator);
      sameMembers(st().draft.roles, want);
      expect(st().draft.roles).toContain(set.coordinator);
    },
  );

  it.each(library.roleSets.map((s) => s.id))('%s: the coordinator cannot be removed', (setId) => {
    const set = roleSetOfId(setId);
    st().togglePack(set.packs[0] as string);
    st().setAdvancedRoles(true);
    const before = [...(st().draft.roles ?? [])];
    st().toggleRole(set.coordinator);
    sameMembers(st().draft.roles, before);
    expect(st().draft.roles).toContain(set.coordinator);
  });

  it.each(library.roleSets.map((s) => s.id))(
    '%s: every other member toggles on and off and the coordinator stays in',
    (setId) => {
      const set = roleSetOfId(setId);
      st().togglePack(set.packs[0] as string);
      st().setAdvancedRoles(true);
      for (const member of set.members) {
        if (member === set.coordinator) continue;
        const had = (st().draft.roles ?? []).includes(member);
        st().toggleRole(member);
        expect((st().draft.roles ?? []).includes(member), `${member} flipped`).toBe(!had);
        expect(st().draft.roles).toContain(set.coordinator);
        st().toggleRole(member);
        expect((st().draft.roles ?? []).includes(member), `${member} flipped back`).toBe(had);
        expect(st().draft.roles).toContain(set.coordinator);
        for (const r of st().draft.roles ?? []) expect(set.members).toContain(r);
      }
    },
  );

  it('trading: the executor can be added by hand (it is never a default)', () => {
    st().togglePack('memecoins');
    st().setAdvancedRoles(true);
    expect(st().draft.roles).not.toContain('executor');
    st().toggleRole('executor');
    expect(st().draft.roles).toContain('executor');
  });

  it('a role from a set that the picked packs do not fit is refused', () => {
    st().togglePack('memecoins');
    st().setAdvancedRoles(true);
    const before = [...(st().draft.roles ?? [])];
    st().toggleRole('planner'); // a coding role
    expect(st().draft.roles).toEqual(before);
  });

  it('picking a role from another fitting set leaves one set, with its coordinator', () => {
    st().togglePack('memecoins'); // trading
    st().togglePack('coding'); // coding
    st().setAdvancedRoles(true);
    st().toggleRole('implementer');
    const roles = st().draft.roles ?? [];
    expect(roles).toContain('implementer');
    expect(roles).toContain(roleSetOfId('coding').coordinator);
    expect(new Set(roles.map((r) => roleOf(r).set)).size).toBe(1);
  });

  it('turning roles off clears them', () => {
    st().togglePack('memecoins');
    st().setAdvancedRoles(true);
    st().setAdvancedRoles(false);
    expect(st().advancedRoles).toBe(false);
    expect(st().draft.roles).toBeUndefined();
  });

  it('turning roles back on seeds them again', () => {
    st().togglePack('memecoins');
    st().setAdvancedRoles(true);
    const first = [...(st().draft.roles ?? [])];
    st().setAdvancedRoles(false);
    st().setAdvancedRoles(true);
    sameMembers(st().draft.roles, first);
  });

  it('after the packs change to another set, the roles belong to one set that fits the packs', () => {
    st().togglePack('memecoins');
    st().togglePack('coding');
    st().setAdvancedRoles(true);
    st().togglePack('memecoins'); // untap trading
    const roles = st().draft.roles ?? [];
    for (const r of roles) expect(roleSetOfId('coding').members).toContain(r);
    if (roles.length > 0) expect(roles).toContain('planner');
  });

  it('roleSetsFor lists the sets that contain a picked pack, first pack first', () => {
    expect(roleSetsFor(['memecoins', 'coding']).map((s) => s.id)).toEqual(['trading', 'coding']);
    expect(roleSetsFor(['coding', 'memecoins']).map((s) => s.id)).toEqual(['coding', 'trading']);
    expect(roleSetsFor([])).toEqual([]);
    expect(roleSetsFor(['not_a_pack'])).toEqual([]);
  });

  it('every library pack belongs to at most the sets that list it', () => {
    for (const pack of library.packs) {
      const want = library.roleSets.filter((s) => s.packs.includes(pack.id)).map((s) => s.id);
      expect(roleSetsFor([pack.id]).map((s) => s.id), pack.id).toEqual(want);
    }
  });
});

// --- Flow: visibility ------------------------------------------------------

describe('flow: which screens are visible', () => {
  const BASE_ORDER: ScreenId[] = [
    'target',
    'roster',
    'base',
    'world',
    'packs',
    'stats',
    'peeves',
    'heart',
    'outfit',
    'name',
    'certificate',
  ];

  it('the screen order is the plan order', () => {
    expect([...SCREEN_ORDER]).toEqual([
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
    ]);
  });

  it('with no packs and roles off, limits, gates and roles are hidden', () => {
    expect(visibleScreens(st())).toEqual(BASE_ORDER);
  });

  it.each(library.packs.map((p) => p.id))('with pack %s, limits show only if it has limitChips', (id) => {
    st().togglePack(id);
    const want = packOf(id).limitChips.length > 0;
    expect(visibleScreens(st()).includes('limits')).toBe(want);
    expect(exposedLimits([id]).length > 0).toBe(want);
  });

  it.each(library.packs.map((p) => p.id))('with pack %s, gates show only if it exposes a gate besides pay', (id) => {
    st().togglePack(id);
    const want = Object.keys(packOf(id).gatesDefault).some((a) => a !== 'pay');
    expect(visibleScreens(st()).includes('gates')).toBe(want);
    expect(exposedGates([id]).length > 0).toBe(want);
    expect(exposedGates([id])).not.toContain('pay');
  });

  it('limits and gates sit between packs and stats', () => {
    st().togglePack('memecoins');
    const seen = visibleScreens(st());
    expect(seen.slice(seen.indexOf('packs'), seen.indexOf('stats') + 1)).toEqual([
      'packs',
      'limits',
      'gates',
      'stats',
    ]);
  });

  it('a pack with no limit chips and no gate leaves both screens out', () => {
    st().togglePack('research'); // limitChips [] and gatesDefault {}
    expect(visibleScreens(st())).toEqual(BASE_ORDER);
  });

  it('a pack with gates but no limit chips shows gates only', () => {
    st().togglePack('coding');
    const seen = visibleScreens(st());
    expect(seen).toContain('gates');
    expect(seen).not.toContain('limits');
  });

  it('a pack with limit chips and a gate shows both', () => {
    st().togglePack('sales');
    const seen = visibleScreens(st());
    expect(seen).toContain('limits');
    expect(seen).toContain('gates');
  });

  it('untapping the pack hides the screens again', () => {
    st().togglePack('memecoins');
    st().togglePack('memecoins');
    expect(visibleScreens(st())).toEqual(BASE_ORDER);
  });

  it.each(library.targets.profiles.map((p) => p.id))(
    'roles show on %s only with advancedRoles on and a profile that supports roles',
    (profileId) => {
      const profile = library.targets.profiles.find((p) => p.id === profileId) as Profile;
      st().setTarget(profile.target, profile.mode);
      expect(visibleScreens(st()).includes('roles'), 'advanced off').toBe(false);
      st().setAdvancedRoles(true);
      expect(visibleScreens(st()).includes('roles'), 'advanced on').toBe(profile.supportsRoles);
      st().setAdvancedRoles(false);
      expect(visibleScreens(st()).includes('roles'), 'advanced off again').toBe(false);
    },
  );

  it('roles sit between outfit and name when visible', () => {
    st().setTarget('openclaw');
    st().setAdvancedRoles(true);
    const seen = visibleScreens(st());
    expect(seen.slice(seen.indexOf('outfit'), seen.indexOf('name') + 1)).toEqual(['outfit', 'roles', 'name']);
  });

  it('progress dots count base to name for the build', () => {
    expect(progressScreens(st())).toEqual(['base', 'world', 'packs', 'stats', 'peeves', 'heart', 'outfit', 'name']);
    st().togglePack('memecoins');
    st().setTarget('hermes');
    st().setAdvancedRoles(true);
    expect(progressScreens(st())).toEqual([
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
    ]);
  });
});

// --- Flow: skip, next, back, canSkip ---------------------------------------

describe('flow: skip', () => {
  it.each(['target', 'roster', 'base', 'name', 'certificate'] as const)('canSkip is false on %s', (screen) => {
    expect(canSkip(screen)).toBe(false);
  });

  it.each(['world', 'packs', 'limits', 'gates', 'stats', 'peeves', 'heart', 'outfit', 'roles'] as const)(
    'canSkip is true on %s',
    (screen) => {
      expect(canSkip(screen)).toBe(true);
    },
  );

  it.each(['target', 'roster', 'base', 'name', 'certificate'] as const)(
    'skip() on %s does nothing and records nothing',
    (screen) => {
      st().go(screen);
      st().skip();
      expect(st().screen).toBe(screen);
      expect(st().skipped).toEqual([]);
    },
  );

  it('skip records the screen and moves to the next visible one', () => {
    st().go('world');
    st().skip();
    expect(st().skipped).toEqual(['world']);
    expect(st().screen).toBe('packs');
  });

  it('skip passes over hidden screens', () => {
    st().go('packs');
    st().skip(); // no packs: limits and gates are hidden
    expect(st().skipped).toEqual(['packs']);
    expect(st().screen).toBe('stats');
  });

  it('skipping several screens records each once, in order', () => {
    st().go('world');
    st().skip();
    st().skip();
    st().skip();
    expect(st().skipped).toEqual(['world', 'packs', 'stats']);
    expect(st().screen).toBe('peeves');
  });

  it('skipping the same screen twice does not record it twice', () => {
    st().go('world');
    st().skip();
    st().go('world');
    st().skip();
    expect(st().skipped).toEqual(['world']);
  });

  it('next on a skipped screen unrecords it', () => {
    st().go('world');
    st().skip();
    st().back();
    expect(st().screen).toBe('world');
    expect(st().skipped).toEqual(['world']);
    st().next();
    expect(st().skipped).toEqual([]);
    expect(st().screen).toBe('packs');
  });

  it('next only unrecords the screen it leaves', () => {
    st().go('world');
    st().skip();
    st().skip();
    expect(st().skipped).toEqual(['world', 'packs']);
    st().go('world');
    st().next();
    expect(st().skipped).toEqual(['packs']);
  });

  it('next on a screen that was never skipped records nothing (U6c)', () => {
    st().go('heart');
    st().next();
    expect(st().skipped).toEqual([]);
    expect(st().screen).toBe('outfit');
    st().next();
    expect(st().skipped).toEqual([]);
  });

  it('skipping heart or outfit keeps the defaults and lists the screen (S9, U3)', () => {
    st().setBase('professional');
    st().go('heart');
    st().skip();
    st().skip();
    expect(st().skipped).toEqual(['heart', 'outfit']);
    const build = previewBuild(st());
    expect(build.heart.hardPart).toBe('calmer');
    expect(build.outfit).toBe('has_it_together');
  });

  it('go() and back() do not touch the skipped list', () => {
    st().go('world');
    st().skip();
    st().go('stats');
    st().back();
    expect(st().skipped).toEqual(['world']);
  });
});

describe('flow: next is blocked until the required pick is made (U2)', () => {
  it('on target', () => {
    expect(st().screen).toBe('target');
    expect(canContinue(st())).toBe(false);
    st().next();
    expect(st().screen).toBe('target');
    st().setTarget('muse');
    expect(canContinue(st())).toBe(true);
    st().next();
    expect(st().screen).toBe('roster');
  });

  it('on base', () => {
    st().go('base');
    expect(canContinue(st())).toBe(false);
    st().next();
    expect(st().screen).toBe('base');
    st().setBase('trader');
    expect(canContinue(st())).toBe(true);
    st().next();
    expect(st().screen).toBe('world');
  });

  it('on name, an empty name blocks', () => {
    st().go('name');
    st().next();
    expect(st().screen).toBe('name');
  });

  it('on name, a blank name blocks', () => {
    st().go('name');
    st().setName('     ');
    expect(canContinue(st())).toBe(false);
    st().next();
    expect(st().screen).toBe('name');
  });

  it.each(['A', 'Rex', '  Rex  ', 'x'.repeat(24)])('on name, %j continues', (name) => {
    st().go('name');
    st().setName(name);
    expect(canContinue(st())).toBe(true);
    st().next();
    expect(st().screen).toBe('certificate');
  });

  it('a blocked next does not touch the skipped list', () => {
    st().go('base');
    st().next();
    expect(st().skipped).toEqual([]);
  });

  it.each(['roster', 'world', 'packs', 'limits', 'gates', 'stats', 'peeves', 'heart', 'outfit', 'roles'] as const)(
    'every other screen continues on its defaults: %s',
    (screen) => {
      st().go(screen);
      expect(canContinue(st())).toBe(true);
    },
  );

  it('the certificate is the last screen', () => {
    st().go('certificate');
    expect(nextScreen(st())).toBe('certificate');
    st().next();
    expect(st().screen).toBe('certificate');
  });

  it('isComplete wants a target, a base and a valid name', () => {
    expect(isComplete(st())).toBe(false);
    st().setTarget('muse');
    expect(isComplete(st())).toBe(false);
    st().setBase('trader');
    expect(isComplete(st())).toBe(false);
    st().setName('   ');
    expect(isComplete(st())).toBe(false);
    st().setName('Rex');
    expect(isComplete(st())).toBe(true);
  });
});

describe('flow: walking through the screens', () => {
  function walk(): ScreenId[] {
    const seen: ScreenId[] = [st().screen];
    for (let i = 0; i < 30; i++) {
      const before = st().screen;
      if (before === 'base' && st().draft.base === undefined) st().setBase('trader');
      if (before === 'name' && st().draft.name === '') st().setName('Rex');
      st().next();
      if (st().screen === before) break;
      seen.push(st().screen);
    }
    return seen;
  }

  it('a plain build with no packs and roles off', () => {
    st().setTarget('muse');
    expect(walk()).toEqual([
      'target',
      'roster',
      'base',
      'world',
      'packs',
      'stats',
      'peeves',
      'heart',
      'outfit',
      'name',
      'certificate',
    ]);
  });

  it('a markets build shows limits and gates', () => {
    st().setTarget('muse');
    st().toggleChip('memecoins');
    expect(walk()).toEqual([
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

  it('an openclaw build with roles on shows roles before the name', () => {
    st().setTarget('openclaw');
    st().toggleChip('engineering');
    st().setAdvancedRoles(true);
    expect(walk()).toEqual([
      'target',
      'roster',
      'base',
      'world',
      'packs',
      'gates',
      'stats',
      'peeves',
      'heart',
      'outfit',
      'roles',
      'name',
      'certificate',
    ]);
  });

  it('a muse build with roles on still skips the roles screen', () => {
    st().setTarget('muse');
    st().setAdvancedRoles(true);
    expect(walk()).not.toContain('roles');
  });

  it('back retraces the visible screens', () => {
    st().setTarget('openclaw');
    st().toggleChip('engineering');
    st().setAdvancedRoles(true);
    const forward = walk();
    const back: ScreenId[] = [st().screen];
    for (let i = 0; i < 30; i++) {
      const before = st().screen;
      st().back();
      if (st().screen === before) break;
      back.push(st().screen);
    }
    expect(back).toEqual([...forward].reverse());
  });

  it('back from name lands on outfit when roles are hidden and on roles when visible', () => {
    st().setTarget('muse');
    st().go('name');
    expect(prevScreen(st())).toBe('outfit');
    st().setTarget('hermes');
    st().setAdvancedRoles(true);
    expect(prevScreen(st())).toBe('roles');
  });

  it('back on the first screen stays put', () => {
    st().back();
    expect(st().screen).toBe('target');
  });

  it('back from the certificate of a used starter returns to the roster', () => {
    st().setTarget('muse');
    st().useStarter('marty');
    expect(st().screen).toBe('certificate');
    st().back();
    expect(st().screen).toBe('roster');
  });

  it('back from the certificate of a built bot returns to the name screen', () => {
    st().setTarget('muse');
    st().startBlank();
    st().setBase('trader');
    st().setName('Rex');
    st().go('name');
    st().next();
    expect(st().screen).toBe('certificate');
    st().back();
    expect(st().screen).toBe('name');
  });
});

// --- Starters --------------------------------------------------------------

describe('useStarter, remixStarter, startBlank', () => {
  it('start with no origin', () => {
    expect(st().from).toBeNull();
  });

  it('useStarter goes to the certificate with from "roster"', () => {
    st().setTarget('muse');
    st().useStarter('marty');
    expect(st().screen).toBe('certificate');
    expect(st().from).toBe('roster');
  });

  it('remixStarter goes to the base screen with from "remix"', () => {
    st().setTarget('muse');
    st().remixStarter('marty');
    expect(st().screen).toBe('base');
    expect(st().from).toBe('remix');
  });

  it('startBlank goes to the base screen with from "blank" and an empty draft', () => {
    st().setTarget('openclaw');
    st().toggleChip('law');
    st().setName('Rex');
    st().startBlank();
    expect(st().screen).toBe('base');
    expect(st().from).toBe('blank');
    expect(st().draft.chips).toEqual([]);
    expect(st().draft.name).toBe('');
    expect(st().draft.base).toBeUndefined();
    expect(st().draft.stats).toBeUndefined();
    expect(st().target).toBe('openclaw');
  });

  it('startBlank clears skipped screens and the touched flags', () => {
    st().go('world');
    st().skip();
    st().setBase('professional');
    st().setStat('proactive', 3);
    st().togglePack('research');
    st().startBlank();
    expect(st().skipped).toEqual([]);
    expect(st().touched).toEqual({ proactive: false, packs: false, d2: false });
  });

  it.each(library.roster.map((r) => r.id))('useStarter(%s) loads the roster build into the draft', (id) => {
    const entry = library.roster.find((r) => r.id === id);
    if (!entry) throw new Error('missing');
    const b = entry.build;
    st().setTarget('muse');
    st().useStarter(id);
    const d = st().draft;
    expect(d.base).toBe(b.base);
    expect(d.chips).toEqual(b.chips);
    expect(d.stats).toEqual(b.stats);
    expect(d.peeves).toEqual(b.peeves);
    expect(d.heart).toEqual(b.heart);
    expect(d.outfit).toBe(b.outfit);
    expect(d.name).toBe(b.name);
    expect(d.packs).toEqual(expectedPacks(b.chips));
    expect(d.limits).toEqual({});
    expect(d.gates).toEqual({});
  });

  it.each(library.roster.map((r) => r.id))('remixStarter(%s) loads the same draft', (id) => {
    const entry = library.roster.find((r) => r.id === id);
    if (!entry) throw new Error('missing');
    const b = entry.build;
    st().setTarget('muse');
    st().remixStarter(id);
    const d = st().draft;
    expect(d.base).toBe(b.base);
    expect(d.chips).toEqual(b.chips);
    expect(d.stats).toEqual(b.stats);
    expect(d.peeves).toEqual(b.peeves);
    expect(d.heart).toEqual(b.heart);
    expect(d.outfit).toBe(b.outfit);
    expect(d.name).toBe(b.name);
  });

  it('using a starter clears earlier skipped screens', () => {
    st().setTarget('muse');
    st().go('world');
    st().skip();
    st().useStarter('june');
    expect(st().skipped).toEqual([]);
  });

  it('an unknown starter id changes nothing', () => {
    st().setTarget('muse');
    st().useStarter('nobody');
    st().remixStarter('nobody');
    expect(st().screen).toBe('target');
    expect(st().from).toBeNull();
    expect(st().draft.base).toBeUndefined();
  });

  it('editing a remixed draft never touches the library roster', () => {
    const before = structuredClone(library.roster);
    st().setTarget('muse');
    st().remixStarter('marty');
    st().toggleChip('law');
    st().toggleChip('memecoins');
    st().setStat('blunt', 1);
    st().togglePeeve('uses_emoji');
    st().setName('Other');
    expect(library.roster).toEqual(before);
  });

  it('a remixed draft keeps editing like a built one: chips drive packs and risk', () => {
    st().setTarget('muse');
    st().remixStarter('marty'); // chips memecoins, solana, nba, night_owl; risk 4
    expect(st().draft.packs).toEqual(['memecoins']);
    st().toggleChip('engineering');
    expect(st().draft.packs).toEqual(['memecoins', 'coding']);
    st().toggleChip('memecoins');
    expect(stats().risk).toBe(4); // solana is still a Markets chip
    st().toggleChip('solana');
    expect(stats().risk).toBeUndefined();
  });

  it('a remixed draft follows blunt for d2 while d2 matches the roster formula', () => {
    st().setTarget('muse');
    st().remixStarter('marty'); // blunt 4, d2.blunt.4
    expect(st().touched.d2).toBe(false);
    st().setStat('blunt', 3);
    expect(st().draft.heart?.d2).toBe('d2.blunt.3');
  });

  it('after remix, next from base goes to the world screen', () => {
    st().setTarget('muse');
    st().remixStarter('rook');
    st().next();
    expect(st().screen).toBe('world');
  });

  describe.each(CONFIGS)('on $name', (cfg) => {
    it.each(library.roster.map((r) => r.id))(
      'useStarter(%s) compiles to the same soul as the roster build migrated to this target',
      (id) => {
        const entry = library.roster.find((r) => r.id === id);
        if (!entry) throw new Error('missing');
        applyCfg(cfg);
        st().useStarter(id);
        const got = compiled(st());
        expect(isCompileError(got)).toBe(false);
        const want = compile(migrate(entry.build, { target: cfg.target, mode: cfg.mode, plan: cfg.plan }));
        if (isCompileError(got)) return;
        expect(got.soul).toBe(want.soul);
        expect(got).toEqual(want);
      },
    );

    it('remixStarter compiles to the same result as useStarter for every starter', () => {
      for (const entry of library.roster) {
        st().reset();
        applyCfg(cfg);
        st().useStarter(entry.id);
        const used = compiled(st());
        st().reset();
        applyCfg(cfg);
        st().remixStarter(entry.id);
        expect(compiled(st()), entry.id).toEqual(used);
      }
    });
  });
});

// --- previewBuild and compiled ---------------------------------------------

describe('previewBuild and compiled', () => {
  it('a fresh state fills the gaps with the defaults of U2 and U3', () => {
    const b = previewBuild(st());
    const chaos = library.bases.find((x) => x.id === 'chaos');
    const calmer = library.heart.hardParts.find((h) => h.id === 'calmer');
    expect(b.base).toBe('chaos');
    expect(b.stats).toEqual(chaos?.defaults);
    expect(b.chips).toEqual([]);
    expect(b.peeves).toEqual([]);
    expect(b.heart.hardPart).toBe('calmer');
    expect(b.heart.d1).toBe(calmer?.d1);
    expect(b.heart.d2).toBe('d2.blunt.2'); // chaos blunt is 2
    expect(b.outfit).toBe('has_it_together');
    expect(b.name).toBe(copy.defaultName);
    expect(b.packs).toEqual([]);
  });

  it('a fresh state compiles', () => {
    const c = compiled(st());
    expect(isCompileError(c)).toBe(false);
    if (isCompileError(c)) return;
    expect(c.soul.length).toBeGreaterThan(0);
    expect(c.buildName.length).toBeGreaterThan(0);
  });

  it('the default name appears in a fresh soul', () => {
    const c = compiled(st());
    if (isCompileError(c)) throw new Error(c.error);
    expect(c.soul).toContain(copy.defaultName);
  });

  it('a chosen base replaces the chaos fallback', () => {
    st().setBase('parent');
    expect(previewBuild(st()).base).toBe('parent');
    expect(previewBuild(st()).stats).toEqual(baseDefaults('parent'));
  });

  it('picks show up in the build', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    st().setBase('builder');
    st().toggleChip('engineering');
    st().togglePeeve('uses_emoji');
    st().setHardPart('forget');
    st().setOutfit('mechanic');
    st().setName('  Rex ');
    const b = previewBuild(st());
    expect(b.v).toBe(2);
    expect(b.target).toBe('chatgpt');
    expect(b.mode).toBe('instructions');
    expect(b.plan).toBe('paid');
    expect(b.base).toBe('builder');
    expect(b.chips).toEqual(['engineering']);
    expect(b.peeves).toEqual(['uses_emoji']);
    expect(b.heart.hardPart).toBe('forget');
    expect(b.outfit).toBe('mechanic');
    expect(b.name).toBe('Rex');
    expect(b.packs).toEqual(['coding']);
  });

  it('with no target the preview builds for muse', () => {
    expect(previewBuild(st()).target).toBe('muse');
  });

  it('is memoized: the same picks return the same object', () => {
    st().setBase('parent');
    expect(previewBuild(st())).toBe(previewBuild(st()));
    expect(compiled(st())).toBe(compiled(st()));
  });

  it('a change gives a new build', () => {
    st().setBase('parent');
    const a = previewBuild(st());
    st().toggleChip('dog');
    expect(previewBuild(st())).not.toBe(a);
    expect(previewBuild(st()).chips).toEqual(['dog']);
  });

  it('the build carries user limits and gates but not the pay lock', () => {
    st().togglePack('memecoins');
    st().setLimit('per_trade_pct', 2);
    st().setGate('trade', 'forbid');
    const b = previewBuild(st());
    expect(b.limits).toEqual({ per_trade_pct: 2 });
    expect(b.gates).toEqual({ trade: 'forbid' });
  });

  it('compiled never returns an error for any single pick of base, chip, peeve, hard part or outfit', () => {
    for (const base of library.bases) {
      st().reset();
      st().setBase(base.id);
      expect(isCompileError(compiled(st())), `base ${base.id}`).toBe(false);
    }
    for (const chip of library.chips) {
      st().reset();
      st().setBase('professional');
      st().toggleChip(chip.id);
      expect(isCompileError(compiled(st())), `chip ${chip.id}`).toBe(false);
    }
    for (const peeve of library.peeves) {
      st().reset();
      st().setBase('professional');
      st().togglePeeve(peeve.id);
      expect(isCompileError(compiled(st())), `peeve ${peeve.id}`).toBe(false);
    }
    for (const hp of library.heart.hardParts) {
      st().reset();
      st().setBase('professional');
      st().setHardPart(hp.id);
      expect(isCompileError(compiled(st())), `hard part ${hp.id}`).toBe(false);
    }
    for (const outfit of library.outfits) {
      st().reset();
      st().setBase('professional');
      st().setOutfit(outfit.id);
      expect(isCompileError(compiled(st())), `outfit ${outfit.id}`).toBe(false);
    }
  });

  it('compiled never returns an error for any target and mode', () => {
    for (const cfg of CONFIGS) {
      st().reset();
      applyCfg(cfg);
      st().setBase('trader');
      st().toggleChip('memecoins');
      expect(isCompileError(compiled(st())), cfg.name).toBe(false);
    }
  });

  it('compiled never returns an error for any pack, on any target', () => {
    for (const cfg of CONFIGS) {
      for (const pack of library.packs) {
        st().reset();
        applyCfg(cfg);
        st().setBase('professional');
        st().togglePack(pack.id);
        expect(isCompileError(compiled(st())), `${cfg.name} ${pack.id}`).toBe(false);
      }
    }
  });

  it('compiled never returns an error with roles on, for every role set on every target', () => {
    for (const cfg of CONFIGS) {
      for (const set of library.roleSets) {
        st().reset();
        applyCfg(cfg);
        st().setBase('professional');
        st().togglePack(set.packs[0] as string);
        st().setAdvancedRoles(true);
        expect(isCompileError(compiled(st())), `${cfg.name} ${set.id}`).toBe(false);
        for (const member of set.members) {
          st().toggleRole(member);
          expect(isCompileError(compiled(st())), `${cfg.name} ${set.id} ${member}`).toBe(false);
        }
      }
    }
  });

  it('capOf reads the profile caps from the library', () => {
    for (const cfg of CONFIGS) {
      st().reset();
      applyCfg(cfg);
      const id = cfg.target === 'chatgpt' ? `chatgpt-${cfg.mode}` : cfg.target;
      const profile = library.targets.profiles.find((p) => p.id === id) as Profile;
      const want = typeof profile.lengthCap === 'number' ? profile.lengthCap : profile.lengthCap[cfg.plan ?? 'free'];
      expect(capOf(st()), cfg.name).toBe(want);
    }
  });
});

// --- A seeded random walk over every action --------------------------------

type Rnd = () => number;

function mulberry32(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: Rnd, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)] as T;
}

const CHIP_IDS = library.chips.map((c) => c.id);
const PEEVE_IDS = library.peeves.map((p) => p.id);
const PACK_IDS = library.packs.map((p) => p.id);
const LIMIT_IDS = library.limits.map((l) => l.id);
const GATE_IDS = library.gates.map((g) => g.id);
const ROLE_IDS = library.roles.map((r) => r.id);
const BASE_IDS = library.bases.map((b) => b.id);
const HARD_PART_IDS = library.heart.hardParts.map((h) => h.id);
const D1_IDS = library.heart.drives.filter((d) => d.slot === 'd1').map((d) => d.id);
const D2_IDS = library.heart.drives.filter((d) => d.slot === 'd2').map((d) => d.id);
const OUTFIT_IDS = library.outfits.map((o) => o.id);
const STARTER_IDS = library.roster.map((r) => r.id);
const STAT_PICKS: StatId[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive', 'risk'];
const NAMES = ['', ' ', 'Rex', 'a name that is far longer than twenty four characters', '  Pip  '];

const WALK_ACTIONS: ((r: Rnd) => void)[] = [];
function weight(n: number, fn: (r: Rnd) => void): void {
  for (let i = 0; i < n; i++) WALK_ACTIONS.push(fn);
}
weight(2, (r) => {
  const c = pick(r, CONFIGS);
  st().setTarget(c.target, c.mode, c.plan);
});
weight(1, (r) => st().setMode(pick(r, ['dot', 'gpt', 'instructions', 'project'] as const)));
weight(1, (r) => st().setPlan(pick(r, ['free', 'paid'] as const)));
weight(1, (r) => st().useStarter(pick(r, STARTER_IDS)));
weight(1, (r) => st().remixStarter(pick(r, STARTER_IDS)));
weight(1, () => st().startBlank());
weight(3, (r) => st().setBase(pick(r, BASE_IDS)));
weight(8, (r) => st().toggleChip(pick(r, CHIP_IDS)));
weight(8, (r) => st().setStat(pick(r, STAT_PICKS), (1 + Math.floor(r() * 4)) as Level));
weight(4, (r) => st().togglePack(pick(r, PACK_IDS)));
weight(3, (r) => st().setLimit(pick(r, LIMIT_IDS), r() * 340 - 20));
weight(3, (r) => st().setGate(pick(r, [...GATE_IDS]), pick(r, ['auto', 'approve', 'forbid'] as const)));
weight(3, (r) => st().togglePeeve(pick(r, PEEVE_IDS)));
weight(3, (r) => st().setHardPart(pick(r, HARD_PART_IDS)));
weight(2, (r) => st().setD1(pick(r, D1_IDS)));
weight(2, (r) => st().setD2(pick(r, D2_IDS)));
weight(2, (r) => st().setOutfit(pick(r, OUTFIT_IDS)));
weight(2, (r) => st().setName(pick(r, NAMES)));
weight(2, (r) => st().setAdvancedRoles(r() < 0.6));
weight(3, (r) => st().toggleRole(pick(r, ROLE_IDS)));
weight(2, (r) => st().go(pick(r, SCREEN_ORDER)));
weight(3, () => st().next());
weight(2, () => st().back());
weight(2, () => st().skip());

function checkInvariants(s: BuilderState, ctx: string): void {
  const c = compiled(s);
  expect(isCompileError(c) ? c.error : 'compiled', ctx).toBe('compiled');

  const d = s.draft;
  expect(new Set(d.chips).size, `${ctx}: chips unique`).toBe(d.chips.length);
  expect(d.chips.length, `${ctx}: chips <= 6`).toBeLessThanOrEqual(6);
  expect(new Set(d.packs).size, `${ctx}: packs unique`).toBe(d.packs.length);
  expect(d.packs.length, `${ctx}: packs <= 3`).toBeLessThanOrEqual(3);
  expect(new Set(d.peeves).size, `${ctx}: peeves unique`).toBe(d.peeves.length);
  expect(d.peeves.length, `${ctx}: peeves <= 5`).toBeLessThanOrEqual(5);
  expect(d.name.length, `${ctx}: name <= 24`).toBeLessThanOrEqual(24);

  const markets = d.chips.some((c2) => MARKETS_CHIPS.includes(c2));
  if (d.stats) {
    for (const id of ['blunt', 'warm', 'funny', 'chatty', 'proactive'] as const) {
      const v = d.stats[id];
      expect(Number.isInteger(v) && v >= 1 && v <= 4, `${ctx}: ${id} in 1..4 (${v})`).toBe(true);
    }
    expect(total(d.stats), `${ctx}: total <= 14`).toBeLessThanOrEqual(14);
    expect(d.stats.risk !== undefined, `${ctx}: risk iff a Markets chip`).toBe(markets);
    if (d.stats.risk !== undefined) {
      expect(d.stats.risk >= 1 && d.stats.risk <= 4, `${ctx}: risk in 1..4`).toBe(true);
    }
  } else {
    expect(d.base, `${ctx}: no stats means no base`).toBeUndefined();
  }

  const avail = new Set(availablePacks(compiledProfile(s)).map((p) => p.id));
  for (const id of d.packs) expect(avail.has(id), `${ctx}: pack ${id} deliverable`).toBe(true);
  if (!s.touched.packs) expect(d.packs, `${ctx}: packs follow chips`).toEqual(expectedPacks(d.chips));

  const packs = d.packs.map(packOf);
  const limitIds = new Set(packs.flatMap((p) => p.limitChips));
  for (const [id, v] of Object.entries(d.limits)) {
    expect(limitIds.has(id), `${ctx}: limit ${id} exposed`).toBe(true);
    const l = library.limits.find((x) => x.id === id) as { min: number; max: number; step: number };
    expect(v >= l.min - 1e-9 && v <= l.max + 1e-9, `${ctx}: limit ${id} in range`).toBe(true);
    const steps = (v - l.min) / l.step;
    expect(Math.abs(steps - Math.round(steps)) < 1e-6, `${ctx}: limit ${id} on step`).toBe(true);
  }
  const gateIds = new Set(packs.flatMap((p) => Object.keys(p.gatesDefault)));
  for (const [id, setting] of Object.entries(d.gates)) {
    expect(id, `${ctx}: pay is never stored`).not.toBe('pay');
    expect(gateIds.has(id), `${ctx}: gate ${id} exposed`).toBe(true);
    expect(['auto', 'approve', 'forbid'], `${ctx}: gate ${id} setting`).toContain(setting);
  }
  expect(effectiveGatesOf(s)['pay'], `${ctx}: pay forbid`).toBe('forbid');

  if (d.roles !== undefined && d.roles.length > 0) {
    const sets = new Set(d.roles.map((r) => roleOf(r).set));
    expect(sets.size, `${ctx}: roles from one set`).toBe(1);
    const set = roleSetOfId([...sets][0] as string);
    expect(d.roles, `${ctx}: coordinator in roles`).toContain(set.coordinator);
    expect(new Set(d.roles).size, `${ctx}: roles unique`).toBe(d.roles.length);
    expect(
      roleSetsFor(d.packs).map((x) => x.id),
      `${ctx}: roles fit the packs`,
    ).toContain(set.id);
  }

  if (d.heart) {
    const hp = library.heart.hardParts.find((h) => h.id === d.heart?.hardPart);
    const okD1 = [hp?.d1, ...d.chips.map((c2) => library.chips.find((x) => x.id === c2)?.d1Suggest)];
    expect(okD1, `${ctx}: d1 valid`).toContain(d.heart.d1);
    expect(D2_IDS, `${ctx}: d2 valid`).toContain(d.heart.d2);
    if (!s.touched.d2 && d.stats) {
      expect(d.heart.d2, `${ctx}: d2 follows blunt`).toBe(`d2.blunt.${d.stats.blunt}`);
    }
  }

  expect(s.skipped.length, `${ctx}: skipped screens are all skippable`).toBe(s.skipped.filter(canSkip).length);
  expect(new Set(s.skipped).size, `${ctx}: skipped unique`).toBe(s.skipped.length);
}

function compiledProfile(s: BuilderState): Profile {
  const id = s.target === 'chatgpt' ? `chatgpt-${s.mode ?? 'dot'}` : (s.target ?? 'muse');
  return library.targets.profiles.find((p) => p.id === id) as Profile;
}

function randomWalk(seed: number, steps: number, onState?: (s: BuilderState) => void): void {
  const r = mulberry32(seed);
  st().reset();
  const c = pick(r, CONFIGS);
  st().setTarget(c.target, c.mode, c.plan);
  for (let i = 0; i < steps; i++) {
    pick(r, WALK_ACTIONS)(r);
    checkInvariants(st(), `seed ${seed} step ${i}`);
    onState?.(st());
  }
}

describe('random walk over every action', () => {
  const SEEDS = Number(process.env['WALK_SEEDS'] ?? 40);
  it.each(Array.from({ length: SEEDS }, (_, i) => i + 1))(
    'seed %i: invariants hold and compiled never errors across 300 actions',
    (seed) => {
      randomWalk(seed, 300);
    },
  );

  // Guards against a walk that never leaves the shallow end: the states it visits must include the
  // interesting ones, or the invariants above prove little.
  it('the walk reaches limits, gates, roles, risk, remixed drafts, hand-picked packs and touched d2', () => {
    const seen = new Set<string>();
    const note = (cond: boolean, name: string) => {
      if (cond) seen.add(name);
    };
    for (let seed = 1; seed <= 12; seed++) {
      randomWalk(seed, 300, (s) => {
        note(s.draft.packs.length >= 2, 'two packs');
        note(Object.keys(s.draft.limits).length > 0, 'limits');
        note(Object.keys(s.draft.gates).length > 0, 'gates');
        note((s.draft.roles ?? []).length > 0, 'roles');
        note(s.draft.stats?.risk !== undefined, 'risk');
        note(s.from === 'remix', 'remix');
        note(s.from === 'roster', 'roster');
        note(s.touched.packs, 'touched packs');
        note(s.touched.d2, 'touched d2');
        note(s.touched.proactive, 'touched proactive');
        note(s.nudged, 'nudged');
        note(s.skipped.length > 0, 'skipped');
        note(s.draft.chips.length === 6, 'six chips');
        note(s.draft.peeves.length === 5, 'five peeves');
        note(s.draft.stats !== undefined && total(s.draft.stats) === 14, 'full stat budget');
        note(s.target === 'chatgpt' && s.mode === 'instructions' && s.plan === 'paid', 'instructions paid');
        note(s.screen === 'certificate', 'certificate');
      });
    }
    expect([...seen].sort()).toEqual(
      [
        'two packs',
        'limits',
        'gates',
        'roles',
        'risk',
        'remix',
        'roster',
        'touched packs',
        'touched d2',
        'touched proactive',
        'nudged',
        'skipped',
        'six chips',
        'five peeves',
        'full stat budget',
        'instructions paid',
        'certificate',
      ].sort(),
    );
  });
});

// --- No storage, no network ------------------------------------------------

describe('no storage and no network', () => {
  const touches: string[] = [];
  const saved = new Map<string, PropertyDescriptor | undefined>();
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined;

  function stubStorage(name: string) {
    const log = (op: string) => () => {
      touches.push(`${name}.${op}`);
      return null;
    };
    return {
      getItem: log('getItem'),
      setItem: log('setItem'),
      removeItem: log('removeItem'),
      clear: log('clear'),
      key: log('key'),
      length: 0,
    };
  }

  function guardGlobal(name: string, make: () => unknown): void {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        touches.push(name);
        return make();
      },
      set() {
        touches.push(`${name}=`);
      },
    });
  }

  beforeEach(() => {
    touches.length = 0;
    guardGlobal('localStorage', () => stubStorage('localStorage'));
    guardGlobal('sessionStorage', () => stubStorage('sessionStorage'));
    guardGlobal('indexedDB', () => ({
      open: () => {
        touches.push('indexedDB.open');
        return {};
      },
    }));
    // Node has no document; a stub with a watched cookie property stands in for it.
    saved.set('document', Object.getOwnPropertyDescriptor(globalThis, 'document'));
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        get cookie() {
          touches.push('document.cookie');
          return '';
        },
        set cookie(_v: string) {
          touches.push('document.cookie=');
        },
      },
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    for (const [name, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete (globalThis as Record<string, unknown>)[name];
    }
    saved.clear();
  });

  it('a full scripted build touches no storage, cookie, indexedDB or network', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    st().startBlank();
    st().setBase('trader');
    st().toggleChip('memecoins');
    st().toggleChip('kids');
    st().toggleChip('engineering');
    st().setStat('blunt', 4);
    st().togglePack('perps');
    st().setLimit('leverage_cap', 3);
    st().setGate('trade', 'forbid');
    st().togglePeeve('uses_emoji');
    st().setHardPart('forget');
    st().setD2('d2.blunt.1');
    st().setOutfit('mechanic');
    st().setAdvancedRoles(true);
    st().toggleRole('analyst');
    st().setName('Rex');
    st().go('base');
    for (let i = 0; i < 14; i++) st().next();
    st().skip();
    st().back();
    compiled(st());
    previewBuild(st());
    st().reset();
    st().setTarget('muse');
    st().useStarter('marty');
    compiled(st());
    expect(touches).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a random walk touches no storage, cookie, indexedDB or network', () => {
    for (const seed of [101, 102, 103, 104]) randomWalk(seed, 150);
    expect(touches).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the guards do fire when something does touch storage (the spies work)', () => {
    void (globalThis as unknown as { localStorage: { getItem: (k: string) => unknown } }).localStorage.getItem('x');
    void (globalThis as unknown as { sessionStorage: unknown }).sessionStorage;
    expect(touches).toContain('localStorage');
    expect(touches).toContain('localStorage.getItem');
    expect(touches).toContain('sessionStorage');
  });

  it('the UI source files never mention a storage or network API', () => {
    for (const file of ['store.ts', 'flow.ts', 'copy.ts']) {
      const text = readFileSync(fileURLToPath(new URL(`../src/ui/${file}`, import.meta.url)), 'utf8');
      expect(text, file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|persist\(|fetch\(|XMLHttpRequest|WebSocket/);
    }
  });
});
