// Tests: Determinism, Chassis, Opening lines, Act-vs-ask pair, No em dash, soul text rules.
//
// v2: a v1 build compiles by migrating to Muse v2, and every build here is also compiled on every
// delivery profile (muse, openclaw, hermes, grok, chatgpt dot, gpt, project, instructions free and
// paid). Chassis lines are per-profile variants (omitted, replaced, or short form), so each property
// below is checked per profile. Run against all nine roster builds plus four constructed builds.
//
// Expected texts come from the library tables (src/library/chassis.json, targets.json), the brief and
// the v2 design, never from compiler output.
//
// Every profile's first soul line is pinned explicitly (a profile with opening lines opens on them;
// the others open on a heading, the grok name line or the top rules block), and a profile that has
// no opening lines must carry no opening-kind line anywhere.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { applyChassis, chassisFormOf, resolveProfile } from '../src/compiler/profile.js';
import { effectiveGates } from '../src/compiler/gates.js';
import { resolve } from '../src/compiler/passes/resolve.js';
import type {
  Build,
  BuildV1,
  ChatgptMode,
  CompileResult,
  Line,
  LineKind,
  Plan,
  Profile,
  TargetId,
  TracedLine,
} from '../src/compiler/types.js';

const EM_DASH = String.fromCharCode(0x2014);

interface BuildCase {
  label: string;
  build: BuildV1;
}

// --- Build set -------------------------------------------------------------

const rosterCases: BuildCase[] = library.roster.map((entry) => ({
  label: `roster:${entry.id}`,
  build: structuredClone(entry.build),
}));

// (a) June with funny 1.
const juneEntry = library.roster.find((r) => r.id === 'june');
if (!juneEntry) throw new Error('roster entry "june" not found');
const juneFunny1: BuildV1 = structuredClone(juneEntry.build);
juneFunny1.stats.funny = 1;

// (b) minimal build: base chaos, no chips, stats all 1, no peeves, heart
// calmer / d1.calmer / d2.blunt.1, outfit butler, name "Ada".
const minimalBuild: BuildV1 = {
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
const sixChipBuild: BuildV1 = {
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
const marketsRiskBuild: BuildV1 = {
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

// --- Profile set -------------------------------------------------------------

type ProfileKey =
  | 'muse'
  | 'openclaw'
  | 'hermes'
  | 'grok'
  | 'chatgpt-dot'
  | 'chatgpt-gpt'
  | 'chatgpt-project'
  | 'chatgpt-instructions-free'
  | 'chatgpt-instructions-paid';

interface ProfileCase {
  key: ProfileKey;
  profileId: string; // the library profile id the compile must resolve to
  target: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
}

const PROFILE_CASES: ProfileCase[] = [
  { key: 'muse', profileId: 'muse', target: 'muse' },
  { key: 'openclaw', profileId: 'openclaw', target: 'openclaw' },
  { key: 'hermes', profileId: 'hermes', target: 'hermes' },
  { key: 'grok', profileId: 'grok', target: 'grok' },
  { key: 'chatgpt-dot', profileId: 'chatgpt-dot', target: 'chatgpt', mode: 'dot' },
  { key: 'chatgpt-gpt', profileId: 'chatgpt-gpt', target: 'chatgpt', mode: 'gpt' },
  { key: 'chatgpt-project', profileId: 'chatgpt-project', target: 'chatgpt', mode: 'project' },
  {
    key: 'chatgpt-instructions-free',
    profileId: 'chatgpt-instructions',
    target: 'chatgpt',
    mode: 'instructions',
    plan: 'free',
  },
  {
    key: 'chatgpt-instructions-paid',
    profileId: 'chatgpt-instructions',
    target: 'chatgpt',
    mode: 'instructions',
    plan: 'paid',
  },
];

// One build compiled for one profile. A roster starter compiles for a profile as
// compile(migrate(build, { target, mode, plan })).
interface Run {
  label: string;
  v1: BuildV1;
  pc: ProfileCase;
  v2: Build;
}

const runCache = new Map<ProfileKey, Run[]>();
function runsFor(pc: ProfileCase): Run[] {
  let runs = runCache.get(pc.key);
  if (!runs) {
    runs = cases.map((c) => ({
      label: c.label,
      v1: c.build,
      pc,
      v2: migrate(c.build, { target: pc.target, mode: pc.mode, plan: pc.plan }),
    }));
    runCache.set(pc.key, runs);
  }
  return runs;
}

const memo = new Map<Run, CompileResult>();
function compiled(run: Run): CompileResult {
  let result = memo.get(run);
  if (!result) {
    result = compile(run.v2);
    memo.set(run, result);
  }
  return result;
}

function profileOf(run: Run): Profile {
  return resolveProfile(run.v2, library);
}

// A traced line id is the record id, or the record id plus a profile suffix ("@profile" for a
// variant, "#short" or "#short@profile" for a short form).
function idIs(lineId: string, recordId: string): boolean {
  return lineId === recordId || lineId.startsWith(`${recordId}@`) || lineId.startsWith(`${recordId}#`);
}

// --- Library facts used as expected values ----------------------------------

function chassisRecord(id: string) {
  const line = library.chassis.lines.find((l) => l.id === id);
  if (!line) throw new Error(`chassis record ${id} not found in library`);
  return line;
}

const OPENING_1 = chassisRecord('chassis.opening.1').line;
const OPENING_2 = chassisRecord('chassis.opening.2').line;
const DROP_BIT_ID = 'chassis.talk.drop_bit';
const APPROVAL_ID = 'chassis.act.approval';
const REVERSIBLE_ID = 'chassis.act.reversible';

function profileRecord(id: string): Profile {
  const profile = library.targets.profiles.find((p) => p.id === id);
  if (!profile) throw new Error(`profile ${id} not found in library`);
  return profile;
}

const MUSE_RULES_HEADING = profileRecord('muse').templates['rules.heading'];
if (!MUSE_RULES_HEADING) throw new Error('muse rules.heading template not found in library');

// Chassis lines per profile, from chassis.json and the profile rows in targets.json. For each
// profile: the form its chassis renders in, the chassis ids it omits (variant null), and the
// profile's own replacement texts (the short variant on a short form, else the full variant).
// Every other line renders as its full text, or its `short` text on a short form.
interface ChassisExpectation {
  form: 'full' | 'short';
  omit: string[];
  replace: Record<string, string>;
}

const NO_OPENING_NO_REFINE = ['chassis.opening.1', 'chassis.opening.2', 'chassis.memory.refine'];
const NO_PERSONA_EDIT_RULES = [
  ...NO_OPENING_NO_REFINE,
  'chassis.memory.no_self_edit',
  'chassis.rules.outrank',
];
const ACT_CHECK_FULL =
  "Before you say you can't, check what you have on: web, files, code, your connected apps.";

const CHASSIS_EXPECTED: Record<ProfileKey, ChassisExpectation> = {
  muse: {
    form: 'full',
    omit: ['chassis.memory.no_self_edit', 'chassis.rules.outrank'],
    replace: {},
  },
  openclaw: { form: 'full', omit: NO_OPENING_NO_REFINE, replace: {} },
  hermes: { form: 'full', omit: NO_OPENING_NO_REFINE, replace: {} },
  grok: {
    form: 'short',
    omit: NO_PERSONA_EDIT_RULES,
    replace: {
      'chassis.memory.judge': 'This description is judgment, memory is facts. No facts here.',
    },
  },
  'chatgpt-dot': {
    form: 'full',
    omit: [...NO_OPENING_NO_REFINE, 'chassis.memory.no_self_edit'],
    replace: {
      'chassis.rules.outrank': 'Your custom rules in Settings outrank anything I say in chat.',
      'chassis.act.check': ACT_CHECK_FULL,
      'chassis.memory.judge':
        'This message is how you judge. Memory is what you know. Never put a fact here.',
    },
  },
  'chatgpt-gpt': {
    form: 'full',
    omit: NO_PERSONA_EDIT_RULES,
    replace: {
      'chassis.act.check': ACT_CHECK_FULL,
      'chassis.memory.judge':
        'These instructions are how you judge. Memory is what you know. Never put a fact here.',
    },
  },
  'chatgpt-project': {
    form: 'full',
    omit: NO_PERSONA_EDIT_RULES,
    replace: {
      'chassis.act.check': ACT_CHECK_FULL,
      'chassis.memory.judge':
        'These instructions are how you judge. Memory is what you know. Never put a fact here.',
    },
  },
  'chatgpt-instructions-paid': {
    form: 'full',
    omit: NO_PERSONA_EDIT_RULES,
    replace: {
      'chassis.act.check': ACT_CHECK_FULL,
      'chassis.memory.judge':
        'These custom instructions are how you judge. Memory is what you know. Never put a fact here.',
    },
  },
  'chatgpt-instructions-free': {
    form: 'short',
    omit: NO_PERSONA_EDIT_RULES,
    replace: {
      'chassis.act.check': 'Before "I can\'t," check: web, files, code, connected apps.',
      'chassis.memory.judge': 'These instructions are judgment, memory is facts. No facts here.',
    },
  },
};

// The text a chassis record renders as on a profile, or null when the profile omits it.
function expectedChassisText(key: ProfileKey, id: string): string | null {
  const expectation = CHASSIS_EXPECTED[key];
  if (expectation.omit.includes(id)) return null;
  if (Object.hasOwn(expectation.replace, id)) return expectation.replace[id];
  const record = chassisRecord(id);
  return expectation.form === 'short' ? (record.short ?? record.line) : record.line;
}

// Every chassis text a build's soul must carry on a profile: always-on lines, plus the
// drop_bit line when funny >= 2 (the one conditional chassis line).
function expectedChassisTexts(key: ProfileKey, build: Build): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const record of library.chassis.lines) {
    if (record.id === DROP_BIT_ID && build.stats.funny < 2) continue;
    const text = expectedChassisText(key, record.id);
    if (text !== null) out.push({ id: record.id, text });
  }
  return out;
}

// Opening lines per profile. Muse's are the two chassis opening records. OpenClaw's come from its own
// SOUL.md template (QUESTIONS V17). The dot opens on the one line the brief gives. Hermes, grok and
// the gpt, project and instructions profiles have none (brief: hermes "openingLines: none", grok
// "openingLines: none"; V2-DESIGN section 5: opening lines replace the chassis ones only where a
// profile defines them). Ids follow `profile.<profileId>.opening.<n>` (V2-DESIGN section 4, trace table).
const OPENCLAW_OPENING_TEXTS = ['# SOUL.md - Who You Are', "_You're not a chatbot. You're becoming someone._"];
const DOT_OPENING_TEXT = "Here's how I want you to work:";
const PROFILES_WITH_NO_OPENING_LINES = [
  'hermes',
  'grok',
  'chatgpt-gpt',
  'chatgpt-project',
  'chatgpt-instructions',
];

// What each profile's soul opens with: ids and texts, in order, each separated by a blank line.
function expectedOpening(key: ProfileKey): { ids: string[]; texts: string[] } | null {
  if (key === 'muse') {
    return { ids: ['chassis.opening.1', 'chassis.opening.2'], texts: [OPENING_1, OPENING_2] };
  }
  if (key === 'openclaw') {
    return {
      ids: OPENCLAW_OPENING_TEXTS.map((_, i) => `profile.openclaw.opening.${i + 1}`),
      texts: OPENCLAW_OPENING_TEXTS,
    };
  }
  if (key === 'chatgpt-dot') {
    return { ids: ['profile.chatgpt-dot.opening.1'], texts: [DOT_OPENING_TEXT] };
  }
  return null;
}

// Every opening text any profile defines. A profile with no opening lines must carry none of them.
const ALL_OPENING_TEXTS = [OPENING_1, OPENING_2, ...OPENCLAW_OPENING_TEXTS, DOT_OPENING_TEXT];

// A profile template line, from the library tables.
function profileTemplate(profileId: string, key: string): Line {
  const template = profileRecord(profileId).templates[key];
  if (!template) throw new Error(`profile ${profileId} has no template ${key} in the library`);
  return template;
}

// The job line the grok layout opens with: the first selected pack's job (V2-DESIGN section 5),
// else the base's job template.
function grokJob(build: Build): Line {
  for (const packId of build.packs) {
    const job = library.packs.find((p) => p.id === packId)?.job;
    if (job) return job;
  }
  return profileTemplate('grok', `grok.job.${build.base}`);
}

// The first line of a soul on each profile, from the library tables and the design:
//  - muse, openclaw, chatgpt-dot: the first opening line.
//  - hermes: no opening lines, so the first section heading ("## Who you are").
//  - grok: the name line, "<Name>. <job>" (template grok.nameLine).
//  - chatgpt-gpt, chatgpt-project, chatgpt-instructions: the rules block comes before the opening
//    (top-and-bottom), so the rules.top heading.
function expectedFirstLine(key: ProfileKey, pc: ProfileCase, build: Build): {
  id: string;
  text: string;
  kind: LineKind;
} {
  switch (key) {
    case 'muse':
    case 'openclaw':
    case 'chatgpt-dot': {
      const opening = expectedOpening(key);
      if (!opening) throw new Error(`no opening expectation for ${key}`);
      return { id: opening.ids[0], text: opening.texts[0], kind: 'opening' };
    }
    case 'hermes': {
      const heading = library.chassis.headings.find((h) => h.section === 'who');
      if (!heading) throw new Error('chassis heading for the who section not found in library');
      return { id: heading.id, text: heading.text, kind: 'heading' };
    }
    case 'grok': {
      const nameLine = profileTemplate('grok', 'grok.nameLine');
      const name = build.name.trim();
      const job = grokJob(build).line;
      return {
        id: nameLine.id,
        text: nameLine.line.replace('{name}', () => name).replace('{job}', () => job),
        kind: 'template',
      };
    }
    case 'chatgpt-gpt':
    case 'chatgpt-project':
    case 'chatgpt-instructions-free':
    case 'chatgpt-instructions-paid': {
      const top = profileTemplate(pc.profileId, 'rules.top');
      return { id: top.id, text: top.line, kind: 'heading' };
    }
  }
}

// The first bullet of the rules block: the first gate in library order that is in force, phrased
// with its rulesLine for the effective setting (V2-DESIGN section 7: gates come first).
function firstRulesBullet(build: Build): string {
  const gates = effectiveGates(build, library);
  const gate = library.gates.find((g) => Object.hasOwn(gates, g.id));
  if (!gate) throw new Error('no gate in force for the build');
  return `- ${gate.rulesLine[gates[gate.id]]}`;
}

const EXPECTED_HEADINGS_NO_TRADING = [
  '## Who you are',
  '## What you want',
  '## How you talk',
  '## Instincts',
  '## Acting for me',
  MUSE_RULES_HEADING.line,
  '## Proactive',
  '## Memory and this file',
  '## How this sounds',
  '## If rules clash',
];

// Muse heading order: Trading sits right after Acting for me, only when the build has risk; the
// rules heading (profile template, "## Hard rules") follows it.
function expectedHeadings(build: BuildV1): string[] {
  if (build.stats.risk === undefined) return EXPECTED_HEADINGS_NO_TRADING;
  const idx = EXPECTED_HEADINGS_NO_TRADING.indexOf('## Acting for me');
  return [
    ...EXPECTED_HEADINGS_NO_TRADING.slice(0, idx + 1),
    '### Trading',
    ...EXPECTED_HEADINGS_NO_TRADING.slice(idx + 1),
  ];
}

// The section a rendered line belongs to, from its kind and record id. Free custom instructions
// render no section headings (a heading costs characters in a 1,500 character box), so a section
// boundary there is a bare blank line, and that blank line can sit between two bullets. Grouping
// lines by section lets the bullet-run rule be checked per section instead of per heading.
function sectionOf(line: TracedLine): string {
  switch (line.kind) {
    case 'rule':
    case 'limit':
    case 'pack-rule':
      return 'rules';
    case 'drive':
      return 'want';
    case 'stat':
    case 'peeve':
      return 'talk';
    case 'chip-trigger':
    case 'pack-trigger':
    case 'badge':
      return 'instincts';
    case 'gate':
      return 'act';
    case 'example':
      return 'examples';
    case 'skill':
      return 'skills';
    case 'chassis': {
      if (line.id.startsWith('chassis.want.')) return 'want';
      if (line.id.startsWith('chassis.talk.')) return 'talk';
      if (line.id.startsWith('chassis.act.')) return 'act';
      if (line.id.startsWith('chassis.memory.') || line.id.startsWith('chassis.rules.')) return 'memory';
      if (line.id.startsWith('chassis.clash.')) return 'clash';
      return `chassis:${line.id}`;
    }
    default:
      return `${line.kind}:${line.id}`;
  }
}

// Every user-visible string a compile can emit, for the no-em-dash rule.
function allTexts(result: CompileResult): string[] {
  return [
    result.soul,
    result.seed,
    result.buildName,
    ...result.skills.map((s) => s.sentence),
    ...result.files.flatMap((f) => [f.path, f.label, f.content]),
    ...result.spoken.flatMap((s) => [s.label, s.text]),
    ...result.customRules.flatMap((r) => [r.action, r.setting]),
    ...result.notes,
    ...result.installSteps,
    ...(result.conversationStarters ?? []),
    ...(result.description !== undefined ? [result.description] : []),
    ...result.warnings,
  ];
}

// --- Library sanity -------------------------------------------------------------

describe('Library facts the output tests rely on', () => {
  it('opening lines per profile match the brief, the design and QUESTIONS V17', () => {
    // Muse's opening lines are the chassis records, so its profile row carries none of its own.
    expect(profileRecord('muse').openingLines, 'muse profile row').toEqual([]);
    expect(
      profileRecord('openclaw').openingLines.map((l) => [l.id, l.line]),
      'openclaw profile row',
    ).toEqual([
      ['profile.openclaw.opening.1', OPENCLAW_OPENING_TEXTS[0]],
      ['profile.openclaw.opening.2', OPENCLAW_OPENING_TEXTS[1]],
    ]);
    expect(
      profileRecord('chatgpt-dot').openingLines.map((l) => [l.id, l.line]),
      'chatgpt-dot profile row',
    ).toEqual([['profile.chatgpt-dot.opening.1', DOT_OPENING_TEXT]]);
    for (const id of PROFILES_WITH_NO_OPENING_LINES) {
      expect(profileRecord(id).openingLines, `${id} profile row has no opening lines`).toEqual([]);
    }
  });

  it('every profile that places rules top and bottom has a rules.top template (the first-line source)', () => {
    for (const id of ['chatgpt-gpt', 'chatgpt-project', 'chatgpt-instructions']) {
      const profile = profileRecord(id);
      expect(profile.rulesInSoul, `${id} rulesInSoul`).toBe('top-and-bottom');
      expect(profile.templates['rules.top'], `${id} rules.top`).toBeDefined();
    }
  });

  it('drop_bit is the only conditional chassis line', () => {
    const conditional = library.chassis.lines.filter((l) => l.when !== undefined).map((l) => l.id);
    expect(conditional).toEqual([DROP_BIT_ID]);
  });

  it('the chassis expectation table matches each profile row (form and omitted ids)', () => {
    for (const pc of PROFILE_CASES) {
      const expectation = CHASSIS_EXPECTED[pc.key];
      const profile = profileRecord(pc.profileId);
      const form = chassisFormOf(profile, runsFor(pc)[0].v2);
      expect(form, `${pc.key} chassis form`).toBe(expectation.form);
      const nulled = Object.entries(profile.chassisVariants)
        .filter(([, v]) => v === null)
        .map(([id]) => id)
        .sort();
      expect([...expectation.omit].sort(), `${pc.key} omitted chassis ids`).toEqual(nulled);
    }
  });
});

// --- Determinism -------------------------------------------------------------

describe('Determinism', () => {
  describe.each(PROFILE_CASES)('on $key', (pc) => {
    it.each(runsFor(pc))('$label compiles identically twice', (run) => {
      const first = compile(run.v2);
      const second = compile(run.v2);
      expect(second).toEqual(first);
    });

    it.each(runsFor(pc))('$label compiles for the profile asked', (run) => {
      expect(compiled(run).profile).toBe(pc.profileId);
    });
  });

  it.each(cases)('$label: a v1 build compiles as its Muse v2 migration', ({ build }) => {
    const direct = compile(build);
    const viaMigrate = compile(migrate(build, { target: 'muse' }));
    expect(direct.profile).toBe('muse');
    expect(direct).toEqual(viaMigrate);
    expect(compile(build)).toEqual(direct);
  });
});

// --- Chassis -------------------------------------------------------------

describe('Chassis', () => {
  describe.each(PROFILE_CASES)('on $key', (pc) => {
    it.each(runsFor(pc))(
      '$label soul contains every chassis line applyChassis returns for the profile',
      (run) => {
        const result = compiled(run);
        const profile = profileOf(run);
        const applied = applyChassis(
          resolve(run.v2, library).chassis,
          profile,
          chassisFormOf(profile, run.v2),
        );
        expect(applied.length, 'no chassis lines resolved').toBeGreaterThan(0);
        for (const line of applied) {
          expect(result.soul.includes(line.line), `chassis ${line.id} missing: ${line.line}`).toBe(
            true,
          );
        }
      },
    );

    it.each(runsFor(pc))(
      '$label renders each applied chassis line exactly once, byte-identical',
      (run) => {
        const result = compiled(run);
        const profile = profileOf(run);
        const applied = applyChassis(
          resolve(run.v2, library).chassis,
          profile,
          chassisFormOf(profile, run.v2),
        );
        for (const line of applied) {
          const matches = result.soulLines.filter((l) => l.id === line.id);
          expect(matches.length, `expected exactly one rendered line for ${line.id}`).toBe(1);
          // Strip the "- " bullet prefix if present; the remainder must be byte-identical.
          const rendered = matches[0].text.startsWith('- ') ? matches[0].text.slice(2) : matches[0].text;
          expect(rendered).toBe(line.line);
        }
      },
    );

    it.each(runsFor(pc))(
      '$label carries the profile variant of every chassis line, from the library tables',
      (run) => {
        const result = compiled(run);
        for (const { id, text } of expectedChassisTexts(pc.key, run.v2)) {
          expect(result.soul.includes(text), `chassis ${id} missing: ${text}`).toBe(true);
        }
      },
    );

    it.each(runsFor(pc))('$label never renders a chassis line the profile omits', (run) => {
      const result = compiled(run);
      for (const id of CHASSIS_EXPECTED[pc.key].omit) {
        const rendered = result.soulLines.filter((l) => idIs(l.id, id));
        expect(rendered.map((l) => l.text), `${id} must be omitted on ${pc.key}`).toEqual([]);
        // Opening lines are skipped by text: openclaw's own opening line quotes one of them.
        if (!id.startsWith('chassis.opening.')) {
          expect(result.soul.includes(chassisRecord(id).line), `${id} text leaked`).toBe(false);
        }
      }
    });

    it.each(runsFor(pc))('$label drop_bit line is present iff funny >= 2', (run) => {
      const result = compiled(run);
      const present = result.soulLines.some((l) => idIs(l.id, DROP_BIT_ID));
      expect(present).toBe(run.v1.stats.funny >= 2);
      const text = expectedChassisText(pc.key, DROP_BIT_ID);
      if (text === null) throw new Error(`${pc.key} omits drop_bit in the expectation table`);
      expect(result.soul.includes(text)).toBe(run.v1.stats.funny >= 2);
    });
  });
});

// --- Opening lines -------------------------------------------------------------

describe('Opening lines', () => {
  describe.each(PROFILE_CASES.filter((pc) => expectedOpening(pc.key) !== null))('on $key', (pc) => {
    const opening = expectedOpening(pc.key);
    if (!opening) throw new Error(`no opening expectation for ${pc.key}`);
    const joined = opening.texts.join('\n\n');

    it.each(runsFor(pc))('$label soul opens with the profile opening lines, in order', (run) => {
      const result = compiled(run);
      expect(result.soul.startsWith(joined)).toBe(true);
      opening.texts.forEach((text, i) => {
        // Opening lines alternate with blank lines: line 0, blank, line 1, blank, ...
        expect(result.soulLines[2 * i].text).toBe(text);
        expect(result.soulLines[2 * i].id).toBe(opening.ids[i]);
        expect(result.soulLines[2 * i].kind).toBe('opening');
        expect(result.soulLines[2 * i + 1].text).toBe('');
      });
    });
  });

  // Every profile: the opening-kind lines in the soul are exactly the profile's own opening lines,
  // in order, and nothing else. A profile with none (hermes, grok, gpt, project, instructions free
  // and paid) carries no opening-kind line, no chassis.opening.* id and no profile.*.opening.* id,
  // so an opening line leaking in from another profile (or added to its library row) is caught.
  describe.each(PROFILE_CASES)('on $key', (pc) => {
    const expectedIds = expectedOpening(pc.key)?.ids ?? [];

    it.each(runsFor(pc))('$label carries exactly the opening lines the profile defines', (run) => {
      const result = compiled(run);
      const openingIds = result.soulLines
        .filter(
          (l) =>
            l.kind === 'opening' ||
            l.id.startsWith('chassis.opening.') ||
            /^profile\..+\.opening\./.test(l.id),
        )
        .map((l) => l.id);
      expect(openingIds).toEqual(expectedIds);
    });
  });

  describe.each(PROFILE_CASES.filter((pc) => expectedOpening(pc.key) === null))('on $key', (pc) => {
    it.each(runsFor(pc))('$label has no opening line: no opening text from any profile', (run) => {
      const result = compiled(run);
      expect(expectedOpening(pc.key)).toBeNull();
      expect(profileOf(run).openingLines, 'profile row').toEqual([]);
      expect(result.soulLines[0].kind, 'first line kind').not.toBe('opening');
      for (const text of ALL_OPENING_TEXTS) {
        expect(
          result.soulLines.some((l) => l.text === text || l.text === `- ${text}`),
          `opening text leaked into ${pc.key}: ${text}`,
        ).toBe(false);
        expect(result.soul.includes(text), `opening text leaked into ${pc.key} soul: ${text}`).toBe(false);
      }
    });
  });

  describe.each(PROFILE_CASES.filter((pc) => pc.key !== 'muse'))('on $key', (pc) => {
    it.each(runsFor(pc))('$label ships no Muse chassis opening line', (run) => {
      const result = compiled(run);
      const ids = result.soulLines.filter((l) => l.id.startsWith('chassis.opening.')).map((l) => l.id);
      expect(ids).toEqual([]);
    });
  });
});

// --- First line of each soul -------------------------------------------------------------

describe('First line of each soul', () => {
  describe.each(PROFILE_CASES)('on $key', (pc) => {
    it.each(runsFor(pc))('$label soul begins with the first line the profile defines', (run) => {
      const result = compiled(run);
      const first = expectedFirstLine(pc.key, pc, run.v2);
      expect(result.soulLines[0].text).toBe(first.text);
      expect(result.soulLines[0].id).toBe(first.id);
      expect(result.soulLines[0].kind).toBe(first.kind);
      expect(result.soul.split('\n')[0]).toBe(first.text);
    });
  });

  // Hermes has no opening lines: the soul opens on "## Who you are", then a blank line, then the
  // name line ("<Name>. ...").
  describe('on hermes', () => {
    const hermes = PROFILE_CASES.find((pc) => pc.key === 'hermes');
    if (!hermes) throw new Error('hermes profile case not found');
    it.each(runsFor(hermes))('$label first section is Who you are, with the name line under it', (run) => {
      const lines = compiled(run).soulLines.map((l) => l.text);
      expect(lines[0]).toBe('## Who you are');
      expect(lines[1]).toBe('');
      expect(lines[2].startsWith(`${run.v1.name.trim()}. `)).toBe(true);
    });
  });

  // Grok opens on the job: "<Name>. <job>", where the job is the first selected pack's job line or
  // the base's job template, both library records.
  describe('on grok', () => {
    const grok = PROFILE_CASES.find((pc) => pc.key === 'grok');
    if (!grok) throw new Error('grok profile case not found');
    it.each(runsFor(grok))('$label name line carries the job and no heading precedes it', (run) => {
      const result = compiled(run);
      const job = grokJob(run.v2).line;
      expect(result.soulLines[0].text).toBe(`${run.v1.name.trim()}. ${job}`);
      expect(result.soulLines[0].kind).not.toBe('heading');
      expect(result.soulLines[0].sources, 'name line traces to the job record').toContain(
        grokJob(run.v2).id,
      );
    });
  });

  // gpt, project and instructions (free and paid): the rules block comes before everything else, so
  // the soul opens on the rules.top heading and the first rules bullet follows it directly.
  describe.each(
    PROFILE_CASES.filter((pc) =>
      ['chatgpt-gpt', 'chatgpt-project', 'chatgpt-instructions-free', 'chatgpt-instructions-paid'].includes(
        pc.key,
      ),
    ),
  )('on $key', (pc) => {
    it.each(runsFor(pc))('$label rules block opens the soul: heading, then the first gate rule', (run) => {
      const result = compiled(run);
      expect(result.soulLines[0].kind).toBe('heading');
      expect(result.soulLines[1].kind).toBe('rule');
      expect(result.soulLines[1].text).toBe(firstRulesBullet(run.v2));
    });
  });
});

// --- Act-vs-ask pair -------------------------------------------------------------

describe('Act-vs-ask pair', () => {
  describe.each(PROFILE_CASES)('on $key', (pc) => {
    it.each(runsFor(pc))('$label emits both the approval line and the reversible line', (run) => {
      const result = compiled(run);
      const approval = result.soulLines.filter((l) => idIs(l.id, APPROVAL_ID));
      const reversible = result.soulLines.filter((l) => idIs(l.id, REVERSIBLE_ID));
      expect(approval.length, 'approval line missing').toBe(1);
      expect(reversible.length, 'reversible line missing').toBe(1);

      // The rendered text is the profile's form of each line, from the library tables.
      const approvalText = expectedChassisText(pc.key, APPROVAL_ID);
      const reversibleText = expectedChassisText(pc.key, REVERSIBLE_ID);
      expect(approval[0].text).toBe(`- ${approvalText}`);
      expect(reversible[0].text).toBe(`- ${reversibleText}`);
    });
  });
});

// --- No em dash -------------------------------------------------------------

describe('No em dash', () => {
  describe.each(PROFILE_CASES)('on $key', (pc) => {
    it.each(runsFor(pc))('$label never contains an em dash anywhere in output', (run) => {
      const result = compiled(run);
      expect(result.soul).not.toContain(EM_DASH);
      expect(result.seed).not.toContain(EM_DASH);
      expect(result.buildName).not.toContain(EM_DASH);
      for (const skill of result.skills) {
        expect(skill.sentence).not.toContain(EM_DASH);
      }
      for (const file of result.files) {
        expect(file.content, `file ${file.path}`).not.toContain(EM_DASH);
      }
      for (const item of result.spoken) {
        expect(item.text, `spoken ${item.label}`).not.toContain(EM_DASH);
      }
      for (const rule of result.customRules) {
        expect(rule.action, `custom rule ${rule.gate} action`).not.toContain(EM_DASH);
        expect(rule.setting, `custom rule ${rule.gate} setting`).not.toContain(EM_DASH);
      }
      for (const note of result.notes) {
        expect(note, 'note').not.toContain(EM_DASH);
      }
      for (const text of allTexts(result)) {
        expect(text).not.toContain(EM_DASH);
      }
    });
  });

  it('no string anywhere in the library contains an em dash', () => {
    expect(JSON.stringify(library)).not.toContain(EM_DASH);
  });
});

// --- Soul text rules -------------------------------------------------------------

describe('soul text rules', () => {
  describe.each(PROFILE_CASES)('on $key', (pc) => {
    it.each(runsFor(pc))('$label has blank lines between sections, none inside a bullet run', (run) => {
      const result = compiled(run);
      const lines = result.soulLines.map((l) => l.text);

      // No two consecutive blank lines.
      for (let i = 0; i < lines.length - 1; i++) {
        const consecutiveBlank = lines[i] === '' && lines[i + 1] === '';
        expect(consecutiveBlank, `consecutive blank lines at index ${i}`).toBe(false);
      }

      // No leading or trailing blank line.
      expect(lines[0]).not.toBe('');
      expect(lines[lines.length - 1]).not.toBe('');

      // Every heading line is preceded by a blank line. A soul opens on a heading only when the
      // profile has no opening lines of its own (hermes opens on its first section heading; the
      // gpt, project and instructions profiles open on the top rules block heading).
      result.soulLines.forEach((line, i) => {
        if (line.kind !== 'heading') return;
        if (i === 0) {
          expect(
            expectedFirstLine(pc.key, pc, run.v2).kind,
            `heading "${line.text}" is the first line of a soul whose profile opens on something else`,
          ).toBe('heading');
          return;
        }
        expect(lines[i - 1], `heading "${line.text}" not preceded by a blank line`).toBe('');
      });

      // Never a blank line between two lines that both start with "- ". On free custom
      // instructions there are no section headings, so a blank line there may sit between two
      // bullets only where one section ends and the next begins.
      const headingless = pc.key === 'chatgpt-instructions-free';
      for (let i = 1; i < lines.length - 1; i++) {
        if (lines[i] !== '') continue;
        const bulletBefore = lines[i - 1].startsWith('- ');
        const bulletAfter = lines[i + 1].startsWith('- ');
        if (!(bulletBefore && bulletAfter)) continue;
        if (headingless) {
          const before = sectionOf(result.soulLines[i - 1]);
          const after = sectionOf(result.soulLines[i + 1]);
          expect(before !== after, `blank line inside the ${before} bullet run at index ${i}`).toBe(true);
        } else {
          expect(false, `blank line inside bullet run at index ${i}`).toBe(true);
        }
      }
    });

    it.each(runsFor(pc))('$label soulLines reconstruct soul exactly; length matches', (run) => {
      const result = compiled(run);
      expect(result.soulLines.map((l) => l.text).join('\n')).toBe(result.soul);
      expect(result.length).toBe(result.soul.length);
    });
  });

  // Muse only: the full heading list and the name rule are Muse soul layout facts.
  describe('on muse', () => {
    const museRuns = runsFor(PROFILE_CASES[0]);

    it.each(museRuns)('$label headings appear in the fixed order; Trading iff risk', (run) => {
      const result = compiled(run);
      const headings = result.soulLines.filter((l) => l.kind === 'heading').map((l) => l.text);
      expect(headings).toEqual(expectedHeadings(run.v1));
      expect(headings.includes('### Trading')).toBe(run.v1.stats.risk !== undefined);
    });

    it.each(museRuns)('$label names itself exactly once, as the first word of Who you are', (run) => {
      const result = compiled(run);
      const name = run.v1.name.trim();
      const lines = result.soulLines.map((l) => l.text);

      const headingIndex = lines.indexOf('## Who you are');
      expect(headingIndex).toBeGreaterThan(-1);
      expect(lines[headingIndex + 1]).toBe('');
      expect(lines[headingIndex + 2].startsWith(`${name}. `)).toBe(true);

      // Skip the whole-soul uniqueness check when as_an_ai is tapped: that peeve's
      // library line hardcodes the literal name "Marty" as an example.
      if (!run.v1.peeves.includes('as_an_ai')) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordMatches = result.soul.match(new RegExp(`\\b${escaped}\\b`, 'g')) ?? [];
        expect(wordMatches.length, `expected "${name}" exactly once in soul`).toBe(1);
      }
    });
  });
});
