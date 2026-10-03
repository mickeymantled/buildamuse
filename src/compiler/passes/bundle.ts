// Bundle assembly: turns the compiled soul and the delivery pieces into the files, spoken
// sentences, custom rules and notes the profile delivers. Every text comes from a library
// record or a profile template; this file only decides where each piece goes.

import { fill } from '../fill.js';
import { customRules } from '../gates.js';
import type {
  BundleFile,
  CompileContext,
  CustomRule,
  Line,
  SpokenItem,
  TracedLine,
} from '../types.js';
import { agentsFile, type memoryDelivery, type skillsAndRoutines } from './deliver.js';
import { roleOutputs } from './roles.js';

// Past this a custom GPT description is over the limit (< 300).
const DESCRIPTION_LIMIT = 300;

export interface BundleParts {
  soul: string;
  soulLines: TracedLine[];
  buildName: string;
  memory: ReturnType<typeof memoryDelivery>;
  delivery: ReturnType<typeof skillsAndRoutines>;
}

export interface Bundle {
  files: BundleFile[];
  spoken: SpokenItem[];
  customRules: CustomRule[];
  conversationStarters?: string[];
  description?: string;
  installSteps: string[];
  notes: string[];
  warnings: string[];
}

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
      spoken: [{ label: 'Personality', text: soul, ids: uniqueIds(soulLines) }],
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
  const skillPrefix = `${ctx.profile.skillLabel ?? 'Skill'}: `;
  const skills = delivery.spoken.filter((s) => s.label.startsWith(skillPrefix));
  const routines = delivery.spoken.filter((s) => s.label.startsWith('Routine: '));

  if (ctx.profile.id === 'chatgpt-dot') {
    return [...personalityItems, ...memory.spoken, ...skills, ...routines];
  }
  if (ctx.profile.id === 'grok') {
    const line = ctx.packs.find((p) => p.firstTask !== undefined)?.firstTask ?? template(ctx, 'grok.firstTask');
    const firstTask: SpokenItem = { label: 'First task', text: line.line, ids: [line.id] };
    return [...memory.spoken, firstTask, ...skills, ...routines];
  }
  return [...memory.spoken, ...skills, ...routines];
}

// Custom GPT only: four starters (the domain example and probes 2 to 4) and the description.
function gptExtras(
  ctx: CompileContext,
  parts: BundleParts,
): { conversationStarters: string[]; description: string; warnings: string[] } {
  const { build, lib, resolved } = ctx;
  const base = lib.bases.find((b) => b.id === build.base);
  if (!base) {
    throw new Error(`bundle: missing base ${build.base}`);
  }
  const description = fill(template(ctx, 'description').line, {
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
  return {
    conversationStarters: [resolved.domain.me, ...lib.probes.slice(1, 4).map((p) => p.line)],
    description,
    warnings,
  };
}

// Verify lines, the profile's own notes, the reload note, each pack's venue note, role notes,
// then (custom GPT) the Actions note.
function notesOf(ctx: CompileContext, roleNotes: string[]): string[] {
  const { profile } = ctx;
  const notes = profile.verify.map((l) => l.line);
  notes.push(...(profile.notes ?? []).map((l) => l.line));
  if (profile.reloadNote) {
    notes.push(profile.reloadNote.line);
  }
  for (const pack of ctx.packs) {
    const venue = pack.venueNotes;
    if (venue && Object.hasOwn(venue, profile.id)) {
      notes.push(venue[profile.id].line);
    }
  }
  notes.push(...roleNotes);
  if (profile.id === 'chatgpt-gpt') {
    notes.push(template(ctx, 'actions.consequential').line);
  }
  return notes;
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

  const bundle: Bundle = {
    files: [
      ...main.files,
      ...rulesFiles,
      ...parts.memory.files,
      ...parts.delivery.files,
      ...roles.files,
    ],
    spoken: spokenItems(ctx, parts, main.spoken),
    customRules: rules,
    installSteps: profile.installSteps.map((l) => l.line),
    notes: notesOf(
      ctx,
      roles.notes.map((n) => n.text),
    ),
    warnings,
  };

  if (profile.id === 'chatgpt-gpt') {
    const extras = gptExtras(ctx, parts);
    bundle.conversationStarters = extras.conversationStarters;
    bundle.description = extras.description;
    warnings.push(...extras.warnings);
  }
  return bundle;
}
