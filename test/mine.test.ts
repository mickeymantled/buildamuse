// Mine diff tests (M4 slice 4.9, src/share/mine.ts). docs/M4-PLAN.md section 6, QUESTIONS W12 and W28.
//
// What Mine is: the lines a remixing user pasted that no compile of ours produced. mineLines finds them,
// withMine writes them into the personality artifact under "## Mine", and nothing else changes.
//
// Expected values come from the plan, QUESTIONS and the library, never from running the compiler and
// copying its output:
// - the heading text "## Mine", the ids user.mine.heading and user.mine.<n> (1-based), the caps
//   (20,000 characters, 50 Mine lines) and the em dash rule are spec text (W12, W28);
// - the placement rule is W28: Hard rules, Never and "If rules clash" stay after the user's lines, and on
//   top-and-bottom layouts Mine goes above the bottom rules block, found by the profile's rules.bottom
//   template id from the library;
// - the length caps come from profiles.json lengthCap (number, or { free, paid } on instructions);
// - peeve text for the baseline test comes from peeves.json.
// Assertions are structural (ids, order, equality with the pre-Mine compile). The only hard-coded output
// strings are the Mine lines themselves, which the tests choose.
//
// Engineer readings pinned here (from the slice report, not from the spec):
//   1. Grok has no section of its own for act, gate and clash lines, so Mine sits above "How you work".
//   2. If a top-and-bottom heading line is missing, Mine goes above the last run whose first id repeats
//      an earlier id; with no guarded line and no closing block, Mine is appended at the end.
//   3. A line whose raw text ends past 20,000 characters of the original paste (CR and LF counted) is
//      dropped whole, never truncated. A line ending exactly at 20,000 is kept.
//   4. Only U+2014 is replaced; U+2013 is left alone. Spaces around it collapse: "a - b".
//      Matching and de-duplication run on the replaced form.
//   5. A lone CR is a line break. A pasted "## Mine" line is skipped.
//   6. The over-cap warning "mine: soul is N characters, over CAP" is added whenever Mine leaves the
//      soul over the cap, even when the baseline compile was already over it.
//   7. withMine re-cleans its input, and with no lines left returns the same result object.
// Tracing: trace.ts carries the one W28 carve-out. traceBundle accepts user.mine.heading and user.mine.<n>
// ids in the main personality artifact (a file, the soul, or the ChatGPT dot's spoken personality) and
// nowhere else, and trace() has no carve-out. The tests under "Tracing (W28 carve-out)" below pin that a
// withMine result passes; test/m4-review-gaps.test.tsx pins the negatives (a spoken memory, skill, routine
// or first task, a role personality file and any other file all fail the trace).
//
// No long dashes appear in this file: they are written as \u escapes.

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { traceBundle } from '../src/compiler/trace.js';
import { fromShareHash, toShareHash } from '../src/share/encode.js';
import { shareUrl } from '../src/share/url.js';
import {
  copyableTexts,
  MAX_MINE_LINES,
  MAX_PASTE_CHARS,
  MINE_HEADING,
  mineLines,
  mineTexts,
  withMine,
} from '../src/share/mine.js';
import type {
  Build,
  BuildV1,
  ChatgptMode,
  CompileResult,
  Plan,
  Profile,
  RoleId,
  TargetId,
  TracedLine,
} from '../src/compiler/types.js';

// --- Helpers ---------------------------------------------------------------

const EM = '\u2014';
const EN = '\u2013';
const ORIGIN = 'https://example.test';

interface Variant {
  name: string;
  target: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
}

// The nine profiles. The gpt mode is hidden from the picker but still compiles, and the task names it.
const VARIANTS: Variant[] = [
  { name: 'muse', target: 'muse' },
  { name: 'openclaw', target: 'openclaw' },
  { name: 'hermes', target: 'hermes' },
  { name: 'grok', target: 'grok' },
  { name: 'chatgpt dot', target: 'chatgpt', mode: 'dot' },
  { name: 'chatgpt project', target: 'chatgpt', mode: 'project' },
  { name: 'chatgpt instructions free', target: 'chatgpt', mode: 'instructions', plan: 'free' },
  { name: 'chatgpt instructions paid', target: 'chatgpt', mode: 'instructions', plan: 'paid' },
  { name: 'chatgpt gpt', target: 'chatgpt', mode: 'gpt' },
];

const MUSE: Variant = VARIANTS[0];
const INSTRUCTIONS_FREE: Variant = VARIANTS[6];
const INSTRUCTIONS_PAID: Variant = VARIANTS[7];
const STARTERS = library.roster.map((r) => r.id);

// Two lines in a user's own words. A precondition test proves no compile of any variant holds them.
const MINE = ['Open every reply with the day of the week.', 'Sign off with a single star.'];

function rosterV1(starter: string): BuildV1 {
  const entry = library.roster.find((r) => r.id === starter);
  if (!entry) throw new Error(`roster entry "${starter}" not found`);
  return structuredClone(entry.build);
}

function rosterBuild(starter: string, v: Variant, roles?: RoleId[]): Build {
  const build = migrate(rosterV1(starter), { target: v.target, mode: v.mode, plan: v.plan });
  return roles ? { ...build, roles: [...roles] } : build;
}

function profileOf(result: CompileResult): Profile {
  const profile = library.targets.profiles.find((p) => p.id === result.profile);
  if (!profile) throw new Error(`profile "${result.profile}" not found`);
  return profile;
}

// The cap as the library states it.
function capFor(profile: Profile, build: Build): number {
  const cap = profile.lengthCap;
  return typeof cap === 'number' ? cap : cap[build.plan ?? 'free'];
}

interface Artifact {
  kind: string;
  role?: RoleId;
}
function isPersonality(x: Artifact): boolean {
  return x.kind === 'personality' && x.role === undefined;
}

// The one personality artifact of a result: a file or a spoken item, never both.
function personalityText(result: CompileResult): string {
  const files = result.files.filter(isPersonality);
  const spoken = result.spoken.filter(isPersonality);
  expect(files.length + spoken.length, 'exactly one personality artifact').toBe(1);
  return files.length === 1 ? files[0].content : spoken[0].text;
}

// Everything on a result that withMine must not touch.
function restOf(result: CompileResult): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...result };
  for (const key of ['soul', 'soulLines', 'length', 'warnings', 'files', 'spoken']) {
    delete copy[key];
  }
  return copy;
}

function nonBlank(text: string): string[] {
  return text.split('\n').filter((line) => line.trim() !== '');
}

function lastLines(text: string, n: number): string[] {
  return nonBlank(text).slice(-n);
}

const isMineId = (l: TracedLine): boolean => l.id.startsWith('user.mine.');

// Lines that must stay after Mine (W28): gate and rules lines, the act chassis lines, the clash line.
const GUARDED_KINDS = new Set(['gate', 'rule', 'limit', 'pack-rule']);
function guarded(l: TracedLine): boolean {
  return GUARDED_KINDS.has(l.kind) || l.id.startsWith('chassis.act.') || l.id.startsWith('chassis.clash.');
}

// The soul lines with the Mine block (heading, n lines, one blank) cut out.
function withoutMineBlock(lines: TracedLine[], n: number): TracedLine[] {
  const start = lines.findIndex((l) => l.id === 'user.mine.heading');
  return [...lines.slice(0, start), ...lines.slice(start + 1 + n + 1)];
}

// --- The shared checks, used by the marty tests and by the sweeps ----------

function checkSection(after: CompileResult, mine: string[], label: string): void {
  const at = after.soulLines.findIndex((l) => l.id === 'user.mine.heading');
  expect(at, `${label}: heading present`).toBeGreaterThan(-1);
  expect(after.soulLines[at].text, label).toBe('## Mine');
  mine.forEach((text, i) => {
    expect(after.soulLines[at + 1 + i].text, `${label}: line ${i + 1}`).toBe(text);
    expect(after.soulLines[at + 1 + i].id, `${label}: id ${i + 1}`).toBe(`user.mine.${i + 1}`);
  });
  const blank = after.soulLines[at + 1 + mine.length];
  expect(blank?.kind, `${label}: a blank line closes the section`).toBe('blank');
  expect(blank?.text, label).toBe('');
  const personality = personalityText(after);
  expect(personality, `${label}: personality artifact holds the heading`).toContain('## Mine');
  for (const text of mine) {
    expect(personality, `${label}: personality artifact holds the line`).toContain(text);
  }
  expect(after.soulLines.filter(isMineId).length, `${label}: only the heading and the lines`).toBe(mine.length + 1);
}

function checkOthersIdentical(before: CompileResult, after: CompileResult, label: string): void {
  expect(after.files.length, `${label}: file count`).toBe(before.files.length);
  before.files.forEach((file, i) => {
    const next = after.files[i];
    if (isPersonality(file)) {
      expect(next.path, label).toBe(file.path);
      expect(next.label, label).toBe(file.label);
      expect(next.delivery, label).toBe(file.delivery);
      expect(next.kind, label).toBe(file.kind);
    } else {
      expect(next, `${label}: file ${file.path}`).toStrictEqual(file);
      expect(next.content, `${label}: bytes of ${file.path}`).toBe(file.content);
    }
  });
  expect(after.spoken.length, `${label}: spoken count`).toBe(before.spoken.length);
  before.spoken.forEach((item, i) => {
    const next = after.spoken[i];
    if (isPersonality(item)) {
      expect(next.label, label).toBe(item.label);
      expect(next.kind, label).toBe(item.kind);
    } else {
      expect(next, `${label}: spoken ${item.label}`).toStrictEqual(item);
    }
  });
  expect(restOf(after), `${label}: every other field`).toStrictEqual(restOf(before));
}

// How many closing lines must stay put: five. On a top-and-bottom layout Mine sits directly above the
// closing rules block (W28), so when that block holds fewer than five non-blank lines the tail that can
// stay unchanged is the whole block. A free instructions soul has a block of two or three lines.
function tailLength(before: CompileResult, profile: Profile): number {
  if (profile.rulesInSoul !== 'top-and-bottom') return 5;
  const at = before.soulLines.findIndex((l) => l.id === profile.templates['rules.bottom'].id);
  const closing = before.soulLines.slice(at).filter((l) => l.kind !== 'blank').length;
  return Math.min(5, closing);
}

function checkTailUnchanged(before: CompileResult, after: CompileResult, profile: Profile, label: string): void {
  const n = tailLength(before, profile);
  expect(n, `${label}: there is a tail to compare`).toBeGreaterThan(0);
  expect(lastLines(personalityText(after), n), label).toStrictEqual(lastLines(personalityText(before), n));
}

function checkSync(after: CompileResult, label: string): void {
  const personality = personalityText(after);
  expect(after.soul, `${label}: soul is the personality artifact`).toBe(personality);
  expect(after.length, `${label}: length`).toBe(after.soul.length);
  expect(after.soulLines.map((l) => l.text).join('\n'), `${label}: soulLines rebuild the soul`).toBe(after.soul);
  for (const file of after.files.filter(isPersonality)) {
    expect(file.lines, `${label}: file lines`).toStrictEqual(after.soulLines);
  }
  for (const item of after.spoken.filter(isPersonality)) {
    const ids = after.soulLines.filter((l) => l.kind !== 'blank').map((l) => l.id);
    for (const id of ids) {
      expect(item.ids, `${label}: spoken ids hold ${id}`).toContain(id);
    }
  }
}

function checkRestorable(before: CompileResult, after: CompileResult, n: number, label: string): void {
  expect(withoutMineBlock(after.soulLines, n), `${label}: cutting the Mine block restores the soul`).toStrictEqual(
    before.soulLines,
  );
}

function checkPlacement(before: CompileResult, after: CompileResult, profile: Profile, n: number, label: string): void {
  const lines = after.soulLines;
  const lastMine = lines.map(isMineId).lastIndexOf(true);
  expect(lastMine, `${label}: Mine present`).toBeGreaterThan(-1);
  if (profile.rulesInSoul === 'top-and-bottom') {
    // Mine goes directly above the closing rules block, which stays whole and last.
    const bottomId = profile.templates['rules.bottom'].id;
    const bottom = lines.findIndex((l) => l.id === bottomId);
    const bottomBefore = before.soulLines.findIndex((l) => l.id === bottomId);
    expect(bottom, `${label}: closing rules heading`).toBeGreaterThan(-1);
    expect(lastMine, `${label}: Mine is above the closing rules`).toBeLessThan(bottom);
    expect(bottom, `${label}: one blank line between Mine and the closing rules`).toBe(lastMine + 2);
    expect(lines[lastMine + 1].kind, label).toBe('blank');
    expect(lines.slice(bottom), `${label}: closing block unchanged`).toStrictEqual(before.soulLines.slice(bottomBefore));
  } else {
    const firstGuarded = lines.findIndex(guarded);
    expect(firstGuarded, `${label}: a guarded line exists`).toBeGreaterThan(-1);
    expect(lastMine, `${label}: every gate, rules, act and clash line comes after Mine`).toBeLessThan(firstGuarded);
    const guardedBefore = before.soulLines.filter(guarded).map((l) => l.id);
    const guardedAfter = lines.filter(guarded).map((l) => l.id);
    expect(guardedAfter, `${label}: no guarded line lost`).toStrictEqual(guardedBefore);
  }
  expect(n, label).toBe(lines.filter(isMineId).length - 1);
}

function checkAll(starter: string, v: Variant, roles?: RoleId[]): void {
  const label = `${starter} on ${v.name}${roles ? ' with roles' : ''}`;
  const build = rosterBuild(starter, v, roles);
  const before = compile(build);
  const profile = profileOf(before);
  const after = withMine(before, profile, MINE, build);
  checkSection(after, MINE, label);
  checkOthersIdentical(before, after, label);
  checkTailUnchanged(before, after, profile, label);
  checkSync(after, label);
  checkRestorable(before, after, MINE.length, label);
  checkPlacement(before, after, profile, MINE.length, label);
}

// --- mineLines -------------------------------------------------------------

describe('Mine constants', () => {
  it('match the spec: heading "## Mine", 20,000 characters, 50 lines', () => {
    expect(MINE_HEADING).toBe('## Mine');
    expect(MAX_PASTE_CHARS).toBe(20_000);
    expect(MAX_MINE_LINES).toBe(50);
  });
});

describe('mineLines: what counts as a new line', () => {
  it('returns the pasted lines found in none of the texts, in paste order', () => {
    const out = mineLines('zeta\nalpha\nknown\nmid', ['known']);
    expect(out.lines).toStrictEqual(['zeta', 'alpha', 'mid']);
    expect(out.dropped).toBe(0);
    expect(out.replacedDashes).toBe(false);
  });

  it('normalizes CRLF, a lone CR and surrounding whitespace', () => {
    const out = mineLines('  one  \r\n\ttwo\t\rthree\r\n', []);
    expect(out.lines).toStrictEqual(['one', 'two', 'three']);
  });

  it('skips blank and whitespace-only lines', () => {
    expect(mineLines('\n\n  \n\t\none\n\n   \ntwo\n', []).lines).toStrictEqual(['one', 'two']);
  });

  it('skips a pasted "## Mine" heading line, also with surrounding whitespace', () => {
    expect(mineLines('## Mine\none\n  ## Mine  \ntwo', []).lines).toStrictEqual(['one', 'two']);
  });

  it('de-duplicates, keeping the first, also across whitespace differences', () => {
    const out = mineLines('one\ntwo\n  one  \ntwo\none', []);
    expect(out.lines).toStrictEqual(['one', 'two']);
  });

  it('matches a pasted line against each line of a multi-line text, after trimming', () => {
    const texts = ['first line\n  second line  \r\nthird line', 'other text'];
    const out = mineLines('second line\nthird line\nfirst line\nother text\nbrand new', texts);
    expect(out.lines).toStrictEqual(['brand new']);
  });

  it('splits known texts on CRLF and on a lone CR as well', () => {
    const texts = ['alpha\rbeta\r\ngamma\ndelta'];
    expect(mineLines('alpha\nbeta\ngamma\ndelta\nepsilon', texts).lines).toStrictEqual(['epsilon']);
  });

  it('treats a line that is only part of a known line as new', () => {
    const out = mineLines('Never raise size\nafter a loss', ['Never raise size after a loss.']);
    expect(out.lines).toStrictEqual(['Never raise size', 'after a loss']);
  });

  it('returns nothing for an empty paste or one with only blank lines', () => {
    for (const pasted of ['', '\n', ' \r\n \t \n', '## Mine']) {
      expect(mineLines(pasted, ['x'])).toStrictEqual({ lines: [], replacedDashes: false, dropped: 0 });
    }
  });

  it('returns every distinct line when there are no texts', () => {
    expect(mineLines('b\na\nb', []).lines).toStrictEqual(['b', 'a']);
  });

  it('does not mutate its inputs', () => {
    const texts = Object.freeze(['known one', 'known two']);
    const out = mineLines('known one\nnew', texts);
    expect(out.lines).toStrictEqual(['new']);
    expect(texts).toStrictEqual(['known one', 'known two']);
  });
});

describe('mineLines: caps', () => {
  const distinct = (n: number): string[] => Array.from({ length: n }, (_, i) => `mine line number ${i + 1}`);

  it('keeps exactly 50 lines with nothing dropped', () => {
    const out = mineLines(distinct(50).join('\n'), []);
    expect(out.lines).toStrictEqual(distinct(50));
    expect(out.dropped).toBe(0);
  });

  it('keeps the first 50 of 60 lines in paste order and counts 10 dropped', () => {
    const out = mineLines(distinct(60).join('\n'), []);
    expect(out.lines).toStrictEqual(distinct(50));
    expect(out.dropped).toBe(10);
  });

  it('counts 1 dropped for a 51st line', () => {
    const out = mineLines(distinct(51).join('\n'), []);
    expect(out.lines.length).toBe(50);
    expect(out.dropped).toBe(1);
  });

  it('does not spend line slots on known lines, blank lines or duplicates', () => {
    const known = Array.from({ length: 10 }, (_, i) => `known line ${i + 1}`);
    const fresh = distinct(55);
    const pasted = [...known, '', ...fresh.slice(0, 20), ...fresh.slice(0, 5), '  ', ...fresh.slice(20)].join('\n');
    const out = mineLines(pasted, known);
    expect(out.lines).toStrictEqual(fresh.slice(0, 50));
    expect(out.dropped).toBe(5);
  });

  // A known filler line of F characters sets where the next line ends, so the cap can be probed.
  const filler = (length: number): string => 'k'.repeat(length);

  it('keeps a line that ends exactly at 20,000 characters and drops the next whole line', () => {
    const f = filler(MAX_PASTE_CHARS - 10); // 19,990, then LF (1), then a 9 character line: ends at 20,000
    const out = mineLines(`${f}\nabcdefghi\nx`, [f]);
    expect(out.lines).toStrictEqual(['abcdefghi']);
    expect(out.dropped).toBe(1);
  });

  it('drops a line that ends one character past 20,000, whole and never truncated', () => {
    const f = filler(MAX_PASTE_CHARS - 9); // 19,991, LF, then 9 characters: ends at 20,001
    const out = mineLines(`${f}\nabcdefghi`, [f]);
    expect(out.lines).toStrictEqual([]);
    expect(out.dropped).toBe(1);
  });

  it('counts CR and LF toward the 20,000 characters', () => {
    const f = filler(MAX_PASTE_CHARS - 10);
    // Same paste as the boundary test, but CRLF puts the line's end at 20,001.
    expect(mineLines(`${f}\r\nabcdefghi`, [f])).toStrictEqual({ lines: [], replacedDashes: false, dropped: 1 });
    // One character shorter filler brings it back to exactly 20,000.
    const g = filler(MAX_PASTE_CHARS - 11);
    expect(mineLines(`${g}\r\nabcdefghi`, [g]).lines).toStrictEqual(['abcdefghi']);
    // A lone CR is one character.
    expect(mineLines(`${f}\rabcdefghi`, [f]).lines).toStrictEqual(['abcdefghi']);
  });

  it('drops a single 25,000 character line whole', () => {
    const out = mineLines('y'.repeat(25_000), []);
    expect(out.lines).toStrictEqual([]);
    expect(out.dropped).toBe(1);
  });

  it('counts every new line past the character cap as dropped', () => {
    const f = filler(MAX_PASTE_CHARS);
    const out = mineLines([f, 'late one', 'late two', 'late three'].join('\n'), [f]);
    expect(out.lines).toStrictEqual([]);
    expect(out.dropped).toBe(3);
  });

  it('does not count known lines or duplicates past the cap as dropped', () => {
    const f = filler(MAX_PASTE_CHARS);
    const out = mineLines([f, 'late known', 'late new', 'late new'].join('\n'), [f, 'late known']);
    expect(out.lines).toStrictEqual([]);
    expect(out.dropped).toBe(1);
  });

  it('adds the character-cap drops to the line-cap drops', () => {
    // 60 distinct 99 character lines (100 with the LF) end well inside 20,000, so 10 drop on the line cap.
    // Then a known filler pushes past the cap, and two late new lines drop on the character cap.
    const lines = Array.from({ length: 60 }, (_, i) => `${String(i + 1).padStart(3, '0')}${'m'.repeat(96)}`);
    const f = filler(MAX_PASTE_CHARS);
    const out = mineLines([...lines, f, 'late one', 'late two'].join('\n'), [f]);
    expect(out.lines).toStrictEqual(lines.slice(0, 50));
    expect(out.dropped).toBe(12);
  });
});

describe('mineLines: long dashes (W28)', () => {
  it('replaces an em dash with a plain dash and collapses the spaces around it', () => {
    expect(mineLines(`a ${EM} b`, []).lines).toStrictEqual(['a - b']);
    expect(mineLines(`a${EM}b`, []).lines).toStrictEqual(['a - b']);
    expect(mineLines(`a  ${EM}   b`, []).lines).toStrictEqual(['a - b']);
  });

  it('replaces every em dash in a line', () => {
    expect(mineLines(`one ${EM} two${EM}three ${EM} four`, []).lines).toStrictEqual(['one - two - three - four']);
  });

  it('trims a dash at the edge of a line', () => {
    expect(mineLines(`${EM} start`, []).lines).toStrictEqual(['- start']);
    expect(mineLines(`end ${EM}`, []).lines).toStrictEqual(['end -']);
  });

  it('leaves an en dash alone', () => {
    expect(mineLines(`pages 3${EN}5`, []).lines).toStrictEqual([`pages 3${EN}5`]);
  });

  it('sets replacedDashes only when a returned line had a dash replaced', () => {
    expect(mineLines(`a ${EM} b`, []).replacedDashes).toBe(true);
    expect(mineLines('a - b', []).replacedDashes).toBe(false);
    expect(mineLines(`pages 3${EN}5`, []).replacedDashes).toBe(false);
    expect(mineLines('', []).replacedDashes).toBe(false);
  });

  it('does not set replacedDashes for a dashed line that turns out to be known', () => {
    const out = mineLines(`alpha ${EM} beta`, ['alpha - beta']);
    expect(out.lines).toStrictEqual([]);
    expect(out.replacedDashes).toBe(false);
  });

  it('matches known lines on the replaced form', () => {
    expect(mineLines(`alpha ${EM} beta\nnew`, ['alpha - beta']).lines).toStrictEqual(['new']);
  });

  it('de-duplicates on the replaced form', () => {
    const out = mineLines(`x ${EM} y\nx - y\nx${EM}y`, []);
    expect(out.lines).toStrictEqual(['x - y']);
    expect(out.replacedDashes).toBe(true);
  });

  it('never returns a line with an em dash, whatever the input', () => {
    const inputs = [`${EM}`, `${EM}${EM}`, `a${EM}${EM}b`, ` ${EM} `, `x${EM}`, `${EM}x${EM}\r\n${EM}y`];
    for (const pasted of inputs) {
      for (const line of mineLines(pasted, []).lines) {
        expect(line, JSON.stringify(pasted)).not.toContain(EM);
      }
    }
  });
});

// --- mineLines against real compiles ---------------------------------------

// Every non-blank line of every artifact, gathered from the result's own fields.
function everyArtifactLine(result: CompileResult): string[] {
  const texts = [
    result.soul,
    ...result.files.map((f) => f.content),
    ...result.spoken.map((s) => s.text),
    ...result.customRules.map((r) => r.action),
    ...(result.conversationStarters ?? []),
    ...(result.description === undefined ? [] : [result.description]),
  ];
  return texts.flatMap((t) => t.split(/\r\n?|\n/)).filter((l) => l.trim() !== '');
}

describe('mineLines: a pasted line equal to any line of any artifact is not Mine', () => {
  for (const v of VARIANTS) {
    it(`${v.name}: every line of every artifact is known`, () => {
      const result = compile(rosterBuild('marty', v));
      const pasted = everyArtifactLine(result).join('\n');
      expect(pasted.length).toBeGreaterThan(0);
      expect(mineLines(pasted, mineTexts(result)).lines).toStrictEqual([]);
      expect(mineLines(pasted, copyableTexts(result)).lines).toStrictEqual([]);
    });

    it(`${v.name}: the test Mine lines are in no artifact, and a pasted copy of them is Mine`, () => {
      const result = compile(rosterBuild('marty', v));
      for (const text of MINE) {
        expect(everyArtifactLine(result)).not.toContain(text);
      }
      const out = mineLines(`${everyArtifactLine(result).slice(0, 5).join('\n')}\n${MINE.join('\n')}`, mineTexts(result));
      expect(out.lines).toStrictEqual(MINE);
    });
  }

  it('openclaw: AGENTS.md lines are known', () => {
    const result = compile(rosterBuild('marty', VARIANTS[1]));
    const agents = result.files.find((f) => f.path.endsWith('AGENTS.md'));
    expect(agents, 'openclaw ships an AGENTS.md').toBeDefined();
    const lines = agents!.content.split('\n').filter((l) => l.trim() !== '');
    expect(lines.length).toBeGreaterThan(1);
    expect(mineLines(lines.join('\n'), mineTexts(result)).lines).toStrictEqual([]);
  });

  it('openclaw: skill file lines are known', () => {
    const result = compile(rosterBuild('marty', VARIANTS[1]));
    const skills = result.files.filter((f) => f.kind === 'skill');
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      const lines = skill.content.split('\n').filter((l) => l.trim() !== '');
      expect(mineLines(lines.join('\n'), mineTexts(result)).lines, skill.path).toStrictEqual([]);
    }
  });

  it('muse: spoken memory, skill and routine lines are known', () => {
    const result = compile(rosterBuild('marty', MUSE));
    expect(result.spoken.length).toBeGreaterThan(1);
    for (const item of result.spoken) {
      const lines = item.text.split('\n').filter((l) => l.trim() !== '');
      expect(mineLines(lines.join('\n'), mineTexts(result)).lines, item.label).toStrictEqual([]);
    }
  });

  it('grok: the first task spoken item is known', () => {
    const result = compile(rosterBuild('marty', VARIANTS[3]));
    const first = result.spoken.find((s) => s.kind === 'firstTask');
    expect(first, 'grok has a first task item').toBeDefined();
    expect(mineLines(first!.text, mineTexts(result)).lines).toStrictEqual([]);
  });

  it('chatgpt dot: custom rule actions are known', () => {
    const result = compile(rosterBuild('marty', VARIANTS[4]));
    expect(result.customRules.length).toBeGreaterThan(0);
    for (const rule of result.customRules) {
      expect(mineLines(rule.action, mineTexts(result)).lines, rule.gate).toStrictEqual([]);
    }
  });

  it('chatgpt gpt: conversation starters and the description are known', () => {
    const result = compile(rosterBuild('marty', VARIANTS[8]));
    expect(result.conversationStarters?.length).toBeGreaterThan(0);
    expect(result.description).toBeTruthy();
    for (const starter of result.conversationStarters ?? []) {
      expect(mineLines(starter, mineTexts(result)).lines).toStrictEqual([]);
    }
    expect(mineLines(result.description ?? '', mineTexts(result)).lines).toStrictEqual([]);
  });

  it('chatgpt instructions: the first-field memory text is known', () => {
    const result = compile(rosterBuild('marty', INSTRUCTIONS_PAID));
    const memory = result.files.find((f) => f.kind === 'memory');
    expect(memory, 'instructions has a memory field').toBeDefined();
    expect(mineLines(memory!.content, mineTexts(result)).lines).toStrictEqual([]);
  });

  it('role files are known', () => {
    const build = rosterBuild('marty', VARIANTS[1], ['scout', 'risk-manager', 'journal']);
    const result = compile(build);
    const roleFiles = result.files.filter((f) => f.role !== undefined);
    expect(roleFiles.length).toBeGreaterThan(0);
    for (const file of roleFiles) {
      const lines = file.content.split('\n').filter((l) => l.trim() !== '');
      expect(mineLines(lines.join('\n'), mineTexts(result)).lines, file.path).toStrictEqual([]);
    }
  });
});

describe('copyableTexts', () => {
  it('holds the soul, file contents, spoken texts, custom rule actions, starters and description', () => {
    for (const v of VARIANTS) {
      const result = compile(rosterBuild('marty', v));
      const texts = copyableTexts(result);
      expect(texts, v.name).toContain(result.soul);
      for (const f of result.files) expect(texts, `${v.name}: ${f.path}`).toContain(f.content);
      for (const s of result.spoken) expect(texts, `${v.name}: ${s.label}`).toContain(s.text);
      for (const r of result.customRules) expect(texts, `${v.name}: ${r.gate}`).toContain(r.action);
      for (const c of result.conversationStarters ?? []) expect(texts, v.name).toContain(c);
      if (result.description !== undefined) expect(texts, v.name).toContain(result.description);
    }
  });

  it('has custom rules on dot and starters plus a description on gpt (so the cases above bite)', () => {
    expect(compile(rosterBuild('marty', VARIANTS[4])).customRules.length).toBeGreaterThan(0);
    const gpt = compile(rosterBuild('marty', VARIANTS[8]));
    expect(gpt.conversationStarters?.length).toBeGreaterThan(0);
    expect(gpt.description).toBeTruthy();
  });

  it('takes the action of a custom rule and not its setting', () => {
    const result = compile(rosterBuild('marty', VARIANTS[4]));
    const texts = copyableTexts(result);
    for (const rule of result.customRules) {
      expect(texts).toContain(rule.action);
      expect(texts, `setting "${rule.setting}" is not copyable text`).not.toContain(rule.setting);
    }
  });

  it('does not take install steps or notes, which are page text and not artifacts', () => {
    for (const v of VARIANTS) {
      const result = compile(rosterBuild('marty', v));
      const texts = copyableTexts(result);
      for (const step of result.installSteps) expect(texts, `${v.name}: step`).not.toContain(step);
      for (const note of result.notes) expect(texts, `${v.name}: note`).not.toContain(note);
    }
  });
});

describe('mineTexts: the baseline compile', () => {
  // A peeve removed during the remix: the baseline (the link's build) had it, the current build does not.
  // The peeve's library line is in the baseline soul only, as a peeve line of the soul.
  const peeve = library.peeves.find((p) => p.id === 'adds_disclaimers');
  const peeveLibraryLine = peeve?.line ?? '';
  const baselineV1: BuildV1 = { ...rosterV1('marty'), peeves: ['adds_disclaimers'] };
  const currentV2 = rosterBuild('marty', MUSE);
  const current = compile(currentV2);
  // The line a user would paste: the baseline soul's peeve line, found by kind and library text.
  const peeveSoulLine = compile(baselineV1).soulLines.find((l) => l.kind === 'peeve' && l.text.includes(peeveLibraryLine));
  const pasted = peeveSoulLine?.text ?? '';

  it('has a peeve line that the baseline soul holds and the current soul does not', () => {
    expect(peeveLibraryLine).not.toBe('');
    expect(peeveSoulLine, 'the baseline soul has the peeve line').toBeDefined();
    expect(pasted).not.toBe('');
    expect(everyArtifactLine(current)).not.toContain(pasted);
    expect(current.soulLines.some((l) => l.text.includes(peeveLibraryLine))).toBe(false);
  });

  it('treats the peeve line as Mine when there is no baseline', () => {
    expect(mineLines(pasted, mineTexts(current)).lines).toStrictEqual([pasted]);
  });

  it('does not treat a baseline line as Mine (v1 baseline)', () => {
    expect(mineLines(pasted, mineTexts(current, baselineV1)).lines).toStrictEqual([]);
  });

  it('does not treat a baseline line as Mine (v2 baseline)', () => {
    const baselineV2 = migrate(baselineV1, { target: 'muse' });
    expect(mineLines(pasted, mineTexts(current, baselineV2)).lines).toStrictEqual([]);
  });

  it('still returns genuinely new lines beside baseline lines', () => {
    const out = mineLines(`${pasted}\n${MINE[0]}`, mineTexts(current, baselineV1));
    expect(out.lines).toStrictEqual([MINE[0]]);
  });

  it('keeps every current line known as well', () => {
    const all = everyArtifactLine(current).join('\n');
    expect(mineLines(all, mineTexts(current, baselineV1)).lines).toStrictEqual([]);
  });

  it('adds nothing when the baseline no longer compiles, and does not throw', () => {
    const broken = { ...baselineV1, name: '' } as BuildV1;
    expect(() => compile(broken), 'precondition: this baseline does not compile').toThrow();
    expect(mineTexts(current, broken)).toStrictEqual(copyableTexts(current));
    const garbage = {} as unknown as Build;
    expect(mineTexts(current, garbage)).toStrictEqual(copyableTexts(current));
    expect(mineLines(pasted, mineTexts(current, broken)).lines).toStrictEqual([pasted]);
  });

  it('is the current compile alone when no baseline is given', () => {
    expect(mineTexts(current)).toStrictEqual(copyableTexts(current));
  });
});

// --- withMine on one golden build on every profile -------------------------

for (const v of VARIANTS) {
  describe(`withMine on marty, ${v.name}`, () => {
    const build = rosterBuild('marty', v);
    const before = compile(build);
    const profile = profileOf(before);
    const after = withMine(before, profile, MINE, build);

    it('puts a "## Mine" section with the lines in the personality artifact', () => {
      checkSection(after, MINE, v.name);
    });

    it('leaves every other artifact byte-identical', () => {
      checkOthersIdentical(before, after, v.name);
    });

    it('keeps the last five non-blank lines of the personality artifact (the whole closing block when shorter)', () => {
      checkTailUnchanged(before, after, profile, v.name);
    });

    it('keeps soul, soulLines, the personality artifact and length in sync', () => {
      checkSync(after, v.name);
    });

    it('changes nothing else in the soul: cutting the Mine block restores the original lines', () => {
      checkRestorable(before, after, MINE.length, v.name);
    });

    it('keeps rules, gate, act and clash lines after Mine (W28)', () => {
      checkPlacement(before, after, profile, MINE.length, v.name);
    });

    it('adds the Mine lines to the soul and the length by the section size', () => {
      // heading + lines + blank, each joined by one newline: 7 + 3 newlines, plus the lines and their joins.
      const added = '## Mine'.length + MINE.reduce((sum, m) => sum + m.length, 0) + (1 + MINE.length + 1);
      expect(after.length - before.length).toBe(added);
    });

    it('never appears in the share link of the build', () => {
      const urlBefore = shareUrl(ORIGIN, '/', build);
      const hashBefore = toShareHash(build);
      const twin = withMine(before, profile, MINE, build);
      expect(twin.soul).toBe(after.soul);
      expect(shareUrl(ORIGIN, '/', build)).toBe(urlBefore);
      expect(toShareHash(build)).toBe(hashBefore);
      const link = new URL(urlBefore);
      const decoded = fromShareHash(link.hash, library);
      expect(decoded.build).toStrictEqual(build);
      const json = JSON.stringify(decoded.build);
      for (const needle of [...MINE, '## Mine', 'user.mine']) {
        expect(json).not.toContain(needle);
        expect(urlBefore).not.toContain(needle);
        expect(decodeURIComponent(urlBefore)).not.toContain(needle);
      }
      // Opening the link recompiles to the pre-Mine soul.
      expect(compile(decoded.build).soul).toBe(before.soul);
    });

    it('does not mutate its inputs', () => {
      const snapshot = structuredClone(before);
      const buildSnapshot = structuredClone(build);
      const input = Object.freeze([...MINE]);
      const out = withMine(before, profile, input, build);
      expect(out).not.toBe(before);
      expect(before).toStrictEqual(snapshot);
      expect(build).toStrictEqual(buildSnapshot);
      expect(input).toStrictEqual(MINE);
    });
  });
}

describe('withMine on every roster starter', () => {
  for (const v of VARIANTS) {
    it(`${v.name}: all nine starters keep the Mine invariants`, () => {
      expect(STARTERS.length).toBe(9);
      for (const starter of STARTERS) checkAll(starter, v);
    });
  }
});

describe('withMine on the role goldens', () => {
  const specs: { starter: string; v: Variant; roles: RoleId[] }[] = [
    { starter: 'marty', v: VARIANTS[1], roles: ['scout', 'risk-manager', 'journal'] },
    { starter: 'rook', v: VARIANTS[2], roles: ['planner', 'implementer', 'reviewer', 'tester'] },
    { starter: 'june', v: VARIANTS[3], roles: ['chief-of-staff', 'triager', 'scheduler'] },
    { starter: 'sol', v: VARIANTS[5], roles: ['lead', 'searcher', 'synthesizer', 'fact-checker'] },
  ];
  for (const { starter, v, roles } of specs) {
    it(`${starter} on ${v.name} with roles: role files and every other artifact are untouched`, () => {
      const build = rosterBuild(starter, v, roles);
      const before = compile(build);
      expect(before.files.some((f) => f.role !== undefined) || before.spoken.some((s) => s.role !== undefined)).toBe(true);
      checkAll(starter, v, roles);
    });
  }
});

// --- withMine unit behavior ------------------------------------------------

describe('withMine: cleaning and ids', () => {
  const build = rosterBuild('marty', MUSE);
  const before = compile(build);
  const profile = profileOf(before);
  const mineOf = (r: CompileResult): string[] => r.soulLines.filter((l) => isMineId(l) && l.id !== 'user.mine.heading').map((l) => l.text);

  it('returns the very same result when no lines are left', () => {
    expect(withMine(before, profile, [], build)).toBe(before);
    expect(withMine(before, profile, ['', '   ', '\n\t\n'], build)).toBe(before);
    expect(withMine(before, profile, ['## Mine', '  ## Mine  '], build)).toBe(before);
  });

  it('splits an item on newlines, trims, and drops blank lines and the heading', () => {
    const out = withMine(before, profile, ['  one  \r\n\r\n## Mine\r\n two ', '   ', 'three'], build);
    expect(mineOf(out)).toStrictEqual(['one', 'two', 'three']);
    expect(out.soulLines.filter((l) => l.text === '## Mine').length).toBe(1);
  });

  it('treats a lone CR inside an item as a line break', () => {
    const out = withMine(before, profile, ['one\rtwo\r\nthree'], build);
    expect(mineOf(out)).toStrictEqual(['one', 'two', 'three']);
  });

  it('replaces em dashes with " - " and leaves en dashes, so the soul has no em dash', () => {
    const out = withMine(before, profile, [`a ${EM} b`, `c${EM}d`, `pages 1${EN}2`], build);
    expect(mineOf(out)).toStrictEqual(['a - b', 'c - d', `pages 1${EN}2`]);
    expect(out.soul).not.toContain(EM);
    expect(personalityText(out)).not.toContain(EM);
  });

  it('gives the heading user.mine.heading and the lines user.mine.1 upward in order', () => {
    const out = withMine(before, profile, ['x one', 'x two', 'x three'], build);
    const mine = out.soulLines.filter(isMineId);
    expect(mine.map((l) => l.id)).toStrictEqual(['user.mine.heading', 'user.mine.1', 'user.mine.2', 'user.mine.3']);
    expect(mine.map((l) => l.text)).toStrictEqual(['## Mine', 'x one', 'x two', 'x three']);
  });

  it('keeps Mine lines out of the rule, gate, limit, pack-rule and chassis kinds', () => {
    const out = withMine(before, profile, MINE, build);
    for (const line of out.soulLines.filter(isMineId)) {
      expect(['rule', 'gate', 'limit', 'pack-rule', 'chassis']).not.toContain(line.kind);
    }
  });

  it('puts the Mine ids in the spoken personality ids on a spoken profile', () => {
    const dotBuild = rosterBuild('marty', VARIANTS[4]);
    const dot = compile(dotBuild);
    const out = withMine(dot, profileOf(dot), MINE, dotBuild);
    const item = out.spoken.find(isPersonality);
    expect(item).toBeDefined();
    expect(item!.text).toBe(out.soul);
    expect(item!.ids).toEqual(expect.arrayContaining(['user.mine.heading', 'user.mine.1', 'user.mine.2']));
    expect(out.files.length).toBe(0);
    expect(out.customRules).toStrictEqual(dot.customRules);
  });

  it('goes through the whole flow: diff the paste, then apply the new lines', () => {
    const pasted = `${before.soul}\n\n## Mine\n${MINE.join('\n')}\n`;
    const diff = mineLines(pasted, mineTexts(before));
    expect(diff.lines).toStrictEqual(MINE);
    const out = withMine(before, profile, diff.lines, build);
    checkSection(out, MINE, 'flow');
    // Pasting the new soul back finds the same Mine lines and nothing else.
    expect(mineLines(out.soul, mineTexts(before)).lines).toStrictEqual(MINE);
    // Against the new compile they are known.
    expect(mineLines(out.soul, mineTexts(out)).lines).toStrictEqual([]);
  });
});

describe('withMine: placement fallbacks (engineer reading 2)', () => {
  it('appends Mine at the end when there is no rules, act or clash line', () => {
    const build = rosterBuild('marty', MUSE);
    const full = compile(build);
    const profile = profileOf(full);
    const kept = full.soulLines.filter((l) => !guarded(l) && l.kind !== 'heading' && l.kind !== 'blank').slice(0, 4);
    expect(kept.length).toBeGreaterThan(0);
    const synthetic: CompileResult = { ...full, soulLines: kept, soul: kept.map((l) => l.text).join('\n') };
    const out = withMine(synthetic, profile, MINE, build);
    const ids = out.soulLines.map((l) => l.id);
    expect(ids.slice(0, kept.length)).toStrictEqual(kept.map((l) => l.id));
    expect(out.soulLines[kept.length].kind).toBe('blank');
    expect(ids.slice(kept.length + 1)).toStrictEqual(['user.mine.heading', 'user.mine.1', 'user.mine.2']);
    expect(out.soul).toBe(`${synthetic.soul}\n\n## Mine\n${MINE.join('\n')}`);
  });

  it('on a top-and-bottom layout, finds the closing run when its heading line is missing', () => {
    const build = rosterBuild('marty', VARIANTS[5]);
    const full = compile(build);
    const profile = profileOf(full);
    const bottomId = profile.templates['rules.bottom'].id;
    const headingAt = full.soulLines.findIndex((l) => l.id === bottomId);
    expect(headingAt).toBeGreaterThan(0);
    const lines = full.soulLines.filter((_, i) => i !== headingAt);
    const synthetic: CompileResult = { ...full, soulLines: lines, soul: lines.map((l) => l.text).join('\n') };
    const out = withMine(synthetic, profile, MINE, build);
    const lastMine = out.soulLines.map(isMineId).lastIndexOf(true);
    // Mine sits directly above the closing run, which starts where the heading used to be.
    expect(out.soulLines[lastMine + 1].kind).toBe('blank');
    expect(out.soulLines.slice(lastMine + 2)).toStrictEqual(lines.slice(headingAt));
  });
});

// --- The length cap --------------------------------------------------------

describe('withMine: over-cap warning', () => {
  const OVERHEAD = '## Mine'.length + 3; // heading, one line and the blank, each joined by a newline

  const veraFree = rosterBuild('vera', INSTRUCTIONS_FREE);
  const veraFreeBefore = compile(veraFree);
  const veraFreeProfile = profileOf(veraFreeBefore);
  const mineWarnings = (r: CompileResult): string[] => r.warnings.filter((w) => w.startsWith('mine:'));

  it('starts from a free instructions soul at or under 1,500 characters', () => {
    expect(capFor(veraFreeProfile, veraFree)).toBe(1500);
    expect(veraFreeBefore.length).toBeLessThanOrEqual(1500);
    expect(mineWarnings(veraFreeBefore)).toStrictEqual([]);
  });

  it('adds the over-cap warning when Mine pushes free custom instructions over 1,500', () => {
    const line = 'w'.repeat(300);
    const out = withMine(veraFreeBefore, veraFreeProfile, [line], veraFree);
    expect(out.length).toBeGreaterThan(1500);
    const warnings = mineWarnings(out);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toBe(`mine: soul is ${out.length} characters, over 1500`);
  });

  it('keeps the earlier warnings in order, ahead of the new one', () => {
    const out = withMine(veraFreeBefore, veraFreeProfile, ['w'.repeat(300)], veraFree);
    expect(out.warnings.slice(0, veraFreeBefore.warnings.length)).toStrictEqual(veraFreeBefore.warnings);
    expect(out.warnings.length).toBe(veraFreeBefore.warnings.length + 1);
  });

  it('adds no warning at exactly 1,500 and adds one at 1,501', () => {
    const room = 1500 - veraFreeBefore.length - OVERHEAD;
    expect(room).toBeGreaterThan(0);
    const exact = withMine(veraFreeBefore, veraFreeProfile, ['q'.repeat(room)], veraFree);
    expect(exact.length).toBe(1500);
    expect(mineWarnings(exact)).toStrictEqual([]);
    const over = withMine(veraFreeBefore, veraFreeProfile, ['q'.repeat(room + 1)], veraFree);
    expect(over.length).toBe(1501);
    expect(mineWarnings(over)).toStrictEqual([`mine: soul is 1501 characters, over 1500`]);
  });

  it('adds the warning when the free soul was already over 1,500 before Mine (reading 6)', () => {
    const build = rosterBuild('marty', INSTRUCTIONS_FREE);
    const before = compile(build);
    expect(before.length).toBeGreaterThan(1500);
    const out = withMine(before, profileOf(before), ['one short line'], build);
    expect(mineWarnings(out)).toStrictEqual([`mine: soul is ${out.length} characters, over 1500`]);
  });

  it('uses the paid cap of 5,000 for a paid build', () => {
    const build = rosterBuild('vera', INSTRUCTIONS_PAID);
    const before = compile(build);
    const profile = profileOf(before);
    expect(capFor(profile, build)).toBe(5000);
    const medium = withMine(before, profile, ['w'.repeat(300)], build);
    expect(medium.length).toBeGreaterThan(1500);
    expect(medium.length).toBeLessThanOrEqual(5000);
    expect(mineWarnings(medium)).toStrictEqual([]);
    const huge = withMine(before, profile, ['w'.repeat(2000)], build);
    expect(huge.length).toBeGreaterThan(5000);
    expect(mineWarnings(huge)).toStrictEqual([`mine: soul is ${huge.length} characters, over 5000`]);
  });

  it('reads the plan from the build: the same 300 characters warn on free and not on paid', () => {
    const line = 'w'.repeat(300);
    const free = withMine(veraFreeBefore, veraFreeProfile, [line], veraFree);
    const paidBuild = rosterBuild('vera', INSTRUCTIONS_PAID);
    const paidBefore = compile(paidBuild);
    const paid = withMine(paidBefore, profileOf(paidBefore), [line], paidBuild);
    expect(mineWarnings(free).length).toBe(1);
    expect(mineWarnings(paid).length).toBe(0);
  });

  for (const v of VARIANTS) {
    if (v === INSTRUCTIONS_FREE) continue;
    it(`${v.name}: a small Mine that stays under the cap adds no warning`, () => {
      const build = rosterBuild('marty', v);
      const before = compile(build);
      const profile = profileOf(before);
      const out = withMine(before, profile, ['a short line'], build);
      expect(out.length).toBeLessThanOrEqual(capFor(profile, build));
      expect(mineWarnings(out)).toStrictEqual([]);
      expect(out.warnings).toStrictEqual(before.warnings);
    });

    it(`${v.name}: a Mine that crosses the library cap adds the warning with that cap`, () => {
      const build = rosterBuild('marty', v);
      const before = compile(build);
      const profile = profileOf(before);
      const cap = capFor(profile, build);
      const line = 'w'.repeat(cap - before.length + 50);
      const out = withMine(before, profile, [line], build);
      expect(out.length).toBeGreaterThan(cap);
      expect(mineWarnings(out)).toStrictEqual([`mine: soul is ${out.length} characters, over ${cap}`]);
    });
  }

  it('is a developer warning only: it does not change the soul or any other artifact', () => {
    const out = withMine(veraFreeBefore, veraFreeProfile, ['w'.repeat(300)], veraFree);
    expect(out.length).toBe(out.soul.length);
    checkOthersIdentical(veraFreeBefore, out, 'free over cap');
  });
});

// --- Tracing (W28 carve-out) -----------------------------------------------

describe('traceBundle with Mine (W28)', () => {
  const build = rosterBuild('marty', MUSE);
  const before = compile(build);
  const profile = profileOf(before);

  it('accepts the compile before Mine (control)', () => {
    expect(() => traceBundle(before, library)).not.toThrow();
  });

  // W28: Mine ids are the one tracing exception (lead added the carve-out to trace.ts).
  it('accepts a withMine result, since user.mine.* ids are the one carve-out', () => {
    traceBundle(withMine(before, profile, MINE, build), library);
  });
});

// Lead addition (wave 2 gate): Grok's label (the build name) is its own copy block, so pasting it
// back is not a Mine line.
describe('the Grok label counts as copyable', () => {
  it('a pasted Grok label is not Mine', () => {
    const marty = library.roster.find((r) => r.id === 'marty')!.build;
    const result = compile(migrate(structuredClone(marty), { target: 'grok' }));
    expect(copyableTexts(result)).toContain(result.buildName);
    expect(mineLines(result.buildName, mineTexts(result)).lines).toEqual([]);
  });
});

// Lead addition (wave 2 gate): the carve-out covers a spoken personality (ChatGPT dot) and only the
// main personality artifact.
describe('the Mine trace carve-out across delivery kinds', () => {
  const marty = library.roster.find((r) => r.id === 'marty')!.build;
  const cases = [
    { target: 'chatgpt', mode: 'dot' },
    { target: 'chatgpt', mode: 'instructions', plan: 'paid' },
    { target: 'chatgpt', mode: 'project' },
    { target: 'muse' },
    { target: 'openclaw' },
    { target: 'hermes' },
    { target: 'grok' },
  ] as const;
  for (const c of cases) {
    it(`traceBundle accepts Mine on ${c.target}${'mode' in c ? ` ${c.mode}` : ''}`, () => {
      const build = migrate(structuredClone(marty), c as never);
      const before = compile(build);
      expect(() => traceBundle(withMine(before, profileOf(before), ['A line of my own.'], build), library)).not.toThrow();
    });
  }

  it('rejects a Mine id outside the personality artifact', () => {
    const build = migrate(structuredClone(marty), { target: 'openclaw' });
    const r = compile(build);
    const agents = r.files.find((f) => f.kind === 'rules')!;
    const forged = {
      ...r,
      files: r.files.map((f) =>
        f === agents
          ? { ...f, content: `${f.content}\nmine`, lines: [...f.lines, { text: 'mine', id: 'user.mine.1', kind: 'chassis' as const }] }
          : f,
      ),
    };
    expect(() => traceBundle(forged as typeof r, library)).toThrow(/unknown id "user\.mine\.1"/);
  });
});
