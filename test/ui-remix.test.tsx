// @vitest-environment jsdom
//
// Remix screen tests (M4 slice 4.14). Renders <App/> in jsdom and drives the remix screen the way a
// person would, by role and accessible name, with @testing-library/user-event.
//
// Expected behavior comes from docs/M4-PLAN.md section 3 ("Remix screen" and "Links"), QUESTIONS.md
// B12 (the warning sentence, the five short target names and the paste-box label), B13 (starters skip
// the warning), W11 (remix from the certificate), W12 (the paste cap), W27 and W36 (the remix state
// lifecycle). The B12 sentence, the short names and the paste label are typed in here from B12 on
// purpose, so a drift in src/ui/copy.ts shows up as a failure. Other UI strings (buttons, headings)
// are read from copy. Builds come from the library roster, never from compiler output.
//
// The certificate's own Remix button is slice 4.12. Until it lands, "the certificate Remix" is
// store.startRemix(), which is the action that button calls.

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compile } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import type { Build, BuildV1, ChatgptMode, TargetId } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import { fromShareHash, toShareHash } from '../src/share/encode.js';
import { shareUrl } from '../src/share/url.js';
import { App } from '../src/ui/App.js';
import { copy } from '../src/ui/copy.js';
import type { ScreenId } from '../src/ui/flow.js';
import { PASTE_MAX, compiled, isCompileError, previewBuild, useBuilder } from '../src/ui/store.js';

// ---- B12 wording, typed in from the question log ----

// The five short names Brian gave for the warning. The picker cards keep the library labels.
const TARGETS: ReadonlyArray<{ target: TargetId; mode?: ChatgptMode; short: string }> = [
  { target: 'muse', short: 'Muse' },
  { target: 'openclaw', short: 'OpenClaw' },
  { target: 'hermes', short: 'Hermes' },
  { target: 'grok', short: 'Grok Bot' },
  { target: 'chatgpt', mode: 'dot', short: 'ChatGPT' },
];

const warningFor = (short: string): string =>
  `This rebuilds from your picks. Changes you made inside ${short} won't carry over.`;

const PASTE_LABEL = 'Paste your current personality to keep your edits.';

// ---- Helpers ----

const st = () => useBuilder.getState();

// Runs a store action inside act so mounted components update cleanly.
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

function remixLinkTo(build: Build | BuildV1): string {
  return origin() + pathname() + '?remix=1' + toShareHash(build);
}

// The screen App is showing, from its data-screen attribute.
function shown(): string | null {
  return document.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null;
}

function rosterBuild(id: string): BuildV1 {
  const entry = library.roster.find((r) => r.id === id);
  if (!entry) throw new Error(`test setup: no roster entry ${id}`);
  return entry.build;
}

// June, the roster build, opened on a target.
function juneOn(target: TargetId, mode?: ChatgptMode): Build {
  return migrate(rosterBuild('june'), { target, mode });
}

const nextButton = () => screen.getByRole('button', { name: copy.buttons.next });
const backButton = () => screen.getByRole('button', { name: copy.buttons.back });
const pasteBox = () => screen.getByRole('textbox', { name: PASTE_LABEL }) as HTMLTextAreaElement;

// The primary button keeps its focus and uses aria-disabled while blocked.
function isBlocked(el: HTMLElement): boolean {
  return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
}

const baseLabel = (id: string): string => {
  const base = library.bases.find((b) => b.id === id);
  if (!base) throw new Error(`library has no base ${id}`);
  return base.label;
};

// The tester's own clean address check: the app never writes the build or the paste to the address bar.
function expectCleanAddress(ctx: string): void {
  expect(window.location.hash, `${ctx}: no hash`).toBe('');
  expect(window.location.search, `${ctx}: no query`).toBe('');
  expect(window.location.href, `${ctx}: origin and path only`).toBe(origin() + pathname());
}

// Storage writes are spied on every test, so any test can ask "was anything stored".
const WRITES = ['setItem', 'removeItem', 'clear'] as const;
let writeSpies: Array<[string, MockInstance]> = [];

function expectNothingStored(ctx: string): void {
  for (const [name, spy] of writeSpies) {
    expect(spy.mock.calls, `${ctx}: Storage.${name} was not called`).toEqual([]);
  }
  expect(localStorage.length, `${ctx}: localStorage is empty`).toBe(0);
  expect(sessionStorage.length, `${ctx}: sessionStorage is empty`).toBe(0);
  expect(document.cookie, `${ctx}: no cookie`).toBe('');
}

beforeEach(() => {
  st().reset();
  openAt('/');
  // jsdom does not implement scrollTo, and every screen calls it on mount.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  writeSpies = WRITES.map((name) => [name, vi.spyOn(Storage.prototype, name)]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  st().reset();
  openAt('/');
});

// ---- 1. A ?remix=1 link opens the screen ----

describe('a ?remix=1 link opens the remix screen', () => {
  it.each(TARGETS)('names $short in the warning', ({ target, mode, short }) => {
    openAt(remixLinkTo(juneOn(target, mode)));
    render(<App />);

    expect(shown()).toBe('remix');
    expect(st().from).toBe('link-remix');
    // The setup really reached the target under test.
    expect(st().target).toBe(target);
    expect(st().mode).toBe(mode);

    expect(screen.getByRole('heading', { level: 1, name: copy.screens.remix.title })).toBeTruthy();
    expect(screen.getByText(warningFor(short))).toBeTruthy();
    // One warning, and it names this target only.
    expect(screen.queryAllByText(/This rebuilds from your picks/)).toHaveLength(1);
    expectCleanAddress(short);
  });

  it.each(TARGETS)('names $short in the warning after the certificate Remix', ({ target, mode, short }) => {
    store((s) => {
      s.setTarget(target, mode);
      s.useStarter('june');
    });
    expect(st().screen).toBe('certificate');
    store((s) => s.startRemix());
    render(<App />);

    expect(shown()).toBe('remix');
    expect(screen.getByText(warningFor(short))).toBeTruthy();
  });

  it('shows the warning before the paste box, and the box carries the B12 label', () => {
    openAt(remixLinkTo(juneOn('openclaw')));
    render(<App />);

    const warning = screen.getByText(warningFor('OpenClaw'));
    const box = pasteBox();
    expect(box.tagName).toBe('TEXTAREA');
    // The label is a real label element wired to the box, not only an aria-label.
    expect(screen.getByLabelText(PASTE_LABEL)).toBe(box);
    expect(document.querySelector(`label[for="${box.id}"]`)?.textContent).toBe(PASTE_LABEL);
    // Document order: warning, then box.
    expect(warning.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('starts with an empty box and an empty store paste', () => {
    openAt(remixLinkTo(juneOn('muse')));
    render(<App />);
    expect(pasteBox().value).toBe('');
    expect(st().pasted).toBe('');
  });

  it('is a side screen: Next is the only footer button, and there is no Skip and no progress dots', () => {
    openAt(remixLinkTo(juneOn('muse')));
    render(<App />);
    expect(screen.queryByRole('button', { name: copy.buttons.skip })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(nextButton()).toBeTruthy();
  });

  it('does not use an alert role for the warning, so a screen reader is not interrupted on every visit', () => {
    openAt(remixLinkTo(juneOn('muse')));
    render(<App />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('draws without a warning, and without crashing, if the target is somehow unset', () => {
    // Not reachable by taps (every way into the screen has a target). The screen must still hold up.
    store((s) => s.go('remix'));
    render(<App />);
    expect(shown()).toBe('remix');
    expect(st().target).toBeNull();
    expect(screen.queryByText(/This rebuilds from your picks/)).toBeNull();
    expect(pasteBox()).toBeTruthy();
  });
});

// ---- 2. The paste box ----

describe('the paste box', () => {
  function open(): void {
    openAt(remixLinkTo(juneOn('openclaw')));
    render(<App />);
    expect(shown()).toBe('remix');
  }

  it('stores what is typed in pasted, one keystroke at a time', async () => {
    const user = userEvent.setup();
    open();
    await user.click(pasteBox());
    await user.type(pasteBox(), 'My edits');
    expect(st().pasted).toBe('My edits');
    expect(pasteBox().value).toBe('My edits');
    await user.type(pasteBox(), '{Enter}stay');
    expect(st().pasted).toBe('My edits\nstay');
    expect(pasteBox().value).toBe('My edits\nstay');
  });

  it('stores a multi-line paste as it came, with its characters intact', async () => {
    const user = userEvent.setup();
    open();
    const text = '## Voice\nKeep it short.\n\n{braces} & <tags> "quotes" éè \u{1F600}\n';
    await user.click(pasteBox());
    await user.paste(text);
    expect(st().pasted).toBe(text);
    expect(pasteBox().value).toBe(text);
  });

  it('shows pasted HTML as text and never as markup', async () => {
    const user = userEvent.setup();
    open();
    await user.click(pasteBox());
    await user.paste('<b id="injected">bold</b><img src=x>');
    expect(document.getElementById('injected')).toBeNull();
    expect(document.querySelector('main img')).toBeNull();
    expect(pasteBox().value).toBe('<b id="injected">bold</b><img src=x>');
  });

  it('follows the store: a paste set from outside shows in the box', () => {
    open();
    store((s) => s.setPasted('set from the store'));
    expect(pasteBox().value).toBe('set from the store');
    store((s) => s.setPasted(''));
    expect(pasteBox().value).toBe('');
  });

  it('caps a long paste at 20,000 characters, keeping the first 20,000', async () => {
    const user = userEvent.setup();
    open();
    expect(PASTE_MAX).toBe(20000);
    const long = '0123456789'.repeat(2050); // 20,500 characters
    await user.click(pasteBox());
    await user.paste(long);
    expect(st().pasted.length).toBe(20000);
    expect(st().pasted).toBe(long.slice(0, 20000));
    expect(pasteBox().value.length).toBe(20000);
  });

  it('accepts nothing more once the box is full', async () => {
    const user = userEvent.setup();
    open();
    const full = 'x'.repeat(20000);
    store((s) => s.setPasted(full));
    await user.click(pasteBox());
    await user.type(pasteBox(), 'more');
    expect(st().pasted).toBe(full);
    expect(pasteBox().value.length).toBe(20000);
  });

  it('caps at 20,000 even when the browser box would let more through (the store is the guard)', () => {
    open();
    // fireEvent skips the maxLength a real keyboard or paste meets.
    fireEvent.change(pasteBox(), { target: { value: 'y'.repeat(20500) } });
    expect(st().pasted.length).toBe(20000);
    expect(pasteBox().value.length).toBe(20000);
  });

  it('does not leave half of an emoji at the cut', () => {
    open();
    fireEvent.change(pasteBox(), { target: { value: 'a'.repeat(19999) + '\u{1F600}' } });
    expect(/[\uD800-\uDBFF]$/.test(st().pasted)).toBe(false);
    expect(st().pasted).toBe('a'.repeat(19999));
  });

  it('keeps the paste when Next goes to base and Back comes home again', async () => {
    const user = userEvent.setup();
    open();
    await user.click(pasteBox());
    await user.paste('keep me through the trip');
    await user.click(nextButton());
    expect(shown()).toBe('base');
    expect(st().pasted).toBe('keep me through the trip');
    await user.click(backButton());
    expect(shown()).toBe('remix');
    expect(pasteBox().value).toBe('keep me through the trip');
  });

  it('is optional: Next is not blocked while the box is empty', async () => {
    const user = userEvent.setup();
    open();
    expect(pasteBox().value).toBe('');
    expect(isBlocked(nextButton())).toBe(false);
    await user.click(nextButton());
    expect(shown()).toBe('base');
  });

  it('is built for a phone: no autofill or autocorrect, no spellcheck, 16px text, a 44px target', () => {
    open();
    const box = pasteBox();
    expect(box.maxLength).toBe(20000);
    expect(box.getAttribute('autocomplete')).toBe('off');
    expect(box.getAttribute('autocapitalize')).toBe('off');
    expect(box.getAttribute('autocorrect')).toBe('off');
    // jsdom does not implement the spellcheck property, so the attribute is read.
    expect(box.getAttribute('spellcheck')).toBe('false');
    // jsdom has no Tailwind stylesheet, so the sizes are read from the classes.
    expect(box.className).toMatch(/\btext-base\b|\btext-\[16px\]/);
    expect(box.className).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
  });

  it('links the privacy line to the box with aria-describedby', () => {
    open();
    const ids = (pasteBox().getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    const described = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(described).toContain(copy.remixPasteNote);
    expect(copy.remixPasteNote.length).toBeGreaterThan(0);
  });
});

// ---- 3. Moving between screens ----

describe('Next and Back around the remix screen', () => {
  it('Next goes to base, with the link build still in place', async () => {
    const user = userEvent.setup();
    const build = juneOn('hermes');
    openAt(remixLinkTo(build));
    render(<App />);
    expect(shown()).toBe('remix');

    await user.click(nextButton());
    expect(shown()).toBe('base');
    expect(screen.getByRole('heading', { level: 1, name: copy.screens.base.title })).toBeTruthy();
    // The link's base is the picked card.
    expect(
      screen.getByRole('radio', { name: baseLabel(build.base) }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(previewBuild(st())).toEqual(build);
  });

  it('Back from base returns to the remix screen', async () => {
    const user = userEvent.setup();
    openAt(remixLinkTo(juneOn('muse')));
    render(<App />);
    await user.click(nextButton());
    expect(shown()).toBe('base');
    await user.click(backButton());
    expect(shown()).toBe('remix');
    expect(screen.getByText(warningFor('Muse'))).toBeTruthy();
  });

  it('Back from the remix screen goes to the certificate', async () => {
    const user = userEvent.setup();
    openAt(remixLinkTo(juneOn('grok')));
    render(<App />);
    expect(shown()).toBe('remix');
    await user.click(backButton());
    expect(shown()).toBe('certificate');
  });

  it('Back from the remix screen goes to the certificate when it was opened from the certificate too', async () => {
    const user = userEvent.setup();
    store((s) => {
      s.setTarget('muse');
      s.useStarter('marty');
    });
    store((s) => s.startRemix());
    render(<App />);
    expect(shown()).toBe('remix');
    await user.click(backButton());
    expect(shown()).toBe('certificate');
  });

  it('after a certificate Remix, Back on base returns to the remix screen (W36)', async () => {
    const user = userEvent.setup();
    store((s) => {
      s.setTarget('openclaw');
      s.useStarter('june');
    });
    store((s) => s.startRemix());
    render(<App />);
    expect(shown()).toBe('remix');
    expect(st().from).toBe('link-remix');
    await user.click(nextButton());
    expect(shown()).toBe('base');
    await user.click(backButton());
    expect(shown()).toBe('remix');
  });
});

// ---- 4. Opened from the certificate ----

describe('the certificate Remix opens the screen with an empty paste', () => {
  it('clears an old paste, shows an empty box and snapshots the build as the baseline', () => {
    store((s) => {
      s.setTarget('hermes');
      s.useStarter('rook');
    });
    store((s) => s.setPasted('left over from an earlier remix'));
    store((s) => s.setMineOn(true));
    const current = structuredClone(previewBuild(st()));

    store((s) => s.startRemix());
    render(<App />);

    expect(shown()).toBe('remix');
    expect(st().pasted).toBe('');
    expect(pasteBox().value).toBe('');
    expect(st().baseline).toEqual(current);
    expect(screen.getByText(warningFor('Hermes'))).toBeTruthy();
  });

  it('empties the box again on a second visit, after paste, Back and Remix', async () => {
    const user = userEvent.setup();
    store((s) => {
      s.setTarget('muse');
      s.useStarter('june');
    });
    store((s) => s.startRemix());
    render(<App />);

    await user.click(pasteBox());
    await user.paste('first visit paste');
    expect(st().pasted).toBe('first visit paste');
    await user.click(backButton());
    expect(shown()).toBe('certificate');

    store((s) => s.startRemix());
    expect(shown()).toBe('remix');
    expect(st().pasted).toBe('');
    expect(pasteBox().value).toBe('');
  });
});

// ---- 5. The roster Remix skips the screen (B13) ----

describe('the roster Remix goes straight to base, with no warning (B13)', () => {
  const entry = library.roster[0];

  it.each(TARGETS)('on $short', async ({ target, mode }) => {
    const user = userEvent.setup();
    store((s) => {
      s.setTarget(target, mode);
      s.go('roster');
    });
    render(<App />);
    expect(shown()).toBe('roster');

    await user.click(screen.getByRole('button', { name: `${copy.buttons.remix} ${entry.build.name}` }));

    expect(shown()).toBe('base');
    expect(st().from).toBe('remix');
    expect(screen.queryByText(/This rebuilds from your picks/)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(
      screen.queryByRole('heading', { level: 1, name: copy.screens.remix.title }),
    ).toBeNull();
    // The paste state is untouched and empty.
    expect(st().pasted).toBe('');
  });

  it('and Back from base goes to the roster, not to the remix screen', async () => {
    const user = userEvent.setup();
    store((s) => {
      s.setTarget('muse');
      s.go('roster');
    });
    render(<App />);
    await user.click(screen.getByRole('button', { name: `${copy.buttons.remix} ${entry.build.name}` }));
    expect(shown()).toBe('base');
    await user.click(backButton());
    expect(shown()).toBe('roster');
  });
});

// ---- 6. The paste stays out of the link and out of storage ----

describe('the paste is memory only', () => {
  // A distinctive paste, long enough that a leak into the link would be easy to spot.
  const PASTED =
    'Zq7needle My bot talks like a pager. Keep it short, keep it kind.\nSecond line {braces} & <tags> "quotes" café';
  const FRAGMENTS = ['Zq7needle', 'talks like a pager', 'Second line'];

  function link(): string {
    return shareUrl(origin(), pathname(), previewBuild(st()));
  }

  it('does not change the share link of the current build', async () => {
    const user = userEvent.setup();
    openAt(remixLinkTo(juneOn('openclaw')));
    render(<App />);
    const before = link();

    await user.click(pasteBox());
    await user.paste(PASTED);
    expect(st().pasted).toBe(PASTED);

    const after = link();
    expect(after).toBe(before);
    // And nothing of the paste is in it, raw, URL-encoded or in the decoded payload.
    for (const f of FRAGMENTS) {
      expect(after, f).not.toContain(f);
      expect(after, f).not.toContain(encodeURIComponent(f));
    }
    const payload = after.slice(after.indexOf('#') + 1);
    const decoded = JSON.stringify(fromShareHash(payload, library).build);
    for (const f of FRAGMENTS) expect(decoded, f).not.toContain(f);
    expect(fromShareHash(payload, library).build).toEqual(previewBuild(st()));
  });

  it('is not part of the build the app compiles', async () => {
    const user = userEvent.setup();
    const build = juneOn('muse');
    openAt(remixLinkTo(build));
    render(<App />);
    const before = structuredClone(previewBuild(st()));
    const soulBefore = compile(before).soul;

    await user.click(pasteBox());
    await user.paste(PASTED);

    expect(previewBuild(st())).toEqual(before);
    expect(JSON.stringify(previewBuild(st()))).not.toContain('Zq7needle');
    const result = compiled(st());
    expect(isCompileError(result)).toBe(false);
    if (!isCompileError(result)) {
      expect(result.soul).toBe(soulBefore);
      expect(JSON.stringify(result)).not.toContain('Zq7needle');
    }
  });

  it('leaves the address bar clean while typing and paging, and writes nothing to storage', async () => {
    const user = userEvent.setup();
    openAt(remixLinkTo(juneOn('hermes')));
    render(<App />);
    expectCleanAddress('after the link opens');
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    await user.click(pasteBox());
    await user.type(pasteBox(), 'typed text');
    await user.paste(PASTED);
    await user.click(nextButton());
    expect(shown()).toBe('base');
    await user.click(backButton());
    expect(shown()).toBe('remix');
    await user.click(backButton());
    expect(shown()).toBe('certificate');

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expectCleanAddress('after typing and paging');
    expectNothingStored('typing and paging on the remix screen');
  });

  it('writes nothing to storage on the certificate path either', async () => {
    const user = userEvent.setup();
    store((s) => {
      s.setTarget('grok');
      s.useStarter('june');
    });
    store((s) => s.startRemix());
    render(<App />);
    await user.click(pasteBox());
    await user.paste(PASTED);
    await user.click(nextButton());
    await user.click(backButton());
    expect(st().pasted).toBe(PASTED);
    expectNothingStored('certificate Remix, paste, page');
    expectCleanAddress('certificate Remix, paste, page');
  });

  it('is gone from memory after a reset', async () => {
    const user = userEvent.setup();
    openAt(remixLinkTo(juneOn('muse')));
    render(<App />);
    await user.click(pasteBox());
    await user.paste(PASTED);
    store((s) => s.reset());
    expect(st().pasted).toBe('');
    expect(JSON.stringify(localStorage)).not.toContain('Zq7needle');
    expect(JSON.stringify(sessionStorage)).not.toContain('Zq7needle');
  });
});

// ---- 7. Tap-only: the only text inputs in the app ----

describe('across every screen, the only text inputs are the name field and the remix paste box', () => {
  // Fields a person types words into. Checkboxes, radios and buttons are taps, not typing.
  const TAP_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color', 'hidden'];

  function textEntryFields(): Element[] {
    return [
      ...document.querySelectorAll('input, textarea, select, [contenteditable]:not([contenteditable="false"])'),
    ].filter((el) => !(el instanceof HTMLInputElement) || !TAP_INPUT_TYPES.includes(el.type));
  }

  const EVERY_SCREEN: readonly ScreenId[] = [
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
    'remix',
  ];

  it('has a text input only on name (one input) and remix (one textarea)', () => {
    // A build that shows every screen: OpenClaw (roles), a Markets chip (limits and gates, Risk).
    const chips = (group: string) => library.chips.filter((c) => c.group === group).map((c) => c.id);
    store((s) => {
      s.setTarget('openclaw');
      s.startBlank();
      s.setBase('trader');
      s.toggleChip(chips('Work')[0]);
      s.toggleChip(chips('Markets')[0]);
      s.setName('Zephyr');
      s.setAdvancedRoles(true);
      s.go('target');
    });
    render(<App />);

    const seen: Array<{ screen: ScreenId; tags: string[]; textboxes: number }> = [];
    for (const id of EVERY_SCREEN) {
      store((s) => s.go(id));
      expect(shown(), `the app shows ${id}`).toBe(id);
      seen.push({
        screen: id,
        tags: textEntryFields().map((el) => el.tagName),
        textboxes:
          screen.queryAllByRole('textbox').length +
          screen.queryAllByRole('searchbox').length +
          screen.queryAllByRole('combobox').length +
          screen.queryAllByRole('spinbutton').length,
      });
    }

    for (const s of seen) {
      if (s.screen === 'name') {
        expect(s.tags, 'text inputs on name').toEqual(['INPUT']);
        expect(s.textboxes, 'text boxes on name').toBe(1);
      } else if (s.screen === 'remix') {
        expect(s.tags, 'text inputs on remix').toEqual(['TEXTAREA']);
        expect(s.textboxes, 'text boxes on remix').toBe(1);
      } else {
        expect(s.tags, `text inputs on ${s.screen}`).toEqual([]);
        expect(s.textboxes, `text boxes on ${s.screen}`).toBe(0);
      }
    }
    expect(seen.filter((s) => s.tags.length > 0).map((s) => s.screen)).toEqual(['name', 'remix']);
  });

  it('names the remix box by its label, and the name field by its own', () => {
    store((s) => {
      s.setTarget('muse');
      s.startBlank();
      s.go('remix');
    });
    render(<App />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(pasteBox()).toBeTruthy();
    store((s) => s.go('name'));
    expect(screen.getByRole('textbox', { name: copy.name.label }).tagName).toBe('INPUT');
    expect(screen.queryByRole('textbox', { name: PASTE_LABEL })).toBeNull();
  });
});
