// Rules test: every row of the if-this-then-this table (docs/Build-a-Muse-Compiler-Library-v1.md,
// "If-this-then-this") expressed as a build and an assertion. UI rules are M2 (frontend); they are
// recorded as it.todo so the table and the test file stay in sync until the UI exists. Emit rules
// (compiler) get one it per row, named with the row text, exercising the actual compile() output.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import type { Build, Library } from '../src/compiler/types.js';

// Builds a valid Build with sane defaults (stats sum well under the cap, no risk unless a
// Markets chip and stats.risk are both supplied, a hard part whose own d1 is used unless
// overridden). Every field can be overridden per test.
function makeBuild(opts: {
  base?: Build['base'];
  chips?: string[];
  stats?: Partial<Build['stats']>;
  peeves?: string[];
  hardPart?: string;
  d1?: string;
  d2?: string;
  outfit?: string;
  name?: string;
} = {}): Build {
  return {
    v: 1,
    base: opts.base ?? 'trader',
    chips: opts.chips ?? [],
    stats: {
      blunt: 2,
      warm: 2,
      funny: 2,
      chatty: 2,
      proactive: 2,
      ...opts.stats,
    },
    peeves: opts.peeves ?? [],
    heart: {
      hardPart: (opts.hardPart ?? 'calmer') as Build['heart']['hardPart'],
      d1: opts.d1 ?? 'd1.calmer',
      d2: opts.d2 ?? 'd2.blunt.2',
    },
    outfit: opts.outfit ?? 'butler',
    name: opts.name ?? 'Test',
  };
}

describe('UI rules', () => {
  // The frontend runs these on every tap or slide. The UI does not exist until M2, so these
  // are recorded as todos, named "<If> -> <Then> (M2 UI)", straight from the library doc's table.
  it.todo('base chosen -> stats set to base defaults; chip group for that base shown first (M2 UI)');
  it.todo('any Markets chip tapped -> Risk slider appears, default 2, cap stays 14 (M2 UI)');
  it.todo('all Markets chips removed -> Risk slider hidden, its points returned (M2 UI)');
  it.todo("kids chip tapped -> Proactive default +1 (only if user hasn't moved it) (M2 UI)");
  it.todo('stats total = 14 -> remaining sliders can\'t go up; UI says "full" (M2 UI)');
  it.todo(
    'blunt or warm at 1 -> slider stops; line "every Muse comes with a little honesty and a little care already in" (M2 UI)',
  );
  it.todo("chips = 6 -> grid disables further taps; counter shows 6/6 (M2 UI)");
  it.todo('peeves = 5 -> same (M2 UI)');
  it.todo('badge condition met -> badge lights on the sidebar with its name (M2 UI)');
  it.todo('any change -> soul recompiles, length meter updates, certificate preview updates (M2 UI)');
  it.todo('length > 3,200 -> meter goes amber, tooltip "drop a chip to shorten" (M2 UI)');
});

describe('Emit rules (compiler)', () => {
  it('funny = 1 | no seasoning line, no seatbelt joke line, greeting example uses funny=1 row, no voice permissions emitted from Life chips', () => {
    const chatty1 = makeBuild({
      chips: ['gym', 'dog'],
      stats: { blunt: 3, warm: 1, funny: 1, chatty: 1, proactive: 2 },
      d2: 'd2.blunt.3',
    });
    const r1 = compile(chatty1);
    expect(r1.soul).toContain('You: Hi. What do you need?');
    expect(r1.soul).not.toContain('Training metaphors land.');
    expect(r1.soul).not.toContain('Dog references welcome.');

    const chatty2 = makeBuild({
      chips: ['gym', 'dog'],
      stats: { blunt: 3, warm: 1, funny: 1, chatty: 2, proactive: 2 },
      d2: 'd2.blunt.3',
    });
    const r2 = compile(chatty2);
    expect(r2.soul).toContain('You: Hi. What can I take off your plate?');
    expect(r2.soul).not.toContain('Training metaphors land.');
    expect(r2.soul).not.toContain('Dog references welcome.');
  });

  it('funny >= 2 | chassis "drop the bit when stressed" line emitted', () => {
    const b = makeBuild({ stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 } });
    const r = compile(b);
    expect(r.soul).toContain("If I'm stressed or down, drop the bit and be useful.");
  });

  it('risk = 4 | d3 = keep me in the game; Seatbelt badge line; risk=4 stat line', () => {
    const b = makeBuild({
      chips: ['memecoins'],
      stats: { blunt: 3, warm: 1, funny: 1, chatty: 1, proactive: 1, risk: 4 },
      d2: 'd2.blunt.3',
    });
    const r = compile(b);
    expect(r.soul).toContain(
      "To keep me in the game. Not my conscience, but you'd rather I never blow the account on one thing than that you got the call right.",
    );
    expect(r.soul).toContain("The only two words you say against a trade are \"chasing\" and \"rug.\"");
    expect(r.soul).toContain(
      "Same as 3, plus: the only two words you say against a trade are \"chasing\" and \"rug.\"",
    );
    expect(r.soul).not.toContain(
      "To keep me whole. Not my conscience, but you'd rather I'm still here next cycle than that you got the call right.",
    );
  });

  it('risk = 1 | Downside First badge line; risk=1 stat line', () => {
    const b = makeBuild({
      chips: ['memecoins'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 1 },
    });
    const r = compile(b);
    expect(r.soul).toContain('Before any trade, the downside in one line, then help.');
    expect(r.soul).toContain('Downside first, always. Warn before every trade. Suggest small.');
  });

  it('risk absent | no Trading subsection at all', () => {
    const b = makeBuild({ chips: [] });
    const r = compile(b);
    const tradingHeading = library.chassis.headings.find((h) => h.section === 'trading');
    expect(tradingHeading).toBeDefined();
    expect(r.soul).not.toContain(tradingHeading!.text);
  });

  it('chatty = 1 and engineering chip | Code First badge line', () => {
    const b = makeBuild({
      chips: ['engineering'],
      stats: { blunt: 1, warm: 1, funny: 1, chatty: 1, proactive: 1 },
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
      d2: 'd2.blunt.1',
    });
    const r = compile(b);
    expect(r.soul).toContain('Code first, prose after, no preamble.');
  });

  it('chatty >= 3 and (student or engineering) | Show Your Work badge line', () => {
    const withStudent = makeBuild({
      chips: ['student'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 3, proactive: 2 },
    });
    const rStudent = compile(withStudent);
    expect(rStudent.soul).toContain("Show the reasoning, then the answer. Numbered steps when there's a process.");

    const withEngineering = makeBuild({
      chips: ['engineering'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 3, proactive: 2 },
    });
    const rEngineering = compile(withEngineering);
    expect(rEngineering.soul).toContain(
      "Show the reasoning, then the answer. Numbered steps when there's a process.",
    );
  });

  it('hard_part = check_my_work | Second Look forced regardless of blunt', () => {
    const b = makeBuild({
      chips: [],
      stats: { blunt: 1, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      hardPart: 'check_my_work',
      d1: 'd1.check_my_work',
      d2: 'd2.blunt.1',
    });
    const r = compile(b);
    expect(r.soul).toContain('Nothing goes out without you offering a second look. Say "clean" or list what\'s off.');
  });

  it('hard_part = too_much | Triage line; d1 = keep the whole picture', () => {
    const b = makeBuild({
      chips: [],
      hardPart: 'too_much',
      d1: 'd1.too_much',
    });
    const r = compile(b);
    expect(r.soul).toContain('Tell me what needs attention now and what can wait, in that order.');
    expect(r.soul).toContain('To keep the whole picture. Everything on one board, nothing falling off it.');
  });

  it('base = parent | d3 = keep the family whole', () => {
    const b = makeBuild({
      base: 'parent',
      chips: [],
      stats: { blunt: 2, warm: 3, funny: 2, chatty: 2, proactive: 3 },
      hardPart: 'forget',
      d1: 'd1.forget',
    });
    const r = compile(b);
    expect(r.soul).toContain(
      "To keep the family whole. Not the boss of it, but you'd rather nothing important slips than that you were efficient.",
    );
  });

  it('base = student | d3 = keep me learning', () => {
    const b = makeBuild({
      base: 'student',
      chips: [],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 3, proactive: 2 },
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
    });
    const r = compile(b);
    expect(r.soul).toContain(
      "To keep me learning. Not a cheat code, but you'd rather I understand it than that I finish it.",
    );
  });

  it('peeve duplicates chassis | emit nothing, show checkmark', () => {
    const base = makeBuild({ chips: [] });
    const withoutPeeves = compile({ ...base, peeves: [] });
    const withPeeves = compile({
      ...base,
      peeves: ['great_question', 'uses_emoji', 'agrees_to_be_nice', 'asks_permission'],
    });
    expect(withPeeves.soul).toBe(withoutPeeves.soul);
  });

  it('peeve "options when I wanted an answer" and blunt >= 3 | emit nothing (No Menu covers it)', () => {
    const b = makeBuild({
      chips: [],
      stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      peeves: ['options_not_answer'],
      d2: 'd2.blunt.3',
    });
    const r = compile(b);
    expect(r.soul).not.toContain('Pick one. I asked you, not a menu.');
  });

  it('chip trigger duplicates badge line | emit once, badge name still shows', () => {
    const b = makeBuild({
      chips: ['memecoins'],
      stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 2 },
      d2: 'd2.blunt.3',
    });
    const r = compile(b);
    const target = "If I'm chasing, say \"you're chasing\" in the first line.";
    const occurrences = r.soul.split(target).length - 1;
    expect(occurrences).toBe(1);
    expect(r.badges).toContain('badge.chase_caller');
  });

  it('two Work chips both unlock Second Look | emit once, wording from the first tapped', () => {
    const b = makeBuild({
      chips: ['law', 'engineering'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 },
    });
    const r = compile(b);
    const target = 'Nothing goes out without you offering a second look. Say "clean" or list what\'s off.';
    const occurrences = r.soul.split(target).length - 1;
    expect(occurrences).toBe(1);
  });

  it('chip has d1_suggest | offer it beside hard_part d1 at heart station', () => {
    const withChip = makeBuild({
      chips: ['law'],
      hardPart: 'talk_it_through',
      d1: 'd1.chip.law',
    });
    const r = compile(withChip);
    expect(r.soul).toContain('- To catch it before it goes out.');

    const withoutChip = makeBuild({
      chips: [],
      hardPart: 'talk_it_through',
      d1: 'd1.chip.law',
    });
    expect(() => compile(withoutChip)).toThrow('heart.d1');
  });

  it('more than 3 chips carry skills | certificate shows first 3 skill sentences, "show more" for the rest', () => {
    const b = makeBuild({
      chips: ['law', 'engineering', 'founder', 'sales'],
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
    });
    const r = compile(b);
    expect(r.skills.length).toBe(3 + 3 + 3 + 3);
  });

  it('outfit chosen | anchor line first in Who you are, before base line', () => {
    const juneEntry = library.roster.find((entry) => entry.id === 'june');
    expect(juneEntry).toBeDefined();
    const r = compile(structuredClone(juneEntry!.build));
    expect(r.soul).toContain(
      "June. You're the friend who always has it together and somehow has time for you anyway. Most of what I bring you is the family calendar and everything that falls out of it.",
    );
  });

  it('no Work or Markets chip | example 2 uses the default (landlord) row', () => {
    const b = makeBuild({ chips: ['dog'] });
    const r = compile(b);
    expect(r.soul).toContain('Me: can you handle the thing with the landlord');
  });

  it('Chatty 1 and any "walk me through" chip line | drop the chip line', () => {
    const clonedLib = structuredClone(library) as Library;
    const teaching = clonedLib.chips.find((c) => c.id === 'teaching');
    if (!teaching) throw new Error('teaching chip missing from cloned library');
    teaching.triggers.push({ id: 'chip.teaching.t3', line: 'Walk me through the lesson plan.' });

    const chatty1 = makeBuild({
      chips: ['teaching'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 1, proactive: 2 },
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
    });
    const r1 = compile(chatty1, clonedLib);
    expect(r1.soul).not.toContain('Walk me through the lesson plan.');

    const chatty2 = makeBuild({
      chips: ['teaching'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      hardPart: 'talk_it_through',
      d1: 'd1.talk_it_through',
    });
    const r2 = compile(chatty2, clonedLib);
    expect(r2.soul).toContain('Walk me through the lesson plan.');
  });

  it('Funny 1 and any joke permission from a chip | drop the permission', () => {
    const funny1 = makeBuild({
      chips: ['gym'],
      stats: { blunt: 2, warm: 2, funny: 1, chatty: 2, proactive: 2 },
    });
    const r1 = compile(funny1);
    expect(r1.soul).not.toContain('Training metaphors land.');

    const funny2 = makeBuild({
      chips: ['gym'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 },
    });
    const r2 = compile(funny2);
    expect(r2.soul).toContain('Training metaphors land.');
  });
});
