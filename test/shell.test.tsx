// @vitest-environment jsdom
//
// Shell tests (M4 slice 4.10, W1, docs/M4-PLAN.md section 8). Renders <Shell/> in jsdom with the App
// import mocked to a promise the test controls, so each test decides when the lazy chunk "arrives"
// or "fails". The store is the real one: Shell hands the pick to it before App renders, and the
// mocked App records the store state it sees on every render.
//
// Expected text comes from the library tables (target cards, promise lines, mode labels) and from
// src/ui/copy.ts (the one home of UI strings). Nothing here is copied from what Shell rendered.
//
// Retry reloads the page (the engineer's reading, tested in the browser: a browser caches a failed
// dynamic import for the life of the page, so importing again in place cannot recover). The task text
// said "Retry re-imports"; the test checks the reload, and the in-page re-import that does exist (a
// failed silent prefetch is forgotten, so the next tap imports afresh) is covered separately.

import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import library from '../src/library/index.js';
import { readLocation } from '../src/share/url.js';
import { copy } from '../src/ui/copy.js';
import type { ChatgptMode, Plan, TargetId } from '../src/compiler/types.js';

// ---- The mocked App: a promise the test controls ----

interface Deferred {
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface Seen {
  screen: string;
  target: string | null;
  mode: string | undefined;
  plan: string | undefined;
}

// One entry in `calls` per time Shell's import of App.js actually starts (the mock factory runs).
const ctl = vi.hoisted(() => ({
  calls: [] as { resolve: () => void; reject: (error: unknown) => void }[],
  renders: [] as { screen: string; target: string | null; mode: string | undefined; plan: string | undefined }[],
}));

// Registered fresh by every mount(): vitest caches a mock factory's result across vi.resetModules,
// and each test needs its own gate and its own copy of the store.
function mockApp() {
  vi.doMock('../src/ui/App.js', async () => {
    await new Promise<void>((resolve, reject) => {
      ctl.calls.push({ resolve, reject });
    });
    const React = await import('react');
    const { useBuilder } = await import('../src/ui/store.js');
    function App() {
      const screenId = useBuilder((s) => s.screen);
      const target = useBuilder((s) => s.target);
      const mode = useBuilder((s) => s.mode);
      const plan = useBuilder((s) => s.plan);
      ctl.renders.push({ screen: screenId, target, mode, plan });
      return React.createElement('div', { 'data-testid': 'app' }, `app on ${screenId} for ${target}`);
    }
    return { App };
  });
}

const calls = ctl.calls as Deferred[];
const renders = ctl.renders as Seen[];

// ---- Library lookups ----

const CARDS = library.targets.targets;
const chatgpt = CARDS.find((t) => t.id === 'chatgpt');
if (chatgpt === undefined) throw new Error('library has no chatgpt target card');
const VISIBLE_MODES = (chatgpt.modes ?? []).filter((m) => !m.hidden);
const HIDDEN_MODES = (chatgpt.modes ?? []).filter((m) => m.hidden);

function cardOf(id: TargetId) {
  const card = CARDS.find((t) => t.id === id);
  if (card === undefined) throw new Error(`library has no target ${id}`);
  return card;
}

function modeOf(id: ChatgptMode) {
  const mode = (chatgpt?.modes ?? []).find((m) => m.id === id);
  if (mode === undefined) throw new Error(`library has no chatgpt mode ${id}`);
  return mode;
}

// ---- Rig ----

type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  renders.length = 0;
  window.history.replaceState(null, '', '/');
  // jsdom does not implement scrollTo, and every screen calls it on mount.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

async function mount(opts: { strict?: boolean } = {}) {
  // Fresh modules each time: Shell keeps its one shared load at module level.
  mockApp();
  const { Shell } = await import('../src/ui/Shell.js');
  const { useBuilder } = await import('../src/ui/store.js');
  const user: User = userEvent.setup();
  render(opts.strict ? <StrictMode><Shell /></StrictMode> : <Shell />);
  return { user, useBuilder };
}

const nextButton = () => screen.getByRole('button', { name: copy.buttons.next });
const radio = (name: string) => screen.getByRole('radio', { name });
const isChecked = (el: HTMLElement) => el.getAttribute('aria-checked') === 'true';
const isBlocked = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';

// The mock factory runs a few async hops after Shell calls import(), so "the import started" is awaited.
const started = (n: number) => waitFor(() => expect(calls).toHaveLength(n));

// For "no import yet" and "no second import": give any late start a moment to show itself.
async function quiet() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
}

async function exactly(n: number) {
  await started(n);
  await quiet();
  expect(calls).toHaveLength(n);
}

// Lets the pending App import finish, the way a chunk arriving would.
async function arrive(i = 0) {
  await started(i + 1);
  await act(async () => {
    calls[i].resolve();
  });
}

async function fail(i = 0, error: unknown = new Error('chunk failed')) {
  await started(i + 1);
  await act(async () => {
    calls[i].reject(error);
  });
}

// Starts a link visit: the URL the page opens on, set before Shell mounts.
function openAt(path: string) {
  window.history.replaceState(null, '', path);
}

// ---- First paint ----

describe('Shell first paint, before App resolves', () => {
  it('renders the five target cards, labelled and with their promise lines', async () => {
    await mount();
    expect(CARDS).toHaveLength(5);

    const group = screen.getByRole('radiogroup', { name: copy.screens.target.title });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(5);
    for (const card of CARDS) {
      const r = within(group).getByRole('radio', { name: card.label });
      expect(r.getAttribute('aria-describedby')).toBeTruthy();
      expect(within(r).getByText(card.promise.line)).toBeTruthy();
      expect(isChecked(r)).toBe(false);
    }
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.screens.target.title);
    expect(screen.getByText(copy.screens.target.subtitle)).toBeTruthy();
  });

  it('shows the first paint while the App import is still pending', async () => {
    await mount();
    // Nothing from App is on screen, and no loading or failed view.
    expect(screen.queryByTestId('app')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: copy.screens.target.title })).toBeTruthy();
  });

  it('marks the page column as the target screen', async () => {
    await mount();
    const column = document.querySelector('[data-screen]');
    expect(column?.getAttribute('data-screen')).toBe('target');
  });

  it('shows no mode picker and no plan picker before a pick', async () => {
    await mount();
    expect(screen.queryByRole('radiogroup', { name: copy.target.modeLegend })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: copy.target.planLegend })).toBeNull();
  });

  it('shows the ChatGPT modes after ChatGPT is tapped, and only the visible ones', async () => {
    const { user } = await mount();
    await user.click(radio(chatgpt.label));

    const modes = screen.getByRole('radiogroup', { name: copy.target.modeLegend });
    const radios = within(modes).getAllByRole('radio');
    expect(radios).toHaveLength(VISIBLE_MODES.length);
    for (const m of VISIBLE_MODES) {
      const r = within(modes).getByRole('radio', { name: m.label });
      expect(within(r).getByText(m.note.line)).toBeTruthy();
    }
    // The hidden mode (Custom GPT) stays in the compiler and out of the picker.
    expect(HIDDEN_MODES.length).toBeGreaterThan(0);
    for (const m of HIDDEN_MODES) expect(within(modes).queryByRole('radio', { name: m.label })).toBeNull();
  });

  it('opens ChatGPT on the Dot mode, the same default the store gives', async () => {
    const { user, useBuilder } = await mount();
    await user.click(radio(chatgpt.label));
    expect(isChecked(radio(modeOf('dot').label))).toBe(true);
    expect(isChecked(radio(modeOf('project').label))).toBe(false);
    expect(isChecked(radio(modeOf('instructions').label))).toBe(false);

    // The store's own pick for a bare ChatGPT tap, as the oracle.
    useBuilder.getState().setTarget('chatgpt');
    expect(useBuilder.getState().mode).toBe('dot');
  });

  it('shows no mode picker for a target that has no modes', async () => {
    const { user } = await mount();
    for (const id of ['muse', 'openclaw', 'hermes', 'grok'] as const) {
      await user.click(radio(cardOf(id).label));
      expect(screen.queryByRole('radiogroup', { name: copy.target.modeLegend })).toBeNull();
      expect(isChecked(radio(cardOf(id).label))).toBe(true);
    }
  });

  it('moves the pick: only the last tapped card is selected', async () => {
    const { user } = await mount();
    await user.click(radio(cardOf('muse').label));
    await user.click(radio(cardOf('grok').label));
    const picked = CARDS.filter((c) => isChecked(radio(c.label))).map((c) => c.id);
    expect(picked).toEqual(['grok']);
  });

  it('opens the plan picker for Custom instructions, on Free, and lets the plan change', async () => {
    const { user } = await mount();
    await user.click(radio(chatgpt.label));
    expect(screen.queryByRole('radiogroup', { name: copy.target.planLegend })).toBeNull();

    await user.click(radio(modeOf('instructions').label));
    const plans = screen.getByRole('radiogroup', { name: copy.target.planLegend });
    expect(within(plans).getAllByRole('radio')).toHaveLength(2);
    expect(isChecked(within(plans).getByRole('radio', { name: copy.target.plans.free }))).toBe(true);
    expect(isChecked(within(plans).getByRole('radio', { name: copy.target.plans.paid }))).toBe(false);

    await user.click(within(plans).getByRole('radio', { name: copy.target.plans.paid }));
    expect(isChecked(within(plans).getByRole('radio', { name: copy.target.plans.paid }))).toBe(true);
    expect(isChecked(within(plans).getByRole('radio', { name: copy.target.plans.free }))).toBe(false);

    // Leaving Custom instructions takes the plan picker away.
    await user.click(radio(modeOf('project').label));
    expect(screen.queryByRole('radiogroup', { name: copy.target.planLegend })).toBeNull();
  });

  it('keeps the picked mode when the picked ChatGPT card is tapped again', async () => {
    const { user } = await mount();
    await user.click(radio(chatgpt.label));
    await user.click(radio(modeOf('project').label));
    await user.click(radio(chatgpt.label));
    expect(isChecked(radio(modeOf('project').label))).toBe(true);
    expect(isChecked(radio(modeOf('dot').label))).toBe(false);

    // The same holds for the plan under Custom instructions.
    await user.click(radio(modeOf('instructions').label));
    await user.click(radio(copy.target.plans.paid));
    await user.click(radio(chatgpt.label));
    expect(isChecked(radio(modeOf('instructions').label))).toBe(true);
    expect(isChecked(radio(copy.target.plans.paid))).toBe(true);
  });

  it('starts ChatGPT over on Dot after another target was picked in between', async () => {
    const { user } = await mount();
    await user.click(radio(chatgpt.label));
    await user.click(radio(modeOf('project').label));
    await user.click(radio(cardOf('grok').label));
    await user.click(radio(chatgpt.label));
    expect(isChecked(radio(modeOf('dot').label))).toBe(true);
  });
});

// ---- Next ----

describe('Shell Next button', () => {
  it('is blocked until a target is picked, with the reason shown', async () => {
    await mount();
    expect(isBlocked(nextButton())).toBe(true);
    expect(screen.getByText(copy.target.required)).toBeTruthy();
  });

  it('opens up after a pick and drops the hint', async () => {
    const { user } = await mount();
    await user.click(radio(cardOf('muse').label));
    expect(isBlocked(nextButton())).toBe(false);
    expect(screen.queryByText(copy.target.required)).toBeNull();
  });

  it('does nothing when tapped before a pick: no loading state, picker stays', async () => {
    const { user } = await mount();
    await user.click(nextButton());
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: copy.screens.target.title })).toBeTruthy();
    expect(screen.queryByTestId('app')).toBeNull();
  });
});

// ---- Handing off to App ----

describe('Shell hand-off on Next', () => {
  it('shows a loading state until App resolves, then renders App', async () => {
    const { user } = await mount();
    await user.click(radio(cardOf('grok').label));
    await user.click(nextButton());

    const status = await screen.findByRole('status');
    expect(status.textContent).toBe(copy.load.loading);
    // The picker is gone while it waits, and App has not rendered.
    expect(screen.queryByRole('radiogroup', { name: copy.screens.target.title })).toBeNull();
    expect(screen.queryByTestId('app')).toBeNull();
    await started(1);

    await arrive();
    expect(await screen.findByTestId('app')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('gives the store the target and the roster screen before App renders', async () => {
    const { user, useBuilder } = await mount();
    await user.click(radio(cardOf('grok').label));
    await user.click(nextButton());
    await screen.findByRole('status');
    // Still waiting: the store is untouched until the chunk is in.
    expect(useBuilder.getState().target).toBeNull();

    await arrive();
    await screen.findByTestId('app');

    expect(useBuilder.getState().target).toBe('grok');
    expect(useBuilder.getState().screen).toBe('roster');
    // App's very first render already saw the picked target on the roster.
    expect(renders.length).toBeGreaterThan(0);
    expect(renders[0]).toMatchObject({ screen: 'roster', target: 'grok' });
    expect(screen.getByTestId('app').textContent).toBe('app on roster for grok');
  });

  it.each(['muse', 'openclaw', 'hermes', 'grok'] as const)('hands %s to the store with no mode and no plan', async (id) => {
    const { user, useBuilder } = await mount();
    await user.click(radio(cardOf(id).label));
    await user.click(nextButton());
    await arrive();
    await screen.findByTestId('app');
    const s = useBuilder.getState();
    expect(s.target).toBe(id);
    expect(s.mode).toBeUndefined();
    expect(s.plan).toBeUndefined();
    expect(s.screen).toBe('roster');
  });

  it.each([
    ['dot', undefined],
    ['project', undefined],
    ['instructions', 'free'],
    ['instructions', 'paid'],
  ] as const)('hands ChatGPT %s (plan %s) to the store', async (mode, plan) => {
    const { user, useBuilder } = await mount();
    await user.click(radio(chatgpt.label));
    await user.click(radio(modeOf(mode).label));
    if (plan === 'paid') await user.click(radio(copy.target.plans[plan]));
    await user.click(nextButton());
    await arrive();
    await screen.findByTestId('app');
    const s = useBuilder.getState();
    expect(s.target).toBe('chatgpt');
    expect(s.mode).toBe(mode);
    expect(s.plan).toBe(plan as Plan | undefined);
    expect(s.screen).toBe('roster');
  });

  it('hands a bare ChatGPT tap over as the Dot mode, matching the store', async () => {
    const { user, useBuilder } = await mount();
    await user.click(radio(chatgpt.label));
    await user.click(nextButton());
    await arrive();
    await screen.findByTestId('app');
    expect(useBuilder.getState().mode).toBe('dot');
    expect(useBuilder.getState().plan).toBeUndefined();
  });

  it('works under StrictMode, which runs every effect twice', async () => {
    const { user, useBuilder } = await mount({ strict: true });
    await user.click(radio(cardOf('hermes').label));
    await user.click(nextButton());
    await arrive();
    expect(await screen.findByTestId('app')).toBeTruthy();
    expect(useBuilder.getState().target).toBe('hermes');
    expect(useBuilder.getState().screen).toBe('roster');
  });

  it('starts one import for the whole page, however many things ask for the app', async () => {
    const { user } = await mount();
    await user.click(radio(cardOf('muse').label));
    await user.click(nextButton());
    await screen.findByRole('status');
    await exactly(1);
  });
});

// ---- Failure ----

describe('Shell failed load', () => {
  it('shows the failed message and a Retry button when the import is rejected', async () => {
    const { user } = await mount();
    await user.click(radio(cardOf('muse').label));
    await user.click(nextButton());
    await screen.findByRole('status');

    await fail();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(copy.load.failed);
    expect(screen.getByRole('button', { name: copy.load.retry })).toBeTruthy();
    // The loading view and the picker are both gone, and App never rendered.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: copy.screens.target.title })).toBeNull();
    expect(screen.queryByTestId('app')).toBeNull();
  });

  it('does not touch the store when the load fails', async () => {
    const { user, useBuilder } = await mount();
    await user.click(radio(cardOf('muse').label));
    await user.click(nextButton());
    await screen.findByRole('status');
    await fail();
    await screen.findByRole('alert');
    expect(useBuilder.getState().target).toBeNull();
  });

  it('puts focus on Retry', async () => {
    const { user } = await mount();
    await user.click(radio(cardOf('muse').label));
    await user.click(nextButton());
    await screen.findByRole('status');
    await fail();
    const retry = await screen.findByRole('button', { name: copy.load.retry });
    expect(document.activeElement).toBe(retry);
  });

  it('Retry reloads the page, because a failed dynamic import is cached for the life of the page', async () => {
    const { user } = await mount();
    await user.click(radio(cardOf('muse').label));
    await user.click(nextButton());
    await screen.findByRole('status');
    await fail();
    const retry = await screen.findByRole('button', { name: copy.load.retry });

    // jsdom's location is unforgeable, so swap the global for the one tap.
    const reload = vi.fn();
    vi.stubGlobal('location', { hash: '', search: '', href: 'http://localhost/', reload });
    await user.click(retry);
    expect(reload).toHaveBeenCalledTimes(1);
    // No new import starts in place.
    await started(1);
  });

  it('shows the failed message for a link open whose import fails', async () => {
    openAt('/#b=x');
    await mount();
    await screen.findByRole('status');
    await fail();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(copy.load.failed);
    expect(screen.getByRole('button', { name: copy.load.retry })).toBeTruthy();
  });

  it('shows the failed view when Vite reports a preload error while the person is waiting', async () => {
    const { user } = await mount();
    await user.click(radio(cardOf('muse').label));
    await user.click(nextButton());
    await screen.findByRole('status');

    act(() => {
      window.dispatchEvent(new Event('vite:preloadError'));
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(copy.load.failed);
  });

  it('shows nothing for a preload error while the person is still on the cards', async () => {
    await mount();
    act(() => {
      window.dispatchEvent(new Event('vite:preloadError'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: copy.screens.target.title })).toBeTruthy();
  });

  it('lets a later Next import afresh after a preload error cleared the shared load', async () => {
    const { user } = await mount();
    await user.click(radio(cardOf('muse').label));
    act(() => {
      window.dispatchEvent(new Event('vite:preloadError'));
    });
    await user.click(nextButton());
    await screen.findByRole('status');
    await arrive(0);
    expect(await screen.findByTestId('app')).toBeTruthy();
  });
});

// ---- Links ----

describe('Shell with a link in the URL', () => {
  it('starts the import at once, with no tap, and shows the loading state', async () => {
    openAt('/#b=x');
    await mount();
    await started(1);
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe(copy.load.loading);
    // No cards: the person came for a bot, not a picker.
    expect(screen.queryByRole('radiogroup', { name: copy.screens.target.title })).toBeNull();
  });

  it('with location.hash set to #b=x before mount, starts the import', async () => {
    window.location.hash = '#b=x';
    expect(window.location.hash).toBe('#b=x');
    await mount();
    await started(1);
    await screen.findByRole('status');
  });

  it('renders App when the import resolves, and leaves the store and the URL alone', async () => {
    openAt('/#b=x');
    const { useBuilder } = await mount();
    await screen.findByRole('status');
    await arrive();
    expect(await screen.findByTestId('app')).toBeTruthy();
    // App reads the link itself. Shell neither picks a target nor clears the hash.
    expect(useBuilder.getState().target).toBeNull();
    expect(useBuilder.getState().screen).toBe('target');
    expect(window.location.hash).toBe('#b=x');
  });

  it('starts one import under StrictMode', async () => {
    openAt('/#b=x');
    await mount({ strict: true });
    await screen.findByRole('status');
    await exactly(1);
    await arrive();
    expect(await screen.findByTestId('app')).toBeTruthy();
  });

  // The oracle is readLocation (src/share/url.ts), the helper App's own hook uses.
  const HREFS: readonly string[] = [
    '/#b=x',
    '/#b=',
    '/#a=1&b=x',
    '/?remix=1',
    '/?remix=1#b=x',
    '/?remix=0',
    '/?remix=',
    '/?other=1',
    '/#about',
    '/#ab=1',
    '/#x=b=1',
    '/#nob=x',
    '/',
  ];

  it.each(HREFS)('treats %s as a link exactly when readLocation does', async (path) => {
    const read = readLocation(`http://localhost${path}`);
    const isLink = read.payload !== undefined || read.remix;
    openAt(path);
    await mount();
    if (isLink) {
      await started(1);
      expect(await screen.findByRole('status')).toBeTruthy();
      expect(screen.queryByRole('radiogroup', { name: copy.screens.target.title })).toBeNull();
    } else {
      await quiet();
      expect(calls).toHaveLength(0);
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByRole('radiogroup', { name: copy.screens.target.title })).toBeTruthy();
    }
  });

  it('does not start the import by itself on a plain visit, before idle', async () => {
    await mount();
    await quiet();
    expect(calls).toHaveLength(0);
  });
});

// ---- Prefetch ----

describe('Shell prefetch', () => {
  it('uses requestIdleCallback when the browser has it, and loads when it fires', async () => {
    const queue: { cb: () => void; options: unknown }[] = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void, options?: unknown) => {
      queue.push({ cb, options });
      return queue.length;
    });
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    await mount();
    expect(queue).toHaveLength(1);
    await quiet();
    expect(calls).toHaveLength(0);

    act(() => {
      queue[0].cb();
    });
    await started(1);
    // The person is still on the cards: a silent prefetch shows no loading view.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: copy.screens.target.title })).toBeTruthy();
  });

  it('does not set a 1500 ms timer when requestIdleCallback is there', async () => {
    vi.stubGlobal('requestIdleCallback', () => 1);
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    const timers = vi.spyOn(globalThis, 'setTimeout');
    await mount();
    expect(timers.mock.calls.filter(([, ms]) => ms === 1500)).toHaveLength(0);
  });

  it('cancels the idle callback when Shell unmounts first', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('requestIdleCallback', () => 42);
    vi.stubGlobal('cancelIdleCallback', cancel);
    await mount();
    cleanup();
    expect(cancel).toHaveBeenCalledWith(42);
    await quiet();
    expect(calls).toHaveLength(0);
  });

  it('falls back to a 1500 ms timer when requestIdleCallback is missing, as in Safari', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const timers = vi.spyOn(globalThis, 'setTimeout');
    await mount();
    const fallback = timers.mock.calls.filter(([, ms]) => ms === 1500);
    expect(fallback).toHaveLength(1);
    await quiet();
    expect(calls).toHaveLength(0);

    act(() => {
      (fallback[0][0] as () => void)();
    });
    await started(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clears the fallback timer when Shell unmounts first', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    await mount();
    const at = timers.mock.calls.findIndex(([, ms]) => ms === 1500);
    expect(at).toBeGreaterThanOrEqual(0);
    const id = timers.mock.results[at].value;
    cleanup();
    expect(clear).toHaveBeenCalledWith(id);
  });

  it('makes the Next tap instant once the prefetch has landed: no second import', async () => {
    const queue: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => queue.push(cb));
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    const { user, useBuilder } = await mount();
    act(() => {
      queue[0]();
    });
    await started(1);
    await arrive();

    await user.click(radio(cardOf('openclaw').label));
    await user.click(nextButton());
    expect(await screen.findByTestId('app')).toBeTruthy();
    await exactly(1);
    expect(useBuilder.getState().target).toBe('openclaw');
    expect(useBuilder.getState().screen).toBe('roster');
  });

  it('shares an in-flight prefetch with the Next tap: still one import', async () => {
    const queue: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => queue.push(cb));
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    const { user } = await mount();
    act(() => {
      queue[0]();
    });
    await user.click(radio(cardOf('muse').label));
    await user.click(nextButton());
    await screen.findByRole('status');
    await exactly(1);
    await arrive();
    expect(await screen.findByTestId('app')).toBeTruthy();
  });

  it('shows nothing when the silent prefetch fails, and the next tap imports afresh', async () => {
    const queue: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => queue.push(cb));
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    const { user, useBuilder } = await mount();
    act(() => {
      queue[0]();
    });
    await started(1);
    await fail(0);

    // Still the cards. No alert, no loading view.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: copy.screens.target.title })).toBeTruthy();

    await user.click(radio(cardOf('hermes').label));
    await user.click(nextButton());
    await screen.findByRole('status');
    await started(2);

    await arrive(1);
    expect(await screen.findByTestId('app')).toBeTruthy();
    expect(useBuilder.getState().target).toBe('hermes');
  });
});

// ---- What Shell imports ----

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL_FILES = ['src/ui/Shell.tsx', 'src/ui/screens/TargetPicker.tsx'];

interface Imports {
  /** Runtime static imports (import type is erased by the build and left out). */
  statics: string[];
  /** import('...') calls, the lazy chunk. */
  dynamics: string[];
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function importsOf(file: string): Imports {
  const source = stripComments(readFileSync(file, 'utf8'));
  const statics: string[] = [];
  const dynamics: string[] = [];

  // import X from 'm', import { a } from 'm', import * as X from 'm', export { a } from 'm'
  const from = /^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gm;
  for (const m of source.matchAll(from)) {
    if (m[1] === 'import' && m[2] !== undefined) continue;
    if (m[1] === 'export' && m[2] !== undefined) continue;
    statics.push(m[4]);
  }
  // import 'm'
  for (const m of source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) statics.push(m[1]);
  for (const m of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) dynamics.push(m[1]);
  return { statics, dynamics };
}

// A relative specifier to the file on disk, or undefined for a package.
function resolveSpecifier(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = resolve(dirname(from), spec);
  const stem = base.replace(/\.js$/, '');
  const tries = [base, `${stem}.ts`, `${stem}.tsx`, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')];
  for (const t of tries) {
    try {
      readFileSync(t);
      return t;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(`cannot resolve ${spec} from ${relative(ROOT, from)}`);
}

// Modules the first paint must never load.
const FORBIDDEN: { why: string; test: (rel: string, spec?: string) => boolean }[] = [
  { why: 'src/compiler', test: (rel) => rel.startsWith('src/compiler/') },
  { why: 'the store', test: (rel) => rel === 'src/ui/store.ts' },
  { why: 'the flow', test: (rel) => rel === 'src/ui/flow.ts' },
  { why: 'the library index', test: (rel) => rel === 'src/library/index.ts' },
  { why: 'library JSON other than the cards', test: (rel) => /^src\/library\/.+\.json$/.test(rel) && rel !== 'src/library/targets.json' },
  { why: 'the App', test: (rel) => rel === 'src/ui/App.tsx' },
  { why: 'Station', test: (rel) => rel === 'src/ui/screens/Station.tsx' },
  { why: 'src/share', test: (rel) => rel.startsWith('src/share/') },
  { why: 'zustand', test: (_rel, spec) => spec === 'zustand' || spec?.startsWith('zustand/') === true },
];

describe('Shell imports', () => {
  it.each(SHELL_FILES)('%s statically imports nothing from the compiler, the store, the flow or the library index', (rel) => {
    const file = join(ROOT, rel);
    const { statics } = importsOf(file);
    expect(statics.length).toBeGreaterThan(0);
    for (const spec of statics) {
      const target = resolveSpecifier(file, spec);
      const where = target === undefined ? spec : relative(ROOT, target);
      for (const f of FORBIDDEN) {
        expect(f.test(where, spec), `${rel} imports ${spec} (${f.why})`).toBe(false);
      }
    }
    // Also by plain text, so a rename of the helper above cannot hide one.
    for (const spec of statics) {
      expect(spec, `${rel}`).not.toMatch(/compiler\/(?!types)/);
      expect(spec, `${rel}`).not.toMatch(/(^|\/)store(\.js)?$/);
      expect(spec, `${rel}`).not.toMatch(/(^|\/)flow(\.js)?$/);
      expect(spec, `${rel}`).not.toMatch(/library(\/index(\.js)?)?$/);
    }
  });

  it('Shell.tsx reaches no forbidden module through its static imports, however deep', () => {
    const seen = new Set<string>();
    const reached: string[] = [];
    const walk = (file: string) => {
      const rel = relative(ROOT, file);
      if (seen.has(rel)) return;
      seen.add(rel);
      reached.push(rel);
      if (!/\.(ts|tsx)$/.test(file)) return;
      for (const spec of importsOf(file).statics) {
        const target = resolveSpecifier(file, spec);
        for (const f of FORBIDDEN) {
          const where = target === undefined ? spec : relative(ROOT, target);
          expect(f.test(where, spec), `${rel} reaches ${where} (${f.why})`).toBe(false);
        }
        if (target !== undefined) walk(target);
      }
    };
    walk(join(ROOT, 'src/ui/Shell.tsx'));

    // The walk is not vacuous: it saw the picker, the cards and the copy.
    expect(reached).toContain('src/ui/screens/TargetPicker.tsx');
    expect(reached).toContain('src/library/targets.json');
    expect(reached).toContain('src/ui/copy.ts');
    expect(reached.every((r) => r.startsWith('src/'))).toBe(true);
  });

  it('Shell.tsx loads the app through exactly two dynamic imports: App and the store', () => {
    const { dynamics } = importsOf(join(ROOT, 'src/ui/Shell.tsx'));
    expect([...dynamics].sort()).toEqual(['./App.js', './store.js']);
  });

  it('TargetPicker.tsx has no dynamic imports and takes the cards as props', () => {
    const file = join(ROOT, 'src/ui/screens/TargetPicker.tsx');
    expect(importsOf(file).dynamics).toEqual([]);
    expect(readFileSync(file, 'utf8')).toMatch(/cards:\s*readonly TargetCard\[\]/);
  });

  it('src/main.tsx statically imports Shell and not App', () => {
    const file = join(ROOT, 'src/main.tsx');
    const specs = importsOf(file).statics.map((s) => {
      const t = resolveSpecifier(file, s);
      return t === undefined ? s : relative(ROOT, t);
    });
    expect(specs).toContain('src/ui/Shell.tsx');
    expect(specs).not.toContain('src/ui/App.tsx');
    expect(specs).not.toContain('src/ui/store.ts');
  });

  it('finds the import scan useful: it sees imports in a sample it should flag', () => {
    // A guard on the scanner itself, using a sample string written to a temp-free regex run.
    const sample = [
      "import { useBuilder } from './store.js';",
      "import type { Build } from '../compiler/types.js';",
      "import library from '../library/index.js';",
      "const lazy = import('./App.js');",
      "// import nothing from './flow.js';",
    ].join('\n');
    const source = stripComments(sample);
    const statics = [...source.matchAll(/^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gm)]
      .filter((m) => m[2] === undefined)
      .map((m) => m[4]);
    expect(statics).toEqual(['./store.js', '../library/index.js']);
    expect([...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])).toEqual(['./App.js']);
  });
});
