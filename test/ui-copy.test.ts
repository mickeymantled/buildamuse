// UI copy tests (M3 slice 3.19b), node environment.
//
// The rules under test come from CLAUDE.md (no em dashes anywhere), docs/Build-a-Bot-v2-Brief.md
// Part E ("your bot's personality", not "SOUL.md" or "Muse", except where a target uses it; the
// gates line per target) and docs/UI-PLAN.md (every screen has a title and subtitle in copy).
// Nothing here is read back from what a screen renders.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import library from '../src/library/index.js';
import { copy } from '../src/ui/copy.js';
import { SCREEN_ORDER } from '../src/ui/flow.js';

const EM_DASH = String.fromCharCode(0x2014);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UI_DIR = path.join(ROOT, 'src', 'ui');
const BRIEF = readFileSync(path.join(ROOT, 'docs', 'Build-a-Bot-v2-Brief.md'), 'utf8');

// Every screen id the plan names, in flow order. Written out here so a screen added to the flow
// without copy fails the table below.
const PLAN_SCREENS = [
  'target',
  'roster',
  'base',
  'world',
  'packs',
  'limits',
  'gates',
  'stats',
  'peeves',
  'heart',
  'outfit',
  'roles',
  'name',
  'certificate',
] as const;

// Side screens are in the flow's ScreenId and in copy, but not in SCREEN_ORDER: no progress dots, no
// Skip, and the screen sits off the main path (docs/M4-PLAN.md section 3, "Remix screen").
const SIDE_SCREENS = ['remix'] as const;
const COPY_SCREENS = [...PLAN_SCREENS, ...SIDE_SCREENS] as const;

// ---- Walking the copy object ----

interface Found {
  path: string;
  text: string;
}

// Sample arguments for the copy functions: numbers, then strings. Each function takes one kind.
const SAMPLE_ARGS: unknown[][] = [
  [3, 6],
  [0, 0],
  [14, 14],
  [24, 24],
  [4000, 3600],
  ['Sample label', 'Sample label'],
];

// Collects every string reachable from a value. Function values are called with each sample set.
function collect(value: unknown, at: string, out: Found[]): void {
  if (typeof value === 'string') {
    out.push({ path: at, text: value });
  } else if (typeof value === 'function') {
    for (const args of SAMPLE_ARGS) {
      collect((value as (...a: unknown[]) => unknown)(...args), `${at}()`, out);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collect(v, `${at}[${i}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) collect(v, at === '' ? key : `${at}.${key}`, out);
  }
}

const found: Found[] = [];
collect(copy, '', found);

// ---- Source files ----

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const files = sourceFiles(UI_DIR);

describe('no em dashes', () => {
  it('finds the UI source files it is meant to check', () => {
    const names = files.map((f) => path.relative(ROOT, f));
    expect(names).toContain(path.join('src', 'ui', 'copy.ts'));
    expect(names).toContain(path.join('src', 'ui', 'App.tsx'));
    expect(names.some((n) => n.startsWith(path.join('src', 'ui', 'screens')))).toBe(true);
    expect(names.some((n) => n.startsWith(path.join('src', 'ui', 'components')))).toBe(true);
  });

  it.each(files.map((f) => [path.relative(ROOT, f), f] as const))('%s has no em dash', (_name, file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    const hits = lines.flatMap((line, i) => (line.includes(EM_DASH) ? [`line ${i + 1}: ${line.trim()}`] : []));
    expect(hits).toEqual([]);
  });

  it('has no em dash in any string reachable in the copy object', () => {
    expect(found.length).toBeGreaterThan(100);
    expect(found.filter((f) => f.text.includes(EM_DASH))).toEqual([]);
  });

  it('walks function values too (the walker reaches the copy functions)', () => {
    const paths = found.map((f) => f.path);
    for (const fn of ['counter()', 'step()', 'preview.length()', 'preview.over()', 'makeFor()', 'limits.lower()']) {
      expect(paths, fn).toContain(fn);
    }
  });
});

describe('"your bot\'s personality" and no SOUL.md', () => {
  it('names the personality as Part E words it', () => {
    expect(copy.preview.title.toLowerCase()).toBe("your bot's personality");
  });

  it('has no "SOUL.md" anywhere in copy', () => {
    expect(found.filter((f) => /soul\.md/i.test(f.text))).toEqual([]);
  });

  it('says "Muse" only at the allowed paths', () => {
    const hits = found.filter((f) => /muse/i.test(f.text)).map((f) => f.path);
    // copy.gatesCopy.muse is Part E verbatim ("Muse's approval cards"). copy.targetNames.muse is the
    // short name Brian gave for the remix warning (QUESTIONS B12). A new "Muse" in copy must fail this list.
    expect([...new Set(hits)].sort()).toEqual(['gatesCopy.muse', 'targetNames.muse']);
  });

  it('keeps the allowed strings and Brian\'s wording word for word (B11, B12)', () => {
    expect(copy.gatesCopy.muse).toBe("these go in your soul and Muse's approval cards do the rest");
    expect(copy.remixWarning(copy.targetNames.muse)).toBe(
      "This rebuilds from your picks. Changes you made inside Muse won't carry over.",
    );
    expect(copy.targetNames).toEqual({
      muse: 'Muse',
      openclaw: 'OpenClaw',
      hermes: 'Hermes',
      grok: 'Grok Bot',
      chatgpt: 'ChatGPT',
    });
    expect(copy.remixPaste).toBe('Paste your current personality to keep your edits.');
    expect(copy.target.paidSteer).toBe('Packs with money or email gates fit better on Paid. Switch to Paid?');
  });

  it('says "bot" where the spec says "Muse" (floor line, chassis label, d3 note)', () => {
    expect(copy.floorLine).toMatch(/^every bot comes with a little honesty and a little care already in\.$/);
    expect(copy.preview.chassisLabel).toBe('every bot gets these.');
    expect(copy.heart.d3Locked).toBe('every bot has this one.');
  });
});

describe('screen strings', () => {
  it('names the same screens as the plan and the flow, plus the remix side screen', () => {
    // The flow order is the plan's order. The side screen is not in it.
    expect([...SCREEN_ORDER]).toEqual([...PLAN_SCREENS]);
    for (const id of SIDE_SCREENS) expect([...SCREEN_ORDER], id).not.toContain(id);
    // copy.screens covers every flow screen and every side screen, and nothing else.
    expect(Object.keys(copy.screens).sort()).toEqual([...COPY_SCREENS].sort());
  });

  it.each(COPY_SCREENS)('%s has a title and a subtitle', (id) => {
    const entry = copy.screens[id];
    expect(typeof entry.title).toBe('string');
    expect(entry.title.trim().length).toBeGreaterThan(0);
    expect(typeof entry.subtitle).toBe('string');
    expect(entry.subtitle.trim().length).toBeGreaterThan(0);
  });

  it('gives every screen its own title (the flow tests tell screens apart by heading)', () => {
    const titles = COPY_SCREENS.map((id) => copy.screens[id].title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('verbatim gates lines', () => {
  // Part E, "Gates screen" bullet: the copy per target, each line in double quotes.
  const gatesBullet = BRIEF.split('\n').find((l) => l.startsWith('- Gates screen:'));

  it('finds the Part E gates bullet in the brief', () => {
    expect(gatesBullet).toBeDefined();
    expect(gatesBullet).toContain('Copy per target:');
  });

  it('has a gates line for every profile in the library, and no others', () => {
    const ids = library.targets.profiles.map((p) => p.id).sort();
    expect(Object.keys(copy.gatesCopy).sort()).toEqual(ids);
  });

  it.each(Object.entries(copy.gatesCopy))('%s line appears verbatim, in quotes, in the brief', (_id, line) => {
    expect(gatesBullet).toContain(`"${line}"`);
  });

  it('shares one line across the profiles the brief groups', () => {
    // "openclaw/hermes" and "chatgpt gpt/instructions/project" are one quoted line each in the brief.
    expect(copy.gatesCopy.openclaw).toBe(copy.gatesCopy.hermes);
    expect(copy.gatesCopy['chatgpt-gpt']).toBe(copy.gatesCopy['chatgpt-instructions']);
    expect(copy.gatesCopy['chatgpt-instructions']).toBe(copy.gatesCopy['chatgpt-project']);
    // And the lines that stand alone differ from each other.
    const distinct = new Set([
      copy.gatesCopy.muse,
      copy.gatesCopy.openclaw,
      copy.gatesCopy.grok,
      copy.gatesCopy['chatgpt-dot'],
      copy.gatesCopy['chatgpt-instructions'],
    ]);
    expect(distinct.size).toBe(5);
  });
});
