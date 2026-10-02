// Pass: assemble resolved picks and library records into items, in fixed section order.

import type {
  BuildCore,
  ChassisLine,
  CompileContext,
  Item,
  Library,
  RenderOptions,
  Resolved,
  Section,
} from '../types.js';
import { gateSoulItems, rulesItems } from '../gates.js';
import { exampleItems } from './examples.js';

function chassisBySection(chassis: ChassisLine[], section: Section): ChassisLine[] {
  return chassis.filter((line) => line.section === section);
}

export function assemble(build: BuildCore, lib: Library, resolved: Resolved): Item[] {
  const items: Item[] = [];

  // opening: chassis lines, first plain, rest blank-led.
  chassisBySection(resolved.chassis, 'opening').forEach((line, i) => {
    items.push({
      id: line.id,
      text: line.line,
      kind: 'opening',
      section: 'opening',
      format: 'plain',
      blankBefore: i > 0,
    });
  });

  // who: one templated line naming the outfit anchor and base line.
  const outfit = lib.outfits.find((o) => o.id === build.outfit);
  if (!outfit) throw new Error(`assemble: missing outfit ${build.outfit}`);
  const base = lib.bases.find((b) => b.id === build.base);
  if (!base) throw new Error(`assemble: missing base ${build.base}`);
  const whoText = lib.chassis.who.text
    .replace('{name}', build.name.trim())
    .replace('{anchor}', outfit.anchor)
    .replace('{baseLine}', base.baseLine);
  items.push({
    id: lib.chassis.who.id,
    text: whoText,
    kind: 'who',
    section: 'who',
    format: 'plain',
    blankBefore: true,
    sources: [outfit.id, base.id],
  });

  // want: d1, d2, d3 drives, then blank-led chassis lines.
  const d1 = lib.heart.drives.find((d) => d.id === build.heart.d1);
  if (!d1) throw new Error(`assemble: missing drive ${build.heart.d1}`);
  const d2 = lib.heart.drives.find((d) => d.id === build.heart.d2);
  if (!d2) throw new Error(`assemble: missing drive ${build.heart.d2}`);
  for (const drive of [d1, d2, resolved.d3]) {
    items.push({
      id: drive.id,
      text: drive.line,
      kind: 'drive',
      section: 'want',
      format: 'bullet',
    });
  }
  for (const line of chassisBySection(resolved.chassis, 'want')) {
    items.push({
      id: line.id,
      text: line.line,
      kind: 'chassis',
      section: 'want',
      format: 'plain',
      blankBefore: true,
    });
  }

  // talk: chassis always lines, then stat lines, then chassis when-lines, then peeves.
  const talkLines = chassisBySection(resolved.chassis, 'talk');
  for (const line of talkLines) {
    if (line.when) continue;
    items.push({
      id: line.id,
      text: line.line,
      kind: 'chassis',
      section: 'talk',
      format: 'bullet',
    });
  }
  const statOrder = ['blunt', 'warm', 'funny', 'chatty'] as const;
  for (const stat of statOrder) {
    const level = build.stats[stat];
    const record = lib.stats.find((s) => s.stat === stat && s.level === level);
    if (!record) throw new Error(`assemble: missing stat line for ${stat} ${level}`);
    items.push({
      id: record.id,
      text: record.line,
      kind: 'stat',
      section: 'talk',
      format: 'bullet',
    });
  }
  for (const line of talkLines) {
    if (!line.when) continue;
    items.push({
      id: line.id,
      text: line.line,
      kind: 'chassis',
      section: 'talk',
      format: 'bullet',
    });
  }
  for (const peeveId of build.peeves) {
    const peeve = lib.peeves.find((p) => p.id === peeveId);
    if (!peeve) throw new Error(`assemble: missing peeve ${peeveId}`);
    if (!peeve.line) continue;
    items.push({
      id: peeve.id,
      text: peeve.line,
      kind: 'peeve',
      section: 'talk',
      format: 'bullet',
    });
  }

  // instincts: chip triggers in tap order, then badges, then hard part extra, then chip voices.
  for (const chipId of build.chips) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip) throw new Error(`assemble: missing chip ${chipId}`);
    chip.triggers.forEach((trigger, i) => {
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
    });
  }
  for (const badgeId of resolved.badges) {
    const badge = lib.badges.find((b) => b.id === badgeId);
    if (!badge) throw new Error(`assemble: missing badge ${badgeId}`);
    items.push({
      id: badge.id,
      text: badge.line,
      kind: 'badge',
      section: 'instincts',
      format: 'bullet',
    });
  }
  const hardPart = lib.heart.hardParts.find((h) => h.id === build.heart.hardPart);
  if (!hardPart) throw new Error(`assemble: missing hard part ${build.heart.hardPart}`);
  if (hardPart.extraLine) {
    items.push({
      id: `heart.${hardPart.id}.extra`,
      text: hardPart.extraLine,
      kind: 'hardpart-extra',
      section: 'instincts',
      format: 'bullet',
    });
  }
  for (const chipId of build.chips) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip) throw new Error(`assemble: missing chip ${chipId}`);
    if (!chip.voice) continue;
    items.push({
      id: `chip.${chip.id}.voice`,
      text: chip.voice,
      kind: 'voice',
      section: 'instincts',
      format: 'bullet',
      chip: chip.id,
      group: chip.group,
    });
  }

  // act: chassis lines.
  for (const line of chassisBySection(resolved.chassis, 'act')) {
    items.push({
      id: line.id,
      text: line.line,
      kind: 'chassis',
      section: 'act',
      format: 'bullet',
    });
  }

  // trading: risk stat line, only when risk is part of the build.
  if (build.stats.risk !== undefined) {
    const record = lib.stats.find((s) => s.stat === 'risk' && s.level === build.stats.risk);
    if (!record) throw new Error(`assemble: missing risk stat line for level ${build.stats.risk}`);
    items.push({
      id: record.id,
      text: record.line,
      kind: 'stat',
      section: 'trading',
      format: 'bullet',
    });
  }

  // proactive: stat line.
  const proactiveRecord = lib.stats.find((s) => s.stat === 'proactive' && s.level === build.stats.proactive);
  if (!proactiveRecord) {
    throw new Error(`assemble: missing proactive stat line for level ${build.stats.proactive}`);
  }
  items.push({
    id: proactiveRecord.id,
    text: proactiveRecord.line,
    kind: 'stat',
    section: 'proactive',
    format: 'bullet',
  });

  // memory: chassis lines.
  for (const line of chassisBySection(resolved.chassis, 'memory')) {
    items.push({
      id: line.id,
      text: line.line,
      kind: 'chassis',
      section: 'memory',
      format: 'bullet',
    });
  }

  // examples: greeting and domain rows.
  items.push(...exampleItems(build, lib, resolved));

  // clash: chassis line.
  for (const line of chassisBySection(resolved.chassis, 'clash')) {
    items.push({
      id: line.id,
      text: line.line,
      kind: 'chassis',
      section: 'clash',
      format: 'plain',
    });
  }

  return items;
}

// Section order of the v2 soul layout. Sections a profile does not use are simply empty.
const SOUL_ORDER: readonly Section[] = [
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

// The v2 soul: today's sections from the build, with chassis lines taken from ctx.chassis
// (already variant-applied for the profile), plus profile opening lines, pack triggers,
// gate soul lines and the rules block.
export function assembleSoul(ctx: CompileContext): Item[] {
  const { build, lib, profile } = ctx;
  const base = assemble(build, lib, { ...ctx.resolved, chassis: ctx.chassis });
  const bySection = new Map<Section, Item[]>();
  for (const item of base) {
    const list = bySection.get(item.section);
    if (list) {
      list.push(item);
    } else {
      bySection.set(item.section, [item]);
    }
  }

  // opening: chassis openings (muse only), then the profile's own opening lines.
  const opening: Item[] = [...(bySection.get('opening') ?? [])];
  for (const line of profile.openingLines) {
    opening.push({
      id: line.id,
      text: line.line,
      kind: 'opening',
      section: 'opening',
      format: 'plain',
    });
  }
  bySection.set(
    'opening',
    opening.map((item, i) => ({ ...item, blankBefore: i > 0 })),
  );

  // instincts: pack triggers go after the chip triggers, before badges.
  const packTriggers: Item[] = ctx.packs.flatMap((pack) =>
    pack.triggers.map(
      (trigger): Item => ({
        id: trigger.id,
        text: trigger.line,
        kind: 'pack-trigger',
        section: 'instincts',
        format: 'bullet',
      }),
    ),
  );
  const instincts = bySection.get('instincts') ?? [];
  let afterChips = instincts.findIndex((item) => item.kind !== 'chip-trigger');
  if (afterChips === -1) afterChips = instincts.length;
  bySection.set('instincts', [
    ...instincts.slice(0, afterChips),
    ...packTriggers,
    ...instincts.slice(afterChips),
  ]);

  // act: gate soul lines go right after the approval line, else at the start.
  const act = bySection.get('act') ?? [];
  const approval = act.findIndex((item) => item.id.startsWith('chassis.act.approval'));
  bySection.set('act', [
    ...act.slice(0, approval + 1),
    ...gateSoulItems(ctx.gates, lib),
    ...act.slice(approval + 1),
  ]);

  // rules: one block in a section, or the same block at top and bottom.
  if (profile.rulesInSoul === 'section') {
    bySection.set('rules', rulesItems(build, ctx.gates, ctx.limits, lib, 'rules'));
  } else if (profile.rulesInSoul === 'top-and-bottom') {
    bySection.set('rules-top', rulesItems(build, ctx.gates, ctx.limits, lib, 'rules-top'));
    bySection.set('rules-bottom', rulesItems(build, ctx.gates, ctx.limits, lib, 'rules-bottom'));
  }

  return SOUL_ORDER.flatMap((section) => bySection.get(section) ?? []);
}

// Order and heading overrides for rendering assembleSoul output.
export function soulRenderOptions(ctx: CompileContext): RenderOptions {
  const headings: NonNullable<RenderOptions['headings']> = { skills: null };
  const templates: [Section, string][] = [
    ['rules', 'rules.heading'],
    ['rules-top', 'rules.top'],
    ['rules-bottom', 'rules.bottom'],
  ];
  for (const [section, key] of templates) {
    if (Object.hasOwn(ctx.profile.templates, key)) {
      const template = ctx.profile.templates[key];
      headings[section] = { id: template.id, text: template.line };
    }
  }
  return { order: SOUL_ORDER, headings };
}
