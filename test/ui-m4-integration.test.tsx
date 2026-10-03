// @vitest-environment jsdom
//
// M4 integration tests (slice 4.17). Every item runs through the real <App/> in jsdom, with the link
// set on window.location before render, the way a person arrives from a pasted link, and is driven
// by taps (user-event), not by store actions, wherever the item is about what a person can do.
//
// What is covered, from the slice brief:
//   1. Share links reproduce: the June and Rook roster builds (library doc "Two worked compiles"),
//      every GOLDEN_SPECS build, and a v1 Marty link. Each opens on the certificate, the personality
//      block text equals the compile of the original build (and the committed golden), and Copy link
//      on that certificate gives the same payload.
//   2. A full first-build flow on Hermes (Build your own, base, chips, limits, gates, peeve, heart,
//      outfit, name, certificate), Copy link, then the link opened in a fresh render: same page.
//   3. A full link remix: ?remix=1 for June on Muse, the B12 warning, paste the original personality
//      plus one new line, Continue, remove one peeve, Next to the certificate. Mine holds only the
//      new line, is off by default, sits above the hard rules when on, and never reaches the link.
//   4. Target switch round trips on the certificate across all five targets.
//   5. Download zip on Marty OpenClaw roles: every file delivery, byte for byte.
//   6. A bad link shows the link error view, and Start over goes to the target screen.
//   7. No storage, no address-bar writes and no network, checked after every test in this file.
//
// Expected text comes from the library and the plan: roster names, taglines and badge names, the
// library's own headings, the B12 sentences, the Part E sentence "Make this for <target> instead",
// the committed golden files (reviewed and safety-checked), and the plan's zip name rule. Where the
// brief itself names the oracle ("equals compile(original).soul"), that is used as well, next to the
// golden. The wording the UI owns (button labels, headings) is read from src/ui/copy.
//
// "Continue" in the brief is the Next button on the remix screen (copy.buttons.next): the remix
// screen has no other forward button.
//
// What jsdom cannot do: there is no layout, no share sheet, no real download and no iOS clipboard
// rules, so the lead checks those in the Simulator. The zip is read from the Blob the download hands
// the browser, with a reader written here from the zip format.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compile } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import type {
  Build,
  BuildV1,
  ChatgptMode,
  CompileResult,
  Plan,
  ProfileId,
  TargetId,
} from '../src/compiler/types.js';
import { artifactKindOf } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import { encodeBuild, fromShareHash, toShareHash } from '../src/share/encode.js';
import { shareUrl } from '../src/share/url.js';
import { App } from '../src/ui/App.js';
import { copy } from '../src/ui/copy.js';
import { previewBuild, useBuilder } from '../src/ui/store.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---- Fixed characters (kept out of the source as literals) ----

const EM = String.fromCharCode(0x2014);

// ---- Wording typed in on purpose, so a drift in src/ui/copy shows up as a failure ----

// B12: the short target names, and the warning and paste label sentences.
const SHORT: Record<TargetId, string> = {
  muse: 'Muse',
  openclaw: 'OpenClaw',
  hermes: 'Hermes',
  grok: 'Grok Bot',
  chatgpt: 'ChatGPT',
};
const TARGETS: TargetId[] = ['muse', 'openclaw', 'hermes', 'grok', 'chatgpt'];
const makeFor = (id: TargetId): string => `Make this for ${SHORT[id]} instead`;
const warningFor = (id: TargetId): string =>
  `This rebuilds from your picks. Changes you made inside ${SHORT[id]} won't carry over.`;
const PASTE_LABEL = 'Paste your current personality to keep your edits.';

// The line the brief adds to the pasted personality.
const NEW_LINE = 'Never book anything on Sundays.';

// ---- Library lookups ----

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test setup: library has no ${what}`);
  return value;
}

const rosterEntry = (id: string) => must(library.roster.find((r) => r.id === id), `roster entry ${id}`);
const targetLabel = (id: TargetId) => must(library.targets.targets.find((t) => t.id === id), `target ${id}`).label;
const baseLabel = (id: string) => must(library.bases.find((b) => b.id === id), `base ${id}`).label;
const chipLabel = (id: string) => must(library.chips.find((c) => c.id === id), `chip ${id}`).label;
const peeveOf = (id: string) => must(library.peeves.find((p) => p.id === id), `peeve ${id}`);
const hardPartOf = (id: string) => must(library.heart.hardParts.find((h) => h.id === id), `hard part ${id}`);
const outfitOf = (id: string) => must(library.outfits.find((o) => o.id === id), `outfit ${id}`);
const gateLabel = (id: string) => must(library.gates.find((g) => g.id === id), `gate ${id}`).label;
const limitOf = (id: string) => must(library.limits.find((l) => l.id === id), `limit ${id}`);
const profileById = (id: ProfileId) => must(library.targets.profiles.find((p) => p.id === id), `profile ${id}`);
const badgeName = (id: string) => must(library.badges.find((b) => b.id === id), `badge ${id}`).name;

// ---- Builds ----

function golden(id: string): Build {
  return buildFor(must(GOLDEN_SPECS.find((s) => s.id === id), `golden spec ${id}`), library);
}

interface LinkCase {
  id: string;
  build: Build;
}

const GOLDEN_CASES: LinkCase[] = GOLDEN_SPECS.map((spec) => ({ id: spec.id, build: buildFor(spec, library) }));

// A roster link is the v1 roster build, which has no target and so opens on Muse.
interface RosterCase {
  id: string;
  v1: BuildV1;
  original: Build;
}

const ROSTER_CASES: RosterCase[] = library.roster.map((entry) => ({
  id: entry.id,
  v1: entry.build,
  original: migrate(entry.build, { target: 'muse' }),
}));

// ---- The committed goldens, read as files ----

// jsdom replaces the URL class, so the path is built from the working directory (the project root).
const goldenMd = (id: string): string => readFileSync(join(process.cwd(), 'test/golden/v2', `${id}.md`), 'utf8');

// The personality block of a golden: the fenced text under "## Personality (n/cap characters)".
function goldenPersonality(id: string): string {
  const m = /^## Personality \([^)]*\)\n\n(`{3,})md\n([\s\S]*?)\n\1\n/m.exec(goldenMd(id));
  if (!m) throw new Error(`test setup: no personality block in golden ${id}`);
  return m[2]!;
}

interface GoldenFile {
  path: string;
  label: string;
  delivery: string;
  content: string;
}

// The "## Files" entries of a golden: "### <path> (<label>, <file|paste>)" and its fenced text.
function goldenFiles(id: string): GoldenFile[] {
  const md = goldenMd(id);
  const at = md.indexOf('\n## Files\n');
  if (at < 0) return [];
  const re = /^### (.+?) \((.+), (file|paste)\)\n\n(`{3,})md\n([\s\S]*?)\n\4\n/gm;
  const out: GoldenFile[] = [];
  const body = md.slice(at + 1);
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    out.push({ path: m[1]!, label: m[2]!, delivery: m[3]!, content: m[5]! });
  }
  return out;
}

// ---- Store and DOM helpers ----

const st = () => useBuilder.getState();

function store(fn: (s: ReturnType<typeof st>) => void): void {
  act(() => {
    fn(st());
  });
}

const origin = () => window.location.origin;
const pathname = () => window.location.pathname;

// Writes the address bar. Captured before any spy goes on, so the tests' own writes are not counted
// as the app's.
const realReplaceState = window.history.replaceState.bind(window.history);
function openAt(href: string): void {
  realReplaceState(null, '', href);
}

const linkOf = (source: Build | BuildV1): string => shareUrl(origin(), pathname(), source);
const remixLinkOf = (source: Build | BuildV1): string => origin() + pathname() + '?remix=1' + toShareHash(source);
const hashOf = (link: string): string => new URL(link).hash;
const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');

// The JSON inside a link's payload, to look for words that must not be there.
function payloadText(link: string): string {
  return Buffer.from(hashOf(link).replace(/^#b=/, ''), 'base64url').toString('utf8');
}

// The build a copied link carries, through the real decoder.
function decodeLink(link: string): Build {
  return fromShareHash(hashOf(link), library).build;
}

// The screen App is showing, from its data-screen attribute.
function shown(): string | null {
  return document.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null;
}

const main = () => screen.getByRole('main');
const textOf = (el: Element | null | undefined): string => el?.textContent ?? '';
const h1 = () => screen.getByRole('heading', { level: 1 });

function buttonNamed(name: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => textOf(b).trim() === name || b.getAttribute('aria-label') === name,
  );
  if (!found) throw new Error(`no button named "${name}"`);
  return found;
}
const hasButton = (name: string): boolean =>
  Array.from(document.querySelectorAll('button')).some((b) => textOf(b).trim() === name);

// The button reads "Copy link", or "Link copied" for two seconds after a copy.
function copyLinkButton(): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => textOf(b).trim() === copy.actions.copyLink || textOf(b).trim() === copy.actions.linkCopied,
  );
  if (!found) throw new Error('no Copy link button');
  return found;
}
const nextButton = () => screen.getByRole('button', { name: copy.buttons.next });
const makeNames = (): string[] =>
  Array.from(document.querySelectorAll('button'))
    .map((b) => textOf(b).trim())
    .filter((t) => t.startsWith('Make this for '));

// Every copy block on the page: a role=group with a heading and a pre, in document order.
interface Block {
  title: string;
  text: string;
  el: HTMLElement;
}
function blocks(): Block[] {
  return Array.from(main().querySelectorAll<HTMLElement>('[role="group"]')).flatMap((g) => {
    const id = g.getAttribute('aria-labelledby');
    const heading = id === null ? null : document.getElementById(id);
    const pre = g.querySelector('pre');
    return heading !== null && pre !== null ? [{ title: textOf(heading), text: textOf(pre), el: g }] : [];
  });
}

// The title of the main personality block: the bundle label of the personality file or spoken item.
function personalityLabel(result: CompileResult): string {
  const file = result.files.find((f) => artifactKindOf(f) === 'personality' && f.role === undefined);
  if (file !== undefined) return file.label;
  const spoken = result.spoken.find((s) => artifactKindOf(s) === 'personality' && s.role === undefined);
  if (spoken !== undefined) return spoken.label;
  throw new Error('test setup: the compile has no personality artifact');
}

function personalityBlock(result: CompileResult): Block {
  const title = personalityLabel(result);
  return must(blocks().find((b) => b.title === title), `a block titled "${title}"`);
}

// Everything a reader sees, as text, in order. Ids that React makes per render never appear in it.
function pageSnapshot(): string[] {
  return Array.from(main().querySelectorAll('h1, h2, h3, pre, li, p')).map((el) => textOf(el));
}

// ---- Clipboard stub (execCommand is the first copy path inside the tap, W19) ----

let copied: string[] = [];

function stubClipboard(): void {
  copied = [];
  const exec = vi.fn((command: string) => {
    const el = document.activeElement;
    copied.push(command === 'copy' && el instanceof HTMLTextAreaElement ? el.value : '');
    return true;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: exec });
}

// Taps Copy link and returns the link it copied.
function tapCopyLink(): string {
  const before = copied.length;
  fireEvent.click(copyLinkButton());
  expect(copied.length, 'one copy per tap').toBe(before + 1);
  return copied[copied.length - 1]!;
}

// ---- Download stub: records the Blob and the anchor click ----

interface DownloadRig {
  blobs: Blob[];
  clicks: { href: string; download: string }[];
}
let originalCreate: PropertyDescriptor | undefined;
let originalRevoke: PropertyDescriptor | undefined;

function stubDownload(): DownloadRig {
  const dl: DownloadRig = { blobs: [], clicks: [] };
  originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (obj: Blob): string => {
      dl.blobs.push(obj);
      return `blob:test/${dl.blobs.length}`;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => undefined });
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

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));

// ---- Side channels: storage, cookies, history, network (item 7), watched in every test ----

const STORAGE_CALLS = ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const;
interface Watch {
  storage: Array<[string, MockInstance]>;
  cookie?: MockInstance;
  push: MockInstance;
  replace: MockInstance;
  fetch?: MockInstance;
  xhrOpen: MockInstance;
  xhrSend: MockInstance;
  beacon: MockInstance;
}
let watch: Watch;

function installWatch(): void {
  let cookie: MockInstance | undefined;
  try {
    cookie = vi.spyOn(Document.prototype, 'cookie', 'set');
  } catch {
    cookie = undefined;
  }
  const beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: beacon });
  watch = {
    storage: STORAGE_CALLS.map((name) => [name, vi.spyOn(Storage.prototype, name)]),
    cookie,
    push: vi.spyOn(window.history, 'pushState'),
    replace: vi.spyOn(window.history, 'replaceState'),
    // None of these call through, so even a failing run makes no real request.
    fetch:
      typeof globalThis.fetch === 'function'
        ? vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('no network in this test')))
        : undefined,
    xhrOpen: vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => undefined),
    xhrSend: vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined),
    beacon,
  };
}

// The address bar holds origin and path only, with no hash and no query.
function expectCleanAddress(ctx: string): void {
  expect(window.location.hash, `${ctx}: no hash`).toBe('');
  expect(window.location.search, `${ctx}: no query`).toBe('');
  expect(window.location.href, `${ctx}: origin and path only`).toBe(origin() + pathname());
}

// The app read the link once and wrote the clean address once, and nothing since (W7).
function expectCleanedOnce(ctx: string): void {
  expect(watch.replace.mock.calls.length, `${ctx}: replaceState ran exactly once, to clean the address`).toBe(1);
  expect(watch.replace.mock.calls[0]![2], `${ctx}: and it wrote origin and path only`).toBe(origin() + pathname());
}

// Nothing was stored, nothing was read from storage, nothing was written to history except the one
// clean-up of the address bar, and nothing left the page.
function expectNoSideChannels(ctx: string): void {
  for (const [name, spy] of watch.storage) {
    expect(spy.mock.calls, `${ctx}: Storage.${name} was not called`).toEqual([]);
  }
  if (watch.cookie) expect(watch.cookie.mock.calls, `${ctx}: no cookie was set`).toEqual([]);
  expect(localStorage.length, `${ctx}: localStorage is empty`).toBe(0);
  expect(sessionStorage.length, `${ctx}: sessionStorage is empty`).toBe(0);
  expect(document.cookie, `${ctx}: no cookie`).toBe('');
  expect(watch.push.mock.calls, `${ctx}: history.pushState was not called`).toEqual([]);
  for (const call of watch.replace.mock.calls) {
    expect(call[2], `${ctx}: replaceState only writes the clean address`).toBe(origin() + pathname());
  }
  if (watch.fetch) expect(watch.fetch.mock.calls, `${ctx}: fetch was not called`).toEqual([]);
  expect(watch.xhrOpen.mock.calls, `${ctx}: no XMLHttpRequest was opened`).toEqual([]);
  expect(watch.xhrSend.mock.calls, `${ctx}: no XMLHttpRequest was sent`).toEqual([]);
  expect(watch.beacon.mock.calls, `${ctx}: no beacon was sent`).toEqual([]);
  expectCleanAddress(ctx);
}

beforeEach(() => {
  st().reset();
  openAt('/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  stubClipboard();
  installWatch();
});

afterEach(() => {
  // Item 7: this runs after every test in the file, before the mocks are restored. The cleanup is in
  // a finally, so a failed check never leaves state behind to fail the next test as well.
  try {
    expectNoSideChannels('after the test');
  } finally {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreDownload();
    Reflect.deleteProperty(navigator, 'sendBeacon');
    Reflect.deleteProperty(document, 'execCommand');
    localStorage.clear();
    sessionStorage.clear();
    st().reset();
    openAt('/');
  }
});

// ============================================================================
// 1. Share links reproduce
// ============================================================================

describe('1. share links reproduce', () => {
  it('has the 55 golden builds and the nine roster builds the brief names', () => {
    expect(GOLDEN_CASES.length).toBe(55);
    expect(ROSTER_CASES.length).toBe(9);
    // The June and Rook roster builds are the builds in the library doc's worked compiles.
    const june = rosterEntry('june').build;
    expect(june.base).toBe('parent');
    expect(june.chips).toEqual(['kids', 'cooking', 'dog', 'phone']);
    expect(june.stats).toEqual({ blunt: 2, warm: 3, funny: 3, chatty: 2, proactive: 4 });
    expect(june.peeves).toEqual(['over_explains', 'bullets_everything', 'corporate_speak']);
    expect(june.heart.hardPart).toBe('too_much');
    expect(june.heart.d1).toBe('d1.too_much');
    expect(june.outfit).toBe('has_it_together');
    expect(june.name).toBe('June');
    const rook = rosterEntry('rook').build;
    expect(rook.base).toBe('builder');
    expect(rook.chips).toEqual(['engineering', 'founder', 'gaming', 'night_owl']);
    expect(rook.stats).toEqual({ blunt: 4, warm: 1, funny: 2, chatty: 1, proactive: 2 });
    expect(rook.peeves).toEqual(['asks_permission', 'repeats_question', 'adds_disclaimers', 'hedges_everything']);
    expect(rook.heart.hardPart).toBe('check_my_work');
    expect(rook.heart.d1).toBe('d1.check_my_work');
    expect(rook.outfit).toBe('staff_engineer');
    expect(rook.name).toBe('Rook');
  });

  // Every golden build, as a v2 link. The brief's oracle is compile(original).soul; the committed
  // golden is the second, independent oracle for the same text.
  it.each(GOLDEN_CASES)('golden $id: opens on the certificate with the original personality, and Copy link gives the same payload', ({ id, build }) => {
    const link = linkOf(build);
    openAt(link);
    expect(hashOf(window.location.href), `${id}: the link is in the address bar before render`).not.toBe('');
    render(<App />);

    // It opens on the certificate as a link.
    expect(shown(), id).toBe('certificate');
    expect(st().from, id).toBe('link');
    expect(st().linkError, id).toBeUndefined();
    expect(h1().textContent, id).toBe(`Meet ${build.name}`);
    expect(st().drops, `${id}: a valid link drops nothing`).toEqual([]);
    expect(st().decodeWarnings, `${id}: and warns of nothing`).toEqual([]);
    expectCleanAddress(id);
    expectCleanedOnce(id);

    // The personality block is the compile of the original build, and the committed golden.
    const original = compile(build);
    const block = personalityBlock(original);
    expect(block.text, `${id}: personality equals compile(original).soul`).toBe(original.soul);
    expect(block.text, `${id}: personality equals the committed golden`).toBe(goldenPersonality(id));
    expect(textOf(main()), `${id}: no em dash on the page`).not.toContain(EM);

    // Copy link on the certificate gives the same payload the link was made with.
    const copiedLink = tapCopyLink();
    expect(copiedLink.startsWith(`${origin()}${pathname()}#b=`), id).toBe(true);
    expect(new URL(copiedLink).search, `${id}: no query string`).toBe('');
    expect(hashOf(copiedLink), `${id}: the copied payload is the original payload`).toBe(hashOf(link));
    expect(decodeLink(copiedLink), id).toEqual(build);
    expectCleanAddress(`${id} after Copy link`);
    expectCleanedOnce(`${id} after Copy link`);
  });

  // The nine roster builds, as v1 links. June and Rook are the library doc's worked compiles.
  it.each(ROSTER_CASES)('roster v1 link $id: opens on Muse with the original personality, and Copy link re-encodes it as v2', ({ id, v1, original }) => {
    const link = linkOf(v1);
    expect(JSON.parse(payloadText(link)).v, `${id}: the link really is a v1 payload`).toBe(1);
    openAt(link);
    render(<App />);

    expect(shown(), id).toBe('certificate');
    expect(st().from, id).toBe('link');
    expect(st().linkError, id).toBeUndefined();
    // A v1 roster build has no target, so it opens on Muse.
    expect(st().target, id).toBe('muse');
    expect(previewBuild(st()), id).toEqual(original);
    expect(h1().textContent, id).toBe(`Meet ${v1.name}`);

    // Roster facts from the library: the build name (Q2) and the tagline (B3) are on the page.
    const entry = rosterEntry(id);
    const header = must(main().querySelector('header'), 'the certificate header');
    expect(textOf(header), id).toContain(entry.buildName);
    expect(textOf(header), id).toContain(entry.tagline);

    const result = compile(original);
    expect(result.buildName, `${id}: the compile names the build as the roster does`).toBe(entry.buildName);
    const block = personalityBlock(result);
    expect(block.text, `${id}: personality equals compile(original).soul`).toBe(result.soul);
    expect(block.text, `${id}: personality equals the committed muse golden`).toBe(goldenPersonality(`${id}.muse`));
    expectCleanAddress(id);
    expectCleanedOnce(id);

    // Copy link gives the v2 payload of the same build, not the v1 one.
    const copiedLink = tapCopyLink();
    expect(hashOf(copiedLink), `${id}: the copied payload is the v2 encoding of the original`).toBe('#b=' + encodeBuild(original));
    expect(JSON.parse(payloadText(copiedLink)).v, id).toBe(2);
    expect(decodeLink(copiedLink), id).toEqual(original);
  });

  it('June and Rook show the badges the library doc lists for them', () => {
    const DOC_BADGES: Record<string, string[]> = {
      june: ['Triage', 'Reads the Room', 'Checks In', 'Kid Guard'],
      rook: ['No Menu', 'Second Look', 'Code First', 'Displacement'],
    };
    for (const [id, names] of Object.entries(DOC_BADGES)) {
      cleanup();
      st().reset();
      openAt(linkOf(rosterEntry(id).build));
      render(<App />);
      const pills = Array.from(main().querySelectorAll('header ul[aria-label] li')).map((li) => textOf(li));
      expect([...pills].sort(), id).toEqual([...names].sort());
      // And the doc's names are the library's names for the ids the compile lit.
      const lit = compile(migrate(rosterEntry(id).build, { target: 'muse' })).badges.map(badgeName);
      expect([...lit].sort(), id).toEqual([...names].sort());
    }
  });

  // A build with every pick a link can carry beyond the chips: packs that no longer follow the chips,
  // a limit and a gate override, a role team, and a d2 that does not follow blunt.
  it('a build with every pick a link can carry opens, shows its own personality, and Copy link gives the same payload', () => {
    const base = migrate(rosterEntry('marty').build, { target: 'openclaw' });
    const otherD2 = must(
      library.heart.drives.find((d) => d.slot === 'd2' && d.id !== base.heart.d2),
      'a second d2 drive',
    );
    const build: Build = {
      ...base,
      packs: ['memecoins', 'research'],
      limits: { daily_loss_pct: limitOf('daily_loss_pct').max },
      gates: { trade: 'forbid' },
      roles: ['scout', 'risk-manager', 'journal'],
      heart: { ...base.heart, d2: otherD2.id },
    };
    const link = linkOf(build);
    openAt(link);
    render(<App />);

    expect(shown()).toBe('certificate');
    expect(previewBuild(st())).toEqual(build);
    expect(st().drops).toEqual([]);
    const result = compile(build);
    expect(personalityBlock(result).text).toBe(result.soul);
    expect(hashOf(tapCopyLink())).toBe(hashOf(link));
    expectCleanedOnce('every pick');
  });

  it('a v1 Marty link opens on the certificate and compiles', () => {
    const v1 = rosterEntry('marty').build;
    expect(v1.v).toBe(1);
    openAt(linkOf(v1));
    render(<App />);

    expect(shown()).toBe('certificate');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(st().linkError).toBeUndefined();
    expect(st().target).toBe('muse');
    expect(h1().textContent).toBe('Meet Marty');

    // It compiles, and the page shows the roster's name and tagline for Marty.
    const build = previewBuild(st());
    const result = compile(build);
    expect(result.buildName).toBe('Blunt Degen Trench Companion');
    expect(textOf(must(main().querySelector('header'), 'header'))).toContain('Blunt Degen Trench Companion');
    expect(textOf(main())).toContain(rosterEntry('marty').tagline);
    expect(personalityBlock(result).text).toBe(result.soul);
    expect(result.soul).toContain('Marty');
    // Marty is the memecoins builder: the Markets chip brought risk with it, so the radar has six axes.
    expect(build.stats.risk).toBeDefined();
    expect(build.packs).toContain('memecoins');
    expectCleanAddress('Marty v1 link');
  });
});

// ============================================================================
// 2. A full first-build flow, then its link in a fresh render
// ============================================================================

type User = ReturnType<typeof userEvent.setup>;

const FLOW = {
  base: 'trader',
  chips: ['engineering', 'memecoins', 'night_owl'],
  peeve: 'bullets_everything',
  hardPart: 'forget',
  outfit: 'staff_engineer',
  limit: 'per_trade_pct',
  gate: 'trade',
  name: 'Zephyr',
};

// Taps from the target screen to the certificate on Hermes, with a limit and a gate changed on the way.
async function firstBuildOnHermes(user: User, roles: boolean): Promise<void> {
  expect(shown()).toBe('target');
  await user.click(screen.getByRole('radio', { name: targetLabel('hermes') }));
  await user.click(nextButton());
  expect(shown()).toBe('roster');
  await user.click(screen.getByRole('button', { name: copy.buttons.buildYourOwn }));
  expect(shown()).toBe('base');
  await user.click(screen.getByRole('radio', { name: baseLabel(FLOW.base) }));
  await user.click(nextButton());
  expect(shown()).toBe('world');
  for (const id of FLOW.chips) await user.click(screen.getByRole('button', { name: chipLabel(id) }));
  await user.click(nextButton());
  expect(shown()).toBe('packs');
  if (roles) await user.click(screen.getByRole('switch', { name: copy.roles.toggle }));

  const seen: string[] = ['target', 'roster', 'base', 'world', 'packs'];
  for (let guard = 0; shown() !== 'name' && guard < 16; guard++) {
    await user.click(nextButton());
    const at = shown() as string;
    seen.push(at);
    if (at === 'limits') {
      await user.click(screen.getByRole('button', { name: copy.limits.raise(limitOf(FLOW.limit).label) }));
    }
    if (at === 'gates') {
      const group = screen.getByRole('radiogroup', { name: gateLabel(FLOW.gate) });
      await user.click(within(group).getByRole('radio', { name: copy.gates.settings.forbid }));
    }
    if (at === 'peeves') await user.click(screen.getByRole('button', { name: peeveOf(FLOW.peeve).label }));
    if (at === 'heart') await user.click(screen.getByRole('radio', { name: hardPartOf(FLOW.hardPart).label }));
    if (at === 'outfit') await user.click(screen.getByRole('radio', { name: outfitOf(FLOW.outfit).card }));
  }
  expect(shown()).toBe('name');
  await user.type(screen.getByRole('textbox', { name: copy.name.label }), FLOW.name);
  await user.click(nextButton());
  expect(shown()).toBe('certificate');
  // The tap path went through the screens the picks need, in order.
  expect(seen).toEqual(
    expect.arrayContaining(['limits', 'gates', 'stats', 'peeves', 'heart', 'outfit', ...(roles ? ['roles'] : [])]),
  );
  expect(seen.includes('roles')).toBe(roles);
}

describe('2. a full first-build flow on Hermes, then its link in a fresh render', () => {
  it.each([{ roles: false }, { roles: true }])(
    'roles $roles: Copy link, then the link opened fresh shows the same certificate text',
    async ({ roles }) => {
      const user = userEvent.setup();
      render(<App />);
      await firstBuildOnHermes(user, roles);

      // The picks reached the certificate.
      expect(st().from).toBe('blank');
      expect(st().target).toBe('hermes');
      expect(h1().textContent).toBe(`Meet ${FLOW.name}`);
      const built = structuredClone(previewBuild(st()));
      const result = compile(built);
      const personality = personalityBlock(result).text;
      expect(personality).toBe(result.soul);
      expect(personality).toContain(`${FLOW.name}. ${outfitOf(FLOW.outfit).anchor}`);
      expect(personality).toContain(must(peeveOf(FLOW.peeve).line, 'peeve line'));
      expect(personality).toContain(must(library.heart.drives.find((d) => d.id === hardPartOf(FLOW.hardPart).d1), 'd1').line);
      // One tap on Raise moved the limit one step up from the pack default.
      const raised = must(library.packs.find((p) => p.id === 'memecoins'), 'pack memecoins').limitsDefault[FLOW.limit]! + limitOf(FLOW.limit).step;
      expect(built.limits[FLOW.limit]).toBe(raised);
      expect(built.gates[FLOW.gate]).toBe('forbid');
      expect(built.packs).toContain('memecoins');
      expect(built.roles !== undefined && built.roles.length > 0).toBe(roles);
      const before = pageSnapshot();
      expect(before.length).toBeGreaterThan(10);

      // Copy link carries every pick.
      const link = tapCopyLink();
      const decoded = decodeLink(link);
      expect(decoded).toEqual(built);
      expect(decoded.target).toBe('hermes');
      expect(decoded.name).toBe(FLOW.name);
      expect(decoded.gates[FLOW.gate]).toBe('forbid');
      expect(decoded.limits[FLOW.limit]).toBe(raised);
      expectCleanAddress('after Copy link');

      // A fresh render, with only the link: nothing carried over in the store.
      cleanup();
      act(() => {
        st().reset();
      });
      expect(st().target).toBeNull();
      openAt(link);
      render(<App />);

      expect(shown()).toBe('certificate');
      expect(st().from).toBe('link');
      expect(previewBuild(st())).toEqual(built);
      expect(pageSnapshot(), 'the same certificate text').toEqual(before);
      expect(personalityBlock(compile(previewBuild(st()))).text).toBe(personality);
      expectCleanAddress('after the fresh open');
    },
    30_000,
  );
});

// ============================================================================
// 3. A full link remix
// ============================================================================

describe('3. a full link remix: ?remix=1 for June on Muse', () => {
  // June as the library doc has her: a v1 roster link (opens on Muse), and the v2 Muse golden link. The
  // remix is entered from a ?remix=1 link, or from the certificate's own Remix button (W11, W36).
  const SOURCES: Array<{ name: string; source: Build | BuildV1; entry: 'link' | 'button' }> = [
    { name: 'the v1 roster link, ?remix=1', source: rosterEntry('june').build, entry: 'link' },
    { name: 'the v2 muse link, ?remix=1', source: golden('june.muse'), entry: 'link' },
    { name: 'the v2 muse link, then the certificate Remix button', source: golden('june.muse'), entry: 'button' },
  ];

  it.each(SOURCES)('$name: warning, paste, Continue, remove a peeve, Next, Mine off then on, and no Mine in the link', async ({ source, entry }) => {
    const user = userEvent.setup();
    const june = golden('june.muse');
    const originalSoul = goldenPersonality('june.muse');
    expect(originalSoul).toBe(compile(june).soul);

    // The peeve to remove: one with a line of its own in the original personality.
    const removed = peeveOf('over_explains');
    const removedLine = must(removed.line, 'peeve line');
    expect(originalSoul).toContain(removedLine);
    expect(june.peeves).toContain('over_explains');

    // ---- The remix screen opens, with the warning for Muse ----
    if (entry === 'link') {
      openAt(remixLinkOf(source));
      render(<App />);
    } else {
      openAt(linkOf(source));
      render(<App />);
      expect(shown()).toBe('certificate');
      await user.click(buttonNamed(copy.buttons.remix));
    }
    expect(shown()).toBe('remix');
    expect(st().from).toBe('link-remix');
    expect(st().target).toBe('muse');
    expect(h1().textContent).toBe(copy.screens.remix.title);
    const warning = screen.getByText(warningFor('muse'));
    expect(textOf(warning)).toContain('Changes you made inside Muse');
    expect(screen.queryAllByText(/This rebuilds from your picks/)).toHaveLength(1);
    const box = screen.getByRole('textbox', { name: PASTE_LABEL }) as HTMLTextAreaElement;
    expect(box.value).toBe('');
    expect(warning.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expectCleanAddress('after the remix link opened');
    expectCleanedOnce('after the remix link opened');

    // ---- Paste the original personality plus one new line, then Continue ----
    await user.click(box);
    await user.paste(`${originalSoul}\n${NEW_LINE}`);
    expect(box.value).toBe(`${originalSoul}\n${NEW_LINE}`);
    expect(st().pasted).toBe(`${originalSoul}\n${NEW_LINE}`);
    await user.click(nextButton());
    expect(shown()).toBe('base');
    expect(st().from).toBe('link-remix');
    // The base is already June's: the link's picks are all still there.
    expect(screen.getByRole('radio', { name: baseLabel('parent') }).getAttribute('aria-checked')).toBe('true');
    // Back on base returns to the remix screen with the paste kept, and Continue goes on again.
    await user.click(screen.getByRole('button', { name: copy.buttons.back }));
    expect(shown()).toBe('remix');
    expect((screen.getByRole('textbox', { name: PASTE_LABEL }) as HTMLTextAreaElement).value).toBe(`${originalSoul}\n${NEW_LINE}`);
    await user.click(nextButton());
    expect(shown()).toBe('base');

    // ---- Next to the peeves screen, remove one peeve ----
    for (let guard = 0; shown() !== 'peeves' && guard < 12; guard++) await user.click(nextButton());
    expect(shown()).toBe('peeves');
    const chip = screen.getByRole('button', { name: removed.label });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await user.click(chip);
    expect(screen.getByRole('button', { name: removed.label }).getAttribute('aria-pressed')).toBe('false');
    expect(st().draft.peeves).toEqual(june.peeves.filter((p) => p !== 'over_explains'));

    // ---- Next to the certificate ----
    for (let guard = 0; shown() !== 'certificate' && guard < 8; guard++) await user.click(nextButton());
    expect(shown()).toBe('certificate');
    expect(h1().textContent).toBe('Meet June');
    // The pasted text is still in memory, and it is not in the address bar.
    expect(st().pasted).toBe(`${originalSoul}\n${NEW_LINE}`);
    expectCleanAddress('on the certificate');

    // The build now lacks the peeve, so its personality lacks the peeve line.
    const current = compile(previewBuild(st()));
    expect(previewBuild(st()).peeves).toEqual(june.peeves.filter((p) => p !== 'over_explains'));
    expect(current.soul).not.toContain(removedLine);
    const offBlock = personalityBlock(current);
    expect(offBlock.text).toBe(current.soul);
    expect(offBlock.text).not.toContain(removedLine);

    // ---- Mine is off by default: the switch says one line is not in the build, and no Mine block shows ----
    const mine = copy.certificate.mine;
    const toggle = screen.getByRole('switch', { name: mine.label });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(st().mineOn).toBe(false);
    expect(screen.getByText(mine.found(1))).toBeTruthy();
    expect(screen.queryByText(mine.found(2))).toBeNull();
    expect(blocks().some((b) => b.title === copy.certificate.blockTitles.mine)).toBe(false);
    expect(offBlock.text).not.toContain(NEW_LINE);
    expect(offBlock.text).not.toContain('## Mine');
    expect(screen.getByText(mine.note)).toBeTruthy();
    const offLink = tapCopyLink();

    // ---- Switch Mine on ----
    await user.click(toggle);
    expect(screen.getByRole('switch', { name: mine.label }).getAttribute('aria-checked')).toBe('true');
    expect(st().mineOn).toBe(true);

    // The Mine block holds only the new line. The removed peeve's line is not Mine.
    const all = blocks();
    const mineBlock = must(all.find((b) => b.title === copy.certificate.blockTitles.mine), 'a Mine block');
    expect(mineBlock.text).toBe(NEW_LINE);
    expect(mineBlock.text).not.toContain(removedLine);
    expect(all.filter((b) => b.title === copy.certificate.blockTitles.mine)).toHaveLength(1);
    // It sits right after the personality block.
    const onBlock = personalityBlock(current);
    expect(all.findIndex((b) => b.el === mineBlock.el)).toBe(all.findIndex((b) => b.el === onBlock.el) + 1);

    // The line is in the personality block, above the hard rules section and the act section.
    const lines = onBlock.text.split('\n');
    const mineAt = lines.indexOf('## Mine');
    expect(mineAt, 'a Mine heading in the personality').toBeGreaterThan(-1);
    expect(lines[mineAt + 1]).toBe(NEW_LINE);
    expect(lines[mineAt + 2]).toBe('');
    const hardHeading = must(
      Object.values(profileById('muse').templates).find((t) => t.line === '## Hard rules'),
      'the Hard rules heading template',
    ).line;
    const actHeading = must(library.chassis.headings.find((h) => h.id === 'heading.act'), 'act heading').text;
    const hardAt = lines.indexOf(hardHeading);
    const actAt = lines.indexOf(actHeading);
    expect(hardAt, 'a Hard rules section').toBeGreaterThan(-1);
    expect(actAt, 'an Acting for me section').toBeGreaterThan(-1);
    expect(mineAt).toBeLessThan(actAt);
    expect(mineAt).toBeLessThan(hardAt);
    // Nothing else moved: take the Mine section out and the personality is the Mine-off text again.
    expect(onBlock.text.replace(`## Mine\n${NEW_LINE}\n\n`, '')).toBe(offBlock.text);
    // The removed peeve line is not back, and the meter counts the longer text.
    expect(onBlock.text).not.toContain(removedLine);
    const cap = profileById('muse').lengthCap as number;
    expect(screen.getByText(copy.preview.length(onBlock.text.length, cap))).toBeTruthy();

    // Mine is in no other artifact.
    for (const b of all) {
      if (b.el === onBlock.el || b.el === mineBlock.el) continue;
      expect(b.text, `block "${b.title}" does not hold the Mine line`).not.toContain(NEW_LINE);
    }

    // ---- Copy link carries no Mine text, and it is the same link as with Mine off ----
    const onLink = tapCopyLink();
    expect(onLink).toBe(offLink);
    const payload = payloadText(onLink);
    expect(payload).not.toContain('Sundays');
    expect(payload).not.toContain('Never book');
    expect(payload).not.toContain('Mine');
    expect(onLink).not.toContain('Sundays');
    expect(decodeLink(onLink)).toEqual(previewBuild(st()));
    expect(decodeLink(onLink).peeves).toEqual(june.peeves.filter((p) => p !== 'over_explains'));
    expectCleanAddress('after Copy link');
  }, 30_000);
});

describe('3b. the remix entry clears the last remix (W27, W36)', () => {
  it('Remix from the certificate starts with an empty paste box and Mine off, every time', async () => {
    const user = userEvent.setup();
    const june = golden('june.muse');
    openAt(linkOf(june));
    render(<App />);
    expect(shown()).toBe('certificate');

    // First remix: paste a line, then Back to the certificate.
    await user.click(buttonNamed(copy.buttons.remix));
    expect(shown()).toBe('remix');
    expect(st().baseline).toEqual(june);
    await user.click(screen.getByRole('textbox', { name: PASTE_LABEL }));
    await user.paste(`${goldenPersonality('june.muse')}\n${NEW_LINE}`);
    await user.click(screen.getByRole('button', { name: copy.buttons.back }));
    expect(shown()).toBe('certificate');
    // A link certificate stays a link certificate: still no way back past it.
    expect(st().from).toBe('link');
    expect(screen.queryByRole('button', { name: copy.buttons.back })).toBeNull();

    // The paste was kept on the way back and holds a line the build lacks, so the Mine switch shows,
    // off. Turn it on: Mine is now part of the certificate.
    const mine = copy.certificate.mine;
    expect(st().pasted).toBe(`${goldenPersonality('june.muse')}\n${NEW_LINE}`);
    const toggle = screen.getByRole('switch', { name: mine.label });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(st().mineOn).toBe(false);
    await user.click(toggle);
    expect(st().mineOn).toBe(true);
    expect(screen.getByRole('switch', { name: mine.label }).getAttribute('aria-checked')).toBe('true');
    expect(blocks().some((b) => b.title === copy.certificate.blockTitles.mine)).toBe(true);

    // Second remix: nothing from the first one is there, Mine included.
    await user.click(buttonNamed(copy.buttons.remix));
    expect(shown()).toBe('remix');
    expect(st().mineOn).toBe(false);
    expect((screen.getByRole('textbox', { name: PASTE_LABEL }) as HTMLTextAreaElement).value).toBe('');
    expect(st().pasted).toBe('');
    expect(st().baseline).toEqual(june);
    expect(screen.getByText(warningFor('muse'))).toBeTruthy();

    // The switch is off when you return: paste the same line again and go back. If Mine had been
    // carried over from the first remix, the switch would come back on.
    await user.click(screen.getByRole('textbox', { name: PASTE_LABEL }));
    await user.paste(`${goldenPersonality('june.muse')}\n${NEW_LINE}`);
    await user.click(screen.getByRole('button', { name: copy.buttons.back }));
    expect(shown()).toBe('certificate');
    expect(st().mineOn).toBe(false);
    expect(screen.getByRole('switch', { name: mine.label }).getAttribute('aria-checked')).toBe('false');
    expect(blocks().some((b) => b.title === copy.certificate.blockTitles.mine)).toBe(false);
  });

  it('a paste with nothing new in it leaves no Mine switch on the certificate', async () => {
    const user = userEvent.setup();
    const june = golden('june.muse');
    openAt(remixLinkOf(june));
    render(<App />);
    expect(shown()).toBe('remix');
    await user.click(screen.getByRole('textbox', { name: PASTE_LABEL }));
    await user.paste(goldenPersonality('june.muse'));
    for (let guard = 0; shown() !== 'certificate' && guard < 20; guard++) await user.click(nextButton());
    expect(shown()).toBe('certificate');
    // Every pasted line is in the build, so there is nothing to keep.
    expect(screen.queryByRole('switch', { name: copy.certificate.mine.label })).toBeNull();
    expect(blocks().some((b) => b.title === copy.certificate.blockTitles.mine)).toBe(false);
    expect(personalityBlock(compile(june)).text).toBe(compile(june).soul);
  }, 30_000);
});

// ============================================================================
// 4. Target switch round trip on the certificate, across all five targets
// ============================================================================

// Marty's golden for each target: the build the certificate starts from, and the oracle for what
// switching to that target must show.
const MARTY_ON: Record<TargetId, string> = {
  muse: 'marty.muse',
  openclaw: 'marty.openclaw',
  hermes: 'marty.hermes',
  grok: 'marty.grok',
  chatgpt: 'marty.chatgpt-dot',
};

const othersOf = (id: TargetId): string[] => TARGETS.filter((t) => t !== id).map(makeFor);

describe('4. target switch round trip on the certificate', () => {
  it.each(TARGETS)('from %s: every other target and back leaves the draft unchanged and restores the text', async (start) => {
    const user = userEvent.setup();
    openAt(linkOf(golden(MARTY_ON[start])));
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().target).toBe(start);

    const draft0 = structuredClone(st().draft);
    const build0 = structuredClone(previewBuild(st()));
    const text0 = pageSnapshot();
    const personality0 = goldenPersonality(MARTY_ON[start]);
    expect(personalityBlock(compile(build0)).text).toBe(personality0);
    // The offered switches are the four other targets, in card order, and never GPT.
    expect(makeNames()).toEqual(othersOf(start));

    for (const other of TARGETS.filter((t) => t !== start)) {
      await user.click(buttonNamed(makeFor(other)));

      // On the other target's certificate, with the draft untouched and that target's own text.
      expect(shown(), `${start} to ${other}`).toBe('certificate');
      expect(st().target, `${start} to ${other}`).toBe(other);
      expect(structuredClone(st().draft), `${start} to ${other}: the draft is unchanged`).toEqual(draft0);
      expect(h1().textContent).toBe(`Meet ${build0.name}`);
      const there = compile(previewBuild(st()));
      expect(personalityBlock(there).text, `${start} to ${other}: the personality is Marty's on ${other}`).toBe(
        goldenPersonality(MARTY_ON[other]),
      );
      expect(makeNames(), `${start} to ${other}: the offered switches`).toEqual(othersOf(other));

      // And back: the draft, the build and the text are as they were.
      await user.click(buttonNamed(makeFor(start)));
      expect(shown(), `${other} back to ${start}`).toBe('certificate');
      expect(st().target).toBe(start);
      expect(st().mode, `${other} back to ${start}: mode`).toBe(build0.mode);
      expect(st().plan, `${other} back to ${start}: plan`).toBe(build0.plan);
      expect(structuredClone(st().draft), `${other} back to ${start}: the draft is unchanged`).toEqual(draft0);
      expect(structuredClone(previewBuild(st())), `${other} back to ${start}: the build is unchanged`).toEqual(build0);
      expect(pageSnapshot(), `${other} back to ${start}: the certificate text is restored`).toEqual(text0);
      expect(blocks().find((b) => b.title === personalityLabel(compile(build0)))?.text).toBe(personality0);
    }
    expect(makeNames()).toEqual(othersOf(start));
  }, 60_000);

  // ChatGPT comes back on the mode and plan it was left on.
  const MODES: Array<{ id: string; mode: ChatgptMode; plan?: Plan; starter: string }> = [
    { id: 'marty.chatgpt-project', mode: 'project', starter: 'marty' },
    { id: 'marty.chatgpt-instructions-paid', mode: 'instructions', plan: 'paid', starter: 'marty' },
    { id: 'june.chatgpt-instructions-free', mode: 'instructions', plan: 'free', starter: 'june' },
  ];

  it.each(MODES)('$id: switch to Hermes and back returns to the same ChatGPT mode, plan and text', async ({ id, mode, plan, starter }) => {
    const user = userEvent.setup();
    openAt(linkOf(golden(id)));
    render(<App />);
    expect(st().mode).toBe(mode);
    expect(st().plan).toBe(plan);
    const draft0 = structuredClone(st().draft);
    const text0 = pageSnapshot();

    await user.click(buttonNamed(makeFor('hermes')));
    expect(st().target).toBe('hermes');
    expect(st().mode).toBeUndefined();
    expect(st().plan).toBeUndefined();
    expect(structuredClone(st().draft)).toEqual(draft0);
    expect(personalityBlock(compile(previewBuild(st()))).text).toBe(goldenPersonality(`${starter}.hermes`));

    await user.click(buttonNamed(makeFor('chatgpt')));
    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe(mode);
    expect(st().plan).toBe(plan);
    expect(structuredClone(st().draft)).toEqual(draft0);
    expect(pageSnapshot()).toEqual(text0);
    expect(personalityBlock(compile(previewBuild(st()))).text).toBe(goldenPersonality(id));
  }, 30_000);

  it('the hidden Custom GPT certificate also offers ChatGPT, which resolves to Dot', async () => {
    const user = userEvent.setup();
    const gpt = migrate(rosterEntry('marty').build, { target: 'chatgpt', mode: 'gpt' });
    openAt(linkOf(gpt));
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().mode).toBe('gpt');
    // All five targets are offered, in card order, ChatGPT included.
    expect(makeNames()).toEqual(TARGETS.map(makeFor));
    const draft0 = structuredClone(st().draft);

    await user.click(buttonNamed(makeFor('chatgpt')));
    expect(st().target).toBe('chatgpt');
    expect(st().mode).toBe('dot');
    expect(structuredClone(st().draft)).toEqual(draft0);
    expect(personalityBlock(compile(previewBuild(st()))).text).toBe(goldenPersonality('marty.chatgpt-dot'));
    // On Dot, ChatGPT is no longer offered.
    expect(makeNames()).toEqual(othersOf('chatgpt'));
  });
});

// ============================================================================
// 5. Download zip
// ============================================================================

describe('5. Download zip', () => {
  const ZIPS = [
    // OpenClaw gives each role its own workspace folder. Hermes gives each role a profile folder.
    {
      id: 'marty.openclaw.roles',
      zipName: 'marty-openclaw.zip',
      roles: ['scout', 'risk-manager', 'journal'],
      folder: (role: string) => `workspace-${role}/`,
    },
    {
      id: 'rook.hermes.roles',
      zipName: 'rook-hermes.zip',
      roles: ['planner', 'implementer', 'reviewer', 'tester'],
      folder: (role: string) => `profiles/${role}/`,
    },
  ];

  it.each(ZIPS)('$id: the zip holds every file delivery byte for byte, with the role files', async ({ id, zipName, roles, folder }) => {
    const user = userEvent.setup();
    const dl = stubDownload();
    const spec = must(GOLDEN_SPECS.find((s) => s.id === id), `golden spec ${id}`);
    const build = buildFor(spec, library);
    expect(build.roles).toEqual(roles);
    openAt(linkOf(build));
    render(<App />);
    expect(shown()).toBe('certificate');

    // The files the bundle delivers as files: from the compile, and from the committed golden.
    const result = compile(build);
    const delivered = result.files.filter((f) => f.delivery === 'file');
    const fromGolden = goldenFiles(id).filter((f) => f.delivery === 'file');
    expect(delivered.length).toBeGreaterThan(5);
    expect(fromGolden.map((f) => f.path)).toEqual(delivered.map((f) => f.path));

    await user.click(screen.getByRole('button', { name: copy.actions.downloadZip }));

    // One download of one Blob, named <slug(name)>-<profile>.zip (plan section 7).
    expect(dl.blobs).toHaveLength(1);
    expect(dl.clicks).toHaveLength(1);
    expect(dl.clicks[0]!.download).toBe(zipName);
    expect(dl.blobs[0]!.type).toBe('application/zip');

    const entries = unzip(await bytesOfBlob(dl.blobs[0]!));
    const names = entries.map((e) => e.name);
    expect(new Set(names).size, 'no entry twice').toBe(names.length);
    expect([...names].sort(), 'every file delivery, and nothing else').toEqual(delivered.map((f) => f.path).sort());

    for (const file of delivered) {
      const entry = must(entries.find((e) => e.name === file.path), `a zip entry for ${file.path}`);
      const expected = encoder.encode(file.content);
      expect(entry.method, `${file.path}: stored`).toBe(0);
      expect(sameBytes(entry.data, expected), `${file.path}: bytes equal the compile`).toBe(true);
      expect(decoder.decode(entry.data), `${file.path}: text equals the committed golden`).toBe(
        must(fromGolden.find((g) => g.path === file.path), `golden file ${file.path}`).content,
      );
      expect(entry.crc, `${file.path}: crc`).toBe(crc32Reference(expected));
    }

    // The role files are in the zip: each role has files under its folder (OpenClaw: workspace-<role>/).
    for (const role of roles) {
      const inRole = names.filter((n) => n.startsWith(folder(role)));
      expect(inRole.length, `files for role ${role}`).toBeGreaterThan(0);
      expect(inRole, `role ${role}: a SOUL.md`).toContain(`${folder(role)}SOUL.md`);
    }
    // The main files are there too, next to them.
    expect(names).toContain('SOUL.md');
    expect(names).toContain('AGENTS.md');
    expect(names.some((n) => n.startsWith('skills/'))).toBe(true);
    expectCleanAddress('after Download zip');
  }, 30_000);

  it('the zip button is not offered where no file is a file delivery (Muse)', () => {
    const build = golden('marty.muse');
    expect(compile(build).files.some((f) => f.delivery === 'file')).toBe(false);
    openAt(linkOf(build));
    render(<App />);
    expect(hasButton(copy.actions.downloadZip)).toBe(false);
  });
});

// ============================================================================
// 6. A bad link shows the link error view
// ============================================================================

describe('6. a bad link shows the link error view', () => {
  const june = golden('june.hermes');
  const goodPayload = encodeBuild(june);
  // A word that must never reach the page, even though the link carries it.
  const MARKER = 'zzmarkerzz';

  const BAD: Array<{ name: string; href: () => string }> = [
    { name: 'a payload that is not base64url', href: () => `${origin()}${pathname()}#b=@@@@!!!` },
    { name: 'a payload cut off half way', href: () => `${origin()}${pathname()}#b=${goodPayload.slice(0, Math.floor(goodPayload.length / 2))}` },
    { name: 'a payload that is not JSON', href: () => `${origin()}${pathname()}#b=${b64('this is not json ' + MARKER)}` },
    { name: 'JSON that is not a build', href: () => `${origin()}${pathname()}#b=${b64(JSON.stringify([MARKER]))}` },
    { name: 'an object with the wrong shape', href: () => `${origin()}${pathname()}#b=${b64(JSON.stringify({ v: 2, base: MARKER }))}` },
    { name: 'a build from a newer version', href: () => `${origin()}${pathname()}#b=${b64(JSON.stringify({ ...JSON.parse(payloadText(linkOf(june))), v: 99 }))}` },
    { name: 'an empty payload', href: () => `${origin()}${pathname()}#b=` },
    { name: 'a remix link with a bad payload', href: () => `${origin()}${pathname()}?remix=1#b=${b64('nope ' + MARKER)}` },
  ];

  it.each(BAD)('$name: the link error view shows, with no developer text and nothing from the link', ({ href }) => {
    const link = href();
    openAt(link);
    render(<App />);

    expect(shown()).toBe('link-error');
    expect(h1().textContent).toBe(copy.linkError.title);
    expect(screen.getByText(copy.linkError.message)).toBeTruthy();
    expect(buttonNamed(copy.linkError.startOver)).toBeTruthy();
    expect(st().linkError).toBeDefined();

    // Nothing from the link, and no developer string, reaches the page.
    const page = textOf(document.body);
    expect(page).not.toContain(MARKER);
    expect(page).not.toContain(goodPayload.slice(0, 12));
    expect(page).not.toMatch(/ShareDecodeError|share:|Invalid build|undefined|\[object/);
    // The certificate and the screens are not behind it. The steps list carries its name as an
    // aria-label (not as text), so the check looks for the label, not for text.
    expect(copy.certificate.steps, 'the certificate steps label this check looks for').toBe('Install steps');
    expect(document.querySelectorAll('[aria-label="Install steps"]')).toHaveLength(0);
    expect(hasButton(copy.actions.copyLink), 'no Copy link button').toBe(false);
    expect(hasButton(copy.actions.linkCopied), 'no Link copied button').toBe(false);
    expect(screen.queryByRole('button', { name: copy.actions.copyLink })).toBeNull();
    expect(
      Array.from(document.querySelectorAll('[data-screen]')).map((el) => el.getAttribute('data-screen')),
      'the link error is the only screen on the page',
    ).toEqual(['link-error']);
    expect(document.querySelectorAll('textarea, input')).toHaveLength(0);
    expectCleanAddress('after a bad link');
    expectCleanedOnce('after a bad link');
  });

  it('Start over goes to the target screen with a clean slate, and the app works from there', async () => {
    const user = userEvent.setup();
    openAt(`${origin()}${pathname()}#b=${b64('this is not json')}`);
    render(<App />);
    expect(shown()).toBe('link-error');

    await user.click(buttonNamed(copy.linkError.startOver));
    expect(shown()).toBe('target');
    expect(h1().textContent).toBe(copy.screens.target.title);
    expect(st().linkError).toBeUndefined();
    expect(st().target).toBeNull();
    expect(st().from).toBeNull();
    expect(st().draft.chips).toEqual([]);
    expect(screen.queryByText(copy.linkError.title)).toBeNull();

    // It is a working app again: pick a target, and the roster follows.
    await user.click(screen.getByRole('radio', { name: targetLabel('openclaw') }));
    await user.click(nextButton());
    expect(shown()).toBe('roster');
  });

  it('a bad remix link also goes to the target screen on Start over', async () => {
    const user = userEvent.setup();
    openAt(`${origin()}${pathname()}?remix=1#b=@@@@`);
    render(<App />);
    expect(shown()).toBe('link-error');
    await user.click(buttonNamed(copy.linkError.startOver));
    expect(shown()).toBe('target');
    expect(st().from).toBeNull();
    expect(st().pasted).toBe('');
    expectCleanAddress('after Start over');
  });

  it('a link that is only a little off still opens: unknown ids are dropped, counted and never echoed', () => {
    const payload = JSON.parse(payloadText(linkOf(june))) as { c: string[]; pv: string[] };
    payload.c = [...payload.c, MARKER];
    payload.pv = [...payload.pv, MARKER];
    openAt(`${origin()}${pathname()}#b=${b64(JSON.stringify(payload))}`);
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().linkError).toBeUndefined();
    expect(textOf(document.body)).not.toContain(MARKER);
    expect(st().drops.length).toBeGreaterThan(0);
    expectCleanAddress('after a link with unknown ids');
  });
});

// ============================================================================
// 7. No storage across all of the above
// ============================================================================

describe('7. no storage, no history writes, no network', () => {
  // Proves the watch is live, so the clean runs elsewhere in this file mean something.
  it('the watch is live: canary calls are seen by every spy, then forgotten', async () => {
    const calls = (name: string) => must(watch.storage.find(([n]) => n === name), `spy ${name}`)[1].mock.calls;
    localStorage.setItem('canary', '1');
    expect(calls('setItem')).toEqual([['canary', '1']]);
    localStorage.getItem('canary');
    expect(calls('getItem')).toEqual([['canary']]);
    localStorage.removeItem('canary');
    expect(calls('removeItem')).toEqual([['canary']]);
    sessionStorage.clear();
    expect(calls('clear').length).toBe(1);
    sessionStorage.key(0);
    expect(calls('key').length).toBe(1);
    window.history.pushState(null, '', '/canary');
    expect(watch.push.mock.calls.length).toBe(1);
    window.history.replaceState(null, '', '/canary-two');
    expect(watch.replace.mock.calls[0]![2]).toBe('/canary-two');
    await expect(fetch('http://127.0.0.1:9/canary')).rejects.toThrow('no network in this test');
    expect(must(watch.fetch, 'the fetch spy').mock.calls.length).toBe(1);
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://127.0.0.1:9/canary');
    xhr.send();
    expect(watch.xhrOpen.mock.calls.length).toBe(1);
    expect(watch.xhrSend.mock.calls.length).toBe(1);
    navigator.sendBeacon('http://127.0.0.1:9/canary', 'x');
    expect(watch.beacon.mock.calls.length).toBe(1);
    // The cookie spy must exist (it is only undefined when the setter could not be spied on, which
    // would leave the cookie watch dead), and it must record a write.
    document.cookie = 'canary=1';
    expect(watch.cookie, 'the cookie spy is installed').toBeDefined();
    expect(must(watch.cookie, 'the cookie spy').mock.calls).toEqual([['canary=1']]);
    expect(document.cookie, 'the canary cookie is really set').toContain('canary=1');
    // The checker fails while the canary calls are still on the spies.
    expect(() => expectNoSideChannels('with the canary calls still on the spies')).toThrow();

    // Forget every canary but the cookie, and the checker still fails: the cookie watch is live on its own.
    for (const [, spy] of watch.storage) spy.mockClear();
    watch.push.mockClear();
    watch.replace.mockClear();
    watch.fetch?.mockClear();
    watch.xhrOpen.mockClear();
    watch.xhrSend.mockClear();
    watch.beacon.mockClear();
    openAt('/');
    expect(() => expectNoSideChannels('with only the cookie canary left')).toThrow(/cookie/);

    // Clear the cookie (max-age=0 expires it) and forget that write too, so this test's own
    // end-of-test check is clean.
    document.cookie = 'canary=; max-age=0';
    expect(document.cookie, 'the canary cookie is cleared').toBe('');
    must(watch.cookie, 'the cookie spy').mockClear();
    expectNoSideChannels('after the canary was forgotten');
  });

  it('a whole session of links, copy, remix, switch, zip and a bad link touches nothing', async () => {
    const user = userEvent.setup();
    const dl = stubDownload();

    // A link opens, Copy link, a remix with a paste and Mine on, a target switch, a zip.
    openAt(linkOf(golden('marty.openclaw.roles')));
    render(<App />);
    expect(shown()).toBe('certificate');
    tapCopyLink();
    await user.click(screen.getByRole('button', { name: copy.actions.downloadZip }));
    expect(dl.blobs).toHaveLength(1);
    await user.click(buttonNamed(makeFor('hermes')));
    expect(st().target).toBe('hermes');
    await user.click(screen.getByRole('button', { name: copy.buttons.remix }));
    expect(shown()).toBe('remix');
    await user.click(screen.getByRole('textbox', { name: PASTE_LABEL }));
    await user.paste(`${goldenPersonality('marty.hermes')}\n${NEW_LINE}`);
    await user.click(nextButton());
    for (let guard = 0; shown() !== 'certificate' && guard < 16; guard++) await user.click(nextButton());
    expect(shown()).toBe('certificate');
    await user.click(screen.getByRole('switch', { name: copy.certificate.mine.label }));
    expect(st().mineOn).toBe(true);
    const link = tapCopyLink();
    expect(payloadText(link)).not.toContain('Sundays');
    expectNoSideChannels('mid-session');

    // A starter's Use, then a bad link in a fresh render, then Start over.
    cleanup();
    act(() => {
      st().reset();
    });
    openAt(`${origin()}${pathname()}#b=@@@@`);
    render(<App />);
    expect(shown()).toBe('link-error');
    await user.click(buttonNamed(copy.linkError.startOver));
    expect(shown()).toBe('target');
    expectNoSideChannels('end of session');
  }, 60_000);

  it('the store has no persistence middleware: a reset forgets everything, and no state lives anywhere else', () => {
    openAt(linkOf(golden('june.muse')));
    render(<App />);
    store((s) => s.setPasted(NEW_LINE));
    cleanup();
    act(() => {
      st().reset();
    });
    expect(st().target).toBeNull();
    expect(st().pasted).toBe('');
    expect(st().baseline).toBeUndefined();
    expect(st().draft.name).toBe('');
    // A new render with a clean address starts on the target screen: nothing was restored.
    render(<App />);
    expect(shown()).toBe('target');
    expect(Object.keys(localStorage)).toEqual([]);
    expect(Object.keys(sessionStorage)).toEqual([]);
  });
});
