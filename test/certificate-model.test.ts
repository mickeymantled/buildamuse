// Certificate model (M4 slice 4.11): src/ui/certificate/model.ts, the pure shape the certificate
// screen renders (docs/M4-PLAN.md section 4, QUESTIONS W5, W6, W14, W16, W17, W25, W32).
//
// The cases are every GOLDEN_SPECS build (55) plus a mode-gpt variant of each roster starter (9).
// Expected text comes from the library tables (gates, packs, roster, profiles, targets) and from the
// plan and QUESTIONS lines, never from copying the model's output. Where a test needs a situation the
// goldens do not reach (an unknown drop id, a one-rule trim, a step that shows nothing), it hands the
// model a synthetic input: the compiled result with one field replaced.

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { capOf, resolveProfile } from '../src/compiler/profile.js';
import { artifactKindOf } from '../src/compiler/types.js';
import type {
  ArtifactKind,
  Build,
  BundleNote,
  CompileResult,
  Profile,
  Trimmed,
} from '../src/compiler/types.js';
import type { Drop } from '../src/share/encode.js';
import { certificateModel, starterIdOf } from '../src/ui/certificate/model.js';
import { copy } from '../src/ui/copy.js';
import type { CertGroup, CertInput, CertModel, SummaryKind } from '../src/ui/certificate/model.js';
import type { ScreenId } from '../src/ui/flow.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---------------------------------------------------------------------------
// Fixed text from the plan, QUESTIONS and the engineer's string list (slice 4.11).
// ---------------------------------------------------------------------------

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

// docs/Build-a-Muse-Build-Spec.md, station 8, Muse install steps (library profile.muse.step.1 to 4).
const MUSE_STEPS = [
  'Paste this over the file in Identity › Soul.',
  'Say this to your Muse in chat.',
  "One at a time. It should confirm each. If it doesn't, say it again in a fresh chat.",
  'Then say hi.',
];
// QUESTIONS B11 (the Paid steer) and W30 (the Dot rules path, verbatim from brief Part C).
const PAID_STEER = 'Packs with money or email gates fit better on Paid. Switch to Paid?';
const DOT_RULES_PATH = 'Settings > Personalization > Permissions > Custom rules';
const DOT_NOTE_ID = 'profile.chatgpt-dot.note.1';
// The library record that carries the creation-off fact for mode gpt. W32 (slice 4.5b) moved it out of
// verify.1 into a note, profile.chatgpt-gpt.note.1, and left the retirement date on the card. A guard
// test in 'summary: deprecated' fails if the library renames it, so the model's own constant and this
// one move together.
const GPT_CREATION_NOTE_ID = 'profile.chatgpt-gpt.note.1';
const RETIREMENT_DATE = 'Dec 11, 2026';
// Plan section 4 summary order, and the engineer's group headings.
const SUMMARY_ORDER: readonly SummaryKind[] = [
  'auto',
  'over',
  'steer',
  'trimmed',
  'dropped',
  'undelivered',
  'deprecated',
];

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

interface Case {
  id: string;
  build: Build;
  profile: Profile;
  result: CompileResult;
  input: CertInput;
  model: CertModel;
}

function inputFor(build: Build, over: Partial<CertInput> = {}): CertInput {
  const profile = resolveProfile(build, library);
  return {
    result: compile(build),
    build,
    profile,
    cap: capOf(profile, build),
    skipped: [],
    drops: [],
    decodeWarnings: [],
    starterId: starterIdOf(build),
    ...over,
  };
}

function makeCase(id: string, build: Build, input: CertInput = inputFor(build)): Case {
  return {
    id,
    build,
    profile: input.profile,
    result: input.result,
    input,
    model: certificateModel(input),
  };
}

const SPEC_CASES: Case[] = GOLDEN_SPECS.map((spec) => makeCase(spec.id, buildFor(spec, library)));
// The gpt mode is hidden, so no golden covers it. Each starter gets a gpt variant here.
const GPT_CASES: Case[] = library.roster.map((entry) =>
  makeCase(`${entry.id}.chatgpt-gpt`, migrate(entry.build, { target: 'chatgpt', mode: 'gpt' })),
);
const CASES: Case[] = [...SPEC_CASES, ...GPT_CASES];

function caseOf(id: string): Case {
  const found = CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
}

// A model for a synthetic input: the case's input with some fields replaced.
function modelWith(c: Case, over: Partial<CertInput>): CertModel {
  return certificateModel({ ...c.input, ...over });
}

// The case's compiled result with some fields replaced.
function modelWithResult(c: Case, patch: Partial<CompileResult>, over: Partial<CertInput> = {}): CertModel {
  return certificateModel({ ...c.input, result: { ...c.result, ...patch }, ...over });
}

function groupsOf(m: CertModel): CertGroup[] {
  return [...m.steps.flatMap((s) => s.groups), ...m.extra];
}

function blocksOf(m: CertModel) {
  return groupsOf(m).flatMap((g) => g.blocks);
}

function summaryKinds(m: CertModel): SummaryKind[] {
  return m.summary.map((s) => s.kind);
}

function summaryOf(m: CertModel, kind: SummaryKind) {
  return m.summary.filter((s) => s.kind === kind);
}

// The text of every string the model composes itself (not a library or bundle line).
function modelAuthoredStrings(m: CertModel): string[] {
  return [...m.summary.flatMap((s) => [s.text, ...(s.items ?? [])]), ...m.skipped];
}

// Every string anywhere in a value, so a sentence can be counted across the whole page.
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

// How many times `needle` occurs in the strings of the model. A needle must not be empty.
function countIn(m: CertModel, needle: string): number {
  if (needle === '') throw new Error('countIn needs a non-empty needle');
  return stringsIn(m).reduce((total, str) => total + str.split(needle).length - 1, 0);
}

const gateLabel = (id: string): string => library.gates.find((g) => g.id === id)?.label ?? `?${id}`;
const packLabel = (id: string): string => library.packs.find((p) => p.id === id)?.label ?? `?${id}`;

// F3a: a Left out block for a cut pack rule is titled "<pack label>, rule n", where the pack is the one
// whose rulesLines hold the rule id and n counts that pack's blocks in the order shown, from 1.
// Returns one title per id, in order. An id no pack holds gets its own id back.
function packRuleTitles(ruleIds: readonly string[]): string[] {
  const counts = new Map<string, number>();
  return ruleIds.map((id) => {
    const pack = library.packs.find((p) => p.rulesLines.some((l) => l.id === id));
    if (pack === undefined) return id;
    const n = (counts.get(pack.id) ?? 0) + 1;
    counts.set(pack.id, n);
    return `${pack.label}, rule ${n}`;
  });
}

interface LeftOutLine {
  id: string; // limit.<id> or the pack rule id
  title: string;
  text: string;
}

// F3a: a profile whose rulesDelivery is custom-rules (the ChatGPT dot) carries only gates, so every
// limit line and every pack rules line of the build is left out. Derived from the library tables:
// limit lines are the packs' limitsDefault merged by each limit's `stricter` direction with the build's
// own limits on top, in the library's limit order, filled into the limit's rulesTemplate and titled with
// its label. Pack rule lines are each pack's rulesLines in build pack order.
function dotLeftOutLines(build: Build): LeftOutLine[] {
  const values = new Map<string, number>();
  for (const packId of build.packs) {
    const pack = library.packs.find((p) => p.id === packId);
    for (const [id, value] of Object.entries(pack?.limitsDefault ?? {})) {
      const current = values.get(id);
      const stricter = library.limits.find((l) => l.id === id)?.stricter;
      if (current === undefined) values.set(id, value);
      else values.set(id, stricter === 'higher' ? Math.max(current, value) : Math.min(current, value));
    }
  }
  for (const [id, value] of Object.entries(build.limits)) values.set(id, value);
  const limits: LeftOutLine[] = library.limits
    .filter((l) => values.has(l.id))
    .map((l) => ({
      id: `limit.${l.id}`,
      title: l.label,
      text: l.rulesTemplate.replaceAll('{value}', String(values.get(l.id))),
    }));
  const ruleIds = build.packs.flatMap(
    (id) => library.packs.find((p) => p.id === id)?.rulesLines.map((l) => l.id) ?? [],
  );
  const titles = packRuleTitles(ruleIds);
  const rules: LeftOutLine[] = ruleIds.map((id, i) => ({
    id,
    title: titles[i] ?? id,
    text: library.packs.flatMap((p) => p.rulesLines).find((l) => l.id === id)?.line ?? '',
  }));
  return [...limits, ...rules];
}

const isCustomRules = (c: Case): boolean => c.profile.rulesDelivery === 'custom-rules';

// How many "Not included on ChatGPT: your limits and N pack rules" lines a case shows: one when the
// profile is custom-rules and the build has any limit or pack rules line, else none.
const dotSummaryCount = (c: Case): number => (isCustomRules(c) && dotLeftOutLines(c.build).length > 0 ? 1 : 0);

// ---------------------------------------------------------------------------
// The case list itself
// ---------------------------------------------------------------------------

describe('certificate model cases', () => {
  it('covers the 55 golden builds plus one gpt variant per roster starter', () => {
    expect(GOLDEN_SPECS.length).toBe(55);
    expect(library.roster.length).toBe(9);
    expect(GPT_CASES.length).toBe(9);
    expect(CASES.length).toBe(64);
    expect(GPT_CASES.every((c) => c.profile.id === 'chatgpt-gpt')).toBe(true);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// Per-build invariants
// ---------------------------------------------------------------------------

for (const c of CASES) {
  describe(c.id, () => {
    // Plan section 4 tests: every file content, spoken text, starter and the description once.
    it('shows every file, spoken item, starter and the description in exactly one block', () => {
      const r = c.result;
      const expected = [
        ...r.files.map((f) => [artifactKindOf(f), f.content]),
        ...r.spoken.map((s) => [artifactKindOf(s), s.text]),
        ...(r.conversationStarters ?? []).map((t) => ['starters', t]),
        ...(r.description !== undefined ? [['description', r.description]] : []),
      ].map((pair) => JSON.stringify(pair));
      const actual = blocksOf(c.model)
        .filter((b) => b.kind !== 'label' && b.kind !== 'mine')
        .map((b) => JSON.stringify([b.kind, b.text]));
      expect(actual.sort()).toEqual(expected.sort());
    });

    it('shows the Grok label once on Grok and never elsewhere', () => {
      const labels = blocksOf(c.model).filter((b) => b.kind === 'label');
      if (c.profile.id === 'grok') {
        expect(labels.length).toBe(1);
        expect(labels[0]?.text).toBe(c.result.buildName);
      } else {
        expect(labels).toEqual([]);
      }
    });

    it('puts each block under the first step that shows its kind, or in extra when none does', () => {
      const steps = c.result.steps;
      const firstShowing = (kind: ArtifactKind): number => steps.findIndex((s) => s.shows.includes(kind));
      for (const step of c.model.steps) {
        const at = steps.findIndex((s) => s.id === step.id);
        for (const g of step.groups) {
          for (const b of g.blocks) {
            expect(firstShowing(b.kind as ArtifactKind), `${step.id} ${b.title}`).toBe(at);
          }
        }
      }
      for (const g of c.model.extra) {
        for (const b of g.blocks) expect(firstShowing(b.kind as ArtifactKind), b.title).toBe(-1);
      }
    });

    it('lists the groups of a step in the order the step shows its kinds', () => {
      for (const step of c.model.steps) {
        const shows = c.result.steps.find((s) => s.id === step.id)?.shows ?? [];
        const kinds = step.groups.map((g) => g.blocks[0]?.kind as ArtifactKind);
        const positions = kinds.map((k) => shows.indexOf(k));
        expect(positions.every((p) => p >= 0), step.id).toBe(true);
        expect([...positions].sort((a, b) => a - b), step.id).toEqual(positions);
      }
    });

    it('shows each custom rule once, with the library action text and the profile setting label', () => {
      const tables = c.model.steps.flatMap((s) => (s.customRules ? [s.customRules] : []));
      if (c.result.customRules.length === 0) {
        expect(tables).toEqual([]);
        return;
      }
      expect(tables.length).toBe(1);
      const rows = tables[0]?.rows ?? [];
      expect(rows).toEqual(c.result.customRules);
      expect(new Set(rows.map((r) => r.gate)).size).toBe(rows.length);
      const labels = c.profile.customRuleSettings;
      expect(labels).toBeDefined();
      for (const row of rows) {
        const gate = library.gates.find((g) => g.id === row.gate);
        expect(row.action, row.gate).toBe(gate?.customRuleText);
        const setting = c.result.gates[row.gate];
        expect(setting).toBeDefined();
        if (setting !== undefined && labels !== undefined) expect(row.setting, row.gate).toBe(labels[setting]);
      }
    });

    it('never shows "verify:" in a block, a custom rule or a caption', () => {
      for (const b of blocksOf(c.model)) expect(b.text, b.title).not.toContain('verify:');
      for (const s of c.model.steps) {
        if (!s.customRules) continue;
        expect(s.customRules.caption).not.toContain('verify:');
        for (const row of s.customRules.rows) {
          expect(row.action).not.toContain('verify:');
          expect(row.setting).not.toContain('verify:');
        }
      }
    });

    it('keeps the rules artifact and customRules under a step, never in extra', () => {
      expect(c.model.extra.flatMap((g) => g.blocks).filter((b) => b.kind === 'rules')).toEqual([]);
      const rulesFiles = c.result.files.filter((f) => artifactKindOf(f) === 'rules');
      const inSteps = c.model.steps.flatMap((s) => s.groups.flatMap((g) => g.blocks));
      for (const f of rulesFiles) {
        expect(inSteps.filter((b) => b.kind === 'rules' && b.text === f.content).length, f.path).toBe(1);
      }
      if (c.result.customRules.length > 0) {
        expect(c.model.steps.filter((s) => s.customRules !== undefined).length).toBe(1);
      }
    });

    it('numbers the steps 1..n, puts closers last with n null, and follows the bundle order', () => {
      const numbered = c.model.steps.filter((s) => s.n !== null);
      expect(numbered.map((s) => s.n)).toEqual(numbered.map((_, i) => i + 1));
      const firstCloser = c.model.steps.findIndex((s) => s.n === null);
      if (firstCloser !== -1) {
        expect(c.model.steps.slice(firstCloser).every((s) => s.n === null)).toBe(true);
      }
      expect(c.model.steps.map((s) => s.id)).toEqual(c.result.steps.map((s) => s.id));
      expect(c.model.steps.map((s) => s.text)).toEqual(c.result.steps.map((s) => s.text));
      expect(c.model.steps.filter((s) => s.n === null).length).toBe(
        c.result.steps.filter((s) => s.closer).length,
      );
    });

    it('gives every block and group a unique key and at least one record id', () => {
      const groups = [...groupsOf(c.model), ...(c.model.leftOut ? [c.model.leftOut] : [])];
      const groupKeys = groups.map((g) => g.key);
      expect(new Set(groupKeys).size).toBe(groupKeys.length);
      const blockKeys = groups.flatMap((g) => g.blocks.map((b) => b.key));
      expect(new Set(blockKeys).size).toBe(blockKeys.length);
      for (const b of blocksOf(c.model)) {
        expect(b.ids.length, `${b.key} ${b.title}`).toBeGreaterThan(0);
        expect(b.ids.every((id) => id !== ''), b.key).toBe(true);
      }
    });

    it('sets showFirst to 3 on skills and routines groups and on no other group', () => {
      for (const g of groupsOf(c.model)) {
        const kinds = new Set(g.blocks.map((b) => b.kind));
        const listLike = [...kinds].every((k) => k === 'skills' || k === 'routines');
        if (listLike) expect(g.showFirst, g.key).toBe(3);
        else expect(g.showFirst, g.key).toBeUndefined();
      }
    });

    it('groups role files per role under the library role label', () => {
      const roleOf = new Map<string, string>();
      for (const f of c.result.files) if (f.role !== undefined) roleOf.set(f.content, f.role);
      for (const s of c.result.spoken) if (s.role !== undefined) roleOf.set(s.text, s.role);
      for (const g of groupsOf(c.model)) {
        const roleBlocks = g.blocks.filter((b) => b.kind === 'roles');
        if (roleBlocks.length === 0) continue;
        expect(roleBlocks.length, g.key).toBe(g.blocks.length);
        const roles = new Set(roleBlocks.map((b) => roleOf.get(b.text)));
        expect(roles.size, g.key).toBe(1);
        const [role] = [...roles];
        expect(role).toBeDefined();
        expect(g.heading, g.key).toBe(library.roles.find((r) => r.id === role)?.label);
      }
      const roleGroups = groupsOf(c.model).filter((g) => g.blocks.some((b) => b.kind === 'roles'));
      expect(roleGroups.length).toBe(c.result.roles.length);
    });

    // QUESTIONS W33: where role files ship and no install step shows roles, the fallback.roles line is
    // that step, so the role groups sit under a step that shows roles and never in extra. The line is
    // not a note any more, so nothing leads a role group. Where no role files ship (dot, muse,
    // custom instructions) the role note stays a plain note.
    it('puts every role group under a step that shows roles, never in extra, and keeps the role note out of the bundle when role files ship', () => {
      const roleGroup = (g: CertGroup): boolean => g.blocks.some((b) => b.kind === 'roles');
      expect(c.model.extra.filter(roleGroup)).toEqual([]);
      for (const step of c.model.steps) {
        if (step.groups.some(roleGroup)) {
          expect(c.result.steps.find((s) => s.id === step.id)?.shows, step.id).toContain('roles');
        }
      }
      const roleNotes = c.result.noteItems.filter((n) => n.kind === 'role');
      if (c.result.files.some((f) => artifactKindOf(f) === 'roles')) {
        expect(roleNotes, 'no role note beside role files').toEqual([]);
        expect(c.model.notes.filter((n) => n.kind === 'role')).toEqual([]);
        expect(c.model.steps.filter((s) => s.groups.some(roleGroup)).length).toBeGreaterThan(0);
      } else {
        // No role artifact, so nothing consumed the note.
        for (const note of roleNotes) expect(c.model.notes.map((n) => n.id)).toContain(note.id);
      }
      for (const g of groupsOf(c.model)) {
        if (g.lead !== undefined) expect(roleGroup(g), g.key).toBe(true);
      }
    });

    it('splits the bundle notes into notes and stillChecking, without a "verify:" prefix', () => {
      // Plan section 4 (deprecated): the creation-off fact is shown once in the deprecated summary
      // on a gpt certificate, and the verify list filters the duplicate. Nothing else is filtered.
      const inSummary = new Set<string>(c.build.mode === 'gpt' ? [GPT_CREATION_NOTE_ID] : []);
      const verifyIds = c.result.noteItems
        .filter((n) => n.kind === 'verify' && !inSummary.has(n.id))
        .map((n) => n.id);
      expect(c.model.stillChecking.map((n) => n.id)).toEqual(verifyIds);
      expect(c.model.stillChecking.map((n) => n.id)).toEqual(
        c.result.verify.filter((n) => !inSummary.has(n.id)).map((n) => n.id),
      );
      for (const n of c.model.stillChecking) {
        expect(n.text, n.id).not.toMatch(/^\s*verify:/i);
        expect(n.kind, n.id).toBe('verify');
      }
      // Notes keep their bundle order and hold no verify note. The dot note moves to its table, and a
      // role note, which a real compile no longer leaves beside role files (W33), would lead a role
      // group.
      const consumed = new Set<string>();
      for (const s of c.model.steps) if (s.customRules?.note) consumed.add(s.customRules.note.id);
      for (const g of groupsOf(c.model)) if (g.lead) consumed.add(g.lead.id);
      // W32 made the creation-off record a note, not a verify line: on a gpt certificate it moves into
      // the deprecated summary, so it is no longer in the plain notes list either.
      if (c.build.mode === 'gpt') consumed.add(GPT_CREATION_NOTE_ID);
      const expected = c.result.noteItems
        .filter((n) => n.kind !== 'verify' && !consumed.has(n.id))
        .map((n) => n.id);
      expect(c.model.notes.map((n) => n.id)).toEqual(expected);
      expect(c.model.notes.every((n) => n.kind !== 'verify')).toBe(true);
    });

    it('shows each summary kind exactly when it applies, in page order', () => {
      const m = c.model;
      const autoGates = library.gates.filter((g) => c.result.gates[g.id] === 'auto');
      expect(summaryOf(m, 'auto').length).toBe(autoGates.length > 0 ? 1 : 0);
      if (autoGates.length > 0) {
        expect(summaryOf(m, 'auto')[0]?.items).toEqual(autoGates.map((g) => g.label));
      }
      const over = c.result.length > c.input.cap;
      expect(summaryOf(m, 'over').length).toBe(over ? 1 : 0);
      const free = c.profile.id === 'chatgpt-instructions' && (c.build.plan ?? 'free') === 'free';
      expect(summaryOf(m, 'steer').length).toBe(over && free ? 1 : 0);
      expect(summaryOf(m, 'trimmed').length > 0).toBe(c.result.trimmed.length > 0);
      expect(summaryOf(m, 'dropped')).toEqual([]);
      // One line for what the profile could not deliver (result.undelivered), plus, on the dot, one
      // for the limit and pack rules lines it cannot carry (F3a, the summary-undelivered-dot item).
      expect(summaryOf(m, 'undelivered').length).toBe(
        (c.result.undelivered.length > 0 ? 1 : 0) + dotSummaryCount(c),
      );
      expect(m.summary.some((s) => s.key === 'summary-undelivered-dot')).toBe(dotSummaryCount(c) === 1);
      expect(summaryOf(m, 'deprecated').length).toBe(c.build.mode === 'gpt' ? 1 : 0);
      const ranks = summaryKinds(m).map((k) => SUMMARY_ORDER.indexOf(k));
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      const keys = m.summary.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('fills the header, docs, meter and details from the build, the result and the library', () => {
      const m = c.model;
      expect(m.header.name).toBe(c.build.name);
      expect(m.header.buildName).toBe(c.result.buildName);
      expect(m.header.stats).toEqual(c.build.stats);
      expect(m.header.badges).toEqual(
        c.result.badges.map((id) => ({ id, name: library.badges.find((b) => b.id === id)?.name })),
      );
      expect(m.docs).toEqual({
        label: c.profile.label,
        url: c.profile.docUrl,
        date: c.profile.docReadDate,
      });
      expect(m.meter.length).toBe(c.result.length);
      expect(m.meter.cap).toBe(c.input.cap);
      expect(m.meter.label).toContain(String(c.result.length));
      expect(m.meter.label).toContain(String(c.input.cap));
      expect(m.details).toEqual(c.result.warnings);
      expect(m.skipped).toEqual([]);
    });

    it('offers the zip when a file has delivery "file", with the bundle paths and contents', () => {
      const fileDelivered = c.result.files.filter((f) => f.delivery === 'file');
      if (fileDelivered.length === 0) {
        expect(c.model.zip).toBeUndefined();
        return;
      }
      expect(c.model.zip?.filename).toBe(`${c.build.name.toLowerCase()}-${c.profile.id}.zip`);
      expect(c.model.zip?.files).toEqual(fileDelivered.map((f) => ({ path: f.path, content: f.content })));
    });

    it('shows the roster tagline for an unmodified roster build on any target', () => {
      const starter = c.id.split('.')[0];
      expect(c.input.starterId).toBe(starter);
      expect(c.model.header.tagline).toBe(library.roster.find((r) => r.id === starter)?.tagline);
    });

    it('shows no tagline once the name changes', () => {
      const build: Build = { ...c.build, name: `${c.build.name}2` };
      expect(starterIdOf(build)).toBeUndefined();
      const m = certificateModel(inputFor(build));
      expect(m.header.tagline).toBeUndefined();
      expect(m.header.name).toBe(build.name);
    });

    it('shows the left out list on Muse and Grok (one block per cut pack rule) and on the dot (its limits and pack rules)', () => {
      if (isCustomRules(c)) {
        // A dot carries only gates, so Left out holds every limit line and pack rules line of the build.
        const want = dotLeftOutLines(c.build);
        if (want.length === 0) {
          expect(c.model.leftOut).toBeUndefined();
          expect(c.model.leftOutHint).toBeUndefined();
          return;
        }
        expect(c.model.leftOut?.heading).toBe('Left out');
        const blocks = c.model.leftOut?.blocks ?? [];
        expect(blocks.map((b) => b.text).sort()).toEqual(want.map((l) => l.text).sort());
        expect(blocks.map((b) => b.title).sort()).toEqual(want.map((l) => l.title).sort());
        expect(blocks.map((b) => b.ids[0]).sort()).toEqual(want.map((l) => l.id).sort());
        return;
      }
      const cuts = c.result.trimmed.filter((t) => t.kind === 'pack-rule');
      const wants = (c.profile.id === 'muse' || c.profile.id === 'grok') && cuts.length > 0;
      if (!wants) {
        expect(c.model.leftOut).toBeUndefined();
        return;
      }
      expect(c.model.leftOut?.heading).toBe('Left out');
      const blocks = c.model.leftOut?.blocks ?? [];
      expect(blocks.map((b) => b.text)).toEqual(cuts.map((t) => t.text));
      // Titled "<pack label>, rule n", never the bare pack label.
      expect(blocks.map((b) => b.title)).toEqual(packRuleTitles(cuts.map((t) => t.id)));
      for (const b of blocks) {
        const pack = library.packs.find((p) => p.rulesLines.some((l) => l.id === b.ids[0]));
        expect(pack, b.title).toBeDefined();
        expect(pack?.rulesLines.find((l) => l.id === b.ids[0])?.line, b.ids[0]).toBe(b.text);
        expect(b.title.startsWith(`${pack?.label}, rule `), b.title).toBe(true);
      }
    });

    it('is pure: same input, same model, and the input is left alone', () => {
      const before = JSON.stringify(c.input);
      const again = certificateModel(c.input);
      expect(again).toEqual(c.model);
      expect(JSON.stringify(c.input)).toBe(before);
    });

    it('composes no long dash in its own strings', () => {
      for (const s of modelAuthoredStrings(c.model)) {
        expect(s).not.toContain(EM_DASH);
        expect(s).not.toContain(EN_DASH);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Muse: the spec lines, in order, and Standing instructions (B8)
// ---------------------------------------------------------------------------

describe('Muse steps and Standing instructions', () => {
  const museCases = SPEC_CASES.filter((c) => c.profile.id === 'muse');

  it('has the nine starters on Muse', () => {
    expect(museCases.length).toBe(9);
  });

  for (const c of museCases) {
    it(`${c.id}: the step texts are the spec lines verbatim, in order, with the closer last`, () => {
      // Every starter delivers a skill, so step 3 shows.
      expect(c.model.steps.map((s) => s.text)).toEqual(MUSE_STEPS);
      expect(c.model.steps.map((s) => s.n)).toEqual([1, 2, 3, null]);
      expect(c.model.steps[3]?.groups).toEqual([]);
    });
  }

  it('june shows three standing instructions first, then more behind Show more', () => {
    const june = caseOf('june.muse');
    const step3 = june.model.steps[2];
    expect(step3?.text).toBe(MUSE_STEPS[2]);
    expect(step3?.groups.length).toBe(1);
    const group = step3?.groups[0];
    expect(group?.heading).toBe('Standing instructions');
    expect(group?.showFirst).toBe(3);
    expect(group?.blocks.length).toBeGreaterThan(3);
    // Skills first, then routines.
    const kinds = group?.blocks.map((b) => b.kind) ?? [];
    expect(kinds.slice(0, kinds.indexOf('routines'))).toEqual(
      kinds.slice(0, kinds.indexOf('routines')).map(() => 'skills'),
    );
    expect(kinds.includes('routines')).toBe(true);
    expect(kinds.slice(kinds.indexOf('routines')).every((k) => k === 'routines')).toBe(true);
    // Every skill and routine name from the library for June's chips and packs is in the group.
    const june1 = library.roster.find((r) => r.id === 'june');
    const names = new Set<string>([
      ...(june1?.build.chips ?? []).flatMap(
        (id) => library.chips.find((ch) => ch.id === id)?.skills?.map((s) => s.name) ?? [],
      ),
      ...june.build.packs.flatMap((id) => library.packs.find((p) => p.id === id)?.skills.map((s) => s.name) ?? []),
    ]);
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      expect(
        group?.blocks.filter((b) => b.title.endsWith(name)).length,
        name,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('puts skills and routines in one group on Muse and in separate groups elsewhere', () => {
    for (const c of CASES) {
      const listGroups = groupsOf(c.model).filter((g) =>
        g.blocks.some((b) => b.kind === 'skills' || b.kind === 'routines'),
      );
      for (const g of listGroups) {
        const kinds = new Set(g.blocks.map((b) => b.kind));
        if (c.profile.id === 'muse') {
          expect(g.heading, c.id).toBe('Standing instructions');
        } else {
          expect(kinds.size, `${c.id} ${g.key}`).toBe(1);
          expect(g.heading, `${c.id} ${g.key}`).toBe(kinds.has('skills') ? 'Skills' : 'Routines');
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ChatGPT Dot: the Custom Rules table, its caption and the note
// ---------------------------------------------------------------------------

describe('ChatGPT Dot custom rules table', () => {
  const dotCases = SPEC_CASES.filter((c) => c.profile.id === 'chatgpt-dot');

  it('has the nine starters on Dot', () => {
    expect(dotCases.length).toBe(9);
  });

  it('the library holds the rulesPath record verbatim from the brief', () => {
    const profile = library.targets.profiles.find((p) => p.id === 'chatgpt-dot');
    expect(profile?.rulesPath?.id).toBe('profile.chatgpt-dot.rulesPath');
    expect(profile?.rulesPath?.line).toBe(DOT_RULES_PATH);
  });

  for (const c of dotCases) {
    it(`${c.id}: the caption is the rulesPath line and the note is the dot note`, () => {
      const table = c.model.steps.find((s) => s.customRules !== undefined)?.customRules;
      expect(table).toBeDefined();
      expect(table?.caption).toBe(c.profile.rulesPath?.line);
      expect(table?.caption).toBe(DOT_RULES_PATH);
      const libNote = c.profile.notes?.find((n) => n.id === DOT_NOTE_ID);
      expect(libNote).toBeDefined();
      expect(table?.note?.id).toBe(DOT_NOTE_ID);
      expect(table?.note?.text).toBe(libNote?.line);
      // The note goes with the table, so the plain notes list does not repeat it.
      expect(c.model.notes.map((n) => n.id)).not.toContain(DOT_NOTE_ID);
    });

    it(`${c.id}: the table sits at the library step that shows customRules`, () => {
      const libStep = c.profile.installSteps.find((s) => s.shows?.includes('customRules'));
      expect(libStep).toBeDefined();
      const at = c.model.steps.find((s) => s.customRules !== undefined);
      expect(at?.id).toBe(libStep?.id);
      expect(at?.text).toBe(libStep?.line);
    });
  }

  it('shows the three B6 setting labels on the rows', () => {
    const labels = library.targets.profiles.find((p) => p.id === 'chatgpt-dot')?.customRuleSettings;
    expect(labels).toEqual({
      auto: 'Take action without asking',
      approve: 'Ask before taking action',
      forbid: 'Hand off to you',
    });
    // A build with one gate on each setting: pay is forbid, delete is approve, send is auto.
    const june = caseOf('june.chatgpt-dot');
    const build: Build = { ...june.build, gates: { ...june.build.gates, send: 'auto' } };
    const model = certificateModel(inputFor(build));
    const rows = model.steps.flatMap((s) => s.customRules?.rows ?? []);
    const setting = (gate: string): string | undefined => rows.find((r) => r.gate === gate)?.setting;
    expect(setting('pay')).toBe('Hand off to you');
    expect(setting('delete')).toBe('Ask before taking action');
    expect(setting('send')).toBe('Take action without asking');
  });

  it('puts the table on the first step when no step shows customRules, so no rule is lost', () => {
    const c = caseOf('june.chatgpt-dot');
    const steps = c.result.steps.map((s) => ({ ...s, shows: s.shows.filter((k) => k !== 'customRules') }));
    const m = modelWithResult(c, { steps });
    expect(m.steps[0]?.customRules?.rows).toEqual(c.result.customRules);
    expect(m.steps.filter((s) => s.customRules !== undefined).length).toBe(1);
    expect(m.extra.flatMap((g) => g.blocks).filter((b) => b.kind === 'rules')).toEqual([]);
  });

  it('keeps the dot note out of the notes list only when the table shows', () => {
    const c = caseOf('june.chatgpt-dot');
    const note: BundleNote = { id: DOT_NOTE_ID, text: 'Dot note text', kind: 'note' };
    const withTable = modelWithResult(c, { noteItems: [note] });
    expect(withTable.notes).toEqual([]);
    expect(withTable.steps.find((s) => s.customRules)?.customRules?.note).toEqual(note);
    const noTable = modelWithResult(c, { noteItems: [note], customRules: [] });
    expect(noTable.steps.some((s) => s.customRules !== undefined)).toBe(false);
    expect(noTable.notes).toEqual([note]);
  });
});

// ---------------------------------------------------------------------------
// Summary kinds (W16, W17, W25, W14, plan section 4)
// ---------------------------------------------------------------------------

describe('summary: auto', () => {
  it('lists the gate labels for send set to auto with the personal-ops pack', () => {
    const june = caseOf('june.openclaw');
    expect(june.build.packs).toContain('personal-ops');
    const build: Build = { ...june.build, gates: { ...june.build.gates, send: 'auto' } };
    const m = certificateModel(inputFor(build));
    const [auto] = summaryOf(m, 'auto');
    expect(summaryOf(m, 'auto').length).toBe(1);
    expect(auto?.text).toBe('Auto, no yes asked:');
    expect(auto?.items).toEqual([gateLabel('send')]);
    expect(auto?.items).toEqual(['Outbound messages']);
  });

  it('is absent when no gate is on auto', () => {
    expect(summaryOf(caseOf('june.openclaw').model, 'auto')).toEqual([]);
  });

  it('also shows on Dot, where the rule reads "Take action without asking"', () => {
    const june = caseOf('june.chatgpt-dot');
    const build: Build = { ...june.build, gates: { ...june.build.gates, send: 'auto' } };
    const m = certificateModel(inputFor(build));
    expect(summaryOf(m, 'auto')[0]?.items).toEqual([gateLabel('send')]);
  });

  it('lists several auto gates in registry order, by library label', () => {
    const c = caseOf('june.openclaw');
    const m = modelWithResult(c, { gates: { pay: 'forbid', send: 'auto', trade: 'auto', delete: 'approve' } });
    const order = library.gates.map((g) => g.id);
    const autoIds = ['send', 'trade'].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    expect(summaryOf(m, 'auto')[0]?.items).toEqual(autoIds.map(gateLabel));
  });

  it('reads gate labels from the library it is given', () => {
    const c = caseOf('june.openclaw');
    const lib = { ...library, gates: library.gates.map((g) => (g.id === 'send' ? { ...g, label: 'Zed sends' } : g)) };
    const m = certificateModel(
      { ...c.input, result: { ...c.result, gates: { ...c.result.gates, send: 'auto' } } },
      lib,
    );
    expect(summaryOf(m, 'auto')[0]?.items).toEqual(['Zed sends']);
  });
});

describe('summary: over and steer', () => {
  const free = caseOf('marty.chatgpt-instructions-free');
  const freeCap = (library.targets.profiles.find((p) => p.id === 'chatgpt-instructions')?.lengthCap as {
    free: number;
    paid: number;
  }).free;

  it('marty on free custom instructions is over the free limit', () => {
    expect(free.input.cap).toBe(freeCap);
    expect(free.result.length).toBeGreaterThan(freeCap);
    const [over] = summaryOf(free.model, 'over');
    expect(summaryOf(free.model, 'over').length).toBe(1);
    expect(over?.text).toBe(
      `Your bot's personality is ${free.result.length - freeCap} characters over the ${freeCap} limit for ChatGPT.`,
    );
    expect(free.model.meter.cap).toBe(freeCap);
    expect(free.model.meter.length).toBe(free.result.length);
  });

  it('offers the Paid steer on the same build, with the B11 line', () => {
    const [steer] = summaryOf(free.model, 'steer');
    expect(summaryOf(free.model, 'steer').length).toBe(1);
    expect(steer?.text).toBe(PAID_STEER);
  });

  it('puts over before steer before trimmed and undelivered', () => {
    const kinds = summaryKinds(free.model);
    expect(kinds.indexOf('over')).toBeLessThan(kinds.indexOf('steer'));
    expect(kinds.indexOf('steer')).toBeLessThan(kinds.indexOf('undelivered'));
  });

  it('says "1 character" for a single character over', () => {
    const m = modelWith(free, { cap: free.result.length - 1 });
    expect(summaryOf(m, 'over')[0]?.text).toBe(
      `Your bot's personality is 1 character over the ${free.result.length - 1} limit for ChatGPT.`,
    );
  });

  it('is not over at exactly the cap, and has no steer then', () => {
    const m = modelWith(free, { cap: free.result.length });
    expect(summaryKinds(m)).not.toContain('over');
    expect(summaryKinds(m)).not.toContain('steer');
  });

  it('shows no steer on Paid custom instructions, even when over', () => {
    const paid = caseOf('marty.chatgpt-instructions-paid');
    expect(paid.build.plan).toBe('paid');
    const m = modelWith(paid, { cap: paid.result.length - 5 });
    expect(summaryOf(m, 'over').length).toBe(1);
    expect(summaryOf(m, 'steer')).toEqual([]);
  });

  it('shows no steer on another profile, even when over', () => {
    const dot = caseOf('marty.chatgpt-dot');
    const m = modelWith(dot, { cap: dot.result.length - 5 });
    expect(summaryOf(m, 'over').length).toBe(1);
    expect(summaryOf(m, 'steer')).toEqual([]);
    expect(summaryOf(m, 'over')[0]?.text).toBe(
      `Your bot's personality is 5 characters over the ${dot.result.length - 5} limit for ChatGPT.`,
    );
  });

  it('names the short target in the over line', () => {
    const muse = caseOf('june.muse');
    const m = modelWith(muse, { cap: muse.result.length - 2 });
    expect(summaryOf(m, 'over')[0]?.text).toBe(
      `Your bot's personality is 2 characters over the ${muse.result.length - 2} limit for Muse.`,
    );
  });
});

describe('summary: trimmed', () => {
  it('june on Muse says how many rules from which pack were left out', () => {
    const c = caseOf('june.muse');
    const cuts = c.result.trimmed.filter((t) => t.kind === 'pack-rule');
    expect(cuts.length).toBeGreaterThan(0);
    const byPack = new Map<string, Set<string>>();
    for (const t of cuts) {
      byPack.set(t.pack ?? '', (byPack.get(t.pack ?? '') ?? new Set<string>()).add(t.id));
    }
    const lines = summaryOf(c.model, 'trimmed').map((s) => s.text);
    for (const [pack, ids] of byPack) {
      expect(lines).toContain(`To fit Muse, ${ids.size} rules from ${packLabel(pack)} were left out.`);
    }
    // Every cut record is a real rule of that pack in the library.
    for (const t of cuts) {
      expect(library.packs.find((p) => p.id === t.pack)?.rulesLines.find((l) => l.id === t.id)?.line).toBe(t.text);
    }
  });

  it('june on Muse also lists the cut lines under Left out, with the library rule text', () => {
    const c = caseOf('june.muse');
    const pack = library.packs.find((p) => p.id === 'personal-ops');
    const cuts = c.result.trimmed.filter((t) => t.kind === 'pack-rule');
    expect(c.model.leftOut?.blocks.length).toBe(cuts.length);
    (c.model.leftOut?.blocks ?? []).forEach((b, i) => {
      expect(b.kind).toBe('rules');
      // F3a: "<pack label>, rule n". Every cut here is a personal-ops rule (the text check below), so
      // n is the block's place, counted from 1.
      expect(b.title).toBe(`${pack?.label}, rule ${i + 1}`);
      expect(b.text).toBe(pack?.rulesLines.find((l) => l.id === b.ids[0])?.line);
    });
  });

  const rule = (n: number, extra: Partial<Trimmed> = {}): Trimmed => {
    const line = library.packs.find((p) => p.id === 'personal-ops')?.rulesLines[n];
    if (!line) throw new Error(`no personal-ops rule ${n}`);
    return { kind: 'pack-rule', id: line.id, text: line.line, pack: 'personal-ops', ...extra };
  };

  it('counts a rule once even when several role files cut it', () => {
    const c = caseOf('june.muse');
    const m = modelWithResult(c, {
      trimmed: [rule(0), rule(0, { role: 'triager', path: 'workspace-triager/AGENTS.md' }), rule(1)],
    });
    expect(summaryOf(m, 'trimmed').map((s) => s.text)).toEqual([
      'To fit Muse, 2 rules from Personal ops were left out.',
    ]);
  });

  it('uses the singular for one rule', () => {
    const c = caseOf('june.muse');
    const m = modelWithResult(c, { trimmed: [rule(2)] });
    expect(summaryOf(m, 'trimmed').map((s) => s.text)).toEqual([
      'To fit Muse, 1 rule from Personal ops was left out.',
    ]);
  });

  it('gives one line per pack', () => {
    const c = caseOf('june.muse');
    const other = library.packs.find((p) => p.id !== 'personal-ops' && p.rulesLines.length > 0);
    expect(other).toBeDefined();
    const line = other?.rulesLines[0];
    const m = modelWithResult(c, {
      trimmed: [rule(0), { kind: 'pack-rule', id: line?.id ?? '', text: line?.line ?? '', pack: other?.id }],
    });
    expect(summaryOf(m, 'trimmed').map((s) => s.text)).toEqual([
      'To fit Muse, 1 rule from Personal ops was left out.',
      `To fit Muse, 1 rule from ${other?.label} was left out.`,
    ]);
  });

  it('says one short line for every other cut, counting distinct ids', () => {
    const c = caseOf('june.muse');
    const m = modelWithResult(c, {
      trimmed: [
        { kind: 'stat', id: 'stat.funny.3', text: 'a' },
        { kind: 'stat', id: 'stat.funny.3', text: 'a' },
        { kind: 'trigger', id: 'chip.kids.t1', text: 'b' },
      ],
    });
    expect(summaryOf(m, 'trimmed').map((s) => s.text)).toEqual([
      'To fit Muse, 2 lines were shortened or left out.',
    ]);
    expect(m.leftOut).toBeUndefined();
  });

  it('says "1 line was" for a single other cut', () => {
    const c = caseOf('june.muse');
    const m = modelWithResult(c, { trimmed: [{ kind: 'peeve', id: 'peeve.x', text: 'c' }] });
    expect(summaryOf(m, 'trimmed').map((s) => s.text)).toEqual([
      'To fit Muse, 1 line was shortened or left out.',
    ]);
  });

  it('puts the pack lines before the other-cuts line', () => {
    const c = caseOf('june.muse');
    const m = modelWithResult(c, { trimmed: [{ kind: 'peeve', id: 'peeve.x', text: 'c' }, rule(0)] });
    const texts = summaryOf(m, 'trimmed').map((s) => s.text);
    expect(texts[0]).toContain('rule');
    expect(texts[1]).toContain('shortened or left out');
  });

  it('names the target in each line', () => {
    const c = caseOf('june.grok');
    const m = modelWithResult(c, { trimmed: [rule(0)] });
    expect(summaryOf(m, 'trimmed')[0]?.text).toBe('To fit Grok Bot, 1 rule from Personal ops was left out.');
  });

  it('has no trimmed line and no left out list when nothing was cut', () => {
    const c = caseOf('june.muse');
    const m = modelWithResult(c, { trimmed: [] });
    expect(summaryOf(m, 'trimmed')).toEqual([]);
    expect(m.leftOut).toBeUndefined();
  });

  it('lists left out blocks from the cut rules only for Muse and Grok, never for Hermes, OpenClaw or a ChatGPT project', () => {
    const cut = [rule(0), rule(1)];
    for (const id of ['june.muse', 'june.grok']) {
      const m = modelWithResult(caseOf(id), { trimmed: cut });
      expect(m.leftOut?.blocks.map((b) => b.text), id).toEqual(cut.map((t) => t.text));
      expect(m.leftOut?.heading).toBe('Left out');
    }
    for (const id of ['june.hermes', 'june.openclaw', 'june.chatgpt-project']) {
      const m = modelWithResult(caseOf(id), { trimmed: cut });
      expect(m.leftOut, id).toBeUndefined();
      // The summary line still says so.
      expect(summaryOf(m, 'trimmed').length, id).toBe(1);
    }
  });

  it('on the dot, Left out is the build\'s own pack rules from the library, whatever result.trimmed says', () => {
    // F3a: a dot's Left out comes from the build (limits and every pack rules line), not from the cut list.
    const c = caseOf('june.chatgpt-dot');
    const m = modelWithResult(c, { trimmed: [rule(0), rule(1)] });
    const personalOps = library.packs.find((p) => p.id === 'personal-ops');
    expect(c.build.packs).toEqual(['personal-ops']);
    expect(personalOps?.rulesLines.length).toBeGreaterThan(2);
    expect(m.leftOut?.heading).toBe('Left out');
    expect(m.leftOut?.blocks.map((b) => b.text)).toEqual(personalOps?.rulesLines.map((l) => l.line));
    expect(m.leftOut?.blocks.map((b) => b.title)).toEqual(
      (personalOps?.rulesLines ?? []).map((_, i) => `Personal ops, rule ${i + 1}`),
    );
    // The synthetic cut still produces its trimmed summary line.
    expect(summaryOf(m, 'trimmed').length).toBe(1);
  });

  it('carries the role file path on a left out block for a role-only cut', () => {
    const c = caseOf('june.grok');
    const m = modelWithResult(c, { trimmed: [rule(0, { role: 'triager', path: 'roles/triager.md' }), rule(1)] });
    expect(m.leftOut?.blocks[0]?.path).toBe('roles/triager.md');
    expect(m.leftOut?.blocks[1]?.path).toBeUndefined();
  });

  it('keys left out blocks uniquely', () => {
    const c = caseOf('june.muse');
    const m = modelWithResult(c, { trimmed: [rule(0), rule(1), rule(2)] });
    const keys = m.leftOut?.blocks.map((b) => b.key) ?? [];
    expect(new Set(keys).size).toBe(3);
  });
});

describe('summary: dropped', () => {
  const RAW_UNKNOWN_A = 'zz-raw-unknown-chip-8841';
  const RAW_UNKNOWN_B = 'zz-raw-unknown-peeve-8842';
  const RAW_FALLBACK = 'zz-raw-fallback-base-8843';
  const RAW_UNEXPOSED = 'zz-raw-unexposed-gate-8844';
  const base = caseOf('june.openclaw');
  const limit = library.limits[0];
  const drive = library.heart.drives[0];

  const drops: Drop[] = [
    { field: 'chips', id: RAW_UNKNOWN_A, reason: 'unknown' },
    { field: 'peeves', id: RAW_UNKNOWN_B, reason: 'unknown' },
    { field: 'base', id: RAW_FALLBACK, reason: 'fallback' },
    { field: 'gates', id: 'send', reason: 'unexposed' },
    { field: 'limits', id: limit?.id ?? '', reason: 'unexposed' },
    { field: 'stats', id: 'risk', reason: 'unexposed' },
    { field: 'heart.d1', id: drive?.id ?? '', reason: 'unexposed' },
    { field: 'name', id: 'name', reason: 'cleaned' },
  ];
  // What real decode writes for these drops: counts, never the raw id.
  const decodeWarnings = ['share: dropped unknown chips (1)', 'share: unknown base replaced with the default'];

  it('names known ids by library label and counts the unknown ones', () => {
    const m = modelWith(base, { drops, decodeWarnings });
    const [dropped] = summaryOf(m, 'dropped');
    expect(summaryOf(m, 'dropped').length).toBe(1);
    expect(dropped?.text).toBe('Changed when this link opened:');
    expect([...(dropped?.items ?? [])].sort()).toEqual(
      [
        `${gateLabel('send')} (left out)`,
        `${limit?.label} (left out)`,
        'Risk was removed because no Markets chip is picked.',
        'What it wants first was reset to match the hard part.',
        'The name was tidied up.',
        '3 picks in this link were not recognized, so they were left out or reset.',
      ].sort(),
    );
  });

  it('never puts a raw id from the link anywhere in the model', () => {
    const m = modelWith(base, {
      drops: [...drops, { field: 'gates', id: RAW_UNEXPOSED, reason: 'unexposed' }],
      decodeWarnings,
    });
    const json = JSON.stringify(m);
    for (const raw of [RAW_UNKNOWN_A, RAW_UNKNOWN_B, RAW_FALLBACK, RAW_UNEXPOSED]) {
      expect(json, raw).not.toContain(raw);
    }
  });

  it('counts an unexposed id it cannot find in the library, and does not echo it', () => {
    const m = modelWith(base, { drops: [{ field: 'gates', id: RAW_UNEXPOSED, reason: 'unexposed' }] });
    expect(summaryOf(m, 'dropped')[0]?.items).toEqual([
      '1 pick in this link was not recognized, so it was left out or reset.',
    ]);
    expect(JSON.stringify(m)).not.toContain(RAW_UNEXPOSED);
  });

  it('does not name an unknown id even when it happens to match a library label field', () => {
    // Reason "unknown" is never looked up, so a chip id that exists is still only counted.
    const m = modelWith(base, { drops: [{ field: 'chips', id: 'law', reason: 'unknown' }] });
    expect(summaryOf(m, 'dropped')[0]?.items).toEqual([
      '1 pick in this link was not recognized, so it was left out or reset.',
    ]);
  });

  it('says risk was added at its default level for the fallback repair', () => {
    const m = modelWith(base, { drops: [{ field: 'stats', id: 'risk', reason: 'fallback' }] });
    expect(summaryOf(m, 'dropped')[0]?.items).toEqual(['Risk was added at its default level.']);
  });

  it('shows one line per kind of repair even when it happened twice', () => {
    const m = modelWith(base, {
      drops: [
        { field: 'name', id: 'name', reason: 'cleaned' },
        { field: 'name', id: 'name', reason: 'cleaned' },
        { field: 'stats', id: 'risk', reason: 'unexposed' },
        { field: 'stats', id: 'risk', reason: 'unexposed' },
      ],
    });
    expect(summaryOf(m, 'dropped')[0]?.items).toEqual([
      'The name was tidied up.',
      'Risk was removed because no Markets chip is picked.',
    ]);
  });

  it('shows no dropped line when nothing was dropped', () => {
    expect(summaryOf(modelWith(base, { drops: [] }), 'dropped')).toEqual([]);
  });

  it('keeps the developer decode warnings behind details, after the compiler warnings', () => {
    const m = modelWith(base, { drops, decodeWarnings });
    expect(m.details).toEqual([...base.result.warnings, ...decodeWarnings]);
  });

  it('sits after trimmed and before undelivered', () => {
    const marty = caseOf('marty.chatgpt-instructions-free');
    const m = modelWith(marty, { drops });
    const kinds = summaryKinds(m);
    expect(kinds.indexOf('trimmed')).toBeLessThan(kinds.indexOf('dropped'));
    expect(kinds.indexOf('dropped')).toBeLessThan(kinds.indexOf('undelivered'));
  });
});

describe('summary: undelivered', () => {
  it('marty on custom instructions says what is not included on ChatGPT', () => {
    for (const id of ['marty.chatgpt-instructions-free', 'marty.chatgpt-instructions-paid']) {
      const c = caseOf(id);
      expect(c.result.undelivered.length, id).toBeGreaterThan(0);
      const [item] = summaryOf(c.model, 'undelivered');
      expect(summaryOf(c.model, 'undelivered').length, id).toBe(1);
      expect(item?.text, id).toBe('Not included on ChatGPT:');
      expect(item?.items, id).toEqual(c.result.undelivered.map((u) => u.name));
    }
  });

  it('lists every routine of the build, by library name, because custom instructions deliver none', () => {
    const c = caseOf('marty.chatgpt-instructions-free');
    const routineNames = c.build.packs.flatMap(
      (id) => library.packs.find((p) => p.id === id)?.skills.filter((s) => s.kind === 'schedule').map((s) => s.name) ?? [],
    );
    expect(routineNames.length).toBeGreaterThan(0);
    const items = summaryOf(c.model, 'undelivered')[0]?.items ?? [];
    for (const name of routineNames) expect(items, name).toContain(name);
  });

  it('only names library skills, routines, packs or roles', () => {
    const known = new Set<string>([
      ...library.packs.flatMap((p) => [p.label, ...p.skills.map((s) => s.name)]),
      ...library.chips.flatMap((ch) => ch.skills?.map((s) => s.name) ?? []),
      ...library.roles.map((r) => r.label),
      ...library.roleSets.map((r) => r.label),
    ]);
    for (const c of CASES) {
      for (const name of summaryOf(c.model, 'undelivered')[0]?.items ?? []) {
        expect(known.has(name), `${c.id}: ${name}`).toBe(true);
      }
    }
  });

  it('names a pack and roles the profile cannot deliver', () => {
    const c = caseOf('june.openclaw');
    const m = modelWithResult(c, {
      undelivered: [
        { kind: 'pack', id: 'personal-ops', name: packLabel('personal-ops') },
        { kind: 'roles', id: 'roles', name: 'Roles' },
      ],
    });
    expect(summaryOf(m, 'undelivered')[0]?.items).toEqual(['Personal ops', 'Roles']);
    expect(summaryOf(m, 'undelivered')[0]?.text).toBe('Not included on OpenClaw:');
  });

  it('is absent when the bundle delivers everything', () => {
    expect(summaryOf(caseOf('june.openclaw').model, 'undelivered')).toEqual([]);
    expect(summaryOf(caseOf('june.muse').model, 'undelivered')).toEqual([]);
  });
});

describe('summary: deprecated (mode gpt)', () => {
  const gptCard = library.targets.targets
    .find((t) => t.id === 'chatgpt')
    ?.modes?.find((m) => m.id === 'gpt');

  it('the library retires the gpt mode on its card', () => {
    expect(gptCard?.deprecated?.line).toBe('Custom GPTs retire on Dec 11, 2026.');
  });

  for (const c of GPT_CASES) {
    it(`${c.id}: shows the library retirement line`, () => {
      const [dep] = summaryOf(c.model, 'deprecated');
      expect(summaryOf(c.model, 'deprecated').length).toBe(1);
      expect(dep?.text).toBe(gptCard?.deprecated?.line);
    });
  }

  // The library's own creation-off record for mode gpt, and the text a user reads from it.
  const gptProfile = caseOf('june.chatgpt-gpt').profile;
  const creationRecord = (gptProfile.notes ?? []).find((n) => n.id === GPT_CREATION_NOTE_ID);
  const withoutVerify = (line: string): string => line.replace(/^verify:\s*/i, '');
  const creationVerify = (text: string): BundleNote => ({ id: GPT_CREATION_NOTE_ID, text, kind: 'verify' });

  it('guard: the library record the model treats as the creation-off fact exists and says creation is off', () => {
    expect(
      creationRecord,
      `${GPT_CREATION_NOTE_ID} is gone from the gpt profile. Move GPT_CREATION_NOTE_ID in the model and in this file together.`,
    ).toBeDefined();
    expect(creationRecord?.line).toMatch(/creation is off/i);
    // The retirement date the stillChecking checks below look for is the one on the card.
    expect(gptCard?.deprecated?.line).toContain(RETIREMENT_DATE);
  });

  it('shows a verify-kind creation-off record in the deprecated item and removes it from stillChecking', () => {
    const c = caseOf('june.chatgpt-gpt');
    const fact = 'new GPT creation is off on personal plans (OpenAI help, 2026-10-01).';
    const record = creationVerify(`verify: ${fact}`);
    const others = c.result.noteItems.filter((n) => n.id !== GPT_CREATION_NOTE_ID);
    const noteItems = [record, ...others];
    const m = modelWithResult(c, { noteItems, verify: noteItems.filter((n) => n.kind === 'verify') });
    // Precondition: the record really is a verify note the verify list would carry.
    expect(noteItems.find((n) => n.id === GPT_CREATION_NOTE_ID)?.kind).toBe('verify');
    expect(summaryOf(m, 'deprecated').length).toBe(1);
    expect(summaryOf(m, 'deprecated')[0]?.items).toEqual([fact]);
    expect(m.stillChecking.map((n) => n.id)).not.toContain(GPT_CREATION_NOTE_ID);
    expect(m.notes.map((n) => n.id)).not.toContain(GPT_CREATION_NOTE_ID);
    // The other verify records stay, in bundle order, without their prefix.
    expect(m.stillChecking.map((n) => n.id)).toEqual(others.filter((n) => n.kind === 'verify').map((n) => n.id));
    // The fact is on the page once, not once in the summary and again under Still checking.
    expect(countIn(m, fact)).toBe(1);
  });

  it('shows a note-kind creation-off record in the deprecated item and removes it from notes', () => {
    const c = caseOf('june.chatgpt-gpt');
    const note: BundleNote = {
      id: GPT_CREATION_NOTE_ID,
      text: 'Creating new Custom GPTs is turned off.',
      kind: 'note',
    };
    const noteItems = [note, ...c.result.noteItems.filter((n) => n.id !== GPT_CREATION_NOTE_ID)];
    const m = modelWithResult(c, { noteItems });
    expect(summaryOf(m, 'deprecated').length).toBe(1);
    expect(summaryOf(m, 'deprecated')[0]?.items).toEqual([note.text]);
    expect(m.notes.map((n) => n.id)).not.toContain(GPT_CREATION_NOTE_ID);
    expect(m.stillChecking.map((n) => n.id)).not.toContain(GPT_CREATION_NOTE_ID);
    expect(countIn(m, note.text)).toBe(1);
  });

  it('keeps the same verify record in stillChecking when the build is not mode gpt', () => {
    // The control for the verify-kind case above: without the deprecated summary, nothing removes it.
    const c = caseOf('june.chatgpt-dot');
    const record = creationVerify('verify: stray record.');
    const m = modelWithResult(c, {
      noteItems: [...c.result.noteItems, record],
      verify: [...c.result.verify, record],
    });
    expect(summaryOf(m, 'deprecated')).toEqual([]);
    expect(m.stillChecking.find((n) => n.id === GPT_CREATION_NOTE_ID)?.text).toBe('stray record.');
  });

  for (const c of GPT_CASES) {
    it(`${c.id}: shows the retirement line and the creation-off fact once each on the page`, () => {
      const retirement = gptCard?.deprecated?.line ?? '';
      const fact = withoutVerify(creationRecord?.line ?? '');
      expect(retirement).not.toBe('');
      expect(fact).not.toBe('');
      // Precondition: the compiled bundle carries the library record, so the model had it to repeat.
      expect(c.result.noteItems.map((n) => n.id)).toContain(GPT_CREATION_NOTE_ID);
      const [dep] = summaryOf(c.model, 'deprecated');
      expect(dep?.text).toBe(retirement);
      expect(dep?.items).toEqual([fact]);
      expect(countIn(c.model, retirement)).toBe(1);
      expect(countIn(c.model, fact)).toBe(1);
    });

    it(`${c.id}: does not repeat the retirement or the creation-off fact in stillChecking or notes`, () => {
      const retirement = (gptCard?.deprecated?.line ?? '').toLowerCase();
      expect(retirement).not.toBe('');
      for (const n of [...c.model.stillChecking, ...c.model.notes]) {
        expect(n.id).not.toBe(GPT_CREATION_NOTE_ID);
        expect(n.text.toLowerCase(), n.id).not.toContain(retirement);
        expect(n.text, n.id).not.toContain(RETIREMENT_DATE);
        expect(n.text, n.id).not.toMatch(/creation is off/i);
      }
    });
  }

  it('shows nothing for a non-gpt build, whatever notes it carries', () => {
    const c = caseOf('june.chatgpt-dot');
    const note: BundleNote = { id: GPT_CREATION_NOTE_ID, text: 'Stray note.', kind: 'note' };
    const m = modelWithResult(c, { noteItems: [note] });
    expect(summaryOf(m, 'deprecated')).toEqual([]);
    expect(m.notes).toEqual([note]);
  });
});

describe('summary: every kind together', () => {
  it('shows in the plan order: auto, over, steer, trimmed, dropped, undelivered', () => {
    const c = caseOf('marty.chatgpt-instructions-free');
    const rule = library.packs.find((p) => p.id === 'memecoins')?.rulesLines[0];
    const m = certificateModel({
      ...c.input,
      result: {
        ...c.result,
        gates: { ...c.result.gates, trade: 'auto' },
        trimmed: [{ kind: 'pack-rule', id: rule?.id ?? '', text: rule?.line ?? '', pack: 'memecoins' }],
      },
      drops: [{ field: 'name', id: 'name', reason: 'cleaned' }],
    });
    expect(summaryKinds(m)).toEqual(['auto', 'over', 'steer', 'trimmed', 'dropped', 'undelivered']);
  });
});

// ---------------------------------------------------------------------------
// Skipped lines (W15)
// ---------------------------------------------------------------------------

describe('skipped lines', () => {
  const june = caseOf('june.openclaw');

  it('shows a "You skipped <name>." line for each given skipped screen', () => {
    const skipped: ScreenId[] = ['world', 'packs', 'limits', 'gates', 'stats', 'peeves', 'heart', 'outfit', 'roles'];
    const m = modelWith(june, { skipped });
    expect(m.skipped).toEqual([
      'You skipped your world.',
      'You skipped packs.',
      'You skipped limits.',
      'You skipped approvals.',
      'You skipped the sliders.',
      'You skipped pet peeves.',
      'You skipped heart.',
      'You skipped outfit.',
      'You skipped roles.',
    ]);
  });

  it('shows one line for a single skipped screen', () => {
    expect(modelWith(june, { skipped: ['gates'] }).skipped).toEqual(['You skipped approvals.']);
  });

  it('shows nothing when no screen was skipped', () => {
    expect(modelWith(june, { skipped: [] }).skipped).toEqual([]);
  });

  it('shows one line for a screen skipped twice', () => {
    expect(modelWith(june, { skipped: ['peeves', 'peeves'] }).skipped).toEqual(['You skipped pet peeves.']);
  });

  it('keeps the order the screens were given in', () => {
    expect(modelWith(june, { skipped: ['outfit', 'world'] }).skipped).toEqual([
      'You skipped outfit.',
      'You skipped your world.',
    ]);
  });

  it('ignores screens that cannot be skipped, and ids that are not screens', () => {
    const m = modelWith(june, {
      skipped: ['target', 'roster', 'base', 'name', 'certificate', 'remix', 'constructor' as ScreenId, '__proto__' as ScreenId],
    });
    expect(m.skipped).toEqual([]);
  });

  it('does not change the rest of the model', () => {
    const plain = modelWith(june, { skipped: [] });
    const skipped = modelWith(june, { skipped: ['world', 'gates'] });
    expect({ ...skipped, skipped: [] }).toEqual(plain);
  });
});

// ---------------------------------------------------------------------------
// Tagline (W5) and starterIdOf
// ---------------------------------------------------------------------------

describe('starterIdOf', () => {
  it('finds every roster starter from its own build', () => {
    for (const entry of library.roster) expect(starterIdOf(entry.build), entry.id).toBe(entry.id);
  });

  it('finds the starter after the build moves to any target, mode or plan', () => {
    for (const entry of library.roster) {
      for (const [target, mode, plan] of [
        ['muse'],
        ['openclaw'],
        ['hermes'],
        ['grok'],
        ['chatgpt', 'dot'],
        ['chatgpt', 'gpt'],
        ['chatgpt', 'instructions', 'free'],
        ['chatgpt', 'instructions', 'paid'],
        ['chatgpt', 'project'],
      ] as const satisfies readonly (readonly [Build['target'], Build['mode']?, Build['plan']?])[]) {
        const moved = migrate(entry.build, { target, mode, plan });
        expect(starterIdOf(moved), `${entry.id} ${target} ${mode ?? ''}`).toBe(entry.id);
      }
    }
  });

  it('ignores packs, limits, gates and roles', () => {
    const marty = caseOf('marty.openclaw').build;
    const moved: Build = {
      ...marty,
      packs: [],
      limits: { x: 1 },
      gates: { send: 'approve' },
      roles: ['scout'],
    };
    expect(starterIdOf(moved)).toBe('marty');
  });

  it('compares the trimmed name', () => {
    const marty = caseOf('marty.muse').build;
    expect(starterIdOf({ ...marty, name: `  ${marty.name} ` })).toBe('marty');
  });

  it('returns undefined after any v1 pick changes', () => {
    const june = caseOf('june.muse').build;
    const other = library.roster.find((r) => r.id === 'rook')?.build;
    expect(other).toBeDefined();
    expect(starterIdOf({ ...june, name: 'Juno' })).toBeUndefined();
    expect(starterIdOf({ ...june, base: 'trader' })).toBeUndefined();
    expect(starterIdOf({ ...june, chips: [...june.chips].reverse() })).toBeUndefined();
    expect(starterIdOf({ ...june, chips: june.chips.slice(1) })).toBeUndefined();
    expect(starterIdOf({ ...june, stats: { ...june.stats, funny: june.stats.funny === 1 ? 2 : 1 } })).toBeUndefined();
    expect(starterIdOf({ ...june, peeves: [...june.peeves, 'zz-extra'] })).toBeUndefined();
    expect(starterIdOf({ ...june, outfit: other?.outfit ?? 'x' })).toBeUndefined();
    expect(starterIdOf({ ...june, heart: { ...june.heart, d2: 'zz-other-drive' } })).toBeUndefined();
    expect(starterIdOf({ ...june, heart: { ...june.heart, hardPart: 'calmer' } })).toBeUndefined();
  });

  it('returns undefined against a library with no roster', () => {
    expect(starterIdOf(library.roster[0]!.build, { ...library, roster: [] })).toBeUndefined();
  });
});

describe('tagline', () => {
  it('shows the roster tagline for each unmodified starter on every target', () => {
    for (const entry of library.roster) {
      for (const id of ['muse', 'openclaw', 'hermes', 'grok', 'chatgpt-dot']) {
        const c = caseOf(`${entry.id}.${id}`);
        expect(c.model.header.tagline, c.id).toBe(entry.tagline);
      }
    }
  });

  it('is gone after the name changes, on every target', () => {
    for (const id of ['june.muse', 'june.openclaw', 'june.hermes', 'june.grok', 'june.chatgpt-dot']) {
      const c = caseOf(id);
      const build: Build = { ...c.build, name: 'Juniper' };
      expect(certificateModel(inputFor(build)).header.tagline, id).toBeUndefined();
    }
  });

  it('is gone after a chip is added', () => {
    const c = caseOf('june.muse');
    const build: Build = { ...c.build, chips: [...c.build.chips, 'law'] };
    expect(certificateModel(inputFor(build)).header.tagline).toBeUndefined();
  });

  it('is empty when the caller passes no starter id', () => {
    const c = caseOf('june.muse');
    expect(modelWith(c, { starterId: undefined }).header.tagline).toBeUndefined();
  });

  it('keeps the header name as typed', () => {
    const c = caseOf('june.muse');
    const build: Build = { ...c.build, name: 'Juniper' };
    expect(certificateModel(inputFor(build)).header.name).toBe('Juniper');
  });
});

// ---------------------------------------------------------------------------
// Zip (W13)
// ---------------------------------------------------------------------------

describe('zip', () => {
  const withZip = ['openclaw', 'hermes'];
  const without = ['muse', 'chatgpt-dot'];

  it('is present on every OpenClaw and Hermes certificate', () => {
    const cases = CASES.filter((c) => withZip.includes(c.profile.id));
    expect(cases.length).toBe(20);
    for (const c of cases) expect(c.model.zip, c.id).toBeDefined();
  });

  it('is absent on every Muse and ChatGPT Dot certificate', () => {
    const cases = CASES.filter((c) => without.includes(c.profile.id));
    expect(cases.length).toBe(18);
    for (const c of cases) expect(c.model.zip, c.id).toBeUndefined();
  });

  it('holds the bundle files at their paths, named <name>-<profile>.zip', () => {
    const c = caseOf('marty.openclaw.roles');
    expect(c.model.zip?.filename).toBe('marty-openclaw.zip');
    expect(c.model.zip?.files.map((f) => f.path)).toEqual(
      c.result.files.filter((f) => f.delivery === 'file').map((f) => f.path),
    );
    const hermes = caseOf('rook.hermes');
    expect(hermes.model.zip?.filename).toBe('rook-hermes.zip');
  });

  it('slugs the name, and falls back to "bot" when nothing is left', () => {
    const c = caseOf('june.openclaw');
    expect(certificateModel(inputFor({ ...c.build, name: 'Big Dog 2' })).zip?.filename).toBe('big-dog-2-openclaw.zip');
    expect(certificateModel(inputFor({ ...c.build, name: '???' })).zip?.filename).toBe('bot-openclaw.zip');
  });

  it('is absent when no file is delivered as a file', () => {
    const c = caseOf('june.openclaw');
    const m = modelWithResult(c, { files: c.result.files.map((f) => ({ ...f, delivery: 'paste' as const })) });
    expect(m.zip).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Placement of artifacts no step shows, and Mine
// ---------------------------------------------------------------------------

describe('artifacts no step shows', () => {
  it('goes to extra, still exactly once', () => {
    const c = caseOf('june.openclaw');
    const steps = c.result.steps.map((s) => ({ ...s, shows: s.shows.filter((k) => k !== 'memory') }));
    const m = modelWithResult(c, { steps });
    const memory = blocksOf(m).filter((b) => b.kind === 'memory');
    expect(memory.length).toBe(1);
    expect(m.extra.flatMap((g) => g.blocks).filter((b) => b.kind === 'memory').length).toBe(1);
    expect(m.steps.flatMap((s) => s.groups.flatMap((g) => g.blocks)).filter((b) => b.kind === 'memory')).toEqual([]);
  });

  it('keeps the Skills heading and Show more count in extra', () => {
    const c = caseOf('june.openclaw');
    const steps = c.result.steps.map((s) => ({ ...s, shows: s.shows.filter((k) => k !== 'skills') }));
    const m = modelWithResult(c, { steps });
    const group = m.extra.find((g) => g.blocks.some((b) => b.kind === 'skills'));
    expect(group?.heading).toBe('Skills');
    expect(group?.showFirst).toBe(3);
  });

  it('shows every artifact once even when no step shows anything', () => {
    for (const id of ['june.openclaw', 'june.muse', 'june.grok', 'june.chatgpt-dot', 'june.chatgpt-gpt']) {
      const c = caseOf(id);
      const steps = c.result.steps.map((s) => ({ ...s, shows: [] }));
      const m = modelWithResult(c, { steps });
      const expected =
        c.result.files.length +
        c.result.spoken.length +
        (c.result.conversationStarters?.length ?? 0) +
        (c.result.description !== undefined ? 1 : 0);
      expect(blocksOf(m).filter((b) => b.kind !== 'label').length, id).toBe(expected);
      expect(m.steps.flatMap((s) => s.groups), id).toEqual([]);
      if (c.result.customRules.length > 0) {
        expect(m.steps[0]?.customRules?.rows, id).toEqual(c.result.customRules);
      }
    }
  });
});

describe('Mine block', () => {
  const lines = ['Keep it short.', 'No emojis.'];

  it('sits right after the personality block, with the user.mine ids', () => {
    const c = caseOf('june.muse');
    const m = modelWith(c, { mine: { lines, on: true, replacedDashes: false } });
    const group = m.steps[0]?.groups[0];
    expect(group?.blocks.map((b) => b.kind)).toEqual(['personality', 'mine']);
    expect(group?.blocks[1]?.text).toBe(lines.join('\n'));
    expect(group?.blocks[1]?.ids).toEqual(['user.mine.1', 'user.mine.2']);
    expect(blocksOf(m).filter((b) => b.kind === 'mine').length).toBe(1);
  });

  it('leaves every other block unchanged', () => {
    const c = caseOf('june.muse');
    const m = modelWith(c, { mine: { lines, on: true, replacedDashes: false } });
    expect(blocksOf(m).filter((b) => b.kind !== 'mine').map((b) => b.text)).toEqual(
      blocksOf(c.model).map((b) => b.text),
    );
  });

  it('keeps the block keys unique', () => {
    const c = caseOf('june.grok');
    const m = modelWith(c, { mine: { lines, on: true, replacedDashes: false } });
    const keys = blocksOf(m).map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    // On Grok the label block follows the personality group, after Mine.
    expect(m.steps[1]?.groups[0]?.blocks.map((b) => b.kind)).toEqual(['personality', 'mine']);
  });

  it('shows no Mine block when there are no Mine lines', () => {
    const c = caseOf('june.muse');
    const m = modelWith(c, { mine: { lines: [], on: true, replacedDashes: false } });
    expect(blocksOf(m).filter((b) => b.kind === 'mine')).toEqual([]);
    expect(m).toEqual(c.model);
  });

  it('shows no Mine block when the switch is off, even with lines', () => {
    // The switch defaults off (W12): lines are carried on the input, and none of them reach the page.
    for (const id of [
      'june.muse',
      'june.grok',
      'june.openclaw',
      'june.chatgpt-dot',
      'marty.chatgpt-instructions-free',
      'june.chatgpt-gpt',
    ]) {
      const c = caseOf(id);
      for (const replacedDashes of [false, true]) {
        const m = modelWith(c, { mine: { lines, on: false, replacedDashes } });
        expect(blocksOf(m).filter((b) => b.kind === 'mine'), id).toEqual([]);
        // The whole model equals the one built with no mine field at all.
        expect(m, id).toEqual(c.model);
        for (const line of lines) expect(countIn(m, line), `${id}: ${line}`).toBe(0);
      }
    }
  });

  it('shows the Mine block only after the switch goes on, on the same input', () => {
    const c = caseOf('june.muse');
    const off = modelWith(c, { mine: { lines, on: false, replacedDashes: false } });
    const on = modelWith(c, { mine: { lines, on: true, replacedDashes: false } });
    expect(blocksOf(off).filter((b) => b.kind === 'mine').length).toBe(0);
    expect(blocksOf(on).filter((b) => b.kind === 'mine').length).toBe(1);
  });

  it('shows no Mine block when the input has no mine field', () => {
    expect(blocksOf(caseOf('june.muse').model).filter((b) => b.kind === 'mine')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Role lead note (synthetic: the role note without role files stays in notes)
// ---------------------------------------------------------------------------

describe('role lead note', () => {
  // The three profiles whose role files have no install step of their own (W33): the fallback.roles
  // line is the step that shows roles, so the role groups sit under it. No golden covers the custom
  // GPT, so it gets a build of its own.
  const gptEntry = library.roster.find((r) => r.id === 'june');
  if (gptEntry === undefined) throw new Error('test setup: no roster entry june');
  const GPT_ROLES = ['chief-of-staff', 'triager', 'scheduler'];
  const PROMOTED_CASES: [string, Case][] = [
    ['grok', caseOf('june.grok.roles')],
    ['chatgpt-project', caseOf('sol.chatgpt-project.roles')],
    [
      'chatgpt-gpt',
      makeCase('june.chatgpt-gpt.roles', {
        ...migrate(gptEntry.build, { target: 'chatgpt', mode: 'gpt' }),
        roles: GPT_ROLES,
      }),
    ],
  ];

  it.each(PROMOTED_CASES)('%s: places the role groups under the fallback.roles step, one group per role, with nothing in extra', (pid, c) => {
    expect(c.profile.id).toBe(pid);
    const stepId = `profile.${pid}.fallback.roles`;
    expect(c.profile.templates['fallback.roles'].id).toBe(stepId);
    const step = c.model.steps.find((s) => s.id === stepId);
    expect(step, stepId).toBeDefined();
    // The step is the bundle's step: same text, numbered, not a closer, and the first that shows roles.
    const bundleStep = c.result.steps.find((s) => s.id === stepId);
    expect(bundleStep?.shows).toEqual(['roles']);
    expect(step?.text).toBe(bundleStep?.text);
    expect(step?.n).not.toBeNull();
    expect(c.result.steps.find((s) => s.shows.includes('roles'))?.id).toBe(stepId);
    // One group per role under it, headed by the library role label, and nothing else under it.
    const labels = c.result.roles.map((id) => library.roles.find((r) => r.id === id)?.label);
    expect(step?.groups.map((g) => g.heading)).toEqual(labels);
    expect(step?.groups.length).toBe(c.result.roles.length);
    for (const g of step?.groups ?? []) {
      expect(g.blocks.every((b) => b.kind === 'roles'), g.key).toBe(true);
      expect(g.lead, g.key).toBeUndefined();
    }
    expect(c.model.extra).toEqual([]);
    // The line is a step, not a note, and no other step holds a role group.
    expect(c.model.notes.map((n) => n.id)).not.toContain(stepId);
    expect(c.model.notes.map((n) => n.text)).not.toContain(bundleStep?.text);
    const otherRoleSteps = c.model.steps.filter(
      (s) => s.id !== stepId && s.groups.some((g) => g.blocks.some((b) => b.kind === 'roles')),
    );
    expect(otherRoleSteps).toEqual([]);
  });

  it.each(PROMOTED_CASES)('%s: the role step comes after the other non-closer steps and before any closer', (pid, c) => {
    const at = c.model.steps.findIndex((s) => s.id === `profile.${pid}.fallback.roles`);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(c.model.steps.slice(0, at).every((s) => s.n !== null)).toBe(true);
    expect(c.model.steps.slice(at + 1).every((s) => s.n === null)).toBe(true);
    expect(c.model.steps.filter((s) => s.n !== null).at(-1)?.id).toBe(`profile.${pid}.fallback.roles`);
  });

  it('leads the first role group with a role note when a bundle still carries one beside role files (synthetic)', () => {
    // A real compile no longer leaves a role note beside role files. The model still handles one: it
    // leads the first role group once and is kept out of notes.
    const c = caseOf('marty.openclaw.roles');
    const note: BundleNote = { id: 'profile.openclaw.synthetic.role.note', text: 'Roles note text.', kind: 'role' };
    const m = modelWithResult(c, { noteItems: [...c.result.noteItems, note] });
    const first = groupsOf(m).find((g) => g.blocks.some((b) => b.kind === 'roles'));
    expect(first?.lead).toEqual(note);
    expect(groupsOf(m).filter((g) => g.lead !== undefined)).toHaveLength(1);
    expect(m.notes.map((n) => n.id)).not.toContain(note.id);
  });

  it('keeps a role note in notes when the build has no role files', () => {
    const c = caseOf('june.grok');
    const note: BundleNote = { id: 'profile.grok.fallback.roles', text: 'Roles note text.', kind: 'role' };
    const m = modelWithResult(c, { noteItems: [...c.result.noteItems, note] });
    expect(m.notes.map((n) => n.id)).toContain(note.id);
  });

  it('places role files on OpenClaw and Hermes under the roles step, one group per role', () => {
    for (const id of ['marty.openclaw.roles', 'rook.hermes.roles']) {
      const c = caseOf(id);
      const roleStep = c.model.steps.find((s) => s.groups.some((g) => g.blocks.some((b) => b.kind === 'roles')));
      expect(roleStep, id).toBeDefined();
      expect(roleStep?.groups.length, id).toBe(c.result.roles.length);
      expect(c.model.extra, id).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Grok and gpt block titles
// ---------------------------------------------------------------------------

describe('block titles for the pieces the bundle does not label', () => {
  it('names the Grok label block, under the same step as the personality', () => {
    const c = caseOf('june.grok');
    const step = c.model.steps.find((s) => s.groups.some((g) => g.blocks.some((b) => b.kind === 'label')));
    const label = blocksOf(c.model).find((b) => b.kind === 'label');
    expect(label?.title).toBe('Label');
    expect(label?.text).toBe(c.result.buildName);
    expect(label?.ids).toEqual(c.result.buildNameIds);
    expect(step?.groups.some((g) => g.blocks.some((b) => b.kind === 'personality'))).toBe(true);
  });

  it('shows the gpt description and the four starters with their own ids', () => {
    const c = caseOf('june.chatgpt-gpt');
    const desc = blocksOf(c.model).find((b) => b.kind === 'description');
    expect(desc?.title).toBe('Description');
    expect(desc?.text).toBe(c.result.description);
    expect(desc?.ids).toEqual(c.result.descriptionIds);
    const starters = blocksOf(c.model).filter((b) => b.kind === 'starters');
    expect(starters.map((b) => b.title)).toEqual(['Starter 1', 'Starter 2', 'Starter 3', 'Starter 4']);
    expect(starters.map((b) => b.text)).toEqual(c.result.conversationStarters);
    expect(starters.map((b) => b.ids)).toEqual(c.result.starterIds);
    const group = c.model.steps.flatMap((s) => s.groups).find((g) => g.blocks.some((b) => b.kind === 'starters'));
    expect(group?.heading).toBe('Conversation starters');
  });
});

// ---------------------------------------------------------------------------
// Seeded fuzz: random packs, gates and roles on every profile. The plan's exactly-once and
// numbering invariants must hold for builds the goldens never reach.
// ---------------------------------------------------------------------------

describe('fuzz: random packs, gates and roles', () => {
  // A small deterministic generator (numerical recipes LCG), so a failure repeats.
  function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  const TARGETS: { target: Build['target']; mode?: Build['mode']; plan?: Build['plan'] }[] = [
    { target: 'muse' },
    { target: 'openclaw' },
    { target: 'hermes' },
    { target: 'grok' },
    { target: 'chatgpt', mode: 'dot' },
    { target: 'chatgpt', mode: 'gpt' },
    { target: 'chatgpt', mode: 'instructions', plan: 'free' },
    { target: 'chatgpt', mode: 'instructions', plan: 'paid' },
    { target: 'chatgpt', mode: 'project' },
  ];

  function randomBuild(next: () => number): Build {
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T;
    const starter = pick(library.roster);
    const t = pick(TARGETS);
    const base = migrate(starter.build, { target: t.target, mode: t.mode, plan: t.plan });
    const packIds = library.packs.map((p) => p.id).filter(() => next() < 0.3).slice(0, 3);
    const selected = library.packs.filter((p) => packIds.includes(p.id));
    const exposed = [...new Set(selected.flatMap((p) => Object.keys(p.gatesDefault)))];
    const gates: Build['gates'] = {};
    for (const g of exposed) if (g !== 'pay' && next() < 0.7) gates[g] = pick(['auto', 'approve', 'forbid'] as const);
    const build: Build = { ...base, packs: packIds, gates, limits: {} };
    if (next() < 0.4) {
      const set = pick(library.roleSets);
      const members = set.members.filter(() => next() < 0.6);
      if (members.length > 0) build.roles = members;
    }
    return build;
  }

  it('keeps every invariant on 300 random builds', () => {
    const next = rng(20261003);
    let ok = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const build = randomBuild(next);
      // Only the compile step (inputFor runs compile, resolveProfile and capOf) may reject a
      // random build. The model call sits outside the try, so a model crash fails the test.
      let input: CertInput;
      try {
        input = inputFor(build);
      } catch {
        continue; // compile rejected the build, which is not this model's business
      }
      const c = makeCase(`fuzz-${i}`, build, input);
      ok += 1;
      seen.add(c.profile.id);
      const label = `fuzz-${i} ${c.profile.id}`;
      const r = c.result;
      const expected = [
        ...r.files.map((f) => [artifactKindOf(f), f.content]),
        ...r.spoken.map((s) => [artifactKindOf(s), s.text]),
        ...(r.conversationStarters ?? []).map((t) => ['starters', t]),
        ...(r.description !== undefined ? [['description', r.description]] : []),
      ].map((pair) => JSON.stringify(pair));
      const blocks = blocksOf(c.model);
      expect(
        blocks.filter((b) => b.kind !== 'label').map((b) => JSON.stringify([b.kind, b.text])).sort(),
        label,
      ).toEqual(expected.sort());
      const tables = c.model.steps.filter((s) => s.customRules !== undefined);
      expect(tables.length, label).toBe(r.customRules.length > 0 ? 1 : 0);
      expect(c.model.extra.flatMap((g) => g.blocks).filter((b) => b.kind === 'rules'), label).toEqual([]);
      const numbered = c.model.steps.filter((s) => s.n !== null);
      expect(numbered.map((s) => s.n), label).toEqual(numbered.map((_, k) => k + 1));
      const closer = c.model.steps.findIndex((s) => s.n === null);
      if (closer !== -1) expect(c.model.steps.slice(closer).every((s) => s.n === null), label).toBe(true);
      const keys = [...groupsOf(c.model), ...(c.model.leftOut ? [c.model.leftOut] : [])].flatMap((g) => [
        g.key,
        ...g.blocks.map((b) => b.key),
      ]);
      expect(new Set(keys).size, label).toBe(keys.length);
      for (const b of blocks) expect(b.text, label).not.toContain('verify:');
      for (const n of c.model.stillChecking) expect(n.text, label).not.toMatch(/^\s*verify:/i);
      const auto = library.gates.filter((g) => r.gates[g.id] === 'auto').map((g) => g.label);
      expect(summaryOf(c.model, 'auto')[0]?.items ?? [], label).toEqual(auto);
      expect(summaryOf(c.model, 'undelivered').length, label).toBe(
        (r.undelivered.length > 0 ? 1 : 0) + dotSummaryCount(c),
      );
      if (isCustomRules(c)) expect(c.model.leftOut !== undefined, label).toBe(dotLeftOutLines(build).length > 0);
      expect(c.model.zip !== undefined, label).toBe(r.files.some((f) => f.delivery === 'file'));
      expect(JSON.stringify(certificateModel(c.input)), label).toBe(JSON.stringify(c.model));
    }
    expect(ok).toBeGreaterThan(150);
    expect(seen.size).toBeGreaterThanOrEqual(7);
  });
});

// Lead addition (wave 2 gate, QUESTIONS W34): a pack rule cut from the personality text to fit the
// cap is either still in a rules file (Hermes AGENTS.md, so the summary says where it is) or out of the
// bundle (Muse and Grok, so the summary says left out and the lines are listed under Left out).
describe('trimmed pack rules: kept in a rules file, or left out', () => {
  const trimmedTexts = (id: string) => summaryOf(certificateModel(caseOf(id).input), 'trimmed').map((s) => s.text);

  it('on Hermes, says the cut rules are still in AGENTS.md and lists nothing under Left out', () => {
    expect(trimmedTexts('june.hermes')).toContain(
      'To fit Hermes, 5 rules from Personal ops are in AGENTS.md, not in SOUL.md.',
    );
    expect(certificateModel(caseOf('june.hermes').input).leftOut).toBeUndefined();
    expect(trimmedTexts('marty.hermes')).toContain('To fit Hermes, 3 rules from Memecoins are in AGENTS.md, not in SOUL.md.');
  });

  it('on Muse and Grok, says left out and lists each cut rule line once under Left out', () => {
    for (const id of ['june.muse', 'marty.grok']) {
      const c = caseOf(id);
      const m = certificateModel(c.input);
      const cut = c.result.trimmed.filter((t) => t.kind === 'pack-rule');
      expect(cut.length, id).toBeGreaterThan(0);
      expect(m.leftOut, id).toBeDefined();
      expect(m.leftOut!.blocks.map((b) => b.text).sort(), id).toEqual(cut.map((t) => t.text).sort());
      expect(trimmedTexts(id).some((t) => t.includes('were left out')), id).toBe(true);
    }
  });

  it('uses the singular for one rule', () => {
    expect(copy.certificate.summary.keptPack('Hermes', 1, 'Coding', 'AGENTS.md', 'SOUL.md')).toBe(
      'To fit Hermes, 1 rule from Coding is in AGENTS.md, not in SOUL.md.',
    );
  });
});
