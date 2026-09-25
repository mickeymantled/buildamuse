// Pass: assemble resolved picks and library records into items, in fixed section order.

import type { Build, ChassisLine, Item, Library, Resolved, Section } from '../types.js';
import { exampleItems } from './examples.js';

function chassisBySection(chassis: ChassisLine[], section: Section): ChassisLine[] {
  return chassis.filter((line) => line.section === section);
}

export function assemble(build: Build, lib: Library, resolved: Resolved): Item[] {
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
