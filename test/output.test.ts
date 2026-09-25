// Tests: Determinism, Chassis, Act-vs-ask pair, No em dash, soul text rules.
// Run against all nine roster builds plus four constructed builds (see spec).

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import type { Build } from '../src/compiler/types.js';

const EM_DASH = '\u2014';

interface BuildCase {
  label: string;
  build: Build;
}

// --- Build set -------------------------------------------------------------

const rosterCases: BuildCase[] = library.roster.map((entry) => ({
  label: `roster:${entry.id}`,
  build: structuredClone(entry.build),
}));

// (a) June with funny 1.
const juneEntry = library.roster.find((r) => r.id === 'june');
if (!juneEntry) throw new Error('roster entry "june" not found');
const juneFunny1: Build = structuredClone(juneEntry.build);
juneFunny1.stats.funny = 1;

// (b) minimal build: base chaos, no chips, stats all 1, no peeves, heart
// calmer / d1.calmer / d2.blunt.1, outfit butler, name "Ada".
const minimalBuild: Build = {
  v: 1,
  base: 'chaos',
  chips: [],
  stats: { blunt: 1, warm: 1, funny: 1, chatty: 1, proactive: 1 },
  peeves: [],
  heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.1' },
  outfit: 'butler',
  name: 'Ada',
};

// (c) six-chip build: base builder, six chips, five peeves, heart
// check_my_work / d1.check_my_work / d2.blunt.3, outfit lawyer, name "Quill".
const sixChipBuild: Build = {
  v: 1,
  base: 'builder',
  chips: ['law', 'engineering', 'founder', 'sales', 'consulting', 'night_owl'],
  stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
  peeves: ['lectures_me', 'narrates', 'uses_my_name', 'apologizes_twice', 'too_many_caveats'],
  heart: { hardPart: 'check_my_work', d1: 'd1.check_my_work', d2: 'd2.blunt.3' },
  outfit: 'lawyer',
  name: 'Quill',
};

// (d) Markets build with risk 1: base trader, chips [stocks, options], heart
// forget / d1.forget / d2.blunt.2, outfit captain, name "Tide".
const marketsRiskBuild: Build = {
  v: 1,
  base: 'trader',
  chips: ['stocks', 'options'],
  stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 1 },
  peeves: [],
  heart: { hardPart: 'forget', d1: 'd1.forget', d2: 'd2.blunt.2' },
  outfit: 'captain',
  name: 'Tide',
};

const cases: BuildCase[] = [
  ...rosterCases,
  { label: 'constructed:june-funny-1', build: juneFunny1 },
  { label: 'constructed:minimal-ada', build: minimalBuild },
  { label: 'constructed:six-chip-quill', build: sixChipBuild },
  { label: 'constructed:markets-risk-tide', build: marketsRiskBuild },
];

// --- Library facts used as expected values ----------------------------------

const opening1 = library.chassis.lines.find((l) => l.id === 'chassis.opening.1');
const opening2 = library.chassis.lines.find((l) => l.id === 'chassis.opening.2');
if (!opening1 || !opening2) throw new Error('opening chassis lines not found in library');
const OPENING_1 = opening1.line;
const OPENING_2 = opening2.line;

const ALWAYS_ON_CHASSIS = library.chassis.lines.filter((l) => l.when === undefined);
const DROP_BIT_ID = 'chassis.talk.drop_bit';

const EXPECTED_HEADINGS_NO_TRADING = [
  '## Who you are',
  '## What you want',
  '## How you talk',
  '## Instincts',
  '## Acting for me',
  '## Proactive',
  '## Memory and this file',
  '## How this sounds',
  '## If rules clash',
];

function expectedHeadings(build: Build): string[] {
  if (build.stats.risk === undefined) return EXPECTED_HEADINGS_NO_TRADING;
  const idx = EXPECTED_HEADINGS_NO_TRADING.indexOf('## Acting for me');
  return [
    ...EXPECTED_HEADINGS_NO_TRADING.slice(0, idx + 1),
    '### Trading',
    ...EXPECTED_HEADINGS_NO_TRADING.slice(idx + 1),
  ];
}

// --- Determinism -------------------------------------------------------------

describe('Determinism', () => {
  it.each(cases)('$label compiles identically twice', ({ build }) => {
    const first = compile(build);
    const second = compile(build);
    expect(second).toEqual(first);
  });
});

// --- Chassis -------------------------------------------------------------

describe('Chassis', () => {
  it.each(cases)('$label contains every always-on chassis line, byte-identical', ({ build }) => {
    const result = compile(build);
    for (const line of ALWAYS_ON_CHASSIS) {
      const matches = result.soulLines.filter((l) => l.id === line.id);
      expect(matches.length, `expected exactly one rendered line for ${line.id}`).toBe(1);
      // Strip the "- " bullet prefix if present; the remainder must be byte-identical.
      const rendered =
        matches[0].text.startsWith('- ') ? matches[0].text.slice(2) : matches[0].text;
      expect(rendered).toBe(line.line);
    }
  });

  it.each(cases)('$label opening two lines come first, byte-identical to chassis', ({ build }) => {
    const result = compile(build);
    expect(result.soul.startsWith(OPENING_1 + '\n\n' + OPENING_2)).toBe(true);
    expect(result.soulLines[0].text).toBe(OPENING_1);
    expect(result.soulLines[0].id).toBe('chassis.opening.1');
    expect(result.soulLines[1].text).toBe('');
    expect(result.soulLines[2].text).toBe(OPENING_2);
    expect(result.soulLines[2].id).toBe('chassis.opening.2');
  });

  it.each(cases)('$label drop_bit line is present iff funny >= 2', ({ build }) => {
    const result = compile(build);
    const present = result.soulLines.some((l) => l.id === DROP_BIT_ID);
    expect(present).toBe(build.stats.funny >= 2);
  });
});

// --- Act-vs-ask pair -------------------------------------------------------------

describe('Act-vs-ask pair', () => {
  it.each(cases)('$label emits both the approval line and the reversible line', ({ build }) => {
    const result = compile(build);
    const approval = result.soulLines.filter((l) => l.id === 'chassis.act.approval');
    const reversible = result.soulLines.filter((l) => l.id === 'chassis.act.reversible');
    expect(approval.length, 'approval line missing').toBe(1);
    expect(reversible.length, 'reversible line missing').toBe(1);
  });
});

// --- No em dash -------------------------------------------------------------

describe('No em dash', () => {
  it.each(cases)('$label never contains an em dash anywhere in output', ({ build }) => {
    const result = compile(build);
    expect(result.soul).not.toContain(EM_DASH);
    expect(result.seed).not.toContain(EM_DASH);
    expect(result.buildName).not.toContain(EM_DASH);
    for (const skill of result.skills) {
      expect(skill.sentence).not.toContain(EM_DASH);
    }
  });

  it('no string anywhere in the library contains an em dash', () => {
    expect(JSON.stringify(library)).not.toContain(EM_DASH);
  });
});

// --- Soul text rules -------------------------------------------------------------

describe('soul text rules', () => {
  it.each(cases)('$label has blank lines between sections, none inside a bullet run', ({ build }) => {
    const result = compile(build);
    const lines = result.soulLines.map((l) => l.text);

    // No two consecutive blank lines.
    for (let i = 0; i < lines.length - 1; i++) {
      const consecutiveBlank = lines[i] === '' && lines[i + 1] === '';
      expect(consecutiveBlank, `consecutive blank lines at index ${i}`).toBe(false);
    }

    // No trailing blank line.
    expect(lines[lines.length - 1]).not.toBe('');

    // Every heading line is preceded by a blank line.
    result.soulLines.forEach((line, i) => {
      if (line.kind !== 'heading') return;
      expect(i, `heading "${line.text}" is the first line`).toBeGreaterThan(0);
      expect(lines[i - 1], `heading "${line.text}" not preceded by a blank line`).toBe('');
    });

    // Never a blank line between two lines that both start with "- ".
    for (let i = 1; i < lines.length - 1; i++) {
      if (lines[i] !== '') continue;
      const bulletBefore = lines[i - 1].startsWith('- ');
      const bulletAfter = lines[i + 1].startsWith('- ');
      expect(bulletBefore && bulletAfter, `blank line inside bullet run at index ${i}`).toBe(false);
    }
  });

  it.each(cases)('$label headings appear in the fixed order; Trading iff risk', ({ build }) => {
    const result = compile(build);
    const headings = result.soulLines.filter((l) => l.kind === 'heading').map((l) => l.text);
    expect(headings).toEqual(expectedHeadings(build));
    expect(headings.includes('### Trading')).toBe(build.stats.risk !== undefined);
  });

  it.each(cases)('$label names itself exactly once, as the first word of Who you are', ({ build }) => {
    const result = compile(build);
    const name = build.name.trim();
    const lines = result.soulLines.map((l) => l.text);

    const headingIndex = lines.indexOf('## Who you are');
    expect(headingIndex).toBeGreaterThan(-1);
    expect(lines[headingIndex + 1]).toBe('');
    expect(lines[headingIndex + 2].startsWith(`${name}. `)).toBe(true);

    // Skip the whole-soul uniqueness check when as_an_ai is tapped: that peeve's
    // library line hardcodes the literal name "Marty" as an example.
    if (!build.peeves.includes('as_an_ai')) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordMatches = result.soul.match(new RegExp(`\\b${escaped}\\b`, 'g')) ?? [];
      expect(wordMatches.length, `expected "${name}" exactly once in soul`).toBe(1);
    }
  });

  it.each(cases)('$label soulLines reconstruct soul exactly; length matches', ({ build }) => {
    const result = compile(build);
    expect(result.soulLines.map((l) => l.text).join('\n')).toBe(result.soul);
    expect(result.length).toBe(result.soul.length);
  });
});
