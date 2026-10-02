// Tests for three compiler passes: Dedupe, Contradictions, Length.
// Expected values are taken from docs/Build-a-Muse-Compiler-Library-v1.md,
// QUESTIONS.md (Q9, S1, Q15) and the library JSON text itself, never from
// compiler output.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import type { BuildV1, Library } from '../src/compiler/types.js';

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
function expectedD3Id(build: BuildV1): string {
  if (build.stats.risk === 4) return 'd3.risk4';
  if (build.base === 'parent') return 'd3.parent';
  if (build.base === 'student') return 'd3.student';
  return 'd3.default';
}

// Shared invariant: chassis lines with no `when`, the build's d1/d2/d3 drives,
// every stat line, every peeve-with-a-line, and the 4 example lines must all
// survive dedupe + contradictions + length, for any build.
function expectProtectedLinesPresent(build: BuildV1, lib: Library, ids: string[], soulLines: { kind: string }[]): void {
  for (const line of lib.chassis.lines) {
    if (line.when === undefined) {
      expect(ids).toContain(line.id);
    }
  }

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

  const exampleCount = soulLines.filter((l) => l.kind === 'example').length;
  expect(exampleCount).toBe(4);
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

// S1 length fixtures. The build below has six chips in this tap order:
// engineering, founder, sales (Work), gym, dog (Life), night_owl (Time).
function overflowBuild(): BuildV1 {
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

// S1 drop sequence, built from library data: voice lines in reverse tap order,
// then Life/Time triggers in reverse tap order (highest index first), then
// Work/Markets index 3 then 2 (array positions 2 then 1) in reverse tap order.
// A Work/Markets chip's first trigger is never in the sequence.
function expectedDropSequence(build: BuildV1, lib: Library): string[] {
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

// The same sequence written out by hand from the library tables (chip.night_owl has no voice line).
const EXPECTED_DROP_SEQUENCE = [
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

const WORK_MARKETS_FIRST_TRIGGERS = ['chip.engineering.t1', 'chip.founder.t1', 'chip.sales.t1'];

function droppedIdsOf(warnings: string[]): string[] {
  return warnings
    .map((w) => w.match(/^length: dropped (\S+) \(soul over 3600\)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
}

describe('Length', () => {
  it('compile(Rook) fits under 3600 and emits no length warnings', () => {
    const rookEntry = library.roster.find((r) => r.id === 'rook')!;
    const build = structuredClone(rookEntry.build);
    const result = compile(build);

    expect(result.length).toBeLessThanOrEqual(3600);
    expect(result.warnings.filter((w) => w.startsWith('length:'))).toEqual([]);
  });

  it('over-length build drops voice lines first, then Life/Time triggers, then Work/Markets index 2 and 1 (last-tapped first), keeps every Work/Markets first trigger, and ends at or under 3600', () => {
    const build = overflowBuild();

    // Sanity: the sequence built from library data matches the hand-written table.
    expect(expectedDropSequence(build, library)).toEqual(EXPECTED_DROP_SEQUENCE);

    const result = compile(build);
    const droppedIds = droppedIdsOf(result.warnings);

    expect(droppedIds.length).toBeGreaterThan(0);
    expect(droppedIds.length).toBeLessThanOrEqual(EXPECTED_DROP_SEQUENCE.length);
    expect(droppedIds).toEqual(EXPECTED_DROP_SEQUENCE.slice(0, droppedIds.length));

    // Dropped lines are really gone from the soul.
    const ids = result.soulLines.map((l) => l.id);
    for (const id of droppedIds) {
      expect(ids).not.toContain(id);
    }

    // Every Work/Markets chip keeps its first trigger. (This build stops dropping
    // before it reaches founder or engineering; the exhaustion test below forces
    // the whole candidate list so these are not vacuous.)
    for (const id of WORK_MARKETS_FIRST_TRIGGERS) {
      expect(ids).toContain(id);
    }

    expect(result.length).toBeLessThanOrEqual(3600);
    expect(result.warnings.some((w) => w.includes('nothing left to drop'))).toBe(false);

    expectProtectedLinesPresent(build, library, ids, result.soulLines);
  });

  it('Work/Markets build that is still over 3600 after every candidate drops: all 14 candidates dropped in S1 order, every Work/Markets first trigger survives, last length warning is "nothing left to drop"', () => {
    // Inflate the builder baseLine so the soul cannot get under 3600 by dropping
    // candidates. The chips, tap order and drop candidates are unchanged.
    const bigLib: Library = structuredClone(library);
    const builderBase = bigLib.bases.find((b) => b.id === 'builder')!;
    builderBase.baseLine = 'x'.repeat(4000);

    const build = overflowBuild();
    const result = compile(build, bigLib);
    const ids = result.soulLines.map((l) => l.id);

    // The full candidate list was dropped, in exactly S1 order, none skipped.
    const droppedIds = droppedIdsOf(result.warnings);
    expect(droppedIds).toEqual(EXPECTED_DROP_SEQUENCE);
    expect(droppedIds).toEqual(expectedDropSequence(build, bigLib));
    expect(droppedIds.length).toBe(14);
    for (const id of droppedIds) {
      expect(ids).not.toContain(id);
    }

    // Candidates ran out and the soul is still too long: every Work/Markets
    // chip's first trigger is still there anyway.
    expect(result.length).toBeGreaterThan(3600);
    for (const id of WORK_MARKETS_FIRST_TRIGGERS) {
      expect(ids).toContain(id);
    }
    for (const chipId of build.chips) {
      const chip = bigLib.chips.find((c) => c.id === chipId)!;
      if (chip.group === 'Work' || chip.group === 'Markets') {
        expect(ids).toContain(chip.triggers[0].id);
      }
    }

    // Warning order: 14 drop warnings, then exactly one nothing-left warning, last.
    const lengthWarnings = result.warnings.filter((w) => w.startsWith('length:'));
    expect(lengthWarnings.length).toBe(15);
    expect(lengthWarnings.slice(0, 14).every((w) => /^length: dropped \S+ \(soul over 3600\)$/.test(w))).toBe(true);
    expect(lengthWarnings[14]).toBe(
      `length: soul is ${result.length} characters, over 3600 with nothing left to drop`
    );
    expect(result.warnings[result.warnings.length - 1]).toBe(lengthWarnings[14]);

    expectProtectedLinesPresent(build, bigLib, ids, result.soulLines);
  });

  it('drops stop at the first point under 3600: restoring the last dropped line would put the soul back over', () => {
    const build = overflowBuild();
    const result = compile(build);
    const droppedIds = droppedIdsOf(result.warnings);
    expect(droppedIds.length).toBeGreaterThanOrEqual(5);
    const lastId = droppedIds[droppedIds.length - 1];
    const chipId = lastId.split('.')[1];
    const chip = library.chips.find((c) => c.id === chipId)!;
    const text = lastId.endsWith('.voice') ? chip.voice! : chip.triggers.find((t) => t.id === lastId)!.line;
    // A bullet line renders as "- <text>" and costs one joining newline.
    expect(result.length + ('- ' + text).length + 1).toBeGreaterThan(3600);
  });

  it('Markets chip and a multi-trigger Life chip: full S1 order including Markets index 2 and 1 and Life highest index first; Markets first trigger survives', () => {
    // Lead fix after two review rounds. Kids is the only Life chip with two
    // triggers in the library and Kid Guard always absorbs them, so a second dog
    // trigger is injected into a cloned library (test data, not library content).
    const bigLib: Library = structuredClone(library);
    bigLib.bases.find((b) => b.id === 'builder')!.baseLine = 'x'.repeat(4000);
    bigLib.chips.find((c) => c.id === 'dog')!.triggers.push({ id: 'chip.dog.t2', line: 'Test trigger two for the dog chip.' });
    const build: BuildV1 = {
      v: 1,
      base: 'builder',
      chips: ['memecoins', 'dog', 'engineering'],
      stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 2 },
      peeves: [],
      heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' },
      outfit: 'captain',
      name: 'Markets Test',
    };
    const result = compile(build, bigLib);
    expect(droppedIdsOf(result.warnings)).toEqual([
      'chip.engineering.voice',
      'chip.dog.voice',
      'chip.memecoins.voice',
      'chip.dog.t2',
      'chip.dog.t1',
      'chip.engineering.t3',
      'chip.engineering.t2',
      'chip.memecoins.t3',
      'chip.memecoins.t2',
    ]);
    const ids = result.soulLines.map((l) => l.id);
    expect(ids).toContain('chip.memecoins.t1');
    expect(ids).toContain('chip.engineering.t1');
  });

  describe('every roster build keeps every protected line', () => {
    for (const entry of library.roster) {
      it(`${entry.id}: chassis (always-on), drives, stats, peeves-with-a-line and all 4 examples survive`, () => {
        const build = structuredClone(entry.build);
        const result = compile(build);
        const ids = result.soulLines.map((l) => l.id);
        expectProtectedLinesPresent(build, library, ids, result.soulLines);
      });
    }
  });

  it('forced overflow (huge chaos baseLine): soul stays over 3600 with "nothing left to drop", and every protected line still survives', () => {
    const overflowLib: Library = structuredClone(library);
    const chaosBase = overflowLib.bases.find((b) => b.id === 'chaos')!;
    chaosBase.baseLine = 'x'.repeat(4000);

    const pipEntry = library.roster.find((r) => r.id === 'pip')!;
    const build = structuredClone(pipEntry.build);
    const result = compile(build, overflowLib);

    expect(result.length).toBeGreaterThan(3600);
    const lastWarning = result.warnings[result.warnings.length - 1];
    expect(lastWarning).toBe(`length: soul is ${result.length} characters, over 3600 with nothing left to drop`);
    expect(result.warnings.filter((w) => w.includes('nothing left to drop')).length).toBe(1);

    const ids = result.soulLines.map((l) => l.id);
    expectProtectedLinesPresent(build, overflowLib, ids, result.soulLines);
  });
});
