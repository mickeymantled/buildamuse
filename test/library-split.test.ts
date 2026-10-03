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
// The pre-split baseline block is a migration check. M4 slice 4.4 (W3 step tags) re-pinned it: the
// profile comparisons now strip the keys 4.4 added (`shows`, `when` and `closer` on install steps,
// and the `rulesPath` line on chatgpt-dot) before comparing, so any other change to a profile still
// fails. It is valid until the next M4 content edit to profiles.json (W4 verify cleanup, W21 SKILL.md
// frontmatter); re-pin or retire it in the slice that makes that edit. The structural blocks stay.

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

describe('pre-split baseline (migration check, step tags and rulesPath stripped; re-pin at the next profiles.json content edit)', () => {
  it.skipIf(baseline === null)('found a pre-split targets.json in git', () => {
    expect(baseline).not.toBeNull();
    expect(baseline?.targets).toHaveLength(5);
    expect(baseline?.profiles).toHaveLength(8);
  });

  it.skipIf(baseline === null)('cards equal the old targets array', () => {
    expect(cards).toEqual(baseline?.targets);
  });

  it.skipIf(baseline === null)('profiles equal the old profiles array once the step tags and rulesPath are stripped', () => {
    expect(profiles.map(withoutStepTags)).toEqual(baseline?.profiles);
  });

  it.skipIf(baseline === null)('serialize to the same text once stripped, so key order is unchanged too', () => {
    expect(JSON.stringify(cards)).toBe(JSON.stringify(baseline?.targets));
    expect(JSON.stringify(profiles.map(withoutStepTags))).toBe(JSON.stringify(baseline?.profiles));
  });

  for (const id of PROFILE_IDS) {
    it.skipIf(baseline === null)(`profile ${id} matches its pre-split record (tags stripped)`, () => {
      const before = baseline?.profiles.find((p) => p.id === id);
      const after = library.targets.profiles.find((p) => p.id === id);
      expect(before, `${id} missing from the pre-split file`).toBeDefined();
      expect(after, `${id} missing from the library`).toBeDefined();
      const stripped = after ? withoutStepTags(after) : undefined;
      expect(stripped).toEqual(before);
      expect(JSON.stringify(stripped)).toBe(JSON.stringify(before));
    });
  }

  it.skipIf(baseline === null)('the library carries every pre-split profile and no extra ones', () => {
    const before = (baseline?.profiles ?? []).map((p) => p.id).sort();
    const after = library.targets.profiles.map((p) => p.id).sort();
    expect(after).toEqual(before);
  });
});
