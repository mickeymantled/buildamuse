// Trace pass: every line in a compiled soul maps to exactly one library record id.
// This module only reads a Library and a list of TracedLine; it does not build the soul.

import type { CompileResult, Library, Line, NameWord, TracedLine } from './types.js';

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

  addV2Ids(ids, lib);
  return ids;
}

// The ids a v2 bundle can reference, per the design's trace-id table.
function addV2Ids(ids: Set<string>, lib: Library): void {
  const addLines = (lines: Line[] | undefined): void => {
    for (const line of lines ?? []) ids.add(line.id);
  };
  const addOne = (line: Line | null | undefined): void => {
    if (line) ids.add(line.id);
  };

  // Chassis forms: a short form, a profile variant, a profile short variant.
  for (const line of lib.chassis.lines) {
    if (line.short !== undefined) ids.add(`${line.id}#short`);
  }
  for (const profile of lib.targets.profiles) {
    for (const [chassisId, text] of Object.entries(profile.chassisVariants)) {
      if (typeof text === 'string') ids.add(`${chassisId}@${profile.id}`);
    }
    for (const chassisId of Object.keys(profile.chassisShortVariants ?? {})) {
      ids.add(`${chassisId}#short@${profile.id}`);
    }
    for (const setting of Object.keys(profile.customRuleSettings ?? {})) {
      ids.add(`profile.${profile.id}.setting.${setting}`);
    }
    addLines(profile.openingLines);
    addLines(profile.installSteps);
    addLines(profile.verify);
    addOne(profile.reloadNote);
    addOne(profile.rulesPath);
    addLines(profile.notes);
    for (const template of Object.values(profile.templates)) ids.add(template.id);
  }

  for (const target of lib.targets.targets) {
    ids.add(target.promise.id);
    for (const mode of target.modes ?? []) {
      ids.add(mode.note.id);
      addOne(mode.deprecated);
    }
  }

  for (const gate of lib.gates) {
    for (const [setting, text] of Object.entries(gate.soulLine)) {
      if (text !== null) ids.add(`gate.${gate.id}.soul.${setting}`);
    }
    for (const setting of Object.keys(gate.rulesLine)) ids.add(`gate.${gate.id}.rules.${setting}`);
    ids.add(`gate.${gate.id}.custom`);
  }
  for (const limit of lib.limits) ids.add(`limit.${limit.id}`);

  for (const pack of lib.packs) {
    addLines(pack.triggers);
    addLines(pack.seeds);
    addLines(pack.rulesLines);
    addOne(pack.job);
    addLines(pack.sources);
    addOne(pack.deliverable);
    addOne(pack.firstTask);
    for (const note of Object.values(pack.venueNotes ?? {})) ids.add(note.id);
    for (const skill of pack.skills) ids.add(`pack.${pack.id}.skill.${skill.id}`);
  }

  for (const chip of lib.chips) {
    for (const skill of chip.skills ?? []) ids.add(skill.id);
    if (chip.seed) ids.add(`chip.${chip.id}.seed`);
  }
  for (const hardPart of lib.heart.hardParts) ids.add(`heart.${hardPart.id}.seedClause`);

  for (const set of lib.roleSets) {
    for (const template of Object.values(set.templates)) ids.add(template.id);
  }
  for (const role of lib.roles) {
    addOne(role.mission);
    addOne(role.drive);
    addOne(role.counterDrive);
    addLines(role.never);
    addOne(role.reporting.format);
    addOne(role.uncertaintyRule);
    addOne(role.anchorExchange.me);
    addOne(role.anchorExchange.you);
  }

  addLines(lib.probes);
}

// A names.json word has no id of its own, so the bundle names it by stat and level.
export function nameWordId(word: NameWord): string {
  return word.level === undefined ? `name.${word.stat}` : `name.${word.stat}.${word.level}`;
}

function checkSoul(soul: string, soulLines: TracedLine[], ids: Set<string>): void {
  const rebuilt = soulLines.map((l) => l.text).join('\n');
  if (rebuilt !== soul) {
    throw new Error('Trace: soulLines text does not reconstruct soul');
  }

  for (const line of soulLines) {
    if (!ids.has(line.id)) {
      throw new Error(`Trace: line "${line.text}" has unknown id "${line.id}"`);
    }
  }
}

// Asserts every soulLine's id is a real library record and that the lines
// reconstruct the soul text exactly. Throws on any mismatch.
export function trace(soul: string, soulLines: TracedLine[], lib: Library): void {
  checkSoul(soul, soulLines, libraryIds(lib));
}

function checkLines(lines: TracedLine[], where: string, ids: Set<string>): void {
  for (const line of lines) {
    if (line.kind !== 'blank' && !ids.has(line.id)) {
      throw new Error(`Trace: ${where} line "${line.text}" has unknown id "${line.id}"`);
    }
  }
}

// The v2 trace: every non-blank line of the soul and of every file, every id behind a spoken
// item and every id behind a custom rule must be a library id. Throws on the first miss.
export function traceBundle(result: CompileResult, lib: Library): void {
  const ids = libraryIds(lib);
  checkSoul(result.soul, result.soulLines, ids);

  for (const file of result.files) {
    const rebuilt = file.lines.map((l) => l.text).join('\n');
    if (rebuilt !== file.content) {
      throw new Error(`Trace: lines of file "${file.path}" do not reconstruct its content`);
    }
    checkLines(file.lines, `file "${file.path}"`, ids);
  }
  for (const item of result.spoken) {
    for (const id of item.ids) {
      if (!ids.has(id)) {
        throw new Error(`Trace: spoken item "${item.label}" has unknown id "${id}"`);
      }
    }
  }
  for (const rule of result.customRules) {
    for (const id of rule.ids) {
      if (!ids.has(id)) {
        throw new Error(`Trace: custom rule "${rule.gate}" has unknown id "${id}"`);
      }
    }
  }
  traceFields(result, lib, ids);
}

// The structured fields cite ids too. A base is cited by the description, and a name word by the
// build name; neither is a soul line id, so they join the set here and not in libraryIds.
function traceFields(result: CompileResult, lib: Library, libIds: Set<string>): void {
  const ids = new Set(libIds);
  for (const base of lib.bases) ids.add(base.id);
  for (const word of lib.names.words) ids.add(nameWordId(word));
  const check = (what: string, id: string): void => {
    if (!ids.has(id)) {
      throw new Error(`Trace: ${what} has unknown id "${id}"`);
    }
  };

  const sameText = (texts: string[], items: { text: string }[]): boolean =>
    texts.length === items.length && texts.every((text, i) => text === items[i].text);
  if (!sameText(result.installSteps, result.steps)) {
    throw new Error('Trace: installSteps do not match steps');
  }
  if (!sameText(result.notes, result.noteItems)) {
    throw new Error('Trace: notes do not match noteItems');
  }
  for (const step of result.steps) {
    check(`step "${step.text}"`, step.id);
  }
  for (const note of result.noteItems) {
    // A marked [TODO: ...] placeholder stands in for a record the library lacks, so it has no id to trace.
    if (!note.text.startsWith('[TODO:')) {
      check(`note "${note.text}"`, note.id);
    }
  }
  for (const [i, starter] of result.starterIds.entries()) {
    for (const id of starter) check(`conversation starter ${i + 1}`, id);
  }
  for (const id of result.descriptionIds) check('description', id);
  for (const id of result.buildNameIds) check('build name', id);
}

// Given a line of soul text, name the record id that emitted it.
export function traceLine(soulLines: TracedLine[], text: string): string | undefined {
  const found = soulLines.find((l) => l.text === text);
  return found?.id;
}
