// Tests for three compiler passes: Dedupe, Contradictions, Length.
// Expected values are taken from docs/Build-a-Muse-Compiler-Library-v1.md,
// QUESTIONS.md (Q9, S1, Q15, V25, B1, V29) and the library JSON text itself, never from
// compiler output. Length runs on the v2 soul profiles (Muse, OpenClaw, Hermes,
// ChatGPT Dot); Dedupe and Contradictions run on v1 builds migrated to Muse.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { resolveProfile, capOf } from '../src/compiler/profile.js';
import { effectiveGates, effectiveLimits } from '../src/compiler/gates.js';
import type {
  Build,
  BuildV1,
  ChassisLine,
  ChatgptMode,
  CompileResult,
  Library,
  Profile,
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
// Length (v2, B1). The soul-layout profiles only (Muse, OpenClaw, Hermes, ChatGPT
// Dot). The instructions and grok layouts fit themselves and are covered by their
// own tests.
//
// Caps (QUESTIONS B1): Muse 4,000, Hermes 4,000, OpenClaw 3,600, ChatGPT Dot 3,600.
// On a profile whose cap is 4,000 or less the length pass runs in this order, each
// step only while the soul is still over the cap:
//   Tier A  cut every author pack rules line (every pack rules line except Brian's,
//           origin "brief", only pack.perps.rule.1) from the soul, one warning each:
//           "length: cut <id> (author pack rule, soul over <cap>)".
//   Tier B  switch the chassis to its short forms, one warning:
//           "length: chassis switched to short forms (soul over <cap>)". Tier A's
//           cuts stay cut (V29). A profile's own chassis variant beats the generic
//           short form (V29).
//   S1      drop voice lines, Life/Time triggers, then Work/Markets index 2 then 1,
//           last-tapped first, stopping at the first point under the cap.
// Never dropped: chassis lines (full or short), drives, stats, peeves, examples, gate
// lines, limits, Brian's pack rule, pack triggers, Work/Markets first triggers. A soul
// still over the cap ships with "length: soul is N characters, over <cap> with nothing
// left to drop" (V25). AGENTS.md keeps every rules line, cut or not.
//
// The reference model below is built from the pre-length soul (the same build compiled
// against a library clone whose profile cap is raised so high the length pass never
// runs) and the library tables: author rule ids from the pack JSON, short chassis text
// from chassis.json and the profile variants, the S1 sequence from the chip tables.
// Cases that need Tier B plus drops, or no way to fit, use constructed builds: the
// builder base line is lengthened in a cloned library so the soul lands where the case
// needs it. The library file is never touched.
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
const HERMES = SOUL_PROFILES[2];
const CHATGPT_DOT = SOUL_PROFILES[3];

// B1 caps of the four soul profiles.
const SOUL_CAPS: Record<string, number> = { muse: 4000, openclaw: 3600, hermes: 4000, 'chatgpt-dot': 3600 };

// B1: the tiers apply on a cap of this or less.
const TIER_MAX_CAP = 4000;

// Brian's pack rules line (library origin "brief"), the only one Tier A never cuts.
const BRIEF_RULE_IDS = ['pack.perps.rule.1'];

// The profiles whose soul carries the rules block (rulesInSoul "section"), so Tier A has lines to cut.
const RULES_IN_SOUL_PROFILES = [MUSE, HERMES];

// The only kinds the S1 order can drop.
const DROPPABLE_KINDS = ['voice', 'chip-trigger'];

// Kinds that must come through the length pass with the same ids in the same order. Chassis lines
// change form on Tier B (compared by base id) and pack rules lose the author lines on Tier A, so
// neither is in this list; each has its own check.
const NEVER_DROPPED_KINDS = ['drive', 'stat', 'peeve', 'example', 'gate', 'rule', 'limit', 'pack-trigger'] as const;

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

// The pre-length soul: full chassis, every rules line, no tier, no drop.
function preLength(build: Build, lib: Library = library): CompileResult {
  return compile(build, uncapped(resolveProfile(build, lib).id, lib));
}

// A clone of `lib` with one base line replaced by `n` characters of filler. Test data in a clone.
function withBaseLineLength(lib: Library, baseId: string, n: number): Library {
  const clone: Library = structuredClone(lib);
  clone.bases.find((b) => b.id === baseId)!.baseLine = 'x'.repeat(n);
  return clone;
}

// The library with the builder base line inflated far past any cap, so any builder soul stays
// over the cap however much is cut or dropped.
function inflatedLibrary(): Library {
  return withBaseLineLength(library, 'builder', 4000);
}

// S1 build with six chips in this tap order: engineering, founder, sales (Work),
// gym, dog (Life), night_owl (Time). v1 shape; migrated where used.
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

// The six-chip build with no peeves and the perps pack, which carries Brian's rules line and three
// author lines. No other pack and no peeves keep the protected floor low enough that the base line
// can place every point of the pipeline around the caps. Used by the constructed cases.
function perpsBuild(profile: SoulProfile): Build {
  return { ...overflowBuild(profile), peeves: [], packs: ['perps'] };
}

// Hand-written from the pack JSON, in soul order: every pack rules line of perpsBuild except
// pack.perps.rule.1, which is Brian's.
const PERPS_AUTHOR_RULES = ['pack.perps.rule.2', 'pack.perps.rule.3', 'pack.perps.rule.4'];

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

const NAMED_SEQUENCES: { starter: string; sequence: string[] }[] = [
  { starter: 'dash', sequence: DASH_DROP_SEQUENCE },
  { starter: 'rook', sequence: ROOK_DROP_SEQUENCE },
  { starter: 'odds', sequence: ODDS_DROP_SEQUENCE },
  { starter: 'marty', sequence: MARTY_DROP_SEQUENCE },
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

// The chassis record id behind a soul line id: "chassis.x#short" and "chassis.x@profile" both
// belong to chassis.x. Other ids come back unchanged.
function canonId(id: string): string {
  return id.startsWith('chassis.') ? id.split(/[#@]/)[0] : id;
}

// The library text of a drop candidate (a chip voice line or a chip trigger).
function candidateText(lib: Library, id: string): string {
  const chipId = id.split('.')[1];
  const chip = lib.chips.find((c) => c.id === chipId)!;
  if (id.endsWith('.voice')) return chip.voice!;
  return chip.triggers.find((t) => t.id === id)!.line;
}

// What dropping a candidate takes out of the soul: "- " plus the text plus the joining newline.
function candidateSize(lib: Library, id: string): number {
  return ('- ' + candidateText(lib, id)).length + 1;
}

// ---- Library-derived expectations -----------------------------------------------------------

// Every pack rules line of the build's packs, in soul order.
function packRuleIdsOf(build: Build, lib: Library): string[] {
  return build.packs.flatMap((id) => lib.packs.find((p) => p.id === id)!.rulesLines.map((r) => r.id));
}

// B1 Tier A: every pack rules line except Brian's.
function authorRuleIdsOf(build: Build, lib: Library): string[] {
  return packRuleIdsOf(build, lib).filter((id) => !BRIEF_RULE_IDS.includes(id));
}

// The rules-layer lines AGENTS.md carries, from the library tables: gates, limits, pack rules.
function rulesLinesOf(build: Build, lib: Library): { id: string; text: string }[] {
  const gates = effectiveGates(build, lib);
  const limits = effectiveLimits(build, lib);
  const out: { id: string; text: string }[] = [];
  for (const gate of lib.gates) {
    if (!Object.hasOwn(gates, gate.id)) continue;
    const setting = gates[gate.id];
    out.push({ id: `gate.${gate.id}.rules.${setting}`, text: gate.rulesLine[setting] });
  }
  for (const limit of lib.limits) {
    if (!Object.hasOwn(limits, limit.id)) continue;
    out.push({ id: `limit.${limit.id}`, text: limit.rulesTemplate.replaceAll('{value}', String(limits[limit.id])) });
  }
  for (const id of build.packs) {
    for (const rule of lib.packs.find((p) => p.id === id)!.rulesLines) {
      out.push({ id: rule.id, text: rule.line });
    }
  }
  return out;
}

// A chassis line's id and text on a profile in a form, from chassis.json and the profile
// variants (V29: a profile's own variant beats the generic short form when the profile has no
// short variant of its own). null: the profile leaves the line out.
function chassisTextFor(
  rec: ChassisLine,
  profile: Profile,
  form: 'full' | 'short',
): { id: string; text: string } | null {
  const variant = Object.hasOwn(profile.chassisVariants, rec.id) ? profile.chassisVariants[rec.id] : undefined;
  if (variant === null) return null;
  if (form === 'short') {
    const profileShort =
      profile.chassisShortVariants && Object.hasOwn(profile.chassisShortVariants, rec.id)
        ? profile.chassisShortVariants[rec.id]
        : undefined;
    if (profileShort !== undefined) return { id: `${rec.id}#short@${profile.id}`, text: profileShort };
    if (rec.short !== undefined && typeof variant !== 'string') return { id: `${rec.id}#short`, text: rec.short };
  }
  if (typeof variant === 'string') return { id: `${rec.id}@${profile.id}`, text: variant };
  return { id: rec.id, text: rec.line };
}

// ---- Reference model of the length pass -----------------------------------------------------

interface Outcome {
  dropped: string[];
  remaining: TracedLine[];
  length: number;
  fits: boolean;
}

// The S1 trim: drop one candidate at a time, stop at the first point at or under the cap.
function trimModel(lines: TracedLine[], sequence: string[], cap: number): Outcome {
  let remaining = lines;
  const dropped: string[] = [];
  for (const id of sequence) {
    if (textLength(remaining) <= cap) break;
    remaining = remaining.filter((l) => l.id !== id);
    dropped.push(id);
  }
  const length = textLength(remaining);
  return { dropped, remaining, length, fits: length <= cap };
}

// Tier A on traced lines: remove every author pack rules line.
function cutAuthorRules(lines: TracedLine[], build: Build, lib: Library): { lines: TracedLine[]; cutIds: string[] } {
  const author = new Set(authorRuleIdsOf(build, lib));
  const cutIds = lines.filter((l) => l.kind === 'pack-rule' && author.has(l.id)).map((l) => l.id);
  return { lines: lines.filter((l) => !cutIds.includes(l.id)), cutIds };
}

// Tier B on traced lines: every chassis line takes its short-form id and text.
function toShortChassis(lines: TracedLine[], profile: Profile, lib: Library): TracedLine[] {
  return lines.map((l) => {
    const rec = lib.chassis.lines.find((c) => c.id === canonId(l.id));
    if (!rec) return l;
    const short = chassisTextFor(rec, profile, 'short');
    if (!short) return l;
    return { ...l, id: short.id, text: (l.text.startsWith('- ') ? '- ' : '') + short.text };
  });
}

type Stage = 'clean' | 'tierA' | 'tierB' | 'drops' | 'exhausted';

interface TierModel {
  profile: Profile;
  cap: number;
  tiers: boolean;
  stage: Stage; // the last step that ran, or exhausted when nothing fits
  cutIds: string[]; // author pack rules lines Tier A cut (empty unless Tier A ran)
  short: boolean; // Tier B ran
  sequence: string[]; // S1 candidates present in the soul entering S1
  dropped: string[];
  lines: TracedLine[];
  length: number;
  warnings: string[]; // the "length:" warnings, in order
  // Lengths at each point of the pipeline, for placing a constructed soul.
  lengths: { pre: number; a: number; b: number; floor: number };
}

function modelTiers(pre: CompileResult, build: Build, lib: Library): TierModel {
  const profile = resolveProfile(build, lib);
  const cap = capOf(profile, build);
  const tiers = cap <= TIER_MAX_CAP && profile.id !== 'chatgpt-instructions';

  const cut = cutAuthorRules(pre.soulLines, build, lib);
  const shortLines = toShortChassis(cut.lines, profile, lib);
  const preIds = new Set(pre.soulLines.map((l) => l.id));
  const allCandidates = expectedDropSequence(build, lib).filter((id) => preIds.has(id));
  const floor = textLength(shortLines.filter((l) => !allCandidates.includes(l.id)));

  let lines = pre.soulLines;
  let cutIds: string[] = [];
  let short = false;
  let stage: Stage = 'clean';
  const warnings: string[] = [];
  if (tiers && textLength(lines) > cap) {
    lines = cut.lines;
    cutIds = cut.cutIds;
    warnings.push(...cutIds.map((id) => `length: cut ${id} (author pack rule, soul over ${cap})`));
    stage = 'tierA';
    if (textLength(lines) > cap && profile.chassisForm === 'full') {
      lines = shortLines;
      short = true;
      warnings.push(`length: chassis switched to short forms (soul over ${cap})`);
      stage = 'tierB';
    }
  }

  const present = new Set(lines.map((l) => l.id));
  const sequence = allCandidates.filter((id) => present.has(id));
  const trimmed = trimModel(lines, sequence, cap);
  warnings.push(...trimmed.dropped.map((id) => `length: dropped ${id} (soul over ${cap})`));
  if (trimmed.dropped.length > 0) stage = 'drops';
  if (!trimmed.fits) {
    warnings.push(`length: soul is ${trimmed.length} characters, over ${cap} with nothing left to drop`);
    stage = 'exhausted';
  }

  return {
    profile,
    cap,
    tiers,
    stage,
    cutIds,
    short,
    sequence,
    dropped: trimmed.dropped,
    lines: trimmed.remaining,
    length: trimmed.length,
    warnings,
    lengths: { pre: textLength(pre.soulLines), a: textLength(cut.lines), b: textLength(shortLines), floor },
  };
}

// ---- Constructed souls ----------------------------------------------------------------------

interface Scenario {
  build: Build;
  lib: Library;
  pre: CompileResult;
  model: TierModel;
}

// A cloned library whose builder base line is lengthened or shortened so that one point of the
// pipeline (pre-length, after Tier A, after Tier B, or the floor after every drop) lands on
// `target` characters. Only the base line changes, so every point moves by the same amount; the
// result is checked, so a case can never be built by accident.
function scenario(build: Build, point: keyof TierModel['lengths'], target: number): Scenario {
  const before = modelTiers(preLength(build), build, library);
  const oldLen = library.bases.find((b) => b.id === build.base)!.baseLine.length;
  const newLen = oldLen + (target - before.lengths[point]);
  if (newLen < 1) throw new Error(`cannot place ${point} at ${target}: base line would be ${newLen} characters`);
  const lib = withBaseLineLength(library, build.base, newLen);
  const pre = preLength(build, lib);
  const model = modelTiers(pre, build, lib);
  if (model.lengths[point] !== target) {
    throw new Error(`construction: ${point} is ${model.lengths[point]}, wanted ${target}`);
  }
  return { build, lib, pre, model };
}

// ---- Assertions -----------------------------------------------------------------------------

// Restoring the last dropped line must put the soul back over the cap: proof that the
// pass stopped at the first point under it.
function expectStoppedAtFirstPointUnder(
  result: CompileResult,
  lib: Library,
  droppedIds: string[],
  cap: number,
): void {
  expect(droppedIds.length).toBeGreaterThan(0);
  const lastId = droppedIds[droppedIds.length - 1];
  const restored = result.length + candidateSize(lib, lastId);
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

// The length pass removed exactly the S1 drops and the Tier A cuts, nothing else. The S1 drops are
// all voice or chip-trigger lines, the cuts are all pack rules lines, and every other kind of line
// came through unchanged (chassis lines by record, since Tier B changes their form).
function expectOnlyCandidatesDropped(
  pre: CompileResult,
  result: CompileResult,
  droppedIds: string[],
  cutIds: string[] = [],
): void {
  const resultIds = new Set(result.soulLines.map((l) => canonId(l.id)));
  const lost = pre.soulLines.filter((l) => !resultIds.has(canonId(l.id))).map((l) => l.id);
  expect([...lost].sort()).toEqual([...droppedIds, ...cutIds].sort());

  const kindOf = new Map(pre.soulLines.map((l) => [l.id, l.kind]));
  for (const id of droppedIds) {
    expect(DROPPABLE_KINDS, `kind of dropped ${id}`).toContain(kindOf.get(id));
  }
  for (const id of cutIds) {
    expect(kindOf.get(id), `kind of cut ${id}`).toBe('pack-rule');
  }

  for (const kind of NEVER_DROPPED_KINDS) {
    const before = pre.soulLines.filter((l) => l.kind === kind).map((l) => l.id);
    const after = result.soulLines.filter((l) => l.kind === kind).map((l) => l.id);
    expect(after, `${kind} lines`).toEqual(before);
  }
  const chassisBefore = pre.soulLines.filter((l) => l.kind === 'chassis').map((l) => canonId(l.id));
  const chassisAfter = result.soulLines.filter((l) => l.kind === 'chassis').map((l) => canonId(l.id));
  expect(chassisAfter, 'chassis lines by record').toEqual(chassisBefore);
  const rulesBefore = pre.soulLines.filter((l) => l.kind === 'pack-rule').map((l) => l.id);
  const rulesAfter = result.soulLines.filter((l) => l.kind === 'pack-rule').map((l) => l.id);
  expect(rulesAfter, 'pack rules lines').toEqual(rulesBefore.filter((id) => !cutIds.includes(id)));
}

// Every chassis record, in the form the length pass left it, from the library tables: the
// profile's omitted lines are absent, every other always-on line is there once with the right id
// and text, and a conditional line (funny at 2 or more) has the right text when it is present.
function expectChassisForm(result: CompileResult, profile: Profile, lib: Library, form: 'full' | 'short'): void {
  for (const rec of lib.chassis.lines) {
    const expected = chassisTextFor(rec, profile, form);
    const found = result.soulLines.filter((l) => canonId(l.id) === rec.id);
    if (expected === null) {
      expect(found.map((l) => l.id), `${rec.id} omitted on ${profile.id}`).toEqual([]);
      continue;
    }
    if (rec.when !== undefined && found.length === 0) continue;
    expect(found.length, `${rec.id} on ${profile.id} appears once`).toBe(1);
    expect(found[0].id, `${rec.id} id in ${form} form`).toBe(expected.id);
    expect(found[0].text.replace(/^- /, ''), `${rec.id} text in ${form} form`).toBe(expected.text);
  }
}

// Lines that must be in every soul, derived from the library tables and the build, not
// from the compiler: always-on chassis (less the profile's null variants), the three
// drives, stat lines, peeves with a line, four examples, gate soul lines, on profiles with
// a rules section the rules block (gate rules, limits, Brian's pack rule, and every author
// pack rule that Tier A did not cut), pack triggers and every Work/Markets first trigger.
function expectProtectedLinesPresent(build: Build, lib: Library, result: CompileResult, cutIds: string[] = []): void {
  const profile = resolveProfile(build, lib);
  const ids = result.soulLines.map((l) => l.id);
  const dropped = droppedIdsOf(result.warnings);

  // Chassis: every always-on line, unless this profile's variant for it is null.
  const nulled = Object.entries(profile.chassisVariants)
    .filter(([, variant]) => variant === null)
    .map(([id]) => id);
  for (const line of lib.chassis.lines) {
    if (line.when !== undefined) continue;
    const present = ids.some((i) => canonId(i) === line.id);
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

  // Pack triggers: never cut, never dropped.
  for (const packId of build.packs) {
    for (const trigger of lib.packs.find((p) => p.id === packId)!.triggers) {
      expect(ids, `pack trigger ${trigger.id}`).toContain(trigger.id);
    }
  }

  // The rules block, on profiles that put one in the soul. Gate rules and limits always stay.
  // Brian's pack rules line always stays. An author line stays unless Tier A cut it; Tier A is the
  // only thing that removes one.
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
    for (const id of packRuleIdsOf(build, lib)) {
      if (BRIEF_RULE_IDS.includes(id)) {
        expect(ids, `Brian's rule ${id} is never cut`).toContain(id);
        expect(cutIds).not.toContain(id);
      } else if (cutIds.includes(id)) {
        expect(ids, `cut author rule ${id}`).not.toContain(id);
      } else {
        expect(ids, `author rule ${id} (Tier A did not cut it)`).toContain(id);
      }
    }
  } else {
    // No rules block in this soul: Tier A has nothing to cut.
    expect(cutIds).toEqual([]);
    expect(result.soulLines.filter((l) => l.kind === 'pack-rule')).toEqual([]);
  }

  // Work/Markets first triggers: never in a length drop, and in the soul unless the
  // dedupe pass folded them into something else (which it reports).
  for (const id of workMarketsFirstTriggerIds(build, lib)) {
    expect(dropped, `length drops ${id}`).not.toContain(id);
    const dedupedAway = result.warnings.some((w) => w.startsWith(`dedupe: dropped ${id} `));
    expect(ids.includes(id) || dedupedAway, `first trigger ${id}`).toBe(true);
  }
}

// AGENTS.md (OpenClaw, Hermes) keeps every rules line the library defines for the build, including
// the author lines Tier A cut from the soul. Muse and Dot have no AGENTS.md. SOUL.md is the soul.
function expectRulesFiles(build: Build, lib: Library, result: CompileResult): void {
  const profile = resolveProfile(build, lib);
  const agents = result.files.find((f) => f.path === 'AGENTS.md');
  if (profile.rulesDelivery !== 'AGENTS.md') {
    expect(agents, `no AGENTS.md on ${profile.id}`).toBeUndefined();
    return;
  }
  expect(agents, `AGENTS.md on ${profile.id}`).toBeDefined();
  const fileLines = agents!.content.split('\n');
  const fileIds = agents!.lines.map((l) => l.id);
  for (const rule of rulesLinesOf(build, lib)) {
    expect(fileLines.includes(`- ${rule.text}`), `AGENTS.md carries the text of ${rule.id}`).toBe(true);
    expect(fileIds.includes(rule.id), `AGENTS.md traces ${rule.id}`).toBe(true);
  }
  const soulFile = result.files.find((f) => f.path === 'SOUL.md');
  expect(soulFile?.content === result.soul, 'SOUL.md is the trimmed soul').toBe(true);
}

// One compile checked against the reference model: warnings in order, soul text line by line, line
// ids, length, exactly the modelled lines removed, the chassis in the form the model says, the
// protected lines, and AGENTS.md.
function checkAgainstModel(build: Build, lib: Library, pre: CompileResult, model: TierModel): CompileResult {
  const result = compile(build, lib);
  expect(lengthWarningsOf(result)).toEqual(model.warnings);
  expect(result.soul.split('\n')).toEqual(model.lines.map((l) => l.text));
  expect(result.soulLines.map((l) => l.id)).toEqual(model.lines.map((l) => l.id));
  expect(result.length).toBe(model.length);
  expect(droppedIdsOf(result.warnings)).toEqual(model.dropped);
  expect(result.warnings.filter((w) => w.includes('nothing left to drop')).length).toBe(
    model.stage === 'exhausted' ? 1 : 0,
  );
  expectChassisForm(result, model.profile, lib, model.short ? 'short' : 'full');
  expectOnlyCandidatesDropped(pre, result, model.dropped, model.cutIds);
  expectProtectedLinesPresent(build, lib, result, model.cutIds);
  expectRulesFiles(build, lib, result);
  return result;
}

// ---- Roster at the B1 caps ------------------------------------------------------------------

interface Combo {
  label: string;
  entryId: string;
  profile: SoulProfile;
  build: Build;
  pre: CompileResult;
  model: TierModel;
}

const COMBOS: Combo[] = SOUL_PROFILES.flatMap((profile) =>
  library.roster.map((entry): Combo => {
    const build = rosterBuild(entry.id, profile);
    const pre = preLength(build);
    return { label: `${entry.id} on ${profile.id}`, entryId: entry.id, profile, build, pre, model: modelTiers(pre, build, library) };
  }),
);

// Recomputed at the B1 caps (Muse and Hermes 4,000, OpenClaw and Dot 3,600) from the pre-length
// soul of each of the nine starters on each soul profile: "clean" fits as is, "tierA" fits once
// the author pack rules lines are cut, "tierB" is still over after the cuts (or has no rules block
// to cut from) and fits once the chassis is short. Rook is the one starter that needs Tier B: on
// Muse and Hermes after its four coding rules lines are cut, on OpenClaw and Dot with nothing to
// cut. No roster build needs a voice or trigger drop at these caps, and none stays over: the drop
// and exhaustion cases below are constructed.
const ROSTER_STAGES: Record<string, Record<string, Stage>> = {
  muse: { marty: 'tierA', june: 'tierA', rook: 'tierB', vera: 'clean', sol: 'clean', dash: 'clean', pip: 'clean', ink: 'clean', odds: 'tierA' },
  openclaw: { marty: 'clean', june: 'clean', rook: 'tierB', vera: 'clean', sol: 'clean', dash: 'clean', pip: 'clean', ink: 'clean', odds: 'clean' },
  hermes: { marty: 'tierA', june: 'tierA', rook: 'tierB', vera: 'clean', sol: 'clean', dash: 'clean', pip: 'clean', ink: 'clean', odds: 'tierA' },
  'chatgpt-dot': { marty: 'clean', june: 'clean', rook: 'tierB', vera: 'clean', sol: 'clean', dash: 'clean', pip: 'clean', ink: 'clean', odds: 'clean' },
};

const combosAt = (stage: Stage): Combo[] => COMBOS.filter((c) => ROSTER_STAGES[c.profile.id][c.entryId] === stage);

// Literal chassis text from chassis.json for the V29 checks, per profile. "present" lines are the
// short form (or the profile's own variant, which wins over the generic short form) and "absent"
// lines are the full forms plus whatever the profile omits.
const FULL_APPROVAL = "Anything that spends, sends, posts, signs, or can't be undone goes through an approval first.";
const SHORT_APPROVAL = 'Spend, send, post, sign, irreversible: approval first. Card: decision, cost, pick, 3 lines.';
const SHORT_NEVER_DONE = "Never say it's done unless you did it.";
const SHORT_CLASH = 'Honesty, then my instructions, then brevity, then jokes.';
const FULL_CLASH = 'Honesty first, then my instructions, then brevity, then jokes.';
const SHORT_CHECK = 'Before "I can\'t," check your tools. "I can\'t" means you looked.';
const SHORT_JUDGE = 'This file is judgment, memory is facts. No facts here.';
const SHORT_REFINE = 'If you refine this, tell me what and why. Never drop rules for ease.';
const SHORT_NO_SELF_EDIT = 'You never edit this file. Lessons go to memory.';
const SHORT_OUTRANK = 'AGENTS.md rules outrank this file in a conflict.';
const DOT_OUTRANK = 'Your custom rules in Settings outrank anything I say in chat.';
const DOT_CHECK = "Before you say you can't, check what you have on: web, files, code, your connected apps.";
const DOT_JUDGE = 'This message is how you judge. Memory is what you know. Never put a fact here.';

const SHORT_FORM_TEXT: Record<string, { present: string[]; absent: string[] }> = {
  muse: {
    present: [SHORT_APPROVAL, SHORT_NEVER_DONE, SHORT_CLASH, SHORT_CHECK, SHORT_JUDGE, SHORT_REFINE],
    absent: [FULL_APPROVAL, FULL_CLASH, SHORT_NO_SELF_EDIT, SHORT_OUTRANK, DOT_OUTRANK],
  },
  openclaw: {
    present: [SHORT_APPROVAL, SHORT_NEVER_DONE, SHORT_CLASH, SHORT_CHECK, SHORT_JUDGE, SHORT_NO_SELF_EDIT, SHORT_OUTRANK],
    absent: [FULL_APPROVAL, FULL_CLASH, SHORT_REFINE, DOT_OUTRANK],
  },
  hermes: {
    present: [SHORT_APPROVAL, SHORT_NEVER_DONE, SHORT_CLASH, SHORT_CHECK, SHORT_JUDGE, SHORT_NO_SELF_EDIT, SHORT_OUTRANK],
    absent: [FULL_APPROVAL, FULL_CLASH, SHORT_REFINE, DOT_OUTRANK],
  },
  'chatgpt-dot': {
    present: [SHORT_APPROVAL, SHORT_NEVER_DONE, SHORT_CLASH, DOT_OUTRANK, DOT_CHECK, DOT_JUDGE],
    absent: [FULL_APPROVAL, FULL_CLASH, SHORT_OUTRANK, SHORT_CHECK, SHORT_JUDGE, SHORT_NO_SELF_EDIT, SHORT_REFINE],
  },
};

function expectShortFormText(result: CompileResult, profile: SoulProfile): void {
  const { present, absent } = SHORT_FORM_TEXT[profile.id];
  for (const text of present) {
    expect(result.soul.includes(text), `${profile.id} soul has: ${text}`).toBe(true);
  }
  for (const text of absent) {
    expect(result.soul.includes(text), `${profile.id} soul lacks: ${text}`).toBe(false);
  }
}

describe('Length', () => {
  // ---- Caps and facts the tiers rest on ----------------------------------------------------

  it('B1 caps: Muse 4000, Hermes 4000, Grok 4000, OpenClaw 3600, ChatGPT Dot 3600; custom instructions free 1500, paid 5000', () => {
    const capFor = (target: TargetId, mode?: ChatgptMode, plan?: 'free' | 'paid') => {
      const entry = library.roster.find((r) => r.id === 'vera')!;
      const build = migrate(entry.build, { target, mode, plan });
      return capOf(resolveProfile(build, library), build);
    };
    expect(capFor('muse')).toBe(4000);
    expect(capFor('hermes')).toBe(4000);
    expect(capFor('grok')).toBe(4000);
    expect(capFor('openclaw')).toBe(3600);
    expect(capFor('chatgpt', 'dot')).toBe(3600);
    expect(capFor('chatgpt', 'instructions', 'free')).toBe(1500);
    expect(capFor('chatgpt', 'instructions', 'paid')).toBe(5000);
  });

  it('the four soul profiles carry the B1 caps in the profile table', () => {
    for (const profile of SOUL_PROFILES) {
      const build = rosterBuild('vera', profile);
      expect(capOf(resolveProfile(build, library), build), profile.id).toBe(SOUL_CAPS[profile.id]);
    }
  });

  it('Brian\'s pack rule is the only pack rules line with origin "brief"; every other rules line is an author line', () => {
    const brief = library.packs.flatMap((p) => p.rulesLines).filter((r) => r.origin === 'brief').map((r) => r.id);
    expect(brief).toEqual(['pack.perps.rule.1']);
    expect(brief).toEqual(BRIEF_RULE_IDS);
    // The constructed pack build carries Brian's line and the ten author lines written out above.
    expect(packRuleIdsOf(perpsBuild(MUSE), library).filter((id) => !BRIEF_RULE_IDS.includes(id))).toEqual(
      PERPS_AUTHOR_RULES,
    );
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

  // ---- The roster at the new caps ----------------------------------------------------------

  describe('the nine starters on the four soul profiles at the B1 caps', () => {
    it('recomputed outcomes: which fit as they are, which fit after Tier A, which need Tier B, and none needs a drop or stays over', () => {
      for (const c of COMBOS) {
        expect(c.model.stage, c.label).toBe(ROSTER_STAGES[c.profile.id][c.entryId]);
      }
      expect(combosAt('clean').length).toBeGreaterThan(0);
      expect(combosAt('tierA').length).toBeGreaterThan(0);
      expect(combosAt('tierB').length).toBeGreaterThan(0);
      expect(combosAt('drops')).toEqual([]);
      expect(combosAt('exhausted')).toEqual([]);
    });

    it('Tier A only has lines to cut on the profiles with a rules block: every roster Tier A fit is Muse or Hermes, and the Tier B fits are rook on all four', () => {
      for (const c of combosAt('tierA')) expect(RULES_IN_SOUL_PROFILES, c.label).toContain(c.profile);
      expect(combosAt('tierB').map((c) => c.label).sort()).toEqual(
        ['rook on chatgpt-dot', 'rook on hermes', 'rook on muse', 'rook on openclaw'],
      );
    });
  });

  // ---- A soul at or under the cap -----------------------------------------------------------

  describe('a soul that fits is left alone: no cuts, no short chassis, no drops, every rules line kept', () => {
    for (const c of combosAt('clean')) {
      it(`${c.label}: no length warnings, soul equals the pre-length soul, chassis in full form, author pack rules kept`, () => {
        const result = checkAgainstModel(c.build, library, c.pre, c.model);
        expect(lengthWarningsOf(result)).toEqual([]);
        expect(result.soul).toBe(c.pre.soul);
        expect(result.length).toBeLessThanOrEqual(SOUL_CAPS[c.profile.id]);
        expect(result.soulLines.some((l) => l.id.includes('#short'))).toBe(false);
        if (RULES_IN_SOUL_PROFILES.includes(c.profile)) {
          for (const id of packRuleIdsOf(c.build, library)) {
            expect(result.soulLines.map((l) => l.id), id).toContain(id);
          }
        }
      });
    }
  });

  // ---- Tier A ---------------------------------------------------------------------------------

  describe('Tier A: a soul over the cap loses every author pack rules line, and that alone is enough', () => {
    for (const c of combosAt('tierA')) {
      it(`${c.label}: pre-length soul over ${SOUL_CAPS[c.profile.id]}, all author lines cut with one warning each, chassis stays full, no short switch, no drops`, () => {
        const cap = SOUL_CAPS[c.profile.id];
        expect(c.model.lengths.pre).toBeGreaterThan(cap);
        expect(c.model.lengths.a).toBeLessThanOrEqual(cap);

        const authorIds = authorRuleIdsOf(c.build, library);
        expect(authorIds.length).toBeGreaterThan(0);

        const result = checkAgainstModel(c.build, library, c.pre, c.model);
        // Every author line, in soul order, nothing else.
        expect(c.model.cutIds).toEqual(authorIds);
        expect(lengthWarningsOf(result)).toEqual(
          authorIds.map((id) => `length: cut ${id} (author pack rule, soul over ${cap})`),
        );
        for (const id of authorIds) {
          expect(result.soulLines.map((l) => l.id), id).not.toContain(id);
        }
        expect(result.soulLines.some((l) => l.id.includes('#short'))).toBe(false);
        expect(result.warnings.some((w) => w.includes('chassis switched'))).toBe(false);
        expect(droppedIdsOf(result.warnings)).toEqual([]);
        expect(result.length).toBeLessThanOrEqual(cap);
      });
    }

    it('rook on hermes: the cut lines are gone from the soul and still all in AGENTS.md', () => {
      const c = COMBOS.find((x) => x.label === 'rook on hermes')!;
      const result = compile(c.build);
      const agents = result.files.find((f) => f.path === 'AGENTS.md')!;
      for (const id of authorRuleIdsOf(c.build, library)) {
        expect(result.soulLines.map((l) => l.id)).not.toContain(id);
        expect(agents.lines.map((l) => l.id)).toContain(id);
      }
      expect(agents.lines.filter((l) => l.kind === 'pack-rule').length).toBe(packRuleIdsOf(c.build, library).length);
    });

    it('rook on muse: no AGENTS.md exists, so the cut lines are simply not in the bundle personality', () => {
      const c = COMBOS.find((x) => x.label === 'rook on muse')!;
      const result = compile(c.build);
      expect(result.files.some((f) => f.path === 'AGENTS.md')).toBe(false);
      for (const id of authorRuleIdsOf(c.build, library)) {
        expect(result.soulLines.map((l) => l.id)).not.toContain(id);
      }
    });
  });

  // ---- Tier B on a soul with no rules block --------------------------------------------------

  describe('Tier B: when cutting the author lines is not enough (or there are none to cut), the chassis goes short and keeps the cuts', () => {
    for (const c of combosAt('tierB')) {
      const cap = SOUL_CAPS[c.profile.id];
      const hasRules = RULES_IN_SOUL_PROFILES.includes(c.profile);
      it(`${c.label}: over ${cap}${hasRules ? ', Tier A alone is not enough' : ', no rules block in the soul so Tier A cuts nothing'}; ${hasRules ? 'cut warnings first, then ' : ''}one "chassis switched" warning, chassis in short form, no drops`, () => {
        expect(c.model.lengths.pre).toBeGreaterThan(cap);
        expect(c.model.lengths.a).toBeGreaterThan(cap);
        expect(c.model.lengths.b).toBeLessThanOrEqual(cap);

        const result = checkAgainstModel(c.build, library, c.pre, c.model);
        const cutIds = hasRules ? authorRuleIdsOf(c.build, library) : [];
        expect(c.model.cutIds).toEqual(cutIds);
        expect(lengthWarningsOf(result)).toEqual([
          ...cutIds.map((id) => `length: cut ${id} (author pack rule, soul over ${cap})`),
          `length: chassis switched to short forms (soul over ${cap})`,
        ]);
        // Tier A's cuts stay cut after the switch.
        for (const id of cutIds) expect(result.soulLines.map((l) => l.id), id).not.toContain(id);
        expect(result.soulLines.some((l) => l.id.includes('#short'))).toBe(true);
        expect(droppedIdsOf(result.warnings)).toEqual([]);
        expectShortFormText(result, c.profile);
        expect(result.length).toBeLessThanOrEqual(cap);
      });
    }
  });

  // ---- The cap line -----------------------------------------------------------------------------

  describe('the cap line: at the cap is not over it, one over starts the tiers (cap lowered in a cloned library)', () => {
    // Dash has the sales pack (three author rules lines) and fits Muse and Hermes at 4,000 and
    // OpenClaw and Dot at 3,600 without any length step.
    for (const profile of SOUL_PROFILES) {
      const hasRules = RULES_IN_SOUL_PROFILES.includes(profile);
      const build = rosterBuild('dash', profile);
      const pre = preLength(build);
      const withCap = (cap: number): Library => {
        const lib: Library = structuredClone(library);
        lib.targets.profiles.find((p) => p.id === profile.id)!.lengthCap = cap;
        return lib;
      };

      it(`${profile.id}: cap equal to the soul length (${pre.length}): nothing cut, switched or dropped`, () => {
        const lib = withCap(pre.length);
        const model = modelTiers(pre, build, lib);
        expect(model.stage).toBe('clean');
        const result = checkAgainstModel(build, lib, pre, model);
        expect(lengthWarningsOf(result)).toEqual([]);
        expect(result.soul).toBe(pre.soul);
      });

      it(`${profile.id}: cap one under the soul length (${pre.length - 1}): ${hasRules ? 'every sales author line is cut (all three, though one would be enough), chassis stays full' : 'no rules block, so the short chassis is the only step'}`, () => {
        const cap = pre.length - 1;
        const lib = withCap(cap);
        const model = modelTiers(pre, build, lib);
        const result = checkAgainstModel(build, lib, pre, model);
        if (hasRules) {
          expect(model.stage).toBe('tierA');
          expect(lengthWarningsOf(result)).toEqual(
            ['pack.sales.rule.1', 'pack.sales.rule.2', 'pack.sales.rule.3'].map(
              (id) => `length: cut ${id} (author pack rule, soul over ${cap})`,
            ),
          );
          expect(result.soulLines.some((l) => l.id.includes('#short'))).toBe(false);
        } else {
          expect(model.stage).toBe('tierB');
          expect(lengthWarningsOf(result)).toEqual([`length: chassis switched to short forms (soul over ${cap})`]);
        }
        expect(result.length).toBeLessThanOrEqual(cap);
      });
    }
  });

  // ---- The 4,000 line --------------------------------------------------------------------------

  describe('the tiers apply on a cap of 4000 or less and not above it', () => {
    for (const profile of RULES_IN_SOUL_PROFILES) {
      it(`${profile.id}: the same soul, over a cap of 4001 only drops lines (no cut, no short); at a cap of 4000 it goes through Tier A`, () => {
        // Dash, its base line lengthened so the pre-length soul is 4002: over 4001 by 1, over 4000 by 2.
        const build = rosterBuild('dash', profile);
        const sc = scenario(build, 'pre', 4002);

        const above: Library = structuredClone(sc.lib);
        above.targets.profiles.find((p) => p.id === profile.id)!.lengthCap = 4001;
        const aboveModel = modelTiers(sc.pre, build, above);
        expect(aboveModel.tiers).toBe(false);
        const aboveResult = checkAgainstModel(build, above, sc.pre, aboveModel);
        expect(lengthWarningsOf(aboveResult).some((w) => w.startsWith('length: cut '))).toBe(false);
        expect(lengthWarningsOf(aboveResult).some((w) => w.includes('chassis switched'))).toBe(false);
        // S1 only: the first candidate (the last-tapped chip's voice line) drops and that covers the 1 extra character.
        expect(droppedIdsOf(aboveResult.warnings)).toEqual([DASH_DROP_SEQUENCE[0]]);
        expect(aboveResult.length).toBeLessThanOrEqual(4001);
        for (const id of packRuleIdsOf(build, library)) {
          expect(aboveResult.soulLines.map((l) => l.id), id).toContain(id);
        }
        expect(aboveResult.soulLines.some((l) => l.id.includes('#short'))).toBe(false);

        const atModel = modelTiers(sc.pre, build, sc.lib);
        expect(atModel.cap).toBe(4000);
        expect(atModel.tiers).toBe(true);
        const atResult = checkAgainstModel(build, sc.lib, sc.pre, atModel);
        expect(lengthWarningsOf(atResult)).toEqual(
          ['pack.sales.rule.1', 'pack.sales.rule.2', 'pack.sales.rule.3'].map(
            (id) => `length: cut ${id} (author pack rule, soul over 4000)`,
          ),
        );
        expect(droppedIdsOf(atResult.warnings)).toEqual([]);
      });
    }
  });

  // ---- Constructed souls, per profile ----------------------------------------------------------
  // The six-chip builder build with no peeves and the perps pack (Brian's rules line plus three
  // author lines), its builder base line lengthened in a cloned library so the soul lands where
  // each case needs it.

  describe('constructed souls (builder base line lengthened in a cloned library)', () => {
    for (const profile of SOUL_PROFILES) {
      const cap = SOUL_CAPS[profile.id];
      const hasRules = RULES_IN_SOUL_PROFILES.includes(profile);
      const authorCut = hasRules ? PERPS_AUTHOR_RULES : [];
      const cutWarnings = authorCut.map((id) => `length: cut ${id} (author pack rule, soul over ${cap})`);
      const shortWarning = `length: chassis switched to short forms (soul over ${cap})`;
      const build = perpsBuild(profile);

      describe(profile.id, () => {
        it('every one of the 14 S1 candidates is in the pre-length soul (so the sweeps below are not vacuous)', () => {
          const ids = preLength(build).soulLines.map((l) => l.id);
          for (const id of OVERFLOW_DROP_SEQUENCE) expect(ids, id).toContain(id);
          expect(expectedDropSequence(build, library)).toEqual(OVERFLOW_DROP_SEQUENCE);
        });

        it(`Tier A is not enough, Tier B is: ${hasRules ? 'author lines cut first (warnings first), then ' : ''}one "chassis switched" warning, short chassis, no drops, still under ${cap}`, () => {
          const sc = scenario(build, 'b', cap - 7);
          expect(sc.model.lengths.a).toBeGreaterThan(cap); // precondition: cutting alone does not fit
          expect(sc.model.stage).toBe('tierB');
          const result = checkAgainstModel(build, sc.lib, sc.pre, sc.model);
          expect(lengthWarningsOf(result)).toEqual([...cutWarnings, shortWarning]);
          expect(droppedIdsOf(result.warnings)).toEqual([]);
          expect(result.length).toBe(cap - 7);
          expectShortFormText(result, profile);
          // Tier A's cuts stay cut after the switch (V29), Brian's line stays.
          if (hasRules) {
            const ids = result.soulLines.map((l) => l.id);
            for (const id of PERPS_AUTHOR_RULES) expect(ids, id).not.toContain(id);
            expect(ids).toContain('pack.perps.rule.1');
          }
        });

        it('the short chassis is applied with the library short texts, and the profile\'s own variant wins over the generic short form (V29)', () => {
          const sc = scenario(build, 'b', cap - 7);
          const result = compile(build, sc.lib);
          const shortRecords = library.chassis.lines.filter((l) => l.short !== undefined);
          expect(shortRecords.length).toBeGreaterThan(0);
          expectChassisForm(result, resolveProfile(build, sc.lib), sc.lib, 'short');
          if (profile === CHATGPT_DOT) {
            // Dot has its own text for three chassis lines; the generic short forms must not replace it.
            const dot = resolveProfile(build, sc.lib);
            for (const id of ['chassis.rules.outrank', 'chassis.act.check', 'chassis.memory.judge']) {
              expect(typeof dot.chassisVariants[id], `${id} is a dot variant`).toBe('string');
              expect(result.soulLines.map((l) => l.id)).toContain(`${id}@chatgpt-dot`);
              expect(result.soulLines.map((l) => l.id)).not.toContain(`${id}#short`);
            }
          }
        });

        // S1 order after the tiers: Tier B puts the soul 1 over, then k - 1 candidates plus 1 over,
        // so exactly the first k candidates must drop, in the S1 order, stopping at the first point under.
        describe('S1 order holds for whatever still has to drop after the tiers', () => {
          for (let k = 1; k <= OVERFLOW_DROP_SEQUENCE.length; k++) {
            const first = OVERFLOW_DROP_SEQUENCE.slice(0, k);
            it(`soul over by ${k === 1 ? '1' : 'the first ' + (k - 1) + ' candidates plus 1'} after Tier B: drops exactly ${first[first.length - 1]} (${k} drop${k === 1 ? '' : 's'})`, () => {
              const over = 1 + OVERFLOW_DROP_SEQUENCE.slice(0, k - 1).reduce((n, id) => n + candidateSize(library, id), 0);
              const sc = scenario(build, 'b', cap + over);
              expect(sc.model.stage).toBe('drops');
              const result = checkAgainstModel(build, sc.lib, sc.pre, sc.model);
              expect(droppedIdsOf(result.warnings)).toEqual(first);
              expect(lengthWarningsOf(result)).toEqual([
                ...cutWarnings,
                shortWarning,
                ...first.map((id) => `length: dropped ${id} (soul over ${cap})`),
              ]);
              expect(result.length).toBeLessThanOrEqual(cap);
              expectStoppedAtFirstPointUnder(result, sc.lib, first, cap);
              for (const id of OVERFLOW_DROP_SEQUENCE.slice(k)) {
                expect(result.soulLines.map((l) => l.id), `undropped ${id}`).toContain(id);
              }
              expect(result.warnings.some((w) => w.includes('nothing left to drop'))).toBe(false);
            });
          }
        });

        it(`nothing fits (25 over after Tier A, Tier B and all 14 drops): every tier runs, every candidate drops in S1 order, the last length warning is "nothing left to drop", protected lines stay`, () => {
          const sc = scenario(build, 'floor', cap + 25);
          expect(sc.model.stage).toBe('exhausted');
          const result = checkAgainstModel(build, sc.lib, sc.pre, sc.model);
          expect(droppedIdsOf(result.warnings)).toEqual(OVERFLOW_DROP_SEQUENCE);

          const lengthWarnings = lengthWarningsOf(result);
          expect(lengthWarnings.length).toBe(cutWarnings.length + 1 + OVERFLOW_DROP_SEQUENCE.length + 1);
          expect(lengthWarnings.slice(0, cutWarnings.length)).toEqual(cutWarnings);
          expect(lengthWarnings[cutWarnings.length]).toBe(shortWarning);
          expect(lengthWarnings.slice(cutWarnings.length + 1, -1)).toEqual(
            OVERFLOW_DROP_SEQUENCE.map((id) => `length: dropped ${id} (soul over ${cap})`),
          );
          expect(lengthWarnings[lengthWarnings.length - 1]).toBe(
            `length: soul is ${result.length} characters, over ${cap} with nothing left to drop`,
          );
          expect(result.length).toBe(cap + 25);

          // The first trigger of every Work chip survives all of it, and so do pack triggers and Brian's rule.
          const ids = result.soulLines.map((l) => l.id);
          for (const id of ['chip.engineering.t1', 'chip.founder.t1', 'chip.sales.t1']) expect(ids).toContain(id);
          for (const packId of build.packs) {
            for (const t of library.packs.find((p) => p.id === packId)!.triggers) expect(ids).toContain(t.id);
          }
          if (hasRules) expect(ids).toContain('pack.perps.rule.1');
          expectShortFormText(result, profile);
        });
      });
    }
  });

  // ---- Exhaustion with no candidates and with huge base lines ---------------------------------

  describe('exhaustion cases', () => {
    for (const profile of SOUL_PROFILES) {
      const cap = SOUL_CAPS[profile.id];
      const hasRules = RULES_IN_SOUL_PROFILES.includes(profile);

      it(`${profile.id}: a build with no drop candidates and no packs, over ${cap} even in short chassis: the short switch and "nothing left to drop" are the only length warnings`, () => {
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
          { target: profile.target, mode: profile.mode },
        );
        const sc = scenario(build, 'b', cap + 25);
        expect(sc.model.sequence).toEqual([]);
        expect(sc.model.stage).toBe('exhausted');
        const result = checkAgainstModel(build, sc.lib, sc.pre, sc.model);
        expect(lengthWarningsOf(result)).toEqual([
          `length: chassis switched to short forms (soul over ${cap})`,
          `length: soul is ${result.length} characters, over ${cap} with nothing left to drop`,
        ]);
        expect(result.length).toBe(cap + 25);
      });

      if (hasRules) {
        it(`${profile.id}: perps only, no chips: the three author lines are cut, Brian's line stays, then the short switch, then "nothing left to drop"`, () => {
          const build: Build = {
            ...migrate(
              {
                v: 1,
                base: 'builder',
                chips: [],
                stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
                peeves: [],
                heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' },
                outfit: 'staff_engineer',
                name: 'Perps Only',
              },
              { target: profile.target, mode: profile.mode },
            ),
            packs: ['perps'],
          };
          const sc = scenario(build, 'b', cap + 25);
          expect(sc.model.stage).toBe('exhausted');
          const result = checkAgainstModel(build, sc.lib, sc.pre, sc.model);
          expect(lengthWarningsOf(result)).toEqual([
            `length: cut pack.perps.rule.2 (author pack rule, soul over ${cap})`,
            `length: cut pack.perps.rule.3 (author pack rule, soul over ${cap})`,
            `length: cut pack.perps.rule.4 (author pack rule, soul over ${cap})`,
            `length: chassis switched to short forms (soul over ${cap})`,
            `length: soul is ${result.length} characters, over ${cap} with nothing left to drop`,
          ]);
          const ids = result.soulLines.map((l) => l.id);
          expect(ids).toContain('pack.perps.rule.1');
          for (const t of library.packs.find((p) => p.id === 'perps')!.triggers) expect(ids).toContain(t.id);
          for (const limit of Object.keys(library.packs.find((p) => p.id === 'perps')!.limitsDefault)) {
            expect(ids).toContain(`limit.${limit}`);
          }
        });
      }

      for (const { starter, sequence } of NAMED_SEQUENCES) {
        it(`${starter} on ${profile.id}: nothing fits (25 over the floor), every hand-written S1 candidate drops in order, "nothing left to drop" is last`, () => {
          const build = rosterBuild(starter, profile);
          const sc = scenario(build, 'floor', cap + 25);
          const present = new Set(sc.pre.soulLines.map((l) => l.id));
          const candidates = sequence.filter((id) => present.has(id));
          expect(candidates.length).toBeGreaterThan(0);
          expect(sc.model.stage).toBe('exhausted');
          const result = checkAgainstModel(build, sc.lib, sc.pre, sc.model);
          expect(droppedIdsOf(result.warnings)).toEqual(candidates);
          const lengthWarnings = lengthWarningsOf(result);
          expect(lengthWarnings[lengthWarnings.length - 1]).toBe(
            `length: soul is ${result.length} characters, over ${cap} with nothing left to drop`,
          );
          expect(result.length).toBe(cap + 25);
        });
      }
    }

    it('six-chip builder build on Muse with a 4000-character base line: seven author lines cut, short chassis, all 14 candidates dropped in S1 order, every Work first trigger survives, "nothing left" is last and appears once', () => {
      const bigLib = inflatedLibrary();
      const build = overflowBuild();
      const pre = preLength(build, bigLib);
      const result = compile(build, bigLib);
      const ids = result.soulLines.map((l) => l.id);

      expect(pre.length).toBeGreaterThan(4000);
      const preIds = new Set(pre.soulLines.map((l) => l.id));
      for (const id of OVERFLOW_DROP_SEQUENCE) {
        expect(preIds.has(id), `pre-length soul has ${id}`).toBe(true);
      }

      // Hand-written: the coding and sales packs come from the engineering and sales chips.
      expect(build.packs).toEqual(['coding', 'sales']);
      const cuts = [
        'pack.coding.rule.1',
        'pack.coding.rule.2',
        'pack.coding.rule.3',
        'pack.coding.rule.4',
        'pack.sales.rule.1',
        'pack.sales.rule.2',
        'pack.sales.rule.3',
      ];
      const lengthWarnings = lengthWarningsOf(result);
      expect(lengthWarnings.length).toBe(cuts.length + 1 + 14 + 1);
      expect(lengthWarnings.slice(0, 7)).toEqual(cuts.map((id) => `length: cut ${id} (author pack rule, soul over 4000)`));
      expect(lengthWarnings[7]).toBe('length: chassis switched to short forms (soul over 4000)');
      expect(lengthWarnings.slice(8, 22)).toEqual(
        OVERFLOW_DROP_SEQUENCE.map((id) => `length: dropped ${id} (soul over 4000)`),
      );
      expect(lengthWarnings[22]).toBe(`length: soul is ${result.length} characters, over 4000 with nothing left to drop`);
      expect(result.warnings.filter((w) => w.includes('nothing left to drop')).length).toBe(1);

      expect(droppedIdsOf(result.warnings)).toEqual(expectedDropSequence(build, bigLib));
      for (const id of OVERFLOW_DROP_SEQUENCE) expect(ids).not.toContain(id);
      expect(result.length).toBeGreaterThan(4000);
      for (const id of ['chip.engineering.t1', 'chip.founder.t1', 'chip.sales.t1']) expect(ids).toContain(id);
      for (const id of workMarketsFirstTriggerIds(build, bigLib)) expect(ids).toContain(id);

      expectOnlyCandidatesDropped(pre, result, OVERFLOW_DROP_SEQUENCE, cuts);
      expectProtectedLinesPresent(build, bigLib, result, cuts);
      expectChassisForm(result, resolveProfile(build, bigLib), bigLib, 'short');
    });

    it('Markets chip and a multi-trigger Life chip: full S1 order including Markets index 2 and 1 and Life highest index first, after the author lines are cut and the chassis is short; Markets and Work first triggers survive', () => {
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
      const pre = preLength(build, bigLib);
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

      // Packs in build order: spot (from options), coding (from engineering).
      expect(build.packs).toEqual(['spot', 'coding']);
      const cuts = [
        'pack.spot.rule.1',
        'pack.spot.rule.2',
        'pack.spot.rule.3',
        'pack.coding.rule.1',
        'pack.coding.rule.2',
        'pack.coding.rule.3',
        'pack.coding.rule.4',
      ];
      const lengthWarnings = lengthWarningsOf(result);
      expect(lengthWarnings.slice(0, 7)).toEqual(cuts.map((id) => `length: cut ${id} (author pack rule, soul over 4000)`));
      expect(lengthWarnings[7]).toBe('length: chassis switched to short forms (soul over 4000)');

      const ids = result.soulLines.map((l) => l.id);
      expect(ids).toContain('chip.options.t1');
      expect(ids).toContain('chip.engineering.t1');
      expectOnlyCandidatesDropped(pre, result, droppedIds, cuts);
      expectProtectedLinesPresent(build, bigLib, result, cuts);
    });

    it('forced overflow (huge chaos base line) on Muse: no packs so nothing to cut, the short switch, every Pip candidate dropped in S1 order, soul stays over 4000 with "nothing left to drop", every protected line survives', () => {
      const overflowLib = withBaseLineLength(library, 'chaos', 4000);
      const build = rosterBuild('pip', MUSE);
      const pre = preLength(build, overflowLib);
      const result = compile(build, overflowLib);
      const droppedIds = droppedIdsOf(result.warnings);

      expect(build.packs).toEqual([]);
      expect(result.length).toBeGreaterThan(4000);
      const lengthWarnings = lengthWarningsOf(result);
      expect(lengthWarnings[0]).toBe('length: chassis switched to short forms (soul over 4000)');
      expect(lengthWarnings.some((w) => w.startsWith('length: cut '))).toBe(false);
      expect(lengthWarnings[lengthWarnings.length - 1]).toBe(
        `length: soul is ${result.length} characters, over 4000 with nothing left to drop`,
      );
      expect(result.warnings.filter((w) => w.includes('nothing left to drop')).length).toBe(1);

      // Every candidate Pip's chips can offer was dropped, in S1 order.
      const preIds = new Set(pre.soulLines.map((l) => l.id));
      expect(droppedIds).toEqual(expectedDropSequence(build, overflowLib).filter((id) => preIds.has(id)));
      expectOnlyCandidatesDropped(pre, result, droppedIds);
      expectProtectedLinesPresent(build, overflowLib, result);
      expectChassisForm(result, resolveProfile(build, overflowLib), overflowLib, 'short');
    });
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

    for (const profile of SOUL_PROFILES) {
      it(`${profile.id}: still all there when the soul cannot fit (perps build, every tier and drop spent)`, () => {
        const build = perpsBuild(profile);
        const sc = scenario(build, 'floor', SOUL_CAPS[profile.id] + 25);
        const result = compile(build, sc.lib);
        for (const packId of build.packs) {
          for (const trigger of library.packs.find((p) => p.id === packId)!.triggers) {
            expect(droppedIdsOf(result.warnings)).not.toContain(trigger.id);
            expect(result.soul.includes(trigger.line), `${trigger.id} text is in the soul`).toBe(true);
          }
        }
      });
    }
  });

  // ---- AGENTS.md keeps every rules line -------------------------------------------------------

  describe('AGENTS.md keeps every rules line, cut from the soul or not', () => {
    for (const profile of [OPENCLAW, HERMES]) {
      it(`${profile.id}: perps build with Tier A, Tier B and every drop spent: AGENTS.md still carries gates, limits, the three author lines and Brian's`, () => {
        const build = perpsBuild(profile);
        const sc = scenario(build, 'floor', SOUL_CAPS[profile.id] + 25);
        const result = compile(build, sc.lib);
        const agents = result.files.find((f) => f.path === 'AGENTS.md')!;
        expect(agents).toBeDefined();
        const content = agents.content;
        for (const id of [...PERPS_AUTHOR_RULES, ...BRIEF_RULE_IDS]) {
          const text = library.packs.flatMap((p) => p.rulesLines).find((r) => r.id === id)!.line;
          expect(content.includes(`- ${text}`), `AGENTS.md has ${id}`).toBe(true);
        }
        expectRulesFiles(build, sc.lib, result);
      });
    }
  });
});
