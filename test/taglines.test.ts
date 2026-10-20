// Custom-build taglines (QUESTIONS B19, M5 plan K3): src/compiler/passes/tagline.ts and the
// certificate header in src/ui/certificate/model.ts.
//
// The rule (B19): "Your <first Work or Markets chip label, lowercase> <base noun>." with no chip of
// either group "Your <base noun>." Starters keep their hand-written taglines. The chip is the first
// one in tap order (the order of build.chips), as its label lowercased; the noun is the base noun
// lowercased.
//
// Expected text comes from the library tables, typed in below (bases.json nouns, chips.json labels
// and groups, roster.json taglines, names.json templates), never from running taglineOf and copying
// what it printed. A guard test per table fails if the library gains or renames a record, so the
// literals here and the library move together.

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { capOf, resolveProfile } from '../src/compiler/profile.js';
import { taglineOf } from '../src/compiler/passes/tagline.js';
import type { BaseId, Build, BuildCore, Library } from '../src/compiler/types.js';
import { certificateModel, starterIdOf } from '../src/ui/certificate/model.js';
import type { CertInput } from '../src/ui/certificate/model.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---------------------------------------------------------------------------
// Library tables, typed in
// ---------------------------------------------------------------------------

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

// names.json taglines (B19), verbatim.
const CHIP_TEMPLATE = 'Your {chip} {noun}.';
const BASE_TEMPLATE = 'Your {noun}.';

// bases.json: id to noun, lowercased (the nouns are "Trench Companion", "Reviewer", ...).
const BASE_NOUN: Record<string, string> = {
  trader: 'trench companion',
  builder: 'reviewer',
  professional: 'second chair',
  parent: 'playmaker',
  student: 'study partner',
  creator: 'editor',
  operator: 'chief of staff',
  chaos: 'fixer',
};

// chips.json: the chips whose group is Work or Markets, id to label lowercased.
const LEAD_CHIP: Record<string, string> = {
  // Work
  law: 'law',
  marketing: 'marketing',
  accounting: 'accounting / finance',
  sales: 'sales',
  medicine: 'medicine / nursing',
  engineering: 'engineering',
  founder: 'founder',
  real_estate: 'real estate',
  teaching: 'teaching',
  trades: 'trades',
  creative: 'creative',
  consulting: 'consulting',
  student: 'student',
  // Markets
  memecoins: 'memecoins',
  solana: 'solana',
  prediction_markets: 'prediction markets',
  options: 'options',
  stocks: 'stocks',
  crypto: 'crypto general',
};

// chips.json: every chip in the Life and Time groups. None of them can lead a tagline.
const OTHER_CHIPS = [
  'kids',
  'dog',
  'partner',
  'gym',
  'cooking',
  'nba',
  'gaming',
  'travel',
  'music',
  'night_owl',
  'early_riser',
  'meetings',
  'phone',
];

// roster.json: the hand-written tagline of each starter.
const STARTER_TAGLINE: Record<string, string> = {
  marty: 'Your terminally online memecoin desk.',
  june: "Runs the family calendar so you don't have to.",
  rook: 'Catches it before it ships.',
  vera: 'Never lets a draft go out hot.',
  sol: 'Explains it, then quizzes you.',
  dash: 'Tells you what every yes displaces.',
  pip: 'Remembers the thing you forgot.',
  ink: "Won't smooth your voice out.",
  odds: "Says what the crowd thinks, and whether it's wrong.",
};

// What each starter's picks would read as under the B19 rule, worked by hand from roster.json
// (base and chips in tap order), bases.json and chips.json. A starter that is changed in any way
// (name, slider, chip) loses its own tagline and gets this kind of line instead.
const STARTER_GENERATED: Record<string, string> = {
  marty: 'Your memecoins trench companion.', // trader; memecoins, solana, nba, night_owl
  june: 'Your playmaker.', // parent; kids, cooking, dog, phone (no Work or Markets chip)
  rook: 'Your engineering reviewer.', // builder; engineering, founder, gaming, night_owl
  vera: 'Your law second chair.', // professional; law, meetings
  sol: 'Your student study partner.', // student; student, music
  dash: 'Your founder chief of staff.', // operator; founder, sales, meetings
  pip: 'Your fixer.', // chaos; gym, cooking, dog, phone (no Work or Markets chip)
  ink: 'Your creative editor.', // creator; creative, music
  odds: 'Your prediction markets trench companion.', // trader; prediction_markets, stocks, early_riser
};

// Every target a starter can sit on, as the certificate model sees it.
const TARGETS: readonly { label: string; target: Build['target']; mode?: Build['mode']; plan?: Build['plan'] }[] = [
  { label: 'muse', target: 'muse' },
  { label: 'openclaw', target: 'openclaw' },
  { label: 'hermes', target: 'hermes' },
  { label: 'grok', target: 'grok' },
  { label: 'chatgpt dot', target: 'chatgpt', mode: 'dot' },
  { label: 'chatgpt gpt', target: 'chatgpt', mode: 'gpt' },
  { label: 'chatgpt instructions free', target: 'chatgpt', mode: 'instructions', plan: 'free' },
  { label: 'chatgpt instructions paid', target: 'chatgpt', mode: 'instructions', plan: 'paid' },
  { label: 'chatgpt project', target: 'chatgpt', mode: 'project' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function starter(id: string): Build {
  const entry = library.roster.find((r) => r.id === id);
  if (!entry) throw new Error(`no roster starter ${id}`);
  return migrate(structuredClone(entry.build), { target: 'muse' });
}

function starterCore(id: string): BuildCore {
  const entry = library.roster.find((r) => r.id === id);
  if (!entry) throw new Error(`no roster starter ${id}`);
  return structuredClone(entry.build);
}

// A build core with a given base and chips; everything else comes from Rook, and none of it matters
// to a tagline.
function core(base: string, chips: string[]): BuildCore {
  return { ...starterCore('rook'), base: base as BaseId, chips };
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

// A build with other chips that still compiles: the first drive falls back to the hard part's own
// (a chip's suggested drive may be gone), and risk follows the Markets rule (present iff a Markets chip).
function withChips(build: Build, chips: string[]): Build {
  const hardPart = library.heart.hardParts.find((h) => h.id === build.heart.hardPart);
  if (!hardPart) throw new Error(`no hard part ${build.heart.hardPart}`);
  const hasMarkets = chips.some((id) => library.chips.find((c) => c.id === id)?.group === 'Markets');
  const { risk, ...rest } = build.stats;
  return {
    ...build,
    chips,
    heart: { ...build.heart, d1: hardPart.d1 },
    stats: hasMarkets ? { ...rest, risk: risk ?? 2 } : rest,
  };
}

const taglineIn = (build: Build, over: Partial<CertInput> = {}): string | undefined =>
  certificateModel(inputFor(build, over)).header.tagline;

const expectedFor = (base: string, chips: readonly string[]): string => {
  const lead = chips.find((id) => id in LEAD_CHIP);
  const noun = BASE_NOUN[base];
  return lead === undefined ? `Your ${noun}.` : `Your ${LEAD_CHIP[lead]} ${noun}.`;
};

// ---------------------------------------------------------------------------
// Guards: the typed-in tables are the library's
// ---------------------------------------------------------------------------

describe('library tables behind the tagline expectations', () => {
  it('names.json holds the two B19 templates, verbatim', () => {
    expect(library.names.taglines.chip).toEqual({ id: 'tagline.chip', line: CHIP_TEMPLATE });
    expect(library.names.taglines.base).toEqual({ id: 'tagline.base', line: BASE_TEMPLATE });
  });

  it('the base nouns are the typed-in ones, for all eight bases', () => {
    expect(library.bases.map((b) => b.id).sort()).toEqual(Object.keys(BASE_NOUN).sort());
    for (const base of library.bases) expect(base.noun.toLowerCase(), base.id).toBe(BASE_NOUN[base.id]);
  });

  it('the Work and Markets chips are the typed-in ones, with their labels', () => {
    const lead = library.chips.filter((c) => c.group === 'Work' || c.group === 'Markets');
    expect(lead.map((c) => c.id).sort()).toEqual(Object.keys(LEAD_CHIP).sort());
    for (const chip of lead) expect(chip.label.toLowerCase(), chip.id).toBe(LEAD_CHIP[chip.id]);
  });

  it('every other chip is in Life or Time', () => {
    const others = library.chips.filter((c) => c.group !== 'Work' && c.group !== 'Markets');
    expect(others.map((c) => c.id).sort()).toEqual([...OTHER_CHIPS].sort());
    for (const chip of others) expect(['Life', 'Time']).toContain(chip.group);
  });

  it('the roster taglines are the typed-in ones, and each starter has a worked generated line', () => {
    expect(library.roster.map((r) => r.id).sort()).toEqual(Object.keys(STARTER_TAGLINE).sort());
    for (const entry of library.roster) {
      expect(entry.tagline, entry.id).toBe(STARTER_TAGLINE[entry.id]);
      // The worked generated line follows from the roster's base and chips under the B19 rule.
      expect(expectedFor(entry.build.base, entry.build.chips), entry.id).toBe(STARTER_GENERATED[entry.id]);
    }
  });
});

// ---------------------------------------------------------------------------
// taglineOf
// ---------------------------------------------------------------------------

describe('taglineOf: the chip form', () => {
  it('reads "Your memecoins trench companion." for the trader base and the memecoins chip', () => {
    expect(taglineOf(core('trader', ['memecoins']), library).text).toBe('Your memecoins trench companion.');
  });

  it('reads "Your law second chair." for the professional base and the law chip', () => {
    expect(taglineOf(core('professional', ['law']), library).text).toBe('Your law second chair.');
  });

  it('lowercases the chip label, including labels with a slash or two words', () => {
    expect(taglineOf(core('operator', ['accounting']), library).text).toBe('Your accounting / finance chief of staff.');
    expect(taglineOf(core('chaos', ['medicine']), library).text).toBe('Your medicine / nursing fixer.');
    expect(taglineOf(core('trader', ['prediction_markets']), library).text).toBe(
      'Your prediction markets trench companion.',
    );
    expect(taglineOf(core('trader', ['crypto']), library).text).toBe('Your crypto general trench companion.');
    expect(taglineOf(core('builder', ['real_estate']), library).text).toBe('Your real estate reviewer.');
  });

  it('lowercases the base noun, including the multi-word ones', () => {
    expect(taglineOf(core('trader', ['solana']), library).text).toBe('Your solana trench companion.');
    expect(taglineOf(core('student', ['teaching']), library).text).toBe('Your teaching study partner.');
    expect(taglineOf(core('operator', ['founder']), library).text).toBe('Your founder chief of staff.');
  });

  it('covers every Work and Markets chip on every base (19 chips x 8 bases)', () => {
    let n = 0;
    for (const base of Object.keys(BASE_NOUN)) {
      for (const chip of Object.keys(LEAD_CHIP)) {
        const got = taglineOf(core(base, [chip]), library).text;
        expect(got, `${base} + ${chip}`).toBe(`Your ${LEAD_CHIP[chip]} ${BASE_NOUN[base]}.`);
        n += 1;
      }
    }
    expect(n).toBe(19 * 8);
  });
});

describe('taglineOf: the base-only form', () => {
  it('reads "Your <noun>." with no chips at all, for each of the eight bases', () => {
    for (const base of Object.keys(BASE_NOUN)) {
      expect(taglineOf(core(base, []), library).text, base).toBe(`Your ${BASE_NOUN[base]}.`);
    }
  });

  it('reads "Your <noun>." when every chip is Life or Time, for each of the eight bases', () => {
    for (const base of Object.keys(BASE_NOUN)) {
      expect(taglineOf(core(base, OTHER_CHIPS.slice(0, 6)), library).text, base).toBe(`Your ${BASE_NOUN[base]}.`);
      expect(taglineOf(core(base, OTHER_CHIPS.slice(6, 12)), library).text, base).toBe(`Your ${BASE_NOUN[base]}.`);
    }
  });

  it('reads "Your trench companion." for a trader with only an NBA chip', () => {
    expect(taglineOf(core('trader', ['nba']), library).text).toBe('Your trench companion.');
  });

  it('names no chip when each Life or Time chip stands alone', () => {
    for (const chip of OTHER_CHIPS) {
      expect(taglineOf(core('parent', [chip]), library).text, chip).toBe('Your playmaker.');
    }
  });
});

describe('taglineOf: which chip leads', () => {
  it('takes the first Work or Markets chip in tap order, skipping Life and Time chips ahead of it', () => {
    expect(taglineOf(core('trader', ['nba', 'night_owl', 'solana', 'memecoins']), library).text).toBe(
      'Your solana trench companion.',
    );
  });

  it('takes tap order, not group order: a Markets chip tapped first beats a Work chip tapped later, and the other way round', () => {
    expect(taglineOf(core('trader', ['memecoins', 'law']), library).text).toBe('Your memecoins trench companion.');
    expect(taglineOf(core('trader', ['law', 'memecoins']), library).text).toBe('Your law trench companion.');
  });

  it('a Work chip and a Markets chip are both eligible', () => {
    expect(taglineOf(core('professional', ['stocks', 'law']), library).text).toBe('Your stocks second chair.');
    expect(taglineOf(core('professional', ['law', 'stocks']), library).text).toBe('Your law second chair.');
  });

  it('later chips never add to the line', () => {
    const text = taglineOf(core('trader', ['memecoins', 'solana', 'stocks', 'law', 'nba', 'gym']), library).text;
    expect(text).toBe('Your memecoins trench companion.');
  });

  it('reversing the chips can change the line', () => {
    const chips = ['law', 'memecoins', 'stocks'];
    const forward = taglineOf(core('trader', chips), library).text;
    const backward = taglineOf(core('trader', [...chips].reverse()), library).text;
    expect(forward).toBe('Your law trench companion.');
    expect(backward).toBe('Your stocks trench companion.');
  });

  it('works for a build with six chips, the most a build can hold, whichever slot the lead chip sits in', () => {
    const filler = ['nba', 'gym', 'dog', 'kids', 'phone'];
    for (let slot = 0; slot < 6; slot += 1) {
      const chips = [...filler];
      chips.splice(slot, 0, 'founder');
      expect(chips).toHaveLength(6);
      expect(taglineOf(core('operator', chips), library).text, `slot ${slot}`).toBe('Your founder chief of staff.');
    }
  });

  it('skips a chip id the library does not know and takes the next real one', () => {
    expect(taglineOf(core('trader', ['zz_not_a_chip', 'solana']), library).text).toBe('Your solana trench companion.');
    expect(taglineOf(core('trader', ['zz_not_a_chip']), library).text).toBe('Your trench companion.');
  });
});

describe('taglineOf: ids', () => {
  it('lists the chip template, the chip and the base for a chip line', () => {
    expect(taglineOf(core('trader', ['nba', 'memecoins']), library).ids).toEqual([
      'tagline.chip',
      'memecoins',
      'trader',
    ]);
  });

  it('lists the base template and the base for a base-only line', () => {
    expect(taglineOf(core('parent', ['kids']), library).ids).toEqual(['tagline.base', 'parent']);
    expect(taglineOf(core('parent', []), library).ids).toEqual(['tagline.base', 'parent']);
  });

  it('every id it returns is a record in the library tables', () => {
    const known = new Set<string>([
      library.names.taglines.chip.id,
      library.names.taglines.base.id,
      ...library.chips.map((c) => c.id),
      ...library.bases.map((b) => b.id),
    ]);
    for (const base of Object.keys(BASE_NOUN)) {
      for (const chips of [[], ['nba'], ['law'], ['nba', 'solana']]) {
        for (const id of taglineOf(core(base, chips), library).ids) {
          expect(known.has(id), `${base} ${chips.join(',')}: ${id}`).toBe(true);
        }
      }
    }
  });
});

describe('taglineOf: the text is library text, filled', () => {
  // A library copy with different templates proves the words come from names.json, not from the code.
  const other: Library = {
    ...library,
    names: {
      ...library.names,
      taglines: {
        chip: { id: 'tagline.chip', line: 'A {noun} for the {chip} life.' },
        base: { id: 'tagline.base', line: 'Just a {noun}.' },
      },
    },
  };

  it('follows the chip template in the library it is given', () => {
    expect(taglineOf(core('trader', ['memecoins']), other).text).toBe('A trench companion for the memecoins life.');
  });

  it('follows the base template in the library it is given', () => {
    expect(taglineOf(core('trader', ['nba']), other).text).toBe('Just a trench companion.');
  });

  it('leaves no unfilled slot or stray brace in any line the shipped templates make', () => {
    for (const base of Object.keys(BASE_NOUN)) {
      for (const chips of [[], ...Object.keys(LEAD_CHIP).map((c) => [c])]) {
        const text = taglineOf(core(base, chips), library).text;
        expect(text, text).not.toMatch(/[{}]/);
        expect(text, text).not.toMatch(/\s{2,}/);
        expect(text, text).toBe(text.trim());
      }
    }
  });

  it('starts with "Your ", ends with a period, and is lowercase after "Your "', () => {
    for (const base of Object.keys(BASE_NOUN)) {
      for (const chips of [[], ...Object.keys(LEAD_CHIP).map((c) => [c])]) {
        const text = taglineOf(core(base, chips), library).text;
        expect(text.startsWith('Your '), text).toBe(true);
        expect(text.endsWith('.'), text).toBe(true);
        const rest = text.slice('Your '.length);
        expect(rest, text).toBe(rest.toLowerCase());
      }
    }
  });

  it('has no em dash or en dash in any line', () => {
    for (const base of Object.keys(BASE_NOUN)) {
      for (const chips of [[], ...Object.keys(LEAD_CHIP).map((c) => [c])]) {
        const text = taglineOf(core(base, chips), library).text;
        expect(text).not.toContain(EM_DASH);
        expect(text).not.toContain(EN_DASH);
      }
    }
  });
});

describe('taglineOf: what it reads and what it does not', () => {
  it('reads only the base and the chips: name, stats, peeves, heart and outfit do not change the line', () => {
    const marty = starterCore('marty');
    const same = taglineOf(marty, library).text;
    expect(same).toBe('Your memecoins trench companion.');
    const changed: BuildCore = {
      ...marty,
      name: 'Anything Else',
      stats: { blunt: 1, warm: 4, funny: 1, chatty: 1, proactive: 1 },
      peeves: [],
      outfit: starterCore('june').outfit,
      heart: starterCore('june').heart,
    };
    expect(taglineOf(changed, library).text).toBe(same);
  });

  it('gives each starter the worked line from its own base and chips', () => {
    for (const entry of library.roster) {
      expect(taglineOf(starterCore(entry.id), library).text, entry.id).toBe(STARTER_GENERATED[entry.id]);
    }
  });

  it('is pure: the same input gives the same output, and the build and library are left alone', () => {
    const build = core('trader', ['nba', 'solana']);
    const buildBefore = JSON.stringify(build);
    const libBefore = JSON.stringify(library.names) + JSON.stringify(library.bases) + JSON.stringify(library.chips);
    const first = taglineOf(build, library);
    const second = taglineOf(build, library);
    expect(second).toEqual(first);
    expect(JSON.stringify(build)).toBe(buildBefore);
    expect(JSON.stringify(library.names) + JSON.stringify(library.bases) + JSON.stringify(library.chips)).toBe(libBefore);
  });

  it('throws on a base the library does not have, rather than printing a wrong line', () => {
    expect(() => taglineOf(core('zz_not_a_base', ['law']), library)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// The certificate header
// ---------------------------------------------------------------------------

describe('certificate header tagline: starters keep their own', () => {
  for (const entry of library.roster) {
    it(`${entry.id}: the hand-written line on every target`, () => {
      for (const t of TARGETS) {
        const build = migrate(structuredClone(entry.build), { target: t.target, mode: t.mode, plan: t.plan });
        expect(starterIdOf(build), `${entry.id} ${t.label}`).toBe(entry.id);
        expect(taglineIn(build), `${entry.id} ${t.label}`).toBe(STARTER_TAGLINE[entry.id]);
      }
    });
  }

  it('the hand-written line is not the generated one, so the two cannot be confused', () => {
    for (const entry of library.roster) {
      expect(STARTER_TAGLINE[entry.id], entry.id).not.toBe(STARTER_GENERATED[entry.id]);
    }
  });
});

describe('certificate header tagline: a changed starter gets the generated line', () => {
  it('marty, odds and dash with a new name read the library template, not the hand-written line', () => {
    for (const [id, name] of [
      ['marty', 'Marty2'],
      ['odds', 'Oddsy'],
      ['dash', 'Dashiell'],
    ] as const) {
      const build: Build = { ...starter(id), name };
      expect(starterIdOf(build), id).toBeUndefined();
      expect(taglineIn(build), id).toBe(STARTER_GENERATED[id]);
      expect(taglineIn(build), id).not.toBe(STARTER_TAGLINE[id]);
    }
  });

  it('memecoins plus the trader base reads "Your memecoins trench companion."', () => {
    const build: Build = { ...starter('marty'), name: 'Degen' };
    expect(build.base).toBe('trader');
    expect(build.chips[0]).toBe('memecoins');
    expect(taglineIn(build)).toBe('Your memecoins trench companion.');
  });

  it('every starter with a new name reads its worked generated line, on every target', () => {
    for (const entry of library.roster) {
      for (const t of TARGETS) {
        const moved = migrate(structuredClone(entry.build), { target: t.target, mode: t.mode, plan: t.plan });
        const build: Build = { ...moved, name: `${entry.build.name}X` };
        expect(taglineIn(build), `${entry.id} ${t.label}`).toBe(STARTER_GENERATED[entry.id]);
      }
    }
  });

  it('a slider change alone drops the hand-written line, keeping the name', () => {
    const june = starter('june');
    const build: Build = { ...june, stats: { ...june.stats, funny: june.stats.funny === 1 ? 2 : 1 } };
    expect(build.name).toBe(june.name);
    expect(taglineIn(build)).toBe('Your playmaker.');
  });

  it('adding a Work chip to June (no Work or Markets chip) gives it that chip', () => {
    const june = starter('june');
    const build: Build = { ...june, chips: [...june.chips, 'law'] };
    expect(taglineIn(build)).toBe('Your law playmaker.');
  });

  it('removing the lead chip from Marty moves the line to the next Markets chip', () => {
    const marty = starter('marty');
    expect(marty.chips).toEqual(['memecoins', 'solana', 'nba', 'night_owl']);
    expect(taglineIn(withChips(marty, marty.chips.slice(1)))).toBe('Your solana trench companion.');
  });

  it('removing every Work or Markets chip from Marty leaves "Your trench companion."', () => {
    const marty = starter('marty');
    expect(taglineIn(withChips(marty, ['nba', 'night_owl']))).toBe('Your trench companion.');
  });

  it('reversing the chips of Odds changes the lead chip', () => {
    const odds = starter('odds');
    expect(odds.chips).toEqual(['prediction_markets', 'stocks', 'early_riser']);
    expect(taglineIn({ ...odds, chips: ['early_riser', 'stocks', 'prediction_markets'] })).toBe(
      'Your stocks trench companion.',
    );
  });

  it('is the same on every target for one custom build', () => {
    const custom = { ...starter('rook'), name: 'Mine', chips: ['gym', 'founder', 'law'] };
    for (const t of TARGETS) {
      const build = migrate(structuredClone(custom), { target: t.target, mode: t.mode, plan: t.plan });
      expect(taglineIn(build), t.label).toBe('Your founder reviewer.');
    }
  });

  it('does not depend on the name of a custom build', () => {
    const rook = starter('rook');
    for (const name of ['Rookie', 'A', 'x'.repeat(24), 'Zed Zed']) {
      expect(taglineIn({ ...rook, name }), name).toBe('Your engineering reviewer.');
    }
  });

  it('reads "Your <noun>." for a custom build with only Life and Time chips', () => {
    const base = starter('pip');
    for (const [b, noun] of Object.entries(BASE_NOUN)) {
      const build: Build = { ...base, name: 'Custom', base: b as BaseId, chips: ['gym', 'night_owl'] };
      expect(taglineIn(build), b).toBe(`Your ${noun}.`);
    }
  });

  it('reads "Your <noun>." for a custom build with no chips', () => {
    const build: Build = { ...starter('ink'), name: 'Bare', chips: [] };
    expect(taglineIn(build)).toBe('Your editor.');
  });

  it('the model trusts the starter id it is given: with none, an untouched starter also gets the generated line', () => {
    // The caller (certificateInput) fills starterId from starterIdOf. Without it the header cannot tell
    // a starter from a custom build, so it falls back to the generated line.
    const marty = starter('marty');
    expect(taglineIn(marty, { starterId: undefined })).toBe('Your memecoins trench companion.');
    expect(taglineIn(marty)).toBe(STARTER_TAGLINE['marty']);
  });
});

describe('certificate header tagline: every case has one', () => {
  const cases: { id: string; build: Build }[] = [
    ...GOLDEN_SPECS.map((spec) => ({ id: spec.id, build: buildFor(spec, library) })),
    ...library.roster.map((e) => ({
      id: `${e.id}.chatgpt-gpt`,
      build: migrate(structuredClone(e.build), { target: 'chatgpt', mode: 'gpt' }),
    })),
  ];

  it('covers the 55 golden builds and nine gpt variants', () => {
    expect(cases).toHaveLength(64);
  });

  it('the header always carries a tagline now: the starter line or a generated one, with no long dash', () => {
    for (const c of cases) {
      const tagline = taglineIn(c.build);
      expect(tagline, c.id).toBeDefined();
      expect(tagline!.length, c.id).toBeGreaterThan(0);
      expect(tagline, c.id).not.toContain(EM_DASH);
      expect(tagline, c.id).not.toContain(EN_DASH);
      // An unmodified starter keeps its hand-written line.
      const starterId = c.id.split('.')[0]!;
      expect(tagline, c.id).toBe(STARTER_TAGLINE[starterId]);
    }
  });

  it('a renamed copy of each case reads the generated line for its starter', () => {
    for (const c of cases) {
      const starterId = c.id.split('.')[0]!;
      const build: Build = { ...c.build, name: `${c.build.name}Z` };
      expect(taglineIn(build), c.id).toBe(STARTER_GENERATED[starterId]);
    }
  });

  it('the tagline does not change what the model says about the build otherwise', () => {
    const marty = starter('marty');
    const a = certificateModel(inputFor(marty));
    const b = certificateModel(inputFor(marty, { starterId: undefined }));
    expect({ ...a, header: { ...a.header, tagline: '' } }).toEqual({ ...b, header: { ...b.header, tagline: '' } });
  });
});
