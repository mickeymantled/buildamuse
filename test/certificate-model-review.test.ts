// Certificate model review (M4 fix slice F3a): src/ui/certificate/model.ts after the review fixes.
//
// Three behaviors, plus a guard:
//   1. The ChatGPT dot (rulesDelivery custom-rules) carries its limit lines and pack rules lines in the
//      Hard rules section of its message (B17), so the certificate lists under Left out, and counts in
//      the summary, only the lines whose text is missing from that message (K3), each once.
//   2. On Muse and Grok the Left out blocks are titled "<pack label>, rule n" and the titles are unique.
//   3. The length meter turns "near" within 400 characters under the cap, with the library's hint.
//   4. No copyable block carries a "verify:" line.
//
// Expected text comes from the library tables (limits, packs, gates, roster) and the library doc,
// never from running the model and copying what it printed. The strings that are not library text
// (the summary sentence, the two Left out hints) are the fixed lines from the F3a engineer report; the dot
// hint was reworded in K3 (the old one explained a cause that is no longer true).
// Where a test needs a situation the goldens do not reach, it hands the model a synthetic input:
// the compiled result with one field replaced, or a library copy with fewer pack rules.

import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { capOf, resolveProfile } from '../src/compiler/profile.js';
import type { Build, CompileResult, Library, Profile, Trimmed } from '../src/compiler/types.js';
import { certificateModel, starterIdOf } from '../src/ui/certificate/model.js';
import { copy } from '../src/ui/copy.js';
import type { CertGroup, CertInput, CertModel, SummaryKind } from '../src/ui/certificate/model.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---------------------------------------------------------------------------
// Fixed text
// ---------------------------------------------------------------------------

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

// docs/Build-a-Muse-Compiler-Library-v1.md, the length meter row: "length > 3,200 | meter goes amber,
// tooltip "drop a chip to shorten"". A guard test below reads the doc, so this literal and the doc move together.
const METER_HINT = 'drop a chip to shorten';
const AMBER_LINE = 3200; // the doc's threshold on the dot's 3,600 cap
const NEAR = 400; // the engineer's reading: the doc's 3,200 is 400 under the 3,600 cap

// F3a engineer report: the two hints under the Left out heading.
const DOT_LEFT_OUT_HINT = "These rules are not in your dot's message. Add them by hand if you want them.";
const PACK_LEFT_OUT_HINT = 'These rules did not fit. Add them by hand if you want them.';

const DOT_KEY = 'summary-undelivered-dot';

const SUMMARY_ORDER: readonly SummaryKind[] = [
  'auto',
  'floor',
  'over',
  'steer',
  'trimmed',
  'dropped',
  'undelivered',
  'deprecated',
];

// ---------------------------------------------------------------------------
// Cases: every golden build (55) plus a mode-gpt variant of each roster starter (9)
// ---------------------------------------------------------------------------

interface Case {
  id: string;
  build: Build;
  profile: Profile;
  result: CompileResult;
  input: CertInput;
  model: CertModel;
}

function inputFor(build: Build, over: Partial<CertInput> = {}): CertInput {
  const profile = resolveProfile(build, library);
  return {
    result: compile(build),
    build,
    profile,
    cap: capOf(profile, build),
    skipped: [],
    drops: [],
    decodeWarnings: [],
    starterId: starterIdOf(build),
    ...over,
  };
}

function makeCase(id: string, build: Build): Case {
  const input = inputFor(build);
  return { id, build, profile: input.profile, result: input.result, input, model: certificateModel(input) };
}

const SPEC_CASES: Case[] = GOLDEN_SPECS.map((spec) => makeCase(spec.id, buildFor(spec, library)));
const GPT_CASES: Case[] = library.roster.map((entry) =>
  makeCase(`${entry.id}.chatgpt-gpt`, migrate(entry.build, { target: 'chatgpt', mode: 'gpt' })),
);
const CASES: Case[] = [...SPEC_CASES, ...GPT_CASES];

function caseOf(id: string): Case {
  const found = CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
}

// The compiled result with some fields replaced.
function modelWithResult(c: Case, patch: Partial<CompileResult>, over: Partial<CertInput> = {}): CertModel {
  return certificateModel({ ...c.input, result: { ...c.result, ...patch }, ...over });
}

// A model for a build the goldens do not cover, compiled for real.
function modelOfBuild(build: Build): { build: Build; result: CompileResult; model: CertModel } {
  const input = inputFor(build);
  return { build, result: input.result, model: certificateModel(input) };
}

function groupsOf(m: CertModel): CertGroup[] {
  return [...m.steps.flatMap((s) => s.groups), ...m.extra];
}

function summaryByKey(m: CertModel, key: string) {
  return m.summary.find((s) => s.key === key);
}

const isDot = (c: Case): boolean => c.profile.id === 'chatgpt-dot';

// ---------------------------------------------------------------------------
// What the dot's message should hold, derived from the library tables
// ---------------------------------------------------------------------------

interface Line {
  id: string; // limit.<id> or the pack rule id
  text: string;
  title: string; // a limit's label, or "<pack label>, rule n" by the rule's place in its pack
}

// The build's effective limit lines: pack defaults merged by each limit's `stricter` direction, the
// build's own limits on top, then in the library's limit registry order, as library templates.
function limitLines(build: Build): Line[] {
  const values = new Map<string, number>();
  for (const packId of build.packs) {
    const pack = library.packs.find((p) => p.id === packId);
    for (const [id, value] of Object.entries(pack?.limitsDefault ?? {})) {
      const current = values.get(id);
      const stricter = library.limits.find((l) => l.id === id)?.stricter;
      if (current === undefined) values.set(id, value);
      else values.set(id, stricter === 'higher' ? Math.max(current, value) : Math.min(current, value));
    }
  }
  for (const [id, value] of Object.entries(build.limits)) values.set(id, value);
  return library.limits
    .filter((l) => values.has(l.id))
    .map((l) => ({
      id: `limit.${l.id}`,
      title: l.label,
      text: l.rulesTemplate.replaceAll('{value}', String(values.get(l.id))),
    }));
}

// Every pack rules line of the build's packs, in build order, titled "<pack label>, rule n".
function packRuleLines(build: Build, lib: Library = library): Line[] {
  const out: Line[] = [];
  for (const packId of build.packs) {
    const pack = lib.packs.find((p) => p.id === packId);
    if (pack === undefined) continue;
    pack.rulesLines.forEach((rule, i) => {
      out.push({ id: rule.id, text: rule.line, title: `${pack.label}, rule ${i + 1}` });
    });
  }
  return out;
}

const countOf = (list: readonly string[], value: string): number => list.filter((x) => x === value).length;
const isLimit = (l: Line): boolean => l.id.startsWith('limit.');

// B17 and K3: the dot message carries the limit lines and the pack rules lines in its Hard rules
// section, so a line is left out only when its text is missing from the message (result.soul).
function missingFrom(lines: readonly Line[], soul: string): Line[] {
  return lines.filter((l) => !soul.includes(l.text));
}

// The title a Left out block shows: a limit keeps its label, a pack rule is numbered within its pack
// in the order shown, from 1 (the same numbering Muse and Grok use).
function shownTitles(lines: readonly Line[]): string[] {
  const counts = new Map<string, number>();
  return lines.map((l) => {
    if (isLimit(l)) return l.title;
    const pack = l.title.replace(/, rule \d+$/, '');
    const n = (counts.get(pack) ?? 0) + 1;
    counts.set(pack, n);
    return `${pack}, rule ${n}`;
  });
}

// The summary sentence (F3a engineer report): "your limits" and "N pack rule(s)", joined with "and".
function dotSentence(limits: number, rules: number): string {
  const what = [
    ...(limits > 0 ? ['your limits'] : []),
    ...(rules > 0 ? [`${rules} pack ${rules === 1 ? 'rule' : 'rules'}`] : []),
  ].join(' and ');
  const pronoun = limits > 0 || rules !== 1 ? 'them' : 'it';
  return `Not included on ChatGPT: ${what}. Add ${pronoun} to your dot by hand.`;
}

// A personality message for a synthetic input: the compiled one with every line of `all` present,
// then `missing` taken out of it wherever it appears.
function soulWith(base: string, all: readonly Line[], missing: readonly Line[]): string {
  let soul = `${base}\n${all.map((l) => l.text).join('\n')}`;
  for (const line of missing) soul = soul.split(line.text).join('');
  return soul;
}

// A dot build from a roster starter, with the pieces a test wants to vary.
function dotBuild(starter: string, over: Partial<Build> = {}): Build {
  const entry = library.roster.find((r) => r.id === starter);
  if (!entry) throw new Error(`no roster starter ${starter}`);
  return { ...migrate(entry.build, { target: 'chatgpt', mode: 'dot' }), ...over };
}

// A library copy that keeps only the first n rules lines of each pack, for the model's `lib` argument.
function libWithRules(n: number): Library {
  return { ...library, packs: library.packs.map((p) => ({ ...p, rulesLines: p.rulesLines.slice(0, n) })) };
}

// The model for a dot build whose personality message is the compiled one with every limit and pack
// rules line of `lib` put in and `pick(all)` taken out again. The compile is real; only the message
// the model checks is edited, so the situation does not depend on what the compiler cuts.
function modelWithMissing(
  build: Build,
  pick: (limits: Line[], rules: Line[]) => Line[],
  lib: Library = library,
): { model: CertModel; limits: Line[]; rules: Line[]; missing: Line[] } {
  const input = inputFor(build);
  const limits = limitLines(build);
  const rules = packRuleLines(build, lib);
  const missing = pick(limits, rules);
  const soul = soulWith(input.result.soul, [...limits, ...rules], missing);
  const model = certificateModel({ ...input, result: { ...input.result, soul } }, lib);
  return { model, limits, rules, missing };
}

const none = (): Line[] => [];
const onlyLimits = (limits: Line[]): Line[] => limits;
const onlyRules = (_limits: Line[], rules: Line[]): Line[] => rules;
const everything = (limits: Line[], rules: Line[]): Line[] => [...limits, ...rules];

// ---------------------------------------------------------------------------
// 1. ChatGPT dot: the undelivered dot summary and the Left out group
// ---------------------------------------------------------------------------

describe('ChatGPT dot: marty (the real compile)', () => {
  const c = caseOf('marty.chatgpt-dot');
  const limits = limitLines(c.build);
  const rules = packRuleLines(c.build);
  const missing = missingFrom([...limits, ...rules], c.result.soul);
  const missingLimits = missing.filter(isLimit);
  const missingRules = missing.filter((l) => !isLimit(l));

  it('has limits and pack rules in the library (the build under test is the one with both)', () => {
    expect(c.build.packs).toEqual(['memecoins']);
    expect(limits.length).toBe(3);
    expect(rules.length).toBe(library.packs.find((p) => p.id === 'memecoins')?.rulesLines.length);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('uses the library limit template with the effective value, from the build, not the other way round', () => {
    expect(limits.map((l) => l.text)).toEqual([
      'Never put more than 1% of the account into one trade.',
      'Stop trading for the day once losses reach 3% of the account, and tell the user.',
      'Never place more than 10 trades in one day.',
    ]);
    // The derivation above is the library's; the compiler's effective limits agree with it.
    expect(Object.keys(c.result.limits)).toEqual(limits.map((l) => l.id.replace('limit.', '')));
  });

  it('B17: the message has a Hard rules section, and every limit line sits under it', () => {
    const soul = c.result.soul;
    const heading = soul.indexOf('## Hard rules');
    expect(heading).toBeGreaterThanOrEqual(0);
    for (const l of limits) {
      expect(soul.indexOf(l.text), l.id).toBeGreaterThan(heading);
    }
  });

  it('lists no limit line under Left out, because the message carries them', () => {
    expect(missingLimits).toEqual([]);
    const blocks = c.model.leftOut?.blocks ?? [];
    for (const l of limits) expect(blocks.map((b) => b.text)).not.toContain(l.text);
    for (const b of blocks) expect(b.ids[0]?.startsWith('limit.'), b.title).toBe(false);
  });

  it('holds exactly the library lines that are missing from the message, each once, in library order', () => {
    expect(c.model.leftOut === undefined).toBe(missing.length === 0);
    const group = c.model.leftOut;
    if (group === undefined) return;
    expect(group.heading).toBe('Left out');
    const texts = group.blocks.map((b) => b.text);
    expect(texts).toEqual(missing.map((l) => l.text));
    for (const line of missing) expect(countOf(texts, line.text), line.id).toBe(1);
    // Nothing the message already holds is listed.
    for (const text of texts) expect(c.result.soul.includes(text), text).toBe(false);
  });

  it('those lines are the pack rules the length pass cut to fit (result.trimmed), so the two disclosures agree', () => {
    const cut = c.result.trimmed.filter((t) => t.kind === 'pack-rule').map((t) => t.id);
    expect(missing.map((l) => l.id).sort()).toEqual([...cut].sort());
  });

  it('shows the undelivered dot summary, naming only what is missing', () => {
    const item = summaryByKey(c.model, DOT_KEY);
    if (missing.length === 0) {
      expect(item).toBeUndefined();
      return;
    }
    expect(item).toBeDefined();
    expect(item?.kind).toBe('undelivered');
    expect(item?.text).toBe(dotSentence(missingLimits.length, missingRules.length));
    // The limits are in the message, so the sentence does not name them.
    expect(item?.text).not.toContain('your limits');
  });

  it('shows exactly one dot summary line', () => {
    expect(c.model.summary.filter((s) => s.key === DOT_KEY).length).toBe(missing.length === 0 ? 0 : 1);
  });

  it('carries the record ids: the pack rule id for a rule, limit.<id> for a limit', () => {
    const blocks = c.model.leftOut?.blocks ?? [];
    expect(blocks.map((b) => b.ids)).toEqual(missing.map((l) => [l.id]));
    expect(new Set(blocks.map((b) => b.ids[0])).size).toBe(blocks.length);
  });

  it('titles a rule block "<pack label>, rule n", numbered in the order shown', () => {
    const blocks = c.model.leftOut?.blocks ?? [];
    expect(blocks.map((b) => b.title)).toEqual(shownTitles(missing));
  });

  it('lists the limits before the pack rules', () => {
    const ids = (c.model.leftOut?.blocks ?? []).map((b) => b.ids[0] ?? '');
    const firstRule = ids.findIndex((id) => id.startsWith('pack.'));
    if (firstRule === -1) return;
    expect(ids.slice(0, firstRule).every((id) => id.startsWith('limit.'))).toBe(true);
    expect(ids.slice(firstRule).every((id) => id.startsWith('pack.'))).toBe(true);
  });

  it('copies the text as plain rules blocks with no path', () => {
    for (const b of c.model.leftOut?.blocks ?? []) {
      expect(b.kind).toBe('rules');
      expect(b.path).toBeUndefined();
    }
  });

  it('keys the blocks uniquely', () => {
    const keys = (c.model.leftOut?.blocks ?? []).map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    const all = [...c.model.steps.flatMap((s) => s.groups), ...c.model.extra, ...(c.model.leftOut ? [c.model.leftOut] : [])]
      .flatMap((g) => [g.key, ...g.blocks.map((b) => b.key)]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('puts no approval (gate) line under Left out: a dot enforces approvals as Custom rules', () => {
    const gateTexts = new Set<string>(
      library.gates.flatMap((g) => [g.rulesLine.approve, g.rulesLine.forbid, g.rulesLine.auto]),
    );
    for (const b of c.model.leftOut?.blocks ?? []) {
      expect(b.ids[0]?.startsWith('gate.'), b.title).toBe(false);
      expect(gateTexts.has(b.text), b.title).toBe(false);
    }
  });

  it('uses the dot hint under Left out, not the "did not fit" hint', () => {
    expect(c.model.leftOutHint).toBe(missing.length === 0 ? undefined : DOT_LEFT_OUT_HINT);
  });
});

// The situations the real compile may or may not reach: a message that lacks exactly the lines a test
// names (K3: "only those lines are listed").
describe('ChatGPT dot: a personality message that lacks some lines', () => {
  const build = dotBuild('marty');
  const limits = limitLines(build);
  const rules = packRuleLines(build);
  const dailyLoss = limits.find((l) => l.id === 'limit.daily_loss_pct');
  const ruleTwo = rules[1];

  it('has the three limit lines and three memecoins rules to work with', () => {
    expect(limits.map((l) => l.title)).toEqual(['Max size per trade', 'Daily loss limit', 'Max trades per day']);
    expect(rules.map((l) => l.title)).toEqual(['Memecoins, rule 1', 'Memecoins, rule 2', 'Memecoins, rule 3']);
    expect(dailyLoss).toBeDefined();
    expect(ruleTwo).toBeDefined();
  });

  it('a message that holds every line: no Left out, no hint, no dot summary line', () => {
    const { model } = modelWithMissing(build, none);
    expect(model.leftOut).toBeUndefined();
    expect(model.leftOutHint).toBeUndefined();
    expect(summaryByKey(model, DOT_KEY)).toBeUndefined();
  });

  it('only the limit lines missing: those three are listed, with the label titles, and nothing else', () => {
    const { model } = modelWithMissing(build, onlyLimits);
    const blocks = model.leftOut?.blocks ?? [];
    expect(blocks.map((b) => b.text)).toEqual(limits.map((l) => l.text));
    expect(blocks.map((b) => b.title)).toEqual(['Max size per trade', 'Daily loss limit', 'Max trades per day']);
    expect(blocks.map((b) => b.ids)).toEqual(limits.map((l) => [l.id]));
    expect(summaryByKey(model, DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: your limits. Add them to your dot by hand.',
    );
    expect(model.leftOutHint).toBe(DOT_LEFT_OUT_HINT);
  });

  it('one limit line missing: only that line is listed, and the summary still says "your limits"', () => {
    const { model } = modelWithMissing(build, () => [dailyLoss as Line]);
    const blocks = model.leftOut?.blocks ?? [];
    expect(blocks.map((b) => b.text)).toEqual(['Stop trading for the day once losses reach 3% of the account, and tell the user.']);
    expect(blocks.map((b) => b.title)).toEqual(['Daily loss limit']);
    expect(summaryByKey(model, DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: your limits. Add them to your dot by hand.',
    );
  });

  it('only the pack rules missing: the three are listed and the limits are not', () => {
    const { model } = modelWithMissing(build, onlyRules);
    const blocks = model.leftOut?.blocks ?? [];
    expect(blocks.map((b) => b.text)).toEqual(rules.map((l) => l.text));
    expect(blocks.map((b) => b.title)).toEqual(['Memecoins, rule 1', 'Memecoins, rule 2', 'Memecoins, rule 3']);
    for (const l of limits) expect(blocks.map((b) => b.text)).not.toContain(l.text);
    expect(summaryByKey(model, DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: 3 pack rules. Add them to your dot by hand.',
    );
  });

  it('the middle pack rule missing: one block, numbered from 1 in the order shown, with that rule\'s text and id', () => {
    const { model } = modelWithMissing(build, () => [ruleTwo as Line]);
    const blocks = model.leftOut?.blocks ?? [];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toBe(library.packs.find((p) => p.id === 'memecoins')?.rulesLines[1]?.line);
    expect(blocks[0]?.ids).toEqual(['pack.memecoins.rule.2']);
    expect(blocks[0]?.title).toBe('Memecoins, rule 1');
    expect(summaryByKey(model, DOT_KEY)?.text).toBe('Not included on ChatGPT: 1 pack rule. Add it to your dot by hand.');
  });

  it('a limit line and a pack rule missing: both listed, the limit first, and the summary names both', () => {
    const { model } = modelWithMissing(build, (l, r) => [r[2] as Line, l[0] as Line]);
    const blocks = model.leftOut?.blocks ?? [];
    expect(blocks.map((b) => b.ids[0])).toEqual(['limit.per_trade_pct', 'pack.memecoins.rule.3']);
    expect(blocks.map((b) => b.title)).toEqual(['Max size per trade', 'Memecoins, rule 1']);
    expect(summaryByKey(model, DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: your limits and 1 pack rule. Add them to your dot by hand.',
    );
  });

  it('every limit line and every pack rule missing: all six, limits first', () => {
    const { model } = modelWithMissing(build, everything);
    const blocks = model.leftOut?.blocks ?? [];
    expect(blocks.map((b) => b.text)).toEqual([...limits, ...rules].map((l) => l.text));
    expect(summaryByKey(model, DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: your limits and 3 pack rules. Add them to your dot by hand.',
    );
  });

  it('a line the message holds twice is still not left out', () => {
    const input = inputFor(build);
    const soul = `${input.result.soul}\n${limits[0]?.text}\n${limits[0]?.text}`;
    const { model } = modelWithMissing(build, onlyRules);
    expect(model.leftOut?.blocks.map((b) => b.text)).toEqual(rules.map((l) => l.text));
    const twice = certificateModel({ ...input, result: { ...input.result, soul: soulWith(soul, [...limits, ...rules], []) } });
    expect(twice.leftOut).toBeUndefined();
  });

  it('the group, hint and summary line disappear together when nothing is missing', () => {
    for (const pick of [none, onlyLimits, onlyRules, everything]) {
      const { model, missing } = modelWithMissing(build, pick);
      expect(model.leftOut !== undefined, pick.name).toBe(missing.length > 0);
      expect(model.leftOutHint !== undefined, pick.name).toBe(missing.length > 0);
      expect(summaryByKey(model, DOT_KEY) !== undefined, pick.name).toBe(missing.length > 0);
    }
  });
});

describe('ChatGPT dot: a gate set to auto', () => {
  // The dot floors the trade gate to forbid (docs/DOT-FIX-PLAN.md section 2), so trade can no longer
  // carry the auto mechanism. These tests use send, which the dot does not floor and which has an auto
  // line, on the sales pack (daily send limit) and the support pack (refund ceiling): two limit lines.
  const autoBuild = dotBuild('marty', { packs: ['sales', 'support'], gates: { send: 'auto' } });
  const sendLabel = library.gates.find((g) => g.id === 'send')?.label ?? '?send';

  it('compiles with the send gate on auto', () => {
    expect(compile(autoBuild).gates['send']).toBe('auto');
  });

  it('keeps the Auto line first and lists the same Left out as the same build without auto', () => {
    const base = modelOfBuild(dotBuild('marty', { packs: ['sales', 'support'] }));
    const auto = modelOfBuild(autoBuild);
    const missing = missingFrom([...limitLines(autoBuild), ...packRuleLines(autoBuild)], auto.result.soul);
    const keys = auto.model.summary.map((s) => s.key);
    expect(keys).toContain('summary-auto');
    expect(base.model.summary.map((s) => s.key)).not.toContain('summary-auto');
    if (missing.length > 0) {
      expect(keys).toContain(DOT_KEY);
      expect(keys.indexOf('summary-auto')).toBeLessThan(keys.indexOf(DOT_KEY));
    }
    expect(summaryByKey(auto.model, DOT_KEY)?.text).toBe(summaryByKey(base.model, DOT_KEY)?.text);
    expect(auto.model.leftOut?.blocks.map((b) => b.text)).toEqual(base.model.leftOut?.blocks.map((b) => b.text));
    expect(auto.model.leftOutHint).toBe(base.model.leftOutHint);
  });

  it('keeps the gate lines out of Left out when the gate is auto', () => {
    const { model } = modelWithMissing(autoBuild, everything);
    const send = library.gates.find((g) => g.id === 'send');
    const texts = (model.leftOut?.blocks ?? []).map((b) => b.text);
    expect(texts.length).toBeGreaterThan(0);
    for (const line of [send?.rulesLine.auto, send?.rulesLine.approve, send?.rulesLine.forbid]) {
      expect(texts).not.toContain(line);
    }
    expect((model.leftOut?.blocks ?? []).every((b) => !(b.ids[0] ?? '').startsWith('gate.'))).toBe(true);
  });

  it('real compile: the limits are in the message, so an auto gate gets no "no limits" line', () => {
    const { result, model } = modelOfBuild(autoBuild);
    expect(limitLines(autoBuild).length).toBe(2);
    for (const l of limitLines(autoBuild)) expect(result.soul, l.id).toContain(l.text);
    expect(model.summary.map((s) => s.key)).not.toContain('summary-dot-auto');
  });

  it('a limit line missing from the message: the auto gate is tied to it in the "no limits" line', () => {
    const { model } = modelWithMissing(autoBuild, onlyLimits);
    const line = summaryByKey(model, 'summary-dot-auto');
    expect(line).toBeDefined();
    expect(line?.kind).toBe('auto');
    expect(line?.text).toBe(
      'You asked for this one to run without asking, and your dot\'s message has no limits to check it against. Request "Ask before taking action" instead, or add your limits by hand first:',
    );
    expect(line?.text).toBe(copy.certificate.summary.dotAutoNoLimits(1));
    expect(line?.items).toEqual([sendLabel]);
  });

  it('one limit line missing is enough for the "no limits" line', () => {
    const { model, limits } = modelWithMissing(autoBuild, (l) => [l[0] as Line]);
    expect(limits.length).toBe(2);
    expect(summaryByKey(model, 'summary-dot-auto')).toBeDefined();
  });

  it('only pack rules missing: no "no limits" line, since every limit line is there to check against', () => {
    const { model } = modelWithMissing(autoBuild, onlyRules);
    expect(summaryByKey(model, 'summary-dot-auto')).toBeUndefined();
    expect(summaryByKey(model, DOT_KEY)).toBeDefined();
  });

  it('nothing missing: neither the dot summary line nor the "no limits" line', () => {
    const { model } = modelWithMissing(autoBuild, none);
    expect(summaryByKey(model, 'summary-dot-auto')).toBeUndefined();
    expect(summaryByKey(model, DOT_KEY)).toBeUndefined();
  });

  it('no auto gate: no "no limits" line even when limit lines are missing', () => {
    const { model } = modelWithMissing(dotBuild('marty'), onlyLimits);
    expect(summaryByKey(model, 'summary-dot-auto')).toBeUndefined();
    expect(summaryByKey(model, DOT_KEY)).toBeDefined();
  });

  it('several auto gates on several packs, every pack rule missing: the count is all 14 and the Auto line stays', () => {
    const build = dotBuild('marty', {
      packs: ['coding', 'devops', 'personal-ops'],
      gates: { deploy: 'auto', rollback: 'auto' },
    });
    const { result } = modelOfBuild(build);
    expect(result.gates['deploy']).toBe('auto');
    expect(result.gates['rollback']).toBe('auto');
    const { model, rules } = modelWithMissing(build, onlyRules);
    expect(model.summary.map((s) => s.key)).toContain('summary-auto');
    expect(rules.length).toBe(4 + 5 + 5);
    expect(summaryByKey(model, DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: 14 pack rules. Add them to your dot by hand.',
    );
    expect((model.leftOut?.blocks ?? []).map((b) => b.text)).toEqual(rules.map((r) => r.text));
  });

  it('with every offered gate auto, on the packs that expose them, the real compile lists what its message lacks', () => {
    const packs = ['devops', 'support', 'sales']; // a build holds at most three packs
    const exposed = new Set(packs.flatMap((id) => Object.keys(library.packs.find((p) => p.id === id)?.gatesDefault ?? {})));
    const autoGates = Object.fromEntries(
      library.gates
        .filter((g) => g.soulLine.auto !== null && g.id !== 'pay' && exposed.has(g.id))
        .map((g) => [g.id, 'auto' as const]),
    );
    expect(Object.keys(autoGates).length).toBeGreaterThanOrEqual(4);
    const build = dotBuild('marty', { packs, gates: autoGates });
    const { result, model } = modelOfBuild(build);
    for (const id of Object.keys(autoGates)) expect(result.gates[id], id).toBe('auto');
    expect(model.summary.map((s) => s.key)).toContain('summary-auto');
    const want = missingFrom([...limitLines(build), ...packRuleLines(build)], result.soul);
    expect((model.leftOut?.blocks ?? []).map((b) => b.text)).toEqual(want.map((l) => l.text));
    expect(model.summary.map((s) => s.key).includes(DOT_KEY)).toBe(want.length > 0);
  });
});

describe('ChatGPT dot: the trade floor (docs/DOT-FIX-PLAN.md section 2)', () => {
  // The plan's note text, with {setting} filled by the profile's customRuleSettings label of the pick.
  const noteFor = (picked: string): string =>
    `Your setting for Trades is "${picked}". This setup doesn't let your dot place trades: it researches and proposes, and you place each trade yourself.`;
  const AUTO_LABEL = 'Take action without asking';
  const APPROVE_LABEL = 'Ask before taking action';
  const floorLines = (m: CertModel) => m.summary.filter((s) => s.kind === 'floor');
  const sendLabel = library.gates.find((g) => g.id === 'send')?.label ?? '?send';

  it('trade on auto compiles to forbid on the dot, and the build keeps the pick', () => {
    const build = dotBuild('marty', { gates: { trade: 'auto' } });
    expect(compile(build).gates['trade']).toBe('forbid');
    expect(build.gates['trade']).toBe('auto');
  });

  it('trade on approve compiles to forbid on the dot too', () => {
    const build = dotBuild('marty', { gates: { trade: 'approve' } });
    expect(compile(build).gates['trade']).toBe('forbid');
    expect(build.gates['trade']).toBe('approve');
  });

  it('the trade rule row reads Hand off to you, whatever was picked', () => {
    for (const pick of ['auto', 'approve', 'forbid'] as const) {
      const { result } = modelOfBuild(dotBuild('marty', { gates: { trade: pick } }));
      expect(result.customRules.find((r) => r.gate === 'trade')?.setting, pick).toBe('Hand off to you');
    }
  });

  it('trade on auto: one floor line in the summary names the pick, and there is no Auto line for it', () => {
    const { model } = modelOfBuild(dotBuild('marty', { gates: { trade: 'auto' } }));
    expect(floorLines(model).length).toBe(1);
    expect(floorLines(model)[0]?.text).toBe(noteFor(AUTO_LABEL));
    expect(floorLines(model)[0]?.items).toBeUndefined();
    expect(model.summary.map((s) => s.key)).not.toContain('summary-auto');
    // The line sits in the summary only, not again in the plain notes list.
    expect(model.notes.some((n) => n.kind === 'floor')).toBe(false);
    expect(model.notes.map((n) => n.text)).not.toContain(noteFor(AUTO_LABEL));
  });

  it('trade on approve: the floor line names Ask before taking action', () => {
    const { model } = modelOfBuild(dotBuild('marty', { gates: { trade: 'approve' } }));
    expect(floorLines(model).map((s) => s.text)).toEqual([noteFor(APPROVE_LABEL)]);
  });

  it('trade on forbid adds no floor line and no floor note', () => {
    const { result, model } = modelOfBuild(dotBuild('marty', { gates: { trade: 'forbid' } }));
    expect(floorLines(model)).toEqual([]);
    expect(result.noteItems.some((n) => n.kind === 'floor')).toBe(false);
  });

  it('a send gate on auto still shows its Auto line beside the trade floor line, and trade is not in it', () => {
    const build = dotBuild('marty', { packs: ['memecoins', 'sales'], gates: { trade: 'auto', send: 'auto' } });
    const { result, model } = modelOfBuild(build);
    expect(result.gates['trade']).toBe('forbid');
    expect(result.gates['send']).toBe('auto');
    expect(summaryByKey(model, 'summary-auto')?.items).toEqual([sendLabel]);
    expect(floorLines(model).map((s) => s.text)).toEqual([noteFor(AUTO_LABEL)]);
    const keys = model.summary.map((s) => s.key);
    expect(keys.indexOf('summary-auto')).toBeLessThan(keys.indexOf('summary-floor'));
  });

  it('other targets keep trade on auto and show no floor line', () => {
    const marty = library.roster.find((r) => r.id === 'marty');
    if (!marty) throw new Error('no marty');
    const build: Build = { ...migrate(marty.build, { target: 'openclaw' }), gates: { trade: 'auto' } };
    const { result, model } = modelOfBuild(build);
    expect(result.gates['trade']).toBe('auto');
    expect(floorLines(model)).toEqual([]);
    expect(result.noteItems.some((n) => n.kind === 'floor')).toBe(false);
  });
});

describe('ChatGPT dot: every starter and some other builds (the real compile)', () => {
  const builds: { id: string; build: Build }[] = [
    ...library.roster.map((r) => ({ id: `${r.id} as is`, build: dotBuild(r.id) })),
    { id: 'marty with memecoins and perps (limits merge to the stricter)', build: dotBuild('marty', { packs: ['memecoins', 'perps'] }) },
    { id: 'marty with a limit override', build: dotBuild('marty', { limits: { per_trade_pct: 0.5 } }) },
    {
      id: 'marty with memecoins, perps and a leverage override',
      build: dotBuild('marty', { packs: ['memecoins', 'perps'], limits: { leverage_cap: 3 } }),
    },
    { id: 'odds (prediction markets and spot)', build: dotBuild('odds') },
    { id: 'rook (coding)', build: dotBuild('rook') },
    { id: 'dash (sales, one limit)', build: dotBuild('dash') },
    { id: 'june (personal ops, no limits)', build: dotBuild('june') },
    { id: 'marty with no pack', build: dotBuild('marty', { packs: [], limits: {} }) },
  ];

  for (const { id, build } of builds) {
    it(`${id}: Left out is exactly the library lines its message lacks, each once, and never a limit line`, () => {
      const { result, model } = modelOfBuild(build);
      const limits = limitLines(build);
      const rules = packRuleLines(build);
      const want = missingFrom([...limits, ...rules], result.soul);
      // The compiler's effective limits are the library's merge.
      expect(Object.keys(result.limits)).toEqual(limits.map((l) => l.id.replace('limit.', '')));
      // B17: the Hard rules section carries every limit line, so none is left out.
      for (const l of limits) expect(result.soul, l.id).toContain(l.text);
      expect(want.some(isLimit)).toBe(false);
      if (want.length === 0) {
        expect(model.leftOut).toBeUndefined();
        expect(model.leftOutHint).toBeUndefined();
        expect(summaryByKey(model, DOT_KEY)).toBeUndefined();
        return;
      }
      const texts = (model.leftOut?.blocks ?? []).map((b) => b.text);
      expect(texts).toEqual(want.map((l) => l.text));
      for (const line of want) expect(countOf(texts, line.text), line.id).toBe(1);
      expect((model.leftOut?.blocks ?? []).map((b) => b.title)).toEqual(shownTitles(want));
      expect(model.leftOutHint).toBe(DOT_LEFT_OUT_HINT);
      // The summary counts match.
      expect(summaryByKey(model, DOT_KEY)?.text).toBe(dotSentence(0, want.length));
    });
  }

  it('the stricter-limit merge shows in the message: memecoins and perps give 2% a day and 5x leverage', () => {
    const { result, model } = modelOfBuild(dotBuild('marty', { packs: ['memecoins', 'perps'] }));
    const texts = (model.leftOut?.blocks ?? []).map((b) => b.text);
    for (const line of [
      'Stop trading for the day once losses reach 2% of the account, and tell the user.',
      'Never open a position above 5x leverage.',
      'Never put more than 1% of the account into one trade.',
    ]) {
      expect(result.soul).toContain(line);
      expect(texts).not.toContain(line);
    }
    expect(result.soul).not.toContain('Stop trading for the day once losses reach 3% of the account, and tell the user.');
  });

  it('a limit the user changed shows its changed value in the message, not the pack default', () => {
    const { result } = modelOfBuild(dotBuild('marty', { limits: { per_trade_pct: 0.5 } }));
    expect(result.soul).toContain('Never put more than 0.5% of the account into one trade.');
    expect(result.soul).not.toContain('Never put more than 1% of the account into one trade.');
  });
});

describe('ChatGPT dot: the summary sentence for each mix of limits and pack rules', () => {
  // The model reads the library for pack labels and rule lines, so a library copy with fewer rules
  // reaches counts the real library does not (no real pack has one rule). The message is the real
  // compile with the named lines put in or taken out.
  const sentence = (starter: string, lib: Library, pick: Parameters<typeof modelWithMissing>[1]): string | undefined =>
    summaryByKey(modelWithMissing(dotBuild(starter), pick, lib).model, DOT_KEY)?.text;

  it('limits and several pack rules: "them"', () => {
    expect(sentence('marty', library, everything)).toBe(
      'Not included on ChatGPT: your limits and 3 pack rules. Add them to your dot by hand.',
    );
  });

  it('only pack rules: the count, "them"', () => {
    expect(sentence('june', library, onlyRules)).toBe(
      'Not included on ChatGPT: 5 pack rules. Add them to your dot by hand.',
    );
  });

  it('exactly one pack rule and no limit: "1 pack rule" and "it"', () => {
    const { model } = modelWithMissing(dotBuild('june'), onlyRules, libWithRules(1));
    expect(summaryByKey(model, DOT_KEY)?.text).toBe('Not included on ChatGPT: 1 pack rule. Add it to your dot by hand.');
    expect(model.leftOut?.blocks.length).toBe(1);
    expect(model.leftOut?.blocks[0]?.title).toBe('Personal ops, rule 1');
  });

  it('limits and exactly one pack rule: "them"', () => {
    expect(sentence('marty', libWithRules(1), everything)).toBe(
      'Not included on ChatGPT: your limits and 1 pack rule. Add them to your dot by hand.',
    );
  });

  it('only limits: no pack rule count', () => {
    const { model } = modelWithMissing(dotBuild('marty'), onlyLimits, libWithRules(0));
    expect(summaryByKey(model, DOT_KEY)?.text).toBe('Not included on ChatGPT: your limits. Add them to your dot by hand.');
    expect(model.leftOut?.blocks.map((b) => b.title)).toEqual([
      'Max size per trade',
      'Daily loss limit',
      'Max trades per day',
    ]);
  });

  it('a pack rule missing but every limit line present: the sentence does not name the limits', () => {
    const text = sentence('marty', library, onlyRules);
    expect(text).toBe('Not included on ChatGPT: 3 pack rules. Add them to your dot by hand.');
    expect(text).not.toContain('limits');
  });

  it('nothing to leave out: no summary line, no Left out, no hint', () => {
    const { model } = modelWithMissing(dotBuild('june'), none, libWithRules(0));
    expect(summaryByKey(model, DOT_KEY)).toBeUndefined();
    expect(model.leftOut).toBeUndefined();
    expect(model.leftOutHint).toBeUndefined();
  });

  it('sits right after the existing undelivered line, in the undelivered place of the summary order', () => {
    const c = caseOf('marty.chatgpt-dot');
    const { limits, rules } = { limits: limitLines(c.build), rules: packRuleLines(c.build) };
    const soul = soulWith(c.result.soul, [...limits, ...rules], rules);
    const m = certificateModel({
      ...c.input,
      result: { ...c.result, soul, undelivered: [{ kind: 'roles', id: 'roles', name: 'Roles' }] },
    });
    const keys = m.summary.map((s) => s.key);
    expect(keys.indexOf('summary-undelivered')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf(DOT_KEY)).toBe(keys.indexOf('summary-undelivered') + 1);
    const ranks = m.summary.map((s) => SUMMARY_ORDER.indexOf(s.kind));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('keeps the dot line after the dropped line and before the deprecated place', () => {
    const c = caseOf('marty.chatgpt-dot');
    const limits = limitLines(c.build);
    const rules = packRuleLines(c.build);
    const soul = soulWith(c.result.soul, [...limits, ...rules], rules);
    const m = certificateModel({
      ...c.input,
      result: { ...c.result, soul },
      drops: [{ field: 'name', id: '', reason: 'cleaned' }],
    });
    const kinds = m.summary.map((s) => s.kind);
    expect(kinds).toContain('dropped');
    expect(m.summary.map((s) => s.key)).toContain(DOT_KEY);
    expect(kinds.indexOf('dropped')).toBeLessThan(kinds.indexOf('undelivered'));
  });
});

describe('the dot summary and Left out hint belong to the dot only', () => {
  it('no other profile gets the dot summary line, in any case', () => {
    for (const c of CASES) {
      if (isDot(c)) continue;
      expect(summaryByKey(c.model, DOT_KEY), c.id).toBeUndefined();
    }
  });

  it('Left out is present only on Muse, Grok and the dot', () => {
    for (const c of CASES) {
      if (['muse', 'grok', 'chatgpt-dot'].includes(c.profile.id)) continue;
      expect(c.model.leftOut, c.id).toBeUndefined();
      expect(c.model.leftOutHint, c.id).toBeUndefined();
    }
  });

  it('Left out has a hint exactly when it has a group, the dot one on the dot and the other one elsewhere', () => {
    for (const c of CASES) {
      expect(c.model.leftOutHint !== undefined, c.id).toBe(c.model.leftOut !== undefined);
      if (c.model.leftOut === undefined) continue;
      expect(c.model.leftOutHint, c.id).toBe(isDot(c) ? DOT_LEFT_OUT_HINT : PACK_LEFT_OUT_HINT);
    }
  });

  it('a dot has Left out and the summary line exactly when a limit or pack rules line is missing from its message', () => {
    for (const c of CASES.filter(isDot)) {
      const missing = missingFrom([...limitLines(c.build), ...packRuleLines(c.build)], c.result.soul);
      expect(c.model.leftOut !== undefined, c.id).toBe(missing.length > 0);
      expect(summaryByKey(c.model, DOT_KEY) !== undefined, c.id).toBe(missing.length > 0);
    }
  });

  it('no dot Left out block repeats text the dot message already holds', () => {
    for (const c of CASES.filter(isDot)) {
      for (const b of c.model.leftOut?.blocks ?? []) {
        expect(c.result.soul.includes(b.text), `${c.id}: ${b.title}`).toBe(false);
      }
    }
  });

  it('a starter whose limits and rules all fit its dot message has no Left out (dash)', () => {
    const c = caseOf('dash.chatgpt-dot');
    const lines = [...limitLines(c.build), ...packRuleLines(c.build)];
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(c.result.soul, l.id).toContain(l.text);
    expect(c.model.leftOut).toBeUndefined();
    expect(c.model.leftOutHint).toBeUndefined();
    expect(summaryByKey(c.model, DOT_KEY)).toBeUndefined();
  });

  it('Muse and Grok keep their own Left out: pack rules only, no limit blocks', () => {
    for (const c of CASES.filter((x) => x.profile.id === 'muse' || x.profile.id === 'grok')) {
      for (const b of c.model.leftOut?.blocks ?? []) {
        expect(b.ids[0]?.startsWith('pack.'), `${c.id}: ${b.title}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Left out titles on Muse and Grok
// ---------------------------------------------------------------------------

describe('Left out titles on Muse and Grok', () => {
  const museGrok = CASES.filter((c) => c.profile.id === 'muse' || c.profile.id === 'grok');

  it('has Left out cases to look at', () => {
    expect(museGrok.filter((c) => c.model.leftOut !== undefined).length).toBeGreaterThanOrEqual(8);
  });

  it('every title in a Left out group is unique, on every Muse and Grok golden', () => {
    for (const c of museGrok) {
      const titles = (c.model.leftOut?.blocks ?? []).map((b) => b.title);
      expect(new Set(titles).size, `${c.id}: ${titles.join(' | ')}`).toBe(titles.length);
    }
  });

  it('a title is never the bare pack label', () => {
    const labels = new Set(library.packs.map((p) => p.label));
    for (const c of museGrok) {
      for (const b of c.model.leftOut?.blocks ?? []) expect(labels.has(b.title), `${c.id}: ${b.title}`).toBe(false);
    }
  });

  it('every title is "<pack label>, rule n" for the pack of its rule', () => {
    for (const c of museGrok) {
      for (const b of c.model.leftOut?.blocks ?? []) {
        const id = b.ids[0] ?? '';
        const pack = library.packs.find((p) => p.rulesLines.some((r) => r.id === id));
        expect(pack, `${c.id}: ${id}`).toBeDefined();
        expect(b.title, c.id).toMatch(new RegExp(`^${pack?.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, rule [1-9][0-9]*$`));
      }
    }
  });

  it('numbers each pack from 1, in the order shown (odds: two packs)', () => {
    const odds = caseOf('odds.muse');
    const titles = (odds.model.leftOut?.blocks ?? []).map((b) => b.title);
    const expected = odds.build.packs.flatMap((id) => {
      const pack = library.packs.find((p) => p.id === id);
      return (pack?.rulesLines ?? []).map((_, i) => `${pack?.label}, rule ${i + 1}`);
    });
    expect(odds.build.packs.length).toBe(2);
    expect(titles).toEqual(expected);
  });

  it('lists each cut rule once on the goldens, so the numbers match the pack rule ids', () => {
    for (const c of museGrok) {
      const ids = (c.model.leftOut?.blocks ?? []).map((b) => b.ids[0] ?? '');
      expect(new Set(ids).size, c.id).toBe(ids.length);
      const cut = new Set(c.result.trimmed.filter((t) => t.kind === 'pack-rule').map((t) => t.id));
      const left = (c.model.leftOut?.blocks ?? []).length;
      expect(left, c.id).toBeLessThanOrEqual(cut.size);
    }
  });

  describe('synthetic cuts', () => {
    const rule = (n: number, extra: Partial<Trimmed> = {}): Trimmed => {
      const line = library.packs.find((p) => p.id === 'personal-ops')?.rulesLines[n];
      if (!line) throw new Error(`no personal-ops rule ${n}`);
      return { kind: 'pack-rule', id: line.id, text: line.line, pack: 'personal-ops', ...extra };
    };

    it('stays unique when the cut rules are not next to each other in the pack', () => {
      for (const id of ['june.muse', 'june.grok']) {
        const m = modelWithResult(caseOf(id), { trimmed: [rule(0), rule(2), rule(4)] });
        const titles = (m.leftOut?.blocks ?? []).map((b) => b.title);
        expect(titles.length, id).toBe(3);
        expect(new Set(titles).size, id).toBe(3);
        for (const t of titles) expect(t, id).toMatch(/^Personal ops, rule \d+$/);
      }
    });

    it('numbers in the order shown, not by pack position (engineer reading, flagged in the F3a report)', () => {
      const m = modelWithResult(caseOf('june.muse'), { trimmed: [rule(0), rule(2), rule(4)] });
      expect((m.leftOut?.blocks ?? []).map((b) => b.title)).toEqual([
        'Personal ops, rule 1',
        'Personal ops, rule 2',
        'Personal ops, rule 3',
      ]);
      // The ids still say which rule each is.
      expect((m.leftOut?.blocks ?? []).map((b) => b.ids[0])).toEqual([rule(0).id, rule(2).id, rule(4).id]);
    });

    it('restarts the number for each pack', () => {
      const other = library.packs.find((p) => p.id === 'coding');
      const line = other?.rulesLines[0];
      const m = modelWithResult(caseOf('june.muse'), {
        trimmed: [
          rule(0),
          { kind: 'pack-rule', id: line?.id ?? '', text: line?.line ?? '', pack: 'coding' },
          rule(1),
        ],
      });
      expect((m.leftOut?.blocks ?? []).map((b) => b.title)).toEqual([
        'Personal ops, rule 1',
        'Coding, rule 1',
        'Personal ops, rule 2',
      ]);
    });

    it('keeps the record id as the title when the pack is not in the library, and stays unique', () => {
      const m = modelWithResult(caseOf('june.grok'), {
        trimmed: [
          { kind: 'pack-rule', id: 'pack.zzz.rule.1', text: 'a', pack: 'zzz' },
          { kind: 'pack-rule', id: 'pack.zzz.rule.2', text: 'b', pack: 'zzz' },
          { kind: 'pack-rule', id: 'pack.orphan.rule.1', text: 'c' },
        ],
      });
      expect((m.leftOut?.blocks ?? []).map((b) => b.title)).toEqual([
        'pack.zzz.rule.1',
        'pack.zzz.rule.2',
        'pack.orphan.rule.1',
      ]);
    });

    it('stays unique when two role files cut the same rule (the model lists one block per cut, each with its path)', () => {
      const m = modelWithResult(caseOf('june.grok'), {
        trimmed: [
          rule(0, { role: 'triager', path: 'workspace-triager/AGENTS.md' }),
          rule(0, { role: 'scheduler', path: 'workspace-scheduler/AGENTS.md' }),
          rule(1),
        ],
      });
      const blocks = m.leftOut?.blocks ?? [];
      expect(blocks.length).toBe(3);
      expect(new Set(blocks.map((b) => b.title)).size).toBe(3);
      expect(blocks.map((b) => b.path)).toEqual([
        'workspace-triager/AGENTS.md',
        'workspace-scheduler/AGENTS.md',
        undefined,
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. The length meter's near flag
// ---------------------------------------------------------------------------

describe('length meter: near the cap', () => {
  const withLength = (c: Case, length: number): CertModel => modelWithResult(c, { length });

  it('the hint text is the library text (guard: the doc still says it)', () => {
    const doc = readFileSync(new URL('../docs/Build-a-Muse-Compiler-Library-v1.md', import.meta.url), 'utf8');
    expect(doc).toContain(`"${METER_HINT}"`);
    expect(doc).toContain('length > 3,200');
  });

  it('is not near at cap - 401, on every profile and plan', () => {
    for (const c of CASES) {
      const m = withLength(c, c.input.cap - NEAR - 1);
      expect(m.meter.near, c.id).toBe(false);
      expect(m.meter.hint, c.id).toBeUndefined();
    }
  });

  it('is near at cap - 399, with the library hint', () => {
    for (const c of CASES) {
      const m = withLength(c, c.input.cap - NEAR + 1);
      expect(m.meter.near, c.id).toBe(true);
      expect(m.meter.hint, c.id).toBe(METER_HINT);
    }
  });

  it('is not near at cap - 400: the library line is "length > 3,200", strictly over', () => {
    for (const c of CASES) {
      const m = withLength(c, c.input.cap - NEAR);
      expect(m.meter.near, c.id).toBe(false);
      expect(m.meter.hint, c.id).toBeUndefined();
    }
  });

  it('is near at the cap itself: full is not over', () => {
    for (const c of CASES) {
      const m = withLength(c, c.input.cap);
      expect(m.meter.near, c.id).toBe(true);
      expect(m.meter.hint, c.id).toBe(METER_HINT);
      expect(m.summary.some((s) => s.kind === 'over'), c.id).toBe(false);
    }
  });

  it('is not near at cap + 1, which is over', () => {
    for (const c of CASES) {
      const m = withLength(c, c.input.cap + 1);
      expect(m.meter.near, c.id).toBe(false);
      expect(m.meter.hint, c.id).toBeUndefined();
      expect(m.summary.filter((s) => s.kind === 'over').length, c.id).toBe(1);
    }
  });

  it('is not near far below the cap, or at length 0', () => {
    for (const c of CASES) {
      expect(withLength(c, 0).meter.near, c.id).toBe(false);
      expect(withLength(c, 100).meter.hint, c.id).toBeUndefined();
    }
  });

  it('near and over never both hold', () => {
    const c = caseOf('marty.chatgpt-dot');
    for (let delta = -450; delta <= 50; delta += 1) {
      const m = withLength(c, c.input.cap + delta);
      const over = m.summary.some((s) => s.kind === 'over');
      expect(m.meter.near && over, `delta ${delta}`).toBe(false);
      expect(m.meter.near, `delta ${delta}`).toBe(delta > -NEAR && delta <= 0);
    }
  });

  it('matches the library 3,200 amber line on the dot, whose cap is 3,600', () => {
    const c = caseOf('marty.chatgpt-dot');
    expect(c.input.cap).toBe(3600);
    expect(withLength(c, AMBER_LINE).meter.near).toBe(false);
    expect(withLength(c, AMBER_LINE + 1).meter.near).toBe(true);
  });

  it('follows the cap the screen passes in, not the profile cap', () => {
    const c = caseOf('marty.chatgpt-dot');
    const len = c.result.length;
    expect(certificateModel({ ...c.input, cap: len + 401 }).meter.near).toBe(false);
    expect(certificateModel({ ...c.input, cap: len + 399 }).meter.near).toBe(true);
    expect(certificateModel({ ...c.input, cap: len }).meter.near).toBe(true);
    expect(certificateModel({ ...c.input, cap: len - 1 }).meter.near).toBe(false);
  });

  it('keeps the length, the cap and the label with the flag', () => {
    const c = caseOf('marty.chatgpt-dot');
    const m = withLength(c, 3300);
    expect(m.meter.length).toBe(3300);
    expect(m.meter.cap).toBe(3600);
    expect(m.meter.label).toContain('3300');
    expect(m.meter.label).toContain('3600');
    expect(m.meter.near).toBe(true);
  });

  it('flags the real goldens that sit near their cap (marty on Muse, within 400 of 4,000 since the B18 risk 4 line)', () => {
    const c = caseOf('marty.muse');
    expect(c.result.length).toBeGreaterThan(c.input.cap - NEAR);
    expect(c.result.length).toBeLessThanOrEqual(c.input.cap);
    expect(c.model.meter.near).toBe(true);
    expect(c.model.meter.hint).toBe(METER_HINT);
  });

  it('does not flag a golden well under its cap (vera on the dot)', () => {
    const c = caseOf('vera.chatgpt-dot');
    expect(c.result.length).toBeLessThan(c.input.cap - NEAR);
    expect(c.model.meter.near).toBe(false);
    expect(c.model.meter.hint).toBeUndefined();
  });

  it('on every golden, near is exactly "within 400 under the cap and not over"', () => {
    for (const c of CASES) {
      const within = c.result.length > c.input.cap - NEAR && c.result.length <= c.input.cap;
      expect(c.model.meter.near, c.id).toBe(within);
      expect(c.model.meter.hint !== undefined, c.id).toBe(within);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. No "verify:" in any copyable block
// ---------------------------------------------------------------------------

describe('no "verify:" in block text', () => {
  const VERIFY = /verify:/i;

  it('no step block, extra block or Left out block carries a verify: line, on any case', () => {
    for (const c of CASES) {
      const blocks = [...groupsOf(c.model), ...(c.model.leftOut !== undefined ? [c.model.leftOut] : [])].flatMap(
        (g) => g.blocks,
      );
      expect(blocks.length, c.id).toBeGreaterThan(0);
      for (const b of blocks) {
        expect(VERIFY.test(b.text), `${c.id}: ${b.title}`).toBe(false);
        expect(VERIFY.test(b.title), `${c.id}: ${b.title}`).toBe(false);
      }
    }
  });

  it('no Left out block carries one on a dot or when a verify note is in the result', () => {
    const c = caseOf('marty.chatgpt-dot');
    expect(c.result.noteItems.some((n) => n.kind === 'verify')).toBe(true);
    for (const b of c.model.leftOut?.blocks ?? []) expect(VERIFY.test(b.text), b.title).toBe(false);
  });

  it('the Custom Rules rows, group leads and notes carry none either', () => {
    for (const c of CASES) {
      for (const s of c.model.steps) {
        for (const row of s.customRules?.rows ?? []) {
          expect(VERIFY.test(`${row.action} ${row.setting}`), `${c.id}: ${row.gate}`).toBe(false);
        }
        expect(VERIFY.test(s.customRules?.note?.text ?? ''), c.id).toBe(false);
        for (const g of s.groups) expect(VERIFY.test(g.lead?.text ?? ''), c.id).toBe(false);
      }
      for (const note of c.model.notes) expect(VERIFY.test(note.text), `${c.id}: ${note.id}`).toBe(false);
    }
  });

  it('the verify notes sit under Still checking without the prefix', () => {
    for (const c of CASES) {
      for (const note of c.model.stillChecking) expect(VERIFY.test(note.text), `${c.id}: ${note.id}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Rules that never bend
// ---------------------------------------------------------------------------

describe('no em dashes in what this slice shows', () => {
  it('Left out, the dot summary, the hints and the meter hint carry no em or en dash', () => {
    const seen: string[] = [];
    for (const c of CASES) {
      seen.push(...(c.model.leftOut?.blocks ?? []).flatMap((b) => [b.title, b.text]));
      seen.push(c.model.leftOutHint ?? '', c.model.meter.hint ?? '');
      seen.push(...c.model.summary.map((s) => s.text));
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const text of seen) {
      expect(text.includes(EM_DASH), text).toBe(false);
      expect(text.includes(EN_DASH), text).toBe(false);
    }
    expect(METER_HINT.includes(EM_DASH)).toBe(false);
  });
});
