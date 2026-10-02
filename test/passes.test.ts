// Tests for three compiler passes: Dedupe, Contradictions, Length.
// Expected values are taken from docs/Build-a-Muse-Compiler-Library-v1.md,
// QUESTIONS.md (Q9, S1, Q15, V25) and the library JSON text itself, never from
// compiler output. Length runs on the v2 soul profiles (Muse, OpenClaw, Hermes,
// ChatGPT Dot); Dedupe and Contradictions run on v1 builds migrated to Muse.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { resolveProfile, capOf } from '../src/compiler/profile.js';
import { effectiveGates } from '../src/compiler/gates.js';
import type {
  Build,
  BuildV1,
  ChatgptMode,
  CompileResult,
  Library,
  TargetId,
  TracedLine,
} from '../src/compiler/types.js';

// Counts non-overlapping exact occurrences of `needle` in `haystack`.
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = 0;
  while (true) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) break;
    count += 1;
    idx = found + needle.length;
  }
  return count;
}

const STAT_NAMES = ['blunt', 'warm', 'funny', 'chatty', 'proactive'] as const;

// Q15: first match in table order: risk = 4, then base = parent, then base = student, else default.
function expectedD3Id(build: Pick<Build, 'base' | 'stats'>): string {
  if (build.stats.risk === 4) return 'd3.risk4';
  if (build.base === 'parent') return 'd3.parent';
  if (build.base === 'student') return 'd3.student';
  return 'd3.default';
}

describe('Dedupe', () => {
  it('a peeve with no line (agrees_to_be_nice) emits nothing: soul is identical with or without it', () => {
    const juneEntry = library.roster.find((r) => r.id === 'june')!;
    const without = structuredClone(juneEntry.build);
    const withPeeve = structuredClone(juneEntry.build);
    withPeeve.peeves = [...withPeeve.peeves, 'agrees_to_be_nice'];

    expect(withPeeve.peeves.length).toBeLessThanOrEqual(5);
    expect(compile(withPeeve).soul).toBe(compile(without).soul);
  });

  it('a peeve with no line (great_question) emits nothing: soul is identical with or without it', () => {
    const juneEntry = library.roster.find((r) => r.id === 'june')!;
    const without = structuredClone(juneEntry.build);
    const withPeeve = structuredClone(juneEntry.build);
    withPeeve.peeves = [...withPeeve.peeves, 'great_question'];

    expect(withPeeve.peeves.length).toBeLessThanOrEqual(5);
    expect(compile(withPeeve).soul).toBe(compile(without).soul);
  });

  it('a peeve with no line (uses_emoji) emits nothing: soul is identical with or without it', () => {
    const juneEntry = library.roster.find((r) => r.id === 'june')!;
    const without = structuredClone(juneEntry.build);
    const withPeeve = structuredClone(juneEntry.build);
    withPeeve.peeves = [...withPeeve.peeves, 'uses_emoji'];

    expect(withPeeve.peeves.length).toBeLessThanOrEqual(5);
    expect(compile(withPeeve).soul).toBe(compile(without).soul);
  });

  it('a peeve with no line (asks_permission) emits nothing: soul is identical with or without it', () => {
    const juneEntry = library.roster.find((r) => r.id === 'june')!;
    const without = structuredClone(juneEntry.build);
    const withPeeve = structuredClone(juneEntry.build);
    withPeeve.peeves = [...withPeeve.peeves, 'asks_permission'];

    expect(withPeeve.peeves.length).toBeLessThanOrEqual(5);
    expect(compile(withPeeve).soul).toBe(compile(without).soul);
  });

  it('Second Look is emitted exactly once when two chips (law, engineering) unlock it (hard part calmer, so the chips are the only trigger)', () => {
    const build: BuildV1 = {
      v: 1,
      base: 'professional',
      chips: ['law', 'engineering'],
      stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      peeves: [],
      heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' },
      outfit: 'lawyer',
      name: 'Second Look Test',
    };

    const result = compile(build);
    const secondLookLine =
      'Nothing goes out without you offering a second look. Say "clean" or list what\'s off.';

    expect(countOccurrences(result.soul, secondLookLine)).toBe(1);
    expect(result.badges).toContain('badge.second_look');
  });

  it('Chase Caller (memecoins build): its text occurs exactly once and the badge is recorded', () => {
    const martyEntry = library.roster.find((r) => r.id === 'marty')!;
    const build = structuredClone(martyEntry.build);
    const result = compile(build);
    const chaseCallerLine = 'If I\'m chasing, say "you\'re chasing" in the first line.';

    expect(countOccurrences(result.soul, chaseCallerLine)).toBe(1);
    expect(result.badges).toContain('badge.chase_caller');
  });

  it('June: Kid Guard and Triage each appear once, and the triggers/extra line they cover never appear as their own bullet', () => {
    const juneEntry = library.roster.find((r) => r.id === 'june')!;
    const build = structuredClone(juneEntry.build);
    const result = compile(build);

    const kidGuardLine =
      'Kid stuff outranks work pings unless I say otherwise. If two things land on the same hour, say so before I notice.';
    const triageLine = 'Tell me what needs attention now and what can wait, in that order.';
    const kidsT1Bullet = '- Kid stuff outranks work pings unless I say otherwise.';
    const kidsT2Bullet = '- If two things land on the same hour, say so before I notice.';
    const tooMuchExtraBullet = '- Tell me what needs attention now and what can wait.';

    expect(countOccurrences(result.soul, kidGuardLine)).toBe(1);
    expect(countOccurrences(result.soul, triageLine)).toBe(1);

    const texts = result.soulLines.map((l) => l.text);
    expect(texts).not.toContain(kidsT1Bullet);
    expect(texts).not.toContain(kidsT2Bullet);
    expect(texts).not.toContain(tooMuchExtraBullet);

    const ids = result.soulLines.map((l) => l.id);
    expect(ids).not.toContain('chip.kids.t1');
    expect(ids).not.toContain('chip.kids.t2');
    expect(ids).not.toContain('heart.too_much.extra');
  });

  it('options_not_answer peeve is dropped at blunt 3 (covered by No Menu) and present at blunt 2', () => {
    const noMenuLine = 'Pick one. I asked you, not a menu.';

    const buildAt = (blunt: 2 | 3): BuildV1 => ({
      v: 1,
      base: 'professional',
      chips: [],
      stats: { blunt, warm: 1, funny: 1, chatty: 1, proactive: 1 },
      peeves: ['options_not_answer'],
      heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: `d2.blunt.${blunt}` },
      outfit: 'librarian',
      name: 'Menu Test',
    });

    const atBlunt3 = compile(buildAt(3));
    const atBlunt2 = compile(buildAt(2));

    expect(atBlunt3.soul).not.toContain(noMenuLine);
    expect(atBlunt2.soul).toContain(noMenuLine);
  });
});

describe('Contradictions', () => {
  it('funny = 1 drops Life chip voice permissions but keeps Work chip voice; funny = 2 keeps both', () => {
    const buildAt = (funny: 1 | 2): BuildV1 => ({
      v: 1,
      base: 'professional',
      chips: ['law', 'gym'],
      stats: { blunt: 1, warm: 1, funny, chatty: 2, proactive: 1 },
      peeves: [],
      heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.1' },
      outfit: 'lawyer',
      name: 'Voice Test',
    });

    const gymVoice = 'Training metaphors land.';
    const lawVoice = 'Precise. Every word on purpose.';

    const atFunny1 = compile(buildAt(1));
    expect(atFunny1.soul).not.toContain(gymVoice);
    expect(atFunny1.soul).toContain(lawVoice);
    expect(atFunny1.warnings.some((w) => w.includes('contra.funny1_joke_permission'))).toBe(true);

    const atFunny2 = compile(buildAt(2));
    expect(atFunny2.soul).toContain(gymVoice);
    expect(atFunny2.soul).toContain(lawVoice);
  });

  it('chatty = 1 drops any "walk me through" chip-trigger line; chatty = 2 keeps it', () => {
    const clonedLib: Library = structuredClone(library);
    const teaching = clonedLib.chips.find((c) => c.id === 'teaching')!;
    expect(teaching.triggers.length).toBe(2);
    teaching.triggers.push({ id: 'chip.teaching.t3', line: 'Walk me through the lesson plan.' });

    const buildAt = (chatty: 1 | 2): BuildV1 => ({
      v: 1,
      base: 'professional',
      chips: ['teaching'],
      stats: { blunt: 1, warm: 1, funny: 2, chatty, proactive: 1 },
      peeves: [],
      heart: { hardPart: 'talk_it_through', d1: 'd1.talk_it_through', d2: 'd2.blunt.1' },
      outfit: 'teacher',
      name: 'Chatty Test',
    });

    const walkMeThroughLine = 'Walk me through the lesson plan.';

    const atChatty1 = compile(buildAt(1), clonedLib);
    expect(atChatty1.soul).not.toContain(walkMeThroughLine);
    expect(atChatty1.warnings.some((w) => w.includes('contra.chatty1_walk_me_through'))).toBe(true);

    const atChatty2 = compile(buildAt(2), clonedLib);
    expect(atChatty2.soul).toContain(walkMeThroughLine);
  });
});

// ---------------------------------------------------------------------------
// Length (v2). The soul-layout profiles only (Muse, OpenClaw, Hermes, ChatGPT
// Dot, all capped at 3,600). The instructions and grok layouts fit themselves
// and are covered by their own tests.
//
// What the soul now carries besides the v1 lines: gate soul lines (kind
// 'gate'), pack triggers ('pack-trigger'), and on profiles with a rules section
// (Muse, Hermes) the rules block ('rule', 'limit', 'pack-rule'). QUESTIONS S1
// fixes the drop order. QUESTIONS V25: until Brian decides the caps, nothing
// protected drops, and a soul still over the cap ships with a warning that ends
// "over 3600 with nothing left to drop".
//
// The "pre-length soul" used as a reference below is the same build compiled
// against a library clone whose profile cap is raised so high the length pass
// never runs. Everything else about the compile is identical.
// ---------------------------------------------------------------------------

interface SoulProfile {
  id: string;
  target: TargetId;
  mode?: ChatgptMode;
}

const SOUL_PROFILES: SoulProfile[] = [
  { id: 'muse', target: 'muse' },
  { id: 'openclaw', target: 'openclaw' },
  { id: 'hermes', target: 'hermes' },
  { id: 'chatgpt-dot', target: 'chatgpt', mode: 'dot' },
];

const MUSE = SOUL_PROFILES[0];
const OPENCLAW = SOUL_PROFILES[1];
const CHATGPT_DOT = SOUL_PROFILES[3];

// The only kinds the S1 order can drop.
const DROPPABLE_KINDS = ['voice', 'chip-trigger'];

// Kinds that must come through the length pass untouched, same ids in the same order.
const NEVER_DROPPED_KINDS = [
  'chassis',
  'drive',
  'stat',
  'peeve',
  'example',
  'gate',
  'rule',
  'limit',
  'pack-rule',
  'pack-trigger',
] as const;

function rosterBuild(starter: string, profile: SoulProfile): Build {
  const entry = library.roster.find((r) => r.id === starter);
  if (!entry) throw new Error(`no roster entry ${starter}`);
  return migrate(entry.build, { target: profile.target, mode: profile.mode });
}

// A clone of `lib` whose profile cap is raised past any soul, so the length pass never runs.
const uncappedCache = new Map<string, Library>();
function uncapped(profileId: string, lib: Library = library): Library {
  const cached = lib === library ? uncappedCache.get(profileId) : undefined;
  if (cached) return cached;
  const clone: Library = structuredClone(lib);
  const profile = clone.targets.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error(`no profile ${profileId}`);
  profile.lengthCap = 1_000_000;
  if (lib === library) uncappedCache.set(profileId, clone);
  return clone;
}

function preLength(build: Build, profile: SoulProfile, lib: Library = library): CompileResult {
  return compile(build, uncapped(profile.id, lib));
}

// The library with the builder base line inflated, so any builder soul stays over the cap
// however many lines drop. Test data in a clone; the library file is not touched.
function inflatedLibrary(): Library {
  const lib: Library = structuredClone(library);
  lib.bases.find((b) => b.id === 'builder')!.baseLine = 'x'.repeat(4000);
  return lib;
}

// S1 build with six chips in this tap order: engineering, founder, sales (Work),
// gym, dog (Life), night_owl (Time). v1 shape; migrated to Muse where used.
function overflowBuildV1(): BuildV1 {
  return {
    v: 1,
    base: 'builder',
    chips: ['engineering', 'founder', 'sales', 'gym', 'dog', 'night_owl'],
    stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
    peeves: ['adds_disclaimers', 'hedges_everything', 'corporate_speak', 'lectures_me', 'bullets_everything'],
    heart: { hardPart: 'check_my_work', d1: 'd1.check_my_work', d2: 'd2.blunt.3' },
    outfit: 'staff_engineer',
    name: 'Overflow Test',
  };
}

function overflowBuild(profile: SoulProfile = MUSE): Build {
  return migrate(overflowBuildV1(), { target: profile.target, mode: profile.mode });
}

// S1 drop sequence from library data alone: voice lines in reverse tap order, then
// Life/Time triggers in reverse tap order (highest index first within a chip), then for
// each Work/Markets chip in reverse tap order its index 2 then index 1 (array positions).
// A Work/Markets chip's first trigger is never in the sequence. Ids a build does not
// emit (no voice line, fewer triggers, absorbed by dedupe) are not filtered here.
function expectedDropSequence(build: { chips: string[] }, lib: Library): string[] {
  const reverseTapped = [...build.chips].reverse();
  const chipOf = (id: string) => lib.chips.find((c) => c.id === id)!;

  const voiceIds = reverseTapped
    .filter((id) => chipOf(id).voice !== undefined)
    .map((id) => `chip.${id}.voice`);

  const lifeTimeIds = reverseTapped
    .filter((id) => chipOf(id).group === 'Life' || chipOf(id).group === 'Time')
    .flatMap((id) => chipOf(id).triggers.map((t) => t.id).reverse());

  const workMarketsIds = reverseTapped
    .filter((id) => chipOf(id).group === 'Work' || chipOf(id).group === 'Markets')
    .flatMap((id) => {
      const triggers = chipOf(id).triggers;
      return [triggers[2], triggers[1]].filter((t) => t !== undefined).map((t) => t.id);
    });

  return [...voiceIds, ...lifeTimeIds, ...workMarketsIds];
}

// The same sequence for overflowBuild, written out by hand from the library tables
// (chip.night_owl has no voice line; chip.dog and chip.gym have one trigger each).
const OVERFLOW_DROP_SEQUENCE = [
  'chip.dog.voice',
  'chip.gym.voice',
  'chip.sales.voice',
  'chip.founder.voice',
  'chip.engineering.voice',
  'chip.night_owl.t1',
  'chip.dog.t1',
  'chip.gym.t1',
  'chip.sales.t3',
  'chip.sales.t2',
  'chip.founder.t3',
  'chip.founder.t2',
  'chip.engineering.t3',
  'chip.engineering.t2',
];

// Hand-written from the tables. Dash chips in tap order: founder, sales (Work), meetings (Time).
// Meetings has no voice line and one trigger.
const DASH_DROP_SEQUENCE = [
  'chip.sales.voice',
  'chip.founder.voice',
  'chip.meetings.t1',
  'chip.sales.t3',
  'chip.sales.t2',
  'chip.founder.t3',
  'chip.founder.t2',
];

// Hand-written from the tables. Rook chips in tap order: engineering, founder (Work),
// gaming (Life, voice, no triggers), night_owl (Time, no voice, one trigger).
const ROOK_DROP_SEQUENCE = [
  'chip.gaming.voice',
  'chip.founder.voice',
  'chip.engineering.voice',
  'chip.night_owl.t1',
  'chip.founder.t3',
  'chip.founder.t2',
  'chip.engineering.t3',
  'chip.engineering.t2',
];

// Hand-written from the tables. Odds chips in tap order: prediction_markets (Markets, two
// triggers), stocks (Markets, one), early_riser (Time, one). None has a voice line.
const ODDS_DROP_SEQUENCE = ['chip.early_riser.t1', 'chip.prediction_markets.t2'];

// Hand-written from the tables. Marty chips in tap order: memecoins (Markets, voice, three
// triggers), solana (Markets, one trigger), nba (Life, voice, no triggers), night_owl (Time).
const MARTY_DROP_SEQUENCE = [
  'chip.nba.voice',
  'chip.memecoins.voice',
  'chip.night_owl.t1',
  'chip.memecoins.t3',
  'chip.memecoins.t2',
];

function lengthWarningsOf(result: CompileResult): string[] {
  return result.warnings.filter((w) => w.startsWith('length:'));
}

function droppedIdsOf(warnings: string[]): string[] {
  return warnings
    .map((w) => w.match(/^length: dropped (\S+) \(soul over \d+\)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
}

// The soul text of a set of traced lines: lines joined by newlines.
function textLength(lines: TracedLine[]): number {
  return lines.map((l) => l.text).join('\n').length;
}

// Reference model of the S1 trim, built from the pre-length soul and the candidate
// sequence: drop one candidate at a time, stop at the first point at or under the cap.
interface Outcome {
  dropped: string[];
  remaining: TracedLine[];
  length: number;
  fits: boolean;
}
function modelOutcome(pre: CompileResult, sequence: string[], cap: number): Outcome {
  let remaining = pre.soulLines;
  const dropped: string[] = [];
  for (const id of sequence) {
    if (textLength(remaining) <= cap) break;
    remaining = remaining.filter((l) => l.id !== id);
    dropped.push(id);
  }
  const length = textLength(remaining);
  return { dropped, remaining, length, fits: length <= cap };
}

// The library text of a drop candidate (a chip voice line or a chip trigger).
function candidateText(lib: Library, id: string): string {
  const chipId = id.split('.')[1];
  const chip = lib.chips.find((c) => c.id === chipId)!;
  if (id.endsWith('.voice')) return chip.voice!;
  return chip.triggers.find((t) => t.id === id)!.line;
}

// Restoring the last dropped line must put the soul back over the cap: proof that the
// pass stopped at the first point under it. A bullet renders as "- <text>" plus one
// joining newline.
function expectStoppedAtFirstPointUnder(
  result: CompileResult,
  lib: Library,
  droppedIds: string[],
  cap: number,
): void {
  expect(droppedIds.length).toBeGreaterThan(0);
  const lastId = droppedIds[droppedIds.length - 1];
  const restored = result.length + ('- ' + candidateText(lib, lastId)).length + 1;
  expect(restored, `restoring ${lastId}`).toBeGreaterThan(cap);
}

// Ids the S1 order may never touch for this build, from library data: every Work/Markets
// chip's first trigger.
function workMarketsFirstTriggerIds(build: Build, lib: Library): string[] {
  const ids: string[] = [];
  for (const chipId of build.chips) {
    const chip = lib.chips.find((c) => c.id === chipId)!;
    if ((chip.group === 'Work' || chip.group === 'Markets') && chip.triggers.length > 0) {
      ids.push(chip.triggers[0].id);
    }
  }
  return ids;
}

// The length pass removed exactly the dropped ids, all of them voice or chip-trigger lines,
// and every other kind of line, in particular the v2 additions, came through unchanged.
function expectOnlyCandidatesDropped(pre: CompileResult, result: CompileResult, droppedIds: string[]): void {
  const resultIds = new Set(result.soulLines.map((l) => l.id));
  const lost = pre.soulLines.filter((l) => !resultIds.has(l.id)).map((l) => l.id);
  expect([...lost].sort()).toEqual([...droppedIds].sort());

  const kindOf = new Map(pre.soulLines.map((l) => [l.id, l.kind]));
  for (const id of droppedIds) {
    expect(DROPPABLE_KINDS, `kind of dropped ${id}`).toContain(kindOf.get(id));
  }

  for (const kind of NEVER_DROPPED_KINDS) {
    const before = pre.soulLines.filter((l) => l.kind === kind).map((l) => l.id);
    const after = result.soulLines.filter((l) => l.kind === kind).map((l) => l.id);
    expect(after, `${kind} lines`).toEqual(before);
  }
}

// Lines that must be in every soul, derived from the library tables and the build, not
// from the compiler: always-on chassis (less the profile's null variants), the three
// drives, stat lines, peeves with a line, four examples, gate soul lines, on profiles with
// a rules section the rules block, and every Work/Markets first trigger.
function expectProtectedLinesPresent(build: Build, lib: Library, result: CompileResult): void {
  const profile = resolveProfile(build, lib);
  const ids = result.soulLines.map((l) => l.id);
  const dropped = droppedIdsOf(result.warnings);

  // Chassis: every always-on line, unless this profile's variant for it is null.
  const nulled = Object.entries(profile.chassisVariants ?? {})
    .filter(([, variant]) => variant === null)
    .map(([id]) => id);
  for (const line of lib.chassis.lines) {
    if (line.when !== undefined) continue;
    const present = ids.some((i) => i === line.id || i.startsWith(`${line.id}@`) || i.startsWith(`${line.id}#`));
    expect(present, `chassis ${line.id} on ${profile.id}`).toBe(!nulled.includes(line.id));
  }

  // Drives, stat lines, peeves with a line, examples.
  expect(ids).toContain(build.heart.d1);
  expect(ids).toContain(build.heart.d2);
  expect(ids).toContain(expectedD3Id(build));
  for (const stat of STAT_NAMES) {
    expect(ids).toContain(`stat.${stat}.${build.stats[stat]}`);
  }
  if (build.stats.risk !== undefined) {
    expect(ids).toContain(`stat.risk.${build.stats.risk}`);
  }
  for (const peeveId of build.peeves) {
    const peeve = lib.peeves.find((p) => p.id === peeveId);
    if (peeve?.line) {
      expect(ids).toContain(peeveId);
    }
  }
  expect(result.soulLines.filter((l) => l.kind === 'example').length).toBe(4);

  // Gate soul lines: one per effective gate whose setting has soul text.
  const gates = effectiveGates(build, lib);
  for (const gate of lib.gates) {
    if (!Object.hasOwn(gates, gate.id)) continue;
    const setting = gates[gate.id];
    if (gate.soulLine[setting] !== null) {
      expect(ids).toContain(`gate.${gate.id}.soul.${setting}`);
    }
  }

  // The rules block, on profiles that put one in the soul: gate rules, limits, pack rules.
  if (profile.rulesInSoul !== 'none') {
    for (const gate of lib.gates) {
      if (!Object.hasOwn(gates, gate.id)) continue;
      expect(ids).toContain(`gate.${gate.id}.rules.${gates[gate.id]}`);
    }
    const packs = build.packs.map((id) => lib.packs.find((p) => p.id === id)!);
    const limitIds = new Set<string>([
      ...packs.flatMap((p) => Object.keys(p.limitsDefault)),
      ...Object.keys(build.limits),
    ]);
    for (const limitId of limitIds) {
      expect(ids).toContain(`limit.${limitId}`);
    }
    for (const pack of packs) {
      for (const rule of pack.rulesLines) {
        expect(ids).toContain(rule.id);
      }
    }
  }

  // Work/Markets first triggers: never in a length drop, and in the soul unless the
  // dedupe pass folded them into something else (which it reports).
  for (const id of workMarketsFirstTriggerIds(build, lib)) {
    expect(dropped, `length drops ${id}`).not.toContain(id);
    const dedupedAway = result.warnings.some((w) => w.startsWith(`dedupe: dropped ${id} `));
    expect(ids.includes(id) || dedupedAway, `first trigger ${id}`).toBe(true);
  }
}

// One roster starter on one soul profile, with its pre-length soul, its cap, the S1 candidate
// sequence it can actually drop (ids present in the pre-length soul), and the modelled outcome.
interface Combo {
  label: string;
  profile: SoulProfile;
  build: Build;
  cap: number;
  pre: CompileResult;
  sequence: string[];
  model: Outcome;
}

const COMBOS: Combo[] = SOUL_PROFILES.flatMap((profile) =>
  library.roster.map((entry): Combo => {
    const build = rosterBuild(entry.id, profile);
    const cap = capOf(resolveProfile(build, library), build);
    const pre = preLength(build, profile);
    const present = new Set(pre.soulLines.map((l) => l.id));
    const sequence = expectedDropSequence(build, library).filter((id) => present.has(id));
    return { label: `${entry.id} on ${profile.id}`, profile, build, cap, pre, sequence, model: modelOutcome(pre, sequence, cap) };
  }),
);

const FITS_CLEAN = COMBOS.filter((c) => c.pre.length <= c.cap);
const FITS_AFTER_DROPS = COMBOS.filter((c) => c.pre.length > c.cap && c.model.fits);
const CANNOT_FIT = COMBOS.filter((c) => c.pre.length > c.cap && !c.model.fits);

describe('Length', () => {
  it('Muse, OpenClaw, Hermes and ChatGPT Dot all cap the soul at 3600 (S1)', () => {
    for (const profile of SOUL_PROFILES) {
      const build = rosterBuild('vera', profile);
      expect(capOf(resolveProfile(build, library), build), profile.id).toBe(3600);
    }
  });

  it('the roster on the four soul profiles covers all three outcomes: fits as is, fits after drops, cannot fit', () => {
    expect(FITS_CLEAN.length).toBeGreaterThan(0);
    expect(FITS_AFTER_DROPS.length).toBeGreaterThan(0);
    expect(CANNOT_FIT.length).toBeGreaterThan(0);
  });

  it('on Muse the two chassis lines with a null variant (no_self_edit, rules.outrank) are absent and every other always-on chassis line is present', () => {
    const result = compile(rosterBuild('vera', MUSE));
    const ids = result.soulLines.map((l) => l.id);
    expect(ids).not.toContain('chassis.memory.no_self_edit');
    expect(ids).not.toContain('chassis.rules.outrank');
    for (const line of library.chassis.lines) {
      if (line.when !== undefined) continue;
      if (line.id === 'chassis.memory.no_self_edit' || line.id === 'chassis.rules.outrank') continue;
      expect(ids, line.id).toContain(line.id);
    }
  });

  describe('a soul that already fits is left alone', () => {
    for (const c of FITS_CLEAN) {
      it(`${c.label}: no drops, no length warnings, soul equals the pre-length soul`, () => {
        const result = compile(c.build);
        expect(lengthWarningsOf(result)).toEqual([]);
        expect(result.soul).toBe(c.pre.soul);
        expect(result.length).toBeLessThanOrEqual(c.cap);
        expectProtectedLinesPresent(c.build, library, result);
      });
    }
  });

  describe('a soul over the cap that can fit after drops: S1 order, stops at the first point under 3600', () => {
    for (const c of FITS_AFTER_DROPS) {
      it(`${c.label}: drops the S1 prefix, ends under the cap, no "nothing left" warning, protected lines intact`, () => {
        const result = compile(c.build);
        const droppedIds = droppedIdsOf(result.warnings);

        // The pre-length soul was over, so at least one line had to go.
        expect(c.pre.length).toBeGreaterThan(c.cap);
        expect(droppedIds.length).toBeGreaterThan(0);

        // Exactly the S1 prefix, in S1 order, and the prefix is the shortest one that fits.
        expect(droppedIds).toEqual(c.sequence.slice(0, droppedIds.length));
        expect(droppedIds).toEqual(c.model.dropped);
        for (const id of c.sequence.slice(droppedIds.length)) {
          expect(result.soulLines.map((l) => l.id), `undropped candidate ${id}`).toContain(id);
        }
        expectStoppedAtFirstPointUnder(result, library, droppedIds, c.cap);

        // It fits, and says nothing about not fitting.
        expect(result.length).toBeLessThanOrEqual(c.cap);
        expect(result.soul).toBe(c.model.remaining.map((l) => l.text).join('\n'));
        expect(result.warnings.some((w) => w.includes('nothing left to drop'))).toBe(false);
        expect(lengthWarningsOf(result)).toEqual(droppedIds.map((id) => `length: dropped ${id} (soul over ${c.cap})`));

        for (const id of droppedIds) {
          expect(result.soulLines.map((l) => l.id)).not.toContain(id);
        }
        expectOnlyCandidatesDropped(c.pre, result, droppedIds);
        expectProtectedLinesPresent(c.build, library, result);
      });
    }
  });

  describe('a soul that cannot fit: every candidate drops, protected lines stay, V25 warning ends the length warnings', () => {
    for (const c of CANNOT_FIT) {
      it(`${c.label}: all ${c.sequence.length} candidates dropped in S1 order, soul still over 3600, last length warning is "nothing left to drop"`, () => {
        const result = compile(c.build);
        const droppedIds = droppedIdsOf(result.warnings);

        expect(c.model.length).toBeGreaterThan(c.cap); // precondition: no drop order can save this build
        expect(droppedIds).toEqual(c.sequence);
        for (const id of droppedIds) {
          expect(result.soulLines.map((l) => l.id)).not.toContain(id);
        }

        expect(result.length).toBeGreaterThan(c.cap);
        const lengthWarnings = lengthWarningsOf(result);
        expect(lengthWarnings.length).toBe(c.sequence.length + 1);
        expect(lengthWarnings[lengthWarnings.length - 1]).toBe(
          `length: soul is ${result.length} characters, over ${c.cap} with nothing left to drop`,
        );
        expect(result.warnings.filter((w) => w.includes('nothing left to drop')).length).toBe(1);

        expectOnlyCandidatesDropped(c.pre, result, droppedIds);
        expectProtectedLinesPresent(c.build, library, result);
      });
    }
  });

  // ---- Named fixtures with hand-written S1 sequences --------------------------------------

  describe('named builds that fit after drops (picked from the roster, proven to fit)', () => {
    const fixtures: { starter: string; profile: SoulProfile; sequence: string[] }[] = [
      { starter: 'dash', profile: MUSE, sequence: DASH_DROP_SEQUENCE },
      { starter: 'rook', profile: OPENCLAW, sequence: ROOK_DROP_SEQUENCE },
      { starter: 'rook', profile: CHATGPT_DOT, sequence: ROOK_DROP_SEQUENCE },
    ];

    for (const { starter, profile, sequence } of fixtures) {
      it(`${starter} on ${profile.id}: over 3600 before the pass, under 3600 after dropping a prefix of the hand-written S1 order`, () => {
        const build = rosterBuild(starter, profile);
        const cap = capOf(resolveProfile(build, library), build);
        const pre = preLength(build, profile);
        const result = compile(build);
        const droppedIds = droppedIdsOf(result.warnings);

        // Prove it fits after drops: over before, and the hand-written order reaches a fit.
        expect(pre.length).toBeGreaterThan(cap);
        const present = new Set(pre.soulLines.map((l) => l.id));
        const candidates = sequence.filter((id) => present.has(id));
        const model = modelOutcome(pre, candidates, cap);
        expect(model.fits).toBe(true);
        expect(model.dropped.length).toBeGreaterThan(0);

        // The compiler dropped exactly that prefix and nothing else.
        expect(droppedIds).toEqual(model.dropped);
        expect(droppedIds).toEqual(candidates.slice(0, droppedIds.length));
        expect(result.length).toBeLessThanOrEqual(cap);
        expect(result.length).toBe(model.length);
        expectStoppedAtFirstPointUnder(result, library, droppedIds, cap);
        expect(result.warnings.some((w) => w.includes('nothing left to drop'))).toBe(false);

        // Work/Markets first triggers are all in this soul.
        const ids = result.soulLines.map((l) => l.id);
        const firstTriggers = workMarketsFirstTriggerIds(build, library);
        expect(firstTriggers.length).toBeGreaterThan(0);
        for (const id of firstTriggers) {
          expect(ids).toContain(id);
        }
        expectOnlyCandidatesDropped(pre, result, droppedIds);
        expectProtectedLinesPresent(build, library, result);
      });
    }

    it('rook on chatgpt-dot sits right at the boundary: one voice line drops and the soul lands within 3600 and within one voice line of it', () => {
      const build = rosterBuild('rook', CHATGPT_DOT);
      const result = compile(build);
      const droppedIds = droppedIdsOf(result.warnings);
      expect(droppedIds).toEqual(['chip.gaming.voice']);
      expect(result.length).toBeLessThanOrEqual(3600);
      expect(result.length + ('- ' + library.chips.find((c) => c.id === 'gaming')!.voice!).length + 1).toBeGreaterThan(3600);
    });
  });

  describe('named builds that cannot fit (roster builds that run over on Muse, V25)', () => {
    const fixtures: { starter: string; sequence: string[] }[] = [
      { starter: 'rook', sequence: ROOK_DROP_SEQUENCE },
      { starter: 'odds', sequence: ODDS_DROP_SEQUENCE },
      { starter: 'marty', sequence: MARTY_DROP_SEQUENCE },
    ];

    for (const { starter, sequence } of fixtures) {
      it(`${starter} on muse: every hand-written candidate dropped in order, still over 3600, V25 warning is last, gates, rules, limits, pack rules, pack triggers and first triggers intact`, () => {
        const build = rosterBuild(starter, MUSE);
        const pre = preLength(build, MUSE);
        const result = compile(build);

        // Proof it cannot fit: with every candidate gone the soul is still over.
        const present = new Set(pre.soulLines.map((l) => l.id));
        const candidates = sequence.filter((id) => present.has(id));
        expect(modelOutcome(pre, candidates, 3600).length).toBeGreaterThan(3600);

        const droppedIds = droppedIdsOf(result.warnings);
        expect(droppedIds).toEqual(candidates);
        expect(result.length).toBeGreaterThan(3600);
        const lengthWarnings = lengthWarningsOf(result);
        expect(lengthWarnings[lengthWarnings.length - 1]).toBe(
          `length: soul is ${result.length} characters, over 3600 with nothing left to drop`,
        );

        // The rules layer and the gates are really there for these builds (not vacuous).
        // A limit line is only expected when a selected pack sets a limit default.
        const packs = build.packs.map((id) => library.packs.find((p) => p.id === id)!);
        const kinds = new Set(result.soulLines.map((l) => l.kind));
        const expectedKinds = ['gate', 'rule', 'pack-rule', 'pack-trigger'];
        if (packs.some((p) => Object.keys(p.limitsDefault).length > 0)) expectedKinds.push('limit');
        for (const kind of expectedKinds) {
          expect(kinds.has(kind as 'gate'), `soul has a ${kind} line`).toBe(true);
        }
        expectOnlyCandidatesDropped(pre, result, droppedIds);
        expectProtectedLinesPresent(build, library, result);
      });
    }
  });

  // ---- Pack triggers are never dropped ------------------------------------------------------

  describe('pack triggers are never dropped: every pack trigger line from the library is still in the soul', () => {
    for (const c of COMBOS.filter((combo) => combo.build.packs.length > 0)) {
      it(`${c.label}: packs ${c.build.packs.join(', ')}`, () => {
        const result = compile(c.build);
        const droppedIds = droppedIdsOf(result.warnings);
        for (const packId of c.build.packs) {
          const pack = library.packs.find((p) => p.id === packId)!;
          for (const trigger of pack.triggers) {
            // Never a length drop, by id.
            expect(droppedIds).not.toContain(trigger.id);
            // The text is in the soul: as the pack line itself, or as the identical chip line the
            // dedupe pass kept in its place. A kept copy must not then be trimmed away.
            // (Boolean compare so a failure names the trigger instead of printing the soul.)
            expect(result.soul.includes(trigger.line), `${trigger.id} text is in the soul: ${trigger.line}`).toBe(true);
          }
        }
      });
    }
  });

  // ---- Constructed builds ---------------------------------------------------------------------

  it('S1 order from library data matches the hand-written table for the six-chip build', () => {
    expect(expectedDropSequence(overflowBuild(), library)).toEqual(OVERFLOW_DROP_SEQUENCE);
  });

  it('six-chip builder build on Muse cannot fit: all 14 candidates dropped in S1 order, every Work/Markets first trigger survives, V25 warning is last', () => {
    // The builder base line is inflated so the soul stays over 3600 whatever drops.
    const bigLib = inflatedLibrary();
    const build = overflowBuild();
    const pre = preLength(build, MUSE, bigLib);
    const result = compile(build, bigLib);
    const ids = result.soulLines.map((l) => l.id);

    expect(pre.length).toBeGreaterThan(3600);
    // Every candidate is in the pre-length soul, so the hand-written list is the whole sequence.
    const preIds = new Set(pre.soulLines.map((l) => l.id));
    for (const id of OVERFLOW_DROP_SEQUENCE) {
      expect(preIds.has(id), `pre-length soul has ${id}`).toBe(true);
    }

    const droppedIds = droppedIdsOf(result.warnings);
    expect(droppedIds).toEqual(OVERFLOW_DROP_SEQUENCE);
    expect(droppedIds).toEqual(expectedDropSequence(build, bigLib));
    for (const id of droppedIds) {
      expect(ids).not.toContain(id);
    }

    expect(result.length).toBeGreaterThan(3600);
    for (const id of ['chip.engineering.t1', 'chip.founder.t1', 'chip.sales.t1']) {
      expect(ids).toContain(id);
    }
    for (const id of workMarketsFirstTriggerIds(build, bigLib)) {
      expect(ids).toContain(id);
    }

    // Warning order: 14 drop warnings, then exactly one nothing-left warning, last overall.
    const lengthWarnings = lengthWarningsOf(result);
    expect(lengthWarnings.length).toBe(15);
    expect(lengthWarnings.slice(0, 14)).toEqual(
      OVERFLOW_DROP_SEQUENCE.map((id) => `length: dropped ${id} (soul over 3600)`),
    );
    expect(lengthWarnings[14]).toBe(`length: soul is ${result.length} characters, over 3600 with nothing left to drop`);
    expect(result.warnings.filter((w) => w.includes('nothing left to drop')).length).toBe(1);

    expectOnlyCandidatesDropped(pre, result, droppedIds);
    expectProtectedLinesPresent(build, bigLib, result);
  });

  it('a build with no drop candidates at all and a soul over 3600: nothing is removed and the only length warning is "nothing left to drop"', () => {
    const bigLib = inflatedLibrary();
    const build = migrate(
      {
        v: 1,
        base: 'builder',
        chips: [],
        stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
        peeves: [],
        heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' },
        outfit: 'staff_engineer',
        name: 'No Candidates',
      },
      { target: 'muse' },
    );
    const pre = preLength(build, MUSE, bigLib);
    const result = compile(build, bigLib);

    expect(pre.length).toBeGreaterThan(3600);
    expect(result.soul).toBe(pre.soul);
    expect(lengthWarningsOf(result)).toEqual([
      `length: soul is ${result.length} characters, over 3600 with nothing left to drop`,
    ]);
    expectProtectedLinesPresent(build, bigLib, result);
  });

  it('Markets chip and a multi-trigger Life chip: full S1 order including Markets index 2 and 1 and Life highest index first; Markets and Work first triggers survive', () => {
    // Kids is the only Life chip with two triggers in the library and Kid Guard always absorbs
    // them, so a second dog trigger is injected into a cloned library (test data, not library content).
    const bigLib = inflatedLibrary();
    bigLib.chips.find((c) => c.id === 'dog')!.triggers.push({ id: 'chip.dog.t2', line: 'Test trigger two for the dog chip.' });
    const build = migrate(
      {
        v: 1,
        base: 'builder',
        // options (Markets) migrates to the spot pack, whose triggers differ, so its chip
        // triggers stay length candidates (a chip trigger with a pack twin gives way to the pack copy).
        chips: ['options', 'dog', 'engineering'],
        stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 2 },
        peeves: [],
        heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' },
        outfit: 'captain',
        name: 'Markets Test',
      },
      { target: 'muse' },
    );
    const pre = preLength(build, MUSE, bigLib);
    const result = compile(build, bigLib);
    const droppedIds = droppedIdsOf(result.warnings);

    // Voices (engineering, dog; options has none), Life trigger highest index first (dog t2 then t1),
    // then Work/Markets from the last-tapped chip: engineering t3, t2, then options t2 (it has two).
    const expected = [
      'chip.engineering.voice',
      'chip.dog.voice',
      'chip.dog.t2',
      'chip.dog.t1',
      'chip.engineering.t3',
      'chip.engineering.t2',
      'chip.options.t2',
    ];
    expect(expectedDropSequence(build, bigLib)).toEqual(expected);
    expect(droppedIds).toEqual(expected);

    const ids = result.soulLines.map((l) => l.id);
    expect(ids).toContain('chip.options.t1');
    expect(ids).toContain('chip.engineering.t1');
    expectOnlyCandidatesDropped(pre, result, droppedIds);
    expectProtectedLinesPresent(build, bigLib, result);
  });

  it('forced overflow (huge chaos base line) on Muse: soul stays over 3600 with "nothing left to drop", and every protected line still survives', () => {
    const overflowLib: Library = structuredClone(library);
    overflowLib.bases.find((b) => b.id === 'chaos')!.baseLine = 'x'.repeat(4000);

    const build = rosterBuild('pip', MUSE);
    const pre = preLength(build, MUSE, overflowLib);
    const result = compile(build, overflowLib);
    const droppedIds = droppedIdsOf(result.warnings);

    expect(result.length).toBeGreaterThan(3600);
    const lengthWarnings = lengthWarningsOf(result);
    expect(lengthWarnings[lengthWarnings.length - 1]).toBe(
      `length: soul is ${result.length} characters, over 3600 with nothing left to drop`,
    );
    expect(result.warnings.filter((w) => w.includes('nothing left to drop')).length).toBe(1);

    // Every candidate Pip's chips can offer was dropped, in S1 order.
    const preIds = new Set(pre.soulLines.map((l) => l.id));
    expect(droppedIds).toEqual(expectedDropSequence(build, overflowLib).filter((id) => preIds.has(id)));
    expectOnlyCandidatesDropped(pre, result, droppedIds);
    expectProtectedLinesPresent(build, overflowLib, result);
  });
});
