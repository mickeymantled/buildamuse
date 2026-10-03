// @vitest-environment jsdom
//
// Certificate review fixes, slice F3b. Renders <App/> in jsdom with the store loaded through
// loadBuild (a link, so the app opens on the certificate) and reads the page the way a person would,
// by role and accessible name. Covers the changes F3b made to the certificate screen:
//
//   1. Switch to Paid moves focus to the h1; the summary wrapper is a polite live region that stays in
//      the page even when it is empty.
//   2. The Details disclosure has a chevron.
//   3. Every copy button on the page has its own accessible name ("Copy <block title>", a custom rule
//      is named from its gate label), so a screen reader list of buttons tells them apart.
//   4. A long block is folded behind "Show full text"; Copy still copies all of it; the toggle carries
//      aria-expanded.
//   5. Copy link also sits at the top of the page, and copies the same link as the footer one.
//   6. A link certificate offers Build your own (which starts over at the target screen); a roster Use
//      certificate does not.
//   7. The length meter shows its hint when the personality is near the cap.
//
// Where the text of a line is set by the library it is read from the library tables (gate labels for
// the custom rule names, the heading text in the personality). UI strings (button names, headings, the
// hint) are read from src/ui/copy.ts. Where a test checks that the page shows what the compiler
// produced (the full personality text), the oracle is compile() on the same build: that is a rendering
// check, and the content of the output is pinned by the output, golden and certificate-model tests.
//
// What jsdom cannot do: it has no layout engine and no Tailwind stylesheet. Folding, the chevron turn
// and the capital letter on the hint are CSS, so those tests read the attributes and class names the
// CSS hangs on (aria-expanded, an inline max-height, group-open:rotate-180) and not pixels.

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compile } from '../src/compiler/compile.js';
import type { Build } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import { fromShareHash } from '../src/share/encode.js';
import { App } from '../src/ui/App.js';
import { Meter } from '../src/ui/components/Meter.js';
import { copy } from '../src/ui/copy.js';
import { previewBuild, useBuilder } from '../src/ui/store.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---- Fixed characters (kept out of the source as literals) ----

const EM = String.fromCharCode(0x2014);

// ---- Library lookups ----

function golden(id: string): Build {
  const spec = GOLDEN_SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`test setup: no golden ${id}`);
  return buildFor(spec, library);
}

function gateLabel(id: string): string {
  const found = library.gates.find((g) => g.id === id);
  if (!found) throw new Error(`test setup: no gate ${id}`);
  return found.label;
}

// ---- Store and DOM helpers ----

const st = () => useBuilder.getState();

function store(fn: (s: ReturnType<typeof st>) => void): void {
  act(() => {
    fn(st());
  });
}

// Loads a build as a link (so the app opens on the certificate) and renders the app.
function open(build: Build, opts: { warnings?: string[] } = {}): void {
  act(() => {
    st().loadBuild(build, { from: 'link', ...opts });
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
const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;

// The copy blocks and custom rule cards are role=group elements; the details element has an implicit
// group role that does not count, so the explicit attribute is read.
const blocksIn = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>('[role="group"]'));

// The title of a block: its h2 or h3, or for a custom rule card the action paragraph that labels it.
function titleOf(block: HTMLElement): string {
  const heading = block.querySelector('h2, h3');
  if (heading) return textOf(heading);
  const labelledBy = block.getAttribute('aria-labelledby');
  const label = labelledBy ? document.getElementById(labelledBy) : null;
  if (!label) throw new Error('test setup: a block with no title');
  return textOf(label);
}

// The accessible name of every button under root, as the browser would compute it (aria-label first,
// then the content). The name matcher is handed the computed name, so nothing is guessed here.
function buttonNames(root: HTMLElement = document.body): Map<HTMLElement, string> {
  const names = new Map<HTMLElement, string>();
  within(root).queryAllByRole('button', {
    name: (name, el) => {
      names.set(el as HTMLElement, name);
      return true;
    },
  });
  return names;
}

// Taps every Show more until none is left.
function expandAll(): void {
  for (let guard = 0; guard < 20; guard += 1) {
    const buttons = screen.queryAllByRole('button', { name: copy.certificate.showMore });
    if (buttons.length === 0) return;
    for (const button of buttons) fireEvent.click(button);
  }
}

const meter = () => screen.getByRole('meter');
const meterValue = () => Number(meter().getAttribute('aria-valuenow'));
const meterMax = () => Number(meter().getAttribute('aria-valuemax'));

// ---- Link helpers ----

const origin = () => window.location.origin;
const pathname = () => window.location.pathname;

// The build a copied link carries, through the real decoder.
function decodeLink(link: string): Build {
  return fromShareHash(new URL(link).hash, library).build;
}

// ---- Clipboard stub (execCommand is the first copy path inside the tap, W19) ----

interface Rig {
  copied: string[];
  exec: MockInstance;
}

let rig: Rig;

function stubClipboard(): Rig {
  const copied: string[] = [];
  const exec = vi.fn((command: string) => {
    const el = document.activeElement;
    copied.push(command === 'copy' && el instanceof HTMLTextAreaElement ? el.value : '');
    return true;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: exec });
  return { copied, exec };
}

beforeEach(() => {
  st().reset();
  window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  rig = stubClipboard();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'execCommand');
  st().reset();
  window.history.replaceState(null, '', '/');
});

// ============================================================================
// 1. Switch to Paid: focus and the live region
// ============================================================================

describe('Switch to Paid', () => {
  const build = golden('marty.chatgpt-instructions-free');
  const summaryHeading = () => screen.getByRole('heading', { name: copy.certificateUi.summaryHeading });
  const regionOf = (heading: HTMLElement) => heading.closest('[role="status"]') as HTMLElement;

  it('moves focus to the h1, because the button it was tapped on is gone', async () => {
    const user = userEvent.setup();
    open(build);
    const heading = h1();
    const button = screen.getByRole('button', { name: copy.gates.switchToPaid });
    await user.click(button);
    expect(st().plan).toBe('paid');
    expect(document.body.contains(button)).toBe(false);
    expect(document.activeElement).toBe(heading);
    expect(document.activeElement).toBe(h1());
    expect(textOf(h1())).toBe(copy.certificate.title('Marty'));
  });

  it('focuses the heading without scrolling the page', async () => {
    const user = userEvent.setup();
    open(build);
    const heading = h1();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    vi.mocked(window.scrollTo).mockClear();
    await user.click(screen.getByRole('button', { name: copy.gates.switchToPaid }));
    const onHeading = focus.mock.calls.filter((_, i) => focus.mock.contexts[i] === heading);
    expect(onHeading.length).toBeGreaterThan(0);
    for (const args of onHeading) expect(args[0]).toEqual({ preventScroll: true });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('keeps the summary in a polite, atomic live region', () => {
    open(build);
    const region = regionOf(summaryHeading());
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    // It is a status region, not an alert: nothing here should interrupt the reader.
    expect(region.getAttribute('role')).toBe('status');
  });

  it('changes the text inside the same live region node when the plan changes', async () => {
    const user = userEvent.setup();
    open(build);
    const region = regionOf(summaryHeading());
    expect(textOf(region)).toContain(copy.target.paidSteer);
    await user.click(screen.getByRole('button', { name: copy.gates.switchToPaid }));
    // Same node: a live region that is replaced instead of updated is not announced.
    expect(document.body.contains(region)).toBe(true);
    expect(regionOf(summaryHeading())).toBe(region);
    expect(textOf(region)).not.toContain(copy.target.paidSteer);
  });

  it('shows the summary heading only while there are summary lines', () => {
    open(build);
    expect(screen.getAllByRole('heading', { name: copy.certificateUi.summaryHeading })).toHaveLength(1);
    cleanup();
    open(golden('vera.muse'));
    expect(screen.queryByRole('heading', { name: copy.certificateUi.summaryHeading })).toBeNull();
  });

  it('keeps the live region in the page when the summary is empty, and fills the same node later', async () => {
    const user = userEvent.setup();
    open(golden('marty.muse'));
    const region = regionOf(summaryHeading());
    expect(textOf(region)).not.toBe('');

    // OpenClaw carries Marty's rules whole, so its summary is empty.
    await user.click(screen.getByRole('button', { name: copy.makeFor(copy.targetNames.openclaw) }));
    expect(screen.queryByRole('heading', { name: copy.certificateUi.summaryHeading })).toBeNull();
    expect(document.body.contains(region)).toBe(true);
    expect(textOf(region)).toBe('');
    expect(region.getAttribute('aria-live')).toBe('polite');

    // Back to Muse: the lines return inside the node that stayed.
    await user.click(screen.getByRole('button', { name: copy.makeFor(copy.targetNames.muse) }));
    expect(regionOf(summaryHeading())).toBe(region);
  });
});

// ============================================================================
// 2. Details: the chevron
// ============================================================================

describe('Details', () => {
  it('shows a chevron beside the label, hidden from screen readers', () => {
    open(golden('june.muse'));
    const details = document.querySelector('details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    const summary = details.querySelector('summary') as HTMLElement;
    expect(textOf(summary).trim()).toBe(copy.certificate.details.summary);
    const chevron = summary.querySelector('svg');
    expect(chevron).not.toBeNull();
    // The chevron is only a cue: the details element already says open or closed.
    expect(chevron?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('turns the chevron when open, through the details element and not through script', () => {
    open(golden('june.muse'));
    const details = document.querySelector('details') as HTMLDetailsElement;
    const chevron = details.querySelector('summary svg') as SVGElement;
    expect(details.classList.contains('group')).toBe(true);
    expect(chevron.getAttribute('class')).toContain('group-open:rotate-180');
    // Opening and closing the element does not remove or replace the chevron.
    act(() => {
      details.open = true;
    });
    expect(details.querySelector('summary svg')).toBe(chevron);
    act(() => {
      details.open = false;
    });
    expect(details.querySelector('summary svg')).toBe(chevron);
  });

  it('lists the raw warnings under the summary, one per line', () => {
    open(golden('june.muse'));
    const details = document.querySelector('details') as HTMLDetailsElement;
    const warnings = compile(golden('june.muse')).warnings;
    expect(warnings.length).toBeGreaterThan(0);
    const items = within(details).getAllByRole('listitem', { hidden: true }).map(textOf);
    for (const warning of warnings) expect(items).toContain(warning);
  });

  it('is not in the page when there is nothing to show', () => {
    open(golden('vera.muse'));
    expect(document.querySelector('details')).toBeNull();
    expect(screen.queryByText(copy.certificate.details.summary)).toBeNull();
  });
});

// ============================================================================
// 3. Copy buttons have names that tell them apart
// ============================================================================

describe('copy button names on june.grok.roles', () => {
  const build = golden('june.grok.roles');
  const BARE = copy.certificate.copyButton.label;
  const COPY_LINK = copy.actions.copyLink;

  // The names that start with the visible word, leaving the two Copy link buttons for their own test.
  function blockCopyNames(): string[] {
    return [...buttonNames(main()).values()].filter((n) => n.startsWith(BARE) && n !== COPY_LINK);
  }

  it('gives each block one copy button named "Copy <block title>"', () => {
    open(build);
    expandAll();
    const blocks = blocksIn(main());
    expect(blocks.length).toBeGreaterThan(8);
    for (const block of blocks) {
      const title = titleOf(block);
      const names = [...buttonNames(block).values()].filter((n) => n.startsWith(BARE));
      expect(names, title).toEqual([copy.certificateUi.copyBlock(title)]);
    }
  });

  it('has no two copy buttons with the same name', () => {
    open(build);
    expandAll();
    const names = blockCopyNames();
    expect(names.length).toBeGreaterThan(8);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it('leaves no copy button named only "Copy"', () => {
    open(build);
    expandAll();
    expect([...buttonNames(main()).values()].filter((n) => n === BARE)).toEqual([]);
  });

  it('keeps the visible word at the start of every name, so a voice command for "Copy" still lands', () => {
    open(build);
    expandAll();
    for (const [button, name] of buttonNames(main())) {
      if (!name.startsWith(BARE)) continue;
      if (name === COPY_LINK) continue;
      expect(textOf(button).trim(), name).toBe(BARE);
      expect(name.startsWith(textOf(button).trim()), name).toBe(true);
    }
  });

  it('tells the two Copy link buttons apart from the block buttons', () => {
    open(build);
    const links = screen.getAllByRole('button', { name: COPY_LINK });
    expect(links).toHaveLength(2);
    // Both are the same action on purpose, so they share a name; no block button reads like them.
    expect(blockCopyNames().includes(COPY_LINK)).toBe(false);
  });

  it('keeps the name after a copy, and says Copied through the status line', async () => {
    const user = userEvent.setup();
    open(build);
    const block = screen.getByRole('group', { name: copy.certificate.soul });
    const name = copy.certificateUi.copyBlock(copy.certificate.soul);
    await user.click(within(block).getByRole('button', { name }));
    expect(rig.exec).toHaveBeenCalledWith('copy');
    expect(within(block).getByRole('button', { name })).toBeTruthy();
    expect(textOf(within(block).getByRole('status'))).toBe(copy.certificate.copyButton.copied);
  });

  it('keeps every name in step with its title after the certificate is made for another target', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    await user.click(screen.getByRole('button', { name: copy.makeFor(copy.targetNames.grok) }));
    expandAll();
    const blocks = blocksIn(main());
    expect(blocks.length).toBeGreaterThan(2);
    for (const block of blocks) {
      const title = titleOf(block);
      const names = [...buttonNames(block).values()].filter((n) => n.startsWith(BARE));
      expect(names, title).toEqual([copy.certificateUi.copyBlock(title)]);
    }
    const all = blockCopyNames();
    expect(all.filter((n, i) => all.indexOf(n) !== i)).toEqual([]);
  });
});

describe('copy button names on the ChatGPT dot', () => {
  const build = golden('marty.chatgpt-dot');

  it('names each custom rule from its gate label, because the action text is too long to name it', () => {
    open(build);
    // Rendering oracle: the rows the compiler produced. The label for each is the library gate label.
    const rows = compile(build).customRules;
    expect(rows.length).toBeGreaterThan(1);
    const gates = rows.map((r) => r.gate);
    expect(new Set(gates).size, 'test setup: one rule per gate').toBe(gates.length);
    const expected = gates.map((g) => copy.certificateUi.copyBlock(gateLabel(g)));

    const cards = blocksIn(main()).filter((b) => b.closest('li') !== null && b.querySelector('pre') === null);
    expect(cards).toHaveLength(rows.length);
    const actual = cards.map((card) => {
      const names = [...buttonNames(card).values()].filter((n) => n.startsWith(copy.certificate.copyButton.label));
      expect(names).toHaveLength(1);
      return names[0];
    });
    expect(actual).toEqual(expected);
  });

  it('has no two copy buttons with the same name', () => {
    open(build);
    expandAll();
    const names = [...buttonNames(main()).values()].filter(
      (n) => n.startsWith(copy.certificate.copyButton.label) && n !== copy.actions.copyLink,
    );
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
});

// ============================================================================
// 4. A long block: Show full text
// ============================================================================

describe('a long personality block', () => {
  const build = golden('june.muse');
  // The engineer's reading (F3b report): a block folds when it is more than 12 lines as the reader sees
  // them, trailing newlines ignored. A long line wraps, so it takes several rows. The component does not
  // measure layout, so it estimates 40 characters a row. About 44 fit the 430px column and about 37 fit
  // a 375px phone, so the tests hold the line only where those two agree: over 12 at 44 must fold, and
  // not over 12 at 37 must stay open. A block between the two may go either way (the engineer's note).
  const FOLD_OVER = 12;
  const lineCount = (text: string) => text.replace(/\n+$/, '').split('\n').length;
  const rows = (text: string, perRow: number) =>
    text
      .replace(/\n+$/, '')
      .split('\n')
      .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perRow)), 0);
  const WIDE_ROW = 44;
  const NARROW_ROW = 37;

  const group = () => screen.getByRole('group', { name: copy.certificate.soul });
  const pre = () => group().querySelector('pre') as HTMLPreElement;
  const showFull = () => within(group()).getByRole('button', { name: copy.certificateUi.showFullText });
  const copyName = copy.certificateUi.copyBlock(copy.certificate.soul);
  const copyButton = () => within(group()).getByRole('button', { name: copyName });

  // The rendering oracle for the full text: the soul the compiler produced for this build.
  const soul = () => compile(build).soul;

  it('is long enough to fold, and shows Show full text, closed', () => {
    open(build);
    expect(lineCount(textOf(pre()))).toBeGreaterThan(FOLD_OVER);
    const button = showFull();
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    // The button names the block it controls.
    expect(button.getAttribute('aria-controls')).toBe(pre().id);
    expect(pre().id).not.toBe('');
  });

  it('folds with a height limit and a fade, with the whole text still in the page', () => {
    open(build);
    expect(pre().style.maxHeight).not.toBe('');
    // The fade is a decorative div over the foot of the pre; the chevron svg is not it.
    expect(group().querySelector('div[aria-hidden="true"]')).not.toBeNull();
    const full = soul().trim();
    const lastLine = full.split('\n').pop() as string;
    expect(textOf(pre())).toContain(lastLine);
    expect(textOf(pre()).trim()).toBe(full);
  });

  it('copies the full text while folded, not the folded part', async () => {
    const user = userEvent.setup();
    open(build);
    expect(showFull().getAttribute('aria-expanded')).toBe('false');
    await user.click(copyButton());
    expect(rig.copied).toHaveLength(1);
    const copied = rig.copied[0];
    expect(copied).toBe(textOf(pre()));
    expect(copied.trim()).toBe(soul().trim());
    expect(lineCount(copied)).toBeGreaterThan(FOLD_OVER);
  });

  it('expands on Show full text: aria-expanded true, the height limit and the fade gone, label unchanged', async () => {
    const user = userEvent.setup();
    open(build);
    const label = textOf(showFull()).trim();
    expect(label).toBe(copy.certificateUi.showFullText);
    await user.click(showFull());
    const button = showFull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    // The name stays the same open or closed; aria-expanded and the chevron carry the state.
    expect(textOf(button).trim()).toBe(label);
    expect(pre().style.maxHeight).toBe('');
    expect(group().querySelector('div[aria-hidden="true"]')).toBeNull();
  });

  it('still copies the full text once open, and folds again on a second tap', async () => {
    const user = userEvent.setup();
    open(build);
    await user.click(showFull());
    await user.click(copyButton());
    expect(rig.copied[rig.copied.length - 1].trim()).toBe(soul().trim());
    await user.click(showFull());
    expect(showFull().getAttribute('aria-expanded')).toBe('false');
    expect(pre().style.maxHeight).not.toBe('');
  });

  it('turns the chevron with the state, and keeps a 44px target', async () => {
    const user = userEvent.setup();
    open(build);
    const chevron = () => showFull().querySelector('svg') as SVGElement;
    expect(chevron()).not.toBeNull();
    expect(chevron().getAttribute('aria-hidden')).toBe('true');
    expect(chevron().getAttribute('class') ?? '').not.toContain('rotate-180');
    expect(showFull().className).toContain('min-h-[44px]');
    await user.click(showFull());
    expect(chevron().getAttribute('class') ?? '').toContain('rotate-180');
  });

  it('folds exactly the blocks of more than 12 lines, on several builds', () => {
    // The two cases the rule has to tell apart must both turn up: a block of 12 lines or fewer that folds
    // because its long lines wrap, and a short block that stays open.
    let foldedByWrapOnly = 0;
    let stayedOpen = 0;
    for (const id of ['june.muse', 'marty.openclaw', 'rook.hermes.roles', 'odds.muse', 'june.grok.roles']) {
      cleanup();
      open(golden(id));
      expandAll();
      let folded = 0;
      for (const block of blocksIn(main())) {
        const preEl = block.querySelector('pre');
        if (!preEl) continue;
        const where = `${id}: ${titleOf(block)}`;
        const text = textOf(preEl);
        const toggle = within(block).queryAllByRole('button', { name: copy.certificateUi.showFullText });
        const isFolded = toggle.length === 1;
        expect(toggle.length, where).toBeLessThanOrEqual(1);
        // The button and the height limit go together.
        expect(preEl.style.maxHeight !== '', where).toBe(isFolded);
        if (rows(text, WIDE_ROW) > FOLD_OVER) expect(isFolded, `${where} is long at any width`).toBe(true);
        if (rows(text, NARROW_ROW) <= FOLD_OVER) expect(isFolded, `${where} is short at any width`).toBe(false);
        if (isFolded) folded += 1;
        if (isFolded && lineCount(text) <= FOLD_OVER) foldedByWrapOnly += 1;
        if (!isFolded) stayedOpen += 1;
      }
      expect(folded, id).toBeGreaterThan(0);
      expect(screen.queryAllByRole('button', { name: copy.certificateUi.showFullText })).toHaveLength(folded);
    }
    expect(foldedByWrapOnly, 'a block of 12 lines or fewer folded by wrapping').toBeGreaterThan(0);
    expect(stayedOpen, 'a short block stayed open').toBeGreaterThan(0);
  });

  it('gives every Show full text button its own block (one aria-controls target each)', () => {
    open(golden('june.grok.roles'));
    expandAll();
    const buttons = screen.getAllByRole('button', { name: copy.certificateUi.showFullText });
    expect(buttons.length).toBeGreaterThan(2);
    const targets = buttons.map((b) => b.getAttribute('aria-controls') as string);
    expect(new Set(targets).size).toBe(targets.length);
    for (const id of targets) {
      const el = document.getElementById(id);
      expect(el?.tagName).toBe('PRE');
    }
  });
});

// ============================================================================
// 5. Copy link at the top
// ============================================================================

describe('Copy link at the top of the page', () => {
  const copyLinks = () => screen.getAllByRole('button', { name: (n) => n === copy.actions.copyLink || n === copy.actions.linkCopied });

  it('shows two Copy link buttons: one under the header, one in the footer', () => {
    open(golden('june.muse'));
    const [top, footer, ...rest] = copyLinks();
    expect(rest).toEqual([]);
    expect(top).not.toBe(footer);
    // The top one is after the heading and before the summary and the steps; the footer one is after them.
    expect(h1().compareDocumentPosition(top) & FOLLOWING).toBeTruthy();
    expect(top.compareDocumentPosition(stepList()) & FOLLOWING).toBeTruthy();
    expect(stepList().compareDocumentPosition(footer) & FOLLOWING).toBeTruthy();
  });

  it('says why to copy it first, beside the top button, once', () => {
    open(golden('june.muse'));
    const note = screen.getAllByText(copy.certificateUi.leavingNote);
    expect(note).toHaveLength(1);
    const [top, footer] = copyLinks();
    expect(top.parentElement).toBe(note[0].parentElement);
    expect(footer.parentElement).not.toBe(note[0].parentElement);
  });

  it('copies the same link from the top and the footer', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    const [top, footer] = copyLinks();
    await user.click(top);
    expect(rig.copied).toHaveLength(1);
    await user.click(footer);
    expect(rig.copied).toHaveLength(2);
    const [fromTop, fromFooter] = rig.copied;
    expect(fromTop).toBe(fromFooter);
    // Origin and path, then the hash. It decodes, through the real decoder, to the build in the store.
    expect(fromTop.startsWith(`${origin()}${pathname()}#b=`)).toBe(true);
    expect(decodeLink(fromTop)).toEqual(previewBuild(st()));
  });

  it('copies inside the tap, through the textarea path', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    await user.click(copyLinks()[0]);
    expect(rig.exec).toHaveBeenCalledWith('copy');
    expect(rig.exec).toHaveBeenCalledTimes(1);
  });

  it('keeps both buttons on the same link after the build changes', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    const [top, footer] = copyLinks();
    await user.click(top);
    const before = rig.copied[0];
    store((s) => s.setName('Zephyr'));
    // Two seconds later the buttons read Copy link again; here the tapped one may still say Link copied.
    const [top2, footer2] = copyLinks();
    await user.click(top2);
    await user.click(footer2);
    const [, fromTop, fromFooter] = rig.copied;
    expect(fromTop).toBe(fromFooter);
    expect(fromTop).not.toBe(before);
    expect(decodeLink(fromTop).name).toBe('Zephyr');
    expect(footer).toBeTruthy();
  });

  it('confirms on the button that was tapped', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    const [top] = copyLinks();
    await user.click(top);
    expect(textOf(top)).toContain(copy.actions.linkCopied);
  });

  it('copies a link with no Mine text in it', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    store((s) => {
      s.setPasted('Never schedule anything before nine on weekdays.');
      s.setMineOn(true);
    });
    await user.click(copyLinks()[0]);
    const link = rig.copied[0];
    expect(decodeURIComponent(link)).not.toContain('Never schedule');
    expect(Buffer.from(link.split('#b=')[1] ?? '', 'base64url').toString('utf8')).not.toContain('Never schedule');
  });
});

// ============================================================================
// 6. Build your own
// ============================================================================

describe('Build your own', () => {
  const buildYourOwn = () => screen.queryByRole('button', { name: copy.buttons.buildYourOwn });

  it('shows on a link certificate', () => {
    open(golden('june.muse'));
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('link');
    const button = buildYourOwn();
    expect(button).not.toBeNull();
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.className).toContain('min-h-[44px]');
    // A link certificate has nothing behind it, so there is no Back; this is the way out.
    expect(screen.queryByRole('button', { name: copy.buttons.back })).toBeNull();
  });

  it('starts over at the target screen, with nothing left of the link', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'), { warnings: ['a pick in this link was reset'] });
    store((s) => s.setPasted('Never schedule anything before nine on weekdays.'));
    await user.click(buildYourOwn() as HTMLElement);
    expect(shown()).toBe('target');
    expect(st().screen).toBe('target');
    expect(st().from).toBeNull();
    expect(st().target).toBeNull();
    expect(st().decodeWarnings).toEqual([]);
    expect(st().drops).toEqual([]);
    expect(st().baseline).toBeUndefined();
    expect(st().pasted).toBe('');
    expect(st().mineOn).toBe(false);
    // The certificate is gone with its footer.
    expect(screen.queryByRole('button', { name: copy.actions.copyLink })).toBeNull();
    expect(buildYourOwn()).toBeNull();
  });

  it('is not shown on a roster Use certificate, which has Back instead', () => {
    store((s) => {
      s.setTarget('muse');
      s.useStarter('june');
    });
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('roster');
    expect(buildYourOwn()).toBeNull();
    expect(screen.getByRole('button', { name: copy.buttons.back })).toBeTruthy();
  });

  it('is not shown on a certificate reached by building your own', () => {
    store((s) => {
      s.setTarget('muse');
      s.startBlank();
      s.setBase('trader');
      s.setName('Zed');
      s.go('certificate');
    });
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('blank');
    expect(buildYourOwn()).toBeNull();
  });

  it('is not shown on a certificate reached by remixing a starter', () => {
    store((s) => {
      s.setTarget('muse');
      s.remixStarter('june');
      s.go('certificate');
    });
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('remix');
    expect(buildYourOwn()).toBeNull();
  });

  it('stays on a link certificate after it is made for another target', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    await user.click(screen.getByRole('button', { name: copy.makeFor(copy.targetNames.hermes) }));
    expect(st().target).toBe('hermes');
    expect(st().from).toBe('link');
    expect(buildYourOwn()).not.toBeNull();
  });

  it('comes back after a Remix and Back (W39), because a link certificate stays a link certificate', async () => {
    const user = userEvent.setup();
    open(golden('june.muse'));
    await user.click(screen.getByRole('button', { name: copy.buttons.remix }));
    expect(shown()).toBe('remix');
    expect(buildYourOwn()).toBeNull();
    store((s) => s.back());
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('link');
    expect(buildYourOwn()).not.toBeNull();
  });
});

// ============================================================================
// 7. The meter near the cap
// ============================================================================

describe('Meter, component', () => {
  const hint = copy.certificate.meter.hint;

  it('shows the hint under the bar when near, and ties it to the meter', () => {
    render(<Meter label="Length" value={90} cap={100} valueLabel="90 of 100" near hint={hint} />);
    const shownHint = screen.getByText(hint);
    expect(textOf(shownHint)).toBe(hint);
    expect(screen.getByRole('meter').getAttribute('aria-describedby')).toBe(shownHint.id);
    expect(shownHint.id).not.toBe('');
    // After the bar, not before it.
    expect(screen.getByRole('meter').compareDocumentPosition(shownHint) & FOLLOWING).toBeTruthy();
  });

  it('marks the near caption with the alert icon, so it never relies on color alone', () => {
    render(<Meter label="Length" value={90} cap={100} valueLabel="90 of 100" near hint={hint} />);
    const caption = screen.getByText('90 of 100');
    expect(caption.querySelector('svg')).not.toBeNull();
    expect(caption.className).toContain('font-semibold');
  });

  it('shows no hint and no icon when not near', () => {
    render(<Meter label="Length" value={50} cap={100} valueLabel="50 of 100" hint={hint} />);
    expect(screen.queryByText(hint)).toBeNull();
    expect(screen.getByRole('meter').getAttribute('aria-describedby')).toBeNull();
    expect(screen.getByText('50 of 100').querySelector('svg')).toBeNull();
  });

  it('shows no hint when near with no hint to show', () => {
    const { rerender } = render(<Meter label="Length" value={90} cap={100} valueLabel="90 of 100" near />);
    expect(screen.getByRole('meter').getAttribute('aria-describedby')).toBeNull();
    rerender(<Meter label="Length" value={90} cap={100} valueLabel="90 of 100" near hint="" />);
    expect(screen.getByRole('meter').getAttribute('aria-describedby')).toBeNull();
    expect(document.querySelectorAll('p')).toHaveLength(0);
  });

  it('is full but not over at the cap, and still near', () => {
    render(<Meter label="Length" value={100} cap={100} valueLabel="100 of 100" overLabel="Over by 0" near hint={hint} />);
    expect(screen.getByText(hint)).toBeTruthy();
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('100 of 100');
  });

  it('lets over win over near: the over text shows and the hint does not', () => {
    render(
      <Meter label="Length" value={120} cap={100} valueLabel="120 of 100" overLabel="Over by 20" near hint={hint} />,
    );
    expect(screen.queryByText(hint)).toBeNull();
    expect(screen.getByRole('meter').getAttribute('aria-describedby')).toBeNull();
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('Over by 20');
    const caption = screen.getByText('Over by 20');
    expect(caption.querySelector('svg')).not.toBeNull();
  });

  it('shows the hint text as written, with no case change in the page text', () => {
    render(<Meter label="Length" value={90} cap={100} valueLabel="90 of 100" near hint={hint} />);
    // The capital letter is CSS (first-letter), so the text a screen reader gets is the library string.
    expect(textOf(screen.getByText(hint))).toBe(hint);
    expect(screen.getByText(hint).className).toContain('first-letter:uppercase');
  });
});

describe('Meter, on the certificate', () => {
  const hint = copy.certificate.meter.hint;

  it('shows the hint on a personality close to the cap (Marty on Muse)', () => {
    open(golden('marty.muse'));
    // Precondition: this build sits just under its cap.
    expect(meterValue()).toBeLessThanOrEqual(meterMax());
    expect(meterMax() - meterValue()).toBeLessThanOrEqual(200);
    const shownHint = screen.getByText(hint);
    expect(textOf(shownHint)).toBe(hint);
    expect(meter().getAttribute('aria-describedby')).toBe(shownHint.id);
    expect(meter().compareDocumentPosition(shownHint) & FOLLOWING).toBeTruthy();
  });

  it('shows the alert icon on the near caption, with the length text', () => {
    open(golden('marty.muse'));
    const caption = screen.getByText(copy.preview.length(meterValue(), meterMax()));
    expect(caption.querySelector('svg')).not.toBeNull();
  });

  it('shows the hint on a near build for every target that has one', () => {
    for (const id of ['june.muse', 'june.openclaw', 'june.hermes', 'june.grok', 'june.chatgpt-dot', 'june.chatgpt-instructions-paid']) {
      cleanup();
      open(golden(id));
      expect(meterMax() - meterValue(), id).toBeGreaterThanOrEqual(0);
      expect(meterMax() - meterValue(), id).toBeLessThanOrEqual(500);
      expect(screen.queryAllByText(hint), id).toHaveLength(1);
    }
  });

  it('shows no hint on a personality well under the cap (Sol on Muse)', () => {
    open(golden('sol.muse'));
    // Precondition: this build is far from its cap.
    expect(meterMax() - meterValue()).toBeGreaterThan(800);
    expect(screen.queryByText(hint)).toBeNull();
    expect(meter().getAttribute('aria-describedby')).toBeNull();
    const caption = screen.getByText(copy.preview.length(meterValue(), meterMax()));
    expect(caption.querySelector('svg')).toBeNull();
  });

  it('shows the over line and no near hint when over the cap (Marty on free custom instructions)', () => {
    open(golden('marty.chatgpt-instructions-free'));
    const over = meterValue() - meterMax();
    expect(over).toBeGreaterThan(0);
    expect(screen.getByText(copy.preview.over(over))).toBeTruthy();
    expect(screen.queryByText(hint)).toBeNull();
    expect(meter().getAttribute('aria-describedby')).toBeNull();
  });

  it('shows the hint after Switch to Paid when the build then sits just under the Paid cap', async () => {
    const user = userEvent.setup();
    open(golden('marty.chatgpt-instructions-free'));
    expect(screen.queryByText(hint)).toBeNull();
    await user.click(screen.getByRole('button', { name: copy.gates.switchToPaid }));
    // Precondition: Marty fits Paid with little room to spare.
    expect(meterValue()).toBeLessThanOrEqual(meterMax());
    expect(meterMax() - meterValue()).toBeLessThanOrEqual(400);
    expect(screen.getByText(hint)).toBeTruthy();
  });
});

// ============================================================================
// The Left out hint, and the new strings
// ============================================================================

describe('Left out hint', () => {
  const hintAfterHeading = () => {
    const heading = screen.getByRole('heading', { name: copy.certificate.groups.leftOut });
    return textOf(heading.parentElement?.querySelector('p') as Element);
  };

  it('reads the general hint on a profile with rules files (Marty on Muse)', () => {
    open(golden('marty.muse'));
    expect(hintAfterHeading()).toBe(copy.certificate.sections.leftOutHint);
  });

  it('reads the dot hint on the ChatGPT dot, which holds only approvals as rules', () => {
    open(golden('marty.chatgpt-dot'));
    expect(hintAfterHeading()).toBe(copy.certificate.sections.leftOutDotHint);
    expect(screen.queryByText(copy.certificate.sections.leftOutHint)).toBeNull();
  });
});

describe('the strings F3b added', () => {
  it('have no em dash and no leading or trailing space', () => {
    const strings = [
      copy.certificateUi.leavingNote,
      copy.certificateUi.summaryHeading,
      copy.certificateUi.copyBlock('Personality'),
      copy.certificateUi.showFullText,
    ];
    for (const text of strings) {
      expect(text.includes(EM), text).toBe(false);
      expect(text, text).toBe(text.trim());
      expect(text.length, text).toBeGreaterThan(0);
    }
  });

  it('read as the engineer wrote them (pinned so a change is a decision)', () => {
    expect(copy.certificateUi.leavingNote).toBe('Leaving to paste? Copy the link first so you can come back.');
    expect(copy.certificateUi.summaryHeading).toBe('Before you copy');
    expect(copy.certificateUi.copyBlock('Personality')).toBe('Copy Personality');
    expect(copy.certificateUi.showFullText).toBe('Show full text');
  });

  it('leave no em dash anywhere on the certificate page', () => {
    for (const id of ['june.grok.roles', 'marty.chatgpt-dot', 'marty.chatgpt-instructions-free']) {
      cleanup();
      open(golden(id));
      expandAll();
      expect(textOf(main()).includes(EM), id).toBe(false);
      for (const el of main().querySelectorAll('[aria-label]')) {
        expect((el.getAttribute('aria-label') ?? '').includes(EM), id).toBe(false);
      }
    }
  });

  it('keep the page tap-only: no text input on the certificate', () => {
    open(golden('june.grok.roles'));
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});
