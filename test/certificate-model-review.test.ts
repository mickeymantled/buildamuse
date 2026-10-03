// Certificate model review (M4 fix slice F3a): src/ui/certificate/model.ts after the review fixes.
//
// Three behaviors, plus a guard:
//   1. The ChatGPT dot cannot carry limit lines or pack rules lines (rulesDelivery custom-rules), so
//      the certificate says so in the summary and lists each one under Left out, once.
//   2. On Muse and Grok the Left out blocks are titled "<pack label>, rule n" and the titles are unique.
//   3. The length meter turns "near" within 400 characters under the cap, with the library's hint.
//   4. No copyable block carries a "verify:" line.
//
// Expected text comes from the library tables (limits, packs, gates, roster) and the library doc,
// never from running the model and copying what it printed. The strings that are not library text
// (the summary sentence, the two Left out hints) are the fixed lines from the F3a engineer report.
// Where a test needs a situation the goldens do not reach, it hands the model a synthetic input:
// the compiled result with one field replaced, or a library copy with fewer pack rules.

import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { capOf, resolveProfile } from '../src/compiler/profile.js';
import type { Build, CompileResult, Library, Profile, Trimmed } from '../src/compiler/types.js';
import { certificateModel, starterIdOf } from '../src/ui/certificate/model.js';
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
const DOT_LEFT_OUT_HINT = "A dot's Custom rules hold only your approvals. Add these by hand if you want them.";
const PACK_LEFT_OUT_HINT = 'These rules did not fit. Add them by hand if you want them.';

const DOT_KEY = 'summary-undelivered-dot';

const SUMMARY_ORDER: readonly SummaryKind[] = [
  'auto',
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
// What the dot cannot carry, derived from the library tables
// ---------------------------------------------------------------------------

interface Line {
  id: string; // limit.<id> or the pack rule id
  text: string;
  title: string; // the expected block title
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

// ---------------------------------------------------------------------------
// 1. ChatGPT dot: the undelivered dot summary and the Left out group
// ---------------------------------------------------------------------------

describe('ChatGPT dot: marty', () => {
  const c = caseOf('marty.chatgpt-dot');
  const limits = limitLines(c.build);
  const rules = packRuleLines(c.build);

  it('has limits and pack rules to leave out (the build under test is the one with both)', () => {
    expect(c.build.packs).toEqual(['memecoins']);
    expect(limits.length).toBe(3);
    expect(rules.length).toBe(library.packs.find((p) => p.id === 'memecoins')?.rulesLines.length);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('shows the undelivered dot summary, naming the limits and the pack rule count', () => {
    const item = summaryByKey(c.model, DOT_KEY);
    expect(item).toBeDefined();
    expect(item?.kind).toBe('undelivered');
    expect(item?.text).toBe(
      `Not included on ChatGPT: your limits and ${rules.length} pack rules. Add them to your dot by hand.`,
    );
  });

  it('shows exactly one dot summary line', () => {
    expect(c.model.summary.filter((s) => s.key === DOT_KEY).length).toBe(1);
  });

  it('holds every effective limit line and every pack rules line under Left out, each exactly once', () => {
    const group = c.model.leftOut;
    expect(group).toBeDefined();
    expect(group?.heading).toBe('Left out');
    const texts = (group?.blocks ?? []).map((b) => b.text);
    const want = [...limits, ...rules];
    expect(texts.length).toBe(want.length);
    for (const line of want) {
      expect(countOf(texts, line.text), line.id).toBe(1);
    }
    expect([...texts].sort()).toEqual(want.map((l) => l.text).sort());
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

  it('carries the record ids: limit.<id> for a limit, the pack rule id for a rule', () => {
    const blocks = c.model.leftOut?.blocks ?? [];
    expect(blocks.map((b) => b.ids)).toEqual([...limits, ...rules].map((l) => [l.id]));
    expect(new Set(blocks.map((b) => b.ids[0])).size).toBe(blocks.length);
  });

  it('titles a limit block with the library limit label and a rule block "<pack label>, rule n"', () => {
    const blocks = c.model.leftOut?.blocks ?? [];
    expect(blocks.map((b) => b.title)).toEqual([...limits, ...rules].map((l) => l.title));
    expect(blocks.slice(0, 3).map((b) => b.title)).toEqual([
      'Max size per trade',
      'Daily loss limit',
      'Max trades per day',
    ]);
    expect(blocks.slice(3).map((b) => b.title)).toEqual(['Memecoins, rule 1', 'Memecoins, rule 2', 'Memecoins, rule 3']);
  });

  it('lists the limits first, then the pack rules (engineer reading)', () => {
    const ids = (c.model.leftOut?.blocks ?? []).map((b) => b.ids[0] ?? '');
    const firstRule = ids.findIndex((id) => id.startsWith('pack.'));
    expect(firstRule).toBe(limits.length);
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
    const all = [...c.model.steps.flatMap((s) => s.groups), ...c.model.extra, c.model.leftOut as CertGroup]
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
    expect(c.model.leftOutHint).toBe(DOT_LEFT_OUT_HINT);
  });

  it('shows no trimmed-pack summary line, since a dot cuts no pack rule', () => {
    expect(c.model.summary.some((s) => s.key.startsWith('summary-trimmed-') && s.key !== 'summary-trimmed-other')).toBe(
      false,
    );
  });
});

describe('ChatGPT dot: a gate set to auto', () => {
  it('still shows the undelivered dot summary and the same Left out, with the Auto line first', () => {
    const base = caseOf('marty.chatgpt-dot');
    const auto = modelOfBuild(dotBuild('marty', { gates: { trade: 'auto' } }));
    expect(auto.result.gates['trade']).toBe('auto');
    const keys = auto.model.summary.map((s) => s.key);
    expect(keys).toContain('summary-auto');
    expect(keys).toContain(DOT_KEY);
    expect(keys.indexOf('summary-auto')).toBeLessThan(keys.indexOf(DOT_KEY));
    expect(summaryByKey(auto.model, DOT_KEY)?.text).toBe(summaryByKey(base.model, DOT_KEY)?.text);
    expect(auto.model.leftOut?.blocks.map((b) => b.text)).toEqual(base.model.leftOut?.blocks.map((b) => b.text));
    expect(auto.model.leftOutHint).toBe(DOT_LEFT_OUT_HINT);
  });

  it('keeps the gate lines out of Left out when the gate is auto', () => {
    const auto = modelOfBuild(dotBuild('marty', { gates: { trade: 'auto' } }));
    const trade = library.gates.find((g) => g.id === 'trade');
    const texts = (auto.model.leftOut?.blocks ?? []).map((b) => b.text);
    for (const line of [trade?.rulesLine.auto, trade?.rulesLine.approve, trade?.rulesLine.forbid]) {
      expect(texts).not.toContain(line);
    }
    expect((auto.model.leftOut?.blocks ?? []).every((b) => !(b.ids[0] ?? '').startsWith('gate.'))).toBe(true);
  });

  it('still shows both with several auto gates on several packs', () => {
    const build = dotBuild('marty', {
      packs: ['coding', 'devops', 'personal-ops'],
      gates: { deploy: 'auto', rollback: 'auto' },
    });
    const { result, model } = modelOfBuild(build);
    expect(result.gates['deploy']).toBe('auto');
    expect(result.gates['rollback']).toBe('auto');
    expect(model.summary.map((s) => s.key)).toContain('summary-auto');
    const rules = packRuleLines(build);
    expect(rules.length).toBe(4 + 5 + 5);
    expect(summaryByKey(model, DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: 14 pack rules. Add them to your dot by hand.',
    );
    expect((model.leftOut?.blocks ?? []).map((b) => b.text)).toEqual(rules.map((r) => r.text));
  });

  it('shows the dot summary with every offered gate auto, on the packs that expose them', () => {
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
    expect(model.summary.map((s) => s.key)).toContain(DOT_KEY);
    const want = [...limitLines(build), ...packRuleLines(build)];
    expect((model.leftOut?.blocks ?? []).map((b) => b.text)).toEqual(want.map((l) => l.text));
  });
});

describe('ChatGPT dot: every starter and some other builds', () => {
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
    it(`${id}: Left out is exactly the limit lines and pack rules lines, each once`, () => {
      const { result, model } = modelOfBuild(build);
      const limits = limitLines(build);
      const rules = packRuleLines(build);
      const want = [...limits, ...rules];
      // The compiler's effective limits are the library's merge.
      expect(Object.keys(result.limits)).toEqual(limits.map((l) => l.id.replace('limit.', '')));
      if (want.length === 0) {
        expect(model.leftOut).toBeUndefined();
        expect(model.leftOutHint).toBeUndefined();
        expect(summaryByKey(model, DOT_KEY)).toBeUndefined();
        return;
      }
      const texts = (model.leftOut?.blocks ?? []).map((b) => b.text);
      expect(texts.length).toBe(want.length);
      expect([...texts].sort()).toEqual(want.map((l) => l.text).sort());
      for (const line of want) expect(countOf(texts, line.text), line.id).toBe(1);
      expect((model.leftOut?.blocks ?? []).map((b) => b.title)).toEqual(want.map((l) => l.title));
      expect(model.leftOutHint).toBe(DOT_LEFT_OUT_HINT);
      // The summary counts match.
      const what = [
        ...(limits.length > 0 ? ['your limits'] : []),
        ...(rules.length > 0 ? [`${rules.length} pack ${rules.length === 1 ? 'rule' : 'rules'}`] : []),
      ].join(' and ');
      const pronoun = limits.length > 0 || rules.length !== 1 ? 'them' : 'it';
      expect(summaryByKey(model, DOT_KEY)?.text).toBe(
        `Not included on ChatGPT: ${what}. Add ${pronoun} to your dot by hand.`,
      );
    });
  }

  it('the stricter-limit merge shows in the text: memecoins and perps give 2% a day and 5x leverage', () => {
    const { model } = modelOfBuild(dotBuild('marty', { packs: ['memecoins', 'perps'] }));
    const texts = (model.leftOut?.blocks ?? []).map((b) => b.text);
    expect(texts).toContain('Stop trading for the day once losses reach 2% of the account, and tell the user.');
    expect(texts).toContain('Never open a position above 5x leverage.');
    expect(texts).toContain('Never put more than 1% of the account into one trade.');
    expect(texts).not.toContain('Stop trading for the day once losses reach 3% of the account, and tell the user.');
  });

  it('a limit the user changed shows its changed value, not the pack default', () => {
    const { model } = modelOfBuild(dotBuild('marty', { limits: { per_trade_pct: 0.5 } }));
    const texts = (model.leftOut?.blocks ?? []).map((b) => b.text);
    expect(texts).toContain('Never put more than 0.5% of the account into one trade.');
    expect(texts).not.toContain('Never put more than 1% of the account into one trade.');
  });
});

describe('ChatGPT dot: the summary sentence for each mix of limits and pack rules', () => {
  // The model reads the library for pack labels and rule lines, so a library copy with fewer
  // rules reaches counts the real library does not (no real pack has one rule).
  const model = (starter: string, lib: Library): CertModel => {
    const build = dotBuild(starter);
    return certificateModel(inputFor(build), lib);
  };

  it('limits and several pack rules: "them"', () => {
    expect(summaryByKey(model('marty', library), DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: your limits and 3 pack rules. Add them to your dot by hand.',
    );
  });

  it('only pack rules: the count, "them"', () => {
    expect(summaryByKey(model('june', library), DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: 5 pack rules. Add them to your dot by hand.',
    );
  });

  it('exactly one pack rule and no limit: "1 pack rule" and "it"', () => {
    const m = model('june', libWithRules(1));
    expect(summaryByKey(m, DOT_KEY)?.text).toBe('Not included on ChatGPT: 1 pack rule. Add it to your dot by hand.');
    expect(m.leftOut?.blocks.length).toBe(1);
    expect(m.leftOut?.blocks[0]?.title).toBe('Personal ops, rule 1');
  });

  it('limits and exactly one pack rule: "them"', () => {
    expect(summaryByKey(model('marty', libWithRules(1)), DOT_KEY)?.text).toBe(
      'Not included on ChatGPT: your limits and 1 pack rule. Add them to your dot by hand.',
    );
  });

  it('only limits: no pack rule count', () => {
    const m = model('marty', libWithRules(0));
    expect(summaryByKey(m, DOT_KEY)?.text).toBe('Not included on ChatGPT: your limits. Add them to your dot by hand.');
    expect(m.leftOut?.blocks.map((b) => b.title)).toEqual([
      'Max size per trade',
      'Daily loss limit',
      'Max trades per day',
    ]);
  });

  it('nothing to leave out: no summary line, no Left out, no hint', () => {
    const m = model('june', libWithRules(0));
    expect(summaryByKey(m, DOT_KEY)).toBeUndefined();
    expect(m.leftOut).toBeUndefined();
    expect(m.leftOutHint).toBeUndefined();
  });

  it('sits right after the existing undelivered line, in the undelivered place of the summary order', () => {
    const c = caseOf('marty.chatgpt-dot');
    const m = modelWithResult(c, { undelivered: [{ kind: 'roles', id: 'roles', name: 'Roles' }] });
    const keys = m.summary.map((s) => s.key);
    expect(keys.indexOf('summary-undelivered')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf(DOT_KEY)).toBe(keys.indexOf('summary-undelivered') + 1);
    const ranks = m.summary.map((s) => SUMMARY_ORDER.indexOf(s.kind));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('keeps the dot line after the dropped line and before the deprecated place', () => {
    const c = caseOf('marty.chatgpt-dot');
    const m = modelWithResult(c, {}, { drops: [{ field: 'name', id: '', reason: 'cleaned' }] });
    const kinds = m.summary.map((s) => s.kind);
    expect(kinds).toContain('dropped');
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

  it('a dot with packs always has Left out and the summary line; a dot with no pack has neither', () => {
    for (const c of CASES.filter(isDot)) {
      const hasStuff = limitLines(c.build).length + packRuleLines(c.build).length > 0;
      expect(c.model.leftOut !== undefined, c.id).toBe(hasStuff);
      expect(summaryByKey(c.model, DOT_KEY) !== undefined, c.id).toBe(hasStuff);
    }
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

  it('flags the real goldens that sit near their cap (marty on Muse, 3,971 of 4,000)', () => {
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
