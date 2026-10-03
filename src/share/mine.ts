// Remix "Mine" lines (W12, W28): the lines a user pasted that no compile of ours produced, and how
// they join the personality artifact. Pure: no I/O, and no input is mutated.
// Mine is user text by design. Its heading is spec text and its lines trace to user.mine.* ids, the
// one carve-out from "every output line traces to a library record id".

import { compile, library } from '../compiler/compile.js';
import { artifactKindOf } from '../compiler/types.js';
import type { Build, BuildV1, CompileResult, LineKind, Profile, TracedLine } from '../compiler/types.js';

export const MINE_HEADING = '## Mine';
export const MAX_PASTE_CHARS = 20_000;
export const MAX_MINE_LINES = 50;

const HEADING_ID = 'user.mine.heading';

// Lines that must stay after Mine: gate and rules lines, the act chassis lines and the clash line.
const GUARDED_KINDS: ReadonlySet<LineKind> = new Set<LineKind>(['gate', 'rule', 'limit', 'pack-rule']);
const GUARDED_PREFIXES = ['chassis.act.', 'chassis.clash.'];

const NEWLINE = /\r\n?|\n/;
const EM_DASH = /\s*\u2014\s*/g;

export interface MineResult {
  lines: string[]; // new lines, in paste order, no duplicates
  replacedDashes: boolean; // a returned line had a long dash replaced
  dropped: number; // new lines left out by the character cap or the line cap
}

// Trimmed, non-blank lines of a text, with CRLF normalized.
function linesOf(text: string): string[] {
  return text
    .split(NEWLINE)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function plainDashes(line: string): string {
  return line.replace(EM_DASH, ' - ').trim();
}

// The pasted lines found in none of `texts`. Matching is set-based on trimmed lines. A line that
// ends past the character cap, or comes after the 50th Mine line, counts as dropped and is not returned.
export function mineLines(pasted: string, texts: readonly string[]): MineResult {
  const known = new Set<string>(texts.flatMap((text) => linesOf(text)));
  const seen = new Set<string>();
  const lines: string[] = [];
  let replacedDashes = false;
  let dropped = 0;

  // The capture group keeps each separator, so offsets count the original characters.
  const parts = pasted.split(/(\r\n?|\n)/);
  let offset = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const raw = parts[i];
    offset += raw.length;
    const withinCap = offset <= MAX_PASTE_CHARS;
    offset += (parts[i + 1] ?? '').length;

    const line = raw.trim();
    if (line === '' || line === MINE_HEADING) {
      continue;
    }
    const text = plainDashes(line);
    if (known.has(text) || seen.has(text)) {
      continue;
    }
    seen.add(text);
    if (!withinCap || lines.length >= MAX_MINE_LINES) {
      dropped += 1;
      continue;
    }
    lines.push(text);
    if (text !== line) {
      replacedDashes = true;
    }
  }
  return { lines, replacedDashes, dropped };
}

// Every text a user can copy out of a compile: soul, file contents, spoken texts, custom rule
// actions, conversation starters and the description.
export function copyableTexts(result: CompileResult): string[] {
  return [
    result.soul,
    ...result.files.map((f) => f.content),
    ...result.spoken.map((s) => s.text),
    ...result.customRules.map((r) => r.action),
    ...(result.conversationStarters ?? []),
    ...(result.description === undefined ? [] : [result.description]),
    // Grok's label is its own copy block (install step: "set label to the build name").
    ...(result.profile === 'grok' ? [result.buildName] : []),
  ];
}

// What a pasted line is checked against: the current compile, and the baseline build's compile
// (the build the link was made from). A baseline that no longer compiles adds nothing.
export function mineTexts(current: CompileResult, baseline?: Build | BuildV1): string[] {
  const texts = copyableTexts(current);
  if (baseline !== undefined) {
    try {
      texts.push(...copyableTexts(compile(baseline)));
    } catch {
      // keep the current compile's texts only
    }
  }
  return texts;
}

function guarded(line: TracedLine): boolean {
  return GUARDED_KINDS.has(line.kind) || GUARDED_PREFIXES.some((prefix) => line.id.startsWith(prefix));
}

// The first line of the block that holds line `i`: back to just after the nearest blank line.
function blockStart(lines: TracedLine[], i: number): number {
  let at = i;
  while (at > 0 && lines[at - 1].kind !== 'blank') {
    at -= 1;
  }
  return at;
}

// Layouts that repeat the rules close with a rules.bottom block. Find its heading by template id;
// with no heading, the closing block is the last run of lines and its first line repeats an earlier id.
function closingRulesStart(lines: TracedLine[], profile: Profile): number | undefined {
  const heading = Object.hasOwn(profile.templates, 'rules.bottom') ? profile.templates['rules.bottom'] : undefined;
  if (heading) {
    const at = lines.findIndex((l) => l.kind === 'heading' && l.id === heading.id);
    if (at !== -1) {
      return at;
    }
  }
  let start = lines.length;
  while (start > 0 && lines[start - 1].kind !== 'blank') {
    start -= 1;
  }
  const first = lines[start];
  return first !== undefined && lines.findIndex((l) => l.id === first.id) < start ? start : undefined;
}

// Where Mine goes: the index of the first line of the block it sits above, or undefined to append.
// Top-and-bottom layouts put it above the closing rules. Every other layout puts it above the first
// section that holds an act, rules, never or clash line, so those stay after the user's lines. On
// grok the act, gate and clash lines share the "How you work" section, so Mine lands above it.
function anchorOf(lines: TracedLine[], profile: Profile): number | undefined {
  if (profile.rulesInSoul === 'top-and-bottom') {
    return closingRulesStart(lines, profile);
  }
  const first = lines.findIndex(guarded);
  return first === -1 ? undefined : blockStart(lines, first);
}

// Record ids behind a text, first seen first. Blank lines carry no record of their own.
function idsOf(lines: TracedLine[]): string[] {
  const ids: string[] = [];
  for (const line of lines) {
    if (line.kind !== 'blank' && !ids.includes(line.id)) {
      ids.push(line.id);
    }
  }
  return ids;
}

// The result with a "## Mine" section in its personality artifact, and nothing else changed.
// `build` is optional and only supplies the plan for the length cap, as capOf reads it: without it the
// plan is free, so a paid chatgpt-instructions caller must pass its build. Lines are cleaned again
// (one per line, no heading line, no long dashes) so soulLines always match the soul line for line.
export function withMine(
  result: CompileResult,
  profile: Profile,
  lines: readonly string[],
  build?: Pick<Build, 'plan'>,
): CompileResult {
  const mine = lines
    .flatMap((line) => linesOf(line))
    .map(plainDashes)
    .filter((line) => line !== '' && line !== MINE_HEADING);
  if (mine.length === 0) {
    return result;
  }

  const blank: TracedLine = {
    text: '',
    id: result.soulLines.find((l) => l.kind === 'blank')?.id ?? library.chassis.blank.id,
    kind: 'blank',
  };
  const section: TracedLine[] = [
    { text: MINE_HEADING, id: HEADING_ID, kind: 'heading' },
    ...mine.map((text, i): TracedLine => ({ text, id: `user.mine.${i + 1}`, kind: 'template' })),
  ];
  const at = anchorOf(result.soulLines, profile);
  let soulLines: TracedLine[];
  if (at === undefined) {
    soulLines = [...result.soulLines, ...(result.soulLines.length > 0 ? [blank] : []), ...section];
  } else {
    soulLines = [...result.soulLines.slice(0, at), ...section, blank, ...result.soulLines.slice(at)];
  }
  const soul = soulLines.map((l) => l.text).join('\n');
  const ids = idsOf(soulLines);

  const cap = typeof profile.lengthCap === 'number' ? profile.lengthCap : profile.lengthCap[build?.plan ?? 'free'];
  const warnings = [...result.warnings];
  if (soul.length > cap) {
    warnings.push(`mine: soul is ${soul.length} characters, over ${cap}`);
  }

  return {
    ...result,
    files: result.files.map((f) =>
      artifactKindOf(f) === 'personality' ? { ...f, content: soul, lines: soulLines } : f,
    ),
    spoken: result.spoken.map((s) =>
      artifactKindOf(s) === 'personality' ? { ...s, text: soul, ids } : s,
    ),
    soul,
    soulLines,
    length: soul.length,
    warnings,
  };
}
