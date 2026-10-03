// Structured bundle fields (M4 slice 4.2; QUESTIONS W2, W14, W25; docs/M4-PLAN.md section 1).
//
// What is under test: steps, noteItems, verify, undelivered, trimmed, starterIds, descriptionIds,
// buildNameIds, docUrl and docReadDate on CompileResult; the `kind` and `role` fields on files and
// spoken items; artifactKindOf; the `when`, `closer` and `shows` tags on install steps and the
// `when` tag on verify lines; the undelivered list; the trimmed list; and the traceBundle checks
// that cover the new fields.
//
// Where the expected values come from. Nothing here is copied from compiler output.
//   - Step and verify records, their ids, tags and texts: the profile records in the library
//     (src/library/profiles.json), read through `library`.
//   - Which skills a build asks for: the chip and pack skill records in the library. A chip skill
//     whose name a selected pack skill also carries is replaced by the pack skill (library rule).
//   - What the personality text holds: the delivered personality file itself. A trigger skill on
//     custom instructions is delivered if and only if its name is in that text (the inline line is
//     "{name}: {sentence}").
//   - Trimmed ids: the compiler's own warnings ("length: cut", "length: dropped",
//     "instructions: dropped", and for a role soul "roles: cut" and "roles: chassis switched") and
//     the "#short" ids on the delivered soul lines and role file lines. Trimmed texts: the library
//     record behind each id. The role-soul trims run on a synthetic library, because no role golden
//     has a role soul that the main soul does not also trim (section 6b).
//   - The artifact-kind table: docs/M4-PLAN.md section 1, written out below, and each item's
//     label, which is how the UI and the library name an artifact. The label is the oracle for what
//     a file or spoken item is, so the `kind` field is checked against something it does not echo.
//   - The step and verify `when` mechanics run on a synthetic library: the real profiles carry no
//     tags until slice 4.1 lands, so the tests tag a copy of the library and expect hand-written
//     id lists from the plan's any-of rule.
//
// Readings the engineer picked that the plan leaves open, and that these tests do not pin:
//   - the id format of a build name word (name.<stat>.<level>); the test only checks that each id
//     names a names.json word and that the words plus the base noun rebuild the build name;
//   - one `roles` undelivered entry per role (the test checks kind and the warning, not the count);
//   - the order of the undelivered list;
//   - whether a cut that only role souls made is one trimmed entry per role file or one overall, and
//     the `role` and `path` tags on such an entry (the tests check the id, text, pack and kind).
//
// Pinned reading: a rule or short form that the main soul and a role soul both cut is ONE trimmed
// entry. The certificate counts "n rules from <pack>", so a shared cut must not be counted per soul.

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { traceBundle } from '../src/compiler/trace.js';
import { artifactKindOf } from '../src/compiler/types.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import type { GoldenSpec } from '../tools/golden.js';
import type {
  ArtifactKind,
  Build,
  BundleFile,
  ChatgptMode,
  CompileResult,
  InstallStep,
  Library,
  Plan,
  Profile,
  SpokenItem,
  StepWhen,
  TargetId,
  Trimmed,
  WorkflowPack,
} from '../src/compiler/types.js';

// ---------------------------------------------------------------------------------------------
// Shared helpers.

const cache = new Map<string, CompileResult>();

function compiled(spec: GoldenSpec): CompileResult {
  let hit = cache.get(spec.id);
  if (!hit) {
    hit = compile(buildFor(spec, library));
    cache.set(spec.id, hit);
  }
  return hit;
}

function profileOf(result: CompileResult, lib: Library = library): Profile {
  const found = lib.targets.profiles.find((p) => p.id === result.profile);
  if (!found) {
    throw new Error(`no library profile ${result.profile}`);
  }
  return found;
}

function specOf(id: string): GoldenSpec {
  const found = GOLDEN_SPECS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`no golden spec ${id}`);
  }
  return found;
}

// The custom GPT mode is hidden and has no goldens, but the compiler keeps it (B2). It is the only
// profile with starters and a description, so it gets its own spec list: every roster starter.
const GPT_SPECS: GoldenSpec[] = library.roster.map((r) => ({
  id: `${r.id}.chatgpt-gpt`,
  starter: r.id,
  target: 'chatgpt',
  mode: 'gpt',
}));

// ---------------------------------------------------------------------------------------------
// The artifact-kind table (docs/M4-PLAN.md section 1), and the label oracle for what an item is.

type FileLabelKind = 'personality' | 'rules' | 'memory' | 'skill' | 'knowledge' | 'role';

const FILE_ARTIFACT: Record<FileLabelKind, ArtifactKind> = {
  personality: 'personality',
  rules: 'rules',
  memory: 'memory',
  skill: 'skills',
  knowledge: 'skills',
  role: 'roles',
};

const SPOKEN_ARTIFACT: Record<SpokenItem['kind'], ArtifactKind> = {
  personality: 'personality',
  memory: 'memory',
  firstTask: 'firstTask',
  skill: 'skills',
  routine: 'routines',
};

const FILE_KINDS: BundleFile['kind'][] = ['personality', 'memory', 'rules', 'skill', 'knowledge'];
const SPOKEN_KINDS: SpokenItem['kind'][] = ['personality', 'memory', 'skill', 'routine', 'firstTask'];

// What a file is, from its label. Role files are labelled "Role soul: ...", "Role rules: ...",
// "Role description: ..." or "Role instructions: ...".
function fileLabelKind(file: BundleFile, profile: Profile): FileLabelKind {
  if (file.label.startsWith('Role ')) return 'role';
  if (file.label === 'Personality') return 'personality';
  if (file.label === 'Rules') return 'rules';
  if (file.label === 'Memory') return 'memory';
  if (file.label.startsWith('Skill: ')) {
    // Only the custom GPT carries skills as knowledge files.
    return profile.skillsDelivery === 'knowledge' ? 'knowledge' : 'skill';
  }
  throw new Error(`unclassified file label "${file.label}"`);
}

function spokenLabelKind(item: SpokenItem, profile: Profile): SpokenItem['kind'] {
  if (item.label === 'Personality') return 'personality';
  if (item.label === 'Memory sentence') return 'memory';
  if (item.label === 'First task') return 'firstTask';
  if (item.label.startsWith('Routine: ')) return 'routine';
  if (item.label.startsWith(`${profile.skillLabel ?? 'Skill'}: `)) return 'skill';
  throw new Error(`unclassified spoken label "${item.label}"`);
}

// ---------------------------------------------------------------------------------------------
// The `when` oracle: what the bundle delivers, from labels and the profile's role fallback.

type Delivered = Record<StepWhen, boolean>;

function deliveredOf(result: CompileResult, profile: Profile): Delivered {
  return {
    skills:
      result.files.some((f) => FILE_ARTIFACT[fileLabelKind(f, profile)] === 'skills') ||
      result.spoken.some((s) => spokenLabelKind(s, profile) === 'skill'),
    routines: result.spoken.some((s) => spokenLabelKind(s, profile) === 'routine'),
    // "result.roles is non-empty and the profile compiles roles": a single dot gets a note and
    // custom instructions have no place for roles, so neither compiles them.
    roles:
      result.roles.length > 0 &&
      profile.roleFallback !== 'none' &&
      profile.roleFallback !== 'single-dot-note',
  };
}

function visible<T extends { when?: StepWhen[] }>(items: T[], has: Delivered): T[] {
  return items.filter((i) => i.when === undefined || i.when.length === 0 || i.when.some((w) => has[w]));
}

// What one step of a bundle is: a library install step, or the promoted role fallback line.
interface ExpectedStep {
  id: string;
  text: string;
  shows: ArtifactKind[];
  closer: boolean;
}

const fromRecord = (s: InstallStep): ExpectedStep => ({
  id: s.id,
  text: s.line,
  shows: s.shows ?? [],
  closer: s.closer === true,
});

// QUESTIONS W33. A profile that ships role files (a file with a "Role ..." label) and has no shown
// install step that shows roles gets its fallback.roles template as a step: the library id of the
// template, its text with {roles} filled by the role labels in set member order joined with ", "
// (the joiner the committed role goldens show, "(Chief of staff, Triager, Scheduler)"), and
// shows ['roles'], never a closer.
function promotedRoleStep(profile: Profile, result: CompileResult): ExpectedStep | undefined {
  const roleFilesShip = result.files.some((f) => fileLabelKind(f, profile) === 'role');
  const shownSteps = visible(profile.installSteps, deliveredOf(result, profile));
  const template = Object.hasOwn(profile.templates, 'fallback.roles') ? profile.templates['fallback.roles'] : undefined;
  if (!roleFilesShip || template === undefined || shownSteps.some((s) => (s.shows ?? []).includes('roles'))) {
    return undefined;
  }
  const labels = result.roles.map((id) => library.roles.find((r) => r.id === id)?.label ?? `?${id}`);
  return { id: template.id, text: template.line.replaceAll('{roles}', labels.join(', ')), shows: ['roles'], closer: false };
}

// Library order with the `when` tags applied, then the promoted role step (if any), closers last.
function expectedSteps(profile: Profile, result: CompileResult): ExpectedStep[] {
  const shown = visible(profile.installSteps, deliveredOf(result, profile)).map(fromRecord);
  const promoted = promotedRoleStep(profile, result);
  return [
    ...shown.filter((s) => !s.closer),
    ...(promoted !== undefined ? [promoted] : []),
    ...shown.filter((s) => s.closer),
  ];
}

// ---------------------------------------------------------------------------------------------
// The skills a build asks for, from the library (chips in tap order, then pack skills).

interface SkillRef {
  id: string;
  name: string;
  kind: 'skill' | 'routine';
}

const nameKey = (name: string): string => name.trim().toLowerCase();

function skillsAsked(build: Build, lib: Library = library): SkillRef[] {
  const packs = build.packs
    .map((id) => lib.packs.find((p) => p.id === id))
    .filter((p): p is WorkflowPack => p !== undefined);
  const packNames = new Set(packs.flatMap((p) => p.skills.map((s) => nameKey(s.name))));
  const refs: SkillRef[] = [];
  for (const chipId of build.chips) {
    for (const skill of lib.chips.find((c) => c.id === chipId)?.skills ?? []) {
      if (packNames.has(nameKey(skill.name))) continue;
      refs.push({ id: skill.id, name: skill.name, kind: skill.kind === 'trigger' ? 'skill' : 'routine' });
    }
  }
  for (const pack of packs) {
    for (const skill of pack.skills) {
      refs.push({
        id: `pack.${pack.id}.skill.${skill.id}`,
        name: skill.name,
        kind: skill.kind === 'trigger' ? 'skill' : 'routine',
      });
    }
  }
  return refs;
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ---------------------------------------------------------------------------------------------
// Trimmed oracles.

// Every id a trim warning names, split by which soul made the cut.
//   main: "length: cut", "length: dropped" and "instructions: dropped" warnings, in order. The free
//     custom-instructions fit also drops inline skill lines; those are reported as undelivered, not
//     as trims, so the inline template id is left out.
//   roleOnly: "roles: cut" warnings (a Tier A cut in a role soul) for an id the main soul did not
//     also cut, in order. An id both souls cut is one fact and sits in `main` only.
function warnedTrimIds(result: CompileResult, profile: Profile): { main: string[]; roleOnly: string[] } {
  const inline = profile.templates['skill.inline']?.id;
  const main: string[] = [];
  for (const w of result.warnings) {
    const m = /^(?:length: cut|length: dropped|instructions: dropped) (\S+)/.exec(w);
    if (m && m[1] !== inline) main.push(m[1]);
  }
  const roleOnly: string[] = [];
  for (const w of result.warnings) {
    const m = /^roles: cut (\S+)/.exec(w);
    if (m && !main.includes(m[1])) roleOnly.push(m[1]);
  }
  return { main, roleOnly };
}

const SHORT_FORM_WARNING = 'length: chassis switched to short forms';
const ROLE_SHORT_FORM_WARNING = 'roles: chassis switched to short forms';

// The role files a "roles: chassis switched to short forms ... in <path>" warning names.
function roleFilesOnShortForms(result: CompileResult): BundleFile[] {
  const paths = new Set<string>();
  for (const w of result.warnings) {
    if (!w.startsWith(ROLE_SHORT_FORM_WARNING)) continue;
    const m = / in (.+)$/.exec(w);
    if (m) paths.add(m[1]);
  }
  return result.files.filter((f) => f.role !== undefined && f.kind === 'personality' && paths.has(f.path));
}

// The chassis line a short-form id stands for: the id without its "#short" or "@profile" suffix.
const chassisBase = (id: string): string => id.split(/[#@]/, 1)[0];

// The full-form text of a chassis line on a profile: the profile's own wording if it has one, else
// the library line.
function fullChassisText(base: string, profile: Profile): string {
  const variant = profile.chassisVariants[base];
  if (typeof variant === 'string') return variant;
  const line = library.chassis.lines.find((l) => l.id === base);
  if (!line) throw new Error(`no library chassis line ${base}`);
  return line.line;
}

// The chassis lines (by base id) that a soul's "#short" lines actually shorten. A short form the
// library words exactly like the full form cuts nothing, so it is not a trim. A soul line holds the
// short text after its bullet; the full text is the library line or the profile variant.
function changedShortBases(lines: { id: string; text: string }[], profile: Profile): string[] {
  return lines
    .filter((l) => l.id.includes('#short'))
    .filter((l) => l.text.replace(/^- /, '') !== fullChassisText(chassisBase(l.id), profile))
    .map((l) => chassisBase(l.id));
}

// The library text behind a trimmed record.
function libraryTextOf(t: Trimmed, build: Build, profile: Profile): string {
  switch (t.kind) {
    case 'pack-rule': {
      const rule = library.packs.find((p) => p.id === t.pack)?.rulesLines.find((l) => l.id === t.id);
      if (!rule) throw new Error(`no library rule ${t.id} in pack ${String(t.pack)}`);
      return rule.line;
    }
    case 'trigger': {
      for (const chip of library.chips) {
        const trigger = chip.triggers.find((x) => x.id === t.id);
        if (trigger) return trigger.line;
      }
      throw new Error(`no library trigger ${t.id}`);
    }
    case 'voice': {
      const chipId = /^chip\.(.+)\.voice$/.exec(t.id)?.[1];
      const voice = library.chips.find((c) => c.id === chipId)?.voice;
      if (voice === undefined) throw new Error(`no library voice line ${t.id}`);
      return voice;
    }
    case 'stat': {
      const stat = library.stats.find((s) => s.id === t.id);
      if (!stat) throw new Error(`no library stat line ${t.id}`);
      return stat.line;
    }
    case 'peeve': {
      const line = library.peeves.find((p) => p.id === t.id)?.line;
      if (line === undefined) throw new Error(`no library peeve line ${t.id}`);
      return line;
    }
    case 'example': {
      // The free fit drops example 2 whole: the domain exchange, "Me:" then "You:".
      const domain = library.examples.domains.find((d) => d.id === t.id);
      if (!domain) throw new Error(`no library example ${t.id}`);
      const you = build.stats.blunt >= 3 ? domain.youBlunt : domain.youGentle;
      return `Me: ${domain.me}\nYou: ${you}`;
    }
    case 'chassis-short': {
      // The id is the full form that was replaced: a chassis id, or a profile variant of one.
      const base = chassisBase(t.id);
      if (t.id.includes('@')) {
        const variant = profile.chassisVariants[base];
        if (typeof variant !== 'string') throw new Error(`no profile variant for ${t.id}`);
        return variant;
      }
      const line = library.chassis.lines.find((l) => l.id === t.id);
      if (!line) throw new Error(`no library chassis line ${t.id}`);
      return line.line;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Every golden spec.

describe.each(GOLDEN_SPECS)('bundle fields: $id', (spec) => {
  const result = compiled(spec);
  const profile = profileOf(result);
  const build = buildFor(spec, library);

  describe('steps', () => {
    it('step text equals installSteps', () => {
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps.map((s) => s.text)).toEqual(result.installSteps);
    });

    // A step's id is a profile installSteps id, or the profile's fallback.roles template id when
    // role files ship and no install step shows roles (W33).
    it("step ids are the profile's installSteps ids in order (when applied, closers last), plus the fallback.roles id when promoted", () => {
      expect(result.steps.map((s) => s.id)).toEqual(expectedSteps(profile, result).map((s) => s.id));
      const known = [
        ...profile.installSteps.map((s) => s.id),
        ...(Object.hasOwn(profile.templates, 'fallback.roles') ? [profile.templates['fallback.roles'].id] : []),
      ];
      for (const s of result.steps) {
        expect(known, `${spec.id} ${s.id}`).toContain(s.id);
      }
    });

    it('step text, shows and closer come from the profile record, or the fallback.roles template when promoted', () => {
      expect(result.steps).toEqual(expectedSteps(profile, result));
    });

    it('the fallback.roles line is a step exactly when role files ship and no install step shows roles', () => {
      const promoted = promotedRoleStep(profile, result);
      const asStep = result.steps.filter((s) => s.id === `profile.${profile.id}.fallback.roles`);
      const asNote = result.noteItems.filter((n) => n.id === `profile.${profile.id}.fallback.roles`);
      if (promoted !== undefined) {
        expect(asStep, spec.id).toEqual([promoted]);
        expect(asNote, spec.id).toEqual([]);
        expect(result.installSteps, spec.id).toContain(promoted.text);
        expect(result.notes, spec.id).not.toContain(promoted.text);
      } else {
        expect(asStep, spec.id).toEqual([]);
      }
    });
  });

  describe('notes and verify', () => {
    it('noteItems text equals notes', () => {
      expect(result.noteItems.map((n) => n.text)).toEqual(result.notes);
    });

    it('verify equals the noteItems of kind verify', () => {
      expect(result.verify).toEqual(result.noteItems.filter((n) => n.kind === 'verify'));
    });

    it('verify ids are profile.<pid>.verify.<n>, and are the profile verify records that apply', () => {
      expect(result.verify.length).toBeGreaterThan(0);
      for (const v of result.verify) {
        expect(v.id).toMatch(new RegExp(`^profile\\.${result.profile}\\.verify\\.[0-9]+$`));
      }
      const expected = visible(profile.verify, deliveredOf(result, profile));
      expect(result.verify).toEqual(expected.map((v) => ({ id: v.id, text: v.line, kind: 'verify' })));
    });

    it('every note has an id from the record its kind names', () => {
      const venueIds = result.packs.flatMap((id) => {
        const note = library.packs.find((p) => p.id === id)?.venueNotes?.[profile.id];
        return note ? [note.id] : [];
      });
      const allowed: Record<string, string[]> = {
        verify: profile.verify.map((v) => v.id),
        note: (profile.notes ?? []).map((n) => n.id),
        reload: profile.reloadNote ? [profile.reloadNote.id] : [],
        venue: venueIds,
        actions: profile.templates['actions.consequential'] ? [profile.templates['actions.consequential'].id] : [],
        role: Object.values(profile.templates).map((t) => t.id),
      };
      for (const n of result.noteItems) {
        expect(Object.keys(allowed), `unknown note kind ${n.kind}`).toContain(n.kind);
        if (n.kind === 'role' && n.text.startsWith('[TODO:')) continue;
        expect(allowed[n.kind], `note ${n.id} of kind ${n.kind}`).toContain(n.id);
      }
    });

    it('carries every profile note, the reload note, and each delivered pack venue note', () => {
      const ids = (kind: string): string[] => result.noteItems.filter((n) => n.kind === kind).map((n) => n.id);
      expect(ids('note')).toEqual((profile.notes ?? []).map((n) => n.id));
      expect(ids('reload')).toEqual(profile.reloadNote ? [profile.reloadNote.id] : []);
      const venueIds = result.packs.flatMap((id) => {
        const note = library.packs.find((p) => p.id === id)?.venueNotes?.[profile.id];
        return note ? [note.id] : [];
      });
      expect(ids('venue')).toEqual(venueIds);
    });
  });

  describe('kinds', () => {
    it('every file has a kind, and artifactKindOf follows the table', () => {
      for (const file of result.files) {
        expect(FILE_KINDS, `${file.path} kind`).toContain(file.kind);
        const label = fileLabelKind(file, profile);
        if (label === 'role') {
          // A role set file is a roles artifact whatever it holds.
          expect(file.role, `${file.path} role`).toBeDefined();
          expect(result.roles).toContain(file.role);
        } else {
          expect(file.role, `${file.path} role`).toBeUndefined();
          expect(file.kind, `${file.path} kind`).toBe(label);
        }
        expect(artifactKindOf(file), file.path).toBe(FILE_ARTIFACT[label]);
      }
    });

    it('every spoken item has a kind, and artifactKindOf follows the table', () => {
      for (const item of result.spoken) {
        expect(SPOKEN_KINDS, `${item.label} kind`).toContain(item.kind);
        expect(item.kind, item.label).toBe(spokenLabelKind(item, profile));
        expect(artifactKindOf(item), item.label).toBe(
          item.role !== undefined ? 'roles' : SPOKEN_ARTIFACT[item.kind],
        );
      }
    });

    it('a role has a file or note on every profile that compiles roles, and role files carry the role id', () => {
      const roleFiles = result.files.filter((f) => f.label.startsWith('Role '));
      if (result.roles.length === 0) {
        expect(roleFiles).toEqual([]);
        return;
      }
      const has = deliveredOf(result, profile);
      if (has.roles) {
        for (const role of result.roles) {
          expect(
            roleFiles.some((f) => f.role === role),
            `a role file for ${role}`,
          ).toBe(true);
        }
      } else {
        expect(roleFiles).toEqual([]);
      }
    });
  });

  describe('undelivered', () => {
    it('each undelivered item adds one "undelivered: <id>" warning, in order', () => {
      const warned = result.warnings
        .filter((w) => w.startsWith('undelivered: '))
        .map((w) => w.slice('undelivered: '.length));
      expect(warned).toEqual(result.undelivered.map((u) => u.id));
    });

    it('is empty on every profile but custom instructions (nothing is left out when a profile carries it all)', () => {
      if (profile.id === 'chatgpt-instructions') return;
      expect(result.undelivered).toEqual([]);
    });
  });

  describe('trimmed', () => {
    it("ids equal the ids in the 'length: cut', 'length: dropped', 'instructions: dropped' and 'roles: cut' warnings", () => {
      const { main, roleOnly } = warnedTrimIds(result, profile);
      const trimmedIds = result.trimmed.filter((t) => t.kind !== 'chassis-short').map((t) => t.id);
      // The main soul's trims lead, in warning order.
      expect(trimmedIds.slice(0, main.length)).toEqual(main);
      // A role soul's Tier A cut that the main soul did not make follows. Whether it is one entry per
      // role file or one overall is not pinned, so compare as sets.
      expect(new Set(trimmedIds.slice(main.length))).toEqual(new Set(roleOnly));
    });

    it('chassis short forms are recorded if and only if a short-form warning is (main or role soul), and name the replaced lines', () => {
      const mainWarned = result.warnings.some((w) => w.startsWith(SHORT_FORM_WARNING));
      const roleFiles = roleFilesOnShortForms(result);
      const shortTrims = result.trimmed.filter((t) => t.kind === 'chassis-short');
      if (!mainWarned && roleFiles.length === 0) {
        // Free custom instructions starts on the short chassis (the plan form), so it records none.
        expect(shortTrims).toEqual([]);
        return;
      }
      expect(shortTrims.length).toBeGreaterThan(0);
      const changed = new Set([
        ...(mainWarned ? changedShortBases(result.soulLines, profile) : []),
        ...roleFiles.flatMap((f) => changedShortBases(f.lines, profile)),
      ]);
      expect(new Set(shortTrims.map((t) => chassisBase(t.id)))).toEqual(changed);
    });

    it('each record carries the library text of its id (and its pack, for a pack rule)', () => {
      for (const t of result.trimmed) {
        expect(t.text, `${t.kind} ${t.id}`).toBe(libraryTextOf(t, build, profile));
        if (t.kind === 'pack-rule') {
          expect(result.packs).toContain(t.pack);
        } else {
          expect(t.pack, `${t.kind} ${t.id} pack`).toBeUndefined();
        }
      }
    });

    it('records only the kinds the plan names', () => {
      const kinds: Trimmed['kind'][] = ['pack-rule', 'trigger', 'peeve', 'stat', 'voice', 'example', 'chassis-short'];
      for (const t of result.trimmed) {
        expect(kinds).toContain(t.kind);
        expect(t.id).not.toBe('');
        expect(t.text).not.toBe('');
      }
    });
  });

  describe('ids and links', () => {
    it('docUrl and docReadDate come from the profile', () => {
      expect(result.docUrl).toBe(profile.docUrl);
      expect(result.docReadDate).toBe(profile.docReadDate);
      expect(result.docReadDate).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    });

    it('starterIds and descriptionIds are empty off the custom GPT', () => {
      expect(result.starterIds).toEqual([]);
      expect(result.descriptionIds).toEqual([]);
      expect(result.conversationStarters).toBeUndefined();
      expect(result.description).toBeUndefined();
    });

    it('buildNameIds name the names.json words behind the build name', () => {
      expect(result.buildNameIds).toHaveLength(2);
      const base = library.bases.find((b) => b.id === build.base);
      expect(base).toBeDefined();
      const words = result.buildNameIds.map((id) => {
        const m = /^name\.([a-z]+)(?:\.([1-4]))?$/.exec(id);
        expect(m, `name id ${id}`).not.toBeNull();
        const [, stat, level] = m as RegExpExecArray;
        const word = library.names.words.find(
          (w) => w.stat === stat && (level === undefined ? w.level === undefined : w.level === Number(level)),
        );
        expect(word, `names.json word for ${id}`).toBeDefined();
        return (word as { word: string }).word;
      });
      expect([...words, (base as { noun: string }).noun].join(' ')).toBe(result.buildName);
    });
  });

  describe('no verify clause in a copyable output', () => {
    it('the soul, files, spoken items, custom rules, starters and description never say "verify:"', () => {
      const copyable: string[] = [
        result.soul,
        ...result.files.map((f) => f.content),
        ...result.spoken.map((s) => s.text),
        ...result.customRules.flatMap((r) => [r.action, r.setting]),
        ...(result.conversationStarters ?? []),
        result.description ?? '',
      ];
      for (const text of copyable) {
        expect(text).not.toMatch(/verify:/i);
      }
    });
  });
});

// ---------------------------------------------------------------------------------------------
// 2. The custom GPT: starters, description and their ids; the same field checks on its bundle.

describe.each(GPT_SPECS)('bundle fields on the custom GPT: $id', (spec) => {
  const result = compiled(spec);
  const profile = profileOf(result);
  const build = buildFor(spec, library);

  it('starterIds name the domain example and probes 2 to 4, one id list per starter', () => {
    const starters = result.conversationStarters ?? [];
    expect(starters).toHaveLength(4);
    expect(result.starterIds).toHaveLength(starters.length);
    const [first, ...probes] = result.starterIds;
    expect(first).toHaveLength(1);
    const domain = library.examples.domains.find((d) => d.id === first[0]);
    expect(domain, `domain example ${first[0]}`).toBeDefined();
    expect(starters[0]).toBe((domain as { me: string }).me);
    expect(probes).toEqual([['probe.2'], ['probe.3'], ['probe.4']]);
    for (const [i, ids] of probes.entries()) {
      const probe = library.probes.find((p) => p.id === ids[0]);
      expect(probe, `probe ${ids[0]}`).toBeDefined();
      expect(starters[i + 1]).toBe((probe as { line: string }).line);
    }
  });

  it('descriptionIds are the profile description template and the base id', () => {
    expect(result.descriptionIds).toEqual([profile.templates.description.id, build.base]);
    const base = library.bases.find((b) => b.id === build.base);
    expect(result.description).toContain((base as { baseLine: string }).baseLine);
    expect((result.description ?? '').length).toBeLessThan(300);
  });

  it('carries the Actions note as kind actions, and skills as knowledge files', () => {
    const actions = result.noteItems.filter((n) => n.kind === 'actions');
    expect(actions.map((n) => n.id)).toEqual([profile.templates['actions.consequential'].id]);
    const skillFiles = result.files.filter((f) => f.label.startsWith('Skill: '));
    for (const f of skillFiles) {
      expect(f.kind).toBe('knowledge');
      expect(artifactKindOf(f)).toBe('skills');
    }
  });

  it('steps, notes, verify and kinds hold on the GPT too', () => {
    expect(result.steps.map((s) => s.text)).toEqual(result.installSteps);
    expect(result.steps).toEqual(expectedSteps(profile, result));
    expect(result.noteItems.map((n) => n.text)).toEqual(result.notes);
    expect(result.verify).toEqual(result.noteItems.filter((n) => n.kind === 'verify'));
    for (const file of result.files) {
      expect(artifactKindOf(file)).toBe(FILE_ARTIFACT[fileLabelKind(file, profile)]);
    }
    expect(result.undelivered).toEqual([]);
  });

  it('no copyable output says "verify:"', () => {
    const copyable = [
      result.soul,
      ...result.files.map((f) => f.content),
      ...result.spoken.map((s) => s.text),
      ...result.customRules.flatMap((r) => [r.action, r.setting]),
      ...(result.conversationStarters ?? []),
      result.description ?? '',
    ];
    for (const text of copyable) {
      expect(text).not.toMatch(/verify:/i);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 3. artifactKindOf, as a table.

describe('artifactKindOf', () => {
  const file = (kind: BundleFile['kind'], role?: string): BundleFile => ({
    path: 'p',
    label: 'l',
    delivery: 'file',
    kind,
    ...(role !== undefined ? { role } : {}),
    content: '',
    lines: [],
  });
  const spoken = (kind: SpokenItem['kind'], role?: string): SpokenItem => ({
    label: 'l',
    text: 't',
    ids: [],
    kind,
    ...(role !== undefined ? { role } : {}),
  });

  it.each([
    ['personality', 'personality'],
    ['rules', 'rules'],
    ['memory', 'memory'],
    ['skill', 'skills'],
    ['knowledge', 'skills'],
  ] as const)('file kind %s maps to %s', (kind, artifact) => {
    expect(artifactKindOf(file(kind))).toBe(artifact);
  });

  it.each([
    ['personality', 'personality'],
    ['memory', 'memory'],
    ['firstTask', 'firstTask'],
    ['skill', 'skills'],
    ['routine', 'routines'],
  ] as const)('spoken kind %s maps to %s', (kind, artifact) => {
    expect(artifactKindOf(spoken(kind))).toBe(artifact);
  });

  it('a role set file or spoken item is roles whatever its kind', () => {
    for (const kind of FILE_KINDS) {
      expect(artifactKindOf(file(kind, 'scout')), `file ${kind}`).toBe('roles');
    }
    for (const kind of SPOKEN_KINDS) {
      expect(artifactKindOf(spoken(kind, 'scout')), `spoken ${kind}`).toBe('roles');
    }
  });

  it('maps the role files of every role golden to roles', () => {
    for (const spec of GOLDEN_SPECS.filter((s) => s.roles !== undefined)) {
      const result = compiled(spec);
      const roleFiles = result.files.filter((f) => f.role !== undefined);
      expect(roleFiles.length, spec.id).toBeGreaterThan(0);
      for (const f of roleFiles) {
        expect(artifactKindOf(f), `${spec.id} ${f.path}`).toBe('roles');
      }
      // Everything that is not a role file is not roles.
      for (const f of result.files.filter((x) => x.role === undefined)) {
        expect(artifactKindOf(f), `${spec.id} ${f.path}`).not.toBe('roles');
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Undelivered on custom instructions (W14).

describe.each(['marty.chatgpt-instructions-free', 'marty.chatgpt-instructions-paid', 'june.chatgpt-instructions-free', 'june.chatgpt-instructions-paid'])(
  'undelivered on custom instructions: %s',
  (id) => {
    const spec = specOf(id);
    const result = compiled(spec);
    const build = buildFor(spec, library);
    const personality = result.files.find((f) => f.label === 'Personality');

    // Every trigger skill whose name is absent from the personality text, plus every routine.
    const expected = skillsAsked(build)
      .filter((r) => r.kind === 'routine' || !(personality?.content ?? '').includes(r.name))
      .sort(byId);

    it('lists every trigger skill whose name is absent from the personality text, plus every routine', () => {
      const got = result.undelivered
        .filter((u) => u.kind === 'skill' || u.kind === 'routine')
        .map((u) => ({ id: u.id, name: u.name, kind: u.kind }))
        .sort(byId);
      expect(got).toEqual(expected);
    });

    it('lists no pack or roles, since none apply', () => {
      expect(result.undelivered.filter((u) => u.kind === 'pack' || u.kind === 'roles')).toEqual([]);
    });

    it('never lists a skill whose name is in the personality text', () => {
      for (const u of result.undelivered.filter((x) => x.kind === 'skill')) {
        expect(personality?.content ?? '', u.name).not.toContain(u.name);
      }
    });

    it('lists every routine the build asks for', () => {
      const routines = skillsAsked(build).filter((r) => r.kind === 'routine');
      expect(routines.length).toBeGreaterThan(0);
      for (const r of routines) {
        expect(result.undelivered).toContainEqual({ kind: 'routine', id: r.id, name: r.name });
      }
    });
  },
);

describe('undelivered on marty free custom instructions', () => {
  const result = compiled(specOf('marty.chatgpt-instructions-free'));

  it('the free fit keeps no inline skill, so all four trigger skills and the one routine are listed', () => {
    // From the library: Solana's Wallet glance, and the Memecoins pack's Rug check, Position log and
    // Edge-gone exit (the chip's own Rug check and Position log are replaced by the pack's) are
    // trigger skills; Narrative watch is a schedule skill.
    const skills = result.undelivered.filter((u) => u.kind === 'skill').map((u) => u.name).sort();
    const routines = result.undelivered.filter((u) => u.kind === 'routine').map((u) => u.name);
    expect(skills).toEqual(['Edge-gone exit', 'Position log', 'Rug check', 'Wallet glance']);
    expect(routines).toEqual(['Narrative watch']);
  });

  it('every undelivered record carries an id the library knows', () => {
    for (const u of result.undelivered) {
      const known =
        library.chips.some((c) => (c.skills ?? []).some((s) => s.id === u.id)) ||
        library.packs.some((p) => p.skills.some((s) => `pack.${p.id}.skill.${s.id}` === u.id));
      expect(known, u.id).toBe(true);
    }
  });
});

describe('undelivered on marty paid custom instructions', () => {
  const result = compiled(specOf('marty.chatgpt-instructions-paid'));

  it('the three inline slots deliver three trigger skills; the fourth and the routine are listed', () => {
    const skills = result.undelivered.filter((u) => u.kind === 'skill').map((u) => u.name);
    const routines = result.undelivered.filter((u) => u.kind === 'routine').map((u) => u.name);
    expect(skills).toEqual(['Edge-gone exit']);
    expect(routines).toEqual(['Narrative watch']);
  });
});

// ---------------------------------------------------------------------------------------------
// 5. A pack the profile cannot deliver (W10, W14, W25). No pack in the library restricts its
// profiles, so a synthetic pack with profiles: ['muse'] stands in.

describe('a pack the profile cannot deliver', () => {
  const SYN = 'synth-muse-only';
  const SYN_LABEL = 'Synthetic Muse only';
  const RULE_BRIEF = 'Synthetic brief rule one stays in force.';
  const SYN_TRIGGER = 'Synthetic trigger line.';
  const SYN_SEED = 'I keep synthetic notes.';
  const SYN_SKILL_NAME = 'Synthetic skill';

  function synthPack(extra: Partial<WorkflowPack> = {}): WorkflowPack {
    return {
      id: SYN,
      label: SYN_LABEL,
      triggers: [{ id: `pack.${SYN}.t1`, line: SYN_TRIGGER }],
      gatesDefault: { send: 'approve', delete: 'forbid', pay: 'forbid' },
      limitsDefault: { max_sends_per_day: 15 },
      limitChips: ['max_sends_per_day'],
      skills: [
        {
          id: 'synth-skill',
          name: SYN_SKILL_NAME,
          kind: 'trigger',
          whenToUse: 'When I ask for the synthetic check.',
          inputs: 'The synthetic input.',
          steps: ['Do the first synthetic thing.', 'Do the second synthetic thing.'],
          validate: 'Both synthetic things were done.',
          returns: 'One synthetic line.',
          requiresApproval: 'none',
          actions: [],
        },
      ],
      seeds: [{ id: `pack.${SYN}.seed.1`, line: SYN_SEED }],
      defaultRoles: [],
      rulesLines: [{ id: `pack.${SYN}.rule.1`, line: RULE_BRIEF, origin: 'brief' }],
      profiles: ['muse'],
      ...extra,
    };
  }

  function libWith(pack: WorkflowPack): Library {
    return { ...library, packs: [...library.packs, pack] };
  }

  // Marty's roster build with the synthetic pack, on any profile.
  function synthBuild(target: TargetId, mode?: ChatgptMode, plan?: Plan): Build {
    const base = buildFor(specOf('marty.openclaw'), library);
    const { mode: _mode, plan: _plan, ...rest } = base;
    return {
      ...rest,
      target,
      ...(mode !== undefined ? { mode } : {}),
      ...(plan !== undefined ? { plan } : {}),
      packs: [SYN],
      gates: {},
      limits: {},
    };
  }

  const PROFILES: { name: string; target: TargetId; mode?: ChatgptMode; plan?: Plan }[] = [
    { name: 'openclaw', target: 'openclaw' },
    { name: 'hermes', target: 'hermes' },
    { name: 'grok', target: 'grok' },
    { name: 'chatgpt-dot', target: 'chatgpt', mode: 'dot' },
    { name: 'chatgpt-instructions free', target: 'chatgpt', mode: 'instructions', plan: 'free' },
    { name: 'chatgpt-instructions paid', target: 'chatgpt', mode: 'instructions', plan: 'paid' },
    { name: 'chatgpt-project', target: 'chatgpt', mode: 'project' },
    { name: 'chatgpt-gpt', target: 'chatgpt', mode: 'gpt' },
  ];

  const lib = libWith(synthPack());

  describe('on openclaw', () => {
    const result = compile(synthBuild('openclaw'), lib);
    const agents = result.files.find((f) => f.path === 'AGENTS.md');

    it('keeps its gates in effectiveGates', () => {
      expect(result.gates.send).toBe('approve');
      expect(result.gates.delete).toBe('forbid');
      expect(result.gates.pay).toBe('forbid');
    });

    it('keeps its limits in effect', () => {
      expect(result.limits.max_sends_per_day).toBe(15);
      const limit = library.limits.find((l) => l.id === 'max_sends_per_day');
      expect(agents?.content).toContain((limit as { rulesTemplate: string }).rulesTemplate.replace('{value}', '15'));
    });

    it('keeps its rules lines in AGENTS.md, and the gate rules lines its gates produce', () => {
      expect(agents).toBeDefined();
      expect(agents?.content).toContain(RULE_BRIEF);
      const del = library.gates.find((g) => g.id === 'delete');
      expect(agents?.content).toContain((del as { rulesLine: Record<string, string> }).rulesLine.forbid);
    });

    it('keeps the pack in the result packs list', () => {
      expect(result.packs).toEqual([SYN]);
    });

    it('delivers none of its skills', () => {
      expect(result.files.some((f) => f.label === `Skill: ${SYN_SKILL_NAME}`)).toBe(false);
      expect(result.files.some((f) => f.path.includes('synth-skill'))).toBe(false);
      expect(result.spoken.some((s) => s.label.includes(SYN_SKILL_NAME))).toBe(false);
    });

    it('delivers none of its triggers or seeds', () => {
      expect(result.soul).not.toContain(SYN_TRIGGER);
      expect(result.seed).not.toContain(SYN_SEED);
      for (const s of result.spoken) expect(s.text).not.toContain(SYN_SEED);
    });

    it('is listed as undelivered kind pack, with its label, and adds the warning', () => {
      expect(result.undelivered).toContainEqual({ kind: 'pack', id: SYN, name: SYN_LABEL });
      expect(result.warnings).toContain(`undelivered: ${SYN}`);
    });

    it('lists the pack once, and no skill (the pack is the only thing left out)', () => {
      expect(result.undelivered.filter((u) => u.kind === 'pack')).toHaveLength(1);
      expect(result.undelivered.filter((u) => u.id.includes('synth-skill'))).toEqual([]);
    });
  });

  describe.each(PROFILES)('on $name', ({ target, mode, plan }) => {
    const result = compile(synthBuild(target, mode, plan), lib);
    const profile = profileOf(result, lib);

    it('is listed as undelivered kind pack', () => {
      expect(result.undelivered).toContainEqual({ kind: 'pack', id: SYN, name: SYN_LABEL });
      expect(result.warnings).toContain(`undelivered: ${SYN}`);
    });

    it('keeps its gates and limits in effect', () => {
      expect(result.gates.delete).toBe('forbid');
      expect(result.gates.send).toBe('approve');
      expect(result.limits.max_sends_per_day).toBe(15);
    });

    it('keeps its rules lines where the profile puts rules', () => {
      const where: string[] = [];
      if (profile.rulesDelivery === 'AGENTS.md') {
        where.push(...result.files.filter((f) => f.path === 'AGENTS.md').map((f) => f.content));
      }
      if (profile.rulesInSoul !== 'none') {
        where.push(result.soul);
      }
      if (where.length > 0) {
        expect(where.join('\n')).toContain(RULE_BRIEF);
      }
    });

    it('delivers none of its skills, triggers or seeds', () => {
      expect(result.files.some((f) => f.path.includes('synth-skill'))).toBe(false);
      expect(result.files.some((f) => f.label === `Skill: ${SYN_SKILL_NAME}`)).toBe(false);
      expect(result.spoken.some((s) => s.label.includes(SYN_SKILL_NAME))).toBe(false);
      expect(result.soul).not.toContain(SYN_TRIGGER);
      expect(result.seed).not.toContain(SYN_SEED);
    });

    it('trips none of the field checks: steps, notes and trace', () => {
      expect(result.steps.map((s) => s.text)).toEqual(result.installSteps);
      expect(result.noteItems.map((n) => n.text)).toEqual(result.notes);
      expect(() => traceBundle(result, lib)).not.toThrow();
    });
  });

  describe('on custom-rules ChatGPT Dot', () => {
    const result = compile(synthBuild('chatgpt', 'dot'), lib);

    it('keeps its delete=forbid gate as a custom rule', () => {
      const dot = profileOf(result, lib);
      const rule = result.customRules.find((r) => r.gate === 'delete');
      expect(rule?.setting).toBe(dot.customRuleSettings?.forbid);
    });
  });

  describe('on Muse, which the pack names', () => {
    const result = compile(synthBuild('muse'), lib);

    it('delivers its skill and is not listed as undelivered', () => {
      expect(result.undelivered.filter((u) => u.kind === 'pack')).toEqual([]);
      expect(result.spoken.some((s) => s.label.endsWith(`: ${SYN_SKILL_NAME}`) && s.kind === 'skill')).toBe(true);
      expect(result.warnings.some((w) => w === `undelivered: ${SYN}`)).toBe(false);
    });
  });

  describe('the same pack with no profiles list', () => {
    const open = libWith(synthPack({ profiles: undefined }));
    const result = compile(synthBuild('openclaw'), open);

    it('delivers its skill file on openclaw and is not undelivered', () => {
      expect(result.files.some((f) => f.label === `Skill: ${SYN_SKILL_NAME}`)).toBe(true);
      expect(result.undelivered.filter((u) => u.kind === 'pack')).toEqual([]);
    });
  });

  describe('a pack that names several profiles', () => {
    const two = libWith(synthPack({ profiles: ['muse', 'hermes'] }));

    it('is delivered on each listed profile and undelivered on the others', () => {
      expect(compile(synthBuild('hermes'), two).undelivered.filter((u) => u.kind === 'pack')).toEqual([]);
      expect(compile(synthBuild('muse'), two).undelivered.filter((u) => u.kind === 'pack')).toEqual([]);
      expect(compile(synthBuild('openclaw'), two).undelivered.filter((u) => u.kind === 'pack')).toEqual([
        { kind: 'pack', id: SYN, name: SYN_LABEL },
      ]);
    });
  });

  describe('a cut author rule of a pack the profile cannot deliver (W25)', () => {
    const AUTHOR_ID = `pack.${SYN}.rule.2`;
    const AUTHOR_TEXT = `Synthetic author rule ${'padding '.repeat(600)}end.`;
    const longLib = libWith(
      synthPack({
        rulesLines: [
          { id: `pack.${SYN}.rule.1`, line: RULE_BRIEF, origin: 'brief' },
          { id: AUTHOR_ID, line: AUTHOR_TEXT, origin: 'author' },
        ],
      }),
    );
    const result = compile(synthBuild('hermes'), longLib);

    it('Tier A cuts it from the soul and records it as a pack-rule trim naming the pack', () => {
      expect(result.soul).not.toContain(AUTHOR_TEXT);
      expect(result.trimmed).toContainEqual({ kind: 'pack-rule', id: AUTHOR_ID, text: AUTHOR_TEXT, pack: SYN });
      expect(result.warnings.some((w) => w.startsWith(`length: cut ${AUTHOR_ID}`))).toBe(true);
    });

    it("never cuts Brian's line", () => {
      expect(result.trimmed.some((t) => t.id === `pack.${SYN}.rule.1`)).toBe(false);
    });

    it('keeps the cut rule in AGENTS.md, so it stays in effect', () => {
      const agents = result.files.find((f) => f.path === 'AGENTS.md');
      expect(agents?.content).toContain(AUTHOR_TEXT);
      expect(agents?.content).toContain(RULE_BRIEF);
    });

    it('lists the pack as undelivered too', () => {
      expect(result.undelivered).toContainEqual({ kind: 'pack', id: SYN, name: SYN_LABEL });
    });
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Roles on a profile that cannot compile them are listed as kind roles.

describe('roles on a profile without role support', () => {
  const marty = (target: TargetId, mode?: ChatgptMode, plan?: Plan): Build => {
    const base = buildFor(specOf('marty.openclaw'), library);
    const { mode: _mode, plan: _plan, ...rest } = base;
    return {
      ...rest,
      target,
      ...(mode !== undefined ? { mode } : {}),
      ...(plan !== undefined ? { plan } : {}),
      roles: ['scout', 'risk-manager'],
    };
  };

  it.each([
    ['muse', 'muse', undefined, undefined],
    ['chatgpt-dot', 'chatgpt', 'dot', undefined],
    ['chatgpt-instructions free', 'chatgpt', 'instructions', 'free'],
    ['chatgpt-instructions paid', 'chatgpt', 'instructions', 'paid'],
  ] as const)('%s lists the roles as undelivered and adds a warning', (_name, target, mode, plan) => {
    const result = compile(marty(target, mode, plan));
    const roles = result.undelivered.filter((u) => u.kind === 'roles');
    expect(roles.length).toBeGreaterThan(0);
    for (const r of roles) {
      expect(r.name).not.toBe('');
      expect(result.warnings).toContain(`undelivered: ${r.id}`);
    }
    // No role file is produced.
    expect(result.files.filter((f) => f.role !== undefined)).toEqual([]);
  });

  it.each([
    ['openclaw', 'openclaw', undefined],
    ['hermes', 'hermes', undefined],
    ['grok', 'grok', undefined],
    ['chatgpt-project', 'chatgpt', 'project'],
    ['chatgpt-gpt', 'chatgpt', 'gpt'],
  ] as const)('%s compiles roles and lists none as undelivered', (_name, target, mode) => {
    const result = compile(marty(target, mode));
    expect(result.undelivered.filter((u) => u.kind === 'roles')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 6a. The role fallback line is an install step where no install step shows roles (QUESTIONS W33).
//
// Grok (team), the ChatGPT Project and the custom GPT (separate bundles) ship role files and have
// no install step of their own for them, only a fallback.roles line. When role files ship, that
// line becomes a BundleStep with shows ['roles'] after the other non-closer steps, and it leaves
// noteItems and notes. Its id and its text are the template's. OpenClaw and Hermes have a roles
// step already. Dot, Muse and custom instructions ship no role files, so nothing is promoted.

describe('the role fallback line as an install step (W33)', () => {
  const ROLE_IDS = ['scout', 'risk-manager', 'journal'];
  const ROLE_LABELS = ROLE_IDS.map((id) => library.roles.find((r) => r.id === id)?.label ?? `?${id}`);

  const withRoles = (target: TargetId, mode?: ChatgptMode, plan?: Plan, roles: string[] | null = ROLE_IDS): Build => {
    const base = buildFor(specOf('marty.openclaw'), library);
    const { mode: _mode, plan: _plan, roles: _roles, ...rest } = base;
    return {
      ...rest,
      target,
      ...(mode !== undefined ? { mode } : {}),
      ...(plan !== undefined ? { plan } : {}),
      ...(roles !== null ? { roles } : {}),
    };
  };

  const PROMOTED = [
    ['grok', 'grok', undefined],
    ['chatgpt-project', 'chatgpt', 'project'],
    ['chatgpt-gpt', 'chatgpt', 'gpt'],
  ] as const;

  const tpl = (profileId: string): { id: string; line: string } => {
    const profile = library.targets.profiles.find((p) => p.id === profileId) as Profile;
    return profile.templates['fallback.roles'];
  };

  // The roles-free baseline of the same target, to say what else is in the step list.
  const baselineOf = (target: TargetId, mode?: ChatgptMode): CompileResult =>
    compile(withRoles(target, mode, undefined, null));

  describe.each(PROMOTED)('%s', (id, target, mode) => {
    const result = compile(withRoles(target, mode));
    const record = tpl(id);

    it('has the promoted step: the template id, the filled template text, shows roles, not a closer', () => {
      expect(record.id).toBe(`profile.${id}.fallback.roles`);
      const matches = result.steps.filter((s) => s.id === record.id);
      expect(matches).toEqual([
        {
          id: record.id,
          text: record.line.replaceAll('{roles}', ROLE_LABELS.join(', ')),
          shows: ['roles'],
          closer: false,
        },
      ]);
    });

    it('puts the promoted step after every other non-closer step and before any closer', () => {
      const at = result.steps.findIndex((s) => s.id === record.id);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(result.steps.slice(0, at).every((s) => !s.closer)).toBe(true);
      expect(result.steps.slice(at + 1).every((s) => s.closer)).toBe(true);
      expect(result.steps.filter((s) => !s.closer).at(-1)?.id).toBe(record.id);
    });

    it('leaves the other steps as the roles-free build has them, in the same order', () => {
      const others = result.steps.filter((s) => s.id !== record.id);
      expect(others).toEqual(baselineOf(target, mode).steps);
    });

    it('adds the line to installSteps and removes it from noteItems and notes', () => {
      const step = result.steps.find((s) => s.id === record.id);
      expect(result.installSteps).toContain(step?.text);
      expect(result.installSteps).toEqual(result.steps.map((s) => s.text));
      expect(result.noteItems.filter((n) => n.id === record.id || n.kind === 'role')).toEqual([]);
      expect(result.notes).not.toContain(step?.text);
      expect(result.notes).toEqual(baselineOf(target, mode).notes);
    });

    it('puts the promoted step before a closer on a copy of the library whose last shown install step is a closer', () => {
      const libProfile = library.targets.profiles.find((p) => p.id === id) as Profile;
      // The last step this build shows (a routines step is hidden when the build has no routines).
      const closer = visible(libProfile.installSteps, deliveredOf(result, libProfile)).at(-1) as InstallStep;
      const closerLib: Library = {
        ...library,
        targets: {
          ...library.targets,
          profiles: library.targets.profiles.map((p) =>
            p.id !== id
              ? p
              : { ...p, installSteps: p.installSteps.map((s) => (s.id === closer.id ? { ...s, closer: true } : s)) },
          ),
        },
      };
      const synth = compile(withRoles(target, mode), closerLib);
      const ids = synth.steps.map((s) => s.id);
      expect(ids.at(-1)).toBe(closer.id);
      expect(ids.at(-2)).toBe(record.id);
      expect(synth.steps.at(-1)?.closer).toBe(true);
      expect(synth.steps.filter((s) => s.closer).map((s) => s.id)).toEqual([closer.id]);
    });

    it('is not promoted when the build has no roles', () => {
      const none = baselineOf(target, mode);
      expect(none.steps.some((s) => s.id === record.id)).toBe(false);
      expect(none.steps.some((s) => s.shows.includes('roles'))).toBe(false);
    });
  });

  it.each([
    ['openclaw', 'openclaw', undefined, 'profile.openclaw.step.4'],
    ['hermes', 'hermes', undefined, 'profile.hermes.step.4'],
  ] as const)('%s already has a roles step and promotes nothing', (id, target, mode, roleStepId) => {
    const result = compile(withRoles(target, mode));
    const profile = library.targets.profiles.find((p) => p.id === id) as Profile;
    expect(result.steps.filter((s) => s.shows.includes('roles')).map((s) => s.id)).toEqual([roleStepId]);
    expect(result.steps.map((s) => s.id)).toEqual(
      expectedSteps(profile, result).map((s) => s.id),
    );
    for (const s of result.steps) {
      expect(profile.installSteps.map((r) => r.id), s.id).toContain(s.id);
    }
    expect(result.noteItems.filter((n) => n.kind === 'role')).toEqual([]);
  });

  it('keeps the fallback.roles line as a note on chatgpt-dot, where no role files ship', () => {
    const result = compile(withRoles('chatgpt', 'dot'));
    const record = tpl('chatgpt-dot');
    expect(result.files.filter((f) => f.role !== undefined)).toEqual([]);
    expect(result.steps.some((s) => s.id === record.id || s.shows.includes('roles'))).toBe(false);
    expect(result.noteItems.filter((n) => n.kind === 'role')).toEqual([
      { id: record.id, text: record.line.replaceAll('{roles}', ROLE_LABELS.join(', ')), kind: 'role' },
    ]);
    expect(result.notes).toContain(record.line.replaceAll('{roles}', ROLE_LABELS.join(', ')));
  });

  it.each([
    ['muse', 'muse', undefined, undefined],
    ['chatgpt-instructions free', 'chatgpt', 'instructions', 'free'],
    ['chatgpt-instructions paid', 'chatgpt', 'instructions', 'paid'],
  ] as const)('%s ships no role files, promotes no step and keeps its fallback.none line as a note', (name, target, mode, plan) => {
    const result = compile(withRoles(target, mode, plan));
    const profileId = name.startsWith('chatgpt-instructions') ? 'chatgpt-instructions' : name;
    const none = (library.targets.profiles.find((p) => p.id === profileId) as Profile).templates['fallback.none'];
    expect(result.files.filter((f) => f.role !== undefined)).toEqual([]);
    expect(result.steps.some((s) => s.shows.includes('roles'))).toBe(false);
    expect(result.steps.some((s) => s.id.endsWith('.fallback.roles') || s.id.endsWith('.fallback.none'))).toBe(false);
    expect(result.steps).toEqual(compile(withRoles(target, mode, plan, null)).steps);
    expect(result.noteItems.filter((n) => n.kind === 'role')).toEqual([{ id: none.id, text: none.line, kind: 'role' }]);
  });
});

// ---------------------------------------------------------------------------------------------
// 6b. Role soul trims (W25; plan section 1: every Tier A cut and Tier B short form is recorded).
// A role soul goes through the same length tiers as the main soul, and its cuts belong in
// `trimmed` too. The role goldens never show a cut that only a role soul made: on rook.hermes.roles
// the main soul and every role soul cut the same rules and switch to the same short forms.

describe('a cut the main soul and every role soul make', () => {
  const result = compiled(specOf('rook.hermes.roles'));
  const coding = library.packs.find((p) => p.id === 'coding');

  // Tier A cuts every author line of a pack and keeps Brian's lines (origin 'brief').
  const authorIds = (coding?.rulesLines ?? []).filter((l) => l.origin !== 'brief').map((l) => l.id);

  it('premise: the role souls cut those rules again, so the warnings outnumber the entries', () => {
    expect(authorIds.length).toBeGreaterThan(0);
    const roleCuts = result.warnings.filter((w) => w.startsWith('roles: cut '));
    expect(roleCuts.length).toBeGreaterThan(authorIds.length);
  });

  it('is one trimmed entry per rule, whatever the number of souls that cut it', () => {
    const ruleIds = result.trimmed.filter((t) => t.kind === 'pack-rule').map((t) => t.id);
    expect(new Set(ruleIds)).toEqual(new Set(authorIds));
    expect(ruleIds).toHaveLength(authorIds.length);
  });

  it('is one trimmed entry per shortened chassis line', () => {
    const shortIds = result.trimmed.filter((t) => t.kind === 'chassis-short').map((t) => chassisBase(t.id));
    expect(shortIds.length).toBeGreaterThan(0);
    expect(new Set(shortIds).size).toBe(shortIds.length);
  });
});

// A synthetic library gives one role a long mission line, so that role's soul goes over a cap that
// the main soul and the other role souls stay under. The pack carries Brian's line and two author
// lines, so Tier A has something to cut.
describe('a role soul over its length cap', () => {
  const SYN = 'synth-role-cut';
  const BRIEF = { id: `pack.${SYN}.rule.1`, line: 'Synthetic brief rule stays in force.', origin: 'brief' as const };
  const AUTHOR = [
    { id: `pack.${SYN}.rule.2`, line: 'Synthetic author rule two, left out to fit.', origin: 'author' as const },
    { id: `pack.${SYN}.rule.3`, line: 'Synthetic author rule three, left out to fit.', origin: 'author' as const },
  ];
  const ROLES = ['lead', 'searcher', 'synthesizer', 'fact-checker'];
  const PADDED = 'searcher';
  const PADDING = ' Synthetic padding sentence for the role soul length check.'.repeat(40);

  const pack: WorkflowPack = {
    id: SYN,
    label: 'Synthetic role cut',
    triggers: [],
    gatesDefault: {},
    limitsDefault: {},
    limitChips: [],
    skills: [],
    seeds: [],
    defaultRoles: [],
    rulesLines: [BRIEF, ...AUTHOR],
  };

  function fixtureLib(padded: boolean): Library {
    return {
      ...library,
      packs: [...library.packs, pack],
      roles: padded
        ? library.roles.map((r) =>
            r.id === PADDED ? { ...r, mission: { ...r.mission, line: r.mission.line + PADDING } } : r,
          )
        : library.roles,
    };
  }

  // Sol's roster build with the synthetic pack and the research roles, so the main soul is small.
  function roleBuild(target: 'hermes' | 'grok'): Build {
    const base = buildFor({ id: `sol.${target}.role-cut`, starter: 'sol', target, roles: ROLES }, library);
    return { ...base, packs: [SYN], gates: {}, limits: {} };
  }

  describe.each(['hermes', 'grok'] as const)('on %s', (target) => {
    const lib = fixtureLib(true);
    const build = roleBuild(target);
    const result = compile(build, lib);
    const profile = profileOf(result, lib);
    const cap = profile.lengthCap as number;
    const soulFiles = result.files.filter((f) => f.role !== undefined && f.kind === 'personality');
    const padded = soulFiles.find((f) => f.role === PADDED);
    const others = soulFiles.filter((f) => f.role !== PADDED);

    it('premise: only the padded role soul is over the cap, and the main soul trims nothing', () => {
      expect(typeof profile.lengthCap).toBe('number');
      expect(padded).toBeDefined();
      expect(others.length).toBeGreaterThan(0);
      expect(result.soul.length).toBeLessThanOrEqual(cap);
      for (const f of others) {
        expect(f.content.length, f.path).toBeLessThanOrEqual(cap);
      }
      expect(result.warnings.filter((w) => /^length: (cut|dropped|chassis)/.test(w))).toEqual([]);
    });

    it('control: without the padding the same build trims nothing', () => {
      const plain = compile(build, fixtureLib(false));
      expect(plain.trimmed).toEqual([]);
      expect(plain.warnings.filter((w) => w.startsWith('roles:'))).toEqual([]);
    });

    it('Tier A: records each author pack rule the role soul cut, with its library text and pack', () => {
      for (const rule of AUTHOR) {
        expect(
          result.warnings.some((w) => w.startsWith(`roles: cut ${rule.id} `)),
          `a roles: cut warning for ${rule.id}`,
        ).toBe(true);
        expect(result.trimmed).toContainEqual(
          expect.objectContaining({ kind: 'pack-rule', id: rule.id, text: rule.line, pack: SYN }),
        );
      }
      const cutIds = result.trimmed.filter((t) => t.kind === 'pack-rule').map((t) => t.id);
      expect(new Set(cutIds)).toEqual(new Set(AUTHOR.map((r) => r.id)));
    });

    it("Tier A: never records Brian's line, which stays in the padded soul", () => {
      expect(result.trimmed.some((t) => t.id === BRIEF.id)).toBe(false);
      expect(padded?.content).toContain(BRIEF.line);
    });

    it('Tier A: the cut lines are gone from the padded role soul only', () => {
      for (const rule of AUTHOR) {
        expect(padded?.content, `padded soul ${rule.id}`).not.toContain(rule.line);
        expect(result.soul, `main soul ${rule.id}`).toContain(rule.line);
        for (const f of others) {
          expect(f.content, `${f.path} ${rule.id}`).toContain(rule.line);
        }
      }
    });

    it('Tier B: records the shortened chassis lines if the profile starts on the full chassis, else none', () => {
      const shortTrims = result.trimmed.filter((t) => t.kind === 'chassis-short');
      const switched = result.warnings.some((w) => w.startsWith(ROLE_SHORT_FORM_WARNING));
      if (profile.chassisForm !== 'full') {
        // The chassis is already short, so there is no further form to switch to.
        expect(switched).toBe(false);
        expect(shortTrims).toEqual([]);
        return;
      }
      expect(switched).toBe(true);
      const changed = changedShortBases(padded?.lines ?? [], profile);
      expect(changed.length).toBeGreaterThan(0);
      expect(new Set(shortTrims.map((t) => chassisBase(t.id)))).toEqual(new Set(changed));
      for (const t of shortTrims) {
        expect(t.text, t.id).toBe(libraryTextOf(t, build, profile));
      }
    });

    it('the golden-wide trimmed checks hold on it, and the bundle traces clean', () => {
      const { main, roleOnly } = warnedTrimIds(result, profile);
      expect(main).toEqual([]);
      expect(roleOnly.length).toBeGreaterThan(0);
      const ruleIds = result.trimmed.filter((t) => t.kind === 'pack-rule').map((t) => t.id);
      expect(new Set(ruleIds)).toEqual(new Set(roleOnly));
      expect(() => traceBundle(result, lib)).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------------------------
// 7. The step and verify tags (W3), on a tagged copy of the library. The real profiles carry no
// tags until slice 4.1 lands, so the copy sets them and the expected lists are written by hand
// from the plan: `when` is any-of, a step with no `when` always shows, closers render last.

describe('step and verify tags', () => {
  // Position in the profile's installSteps (1-based) -> tags.
  const STEP_TAGS: Record<number, Partial<InstallStep>> = {
    1: { closer: true },
    2: { when: ['skills'], shows: ['skills'] },
    3: { when: ['routines'], shows: ['routines'] },
    4: { when: ['roles'], shows: ['roles'] },
    5: { when: ['routines', 'roles'] },
    6: { shows: ['personality', 'rules'] },
  };

  const taggedLib: Library = {
    ...library,
    targets: {
      ...library.targets,
      profiles: library.targets.profiles.map((p) => ({
        ...p,
        installSteps: p.installSteps.map((step, i) => {
          const { when: _when, closer: _closer, shows: _shows, ...bare } = step;
          return { ...bare, ...(STEP_TAGS[i + 1] ?? {}) };
        }),
        verify: p.verify.map((v, i) => {
          const { when: _when, ...bare } = v;
          // The first verify line is a role-only line.
          return i === 0 ? { ...bare, when: ['roles'] as StepWhen[] } : bare;
        }),
      })),
    },
  };

  const base = buildFor(specOf('marty.openclaw'), library);
  // Marty has skills (files) and one routine (spoken) on openclaw.
  const withRoles: Build = { ...base, roles: ['scout'] };
  // No skill, no routine: no pack, and a chip with neither. Risk is dropped (no Markets chip).
  const { risk: _risk, ...noRiskStats } = base.stats;
  const bare: Build = {
    ...base,
    chips: ['nba'],
    packs: [],
    limits: {},
    gates: {},
    stats: noRiskStats,
    heart: { hardPart: 'forget', d1: 'd1.forget', d2: 'd2.blunt.4' },
  };
  // One trigger skill (Solana's Wallet glance), no routine.
  const skillsOnly: Build = { ...bare, chips: ['solana'], stats: base.stats };

  const stepIds = (result: CompileResult): string[] => result.steps.map((s) => s.id.split('.').at(-1) as string);
  const verifyIds = (result: CompileResult): string[] => result.verify.map((v) => v.id.split('.').at(-1) as string);

  it('the tagged library is a fixture with the tags it says', () => {
    const oc = taggedLib.targets.profiles.find((p) => p.id === 'openclaw') as Profile;
    expect(oc.installSteps.map((s) => s.when)).toEqual([
      undefined,
      ['skills'],
      ['routines'],
      ['roles'],
      ['routines', 'roles'],
      undefined,
    ]);
  });

  it('openclaw with skills and a routine hides only the roles step; the closer goes last', () => {
    const result = compile(base, taggedLib);
    expect(stepIds(result)).toEqual(['2', '3', '5', '6', '1']);
    expect(result.installSteps).toEqual(result.steps.map((s) => s.text));
  });

  it('openclaw with roles shows every step; the closer goes last', () => {
    const result = compile(withRoles, taggedLib);
    expect(stepIds(result)).toEqual(['2', '3', '4', '5', '6', '1']);
  });

  it('a build with no skills and no routines hides every skill, routine and role step', () => {
    const result = compile(bare, taggedLib);
    expect(result.files.some((f) => f.label.startsWith('Skill: '))).toBe(false);
    expect(result.spoken.some((s) => s.label.startsWith('Routine: '))).toBe(false);
    expect(stepIds(result)).toEqual(['6', '1']);
  });

  it('a build with a skill and no routine shows the skills step but not the routines step', () => {
    const result = compile(skillsOnly, taggedLib);
    expect(result.files.some((f) => f.label.startsWith('Skill: '))).toBe(true);
    expect(result.spoken.some((s) => s.label.startsWith('Routine: '))).toBe(false);
    expect(stepIds(result)).toEqual(['2', '6', '1']);
  });

  it('a step with an any-of when shows if roles alone are delivered', () => {
    const result = compile({ ...bare, roles: ['scout'] }, taggedLib);
    expect(stepIds(result)).toEqual(['4', '5', '6', '1']);
  });

  it('roles on a profile that does not compile them do not count: Muse hides the roles step', () => {
    const muse: Build = { ...base, target: 'muse', roles: ['scout'] };
    delete (muse as { mode?: ChatgptMode }).mode;
    const result = compile(muse, taggedLib);
    // Muse carries skills and the routine as spoken items; its roles are undelivered.
    expect(stepIds(result)).toEqual(['2', '3', '1']);
    expect(result.undelivered.some((u) => u.kind === 'roles')).toBe(true);
  });

  it('shows passes through from the profile step, and is empty when the step has none', () => {
    const result = compile(withRoles, taggedLib);
    const shows = Object.fromEntries(result.steps.map((s) => [s.id.split('.').at(-1), s.shows]));
    expect(shows['2']).toEqual(['skills']);
    expect(shows['3']).toEqual(['routines']);
    expect(shows['4']).toEqual(['roles']);
    expect(shows['5']).toEqual([]);
    expect(shows['6']).toEqual(['personality', 'rules']);
    expect(shows['1']).toEqual([]);
  });

  it('closer is true only on the closer step', () => {
    const result = compile(withRoles, taggedLib);
    expect(result.steps.filter((s) => s.closer).map((s) => s.id.split('.').at(-1))).toEqual(['1']);
  });

  it('the profile record text is unchanged by the tags', () => {
    const result = compile(base, taggedLib);
    const plain = compile(base, library);
    // Every step the tags leave visible says exactly what the untagged profile says.
    expect(result.steps.length).toBeGreaterThan(0);
    for (const step of result.steps) {
      expect(step.text).toBe(plain.steps.find((s) => s.id === step.id)?.text);
    }
  });

  it('a role-only verify line is hidden without roles and shown with them, in library order', () => {
    const without = compile(base, taggedLib);
    expect(verifyIds(without)).toEqual(['2']);
    const withR = compile(withRoles, taggedLib);
    expect(verifyIds(withR)).toEqual(['1', '2']);
  });

  it('a hidden verify line is hidden in noteItems and notes too, so notes still equal noteItems text', () => {
    const without = compile(base, taggedLib);
    const hidden = (taggedLib.targets.profiles.find((p) => p.id === 'openclaw') as Profile).verify[0];
    expect(without.noteItems.some((n) => n.id === hidden.id)).toBe(false);
    expect(without.notes).not.toContain(hidden.line);
    expect(without.noteItems.map((n) => n.text)).toEqual(without.notes);
    expect(without.verify).toEqual(without.noteItems.filter((n) => n.kind === 'verify'));
  });

  it('traces clean on the tagged library', () => {
    for (const build of [base, withRoles, bare, skillsOnly]) {
      const result = compile(build, taggedLib);
      expect(() => traceBundle(result, taggedLib)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 8. traceBundle covers the new fields.

describe('traceBundle on the structured fields', () => {
  const result = compiled(specOf('marty.openclaw'));
  const gpt = compiled(GPT_SPECS[0]);

  it('passes on an unmodified result, on every golden and on the GPT', () => {
    expect(() => traceBundle(result, library)).not.toThrow();
    expect(() => traceBundle(gpt, library)).not.toThrow();
    for (const spec of GOLDEN_SPECS) {
      expect(() => traceBundle(compiled(spec), library), spec.id).not.toThrow();
    }
  });

  it('throws when a step id is replaced with a bogus id', () => {
    const bogus: CompileResult = {
      ...result,
      steps: result.steps.map((s, i) => (i === 0 ? { ...s, id: 'bogus.step.id' } : s)),
    };
    expect(() => traceBundle(bogus, library)).toThrow(/bogus\.step\.id/);
  });

  it('throws when the last step id is bogus, wherever it sits', () => {
    const last = result.steps.length - 1;
    const bogus: CompileResult = {
      ...result,
      steps: result.steps.map((s, i) => (i === last ? { ...s, id: 'not.a.record' } : s)),
    };
    expect(() => traceBundle(bogus, library)).toThrow(/not\.a\.record/);
  });

  it('throws when a note id is replaced with a bogus id', () => {
    const bogus: CompileResult = {
      ...result,
      noteItems: result.noteItems.map((n, i) => (i === 0 ? { ...n, id: 'bogus.note.id' } : n)),
    };
    expect(() => traceBundle(bogus, library)).toThrow(/bogus\.note\.id/);
  });

  it('throws when a starter id is bogus', () => {
    const bogus: CompileResult = { ...gpt, starterIds: gpt.starterIds.map((ids, i) => (i === 1 ? ['bogus.probe'] : ids)) };
    expect(() => traceBundle(bogus, library)).toThrow(/bogus\.probe/);
  });

  it('throws when the description id is bogus', () => {
    const bogus: CompileResult = { ...gpt, descriptionIds: ['bogus.description', ...gpt.descriptionIds.slice(1)] };
    expect(() => traceBundle(bogus, library)).toThrow(/bogus\.description/);
  });

  it('throws when a build name id is bogus', () => {
    const bogus: CompileResult = { ...result, buildNameIds: ['bogus.name', ...result.buildNameIds.slice(1)] };
    expect(() => traceBundle(bogus, library)).toThrow(/bogus\.name/);
  });

  it('throws when installSteps no longer match steps', () => {
    const bogus: CompileResult = { ...result, installSteps: [...result.installSteps.slice(1)] };
    expect(() => traceBundle(bogus, library)).toThrow();
    const edited: CompileResult = {
      ...result,
      installSteps: result.installSteps.map((t, i) => (i === 0 ? `${t} (edited)` : t)),
    };
    expect(() => traceBundle(edited, library)).toThrow();
  });

  it('throws when notes no longer match noteItems', () => {
    const bogus: CompileResult = { ...result, notes: [...result.notes.slice(1)] };
    expect(() => traceBundle(bogus, library)).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// 9. Venue notes ride along as kind venue (a pack the profile delivers).

describe('venue notes', () => {
  it('the Perps pack venue note is a venue note on openclaw, from the pack record', () => {
    const base = buildFor(specOf('marty.openclaw'), library);
    const result = compile({
      ...base,
      packs: ['memecoins', 'perps'],
      limits: {},
      gates: {},
    });
    const perps = library.packs.find((p) => p.id === 'perps') as WorkflowPack;
    const note = perps.venueNotes?.openclaw;
    expect(note).toBeDefined();
    expect(result.noteItems).toContainEqual({ id: (note as { id: string }).id, text: (note as { line: string }).line, kind: 'venue' });
    expect(result.notes).toContain((note as { line: string }).line);
  });
});
