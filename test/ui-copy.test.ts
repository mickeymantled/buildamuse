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

describe('preview chat strings (M5)', () => {
  const chat = found.filter((f) => f.path.startsWith('chat.'));

  it('walks the chat copy, functions included', () => {
    const paths = chat.map((f) => f.path);
    for (const key of ['heading', 'label', 'chipsHint', 'askLabel', 'askLocked', 'send', 'withheld', 'refused', 'busy', 'unavailable']) {
      expect(paths, key).toContain(`chat.${key}`);
    }
    for (const fn of ['counter()', 'counterLabel()', 'rateLimited()', 'capReached()']) {
      expect(paths, fn).toContain(`chat.${fn}`);
    }
  });

  it('has no empty string', () => {
    expect(chat.length).toBeGreaterThan(15);
    expect(chat.filter((f) => f.text.trim() === '')).toEqual([]);
  });

  it('has the B22 label word for word', () => {
    expect(copy.chat.label).toBe("Close to what your bot will do. Your real bot also has its runtime's built-in rules.");
  });

  it('has the plan\'s withheld line word for word', () => {
    expect(copy.chat.withheld).toBe("That reply repeated your bot's setup, so it was held back.");
  });

  it('names the cap and the character limit it is given', () => {
    expect(copy.chat.capReached(20)).toContain('20');
    expect(copy.chat.counter(5, 200)).toBe('5/200');
    expect(copy.chat.counterLabel(5, 200)).toContain('5');
    expect(copy.chat.counterLabel(5, 200)).toContain('200');
  });

  it('says how long to wait, and has a line for when the proxy gives no time', () => {
    expect(copy.chat.rateLimited(3)).toContain('3 seconds');
    expect(copy.chat.rateLimitedNoTime).not.toMatch(/\d/);
  });
});

describe('text inputs in the UI source', () => {
  // QUESTIONS B22 and B23: the allowed text inputs are exactly three. The name field, the remix paste
  // box and the preview chat's ask-your-own box. A fourth would be a new file in this list.
  const FIELD = /<(input|textarea|select)\b|contentEditable/gi;
  const fieldCounts = new Map(
    files
      .map((f) => [path.relative(UI_DIR, f), (readFileSync(f, 'utf8').match(FIELD) ?? []).length] as const)
      .filter(([, n]) => n > 0),
  );

  it('are in the name screen, the remix screen and the preview chat, and nowhere else', () => {
    expect([...fieldCounts.keys()].sort()).toEqual(
      [path.join('certificate', 'PreviewChat.tsx'), path.join('screens', 'Name.tsx'), path.join('screens', 'Remix.tsx')].sort(),
    );
  });

  it('are one field each', () => {
    expect([...fieldCounts.values()]).toEqual([1, 1, 1]);
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

describe('the dot copy asks for permissions, it does not enforce them (docs/DOT-FIX-PLAN.md sections 3 and 5)', () => {
  const PLAN = readFileSync(path.join(ROOT, 'docs', 'DOT-FIX-PLAN.md'), 'utf8').replaceAll('\\"', '"');
  // Each literal below is the plan's text. The first check keeps this file honest: a string that is
  // not in the plan fails there, so the tests never pin invented wording.
  const NOTE_ON_GATES =
    "On a dot, this setup doesn't place trades. Your dot researches and proposes, and you place each trade. Your pick still applies if you switch to another bot.";
  const AUTO =
    'Requested to run without asking. Set this up in your dot and check it saved:';
  const NO_LIMITS_ONE =
    'You asked for this one to run without asking, and your dot\'s message has no limits to check it against. Request "Ask before taking action" instead, or add your limits by hand first:';
  const NO_LIMITS_MANY =
    'You asked for these to run without asking, and your dot\'s message has no limits to check them against. Request "Ask before taking action" instead, or add your limits by hand first:';
  const CAPTION =
    "Permissions to request. Copying them doesn't set them: add each one in your dot if your account offers it, then check it saved.";
  const DISCLOSURE =
    "On a dot, this is a stand-in. It runs your dot's message on Build a Bot's preview model, not on ChatGPT. It doesn't test your permissions, connected apps, workflows, scheduled tasks or memory. It does remember recent messages in this preview.";

  it('every pinned string is in the plan', () => {
    for (const text of [NOTE_ON_GATES, AUTO, NO_LIMITS_ONE, NO_LIMITS_MANY, CAPTION, DISCLOSURE, 'Setting to request:']) {
      expect(PLAN, text).toContain(text);
    }
    expect(PLAN).toContain(
      "Your bot's personality is {n} characters over the {cap}-character budget Build a Bot uses for a dot message.",
    );
  });

  it('the Gates screen note for Trades on the dot', () => {
    expect(copy.gates.floorNotes.trade).toBe(NOTE_ON_GATES);
  });

  it('the summary lines on the dot', () => {
    expect(copy.certificate.summary.autoDot).toBe(AUTO);
    expect(copy.certificate.summary.dotAutoNoLimits(1)).toBe(NO_LIMITS_ONE);
    expect(copy.certificate.summary.dotAutoNoLimits(2)).toBe(NO_LIMITS_MANY);
    expect(copy.certificate.summary.dotAutoNoLimits(3)).toBe(NO_LIMITS_MANY);
  });

  it('the over-the-budget line, singular and plural', () => {
    const over = copy.certificate.summary.overDot;
    expect(over(1, 3600)).toBe(
      "Your bot's personality is 1 character over the 3600-character budget Build a Bot uses for a dot message.",
    );
    expect(over(5, 3600)).toBe(
      "Your bot's personality is 5 characters over the 3600-character budget Build a Bot uses for a dot message.",
    );
  });

  it('the rules table caption and setting label', () => {
    expect(copy.certificate.customRules.caption).toBe(CAPTION);
    expect(copy.certificate.customRules.settingToRequest).toBe('Setting to request:');
    // The label every other rule list uses is unchanged.
    expect(copy.certificate.customRules.setting).toBe('Setting:');
  });

  it('the preview disclosure', () => {
    expect(copy.chat.dotDisclosure).toBe(DISCLOSURE);
    // The preview sends the panel's earlier turns, so the line says it remembers recent messages.
    expect(copy.chat.dotDisclosure.endsWith('It does remember recent messages in this preview.')).toBe(true);
  });

  it('the dot group headings are Workflows and Scheduled tasks, and the general headings are unchanged', () => {
    expect(copy.certificate.groups.dotSkills).toBe('Workflows');
    expect(copy.certificate.groups.dotRoutines).toBe('Scheduled tasks');
    expect(copy.certificate.groups.skills).toBe('Skills');
    expect(copy.certificate.groups.routines).toBe('Routines');
    expect(copy.certificate.groups.standing).toBe('Standing instructions');
  });

  it('the "To fit" target on the dot names Build a Bot\'s budget for a dot message', () => {
    expect(copy.certificate.summary.dotBudget(3600)).toBe("Build a Bot's 3600-character budget for a dot message");
    expect(copy.certificate.summary.dotBudget(1200)).toBe("Build a Bot's 1200-character budget for a dot message");
    // It fills the generic line, so it reads as a sentence.
    expect(copy.certificate.summary.trimmedPack(copy.certificate.summary.dotBudget(3600), 2, 'Personal ops')).toBe(
      "To fit Build a Bot's 3600-character budget for a dot message, 2 rules from Personal ops were left out.",
    );
  });

  it('the general (non-dot) lines are unchanged', () => {
    expect(copy.certificate.summary.auto).toBe('Auto, no yes asked:');
    expect(copy.certificate.summary.over(5, 3475, 'ChatGPT')).toBe(
      "Your bot's personality is 5 characters over the 3475 limit for ChatGPT.",
    );
  });

  it('no copy string on the dot says the rules are enforced by ChatGPT or lives at an assumed Settings path', () => {
    const dotStrings = [
      copy.gatesCopy['chatgpt-dot'],
      copy.gates.floorNotes.trade,
      copy.certificate.summary.autoDot,
      copy.certificate.summary.dotAutoNoLimits(1),
      copy.certificate.summary.dotAutoNoLimits(2),
      copy.certificate.summary.overDot(5, 3600),
      copy.certificate.customRules.caption,
      copy.certificate.customRules.settingToRequest,
      copy.certificate.summary.dotBudget(3600),
      copy.certificate.groups.dotSkills,
      copy.certificate.groups.dotRoutines,
      copy.chat.dotDisclosure,
    ];
    for (const text of dotStrings) {
      expect(text, text).not.toMatch(/enforce|outrank|Settings >/i);
    }
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

  // The dot's line was replaced by docs/DOT-FIX-PLAN.md section 5: the dot asks for permissions, it
  // does not enforce them, so the brief's "Custom Rules in Settings, which ChatGPT enforces" is gone.
  const DOT_GATES_LINE =
    'these become permissions to request in your dot. They do nothing until you set them up there and check they saved.';
  const OTHER_GATES = Object.entries(copy.gatesCopy).filter(([id]) => id !== 'chatgpt-dot');

  it.each(OTHER_GATES)('%s line appears verbatim, in quotes, in the brief', (_id, line) => {
    expect(gatesBullet).toContain(`"${line}"`);
  });

  it('the chatgpt-dot line is the plan\'s line, and is no longer the brief\'s enforced-rules line', () => {
    const plan = readFileSync(path.join(ROOT, 'docs', 'DOT-FIX-PLAN.md'), 'utf8');
    expect(plan).toContain(`gatesCopy['chatgpt-dot']\`: "${DOT_GATES_LINE}"`);
    expect(copy.gatesCopy['chatgpt-dot']).toBe(DOT_GATES_LINE);
    expect(gatesBullet).not.toContain(`"${copy.gatesCopy['chatgpt-dot']}"`);
    expect(copy.gatesCopy['chatgpt-dot']).not.toMatch(/enforce|Custom Rules/);
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
