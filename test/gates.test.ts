// Gates: the act-vs-ask pair and the pack default safety floor.
//
// Brief Part C: "The act-vs-ask pair is generated from the gates registry: soul line names which
// actions wait for a yes; the rules layer lists the same actions with thresholds. Test: every gate
// set to approve or forbid appears in both layers, every build, every target and mode."
//
// Brief Part D: any pack with trade has trade=approve and the soul line "Propose trades. I execute,
// or I turn on auto when I say so."; send and delete default to approve wherever they exist; pay
// defaults to forbid everywhere (on Dots it maps to the forbid setting, QUESTIONS V14, "Hand off to
// you"); a pack whose defaults would let the agent move money, send mail or delete data without
// approval is a failing test; every pack ships five probe prompts in test/packs/<pack>.probes.json,
// one of which tries to get past a gate.
//
// Expected text comes from the library tables (src/library/gates.json, targets.json, packs/*.json)
// and from the brief, never from copying compiler output.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import type { GoldenSpec } from '../tools/golden.js';
import { resolveProfile } from '../src/compiler/profile.js';
import { effectiveGates } from '../src/compiler/gates.js';
import type {
  ActionGate,
  Build,
  CompileResult,
  GateSetting,
  ProfileId,
  WorkflowPack,
} from '../src/compiler/types.js';

// ---------------------------------------------------------------------------
// Fixed text from the brief and QUESTIONS. Written out so the tests do not just echo the library.
// ---------------------------------------------------------------------------

const TRADE_APPROVE_LINE = 'Propose trades. I execute, or I turn on auto when I say so.';
const DOT_FORBID_LABEL = 'Hand off to you'; // QUESTIONS V14
const DOT_APPROVE_LABEL = 'Ask before taking action'; // QUESTIONS V14
const DOT_AUTO_LABEL = 'Take action without asking'; // QUESTIONS V14
const EM_DASH = String.fromCharCode(0x2014);
const GUARDED_CLASSES = new Set(['money', 'mail', 'data']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Enforced = 'approve' | 'forbid';

const gateById = new Map<string, ActionGate>(library.gates.map((g) => [g.id, g]));

function gateOf(id: string): ActionGate {
  const gate = gateById.get(id);
  if (!gate) throw new Error(`gate "${id}" is not in the gates registry`);
  return gate;
}

function packOf(id: string): WorkflowPack {
  const pack = library.packs.find((p) => p.id === id);
  if (!pack) throw new Error(`pack "${id}" is not in the library`);
  return pack;
}

interface Compiled {
  spec: GoldenSpec;
  build: Build;
  profileId: ProfileId;
  gates: Record<string, GateSetting>;
  result: CompileResult;
}

const cache = new Map<string, Compiled>();

function compiled(spec: GoldenSpec): Compiled {
  const hit = cache.get(spec.id);
  if (hit) return hit;
  const build = buildFor(spec, library);
  const entry: Compiled = {
    spec,
    build,
    profileId: resolveProfile(build, library).id,
    gates: effectiveGates(build, library),
    result: compile(build),
  };
  cache.set(spec.id, entry);
  return entry;
}

// The effective gates set to approve or forbid, in the order the effective set lists them.
function enforced(gates: Record<string, GateSetting>): [string, Enforced][] {
  const out: [string, Enforced][] = [];
  for (const [id, setting] of Object.entries(gates)) {
    if (setting === 'approve' || setting === 'forbid') out.push([id, setting]);
  }
  return out;
}

function count(text: string, needle: string): number {
  return needle === '' ? 0 : text.split(needle).length - 1;
}

function fileText(result: CompileResult, path: string): string | undefined {
  return result.files.find((f) => f.path === path)?.content;
}

// The body of the "## Never" section: from its heading to the next "## " heading or the end.
function neverSection(soul: string): string | null {
  const lines = soul.split('\n');
  const start = lines.indexOf('## Never');
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function packsOfBuild(build: Build): WorkflowPack[] {
  return build.packs.map(packOf);
}

// A usable gate line: a non-empty string. null is legitimate only for an unoffered `auto` setting,
// never for approve or forbid, and an empty string would make soul.includes('') pass for nothing.
function isLine(line: string | null | undefined): line is string {
  return typeof line === 'string' && line.trim().length > 0;
}

// Personality layer: for EVERY gate set to approve or forbid, gate.soulLine[setting] must exist
// (non-null) and the soul must contain it. A null line is a miss, not a skip.
function personalityMisses(c: Compiled): string[] {
  const misses: string[] = [];
  for (const [id, setting] of enforced(c.gates)) {
    const line = gateOf(id).soulLine[setting];
    if (!isLine(line)) {
      misses.push(`${id}=${setting}: gates.json soulLine.${setting} is ${line === null ? 'null' : 'empty'}`);
      continue;
    }
    if (!c.result.soul.includes(line)) {
      misses.push(`${id}=${setting}: soul lacks soulLine "${line}"`);
    }
  }
  return misses;
}

// Rules layer, per profile, as defined in V2-DESIGN section 7.
function rulesMisses(c: Compiled): string[] {
  const misses: string[] = [];
  const { result, build } = c;
  const profile = resolveProfile(build, library);
  const packs = packsOfBuild(build);

  for (const [id, setting] of enforced(c.gates)) {
    const rule = gateOf(id).rulesLine[setting];
    const tag = `${id}=${setting}`;

    // An empty rulesLine would satisfy every includes() below without listing anything.
    if (!isLine(rule)) {
      misses.push(`${tag}: gates.json rulesLine.${setting} is missing or empty`);
      continue;
    }

    switch (c.profileId) {
      case 'muse': {
        if (!result.soul.includes(rule)) misses.push(`${tag}: soul lacks rulesLine`);
        break;
      }
      case 'hermes': {
        if (!result.soul.includes(rule)) misses.push(`${tag}: soul lacks rulesLine`);
        const agents = fileText(result, 'AGENTS.md');
        if (agents === undefined) misses.push(`${tag}: no AGENTS.md file`);
        else if (!agents.includes(rule)) misses.push(`${tag}: AGENTS.md lacks rulesLine`);
        break;
      }
      case 'openclaw': {
        const agents = fileText(result, 'AGENTS.md');
        if (agents === undefined) misses.push(`${tag}: no AGENTS.md file`);
        else if (!agents.includes(rule)) misses.push(`${tag}: AGENTS.md lacks rulesLine`);
        break;
      }
      case 'grok': {
        const never = neverSection(result.soul);
        if (never === null) misses.push(`${tag}: soul has no "## Never" section`);
        else if (!never.includes(rule)) misses.push(`${tag}: "## Never" section lacks rulesLine`);

        // Every pack skill whose actions include the gate carries the rule in its approval field.
        for (const pack of packs) {
          for (const skill of pack.skills) {
            if (!skill.actions.includes(id)) continue;
            const items = result.spoken.filter(
              (s) => s.label === `Skill: ${skill.name}` || s.label === `Routine: ${skill.name}`,
            );
            if (items.length === 0) {
              misses.push(`${tag}: no spoken item for pack skill "${skill.name}" (${pack.id})`);
            }
            for (const item of items) {
              if (!item.text.includes(rule)) {
                misses.push(`${tag}: "${item.label}" approval field lacks rulesLine`);
              }
            }
          }
        }
        break;
      }
      case 'chatgpt-dot': {
        const entries = result.customRules.filter((r) => r.gate === id);
        if (entries.length !== 1) {
          misses.push(`${tag}: customRules has ${entries.length} entries for the gate, expected 1`);
        } else {
          const want = profile.customRuleSettings?.[setting];
          if (entries[0].setting !== want) {
            misses.push(`${tag}: custom rule setting "${entries[0].setting}", expected "${want}"`);
          }
        }
        break;
      }
      case 'chatgpt-gpt':
      case 'chatgpt-project':
      case 'chatgpt-instructions': {
        const n = count(result.soul, rule);
        if (n < 2) misses.push(`${tag}: soul has rulesLine ${n} time(s), expected at least 2`);
        break;
      }
    }
  }
  return misses;
}

// ---------------------------------------------------------------------------
// Test 1. Gate in both layers, every golden build.
// ---------------------------------------------------------------------------

describe('Gate in both layers (Brief Part C)', () => {
  it('runs over all 64 golden specs and every profile', () => {
    expect(GOLDEN_SPECS.length).toBe(64);
    const profiles = new Set(GOLDEN_SPECS.map((s) => compiled(s).profileId));
    expect([...profiles].sort()).toEqual(
      [
        'chatgpt-dot',
        'chatgpt-gpt',
        'chatgpt-instructions',
        'chatgpt-project',
        'grok',
        'hermes',
        'muse',
        'openclaw',
      ].sort(),
    );
  });

  // null is only legitimate for an unoffered `auto` setting. approve and forbid are always
  // enforceable settings, so both layers must have text for them on every registry gate.
  it('every registry gate has a non-null soulLine and a non-empty rulesLine for approve and forbid', () => {
    expect(library.gates.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const gate of library.gates) {
      for (const setting of ['approve', 'forbid'] as const) {
        if (!isLine(gate.soulLine[setting])) bad.push(`${gate.id}: soulLine.${setting} is null or empty`);
        if (!isLine(gate.rulesLine[setting])) bad.push(`${gate.id}: rulesLine.${setting} is null or empty`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the compiler reports the same effective gates the gates module computes', () => {
    for (const spec of GOLDEN_SPECS) {
      const c = compiled(spec);
      expect(c.result.gates, spec.id).toEqual(c.gates);
    }
  });

  for (const spec of GOLDEN_SPECS) {
    describe(spec.id, () => {
      it('has at least one approve or forbid gate to check (pay is always forbid)', () => {
        const c = compiled(spec);
        expect(enforced(c.gates).length).toBeGreaterThan(0);
        expect(c.gates.pay).toBe('forbid');
      });

      it('personality layer: soul carries soulLine for every approve or forbid gate', () => {
        expect(personalityMisses(compiled(spec))).toEqual([]);
      });

      it('rules layer: every approve or forbid gate carries its rulesLine where the profile puts rules', () => {
        expect(rulesMisses(compiled(spec))).toEqual([]);
      });
    });
  }

  // V2-DESIGN section 9: a worker that loads only its own folder keeps its rules. OpenClaw role
  // workspaces carry the rules block in workspace-<role>/AGENTS.md. For hermes the design also
  // lists profiles/<role>/AGENTS.md, but the compiler emits only profiles/<role>/SOUL.md (with a
  // verify note that Hermes loads AGENTS.md from the working folder); the hermes definition in
  // section 7 puts the rules in the soul, so the role soul is what is checked here.
  describe('role workers on file profiles keep the rules block', () => {
    const roleSpecs = GOLDEN_SPECS.filter((s) => {
      const id = compiled(s).profileId;
      return s.roles !== undefined && (id === 'openclaw' || id === 'hermes');
    });

    it('there are role specs for openclaw and hermes', () => {
      expect(roleSpecs.map((s) => s.id).sort()).toEqual(['marty.openclaw.roles', 'rook.hermes.roles']);
    });

    for (const spec of roleSpecs) {
      it(`${spec.id}: each role file lists every approve or forbid gate rulesLine`, () => {
        const c = compiled(spec);
        expect(c.result.roles.length).toBeGreaterThan(0);
        const misses: string[] = [];
        for (const role of c.result.roles) {
          const path =
            c.profileId === 'openclaw' ? `workspace-${role}/AGENTS.md` : `profiles/${role}/SOUL.md`;
          const text = fileText(c.result, path);
          if (text === undefined) {
            misses.push(`${path}: file missing`);
            continue;
          }
          for (const [id, setting] of enforced(c.gates)) {
            const rule = gateOf(id).rulesLine[setting];
            if (!isLine(rule) || !text.includes(rule)) {
              misses.push(`${path}: ${id}=${setting} rulesLine missing`);
            }
          }
        }
        expect(misses).toEqual([]);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2. Dot custom rules.
// ---------------------------------------------------------------------------

describe('Dot custom rules (QUESTIONS V14)', () => {
  const dotSpecs = GOLDEN_SPECS.filter((s) => compiled(s).profileId === 'chatgpt-dot');

  it('one dot spec per roster starter', () => {
    expect(dotSpecs.length).toBe(library.roster.length);
  });

  it('the dot profile maps auto, approve and forbid to the documented dot options', () => {
    const profile = library.targets.profiles.find((p) => p.id === 'chatgpt-dot');
    expect(profile?.customRuleSettings).toEqual({
      auto: DOT_AUTO_LABEL,
      approve: DOT_APPROVE_LABEL,
      forbid: DOT_FORBID_LABEL,
    });
  });

  for (const spec of dotSpecs) {
    describe(spec.id, () => {
      it('has exactly one custom rule per effective gate, each gate once, in registry order', () => {
        const c = compiled(spec);
        const gateIds = Object.keys(c.gates);
        expect(c.result.customRules.length).toBe(gateIds.length);
        const seen = c.result.customRules.map((r) => r.gate);
        expect(new Set(seen).size).toBe(seen.length);
        expect([...seen].sort()).toEqual([...gateIds].sort());
        const registryOrder = library.gates.map((g) => g.id).filter((id) => gateIds.includes(id));
        expect(seen).toEqual(registryOrder);
      });

      it('each rule action is the gate customRuleText and the setting is the mapped label', () => {
        const c = compiled(spec);
        const labels = resolveProfile(c.build, library).customRuleSettings;
        expect(labels).toBeDefined();
        const misses: string[] = [];
        for (const [id, setting] of Object.entries(c.gates)) {
          const rule = c.result.customRules.find((r) => r.gate === id);
          if (!rule) {
            misses.push(`${id}: no custom rule`);
            continue;
          }
          if (rule.action !== gateOf(id).customRuleText) {
            misses.push(`${id}: action "${rule.action}" is not the customRuleText`);
          }
          if (rule.setting !== labels?.[setting]) {
            misses.push(`${id}: setting "${rule.setting}", expected "${labels?.[setting]}"`);
          }
        }
        expect(misses).toEqual([]);
      });

      it('pay maps to the forbid label, "Hand off to you"', () => {
        const c = compiled(spec);
        const labels = resolveProfile(c.build, library).customRuleSettings;
        const pay = c.result.customRules.filter((r) => r.gate === 'pay');
        expect(pay.length).toBe(1);
        expect(pay[0].setting).toBe(labels?.forbid);
        expect(pay[0].setting).toBe(DOT_FORBID_LABEL);
      });
    });
  }

  it('non-dot profiles emit no custom rules', () => {
    for (const spec of GOLDEN_SPECS) {
      const c = compiled(spec);
      if (c.profileId === 'chatgpt-dot') continue;
      expect(c.result.customRules, spec.id).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3. Pack default safety (Brief Part D).
// ---------------------------------------------------------------------------

function museBuildWith(packId: string): Build {
  const entry = library.roster.find((r) => r.id === 'vera');
  if (!entry) throw new Error('roster starter vera is missing');
  return { ...migrate(entry.build, { target: 'muse' }), packs: [packId], gates: {}, limits: {} };
}

describe('Pack default safety (Brief Part D)', () => {
  it('the library has 12 packs', () => {
    expect(library.packs.length).toBe(12);
  });

  it('gates.json trade soulLine.approve is the brief line, exactly', () => {
    expect(gateOf('trade').soulLine.approve).toBe(TRADE_APPROVE_LINE);
  });

  for (const pack of library.packs) {
    describe(pack.id, () => {
      const defaults = pack.gatesDefault;

      it('every default key is a gate in the registry', () => {
        const unknown = Object.keys(defaults).filter((id) => !gateById.has(id));
        expect(unknown).toEqual([]);
      });

      it('trade, where present, defaults to approve', () => {
        if (!Object.hasOwn(defaults, 'trade')) return;
        expect(defaults.trade).toBe('approve');
      });

      it('send and delete, where present, default to approve or forbid', () => {
        for (const id of ['send', 'delete']) {
          if (!Object.hasOwn(defaults, id)) continue;
          expect(['approve', 'forbid'], `${pack.id} ${id}`).toContain(defaults[id]);
        }
      });

      it('pay, where present, defaults to forbid', () => {
        if (!Object.hasOwn(defaults, 'pay')) return;
        expect(defaults.pay).toBe('forbid');
      });

      it('no money, mail or data action defaults to auto', () => {
        const autos: string[] = [];
        for (const [id, setting] of Object.entries(defaults)) {
          const cls = gateById.get(id)?.class;
          if (cls !== undefined && GUARDED_CLASSES.has(cls) && setting === 'auto') {
            autos.push(`${id} (${cls})`);
          }
        }
        expect(autos).toEqual([]);
      });

      it('every skill action is a key of the pack gatesDefault, or pay', () => {
        const stray: string[] = [];
        for (const skill of pack.skills) {
          for (const action of skill.actions) {
            if (action !== 'pay' && !Object.hasOwn(defaults, action)) {
              stray.push(`${skill.id}: ${action}`);
            }
          }
        }
        expect(stray).toEqual([]);
      });

      it('compiled alone on muse: effective gates are the pack defaults plus pay forbid', () => {
        const build = museBuildWith(pack.id);
        expect(effectiveGates(build, library)).toEqual({ ...defaults, pay: 'forbid' });
      });

      it('compiled alone on muse: the trade soul line is in the soul when trade is present', () => {
        if (!Object.hasOwn(defaults, 'trade')) return;
        const { soul } = compile(museBuildWith(pack.id));
        expect(soul).toContain(TRADE_APPROVE_LINE);
      });

      it('compiled alone on muse: both layers carry every default approve or forbid gate', () => {
        const build = museBuildWith(pack.id);
        const { soul } = compile(build);
        const misses: string[] = [];
        // The gate set comes from the library (pack defaults plus the global pay lock), not the compiler.
        for (const [id, setting] of enforced({ ...defaults, pay: 'forbid' })) {
          const gate = gateOf(id);
          const soulLine = gate.soulLine[setting];
          const rulesLine = gate.rulesLine[setting];
          // null is not an acceptable personality line for an approve or forbid gate.
          if (!isLine(soulLine)) misses.push(`${id}=${setting}: gates.json soulLine is null or empty`);
          else if (!soul.includes(soulLine)) misses.push(`${id}=${setting}: soulLine missing`);
          if (!isLine(rulesLine)) misses.push(`${id}=${setting}: gates.json rulesLine is null or empty`);
          else if (!soul.includes(rulesLine)) misses.push(`${id}=${setting}: rulesLine missing`);
        }
        expect(misses).toEqual([]);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Test 4. Probe files: five per pack, one tries to get past a gate.
// ---------------------------------------------------------------------------

describe('Pack probe files (Brief Part D)', () => {
  const packsDir = fileURLToPath(new URL('./packs/', import.meta.url));
  const pathOf = (packId: string) => `${packsDir}${packId}.probes.json`;

  it('there is a probe file for each of the 12 packs and no stray probe files', () => {
    expect(library.packs.length).toBe(12);
    const missing = library.packs.filter((p) => !existsSync(pathOf(p.id))).map((p) => p.id);
    expect(missing).toEqual([]);
    const onDisk = readdirSync(packsDir)
      .filter((f) => f.endsWith('.probes.json'))
      .map((f) => f.slice(0, -'.probes.json'.length))
      .sort();
    expect(onDisk).toEqual(library.packs.map((p) => p.id).sort());
  });

  for (const pack of library.packs) {
    describe(pack.id, () => {
      const raw = existsSync(pathOf(pack.id)) ? readFileSync(pathOf(pack.id), 'utf8') : '';
      const parsed: unknown = raw === '' ? null : JSON.parse(raw);
      const entries = (Array.isArray(parsed) ? parsed : []) as {
        id?: unknown;
        prompt?: unknown;
        gate?: unknown;
      }[];

      it('is an array of exactly five { id, prompt, gate } entries', () => {
        expect(Array.isArray(parsed)).toBe(true);
        expect(entries.length).toBe(5);
        for (const e of entries) {
          expect(Object.keys(e).sort()).toEqual(['gate', 'id', 'prompt']);
          expect(typeof e.id).toBe('string');
          expect((e.id as string).length).toBeGreaterThan(0);
          expect(typeof e.prompt).toBe('string');
          expect((e.prompt as string).trim().length).toBeGreaterThan(0);
          expect(e.gate === null || typeof e.gate === 'string').toBe(true);
        }
        const ids = entries.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      // "One of which tries to get past a gate" only means something if the gate is closed: a pack
      // default of approve or forbid. An auto gate (devops rollback) has nothing to get past. pay
      // counts for every pack because it is always forbid in the effective gates.
      it('at least one entry tries to get past a closed gate of this pack (approve or forbid, or pay), and every named gate is a registry gate', () => {
        const closedGates = new Set<string>(
          Object.entries(pack.gatesDefault)
            .filter(([, setting]) => setting === 'approve' || setting === 'forbid')
            .map(([id]) => id),
        );
        closedGates.add('pay');
        const named = entries.map((e) => e.gate).filter((g): g is string => typeof g === 'string');
        expect(
          named.filter((g) => closedGates.has(g)),
          `${pack.id}: no probe names a gate whose default is approve or forbid (named: ${named.join(', ') || 'none'})`,
        ).not.toEqual([]);
        const unknown = named.filter((g) => !gateById.has(g));
        expect(unknown).toEqual([]);
      });

      it('has no em dashes', () => {
        expect(raw.includes(EM_DASH)).toBe(false);
        expect(raw.toLowerCase().includes('&mdash;')).toBe(false);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Test 5. pay is forbid everywhere; a build trying pay = auto is rejected.
// ---------------------------------------------------------------------------

function combos(ids: string[], max: number): string[][] {
  const out: string[][] = [[]];
  const walk = (start: number, acc: string[]) => {
    if (acc.length === max) return;
    for (let i = start; i < ids.length; i++) {
      const next = [...acc, ids[i]];
      out.push(next);
      walk(i + 1, next);
    }
  };
  walk(0, []);
  return out;
}

describe('pay is locked to forbid', () => {
  it('pay is forbid in the effective gates of every golden build', () => {
    for (const spec of GOLDEN_SPECS) {
      const c = compiled(spec);
      expect(c.gates.pay, `${spec.id} effectiveGates`).toBe('forbid');
      expect(c.result.gates.pay, `${spec.id} result.gates`).toBe('forbid');
    }
  });

  it('pay is forbid, and no money, mail or data gate is auto, for every set of up to three packs', () => {
    const base = museBuildWith('spot');
    const sets = combos(
      library.packs.map((p) => p.id),
      3,
    );
    expect(sets.length).toBe(1 + 12 + 66 + 220);
    const bad: string[] = [];
    for (const packs of sets) {
      const gates = effectiveGates({ ...base, packs }, library);
      const tag = `[${packs.join(', ')}]`;
      if (gates.pay !== 'forbid') bad.push(`${tag}: pay is ${gates.pay}`);
      for (const [id, setting] of Object.entries(gates)) {
        const cls = gateById.get(id)?.class;
        if (setting === 'auto' && cls !== undefined && GUARDED_CLASSES.has(cls)) {
          bad.push(`${tag}: ${id} (${cls}) is auto`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('pay stays forbid in the effective gates even if a build smuggles in auto or approve', () => {
    const base = museBuildWith('memecoins');
    for (const setting of ['auto', 'approve'] as const) {
      const gates = effectiveGates({ ...base, gates: { pay: setting } }, library);
      expect(gates.pay, `pay=${setting}`).toBe('forbid');
    }
  });

  // V2-DESIGN section 2, pass 1: `pay`, if present, must be `forbid`. Anything else is rejected,
  // not quietly corrected, so a build can never even claim a looser pay setting.
  for (const setting of ['auto', 'approve'] as const) {
    describe(`a build with gates.pay = ${setting} is rejected by compile`, () => {
      for (const spec of GOLDEN_SPECS.filter((s) => s.starter === 'marty' && s.roles === undefined)) {
        it(spec.id, () => {
          const b = buildFor(spec, library);
          const bad: Build = { ...b, gates: { ...b.gates, pay: setting } };
          expect(() => compile(bad)).toThrow(/pay.*forbid/i);
        });
      }

      it('also with no packs selected (pay is always an exposed action)', () => {
        const bad: Build = { ...museBuildWith('spot'), packs: [], gates: { pay: setting } };
        expect(() => compile(bad)).toThrow(/pay.*forbid/i);
      });

      it('also on a pack with no pay default (research)', () => {
        const bad: Build = { ...museBuildWith('research'), gates: { pay: setting } };
        expect(() => compile(bad)).toThrow(/pay.*forbid/i);
      });

      it('also on a pack that lists pay as forbid (memecoins)', () => {
        const bad: Build = { ...museBuildWith('memecoins'), gates: { pay: setting } };
        expect(() => compile(bad)).toThrow(/pay.*forbid/i);
      });
    });
  }

  it('gates.pay = forbid is accepted and compiles with pay forbid', () => {
    const ok: Build = { ...museBuildWith('memecoins'), gates: { pay: 'forbid' } };
    expect(compile(ok).gates.pay).toBe('forbid');
  });
});
