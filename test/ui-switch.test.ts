// Target switch tests (M4 slice 4.7b). Node environment, no React.
//
// Expected behavior comes from docs/M4-PLAN.md section 3 ("Target switch") and QUESTIONS.md W10:
//   - switchTarget is a plain set() of target, mode and plan. The draft is left untouched.
//   - ChatGPT returns to the mode and plan it was last left on, and the hidden GPT mode reads as dot.
//     With no earlier ChatGPT mode it defaults to dot (and free, which only instructions carries).
//   - settle() no longer filters packs by profile. A pack a profile cannot deliver stays in the
//     build; its gates, limits and rules stay in effect and only its skills and triggers are left
//     out, named as undelivered.
//   - For every ordered pair of targets, { draft, mode, plan } is deep-equal after a switch and a
//     switch back, including an edit in between, and the gates after a switch are a superset.
// No pack in the library restricts its profiles today, so these tests narrow the coding pack to
// muse in memory (the plan's synthetic pack) and put it back after every test.
// Nothing here is copied from compiler output: pack ids, labels, gate defaults and limit ranges
// are read from the library JSON.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { compile } from '../src/compiler/compile.js';
import library from '../src/library/index.js';
import { exposedGates, exposedLimits } from '../src/ui/flow.js';
import {
  effectiveGatesOf,
  effectiveLimitsOf,
  previewBuild,
  useBuilder,
  type BuilderState,
} from '../src/ui/store.js';
import type {
  ActionId,
  ChatgptMode,
  GateSetting,
  Plan,
  TargetId,
  WorkflowPack,
} from '../src/compiler/types.js';

// --- Helpers ---------------------------------------------------------------

const st = () => useBuilder.getState();

function packOf(id: string): WorkflowPack {
  const p = library.packs.find((x) => x.id === id);
  if (!p) throw new Error(`test setup: no pack ${id}`);
  return p;
}

const TARGETS: TargetId[] = library.targets.targets.map((t) => t.id);

interface Cfg {
  name: string;
  target: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
}

// Every place a build can start: the four plain targets and the ChatGPT modes the picker offers.
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

const STRICTNESS: Record<GateSetting, number> = { auto: 0, approve: 1, forbid: 2 };

// The state's data fields, without the actions.
function dataOf(s: BuilderState): Record<string, unknown> {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function'));
}

// A build with every kind of pick the draft carries: two packs, a gate and a limit override,
// peeves, a heart, an outfit, a name and a role team.
function richBuild(cfg: { target: TargetId; mode?: ChatgptMode; plan?: Plan }): void {
  st().reset();
  st().setTarget(cfg.target, cfg.mode, cfg.plan);
  st().startBlank();
  st().setBase('trader');
  st().toggleChip('memecoins');
  st().toggleChip('engineering');
  st().togglePeeve('adds_disclaimers');
  st().setName('Quill');
  const packs = st().draft.packs;
  // Both packs are in the draft, so their gates and limits are exposed.
  const gate = exposedGates(packs).find((g) => g === 'send');
  if (gate) st().setGate(gate, 'forbid');
  const limitId = exposedLimits(packs)[0];
  const limit = library.limits.find((l) => l.id === limitId);
  if (limit) st().setLimit(limit.id, limit.max);
  st().setAdvancedRoles(true);
}

function gatesNotLooser(
  before: Record<ActionId, GateSetting>,
  after: Record<ActionId, GateSetting>,
  ctx: string,
): void {
  for (const [action, setting] of Object.entries(before)) {
    expect(Object.hasOwn(after, action), `${ctx}: gate ${action} is still in effect`).toBe(true);
    expect(
      STRICTNESS[after[action] as GateSetting],
      `${ctx}: gate ${action} is not looser (${setting} to ${String(after[action])})`,
    ).toBeGreaterThanOrEqual(STRICTNESS[setting]);
  }
}

// The coding pack is narrowed to muse for every test and put back after it.
const coding = packOf('coding');
const original = coding.profiles;

beforeEach(() => {
  coding.profiles = ['muse'];
  st().reset();
});

afterEach(() => {
  if (original === undefined) delete coding.profiles;
  else coding.profiles = original;
  st().reset();
});

// --- The setup is what the tests think it is ---------------------------------

describe('the synthetic restricted pack', () => {
  it('the rich build carries both packs, an override of each kind and a role team', () => {
    richBuild({ target: 'muse' });
    const d = st().draft;
    expect(d.packs).toEqual(['memecoins', 'coding']);
    expect(d.gates['send']).toBe('forbid');
    expect(Object.keys(d.limits).length).toBeGreaterThan(0);
    expect((d.roles ?? []).length).toBeGreaterThan(0);
    expect(st().advancedRoles).toBe(true);
  });

  it('coding lists only muse for these tests, so grok cannot deliver it', () => {
    expect(coding.profiles).toEqual(['muse']);
    richBuild({ target: 'grok' });
    expect(compile(previewBuild(st())).undelivered.map((u) => u.id)).toContain('coding');
  });
});

// --- Switch and switch back --------------------------------------------------

describe('switch and switch back: draft, mode and plan are unchanged', () => {
  for (const cfg of CONFIGS) {
    for (const other of TARGETS.filter((t) => t !== cfg.target)) {
      const label = `${cfg.name} to ${other} and back`;

      it(`${label}`, () => {
        richBuild(cfg);
        const before = structuredClone({ draft: st().draft, mode: st().mode, plan: st().plan });
        st().switchTarget(other);
        expect(st().target).toBe(other);
        st().switchTarget(cfg.target);
        expect(st().target).toBe(cfg.target);
        expect({ draft: st().draft, mode: st().mode, plan: st().plan }).toEqual(before);
      });

      it(`${label}, with an edit in between that is kept`, () => {
        richBuild(cfg);
        const before = structuredClone({ draft: st().draft, mode: st().mode, plan: st().plan });
        st().switchTarget(other);
        st().setName('Edited');
        st().switchTarget(cfg.target);
        expect({ draft: st().draft, mode: st().mode, plan: st().plan }).toEqual({
          ...before,
          draft: { ...before.draft, name: 'Edited' },
        });
      });

      it(`${label}, with an edit in between that is undone`, () => {
        richBuild(cfg);
        const before = structuredClone({ draft: st().draft, mode: st().mode, plan: st().plan });
        st().switchTarget(other);
        st().setName('Edited');
        st().setName(before.draft.name);
        st().switchTarget(cfg.target);
        expect({ draft: st().draft, mode: st().mode, plan: st().plan }).toEqual(before);
      });
    }
  }

  it('a hand-picked pack list survives the same round trip', () => {
    richBuild({ target: 'muse' });
    st().togglePack('research');
    expect(st().touched.packs).toBe(true);
    const before = structuredClone({ draft: st().draft, mode: st().mode, plan: st().plan });
    for (const other of TARGETS.filter((t) => t !== 'muse')) {
      st().switchTarget(other);
      st().switchTarget('muse');
      expect({ draft: st().draft, mode: st().mode, plan: st().plan }, other).toEqual(before);
    }
  });

  it('a switch changes only target, mode, plan and lastChatgpt', () => {
    const rest = (s: BuilderState) => {
      const data = dataOf(s);
      for (const key of ['target', 'mode', 'plan', 'lastChatgpt']) delete data[key];
      return data;
    };
    for (const cfg of CONFIGS) {
      for (const other of TARGETS.filter((t) => t !== cfg.target)) {
        richBuild(cfg);
        const before = rest(st());
        st().switchTarget(other);
        expect(st().target, `${cfg.name} to ${other}`).toBe(other);
        expect(rest(st()), `${cfg.name} to ${other}`).toEqual(before);
        // mode and plan follow the target: only ChatGPT carries a mode, only instructions a plan.
        if (other !== 'chatgpt') {
          expect(st().mode, `${cfg.name} to ${other}: mode`).toBeUndefined();
          expect(st().plan, `${cfg.name} to ${other}: plan`).toBeUndefined();
        }
      }
    }
  });
});

// --- ChatGPT returns to its last mode and plan -------------------------------

describe('ChatGPT returns to the mode and plan it was left on', () => {
  it('instructions plus paid survive a trip to another target and back', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('paid');
    st().switchTarget('muse');
    expect(st().target).toBe('muse');
    st().switchTarget('chatgpt');
    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('paid');
  });

  it.each(CONFIGS.filter((c) => c.target === 'chatgpt'))(
    '$name is what ChatGPT returns to after every other target',
    (cfg) => {
      for (const other of TARGETS.filter((t) => t !== 'chatgpt')) {
        st().reset();
        st().setTarget(cfg.target, cfg.mode, cfg.plan);
        st().switchTarget(other);
        st().switchTarget('chatgpt');
        expect(st().mode, other).toBe(cfg.mode);
        expect(st().plan, other).toBe(cfg.plan);
      }
    },
  );

  it('survives a walk through several other targets, because only leaving ChatGPT records it', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    st().switchTarget('grok');
    st().switchTarget('hermes');
    st().switchTarget('openclaw');
    st().switchTarget('muse');
    st().switchTarget('chatgpt');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('paid');
  });

  it('a mode changed on ChatGPT is the one remembered the next time it is left', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    st().switchTarget('muse');
    st().switchTarget('chatgpt');
    st().setMode('project');
    st().switchTarget('hermes');
    st().switchTarget('chatgpt');
    expect(st().mode).toBe('project');
    expect(st().plan).toBeUndefined();
  });

  it('a plan changed on instructions is the one remembered', () => {
    st().setTarget('chatgpt', 'instructions', 'free');
    st().setPlan('paid');
    st().switchTarget('grok');
    st().switchTarget('chatgpt');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('paid');
  });

  it('with no earlier ChatGPT mode it opens on dot', () => {
    st().setTarget('muse');
    st().switchTarget('chatgpt');
    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe('dot');
    expect(st().plan).toBeUndefined();
  });

  it('instructions with no remembered plan opens on free', () => {
    useBuilder.setState({ target: 'muse', lastChatgpt: { mode: 'instructions' } });
    st().switchTarget('chatgpt');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('free');
  });

  it('moving between targets that are not ChatGPT never touches what ChatGPT returns to', () => {
    st().setTarget('chatgpt', 'project');
    st().switchTarget('muse');
    const remembered = structuredClone(st().lastChatgpt);
    expect(remembered).toBeDefined();
    st().switchTarget('grok');
    st().switchTarget('hermes');
    expect(st().lastChatgpt).toEqual(remembered);
  });

  it('switching to the target already shown changes nothing', () => {
    for (const cfg of CONFIGS) {
      richBuild(cfg);
      const before = dataOf(st());
      st().switchTarget(cfg.target);
      expect(dataOf(st()), cfg.name).toEqual(before);
    }
  });

  it('reset forgets the remembered ChatGPT mode', () => {
    st().setTarget('chatgpt', 'instructions', 'paid');
    st().switchTarget('muse');
    st().reset();
    st().switchTarget('chatgpt');
    expect(st().mode).toBe('dot');
    expect(st().plan).toBeUndefined();
  });
});

describe('gpt in the remembered mode reads as dot', () => {
  it('leaving gpt and coming back lands on dot', () => {
    st().setTarget('chatgpt', 'gpt');
    expect(st().mode).toBe('gpt');
    st().switchTarget('muse');
    st().switchTarget('chatgpt');
    expect(st().mode).toBe('dot');
    expect(st().plan).toBeUndefined();
  });

  it('a remembered gpt written straight into the store reads as dot', () => {
    useBuilder.setState({ target: 'hermes', lastChatgpt: { mode: 'gpt' } });
    st().switchTarget('chatgpt');
    expect(st().mode).toBe('dot');
    expect(st().plan).toBeUndefined();
  });

  it('a gpt certificate offers ChatGPT, which resolves to dot', () => {
    st().setTarget('chatgpt', 'gpt');
    st().switchTarget('chatgpt');
    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe('dot');
  });

  it('the draft is untouched when gpt resolves to dot', () => {
    richBuild({ target: 'chatgpt', mode: 'gpt' });
    const before = structuredClone(st().draft);
    st().switchTarget('chatgpt');
    expect(st().draft).toEqual(before);
  });
});

// --- Gates, limits and the restricted pack ------------------------------------

describe('gates after a switch are a superset of the gates before', () => {
  for (const cfg of CONFIGS) {
    for (const other of TARGETS.filter((t) => t !== cfg.target)) {
      it(`${cfg.name} to ${other}`, () => {
        richBuild(cfg);
        const before = { ...effectiveGatesOf(st()) };
        const limitsBefore = { ...effectiveLimitsOf(st()) };
        st().switchTarget(other);
        const after = effectiveGatesOf(st());
        gatesNotLooser(before, after, `${cfg.name} to ${other}`);
        // The compile reads the same gates and limits, so nothing the pack gated slips out.
        const r = compile(previewBuild(st()));
        gatesNotLooser(before, r.gates, `${cfg.name} to ${other} (compile)`);
        for (const [id, value] of Object.entries(limitsBefore)) {
          expect(r.limits[id], `${cfg.name} to ${other}: limit ${id}`).toBe(value);
        }
      });
    }
  }

  it("the coding pack's gates stay in effect on a profile that cannot deliver it", () => {
    richBuild({ target: 'muse' });
    st().switchTarget('grok');
    const gates = effectiveGatesOf(st());
    for (const [action, setting] of Object.entries(coding.gatesDefault)) {
      expect(Object.hasOwn(gates, action), action).toBe(true);
      // The build's own override (send forbid) is stricter than the pack default; nothing is looser.
      expect(STRICTNESS[gates[action] as GateSetting], action).toBeGreaterThanOrEqual(
        STRICTNESS[setting],
      );
    }
    expect(gates['pay']).toBe('forbid');
  });

  it('a user override on a restricted pack gate is kept across the switch', () => {
    richBuild({ target: 'muse' });
    expect(st().draft.gates['send']).toBe('forbid');
    st().switchTarget('openclaw');
    expect(st().draft.gates['send']).toBe('forbid');
    expect(effectiveGatesOf(st())['send']).toBe('forbid');
  });
});

describe('the restricted pack across a switch', () => {
  it('the pack stays in the draft on every target', () => {
    richBuild({ target: 'muse' });
    for (const other of TARGETS) {
      st().switchTarget(other);
      expect(st().draft.packs, other).toEqual(['memecoins', 'coding']);
    }
  });

  it('chip-derived packs are not filtered by a switch either', () => {
    st().setTarget('muse');
    st().toggleChip('engineering');
    expect(st().touched.packs).toBe(false);
    st().switchTarget('hermes');
    expect(st().draft.packs).toEqual(['coding']);
    st().setName('Edit');
    expect(st().draft.packs).toEqual(['coding']);
    st().switchTarget('muse');
    expect(st().draft.packs).toEqual(['coding']);
  });

  it('the compile names the pack as undelivered on every target except muse', () => {
    richBuild({ target: 'muse' });
    for (const other of TARGETS) {
      st().switchTarget(other);
      const undelivered = compile(previewBuild(st())).undelivered.filter((u) => u.kind === 'pack');
      if (other === 'muse') {
        expect(undelivered, other).toEqual([]);
      } else {
        expect(undelivered, other).toEqual([{ kind: 'pack', id: 'coding', name: coding.label }]);
      }
    }
  });

  it('the pack is delivered again after a switch back to muse', () => {
    richBuild({ target: 'muse' });
    st().switchTarget('grok');
    expect(compile(previewBuild(st())).undelivered.map((u) => u.id)).toContain('coding');
    st().switchTarget('muse');
    expect(compile(previewBuild(st())).undelivered.map((u) => u.id)).not.toContain('coding');
  });

  it('every target compiles the rich build without throwing', () => {
    for (const cfg of CONFIGS) {
      richBuild(cfg);
      for (const other of TARGETS) {
        st().switchTarget(other);
        expect(() => compile(previewBuild(st())), `${cfg.name} to ${other}`).not.toThrow();
      }
    }
  });
});
