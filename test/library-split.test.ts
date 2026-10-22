// M4 slice 4.1: the targets.json split (W1, plan section 2 item 1 and section 8).
//
// Before the split, src/library/targets.json was { targets, profiles }. After it:
//   - targets.json is a bare TargetCard[] (the five picker cards, small enough for the first paint),
//   - profiles.json is a bare Profile[] (the eight delivery profiles),
//   - src/library/index.ts reassembles library.targets = { targets, profiles }, so the Library type
//     and every consumer stay unchanged.
//
// Expected values come from the plan and from the files on disk (and from git history for the
// pre-split baseline), never from compiler output.
//
// The pre-split baseline block is a migration check. M4 slice 4.4 (W3 step tags) re-pinned it to strip
// the keys 4.4 added (`shows`, `when` and `closer` on install steps, and the `rulesPath` line on
// chatgpt-dot). M4 slice 4.5b (W31 SKILL.md frontmatter, W32 verify cleanup) re-pinned it again: that
// slice edited records by design, so the comparison now strips them from both sides and checks
// everything else. The stripped records are pinned in their own tests:
//   - installSteps text and tags: test/step-tags.test.ts (only the step ids are compared here, less
//     the removed Hermes step 6),
//   - verify, notes and reloadNote: test/verify-cleanup.test.ts,
//   - the skill.file, skill.chipFile and actions.consequential templates: test/skill-frontmatter.test.ts
//     and test/verify-cleanup.test.ts.
// M5 slice K1 (B17, Dot hard rules) edited the chatgpt-dot record by design: `rulesInSoul` went from
// "none" to "section" and a `rules.heading` template ("## Hard rules") was added. Both are stripped from
// both sides for that one profile, and nothing else about it; test/dot-hard-rules.test.ts pins the new
// values, and the test below says the dot is the only profile whose rulesInSoul moved.
// The ChatGPT dot fix (docs/DOT-FIX-PLAN.md, QUESTIONS D1 to D8) edited the dot record and the ChatGPT
// card by design: the dot's three chassis wording variants, its short variants, gateSoulVariants,
// gateFloors, seven templates, the skillLabel and routineLabel fields, and the card's promise and dot mode
// note. Review then added a fourth chassis variant (chassis.clash.order) and reworded the floor note and
// skill line, the approval variant and the roles fallback. Those are stripped from both sides too, and
// pinned to the plan's own strings in the "dot fix edits" block at the end of this file.
// (The dot's install steps keep their ids here and their text in test/step-tags.test.ts; its verify
// and notes records are in test/verify-cleanup.test.ts.)
// It is valid until the next M4 or M5 content edit to another profile record; re-pin or retire it in the
// slice that makes that edit. The structural blocks stay.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { library } from '../src/library/index.js';
import { library as compileLibrary } from '../src/compiler/compile.js';
import type { Profile, TargetCard } from '../src/compiler/types.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGETS_PATH = fileURLToPath(new URL('../src/library/targets.json', import.meta.url));
const PROFILES_PATH = fileURLToPath(new URL('../src/library/profiles.json', import.meta.url));

// The five cards in picker order, and the eight profiles in library order (plan section 2 table).
const CARD_IDS = ['muse', 'openclaw', 'hermes', 'grok', 'chatgpt'];
const PROFILE_IDS = [
  'muse',
  'openclaw',
  'hermes',
  'grok',
  'chatgpt-dot',
  'chatgpt-gpt',
  'chatgpt-instructions',
  'chatgpt-project',
];

// Built from a code point so this file holds no literal em dash.
const EM_DASH = String.fromCharCode(0x2014);

// Cards carry display fields only. Anything else belongs in profiles.json.
const CARD_KEYS = new Set(['id', 'label', 'promise', 'modes']);

const cardsRaw: unknown = JSON.parse(readFileSync(TARGETS_PATH, 'utf8'));
const profilesRaw: unknown = JSON.parse(readFileSync(PROFILES_PATH, 'utf8'));
const cards = cardsRaw as TargetCard[];
const profiles = profilesRaw as Profile[];

// The last commit where targets.json still held { targets, profiles }. With the split uncommitted
// that is HEAD; once it is committed, the walk finds the commit before it. Null when git or the
// history is unavailable (a tarball, a shallow clone), and the baseline tests skip.
function preSplitBaseline(): { targets: TargetCard[]; profiles: Profile[]; commit: string } | null {
  try {
    const log = execFileSync('git', ['log', '--format=%H', '--', 'src/library/targets.json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter((l) => l.length > 0);
    for (const commit of ['HEAD', ...log]) {
      let text: string;
      try {
        text = execFileSync('git', ['show', `${commit}:src/library/targets.json`], {
          cwd: ROOT,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        continue;
      }
      const parsed = JSON.parse(text) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Array.isArray((parsed as { targets?: unknown }).targets) &&
        Array.isArray((parsed as { profiles?: unknown }).profiles)
      ) {
        const o = parsed as { targets: TargetCard[]; profiles: Profile[] };
        return { targets: o.targets, profiles: o.profiles, commit };
      }
    }
  } catch {
    return null;
  }
  return null;
}

const baseline = preSplitBaseline();

// Slice 4.4 additions to a profile, removed so the rest can be compared with the pre-split record:
// the tag keys on install steps and the chatgpt-dot rulesPath line. Key order of what remains is kept.
function withoutStepTags(p: Profile): Profile {
  const copy = structuredClone(p);
  delete copy.rulesPath;
  for (const step of copy.installSteps) {
    delete step.shows;
    delete step.when;
    delete step.closer;
  }
  return copy;
}

// Records slice 4.5b edited by design (W31, W32), removed from both sides of the baseline comparison.
// The install steps keep their ids, so a lost or reordered step still fails here; the removed Hermes
// step 6 (W32 d1) is left out of both lists.
const REMOVED_STEP_IDS = ['profile.hermes.step.6'];
const EDITED_TEMPLATES = ['skill.file', 'skill.chipFile', 'actions.consequential'];

// The dot fix (docs/DOT-FIX-PLAN.md sections 1, 2, 4): the chassis variants it reworded or added, the
// profile fields it added, and the templates it reworded or added. The dot's other chassis variants
// (opening, memory) and its other templates (memory.sentence, personality.opener) stay compared.
const DOT_FIX_CHASSIS_VARIANTS = [
  'chassis.act.approval',
  'chassis.act.reversible',
  'chassis.rules.outrank',
  'chassis.clash.order',
];
const DOT_FIX_TEMPLATES = [
  'skill.sentence',
  'skill.legacy',
  'skill.suffix',
  'routine.sentence',
  'routine.legacy',
  'routine.confirm',
  'fallback.roles',
];

// Cards, less the two strings the dot fix reworded: the ChatGPT promise and the dot mode note.
function comparableCard(c: TargetCard): Record<string, unknown> {
  const copy = structuredClone(c) as unknown as Record<string, unknown>;
  if (c.id === 'chatgpt') {
    delete copy.promise;
    copy.modes = (copy.modes as Record<string, unknown>[]).map((m) => {
      if (m.id !== 'dot') return m;
      const rest = { ...m };
      delete rest.note;
      return rest;
    });
  }
  return copy;
}

function comparable(p: Profile): Record<string, unknown> {
  const copy = withoutStepTags(p) as unknown as Record<string, unknown>;
  copy.installSteps = p.installSteps.map((s) => s.id).filter((id) => !REMOVED_STEP_IDS.includes(id));
  delete copy.verify;
  delete copy.notes;
  delete copy.reloadNote;
  const templates = copy.templates as Record<string, unknown>;
  for (const key of EDITED_TEMPLATES) delete templates[key];
  // B17: the dot's rules layer got a Hard rules section in its personality message.
  if (p.id === 'chatgpt-dot') {
    delete copy.rulesInSoul;
    delete templates['rules.heading'];
    // The dot fix: reworded chassis variants, the short and floor fields, the reworded templates.
    const variants = copy.chassisVariants as Record<string, unknown>;
    for (const key of DOT_FIX_CHASSIS_VARIANTS) delete variants[key];
    delete copy.chassisShortVariants;
    delete copy.gateSoulVariants;
    delete copy.gateFloors;
    // The dot's item labels: "Workflow" for skill sentences and "Scheduled task" for routines.
    delete copy.skillLabel;
    delete copy.routineLabel;
    for (const key of DOT_FIX_TEMPLATES) delete templates[key];
  }
  return copy;
}

describe('targets.json holds only the cards', () => {
  it('is a bare array, not the old { targets, profiles } object', () => {
    expect(Array.isArray(cardsRaw)).toBe(true);
    expect(cards).toHaveLength(5);
  });

  it('lists the five targets in picker order', () => {
    expect(cards.map((c) => c.id)).toEqual(CARD_IDS);
  });

  it('is under 3,000 bytes (first paint stays small)', () => {
    expect(statSync(TARGETS_PATH).size).toBeLessThan(3000);
  });

  it('gives every card a label and a promise line with an id and text', () => {
    for (const c of cards) {
      expect(typeof c.label, c.id).toBe('string');
      expect(c.label.length, c.id).toBeGreaterThan(0);
      expect(c.promise.id, c.id).toBe(`target.${c.id}.promise`);
      expect(c.promise.line.length, c.id).toBeGreaterThan(0);
    }
  });

  it('carries display fields only, with no profile data in a card', () => {
    for (const c of cards) {
      for (const key of Object.keys(c)) {
        expect(CARD_KEYS.has(key), `${c.id} has stray key ${key}`).toBe(true);
      }
    }
  });

  it('puts modes on the chatgpt card and nowhere else', () => {
    for (const c of cards) {
      if (c.id === 'chatgpt') expect(Array.isArray(c.modes)).toBe(true);
      else expect(c.modes, c.id).toBeUndefined();
    }
  });

  it('has no em dash', () => {
    expect(readFileSync(TARGETS_PATH, 'utf8')).not.toContain(EM_DASH);
  });
});

describe('profiles.json holds only the profiles', () => {
  it('is a bare array, not an object', () => {
    expect(Array.isArray(profilesRaw)).toBe(true);
    expect(profiles).toHaveLength(8);
  });

  it('lists the eight profiles in library order', () => {
    expect(profiles.map((p) => p.id)).toEqual(PROFILE_IDS);
  });

  it('has unique profile ids', () => {
    expect(new Set(profiles.map((p) => p.id)).size).toBe(profiles.length);
  });

  it('points every profile at a card and gives every card a profile', () => {
    const cardIds = new Set(cards.map((c) => c.id));
    for (const p of profiles) expect(cardIds.has(p.target), `${p.id} target ${p.target}`).toBe(true);
    const targetsWithProfile = new Set(profiles.map((p) => p.target));
    for (const c of cards) expect(targetsWithProfile.has(c.id), `card ${c.id} has no profile`).toBe(true);
  });

  it('gives each chatgpt profile a mode that its card lists, and no other profile a mode', () => {
    const chatgpt = cards.find((c) => c.id === 'chatgpt');
    const modeIds = new Set((chatgpt?.modes ?? []).map((m) => m.id));
    for (const p of profiles) {
      if (p.target === 'chatgpt') {
        expect(p.mode, p.id).toBeDefined();
        expect(modeIds.has(p.mode as NonNullable<Profile['mode']>), `${p.id} mode ${p.mode}`).toBe(true);
        expect(p.id).toBe(`chatgpt-${p.mode}`);
      } else {
        expect(p.mode, p.id).toBeUndefined();
        expect(p.id).toBe(p.target);
      }
    }
  });

  it('gives every profile a docUrl and a layout', () => {
    for (const p of profiles) {
      expect(p.docUrl, p.id).toBeTruthy();
      expect(p.layout, p.id).toBeTruthy();
    }
  });

  it('has no em dash', () => {
    expect(readFileSync(PROFILES_PATH, 'utf8')).not.toContain(EM_DASH);
  });
});

describe('library/index.ts reassembles the split', () => {
  it('exposes targets as exactly { targets, profiles }', () => {
    expect(Object.keys(library.targets).sort()).toEqual(['profiles', 'targets']);
  });

  it('library.targets.targets deep-equals targets.json', () => {
    expect(library.targets.targets).toEqual(cards);
  });

  it('library.targets.profiles deep-equals profiles.json', () => {
    expect(library.targets.profiles).toEqual(profiles);
  });

  it('keeps the card ids and the profile ids in the same order as the files', () => {
    expect(library.targets.targets.map((c) => c.id)).toEqual(CARD_IDS);
    expect(library.targets.profiles.map((p) => p.id)).toEqual(PROFILE_IDS);
  });

  it('serves the same library through compile.ts', () => {
    expect(compileLibrary.targets.targets).toEqual(library.targets.targets);
    expect(compileLibrary.targets.profiles).toEqual(library.targets.profiles);
  });
});

describe('pre-split baseline (migration check; step tags, rulesPath and the records 4.5b edited are stripped; re-pin at the next profiles.json content edit)', () => {
  it.skipIf(baseline === null)('found a pre-split targets.json in git', () => {
    expect(baseline).not.toBeNull();
    expect(baseline?.targets).toHaveLength(5);
    expect(baseline?.profiles).toHaveLength(8);
  });

  it.skipIf(baseline === null)('cards equal the old targets array, less the two strings the dot fix reworded', () => {
    expect(cards.map(comparableCard)).toEqual((baseline?.targets ?? []).map(comparableCard));
  });

  it.skipIf(baseline === null)('profiles equal the old profiles array once the step tags, rulesPath and the 4.5b edited records are stripped', () => {
    expect(profiles.map(comparable)).toEqual((baseline?.profiles ?? []).map(comparable));
  });

  it.skipIf(baseline === null)('serialize to the same text once stripped, so key order is unchanged too', () => {
    expect(JSON.stringify(cards.map(comparableCard))).toBe(JSON.stringify((baseline?.targets ?? []).map(comparableCard)));
    expect(JSON.stringify(profiles.map(comparable))).toBe(JSON.stringify((baseline?.profiles ?? []).map(comparable)));
  });

  for (const id of PROFILE_IDS) {
    it.skipIf(baseline === null)(`profile ${id} matches its pre-split record (tags and 4.5b edited records stripped)`, () => {
      const before = baseline?.profiles.find((p) => p.id === id);
      const after = library.targets.profiles.find((p) => p.id === id);
      expect(before, `${id} missing from the pre-split file`).toBeDefined();
      expect(after, `${id} missing from the library`).toBeDefined();
      const stripped = after ? comparable(after) : undefined;
      const expected = before ? comparable(before) : undefined;
      expect(stripped).toEqual(expected);
      expect(JSON.stringify(stripped)).toBe(JSON.stringify(expected));
    });
  }

  it.skipIf(baseline === null)('B17 moved rulesInSoul on the dot only: every other profile still has its pre-split value', () => {
    const before = new Map((baseline?.profiles ?? []).map((p) => [p.id, p.rulesInSoul]));
    for (const p of library.targets.profiles) {
      if (p.id === 'chatgpt-dot') {
        expect(before.get(p.id), 'dot before B17').toBe('none');
        expect(p.rulesInSoul, 'dot after B17').toBe('section');
      } else {
        expect(p.rulesInSoul, p.id).toBe(before.get(p.id));
      }
    }
  });

  it.skipIf(baseline === null)('B17 added the rules.heading template to the dot only', () => {
    const had = new Map((baseline?.profiles ?? []).map((p) => [p.id, Object.hasOwn(p.templates, 'rules.heading')]));
    for (const p of library.targets.profiles) {
      if (p.id === 'chatgpt-dot') {
        expect(had.get(p.id), 'dot before B17').toBe(false);
        expect(p.templates['rules.heading']).toEqual({ id: 'profile.chatgpt-dot.rules.heading', line: '## Hard rules' });
      } else {
        expect(Object.hasOwn(p.templates, 'rules.heading'), p.id).toBe(had.get(p.id));
      }
    }
  });

  it.skipIf(baseline === null)('the library carries every pre-split profile and no extra ones', () => {
    const before = (baseline?.profiles ?? []).map((p) => p.id).sort();
    const after = library.targets.profiles.map((p) => p.id).sort();
    expect(after).toEqual(before);
  });
});

// The records the dot fix edited (docs/DOT-FIX-PLAN.md sections 1, 2 and 4), stripped from the baseline
// comparison above and pinned here to the plan's own strings. Straight ASCII quotes, no em dash.
describe('dot fix edits (docs/DOT-FIX-PLAN.md): the strings the baseline comparison strips', () => {
  const dot = profiles.find((p) => p.id === 'chatgpt-dot') as Profile;
  const chatgptCard = cards.find((c) => c.id === 'chatgpt') as TargetCard;

  it('the ChatGPT card promise and the dot mode note are the plan strings, with their ids', () => {
    expect(chatgptCard.promise).toEqual({
      id: 'target.chatgpt.promise',
      line: 'Messages to send your dot, plus permissions to set up.',
    });
    const mode = chatgptCard.modes?.find((m) => m.id === 'dot');
    expect(mode?.note).toEqual({
      id: 'target.chatgpt.mode.dot',
      line: 'Recommended, if your plan includes dots.',
    });
  });

  it('the dot chassis variants (full) are the plan strings', () => {
    expect(dot.chassisVariants['chassis.act.approval']).toBe(
      "Anything that spends, sends, posts, signs or can't be undone waits for my yes, unless a setting below lets you go ahead. When you ask, give me the decision, the cost and your pick in three lines.",
    );
    expect(dot.chassisVariants['chassis.act.reversible']).toBe(
      "Act only on what I asked for, within the permissions I've given you. Being able to undo something doesn't make it OK to do.",
    );
    expect(dot.chassisVariants['chassis.rules.outrank']).toBe(
      "Follow my saved settings and the platform's requirements. If something I say in chat conflicts with them, ask me before you act.",
    );
    expect(dot.chassisVariants['chassis.clash.order']).toBe(
      'Honesty first, then my instructions and saved settings, then brevity, then jokes.',
    );
  });

  it('the dot chassis short variants are the plan strings', () => {
    expect(dot.chassisShortVariants).toEqual({
      'chassis.act.approval':
        'Spend, send, post, sign, irreversible: my yes first, unless a setting below allows it. Ask in 3 lines: decision, cost, pick.',
      'chassis.act.reversible': "Act only on what I asked, within the permissions I gave you. Undoable isn't the same as allowed.",
      'chassis.rules.outrank': 'Follow my saved settings and platform requirements. If chat conflicts with them, ask before acting.',
      'chassis.clash.order': 'Honesty, then my instructions and settings, then brevity, then jokes.',
    });
  });

  it('every dot short variant is shorter than its full variant, and each variant keys a chassis line', () => {
    const chassisIds = new Set(library.chassis.lines.map((l) => l.id));
    for (const [id, short] of Object.entries(dot.chassisShortVariants ?? {})) {
      expect(chassisIds.has(id), `${id} is a chassis line`).toBe(true);
      const full = dot.chassisVariants[id];
      expect(typeof full, `${id} has a full variant`).toBe('string');
      expect(short.length, id).toBeLessThan((full as string).length);
    }
  });

  it('the dot gate soul variant and the trade floor are the plan strings', () => {
    expect(dot.gateSoulVariants).toEqual({
      'gate.send.soul.approve': 'Show me each message before it goes out. Send it only after my yes to that exact message.',
    });
    expect(dot.gateFloors).toEqual({
      trade: {
        setting: 'forbid',
        note: {
          id: 'profile.chatgpt-dot.floor.trade.note',
          line: 'Your setting for Trades is "{setting}". This setup doesn\'t let your dot place trades: it researches and proposes, and you place each trade yourself.',
        },
        skill: {
          id: 'profile.chatgpt-dot.floor.trade.skill',
          line: 'On this dot, never place, change or close a trade. Where a step says to place one, or to wait for my yes at the trade gate, give me the proposal instead, and I place it myself.',
        },
      },
    });
  });

  it('only the dot has the new profile fields', () => {
    for (const p of profiles) {
      if (p.id === 'chatgpt-dot') continue;
      expect(p.gateFloors, p.id).toBeUndefined();
      expect(p.gateSoulVariants, p.id).toBeUndefined();
      expect(p.routineLabel, p.id).toBeUndefined();
    }
  });

  it('the dot labels its skill sentences "Workflow" and its routines "Scheduled task"', () => {
    expect(dot.skillLabel).toBe('Workflow');
    expect(dot.routineLabel).toBe('Scheduled task');
  });

  it('the only other profile with a skill label is Muse ("Standing instruction"), and no other profile has a routine label', () => {
    const labelled = profiles.filter((p) => p.skillLabel !== undefined).map((p) => [p.id, p.skillLabel]);
    expect(labelled).toEqual([
      ['muse', 'Standing instruction'],
      ['chatgpt-dot', 'Workflow'],
    ]);
    expect(profiles.filter((p) => p.routineLabel !== undefined).map((p) => p.id)).toEqual(['chatgpt-dot']);
  });

  it('the dot templates are the plan strings', () => {
    const t = (key: string) => dot.templates[key].line;
    expect(t('skill.sentence')).toBe(
      "Here's a workflow called {name}.\nUse it when: {whenToUse}\nInputs: {inputs}\nSteps:\n{steps}\nCheck before you answer: {validate}\nReturn: {returns}\nNeeds my approval first: {requiresApproval}",
    );
    expect(t('skill.legacy')).toBe("Here's a workflow I'd like you to use: {sentence}.");
    expect(t('skill.suffix')).toBe(
      "Tell me which parts of this you can keep and use, what you'd need connected for it, and any step you can't do.",
    );
    expect(t('routine.sentence')).toBe(
      "I'd like a scheduled task called {name}.\nSchedule: {schedule}\nUse it when: {whenToUse}\nInputs: {inputs}\nSteps:\n{steps}\nCheck before you report: {validate}\nReturn: {returns}\nNeeds my approval first: {requiresApproval}\nIt follows my saved settings like any other run. If it can't ask me, it stops and tells me instead.",
    );
    expect(t('routine.legacy')).toBe("I'd like a scheduled task: {schedule}, {sentence}.");
    expect(t('routine.confirm')).toBe(
      "Before you call it set up, confirm the schedule and my time zone, and ask me if you don't know my time zone. Tell me what access it needs and tell me once the task is created. It isn't running until then.",
    );
    expect(t('fallback.roles')).toBe(
      "Your roles aren't in this setup. It makes one dot, not a separate agent per role. Your roles: {roles}.",
    );
  });

  it('each template keeps its record id', () => {
    for (const key of DOT_FIX_TEMPLATES) {
      expect(dot.templates[key].id, key).toBe(`profile.chatgpt-dot.${key}`);
    }
  });

  it('the dot fix did not touch the other dot templates the baseline still compares', () => {
    expect(dot.templates['memory.sentence'].line).toBe('{seed}');
    expect(dot.templates['personality.opener'].line).toBe("Here's how I want you to work:");
  });
});
