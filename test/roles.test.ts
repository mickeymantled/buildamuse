// Roles test: Part D of docs/Build-a-Bot-v2-Brief.md (roles), section 9 of docs/V2-DESIGN.md and
// the QUESTIONS.md decisions B1 (length tiers on small caps) and B2 (gpt mode deprecated).
// Every expectation comes from the brief text, the design, the QUESTIONS decisions or the library
// JSON records (role sets, roles, stat lines, gates, chassis, profile templates). Nothing here is
// copied from compiler output.
//
// Three groups:
//   1. Library facts: one coordinator per set, canDelegate flags, never-list sizes, locked stats,
//      no executor by default, and the documented fallback for profiles without role support.
//   2. Compiled role sets: every member of every set compiled on openclaw, hermes and grok (caps of
//      4,000 or less, so the B1 tiers apply) and on chatgpt-project and chatgpt-gpt (cap 8,000,
//      full rules). The gpt mode is hidden and deprecated (B2) but stays in the compiler, so its
//      role souls are still checked. On grok, chatgpt-project and chatgpt-gpt the fallback.roles
//      line is an install step that shows roles, not a note (QUESTIONS W33). Then the fallback
//      notes on muse, chatgpt-dot and chatgpt-instructions.
//   3. Length tiers on role souls (B1): Tier A cuts the author's pack rules lines, Tier B switches
//      the chassis to short forms, chassis lines are never dropped, AGENTS.md keeps every rules
//      line, and role souls on gpt or project keep the full rules.
//
// Starters: the library roster has no starter whose migrated packs fit the research set, so the
// research cases use Sol with packs set to ['research']. Trading uses Marty (memecoins), coding
// uses Rook (coding), personal-ops uses June (personal-ops). One extra trading case gives Marty
// three packs, perps among them, so Brian's pack.perps.rule.1 is on a soul that gets cut.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { compile, library } from '../src/compiler/compile.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import type { GoldenSpec } from '../tools/golden.js';
import { evalWhen } from '../src/compiler/cond.js';
import { resolveProfile } from '../src/compiler/profile.js';
import { effectiveGates, effectiveLimits } from '../src/compiler/gates.js';
import { normalizeRoles } from '../src/compiler/passes/roles.js';
import type {
  Build,
  BundleFile,
  ChassisLine,
  ChatgptMode,
  CompileResult,
  Level,
  Plan,
  Profile,
  RolePack,
  RoleSet,
  StatId,
  TargetId,
} from '../src/compiler/types.js';

// ---------------------------------------------------------------------------------------------
// The brief, verbatim as data.

// "Trading: scout, analyst, risk-manager (coordinator), executor, journal. Coding: planner
// (coordinator), implementer, reviewer, tester, debugger, release-manager. Research: lead
// (coordinator), searcher, synthesizer, fact-checker, writer. Personal ops: chief-of-staff
// (coordinator), triager, scheduler, drafter."
const BRIEF_SETS: Record<string, { coordinator: string; members: string[] }> = {
  trading: {
    coordinator: 'risk-manager',
    members: ['scout', 'analyst', 'risk-manager', 'executor', 'journal'],
  },
  coding: {
    coordinator: 'planner',
    members: ['planner', 'implementer', 'reviewer', 'tester', 'debugger', 'release-manager'],
  },
  research: {
    coordinator: 'lead',
    members: ['lead', 'searcher', 'synthesizer', 'fact-checker', 'writer'],
  },
  'personal-ops': {
    coordinator: 'chief-of-staff',
    members: ['chief-of-staff', 'triager', 'scheduler', 'drafter'],
  },
};

// "risk-manager and reviewer lock blunt=4, warm=1. drafter and executor lock proactive=1."
const BRIEF_LOCKS: Record<string, Partial<Record<StatId, Level>>> = {
  'risk-manager': { blunt: 4, warm: 1 },
  reviewer: { blunt: 4, warm: 1 },
  drafter: { proactive: 1 },
  executor: { proactive: 1 },
};

// "reviewer and fact-checker emit 'You did not produce this and have no stake in it passing' and
// 'Never fix it yourself.'"
const NO_STAKE = 'You did not produce this and have no stake in it passing';
const NO_FIX = 'Never fix it yourself.';
const AUDIT_ROLES = ['reviewer', 'fact-checker'];

// "all others canDelegate=false and emit 'Report to <coordinator>. Never delegate.'"
const DELEGATE_TEMPLATE = 'Report to {coordinator}. Never delegate.';

// V2-DESIGN section 9 and the Brief Part C profile table: what each profile does with a role set.
const ROLE_SUPPORT: Record<string, { supportsRoles: boolean; fallback: string }> = {
  muse: { supportsRoles: false, fallback: 'none' },
  openclaw: { supportsRoles: true, fallback: 'workspaces' },
  hermes: { supportsRoles: true, fallback: 'profiles' },
  grok: { supportsRoles: true, fallback: 'team' },
  'chatgpt-dot': { supportsRoles: false, fallback: 'single-dot-note' },
  'chatgpt-gpt': { supportsRoles: false, fallback: 'separate-bundles' },
  'chatgpt-instructions': { supportsRoles: false, fallback: 'none' },
  'chatgpt-project': { supportsRoles: false, fallback: 'separate-bundles' },
};

const MIN_LINES = 40;
const MAX_LINES = 120;

// ---------------------------------------------------------------------------------------------
// Library helpers.

function roleOf(id: string): RolePack {
  const role = library.roles.find((r) => r.id === id);
  if (!role) {
    throw new Error(`test setup: no role ${id} in the library`);
  }
  return role;
}

function setOf(id: string): RoleSet {
  const set = library.roleSets.find((s) => s.id === id);
  if (!set) {
    throw new Error(`test setup: no role set ${id} in the library`);
  }
  return set;
}

function statLine(stat: StatId, level: Level): string {
  const record = library.stats.find((s) => s.stat === stat && s.level === level);
  if (!record) {
    throw new Error(`test setup: no stat line for ${stat} ${level}`);
  }
  return record.line;
}

function gateRulesLine(gateId: string, setting: 'approve' | 'forbid'): string {
  const gate = library.gates.find((g) => g.id === gateId);
  if (!gate) {
    throw new Error(`test setup: no gate ${gateId} in the library`);
  }
  return gate.rulesLine[setting];
}

// The delegate line a non-coordinator carries, from the set's template and the coordinator's label.
function delegateLine(set: RoleSet): string {
  return set.templates.delegate.line.replaceAll('{coordinator}', roleOf(set.coordinator).label);
}

// Rules-layer lines for every gate whose effective setting is approve or forbid.
function gateRuleLines(build: Build): string[] {
  const lines: string[] = [];
  for (const [id, setting] of Object.entries(effectiveGates(build, library))) {
    if (setting === 'approve' || setting === 'forbid') {
      lines.push(gateRulesLine(id, setting));
    }
  }
  return lines;
}

// V2-DESIGN section 7: the rules block is, in order, the gate rules lines, then one limit line per
// effective limit (library rulesTemplate with {value} filled), then each selected pack's rulesLines.
function limitLine(limitId: string, value: number): string {
  const limit = library.limits.find((l) => l.id === limitId);
  if (!limit) {
    throw new Error(`test setup: no limit ${limitId} in the library`);
  }
  return limit.rulesTemplate.replaceAll('{value}', String(value));
}

function limitRuleLines(build: Build): string[] {
  return Object.entries(effectiveLimits(build, library)).map(([id, value]) => limitLine(id, value));
}

// One pack rules line with its library id. 'brief' marks Brian's own text (origin 'brief'); every
// other pack rules line is the author's (B1: only pack.perps.rule.1 is Brian's).
interface RuleEntry {
  id: string;
  line: string;
  brief: boolean;
}

function packRuleEntries(build: Build): RuleEntry[] {
  return build.packs.flatMap((id) => {
    const pack = library.packs.find((p) => p.id === id);
    if (!pack) {
      throw new Error(`test setup: no pack ${id} in the library`);
    }
    return pack.rulesLines.map((l) => ({ id: l.id, line: l.line, brief: l.origin === 'brief' }));
  });
}

// The pack rules lines a soul should carry: all of them, less the ids B1 Tier A cut from it.
function packRuleLines(build: Build, cut: ReadonlySet<string> = new Set()): string[] {
  return packRuleEntries(build)
    .filter((e) => !cut.has(e.id))
    .map((e) => e.line);
}

function rulesBlock(build: Build, cut: ReadonlySet<string> = new Set()): string[] {
  return [...gateRuleLines(build), ...limitRuleLines(build), ...packRuleLines(build, cut)];
}

// A role's own never line can repeat a rules line word for word (the implementer's never line and
// the coding pack's test rule are one sentence), so one copy of that text proves nothing about the
// rules block. The block copy is the one on top of the role's own.
function copiesNeeded(line: string, role: RolePack): number {
  return 1 + neverCopies(line, role);
}

// How many of the role's own never lines are exactly this text.
function neverCopies(line: string, role: RolePack): number {
  return role.never.filter((n) => n.line === line).length;
}

function expectLines(container: string, lines: string[], role: RolePack, who: string): void {
  for (const line of lines) {
    expect(occurrences(container, line), `${who}: ${line}`).toBeGreaterThanOrEqual(copiesNeeded(line, role));
  }
}

// Asserts every rules block line is in the container, and that the rules block copies run in block
// order. The last copy of a line is the block copy, because the rules block sits after the role's
// never lines in every layout. `cut` is the set of pack rules ids B1 Tier A removed from this
// container; those lines are not expected.
function expectRulesBlock(
  container: string,
  build: Build,
  role: RolePack,
  who: string,
  cut: ReadonlySet<string> = new Set(),
): void {
  expectLines(container, rulesBlock(build, cut), role, who);
  let from = -1;
  for (const line of rulesBlock(build, cut)) {
    const at = container.lastIndexOf(line);
    expect(at, `${who} has this line out of block order: ${line}`).toBeGreaterThan(from);
    from = at;
  }
}

// The lines under one markdown heading line, up to the next heading.
function sectionUnder(content: string, headingLine: string): string {
  const lines = content.split('\n');
  const start = lines.indexOf(headingLine);
  if (start < 0) {
    return '';
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6} /.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

// Every profile's fallback.none line, and every profile's fallback.roles template. A compiled note
// that equals or matches one of these is a fallback note, whichever profile the template came from.
function fallbackNoneLines(): string[] {
  const lines = library.targets.profiles.flatMap((p) =>
    Object.hasOwn(p.templates, 'fallback.none') ? [p.templates['fallback.none'].line] : [],
  );
  expect(lines.length, 'library has fallback.none lines to compare against').toBeGreaterThan(0);
  return lines;
}

function fallbackRolesTemplates(): string[] {
  const templates = library.targets.profiles.flatMap((p) =>
    Object.hasOwn(p.templates, 'fallback.roles') ? [p.templates['fallback.roles'].line] : [],
  );
  expect(templates.length, 'library has fallback.roles templates to compare against').toBeGreaterThan(0);
  return templates;
}

// ---------------------------------------------------------------------------------------------
// Compile helpers.

interface SetCase {
  setId: string;
  starter: string;
  packs?: string[]; // overrides the packs the starter's chips derive
  label?: string; // names a case that shares a set and a starter with another
}

const CASES: SetCase[] = [
  { setId: 'trading', starter: 'marty' },
  { setId: 'coding', starter: 'rook' },
  { setId: 'research', starter: 'sol', packs: ['research'] },
  { setId: 'personal-ops', starter: 'june' },
];

interface ProfileCase {
  id: string; // profile id
  target: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
  kind: 'openclaw' | 'hermes' | 'paste';
}

// B1: the length tiers apply to a profile whose cap is this or less.
const TIER_CAP = 4000;

// A profile that delivers one soul per role, with the cap B1 and the brief set for it.
interface SoulProfileCase extends ProfileCase {
  cap: number;
}

// The profiles that deliver one soul per role. Caps (B1): OpenClaw 3,600, Hermes 4,000, Grok 4,000;
// the gpt and project souls sit under 8,000. gpt is hidden and deprecated (B2) and stays here
// because the compiler still builds it.
const SOUL_PROFILES: SoulProfileCase[] = [
  { id: 'openclaw', target: 'openclaw', kind: 'openclaw', cap: 3600 },
  { id: 'hermes', target: 'hermes', kind: 'hermes', cap: 4000 },
  { id: 'chatgpt-gpt', target: 'chatgpt', mode: 'gpt', kind: 'paste', cap: 8000 },
  { id: 'grok', target: 'grok', kind: 'paste', cap: 4000 },
  { id: 'chatgpt-project', target: 'chatgpt', mode: 'project', kind: 'paste', cap: 8000 },
];

// The profiles that give a note instead of role souls.
const FALLBACK_PROFILES: ProfileCase[] = [
  { id: 'muse', target: 'muse', kind: 'paste' },
  { id: 'chatgpt-dot', target: 'chatgpt', mode: 'dot', kind: 'paste' },
  { id: 'chatgpt-instructions', target: 'chatgpt', mode: 'instructions', plan: 'free', kind: 'paste' },
];

function buildOn(c: SetCase, pc: ProfileCase, roles: string[]): Build {
  const spec: GoldenSpec = {
    id: `roles-test.${c.setId}.${pc.id}`,
    starter: c.starter,
    target: pc.target,
    ...(pc.mode !== undefined ? { mode: pc.mode } : {}),
    ...(pc.plan !== undefined ? { plan: pc.plan } : {}),
    roles,
  };
  const build = buildFor(spec, library);
  return c.packs ? { ...build, packs: [...c.packs] } : build;
}

function allMembers(c: SetCase): string[] {
  return [...setOf(c.setId).members];
}

function withoutRoles(build: Build): Build {
  const copy: Build = { ...build };
  delete copy.roles;
  return copy;
}

// Compile lazily so a throw shows up inside the test that needs it, not at collection time.
function lazy<T>(make: () => T): () => T {
  let value: T | undefined;
  let made = false;
  return () => {
    if (!made) {
      value = make();
      made = true;
    }
    return value as T;
  };
}

// Whether a bundle file is the soul delivered for this role on this profile.
function isSoulOf(file: BundleFile, pc: ProfileCase, role: RolePack): boolean {
  switch (pc.kind) {
    case 'openclaw':
      return file.path === `workspace-${role.id}/SOUL.md`;
    case 'hermes':
      return file.path === `profiles/${role.id}/SOUL.md`;
    case 'paste':
      return file.delivery === 'paste' && file.path.endsWith(`(${role.label})`);
  }
}

function soulFilesOf(result: CompileResult, pc: ProfileCase, role: RolePack): BundleFile[] {
  return result.files.filter((f) => isSoulOf(f, pc, role));
}

function soulFileOf(result: CompileResult, pc: ProfileCase, role: RolePack): BundleFile | undefined {
  return soulFilesOf(result, pc, role)[0];
}

function lineCount(content: string): number {
  return content.replace(/\n+$/, '').split('\n').length;
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// ---------------------------------------------------------------------------------------------
// B1 tier helpers. The role warnings read "roles: cut <id> (...) in <path>" for Tier A and
// "roles: chassis switched to short forms (...) in <path>" for Tier B, one set per delivered file.

const CUT_PREFIX = 'roles: cut ';
const SHORT_PREFIX = 'roles: chassis switched to short forms';

function warningsFor(result: CompileResult, path: string, prefix: string): string[] {
  return result.warnings.filter((w) => w.startsWith(prefix) && w.endsWith(` in ${path}`));
}

// The pack rules ids the compile reports as cut from the soul at this path.
function cutIdsFrom(result: CompileResult, path: string): string[] {
  return warningsFor(result, path, CUT_PREFIX).map((w) => w.slice(CUT_PREFIX.length).split(' ')[0]);
}

function cutSetFrom(result: CompileResult, path: string): Set<string> {
  return new Set(cutIdsFrom(result, path));
}

// What one chassis line reads as on a profile, in the full or the short form. A null profile
// variant omits the line. Short form (B1, V29): the profile's own short text wins; else the
// generic short text, unless the profile has its own worded variant, which wins over the generic
// short form; else the variant, else the library line.
function chassisText(profile: Profile, line: ChassisLine, form: 'full' | 'short'): string | null {
  const variant = Object.hasOwn(profile.chassisVariants, line.id) ? profile.chassisVariants[line.id] : undefined;
  if (variant === null) {
    return null;
  }
  if (form === 'short') {
    const shorts = profile.chassisShortVariants;
    if (shorts !== undefined && Object.hasOwn(shorts, line.id)) {
      return shorts[line.id];
    }
    if (line.short !== undefined && typeof variant !== 'string') {
      return line.short;
    }
  }
  return typeof variant === 'string' ? variant : line.line;
}

interface ChassisExpectation {
  id: string;
  full: string; // the line in full form on this profile
  short: string; // the line in short form on this profile
}

// Every chassis line a role soul on this profile must carry: its `when` holds for the build and the
// profile does not omit it. Chassis lines are never dropped (B1), so this list holds in either form.
function chassisExpected(profile: Profile, build: Build): ChassisExpectation[] {
  return library.chassis.lines
    .filter((line) => evalWhen(line.when, build, library.chips))
    .flatMap((line) => {
      const full = chassisText(profile, line, 'full');
      const short = chassisText(profile, line, 'short');
      return full === null || short === null ? [] : [{ id: line.id, full, short }];
    });
}

// Characters the short forms save in one soul: the two forms differ only in the line's text.
function shortSavings(expected: ChassisExpectation[]): number {
  return expected.reduce((n, c) => n + (c.full.length - c.short.length), 0);
}

// A rules bullet is "- " plus the text plus one newline between it and the next line.
function bulletSize(line: string): number {
  return line.length + 3;
}

// The notes that match a fallback template, with {roles} as a wildcard.
function notesMatching(template: string, notes: string[]): string[] {
  if (!template.includes('{roles}')) {
    return notes.filter((n) => n === template);
  }
  const [head, tail] = template.split('{roles}');
  return notes.filter((n) => n.length >= head.length + tail.length && n.startsWith(head) && n.endsWith(tail));
}

// The verify lines a profile shows only when the build picked roles (QUESTIONS W32 Q3: on a verify
// line, "roles" means the build picked roles, whether or not the profile delivers them). They are
// the one kind of note a team adds besides the profile's fallback line.
function roleOnlyVerifyLines(profileId: string): string[] {
  return (library.targets.profiles.find((p) => p.id === profileId)?.verify ?? [])
    .filter((v) => (v.when ?? []).includes('roles'))
    .map((v) => v.line);
}

function wildcardOf(template: string, note: string): string {
  const [head, tail] = template.split('{roles}');
  return note.slice(head.length, note.length - tail.length);
}

// The level a role's soul carries for one stat (V2-DESIGN section 9): the lock, else the role's own
// default (blunt, proactive), else the build's stat.
function expectedLevel(role: RolePack, stat: Exclude<StatId, 'risk'>, build: Build): Level {
  const locked = role.lockedStats?.[stat];
  if (locked !== undefined) {
    return locked;
  }
  if (stat === 'blunt') {
    return role.bluntDefault;
  }
  if (stat === 'proactive') {
    return role.proactiveDefault;
  }
  return build.stats[stat];
}

const TALK_STATS = ['blunt', 'warm', 'funny', 'chatty', 'proactive'] as const;

// ---------------------------------------------------------------------------------------------
// 1. Library facts.

describe('Role library: sets', () => {
  it('has exactly the four role sets of the brief', () => {
    expect(library.roleSets.map((s) => s.id).sort()).toEqual(Object.keys(BRIEF_SETS).sort());
  });

  for (const [setId, brief] of Object.entries(BRIEF_SETS)) {
    describe(`${setId} set`, () => {
      it('has the brief members and coordinator', () => {
        const set = setOf(setId);
        expect([...set.members].sort()).toEqual([...brief.members].sort());
        expect(set.coordinator).toBe(brief.coordinator);
        expect(set.members).toContain(set.coordinator);
      });

      it('every member is a library role that points back at this set', () => {
        const set = setOf(setId);
        for (const id of set.members) {
          const role = library.roles.find((r) => r.id === id);
          expect(role, `role ${id} exists`).toBeDefined();
          expect(role?.set, `role ${id} set`).toBe(setId);
        }
      });

      it('exactly one role has canDelegate true, and it is the coordinator', () => {
        const set = setOf(setId);
        const delegating = set.members.map(roleOf).filter((r) => r.canDelegate === true);
        expect(delegating.map((r) => r.id)).toEqual([set.coordinator]);
      });

      it('every other role has canDelegate false', () => {
        const set = setOf(setId);
        for (const id of set.members) {
          if (id !== set.coordinator) {
            expect(roleOf(id).canDelegate, `${id}.canDelegate`).toBe(false);
          }
        }
      });

      it('the delegate template reads "Report to {coordinator}. Never delegate."', () => {
        expect(setOf(setId).templates.delegate.line).toBe(DELEGATE_TEMPLATE);
      });

      it('the no-stake template carries the brief line and the no-fix template is exact', () => {
        const set = setOf(setId);
        expect(set.templates.noStake.line).toContain(NO_STAKE);
        expect(set.templates.noFix.line).toBe(NO_FIX);
      });

      it('defaultMembers is a subset of members and includes the coordinator', () => {
        const set = setOf(setId);
        for (const id of set.defaultMembers) {
          expect(set.members, `default member ${id}`).toContain(id);
        }
        expect(set.defaultMembers).toContain(set.coordinator);
      });
    });
  }

  it('every library role belongs to exactly one set (no orphans, no repeats)', () => {
    const listed = library.roleSets.flatMap((s) => s.members);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(library.roles.map((r) => r.id).sort());
  });

  it('the trading set never includes executor by default', () => {
    const trading = setOf('trading');
    expect(trading.members).toContain('executor');
    expect(trading.defaultMembers).not.toContain('executor');
  });
});

describe('Role library: roles', () => {
  it('every role has 3 to 6 never lines, none empty', () => {
    for (const role of library.roles) {
      expect(role.never.length, `${role.id} never count`).toBeGreaterThanOrEqual(3);
      expect(role.never.length, `${role.id} never count`).toBeLessThanOrEqual(6);
      for (const line of role.never) {
        expect(line.line.trim().length, `${line.id} text`).toBeGreaterThan(0);
      }
    }
  });

  it('locked stats are exactly risk-manager and reviewer { blunt 4, warm 1 }, drafter and executor { proactive 1 }', () => {
    const locked: Record<string, unknown> = {};
    for (const role of library.roles) {
      if (role.lockedStats !== undefined && Object.keys(role.lockedStats).length > 0) {
        locked[role.id] = role.lockedStats;
      }
    }
    expect(locked).toEqual(BRIEF_LOCKS);
  });

  it('every role id is unique', () => {
    const ids = library.roles.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Role library: pack defaults', () => {
  it('no pack default role set includes executor', () => {
    for (const pack of library.packs) {
      expect(pack.defaultRoles, `${pack.id} defaultRoles`).not.toContain('executor');
    }
  });

  it('every pack default role is a library role, unique, and from the one set that lists the pack', () => {
    for (const pack of library.packs) {
      const owners = library.roleSets.filter((s) => s.packs.includes(pack.id));
      expect(owners.length, `${pack.id} is listed by exactly one role set`).toBe(1);
      const set = owners[0];
      expect(new Set(pack.defaultRoles).size, `${pack.id} defaultRoles unique`).toBe(
        pack.defaultRoles.length,
      );
      for (const id of pack.defaultRoles) {
        expect(set.members, `${pack.id} default role ${id}`).toContain(id);
      }
    }
  });

  for (const pack of library.packs.filter((p) => p.defaultRoles.length > 0)) {
    it(`pack ${pack.id}: its default roles compile with no executor and the coordinator added`, () => {
      const set = library.roleSets.find((s) => s.packs.includes(pack.id));
      expect(set).toBeDefined();
      const entry = library.roster[0];
      const build: Build = {
        ...buildFor({ id: 'roles-test.pack-default', starter: entry.id, target: 'openclaw' }, library),
        packs: [pack.id],
        roles: [...pack.defaultRoles],
      };
      const result = compile(build);
      expect(result.roles).not.toContain('executor');
      expect(result.roles).toContain(set?.coordinator);
      expect(result.files.some((f) => f.path === 'workspace-executor/SOUL.md')).toBe(false);
    });
  }
});

describe('Role library: profiles without role support', () => {
  it('every profile has the documented role support and fallback', () => {
    expect(library.targets.profiles.map((p) => p.id).sort()).toEqual(Object.keys(ROLE_SUPPORT).sort());
    for (const profile of library.targets.profiles) {
      const expected = ROLE_SUPPORT[profile.id];
      expect(profile.supportsRoles, `${profile.id}.supportsRoles`).toBe(expected.supportsRoles);
      expect(profile.roleFallback, `${profile.id}.roleFallback`).toBe(expected.fallback);
    }
  });

  it('muse and chatgpt-instructions carry a fallback.none template', () => {
    for (const id of ['muse', 'chatgpt-instructions']) {
      const profile = library.targets.profiles.find((p) => p.id === id);
      const template = profile?.templates['fallback.none'];
      expect(template, `${id} fallback.none`).toBeDefined();
      expect(template?.line.trim().length).toBeGreaterThan(0);
    }
  });

  it('chatgpt-dot, chatgpt-gpt, chatgpt-project and grok carry a fallback.roles template with {roles}', () => {
    for (const id of ['chatgpt-dot', 'chatgpt-gpt', 'chatgpt-project', 'grok']) {
      const profile = library.targets.profiles.find((p) => p.id === id);
      const template = profile?.templates['fallback.roles'];
      expect(template, `${id} fallback.roles`).toBeDefined();
      expect(template?.line).toContain('{roles}');
    }
  });

  it('the GPT fallback says the roles are separate GPT bundles with a manual hand-off', () => {
    const gpt = library.targets.profiles.find((p) => p.id === 'chatgpt-gpt');
    const line = gpt?.templates['fallback.roles'].line ?? '';
    expect(line).toContain('separate GPT');
    expect(line.toLowerCase()).toContain('manual');
  });

  it('the dot fallback says dots run one agent', () => {
    const dot = library.targets.profiles.find((p) => p.id === 'chatgpt-dot');
    const line = dot?.templates['fallback.roles'].line ?? '';
    expect(line).toContain('one agent');
  });

  // W33: a profile that ships role files with no install step that shows roles gets its
  // fallback.roles line as the step that shows them. This pins which profiles those are, from the
  // library, so the compiled checks below cannot quietly skip one.
  it('the profiles with role files and no roles install step are grok, chatgpt-gpt and chatgpt-project', () => {
    const promoted = library.targets.profiles
      .filter(
        (p) =>
          (p.roleFallback === 'team' || p.roleFallback === 'separate-bundles') &&
          !p.installSteps.some((s) => (s.shows ?? []).includes('roles')),
      )
      .map((p) => p.id)
      .sort();
    expect(promoted).toEqual(['chatgpt-gpt', 'chatgpt-project', 'grok']);
    for (const id of promoted) {
      expect(library.targets.profiles.find((p) => p.id === id)?.templates['fallback.roles'], id).toBeDefined();
    }
  });

  it('openclaw and hermes already have a roles install step, so no fallback.roles line is promoted there', () => {
    for (const id of ['openclaw', 'hermes']) {
      const profile = library.targets.profiles.find((p) => p.id === id);
      expect(profile?.installSteps.some((s) => (s.shows ?? []).includes('roles')), id).toBe(true);
      expect(profile?.templates['fallback.roles'], id).toBeUndefined();
    }
  });

  it('the profiles that emit no role files (muse, chatgpt-dot, chatgpt-instructions) have no roles install step', () => {
    for (const id of ['muse', 'chatgpt-dot', 'chatgpt-instructions']) {
      const profile = library.targets.profiles.find((p) => p.id === id);
      expect(profile?.installSteps.some((s) => (s.shows ?? []).includes('roles')), id).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// normalizeRoles.

describe('normalizeRoles', () => {
  const marty = (roles?: string[]): Build => {
    const build = buildFor({ id: 'roles-test.normalize', starter: 'marty', target: 'openclaw' }, library);
    return roles === undefined ? withoutRoles(build) : { ...build, roles };
  };

  it('returns [] when the build has no roles or an empty list', () => {
    expect(normalizeRoles(marty(), library)).toEqual([]);
    expect(normalizeRoles(marty([]), library)).toEqual([]);
  });

  it('adds the coordinator when it is missing, in set member order', () => {
    const out = normalizeRoles(marty(['scout']), library).map((r) => r.id);
    expect(out).toEqual(['scout', 'risk-manager']);
  });

  it('adds the coordinator for a lone coordinator-less role in every set', () => {
    for (const [setId, brief] of Object.entries(BRIEF_SETS)) {
      const lone = brief.members.find((id) => id !== brief.coordinator) as string;
      const build = { ...marty(), roles: [lone] };
      const out = normalizeRoles(build, library).map((r) => r.id);
      expect(out, `${setId}: ${lone} alone`).toContain(brief.coordinator);
      expect(out, `${setId}: ${lone} alone`).toContain(lone);
      expect(out.length, `${setId}: ${lone} alone`).toBe(2);
    }
  });

  it('does not duplicate the coordinator when it is already present', () => {
    const out = normalizeRoles(marty(['risk-manager', 'scout']), library).map((r) => r.id);
    expect(out).toEqual(['scout', 'risk-manager']);
  });

  it('orders by the set members, not by the order picked', () => {
    const out = normalizeRoles(marty(['journal', 'scout']), library).map((r) => r.id);
    expect(out).toEqual(['scout', 'risk-manager', 'journal']);
  });

  it('always yields exactly one coordinator, canDelegate true, for any non-empty pick in any set', () => {
    for (const brief of Object.values(BRIEF_SETS)) {
      for (const id of brief.members) {
        const out = normalizeRoles({ ...marty(), roles: [id] }, library);
        expect(out.filter((r) => r.canDelegate).map((r) => r.id)).toEqual([brief.coordinator]);
      }
    }
  });

  it('keeps every member when all are picked', () => {
    for (const brief of Object.values(BRIEF_SETS)) {
      const out = normalizeRoles({ ...marty(), roles: [...brief.members].reverse() }, library);
      expect(out.map((r) => r.id)).toEqual(brief.members);
    }
  });

  it('does not mutate the build', () => {
    const build = marty(['journal', 'scout']);
    const snapshot = JSON.stringify(build);
    normalizeRoles(build, library);
    expect(JSON.stringify(build)).toBe(snapshot);
  });

  it('compile reports the added coordinator and compiles its soul, but not roles nobody picked', () => {
    const result = compile(marty(['scout']));
    expect(result.roles).toEqual(['scout', 'risk-manager']);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('workspace-scout/SOUL.md');
    expect(paths).toContain('workspace-risk-manager/SOUL.md');
    expect(paths).not.toContain('workspace-analyst/SOUL.md');
    expect(paths).not.toContain('workspace-executor/SOUL.md');
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Compiled role sets.

for (const c of CASES) {
  const set = setOf(c.setId);
  const members = set.members.map(roleOf);

  describe(`Compiled ${c.setId} set (${c.starter}, all ${members.length} roles)`, () => {
    for (const pc of SOUL_PROFILES) {
      describe(pc.id, () => {
        const build = buildOn(c, pc, allMembers(c));
        const result = lazy(() => compile(build));

        it('compiles every role, in set member order, coordinator included', () => {
          expect(result().roles).toEqual(set.members);
        });

        it('delivers one soul file per role', () => {
          for (const role of members) {
            expect(soulFilesOf(result(), pc, role).length, `${role.id} soul file`).toBe(1);
          }
        });

        it('keeps the main personality file next to the role souls', () => {
          const main = result().files.find((f) => f.label === 'Personality');
          expect(main).toBeDefined();
          expect(main?.content.length ?? 0).toBeGreaterThan(0);
        });

        for (const role of members) {
          describe(`${role.id} soul`, () => {
            const isCoordinator = role.id === set.coordinator;
            const isAuditor = AUDIT_ROLES.includes(role.id);
            const soul = (): string => {
              const file = soulFileOf(result(), pc, role);
              expect(file, `${role.id} soul file on ${pc.id}`).toBeDefined();
              return file?.content ?? '';
            };

            it(`has ${MIN_LINES} to ${MAX_LINES} lines`, () => {
              const n = lineCount(soul());
              expect(n).toBeGreaterThanOrEqual(MIN_LINES);
              expect(n).toBeLessThanOrEqual(MAX_LINES);
            });

            if (isCoordinator) {
              it('is the coordinator: no "Never delegate." line', () => {
                expect(soul()).not.toContain('Never delegate.');
                expect(roleOf(role.id).canDelegate).toBe(true);
              });
            } else {
              it(`carries "${delegateLine(set)}" once`, () => {
                expect(occurrences(soul(), delegateLine(set))).toBe(1);
              });
            }

            if (isAuditor) {
              it('carries the no-stake and no-fix lines', () => {
                expect(soul()).toContain(set.templates.noStake.line);
                expect(soul()).toContain(NO_STAKE);
                expect(soul()).toContain(set.templates.noFix.line);
                expect(soul()).toContain(NO_FIX);
              });
            } else {
              it('does not carry the no-stake or no-fix lines', () => {
                expect(soul()).not.toContain(NO_STAKE);
                expect(soul()).not.toContain(NO_FIX);
              });
            }

            it('carries each of its own never lines', () => {
              for (const line of role.never) {
                expect(soul(), line.id).toContain(line.line);
              }
            });

            it('carries its stat lines: lock, else role default, else the build', () => {
              for (const stat of TALK_STATS) {
                const level = expectedLevel(role, stat, build);
                expect(soul(), `${stat} ${level}`).toContain(statLine(stat, level));
              }
            });

            if (role.id in BRIEF_LOCKS && BRIEF_LOCKS[role.id].blunt !== undefined) {
              it('carries the blunt 4 and warm 1 lines', () => {
                expect(soul()).toContain(statLine('blunt', 4));
                expect(soul()).toContain(statLine('warm', 1));
              });
            }

            if (role.id in BRIEF_LOCKS && BRIEF_LOCKS[role.id].proactive !== undefined) {
              it('carries the proactive 1 line', () => {
                expect(soul()).toContain(statLine('proactive', 1));
              });
            }
          });
        }

        // Where the role soul is the only rules layer a worker loads, it has to carry the whole
        // rules block (V2-DESIGN sections 7 and 9): gate lines, limit lines, pack rules lines. On a
        // cap of 4,000 or less (B1 Tier A) the author's pack rules lines may be cut from a soul that
        // is over the cap; the compile says which in its warnings, and group 3 checks that report
        // against the cap. Here the block is every line except the ones reported cut. gpt and project
        // are over 4,000, so nothing is cut there.
        if (pc.kind !== 'openclaw') {
          const soulOf = (role: RolePack): string => {
            const file = soulFileOf(result(), pc, role);
            expect(file, `${role.id} soul file`).toBeDefined();
            return file?.content ?? '';
          };
          const cutOf = (role: RolePack): Set<string> => {
            const file = soulFileOf(result(), pc, role);
            return file ? cutSetFrom(result(), file.path) : new Set();
          };

          it('every role soul restates every approve and forbid gate rules line', () => {
            const lines = gateRuleLines(build);
            expect(lines.length).toBeGreaterThan(0);
            for (const role of members) {
              expectLines(soulOf(role), lines, role, `${role.id} soul`);
            }
          });

          if (limitRuleLines(build).length > 0) {
            it('every role soul restates every effective limit rules line', () => {
              const lines = limitRuleLines(build);
              for (const role of members) {
                expectLines(soulOf(role), lines, role, `${role.id} soul`);
              }
            });
          }

          it('every role soul restates every rules line of the selected packs, less the author lines Tier A cut (B1)', () => {
            expect(packRuleLines(build).length).toBeGreaterThan(0);
            for (const role of members) {
              expectLines(soulOf(role), packRuleLines(build, cutOf(role)), role, `${role.id} soul`);
            }
          });

          it('every role soul carries the rules block in order: gates, limits, pack rules (less Tier A cuts)', () => {
            for (const role of members) {
              expectRulesBlock(soulOf(role), build, role, `${role.id} soul`, cutOf(role));
            }
          });

          if (pc.id === 'grok') {
            // A Bot description has no rules layer but its Never block, which is the rules block.
            it('the Never section of every role description carries the rules block (less Tier A cuts)', () => {
              const heading = library.targets.profiles.find((p) => p.id === 'grok')?.templates['grok.h.never']
                .line as string;
              for (const role of members) {
                const never = sectionUnder(soulOf(role), heading);
                expect(never.length, `${role.id}: Never section under "${heading}"`).toBeGreaterThan(0);
                expectRulesBlock(never, build, role, `${role.id} Never section`, cutOf(role));
              }
            });
          }
        }

        // The compile also delivers the team line where the profile has one. These profiles ship role
        // files and have no install step that shows roles, so (W33) the fallback.roles line is that
        // step: a BundleStep with shows ['roles'], id profile.<pid>.fallback.roles, placed after the
        // other non-closer steps. It is not a note.
        if (pc.kind === 'paste') {
          const profile = library.targets.profiles.find((p) => p.id === pc.id);
          const baseline = lazy(() => compile(withoutRoles(build)));
          const template = profile?.templates['fallback.roles'].line ?? '';
          const templateId = profile?.templates['fallback.roles'].id ?? '';

          it('gives exactly one fallback.roles line, as an install step naming every role', () => {
            const matched = notesMatching(template, result().installSteps);
            expect(matched.length).toBe(1);
            const wildcard = wildcardOf(template, matched[0]);
            for (const role of members) {
              expect(wildcard, role.label).toContain(role.label);
            }
          });

          it('does not give the fallback.roles line as a note', () => {
            expect(notesMatching(template, result().notes)).toEqual([]);
            expect(result().noteItems.filter((n) => n.kind === 'role')).toEqual([]);
            expect(result().noteItems.filter((n) => n.id === templateId)).toEqual([]);
          });

          it('the only step the roles add is that fallback.roles step, and the only notes they add are role-only verify lines', () => {
            const added = result().installSteps.filter((s) => !baseline().installSteps.includes(s));
            expect(added).toEqual(notesMatching(template, result().installSteps));
            expect(added.length).toBe(1);
            // W32: Grok verify.1 (group chats) shows once the build picked roles. No other note is added.
            const roleVerify = roleOnlyVerifyLines(pc.id);
            expect(result().notes.filter((n) => !baseline().notes.includes(n))).toEqual(roleVerify);
            expect(result().notes.filter((n) => !roleVerify.includes(n))).toEqual(baseline().notes);
          });

          it('the fallback.roles step has the template id, shows roles, follows the other steps and precedes any closer', () => {
            const steps = result().steps;
            const at = steps.findIndex((s) => s.id === templateId);
            expect(templateId).toBe(`profile.${pc.id}.fallback.roles`);
            expect(at, `${templateId} is a step`).toBeGreaterThanOrEqual(0);
            const step = steps[at];
            expect(step.shows).toEqual(['roles']);
            expect(step.closer).toBe(false);
            expect(notesMatching(template, [step.text])).toEqual([step.text]);
            expect(steps.slice(0, at).every((s) => !s.closer)).toBe(true);
            expect(steps.slice(at + 1).every((s) => s.closer)).toBe(true);
            expect(steps.filter((s) => !s.closer).at(-1)?.id).toBe(templateId);
            // Every other step is the one the same build has with no roles, in the same order.
            expect(steps.filter((s) => s.id !== templateId).map((s) => s.id)).toEqual(
              baseline().steps.map((s) => s.id),
            );
          });

          it('does not give the fallback.none note', () => {
            const none = fallbackNoneLines();
            expect(result().notes.filter((n) => none.includes(n))).toEqual([]);
          });
        }
      });
    }

    // OpenClaw: workspace-<role>/AGENTS.md keeps the role's rules for a worker that loads only it.
    describe('openclaw AGENTS.md per role', () => {
      const pc = SOUL_PROFILES[0];
      const build = buildOn(c, pc, allMembers(c));
      const result = lazy(() => compile(build));

      it('ships one AGENTS.md next to every role SOUL.md', () => {
        const paths = result().files.map((f) => f.path);
        for (const role of members) {
          expect(paths, `${role.id}`).toContain(`workspace-${role.id}/AGENTS.md`);
        }
      });

      for (const role of members) {
        const agents = (): string => {
          const file = result().files.find((f) => f.path === `workspace-${role.id}/AGENTS.md`);
          expect(file, `workspace-${role.id}/AGENTS.md`).toBeDefined();
          return file?.content ?? '';
        };

        it(`${role.id}: contains its never lines`, () => {
          for (const line of role.never) {
            expect(agents(), line.id).toContain(line.line);
          }
        });

        it(`${role.id}: contains every approve and forbid gate rules line`, () => {
          const lines = gateRuleLines(build);
          expect(lines.length).toBeGreaterThan(0);
          expectLines(agents(), lines, role, `workspace-${role.id}/AGENTS.md`);
        });

        if (limitRuleLines(build).length > 0) {
          it(`${role.id}: contains every effective limit rules line`, () => {
            expectLines(agents(), limitRuleLines(build), role, `workspace-${role.id}/AGENTS.md`);
          });
        }

        it(`${role.id}: contains every rules line of the selected packs`, () => {
          const lines = packRuleLines(build);
          expect(lines.length).toBeGreaterThan(0);
          expectLines(agents(), lines, role, `workspace-${role.id}/AGENTS.md`);
        });

        it(`${role.id}: carries the rules block in order, gates then limits then pack rules`, () => {
          expectRulesBlock(agents(), build, role, `workspace-${role.id}/AGENTS.md`);
        });

        if (role.id === set.coordinator) {
          it(`${role.id}: coordinator has no delegate line`, () => {
            expect(agents()).not.toContain('Never delegate.');
          });
        } else {
          it(`${role.id}: carries the delegate line`, () => {
            expect(agents()).toContain(delegateLine(set));
          });
        }

        if (AUDIT_ROLES.includes(role.id)) {
          it(`${role.id}: carries the no-stake and no-fix lines`, () => {
            expect(agents()).toContain(NO_STAKE);
            expect(agents()).toContain(NO_FIX);
          });
        }
      }

      // Only the trading packs carry limit defaults. This keeps the per-role limit checks above
      // from silently not existing.
      if (c.setId === 'trading') {
        it('the trading build has one effective limit per pack limit default, so the limit checks run', () => {
          const defaults = new Set(
            build.packs.flatMap((id) => Object.keys(library.packs.find((p) => p.id === id)?.limitsDefault ?? {})),
          );
          expect(defaults.size).toBeGreaterThan(0);
          expect(limitRuleLines(build).length).toBe(defaults.size);
        });
      }
    });

    // Profiles that cannot run a team.
    for (const pc of FALLBACK_PROFILES) {
      describe(`${pc.id} fallback`, () => {
        const build = buildOn(c, pc, allMembers(c));
        const result = lazy(() => compile(build));
        const profile = (): ReturnType<typeof resolveProfile> => resolveProfile(build, library);
        const baseline = lazy(() => compile(withoutRoles(build)));

        it('emits no role soul files', () => {
          expect(result().files.filter((f) => f.label.startsWith('Role '))).toEqual([]);
          for (const role of members) {
            expect(soulFileOf(result(), pc, role), role.id).toBeUndefined();
          }
        });

        it('adds no files and leaves the personality unchanged compared with no roles', () => {
          expect(result().files.map((f) => f.path)).toEqual(baseline().files.map((f) => f.path));
          expect(result().soul).toBe(baseline().soul);
        });

        // W33: no role files ship here, so no step is promoted and no step shows roles.
        it('adds no install step and no step that shows roles', () => {
          expect(result().steps).toEqual(baseline().steps);
          expect(result().installSteps).toEqual(baseline().installSteps);
          expect(result().steps.some((s) => s.shows.includes('roles'))).toBe(false);
          for (const template of fallbackRolesTemplates()) {
            expect(notesMatching(template, result().installSteps), template).toEqual([]);
          }
        });

        if (pc.id === 'chatgpt-dot') {
          it('gives exactly one fallback.roles note naming every role', () => {
            const template = profile().templates['fallback.roles'].line;
            const matched = notesMatching(template, result().notes);
            expect(matched.length).toBe(1);
            const wildcard = wildcardOf(template, matched[0]);
            for (const role of members) {
              expect(wildcard, role.label).toContain(role.label);
            }
            expect(notesMatching(template, baseline().notes)).toEqual([]);
          });

          it('the only notes the roles add are that fallback.roles note and the role-only verify line', () => {
            const template = profile().templates['fallback.roles'].line;
            // W32 Q3: the dot teams line shows when the build picked roles, though dot delivers none.
            const roleVerify = roleOnlyVerifyLines(pc.id);
            expect(roleVerify.length).toBe(1);
            const added = result().notes.filter((n) => !baseline().notes.includes(n));
            expect(added.filter((n) => !roleVerify.includes(n))).toEqual(notesMatching(template, result().notes));
            expect(added.filter((n) => !roleVerify.includes(n)).length).toBe(1);
            expect(added.filter((n) => roleVerify.includes(n))).toEqual(roleVerify);
          });

          // The dot emits no role files, so the note stays a note (W33).
          it('keeps the fallback.roles line as a note of kind role, with the template id', () => {
            const record = profile().templates['fallback.roles'];
            const items = result().noteItems.filter((n) => n.kind === 'role');
            expect(items.map((n) => n.id)).toEqual([record.id]);
            expect(items.map((n) => n.text)).toEqual(notesMatching(record.line, result().notes));
          });

          it('does not give the fallback.none note', () => {
            const none = fallbackNoneLines();
            expect(result().notes.filter((n) => none.includes(n))).toEqual([]);
          });
        } else {
          it('gives exactly one fallback.none note', () => {
            const template = profile().templates['fallback.none'].line;
            expect(notesMatching(template, result().notes).length).toBe(1);
            expect(notesMatching(template, baseline().notes)).toEqual([]);
          });

          it('the only note the roles add is that fallback.none note', () => {
            const template = profile().templates['fallback.none'].line;
            // Role-only verify lines (none today on this profile) would show too; the helper keeps this exact.
            const roleVerify = roleOnlyVerifyLines(pc.id);
            const added = result().notes.filter((n) => !baseline().notes.includes(n) && !roleVerify.includes(n));
            expect(added).toEqual(notesMatching(template, result().notes));
            expect(added.length).toBe(1);
          });

          it('does not give a fallback.roles note', () => {
            for (const template of fallbackRolesTemplates()) {
              expect(notesMatching(template, result().notes), template).toEqual([]);
            }
          });
        }
      });
    }
  });
}

describe('Compiled role sets: instructions on the paid plan also gives the fallback.none note', () => {
  const c = CASES[0];
  const pc: ProfileCase = { id: 'chatgpt-instructions', target: 'chatgpt', mode: 'instructions', plan: 'paid', kind: 'paste' };
  const build = buildOn(c, pc, allMembers(c));
  it('one fallback.none note, no role files', () => {
    const result = compile(build);
    const template = resolveProfile(build, library).templates['fallback.none'].line;
    expect(notesMatching(template, result.notes).length).toBe(1);
    expect(result.files.filter((f) => f.label.startsWith('Role '))).toEqual([]);
  });

  it('gives no fallback.roles note', () => {
    const result = compile(build);
    for (const template of fallbackRolesTemplates()) {
      expect(notesMatching(template, result.notes), template).toEqual([]);
    }
  });

  it('gives no fallback.roles step and no step that shows roles', () => {
    const result = compile(build);
    for (const template of fallbackRolesTemplates()) {
      expect(notesMatching(template, result.installSteps), template).toEqual([]);
    }
    expect(result.steps.some((s) => s.shows.includes('roles'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Length tiers on role souls (B1, QUESTIONS.md).
//
// On a profile whose cap is 4,000 or less (openclaw 3,600, hermes 4,000, grok 4,000) every role soul
// goes through two tiers, in this order, and only while it is over the cap:
//   Tier A: cut the author's pack rules lines from the soul. That is every pack rules line except
//           Brian's (origin 'brief'), which is pack.perps.rule.1. Warning per line:
//           "roles: cut <id> ... in <path>".
//   Tier B: if the soul is still over the cap and the chassis is in full form, switch the chassis
//           lines to their short forms, keeping Tier A's cuts. Warning:
//           "roles: chassis switched to short forms ... in <path>".
// Chassis lines are never dropped, in either form. The role's AGENTS.md (openclaw) is not capped and
// keeps every rules line. Role souls on gpt and project (cap 8,000) keep the full rules and chassis.
//
// The size checks below are arithmetic on the delivered soul: a rules bullet is "- " plus the text
// plus a newline, and a short form saves the length difference between the two chassis texts.
// Whether a tier ran is read from the compile's warnings; the checks prove the warnings agree with
// the cap, the soul text and the library.

// The CASES plus Marty with three trading packs. Memecoins, perps and prediction markets together
// carry enough author pack rules lines to push a hermes or grok role soul over 4,000, and perps
// brings Brian's own pack.perps.rule.1, which a cut must leave alone.
const TIER_CASES: SetCase[] = [
  ...CASES,
  {
    setId: 'trading',
    starter: 'marty',
    packs: ['memecoins', 'perps', 'prediction-markets'],
    label: 'trading, three packs with perps',
  },
];

function tierLabel(c: SetCase): string {
  return c.label ?? `${c.setId} (${c.starter})`;
}

const tierCompiles = new Map<string, { build: Build; result: CompileResult }>();

// One compile per case and profile, shared by the checks and the coverage guard.
function tierCompile(c: SetCase, pc: ProfileCase): { build: Build; result: CompileResult } {
  const key = `${tierLabel(c)}|${pc.id}`;
  let found = tierCompiles.get(key);
  if (!found) {
    const build = buildOn(c, pc, allMembers(c));
    found = { build, result: compile(build) };
    tierCompiles.set(key, found);
  }
  return found;
}

describe('Role soul length tiers: what the tiers rest on', () => {
  it('the role-capable profiles have the B1 caps, and the tiers reach openclaw, hermes and grok only', () => {
    for (const pc of SOUL_PROFILES) {
      const profile = library.targets.profiles.find((p) => p.id === pc.id);
      expect(profile?.lengthCap, `${pc.id} cap`).toBe(pc.cap);
    }
    expect(SOUL_PROFILES.filter((pc) => pc.cap <= TIER_CAP).map((pc) => pc.id)).toEqual([
      'openclaw',
      'hermes',
      'grok',
    ]);
  });

  it("Brian's pack.perps.rule.1 is the only pack rules line with origin brief", () => {
    const brief = library.packs.flatMap((p) => p.rulesLines).filter((l) => l.origin === 'brief');
    expect(brief.map((l) => l.id)).toEqual(['pack.perps.rule.1']);
  });

  it('the three-pack trading case carries perps and an author line for Tier A to cut', () => {
    const entries = packRuleEntries(buildOn(TIER_CASES[TIER_CASES.length - 1], SOUL_PROFILES[1], []));
    expect(entries.filter((e) => e.brief).map((e) => e.id)).toEqual(['pack.perps.rule.1']);
    expect(entries.filter((e) => !e.brief).length).toBeGreaterThan(0);
  });
});

for (const c of TIER_CASES) {
  const set = setOf(c.setId);
  const members = set.members.map(roleOf);

  describe(`Role soul length tiers: ${tierLabel(c)}`, () => {
    for (const pc of SOUL_PROFILES) {
      describe(pc.id, () => {
        const compiled = lazy(() => tierCompile(c, pc));
        const build = (): Build => compiled().build;
        const result = (): CompileResult => compiled().result;
        const profile = resolveProfile(buildOn(c, pc, []), library);
        const entries = packRuleEntries(buildOn(c, pc, []));
        const authorIds = entries.filter((e) => !e.brief).map((e) => e.id);
        const rulesInSoul = pc.kind !== 'openclaw'; // openclaw keeps its rules in AGENTS.md

        // Runs a check on every role soul of the set on this profile.
        const eachSoul = (check: (role: RolePack, path: string, soul: string) => void): void => {
          for (const role of members) {
            const file = soulFileOf(result(), pc, role);
            expect(file, `${role.id} soul file on ${pc.id}`).toBeDefined();
            check(role, (file as BundleFile).path, (file as BundleFile).content);
          }
        };

        // The tiers touch pack rules lines and chassis wording only. The role's own content stays.
        it('the tiers leave the role alone: 40 to 120 lines, never lines, delegation, audit lines, stat lines', () => {
          eachSoul((role, _path, soul) => {
            const n = lineCount(soul);
            expect(n, `${role.id} line count`).toBeGreaterThanOrEqual(MIN_LINES);
            expect(n, `${role.id} line count`).toBeLessThanOrEqual(MAX_LINES);
            for (const line of role.never) {
              expect(soul, `${role.id}: ${line.id}`).toContain(line.line);
            }
            if (role.id === set.coordinator) {
              expect(soul, `${role.id} is the coordinator`).not.toContain('Never delegate.');
            } else {
              expect(occurrences(soul, delegateLine(set)), `${role.id} delegation line`).toBe(1);
            }
            if (AUDIT_ROLES.includes(role.id)) {
              expect(soul, `${role.id} no-stake`).toContain(NO_STAKE);
              expect(soul, `${role.id} no-fix`).toContain(NO_FIX);
            } else {
              expect(soul, `${role.id} no-stake`).not.toContain(NO_STAKE);
              expect(soul, `${role.id} no-fix`).not.toContain(NO_FIX);
            }
            for (const stat of TALK_STATS) {
              expect(soul, `${role.id} ${stat}`).toContain(statLine(stat, expectedLevel(role, stat, build())));
            }
          });
        });

        if (pc.cap > TIER_CAP) {
          it(`cap ${pc.cap} is over 4,000, so no tier runs: nothing is cut and the chassis stays full`, () => {
            expect(result().warnings.filter((w) => w.startsWith(CUT_PREFIX) || w.startsWith(SHORT_PREFIX))).toEqual([]);
          });

          it("every role soul keeps every pack rules line, Brian's and the author's, and fits the cap", () => {
            expect(entries.length).toBeGreaterThan(0);
            eachSoul((role, _path, soul) => {
              expectLines(soul, entries.map((e) => e.line), role, `${role.id} soul`);
              expect(soul.length, `${role.id} soul length`).toBeLessThanOrEqual(pc.cap);
            });
          });

          it('every role soul keeps every chassis line in its full form', () => {
            const expected = chassisExpected(profile, build());
            expect(expected.length).toBeGreaterThan(0);
            eachSoul((role, _path, soul) => {
              for (const x of expected) {
                expect(soul, `${role.id}: ${x.id}`).toContain(x.full);
              }
            });
          });
          return;
        }

        // The form a soul's chassis ended in: short when Tier B ran, else the profile's own form.
        const formOf = (path: string): 'full' | 'short' =>
          warningsFor(result(), path, SHORT_PREFIX).length > 0 ? 'short' : profile.chassisForm;

        it(`every role soul fits the cap of ${pc.cap} after the tiers, with no over-cap warning`, () => {
          eachSoul((role, path, soul) => {
            expect(soul.length, `${role.id} soul length`).toBeLessThanOrEqual(pc.cap);
            expect(
              result().warnings.filter((w) => w.startsWith(`roles: ${path} is `)),
              `${role.id} over-cap warning`,
            ).toEqual([]);
          });
        });

        it("Tier A cuts the author's pack rules lines, all of them or none, never Brian's, each reported once", () => {
          eachSoul((role, path) => {
            const ids = cutIdsFrom(result(), path);
            expect(new Set(ids).size, `${role.id}: each cut reported once`).toBe(ids.length);
            for (const id of ids) {
              expect(authorIds, `${role.id}: ${id} is an author line`).toContain(id);
            }
            if (rulesInSoul) {
              if (ids.length > 0) {
                expect([...ids].sort(), `${role.id}: Tier A cuts every author line`).toEqual([...authorIds].sort());
              }
            } else {
              expect(ids, `${role.id}: the openclaw soul has no rules layer to cut from`).toEqual([]);
            }
            for (const w of warningsFor(result(), path, CUT_PREFIX)) {
              expect(w, `${role.id}: warning names the cap`).toContain(`over ${pc.cap}`);
            }
          });
        });

        it('a cut line is gone from the soul, a kept line stays, and Brian\'s lines always stay', () => {
          eachSoul((role, path, soul) => {
            const cut = cutSetFrom(result(), path);
            for (const e of entries) {
              const copies = occurrences(soul, e.line);
              const own = neverCopies(e.line, role);
              if (!rulesInSoul || cut.has(e.id)) {
                expect(copies, `${role.id}: ${e.id} is not in the soul`).toBe(own);
              } else {
                expect(copies, `${role.id}: ${e.id} stays in the soul`).toBeGreaterThanOrEqual(own + 1);
              }
            }
          });
        });

        it('Tier A runs only while the soul is over the cap: before any tier it was over', () => {
          eachSoul((role, path, soul) => {
            const cutIds = cutIdsFrom(result(), path);
            if (cutIds.length === 0) {
              return; // nothing cut, and the first check shows the soul fits
            }
            const removed = entries.filter((e) => cutIds.includes(e.id)).reduce((n, e) => n + bulletSize(e.line), 0);
            const shortened =
              warningsFor(result(), path, SHORT_PREFIX).length > 0 ? shortSavings(chassisExpected(profile, build())) : 0;
            expect(soul.length + shortened + removed, `${role.id}: size before any tier`).toBeGreaterThan(pc.cap);
          });
        });

        if (profile.chassisForm === 'full') {
          it('Tier B switches the chassis to short forms only when Tier A was not enough, keeping Tier A\'s cuts', () => {
            eachSoul((role, path, soul) => {
              const warns = warningsFor(result(), path, SHORT_PREFIX);
              expect(warns.length, `${role.id}: at most one short-forms warning`).toBeLessThanOrEqual(1);
              if (warns.length === 0) {
                return;
              }
              expect(warns[0], `${role.id}: warning names the cap`).toContain(`over ${pc.cap}`);
              // Tier A ran first and cut every author line there was to cut, and those stay cut.
              if (rulesInSoul) {
                expect([...cutIdsFrom(result(), path)].sort(), `${role.id}: Tier A cuts stay cut`).toEqual(
                  [...authorIds].sort(),
                );
              }
              const at = result().warnings.indexOf(warns[0]);
              for (const w of warningsFor(result(), path, CUT_PREFIX)) {
                expect(result().warnings.indexOf(w), `${role.id}: Tier A warning comes before Tier B`).toBeLessThan(at);
              }
              // After Tier A the soul was still over the cap in full chassis.
              const afterA = soul.length + shortSavings(chassisExpected(profile, build()));
              expect(afterA, `${role.id}: size after Tier A, full chassis`).toBeGreaterThan(pc.cap);
            });
          });
        } else {
          it(`the chassis is already in short form on ${pc.id}, so Tier B has nothing to switch`, () => {
            eachSoul((role, path) => {
              expect(warningsFor(result(), path, SHORT_PREFIX), role.id).toEqual([]);
            });
          });
        }

        it('chassis lines are never dropped: every one is in the soul, in the form the tiers left it', () => {
          const expected = chassisExpected(profile, build());
          expect(expected.length).toBeGreaterThan(0);
          eachSoul((role, path, soul) => {
            const form = formOf(path);
            for (const x of expected) {
              if (form === 'short') {
                expect(soul, `${role.id} short: ${x.id}`).toContain(x.short);
                if (x.full !== x.short) {
                  expect(soul, `${role.id} short: full text of ${x.id} is gone`).not.toContain(x.full);
                }
              } else {
                expect(soul, `${role.id} full: ${x.id}`).toContain(x.full);
                if (x.full !== x.short && !x.full.includes(x.short)) {
                  expect(soul, `${role.id} full: short text of ${x.id} is not used`).not.toContain(x.short);
                }
              }
            }
          });
        });

        if (pc.kind === 'openclaw') {
          it('every role AGENTS.md keeps every rules line, the author\'s included, and no tier touches it', () => {
            for (const role of members) {
              const path = `workspace-${role.id}/AGENTS.md`;
              const file = result().files.find((f) => f.path === path);
              expect(file, path).toBeDefined();
              expectRulesBlock(file?.content ?? '', build(), role, path);
              expect(warningsFor(result(), path, CUT_PREFIX), `${path} cut`).toEqual([]);
              expect(warningsFor(result(), path, SHORT_PREFIX), `${path} short forms`).toEqual([]);
            }
          });
        }

        if (rulesInSoul && entries.some((e) => e.brief)) {
          it("Brian's pack.perps.rule.1 stays on every soul while the author lines go", () => {
            expect(entries.filter((e) => e.brief).map((e) => e.id)).toEqual(['pack.perps.rule.1']);
            eachSoul((role, path, soul) => {
              expect(cutIdsFrom(result(), path).length, `${role.id}: this case is over the cap before Tier A`).toBeGreaterThan(0);
              expect(cutIdsFrom(result(), path), role.id).not.toContain('pack.perps.rule.1');
              const line = entries.find((e) => e.id === 'pack.perps.rule.1')?.line ?? '';
              expect(soul, `${role.id}: ${line}`).toContain(line);
            });
          });
        }
      });
    }
  });
}

// A guard so the checks above cannot go quiet: the matrix has to reach every tier path.
describe('Role soul length tiers: the matrix reaches every path', () => {
  const rows = lazy(() =>
    TIER_CASES.flatMap((c) =>
      SOUL_PROFILES.filter((pc) => pc.cap <= TIER_CAP).flatMap((pc) => {
        const { build, result } = tierCompile(c, pc);
        const entries = packRuleEntries(build);
        return setOf(c.setId)
          .members.map(roleOf)
          .map((role) => {
            const file = soulFileOf(result, pc, role);
            const path = file?.path ?? '';
            const cut = cutIdsFrom(result, path);
            return {
              where: `${tierLabel(c)} on ${pc.id}: ${role.id}`,
              profile: pc.id,
              cut: cut.length > 0,
              short: warningsFor(result, path, SHORT_PREFIX).length > 0,
              briefKept:
                cut.length > 0 && entries.some((e) => e.brief && (file?.content ?? '').includes(e.line)),
            };
          });
      }),
    ),
  );

  it('has souls that fit with no tier, after Tier A alone, after Tier B alone, and after both', () => {
    expect(rows().some((r) => !r.cut && !r.short), 'a soul that needs no tier').toBe(true);
    expect(rows().some((r) => r.cut && !r.short), 'a soul that fits after Tier A').toBe(true);
    expect(rows().some((r) => !r.cut && r.short), 'a soul that needs Tier B alone').toBe(true);
    expect(rows().some((r) => r.cut && r.short), 'a soul that needs Tier A then Tier B').toBe(true);
  });

  it("has a cut soul that keeps Brian's line, on hermes and on grok", () => {
    for (const id of ['hermes', 'grok']) {
      expect(rows().some((r) => r.profile === id && r.briefKept), `${id}: a cut soul with pack.perps.rule.1`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The role rules layers carry the user's limits, not just the pack defaults.

describe('Limit overrides reach every role rules layer', () => {
  const c = CASES[0]; // trading, Marty, memecoins pack
  const LIMIT = 'per_trade_pct';
  const OVERRIDE = 0.5;
  const packDefault = (): number | undefined =>
    library.packs.find((p) => p.id === 'memecoins')?.limitsDefault[LIMIT];

  it('the override really differs from the memecoins default', () => {
    expect(packDefault()).toBeDefined();
    expect(packDefault()).not.toBe(OVERRIDE);
  });

  for (const pc of SOUL_PROFILES) {
    it(`${pc.id}: every role rules layer states the overridden limit and not the pack default`, () => {
      const base = buildOn(c, pc, allMembers(c));
      expect(base.packs, 'Marty carries the memecoins pack').toContain('memecoins');
      const build: Build = { ...base, limits: { ...base.limits, [LIMIT]: OVERRIDE } };
      const result = compile(build);
      const wanted = limitLine(LIMIT, OVERRIDE);
      const stale = limitLine(LIMIT, packDefault() as number);
      for (const role of setOf(c.setId).members.map(roleOf)) {
        // OpenClaw keeps its rules in workspace-<role>/AGENTS.md; every other profile carries them
        // in the role soul.
        const path = pc.kind === 'openclaw' ? `workspace-${role.id}/AGENTS.md` : undefined;
        const file =
          path !== undefined ? result.files.find((f) => f.path === path) : soulFileOf(result, pc, role);
        expect(file, `${role.id} rules layer on ${pc.id}`).toBeDefined();
        const content = file?.content ?? '';
        expect(content, `${role.id}: ${wanted}`).toContain(wanted);
        expect(content, `${role.id} must not state the pack default: ${stale}`).not.toContain(stale);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Locks beat the build's own stats.

describe('Locked stats override the build stats', () => {
  // June's stats are blunt 2, warm 3, funny 3, chatty 2, proactive 4. Every lock differs from them.
  const june = (roles: string[]): Build =>
    buildFor({ id: 'roles-test.locks', starter: 'june', target: 'openclaw', roles }, library);

  const lockedRoles = library.roles.filter(
    (r) => r.lockedStats !== undefined && Object.keys(r.lockedStats).length > 0,
  );

  it('June really does start away from every lock', () => {
    const stats = june([]).stats;
    expect(stats.blunt).not.toBe(4);
    expect(stats.warm).not.toBe(1);
    expect(stats.proactive).not.toBe(1);
  });

  for (const role of lockedRoles) {
    it(`${role.id}: soul carries the locked level and not June's level for each locked stat`, () => {
      const build = june([role.id]);
      const result = compile(build);
      const file = result.files.find((f) => f.path === `workspace-${role.id}/SOUL.md`);
      expect(file, `${role.id} soul`).toBeDefined();
      const content = file?.content ?? '';
      for (const [stat, level] of Object.entries(role.lockedStats ?? {}) as [Exclude<StatId, 'risk'>, Level][]) {
        expect(content, `${stat} locked at ${level}`).toContain(statLine(stat, level));
        const own = build.stats[stat];
        expect(content, `${stat} ${own} must not appear`).not.toContain(statLine(stat, own));
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// The committed role golden specs.

describe('Role golden specs', () => {
  const roleSpecs = GOLDEN_SPECS.filter((s) => s.roles !== undefined);
  const goldenDir = fileURLToPath(new URL('./golden/v2/', import.meta.url));

  // Where a role soul sits in a golden: the "### <path> (" heading of its file.
  const soulPathOf = (pc: ProfileCase, role: RolePack): string => {
    switch (pc.kind) {
      case 'openclaw':
        return `workspace-${role.id}/SOUL.md`;
      case 'hermes':
        return `profiles/${role.id}/SOUL.md`;
      case 'paste': {
        const profile = library.targets.profiles.find((p) => p.id === pc.id);
        return `${profile?.personalityPath} (${role.label})`;
      }
    }
  };

  it('there are four, one per role set', () => {
    const sets = roleSpecs.map((s) => roleOf((s.roles as string[])[0]).set).sort();
    expect(sets).toEqual(['coding', 'personal-ops', 'research', 'trading']);
  });

  it('the four are marty.openclaw.roles, rook.hermes.roles, june.grok.roles and sol.chatgpt-project.roles', () => {
    expect(roleSpecs.map((s) => s.id).sort()).toEqual([
      'june.grok.roles',
      'marty.openclaw.roles',
      'rook.hermes.roles',
      'sol.chatgpt-project.roles',
    ]);
  });

  it('the research role golden is Sol on chatgpt-project, and no role golden is on the deprecated gpt mode (B2)', () => {
    const sol = roleSpecs.find((s) => s.id === 'sol.chatgpt-project.roles');
    expect(sol, 'sol.chatgpt-project.roles spec').toBeDefined();
    expect(sol).toMatchObject({ starter: 'sol', target: 'chatgpt', mode: 'project' });
    expect(roleSpecs.filter((s) => s.mode === 'gpt' || s.id.includes('chatgpt-gpt'))).toEqual([]);
    expect(existsSync(goldenDir + 'sol.chatgpt-gpt.roles.md'), 'sol.chatgpt-gpt.roles.md is removed').toBe(false);
  });

  it('the role goldens show both length tiers: rook.hermes.roles cuts the author pack rules, then goes short (B1)', () => {
    const spec = roleSpecs.find((s) => s.id === 'rook.hermes.roles');
    expect(spec, 'rook.hermes.roles spec').toBeDefined();
    const warnings = compile(buildFor(spec as GoldenSpec, library)).warnings;
    expect(warnings.some((w) => w.startsWith(CUT_PREFIX)), 'a Tier A cut').toBe(true);
    expect(warnings.some((w) => w.startsWith(SHORT_PREFIX)), 'a Tier B switch').toBe(true);
  });

  for (const spec of roleSpecs) {
    it(`${spec.id}: roles come from one set and the trading specs leave executor out`, () => {
      const picked = (spec.roles as string[]).map(roleOf);
      expect(new Set(picked.map((r) => r.set)).size).toBe(1);
      if (picked[0].set === 'trading') {
        expect(spec.roles).not.toContain('executor');
      }
    });

    it(`${spec.id}: compiles to the normalized roles, coordinator included, with no executor unless asked`, () => {
      const build = buildFor(spec, library);
      const result = compile(build);
      const set = setOf(roleOf((spec.roles as string[])[0]).set);
      expect(result.roles).toEqual(set.members.filter((id) => id === set.coordinator || (spec.roles as string[]).includes(id)));
      expect(result.roles).toContain(set.coordinator);
    });

    it(`${spec.id}: one soul per role, each within the profile cap, and the golden file lists each soul`, () => {
      const pc = SOUL_PROFILES.find((p) => p.target === spec.target && p.mode === spec.mode);
      expect(pc, `${spec.id} is on a role-capable profile`).toBeDefined();
      const result = compile(buildFor(spec, library));
      expect(existsSync(goldenDir + spec.id + '.md'), `${spec.id}.md exists`).toBe(true);
      const golden = readFileSync(goldenDir + spec.id + '.md', 'utf8');
      for (const id of result.roles) {
        const role = roleOf(id);
        const files = soulFilesOf(result, pc as SoulProfileCase, role);
        expect(files.length, `${id} soul file`).toBe(1);
        expect(files[0].content.length, `${id} soul length`).toBeLessThanOrEqual((pc as SoulProfileCase).cap);
        expect(golden, `${id} in the golden`).toContain(`### ${soulPathOf(pc as SoulProfileCase, role)} (`);
      }
    });
  }
});
