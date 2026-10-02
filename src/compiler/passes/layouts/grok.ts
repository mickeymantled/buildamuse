// Layout: Grok Bot description. One text box, eight sections. The profile opens with the job in
// operational terms. No opening lines, no no-self-edit, no rules-outrank. Chassis uses short forms
// (the profile resolves that before ctx.chassis is built). Every string comes from a library record
// or a profile template; code adds only bullets, newlines and Me/You prefixes.

import type {
  ChassisLine,
  CompileContext,
  Drive,
  Item,
  Library,
  Line,
  RenderOptions,
  Section,
  StatId,
} from '../../types.js';
import { fill } from '../../fill.js';
import { gateSoulItems, rulesItems } from '../../gates.js';
import { exampleItems } from '../examples.js';

const ORDER: readonly Section[] = [
  'who',
  'want',
  'talk',
  'sources',
  'never',
  'missing',
  'return',
  'examples',
];

function template(ctx: CompileContext, key: string): Line {
  if (!Object.hasOwn(ctx.profile.templates, key)) {
    throw new Error(`grok: profile ${ctx.profile.id} has no template ${key}`);
  }
  return ctx.profile.templates[key] as Line;
}

function templateItem(
  ctx: CompileContext,
  key: string,
  section: Section,
  format: Item['format'],
): Item {
  const t = template(ctx, key);
  return { id: t.id, text: t.line, kind: 'template', section, format };
}

function chassisItem(line: ChassisLine, section: Section, format: Item['format']): Item {
  return { id: line.id, text: line.line, kind: 'chassis', section, format };
}

function statItem(lib: Library, stat: StatId, level: number): Item {
  const record = lib.stats.find((s) => s.stat === stat && s.level === level);
  if (!record) throw new Error(`grok: missing stat line for ${stat} ${level}`);
  return { id: record.id, text: record.line, kind: 'stat', section: 'talk', format: 'bullet' };
}

function driveOf(lib: Library, id: string): Drive {
  const drive = lib.heart.drives.find((d) => d.id === id);
  if (!drive) throw new Error(`grok: missing drive ${id}`);
  return drive;
}

// The first selected pack with a job line sets the job; else the base's template job.
function whoItem(ctx: CompileContext): Item {
  const nameLine = template(ctx, 'grok.nameLine');
  const job: Line =
    ctx.packs.find((p) => p.job !== undefined)?.job ?? template(ctx, `grok.job.${ctx.build.base}`);
  return {
    id: nameLine.id,
    text: fill(nameLine.line, { name: ctx.build.name.trim(), job: job.line }),
    kind: 'template',
    section: 'who',
    format: 'plain',
    sources: [job.id],
  };
}

function wantItems(ctx: CompileContext): Item[] {
  const { build, lib, resolved } = ctx;
  const items: Item[] = [];
  for (const drive of [driveOf(lib, build.heart.d1), driveOf(lib, build.heart.d2), resolved.d3]) {
    items.push({
      id: drive.id,
      text: drive.line,
      kind: 'drive',
      section: 'want',
      format: 'bullet',
    });
  }
  for (const line of ctx.chassis) {
    if (line.section === 'want') {
      items.push({ ...chassisItem(line, 'want', 'plain'), blankBefore: true });
    }
  }
  return items;
}

// Gate soul lines sit right after the approval chassis line. If a profile dropped that line,
// they still ship, after the act lines, so a gate never goes missing.
function actItems(ctx: CompileContext): Item[] {
  const gates = gateSoulItems(ctx.gates, ctx.lib).map((item): Item => ({ ...item, section: 'talk' }));
  const items: Item[] = [];
  let placed = false;
  for (const line of ctx.chassis) {
    if (line.section !== 'act') continue;
    items.push(chassisItem(line, 'talk', 'bullet'));
    if (line.id.startsWith('chassis.act.approval')) {
      items.push(...gates);
      placed = true;
    }
  }
  if (!placed) {
    items.push(...gates);
  }
  return items;
}

function talkItems(ctx: CompileContext): Item[] {
  const { build, lib } = ctx;
  const items: Item[] = [];
  const chassisIn = (section: Section) => ctx.chassis.filter((l) => l.section === section);

  for (const stat of ['blunt', 'warm', 'funny', 'chatty'] as const) {
    items.push(statItem(lib, stat, build.stats[stat]));
  }

  const talk = chassisIn('talk');
  for (const line of talk.filter((l) => !l.when)) items.push(chassisItem(line, 'talk', 'bullet'));
  for (const line of talk.filter((l) => l.when)) items.push(chassisItem(line, 'talk', 'bullet'));

  for (const peeveId of build.peeves) {
    const peeve = lib.peeves.find((p) => p.id === peeveId);
    if (!peeve) throw new Error(`grok: missing peeve ${peeveId}`);
    if (!peeve.line) continue;
    items.push({ id: peeve.id, text: peeve.line, kind: 'peeve', section: 'talk', format: 'bullet' });
  }

  for (const chipId of build.chips) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip) throw new Error(`grok: missing chip ${chipId}`);
    chip.triggers.forEach((trigger, i) => {
      items.push({
        id: trigger.id,
        text: trigger.line,
        kind: 'chip-trigger',
        section: 'talk',
        format: 'bullet',
        chip: chip.id,
        group: chip.group,
        triggerIndex: i,
      });
    });
  }

  for (const pack of ctx.packs) {
    for (const trigger of pack.triggers) {
      items.push({
        id: trigger.id,
        text: trigger.line,
        kind: 'pack-trigger',
        section: 'talk',
        format: 'bullet',
      });
    }
  }

  for (const badgeId of ctx.resolved.badges) {
    const badge = lib.badges.find((b) => b.id === badgeId);
    if (!badge) throw new Error(`grok: missing badge ${badgeId}`);
    items.push({ id: badge.id, text: badge.line, kind: 'badge', section: 'talk', format: 'bullet' });
  }

  const hardPart = lib.heart.hardParts.find((h) => h.id === build.heart.hardPart);
  if (!hardPart) throw new Error(`grok: missing hard part ${build.heart.hardPart}`);
  if (hardPart.extraLine) {
    items.push({
      id: `heart.${hardPart.id}.extra`,
      text: hardPart.extraLine,
      kind: 'hardpart-extra',
      section: 'talk',
      format: 'bullet',
    });
  }

  for (const chipId of build.chips) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip) throw new Error(`grok: missing chip ${chipId}`);
    if (!chip.voice) continue;
    items.push({
      id: `chip.${chip.id}.voice`,
      text: chip.voice,
      kind: 'voice',
      section: 'talk',
      format: 'bullet',
      chip: chip.id,
      group: chip.group,
    });
  }

  items.push(...actItems(ctx));

  if (build.stats.risk !== undefined) {
    items.push(statItem(lib, 'risk', build.stats.risk));
  }
  items.push(statItem(lib, 'proactive', build.stats.proactive));

  items.push(templateItem(ctx, 'grok.autonomy', 'talk', 'bullet'));
  items.push(templateItem(ctx, 'grok.routineDiscipline', 'talk', 'bullet'));

  for (const line of chassisIn('memory')) items.push(chassisItem(line, 'talk', 'bullet'));
  for (const line of chassisIn('clash')) items.push(chassisItem(line, 'talk', 'bullet'));

  return items;
}

// Pack-supplied lines in pack order; the profile template when no pack supplies any.
function packLineItems(
  ctx: CompileContext,
  section: Section,
  fallbackKey: string,
  pick: (pack: CompileContext['packs'][number]) => Line[],
): Item[] {
  const items: Item[] = [];
  for (const pack of ctx.packs) {
    for (const line of pick(pack)) {
      items.push({ id: line.id, text: line.line, kind: 'pack-line', section, format: 'bullet' });
    }
  }
  return items.length > 0 ? items : [templateItem(ctx, fallbackKey, section, 'bullet')];
}

export function grokItems(ctx: CompileContext): Item[] {
  return [
    whoItem(ctx),
    ...wantItems(ctx),
    ...talkItems(ctx),
    ...packLineItems(ctx, 'sources', 'grok.sources', (p) => p.sources ?? []),
    ...rulesItems(ctx.build, ctx.gates, ctx.limits, ctx.lib, 'never'),
    templateItem(ctx, 'grok.noData', 'missing', 'bullet'),
    ...packLineItems(ctx, 'return', 'grok.deliverable', (p) => (p.deliverable ? [p.deliverable] : [])),
    ...exampleItems(ctx.build, ctx.lib, ctx.resolved),
  ];
}

export function grokRenderOptions(ctx: CompileContext): RenderOptions {
  const heading = (key: string) => {
    const t = template(ctx, key);
    return { id: t.id, text: t.line };
  };
  return {
    order: ORDER,
    headings: {
      who: null,
      want: heading('grok.h.want'),
      talk: heading('grok.h.work'),
      sources: heading('grok.h.sources'),
      never: heading('grok.h.never'),
      missing: heading('grok.h.missing'),
      return: heading('grok.h.return'),
      examples: heading('grok.h.sounds'),
    },
  };
}
