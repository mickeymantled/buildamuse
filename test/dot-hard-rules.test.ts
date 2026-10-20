// Dot hard rules and the risk 4 line (M5 slice K1 and K2; QUESTIONS B17, B18, W37 and W40).
//
// B17: the ChatGPT dot's spoken personality message gets a "## Hard rules" section right after the
// line that points at the Custom Rules in Settings. It carries the build's limit lines and every pack
// rules line, and no gate rules line (the Custom Rules table enforces the gates, the section is the
// prose backstop). The soul cap of 3,600 and the B1 tiers still apply: Tier A cuts every author pack
// rules line from this artifact when the soul is over the cap, and every cut is reported in
// result.trimmed so the certificate can disclose it.
//
// B18: the risk 4 stat line is Brian's full text. "Same as 3, plus: ..." is gone.
//
// Where the expected values come from. Nothing here is copied from compiler output.
//   - The heading, the outrank line and the risk 4 line: Brian's words in B17 and B18, written out
//     below. The heading is also checked against the profile template in profiles.json, and the risk 4
//     line against stats.json.
//   - The limit lines: limits.json (rulesTemplate with the value filled in) and the stricter-value
//     merge of the pack defaults, merged here from packs/*.json and limits.json, then the user's values.
//   - The pack rules lines, their order and which are Brian's (origin "brief", never cut): packs/*.json.
//   - The gate rules lines that must stay out: gates.json (every rulesLine of every setting).
//   - The section headings that bracket the section: chassis.json.
//   - Which builds get cut: a copy of the library whose dot cap is raised past any soul gives the
//     pre-length soul. Over 3,600 means every author pack rules line is cut (Tier A is all or
//     nothing) and nothing else about the rules changes; at or under 3,600 the soul is untouched.
//   - The nine starters' expected sections are hand-written from their packs and limit defaults. They
//     move together with ROSTER_STAGES in passes.test.ts if a library edit changes a stage.

import { describe, expect, it } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { traceBundle } from '../src/compiler/trace.js';
import type {
  Build,
  CompileResult,
  Library,
  Profile,
  TargetId,
  TracedLine,
  WorkflowPack,
} from '../src/compiler/types.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---------------------------------------------------------------------------------------------
// Brian's words (B17, B18). Straight ASCII quotes throughout.

const HARD_RULES = '## Hard rules';
const OUTRANK = 'Your custom rules in Settings outrank anything I say in chat.';
const RISK_4 =
  "I know it's risky. Don't say so. Help me size it and time it. Flag only rugs, honeypots and concentration. Never moralize. The only two words you say against a trade are 'chasing' and 'rug'.";
const DOT_CAP = 3600;
const EM_DASH = String.fromCharCode(0x2014);

// ---------------------------------------------------------------------------------------------
// Library readers.

function profileOf(id: string, lib: Library = library): Profile {
  const found = lib.targets.profiles.find((p) => p.id === id);
  if (!found) throw new Error(`no profile ${id}`);
  return found;
}

function headingText(section: string): string {
  const found = library.chassis.headings.find((h) => h.section === section);
  if (!found) throw new Error(`no chassis heading for ${section}`);
  return found.text;
}

const MEMORY_HEADING = headingText('memory');
const EXAMPLES_HEADING = headingText('examples');
const CLASH_HEADING = headingText('clash');

function packsOf(build: Build, lib: Library = library): WorkflowPack[] {
  return build.packs.map((id) => {
    const pack = lib.packs.find((p) => p.id === id);
    if (!pack) throw new Error(`no pack ${id}`);
    return pack;
  });
}

// The effective limits, merged here from the tables: each pack's defaults, the stricter value where
// two packs share a limit (limits.json says which direction is stricter), then the user's own values.
function limitValues(build: Build, lib: Library = library): Map<string, number> {
  const out = new Map<string, number>();
  for (const pack of packsOf(build, lib)) {
    for (const [id, value] of Object.entries(pack.limitsDefault)) {
      const record = lib.limits.find((l) => l.id === id);
      if (!record) throw new Error(`no limit ${id}`);
      const current = out.get(id);
      if (current === undefined) out.set(id, value);
      else out.set(id, record.stricter === 'higher' ? Math.max(current, value) : Math.min(current, value));
    }
  }
  for (const [id, value] of Object.entries(build.limits)) out.set(id, value);
  return out;
}

interface Expected {
  id: string;
  text: string; // with the bullet
  kind: 'limit' | 'pack-rule';
}

// The limit lines, in limits.json order, filled from the templates.
function limitLines(build: Build, lib: Library = library): Expected[] {
  const values = limitValues(build, lib);
  return lib.limits
    .filter((l) => values.has(l.id))
    .map((l) => ({
      id: `limit.${l.id}`,
      text: `- ${l.rulesTemplate.replaceAll('{value}', String(values.get(l.id)))}`,
      kind: 'limit' as const,
    }));
}

interface PackRule {
  id: string;
  line: string;
  pack: string;
  brief: boolean; // Brian's own text, never cut
}

// Every pack rules line of the build's packs, in build order then library order.
function packRules(build: Build, lib: Library = library): PackRule[] {
  return packsOf(build, lib).flatMap((pack) =>
    pack.rulesLines.map((r) => ({ id: r.id, line: r.line, pack: pack.id, brief: r.origin === 'brief' })),
  );
}

// ---------------------------------------------------------------------------------------------
// Compiling.

// A copy of `lib` whose dot cap is raised past any soul, so the length pass never runs.
const uncappedCache = new Map<Library, Library>();
function uncapped(lib: Library): Library {
  const cached = uncappedCache.get(lib);
  if (cached) return cached;
  const clone: Library = structuredClone(lib);
  profileOf('chatgpt-dot', clone).lengthCap = 1_000_000;
  uncappedCache.set(lib, clone);
  return clone;
}

function dotBuild(starter: string): Build {
  const entry = library.roster.find((r) => r.id === starter);
  if (!entry) throw new Error(`no starter ${starter}`);
  return migrate(entry.build, { target: 'chatgpt', mode: 'dot' });
}

const STARTERS = library.roster.map((r) => r.id);

// The hard-rules section of a compiled soul: the heading line and the lines up to the next blank.
function sectionOf(result: CompileResult): { heading: TracedLine; items: TracedLine[] } | null {
  const at = result.soulLines.findIndex((l) => l.kind === 'heading' && l.text === HARD_RULES);
  if (at < 0) return null;
  const items: TracedLine[] = [];
  for (const line of result.soulLines.slice(at + 1)) {
    if (line.kind === 'blank') break;
    items.push(line);
  }
  return { heading: result.soulLines[at], items };
}

const GATE_RULE_TEXTS = new Set(library.gates.flatMap((g) => Object.values(g.rulesLine)));

// Everything B17 says about one dot compile, checked against the tables. Returns the result.
function checkDot(build: Build, label: string, lib: Library = library): CompileResult {
  const result = compile(build, lib);
  const profile = profileOf('chatgpt-dot', lib);
  const cap = profile.lengthCap as number;
  expect(result.profile, label).toBe('chatgpt-dot');
  expect(() => traceBundle(result, lib), `${label}: trace`).not.toThrow();
  expect(result.soul.includes(EM_DASH), `${label}: no em dash`).toBe(false);

  // What the length pass should have done, from the pre-length soul.
  const pre = compile(build, uncapped(lib));
  const rules = packRules(build, lib);
  const author = rules.filter((r) => !r.brief);
  const cutIds = result.trimmed.filter((t) => t.kind === 'pack-rule').map((t) => t.id);
  if (pre.length <= cap) {
    expect(result.soul, `${label}: a soul at or under ${cap} is left alone`).toBe(pre.soul);
    expect(result.trimmed, `${label}: nothing trimmed`).toEqual([]);
    expect(cutIds).toEqual([]);
  } else {
    expect(cutIds, `${label}: Tier A cuts every author pack rules line, in soul order`).toEqual(
      author.map((r) => r.id),
    );
  }

  // Every Tier A cut is reported with the library text and its pack, and is gone from the soul.
  const soulIds = result.soulLines.map((l) => l.id);
  for (const cut of result.trimmed.filter((t) => t.kind === 'pack-rule')) {
    const rule = rules.find((r) => r.id === cut.id);
    expect(rule, `${label}: ${cut.id} is a rules line of the build's packs`).toBeDefined();
    expect(rule!.brief, `${label}: Brian's rule ${cut.id} is never cut`).toBe(false);
    expect(cut.text, `${label}: trimmed text of ${cut.id}`).toBe(rule!.line);
    expect(cut.pack, `${label}: trimmed pack of ${cut.id}`).toBe(rule!.pack);
    expect(soulIds, `${label}: cut ${cut.id} is out of the soul`).not.toContain(cut.id);
    expect(result.warnings, `${label}: warning for ${cut.id}`).toContain(
      `length: cut ${cut.id} (author pack rule, soul over ${cap})`,
    );
  }

  // The section: every effective limit line, then every pack rules line Tier A did not cut.
  const expected: Expected[] = [
    ...limitLines(build, lib),
    ...rules
      .filter((r) => !cutIds.includes(r.id))
      .map((r) => ({ id: r.id, text: `- ${r.line}`, kind: 'pack-rule' as const })),
  ];
  const section = sectionOf(result);
  const lines = result.soul.split('\n');
  if (expected.length === 0) {
    // Nothing to carry, so no heading, no empty section, no doubled blank line.
    expect(section, `${label}: no Hard rules section`).toBeNull();
    expect(lines.includes(HARD_RULES), `${label}: no heading text`).toBe(false);
  } else {
    expect(section, `${label}: Hard rules section`).not.toBeNull();
    expect(section!.heading.id, `${label}: heading id`).toBe(profile.templates['rules.heading'].id);
    expect(
      section!.items.map((l) => ({ id: l.id, text: l.text, kind: l.kind })),
      `${label}: section lines`,
    ).toEqual(expected);

    // Position: right after the outrank line (one blank between), before How this sounds, with the
    // clash heading still the last heading in the soul.
    expect(lines.filter((l) => l === HARD_RULES), `${label}: heading once`).toHaveLength(1);
    const at = lines.indexOf(HARD_RULES);
    expect(lines[at - 1], `${label}: blank before the heading`).toBe('');
    expect(lines[at - 2], `${label}: the outrank line comes right before`).toBe(`- ${OUTRANK}`);
    expect(lines.indexOf(MEMORY_HEADING), `${label}: after the memory section heading`).toBeLessThan(at);
    expect(lines[at + 1 + expected.length], `${label}: blank after the section`).toBe('');
    expect(lines[at + 2 + expected.length], `${label}: How this sounds follows`).toBe(EXAMPLES_HEADING);
  }
  const headings = lines.filter((l) => l.startsWith('#'));
  expect(headings.at(-1), `${label}: the clash order is still the last section`).toBe(CLASH_HEADING);
  expect(
    lines.every((l, i) => l !== '' || (i > 0 && lines[i - 1] !== '' && i < lines.length - 1)),
    `${label}: no doubled, leading or trailing blank line`,
  ).toBe(true);

  // No gate rules line, by id or by text, in the soul. The Custom Rules table still has every gate.
  expect(
    result.soulLines.filter((l) => /^gate\..+\.rules\./.test(l.id)).map((l) => l.id),
    `${label}: gate rules lines in the soul`,
  ).toEqual([]);
  for (const line of result.soulLines) {
    expect(GATE_RULE_TEXTS.has(line.text.replace(/^- /, '')), `${label}: ${line.id} is a gate rules line`).toBe(false);
  }
  expect(result.customRules.map((r) => r.gate), `${label}: a Custom Rule per gate`).toEqual(Object.keys(result.gates));
  for (const rule of result.customRules) {
    const gate = library.gates.find((g) => g.id === rule.gate)!;
    expect(rule.action, `${label}: ${rule.gate} action`).toBe(gate.customRuleText);
    expect(rule.setting, `${label}: ${rule.gate} setting`).toBe(profile.customRuleSettings![result.gates[rule.gate]]);
  }
  expect(result.gates.pay, `${label}: pay stays forbidden`).toBe('forbid');

  // The spoken message is the soul, and is the only spoken item with the section.
  const personality = result.spoken.filter((s) => s.kind === 'personality');
  expect(personality, `${label}: one personality message`).toHaveLength(1);
  expect(personality[0].text, `${label}: spoken message is the soul`).toBe(result.soul);
  expect(result.files, `${label}: a dot has no files`).toEqual([]);
  for (const item of result.spoken.filter((s) => s.kind !== 'personality')) {
    expect(item.text.includes(HARD_RULES), `${label}: ${item.label} has no Hard rules heading`).toBe(false);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// The library records.

describe('the dot profile record (B17)', () => {
  const dot = profileOf('chatgpt-dot');

  it('puts a rules section in the soul and keeps Custom Rules as the rules layer', () => {
    expect(dot.rulesInSoul).toBe('section');
    expect(dot.rulesDelivery).toBe('custom-rules');
  });

  it('has the heading template "## Hard rules" with its own id', () => {
    expect(dot.templates['rules.heading']).toEqual({ id: 'profile.chatgpt-dot.rules.heading', line: HARD_RULES });
  });

  it('keeps the outrank line the section follows', () => {
    expect(dot.chassisVariants['chassis.rules.outrank']).toBe(OUTRANK);
  });

  it('keeps the dot cap at 3,600 (the B1 tiers still apply)', () => {
    expect(dot.lengthCap).toBe(DOT_CAP);
  });

  it('moves no other profile: only the dot trades its gate rules for Custom Rules', () => {
    const others = library.targets.profiles.filter((p) => p.id !== 'chatgpt-dot');
    expect(others.map((p) => [p.id, p.rulesInSoul])).toEqual([
      ['muse', 'section'],
      ['openclaw', 'none'],
      ['hermes', 'section'],
      ['grok', 'none'],
      ['chatgpt-gpt', 'top-and-bottom'],
      ['chatgpt-instructions', 'top-and-bottom'],
      ['chatgpt-project', 'top-and-bottom'],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Every golden spec on the dot, and a dot build of every starter.

describe('the nine starters on the ChatGPT dot', () => {
  const dotSpecs = GOLDEN_SPECS.filter((s) => s.target === 'chatgpt' && s.mode === 'dot');

  it('has a golden spec for each of the nine starters', () => {
    expect(dotSpecs.map((s) => s.starter).sort()).toEqual([...STARTERS].sort());
    expect(STARTERS).toHaveLength(9);
  });

  for (const spec of dotSpecs) {
    it(`${spec.id}: Hard rules section, limits, uncut pack rules, no gate lines, trace`, () => {
      checkDot(buildFor(spec, library), spec.id);
    });
  }

  it('the golden spec build and a fresh dot build of the starter are the same build', () => {
    for (const spec of dotSpecs) {
      expect(buildFor(spec, library), spec.id).toEqual(dotBuild(spec.starter));
    }
  });

  // Hand-written from the starters' packs, the pack limit defaults and the B1 tiers: the ids in
  // each section, in order, or null when the dot has no section. The first group has no packs. June
  // and Rook have packs with rules and no limits, and Tier A cuts all of their author rules. Dash
  // fits with all three of its sales rules. Marty and Odds are cut to their limit lines.
  const SECTION_IDS: Record<string, string[] | null> = {
    vera: null,
    sol: null,
    pip: null,
    ink: null,
    june: null,
    rook: null,
    dash: ['limit.max_sends_per_day', 'pack.sales.rule.1', 'pack.sales.rule.2', 'pack.sales.rule.3'],
    marty: ['limit.per_trade_pct', 'limit.daily_loss_pct', 'limit.max_trades_per_day'],
    odds: ['limit.kelly_fraction', 'limit.min_edge_pct', 'limit.max_exposure_pct'],
  };

  // The packs the nine starters pick and the rules they lose, hand-written the same way.
  const CUT_IDS: Record<string, string[]> = {
    vera: [],
    sol: [],
    pip: [],
    ink: [],
    june: [1, 2, 3, 4, 5].map((n) => `pack.personal-ops.rule.${n}`),
    rook: [1, 2, 3, 4].map((n) => `pack.coding.rule.${n}`),
    dash: [],
    marty: [1, 2, 3].map((n) => `pack.memecoins.rule.${n}`),
    odds: [
      ...[1, 2, 3, 4].map((n) => `pack.prediction-markets.rule.${n}`),
      ...[1, 2, 3].map((n) => `pack.spot.rule.${n}`),
    ],
  };

  for (const starter of STARTERS) {
    it(`${starter}: the section holds ${SECTION_IDS[starter] ? SECTION_IDS[starter]!.length + ' lines' : 'nothing, so there is no heading'}`, () => {
      const result = compile(dotBuild(starter));
      const section = sectionOf(result);
      if (SECTION_IDS[starter] === null) {
        expect(section).toBeNull();
      } else {
        expect(section?.items.map((l) => l.id)).toEqual(SECTION_IDS[starter]);
      }
      expect(result.trimmed.filter((t) => t.kind === 'pack-rule').map((t) => t.id)).toEqual(CUT_IDS[starter]);
    });
  }

  it('Dash: the limit line reads the library template with the sales default filled in', () => {
    const sales = library.packs.find((p) => p.id === 'sales')!;
    expect(sales.limitsDefault.max_sends_per_day).toBe(30);
    const section = sectionOf(compile(dotBuild('dash')))!;
    expect(section.items[0].text).toBe('- Never send more than 30 outbound messages in one day.');
    expect(section.items.slice(1).map((l) => l.text)).toEqual(sales.rulesLines.map((r) => `- ${r.line}`));
  });

  it('Marty: three limit lines and no memecoins rules, whose texts the certificate can still list as cut', () => {
    const result = compile(dotBuild('marty'));
    const memecoins = library.packs.find((p) => p.id === 'memecoins')!;
    expect(result.trimmed.filter((t) => t.kind === 'pack-rule')).toEqual(
      memecoins.rulesLines.map((r) => ({ kind: 'pack-rule', id: r.id, text: r.line, pack: 'memecoins' })),
    );
    expect(sectionOf(result)!.items.map((l) => l.text)).toEqual([
      '- Never put more than 1% of the account into one trade.',
      '- Stop trading for the day once losses reach 3% of the account, and tell the user.',
      '- Never place more than 10 trades in one day.',
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// No packs and no limits.

describe('a dot build with no packs and no limits', () => {
  const NO_PACK_STARTERS = ['vera', 'sol', 'pip', 'ink'];

  for (const starter of NO_PACK_STARTERS) {
    it(`${starter}: no Hard rules section, and the memory section runs straight into How this sounds`, () => {
      const build = dotBuild(starter);
      expect(build.packs).toEqual([]);
      expect(build.limits).toEqual({});
      const result = checkDot(build, starter);
      expect(result.soul.includes(HARD_RULES)).toBe(false);
      expect(result.soulLines.some((l) => l.kind === 'limit' || l.kind === 'pack-rule' || l.kind === 'rule')).toBe(false);
      const lines = result.soul.split('\n');
      const outrank = lines.indexOf(`- ${OUTRANK}`);
      expect(outrank).toBeGreaterThan(-1);
      expect(lines[outrank + 1]).toBe('');
      expect(lines[outrank + 2]).toBe(EXAMPLES_HEADING);
      expect(result.trimmed).toEqual([]);
    });
  }

  it('a build with no chips, packs, limits or gates', () => {
    const build = migrate(
      {
        v: 1,
        base: 'builder',
        chips: [],
        stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
        peeves: [],
        heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' },
        outfit: 'staff_engineer',
        name: 'Bare',
      },
      { target: 'chatgpt', mode: 'dot' },
    );
    expect(build.packs).toEqual([]);
    const result = checkDot(build, 'bare');
    expect(result.soul.includes(HARD_RULES)).toBe(false);
    expect(result.limits).toEqual({});
  });
});

// ---------------------------------------------------------------------------------------------
// Constructed builds: stricter merges, the user's own numbers, Brian's rule, and a sweep.

describe('limits and pack rules on constructed dot builds', () => {
  it('two packs that share a limit show the stricter value (memecoins and perps: 2% a day, 5x leverage)', () => {
    const build: Build = { ...dotBuild('marty'), packs: ['memecoins', 'perps'] };
    const result = checkDot(build, 'memecoins + perps');
    expect(sectionOf(result)!.items.filter((l) => l.kind === 'limit').map((l) => l.text)).toEqual([
      '- Never put more than 1% of the account into one trade.',
      '- Stop trading for the day once losses reach 2% of the account, and tell the user.',
      '- Never place more than 10 trades in one day.',
      '- Never open a position above 5x leverage.',
    ]);
  });

  it("Brian's perps rule is never cut: the soul is over the cap, the six author rules go, pack.perps.rule.1 stays", () => {
    const build: Build = { ...dotBuild('marty'), packs: ['memecoins', 'perps'] };
    const pre = compile(build, uncapped(library));
    expect(pre.length).toBeGreaterThan(DOT_CAP);
    const result = checkDot(build, 'memecoins + perps');
    const perps = library.packs.find((p) => p.id === 'perps')!;
    expect(perps.rulesLines[0].origin).toBe('brief');
    expect(sectionOf(result)!.items.filter((l) => l.kind === 'pack-rule').map((l) => l.id)).toEqual([perps.rulesLines[0].id]);
    expect(result.trimmed.filter((t) => t.kind === 'pack-rule').map((t) => t.id)).toEqual([
      'pack.memecoins.rule.1',
      'pack.memecoins.rule.2',
      'pack.memecoins.rule.3',
      'pack.perps.rule.2',
      'pack.perps.rule.3',
      'pack.perps.rule.4',
    ]);
  });

  it('a limit the user changed shows the changed value, not the pack default', () => {
    const build: Build = { ...dotBuild('marty'), limits: { per_trade_pct: 0.5, max_trades_per_day: 4 } };
    const result = checkDot(build, 'marty with changed limits');
    expect(sectionOf(result)!.items.map((l) => l.text)).toEqual([
      '- Never put more than 0.5% of the account into one trade.',
      '- Stop trading for the day once losses reach 3% of the account, and tell the user.',
      '- Never place more than 4 trades in one day.',
    ]);
  });

  it('a limit where higher is stricter takes the user value as given (minimum edge 12)', () => {
    const build: Build = { ...dotBuild('odds'), limits: { min_edge_pct: 12 } };
    const result = checkDot(build, 'odds with minimum edge 12');
    expect(sectionOf(result)!.items.map((l) => l.text)).toContain(
      '- Never bet unless your estimated edge over the market price is at least 12%.',
    );
  });

  it('gate settings do not change the section: an auto gate still adds no gate rules line', () => {
    const base = dotBuild('dash');
    const auto = { ...base, gates: { send: 'auto' as const } };
    const forbid = { ...base, gates: { send: 'forbid' as const } };
    const a = checkDot(auto, 'dash send auto');
    const f = checkDot(forbid, 'dash send forbid');
    const plain = checkDot(base, 'dash');
    const ids = (r: CompileResult) => sectionOf(r)!.items.map((l) => l.id);
    expect(ids(a)).toEqual(ids(plain));
    expect(ids(f)).toEqual(ids(plain));
    expect(a.customRules.find((r) => r.gate === 'send')!.setting).not.toBe(
      plain.customRules.find((r) => r.gate === 'send')!.setting,
    );
  });

  it('roles do not change the section', () => {
    const base = dotBuild('dash');
    const plain = checkDot(base, 'dash');
    const withRoles = checkDot({ ...base, roles: ['chief-of-staff', 'scheduler'] }, 'dash with roles');
    expect(sectionOf(withRoles)!.items.map((l) => l.id)).toEqual(sectionOf(plain)!.items.map((l) => l.id));
  });

  // Every starter with each pack added in turn, with that pack's limit chips left at their defaults, at
  // the lowest value and at the highest, so the section is checked against the tables across the whole
  // library, over and under the cap.
  describe('a sweep: every starter with every pack added, limits at the default, the minimum and the maximum', () => {
    // What the sweep reached, so it cannot pass by checking only one kind of soul.
    const reached = { builds: 0, withSection: 0, noSection: 0, cut: 0, uncutRules: 0, limitsOnly: 0, shortChassis: 0 };

    for (const starter of STARTERS) {
      it(`${starter}`, () => {
        const base = dotBuild(starter);
        for (const pack of library.packs) {
          const packs = base.packs.includes(pack.id) ? base.packs : [...base.packs, pack.id];
          const variants: Record<string, Record<string, number>> = { default: {} };
          if (pack.limitChips.length > 0) {
            variants.min = Object.fromEntries(pack.limitChips.map((id) => [id, library.limits.find((l) => l.id === id)!.min]));
            variants.max = Object.fromEntries(pack.limitChips.map((id) => [id, library.limits.find((l) => l.id === id)!.max]));
          }
          for (const [name, limits] of Object.entries(variants)) {
            const result = checkDot({ ...base, packs, limits }, `${starter} + ${pack.id} (${name})`);
            const items = sectionOf(result)?.items ?? [];
            reached.builds += 1;
            if (items.length > 0) reached.withSection += 1;
            else reached.noSection += 1;
            if (result.trimmed.some((t) => t.kind === 'pack-rule')) reached.cut += 1;
            if (items.some((l) => l.kind === 'pack-rule')) reached.uncutRules += 1;
            if (items.length > 0 && items.every((l) => l.kind === 'limit')) reached.limitsOnly += 1;
            if (result.soulLines.some((l) => l.id.includes('#short'))) reached.shortChassis += 1;
          }
        }
      });
    }

    it('reached builds with and without a section, with cuts and without, limits only, and the short chassis', () => {
      const withChips = library.packs.filter((p) => p.limitChips.length > 0).length;
      expect(reached.builds).toBe(STARTERS.length * (library.packs.length + 2 * withChips));
      for (const key of ['withSection', 'noSection', 'cut', 'uncutRules', 'limitsOnly', 'shortChassis'] as const) {
        expect(reached[key], `${key} (${JSON.stringify(reached)})`).toBeGreaterThan(10);
      }
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Over the cap even after the tiers.

describe('a dot soul that cannot be made to fit', () => {
  // The builder base line is lengthened in a copy of the library (test data, never the library file),
  // so the soul stays over 3,600 after Tier A, Tier B and every drop.
  const big: Library = structuredClone(library);
  big.bases.find((b) => b.id === 'builder')!.baseLine = 'x'.repeat(4000);

  const build: Build = {
    ...migrate(
      {
        v: 1,
        base: 'builder',
        chips: ['engineering', 'founder', 'sales'],
        stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
        peeves: [],
        heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' },
        outfit: 'staff_engineer',
        name: 'Too Long',
      },
      { target: 'chatgpt', mode: 'dot' },
    ),
    packs: ['perps', 'sales'],
  };

  it('keeps every limit line and Brian\'s rule, cuts the author rules, and says it is still over', () => {
    const result = checkDot(build, 'too long', big);
    expect(result.length).toBeGreaterThan(DOT_CAP);
    expect(result.warnings.some((w) => w.includes('nothing left to drop'))).toBe(true);
    const items = sectionOf(result)!.items;
    // limits.json order: per_trade_pct, daily_loss_pct, ..., leverage_cap, ..., max_sends_per_day.
    expect(items.map((l) => l.id)).toEqual([
      'limit.per_trade_pct',
      'limit.daily_loss_pct',
      'limit.leverage_cap',
      'limit.max_sends_per_day',
      'pack.perps.rule.1',
    ]);
    expect(result.trimmed.filter((t) => t.kind === 'pack-rule').map((t) => t.id)).toEqual([
      'pack.perps.rule.2',
      'pack.perps.rule.3',
      'pack.perps.rule.4',
      'pack.sales.rule.1',
      'pack.sales.rule.2',
      'pack.sales.rule.3',
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// The other profiles keep their gate rules lines.

describe('the gate carve-out is the dot only', () => {
  const TARGETS: { name: string; target: TargetId; mode?: 'gpt' | 'project' | 'instructions'; plan?: 'paid' }[] = [
    { name: 'muse', target: 'muse' },
    { name: 'openclaw', target: 'openclaw' },
    { name: 'hermes', target: 'hermes' },
    { name: 'grok', target: 'grok' },
    { name: 'chatgpt gpt', target: 'chatgpt', mode: 'gpt' },
    { name: 'chatgpt project', target: 'chatgpt', mode: 'project' },
    { name: 'chatgpt instructions (paid)', target: 'chatgpt', mode: 'instructions', plan: 'paid' },
  ];

  // Every other profile still delivers each effective gate's rules line in its rules layer: the soul
  // (Muse, Hermes, Grok, the GPT, project and instructions layouts) or AGENTS.md (OpenClaw, Hermes).
  for (const t of TARGETS) {
    it(`${t.name}: every effective gate still has its rules line in the bundle`, () => {
      for (const starter of ['marty', 'dash']) {
        const entry = library.roster.find((r) => r.id === starter)!;
        const result = compile(migrate(entry.build, { target: t.target, mode: t.mode, plan: t.plan }));
        const delivered = [...result.soulLines, ...result.files.flatMap((f) => f.lines)].map((l) => l.id);
        const wanted = Object.entries(result.gates).map(([gate, setting]) => `gate.${gate}.rules.${setting}`);
        expect(wanted.length).toBeGreaterThan(0);
        for (const id of wanted) expect(delivered, `${t.name} ${starter}: ${id}`).toContain(id);
      }
    });
  }

  it('a profile that carries its rules in the soul as a section puts the gate lines before the limits (Muse and Hermes)', () => {
    for (const target of ['muse', 'hermes'] as const) {
      const entry = library.roster.find((r) => r.id === 'marty')!;
      const result = compile(migrate(entry.build, { target }));
      const kinds = result.soulLines.filter((l) => ['rule', 'limit', 'pack-rule'].includes(l.kind)).map((l) => l.kind);
      expect(kinds[0], target).toBe('rule');
      expect(kinds.indexOf('limit'), target).toBeGreaterThan(kinds.lastIndexOf('rule'));
    }
  });
});

// ---------------------------------------------------------------------------------------------
// B18: the risk 4 line.

describe('the risk 4 line (B18)', () => {
  const riskLine = (level: number) => library.stats.find((s) => s.id === `stat.risk.${level}`)!;

  it('is Brian\'s full text in stats.json, in plain ASCII', () => {
    expect(riskLine(4).line).toBe(RISK_4);
    expect(/^[\x20-\x7e]+$/.test(RISK_4)).toBe(true);
  });

  it('is the level 3 line followed by the chasing and rug sentence', () => {
    expect(RISK_4.startsWith(`${riskLine(3).line} `)).toBe(true);
    expect(RISK_4.slice(riskLine(3).line.length + 1)).toBe(
      "The only two words you say against a trade are 'chasing' and 'rug'.",
    );
  });

  it('leaves no "Same as" line in the stat table and no "Same as 3" anywhere in the library', () => {
    for (const stat of library.stats) expect(stat.line, stat.id).not.toMatch(/^Same as/);
    expect(JSON.stringify(library).includes('Same as 3')).toBe(false);
  });

  const risk4Specs = GOLDEN_SPECS.filter((s) => buildFor(s, library).stats.risk === 4);

  it('is carried by Marty\'s goldens (the only starter at risk 4) on every profile', () => {
    expect(new Set(risk4Specs.map((s) => s.starter))).toEqual(new Set(['marty']));
    expect(risk4Specs.length).toBeGreaterThanOrEqual(9);
  });

  for (const spec of risk4Specs) {
    it(`${spec.id}: the line is exact, once, and "Same as 3" is nowhere in the bundle`, () => {
      const result = compile(buildFor(spec, library));
      const risk = result.soulLines.filter((l) => l.id === 'stat.risk.4');
      // The free custom instructions layout fits 1,500 characters and keeps only two stat lines, so the
      // risk line may be absent there. Everywhere else it ships.
      const free = spec.id.endsWith('chatgpt-instructions-free');
      if (free) expect(risk.length).toBeLessThanOrEqual(1);
      else expect(risk).toHaveLength(1);
      for (const line of risk) expect(line.text).toBe(`- ${RISK_4}`);

      const everything = [
        result.soul,
        ...result.files.map((f) => f.content),
        ...result.spoken.map((s) => s.text),
        ...result.notes,
        ...result.installSteps,
      ];
      for (const text of everything) {
        expect(text.includes('Same as 3')).toBe(false);
        expect(text.includes(EM_DASH)).toBe(false);
      }
    });
  }

  // A second risk 4 build, on a different base, across every profile the compiler serves.
  const PROFILES: { name: string; target: TargetId; mode?: 'dot' | 'gpt' | 'project' | 'instructions'; plan?: 'paid' }[] = [
    { name: 'muse', target: 'muse' },
    { name: 'openclaw', target: 'openclaw' },
    { name: 'hermes', target: 'hermes' },
    { name: 'grok', target: 'grok' },
    { name: 'chatgpt dot', target: 'chatgpt', mode: 'dot' },
    { name: 'chatgpt gpt', target: 'chatgpt', mode: 'gpt' },
    { name: 'chatgpt project', target: 'chatgpt', mode: 'project' },
    { name: 'chatgpt instructions (paid)', target: 'chatgpt', mode: 'instructions', plan: 'paid' },
  ];

  for (const p of PROFILES) {
    it(`Odds at risk 4 on ${p.name}: the line is exact and once`, () => {
      const entry = library.roster.find((r) => r.id === 'odds')!;
      const v1 = { ...entry.build, stats: { ...entry.build.stats, risk: 4 as const } };
      const result = compile(migrate(v1, { target: p.target, mode: p.mode, plan: p.plan }));
      const risk = result.soulLines.filter((l) => l.id === 'stat.risk.4');
      expect(risk).toHaveLength(1);
      expect(risk[0].text).toBe(`- ${RISK_4}`);
      expect(result.soul.includes('Same as 3')).toBe(false);
    });
  }

  it('the lower risk lines are untouched by the dot change: Odds at risk 3 carries the level 3 line', () => {
    const result = compile(dotBuild('odds'));
    const risk = result.soulLines.filter((l) => l.id === 'stat.risk.3');
    expect(risk.map((l) => l.text)).toEqual([`- ${riskLine(3).line}`]);
  });
});
