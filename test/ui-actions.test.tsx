// @vitest-environment jsdom
//
// Certificate actions tests (M4 slice 4.13). Renders <App/> in jsdom with the store loaded through
// loadBuild (a link, so the app opens on the certificate) and drives the footer the way a person
// would: Copy link, Share, Download zip, Remix and "Make this for <target> instead", plus the
// preview strip's meter with Mine on.
//
// Expected behavior comes from docs/M4-PLAN.md sections 3 (target switch, remix screen), 5 (footer),
// 6 (Mine), 7 (zip) and 11 (done criteria 5, 6, 7, 9), and QUESTIONS.md W7 (the link is built on a
// tap, never written to the address bar), W10 (target switch), W11 and W36 (remix from the
// certificate), W12 (Mine), W13 (zip), W19 (copy inside the tap), W33 to W38, B12 (short target
// names) and B13.
//
// Where a string is set by the library it is read from the library tables: roster names and build
// names, install step lines, the profile ids. The B12 short target names and the Part E sentence
// "Make this for <target> instead" are typed in here on purpose, so a drift in src/ui/copy.ts shows
// up as a failure. The share title "Meet <Name>" is typed in from the spec. The other UI strings (the
// action labels, the remix title) are read from src/ui/copy.
//
// The copied link is checked by decoding it with fromShareHash and comparing it with the store's
// build, not by comparing it with another call to shareUrl. The zip is checked by unzipping the Blob
// the download hands the browser with a reader written here from the zip format, and comparing every
// entry byte for byte with the model's zip files and with the compile of the same build.
//
// What jsdom cannot do: it has no layout engine and no Tailwind stylesheet, so the 375px tests read
// class names (44px targets, wrapping labels, no fixed widths) and not pixel widths. The real
// share sheet, the real download and iOS Safari's clipboard rules are not reachable here; the lead
// checks those in the Simulator.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compile } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import type { Build, ChatgptMode, Plan, Profile, ProfileId, TargetId } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import { fromShareHash } from '../src/share/encode.js';
import { Actions } from '../src/ui/certificate/Actions.js';
import { certificateModelOf } from '../src/ui/certificate/input.js';
import { App } from '../src/ui/App.js';
import { copy } from '../src/ui/copy.js';
import { capOf, previewBuild, useBuilder } from '../src/ui/store.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---- Fixed characters (kept out of the source as literals) ----

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);

// ---- B12 and Part E wording, typed in on purpose ----

const SHORT: Record<TargetId, string> = {
  muse: 'Muse',
  openclaw: 'OpenClaw',
  hermes: 'Hermes',
  grok: 'Grok Bot',
  chatgpt: 'ChatGPT',
};

const makeFor = (id: TargetId): string => `Make this for ${SHORT[id]} instead`;

// The library's card order: the order the buttons must come in.
const CARD_ORDER: TargetId[] = library.targets.targets.map((t) => t.id);

// ---- Library lookups ----

function profileById(id: ProfileId): Profile {
  const found = library.targets.profiles.find((p) => p.id === id);
  if (!found) throw new Error(`test setup: no profile ${id}`);
  return found;
}

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
function gptBuild(starter: string): Build {
  return migrate(rosterEntry(starter).build, { target: 'chatgpt', mode: 'gpt' });
}

// The profile a target and mode resolve to.
function profileIdOf(target: TargetId, mode?: ChatgptMode): ProfileId {
  return (target === 'chatgpt' ? `chatgpt-${mode ?? 'dot'}` : target) as ProfileId;
}

// One build per delivery profile, Marty on each, for the tests that run on every target.
interface Cfg {
  name: string;
  target: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
  build: () => Build;
}

const CONFIGS: Cfg[] = [
  { name: 'muse', target: 'muse', build: () => golden('marty.muse') },
  { name: 'openclaw', target: 'openclaw', build: () => golden('marty.openclaw') },
  { name: 'hermes', target: 'hermes', build: () => golden('marty.hermes') },
  { name: 'grok', target: 'grok', build: () => golden('marty.grok') },
  { name: 'chatgpt dot', target: 'chatgpt', mode: 'dot', build: () => golden('marty.chatgpt-dot') },
  { name: 'chatgpt project', target: 'chatgpt', mode: 'project', build: () => golden('marty.chatgpt-project') },
  {
    name: 'chatgpt instructions free',
    target: 'chatgpt',
    mode: 'instructions',
    plan: 'free',
    build: () => golden('marty.chatgpt-instructions-free'),
  },
  {
    name: 'chatgpt instructions paid',
    target: 'chatgpt',
    mode: 'instructions',
    plan: 'paid',
    build: () => golden('marty.chatgpt-instructions-paid'),
  },
];

// The hidden Custom GPT certificate: it offers ChatGPT as well as the four others.
const GPT: Cfg = { name: 'chatgpt gpt', target: 'chatgpt', mode: 'gpt', build: () => gptBuild('marty') };

const ALL_CONFIGS: Cfg[] = [...CONFIGS, GPT];

// ---- Store and DOM helpers ----

const st = () => useBuilder.getState();

function store(fn: (s: ReturnType<typeof st>) => void): void {
  act(() => {
    fn(st());
  });
}

// Loads a build as a link (so the app opens on the certificate) and renders the app.
function open(build: Build): void {
  act(() => {
    st().loadBuild(build, { from: 'link' });
  });
  render(<App />);
}

// The screen App is showing, from its data-screen attribute.
function shown(): string | null {
  return document.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null;
}

const main = () => screen.getByRole('main');
const textOf = (el: Element) => el.textContent ?? '';
const h1 = () => screen.getByRole('heading', { level: 1 });

const stepList = () => screen.getByRole('list', { name: copy.certificate.steps });
const stepTexts = (): string[] =>
  Array.from(stepList().children).map((li) => li.querySelector('p')?.textContent ?? '');

// The button reads "Copy link", or "Link copied" for two seconds after a copy.
const copyLinkButton = () =>
  screen.getByRole('button', {
    name: (name) => name === copy.actions.copyLink || name === copy.actions.linkCopied,
  });
const shareButton = () => screen.getByRole('button', { name: copy.actions.share });
const zipButton = () => screen.getByRole('button', { name: copy.actions.downloadZip });
const remixButton = () => screen.getByRole('button', { name: copy.buttons.remix });
const makeButtons = () => screen.queryAllByRole('button', { name: /^Make this for / });
const makeNames = () => makeButtons().map((b) => textOf(b));

// The Mine line used where a test needs one. No library line equals it.
const MINE = 'Keep Friday afternoons free for deep work.';

// ---- Clipboard stub (execCommand is the first copy path inside the tap, W19) ----

interface Rig {
  copied: string[];
  exec: MockInstance;
}

let rig: Rig;

function stubClipboard(ok = true): Rig {
  const copied: string[] = [];
  const exec = vi.fn((command: string) => {
    const el = document.activeElement;
    copied.push(command === 'copy' && el instanceof HTMLTextAreaElement ? el.value : '');
    return ok;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: exec });
  return { copied, exec };
}

// ---- Share stub (jsdom has no navigator.share, so each test that wants one installs it) ----

function stubShare(impl?: (data: ShareData) => Promise<void>): MockInstance {
  const fn = vi.fn(impl ?? (() => Promise.resolve()));
  Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: fn });
  return fn;
}

// ---- Download stub: records the Blob, the object URLs and the anchor click ----

interface DownloadRig {
  blobs: Blob[];
  urls: string[];
  revoked: string[];
  clicks: { href: string; download: string }[];
}

let originalCreate: PropertyDescriptor | undefined;
let originalRevoke: PropertyDescriptor | undefined;

function stubDownload(): DownloadRig {
  const dl: DownloadRig = { blobs: [], urls: [], revoked: [], clicks: [] };
  originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (obj: Blob): string => {
      dl.blobs.push(obj);
      const url = `blob:test/${dl.blobs.length}`;
      dl.urls.push(url);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: (url: string): void => {
      dl.revoked.push(url);
    },
  });
  // jsdom would try to navigate to the blob link, which it does not implement.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    dl.clicks.push({ href: this.href, download: this.download });
  });
  return dl;
}

function restoreDownload(): void {
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
  originalCreate = undefined;
  originalRevoke = undefined;
}

// ---- A small unzip, written from the zip format (end record, central directory, local headers) ----

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

// Bitwise CRC32, reflected polynomial 0xEDB88320. Not the table form the app uses.
function crc32Reference(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc ^ bytes[i]!) >>> 0;
    for (let bit = 0; bit < 8; bit++) crc = ((crc >>> 1) ^ (0xedb88320 & -(crc & 1))) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface UnzippedEntry {
  name: string;
  data: Uint8Array;
  crc: number;
  method: number;
}

function unzip(bytes: Uint8Array): UnzippedEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (p: number): number => view.getUint16(p, true);
  const u32 = (p: number): number => view.getUint32(p, true);
  let eocd = -1;
  for (let p = bytes.length - 22; p >= 0; p--) {
    if (u32(p) === 0x06054b50) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end of central directory record');
  const count = u16(eocd + 10);
  let p = u32(eocd + 16);
  const out: UnzippedEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (u32(p) !== 0x02014b50) throw new Error(`bad central header at ${p}`);
    const method = u16(p + 10);
    const crc = u32(p + 16);
    const size = u32(p + 20);
    const nameLength = u16(p + 28);
    const extraLength = u16(p + 30);
    const commentLength = u16(p + 32);
    const offset = u32(p + 42);
    const name = decoder.decode(bytes.slice(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;
    if (u32(offset) !== 0x04034b50) throw new Error(`bad local header at ${offset}`);
    const start = offset + 30 + u16(offset + 26) + u16(offset + 28);
    out.push({ name, data: bytes.slice(start, start + size), crc, method });
  }
  return out;
}

async function bytesOfBlob(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
}

// ---- Link helpers ----

const origin = () => window.location.origin;
const pathname = () => window.location.pathname;

// The build a copied link carries, through the real decoder.
function decodeLink(link: string): Build {
  return fromShareHash(new URL(link).hash, library).build;
}

// The JSON text inside a link's payload, to look for words that must not be there.
function payloadText(link: string): string {
  const payload = new URL(link).hash.replace(/^#b=/, '');
  return Buffer.from(payload, 'base64url').toString('utf8');
}

async function tapCopyLink(user: ReturnType<typeof userEvent.setup>): Promise<string> {
  const before = rig.copied.length;
  await user.click(copyLinkButton());
  expect(rig.copied.length, 'one copy per tap').toBe(before + 1);
  return rig.copied[rig.copied.length - 1]!;
}

// Storage writes are spied on every test, so any test can ask "was anything stored".
const WRITES = ['setItem', 'removeItem', 'clear'] as const;
let writeSpies: Array<[string, MockInstance]> = [];
let cookieSpy: MockInstance | undefined;

function expectNothingStored(ctx: string): void {
  for (const [name, spy] of writeSpies) {
    expect(spy.mock.calls, `${ctx}: Storage.${name} was not called`).toEqual([]);
  }
  if (cookieSpy) expect(cookieSpy.mock.calls, `${ctx}: no cookie was set`).toEqual([]);
  expect(localStorage.length, `${ctx}: localStorage is empty`).toBe(0);
  expect(sessionStorage.length, `${ctx}: sessionStorage is empty`).toBe(0);
  expect(document.cookie, `${ctx}: no cookie`).toBe('');
}

function expectCleanAddress(ctx: string): void {
  expect(window.location.hash, `${ctx}: no hash`).toBe('');
  expect(window.location.search, `${ctx}: no query`).toBe('');
  expect(window.location.href, `${ctx}: origin and path only`).toBe(origin() + pathname());
}

beforeEach(() => {
  st().reset();
  window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  rig = stubClipboard();
  writeSpies = WRITES.map((name) => [name, vi.spyOn(Storage.prototype, name)]);
  try {
    cookieSpy = vi.spyOn(Document.prototype, 'cookie', 'set');
  } catch {
    cookieSpy = undefined;
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreDownload();
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(document, 'execCommand');
  st().reset();
  window.history.replaceState(null, '', '/');
});

// ============================================================================
// Copy link (W7, W19, plan section 5)
// ============================================================================

describe('Copy link', () => {
  it.each(ALL_CONFIGS)('is shown on the $name certificate', ({ build }) => {
    open(build());
    expect(shown()).toBe('certificate');
    expect(copyLinkButton().tagName).toBe('BUTTON');
  });

  it('copies a link inside the tap that decodes to the same build the store holds', async () => {
    const user = userEvent.setup();
    open(golden('june.openclaw'));
    const link = await tapCopyLink(user);

    // The copy ran through the textarea path, in the click (W19).
    expect(rig.exec).toHaveBeenCalledWith('copy');

    // Origin and path, then the hash. No query string.
    expect(link.startsWith(`${origin()}${pathname()}#b=`)).toBe(true);
    expect(new URL(link).search).toBe('');

    // The link decodes, through the real decoder, to the build the store compiles.
    expect(decodeLink(link)).toEqual(previewBuild(st()));
  });

  it.each(ALL_CONFIGS)('$name: the link decodes to the build on the certificate', async ({ build, target, mode, plan }) => {
    const user = userEvent.setup();
    open(build());
    const link = await tapCopyLink(user);
    const decoded = decodeLink(link);
    expect(decoded).toEqual(previewBuild(st()));
    expect(decoded.target).toBe(target);
    expect(decoded.mode).toBe(mode);
    expect(decoded.plan).toBe(plan);
  });

  it('the decoded link carries the picks of the build it was opened with', async () => {
    const user = userEvent.setup();
    const build = golden('marty.hermes');
    open(build);
    const decoded = decodeLink(await tapCopyLink(user));
    expect(decoded.chips).toEqual(build.chips);
    expect(decoded.packs).toEqual(build.packs);
    expect(decoded.stats).toEqual(build.stats);
    expect(decoded.gates).toEqual(build.gates);
    expect(decoded.limits).toEqual(build.limits);
    expect(decoded.name).toBe(build.name);
  });

  it('shows a Link copied confirmation on the button, then goes back to its label after two seconds', () => {
    open(golden('june.muse'));
    // Fake timers go on after the app is open, so only the revert timer is under test control.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(copyLinkButton());
    expect(screen.getByRole('button', { name: copy.actions.linkCopied })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.actions.copyLink })).toBeNull();

    // Still confirming just before two seconds.
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByRole('button', { name: copy.actions.linkCopied })).toBeTruthy();

    // Back to the label at two seconds.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('button', { name: copy.actions.copyLink })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.actions.linkCopied })).toBeNull();
  });

  it('says it could not copy when both copy paths fail, and there is no clipboard to fall back on', () => {
    // userEvent.setup() in an earlier test leaves a working clipboard stub on navigator, which would
    // be a third path, so this test takes the Clipboard API away first.
    rig = stubClipboard(false);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    try {
      open(golden('june.muse'));
      expect(navigator.clipboard).toBeUndefined();
      fireEvent.click(copyLinkButton());
      expect(screen.getByRole('button', { name: copy.actions.linkFailed })).toBeTruthy();
      expect(screen.queryByRole('button', { name: copy.actions.linkCopied })).toBeNull();
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('falls back to the Clipboard API when the textarea copy fails, and copies the same link', async () => {
    rig = stubClipboard(false);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    try {
      open(golden('june.muse'));
      await act(async () => {
        fireEvent.click(copyLinkButton());
      });
      expect(writeText).toHaveBeenCalledTimes(1);
      const link = (writeText.mock.calls[0] as unknown as [string])[0];
      expect(decodeLink(link)).toEqual(previewBuild(st()));
      expect(screen.getByRole('button', { name: copy.actions.linkCopied })).toBeTruthy();
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
      Reflect.deleteProperty(window, 'isSecureContext');
    }
  });

  it('with a paste and Mine on, the link carries no Mine text and is the same link as without Mine', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    const plain = await tapCopyLink(user);

    store((s) => s.setPasted(MINE));
    store((s) => s.setMineOn(true));
    expect(st().mineOn).toBe(true);
    // Mine really is in the certificate now, so the link below is a fair test.
    const model = certificateModelOf(st());
    if ('error' in model) throw new Error(model.error);
    expect(JSON.stringify(model.steps)).toContain(MINE);

    const withMine = await tapCopyLink(user);
    expect(withMine).toBe(plain);
    expect(payloadText(withMine)).not.toContain(MINE);
    expect(payloadText(withMine)).not.toContain('Mine');
    expect(decodeLink(withMine)).toEqual(previewBuild(st()));
  });

  it('with a paste and Mine off, the pasted text is not in the link either', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    store((s) => s.setPasted(`${MINE}\nSecond pasted line that is only here.`));
    const link = await tapCopyLink(user);
    expect(payloadText(link)).not.toContain(MINE);
    expect(payloadText(link)).not.toContain('Second pasted line');
  });

  it('does not touch the address bar, history or storage (W7)', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    await tapCopyLink(user);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expectCleanAddress('after Copy link');
    expectNothingStored('after Copy link');
  });

  it('a starter opened with Use (from roster) copies the same kind of link', async () => {
    const user = userEvent.setup();
    store((s) => s.setTarget('openclaw'));
    store((s) => s.useStarter('marty'));
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('roster');
    const decoded = decodeLink(await tapCopyLink(user));
    expect(decoded).toEqual(previewBuild(st()));
    expect(decoded.target).toBe('openclaw');
    expect(decoded.name).toBe('Marty');
  });
});

// ============================================================================
// Share (W7, plan section 5)
// ============================================================================

describe('Share', () => {
  it('is absent where navigator.share does not exist', () => {
    expect('share' in navigator).toBe(false);
    open(golden('june.muse'));
    expect(screen.queryByRole('button', { name: copy.actions.share })).toBeNull();
    // Copy link is still there.
    expect(copyLinkButton()).toBeTruthy();
  });

  it('is absent when navigator.share is not a function', () => {
    Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: 'yes' });
    open(golden('june.muse'));
    expect(screen.queryByRole('button', { name: copy.actions.share })).toBeNull();
  });

  it.each(ALL_CONFIGS)('is shown on the $name certificate when navigator.share exists', ({ build }) => {
    stubShare();
    open(build());
    expect(shareButton().tagName).toBe('BUTTON');
  });

  it('calls navigator.share inside the tap, before any await, with the title, the build name and the url', () => {
    // A promise that never settles: if the call had waited for anything, the count below would be 0.
    const share = stubShare(() => new Promise<void>(() => undefined));
    const build = golden('june.muse');
    open(build);
    expect(share).not.toHaveBeenCalled();

    fireEvent.click(shareButton());

    // Synchronously after the click event, with nothing awaited in between.
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0]![0] as ShareData;
    expect(Object.keys(data).sort()).toEqual(['text', 'title', 'url']);
    expect(data.title).toBe('Meet June');
    expect(data.text).toBe(rosterEntry('june').buildName);
    expect(typeof data.url).toBe('string');
    expect(decodeLink(data.url as string)).toEqual(previewBuild(st()));
    expect((data.url as string).startsWith(`${origin()}${pathname()}#b=`)).toBe(true);
  });

  it('shares the build name shown on the certificate for a build that is not a starter', () => {
    const share = stubShare(() => new Promise<void>(() => undefined));
    const june = golden('june.muse');
    // Blunt up and funny down: not June's picks any more, so the name is the compiler's, not the roster's.
    const custom: Build = { ...june, name: 'Zephyr', stats: { ...june.stats, blunt: 4, funny: 1 } };
    open(custom);
    const shownName = textOf(main().querySelector('header p') as Element);
    expect(shownName.length).toBeGreaterThan(0);
    fireEvent.click(shareButton());
    const data = share.mock.calls[0]![0] as ShareData;
    expect(data.title).toBe('Meet Zephyr');
    expect(data.text).toBe(shownName);
    expect(data.text).toBe(compile(previewBuild(st())).buildName);
    expect(decodeLink(data.url as string)).toEqual(previewBuild(st()));
  });

  it('uses the name on the certificate for the title, after a rename', () => {
    const share = stubShare(() => new Promise<void>(() => undefined));
    open({ ...golden('june.muse'), name: 'Zephyr' });
    fireEvent.click(shareButton());
    const data = share.mock.calls[0]![0] as ShareData;
    expect(data.title).toBe('Meet Zephyr');
  });

  it('shares the same url Copy link copies', async () => {
    const user = userEvent.setup();
    const share = stubShare(() => new Promise<void>(() => undefined));
    open(golden('marty.grok'));
    const link = await tapCopyLink(user);
    fireEvent.click(shareButton());
    expect((share.mock.calls[0]![0] as ShareData).url).toBe(link);
  });

  it('with a paste and Mine on, the shared url carries no Mine text', () => {
    const share = stubShare(() => new Promise<void>(() => undefined));
    open(golden('june.muse'));
    store((s) => s.setPasted(MINE));
    store((s) => s.setMineOn(true));
    fireEvent.click(shareButton());
    const url = (share.mock.calls[0]![0] as ShareData).url as string;
    expect(payloadText(url)).not.toContain(MINE);
    expect(decodeLink(url)).toEqual(previewBuild(st()));
  });

  it('shows nothing when the share resolves', async () => {
    const share = stubShare(() => Promise.resolve());
    open(golden('june.muse'));
    await act(async () => {
      fireEvent.click(shareButton());
    });
    expect(share).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(copy.actions.shareFailed)).toBeNull();
  });

  describe('a dismissed share sheet', () => {
    it('shows no error for a DOMException named AbortError', async () => {
      const share = stubShare(() => Promise.reject(new DOMException('Share canceled', 'AbortError')));
      open(golden('june.muse'));
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(share).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(copy.actions.shareFailed)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows no error for any rejection whose name is AbortError', async () => {
      stubShare(() => Promise.reject(Object.assign(new Error('dismissed'), { name: 'AbortError' })));
      open(golden('june.muse'));
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(screen.queryByText(copy.actions.shareFailed)).toBeNull();
    });

    it('shows no error for an AbortError thrown synchronously', async () => {
      stubShare(() => {
        throw new DOMException('Share canceled', 'AbortError');
      });
      open(golden('june.muse'));
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(screen.queryByText(copy.actions.shareFailed)).toBeNull();
    });
  });

  describe('a share that fails', () => {
    it.each([
      ['a NotAllowedError', () => new DOMException('not allowed', 'NotAllowedError')],
      ['a TypeError', () => new TypeError('bad data')],
      ['a plain Error', () => new Error('boom')],
      ['a rejection that is not an Error', () => 'nope'],
    ])('shows the failure line for %s', async (_name, make) => {
      stubShare(() => Promise.reject(make()));
      open(golden('june.muse'));
      await act(async () => {
        fireEvent.click(shareButton());
      });
      const line = screen.getByText(copy.actions.shareFailed);
      expect(line.getAttribute('role')).toBe('alert');
    });

    it('shows the failure line for an error thrown synchronously', async () => {
      stubShare(() => {
        throw new TypeError('not a function');
      });
      open(golden('june.muse'));
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(screen.getByText(copy.actions.shareFailed)).toBeTruthy();
    });

    it('the failure line points at Copy link, and Copy link still works', async () => {
      const user = userEvent.setup();
      stubShare(() => Promise.reject(new DOMException('not allowed', 'NotAllowedError')));
      open(golden('june.muse'));
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(screen.getByText(copy.actions.shareFailed).textContent).toContain(copy.actions.copyLink);
      const link = await tapCopyLink(user);
      expect(decodeLink(link)).toEqual(previewBuild(st()));
    });

    it('the next tap clears the line while it runs, and a new failure brings it back', async () => {
      let calls = 0;
      const share = stubShare(() => {
        calls += 1;
        if (calls === 2) return new Promise<void>(() => undefined);
        return Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
      });
      open(golden('june.muse'));

      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(screen.queryByText(copy.actions.shareFailed)).not.toBeNull();

      // Second tap: the share is pending, and the old line is gone at once.
      fireEvent.click(shareButton());
      expect(share).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(copy.actions.shareFailed)).toBeNull();

      // Third tap fails again and the line returns.
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(share).toHaveBeenCalledTimes(3);
      expect(screen.queryByText(copy.actions.shareFailed)).not.toBeNull();
    });

    it('a dismissed sheet after a failure clears the line and does not bring it back', async () => {
      let calls = 0;
      stubShare(() => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new DOMException('not allowed', 'NotAllowedError'))
          : Promise.reject(new DOMException('dismissed', 'AbortError'));
      });
      open(golden('june.muse'));
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(screen.queryByText(copy.actions.shareFailed)).not.toBeNull();
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(screen.queryByText(copy.actions.shareFailed)).toBeNull();
    });

    it('a share that succeeds after a failure clears the line', async () => {
      let calls = 0;
      stubShare(() => {
        calls += 1;
        return calls === 1 ? Promise.reject(new TypeError('x')) : Promise.resolve();
      });
      open(golden('june.muse'));
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(screen.queryByText(copy.actions.shareFailed)).not.toBeNull();
      await act(async () => {
        fireEvent.click(shareButton());
      });
      expect(screen.queryByText(copy.actions.shareFailed)).toBeNull();
    });
  });

  it('a late failure after the screen is left does not throw or warn', async () => {
    let reject: (e: unknown) => void = () => undefined;
    stubShare(
      () =>
        new Promise<void>((_resolve, rej) => {
          reject = rej;
        }),
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    open(golden('june.muse'));
    fireEvent.click(shareButton());
    // Tap Remix: the certificate unmounts while the share is still pending.
    fireEvent.click(remixButton());
    expect(shown()).toBe('remix');
    await act(async () => {
      reject(new DOMException('not allowed', 'NotAllowedError'));
    });
    expect(shown()).toBe('remix');
    expect(screen.queryByText(copy.actions.shareFailed)).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not touch the address bar, history or storage', async () => {
    stubShare(() => Promise.resolve());
    open(golden('june.muse'));
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    await act(async () => {
      fireEvent.click(shareButton());
    });
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expectCleanAddress('after Share');
    expectNothingStored('after Share');
  });
});

// ============================================================================
// Download zip (W13, plan section 7)
// ============================================================================

describe('Download zip', () => {
  // The files of a build's bundle that are delivered as files, from the compile.
  const fileDeliveries = (build: Build) => compile(build).files.filter((f) => f.delivery === 'file');

  it.each([
    ['openclaw', () => golden('marty.openclaw')],
    ['hermes', () => golden('marty.hermes')],
  ])('shows on %s', (_name, make) => {
    open(make());
    expect(zipButton().tagName).toBe('BUTTON');
  });

  it.each([
    ['muse', () => golden('marty.muse')],
    ['chatgpt dot', () => golden('marty.chatgpt-dot')],
  ])('does not show on %s', (_name, make) => {
    open(make());
    expect(screen.queryByRole('button', { name: copy.actions.downloadZip })).toBeNull();
  });

  it.each(ALL_CONFIGS)('$name: shows exactly when the bundle has a file delivery', ({ build }) => {
    const b = build();
    open(b);
    const has = fileDeliveries(b).length > 0;
    expect(screen.queryByRole('button', { name: copy.actions.downloadZip }) !== null).toBe(has);
  });

  it('the model has a zip on the same targets that show the button', () => {
    for (const cfg of ALL_CONFIGS) {
      st().reset();
      act(() => st().loadBuild(cfg.build(), { from: 'link' }));
      const model = certificateModelOf(st());
      if ('error' in model) throw new Error(model.error);
      expect(model.zip !== undefined, cfg.name).toBe(fileDeliveries(cfg.build()).length > 0);
    }
  });

  async function tapZip(build: Build): Promise<{ dl: DownloadRig; bytes: Uint8Array; entries: UnzippedEntry[] }> {
    const dl = stubDownload();
    open(build);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(zipButton());
    expect(dl.blobs, 'one Blob handed to the browser').toHaveLength(1);
    const bytes = await bytesOfBlob(dl.blobs[0]!);
    return { dl, bytes, entries: unzip(bytes) };
  }

  it.each([
    ['openclaw', 'marty.openclaw', 'marty-openclaw.zip'],
    ['hermes', 'marty.hermes', 'marty-hermes.zip'],
    ['openclaw with roles', 'marty.openclaw.roles', 'marty-openclaw.zip'],
    ['hermes with roles', 'rook.hermes.roles', 'rook-hermes.zip'],
  ])('%s: the downloaded Blob unzips to the model zip files, byte for byte', async (_name, goldenId, filename) => {
    const build = golden(goldenId);
    const { dl, entries } = await tapZip(build);
    const model = certificateModelOf(st());
    if ('error' in model) throw new Error(model.error);
    const zip = model.zip;
    if (zip === undefined) throw new Error('no zip in the model');

    // The Blob is a zip, named for the build and profile (plan section 7), clicked once.
    expect(dl.blobs[0]!.type).toBe('application/zip');
    expect(zip.filename).toBe(filename);
    expect(dl.clicks).toEqual([{ href: dl.urls[0], download: filename }]);

    // Every entry equals the model's file, in order, with a valid stored CRC.
    expect(entries.map((e) => e.name)).toEqual(zip.files.map((f) => f.path));
    entries.forEach((entry, i) => {
      const expected = encoder.encode(zip.files[i]!.content);
      expect(entry.method, `${entry.name} is stored`).toBe(0);
      expect(sameBytes(entry.data, expected), `bytes of ${entry.name}`).toBe(true);
      expect(entry.crc, `crc of ${entry.name}`).toBe(crc32Reference(expected));
    });

    // And the entries are the compile's file deliveries at their bundle paths.
    const compiledFiles = fileDeliveries(build);
    expect(entries.map((e) => e.name)).toEqual(compiledFiles.map((f) => f.path));
    entries.forEach((entry, i) => {
      expect(sameBytes(entry.data, encoder.encode(compiledFiles[i]!.content)), entry.name).toBe(true);
    });
  });

  it('the zip holds no paste-delivered text (spoken items and paste blocks stay out)', async () => {
    const build = golden('marty.openclaw');
    const { entries } = await tapZip(build);
    const result = compile(build);
    const pasted = result.files.filter((f) => f.delivery === 'paste').map((f) => f.path);
    for (const path of pasted) expect(entries.map((e) => e.name)).not.toContain(path);
    for (const spoken of result.spoken) {
      const bytes = encoder.encode(spoken.text);
      expect(entries.some((e) => sameBytes(e.data, bytes))).toBe(false);
    }
  });

  it('revokes the object URL it made, once, after the click', async () => {
    const { dl } = await tapZip(golden('marty.openclaw'));
    expect(dl.urls).toHaveLength(1);
    // Not in the same tick: some mobile browsers start the download late.
    expect(dl.revoked).toEqual([]);
    vi.runAllTimers();
    expect(dl.revoked).toEqual([dl.urls[0]]);
    vi.advanceTimersByTime(60_000);
    expect(dl.revoked).toHaveLength(1);
  });

  it('a second tap makes a second download and revokes both URLs', async () => {
    const dl = stubDownload();
    open(golden('marty.openclaw'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(zipButton());
    fireEvent.click(zipButton());
    expect(dl.blobs).toHaveLength(2);
    expect(new Set(dl.urls).size).toBe(2);
    vi.runAllTimers();
    expect([...dl.revoked].sort()).toEqual([...dl.urls].sort());
    const [a, b] = await Promise.all(dl.blobs.map((blob) => bytesOfBlob(blob)));
    // Deterministic bytes: the same build gives the same zip.
    expect(sameBytes(a!, b!)).toBe(true);
  });

  it('with Mine on, the zip holds the personality file with Mine in it, and the other files unchanged', async () => {
    const dl = stubDownload();
    const build = golden('marty.openclaw');
    open(build);
    store((s) => s.setPasted(MINE));
    store((s) => s.setMineOn(true));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(zipButton());
    const entries = unzip(await bytesOfBlob(dl.blobs[0]!));

    const model = certificateModelOf(st());
    if ('error' in model) throw new Error(model.error);
    const zip = model.zip;
    if (zip === undefined) throw new Error('no zip in the model');
    expect(entries.map((e) => e.name)).toEqual(zip.files.map((f) => f.path));
    entries.forEach((entry, i) => {
      expect(sameBytes(entry.data, encoder.encode(zip.files[i]!.content)), entry.name).toBe(true);
    });

    const plain = compile(build).files.filter((f) => f.delivery === 'file');
    const personality = plain.find((f) => f.kind === 'personality');
    if (!personality) throw new Error('no personality file');
    for (const file of plain) {
      const entry = entries.find((e) => e.name === file.path);
      if (!entry) throw new Error(`zip lacks ${file.path}`);
      const text = decoder.decode(entry.data);
      if (file.path === personality.path) {
        expect(text).toContain('## Mine');
        expect(text).toContain(MINE);
      } else {
        expect(text, `${file.path} is unchanged by Mine`).toBe(file.content);
      }
    }
  });

  it('with Mine off and a paste, the zip has no Mine text', async () => {
    const dl = stubDownload();
    open(golden('marty.openclaw'));
    store((s) => s.setPasted(MINE));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(zipButton());
    const entries = unzip(await bytesOfBlob(dl.blobs[0]!));
    for (const entry of entries) expect(decoder.decode(entry.data)).not.toContain(MINE);
  });

  it('does not touch the address bar, history or storage', async () => {
    const dl = stubDownload();
    open(golden('marty.openclaw'));
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(zipButton());
    expect(dl.blobs).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expectCleanAddress('after Download zip');
    expectNothingStored('after Download zip');
  });
});

// ============================================================================
// Remix (plan section 3, W11, W36, B12)
// ============================================================================

describe('Remix', () => {
  it('is a button labelled Remix on every certificate', () => {
    for (const cfg of ALL_CONFIGS) {
      st().reset();
      cleanup();
      open(cfg.build());
      expect(remixButton().tagName, cfg.name).toBe('BUTTON');
    }
  });

  it('opens the remix screen with an empty paste box, and clears an old paste and Mine switch', () => {
    const build = golden('june.openclaw');
    open(build);
    store((s) => s.setPasted('An old pasted line.'));
    store((s) => s.setMineOn(true));
    expect(st().pasted).not.toBe('');

    fireEvent.click(remixButton());

    expect(shown()).toBe('remix');
    expect(textOf(h1())).toBe(copy.screens.remix.title);
    const box = screen.getByRole('textbox', {
      name: 'Paste your current personality to keep your edits.',
    }) as HTMLTextAreaElement;
    expect(box.value).toBe('');
    expect(st().pasted).toBe('');
    expect(st().mineOn).toBe(false);
    // The certificate's build becomes the Mine baseline.
    expect(st().baseline).toEqual(previewBuild(st()));
    expect(st().from).toBe('link-remix');
  });

  it('shows the B12 warning with the short name of the target being remixed', () => {
    open(golden('june.openclaw'));
    fireEvent.click(remixButton());
    expect(screen.getByRole('note').textContent).toBe(
      "This rebuilds from your picks. Changes you made inside OpenClaw won't carry over.",
    );
  });

  it('on a ChatGPT certificate the warning says ChatGPT', () => {
    open(golden('june.chatgpt-dot'));
    fireEvent.click(remixButton());
    expect(screen.getByRole('note').textContent).toBe(
      "This rebuilds from your picks. Changes you made inside ChatGPT won't carry over.",
    );
  });

  it('Back on the remix screen returns to the certificate with the same build', () => {
    const build = golden('june.hermes');
    open(build);
    const before = textOf(main());
    const draft = structuredClone(st().draft);
    fireEvent.click(remixButton());
    expect(shown()).toBe('remix');

    fireEvent.click(screen.getByRole('button', { name: copy.buttons.back }));

    expect(shown()).toBe('certificate');
    expect(textOf(h1())).toBe('Meet June');
    expect(st().draft).toEqual(draft);
    expect(textOf(main())).toBe(before);
    // The actions are back.
    expect(copyLinkButton()).toBeTruthy();
    expect(remixButton()).toBeTruthy();
  });

  // startRemix sets from to 'link-remix' and remembers the old one; Back on the remix screen puts it back.
  // So backing out of a Remix leaves the certificate's own Back where it was: hidden on a link certificate
  // (W7 and plan section 3), and a roster Use certificate goes back to the roster.
  it('after Remix then Back, a link certificate still has no Back button', () => {
    open(golden('june.openclaw'));
    expect(screen.queryByRole('button', { name: copy.buttons.back })).toBeNull();
    fireEvent.click(remixButton());
    fireEvent.click(screen.getByRole('button', { name: copy.buttons.back }));
    expect(shown()).toBe('certificate');
    expect(screen.queryByRole('button', { name: copy.buttons.back })).toBeNull();
  });

  it('after Remix then Back, a starter certificate (Use) still goes Back to the roster', () => {
    store((s) => s.setTarget('openclaw'));
    store((s) => s.useStarter('june'));
    render(<App />);
    expect(st().from).toBe('roster');
    fireEvent.click(remixButton());
    fireEvent.click(screen.getByRole('button', { name: copy.buttons.back }));
    expect(shown()).toBe('certificate');
    fireEvent.click(screen.getByRole('button', { name: copy.buttons.back }));
    expect(shown()).toBe('roster');
  });

  it('Continue on the remix screen goes to the base station', () => {
    open(golden('june.hermes'));
    fireEvent.click(remixButton());
    fireEvent.click(screen.getByRole('button', { name: copy.buttons.next }));
    expect(shown()).toBe('base');
  });

  it('does not touch the address bar or storage', () => {
    open(golden('june.hermes'));
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(remixButton());
    expect(replace).not.toHaveBeenCalled();
    expectCleanAddress('after Remix');
    expectNothingStored('after Remix');
  });
});

// ============================================================================
// Make this for <target> instead (W10, B12, plan section 5)
// ============================================================================

describe('Make this for <target> instead', () => {
  const expectedFor = (current: TargetId): string[] =>
    CARD_ORDER.filter((id) => id !== current).map((id) => makeFor(id));

  it('the library has five targets and none of them is gpt', () => {
    expect(CARD_ORDER).toEqual(['muse', 'openclaw', 'hermes', 'grok', 'chatgpt']);
  });

  it.each(CONFIGS)('$name: offers the four other targets, in card order, with the B12 short names', ({ build, target }) => {
    open(build());
    expect(makeNames()).toHaveLength(4);
    expect(makeNames()).toEqual(expectedFor(target));
  });

  it.each(ALL_CONFIGS)('$name: never offers a button for gpt', ({ build }) => {
    open(build());
    for (const name of makeNames()) {
      // The only name with "gpt" in it is ChatGPT.
      if (/gpt/i.test(name)) expect(name).toBe(makeFor('chatgpt'));
      expect(name).not.toMatch(/custom gpt/i);
    }
    expect(screen.queryByRole('button', { name: /custom gpt/i })).toBeNull();
  });

  it('a ChatGPT certificate does not offer ChatGPT', () => {
    open(golden('marty.chatgpt-project'));
    expect(makeNames()).not.toContain(makeFor('chatgpt'));
  });

  it('a Custom GPT certificate offers all five, ChatGPT in its card place', () => {
    open(GPT.build());
    expect(makeNames()).toEqual(CARD_ORDER.map((id) => makeFor(id)));
    expect(makeNames()).toHaveLength(5);
  });

  it('on a Custom GPT certificate, ChatGPT lands on dot, and ChatGPT drops out of the list', () => {
    open(GPT.build());
    expect(st().mode).toBe('gpt');
    fireEvent.click(screen.getByRole('button', { name: makeFor('chatgpt') }));

    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe('dot');
    expect(st().plan).toBeUndefined();
    expect(shown()).toBe('certificate');
    expect(makeNames()).toEqual(expectedFor('chatgpt'));
    expect(screen.queryByRole('button', { name: makeFor('chatgpt') })).toBeNull();
    expectStepsOf('chatgpt-dot', 'gpt to ChatGPT');
  });

  it('the Custom GPT retirement summary is gone after it lands on dot', () => {
    // The retirement line is a library record: the chatgpt card's gpt mode, `deprecated.line`.
    const retirement = library.targets.targets
      .find((t) => t.id === 'chatgpt')
      ?.modes?.find((m) => m.id === 'gpt')?.deprecated?.line;
    expect(retirement, 'the library has a retirement line on the chatgpt gpt mode').toBeTruthy();
    const line = retirement as string;

    open(GPT.build());
    // Before the switch the deprecated summary item shows that line, once, as an item of the summary.
    const shownBefore = screen.getAllByText(line);
    expect(shownBefore).toHaveLength(1);
    const summaryItem = shownBefore[0]!.closest('li');
    expect(summaryItem, 'the retirement line is a summary list item').not.toBeNull();
    expect(summaryItem!.closest('section'), 'the summary item sits in the summary box').not.toBeNull();
    expect(textOf(main())).toContain(line);

    const before = textOf(main());
    fireEvent.click(screen.getByRole('button', { name: makeFor('chatgpt') }));
    // After landing on dot the retirement line is nowhere on the page, in the summary or elsewhere.
    expect(screen.queryAllByText(line)).toHaveLength(0);
    expect(textOf(main())).not.toContain(line);
    expect(textOf(main())).not.toBe(before);
    // The gpt-only steps are not on the dot certificate.
    const gptOnly = profileById('chatgpt-gpt')
      .installSteps.map((s) => s.line)
      .filter((line) => !profileById('chatgpt-dot').installSteps.some((s) => s.line === line));
    expect(gptOnly.length).toBeGreaterThan(0);
    for (const line of gptOnly) expect(stepTexts()).not.toContain(line);
  });

  // The numbered steps of a certificate are exactly the profile's lines: every shown step is one of
  // the profile's lines, and every line with no `when` is shown, in library order.
  function expectStepsOf(profileId: ProfileId, ctx: string): void {
    const profile = profileById(profileId);
    const lines = profile.installSteps.filter((s) => !s.closer).map((s) => s.line);
    const shownSteps = stepTexts();
    for (const text of shownSteps) expect(lines, `${ctx}: step "${text}" belongs to ${profileId}`).toContain(text);

    let at = -1;
    for (const step of profile.installSteps.filter((s) => !s.closer && s.when === undefined)) {
      const i = shownSteps.indexOf(step.line, at + 1);
      expect(i, `${ctx}: ${profileId} step "${step.line}" is shown, in order`).toBeGreaterThan(at);
      at = i;
    }
    // The closer, where the profile has one, is shown; one the profile lacks is not.
    for (const other of library.targets.profiles) {
      for (const step of other.installSteps.filter((s) => s.closer)) {
        const wanted = profile.installSteps.some((s) => s.closer && s.line === step.line);
        expect(screen.queryAllByText(step.line).length > 0, `${ctx}: closer of ${other.id}`).toBe(wanted);
      }
    }
  }

  describe('a switch keeps the draft and shows the new target', () => {
    const cases = ALL_CONFIGS.flatMap((cfg) =>
      CARD_ORDER.filter((to) => to !== cfg.target || (cfg.mode === 'gpt' && to === 'chatgpt')).map(
        (to) => ({ name: cfg.name, cfg, to }),
      ),
    );

    it.each(cases)('$name to $to', ({ cfg, to }) => {
      const build = cfg.build();
      open(build);
      const draft = structuredClone(st().draft);
      const touched = structuredClone(st().touched);
      const { from, advancedRoles, skipped, pasted, mineOn } = st();
      const startProfile = profileIdOf(cfg.target, cfg.mode);
      expectStepsOf(startProfile, 'before');

      fireEvent.click(screen.getByRole('button', { name: makeFor(to) }));

      // The draft is deep-equal to before. Nothing else in the build changed either.
      expect(st().draft).toEqual(draft);
      expect(st().touched).toEqual(touched);
      expect({ from, advancedRoles, skipped, pasted, mineOn }).toEqual({
        from: st().from,
        advancedRoles: st().advancedRoles,
        skipped: st().skipped,
        pasted: st().pasted,
        mineOn: st().mineOn,
      });

      // Mode and plan: only ChatGPT has them. With no earlier ChatGPT mode it opens on dot, and a
      // Custom GPT is never a place to switch to (it reads as dot).
      expect(st().target).toBe(to);
      expect(st().mode).toBe(to === 'chatgpt' ? 'dot' : undefined);
      expect(st().plan).toBeUndefined();

      // The certificate stays on its screen, with the same name, and now shows the new target's steps.
      expect(shown()).toBe('certificate');
      expect(textOf(h1())).toBe('Meet Marty');
      expectStepsOf(profileIdOf(to, to === 'chatgpt' ? 'dot' : undefined), `${cfg.name} to ${to}`);

      // The buttons follow: the tapped target is gone and the one left behind is offered again.
      expect(makeNames()).toEqual(expectedFor(to));
    });
  });

  describe('a switch and a switch back', () => {
    // Switching back from a Custom GPT start returns to ChatGPT on dot, as the hidden mode reads as dot.
    const cases = ALL_CONFIGS.flatMap((cfg) =>
      CARD_ORDER.filter((to) => to !== cfg.target).map((to) => ({ name: cfg.name, cfg, to })),
    );

    it.each(cases)('$name to $to and back restores the draft, mode, plan and the certificate text', ({ cfg, to }) => {
      open(cfg.build());
      const draft = structuredClone(st().draft);
      const text = textOf(main());
      const back = { mode: cfg.mode === 'gpt' ? 'dot' : cfg.mode, plan: cfg.plan };

      fireEvent.click(screen.getByRole('button', { name: makeFor(to) }));
      expect(textOf(main())).not.toBe(text);
      fireEvent.click(screen.getByRole('button', { name: makeFor(cfg.target) }));

      expect(st().target).toBe(cfg.target);
      expect(st().mode).toBe(cfg.target === 'chatgpt' ? back.mode : undefined);
      expect(st().plan).toBe(cfg.target === 'chatgpt' ? back.plan : undefined);
      expect(st().draft).toEqual(draft);
      // The first certificate's text, exactly. A Custom GPT start returns as dot, so its text differs.
      if (cfg.mode !== 'gpt') expect(textOf(main())).toBe(text);
      expectStepsOf(profileIdOf(cfg.target, back.mode), `${cfg.name} back`);
    });
  });

  it('ChatGPT remembers its mode and plan across hops (instructions on paid)', () => {
    const cfg = CONFIGS.find((c) => c.name === 'chatgpt instructions paid') as Cfg;
    open(cfg.build());
    const draft = structuredClone(st().draft);
    const text = textOf(main());

    fireEvent.click(screen.getByRole('button', { name: makeFor('openclaw') }));
    expect(st().mode).toBeUndefined();
    expect(st().plan).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: makeFor('muse') }));
    expect(st().target).toBe('muse');
    fireEvent.click(screen.getByRole('button', { name: makeFor('chatgpt') }));

    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe('instructions');
    expect(st().plan).toBe('paid');
    expect(st().draft).toEqual(draft);
    expect(textOf(main())).toBe(text);
  });

  it('ChatGPT remembers the project mode too', () => {
    const cfg = CONFIGS.find((c) => c.name === 'chatgpt project') as Cfg;
    open(cfg.build());
    const text = textOf(main());
    fireEvent.click(screen.getByRole('button', { name: makeFor('grok') }));
    fireEvent.click(screen.getByRole('button', { name: makeFor('chatgpt') }));
    expect(st().mode).toBe('project');
    expect(textOf(main())).toBe(text);
  });

  it('a switch with roles on keeps the role team and the packs that fit it', () => {
    const build = golden('marty.openclaw.roles');
    open(build);
    const draft = structuredClone(st().draft);
    expect(draft.roles).toEqual(['scout', 'risk-manager', 'journal']);
    fireEvent.click(screen.getByRole('button', { name: makeFor('hermes') }));
    expect(st().draft).toEqual(draft);
    fireEvent.click(screen.getByRole('button', { name: makeFor('openclaw') }));
    expect(st().draft).toEqual(draft);
  });

  it('the link after a switch carries the new target and the same picks', async () => {
    const user = userEvent.setup();
    const build = golden('marty.openclaw');
    open(build);
    fireEvent.click(screen.getByRole('button', { name: makeFor('hermes') }));
    const decoded = decodeLink(await tapCopyLink(user));
    expect(decoded.target).toBe('hermes');
    expect(decoded).toEqual(previewBuild(st()));
    expect({ ...decoded, target: build.target }).toEqual(build);
  });

  it('keeps the Mine paste and switch through a switch, and they never reach the link', async () => {
    const user = userEvent.setup();
    open(golden('marty.openclaw'));
    store((s) => s.setPasted(MINE));
    store((s) => s.setMineOn(true));
    fireEvent.click(screen.getByRole('button', { name: makeFor('hermes') }));
    expect(st().pasted).toBe(MINE);
    expect(st().mineOn).toBe(true);
    const link = await tapCopyLink(user);
    expect(payloadText(link)).not.toContain(MINE);
  });

  it('moves focus to the heading and scrolls to the top after a switch, even when the tapped button is gone', async () => {
    const user = userEvent.setup();
    open(GPT.build());
    const scroll = window.scrollTo as unknown as MockInstance;
    scroll.mockClear();

    // This tap removes the very button that has focus (ChatGPT drops out of the list).
    await user.click(screen.getByRole('button', { name: makeFor('chatgpt') }));

    expect(scroll).toHaveBeenCalledWith(0, 0);
    expect(document.activeElement).toBe(h1());
  });

  it('moves focus to the heading after an ordinary switch too, and again on the next one', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    scrollSpy().mockClear();
    await user.click(screen.getByRole('button', { name: makeFor('openclaw') }));
    expect(document.activeElement).toBe(h1());
    expect(scrollSpy()).toHaveBeenCalledWith(0, 0);

    await user.click(screen.getByRole('button', { name: makeFor('hermes') }));
    expect(document.activeElement).toBe(h1());
  });

  it('does not move focus or scroll when nothing is switched', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    scrollSpy().mockClear();
    await user.click(copyLinkButton());
    expect(scrollSpy()).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(h1());
  });

  it('does not touch the address bar, history or storage', () => {
    open(golden('june.muse'));
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    fireEvent.click(screen.getByRole('button', { name: makeFor('openclaw') }));
    fireEvent.click(screen.getByRole('button', { name: makeFor('muse') }));
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expectCleanAddress('after a switch');
    expectNothingStored('after a switch');
  });

  function scrollSpy(): MockInstance {
    return window.scrollTo as unknown as MockInstance;
  }
});

// ============================================================================
// Preview strip with Mine (plan section 6, slice 4.13 scope)
// ============================================================================

describe('Preview strip meter with Mine', () => {
  const strip = () => screen.getByRole('region', { name: copy.preview.title });

  // The strip's length: the number before the slash in its "n/cap characters" text.
  function stripLength(): number {
    const match = /(\d+)\/(\d+) characters/.exec(textOf(strip()));
    if (!match) throw new Error(`no length in the strip: ${textOf(strip())}`);
    return Number(match[1]);
  }

  const certificateMeter = () => Number(screen.getByRole('meter').getAttribute('aria-valuenow'));

  // The certificate's own meter, with Mine as the model measures it.
  function lengths(build: Build): { off: number; on: number } {
    open(build);
    store((s) => s.setPasted(MINE));
    const off = certificateMeter();
    store((s) => s.setMineOn(true));
    const on = certificateMeter();
    store((s) => s.setMineOn(false));
    return { off, on };
  }

  it('grows by the Mine text when Mine is on, and falls back when it is off again', () => {
    const { off, on } = lengths(golden('june.muse'));
    // The Mine line and its heading are in the personality, so it is longer by at least their text.
    expect(on - off).toBeGreaterThanOrEqual(MINE.length + '## Mine'.length);

    store((s) => s.go('stats'));
    expect(shown()).toBe('stats');
    expect(stripLength()).toBe(off);

    store((s) => s.setMineOn(true));
    expect(stripLength()).toBe(on);
    expect(textOf(strip())).toContain(copy.preview.length(on, capOf(st())));

    store((s) => s.setMineOn(false));
    expect(stripLength()).toBe(off);
  });

  it.each(ALL_CONFIGS)('$name: the strip counts Mine the way the certificate meter does', ({ build }) => {
    const { off, on } = lengths(build());
    expect(on).toBeGreaterThan(off);
    store((s) => s.go('stats'));
    expect(stripLength(), 'Mine off').toBe(off);
    store((s) => s.setMineOn(true));
    expect(stripLength(), 'Mine on').toBe(on);
    store((s) => s.setMineOn(false));
    expect(stripLength(), 'Mine off again').toBe(off);
  });

  it('shows the Mine lines in the open sheet when Mine is on, and not when it is off', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    store((s) => s.setPasted(MINE));
    store((s) => s.setMineOn(true));
    store((s) => s.go('stats'));

    await user.click(within(strip()).getByRole('button', { expanded: false }));
    const dialog = screen.getByRole('dialog', { name: copy.preview.title });
    expect(textOf(dialog)).toContain(MINE);
    expect(textOf(dialog)).toContain('## Mine');
    await user.keyboard('{Escape}');

    store((s) => s.setMineOn(false));
    await user.click(within(strip()).getByRole('button', { expanded: false }));
    const again = screen.getByRole('dialog', { name: copy.preview.title });
    expect(textOf(again)).not.toContain(MINE);
    expect(textOf(again)).not.toContain('## Mine');
  });

  it('is unchanged by Mine on when nothing is pasted', () => {
    open(golden('june.muse'));
    const off = certificateMeter();
    store((s) => s.setMineOn(true));
    store((s) => s.go('stats'));
    expect(stripLength()).toBe(off);
  });

  it('is unchanged by Mine on when the paste holds only lines the build already has', () => {
    const build = golden('june.muse');
    open(build);
    const off = certificateMeter();
    store((s) => s.setPasted(compile(build).soul));
    store((s) => s.setMineOn(true));
    store((s) => s.go('stats'));
    expect(stripLength()).toBe(off);
  });

  it('is unchanged by a paste with Mine off', () => {
    open(golden('june.muse'));
    const off = certificateMeter();
    store((s) => s.setPasted(MINE));
    store((s) => s.go('stats'));
    expect(stripLength()).toBe(off);
  });

  it('shows the over state when Mine pushes the build past the cap', () => {
    // Free Custom instructions have the smallest cap, so a few long lines go over it.
    open(golden('june.chatgpt-instructions-free'));
    const cap = capOf(st());
    const lines = Array.from({ length: 30 }, (_, i) => `Mine line ${i + 1}: ${'x'.repeat(60)}`);
    store((s) => s.setPasted(lines.join('\n')));
    store((s) => s.setMineOn(true));
    store((s) => s.go('stats'));
    expect(stripLength()).toBeGreaterThan(cap);
    expect(textOf(strip())).toContain(copy.preview.over(stripLength() - cap));
  });
});

// ============================================================================
// Layout at 375px (read from class names: jsdom has no layout)
// ============================================================================

describe('layout and rules', () => {
  const ONE_44 = /min-h-\[(4[4-9]|[5-9]\d)px\]/;
  const CLIPS = /\b(truncate|whitespace-nowrap|overflow-hidden|text-ellipsis|line-clamp-\d)\b/;

  function actionButtons(): HTMLElement[] {
    const stubbed = [copyLinkButton(), remixButton(), ...makeButtons()];
    const share = screen.queryByRole('button', { name: copy.actions.share });
    const zip = screen.queryByRole('button', { name: copy.actions.downloadZip });
    return [...stubbed, ...(share ? [share] : []), ...(zip ? [zip] : [])];
  }

  it('every action is a real button with a 44px target, and no label is clipped', () => {
    stubShare();
    open(golden('marty.openclaw'));
    const buttons = actionButtons();
    // Copy link, Share, Download zip, Remix and four switches.
    expect(buttons).toHaveLength(8);
    for (const button of buttons) {
      const label = textOf(button);
      expect(button.tagName, label).toBe('BUTTON');
      expect(button.getAttribute('type'), label).toBe('button');
      expect(button.className, `${label} is a 44px target`).toMatch(ONE_44);
      expect(button.className, `${label} is not clipped`).not.toMatch(CLIPS);
    }
  });

  it('the long labels wrap instead of overflowing', () => {
    stubShare();
    open(golden('marty.openclaw'));
    for (const button of [shareButton(), zipButton(), remixButton(), ...makeButtons()]) {
      expect(button.className, textOf(button)).toMatch(/\[overflow-wrap:anywhere\]/);
    }
  });

  it('nothing in the footer has a fixed width over 375px', () => {
    stubShare();
    open(golden('marty.openclaw'));
    for (const button of actionButtons()) {
      for (let el: HTMLElement | null = button; el && el !== main(); el = el.parentElement) {
        const widths = Array.from(el.className.matchAll(/(?:^|\s)(?:min-|max-)?w-\[(\d+)px\]/g)).map((m) => Number(m[1]));
        for (const w of widths) expect(w, `${textOf(button)}: ${el.className}`).toBeLessThanOrEqual(375);
      }
    }
  });

  it('the certificate has no text input (tap-only: the name and the remix paste box are the only ones)', () => {
    stubShare();
    open(golden('marty.openclaw'));
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(main().querySelectorAll('input[type="text"], input:not([type]), textarea')).toHaveLength(0);
  });

  it('every action string is plain words with no em or en dash', () => {
    const strings = Object.values(copy.actions);
    expect(strings.length).toBeGreaterThan(0);
    for (const text of strings) {
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain(EM);
      expect(text).not.toContain(EN);
    }
  });

  it('copy.actions holds exactly the six strings the slice reported', () => {
    // A new string would have to be reported, so a seventh key fails here until it is.
    expect(Object.keys(copy.actions).sort()).toEqual(
      ['copyLink', 'downloadZip', 'linkCopied', 'linkFailed', 'share', 'shareFailed'].sort(),
    );
  });

  it('the footer text has no em or en dash, with Share and Download zip showing', () => {
    stubShare();
    open(golden('marty.openclaw'));
    const footer = copyLinkButton().closest('div')?.parentElement as HTMLElement;
    expect(textOf(footer)).toContain(copy.actions.downloadZip);
    expect(textOf(footer)).not.toContain(EM);
    expect(textOf(footer)).not.toContain(EN);
  });

  it('Actions.tsx stores nothing, calls no network and never writes the address bar (source scan)', () => {
    const source = readFileSync(join(process.cwd(), 'src/ui/certificate/Actions.tsx'), 'utf8');
    expect(source).not.toContain(EM);
    expect(source).not.toContain(EN);
    const banned: [string, RegExp][] = [
      ['localStorage', /localStorage/],
      ['sessionStorage', /sessionStorage/],
      ['cookie', /document\.cookie/],
      ['indexedDB', /indexedDB/],
      ['fetch', /\bfetch\s*\(/],
      ['XMLHttpRequest', /XMLHttpRequest/],
      ['sendBeacon', /sendBeacon/],
      ['WebSocket', /WebSocket/],
      ['pushState', /pushState/],
      ['replaceState', /replaceState/],
      ['location assignment', /location(\.href|\.hash|\.search)?\s*=[^=]/],
    ];
    for (const [name, pattern] of banned) expect(source, name).not.toMatch(pattern);
  });

  it('a whole session of taps stores nothing, calls no network and leaves the address bar clean', async () => {
    const fetchSpy = typeof fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : undefined;
    const beacon = typeof navigator.sendBeacon === 'function' ? vi.spyOn(navigator, 'sendBeacon') : undefined;
    stubShare(() => Promise.resolve());
    const dl = stubDownload();
    open(golden('marty.openclaw'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');

    fireEvent.click(copyLinkButton());
    await act(async () => {
      fireEvent.click(shareButton());
    });
    fireEvent.click(zipButton());
    fireEvent.click(screen.getByRole('button', { name: makeFor('hermes') }));
    fireEvent.click(screen.getByRole('button', { name: makeFor('chatgpt') }));
    fireEvent.click(remixButton());
    expect(shown()).toBe('remix');

    expect(dl.blobs.length).toBeGreaterThan(0);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(fetchSpy?.mock.calls ?? []).toEqual([]);
    expect(beacon?.mock.calls ?? []).toEqual([]);
    expectCleanAddress('after the session');
    expectNothingStored('after the session');
  });
});

// ============================================================================
// A build that did not compile
// ============================================================================

describe('a build that does not compile', () => {
  it('shows the certificate error and none of the actions, and does not throw', () => {
    stubShare();
    open(golden('june.openclaw'));
    // A 40 character name fails validation, so previewBuild does not compile.
    act(() => {
      useBuilder.setState({ draft: { ...st().draft, name: 'x'.repeat(40) } });
    });
    expect(screen.getByText(copy.certificate.error)).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.actions.copyLink })).toBeNull();
    expect(screen.queryByRole('button', { name: copy.actions.share })).toBeNull();
    expect(screen.queryByRole('button', { name: copy.actions.downloadZip })).toBeNull();
    expect(screen.queryByRole('button', { name: copy.buttons.remix })).toBeNull();
    expect(makeButtons()).toHaveLength(0);
  });

  it('Actions renders nothing on its own for such a build', () => {
    act(() => st().loadBuild(golden('june.openclaw'), { from: 'link' }));
    act(() => {
      useBuilder.setState({ draft: { ...st().draft, name: 'x'.repeat(40) } });
    });
    const { container } = render(<Actions />);
    expect(container.innerHTML).toBe('');
  });
});
