// Layout: ChatGPT Custom Instructions. Paid is the soul layout plus inline skills. Free is the
// compact variant for the 1,500 character box: it starts from the full compact composition and
// drops optional lines, lowest value first, until the render fits. Chassis lines, drives, gate soul
// lines and the top rules block are the floor and are never dropped. Field 1 (the memory block)
// is built by the caller.

import type {
  ChassisLine,
  CompileContext,
  Item,
  PassResult,
  RenderOptions,
  Section,
  StatId,
} from '../../types.js';
import { gateSoulItems, rulesItems } from '../../gates.js';
import { exampleItems } from '../examples.js';
import { render } from '../render.js';

const PAID_ORDER: readonly Section[] = [
  'rules-top',
  'opening',
  'who',
  'want',
  'talk',
  'instincts',
  'act',
  'trading',
  'rules',
  'proactive',
  'memory',
  'examples',
  'clash',
  'skills',
  'rules-bottom',
];

const FREE_ORDER: readonly Section[] = [
  'rules-top',
  'want',
  'talk',
  'instincts',
  'act',
  'memory',
  'examples',
  'clash',
  'skills',
  'rules-bottom',
];

const FREE_STATS: readonly StatId[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive'];
const FREE_STATS_KEPT = 2; // blunt and warm stay; the rest drop from the end
const FREE_PEEVES = 3;
const FREE_TRIGGERS = 2;

function chassisItems(
  lines: ChassisLine[],
  section: Section,
  format: Item['format'],
  blankBefore?: boolean,
): Item[] {
  return lines.map((line) => {
    const item: Item = { id: line.id, text: line.line, kind: 'chassis', section, format };
    if (blankBefore) {
      item.blankBefore = true;
    }
    return item;
  });
}

function statItem(ctx: CompileContext, stat: StatId, section: Section): Item {
  const level = ctx.build.stats[stat];
  const record = ctx.lib.stats.find((s) => s.stat === stat && s.level === level);
  if (!record) {
    throw new Error(`instructions: missing stat line for ${stat} ${level}`);
  }
  return { id: record.id, text: record.line, kind: 'stat', section, format: 'bullet' };
}

function driveItems(ctx: CompileContext): Item[] {
  const { build, lib, resolved } = ctx;
  const d1 = lib.heart.drives.find((d) => d.id === build.heart.d1);
  if (!d1) {
    throw new Error(`instructions: missing drive ${build.heart.d1}`);
  }
  const d2 = lib.heart.drives.find((d) => d.id === build.heart.d2);
  if (!d2) {
    throw new Error(`instructions: missing drive ${build.heart.d2}`);
  }
  return [d1, d2, resolved.d3].map((drive) => ({
    id: drive.id,
    text: drive.line,
    kind: 'drive',
    section: 'want',
    format: 'bullet',
  }));
}

function peeveItems(ctx: CompileContext): Item[] {
  const items: Item[] = [];
  for (const peeveId of ctx.build.peeves) {
    const peeve = ctx.lib.peeves.find((p) => p.id === peeveId);
    if (!peeve) {
      throw new Error(`instructions: missing peeve ${peeveId}`);
    }
    if (!peeve.line) {
      continue;
    }
    items.push({ id: peeve.id, text: peeve.line, kind: 'peeve', section: 'talk', format: 'bullet' });
    if (items.length === FREE_PEEVES) {
      break;
    }
  }
  return items;
}

function triggerItems(ctx: CompileContext): Item[] {
  const items: Item[] = [];
  for (const chipId of ctx.build.chips) {
    const chip = ctx.lib.chips.find((c) => c.id === chipId);
    if (!chip) {
      throw new Error(`instructions: missing chip ${chipId}`);
    }
    for (const [i, trigger] of chip.triggers.entries()) {
      if (items.length === FREE_TRIGGERS) {
        return items;
      }
      items.push({
        id: trigger.id,
        text: trigger.line,
        kind: 'chip-trigger',
        section: 'instincts',
        format: 'bullet',
        chip: chip.id,
        group: chip.group,
        triggerIndex: i,
      });
    }
  }
  return items;
}

// Act chassis lines with the gate soul lines right after the approval line (or last if it is absent).
function actItems(ctx: CompileContext): Item[] {
  const lines = chassisItems(
    ctx.chassis.filter((l) => l.section === 'act'),
    'act',
    'bullet',
  );
  const gates = gateSoulItems(ctx.gates, ctx.lib);
  const at = lines.findIndex((l) => l.id.startsWith('chassis.act.approval'));
  const insertAt = at === -1 ? lines.length : at + 1;
  return [...lines.slice(0, insertAt), ...gates, ...lines.slice(insertAt)];
}

// Example 2 only: the last pair of the four example items, restarted without a leading blank.
function exampleTwoItems(ctx: CompileContext): Item[] {
  const pair = exampleItems(ctx.build, ctx.lib, ctx.resolved).slice(-2);
  return pair.map((item, i) => {
    if (i > 0) {
      return item;
    }
    const { blankBefore: _blankBefore, ...rest } = item;
    return rest;
  });
}

interface Compact {
  items: Item[]; // the full compact composition, in order
  drops: Item[][]; // drop units, first dropped first; each unit is a subset of items
  repeat: Item[]; // the rules-bottom block; never dropped
}

function compactParts(ctx: CompileContext, inlineSkills: Item[]): Compact {
  const { build, lib, gates, limits, chassis } = ctx;
  const bySection = (section: Section): ChassisLine[] => chassis.filter((l) => l.section === section);
  const talk = bySection('talk');
  const stats = FREE_STATS.map((stat) => statItem(ctx, stat, 'talk'));
  const peeves = peeveItems(ctx);
  const triggers = triggerItems(ctx);
  const example = exampleTwoItems(ctx);
  const repeat = rulesItems(build, gates, limits, lib, 'rules-bottom');

  const items = [
    ...rulesItems(build, gates, limits, lib, 'rules-top'),
    ...driveItems(ctx),
    ...chassisItems(bySection('want'), 'want', 'plain', true),
    ...chassisItems(
      talk.filter((l) => !l.when),
      'talk',
      'bullet',
    ),
    ...stats,
    ...chassisItems(
      talk.filter((l) => l.when),
      'talk',
      'bullet',
    ),
    ...peeves,
    ...triggers,
    ...actItems(ctx),
    ...chassisItems(bySection('memory'), 'memory', 'bullet'),
    ...example,
    ...chassisItems(bySection('clash'), 'clash', 'plain'),
    ...repeat,
    ...inlineSkills,
  ];

  const lastFirst = (list: Item[]): Item[][] => [...list].reverse().map((item) => [item]);
  const drops = [
    ...lastFirst(inlineSkills),
    example,
    ...lastFirst(triggers),
    ...lastFirst(peeves),
    ...lastFirst(stats.slice(FREE_STATS_KEPT)),
  ];
  return { items, drops, repeat };
}

// Free: drop optional units until the render fits the cap.
function compactFit(ctx: CompileContext, parts: Compact): PassResult {
  const opts = instructionsRenderOptions(ctx);
  const size = (items: Item[]): number => render(items, ctx.lib, opts).soul.length;
  const without = (items: Item[], unit: Item[]): Item[] => items.filter((it) => !unit.includes(it));
  const over = `compact over ${ctx.cap}`;

  let items = parts.items;
  const warnings: string[] = [];
  for (const unit of parts.drops) {
    if (size(items) <= ctx.cap) {
      break;
    }
    items = without(items, unit);
    warnings.push(`instructions: dropped ${unit[0].id} (${over})`);
  }
  // The repeated rules block never drops: the gates must sit at the top and the bottom
  // (both-layers rule). A build still over the cap ships over it, with a warning.
  if (size(items) > ctx.cap) {
    warnings.push(`instructions: compact is ${size(items)} characters, over ${ctx.cap} with nothing left to drop`);
  }
  return { items, warnings };
}

// Paid is the soul layout untouched. Warnings list every line the free fit dropped.
export function instructionsPass(
  ctx: CompileContext,
  parts: { soulItems: Item[]; inlineSkills: Item[] },
): PassResult {
  if (ctx.form === 'full') {
    return { items: [...parts.soulItems, ...parts.inlineSkills], warnings: [] };
  }
  return compactFit(ctx, compactParts(ctx, parts.inlineSkills));
}

export function instructionsItems(
  ctx: CompileContext,
  parts: { soulItems: Item[]; inlineSkills: Item[] },
): Item[] {
  return instructionsPass(ctx, parts).items;
}

function heading(ctx: CompileContext, key: string): { id: string; text: string } {
  const template = ctx.profile.templates[key];
  if (!template) {
    throw new Error(`instructions: profile ${ctx.profile.id} has no template ${key}`);
  }
  return { id: template.id, text: template.line };
}

// Free drops every heading but the two rules ones: a heading costs 12 to 23 characters in a 1,500 box.
export function instructionsRenderOptions(ctx: CompileContext): RenderOptions {
  const headings: RenderOptions['headings'] = {
    'rules-top': heading(ctx, 'rules.top'),
    'rules-bottom': heading(ctx, 'rules.bottom'),
    skills: null,
  };
  if (ctx.form === 'short') {
    for (const section of FREE_ORDER) {
      if (!Object.hasOwn(headings, section)) {
        headings[section] = null;
      }
    }
  }
  return { order: ctx.form === 'full' ? PAID_ORDER : FREE_ORDER, headings };
}
