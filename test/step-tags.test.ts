// Step tags (M4 slice 4.4; QUESTIONS W3 and W30; docs/M4-PLAN.md section 2).
//
// What is under test: the `shows`, `when` and `closer` tags on every profile install step in
// src/library/profiles.json, the profile.chatgpt-dot.rulesPath record, and what the tags do to the
// compiled bundle (CompileResult.steps) and to the committed goldens (the "## Steps" section).
//
// Where the expected values come from. Nothing here is copied from compiler output.
//   - The tag table: docs/M4-PLAN.md section 2, written out below. Three rows are the engineer's
//     read of the step text, because the plan leaves them to the engineer (chatgpt-gpt, and the
//     tail of chatgpt-instructions). Those rows are pinned from the step text in the library.
//   - The step text: the pre-tag commit of profiles.json in git. The tags change no text.
//   - The `when` rule: the plan text. A step may carry `when` only if `shows` lists only skills,
//     routines or roles, and the text names none of AGENTS.md, Custom Rule, gate, plugin, Actions
//     or private.
//   - Which starters have routines: the chip skill and pack skill records in the library (a skill of
//     kind "schedule" is a routine). A migrated roster build carries the packs its starter implies, so
//     both sources count.
//   - Which steps a bundle shows: the plan's any-of definition of delivered (a skill file or a
//     spoken skill; a spoken routine; roles chosen on a profile that compiles roles), applied to the
//     files and spoken items of the result, plus the roster oracle above for routines.
//   - The Steps section format: plan section 2 ("n. text [shows]" plus closer), numbering after
//     hiding. Reading picked by the engineer and pinned here: an empty `shows` renders "[none]" and
//     the closer renders as "closer: text [shows]".
//   - The rules path: the v2 brief (docs/Build-a-Bot-v2-Brief.md), verbatim.
//
// Re-pinned by slice 4.5b (W4 verify cleanup, QUESTIONS W32): the byte-identity block still compares
// step text to the pre-tag commit, except for the five edits W32 makes by design. Four steps
// (openclaw 6, hermes 5, gpt 9, project 5) lose the inline " verify: ..." clause, and Hermes step 6 is
// folded into the reload note and removed, so Hermes has five steps and its step 5 is the last.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { compile, library } from '../src/compiler/compile.js';
import { libraryIds } from '../src/compiler/trace.js';
import { artifactKindOf } from '../src/compiler/types.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import type { GoldenSpec } from '../tools/golden.js';
import type {
  ArtifactKind,
  CompileResult,
  InstallStep,
  Library,
  Profile,
  StepWhen,
} from '../src/compiler/types.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GOLDEN_DIR = fileURLToPath(new URL('./golden/v2/', import.meta.url));
const PROFILES_PATH = 'src/library/profiles.json';
const BRIEF_PATH = fileURLToPath(new URL('../docs/Build-a-Bot-v2-Brief.md', import.meta.url));

// ---------------------------------------------------------------------------------------------
// Helpers.

function profileOf(id: string, lib: Library = library): Profile {
  const found = lib.targets.profiles.find((p) => p.id === id);
  if (!found) {
    throw new Error(`no library profile ${id}`);
  }
  return found;
}

const cache = new Map<string, CompileResult>();

function compiled(spec: GoldenSpec): CompileResult {
  let hit = cache.get(spec.id);
  if (!hit) {
    hit = compile(buildFor(spec, library));
    cache.set(spec.id, hit);
  }
  return hit;
}

function shownKinds(result: CompileResult): Set<ArtifactKind> {
  const kinds = new Set<ArtifactKind>();
  for (const step of result.steps) {
    for (const kind of step.shows) {
      kinds.add(kind);
    }
  }
  return kinds;
}

function stepNumber(step: InstallStep): number {
  const m = /\.step\.(\d+)$/.exec(step.id);
  if (!m) {
    throw new Error(`step id ${step.id} has no number`);
  }
  return Number(m[1]);
}

// What the bundle delivers, per the plan: any skill file or spoken skill; any spoken routine; roles
// chosen on a profile that compiles roles (a profile that does not lists them as undelivered).
function deliveredOf(result: CompileResult): Record<StepWhen, boolean> {
  return {
    skills:
      result.files.some((f) => artifactKindOf(f) === 'skills') || result.spoken.some((s) => s.kind === 'skill'),
    routines: result.spoken.some((s) => s.kind === 'routine'),
    roles: result.roles.length > 0 && !result.undelivered.some((u) => u.kind === 'roles'),
  };
}

// What one shown step is: a library install step, or the promoted role fallback line.
interface ExpectedStep {
  id: string;
  text: string;
  shows: ArtifactKind[];
  closer: boolean;
}

// The profile's install steps that apply to a bundle, `when` applied as any-of, in library order.
function visibleSteps(profile: Profile, has: Record<StepWhen, boolean>): InstallStep[] {
  return profile.installSteps.filter(
    (s) => s.when === undefined || s.when.length === 0 || s.when.some((w) => has[w]),
  );
}

// QUESTIONS W33. When role files ship and no shown install step shows roles, the profile's
// fallback.roles template is a step: the template's library id, its text with {roles} filled by the
// role labels in set member order joined with ", " (the joiner the committed role goldens show,
// "(Chief of staff, Triager, Scheduler)"), shows ['roles'], never a closer. Role files are the
// files artifactKindOf calls roles.
function promotedRoleStep(profile: Profile, result: CompileResult): ExpectedStep | undefined {
  const roleFilesShip = result.files.some((f) => artifactKindOf(f) === 'roles');
  const template = Object.hasOwn(profile.templates, 'fallback.roles') ? profile.templates['fallback.roles'] : undefined;
  const shownSteps = visibleSteps(profile, deliveredOf(result));
  if (!roleFilesShip || template === undefined || shownSteps.some((s) => (s.shows ?? []).includes('roles'))) {
    return undefined;
  }
  const labels = result.roles.map((id) => library.roles.find((r) => r.id === id)?.label ?? `?${id}`);
  return { id: template.id, text: template.line.replaceAll('{roles}', labels.join(', ')), shows: ['roles'], closer: false };
}

// The steps a bundle should show: the profile's library steps, `when` applied as any-of, then the
// promoted role step if there is one, closers last.
function expectedSteps(profile: Profile, result: CompileResult): ExpectedStep[] {
  const shown = visibleSteps(profile, deliveredOf(result)).map(
    (s): ExpectedStep => ({ id: s.id, text: s.line, shows: s.shows ?? [], closer: s.closer === true }),
  );
  const promoted = promotedRoleStep(profile, result);
  return [
    ...shown.filter((s) => !s.closer),
    ...(promoted !== undefined ? [promoted] : []),
    ...shown.filter((s) => s.closer),
  ];
}

// Routine oracle from the library: a chip skill or a pack skill of kind "schedule" is a routine.
function starterHasRoutines(spec: GoldenSpec): boolean {
  const build = buildFor(spec, library);
  const chips = new Map(library.chips.map((c) => [c.id as string, c]));
  const packs = new Map(library.packs.map((p) => [p.id as string, p]));
  const fromChips = build.chips.some((id) => (chips.get(id)?.skills ?? []).some((s) => s.kind === 'schedule'));
  const fromPacks = (build.packs ?? []).some((id) => (packs.get(id)?.skills ?? []).some((s) => s.kind === 'schedule'));
  return fromChips || fromPacks;
}

// A copy of the library whose chip and pack skills are filtered by kind. The roster starters all carry
// trigger skills, so the "hidden" cases need a library without them.
function withSkills(keep: (kind: 'trigger' | 'schedule') => boolean): Library {
  return {
    ...library,
    chips: library.chips.map((c) => ({ ...c, skills: (c.skills ?? []).filter((s) => keep(s.kind)) })),
    packs: library.packs.map((p) => ({ ...p, skills: p.skills.filter((s) => keep(s.kind)) })),
  };
}

// ---------------------------------------------------------------------------------------------
// The tag table (docs/M4-PLAN.md section 2). One entry per step, in library order.

interface Tag {
  shows?: ArtifactKind[];
  when?: StepWhen[];
  closer?: true;
}

const NONE: Tag = {};
const SKILLS: Tag = { shows: ['skills'], when: ['skills'] };
const ROUTINES: Tag = { shows: ['routines'], when: ['routines'] };
const ROLES: Tag = { shows: ['roles'], when: ['roles'] };

const TAG_TABLE: Record<string, Tag[]> = {
  muse: [
    { shows: ['personality'] },
    { shows: ['memory'] },
    { shows: ['skills', 'routines'], when: ['skills', 'routines'] },
    { closer: true },
  ],
  openclaw: [{ shows: ['personality'] }, { shows: ['rules'] }, SKILLS, ROLES, { shows: ['memory'] }, ROUTINES],
  // W32 d1: the old step 6 (restart note) is folded into the reload note, so Hermes ends at step 5.
  hermes: [{ shows: ['personality'] }, { shows: ['memory', 'rules'] }, SKILLS, ROLES, ROUTINES],
  grok: [
    NONE,
    { shows: ['personality', 'label'] },
    { shows: ['memory', 'firstTask'] },
    SKILLS,
    ROUTINES,
    NONE,
    NONE,
  ],
  'chatgpt-dot': [
    NONE,
    { shows: ['customRules'] },
    { shows: ['personality'] },
    { shows: ['memory'] },
    SKILLS,
    ROUTINES,
    NONE,
    NONE,
  ],
  // The plan leaves these two profiles to the engineer; the rows follow the step text.
  'chatgpt-gpt': [
    NONE,
    { shows: ['description'] },
    { shows: ['personality'] },
    { shows: ['starters'] },
    SKILLS,
    NONE,
    NONE,
    { shows: ['memory'] },
    ROUTINES,
    NONE,
  ],
  'chatgpt-instructions': [NONE, { shows: ['memory'] }, { shows: ['personality'] }, NONE, NONE],
  'chatgpt-project': [NONE, { shows: ['personality'] }, SKILLS, { shows: ['memory'] }, ROUTINES],
};

const PROFILE_IDS = Object.keys(TAG_TABLE);

const ARTIFACT_KINDS: readonly string[] = [
  'personality',
  'rules',
  'memory',
  'skills',
  'routines',
  'firstTask',
  'customRules',
  'label',
  'starters',
  'description',
  'roles',
];
const WHEN_KINDS: readonly string[] = ['skills', 'routines', 'roles'];
const FORBIDDEN_FOR_WHEN = /AGENTS\.md|Custom Rule|gate|plugin|Actions|private/i;

// ---------------------------------------------------------------------------------------------
// 1. The tag table, step by step.

describe('step tags match the plan table', () => {
  it('covers the eight profiles in the library', () => {
    expect(library.targets.profiles.map((p) => p.id)).toEqual(PROFILE_IDS);
  });

  for (const id of PROFILE_IDS) {
    describe(id, () => {
      const profile = profileOf(id);
      const expected = TAG_TABLE[id] ?? [];

      it('has the expected number of steps, numbered 1..n in library order', () => {
        expect(profile.installSteps).toHaveLength(expected.length);
        expect(profile.installSteps.map((s) => s.id)).toEqual(
          expected.map((_, i) => `profile.${id}.step.${i + 1}`),
        );
        expect(profile.installSteps.map(stepNumber)).toEqual(expected.map((_, i) => i + 1));
      });

      expected.forEach((tag, i) => {
        const n = i + 1;
        it(`step ${n}: shows ${JSON.stringify(tag.shows ?? [])}, when ${JSON.stringify(tag.when ?? [])}, closer ${tag.closer === true}`, () => {
          const step = profile.installSteps[i];
          expect(step, `step ${n} missing`).toBeDefined();
          expect(step?.shows ?? []).toEqual(tag.shows ?? []);
          expect(step?.when ?? []).toEqual(tag.when ?? []);
          expect(step?.closer === true).toBe(tag.closer === true);
        });
      });
    });
  }

  it('uses only known artifact kinds in `shows` and only skills, routines or roles in `when`', () => {
    for (const p of library.targets.profiles) {
      for (const s of p.installSteps) {
        for (const k of s.shows ?? []) {
          expect(ARTIFACT_KINDS, `${s.id} shows ${k}`).toContain(k);
        }
        for (const w of s.when ?? []) {
          expect(WHEN_KINDS, `${s.id} when ${w}`).toContain(w);
        }
      }
    }
  });

  it('lists no artifact twice in one step', () => {
    for (const p of library.targets.profiles) {
      for (const s of p.installSteps) {
        expect(new Set(s.shows ?? []).size, s.id).toBe((s.shows ?? []).length);
        expect(new Set(s.when ?? []).size, s.id).toBe((s.when ?? []).length);
      }
    }
  });

  it('has a closer only on Muse step 4, and no step is both a closer and `when`-hidden', () => {
    for (const p of library.targets.profiles) {
      const closers = p.installSteps.filter((s) => s.closer === true);
      if (p.id === 'muse') {
        expect(closers.map((s) => s.id)).toEqual(['profile.muse.step.4']);
        expect(p.installSteps[p.installSteps.length - 1]?.closer).toBe(true);
      } else {
        expect(closers, p.id).toEqual([]);
      }
      for (const s of closers) {
        expect(s.when ?? [], s.id).toEqual([]);
        expect(s.shows ?? [], s.id).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Step text is byte-identical to the pre-tag library.

// The newest commit where no install step carries a tag. With the tags uncommitted that is HEAD; once
// they are committed, the walk goes back to the commit before them. Null when git or the history is
// unavailable, and the tests skip.
function preTagBaseline(): { profiles: Profile[]; commit: string } | null {
  try {
    const log = execFileSync('git', ['log', '--format=%H', '--', PROFILES_PATH], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter((l) => l.length > 0);
    for (const commit of ['HEAD', ...log]) {
      let text: string;
      try {
        text = execFileSync('git', ['show', `${commit}:${PROFILES_PATH}`], {
          cwd: ROOT,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        continue;
      }
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) {
        continue;
      }
      const profiles = parsed as Profile[];
      const untagged = profiles.every((p) =>
        p.installSteps.every((s) => s.shows === undefined && s.when === undefined && s.closer === undefined),
      );
      if (untagged) {
        return { profiles, commit };
      }
    }
  } catch {
    return null;
  }
  return null;
}

const baseline = preTagBaseline();

// QUESTIONS W32 edits 1 to 11 and d1: the only step text changes since the pre-tag library. Each step
// below is the old step with its embedded clause removed; the clause text is the old library's.
const W32_STEP_EDITS: Record<string, string> = {
  'profile.openclaw.step.6': ' verify: whether OpenClaw keeps routines in files or in chat.',
  'profile.hermes.step.5': ' verify: whether Hermes keeps routines in files or in chat.',
  'profile.chatgpt-gpt.step.9': ' verify: whether your plan includes Tasks.',
  'profile.chatgpt-project.step.5': ' verify: whether your plan includes Tasks.',
};
// W32 d1: removed outright, its text now lives in the Hermes reload note.
const W32_REMOVED_STEPS = ['profile.hermes.step.6'];

describe('step text is byte-identical to the pre-tag library (git), except the W32 edits', () => {
  it.skipIf(baseline === null)('found a pre-tag profiles.json in git with the eight profiles', () => {
    expect(baseline?.profiles.map((p) => p.id)).toEqual(PROFILE_IDS);
  });

  it.skipIf(baseline === null)('the old clauses are in the pre-tag text, so the edit table is read against the right commit', () => {
    for (const [stepId, clause] of Object.entries(W32_STEP_EDITS)) {
      const old = baseline?.profiles.flatMap((p) => p.installSteps).find((s) => s.id === stepId);
      expect(old?.line, stepId).toContain(clause);
    }
    for (const stepId of W32_REMOVED_STEPS) {
      expect(baseline?.profiles.flatMap((p) => p.installSteps).some((s) => s.id === stepId), stepId).toBe(true);
    }
  });

  for (const id of PROFILE_IDS) {
    it.skipIf(baseline === null)(`${id}: same step ids in the same order, same text bytes`, () => {
      const before = baseline?.profiles.find((p) => p.id === id);
      expect(before, `${id} missing from the baseline`).toBeDefined();
      const after = profileOf(id);
      const kept = (before?.installSteps ?? []).filter((b) => !W32_REMOVED_STEPS.includes(b.id));
      expect(after.installSteps.map((s) => s.id)).toEqual(kept.map((s) => s.id));
      kept.forEach((b, i) => {
        const a = after.installSteps[i];
        expect(a?.id).toBe(b.id);
        const clause = W32_STEP_EDITS[b.id];
        const expected = clause === undefined ? b.line : b.line.replace(clause, '');
        expect(Buffer.from(a?.line ?? '', 'utf8').equals(Buffer.from(expected, 'utf8')), `${b.id} text bytes`).toBe(true);
      });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 3. The `when` rule.

describe('`when` sits only on skill, routine and role steps', () => {
  const all = library.targets.profiles.flatMap((p) => p.installSteps);
  const whenSteps = all.filter((s) => (s.when ?? []).length > 0);

  it('has `when` steps to check (the rule is not vacuous)', () => {
    expect(whenSteps.length).toBeGreaterThan(0);
    // Muse 3; openclaw 3, 4 and 6; hermes 3, 4 and 5; grok 4 and 5; dot 5 and 6; gpt 5 and 9; project 3 and 5.
    expect(whenSteps).toHaveLength(15);
  });

  it('a `when` step shows only skills, routines or roles, and shows at least one', () => {
    for (const s of whenSteps) {
      expect((s.shows ?? []).length, `${s.id} shows nothing`).toBeGreaterThan(0);
      for (const k of s.shows ?? []) {
        expect(WHEN_KINDS, `${s.id} shows ${k}`).toContain(k);
      }
    }
  });

  it('a `when` step shows nothing beyond the kinds its own `when` lists', () => {
    for (const s of whenSteps) {
      for (const k of s.shows ?? []) {
        expect(s.when, `${s.id} shows ${k} but is not hidden by it`).toContain(k);
      }
    }
  });

  it('a `when` step text names no AGENTS.md, Custom Rule, gate, plugin, Actions or private', () => {
    for (const s of whenSteps) {
      expect(FORBIDDEN_FOR_WHEN.test(s.line), `${s.id}: ${s.line}`).toBe(false);
    }
  });

  it('every step whose text names one of those words has no `when` (so the check can fail)', () => {
    const named = all.filter((s) => FORBIDDEN_FOR_WHEN.test(s.line));
    const ids = named.map((s) => s.id);
    // The rules, plugin, Actions and private steps the rule exists to protect.
    for (const id of [
      'profile.openclaw.step.2',
      'profile.hermes.step.2',
      'profile.grok.step.6',
      'profile.grok.step.7',
      'profile.chatgpt-dot.step.2',
      'profile.chatgpt-dot.step.7',
      'profile.chatgpt-gpt.step.7',
      'profile.chatgpt-gpt.step.10',
    ]) {
      expect(ids, `${id} should name a protected word`).toContain(id);
    }
    for (const s of named) {
      expect(s.when ?? [], s.id).toEqual([]);
    }
  });

  it('never hides a step that carries rules or customRules', () => {
    for (const s of all) {
      if ((s.shows ?? []).includes('rules') || (s.shows ?? []).includes('customRules')) {
        expect(s.when ?? [], s.id).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 4. The rules artifact and customRules sit under exactly one step.

function stepsShowing(profile: Profile, kind: ArtifactKind): InstallStep[] {
  return profile.installSteps.filter((s) => (s.shows ?? []).includes(kind));
}

describe('rules and customRules are under exactly one step', () => {
  for (const id of ['openclaw', 'hermes']) {
    it(`${id}: the rules artifact is shown by exactly one step, and that step is never hidden`, () => {
      const steps = stepsShowing(profileOf(id), 'rules');
      expect(steps).toHaveLength(1);
      expect(steps[0]?.when ?? []).toEqual([]);
      expect(stepsShowing(profileOf(id), 'customRules')).toEqual([]);
    });
  }

  it('chatgpt-dot: customRules is shown by exactly one step, and that step is never hidden', () => {
    const steps = stepsShowing(profileOf('chatgpt-dot'), 'customRules');
    expect(steps).toHaveLength(1);
    expect(steps[0]?.when ?? []).toEqual([]);
    expect(stepsShowing(profileOf('chatgpt-dot'), 'rules')).toEqual([]);
  });

  it('no other profile has a rules or customRules step', () => {
    for (const id of ['muse', 'grok', 'chatgpt-gpt', 'chatgpt-instructions', 'chatgpt-project']) {
      expect(stepsShowing(profileOf(id), 'rules'), id).toEqual([]);
      expect(stepsShowing(profileOf(id), 'customRules'), id).toEqual([]);
    }
  });

  it('the rules step comes before any step that connects accounts, plugins or Actions', () => {
    let checked = 0;
    for (const p of library.targets.profiles) {
      const rulesStep = [...stepsShowing(p, 'rules'), ...stepsShowing(p, 'customRules')][0];
      if (!rulesStep) {
        continue;
      }
      for (const s of p.installSteps) {
        if (s.id !== rulesStep.id && /plugin|Actions|connect/i.test(s.line)) {
          checked += 1;
          expect(stepNumber(rulesStep), `${rulesStep.id} must precede ${s.id}`).toBeLessThan(stepNumber(s));
        }
      }
    }
    // chatgpt-dot step 7 connects plugins.
    expect(checked).toBeGreaterThan(0);
  });

  describe('in the compiled goldens', () => {
    for (const spec of GOLDEN_SPECS) {
      const profile = spec.target === 'chatgpt' ? `chatgpt-${spec.mode}` : spec.target;
      if (profile === 'openclaw' || profile === 'hermes') {
        it(`${spec.id}: exactly one step shows rules`, () => {
          const result = compiled(spec);
          expect(result.steps.filter((s) => s.shows.includes('rules'))).toHaveLength(1);
          expect(result.files.some((f) => artifactKindOf(f) === 'rules')).toBe(true);
        });
      }
      if (profile === 'chatgpt-dot') {
        it(`${spec.id}: exactly one step shows customRules, and the build has custom rules`, () => {
          const result = compiled(spec);
          expect(result.customRules.length).toBeGreaterThan(0);
          expect(result.steps.filter((s) => s.shows.includes('customRules'))).toHaveLength(1);
        });
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 5. Muse.

describe('Muse steps', () => {
  const muse = profileOf('muse');

  it('step 1 shows personality, step 2 memory, step 3 skills and routines, step 4 is the closer', () => {
    expect(muse.installSteps[0]?.shows).toEqual(['personality']);
    expect(muse.installSteps[1]?.shows).toEqual(['memory']);
    expect(muse.installSteps[2]?.shows).toEqual(['skills', 'routines']);
    expect(muse.installSteps[3]?.closer).toBe(true);
  });

  for (const starter of ['marty', 'vera']) {
    it(`${starter}.muse: four steps, the closer last and unnumbered in the data`, () => {
      const spec = GOLDEN_SPECS.find((s) => s.id === `${starter}.muse`);
      expect(spec).toBeDefined();
      const result = compiled(spec as GoldenSpec);
      expect(result.steps.map((s) => s.id)).toEqual([1, 2, 3, 4].map((n) => `profile.muse.step.${n}`));
      expect(result.steps.map((s) => s.closer)).toEqual([false, false, false, true]);
      expect(result.steps.map((s) => s.shows)).toEqual([['personality'], ['memory'], ['skills', 'routines'], []]);
    });
  }

  function museSteps(starter: string, lib: Library): { ids: string[]; closers: boolean[] } {
    const spec: GoldenSpec = { id: `${starter}.muse`, starter, target: 'muse' };
    const result = compile(buildFor(spec, lib), lib);
    return { ids: result.steps.map((s) => s.id), closers: result.steps.map((s) => s.closer) };
  }

  it('step 3 is hidden when the build has no skills and no routines, and the closer stays last', () => {
    const none = museSteps('marty', withSkills(() => false));
    expect(none.ids).toEqual(['profile.muse.step.1', 'profile.muse.step.2', 'profile.muse.step.4']);
    expect(none.closers).toEqual([false, false, true]);
  });

  it('step 3 shows for skills alone', () => {
    const triggersOnly = museSteps('marty', withSkills((k) => k === 'trigger'));
    expect(triggersOnly.ids).toContain('profile.muse.step.3');
  });

  it('step 3 shows for routines alone (any-of)', () => {
    const schedulesOnly = museSteps('marty', withSkills((k) => k === 'schedule'));
    expect(schedulesOnly.ids).toContain('profile.muse.step.3');
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Every file and spoken item is under a step.

describe('every delivered artifact is shown by some step (55 goldens)', () => {
  it('the golden spec list has 55 entries', () => {
    expect(GOLDEN_SPECS).toHaveLength(55);
  });

  for (const spec of GOLDEN_SPECS) {
    it(spec.id, () => {
      const result = compiled(spec);
      const shown = shownKinds(result);
      const missing = new Set<ArtifactKind>();
      for (const item of [...result.files, ...result.spoken]) {
        const kind = artifactKindOf(item);
        if (shown.has(kind)) {
          continue;
        }
        missing.add(kind);
      }
      expect([...missing], `${spec.id} (${result.profile}): kinds with no step`).toEqual([]);
    });
  }

  // W33: grok, project and gpt ship role files with no install step of their own for them, so the
  // fallback.roles line is the step that shows roles. No role artifact is left without a step.
  it('roles are shown by a step on every golden that ships role files: openclaw, hermes, grok and project', () => {
    const roleGoldens = ['marty.openclaw.roles', 'rook.hermes.roles', 'june.grok.roles', 'sol.chatgpt-project.roles'];
    expect(GOLDEN_SPECS.filter((s) => (s.roles ?? []).length > 0).map((s) => s.id)).toEqual(roleGoldens);
    for (const id of roleGoldens) {
      const spec = GOLDEN_SPECS.find((s) => s.id === id) as GoldenSpec;
      const result = compiled(spec);
      expect(result.files.some((f) => artifactKindOf(f) === 'roles'), id).toBe(true);
      expect(shownKinds(result).has('roles'), id).toBe(true);
    }
  });
});

describe('the artifacts that are not files or spoken items are under a step too', () => {
  it('grok: the build name label is shown by a step', () => {
    for (const spec of GOLDEN_SPECS.filter((s) => s.target === 'grok')) {
      const result = compiled(spec);
      expect(result.buildName.length, spec.id).toBeGreaterThan(0);
      expect(shownKinds(result).has('label'), spec.id).toBe(true);
    }
  });

  it('chatgpt-dot: custom rules are shown by a step', () => {
    for (const spec of GOLDEN_SPECS.filter((s) => s.mode === 'dot')) {
      const result = compiled(spec);
      expect(result.customRules.length, spec.id).toBeGreaterThan(0);
      expect(shownKinds(result).has('customRules'), spec.id).toBe(true);
    }
  });

  it('no golden other than grok shows the label, and no golden other than dot shows customRules', () => {
    for (const spec of GOLDEN_SPECS) {
      const result = compiled(spec);
      if (spec.target !== 'grok') {
        expect(shownKinds(result).has('label'), spec.id).toBe(false);
      }
      if (spec.mode !== 'dot') {
        expect(shownKinds(result).has('customRules'), spec.id).toBe(false);
      }
    }
  });
});

// The custom GPT mode is hidden and has no goldens, so nothing pins its tags but these tests.
describe('chatgpt-gpt (no goldens)', () => {
  const gptSpecs: GoldenSpec[] = library.roster.map((r) => ({
    id: `${r.id}.chatgpt-gpt`,
    starter: r.id,
    target: 'chatgpt',
    mode: 'gpt',
  }));

  for (const spec of gptSpecs) {
    it(`${spec.id}: files and spoken items, the starters and the description are all under a step`, () => {
      const result = compiled(spec);
      expect(result.profile).toBe('chatgpt-gpt');
      const shown = shownKinds(result);
      for (const item of [...result.files, ...result.spoken]) {
        expect(shown.has(artifactKindOf(item)), `${spec.id} ${artifactKindOf(item)}`).toBe(true);
      }
      expect(result.starterIds.length).toBeGreaterThan(0);
      expect(shown.has('starters')).toBe(true);
      expect((result.description ?? '').length).toBeGreaterThan(0);
      expect(shown.has('description')).toBe(true);
    });

    it(`${spec.id}: the routine step (step 9) shows exactly when the starter has routines`, () => {
      const result = compiled(spec);
      expect(result.steps.some((s) => s.id === 'profile.chatgpt-gpt.step.9')).toBe(starterHasRoutines(spec));
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 7. Which steps a bundle shows.

describe('a bundle shows the steps its delivery earns', () => {
  for (const spec of GOLDEN_SPECS) {
    it(`${spec.id}: library steps, \`when\` applied as any-of, closers last`, () => {
      const result = compiled(spec);
      const profile = profileOf(result.profile);
      expect(result.steps.map((s) => s.id)).toEqual(expectedSteps(profile, result).map((s) => s.id));
    });
  }

  // A step's id is a profile installSteps id, or the profile's fallback.roles template id (W33).
  it('each shown step carries the library tags and text of its step record, or of the fallback.roles template', () => {
    for (const spec of GOLDEN_SPECS) {
      const result = compiled(spec);
      const profile = profileOf(result.profile);
      const promoted = promotedRoleStep(profile, result);
      for (const step of result.steps) {
        if (step.id === promoted?.id) {
          expect(step, `${spec.id} ${step.id}`).toEqual(promoted);
          continue;
        }
        const record = profile.installSteps.find((s) => s.id === step.id);
        expect(record, `${spec.id} ${step.id}`).toBeDefined();
        expect(step.text).toBe(record?.line);
        expect(step.shows).toEqual(record?.shows ?? []);
        expect(step.closer).toBe(record?.closer === true);
      }
    }
  });

  it('result.installSteps is the text of result.steps', () => {
    for (const spec of GOLDEN_SPECS) {
      const result = compiled(spec);
      expect(result.installSteps).toEqual(result.steps.map((s) => s.text));
    }
  });

  it('library tags are trace ids: every step id is a known library id', () => {
    const ids = libraryIds(library);
    for (const p of library.targets.profiles) {
      for (const s of p.installSteps) {
        expect(ids.has(s.id), s.id).toBe(true);
      }
    }
  });
});

describe('the routine step', () => {
  // Steps that exist only for routines, by profile.
  const ROUTINE_STEP: Record<string, string> = {
    openclaw: 'profile.openclaw.step.6',
    hermes: 'profile.hermes.step.5',
    grok: 'profile.grok.step.5',
    'chatgpt-dot': 'profile.chatgpt-dot.step.6',
    'chatgpt-project': 'profile.chatgpt-project.step.5',
  };

  it('is absent for ink on openclaw', () => {
    const spec = GOLDEN_SPECS.find((s) => s.id === 'ink.openclaw') as GoldenSpec;
    expect(starterHasRoutines(spec)).toBe(false);
    expect(compiled(spec).steps.map((s) => s.id)).not.toContain('profile.openclaw.step.6');
  });

  it('is present for june on openclaw', () => {
    const spec = GOLDEN_SPECS.find((s) => s.id === 'june.openclaw') as GoldenSpec;
    expect(starterHasRoutines(spec)).toBe(true);
    expect(compiled(spec).steps.map((s) => s.id)).toContain('profile.openclaw.step.6');
  });

  it('shows exactly when the starter has a schedule skill, on every profile that has one', () => {
    let checked = 0;
    for (const spec of GOLDEN_SPECS) {
      const result = compiled(spec);
      const stepId = ROUTINE_STEP[result.profile];
      if (stepId === undefined) {
        continue;
      }
      checked += 1;
      expect(result.steps.some((s) => s.id === stepId), `${spec.id} ${stepId}`).toBe(starterHasRoutines(spec));
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is gone from the hidden-routines goldens for ink, pip, sol and vera on all five delivery targets', () => {
    for (const starter of ['ink', 'pip', 'sol', 'vera']) {
      for (const suffix of ['openclaw', 'hermes', 'grok', 'chatgpt-dot']) {
        const spec = GOLDEN_SPECS.find((s) => s.id === `${starter}.${suffix}`) as GoldenSpec;
        const result = compiled(spec);
        expect(result.steps.some((s) => s.shows.includes('routines')), spec.id).toBe(false);
      }
      const muse = compiled(GOLDEN_SPECS.find((s) => s.id === `${starter}.muse`) as GoldenSpec);
      // Muse step 3 is skills or routines, so it stays while the build has skills.
      expect(muse.steps.map((s) => s.id), `${starter}.muse`).toContain('profile.muse.step.3');
    }
  });

  it('is gone when the library has no schedule skills (chips or packs), and the skills step stays', () => {
    const lib = withSkills((k) => k === 'trigger');
    for (const id of ['marty.openclaw', 'marty.hermes', 'marty.grok', 'marty.chatgpt-dot', 'marty.chatgpt-project']) {
      const spec = GOLDEN_SPECS.find((s) => s.id === id) as GoldenSpec;
      const result = compile(buildFor(spec, lib), lib);
      expect(result.steps.some((s) => s.shows.includes('routines')), id).toBe(false);
      expect(result.steps.some((s) => s.shows.includes('skills')), id).toBe(true);
    }
  });
});

describe('the skills step', () => {
  it('is gone when the library has no skills at all (chips or packs), on openclaw, hermes, grok, dot and project', () => {
    const lib = withSkills(() => false);
    for (const id of ['marty.openclaw', 'marty.hermes', 'marty.grok', 'marty.chatgpt-dot', 'marty.chatgpt-project']) {
      const spec = GOLDEN_SPECS.find((s) => s.id === id) as GoldenSpec;
      const result = compile(buildFor(spec, lib), lib);
      expect(result.steps.some((s) => s.shows.includes('skills')), id).toBe(false);
      expect(result.steps.some((s) => s.shows.includes('routines')), id).toBe(false);
      // The steps that are never hidden are still there.
      expect(result.steps.some((s) => s.shows.includes('personality')), id).toBe(true);
      expect(result.steps.some((s) => s.shows.includes('memory')), id).toBe(true);
    }
  });
});

describe('the role step', () => {
  it('is absent for marty.openclaw', () => {
    const spec = GOLDEN_SPECS.find((s) => s.id === 'marty.openclaw') as GoldenSpec;
    expect(spec.roles).toBeUndefined();
    expect(compiled(spec).steps.map((s) => s.id)).not.toContain('profile.openclaw.step.4');
  });

  it('is present for marty.openclaw.roles', () => {
    const spec = GOLDEN_SPECS.find((s) => s.id === 'marty.openclaw.roles') as GoldenSpec;
    expect((spec.roles ?? []).length).toBeGreaterThan(0);
    expect(compiled(spec).steps.map((s) => s.id)).toContain('profile.openclaw.step.4');
  });

  it('is absent for rook.hermes and present for rook.hermes.roles', () => {
    const plain = GOLDEN_SPECS.find((s) => s.id === 'rook.hermes') as GoldenSpec;
    const roles = GOLDEN_SPECS.find((s) => s.id === 'rook.hermes.roles') as GoldenSpec;
    expect(compiled(plain).steps.map((s) => s.id)).not.toContain('profile.hermes.step.4');
    expect(compiled(roles).steps.map((s) => s.id)).toContain('profile.hermes.step.4');
  });

  it('shows on openclaw and hermes exactly when the golden spec picked roles', () => {
    for (const spec of GOLDEN_SPECS) {
      if (spec.target !== 'openclaw' && spec.target !== 'hermes') {
        continue;
      }
      const stepId = `profile.${spec.target}.step.4`;
      const picked = (spec.roles ?? []).length > 0;
      expect(compiled(spec).steps.some((s) => s.id === stepId), `${spec.id} ${stepId}`).toBe(picked);
    }
  });

  it('a role step is never shown for a build that picked no roles, on any profile', () => {
    for (const spec of GOLDEN_SPECS) {
      if ((spec.roles ?? []).length === 0) {
        expect(compiled(spec).steps.some((s) => s.shows.includes('roles')), spec.id).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 7a. The role fallback line as a step (QUESTIONS W33).
//
// Grok (team), the ChatGPT Project and the custom GPT (separate bundles) ship role files and have no
// install step that shows roles, only a fallback.roles line. When role files ship, that line is a
// BundleStep with shows ['roles'], placed after the other non-closer steps and before any closer. It
// keeps its library id and its filled text, it is in installSteps and in the Steps section, and it is
// no longer a note. Profiles that ship no role files keep the note.

describe('the role fallback line as an install step (W33)', () => {
  // One build per affected profile. The golden specs cover grok and project; the custom GPT is hidden
  // and has no golden, so it gets a spec of its own on the same starter as grok.
  const PROMOTED: { profile: string; spec: GoldenSpec }[] = [
    { profile: 'grok', spec: GOLDEN_SPECS.find((s) => s.id === 'june.grok.roles') as GoldenSpec },
    { profile: 'chatgpt-project', spec: GOLDEN_SPECS.find((s) => s.id === 'sol.chatgpt-project.roles') as GoldenSpec },
    {
      profile: 'chatgpt-gpt',
      spec: {
        id: 'june.chatgpt-gpt.roles',
        starter: 'june',
        target: 'chatgpt',
        mode: 'gpt',
        roles: ['chief-of-staff', 'triager', 'scheduler'],
      },
    },
  ];

  it('the golden specs for grok and project exist', () => {
    expect(PROMOTED[0]?.spec).toBeDefined();
    expect(PROMOTED[1]?.spec).toBeDefined();
  });

  describe.each(PROMOTED)('$profile', ({ profile: pid, spec }) => {
    const result = compiled(spec);
    const profile = profileOf(pid);
    const record = profile.templates['fallback.roles'];
    const promoted = promotedRoleStep(profile, result) as ExpectedStep;

    it('is built on the profile it names, with role files', () => {
      expect(result.profile).toBe(pid);
      expect(result.files.some((f) => artifactKindOf(f) === 'roles')).toBe(true);
      expect(profile.installSteps.some((s) => (s.shows ?? []).includes('roles'))).toBe(false);
    });

    it('has the promoted step: the fallback.roles template id, shows roles, not a closer', () => {
      expect(record.id).toBe(`profile.${pid}.fallback.roles`);
      expect(promoted).toBeDefined();
      const matches = result.steps.filter((s) => s.id === record.id);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.shows).toEqual(['roles']);
      expect(matches[0]?.closer).toBe(false);
      expect(matches[0]).toEqual(promoted);
      // The text is the template with {roles} filled by the picked role labels, in set order.
      const [head, tail] = record.line.split('{roles}');
      expect(matches[0]?.text.startsWith(head ?? '')).toBe(true);
      expect(matches[0]?.text.endsWith(tail ?? '')).toBe(true);
      for (const id of result.roles) {
        const label = library.roles.find((r) => r.id === id)?.label ?? `?${id}`;
        expect(matches[0]?.text, label).toContain(label);
      }
    });

    it('comes after every other non-closer step and before any closer', () => {
      const at = result.steps.findIndex((s) => s.id === record.id);
      expect(result.steps.slice(0, at).every((s) => !s.closer)).toBe(true);
      expect(result.steps.slice(at + 1).every((s) => s.closer)).toBe(true);
      expect(result.steps.filter((s) => !s.closer).at(-1)?.id).toBe(record.id);
      // The other steps are the profile's own, in library order.
      expect(result.steps.filter((s) => s.id !== record.id).map((s) => s.id)).toEqual(
        visibleSteps(profile, deliveredOf(result)).map((s) => s.id),
      );
    });

    it('is the first step that shows roles, so the role groups sit under it', () => {
      expect(result.steps.findIndex((s) => s.shows.includes('roles'))).toBe(
        result.steps.findIndex((s) => s.id === record.id),
      );
      expect(result.steps.filter((s) => s.shows.includes('roles')).map((s) => s.id)).toEqual([record.id]);
    });

    it('is in installSteps and is no longer a note', () => {
      expect(result.installSteps).toContain(promoted.text);
      expect(result.notes).not.toContain(promoted.text);
      expect(result.noteItems.filter((n) => n.id === record.id)).toEqual([]);
      expect(result.noteItems.filter((n) => n.kind === 'role')).toEqual([]);
    });

    it('comes before a closer on a copy of the library whose last shown install step is a closer', () => {
      // The last step this build shows (a routines step is hidden when the build has no routines).
      const lastId = visibleSteps(profile, deliveredOf(result)).at(-1)?.id;
      expect(lastId).toBeDefined();
      const closerLib: Library = {
        ...library,
        targets: {
          ...library.targets,
          profiles: library.targets.profiles.map((p) =>
            p.id !== pid
              ? p
              : { ...p, installSteps: p.installSteps.map((s) => (s.id === lastId ? { ...s, closer: true } : s)) },
          ),
        },
      };
      const synth = compile(buildFor(spec, closerLib), closerLib);
      const ids = synth.steps.map((s) => s.id);
      expect(ids.at(-1)).toBe(lastId);
      expect(ids.at(-2)).toBe(record.id);
      expect(synth.steps.at(-1)?.closer).toBe(true);
    });
  });

  // The committed goldens: the line is under Install steps and Steps, and not under Notes.
  describe.each(PROMOTED.slice(0, 2))('golden $spec.id', ({ spec }) => {
    const result = compiled(spec);
    const profile = profileOf(result.profile);
    const promoted = promotedRoleStep(profile, result) as ExpectedStep;
    const sections = topLevelSections(readFileSync(`${GOLDEN_DIR}${spec.id}.md`, 'utf8'));
    const body = (title: string): string[] =>
      (sections.get(title)?.[0] ?? []).filter((l) => l.trim() !== '');
    const position = expectedSteps(profile, result).filter((s) => !s.closer).findIndex((s) => s.id === promoted.id) + 1;

    it('shows the line, numbered, in Install steps', () => {
      expect(position).toBeGreaterThan(0);
      expect(body('Install steps')).toContain(`${position}. ${promoted.text}`);
    });

    it('shows the line, numbered and tagged roles, in Steps', () => {
      expect(body('Steps')).toContain(`${position}. ${promoted.text} [roles]`);
    });

    it('does not show the line in Notes', () => {
      expect(body('Notes').filter((l) => l.includes(promoted.text))).toEqual([]);
      const [head] = (profile.templates['fallback.roles'] as { line: string }).line.split('{roles}');
      expect(body('Notes').filter((l) => l.includes(head ?? '#'))).toEqual([]);
    });
  });

  // Profiles that ship no role files keep the line as a note, and promote nothing.
  it('chatgpt-dot keeps the fallback.roles line as a note, with no step that shows roles', () => {
    const profile = profileOf('chatgpt-dot');
    const record = profile.templates['fallback.roles'];
    const spec: GoldenSpec = {
      id: 'june.chatgpt-dot.roles',
      starter: 'june',
      target: 'chatgpt',
      mode: 'dot',
      roles: ['chief-of-staff', 'triager', 'scheduler'],
    };
    const result = compiled(spec);
    expect(result.files.some((f) => artifactKindOf(f) === 'roles')).toBe(false);
    expect(result.steps.some((s) => s.id === record.id || s.shows.includes('roles'))).toBe(false);
    expect(result.noteItems.filter((n) => n.kind === 'role').map((n) => n.id)).toEqual([record.id]);
    expect(result.steps).toEqual(compiled({ ...spec, id: 'june.chatgpt-dot.no-roles', roles: [] }).steps);
  });

  it('muse and chatgpt-instructions keep their fallback.none line as a note, with no step that shows roles', () => {
    const specs: GoldenSpec[] = [
      { id: 'june.muse.roles', starter: 'june', target: 'muse', roles: ['chief-of-staff', 'triager'] },
      { id: 'june.chatgpt-instructions.roles', starter: 'june', target: 'chatgpt', mode: 'instructions', plan: 'free', roles: ['chief-of-staff', 'triager'] },
    ];
    for (const spec of specs) {
      const result = compiled(spec);
      const none = profileOf(result.profile).templates['fallback.none'];
      expect(result.steps.some((s) => s.shows.includes('roles')), spec.id).toBe(false);
      expect(result.steps.some((s) => s.id.endsWith('.fallback.roles') || s.id.endsWith('.fallback.none')), spec.id).toBe(false);
      expect(result.noteItems.filter((n) => n.kind === 'role').map((n) => n.id), spec.id).toEqual([none.id]);
    }
  });

  it('openclaw and hermes keep their own roles step and gain no fallback.roles step', () => {
    for (const id of ['marty.openclaw.roles', 'rook.hermes.roles']) {
      const spec = GOLDEN_SPECS.find((s) => s.id === id) as GoldenSpec;
      const result = compiled(spec);
      const profile = profileOf(result.profile);
      expect(result.steps.filter((s) => s.shows.includes('roles')).map((s) => s.id), id).toEqual([`profile.${spec.target}.step.4`]);
      for (const step of result.steps) {
        expect(profile.installSteps.map((s) => s.id), `${id} ${step.id}`).toContain(step.id);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 8. The Steps section of the committed goldens.

// Top-level sections of a golden: "## Title" lines outside any code fence, with the lines under them.
// The skill and role files inside a golden hold their own "## Steps" headings, so this is fence-aware.
function topLevelSections(text: string): Map<string, string[][]> {
  const sections = new Map<string, string[][]>();
  let current: string[] | null = null;
  let fence = 0;
  for (const line of text.split('\n')) {
    const run = /^(`{3,})/.exec(line);
    if (fence === 0) {
      if (run) {
        fence = (run[1] ?? '').length;
      } else if (line.startsWith('## ')) {
        current = [];
        const title = line.slice(3);
        sections.set(title, [...(sections.get(title) ?? []), current]);
        continue;
      }
    } else if (/^`+$/.test(line) && line.length >= fence) {
      fence = 0;
    }
    current?.push(line);
  }
  return sections;
}

function expectedStepsSection(spec: GoldenSpec): string[] {
  const result = compiled(spec);
  const profile = profileOf(result.profile);
  const lines: string[] = [];
  let n = 0;
  for (const step of expectedSteps(profile, result)) {
    const tags = `[${step.shows.length > 0 ? step.shows.join(', ') : 'none'}]`;
    lines.push(step.closer ? `closer: ${step.text} ${tags}` : `${(n += 1)}. ${step.text} ${tags}`);
  }
  return lines;
}

describe('goldens pin the tags in a Steps section', () => {
  for (const spec of GOLDEN_SPECS) {
    it(`${spec.id}: one "## Steps" section, numbered after hiding, closer unnumbered`, () => {
      const text = readFileSync(`${GOLDEN_DIR}${spec.id}.md`, 'utf8');
      const sections = topLevelSections(text).get('Steps') ?? [];
      expect(sections, 'top-level Steps sections').toHaveLength(1);
      const body = (sections[0] ?? []).filter((l) => l.trim() !== '');
      expect(body).toEqual(expectedStepsSection(spec));
    });
  }

  it('the Steps section comes after Install steps in every golden', () => {
    for (const spec of GOLDEN_SPECS) {
      const titles = [...topLevelSections(readFileSync(`${GOLDEN_DIR}${spec.id}.md`, 'utf8')).keys()];
      expect(titles.indexOf('Steps'), spec.id).toBeGreaterThan(titles.indexOf('Install steps'));
    }
  });

  it('the Muse golden ends its Steps with the closer, unnumbered', () => {
    const text = readFileSync(`${GOLDEN_DIR}marty.muse.md`, 'utf8');
    const body = (topLevelSections(text).get('Steps') ?? [[]])[0]?.filter((l) => l.trim() !== '') ?? [];
    expect(body).toHaveLength(4);
    expect(body[3]?.startsWith('closer: ')).toBe(true);
    expect(body.slice(0, 3).map((l, i) => l.startsWith(`${i + 1}. `))).toEqual([true, true, true]);
  });

  it('numbers after hiding: ink.openclaw has no gap where the routine and role steps were', () => {
    const text = readFileSync(`${GOLDEN_DIR}ink.openclaw.md`, 'utf8');
    const body = (topLevelSections(text).get('Steps') ?? [[]])[0]?.filter((l) => l.trim() !== '') ?? [];
    expect(body.map((l) => l.split('.')[0])).toEqual(['1', '2', '3', '4']);
  });
});

// ---------------------------------------------------------------------------------------------
// 9. profile.chatgpt-dot.rulesPath (W30).

describe('profile.chatgpt-dot.rulesPath', () => {
  const RULES_PATH = 'Settings > Personalization > Permissions > Custom rules';
  const dot = profileOf('chatgpt-dot');

  it('has the exact text and the record id', () => {
    expect(dot.rulesPath).toEqual({ id: 'profile.chatgpt-dot.rulesPath', line: RULES_PATH });
    expect(dot.rulesPath?.line).toBe(RULES_PATH);
  });

  it('is verbatim from the v2 brief', () => {
    expect(readFileSync(BRIEF_PATH, 'utf8')).toContain(RULES_PATH);
  });

  it('is a trace id, so the caption traces to a library record', () => {
    expect(libraryIds(library).has('profile.chatgpt-dot.rulesPath')).toBe(true);
  });

  it('is on chatgpt-dot and no other profile', () => {
    for (const p of library.targets.profiles) {
      if (p.id === 'chatgpt-dot') {
        expect(p.rulesPath).toBeDefined();
      } else {
        expect(p.rulesPath, p.id).toBeUndefined();
      }
    }
  });

  it('has no em dash', () => {
    expect(RULES_PATH).not.toContain(String.fromCharCode(0x2014));
    expect(dot.rulesPath?.line ?? '').not.toContain(String.fromCharCode(0x2014));
  });
});
