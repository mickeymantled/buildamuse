// Bundle assembly: turns the compiled soul and the delivery pieces into the files, spoken
// sentences, custom rules and notes the profile delivers. Every text comes from a library
// record or a profile template; this file only decides where each piece goes.

import { fill } from '../fill.js';
import { customRules } from '../gates.js';
import { nameWordId } from '../trace.js';
import type {
  BundleFile,
  BundleNote,
  BundleStep,
  CompileContext,
  CustomRule,
  Item,
  Line,
  SpokenItem,
  StepWhen,
  TracedLine,
  Trimmed,
  Undelivered,
} from '../types.js';
import { artifactKindOf } from '../types.js';
import { agentsFile, packDelivers, type memoryDelivery, type skillsAndRoutines } from './deliver.js';
import { carriesRoles, roleOutputs, type RoleNote } from './roles.js';

// Past this a custom GPT description is over the limit (< 300).
const DESCRIPTION_LIMIT = 300;

export interface BundleParts {
  soul: string;
  soulLines: TracedLine[];
  buildName: string;
  memory: ReturnType<typeof memoryDelivery>;
  delivery: ReturnType<typeof skillsAndRoutines>;
  items: Item[]; // the personality items that survived the layout and the length fit
  trimmed: Trimmed[]; // what the tiers, S1 and the instructions fit cut from them
}

export interface Bundle {
  files: BundleFile[];
  spoken: SpokenItem[];
  customRules: CustomRule[];
  conversationStarters?: string[];
  description?: string;
  starterIds: string[][];
  descriptionIds: string[];
  buildNameIds: string[];
  installSteps: string[];
  notes: string[];
  steps: BundleStep[];
  noteItems: BundleNote[];
  verify: BundleNote[];
  undelivered: Undelivered[];
  trimmed: Trimmed[];
  warnings: string[];
}

// What the bundle carries, for the `when` tags on steps and verify lines.
type Delivered = Record<StepWhen, boolean>;

function template(ctx: CompileContext, key: string): Line {
  const found = Object.hasOwn(ctx.profile.templates, key) ? ctx.profile.templates[key] : undefined;
  if (!found) {
    throw new Error(`Profile ${ctx.profile.id} has no template "${key}"`);
  }
  return found;
}

// Each record id once, in first-seen order. Blank lines carry no record of their own.
function uniqueIds(lines: TracedLine[]): string[] {
  const ids: string[] = [];
  for (const line of lines) {
    if (line.kind !== 'blank' && !ids.includes(line.id)) {
      ids.push(line.id);
    }
  }
  return ids;
}

// The personality artifact: a file, a paste block, or a spoken item, by profile. Custom
// instructions also carry the memory block, which is its own paste field before the personality.
function personality(
  ctx: CompileContext,
  parts: BundleParts,
): { files: BundleFile[]; spoken: SpokenItem[]; warnings: string[] } {
  const { profile } = ctx;
  const { soul, soulLines, memory } = parts;

  if (profile.personalityDelivery === 'spoken') {
    return {
      files: [],
      spoken: [{ label: 'Personality', text: soul, ids: uniqueIds(soulLines), kind: 'personality' }],
      warnings: [],
    };
  }

  const files: BundleFile[] = [];
  const warnings: string[] = [];
  let path = profile.personalityPath;
  if (profile.personalityDelivery === 'file') {
    path = 'SOUL.md';
  } else if (profile.id === 'chatgpt-instructions' && memory.block) {
    const { text, ids } = memory.block;
    files.push({
      path: `${profile.personalityPath} (first field)`,
      label: 'Memory',
      delivery: 'paste',
      kind: 'memory',
      content: text,
      lines: [{ text, id: ids[0], kind: 'memory', sources: ids.slice(1) }],
    });
    if (text.length > ctx.cap) {
      warnings.push(`length: memory block is ${text.length} characters, over ${ctx.cap}`);
    }
    path = `${profile.personalityPath} (second field)`;
  }
  files.push({
    path,
    label: 'Personality',
    delivery: profile.personalityDelivery,
    kind: 'personality',
    content: soul,
    lines: soulLines,
  });
  return { files, spoken: [], warnings };
}

// Spoken items in the order the profile reads them out: skills, then routines.
function spokenItems(
  ctx: CompileContext,
  parts: BundleParts,
  personalityItems: SpokenItem[],
): SpokenItem[] {
  const { memory, delivery } = parts;
  const skills = delivery.spoken.filter((s) => s.kind === 'skill');
  const routines = delivery.spoken.filter((s) => s.kind === 'routine');

  if (ctx.profile.id === 'chatgpt-dot') {
    return [...personalityItems, ...memory.spoken, ...skills, ...routines];
  }
  if (ctx.profile.id === 'grok') {
    const line = ctx.packs.find((p) => p.firstTask !== undefined)?.firstTask ?? template(ctx, 'grok.firstTask');
    const firstTask: SpokenItem = {
      label: 'First task',
      text: line.line,
      ids: [line.id],
      kind: 'firstTask',
    };
    return [...memory.spoken, firstTask, ...skills, ...routines];
  }
  return [...memory.spoken, ...skills, ...routines];
}

// Custom GPT only: four starters (the domain example and probes 2 to 4) and the description,
// with the record ids each came from.
function gptExtras(
  ctx: CompileContext,
  parts: BundleParts,
): {
  conversationStarters: string[];
  starterIds: string[][];
  description: string;
  descriptionIds: string[];
  warnings: string[];
} {
  const { build, lib, resolved } = ctx;
  const base = lib.bases.find((b) => b.id === build.base);
  if (!base) {
    throw new Error(`bundle: missing base ${build.base}`);
  }
  const descriptionLine = template(ctx, 'description');
  const description = fill(descriptionLine.line, {
    name: build.name.trim(),
    buildName: parts.buildName,
    baseLine: base.baseLine,
  });
  const warnings: string[] = [];
  if (description.length >= DESCRIPTION_LIMIT) {
    warnings.push(
      `length: description is ${description.length} characters, must be under ${DESCRIPTION_LIMIT}`,
    );
  }
  const probes = lib.probes.slice(1, 4);
  return {
    conversationStarters: [resolved.domain.me, ...probes.map((p) => p.line)],
    starterIds: [[resolved.domain.id], ...probes.map((p) => [p.id])],
    description,
    descriptionIds: [descriptionLine.id, base.id],
    warnings,
  };
}

// The ids of the names.json words in the build name, recovered from the name itself so this
// pass never repeats the name pass's pick. Only words that apply to the build's stats can match.
function nameWordIds(ctx: CompileContext, name: string): string[] {
  const { build, lib } = ctx;
  const base = lib.bases.find((b) => b.id === build.base);
  if (!base) {
    throw new Error(`bundle: missing base ${build.base}`);
  }
  const candidates = lib.names.words.filter((w) => {
    const level = build.stats[w.stat];
    return level !== undefined && (w.level === undefined || w.level === level);
  });
  const noun = ` ${base.noun}`;
  let rest = name.endsWith(noun) ? name.slice(0, name.length - noun.length) : name;
  const ids: string[] = [];
  while (rest !== '') {
    const hit = candidates
      .filter((w) => rest === w.word || rest.startsWith(`${w.word} `))
      .sort((a, b) => b.word.length - a.word.length)[0];
    if (!hit) {
      throw new Error(`bundle: no names.json word for "${rest}" in build name "${name}"`);
    }
    ids.push(nameWordId(hit));
    rest = rest.slice(hit.word.length).trimStart();
  }
  return ids;
}

function deliveredOf(ctx: CompileContext, files: BundleFile[], spoken: SpokenItem[]): Delivered {
  return {
    skills: files.some((f) => artifactKindOf(f) === 'skills') || spoken.some((s) => s.kind === 'skill'),
    routines: spoken.some((s) => s.kind === 'routine'),
    roles: ctx.roles.length > 0 && carriesRoles(ctx.profile),
  };
}

// No `when` means always; otherwise any one of the listed artifacts is enough.
function shown(when: StepWhen[] | undefined, has: Delivered): boolean {
  return when === undefined || when.length === 0 || when.some((w) => has[w]);
}

// The profile's steps that apply to this bundle, in library order, closers last.
function stepsOf(ctx: CompileContext, has: Delivered): BundleStep[] {
  const steps = ctx.profile.installSteps
    .filter((step) => shown(step.when, has))
    .map((step): BundleStep => ({
      id: step.id,
      text: step.line,
      shows: [...(step.shows ?? [])],
      closer: step.closer === true,
    }));
  return [...steps.filter((s) => !s.closer), ...steps.filter((s) => s.closer)];
}

// Verify lines, the profile's own notes, the reload note, each pack's venue note, role notes,
// then (custom GPT) the Actions note. A verify line with a `when` shows only if the bundle
// delivers one of those artifacts.
function noteItemsOf(ctx: CompileContext, roleNotes: RoleNote[], has: Delivered): BundleNote[] {
  const { profile } = ctx;
  const note = (line: Line, kind: BundleNote['kind']): BundleNote => ({
    id: line.id,
    text: line.line,
    kind,
  });
  const notes: BundleNote[] = [];
  for (const line of profile.verify) {
    if (shown(line.when, has)) {
      notes.push(note(line, 'verify'));
    }
  }
  for (const line of profile.notes ?? []) {
    notes.push(note(line, 'note'));
  }
  if (profile.reloadNote) {
    notes.push(note(profile.reloadNote, 'reload'));
  }
  for (const pack of ctx.packs) {
    const venue = pack.venueNotes;
    if (venue && Object.hasOwn(venue, profile.id)) {
      notes.push(note(venue[profile.id], 'venue'));
    }
  }
  for (const n of roleNotes) {
    notes.push({ id: n.ids[0], text: n.text, kind: 'role' });
  }
  if (profile.id === 'chatgpt-gpt') {
    notes.push(note(template(ctx, 'actions.consequential'), 'actions'));
  }
  return notes;
}

// What the build asked for that this bundle does not carry. Skills on custom instructions count
// as delivered only if their inline item is still in the final items; routines never are there.
function undeliveredOf(ctx: CompileContext, parts: BundleParts): Undelivered[] {
  const { profile } = ctx;
  const out: Undelivered[] = [];
  for (const id of ctx.build.packs) {
    const pack = ctx.lib.packs.find((p) => p.id === id);
    if (pack && !packDelivers(pack, profile.id)) {
      out.push({ kind: 'pack', id: pack.id, name: pack.label });
    }
  }
  if (!carriesRoles(profile)) {
    for (const role of ctx.roles) {
      out.push({ kind: 'roles', id: role.id, name: role.label });
    }
  }
  const inline = new Set(parts.items.filter((i) => i.kind === 'skill').flatMap((i) => i.sources ?? []));
  for (const ref of parts.delivery.refs) {
    const carried =
      ref.kind === 'skill'
        ? profile.skillsDelivery !== 'inline' || inline.has(ref.id)
        : profile.routinesDelivery !== 'none';
    if (!carried) {
      out.push({ kind: ref.kind, id: ref.id, name: ref.name });
    }
  }
  return out;
}

// Cuts the role souls made on top of the main soul's. A rule or short form both souls cut is one
// fact, so it stays one entry. A cut only a role soul made keeps its role and path, one entry per
// file, so the certificate can say which role files lack the line. Count rules by distinct id.
function mergeTrimmed(main: Trimmed[], fromRoles: Trimmed[]): Trimmed[] {
  const reported = new Set(main.map((t) => `${t.kind}|${t.id}`));
  return [...main, ...fromRoles.filter((t) => !reported.has(`${t.kind}|${t.id}`))];
}

export function assembleBundle(ctx: CompileContext, parts: BundleParts): Bundle {
  const { profile, gates, lib } = ctx;
  const warnings: string[] = [];

  const main = personality(ctx, parts);
  warnings.push(...main.warnings);

  // Rules layer: the AGENTS.md file, or one custom rule per gate.
  const rulesFiles: BundleFile[] = profile.rulesDelivery === 'AGENTS.md' ? [agentsFile(ctx)] : [];
  const rules = profile.rulesDelivery === 'custom-rules' ? customRules(gates, profile, lib) : [];

  const roles = roleOutputs(ctx);
  warnings.push(...roles.warnings);

  const files = [
    ...main.files,
    ...rulesFiles,
    ...parts.memory.files,
    ...parts.delivery.files,
    ...roles.files,
  ];
  const spoken = spokenItems(ctx, parts, main.spoken);
  const has = deliveredOf(ctx, files, spoken);
  const steps = stepsOf(ctx, has);
  const noteItems = noteItemsOf(ctx, roles.notes, has);
  const undelivered = undeliveredOf(ctx, parts);

  const bundle: Bundle = {
    files,
    spoken,
    customRules: rules,
    starterIds: [],
    descriptionIds: [],
    buildNameIds: nameWordIds(ctx, parts.buildName),
    installSteps: steps.map((s) => s.text),
    notes: noteItems.map((n) => n.text),
    steps,
    noteItems,
    verify: noteItems.filter((n) => n.kind === 'verify'),
    undelivered,
    trimmed: mergeTrimmed(parts.trimmed, roles.trimmed),
    warnings,
  };

  if (profile.id === 'chatgpt-gpt') {
    const extras = gptExtras(ctx, parts);
    bundle.conversationStarters = extras.conversationStarters;
    bundle.starterIds = extras.starterIds;
    bundle.description = extras.description;
    bundle.descriptionIds = extras.descriptionIds;
    warnings.push(...extras.warnings);
  }
  warnings.push(...undelivered.map((u) => `undelivered: ${u.id}`));
  return bundle;
}
