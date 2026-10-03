// Certificate model (M4 plan section 4): the pure shape the certificate screen renders.
// A CompileResult in, steps with their copy blocks, summary lines, notes and the footer data out.
// No React, no I/O. Every user-facing string is library text or comes from src/ui/copy.

import type {
  ArtifactKind,
  Build,
  BuildCore,
  BundleFile,
  BundleNote,
  CompileResult,
  CustomRule,
  Library,
  Profile,
  ProfileId,
  RoleId,
  StatId,
  TracedLine,
  Trimmed,
} from '../../compiler/types.js';
import { artifactKindOf } from '../../compiler/types.js';
import library from '../../library/index.js';
import type { Drop, DropField } from '../../share/encode.js';
import { zipFilename } from '../../share/zip.js';
import { copy } from '../copy.js';
import type { SkippedScreen } from '../copy/certificate.js';
import type { ScreenId } from '../flow.js';
import type { From } from '../store.js';

export interface CertInput {
  result: CompileResult; // already with Mine applied when Mine is on
  build: Build;
  profile: Profile;
  cap: number;
  from?: From; // plan section 4 lists it; the model does not read it today
  skipped: ScreenId[];
  drops: Drop[];
  decodeWarnings: string[];
  starterId?: string; // starterIdOf(build)
  mine?: { lines: string[]; on: boolean; replacedDashes: boolean };
}

export interface CertBlock {
  key: string;
  kind: ArtifactKind | 'mine';
  title: string;
  text: string;
  ids: string[];
  path?: string;
}

export interface CertGroup {
  key: string;
  heading?: string;
  lead?: BundleNote;
  blocks: CertBlock[];
  showFirst?: number;
}

export interface CertCustomRules {
  caption: string;
  rows: CustomRule[];
  note?: BundleNote;
}

export interface CertStep {
  id: string;
  n: number | null; // null on a closer
  text: string;
  groups: CertGroup[];
  customRules?: CertCustomRules;
}

export type SummaryKind =
  | 'auto'
  | 'over'
  | 'steer'
  | 'trimmed'
  | 'dropped'
  | 'undelivered'
  | 'deprecated';

export interface CertSummaryItem {
  key: string;
  kind: SummaryKind;
  text: string;
  items?: string[];
}

export interface CertModel {
  header: {
    name: string;
    buildName: string;
    tagline?: string;
    stats: Build['stats'];
    badges: { id: string; name: string }[];
  };
  summary: CertSummaryItem[];
  steps: CertStep[]; // closers last with n null
  extra: CertGroup[]; // artifacts no step shows
  leftOut?: CertGroup; // trimmed pack rule lines, on muse and grok
  notes: BundleNote[]; // non-verify notes
  stillChecking: BundleNote[]; // verify notes without the "verify: " prefix
  docs: { label: string; url: string; date: string };
  skipped: string[];
  details: string[];
  meter: { length: number; cap: number; label: string };
  zip?: { filename: string; files: { path: string; content: string }[] };
}

// Skills and routines show this many blocks before "Show more".
const SHOW_FIRST = 3;
// The Hand off note that goes with the Custom Rules table, and the record that carries the
// creation-off fact for the deprecated summary. Both are profile records. Today the creation-off
// fact sits in verify.1; if slice 4.5b renames that record, this id must follow it. A missing id is
// harmless: the summary then shows the retirement line alone and the record stays where it is.
const DOT_NOTE_ID = 'profile.chatgpt-dot.note.1';
const GPT_CREATION_NOTE_ID = 'profile.chatgpt-gpt.verify.1';
// Profiles where a cut pack rule can leave the bundle entirely, so the user can add it back by hand.
// On Hermes the cut is from SOUL.md only and AGENTS.md still carries the rule, so a rule is listed
// only when no rules file carries it either.
const LEFT_OUT_PROFILES: readonly ProfileId[] = ['muse', 'grok'];
const STAT_IDS: readonly StatId[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive', 'risk'];

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// The roster starter whose v1 core fields equal the build's, or undefined for a custom build. It
// ignores target, mode, plan, packs, limits, gates and roles: a starter moved to another target is
// still that starter.
export function starterIdOf(build: BuildCore, lib: Library = library): string | undefined {
  return lib.roster.find(({ build: r }) => {
    return (
      r.base === build.base &&
      sameList(r.chips, build.chips) &&
      STAT_IDS.every((s) => r.stats[s] === build.stats[s]) &&
      sameList(r.peeves, build.peeves) &&
      r.heart.hardPart === build.heart.hardPart &&
      r.heart.d1 === build.heart.d1 &&
      r.heart.d2 === build.heart.d2 &&
      r.outfit === build.outfit &&
      r.name.trim() === build.name.trim()
    );
  })?.id;
}

// A block before its key is assigned.
type Body = Omit<CertBlock, 'key'>;
// A group before keys are assigned.
interface Draft {
  heading?: string;
  lead?: BundleNote;
  blocks: Body[];
  showFirst?: number;
}
// One copyable artifact and the kind that decides which step shows it.
interface Placed {
  kind: ArtifactKind;
  role?: RoleId;
  body: Body;
}

// A verify note as the user reads it, without the "verify: " prefix.
function withoutVerifyPrefix(note: BundleNote): BundleNote {
  return { ...note, text: note.text.replace(/^verify:\s*/i, '') };
}

// Record ids behind a file's lines: each line's id, then its sources, first seen first.
function idsOfLines(lines: readonly TracedLine[]): string[] {
  const ids = new Set<string>();
  for (const line of lines) {
    if (line.kind === 'blank') continue;
    ids.add(line.id);
    for (const source of line.sources ?? []) ids.add(source);
  }
  return [...ids];
}

// Files first, then spoken items, in bundle order, then the gpt and grok pieces.
function artifactsOf(input: CertInput): Placed[] {
  const { result, profile } = input;
  const c = copy.certificate;
  const out: Placed[] = [];
  for (const f of result.files) {
    const kind = artifactKindOf(f);
    out.push({
      kind,
      ...(f.role !== undefined ? { role: f.role } : {}),
      body: { kind, title: f.label, text: f.content, ids: idsOfLines(f.lines), path: f.path },
    });
  }
  for (const s of result.spoken) {
    const kind = artifactKindOf(s);
    out.push({
      kind,
      ...(s.role !== undefined ? { role: s.role } : {}),
      body: { kind, title: s.label, text: s.text, ids: [...s.ids] },
    });
  }
  if (profile.id === 'grok') {
    out.push({
      kind: 'label',
      body: { kind: 'label', title: c.blockTitles.label, text: result.buildName, ids: [...result.buildNameIds] },
    });
  }
  if (result.description !== undefined) {
    out.push({
      kind: 'description',
      body: {
        kind: 'description',
        title: c.blockTitles.description,
        text: result.description,
        ids: [...result.descriptionIds],
      },
    });
  }
  (result.conversationStarters ?? []).forEach((text, i) => {
    out.push({
      kind: 'starters',
      body: {
        kind: 'starters',
        title: c.blockTitles.starter(i + 1),
        text,
        ids: [...(result.starterIds[i] ?? [])],
      },
    });
  });
  return out;
}

function mineBody(lines: readonly string[]): Body {
  return {
    kind: 'mine',
    title: copy.certificate.blockTitles.mine,
    text: lines.join('\n'),
    ids: lines.map((_, i) => `user.mine.${i + 1}`),
  };
}

function roleLabel(id: RoleId, lib: Library): string {
  return lib.roles.find((r) => r.id === id)?.label ?? id;
}

// The groups for the artifacts one place holds (a step, or extra), in the order of `kinds`.
// `mergeStanding` puts skills then routines in one Standing instructions group (Muse step 3).
function draftGroups(
  kinds: readonly ArtifactKind[],
  items: readonly Placed[],
  opts: {
    lib: Library;
    mine: readonly string[];
    mergeStanding: boolean;
    takeRoleLead: () => BundleNote | undefined;
  },
): Draft[] {
  const c = copy.certificate;
  const of = (kind: ArtifactKind): Body[] => items.filter((i) => i.kind === kind).map((i) => i.body);
  const groups: Draft[] = [];
  const done = new Set<ArtifactKind>();
  for (const kind of kinds) {
    if (done.has(kind)) continue;
    done.add(kind);
    if (opts.mergeStanding && (kind === 'skills' || kind === 'routines')) {
      done.add('skills');
      done.add('routines');
      const blocks = [...of('skills'), ...of('routines')];
      if (blocks.length > 0) groups.push({ heading: c.groups.standing, blocks, showFirst: SHOW_FIRST });
      continue;
    }
    switch (kind) {
      case 'roles': {
        const roleItems = items.filter((i) => i.kind === 'roles');
        const roles = [...new Set(roleItems.flatMap((i) => (i.role === undefined ? [] : [i.role])))];
        for (const role of roles) {
          const lead = opts.takeRoleLead();
          groups.push({
            heading: roleLabel(role, opts.lib),
            ...(lead !== undefined ? { lead } : {}),
            blocks: roleItems.filter((i) => i.role === role).map((i) => i.body),
          });
        }
        break;
      }
      case 'skills':
      case 'routines': {
        const blocks = of(kind);
        if (blocks.length > 0) {
          groups.push({
            heading: kind === 'skills' ? c.groups.skills : c.groups.routines,
            blocks,
            showFirst: SHOW_FIRST,
          });
        }
        break;
      }
      case 'starters': {
        const blocks = of(kind);
        if (blocks.length > 0) groups.push({ heading: c.groups.starters, blocks });
        break;
      }
      case 'personality': {
        const blocks = of(kind);
        if (opts.mine.length > 0 && blocks.length > 0) blocks.splice(1, 0, mineBody(opts.mine));
        if (blocks.length > 0) groups.push({ blocks });
        break;
      }
      default: {
        const blocks = of(kind);
        if (blocks.length > 0) groups.push({ blocks });
      }
    }
  }
  return groups;
}

// Index-based keys, unique across the whole model because each scope has its own prefix.
function keyed(scope: string, drafts: readonly Draft[]): CertGroup[] {
  return drafts.map((d, gi) => {
    const key = `${scope}-g${gi}`;
    return {
      key,
      ...(d.heading !== undefined ? { heading: d.heading } : {}),
      ...(d.lead !== undefined ? { lead: d.lead } : {}),
      blocks: d.blocks.map((b, bi): CertBlock => ({ key: `${key}-b${bi}`, ...b })),
      ...(d.showFirst !== undefined ? { showFirst: d.showFirst } : {}),
    };
  });
}

function labelOf(field: DropField, id: string, lib: Library): string | undefined {
  switch (field) {
    case 'chips':
      return lib.chips.find((x) => x.id === id)?.label;
    case 'peeves':
      return lib.peeves.find((x) => x.id === id)?.label;
    case 'packs':
      return lib.packs.find((x) => x.id === id)?.label;
    case 'roles':
      return lib.roles.find((x) => x.id === id)?.label;
    case 'gates':
      return lib.gates.find((x) => x.id === id)?.label;
    case 'limits':
      return lib.limits.find((x) => x.id === id)?.label;
    default:
      return undefined;
  }
}

// What decode changed, in words. A dropped id is named only when it is an 'unexposed' library id
// found by label. An id that came from the link (reasons 'unknown' and 'fallback') is only counted.
function droppedSummary(drops: readonly Drop[], lib: Library): CertSummaryItem | undefined {
  const s = copy.certificate.summary;
  const items: string[] = [];
  const add = (text: string): void => {
    if (!items.includes(text)) items.push(text);
  };
  let unknown = 0;
  for (const d of drops) {
    if (d.reason === 'cleaned' && d.field === 'name') {
      add(s.droppedNameCleaned);
    } else if (d.field === 'stats') {
      add(d.reason === 'unexposed' ? s.droppedRiskRemoved : s.droppedRiskAdded);
    } else if (d.field === 'heart.d1' && d.reason === 'unexposed') {
      add(s.droppedDriveReset);
    } else {
      const label = d.reason === 'unexposed' ? labelOf(d.field, d.id, lib) : undefined;
      if (label !== undefined) add(s.droppedNamed(label));
      else unknown += 1;
    }
  }
  if (unknown > 0) add(s.droppedUnknown(unknown));
  return items.length === 0 ? undefined : { key: 'summary-dropped', kind: 'dropped', text: s.dropped, items };
}

// Rule id to the rules files (AGENTS.md) whose lines carry it. Tier A cuts a pack rule from the
// personality text only, so a rule a rules file carries is still in the bundle. A role description
// on Grok is not a carrier: the main text still lacks the line.
function rulesCarriers(files: readonly BundleFile[]): Map<string, string[]> {
  const carriers = new Map<string, string[]>();
  for (const f of files) {
    if (f.kind !== 'rules') continue;
    for (const id of idsOfLines(f.lines)) {
      const paths = carriers.get(id) ?? [];
      if (!paths.includes(f.path)) paths.push(f.path);
      carriers.set(id, paths);
    }
  }
  return carriers;
}

interface PackCuts {
  left: Set<string>; // cut and in no rules file
  kept: Set<string>; // cut from the personality text, still in a rules file
  where: string[]; // the rules files that carry the kept ones
}

// Cuts per pack (distinct rule ids), split into rules that left the bundle and rules a rules file
// still carries, then one line for every other cut. A rule cut from several role files is one rule.
function trimmedSummary(
  trimmed: readonly Trimmed[],
  target: string,
  lib: Library,
  result: CompileResult,
): CertSummaryItem[] {
  const s = copy.certificate.summary;
  const carriers = rulesCarriers(result.files);
  const soulPath = result.files.find((f) => f.kind === 'personality' && f.role === undefined)?.path;
  const perPack = new Map<string, PackCuts>();
  const other = new Set<string>();
  for (const t of trimmed) {
    if (t.kind === 'pack-rule' && t.pack !== undefined) {
      const cuts = perPack.get(t.pack) ?? { left: new Set<string>(), kept: new Set<string>(), where: [] };
      const paths = carriers.get(t.id);
      if (paths === undefined) {
        cuts.left.add(t.id);
      } else {
        cuts.kept.add(t.id);
        for (const path of paths) if (!cuts.where.includes(path)) cuts.where.push(path);
      }
      perPack.set(t.pack, cuts);
    } else {
      other.add(`${t.kind}|${t.id}`);
    }
  }
  const out: CertSummaryItem[] = [];
  for (const [pack, cuts] of perPack) {
    const label = lib.packs.find((p) => p.id === pack)?.label ?? pack;
    if (cuts.left.size > 0) {
      out.push({
        key: `summary-trimmed-${pack}`,
        kind: 'trimmed',
        text: s.trimmedPack(target, cuts.left.size, label),
      });
    }
    if (cuts.kept.size > 0) {
      out.push({
        key: `summary-kept-${pack}`,
        kind: 'trimmed',
        text: s.keptPack(target, cuts.kept.size, label, cuts.where.join(', '), soulPath),
      });
    }
  }
  if (other.size > 0) {
    out.push({ key: 'summary-trimmed-other', kind: 'trimmed', text: s.trimmedOther(target, other.size) });
  }
  return out;
}

// The cut pack rules no rules file carries, as blocks the user can add back by hand.
function leftOutGroup(
  trimmed: readonly Trimmed[],
  carriers: ReadonlyMap<string, string[]>,
  lib: Library,
): CertGroup | undefined {
  const lines = trimmed.filter((t) => t.kind === 'pack-rule' && !carriers.has(t.id));
  if (lines.length === 0) return undefined;
  const key = 'left-out';
  return {
    key,
    heading: copy.certificate.groups.leftOut,
    blocks: lines.map(
      (t, i): CertBlock => ({
        key: `${key}-b${i}`,
        kind: 'rules',
        title: (t.pack !== undefined ? lib.packs.find((p) => p.id === t.pack)?.label : undefined) ?? t.id,
        text: t.text,
        ids: [t.id],
        ...(t.path !== undefined ? { path: t.path } : {}),
      }),
    ),
  };
}

export function certificateModel(input: CertInput, lib: Library = library): CertModel {
  const { result, build, profile, cap } = input;
  const c = copy.certificate;
  const target = copy.targetNames[build.target];
  // Mine shows only with its switch on. The switch is off by default (W12).
  const mineLines = input.mine?.on === true ? input.mine.lines : [];
  const deprecatedMode =
    profile.id === 'chatgpt-gpt'
      ? lib.targets.targets.find((t) => t.id === profile.target)?.modes?.find((m) => m.id === profile.mode)
          ?.deprecated
      : undefined;

  // Placement: each artifact goes under the first step whose shows includes its kind.
  const bundleSteps = result.steps;
  const stepOf = (kind: ArtifactKind): number => bundleSteps.findIndex((s) => s.shows.includes(kind));
  const artifacts = artifactsOf(input);
  const byStep: Placed[][] = bundleSteps.map(() => []);
  const unplaced: Placed[] = [];
  for (const a of artifacts) {
    const at = stepOf(a.kind);
    (at === -1 ? unplaced : byStep[at]).push(a);
  }

  // Notes that move out of the plain list: the dot note goes with its table, the creation-off fact
  // goes in the deprecated summary, and the first role note leads the first role group.
  const dotNote =
    result.customRules.length > 0 && bundleSteps.length > 0
      ? result.noteItems.find((n) => n.id === DOT_NOTE_ID)
      : undefined;
  const creationNote =
    deprecatedMode !== undefined ? result.noteItems.find((n) => n.id === GPT_CREATION_NOTE_ID) : undefined;
  let pendingRoleNote = artifacts.some((a) => a.role !== undefined)
    ? result.noteItems.find((n) => n.kind === 'role')
    : undefined;
  let roleLead: BundleNote | undefined;
  const takeRoleLead = (): BundleNote | undefined => {
    const note = pendingRoleNote;
    pendingRoleNote = undefined;
    if (note !== undefined) roleLead = note;
    return note;
  };

  // The Custom Rules table sits at the step that shows it. With no such step it goes on the first
  // step, so an enforced rule is never dropped from the page.
  const rulesAt = result.customRules.length === 0 ? -1 : Math.max(stepOf('customRules'), 0);
  let n = 0;
  const steps: CertStep[] = bundleSteps.map((s, i) => {
    const drafts = draftGroups(s.shows, byStep[i], {
      lib,
      mine: mineLines,
      mergeStanding: s.shows.includes('skills') && s.shows.includes('routines'),
      takeRoleLead,
    });
    return {
      id: s.id,
      n: s.closer ? null : ++n,
      text: s.text,
      groups: keyed(`s${i}`, drafts),
      ...(i === rulesAt
        ? {
            customRules: {
              caption: profile.rulesPath?.line ?? '',
              rows: result.customRules,
              ...(dotNote !== undefined ? { note: dotNote } : {}),
            },
          }
        : {}),
    };
  });
  const extraKinds = [...new Set(unplaced.map((a) => a.kind))];
  const extra = keyed(
    'extra',
    draftGroups(extraKinds, unplaced, { lib, mine: mineLines, mergeStanding: false, takeRoleLead }),
  );

  // Summary, in the order the page shows it.
  const summary: CertSummaryItem[] = [];
  const autoLabels = lib.gates
    .filter((g) => Object.hasOwn(result.gates, g.id) && result.gates[g.id] === 'auto')
    .map((g) => g.label);
  if (autoLabels.length > 0) {
    summary.push({ key: 'summary-auto', kind: 'auto', text: c.summary.auto, items: autoLabels });
  }
  const over = result.length > cap;
  if (over) {
    summary.push({
      key: 'summary-over',
      kind: 'over',
      text: c.summary.over(result.length - cap, cap, target),
    });
  }
  if (over && profile.id === 'chatgpt-instructions' && (build.plan ?? 'free') === 'free') {
    summary.push({ key: 'summary-steer', kind: 'steer', text: copy.target.paidSteer });
  }
  summary.push(...trimmedSummary(result.trimmed, target, lib, result));
  const dropped = droppedSummary(input.drops, lib);
  if (dropped !== undefined) summary.push(dropped);
  if (result.undelivered.length > 0) {
    summary.push({
      key: 'summary-undelivered',
      kind: 'undelivered',
      text: c.summary.undelivered(target),
      items: result.undelivered.map((u) => u.name),
    });
  }
  if (deprecatedMode !== undefined) {
    summary.push({
      key: 'summary-deprecated',
      kind: 'deprecated',
      text: deprecatedMode.line,
      ...(creationNote !== undefined ? { items: [withoutVerifyPrefix(creationNote).text] } : {}),
    });
  }

  const skippedNames: Readonly<Record<string, string>> = c.skippedNames;
  const skipped: string[] = [];
  for (const id of input.skipped) {
    const name = Object.hasOwn(skippedNames, id) ? skippedNames[id as SkippedScreen] : undefined;
    if (name !== undefined) {
      const line = c.skipped(name);
      if (!skipped.includes(line)) skipped.push(line);
    }
  }

  const notes = result.noteItems.filter(
    (note) =>
      note.kind !== 'verify' && note !== dotNote && note !== creationNote && note !== roleLead,
  );
  const zipFiles = result.files
    .filter((f) => f.delivery === 'file')
    .map((f) => ({ path: f.path, content: f.content }));
  const tagline =
    input.starterId === undefined ? undefined : lib.roster.find((r) => r.id === input.starterId)?.tagline;
  const leftOut = LEFT_OUT_PROFILES.includes(profile.id)
    ? leftOutGroup(result.trimmed, rulesCarriers(result.files), lib)
    : undefined;

  return {
    header: {
      name: build.name,
      buildName: result.buildName,
      ...(tagline !== undefined ? { tagline } : {}),
      stats: build.stats,
      badges: result.badges.flatMap((id) => {
        const badge = lib.badges.find((b) => b.id === id);
        return badge === undefined ? [] : [{ id, name: badge.name }];
      }),
    },
    summary,
    steps,
    extra,
    ...(leftOut !== undefined ? { leftOut } : {}),
    notes,
    // The creation-off record is in the summary, so the verify list does not repeat it.
    stillChecking: result.noteItems
      .filter((note) => note.kind === 'verify' && note !== creationNote)
      .map(withoutVerifyPrefix),
    docs: { label: profile.label, url: result.docUrl, date: result.docReadDate },
    skipped,
    details: [...result.warnings, ...input.decodeWarnings],
    meter: { length: result.length, cap, label: copy.preview.length(result.length, cap) },
    ...(zipFiles.length > 0
      ? { zip: { filename: zipFilename(build.name, profile.id), files: zipFiles } }
      : {}),
  };
}
