// @vitest-environment jsdom
//
// Link tests (M4 slice 4.7b). Renders <App/> in jsdom with the address bar set to a share link, the
// way a person arrives from a pasted link, and drives the store for the remix lifecycle.
//
// Expected behavior comes from docs/M4-PLAN.md section 3 ("Store, flow and links", "Remix screen",
// "Links") and QUESTIONS.md W7 (read once, clean the address bar, no storage), W9 (loadBuild), W11
// (remix from the certificate), W26 (link errors) and W27 (remix state lifecycle). The oracle for a
// loaded link is the original build: the 55 golden builds from tools/golden.ts, the nine roster
// builds as v1 links, and a few custom builds made here from library records. Compile output is
// compared with the compile of the original build, never with fixed text. UI strings are read from
// src/ui/copy.ts, and screens are told apart by App's data-screen attribute.
//
// Not testable in jsdom: the layout effect that keeps the Target screen from flashing before the
// link's build is in place (nothing paints here), so that reading is not pinned.

import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compile } from '../src/compiler/compile.js';
import { d2ForBlunt } from '../src/compiler/defaults.js';
import { migrate } from '../src/compiler/migrate.js';
import type { Build, BuildV1, ChatgptMode, Plan, TargetId } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import { decodeBuild, encodeBuild, toShareHash, type Drop } from '../src/share/encode.js';
import { shareUrl } from '../src/share/url.js';
import { App } from '../src/ui/App.js';
import { copy } from '../src/ui/copy.js';
import { canGoBack } from '../src/ui/flow.js';
import { PASTE_MAX, previewBuild, useBuilder, type BuilderState } from '../src/ui/store.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// --- Helpers ---------------------------------------------------------------

const st = () => useBuilder.getState();

function store(fn: (s: ReturnType<typeof st>) => void): void {
  act(() => {
    fn(st());
  });
}

const origin = () => window.location.origin;
const pathname = () => window.location.pathname;

function openAt(href: string): void {
  window.history.replaceState(null, '', href);
}

function linkTo(source: Build | BuildV1): string {
  return shareUrl(origin(), pathname(), source);
}

function remixLinkTo(source: Build | BuildV1): string {
  return origin() + pathname() + '?remix=1' + toShareHash(source);
}

// The screen App is showing, from its data-screen attribute.
function shown(): string | null {
  return document.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null;
}

const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');

// What the draft side of the state holds. A settle-equivalent action must leave all of it alone.
function picksOf(s: BuilderState) {
  return structuredClone({
    draft: s.draft,
    target: s.target,
    mode: s.mode,
    plan: s.plan,
    touched: s.touched,
    advancedRoles: s.advancedRoles,
  });
}

const storageSpies: Record<string, MockInstance> = {};

function expectNothingStored(ctx: string): void {
  for (const [name, spy] of Object.entries(storageSpies)) {
    expect(spy.mock.calls, `${ctx}: Storage.${name} was not called`).toEqual([]);
  }
  expect(localStorage.length, `${ctx}: localStorage is empty`).toBe(0);
  expect(sessionStorage.length, `${ctx}: sessionStorage is empty`).toBe(0);
  expect(document.cookie, `${ctx}: no cookie`).toBe('');
}

function expectCleanAddress(ctx: string): void {
  expect(window.location.hash, `${ctx}: no hash`).toBe('');
  expect(window.location.search, `${ctx}: no remix param`).toBe('');
  expect(window.location.href, `${ctx}: origin and path only`).toBe(origin() + pathname());
}

beforeEach(() => {
  st().reset();
  openAt('/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  for (const name of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) {
    storageSpies[name] = vi.spyOn(Storage.prototype, name);
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  st().reset();
  openAt('/');
});

// --- The builds under test --------------------------------------------------

interface Case {
  id: string;
  source: Build | BuildV1; // what the link carries
  original: Build; // what the app must show
}

const GOLDEN: Case[] = GOLDEN_SPECS.map((spec) => {
  const build = buildFor(spec, library);
  return { id: spec.id, source: build, original: build };
});

// A roster link is the v1 roster build, which opens on Muse.
const ROSTER: Case[] = library.roster.map((entry) => ({
  id: entry.id,
  source: entry.build,
  original: migrate(entry.build, { target: 'muse' }),
}));

function rosterBuild(id: string): BuildV1 {
  const entry = library.roster.find((r) => r.id === id);
  if (!entry) throw new Error(`test setup: no roster entry ${id}`);
  return entry.build;
}

// Marty on OpenClaw with every pick a link can carry beyond the chips: packs that no longer follow
// the chips, a gate and a limit override, a role team, a d2 that does not follow blunt.
function customBuild(): Build {
  const base = migrate(rosterBuild('marty'), { target: 'openclaw' });
  const limit = library.limits.find((l) => l.id === 'daily_loss_pct');
  const otherD2 = library.heart.drives.find((d) => d.slot === 'd2' && d.id !== d2ForBlunt(base.stats.blunt));
  if (!limit || !otherD2) throw new Error('test setup: library has no daily_loss_pct limit or no second d2');
  return {
    ...base,
    packs: ['memecoins', 'research'],
    limits: { daily_loss_pct: limit.max },
    gates: { trade: 'forbid' },
    roles: ['scout', 'risk-manager', 'journal'],
    heart: { ...base.heart, d2: otherD2.id },
  };
}

const STORE_CONFIGS: { name: string; target: TargetId; mode?: ChatgptMode; plan?: Plan }[] = [
  { name: 'muse', target: 'muse' },
  { name: 'openclaw', target: 'openclaw' },
  { name: 'hermes', target: 'hermes' },
  { name: 'grok', target: 'grok' },
  { name: 'chatgpt dot', target: 'chatgpt', mode: 'dot' },
  { name: 'chatgpt project', target: 'chatgpt', mode: 'project' },
  { name: 'chatgpt instructions free', target: 'chatgpt', mode: 'instructions', plan: 'free' },
  { name: 'chatgpt instructions paid', target: 'chatgpt', mode: 'instructions', plan: 'paid' },
];

// --- A link opens on the certificate and compiles like the original ---------

describe('a link opens on the certificate and compiles like the original', () => {
  it('has the 55 golden builds and the nine roster links the plan names', () => {
    expect(GOLDEN.length).toBe(55);
    expect(ROSTER.length).toBe(9);
  });

  // Renders the app on a link and checks everything but the settle step.
  function openCase({ id, source, original }: Case): void {
    openAt(linkTo(source));
    expect(window.location.hash, `${id}: the link is in the address bar before render`).not.toBe('');
    render(<App />);

    // It lands on the certificate, as a link.
    expect(shown(), id).toBe('certificate');
    expect(st().from, id).toBe('link');
    expect(st().linkError, id).toBeUndefined();

    // Every pick came across: target, mode, plan, packs, limits, gates, roles and the rest.
    expect(previewBuild(st()), id).toEqual(original);
    expect(compile(previewBuild(st())), id).toEqual(compile(original));
    expect(st().drops, `${id}: a valid link drops nothing`).toEqual([]);
    expect(st().decodeWarnings, `${id}: and warns of nothing`).toEqual([]);
    expect(st().baseline, `${id}: the loaded build is the diff baseline`).toEqual(original);
    expect(st().skipped, `${id}: links carry no skipped list`).toEqual([]);

    // The link is read once and cleared, and nothing was stored.
    expectCleanAddress(id);
    expectNothingStored(id);
  }

  // A settle-equivalent action (the same name again) changes no pick.
  function expectSettleNoop({ id, original }: Case): void {
    const before = picksOf(st());
    store((s) => s.setName(s.draft.name));
    expect(picksOf(st()), `${id}: setName with the same name`).toEqual(before);
    expect(previewBuild(st()), `${id}: build after the no-op`).toEqual(original);
    expect(compile(previewBuild(st())), `${id}: compile after the no-op`).toEqual(compile(original));
  }

  // Sol's golden asks for the research role team on a build with no packs. The compiler accepts it,
  // and since the lead fix (QUESTIONS W35) settle keeps roles a change did not take the packs from.
  it.each(GOLDEN)('golden build $id', (c) => {
    openCase(c);
    expectSettleNoop(c);
  });

  it.each(ROSTER)('roster link $id', (c) => {
    openCase(c);
    expectSettleNoop(c);
  });

  it('a roster link has no target, so it opens on Muse', () => {
    for (const c of ROSTER) {
      expect(c.original.target, c.id).toBe('muse');
    }
  });
});

describe('a link and the store, for every starter on every target and ChatGPT mode', () => {
  const rows = library.roster.flatMap((entry) =>
    STORE_CONFIGS.map((cfg) => ({ label: `${entry.id} on ${cfg.name}`, entry, cfg })),
  );

  it.each(rows)('$label: loadBuild keeps the build, and settle changes nothing', ({ entry, cfg }) => {
    const original = migrate(entry.build, { target: cfg.target, mode: cfg.mode, plan: cfg.plan });
    const { build, warnings, drops } = decodeBuild(encodeBuild(original), library);
    store((s) => s.loadBuild(build, { from: 'link', warnings, drops }));
    expect(st().screen).toBe('certificate');
    expect(st().target).toBe(cfg.target);
    expect(st().mode).toBe(cfg.mode);
    expect(st().plan).toBe(cfg.plan);
    expect(previewBuild(st())).toEqual(original);
    expect(compile(previewBuild(st()))).toEqual(compile(original));
    const before = picksOf(st());
    store((s) => s.setName(s.draft.name));
    expect(picksOf(st())).toEqual(before);
  });

  it.each(library.roster.map((r) => r.id))('%s in the hidden gpt mode loads and compiles like the original', (id) => {
    const original = migrate(rosterBuild(id), { target: 'chatgpt', mode: 'gpt' });
    const { build, warnings, drops } = decodeBuild(encodeBuild(original), library);
    store((s) => s.loadBuild(build, { from: 'link', warnings, drops }));
    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe('gpt');
    expect(previewBuild(st())).toEqual(original);
    expect(compile(previewBuild(st()))).toEqual(compile(original));
  });
});

// --- What a link keeps (W9) ---------------------------------------------------

describe('what a link keeps', () => {
  it('keeps packs, limits, gates, roles and d2 that the chips would not give', () => {
    const original = customBuild();
    openAt(linkTo(original));
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(previewBuild(st())).toEqual(original);
    expect(compile(previewBuild(st()))).toEqual(compile(original));
    expect(st().draft.packs).toEqual(['memecoins', 'research']);
    expect(st().draft.limits).toEqual(original.limits);
    expect(st().draft.gates).toEqual({ trade: 'forbid' });
    expect(st().draft.roles).toEqual(['scout', 'risk-manager', 'journal']);
    expect(st().advancedRoles).toBe(true);
    expect(st().touched).toEqual({ packs: true, d2: true, proactive: false });
    expect(st().nudged).toBe(false);

    // None of it moves on a settle-equivalent action.
    const before = picksOf(st());
    store((s) => s.setName(s.draft.name));
    expect(picksOf(st())).toEqual(before);
  });

  it('packs that matched the chips keep following them, and picked packs do not (W9)', () => {
    const marty = migrate(rosterBuild('marty'), { target: 'openclaw' });
    expect(marty.packs).toEqual(['memecoins']);
    store((s) => s.loadBuild(marty, { from: 'link' }));
    expect(st().touched.packs).toBe(false);
    store((s) => s.toggleChip('engineering'));
    expect(st().draft.packs).toEqual(['memecoins', 'coding']);

    store((s) => s.loadBuild(customBuild(), { from: 'link' }));
    expect(st().touched.packs).toBe(true);
    store((s) => s.toggleChip('engineering'));
    expect(st().draft.packs).toEqual(['memecoins', 'research']);
  });

  it('d2 follows blunt only when the link did not set it', () => {
    const marty = migrate(rosterBuild('marty'), { target: 'muse' });
    store((s) => s.loadBuild(marty, { from: 'link' }));
    expect(st().touched.d2).toBe(false);
    store((s) => s.loadBuild(customBuild(), { from: 'link' }));
    expect(st().touched.d2).toBe(true);
  });

  it('keeps the ChatGPT mode and plan a link carries', () => {
    const original = migrate(rosterBuild('june'), { target: 'chatgpt', mode: 'instructions', plan: 'paid' });
    openAt(linkTo(original));
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('paid');
    expect(compile(previewBuild(st()))).toEqual(compile(original));
  });

  it('an empty role list counts as no roles', () => {
    const original = { ...migrate(rosterBuild('june'), { target: 'muse' }), roles: [] };
    store((s) => s.loadBuild(original, { from: 'link' }));
    expect(st().draft.roles).toBeUndefined();
    expect(st().advancedRoles).toBe(false);
  });

  it('resets what a link must not carry: nudged, skipped, the badge and the screen order', () => {
    store((s) => {
      s.setTarget('muse');
      s.startBlank();
      s.setBase('trader');
      s.go('world');
      s.skip();
    });
    expect(st().skipped.length).toBeGreaterThan(0);
    const june = migrate(rosterBuild('june'), { target: 'hermes' });
    store((s) => s.loadBuild(june, { from: 'link' }));
    expect(st().skipped).toEqual([]);
    expect(st().nudged).toBe(false);
    expect(st().lastBadge).toBeNull();
    expect(st().screen).toBe('certificate');
    expect(st().target).toBe('hermes');
  });

  it('a link replaces the whole earlier draft', () => {
    store((s) => {
      s.setTarget('grok');
      s.startBlank();
      s.setBase('trader');
      s.toggleChip('memecoins');
      s.setName('Earlier');
      s.togglePeeve('adds_disclaimers');
    });
    const june = migrate(rosterBuild('june'), { target: 'hermes' });
    store((s) => s.loadBuild(june, { from: 'link' }));
    expect(previewBuild(st())).toEqual(june);
  });
});

describe('loadBuild is one set with no settle (W9)', () => {
  it('keeps roles a settle would drop, so the load itself changes nothing', () => {
    const june = migrate(rosterBuild('june'), { target: 'hermes' });
    expect(june.packs).toEqual(expect.not.arrayContaining(['research']));
    const team = ['lead', 'searcher', 'synthesizer', 'fact-checker'];
    store((s) => s.loadBuild({ ...june, packs: [], roles: team }, { from: 'link' }));
    expect(st().draft.roles).toEqual(team);
    expect(st().advancedRoles).toBe(true);
  });
});

describe('the address bar is cleaned once, even where the frame refuses it', () => {
  it('a frame that refuses replaceState still opens a good link', () => {
    const original = migrate(rosterBuild('june'), { target: 'muse' });
    openAt(linkTo(original));
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('refused', 'SecurityError');
    });
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().linkError).toBeUndefined();
    expect(previewBuild(st())).toEqual(original);
  });

  it('a frame that refuses replaceState still shows the link error for a bad link', () => {
    openAt(origin() + pathname() + '#b=' + b64('not json'));
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('refused', 'SecurityError');
    });
    render(<App />);
    expect(shown()).toBe('link-error');
  });
});

// --- Drops are kept, never rendered --------------------------------------------

describe('what decode dropped', () => {
  const MARKER = 'zz_unknown_marker_71';

  it('keeps the drops and warnings, and never puts an unknown id on the page', () => {
    const original = migrate(rosterBuild('marty'), { target: 'muse' });
    const dirty = { ...original, chips: [...original.chips, MARKER], base: MARKER };
    openAt(linkTo(dirty as Build));
    render(<App />);

    expect(shown()).toBe('certificate');
    expect(st().drops).toContainEqual({ field: 'chips', id: MARKER, reason: 'unknown' });
    expect(st().drops).toContainEqual({ field: 'base', id: MARKER, reason: 'fallback' });
    expect(st().decodeWarnings.length).toBeGreaterThan(0);
    for (const w of st().decodeWarnings) expect(w, 'warnings never echo the id').not.toContain(MARKER);
    expect(document.body.textContent ?? '').not.toContain(MARKER);
    // The build that opened is a valid one.
    expect(() => compile(previewBuild(st()))).not.toThrow();
    expectCleanAddress('dropped ids');
  });

  it('loadBuild stores the warnings and drops it is given, and a later load replaces them', () => {
    const june = migrate(rosterBuild('june'), { target: 'muse' });
    const drops: Drop[] = [{ field: 'peeves', id: 'x', reason: 'unknown' }];
    store((s) => s.loadBuild(june, { from: 'link', warnings: ['one'], drops }));
    expect(st().decodeWarnings).toEqual(['one']);
    expect(st().drops).toEqual(drops);
    store((s) => s.loadBuild(june, { from: 'link' }));
    expect(st().decodeWarnings).toEqual([]);
    expect(st().drops).toEqual([]);
  });
});

// --- A link that cannot be opened (W26) -------------------------------------------

describe('a link that cannot be opened', () => {
  const june = migrate(rosterBuild('june'), { target: 'muse' });
  const GOOD = encodeBuild(june);
  const GARBAGE: { name: string; payload: string }[] = [
    { name: 'an empty payload', payload: '' },
    { name: 'characters outside base64url', payload: '!!!!' },
    { name: 'a length that cannot be base64url', payload: 'a' },
    { name: 'text that is not JSON', payload: b64('not json') },
    { name: 'JSON that is not an object', payload: b64('[]') },
    { name: 'an object with no fields', payload: b64('{"v":2}') },
    { name: 'a version newer than the library', payload: b64('{"v":99}') },
    { name: 'a payload cut off half way', payload: GOOD.slice(0, Math.floor(GOOD.length / 2)) },
    { name: 'a build whose chips are not ids', payload: encodeBuild({ ...june, chips: [1, 2] } as unknown as Build) },
    { name: 'a build with an unknown target', payload: encodeBuild({ ...june, target: 'nope' } as unknown as Build) },
  ];

  function expectLinkError(ctx: string): void {
    expect(shown(), ctx).toBe('link-error');
    expect(screen.getByRole('heading', { level: 1, name: copy.linkError.title }), ctx).toBeTruthy();
    expect(screen.getByText(copy.linkError.message), ctx).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.linkError.startOver }), ctx).toBeTruthy();
    // Nothing from the link or the decoder reaches the page.
    const text = document.body.textContent ?? '';
    expect(text, `${ctx}: no developer message`).not.toMatch(/share:|Invalid build|ShareDecodeError|payload|migrate:/);
    expect(typeof st().linkError, `${ctx}: the store keeps a message for debugging`).toBe('string');
    if (st().linkError) expect(text, `${ctx}: and the page does not print it`).not.toContain(st().linkError as string);
  }

  it.each(GARBAGE)('shows the link error view for $name', ({ name, payload }) => {
    openAt(origin() + pathname() + '#b=' + payload);
    render(<App />);
    expectLinkError(name);
    // A short payload could match ordinary words, so only a long one is checked for an echo.
    if (payload.length > 12) expect(document.body.textContent ?? '', name).not.toContain(payload);
    expectCleanAddress(name);
    expectNothingStored(name);
  });

  it('shows the link error view, not the remix screen, for a bad remix link', () => {
    openAt(origin() + pathname() + '?remix=1#b=' + b64('not json'));
    render(<App />);
    expectLinkError('bad remix link');
    expect(st().from).toBeNull();
    expectCleanAddress('bad remix link');
  });

  it('the link error shows ahead of any screen, and loads no build', () => {
    openAt(origin() + pathname() + '#b=' + b64('not json'));
    render(<App />);
    expect(st().screen).toBe('target');
    expect(st().target).toBeNull();
    expect(st().from).toBeNull();
    expect(st().baseline).toBeUndefined();
  });

  it('Start over returns to the target screen with nothing carried over', async () => {
    const user = userEvent.setup();
    openAt(origin() + pathname() + '#b=' + b64('not json'));
    render(<App />);
    expect(shown()).toBe('link-error');
    await user.click(screen.getByRole('button', { name: copy.linkError.startOver }));
    expect(shown()).toBe('target');
    expect(st().linkError).toBeUndefined();
    expect(st().screen).toBe('target');
    expect(st().target).toBeNull();
    expect(st().from).toBeNull();
    expect(screen.queryByText(copy.linkError.message)).toBeNull();
    expectCleanAddress('after Start over');
  });

  it('the app works after Start over: a target can be picked and the roster opens', async () => {
    const user = userEvent.setup();
    openAt(origin() + pathname() + '#b=' + b64('not json'));
    render(<App />);
    await user.click(screen.getByRole('button', { name: copy.linkError.startOver }));
    store((s) => s.setTarget('muse'));
    store((s) => s.next());
    expect(shown()).toBe('roster');
  });
});

// --- Opening the app without a link ----------------------------------------------------

describe('a visit with no link', () => {
  it.each(['/', '/#something', '/?remix=1', '/?other=1#nothing'])('%s opens on the target screen', (href) => {
    openAt(href);
    render(<App />);
    expect(shown()).toBe('target');
    expect(st().linkError).toBeUndefined();
    expect(st().from).toBeNull();
    expect(st().baseline).toBeUndefined();
    expect(st().target).toBeNull();
    expectNothingStored(href);
  });
});

// --- React StrictMode ----------------------------------------------------------------------

describe('under React StrictMode, which runs effects twice in development', () => {
  it('a good link still lands on the certificate', () => {
    const original = migrate(rosterBuild('rook'), { target: 'hermes' });
    openAt(linkTo(original));
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('link');
    expect(st().linkError).toBeUndefined();
    expect(previewBuild(st())).toEqual(original);
    expectCleanAddress('strict mode');
  });

  it('a bad link still shows the link error view', () => {
    openAt(origin() + pathname() + '#b=' + b64('not json'));
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(shown()).toBe('link-error');
    expectCleanAddress('strict mode, bad link');
  });

  it('a remix link still lands on the remix screen', () => {
    const original = migrate(rosterBuild('june'), { target: 'grok' });
    openAt(remixLinkTo(original));
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(shown()).toBe('remix');
    expect(st().from).toBe('link-remix');
    expectCleanAddress('strict mode, remix link');
  });
});

// --- A link remix ------------------------------------------------------------------------------

describe('?remix=1 opens the remix screen', () => {
  const original = migrate(rosterBuild('june'), { target: 'openclaw' });

  it('lands on the remix screen with from "link-remix", the build kept as the baseline', () => {
    openAt(remixLinkTo(original));
    render(<App />);
    expect(shown()).toBe('remix');
    expect(st().screen).toBe('remix');
    expect(st().from).toBe('link-remix');
    expect(st().baseline).toEqual(original);
    expect(previewBuild(st())).toEqual(original);
    expect(compile(previewBuild(st()))).toEqual(compile(original));
    expect(screen.getByRole('heading', { level: 1, name: copy.screens.remix.title })).toBeTruthy();
    expect(st().pasted).toBe('');
    expect(st().mineOn).toBe(false);
    expectCleanAddress('remix link');
    expectNothingStored('remix link');
  });

  it('every golden build opens on the remix screen as a link remix', () => {
    for (const c of GOLDEN) {
      cleanup();
      st().reset();
      openAt(remixLinkTo(c.source));
      render(<App />);
      expect(shown(), c.id).toBe('remix');
      expect(st().from, c.id).toBe('link-remix');
      expect(previewBuild(st()), c.id).toEqual(c.original);
      expectCleanAddress(c.id);
    }
  });

  it('Back from base returns to the remix screen', async () => {
    const user = userEvent.setup();
    openAt(remixLinkTo(original));
    render(<App />);
    expect(shown()).toBe('remix');

    store((s) => s.next());
    expect(shown()).toBe('base');
    await user.click(screen.getByRole('button', { name: copy.buttons.back }));
    expect(shown()).toBe('remix');
  });

  it('Back from the remix screen returns to the certificate', async () => {
    const user = userEvent.setup();
    openAt(remixLinkTo(original));
    render(<App />);
    expect(shown()).toBe('remix');
    await user.click(screen.getByRole('button', { name: copy.buttons.back }));
    expect(shown()).toBe('certificate');
  });

  it('the picks survive the trip from the remix screen to base and back', async () => {
    const user = userEvent.setup();
    openAt(remixLinkTo(original));
    render(<App />);
    store((s) => s.next());
    await user.click(screen.getByRole('button', { name: copy.buttons.back }));
    expect(previewBuild(st())).toEqual(original);
    expect(st().baseline).toEqual(original);
  });

  it('the remix screen is a side screen with no Skip and no progress dots', () => {
    openAt(remixLinkTo(original));
    render(<App />);
    expect(shown()).toBe('remix');
    expect(screen.queryByRole('button', { name: copy.buttons.skip })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    // The check is real: base, which is a numbered station, does show the progress dots.
    store((s) => s.next());
    expect(shown()).toBe('base');
    expect(screen.queryByRole('progressbar')).not.toBeNull();
  });

  it('a plain link is not a link remix', () => {
    openAt(linkTo(original));
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('link');
  });
});

// --- Back on a link's certificate -------------------------------------------------------------

describe('Back on a certificate opened from a link', () => {
  const original = migrate(rosterBuild('june'), { target: 'muse' });

  it('goes nowhere, because there is nothing behind a link', () => {
    store((s) => s.loadBuild(original, { from: 'link' }));
    expect(st().screen).toBe('certificate');
    expect(canGoBack(st())).toBe(false);
    store((s) => s.back());
    expect(st().screen).toBe('certificate');
  });

  it('is available on the target screen only where there is somewhere to go', () => {
    expect(canGoBack(st())).toBe(false);
    store((s) => {
      s.setTarget('muse');
      s.useStarter('june');
    });
    // A starter in use came from the roster, so Back returns there.
    expect(st().screen).toBe('certificate');
    expect(canGoBack(st())).toBe(true);
    store((s) => s.back());
    expect(st().screen).toBe('roster');
  });

  // Plan section 3: "Back is hidden there." Station hides Back only on the target screen, and the
  // Certificate and Station files belong to slice 4.12, so the button still shows. Marked as a known
  // gap: when 4.12 hides Back for a link's certificate this test passes, and the .fails must go.
  it.fails('shows no Back button on a link certificate (not wired yet, slice 4.12)', () => {
    openAt(linkTo(original));
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(screen.queryByRole('button', { name: copy.buttons.back })).toBeNull();
  });
});

// --- startRemix ------------------------------------------------------------------------------------

describe('startRemix', () => {
  it('sets the baseline to the current build and lands on the remix screen', () => {
    store((s) => {
      s.setTarget('hermes');
      s.useStarter('rook');
    });
    expect(st().screen).toBe('certificate');
    const current = structuredClone(previewBuild(st()));
    store((s) => s.startRemix());
    expect(st().screen).toBe('remix');
    expect(st().baseline).toEqual(current);
  });

  it('leaves the picks alone', () => {
    store((s) => {
      s.setTarget('chatgpt', 'instructions', 'paid');
      s.useStarter('marty');
    });
    const before = picksOf(st());
    store((s) => s.startRemix());
    expect(picksOf(st())).toEqual(before);
  });

  it('takes a snapshot: later edits do not change the baseline', () => {
    store((s) => {
      s.setTarget('muse');
      s.useStarter('june');
    });
    const name = st().draft.name;
    store((s) => s.startRemix());
    store((s) => s.setName('Changed'));
    expect(st().baseline?.name).toBe(name);
    expect(previewBuild(st()).name).toBe('Changed');
  });

  it('on a link certificate, the baseline is the link build, and Continue goes to base', () => {
    const original = migrate(rosterBuild('june'), { target: 'grok' });
    store((s) => s.loadBuild(original, { from: 'link' }));
    store((s) => s.startRemix());
    expect(st().screen).toBe('remix');
    expect(st().baseline).toEqual(original);
    store((s) => s.next());
    expect(st().screen).toBe('base');
  });

  it('the roster Remix still goes straight to base, without the remix screen (B13)', () => {
    store((s) => {
      s.setTarget('muse');
      s.remixStarter('june');
    });
    expect(st().screen).toBe('base');
    expect(st().from).toBe('remix');
  });
});

// --- Remix state is cleared by every entry point (W27) ---------------------------------------

describe('pasted, mineOn, baseline and drops are cleared by every entry point', () => {
  const june = migrate(rosterBuild('june'), { target: 'muse' });
  const marty = migrate(rosterBuild('marty'), { target: 'muse' });

  // A state that holds every link and remix field, so a clear is a real change.
  function dirty(): void {
    store((s) =>
      s.loadBuild(june, {
        from: 'link-remix',
        warnings: ['a warning'],
        drops: [{ field: 'chips', id: 'x', reason: 'unknown' }],
      }),
    );
    store((s) => {
      s.setPasted('my own personality text');
      s.setMineOn(true);
    });
    useBuilder.setState({ linkError: 'a leftover link error' });
    expect(st().pasted).toBe('my own personality text');
    expect(st().mineOn).toBe(true);
    expect(st().baseline).toEqual(june);
    expect(st().drops.length).toBe(1);
    expect(st().decodeWarnings.length).toBe(1);
    expect(st().linkError).toBeDefined();
  }

  function expectCleared(ctx: string): void {
    expect(st().pasted, `${ctx}: pasted`).toBe('');
    expect(st().mineOn, `${ctx}: mineOn`).toBe(false);
    expect(st().baseline, `${ctx}: baseline`).toBeUndefined();
    expect(st().drops, `${ctx}: drops`).toEqual([]);
    expect(st().decodeWarnings, `${ctx}: decodeWarnings`).toEqual([]);
    expect(st().linkError, `${ctx}: linkError`).toBeUndefined();
  }

  it('startBlank', () => {
    dirty();
    store((s) => s.startBlank());
    expectCleared('startBlank');
    expect(st().from).toBe('blank');
    expect(st().screen).toBe('base');
  });

  it('useStarter', () => {
    dirty();
    store((s) => s.useStarter('marty'));
    expectCleared('useStarter');
    expect(st().from).toBe('roster');
    expect(st().screen).toBe('certificate');
  });

  it('remixStarter', () => {
    dirty();
    store((s) => s.remixStarter('marty'));
    expectCleared('remixStarter');
    expect(st().from).toBe('remix');
    expect(st().screen).toBe('base');
  });

  it('reset', () => {
    dirty();
    store((s) => s.reset());
    expectCleared('reset');
    expect(st().from).toBeNull();
    expect(st().screen).toBe('target');
  });

  it('loadBuild: a second link does not inherit the first link remix state', () => {
    dirty();
    store((s) => s.loadBuild(marty, { from: 'link' }));
    expect(st().pasted).toBe('');
    expect(st().mineOn).toBe(false);
    expect(st().baseline).toEqual(marty);
    expect(st().drops).toEqual([]);
    expect(st().decodeWarnings).toEqual([]);
    expect(st().linkError).toBeUndefined();
    expect(st().from).toBe('link');
  });

  it('a starter in use after a link leaves no baseline behind to diff against', () => {
    dirty();
    store((s) => s.useStarter('marty'));
    store((s) => s.startRemix());
    // The baseline is the starter's build, not the earlier link's.
    expect(st().baseline).toEqual(previewBuild(st()));
    expect(st().baseline?.name).toBe(marty.name);
  });

  it('the pasted text and the Mine switch are plain memory: they are not part of the build', () => {
    dirty();
    const build = structuredClone(previewBuild(st()));
    store((s) => s.setPasted('another paste'));
    expect(previewBuild(st())).toEqual(build);
    expect(encodeBuild(previewBuild(st()))).toBe(encodeBuild(build));
  });
});

describe('the pasted text cap (W12)', () => {
  it('is 20,000 characters', () => {
    expect(PASTE_MAX).toBe(20000);
  });

  it('keeps text under the cap as typed', () => {
    store((s) => s.setPasted('line one\nline two'));
    expect(st().pasted).toBe('line one\nline two');
  });

  it('cuts text over the cap at 20,000', () => {
    store((s) => s.setPasted('a'.repeat(PASTE_MAX + 500)));
    expect(st().pasted.length).toBe(PASTE_MAX);
  });

  it('does not leave half of an emoji at the cut', () => {
    store((s) => s.setPasted('a'.repeat(PASTE_MAX - 1) + '\u{1F600}'));
    expect(st().pasted.length).toBeLessThanOrEqual(PASTE_MAX);
    expect(/[\uD800-\uDBFF]$/.test(st().pasted)).toBe(false);
  });

  it('can be cleared by setting it empty', () => {
    store((s) => s.setPasted('something'));
    store((s) => s.setPasted(''));
    expect(st().pasted).toBe('');
  });

  it('the Mine switch is a plain boolean', () => {
    expect(st().mineOn).toBe(false);
    store((s) => s.setMineOn(true));
    expect(st().mineOn).toBe(true);
    store((s) => s.setMineOn(false));
    expect(st().mineOn).toBe(false);
  });
});

// --- Nothing is stored (W7) -------------------------------------------------------------------------------

describe('after a link loads, nothing is written to storage', () => {
  it('opening a link, editing, and walking the flow touches no storage', async () => {
    const user = userEvent.setup();
    const original = migrate(rosterBuild('june'), { target: 'muse' });
    openAt(remixLinkTo(original));
    render(<App />);
    expect(shown()).toBe('remix');
    store((s) => s.setPasted('some text I pasted'));
    store((s) => s.setMineOn(true));
    store((s) => s.next());
    await user.click(screen.getByRole('button', { name: copy.buttons.back }));
    store((s) => s.setName('Edited'));
    expectNothingStored('link, remix, edits');
    expectCleanAddress('link, remix, edits');
  });

  it('the address bar stays clean while the build changes, because nothing syncs it back', () => {
    const original = migrate(rosterBuild('june'), { target: 'muse' });
    openAt(linkTo(original));
    render(<App />);
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    store((s) => s.setName('Edited'));
    store((s) => s.toggleChip('engineering'));
    store((s) => s.setBase('professional'));
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expectCleanAddress('after edits');
  });

  it('a hash change after load is not loaded: there is no hashchange loader', () => {
    const june = migrate(rosterBuild('june'), { target: 'muse' });
    const marty = migrate(rosterBuild('marty'), { target: 'muse' });
    openAt(linkTo(june));
    render(<App />);
    expect(previewBuild(st()).name).toBe(june.name);
    act(() => {
      window.location.hash = toShareHash(marty);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(previewBuild(st()).name).toBe(june.name);
    expect(shown()).toBe('certificate');
  });
});
