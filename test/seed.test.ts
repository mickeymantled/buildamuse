// Tests: pass 9 (seed). The memory sentence a user says to Muse.
//
// v2 shape: "Remember that " + clauses joined by ", " + ". " + hard part clause
//   + (domain nouns present ? " Ask me about " + nouns joined by " and " + tail : "").
// The clauses are, in order: every selected chip's seed (tap order), then every selected
// pack's seed lines (build.packs order, each pack's lines in file order). Chip and pack clauses
// get the same treatment: one trailing period removed, first letter lowercased unless the
// clause starts with the pronoun I. Domain nouns come from chips only (packs add none).
// Tail is " when you need it." for one noun and " when you need them." for two or more (S7).
// With no clauses at all the seed starts at the hard part clause (Q20).
//
// A v1 roster build compiles through migrate(), which derives packs from its chips
// (kids -> personal-ops, engineering -> coding, memecoins/solana -> memecoins,
// sales -> sales, prediction_markets -> prediction-markets, stocks/options -> spot).
//
// Expected text comes from the library tables (chips.json seed and domainNoun, packs/<id>.json
// seeds, heart.json seedClause) and from the brief, never from compiler output. Literal
// strings below are hand-derived from those tables; expectedSeed() recomputes the same thing
// from the library JSON as a second, independent oracle.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import type { Build, BuildV1, PackId } from '../src/compiler/types.js';

const EM_DASH = String.fromCharCode(0x2014);

function rosterEntry(id: string) {
  const entry = library.roster.find((r) => r.id === id);
  if (!entry) throw new Error(`roster entry "${id}" not found`);
  return entry;
}

function rosterBuild(id: string): BuildV1 {
  return structuredClone(rosterEntry(id).build);
}

// Minimal valid v1 build with a caller-chosen chip list. Hard part calmer, so the
// hard part clause is "The hard part right now is I need it calmer."
function minimalBuild(chips: string[]): BuildV1 {
  return {
    v: 1,
    base: 'chaos',
    chips,
    stats: { blunt: 1, warm: 1, funny: 1, chatty: 1, proactive: 1 },
    peeves: [],
    heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.1' },
    outfit: 'butler',
    name: 'Ada',
  };
}

// The same build as v2 with the pack list set by the caller, whatever the chips would derive.
function v2Build(chips: string[], packs: PackId[]): Build {
  return { ...migrate(minimalBuild(chips)), packs };
}

const CALMER_CLAUSE = 'The hard part right now is I need it calmer.';

// Mid-sentence form of a library clause: one trailing period removed, first letter lowercased
// unless the first word is the pronoun I (I, I'm, I've).
function midSentence(line: string): string {
  const body = line.endsWith('.') ? line.slice(0, -1) : line;
  const firstWord = body.split(/[\s']/)[0];
  return firstWord === 'I' ? body : body.charAt(0).toLowerCase() + body.slice(1);
}

function packLines(id: string): string[] {
  const pack = library.packs.find((p) => p.id === id);
  if (!pack) throw new Error(`pack "${id}" not found`);
  return pack.seeds.map((s) => s.line);
}

// Independent oracle: the seed for a v2 build, computed from the library tables.
function expectedSeed(build: Build): string {
  const clauses: string[] = [];
  const nouns: string[] = [];
  for (const chipId of build.chips) {
    const chip = library.chips.find((c) => c.id === chipId);
    if (!chip) throw new Error(`chip "${chipId}" not found`);
    if (chip.seed) clauses.push(midSentence(chip.seed));
    if (chip.domainNoun) nouns.push(chip.domainNoun);
  }
  for (const packId of build.packs) {
    for (const line of packLines(packId)) clauses.push(midSentence(line));
  }
  const hardPart = library.heart.hardParts.find((h) => h.id === build.heart.hardPart);
  if (!hardPart) throw new Error(`hard part "${build.heart.hardPart}" not found`);
  const head = clauses.length > 0 ? `Remember that ${clauses.join(', ')}. ` : '';
  const tail =
    nouns.length === 0
      ? ''
      : ` Ask me about ${nouns.join(' and ')} when you need ${nouns.length === 1 ? 'it' : 'them'}.`;
  return head + hardPart.seedClause + tail;
}

// Pack seed lines as they land mid-sentence, hand-transcribed from src/library/packs/<id>.json.
const PERSONAL_OPS = [
  'I approve in batches: I reply with the numbers I say yes to and the rest stay untouched',
  'I read your morning brief on my phone, so it has to fit on one screen',
  'I pay bills myself; I want them listed with amount and due date, not handled',
];
const CODING = [
  'I want every change reported with the files it touched and the lines added and removed',
  'I read a done claim literally, so I expect the test command you ran and its pass and fail counts',
  'I want the weekday standup in ten lines or fewer',
];
const MEMECOINS = [
  'my size and loss caps are percentages of the bankroll I name, not of what the wallet holds',
  'I treat any token that reaches me by DM, airdrop or reply as bait until I check it myself',
];
const SALES = [
  'I keep an opt-out list, and I never want a message sent to anyone on it',
  'I follow up at most twice per prospect, then I let the thread go',
];
const PREDICTION_MARKETS = [
  'I trade binary prediction markets, where a YES share pays 1 dollar, so 40 cents means 40 percent',
  'I judge every market by its resolution rules text, not by its title',
  'I want every market logged with my stated probability, the price and the final outcome',
];
const SPOT = [
  'I want a prep brief 7 days before any company I hold reports, not the morning of',
  'when you give me a number from a filing, I want the document name and section next to it',
];

describe('seed: library drift guard for the hand-transcribed pack clauses', () => {
  it('each constant equals the pack seed lines in src/library/packs, mid-sentence form', () => {
    // If this fails the library text changed: update the constants above, then the literals below.
    const table: [string, string[]][] = [
      ['personal-ops', PERSONAL_OPS],
      ['coding', CODING],
      ['memecoins', MEMECOINS],
      ['sales', SALES],
      ['prediction-markets', PREDICTION_MARKETS],
      ['spot', SPOT],
    ];
    for (const [id, expected] of table) {
      expect(packLines(id).map(midSentence), id).toEqual(expected);
    }
  });
});

describe('seed: roster builds with their derived packs', () => {
  it('June: pack personal-ops adds three clauses after the chip clauses, one noun', () => {
    expect(migrate(rosterBuild('june')).packs).toEqual(['personal-ops']);
    const { seed } = compile(rosterBuild('june'));
    expect(seed).toBe(
      "Remember that I have kids, I cook, I have a dog, I'm mostly on my phone, " +
        'I approve in batches: I reply with the numbers I say yes to and the rest stay untouched, ' +
        'I read your morning brief on my phone, so it has to fit on one screen, ' +
        'I pay bills myself; I want them listed with amount and due date, not handled. ' +
        'The hard part right now is too much at once. ' +
        'Ask me about the family calendar when you need it.',
    );
  });

  it('Rook: pack coding adds three clauses, two nouns use the plural ending', () => {
    expect(migrate(rosterBuild('rook')).packs).toEqual(['coding']);
    const { seed } = compile(rosterBuild('rook'));
    expect(seed).toBe(
      "Remember that I'm an engineer, I run a company, I game, I'm up late, " +
        'I want every change reported with the files it touched and the lines added and removed, ' +
        'I read a done claim literally, so I expect the test command you ran and its pass and fail counts, ' +
        'I want the weekday standup in ten lines or fewer. ' +
        'The hard part right now is I need my work checked. ' +
        'Ask me about the codebase and the company when you need them.',
    );
  });

  it('Vera: no pack, so the seed is the chip clauses only, "My days" lowercased, singular ending', () => {
    expect(migrate(rosterBuild('vera')).packs).toEqual([]);
    const { seed } = compile(rosterBuild('vera'));
    expect(seed).toBe(
      "Remember that I'm a lawyer, my days are meetings. " +
        'The hard part right now is I need my work checked. ' +
        'Ask me about my matters when you need it.',
    );
  });

  it('Marty: hard part forget, pack memecoins once (memecoins and solana share it), "My size" lowercased', () => {
    const marty = rosterBuild('marty');
    expect(marty.heart.hardPart).toBe('forget');
    expect(migrate(marty).packs).toEqual(['memecoins']);
    const { seed } = compile(marty);
    expect(seed).toBe(
      "Remember that I trade memecoins, I'm mostly on Solana, I follow the NBA, I'm up late, " +
        'my size and loss caps are percentages of the bankroll I name, not of what the wallet holds, ' +
        'I treat any token that reaches me by DM, airdrop or reply as bait until I check it myself. ' +
        'The hard part right now is I forget things. ' +
        'Ask me about my positions when you need it.',
    );
    // The pack ships once even though two chips map to it.
    expect(seed.split('my size and loss caps').length - 1).toBe(1);
  });

  it('Dash: pack sales, two nouns, chip clauses first', () => {
    expect(migrate(rosterBuild('dash')).packs).toEqual(['sales']);
    const { seed } = compile(rosterBuild('dash'));
    expect(seed).toBe(
      "Remember that I run a company, I'm in sales, my days are meetings, " +
        'I keep an opt-out list, and I never want a message sent to anyone on it, ' +
        'I follow up at most twice per prospect, then I let the thread go. ' +
        'The hard part right now is too much at once. ' +
        'Ask me about the company and my pipeline when you need them.',
    );
  });

  it('Odds: two packs in derived order, a pack line starting "When" is lowercased, no nouns so no tail', () => {
    expect(migrate(rosterBuild('odds')).packs).toEqual(['prediction-markets', 'spot']);
    const { seed } = compile(rosterBuild('odds'));
    expect(seed).toBe(
      "Remember that I trade prediction markets, I invest in stocks, I'm up early, " +
        'I trade binary prediction markets, where a YES share pays 1 dollar, so 40 cents means 40 percent, ' +
        'I judge every market by its resolution rules text, not by its title, ' +
        'I want every market logged with my stated probability, the price and the final outcome, ' +
        'I want a prep brief 7 days before any company I hold reports, not the morning of, ' +
        'when you give me a number from a filing, I want the document name and section next to it. ' +
        'The hard part right now is I need to talk things through.',
    );
    expect(seed).not.toContain('Ask me about');
  });

  it('starters with no derived pack keep the chip-only seed (Pip, Sol, Ink)', () => {
    for (const id of ['pip', 'sol', 'ink']) {
      expect(migrate(rosterBuild(id)).packs, id).toEqual([]);
      expect(compile(rosterBuild(id)).seed, id).toBe(expectedSeed(migrate(rosterBuild(id))));
    }
  });

  it('every roster starter matches the library-computed seed', () => {
    for (const entry of library.roster) {
      const build = migrate(structuredClone(entry.build));
      expect(compile(structuredClone(entry.build)).seed, entry.id).toBe(expectedSeed(build));
    }
  });
});

describe('seed: the same on every profile', () => {
  it('every golden spec (6 profiles, ChatGPT modes, role sets) yields its starter seed', () => {
    for (const spec of GOLDEN_SPECS) {
      const build = buildFor(spec, library);
      expect(compile(build).seed, spec.id).toBe(expectedSeed(build));
    }
  });

  it('June on the muse profile says the same sentence as the v1 path', () => {
    const viaV1 = compile(rosterBuild('june')).seed;
    const viaV2 = compile(migrate(rosterBuild('june'), { target: 'muse' })).seed;
    expect(viaV2).toBe(viaV1);
  });
});

describe('seed: pack clauses', () => {
  it('chip clauses, then pack clauses, then the hard part, then the nouns tail', () => {
    const { seed } = compile(rosterBuild('june'));
    const lastChip = seed.indexOf("I'm mostly on my phone");
    const firstPack = seed.indexOf(PERSONAL_OPS[0]);
    const lastPack = seed.indexOf(PERSONAL_OPS[2]);
    const hardPart = seed.indexOf('The hard part right now');
    const tail = seed.indexOf('Ask me about');
    expect(lastChip).toBeGreaterThan(-1);
    expect(firstPack).toBeGreaterThan(lastChip);
    expect(lastPack).toBeGreaterThan(firstPack);
    expect(hardPart).toBeGreaterThan(lastPack);
    expect(tail).toBeGreaterThan(hardPart);
  });

  it('pack clauses are joined to the chip clauses with ", " and to each other with ", "', () => {
    const { seed } = compile(rosterBuild('june'));
    expect(seed).toContain(`I'm mostly on my phone, ${PERSONAL_OPS[0]}, ${PERSONAL_OPS[1]}, ${PERSONAL_OPS[2]}. `);
  });

  it('a pack clause that starts with I stays capitalized, one that does not is lowercased', () => {
    const { seed } = compile(rosterBuild('marty'));
    expect(seed).toContain(', my size and loss caps are');
    expect(seed).not.toContain(', My size');
    expect(seed).toContain(', I treat any token that reaches me');
  });

  it('pack clauses lose their trailing period, no doubled periods or period-comma', () => {
    for (const id of ['june', 'rook', 'marty', 'dash', 'odds']) {
      const { seed } = compile(rosterBuild(id));
      expect(seed, id).not.toContain('..');
      expect(seed, id).not.toMatch(/\.,/);
      expect(seed, id).not.toMatch(/\. [a-z]/);
      expect(seed, id).not.toContain(EM_DASH);
    }
  });

  it('colons and semicolons inside a pack clause are kept as written', () => {
    const { seed } = compile(rosterBuild('june'));
    expect(seed).toContain('I approve in batches: I reply');
    expect(seed).toContain('I pay bills myself; I want them');
  });

  it('no chips, one pack: the pack clauses alone make the "Remember that" sentence, no tail', () => {
    const { seed } = compile(v2Build([], ['coding']));
    expect(seed).toBe(`Remember that ${CODING.join(', ')}. ${CALMER_CLAUSE}`);
    expect(seed).not.toContain('Ask me about');
  });

  it('a pack adds no domain noun: one chip noun plus a pack still ends "when you need it."', () => {
    const { seed } = compile(v2Build(['law'], ['coding']));
    expect(seed).toBe(
      `Remember that I'm a lawyer, ${CODING.join(', ')}. ${CALMER_CLAUSE} ` +
        'Ask me about my matters when you need it.',
    );
  });

  it('explicit empty packs: a chip with a seed still gets its clause, no pack clauses', () => {
    const { seed } = compile(v2Build(['dog'], []));
    expect(seed).toBe(`Remember that I have a dog. ${CALMER_CLAUSE}`);
  });

  it('packs follow build.packs order, not library order', () => {
    const forward = compile(v2Build([], ['prediction-markets', 'spot'])).seed;
    const reversed = compile(v2Build([], ['spot', 'prediction-markets'])).seed;
    expect(forward).toBe(`Remember that ${[...PREDICTION_MARKETS, ...SPOT].join(', ')}. ${CALMER_CLAUSE}`);
    expect(reversed).toBe(`Remember that ${[...SPOT, ...PREDICTION_MARKETS].join(', ')}. ${CALMER_CLAUSE}`);
  });

  it('three packs: all eight clauses, in pack order, each pack in file order', () => {
    const { seed } = compile(v2Build([], ['personal-ops', 'coding', 'sales']));
    expect(seed).toBe(
      `Remember that ${[...PERSONAL_OPS, ...CODING, ...SALES].join(', ')}. ${CALMER_CLAUSE}`,
    );
  });

  it('chip clauses all come before pack clauses even when the chips are tapped after the pack was picked', () => {
    const { seed } = compile(v2Build(['dog', 'gym'], ['coding']));
    expect(seed).toBe(`Remember that I have a dog, I train, ${CODING.join(', ')}. ${CALMER_CLAUSE}`);
  });

  it('a chip and its pack twin both land: chip seed and the pack seed lines', () => {
    const { seed } = compile(v2Build(['sales'], ['sales']));
    expect(seed).toBe(
      `Remember that I'm in sales, ${SALES.join(', ')}. ${CALMER_CLAUSE} ` +
        'Ask me about my pipeline when you need it.',
    );
  });

  it('the hard part clause still follows a pack-only sentence for every hard part', () => {
    for (const hp of library.heart.hardParts) {
      const build = v2Build([], ['memecoins']);
      build.heart = { hardPart: hp.id, d1: hp.d1, d2: 'd2.blunt.1' };
      expect(compile(build).seed, hp.id).toBe(`Remember that ${MEMECOINS.join(', ')}. ${hp.seedClause}`);
    }
  });
});

describe('seed: record ids behind the memory sentence on muse', () => {
  function museMemoryIds(build: Build): string[] {
    const item = compile(build).spoken.find((s) => s.label === 'Memory sentence');
    if (!item) throw new Error('no Memory sentence spoken item on the muse profile');
    return item.ids;
  }

  it('June: chip ids in tap order, then the pack seed ids, then the hard part id', () => {
    const build = migrate(rosterBuild('june'), { target: 'muse' });
    const ids = museMemoryIds(build);
    expect(ids.slice(1)).toEqual([
      'chip.kids.seed',
      'chip.cooking.seed',
      'chip.dog.seed',
      'chip.phone.seed',
      'pack.personal-ops.seed.1',
      'pack.personal-ops.seed.2',
      'pack.personal-ops.seed.3',
      'heart.too_much.seedClause',
    ]);
    // Pack ids are the library's own record ids.
    const libraryIds = library.packs.find((p) => p.id === 'personal-ops')?.seeds.map((s) => s.id);
    expect(ids.slice(5, 8)).toEqual(libraryIds);
  });

  it('muse says the seed itself as the memory sentence', () => {
    const build = migrate(rosterBuild('marty'), { target: 'muse' });
    const item = compile(build).spoken.find((s) => s.label === 'Memory sentence');
    expect(item?.text).toBe(compile(build).seed);
  });

  it('Marty: the pack seed ids appear once, between the chip ids and the hard part id', () => {
    const ids = museMemoryIds(migrate(rosterBuild('marty'), { target: 'muse' }));
    expect(ids.slice(1)).toEqual([
      'chip.memecoins.seed',
      'chip.solana.seed',
      'chip.nba.seed',
      'chip.night_owl.seed',
      'pack.memecoins.seed.1',
      'pack.memecoins.seed.2',
      'heart.forget.seedClause',
    ]);
  });

  it('Vera: no pack ids at all', () => {
    const ids = museMemoryIds(migrate(rosterBuild('vera'), { target: 'muse' }));
    expect(ids.slice(1)).toEqual(['chip.law.seed', 'chip.meetings.seed', 'heart.check_my_work.seedClause']);
  });
});

describe('seed: no domain nouns', () => {
  it('chips dog and gym produce no "Ask me about" tail', () => {
    const { seed } = compile(minimalBuild(['dog', 'gym']));
    expect(seed).not.toContain('Ask me about');
    expect(seed).toBe(`Remember that I have a dog, I train. ${CALMER_CLAUSE}`);
  });
});

describe('seed: no chips', () => {
  it('seed equals the hard part seed clause exactly', () => {
    const build = minimalBuild([]);
    const hardPart = library.heart.hardParts.find((h) => h.id === build.heart.hardPart);
    if (!hardPart) throw new Error('hard part not found in heart.json');
    expect(migrate(build).packs).toEqual([]);
    const { seed } = compile(build);
    expect(seed).toBe(hardPart.seedClause);
    expect(seed).toBe(CALMER_CLAUSE);
    expect(seed).not.toContain('Remember that');
    expect(seed).not.toContain('Ask me about');
  });

  it('every hard part with no chips and no packs yields exactly its own seed clause', () => {
    for (const hp of library.heart.hardParts) {
      const build = minimalBuild([]);
      build.heart = { hardPart: hp.id, d1: hp.d1, d2: 'd2.blunt.1' };
      expect(compile(build).seed).toBe(hp.seedClause);
    }
  });

  it('a v2 build with chips [] and packs [] on a non-muse profile is also just the hard part clause', () => {
    for (const target of ['openclaw', 'hermes', 'grok'] as const) {
      const build = migrate(minimalBuild([]), { target });
      expect(build.packs).toEqual([]);
      expect(compile(build).seed, target).toBe(CALMER_CLAUSE);
    }
  });
});

describe('seed: domain noun endings and joining', () => {
  it('one noun ends "when you need it."', () => {
    const { seed } = compile(minimalBuild(['law']));
    expect(seed).toBe(
      `Remember that I'm a lawyer. ${CALMER_CLAUSE} Ask me about my matters when you need it.`,
    );
  });

  it('two nouns join with " and " and end "when you need them." (sales chip brings the sales pack clauses)', () => {
    const { seed } = compile(minimalBuild(['law', 'sales']));
    expect(seed).toBe(
      `Remember that I'm a lawyer, I'm in sales, ${SALES.join(', ')}. ${CALMER_CLAUSE} ` +
        'Ask me about my matters and my pipeline when you need them.',
    );
  });

  it('two nouns, no pack: law and founder', () => {
    const { seed } = compile(minimalBuild(['law', 'founder']));
    expect(seed).toBe(
      `Remember that I'm a lawyer, I run a company. ${CALMER_CLAUSE} ` +
        'Ask me about my matters and the company when you need them.',
    );
  });

  it('three nouns join with " and " between each and end "when you need them."', () => {
    const { seed } = compile(minimalBuild(['law', 'sales', 'founder']));
    expect(seed).toContain(
      'Ask me about my matters and my pipeline and the company when you need them.',
    );
    expect(seed.endsWith('when you need them.')).toBe(true);
  });

  it('nouns and clauses follow tap order', () => {
    const { seed } = compile(minimalBuild(['founder', 'law']));
    expect(seed).toBe(
      `Remember that I run a company, I'm a lawyer. ${CALMER_CLAUSE} ` +
        'Ask me about the company and my matters when you need them.',
    );
  });

  it('chips without a noun do not add to the noun list', () => {
    const { seed } = compile(minimalBuild(['dog', 'kids', 'gym']));
    expect(seed).toContain('Ask me about the family calendar when you need it.');
    expect(seed).not.toContain('when you need them.');
  });
});

describe('seed: clause casing and punctuation', () => {
  it('lowercases a clause that does not start with the pronoun I', () => {
    const { seed } = compile(minimalBuild(['meetings']));
    expect(seed).toBe(`Remember that my days are meetings. ${CALMER_CLAUSE}`);
  });

  it('keeps a clause starting with I or I\'m capitalized', () => {
    const { seed } = compile(minimalBuild(['dog', 'phone']));
    expect(seed.startsWith("Remember that I have a dog, I'm mostly on my phone. ")).toBe(true);
  });

  it('chip clauses lose their trailing period, so no doubled periods', () => {
    for (const entry of library.roster) {
      const { seed } = compile(structuredClone(entry.build));
      expect(seed).not.toContain('..');
      expect(seed).not.toContain(', .');
      expect(seed).not.toContain(EM_DASH);
    }
  });

  it('seed ends with a period for every roster build', () => {
    for (const entry of library.roster) {
      const { seed } = compile(structuredClone(entry.build));
      expect(seed.endsWith('.')).toBe(true);
    }
  });
});
