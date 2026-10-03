// Delivery of skills, routines, memory and the AGENTS.md rules file. Every text comes from a
// library record or a profile template; this file only fills placeholders and lays out lines.

import { fill } from '../fill.js';
import { rulesItems } from '../gates.js';
import type {
  BundleFile,
  ChipSkill,
  CompileContext,
  GateSetting,
  Item,
  Library,
  Line,
  ProfileId,
  Skill,
  SpokenItem,
  TracedLine,
  WorkflowPack,
} from '../types.js';

type Entry =
  | { src: 'pack'; id: string; dir: string; skill: Skill }
  | { src: 'chip'; id: string; dir: string; skill: ChipSkill };

// Same rule as passes/skills.ts: lowercase the first letter unless the second is uppercase.
function lowerFirst(s: string): string {
  if (s.length < 2) return s.toLowerCase();
  const second = s[1];
  if (second >= 'A' && second <= 'Z') return s;
  return s[0].toLowerCase() + s.slice(1);
}

function template(ctx: CompileContext, key: string): Line {
  const found = Object.hasOwn(ctx.profile.templates, key) ? ctx.profile.templates[key] : undefined;
  if (!found) {
    throw new Error(`Profile ${ctx.profile.id} has no template "${key}"`);
  }
  return found;
}

function filled(
  ctx: CompileContext,
  key: string,
  vars: Record<string, string>,
): { text: string; id: string } {
  const t = template(ctx, key);
  return { text: fill(t.line, vars), id: t.id };
}

function blankLine(lib: Library): TracedLine {
  return { text: '', id: lib.chassis.blank.id, kind: 'blank' };
}

export function fileFromLines(
  path: string,
  label: string,
  delivery: BundleFile['delivery'],
  kind: BundleFile['kind'],
  lines: TracedLine[],
): BundleFile {
  return { path, label, delivery, kind, content: lines.map((l) => l.text).join('\n'), lines };
}

// A pack whose `profiles` list leaves this profile out keeps its gates, limits and rules lines,
// but adds no skills, triggers, seeds, job, sources, deliverable or first task.
export function packDelivers(pack: WorkflowPack, profile: ProfileId): boolean {
  return pack.profiles === undefined || pack.profiles.includes(profile);
}

const nameKey = (name: string): string => name.trim().toLowerCase();

// OpenClaw and Hermes skill folders must match ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ and stay within 64
// characters, so underscores in record ids become hyphens there. Other profiles name files, not
// skill folders, and keep the record id as it is.
const DIR_MAX = 64;
const SKILL_FOLDER_PROFILES: readonly ProfileId[] = ['openclaw', 'hermes'];

// Chip skills first in tap order, then pack skills in pack order. A chip skill whose name a
// selected pack skill also carries is dropped, so the six-field pack skill is the only copy.
// A directory name that is already taken (two packs can share a skill id) gets the pack id in front.
function collectSkills(ctx: CompileContext): Entry[] {
  const used = new Set<string>();
  const folders = SKILL_FOLDER_PROFILES.includes(ctx.profile.id);
  const tidy = (s: string): string => (folders ? s.replace(/_/g, '-') : s);
  const claim = (dir: string, packId?: string): string => {
    let name = tidy(dir);
    if (used.has(name) && packId !== undefined) {
      name = tidy(`${packId}-${dir}`);
    }
    // Cut to the length limit and any trailing hyphen the cut leaves, leaving room for a suffix.
    const fit = (s: string, room: number): string => (folders ? s.slice(0, room).replace(/-+$/, '') : s);
    const base = fit(name, DIR_MAX);
    name = base;
    for (let n = 2; used.has(name); n++) {
      const suffix = `-${n}`;
      name = `${fit(base, DIR_MAX - suffix.length)}${suffix}`;
    }
    used.add(name);
    return name;
  };

  const packNames = new Set<string>();
  for (const pack of ctx.packs) {
    for (const skill of pack.skills) packNames.add(nameKey(skill.name));
  }

  const entries: Entry[] = [];
  for (const chipId of ctx.build.chips) {
    const chip = ctx.lib.chips.find((c) => c.id === chipId);
    for (const skill of chip?.skills ?? []) {
      if (packNames.has(nameKey(skill.name))) continue;
      const last = skill.id.split('.').at(-1) as string;
      entries.push({ src: 'chip', id: skill.id, dir: claim(last), skill });
    }
  }
  for (const pack of ctx.packs) {
    for (const skill of pack.skills) {
      entries.push({
        src: 'pack',
        id: `pack.${pack.id}.skill.${skill.id}`,
        dir: claim(skill.id, pack.id),
        skill,
      });
    }
  }
  return entries;
}

// A skill's one-line description for the SKILL.md frontmatter, escaped for a YAML double-quoted
// string: backslash and double quote are escaped and newlines become spaces.
function frontmatterDescription(e: Entry): string {
  const text = e.src === 'pack' ? e.skill.whenToUse : e.skill.detail;
  return text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function varsOf(e: Entry): Record<string, string> {
  if (e.src === 'pack') {
    const s = e.skill;
    return {
      name: s.name,
      whenToUse: s.whenToUse,
      inputs: s.inputs,
      steps: s.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
      validate: s.validate,
      returns: s.returns,
      requiresApproval: s.requiresApproval,
      schedule: s.schedule ?? '',
      task: s.name,
      sentence: s.whenToUse,
      detail: s.whenToUse,
    };
  }
  const s = e.skill;
  return {
    name: s.name,
    sentence: lowerFirst(s.sentence),
    schedule: s.schedule ?? '',
    detail: s.detail,
    task: s.name,
  };
}

// The rules lines of the gates picked by `include`, in registry order, with their record ids.
function gateRules(
  ctx: CompileContext,
  include: (action: string, setting: GateSetting) => boolean,
): { texts: string[]; ids: string[] } {
  const texts: string[] = [];
  const ids: string[] = [];
  for (const gate of ctx.lib.gates) {
    if (!Object.hasOwn(ctx.gates, gate.id)) continue;
    const setting = ctx.gates[gate.id] as GateSetting;
    if (!include(gate.id, setting)) continue;
    texts.push(gate.rulesLine[setting]);
    ids.push(`gate.${gate.id}.rules.${setting}`);
  }
  return { texts, ids };
}

function skillSpoken(ctx: CompileContext, e: Entry): SpokenItem {
  const vars = varsOf(e);
  const main = filled(ctx, e.src === 'pack' ? 'skill.sentence' : 'skill.legacy', vars);
  const label = `${ctx.profile.skillLabel ?? 'Skill'}: ${e.skill.name}`;

  if (ctx.profile.id === 'chatgpt-dot') {
    const suffix = filled(ctx, 'skill.suffix', vars);
    return { label, text: `${main.text} ${suffix.text}`, ids: [main.id, suffix.id, e.id], kind: 'skill' };
  }

  if (ctx.profile.id === 'grok') {
    // Brian: grok rules go in "the requiresApproval field of every skill", so every skill
    // carries every approve or forbid gate (plus any auto gate the pack skill itself uses).
    const rules =
      e.src === 'pack'
        ? gateRules(ctx, (action, setting) => setting !== 'auto' || (e.skill as Skill).actions.includes(action))
        : gateRules(ctx, (_action, setting) => setting !== 'auto');
    const ruleText =
      e.src === 'pack' && rules.texts.length === 0
        ? e.skill.requiresApproval
        : rules.texts.join(' ');
    const suffix = filled(ctx, 'skill.approvalSuffix', { ...vars, rules: ruleText });
    return {
      label,
      text: `${main.text}\n${suffix.text}`,
      ids: [main.id, suffix.id, ...rules.ids, e.id],
      kind: 'skill',
    };
  }

  return { label, text: main.text, ids: [main.id, e.id], kind: 'skill' };
}

function routineSpoken(ctx: CompileContext, e: Entry): SpokenItem {
  const label = `Routine: ${e.skill.name}`;
  const vars = varsOf(e);

  // Grok reads the approval boundary from the routine, so it carries the build's rules lines.
  if (ctx.profile.id === 'grok') {
    if (e.src === 'pack') {
      const skill = e.skill;
      const rules = gateRules(ctx, (action, setting) => setting !== 'auto' || skill.actions.includes(action));
      const requiresApproval =
        rules.texts.length === 0 ? skill.requiresApproval : rules.texts.join(' ');
      const main = filled(ctx, 'routine.sentence', { ...vars, requiresApproval });
      return { label, text: main.text, ids: [main.id, ...rules.ids, e.id], kind: 'routine' };
    }
    const main = filled(ctx, 'routine.legacy', vars);
    const rules = gateRules(ctx, (_action, setting) => setting !== 'auto');
    const suffix = filled(ctx, 'skill.approvalSuffix', { ...vars, rules: rules.texts.join(' ') });
    return {
      label,
      text: `${main.text}\n${suffix.text}`,
      ids: [main.id, suffix.id, ...rules.ids, e.id],
      kind: 'routine',
    };
  }

  const main = filled(ctx, e.src === 'pack' ? 'routine.sentence' : 'routine.legacy', vars);
  return { label, text: main.text, ids: [main.id, e.id], kind: 'routine' };
}

function skillPath(ctx: CompileContext, e: Entry): string {
  switch (ctx.profile.id) {
    case 'chatgpt-gpt':
      return `knowledge/${e.dir}.md`;
    case 'chatgpt-project':
      return `project/${e.dir}.md`;
    default:
      return `skills/${e.dir}/SKILL.md`;
  }
}

// One file per skill. Pack skills render their profile template; chip skills render the profile's
// chipFile template (openclaw, hermes) or a heading and the library detail text. The frontmatter
// lines of a SKILL.md come from the template, so they trace to its id.
function skillFile(ctx: CompileContext, e: Entry): BundleFile {
  const withFileTemplate = ctx.profile.id === 'openclaw' || ctx.profile.id === 'hermes';
  const vars = { ...varsOf(e), dir: e.dir, description: frontmatterDescription(e) };
  let text: string;
  let id: string;
  if (e.src === 'pack') {
    const t = filled(ctx, withFileTemplate ? 'skill.file' : 'knowledge.file', vars);
    text = t.text;
    id = t.id;
  } else if (withFileTemplate) {
    const t = filled(ctx, 'skill.chipFile', vars);
    text = t.text;
    id = t.id;
  } else {
    text = `# ${e.skill.name}\n\n${e.skill.detail}`;
    id = e.id;
  }
  const lines: TracedLine[] = text.split('\n').map((line) =>
    line === ''
      ? blankLine(ctx.lib)
      : { text: line, id, kind: 'skill', sources: [e.id] },
  );
  const kind = ctx.profile.skillsDelivery === 'knowledge' ? 'knowledge' : 'skill';
  return fileFromLines(skillPath(ctx, e), `Skill: ${e.skill.name}`, 'file', kind, lines);
}

function pointerItem(ctx: CompileContext, e: Entry): Item {
  const t = filled(ctx, 'skill.pointer', {
    whenToUse: e.src === 'pack' ? e.skill.whenToUse : e.skill.detail,
    file: `${e.dir}.md`,
  });
  return {
    id: t.id,
    text: t.text,
    kind: 'skill',
    section: 'skills',
    format: 'bullet',
    sources: [e.id],
  };
}

// The chip sentence already carries the skill name, so the inline line uses the name-less
// detail for chip skills and whenToUse for pack skills.
function inlineItem(ctx: CompileContext, e: Entry): Item {
  const sentence = e.src === 'pack' ? e.skill.whenToUse : e.skill.detail;
  const t = filled(ctx, 'skill.inline', { ...varsOf(e), sentence });
  return {
    id: t.id,
    text: t.text,
    kind: 'skill',
    section: 'skills',
    format: 'bullet',
    sources: [e.id],
  };
}

// Every skill and routine the build asks for, in delivery order, whether or not the profile
// ends up carrying it. The undelivered check compares this list with what survived.
export interface SkillRef {
  id: string;
  name: string;
  kind: 'skill' | 'routine';
}

export function skillsAndRoutines(ctx: CompileContext): {
  spoken: SpokenItem[];
  files: BundleFile[];
  pointers: Item[];
  inline: Item[];
  refs: SkillRef[];
} {
  const spoken: SpokenItem[] = [];
  const files: BundleFile[] = [];
  const pointers: Item[] = [];
  const inline: Item[] = [];
  const entries = collectSkills(ctx);
  const refs = entries.map(
    (e): SkillRef => ({
      id: e.id,
      name: e.skill.name,
      kind: e.skill.kind === 'trigger' ? 'skill' : 'routine',
    }),
  );
  const id = ctx.profile.id;

  if (id === 'chatgpt-instructions') {
    // Routines are not delivered on this profile, so only trigger skills take the three slots.
    for (const e of entries.filter((x) => x.skill.kind === 'trigger').slice(0, 3)) {
      inline.push(inlineItem(ctx, e));
    }
    return { spoken, files, pointers, inline, refs };
  }

  for (const e of entries) {
    const isSkill = e.skill.kind === 'trigger';
    switch (id) {
      case 'muse':
      case 'chatgpt-dot':
      case 'grok':
        spoken.push(isSkill ? skillSpoken(ctx, e) : routineSpoken(ctx, e));
        break;
      case 'openclaw':
      case 'hermes':
        if (isSkill) {
          files.push(skillFile(ctx, e));
        } else {
          spoken.push(routineSpoken(ctx, e));
        }
        break;
      case 'chatgpt-gpt':
      case 'chatgpt-project':
        if (isSkill) {
          files.push(skillFile(ctx, e));
          pointers.push(pointerItem(ctx, e));
        } else {
          spoken.push(routineSpoken(ctx, e));
        }
        break;
    }
  }
  return { spoken, files, pointers, inline, refs };
}

export function memoryDelivery(
  ctx: CompileContext,
  seedText: string,
  seedIdList: string[],
): { spoken: SpokenItem[]; files: BundleFile[]; block?: { text: string; ids: string[] } } {
  switch (ctx.profile.memoryDelivery) {
    case 'spoken': {
      const t = filled(ctx, 'memory.sentence', { seed: seedText });
      return {
        spoken: [
          { label: 'Memory sentence', text: t.text, ids: [t.id, ...seedIdList], kind: 'memory' },
        ],
        files: [],
      };
    }
    case 'inline': {
      const t = filled(ctx, 'memory.block', { seed: seedText });
      return { spoken: [], files: [], block: { text: t.text, ids: [t.id, ...seedIdList] } };
    }
    case 'file': {
      const heading = template(ctx, 'memory.file.heading');
      const lines: TracedLine[] = [
        { text: heading.line, id: heading.id, kind: 'heading' },
        blankLine(ctx.lib),
      ];
      for (const chipId of ctx.build.chips) {
        const chip = ctx.lib.chips.find((c) => c.id === chipId);
        if (chip?.seed) {
          lines.push({ text: `- ${chip.seed}`, id: `chip.${chip.id}.seed`, kind: 'memory' });
        }
      }
      for (const pack of ctx.packs) {
        for (const line of pack.seeds) {
          lines.push({ text: `- ${line.line}`, id: line.id, kind: 'memory' });
        }
      }
      const hardPart = ctx.lib.heart.hardParts.find((h) => h.id === ctx.build.heart.hardPart);
      if (!hardPart) {
        throw new Error(`Unknown hard part: ${ctx.build.heart.hardPart}`);
      }
      lines.push({
        text: `- ${hardPart.seedClause}`,
        id: `heart.${hardPart.id}.seedClause`,
        kind: 'memory',
      });
      return { spoken: [], files: [fileFromLines('USER.md', 'Memory', 'file', 'memory', lines)] };
    }
  }
}

function bulletLine(item: Item): TracedLine {
  const line: TracedLine = { text: `- ${item.text}`, id: item.id, kind: item.kind };
  if (item.sources) {
    line.sources = item.sources;
  }
  return line;
}

// The rules file for openclaw and hermes: heading, intro, any extra items, then the rules block.
export function agentsFile(
  ctx: CompileContext,
  extraItems: Item[] = [],
  path = 'AGENTS.md',
): BundleFile {
  const heading = template(ctx, 'agents.heading');
  const intro = template(ctx, 'agents.intro');
  const lines: TracedLine[] = [
    { text: heading.line, id: heading.id, kind: 'heading' },
    blankLine(ctx.lib),
    { text: intro.line, id: intro.id, kind: 'template' },
    blankLine(ctx.lib),
  ];
  for (const item of extraItems) {
    lines.push(bulletLine(item));
  }
  for (const item of rulesItems(ctx.build, ctx.gates, ctx.limits, ctx.lib, 'rules')) {
    lines.push(bulletLine(item));
  }
  return fileFromLines(path, 'Rules', 'file', 'rules', lines);
}
