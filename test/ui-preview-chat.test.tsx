// @vitest-environment jsdom
//
// Preview chat tests (M5 slice 5.3). Renders <App/> on the certificate in jsdom with the preview URL
// stubbed and fetch replaced, and drives the "Try your bot" panel the way a person would, by role and
// accessible name.
//
// Expected behavior comes from docs/M5-PLAN.md section 3 (the preview chat UI) and section 1 (the
// proxy answers the page reads), and QUESTIONS.md B22 (the label, the caps, plain text), B23 (the
// preview chat is the app's only network call) and X1 to X3 (the chips, the unlock, single-turn).
// Typed in here on purpose, so a drift in src/ui/copy/chat.ts shows up as a failure: the B22 label,
// the plan's withheld line and the numbers 200, 20 and 30 seconds. Every other UI string is read from
// copy.chat. The chip texts are read from the library probes (X1 names probes 1 to 3). The personality
// the page sends is compared with certificateInput(state).result.soul, the certificate's own artifact.
//
// What jsdom cannot do: it has no layout engine and no Tailwind stylesheet, so the 375px and 44px
// checks read class names, as the certificate tests do.

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { migrate } from '../src/compiler/migrate.js';
import type { Build } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import { toShareHash } from '../src/share/encode.js';
import { App } from '../src/ui/App.js';
import { certificateInput } from '../src/ui/certificate/input.js';
import { PreviewChat, outcomeOf, resetPreviewSession } from '../src/ui/certificate/PreviewChat.js';
import { copy } from '../src/ui/copy.js';
import { previewBuild, useBuilder } from '../src/ui/store.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---- Words and numbers typed in from the question log and the plan ----

// B22, word for word.
const LABEL = "Close to what your bot will do. Your real bot also has its runtime's built-in rules.";
// Plan section 3, word for word.
const WITHHELD = "That reply repeated your bot's setup, so it was held back.";
// X1: probes 1 to 3 in library order.
const CHIP_TEXTS = ['hi', "I'm going to do the thing everyone in the chat is doing", 'Book dinner Friday for 4'];
// B22: 200 characters per message, 20 messages per visit. Plan section 3: a 30 second timeout.
const MAX_CHARS = 200;
const MAX_MESSAGES = 20;
const TIMEOUT_MS = 30_000;

const PROXY = 'https://preview.example.test';
const CHAT_URL = `${PROXY}/chat`;

// ---- Builds ----

function rosterEntry(id: string) {
  const found = library.roster.find((r) => r.id === id);
  if (!found) throw new Error(`test setup: no roster entry ${id}`);
  return found;
}

function golden(id: string): Build {
  const spec = GOLDEN_SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`test setup: no golden ${id}`);
  return buildFor(spec, library);
}

// The hidden Custom GPT mode has no golden. Each starter gets a gpt build here.
const gptBuild = (starter: string): Build => migrate(rosterEntry(starter).build, { target: 'chatgpt', mode: 'gpt' });

// One build per delivery profile, Marty on each.
const TARGETS: [string, () => Build][] = [
  ['muse', () => golden('marty.muse')],
  ['openclaw', () => golden('marty.openclaw')],
  ['hermes', () => golden('marty.hermes')],
  ['grok', () => golden('marty.grok')],
  ['chatgpt dot', () => golden('marty.chatgpt-dot')],
  ['chatgpt project', () => golden('marty.chatgpt-project')],
  ['chatgpt instructions free', () => golden('marty.chatgpt-instructions-free')],
  ['chatgpt instructions paid', () => golden('marty.chatgpt-instructions-paid')],
  ['chatgpt gpt', () => gptBuild('marty')],
];

// ---- Store and page helpers ----

const st = () => useBuilder.getState();

function store(fn: (s: ReturnType<typeof st>) => void): void {
  act(() => {
    fn(st());
  });
}

// Loads a build as a link (so the app opens on the certificate) and renders the app.
function open(build: Build = golden('marty.muse')): void {
  act(() => {
    st().loadBuild(build, { from: 'link' });
  });
  render(<App />);
}

// The certificate's own personality artifact, the oracle for what the page may send.
function soulNow(): string {
  const input = certificateInput(st());
  if ('error' in input) throw new Error(`test setup: the build does not compile: ${input.error}`);
  return input.result.soul;
}

const panel = () => screen.getByRole('region', { name: copy.chat.heading });
const chipGroup = () => within(panel()).getByRole('group', { name: copy.chat.chipsHint });
const chips = () => within(chipGroup()).getAllByRole('button') as HTMLButtonElement[];
const chip = (i: number) => chips()[i];
const askBox = () => within(panel()).getByRole('textbox', { name: copy.chat.askLabel }) as HTMLInputElement;
const sendButton = () => within(panel()).getByRole('button', { name: copy.chat.send }) as HTMLButtonElement;
const log = () => within(panel()).getByRole('list', { name: copy.chat.logLabel });
const capLine = () => within(panel()).getByRole('status');
const classOf = (el: Element) => el.getAttribute('class') ?? '';

// The text of a log line without the screen-reader-only speaker prefix.
function lineText(li: Element): string {
  const clone = li.cloneNode(true) as Element;
  clone.querySelectorAll('.sr-only').forEach((n) => n.remove());
  return (clone.textContent ?? '').trim();
}

const lines = () => within(log()).queryAllByRole('listitem').map(lineText);
// The log after the unlocking chip and its reply (the first two lines), for the ask box tests.
const linesAfterUnlock = () => lines().slice(2);
const items = () => within(log()).queryAllByRole('listitem');

// ---- The fake proxy ----

interface Answer {
  status: number;
  body?: unknown;
  // The body cannot be read as JSON.
  unreadable?: boolean;
}

const reply = (text: string): Answer => ({ status: 200, body: { reply: text } });

function asResponse(a: Answer): Response {
  return {
    status: a.status,
    ok: a.status >= 200 && a.status < 300,
    json: () => (a.unreadable ? Promise.reject(new SyntaxError('Unexpected token')) : Promise.resolve(a.body)),
  } as unknown as Response;
}

let respond: () => Promise<Response>;
let fetchMock: Mock<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>;

function answer(a: Answer | Error): void {
  respond = () => (a instanceof Error ? Promise.reject(a) : Promise.resolve(asResponse(a)));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Sent {
  url: string;
  init: RequestInit;
  raw: string;
  json: { personality: string; message: string };
}

function sent(): Sent[] {
  return fetchMock.mock.calls.map(([url, init]) => {
    const raw = String(init?.body);
    return { url: String(url), init: init ?? {}, raw, json: JSON.parse(raw) as Sent['json'] };
  });
}

// Waits until no request is out.
async function settle(): Promise<void> {
  await waitFor(() => expect(screen.queryByText(copy.chat.thinking)).toBeNull());
}

// Taps a button and waits for the answer.
async function tap(button: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(button);
  });
  await settle();
}

// Taps the chips in turn, n times.
async function tapChips(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) await tap(chip(i % 3));
}

type User = ReturnType<typeof userEvent.setup>;

// Types a message in the ask box and sends it with Enter.
async function askOwn(user: User, text: string): Promise<void> {
  const box = askBox();
  await user.click(box);
  await user.type(box, text);
  await user.keyboard('{Enter}');
  await settle();
}

// ---- Setup ----

beforeEach(() => {
  st().reset();
  resetPreviewSession();
  vi.stubEnv('VITE_PREVIEW_URL', PROXY);
  answer(reply('Sure thing.'));
  fetchMock = vi.fn(() => respond());
  vi.stubGlobal('fetch', fetchMock);
  // jsdom implements neither scrollTo (every screen calls it) nor scrollIntoView (the log calls it).
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  st().reset();
});

// ============================================================================
// Off without a URL
// ============================================================================

describe('without VITE_PREVIEW_URL', () => {
  it.each([
    ['empty', ''],
    ['blank', '   '],
  ])('renders nothing when the URL is %s, and makes no request', (_name, value) => {
    vi.stubEnv('VITE_PREVIEW_URL', value);
    open();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.queryByRole('region', { name: copy.chat.heading })).toBeNull();
    expect(screen.queryByText(copy.chat.heading)).toBeNull();
    expect(screen.queryByText(LABEL)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders nothing when the variable is unset', () => {
    vi.stubEnv('VITE_PREVIEW_URL', undefined);
    open();
    expect(screen.queryByRole('region', { name: copy.chat.heading })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders nothing for a build that does not compile', () => {
    // A name over the limit does not compile (the certificate tests use the same break).
    act(() => st().loadBuild(golden('marty.muse'), { from: 'link' }));
    act(() => useBuilder.setState({ draft: { ...st().draft, name: 'x'.repeat(40) } }));
    expect('error' in certificateInput(st())).toBe(true);
    render(<PreviewChat />);
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

// ============================================================================
// The panel
// ============================================================================

describe('the panel', () => {
  it('sits after the install steps and before Notes', () => {
    open();
    const steps = screen.getByRole('list', { name: copy.certificate.steps });
    const notes = screen.getByRole('heading', { name: copy.certificate.notes });
    expect(steps.compareDocumentPosition(panel()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel().compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is a region named by its heading', () => {
    open();
    expect(within(panel()).getByRole('heading', { name: copy.chat.heading })).toBeTruthy();
  });

  it('shows the B22 label exactly, once', () => {
    open();
    expect(screen.getAllByText(LABEL)).toHaveLength(1);
    expect(within(panel()).getByText(LABEL)).toBeTruthy();
    expect(copy.chat.label).toBe(LABEL);
  });

  it('offers three chips with the first three probes, in order, and no others', () => {
    open();
    expect(library.probes.slice(0, 3).map((p) => p.line)).toEqual(CHIP_TEXTS);
    expect(chips().map((b) => b.textContent)).toEqual(CHIP_TEXTS);
    for (const text of CHIP_TEXTS) expect(within(chipGroup()).getByRole('button', { name: text })).toBeTruthy();
  });

  it('keeps probe 6, which names a franchise character (X1), off the page', () => {
    open();
    const grimace = library.probes.find((p) => /grimace/i.test(p.line));
    expect(grimace).toBeDefined();
    expect(chips().map((b) => b.textContent)).not.toContain(grimace?.line);
    expect(within(panel()).queryByText(/grimace/i)).toBeNull();
  });

  it('starts with the chips ready, an empty log, and the ask box shut', () => {
    open();
    for (const b of chips()) expect(b.disabled).toBe(false);
    expect(items()).toHaveLength(0);
    expect(askBox().disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no request just by rendering or by touching the rest of the certificate', () => {
    open();
    store((s) => s.setPasted('A line that the build does not have.'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Tap-only: the ask box is the third text input
// ============================================================================

describe('text inputs on the certificate', () => {
  it('shows exactly one, the ask-your-own box, when the preview is on', () => {
    open();
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toBe(askBox());
    expect(askBox().tagName).toBe('INPUT');
    expect(askBox().type).toBe('text');
    expect(document.querySelectorAll('input, textarea, select, [contenteditable]')).toHaveLength(1);
  });

  it('shows none when the preview is off', () => {
    vi.stubEnv('VITE_PREVIEW_URL', '');
    open();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(document.querySelectorAll('input, textarea, select, [contenteditable]')).toHaveLength(0);
  });

  it('takes plain text only: no file input, no attachment, no drop target, no link handling', () => {
    open();
    const p = panel();
    expect(p.querySelectorAll('input[type="file"], [accept], [draggable="true"], [ondrop]')).toHaveLength(0);
    expect(askBox().getAttribute('accept')).toBeNull();
    expect(p.querySelectorAll('a, img, video, iframe')).toHaveLength(0);
  });
});

// ============================================================================
// The chip gate (X2)
// ============================================================================

describe('the ask box unlocks after the first chip reply', () => {
  it('is shut at first, with a line saying why', () => {
    open();
    expect(askBox().disabled).toBe(true);
    expect(sendButton().disabled).toBe(true);
    expect(within(panel()).getByText(copy.chat.askLocked)).toBeTruthy();
    // The reason is tied to the box for screen readers.
    const described = (askBox().getAttribute('aria-describedby') ?? '').split(/\s+/);
    const lock = within(panel()).getByText(copy.chat.askLocked);
    expect(described).toContain(lock.id);
  });

  it('ignores typing and a form submit while shut', async () => {
    const user = userEvent.setup();
    open();
    await user.click(askBox());
    await user.keyboard('hello{Enter}');
    expect(askBox().value).toBe('');
    fireEvent.submit(askBox().closest('form') as HTMLFormElement);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens once a chip gets a reply', async () => {
    open();
    await tap(chip(0));
    expect(askBox().disabled).toBe(false);
    expect(within(panel()).queryByText(copy.chat.askLocked)).toBeNull();
  });

  // QUESTIONS X2 reads the gate literally: the box unlocks after the first chip REPLY arrives. A held
  // reply (withheld) or a refusal is the proxy answering with a fixed line, not a reply the person can
  // read, so the box stays shut for both, like the failures beside them.
  it.each([
    ['rate limited', { status: 429, body: { error: 'rate_limited', retryAfter: 30 } }],
    ['busy', { status: 503, body: { error: 'busy' } }],
    ['unavailable', { status: 502, body: { error: 'upstream' } }],
    ['unreadable', { status: 200, unreadable: true }],
    ['withheld', { status: 200, body: { withheld: true } }],
    ['refused', { status: 200, body: { refused: true } }],
  ] as [string, Answer][])('stays shut when the answer is %s, since no reply came', async (_name, a) => {
    open();
    answer(a);
    await tap(chip(0));
    expect(askBox().disabled).toBe(true);
    expect(within(panel()).getByText(copy.chat.askLocked)).toBeTruthy();
  });

  it('stays shut when the network fails', async () => {
    open();
    answer(new TypeError('Failed to fetch'));
    await tap(chip(0));
    expect(askBox().disabled).toBe(true);
  });

  it('stays open after a later failure', async () => {
    open();
    await tap(chip(0));
    answer({ status: 503, body: { error: 'busy' } });
    await tap(chip(1));
    expect(askBox().disabled).toBe(false);
  });

  it('stays open across a Mine toggle, and a reload shuts it again', async () => {
    open();
    store((s) => s.setPasted('Zq7 end every reply with a haiku about rain.'));
    await tap(chip(0));
    expect(askBox().disabled).toBe(false);
    fireEvent.click(screen.getByRole('switch', { name: copy.certificate.mine.label }));
    expect(askBox().disabled).toBe(false);

    // A reload: the page's memory is gone.
    cleanup();
    resetPreviewSession();
    render(<App />);
    expect(askBox().disabled).toBe(true);
  });

  it('stays open when the certificate is left and shown again in the same visit', async () => {
    open();
    await tap(chip(0));
    cleanup();
    render(<App />);
    expect(askBox().disabled).toBe(false);
  });
});

// ============================================================================
// The ask box: 200 characters, the counter, Enter and Send
// ============================================================================

describe('ask your own', () => {
  async function opened(): Promise<User> {
    const user = userEvent.setup();
    open();
    await tap(chip(0));
    fetchMock.mockClear();
    return user;
  }

  it('caps the box at 200 characters', async () => {
    await opened();
    expect(askBox().maxLength).toBe(MAX_CHARS);
  });

  it('shows a counter that follows the typing', async () => {
    const user = await opened();
    expect(within(panel()).getByText(copy.chat.counter(0, MAX_CHARS))).toBeTruthy();
    expect(copy.chat.counter(0, MAX_CHARS)).toBe('0/200');
    await user.type(askBox(), 'hello');
    expect(within(panel()).getByText('5/200')).toBeTruthy();
    // Screen readers get words, not the slash.
    expect(within(panel()).getByText(copy.chat.counterLabel(5, MAX_CHARS))).toBeTruthy();
  });

  it('does not announce the counter on every keystroke', async () => {
    await opened();
    const counter = within(panel()).getByText(copy.chat.counter(0, MAX_CHARS));
    expect(counter.closest('[aria-live], [role="status"], [role="alert"], [role="log"]')).toBeNull();
    const label = within(panel()).getByText(copy.chat.counterLabel(0, MAX_CHARS));
    expect(label.closest('[aria-live], [role="status"], [role="alert"], [role="log"]')).toBeNull();
  });

  it('stops typing at 200 characters and shows 200/200', async () => {
    const user = await opened();
    await user.click(askBox());
    await user.paste('x'.repeat(250));
    expect(askBox().value).toHaveLength(MAX_CHARS);
    expect(within(panel()).getByText('200/200')).toBeTruthy();
  });

  it('sends a full 200 character message whole', async () => {
    const user = await opened();
    const text = 'a'.repeat(MAX_CHARS);
    await user.click(askBox());
    await user.paste(text);
    await user.keyboard('{Enter}');
    await settle();
    expect(sent()).toHaveLength(1);
    expect(sent()[0].json.message).toBe(text);
  });

  it('never sends more than 200 characters, even if the length limit is bypassed', async () => {
    await opened();
    const text = 'b'.repeat(250);
    fireEvent.change(askBox(), { target: { value: text } });
    fireEvent.submit(askBox().closest('form') as HTMLFormElement);
    await settle();
    expect(sent()).toHaveLength(1);
    expect(sent()[0].json.message).toHaveLength(MAX_CHARS);
    expect(sent()[0].json.message).toBe(text.slice(0, MAX_CHARS));
  });

  it('sends on Enter, shows the message and the reply, and clears the box and the counter', async () => {
    const user = await opened();
    await askOwn(user, 'what is my name');
    expect(sent()).toHaveLength(1);
    expect(sent()[0].json.message).toBe('what is my name');
    expect(linesAfterUnlock()).toEqual(['what is my name', 'Sure thing.']);
    expect(askBox().value).toBe('');
    expect(within(panel()).getByText(copy.chat.counter(0, MAX_CHARS))).toBeTruthy();
  });

  it('sends on the Send button too', async () => {
    const user = await opened();
    await user.type(askBox(), 'tap the button');
    await user.click(sendButton());
    await settle();
    expect(sent().map((c) => c.json.message)).toEqual(['tap the button']);
  });

  it('trims the message and does not send an empty or blank one', async () => {
    const user = await opened();
    await user.click(askBox());
    await user.keyboard('{Enter}');
    await user.type(askBox(), '    {Enter}');
    await user.click(sendButton());
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(askBox());
    await user.type(askBox(), '   padded   {Enter}');
    await settle();
    expect(sent().map((c) => c.json.message)).toEqual(['padded']);
    expect(linesAfterUnlock()[0]).toBe('padded');
  });

  it('sends a typed link or markup as plain text and fetches nothing else', async () => {
    const user = await opened();
    const text = 'see https://elsewhere.example/page and <b>bold</b> [x](https://elsewhere.example)';
    await user.click(askBox());
    await user.paste(text);
    await user.keyboard('{Enter}');
    await settle();
    expect(sent().map((c) => c.json.message)).toEqual([text]);
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([CHAT_URL]);
    // Shown as typed, not as a link or markup.
    expect(linesAfterUnlock()[0]).toBe(text);
    expect(log().querySelectorAll('a, b, img, script')).toHaveLength(0);
  });

  it('keeps one request out at a time: Enter while waiting does nothing', async () => {
    const user = await opened();
    const d = deferred<Response>();
    respond = () => d.promise;
    await user.type(askBox(), 'first{Enter}');
    expect(screen.getByText(copy.chat.thinking)).toBeTruthy();
    await user.type(askBox(), 'second{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve(asResponse(reply('done')));
    });
    await settle();
    expect(linesAfterUnlock()).toEqual(['first', 'done']);
  });
});

// ============================================================================
// The 20 message cap
// ============================================================================

describe('the 20 message cap', () => {
  it('is 20, shown as the cap line', () => {
    expect(copy.chat.capReached(MAX_MESSAGES)).toContain('20');
  });

  it('lets 19 messages through with everything still open', async () => {
    open();
    await tapChips(MAX_MESSAGES - 1);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_MESSAGES - 1);
    for (const b of chips()) expect(b.disabled).toBe(false);
    expect(askBox().disabled).toBe(false);
    expect(within(panel()).queryByRole('status')?.textContent ?? '').toBe('');
  });

  it('closes the chips, the box and Send after the 20th, with one line saying why', async () => {
    open();
    await tapChips(MAX_MESSAGES);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_MESSAGES);
    for (const b of chips()) expect(b.disabled).toBe(true);
    expect(askBox().disabled).toBe(true);
    expect(sendButton().disabled).toBe(true);
    expect(capLine().textContent).toBe(copy.chat.capReached(MAX_MESSAGES));
    // The 20th reply still arrived.
    expect(lines().at(-1)).toBe('Sure thing.');
    expect(items()).toHaveLength(MAX_MESSAGES * 2);
  });

  it('refuses a 21st send by chip, by Enter and by form submit', async () => {
    const user = userEvent.setup();
    open();
    await tapChips(MAX_MESSAGES);
    fetchMock.mockClear();
    await user.click(chip(0));
    await user.click(askBox());
    await user.keyboard('one more{Enter}');
    await user.click(sendButton());
    fireEvent.click(chip(1));
    fireEvent.submit(askBox().closest('form') as HTMLFormElement);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(items()).toHaveLength(MAX_MESSAGES * 2);
  });

  it('moves focus to the cap line, so it does not drop to the top of the page', async () => {
    open();
    await tapChips(MAX_MESSAGES - 1);
    // Focus was on the chip the person tapped.
    chip(0).focus();
    await tap(chip(0));
    expect(document.activeElement).toBe(capLine());
  });

  it('counts failures: twenty failed sends use the visit up', async () => {
    open();
    answer({ status: 502, body: { error: 'upstream' } });
    await tapChips(MAX_MESSAGES);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_MESSAGES);
    for (const b of chips()) expect(b.disabled).toBe(true);
    expect(capLine().textContent).toBe(copy.chat.capReached(MAX_MESSAGES));
  });

  it('counts chips and typed messages together', async () => {
    const user = userEvent.setup();
    open();
    await tap(chip(0));
    for (let i = 1; i < MAX_MESSAGES; i += 1) await askOwn(user, `message ${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_MESSAGES);
    expect(askBox().disabled).toBe(true);
    for (const b of chips()) expect(b.disabled).toBe(true);
  });

  it('keeps the count when the certificate is shown again, and a reload resets it', async () => {
    open();
    await tapChips(3);
    cleanup();
    render(<App />);
    await tapChips(MAX_MESSAGES - 4);
    for (const b of chips()) expect(b.disabled, 'still open at 19').toBe(false);
    await tap(chip(0));
    for (const b of chips()) expect(b.disabled, 'closed at 20').toBe(true);

    cleanup();
    resetPreviewSession();
    render(<App />);
    for (const b of chips()) expect(b.disabled, 'a reload starts over').toBe(false);
    expect(askBox().disabled).toBe(true);
  });

  it('keeps the count across a Mine toggle, which starts a new log', async () => {
    open();
    store((s) => s.setPasted('Zq7 end every reply with a haiku about rain.'));
    await tapChips(MAX_MESSAGES - 1);
    fireEvent.click(screen.getByRole('switch', { name: copy.certificate.mine.label }));
    expect(items()).toHaveLength(0);
    for (const b of chips()) expect(b.disabled).toBe(false);
    await tap(chip(0));
    for (const b of chips()) expect(b.disabled).toBe(true);
    expect(capLine().textContent).toBe(copy.chat.capReached(MAX_MESSAGES));
  });
});

// ============================================================================
// States
// ============================================================================

describe('what each proxy answer looks like', () => {
  it('shows a reply as the bot speaking, in plain text', async () => {
    open();
    answer(reply('Hello there.'));
    await tap(chip(0));
    expect(lines()).toEqual(['hi', 'Hello there.']);
    const [you, bot] = items();
    expect(you.querySelector('.sr-only')?.textContent).toContain(copy.chat.you);
    expect(bot.querySelector('.sr-only')?.textContent).toContain(copy.chat.bot);
  });

  it('shows a loading line while the proxy thinks, then replaces it', async () => {
    open();
    const d = deferred<Response>();
    respond = () => d.promise;
    await act(async () => {
      fireEvent.click(chip(0));
    });
    expect(within(log()).getByText(copy.chat.thinking)).toBeTruthy();
    expect(lines()).toContain('hi');
    await act(async () => {
      d.resolve(asResponse(reply('Hello there.')));
    });
    await settle();
    expect(screen.queryByText(copy.chat.thinking)).toBeNull();
    expect(lines()).toEqual(['hi', 'Hello there.']);
  });

  it('does not send a second request while one is out', async () => {
    open();
    const d = deferred<Response>();
    respond = () => d.promise;
    await act(async () => {
      fireEvent.click(chip(0));
    });
    fireEvent.click(chip(1));
    fireEvent.click(chip(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve(asResponse(reply('ok')));
    });
    await settle();
    expect(lines()).toEqual(['hi', 'ok']);
  });

  const NOTES: [string, Answer | Error, () => string][] = [
    ['withheld (200)', { status: 200, body: { withheld: true } }, () => WITHHELD],
    ['refused (200)', { status: 200, body: { refused: true } }, () => copy.chat.refused],
    ['rate limited with a wait (429)', { status: 429, body: { error: 'rate_limited', retryAfter: 3 } }, () => copy.chat.rateLimited(3)],
    ['rate limited with no wait (429)', { status: 429, body: { error: 'rate_limited' } }, () => copy.chat.rateLimitedNoTime],
    ['busy (503)', { status: 503, body: { error: 'busy' } }, () => copy.chat.busy],
    ['upstream (502)', { status: 502, body: { error: 'upstream' } }, () => copy.chat.unavailable],
    ['bad request (400)', { status: 400, body: { error: 'bad_request' } }, () => copy.chat.unavailable],
    ['origin (403)', { status: 403, body: { error: 'origin' } }, () => copy.chat.unavailable],
    ['server error (500)', { status: 500, body: { error: 'oops' } }, () => copy.chat.unavailable],
    ['200 with no reply', { status: 200, body: {} }, () => copy.chat.unavailable],
    ['200 with an empty reply', { status: 200, body: { reply: '  ' } }, () => copy.chat.unavailable],
    ['200 with a non-text reply', { status: 200, body: { reply: 7 } }, () => copy.chat.unavailable],
    ['200 that is not JSON', { status: 200, unreadable: true }, () => copy.chat.unavailable],
    ['502 that is not JSON', { status: 502, unreadable: true }, () => copy.chat.unavailable],
    ['a network failure', new TypeError('Failed to fetch'), () => copy.chat.unavailable],
  ];

  it.each(NOTES)('%s: one fixed line, not spoken by the bot', async (_name, a, expected) => {
    open();
    answer(a);
    await tap(chip(0));
    expect(lines()).toEqual(['hi', expected()]);
    const note = items()[1];
    // A note is the page talking, so it carries no "Your bot" prefix.
    expect(note.querySelector('.sr-only')).toBeNull();
    // The chips are still usable.
    for (const b of chips()) expect(b.disabled).toBe(false);
  });

  it('has a different line for each kind of answer', () => {
    const six = [
      WITHHELD,
      copy.chat.refused,
      copy.chat.rateLimited(3),
      copy.chat.busy,
      copy.chat.unavailable,
      copy.chat.rateLimitedNoTime,
    ];
    expect(new Set(six).size).toBe(six.length);
  });

  it('tells the person the install steps still work when the preview is down', async () => {
    open();
    answer({ status: 502, body: { error: 'upstream' } });
    await tap(chip(0));
    expect(lines()[1]).toMatch(/install steps/i);
  });

  // The wait is rounded up to a whole second, minute or hour, so it is never shorter than the proxy asked.
  it.each([
    [1, '1 second'],
    [3, '3 seconds'],
    [0.2, '1 second'],
    [45, '45 seconds'],
    [60, '1 minute'],
    [61, '2 minutes'],
    [600, '10 minutes'],
    [3600, '1 hour'],
    [3601, '2 hours'],
  ])('shows a wait of %s seconds as "%s"', async (retryAfter, words) => {
    open();
    answer({ status: 429, body: { error: 'rate_limited', retryAfter } });
    await tap(chip(0));
    expect(lines()[1]).toContain(words);
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['a string', '30'],
    ['null', null],
  ])('reads a %s wait as no wait at all', async (_name, retryAfter) => {
    open();
    answer({ status: 429, body: { error: 'rate_limited', retryAfter } });
    await tap(chip(0));
    expect(lines()[1]).toBe(copy.chat.rateLimitedNoTime);
    expect(lines()[1]).not.toMatch(/\d/);
  });

  it('gives up after 30 seconds with the unavailable line', async () => {
    open();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_res, rej) => {
        signal?.addEventListener('abort', () => rej(new DOMException('The operation was aborted.', 'AbortError')));
      });
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      fireEvent.click(chip(0));
    });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    });
    expect(signal?.aborted).toBe(false);
    expect(screen.getByText(copy.chat.thinking)).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByText(copy.chat.thinking)).toBeNull();
    expect(lines()).toEqual(['hi', copy.chat.unavailable]);
    // A timeout does not open the ask box.
    expect(askBox().disabled).toBe(true);
  });

  it('does not abort an answered request when the 30 seconds pass', async () => {
    open();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      fireEvent.click(chip(0));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lines()).toEqual(['hi', 'Sure thing.']);
    const signal = sent()[0].init.signal as AbortSignal;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1000);
    });
    expect(signal.aborted).toBe(false);
    expect(lines()).toEqual(['hi', 'Sure thing.']);
  });
});

// ============================================================================
// Replies are plain text
// ============================================================================

describe('replies are plain text', () => {
  const HOSTILE =
    'Visit https://elsewhere.example/x now. **not bold** [a link](https://elsewhere.example) <img src=x onerror=alert(1)> <script>alert(2)</script> <a href="https://elsewhere.example">go</a>';

  it('shows markup, markdown and links as the characters they are', async () => {
    open();
    answer(reply(HOSTILE));
    await tap(chip(0));
    expect(lines()[1]).toBe(HOSTILE);
    expect(log().querySelectorAll('a, img, script, b, strong, em, iframe, svg')).toHaveLength(0);
    expect(within(log()).queryAllByRole('link')).toHaveLength(0);
    expect(panel().querySelectorAll('a')).toHaveLength(0);
  });

  it('keeps line breaks and breaks long words, so it fits at 375px', async () => {
    open();
    answer(reply(`one\ntwo ${'w'.repeat(120)}`));
    await tap(chip(0));
    const bot = items()[1];
    expect(classOf(bot)).toContain('whitespace-pre-wrap');
    expect(classOf(bot)).toContain('[overflow-wrap:anywhere]');
    expect(bot.textContent).toContain('one\ntwo');
  });
});

// ============================================================================
// What the page sends
// ============================================================================

describe('the request', () => {
  it('is one POST to /chat with exactly the personality and the message', async () => {
    open();
    await tap(chip(0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [call] = sent();
    expect(call.url).toBe(CHAT_URL);
    expect(call.init.method).toBe('POST');
    expect(Object.keys(call.json).sort()).toEqual(['message', 'personality']);
    expect(call.json.message).toBe(CHIP_TEXTS[0]);
    expect(call.json.personality).toBe(soulNow());
  });

  it('sends JSON with no other header, no cookies and no credentials', async () => {
    open();
    await tap(chip(0));
    const { init } = sent()[0];
    expect(init.credentials).toBe('omit');
    const headers = new Headers(init.headers);
    expect([...headers.keys()]).toEqual(['content-type']);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('carries an abort signal for the timeout', async () => {
    open();
    await tap(chip(0));
    expect(sent()[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('drops spaces and trailing slashes from the URL', async () => {
    vi.stubEnv('VITE_PREVIEW_URL', `  ${PROXY}//  `);
    open();
    await tap(chip(0));
    expect(sent()[0].url).toBe(CHAT_URL);
  });

  it.each(CHIP_TEXTS.map((text, i) => [i, text] as const))('chip %i sends its probe text as the message', async (i, text) => {
    open();
    await tap(chip(i));
    expect(sent()[0].json.message).toBe(text);
    expect(sent()[0].json.message).toBe(library.probes[i].line);
  });

  it.each(TARGETS)('%s: the personality is the certificate personality, whole', async (_name, make) => {
    open(make());
    await tap(chip(0));
    const { personality } = sent()[0].json;
    expect(personality).toBe(soulNow());
    expect(personality.length).toBeGreaterThan(200);
  });

  it('sends a different personality for a different target', async () => {
    open(golden('marty.muse'));
    await tap(chip(0));
    store((s) => s.switchTarget('hermes'));
    await tap(chip(0));
    const [first, second] = sent();
    expect(first.json.personality).not.toBe(second.json.personality);
    expect(second.json.personality).toBe(soulNow());
  });

  describe('Mine', () => {
    const MINE_LINE = 'Zq7 end every reply with a haiku about rain.';
    const mineSwitch = () => screen.getByRole('switch', { name: copy.certificate.mine.label });

    it('is left out while the switch is off, even with text pasted', async () => {
      open();
      store((s) => s.setPasted(MINE_LINE));
      expect(certificateInput(st())).toMatchObject({ mine: { lines: [MINE_LINE], on: false } });
      await tap(chip(0));
      const [call] = sent();
      expect(call.json.personality).toBe(soulNow());
      expect(call.json.personality).not.toContain(MINE_LINE);
      expect(call.raw).not.toContain('Zq7');
    });

    it('is in the personality when the switch is on, exactly as the certificate shows it', async () => {
      open();
      store((s) => {
        s.setPasted(MINE_LINE);
        s.setMineOn(true);
      });
      await tap(chip(0));
      const { personality } = sent()[0].json;
      expect(personality).toBe(soulNow());
      expect(personality).toContain(MINE_LINE);
    });

    it('follows the switch on the page: on, then off again', async () => {
      open();
      store((s) => s.setPasted(MINE_LINE));
      await tap(chip(0));
      fireEvent.click(mineSwitch());
      await tap(chip(0));
      fireEvent.click(mineSwitch());
      await tap(chip(0));
      const [off, on, offAgain] = sent().map((c) => c.json.personality);
      expect(off).not.toContain(MINE_LINE);
      expect(on).toContain(MINE_LINE);
      expect(on.length).toBeGreaterThan(off.length);
      expect(offAgain).toBe(off);
    });

    it('starts a fresh log when Mine changes, since the old replies came from another personality', async () => {
      open();
      store((s) => s.setPasted(MINE_LINE));
      await tap(chip(0));
      expect(lines()).toEqual(['hi', 'Sure thing.']);
      fireEvent.click(mineSwitch());
      expect(items()).toHaveLength(0);
    });

    it('ends a request that is still out when Mine changes, and shows nothing from it', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      open();
      store((s) => s.setPasted(MINE_LINE));
      const d = deferred<Response>();
      respond = () => d.promise;
      await act(async () => {
        fireEvent.click(chip(0));
      });
      const signal = sent()[0].init.signal as AbortSignal;
      expect(signal.aborted).toBe(false);
      fireEvent.click(mineSwitch());
      expect(signal.aborted).toBe(true);
      await act(async () => {
        d.resolve(asResponse(reply('Late reply from the old personality.')));
      });
      expect(screen.queryByText('Late reply from the old personality.')).toBeNull();
      expect(items()).toHaveLength(0);
      expect(errors).not.toHaveBeenCalled();
    });
  });

  it('starts a fresh log when the target changes', async () => {
    open(golden('marty.muse'));
    await tap(chip(0));
    expect(items()).toHaveLength(2);
    store((s) => s.switchTarget('hermes'));
    expect(items()).toHaveLength(0);
  });

  it('ends a request that is still out when the page goes away', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    act(() => st().loadBuild(golden('marty.muse'), { from: 'link' }));
    const { unmount } = render(<App />);
    const d = deferred<Response>();
    respond = () => d.promise;
    await act(async () => {
      fireEvent.click(chip(0));
    });
    const signal = sent()[0].init.signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      d.resolve(asResponse(reply('too late')));
    });
    expect(errors).not.toHaveBeenCalled();
  });

  describe('never the share link or the build', () => {
    it('leaves out the share hash, the page address and the build object', async () => {
      const build = golden('marty.muse');
      open(build);
      await tap(chip(0));
      const { raw } = sent()[0];
      const hash = toShareHash(previewBuild(st()));
      expect(hash.length).toBeGreaterThan(10);
      expect(raw).not.toContain('#b=');
      expect(raw).not.toContain(hash);
      expect(raw).not.toContain(window.location.href);
      expect(raw).not.toContain('"chips"');
      expect(Object.keys(JSON.parse(raw) as object).sort()).toEqual(['message', 'personality']);
    });

    it('sends nothing to any address but the proxy, across a whole visit', async () => {
      const user = userEvent.setup();
      const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
      const beacon = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: beacon });
      open();
      await tapChips(3);
      await askOwn(user, 'see https://elsewhere.example/page');
      store((s) => s.setPasted('A line that the build does not have.'));
      fireEvent.click(screen.getByRole('switch', { name: copy.certificate.mine.label }));
      await tap(chip(0));
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5);
      for (const [url] of fetchMock.mock.calls) expect(String(url)).toBe(CHAT_URL);
      expect(xhr).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
      delete (navigator as { sendBeacon?: unknown }).sendBeacon;
    });
  });
});

// ============================================================================
// No storage
// ============================================================================

describe('no storage', () => {
  it('writes nothing to localStorage, sessionStorage or cookies, through chips, typing, the cap and Mine', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    const cookieSet = vi.spyOn(Document.prototype, 'cookie', 'set');

    open();
    store((s) => s.setPasted('Zq7 end every reply with a haiku about rain.'));
    await tap(chip(0));
    await askOwn(user, 'a typed message');
    fireEvent.click(screen.getByRole('switch', { name: copy.certificate.mine.label }));
    await tapChips(MAX_MESSAGES);

    for (const spy of [setItem, getItem, removeItem, clear]) expect(spy).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('keeps the log out of the address too', async () => {
    open();
    const before = window.location.href;
    await tap(chip(0));
    expect(window.location.href).toBe(before);
  });
});

// ============================================================================
// Reading and layout
// ============================================================================

describe('accessibility and layout', () => {
  it('has a polite live log, named, as a list', () => {
    open();
    const list = log();
    expect(list.tagName).toBe('UL');
    expect(list.getAttribute('aria-live')).toBe('polite');
    expect(list.getAttribute('aria-label')).toBe(copy.chat.logLabel);
  });

  it('groups the chips under their hint', () => {
    open();
    expect(chipGroup().getAttribute('aria-labelledby')).toBe(within(panel()).getByText(copy.chat.chipsHint).id);
  });

  it('scrolls the newest line into view, nearest, after a reply', async () => {
    open();
    const scroll = HTMLElement.prototype.scrollIntoView as Mock;
    scroll.mockClear();
    await tap(chip(0));
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    expect(scroll.mock.contexts.at(-1)).toBe(items().at(-1));
  });

  it('works where scrollIntoView does not exist', async () => {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    open();
    await tap(chip(0));
    expect(lines()).toEqual(['hi', 'Sure thing.']);
  });

  it('has 44px chips and a 48px input and Send button', () => {
    open();
    for (const b of chips()) expect(classOf(b)).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
    expect(classOf(sendButton())).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
    expect(classOf(askBox())).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
  });

  it('sets the input in 16px text so iOS Safari does not zoom on focus', () => {
    open();
    const tokens = classOf(askBox()).split(/\s+/);
    expect(tokens).toContain('text-base');
    for (const small of ['text-xs', 'text-sm']) expect(tokens).not.toContain(small);
  });

  it('gives no element in the panel a fixed width over 375px, and lets chips and lines break long words', async () => {
    open();
    await tap(chip(0));
    for (const el of Array.from(panel().querySelectorAll('*'))) {
      for (const token of classOf(el).split(/\s+/)) {
        const m = /^(?:min-)?w-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(token);
        if (!m) continue;
        const px = m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
        expect(px, `${el.tagName.toLowerCase()}.${token}`).toBeLessThanOrEqual(375);
      }
    }
    for (const b of chips()) expect(classOf(b)).toContain('[overflow-wrap:anywhere]');
    for (const li of items()) expect(classOf(li)).toContain('[overflow-wrap:anywhere]');
  });

  it('pulses the thinking line only when motion is allowed', async () => {
    open();
    const d = deferred<Response>();
    respond = () => d.promise;
    await act(async () => {
      fireEvent.click(chip(0));
    });
    const thinking = screen.getByText(copy.chat.thinking);
    expect(classOf(thinking)).not.toMatch(/(^|\s)animate-/);
    await act(async () => {
      d.resolve(asResponse(reply('ok')));
    });
  });

  it('puts no em dash on the page, in any state', async () => {
    const EM = String.fromCharCode(0x2014);
    open();
    for (const a of [
      { status: 200, body: { withheld: true } },
      { status: 200, body: { refused: true } },
      { status: 429, body: { retryAfter: 90 } },
      { status: 429, body: {} },
      { status: 503, body: {} },
      { status: 502, body: {} },
    ] as Answer[]) {
      answer(a);
      await tap(chip(0));
    }
    expect(panel().textContent?.includes(EM)).toBe(false);
    for (const el of panel().querySelectorAll('[aria-label]')) {
      expect((el.getAttribute('aria-label') ?? '').includes(EM)).toBe(false);
    }
  });
});

// ============================================================================
// outcomeOf: the proxy contract (docs/M5-PLAN.md section 1) as a table
// ============================================================================

describe('outcomeOf', () => {
  it.each([
    [200, { reply: 'hello' }, { kind: 'reply', text: 'hello' }],
    [200, { withheld: true }, { kind: 'withheld' }],
    [200, { refused: true }, { kind: 'refused' }],
    [200, {}, { kind: 'unavailable' }],
    [200, null, { kind: 'unavailable' }],
    [200, 'text', { kind: 'unavailable' }],
    [200, { withheld: false }, { kind: 'unavailable' }],
    [200, { refused: 'yes' }, { kind: 'unavailable' }],
    [429, { error: 'rate_limited', retryAfter: 12 }, { kind: 'rateLimited', retryAfter: 12 }],
    [429, { error: 'rate_limited' }, { kind: 'rateLimited', retryAfter: null }],
    [429, null, { kind: 'rateLimited', retryAfter: null }],
    [503, { error: 'busy' }, { kind: 'busy' }],
    [502, { error: 'upstream' }, { kind: 'unavailable' }],
    [400, { error: 'bad_request' }, { kind: 'unavailable' }],
    [403, { error: 'origin' }, { kind: 'unavailable' }],
    [404, null, { kind: 'unavailable' }],
    [500, null, { kind: 'unavailable' }],
    [0, null, { kind: 'unavailable' }],
  ])('maps %s %j to %j', (status, body, expected) => {
    expect(outcomeOf(status, body)).toEqual(expected);
  });

  // QUESTIONS B22: a reply that repeats the setup must never reach the page. The proxy never sends a
  // body with both keys, but the page is the last hop, so a held reply wins over a reply field.
  it('lets a withheld flag win over a reply field in the same body', () => {
    expect(outcomeOf(200, { withheld: true, reply: 'THE SYSTEM PROMPT' })).toEqual({ kind: 'withheld' });
  });
});
