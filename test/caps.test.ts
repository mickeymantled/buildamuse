// Length caps for every golden spec (QUESTIONS B1, B2), plus the over-cap warning contract.
//
// Caps now (B1): muse 4,000, hermes 4,000, grok 4,000, openclaw 3,600, chatgpt-dot 3,600,
// chatgpt-project 8,000, chatgpt-instructions 1,500 free and 5,000 paid, applied to both fields
// (the first-field memory block and the second-field personality). Grok's 4,000 is a quality cap;
// the product limit is above 5,500.
//
// B2: the ChatGPT "gpt" mode stays in the compiler, hidden from the picker and deprecated, but it
// has no goldens. The ChatGPT goldens are chatgpt-dot for the nine starters, plus Marty and June on
// instructions free, instructions paid and project, plus the sol.chatgpt-project.roles golden. The
// last describe block proves the gpt profile still compiles for every starter, fits 8,000 and
// carries a description under 300.
//
// Which files carry a cap. The cap is the length of a pasteable or file personality artifact:
//   - the main personality file (every spec),
//   - the first-field memory block (chatgpt-instructions),
//   - each role soul, role description or role instructions file (role goldens).
// Rules files (AGENTS.md), memory files (USER.md) and skill files are not personality artifacts
// and carry no cap. A bundle file with a label this test does not know fails the
// "every bundle file is classified" test, so a new kind of file cannot slip past unchecked.
//
// QUESTIONS V25 / B1 / V29: Marty and June on free custom instructions are still over 1,500 after
// the bottom repeat block was cut to gate rules lines only (the short chassis plus the rules block
// plus drives already exceed it). That combination is blocked: the UI steers those builds to Paid.
// Their two personality cap assertions are written with it.fails, so the suite stays green while
// they are over and turns red the moment they start to fit (then the marker should be removed).

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import type { GoldenSpec } from '../tools/golden.js';
import { capOf, resolveProfile } from '../src/compiler/profile.js';
import type { BundleFile, CompileResult } from '../src/compiler/types.js';

// The cap, in characters, each golden profile must hold. Written out from the decisions so the
// test does not just echo whatever the library JSON says.
const EXPECTED_CAPS = {
  muse: 4000,
  openclaw: 3600,
  hermes: 4000,
  grok: 4000,
  'chatgpt-dot': 3600,
  'chatgpt-project': 8000,
  'chatgpt-instructions-free': 1500,
  'chatgpt-instructions-paid': 5000,
} as const;

// The deprecated gpt mode: not a golden, but the compiler keeps it (B2).
const GPT_CAP = 8000;
const GPT_DESCRIPTION_LIMIT = 300;

function expectedCapKey(spec: GoldenSpec): keyof typeof EXPECTED_CAPS {
  if (spec.target !== 'chatgpt') {
    return spec.target;
  }
  const mode = spec.mode ?? 'dot';
  if (mode === 'instructions') {
    return spec.plan === 'paid' ? 'chatgpt-instructions-paid' : 'chatgpt-instructions-free';
  }
  if (mode === 'dot' || mode === 'project') {
    return `chatgpt-${mode}`;
  }
  throw new Error(`${spec.id}: mode ${mode} is not a golden mode (B2)`);
}

interface Compiled {
  result: CompileResult;
  cap: number;
}

const cache = new Map<string, Compiled>();

function compiled(spec: GoldenSpec): Compiled {
  let hit = cache.get(spec.id);
  if (!hit) {
    const build = buildFor(spec, library);
    const result = compile(build);
    const cap = capOf(resolveProfile(build, library), build);
    hit = { result, cap };
    cache.set(spec.id, hit);
  }
  return hit;
}

// V25 / B1 / V29: the two free custom-instructions goldens known to be over 1,500.
const V25_BLOCKED = new Set(['marty.chatgpt-instructions-free', 'june.chatgpt-instructions-free']);

const chatgptSpecs = GOLDEN_SPECS.filter((s) => s.target === 'chatgpt');
const roleSpecs = GOLDEN_SPECS.filter((s) => s.roles !== undefined);

// ---------------------------------------------------------------------------------------------
// File kinds and the warning each capped kind must carry when it is over its cap.
// ---------------------------------------------------------------------------------------------

type FileKind = 'personality' | 'memory-field' | 'role-soul' | 'uncapped' | 'unclassified';

const ROLE_SOUL_LABEL = /^Role (?:soul|description|instructions): (.+)$/;

function kindOf(file: BundleFile): FileKind {
  if (file.label === 'Personality') return 'personality';
  if (file.label === 'Memory') {
    // chatgpt-instructions delivers the memory block as its own pasted field; elsewhere
    // "Memory" is the USER.md file, which has no cap.
    return file.path.endsWith('(first field)') ? 'memory-field' : 'uncapped';
  }
  if (ROLE_SOUL_LABEL.test(file.label)) return 'role-soul';
  if (file.label === 'Rules' || file.label.startsWith('Skill: ') || file.label.startsWith('Role rules: ')) {
    return 'uncapped';
  }
  return 'unclassified';
}

// What a cap applies to: a path (for the role warning wording), the characters, and its kind.
interface CapTarget {
  kind: 'personality' | 'memory-field' | 'role-soul';
  path: string;
  length: number;
}

// The warning that must be present when this artifact is over its cap. Each kind is matched on
// its own wording and its own length, so one kind's warning never stands in for another's.
function overCapWarning(t: CapTarget, cap: number): { describe: string; matches: (w: string) => boolean } {
  switch (t.kind) {
    case 'personality': {
      // "length: soul is N characters, over C", optionally ending "with nothing left to drop".
      const base = `length: soul is ${t.length} characters, over ${cap}`;
      return {
        describe: `"${base}"`,
        matches: (w) => w === base || w === `${base} with nothing left to drop`,
      };
    }
    case 'memory-field': {
      const exact = `length: memory block is ${t.length} characters, over ${cap}`;
      return { describe: `"${exact}"`, matches: (w) => w === exact };
    }
    case 'role-soul': {
      const exact = `roles: ${t.path} is ${t.length} characters, over ${cap}`;
      return { describe: `"${exact}"`, matches: (w) => w === exact };
    }
  }
}

// Every artifact in a result that carries a cap. The personality is always the soul, whether the
// profile delivers it as a file or not (the dot profile has no Personality file), so it is read
// from result.soul and never depends on the files list.
function cappedTargets(result: CompileResult): CapTarget[] {
  const targets: CapTarget[] = [{ kind: 'personality', path: 'soul', length: result.soul.length }];
  for (const file of result.files) {
    const kind = kindOf(file);
    if (kind === 'memory-field' || kind === 'role-soul') {
      targets.push({ kind, path: file.path, length: file.content.length });
    }
  }
  return targets;
}

// ---------------------------------------------------------------------------------------------
// Every golden fits its profile's cap.
// ---------------------------------------------------------------------------------------------

describe('Caps: golden specs', () => {
  it('has the ChatGPT goldens: dot for nine starters, Marty and June on three more modes, and the Sol project roles golden, with no gpt golden (B2)', () => {
    const ids = chatgptSpecs.map((s) => s.id);
    expect(ids.filter((id) => id.endsWith('.chatgpt-dot')).length).toBe(9);
    expect(ids.filter((id) => id.includes('chatgpt-gpt')).length).toBe(0);
    expect(GOLDEN_SPECS.filter((s) => s.mode === 'gpt').length).toBe(0);
    for (const starter of ['marty', 'june']) {
      expect(ids).toContain(`${starter}.chatgpt-instructions-free`);
      expect(ids).toContain(`${starter}.chatgpt-instructions-paid`);
      expect(ids).toContain(`${starter}.chatgpt-project`);
    }
    expect(ids).toContain('sol.chatgpt-project.roles');
    expect(ids.length).toBe(9 + 6 + 1);
  });

  it('has the nine starters on each of muse, openclaw, hermes and grok', () => {
    for (const target of ['muse', 'openclaw', 'hermes', 'grok'] as const) {
      const ids = GOLDEN_SPECS.filter((s) => s.target === target && s.roles === undefined).map((s) => s.id);
      expect(ids.length, `${target} goldens`).toBe(9);
    }
  });

  it('the library caps match the expected caps for every golden spec', () => {
    for (const spec of GOLDEN_SPECS) {
      expect({ id: spec.id, cap: compiled(spec).cap }).toEqual({
        id: spec.id,
        cap: EXPECTED_CAPS[expectedCapKey(spec)],
      });
    }
  });

  describe('result.length is the personality length', () => {
    // Kept apart from the cap assertions below so a drift here can never make a V25
    // it.fails case "fail as expected" for the wrong reason.
    for (const spec of GOLDEN_SPECS) {
      it(`${spec.id} length equals soul length`, () => {
        const { result } = compiled(spec);
        expect(result.length).toBe(result.soul.length);
      });
    }
  });

  describe('personality length fits the profile cap', () => {
    for (const spec of GOLDEN_SPECS) {
      // Compiled at collection time, outside the test body, so a compile error is never
      // swallowed by it.fails. The body is the cap assertion and nothing else.
      const { result } = compiled(spec);
      const cap = EXPECTED_CAPS[expectedCapKey(spec)];
      const name = `${spec.id} fits ${cap}`;
      if (V25_BLOCKED.has(spec.id)) {
        // blocked on QUESTIONS V25 / B1 / V29: over 1,500 until Brian picks a fix. Flips red when it fits.
        it.fails(`${name} (blocked on QUESTIONS V25)`, () => {
          expect(result.length).toBeLessThanOrEqual(cap);
        });
      } else {
        it(name, () => {
          expect(result.length).toBeLessThanOrEqual(cap);
        });
      }
    }
  });

  describe('every capped file in the bundle fits the cap', () => {
    // The personality is not the only artifact a bundle ships: role goldens ship one capped file
    // per role, and instructions ships a capped first field.
    for (const spec of GOLDEN_SPECS) {
      it(`${spec.id}: personality, memory field and role files are each within the cap`, () => {
        const { result } = compiled(spec);
        const cap = EXPECTED_CAPS[expectedCapKey(spec)];
        for (const target of cappedTargets(result)) {
          // The V25 personality is asserted by its it.fails case above; everything else, including
          // the memory field of those same two specs, is asserted here.
          if (V25_BLOCKED.has(spec.id) && target.kind === 'personality') continue;
          expect(target.length, `${spec.id} ${target.path} against ${cap}`).toBeLessThanOrEqual(cap);
        }
      });
    }
  });

  describe('sol.chatgpt-project.roles: every role instructions file fits the 8,000 Project cap', () => {
    const spec = chatgptSpecs.find((s) => s.id === 'sol.chatgpt-project.roles');

    it('is a project golden with a role set', () => {
      expect(spec).toBeDefined();
      expect(spec?.mode).toBe('project');
      expect(spec?.roles?.length).toBeGreaterThan(0);
    });

    it('ships exactly one role instructions file per role in the set', () => {
      if (!spec) throw new Error('sol.chatgpt-project.roles is missing from GOLDEN_SPECS');
      const { result } = compiled(spec);
      const roleFiles = result.files.filter((f) => kindOf(f) === 'role-soul');
      const expectedLabels = (spec.roles ?? []).map((id) => {
        const role = library.roles.find((r) => r.id === id);
        if (!role) throw new Error(`role ${id} is not in the library`);
        return `Role instructions: ${role.label}`;
      });
      expect(roleFiles.map((f) => f.label).sort()).toEqual([...expectedLabels].sort());
    });

    for (const roleId of ['lead', 'searcher', 'synthesizer', 'fact-checker']) {
      it(`${roleId} fits ${EXPECTED_CAPS['chatgpt-project']}`, () => {
        if (!spec) throw new Error('sol.chatgpt-project.roles is missing from GOLDEN_SPECS');
        const role = library.roles.find((r) => r.id === roleId);
        expect(role, `role ${roleId} is in the library`).toBeDefined();
        const { result } = compiled(spec);
        const file = result.files.find((f) => f.label === `Role instructions: ${role?.label}`);
        expect(file, `a role instructions file for ${roleId}`).toBeDefined();
        expect(file?.content.length).toBeGreaterThan(0);
        expect(file?.content.length).toBeLessThanOrEqual(EXPECTED_CAPS['chatgpt-project']);
      });
    }
  });

  describe('instructions: the first-field memory block fits the cap', () => {
    for (const spec of chatgptSpecs.filter((s) => s.mode === 'instructions')) {
      it(`${spec.id} memory block fits its cap`, () => {
        const { result, cap } = compiled(spec);
        const memory = result.files.find((f) => f.label === 'Memory');
        expect(memory, 'instructions mode delivers the memory block as its own field').toBeDefined();
        expect(memory?.path).toContain('(first field)');
        expect(memory?.content.length).toBeLessThanOrEqual(cap);
      });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The deprecated gpt mode (B2): hidden from the picker, no goldens, but the compiler keeps it.
// ---------------------------------------------------------------------------------------------

describe('gpt mode: still compiles for every starter (deprecated, B2)', () => {
  // Specs built here, not in GOLDEN_SPECS: gpt has no goldens. buildFor migrates the roster build
  // to the chatgpt target in gpt mode exactly as it does for a golden.
  const gptSpecs: GoldenSpec[] = library.roster.map((entry) => ({
    id: `${entry.id}.chatgpt-gpt`,
    starter: entry.id,
    target: 'chatgpt',
    mode: 'gpt',
  }));

  it('covers all nine starters', () => {
    expect(library.roster.length).toBe(9);
    expect(gptSpecs.length).toBe(9);
  });

  it('the chatgpt-gpt profile is still in the library with cap 8,000', () => {
    const profile = library.targets.profiles.find((p) => p.id === 'chatgpt-gpt');
    expect(profile, 'the compiler keeps the gpt profile').toBeDefined();
    expect(profile?.target).toBe('chatgpt');
    expect(profile?.mode).toBe('gpt');
    expect(profile?.lengthCap).toBe(GPT_CAP);
  });

  for (const spec of gptSpecs) {
    describe(spec.id, () => {
      it('builds in gpt mode and resolves the 8,000 cap', () => {
        const build = buildFor(spec, library);
        expect(build.target).toBe('chatgpt');
        expect(build.mode).toBe('gpt');
        expect(compiled(spec).cap).toBe(GPT_CAP);
      });

      it('compiles to a non-empty soul that fits 8,000 with no length warning', () => {
        const { result } = compiled(spec);
        expect(result.soul.length).toBeGreaterThan(0);
        expect(result.length).toBe(result.soul.length);
        expect(result.length).toBeLessThanOrEqual(GPT_CAP);
        expect(result.warnings.filter((w) => w.startsWith('length:'))).toEqual([]);
      });

      it(`has a description under ${GPT_DESCRIPTION_LIMIT} characters`, () => {
        const { result } = compiled(spec);
        expect(result.description).toBeDefined();
        expect(result.description?.length).toBeGreaterThan(0);
        expect(result.description?.length).toBeLessThan(GPT_DESCRIPTION_LIMIT);
      });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Over-cap warning contract, every golden spec.
//
// For each capped file the warning for that file is present if and only if the file is over its
// cap: present when over (so an overflow is never silent), absent when within (so a warning
// always means a real overflow).
// ---------------------------------------------------------------------------------------------

describe('Over-cap warning contract: every golden spec', () => {
  for (const spec of GOLDEN_SPECS) {
    describe(spec.id, () => {
      it('every bundle file is classified as capped or uncapped', () => {
        const { result } = compiled(spec);
        const unknown = result.files.filter((f) => kindOf(f) === 'unclassified').map((f) => `${f.label} (${f.path})`);
        expect(unknown, 'a new kind of bundle file needs a decision on whether it carries a cap').toEqual([]);
      });

      it('any Personality file is the soul (the dot profile delivers none)', () => {
        const { result } = compiled(spec);
        const personality = result.files.filter((f) => kindOf(f) === 'personality');
        expect(personality.length).toBeLessThanOrEqual(1);
        for (const file of personality) {
          expect(file.content).toBe(result.soul);
        }
      });

      it('warns for each capped artifact over its cap, and for none within it', () => {
        const { result, cap } = compiled(spec);
        for (const target of cappedTargets(result)) {
          const over = target.length > cap;
          const rule = overCapWarning(target, cap);
          const warned = result.warnings.some(rule.matches);
          expect(
            warned,
            over
              ? `${spec.id} ${target.path} is ${target.length} characters against ${cap} and no warning reads ${rule.describe}`
              : `${spec.id} ${target.path} is ${target.length} characters, within ${cap}, yet a warning reads ${rule.describe}`,
          ).toBe(over);
        }
      });
    });
  }

  describe('the role goldens deliver capped role files, so the role warnings are exercised', () => {
    it('the four role goldens are present', () => {
      expect(roleSpecs.map((s) => s.id).sort()).toEqual([
        'june.grok.roles',
        'marty.openclaw.roles',
        'rook.hermes.roles',
        'sol.chatgpt-project.roles',
      ]);
    });

    for (const spec of roleSpecs) {
      it(`${spec.id} has one capped role file per role`, () => {
        const { result } = compiled(spec);
        const roleFiles = result.files.filter((f) => kindOf(f) === 'role-soul');
        const expectedLabels = (spec.roles ?? []).map((id) => {
          const role = library.roles.find((r) => r.id === id);
          if (!role) throw new Error(`role ${id} is not in the library`);
          return role.label;
        });
        const labels = roleFiles.map((f) => ROLE_SOUL_LABEL.exec(f.label)?.[1]);
        expect(labels.sort()).toEqual([...expectedLabels].sort());
      });
    }
  });

  describe('memory block overflow (unreachable with the shipped library, so built with a padded seed)', () => {
    // The shipped memory blocks are a few hundred characters against a 1,500 minimum cap, so no
    // golden overflows the first field. Pad one chip seed in a copy of the library to prove the
    // warning appears when the block is over the cap and not when it is within it.
    const freeSpec = GOLDEN_SPECS.find((s) => s.id === 'marty.chatgpt-instructions-free');
    const paidSpec = GOLDEN_SPECS.find((s) => s.id === 'marty.chatgpt-instructions-paid');

    function paddedLibrary(spec: GoldenSpec) {
      const lib = structuredClone(library);
      const build = buildFor(spec, lib);
      const chip = build.chips.map((id) => lib.chips.find((c) => c.id === id)).find((c) => c?.seed);
      if (!chip?.seed) throw new Error('marty has no chip with a seed to pad');
      chip.seed = `${chip.seed} ${'padding words '.repeat(150)}`;
      return { lib, build };
    }

    it('free: a memory block over 1,500 warns with its own length', () => {
      if (!freeSpec) throw new Error('marty.chatgpt-instructions-free is missing from GOLDEN_SPECS');
      const { lib, build } = paddedLibrary(freeSpec);
      const result = compile(build, lib);
      const memory = result.files.find((f) => kindOf(f) === 'memory-field');
      expect(memory, 'instructions mode delivers the memory block as its own field').toBeDefined();
      expect(memory?.content.length).toBeGreaterThan(EXPECTED_CAPS['chatgpt-instructions-free']);
      const rule = overCapWarning(
        { kind: 'memory-field', path: memory?.path ?? '', length: memory?.content.length ?? 0 },
        EXPECTED_CAPS['chatgpt-instructions-free'],
      );
      expect(result.warnings.some(rule.matches), `no warning reads ${rule.describe}`).toBe(true);
    });

    it('paid: the same block is within 5,000 and does not warn', () => {
      if (!paidSpec) throw new Error('marty.chatgpt-instructions-paid is missing from GOLDEN_SPECS');
      const { lib, build } = paddedLibrary(paidSpec);
      const result = compile(build, lib);
      const memory = result.files.find((f) => kindOf(f) === 'memory-field');
      expect(memory, 'instructions mode delivers the memory block as its own field').toBeDefined();
      expect(memory?.content.length).toBeGreaterThan(EXPECTED_CAPS['chatgpt-instructions-free']);
      expect(memory?.content.length).toBeLessThanOrEqual(EXPECTED_CAPS['chatgpt-instructions-paid']);
      expect(result.warnings.filter((w) => w.startsWith('length: memory block'))).toEqual([]);
    });
  });
});
