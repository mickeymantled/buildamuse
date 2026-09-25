// Trace pass: every line in a compiled soul maps to exactly one library record id.
// This module only reads a Library and a list of TracedLine; it does not build the soul.

import type { Library, TracedLine } from './types.js';

// Every id a TracedLine.id is allowed to reference, gathered from the library.
export function libraryIds(lib: Library): Set<string> {
  const ids = new Set<string>();

  for (const line of lib.chassis.lines) ids.add(line.id);
  for (const heading of lib.chassis.headings) ids.add(heading.id);
  ids.add(lib.chassis.who.id);
  ids.add(lib.chassis.blank.id);

  for (const stat of lib.stats) ids.add(stat.id);
  for (const badge of lib.badges) ids.add(badge.id);
  for (const peeve of lib.peeves) ids.add(peeve.id);
  for (const drive of lib.heart.drives) ids.add(drive.id);

  for (const chip of lib.chips) {
    for (const trigger of chip.triggers) ids.add(trigger.id);
    if (chip.voice) ids.add(`chip.${chip.id}.voice`);
  }

  for (const hardPart of lib.heart.hardParts) {
    if (hardPart.extraLine) ids.add(`heart.${hardPart.id}.extra`);
  }

  ids.add(lib.examples.greetingMe.id);
  for (const greeting of lib.examples.greetings) ids.add(greeting.id);
  for (const domain of lib.examples.domains) ids.add(domain.id);

  return ids;
}

// Asserts every soulLine's id is a real library record and that the lines
// reconstruct the soul text exactly. Throws on any mismatch.
export function trace(soul: string, soulLines: TracedLine[], lib: Library): void {
  const rebuilt = soulLines.map((l) => l.text).join('\n');
  if (rebuilt !== soul) {
    throw new Error('Trace: soulLines text does not reconstruct soul');
  }

  const ids = libraryIds(lib);
  for (const line of soulLines) {
    if (!ids.has(line.id)) {
      throw new Error(`Trace: line "${line.text}" has unknown id "${line.id}"`);
    }
  }
}

// Given a line of soul text, name the record id that emitted it.
export function traceLine(soulLines: TracedLine[], text: string): string | undefined {
  const found = soulLines.find((l) => l.text === text);
  return found?.id;
}
