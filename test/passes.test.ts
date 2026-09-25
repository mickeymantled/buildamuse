// Tests for three compiler passes: Dedupe, Contradictions, Length.
// Expected values are taken from docs/Build-a-Muse-Compiler-Library-v1.md,
// QUESTIONS.md (Q9, Q13, Q15) and the library JSON text itself, never from
// compiler output.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import type { Build, Library } from '../src/compiler/types.js';

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
function expectedD3Id(build: Build): string {
  if (build.stats.risk === 4) return 'd3.risk4';
  if (build.base === 'parent') return 'd3.parent';
  if (build.base === 'student') return 'd3.student';
  return 'd3.default';
}

// Shared invariant: chassis lines with no `when`, the build's d1/d2/d3 drives,
// every stat line, every peeve-with-a-line, and the 4 example lines must all
// survive dedupe + contradictions + length, for any build.
function expectProtectedLinesPresent(build: Build, lib: Library, ids: string[], soulLines: { kind: string }[]): void {
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
    const build: Build = {
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

    const buildAt = (blunt: 2 | 3): Build => ({
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
    const buildAt = (funny: 1 | 2): Build => ({
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

    const buildAt = (chatty: 1 | 2): Build => ({
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

describe('Length', () => {
  it('compile(Rook) fits under 3200, drops a prefix of [founder.t3, founder.t2, engineering.t3, engineering.t2] in order, and keeps both chips\' first trigger', () => {
    const rookEntry = library.roster.find((r) => r.id === 'rook')!;
    const build = structuredClone(rookEntry.build);
    const result = compile(build);

    expect(result.length).toBeLessThanOrEqual(3200);

    const expectedSequence = [
      'chip.founder.t3',
      'chip.founder.t2',
      'chip.engineering.t3',
      'chip.engineering.t2',
    ];
    const droppedIds = result.warnings
      .map((w) => w.match(/^length: dropped (\S+) /))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => m[1]);

    expect(droppedIds.length).toBeGreaterThan(0);
    expect(droppedIds.length).toBeLessThanOrEqual(expectedSequence.length);
    droppedIds.forEach((id, i) => {
      expect(id).toBe(expectedSequence[i]);
    });

    const ids = result.soulLines.map((l) => l.id);
    expect(ids).toContain('chip.engineering.t1');
    expect(ids).toContain('chip.founder.t1');
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

  it('forced overflow (huge chaos baseLine): soul stays over 3200 with "nothing left to drop", and every protected line still survives', () => {
    const overflowLib: Library = structuredClone(library);
    const chaosBase = overflowLib.bases.find((b) => b.id === 'chaos')!;
    chaosBase.baseLine = 'x'.repeat(4000);

    const pipEntry = library.roster.find((r) => r.id === 'pip')!;
    const build = structuredClone(pipEntry.build);
    const result = compile(build, overflowLib);

    expect(result.length).toBeGreaterThan(3200);
    const lastWarning = result.warnings[result.warnings.length - 1];
    expect(lastWarning).toMatch(/over 3200 with nothing left to drop/);

    const ids = result.soulLines.map((l) => l.id);
    expectProtectedLinesPresent(build, overflowLib, ids, result.soulLines);
  });
});
