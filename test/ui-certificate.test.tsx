// @vitest-environment jsdom
//
// Certificate screen tests (M4 slice 4.12). Renders <App/> in jsdom with the store loaded through
// loadBuild (a link, so the screen opens on the certificate) and reads the page the way a person
// would, by role and accessible name.
//
// Expected behavior comes from docs/M4-PLAN.md sections 4, 5, 6 (the Mine switch), 9 and 10, and
// QUESTIONS.md W5 (header, tagline, radar), W6 (copy blocks, Standing instructions, the Dot table),
// W12 (Mine), W15 (skipped lines), W16 (summary lines), W17 (the Paid steer), W19 (copy inside the
// tap), W25 and W34 (trimmed rules), W33 (the role step) and W36 (Mine and the trace).
//
// Where the text of a line is set by the library it is read from the library tables: install step
// lines, the Dot rules path, the rule setting labels, gate rule text, role labels, skill names, the
// verify lines, the docs labels and dates, the roster taglines and build names. UI strings (headings,
// button labels, summary sentences) are read from src/ui/copy.ts. Where a test checks that the page
// shows what the compiler produced (every file, spoken item, starter and warning appears once), the
// oracle is compile() on the same build: that is a rendering check, and the content of the output is
// pinned by the output, golden and certificate-model tests.
//
// What jsdom cannot do: it has no layout engine and no Tailwind stylesheet, so getBoundingClientRect
// is all zeros. The 375px tests therefore read the class names (wrap classes on long text, no fixed
// widths over 375px, 44px targets) and not pixel widths. Contrast (4.5:1 for Still checking) is not
// testable here either; the tests do not pin it.

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compile } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import type { Build, Profile, ProfileId } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import type { Drop } from '../src/share/encode.js';
import { App } from '../src/ui/App.js';
import { copy } from '../src/ui/copy.js';
import { certificateInput, certificateModelOf } from '../src/ui/certificate/input.js';
import { compiled, isCompileError, useBuilder } from '../src/ui/store.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';

// ---- Fixed characters (kept out of the source as literals) ----

const EM = String.fromCharCode(0x2014);

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

function roleLabel(id: string): string {
  const found = library.roles.find((r) => r.id === id);
  if (!found) throw new Error(`test setup: no role ${id}`);
  return found.label;
}

function gateOf(id: string) {
  const found = library.gates.find((g) => g.id === id);
  if (!found) throw new Error(`test setup: no gate ${id}`);
  return found;
}

function packOf(id: string) {
  const found = library.packs.find((p) => p.id === id);
  if (!found) throw new Error(`test setup: no pack ${id}`);
  return found;
}

function chipOf(id: string) {
  const found = library.chips.find((c) => c.id === id);
  if (!found) throw new Error(`test setup: no chip ${id}`);
  return found;
}

const stripVerify = (text: string): string => text.replace(/^verify:\s*/i, '');

// ---- Store and DOM helpers ----

const st = () => useBuilder.getState();

function store(fn: (s: ReturnType<typeof st>) => void): void {
  act(() => {
    fn(st());
  });
}

// Loads a build as a link (so the app opens on the certificate) and renders the app.
function open(build: Build, opts: { warnings?: string[]; drops?: Drop[] } = {}): void {
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
const stepList = () => screen.getByRole('list', { name: copy.certificate.steps });
const stepItems = () => Array.from(stepList().children) as HTMLElement[];
// The text of a step: the first paragraph in its list item.
const stepText = (li: HTMLElement) => li.querySelector('p')?.textContent ?? '';
// The number badge of a step.
const stepNumber = (li: HTMLElement) => li.querySelector('span')?.textContent ?? '';
const textOf = (el: Element) => el.textContent ?? '';

function stepWith(text: string): HTMLElement {
  const found = stepItems().find((li) => stepText(li) === text);
  if (!found) throw new Error(`no step reads "${text}"`);
  return found;
}

// The copy blocks of a group are role=group elements; the details element has an implicit group role
// that does not count, so the explicit attribute is read.
const blocksIn = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>('[role="group"]'));

// The text a block copies: its pre, or for a custom rule card the action paragraph.
function copyTextOf(block: HTMLElement): string {
  const pre = block.querySelector('pre');
  return pre ? textOf(pre) : textOf(block.querySelector('p') as HTMLElement);
}

const copyButtonIn = (block: HTMLElement) =>
  within(block).getByRole('button', { name: copy.certificate.copyButton.label });

// Taps every Show more until none is left.
function expandAll(): void {
  for (let guard = 0; guard < 20; guard += 1) {
    const buttons = screen.queryAllByRole('button', { name: copy.certificate.showMore });
    if (buttons.length === 0) return;
    for (const button of buttons) fireEvent.click(button);
  }
}

// The h3 or h2 titles of the blocks in a step, in order.
const blockTitles = (root: HTMLElement) => blocksIn(root).map((b) => textOf(b.querySelector('h2, h3') as Element));

const meterValue = () => Number(screen.getByRole('meter').getAttribute('aria-valuenow'));
const meterMax = () => Number(screen.getByRole('meter').getAttribute('aria-valuemax'));

// One build per delivery profile, Marty on each, for the tests that run on every target.
const TARGETS: { name: string; profile: ProfileId; build: () => Build }[] = [
  { name: 'muse', profile: 'muse', build: () => golden('marty.muse') },
  { name: 'openclaw', profile: 'openclaw', build: () => golden('marty.openclaw') },
  { name: 'hermes', profile: 'hermes', build: () => golden('marty.hermes') },
  { name: 'grok', profile: 'grok', build: () => golden('marty.grok') },
  { name: 'chatgpt dot', profile: 'chatgpt-dot', build: () => golden('marty.chatgpt-dot') },
  { name: 'chatgpt project', profile: 'chatgpt-project', build: () => golden('marty.chatgpt-project') },
  { name: 'chatgpt instructions free', profile: 'chatgpt-instructions', build: () => golden('marty.chatgpt-instructions-free') },
  { name: 'chatgpt instructions paid', profile: 'chatgpt-instructions', build: () => golden('marty.chatgpt-instructions-paid') },
  { name: 'chatgpt gpt', profile: 'chatgpt-gpt', build: () => gptBuild('marty') },
];

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
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  rig = stubClipboard();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (document as unknown as Record<string, unknown>).execCommand;
  st().reset();
});

// ============================================================================
// Header (W5)
// ============================================================================

describe('header', () => {
  const june = golden('june.muse');
  const juneEntry = rosterEntry('june');

  it('opens a link on the certificate, with "Meet <Name>" as the only h1', () => {
    open(june);
    expect(shown()).toBe('certificate');
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    // The spec's heading, typed in from QUESTIONS W5, and the copy function that builds it.
    expect(textOf(h1s[0])).toBe('Meet June');
    expect(textOf(h1s[0])).toBe(copy.certificate.title('June'));
  });

  it('shows the build name from the library roster', () => {
    open(june);
    expect(screen.getByText(juneEntry.buildName)).toBeTruthy();
  });

  it('shows the tagline for an unmodified starter', () => {
    open(june);
    expect(screen.getByText(juneEntry.tagline)).toBeTruthy();
  });

  it.each(['openclaw', 'hermes', 'grok', 'chatgpt-dot'] as const)(
    'shows the starter tagline on %s too, because a starter moved to another target is still that starter',
    (suffix) => {
      open(golden(`june.${suffix}`));
      expect(screen.getByText(juneEntry.tagline)).toBeTruthy();
    },
  );

  it('drops the tagline after a name change', () => {
    open(june);
    expect(screen.queryByText(juneEntry.tagline)).not.toBeNull();
    store((s) => s.setName('Zephyr'));
    expect(textOf(screen.getByRole('heading', { level: 1 }))).toBe(copy.certificate.title('Zephyr'));
    expect(screen.queryByText(juneEntry.tagline)).toBeNull();
    // The build name stays: it comes from the picks, not the name.
    expect(screen.getByText(juneEntry.buildName)).toBeTruthy();
  });

  it('drops the tagline after a slider change', () => {
    open(june);
    store((s) => s.setStat('warm', 2));
    expect(screen.queryByText(juneEntry.tagline)).toBeNull();
  });

  it('shows no tagline for a link that carries a changed name', () => {
    open({ ...june, name: 'Zephyr' });
    expect(screen.queryByText(juneEntry.tagline)).toBeNull();
  });

  it('shows no roster tagline for a custom build (the library has no tagline table)', () => {
    store((s) => {
      s.setTarget('muse');
      s.startBlank();
      s.setBase('trader');
      s.setName('Custom');
      s.go('certificate');
    });
    render(<App />);
    expect(shown()).toBe('certificate');
    for (const entry of library.roster) {
      expect(screen.queryByText(entry.tagline), entry.id).toBeNull();
    }
  });

  it('draws the radar with five axes and a text alternative that names every stat and level', () => {
    open(june);
    const radar = screen.getByRole('img', { name: /^Slider levels/ });
    const label = radar.getAttribute('aria-label') ?? '';
    const stats = rosterEntry('june').build.stats;
    for (const stat of ['blunt', 'warm', 'funny', 'chatty', 'proactive'] as const) {
      const level = stats[stat];
      expect(level, stat).toBeDefined();
      expect(label, stat).toContain(`${copy.stats.labels[stat]} ${level} of 4`);
    }
    // June has no Markets chip, so there is no risk axis.
    expect(label).not.toContain(copy.stats.labels.risk);
    expect(radar.querySelectorAll('text')).toHaveLength(5);
  });

  it('draws six axes when the build has risk', () => {
    open(golden('marty.muse'));
    const radar = screen.getByRole('img', { name: /^Slider levels/ });
    const label = radar.getAttribute('aria-label') ?? '';
    const stats = rosterEntry('marty').build.stats;
    for (const stat of ['blunt', 'warm', 'funny', 'chatty', 'proactive', 'risk'] as const) {
      expect(label, stat).toContain(`${copy.stats.labels[stat]} ${stats[stat]} of 4`);
    }
    expect(radar.querySelectorAll('text')).toHaveLength(6);
  });

  it('shows the badges the chips unlock as pills', () => {
    open(golden('marty.muse'));
    const list = screen.getByRole('list', { name: copy.stats.badgesHeading });
    const names = within(list)
      .getAllByRole('listitem')
      .map(textOf);
    // The memecoins chip unlocks Chase Caller (library chips and badges).
    const chipBadge = chipOf('memecoins').unlocks?.badges?.[0];
    const badge = library.badges.find((b) => b.id === chipBadge);
    expect(badge).toBeDefined();
    expect(names).toContain(badge?.name);
  });

  it('has no text input on the certificate (tap-only)', () => {
    open(june);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});

// ============================================================================
// Muse June: the spec lines, Standing instructions, copy blocks
// ============================================================================

describe('Muse June', () => {
  const build = golden('june.muse');
  const muse = profileById('muse');
  const STEPS = muse.installSteps.map((s) => s.line);

  it('has the four install lines in the library, with the last as the closer', () => {
    expect(STEPS).toHaveLength(4);
    expect(muse.installSteps[3].closer).toBe(true);
  });

  it('shows the three numbered spec lines in order, and the closer last without a number', () => {
    open(build);
    const items = stepItems();
    expect(items.map(stepText)).toEqual(STEPS.slice(0, 3));
    expect(items.map(stepNumber)).toEqual(['1', '2', '3']);

    const closer = screen.getByText(STEPS[3]);
    const list = stepList();
    // Not in the numbered list, and after every numbered step.
    expect(list.contains(closer)).toBe(false);
    expect(list.compareDocumentPosition(closer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And before the sections that follow the steps.
    const leftOut = screen.getByRole('heading', { name: copy.certificate.groups.leftOut });
    expect(closer.compareDocumentPosition(leftOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No number is drawn beside it.
    expect(closer.closest('li')).toBeNull();
  });

  it('puts the personality under step 1 and the memory sentence under step 2', () => {
    open(build);
    const [one, two] = stepItems();
    expect(blockTitles(one)).toEqual([copy.certificate.soul]);
    expect(blockTitles(two)).toEqual([copy.certificate.seed]);
    // The library's path for the Muse personality is shown on its block.
    expect(textOf(one)).toContain(muse.personalityPath);
    expect(textOf(two.querySelector('pre') as Element)).toMatch(/^Remember that /);
  });

  // The names of the skills and routines June's picks ask for, read from the library: the chips and
  // the pack, one block per distinct name.
  function standingNames(): string[] {
    const names = new Set<string>();
    for (const id of build.chips) for (const skill of chipOf(id).skills ?? []) names.add(skill.name);
    for (const id of build.packs) for (const skill of packOf(id).skills) names.add(skill.name);
    return [...names];
  }

  it('Standing instructions shows three blocks, then Show more reveals the rest', () => {
    open(build);
    const step3 = stepItems()[2];
    const heading = within(step3).getByRole('heading', { level: 2, name: copy.certificate.groups.standing });
    expect(heading).toBeTruthy();

    const total = standingNames().length;
    expect(total, 'June asks for more than three, so the group needs Show more').toBeGreaterThan(3);
    expect(blocksIn(step3)).toHaveLength(3);
    const showMore = within(step3).getByRole('button', { name: copy.certificate.showMore });

    fireEvent.click(showMore);
    expect(blocksIn(step3)).toHaveLength(total);
    expect(within(step3).queryByRole('button', { name: copy.certificate.showMore })).toBeNull();
    // Show more is one way: there is no Show less.
    expect(screen.queryByRole('button', { name: /show less/i })).toBeNull();

    // Every library name has a block, and the routine (a schedule skill) comes after the skills.
    const titles = blockTitles(step3);
    for (const name of standingNames()) {
      expect(titles.some((t) => t.includes(name)), name).toBe(true);
    }
    const routineName = packOf('personal-ops').skills.find((s) => s.kind === 'schedule')?.name as string;
    expect(titles[titles.length - 1]).toContain(routineName);
  });

  it('starts with the kids chip\'s trigger skill, because skills come before routines', () => {
    open(build);
    const titles = blockTitles(stepItems()[2]);
    // Chip skills in chip order, trigger skills before the schedule ones: Pickup guard is the kids chip's.
    const pickup = chipOf('kids').skills?.find((s) => s.kind === 'trigger')?.name as string;
    expect(titles[0]).toContain(pickup);
  });

  it('moves focus to the first block Show more revealed', () => {
    open(build);
    const step3 = stepItems()[2];
    expect(within(step3).getAllByRole('heading', { level: 3 })).toHaveLength(3);
    fireEvent.click(within(step3).getByRole('button', { name: copy.certificate.showMore }));
    const headings = within(step3).getAllByRole('heading', { level: 3 });
    expect(headings.length).toBeGreaterThan(3);
    expect(document.activeElement).toBe(headings[3]);
  });

  it('every block has a working copy button that copies the block text inside the tap', async () => {
    const user = userEvent.setup();
    open(build);
    expandAll();
    const blocks = blocksIn(main());
    // personality, memory, the standing items and the five left-out rules.
    expect(blocks.length).toBeGreaterThanOrEqual(2 + standingNames().length);

    const expected: string[] = [];
    for (const block of blocks) {
      const buttons = within(block).getAllByRole('button', { name: copy.certificate.copyButton.label });
      expect(buttons, textOf(block.querySelector('h2, h3') as Element)).toHaveLength(1);
      expected.push(copyTextOf(block));
      await user.click(buttons[0]);
    }
    expect(rig.exec).toHaveBeenCalledTimes(blocks.length);
    expect(rig.exec).toHaveBeenCalledWith('copy');
    expect(rig.copied).toEqual(expected);
    // The personality copy is the full text, with the library's heading in it.
    const who = library.chassis.headings.find((h) => h.id === 'heading.who');
    expect(who).toBeDefined();
    expect(rig.copied[0]).toContain(who?.text);
  });

  it('shows the button as Copied after a tap', async () => {
    const user = userEvent.setup();
    open(build);
    const [first] = blocksIn(main());
    await user.click(copyButtonIn(first));
    expect(within(first).getByRole('button', { name: copy.certificate.copyButton.copied })).toBeTruthy();
  });

  it('lists the five trimmed pack rules under Left out, with the library text', () => {
    open(build);
    const heading = screen.getByRole('heading', { name: copy.certificate.groups.leftOut });
    expect(screen.getByText(copy.certificate.sections.leftOutHint)).toBeTruthy();
    const group = heading.parentElement as HTMLElement;
    const rules = packOf('personal-ops').rulesLines.map((l) => l.line);
    expect(rules).toHaveLength(5);
    const shownTexts = blocksIn(group).map(copyTextOf);
    expect(shownTexts).toEqual(rules);
    // Each is titled by its pack.
    for (const block of blocksIn(group)) {
      expect(textOf(block.querySelector('h3') as Element)).toBe(packOf('personal-ops').label);
    }
  });

  it('says in the summary how many rules were left out, naming the pack (W25)', () => {
    open(build);
    const n = packOf('personal-ops').rulesLines.length;
    expect(
      screen.getByText(`To fit ${copy.targetNames.muse}, ${n} rules from ${packOf('personal-ops').label} were left out.`),
    ).toBeTruthy();
  });

  it('shows the library notes in Notes, and no Still checking heading when the profile has no verify lines', () => {
    open(build);
    const notes = screen.getByRole('heading', { name: copy.certificate.notes }).parentElement as HTMLElement;
    for (const note of muse.notes ?? []) expect(textOf(notes)).toContain(note.line);
    expect(muse.verify).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: copy.certificate.stillChecking.heading })).toBeNull();
  });
});

// ============================================================================
// ChatGPT dot, Marty: the stacked Custom Rules table
// ============================================================================

describe('Dot Marty', () => {
  const build = golden('marty.chatgpt-dot');
  const dot = profileById('chatgpt-dot');

  // One rule per gate the memecoins pack sets, in gate registry order, with the library's setting label.
  function expectedRules(gates: Record<string, string>) {
    return library.gates
      .filter((g) => Object.hasOwn(gates, g.id))
      .map((g) => ({
        gate: g.id,
        action: g.customRuleText,
        setting: (dot.customRuleSettings as Record<string, string>)[gates[g.id]],
      }));
  }
  const packGates = packOf('memecoins').gatesDefault as Record<string, string>;

  it('puts the rules path from the library over the table as its caption, once', () => {
    open(build);
    const path = dot.rulesPath?.line as string;
    expect(path).toBe('Settings > Personalization > Permissions > Custom rules');
    expect(screen.getAllByText(path)).toHaveLength(1);
    const step2 = stepWith(dot.installSteps[1].line);
    expect(textOf(step2)).toContain(path);
    // The caption comes before the first card.
    const caption = within(step2).getByText(path);
    const firstCard = blocksIn(step2)[0];
    expect(caption.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows one card per rule, with the action text and the setting label from the library', () => {
    open(build);
    const step2 = stepWith(dot.installSteps[1].line);
    const rules = expectedRules(packGates);
    expect(rules.map((r) => r.gate)).toEqual(['trade', 'pay']);
    const cards = blocksIn(step2);
    expect(cards).toHaveLength(rules.length);
    cards.forEach((card, i) => {
      expect(textOf(card.querySelector('p') as Element)).toBe(rules[i].action);
      expect(within(card).getByText(copy.certificate.customRules.setting)).toBeTruthy();
      expect(within(card).getByText(rules[i].setting)).toBeTruthy();
    });
    // The three labels are the library's (QUESTIONS B6).
    expect(dot.customRuleSettings).toEqual({
      auto: 'Take action without asking',
      approve: 'Ask before taking action',
      forbid: 'Hand off to you',
    });
    expect(within(cards[0]).getByText('Ask before taking action')).toBeTruthy();
    expect(within(cards[1]).getByText('Hand off to you')).toBeTruthy();
  });

  it('stacks the cards as a list, one item each', () => {
    open(build);
    const step2 = stepWith(dot.installSteps[1].line);
    const list = within(step2).getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('copies each rule action from its own card', async () => {
    const user = userEvent.setup();
    open(build);
    const step2 = stepWith(dot.installSteps[1].line);
    const cards = blocksIn(step2);
    for (const card of cards) await user.click(copyButtonIn(card));
    expect(rig.copied).toEqual(expectedRules(packGates).map((r) => r.action));
  });

  it('shows the dot note with the table, once, and not as a separate Notes list', () => {
    open(build);
    const note = dot.notes?.[0]?.line as string;
    expect(dot.notes).toHaveLength(1);
    expect(screen.getAllByText(note)).toHaveLength(1);
    const step2 = stepWith(dot.installSteps[1].line);
    expect(textOf(step2)).toContain(note);
    // The only note moved to the table, so there is no Notes heading left.
    expect(screen.queryByRole('heading', { name: copy.certificate.notes })).toBeNull();
  });

  it('keeps the table at step 2, before the step that sends the personality', () => {
    open(build);
    const texts = stepItems().map(stepText);
    expect(texts.slice(0, 3)).toEqual(dot.installSteps.slice(0, 3).map((s) => s.line));
    const rulesAt = texts.indexOf(dot.installSteps[1].line);
    const personalityAt = texts.indexOf(dot.installSteps[2].line);
    expect(rulesAt).toBeLessThan(personalityAt);
    // Steps that show nothing still read as plain steps with no blocks.
    expect(blocksIn(stepWith(dot.installSteps[0].line))).toHaveLength(0);
  });

  it('shows a rule set to auto with the library auto label, and lists the gate in the summary', () => {
    open({ ...build, gates: { trade: 'auto' } });
    const step2 = stepWith(dot.installSteps[1].line);
    const trade = gateOf('trade');
    const card = blocksIn(step2).find((c) => textOf(c.querySelector('p') as Element) === trade.customRuleText);
    expect(card).toBeDefined();
    expect(within(card as HTMLElement).getByText('Take action without asking')).toBeTruthy();
    const summary = screen.getByText(copy.certificate.summary.auto).closest('li') as HTMLElement;
    expect(within(summary).getByText(trade.label)).toBeTruthy();
  });
});

// ============================================================================
// OpenClaw Marty: SKILL files as blocks with their paths
// ============================================================================

describe('OpenClaw Marty', () => {
  const build = golden('marty.openclaw');
  const claw = profileById('openclaw');

  // The trigger skills Marty's chips and the memecoins pack ask for. File skills are the trigger ones;
  // schedule skills are routines said in chat, not files.
  function skillIds(): string[] {
    const ids: string[] = [];
    for (const chipId of build.chips) {
      for (const s of chipOf(chipId).skills ?? []) {
        if (s.kind === 'trigger') ids.push((s.id.split('.').pop() as string).replace(/_/g, '-'));
      }
    }
    for (const packId of build.packs) {
      for (const s of packOf(packId).skills) if (s.kind === 'trigger') ids.push(s.id);
    }
    return [...new Set(ids)];
  }

  it('shows the personality and rules files with their paths under steps 1 and 2', () => {
    open(build);
    const one = stepWith(claw.installSteps[0].line);
    const two = stepWith(claw.installSteps[1].line);
    // The step line gives the folder; the block's path label is the file name the user saves it as.
    expect(textOf(one)).toContain(claw.personalityPath);
    const file = claw.personalityPath.split('/').pop() as string;
    expect(file).toBe('SOUL.md');
    expect(within(one).getByText(file, { selector: 'p' }).closest('[role="group"]')).not.toBeNull();
    expect(blockTitles(one)).toHaveLength(1);
    expect(within(two).getByText('AGENTS.md', { selector: 'p' }).closest('[role="group"]')).not.toBeNull();
  });

  it('shows every skill file as a block under the skills step, with its path', () => {
    open(build);
    expandAll();
    const step = stepWith(claw.installSteps[2].line);
    const ids = skillIds();
    expect(ids.length, 'Marty has more than three skill files').toBeGreaterThan(3);
    expect(blocksIn(step)).toHaveLength(ids.length);
    for (const id of ids) {
      const path = `skills/${id}/SKILL.md`;
      const pathEl = within(step).getByText(path);
      // The path sits in the same block as its file text.
      const block = pathEl.closest('[role="group"]') as HTMLElement;
      expect(block.querySelector('pre'), path).not.toBeNull();
      expect(within(block).getByRole('button', { name: copy.certificate.copyButton.label })).toBeTruthy();
    }
    // Schedule skills are routines, so they are not files.
    for (const s of packOf('memecoins').skills.filter((x) => x.kind === 'schedule')) {
      expect(screen.queryByText(`skills/${s.id}/SKILL.md`)).toBeNull();
    }
  });

  it('shows three skill files first, then Show more', () => {
    open(build);
    const step = stepWith(claw.installSteps[2].line);
    expect(blocksIn(step)).toHaveLength(3);
    expect(within(step).getByRole('button', { name: copy.certificate.showMore })).toBeTruthy();
  });

  it('shows the routines as spoken blocks without a path, under the routines step', () => {
    open(build);
    const step = stepWith(claw.installSteps[5].line);
    const names = packOf('memecoins').skills.filter((s) => s.kind === 'schedule').map((s) => s.name);
    expect(blocksIn(step)).toHaveLength(names.length);
    for (const name of names) {
      expect(blockTitles(step).some((t) => t.includes(name)), name).toBe(true);
    }
    for (const block of blocksIn(step)) expect(block.querySelector('pre')).not.toBeNull();
  });
});

// ============================================================================
// Roles: the role step holds the role groups
// ============================================================================

describe('roles', () => {
  describe('Grok June with roles', () => {
    const build = golden('june.grok.roles');
    const grok = profileById('grok');
    const labels = (build.roles ?? []).map(roleLabel);
    // W33: no Grok step shows roles, so the role fallback note becomes the last step.
    const fallback = grok.templates['fallback.roles'].line.replace('{roles}', labels.join(', '));

    it('has role labels from the library', () => {
      expect(labels).toEqual(['Chief of staff', 'Triager', 'Scheduler']);
    });

    it('makes the role fallback note the last numbered step, after the profile steps', () => {
      open(build);
      const items = stepItems();
      const role = stepWith(fallback);
      expect(items[items.length - 1]).toBe(role);
      expect(stepNumber(role)).toBe(String(grok.installSteps.length + 1));
      // The same words are not repeated in Notes.
      expect(screen.getAllByText(fallback)).toHaveLength(1);
    });

    it('holds one group per role, headed by the role label, each with its description block', () => {
      open(build);
      const role = stepWith(fallback);
      const headings = within(role).getAllByRole('heading', { level: 2 });
      expect(headings.map(textOf)).toEqual(labels);
      for (const heading of headings) {
        const label = textOf(heading);
        const group = heading.parentElement as HTMLElement;
        const blocks = blocksIn(group);
        expect(blocks.length, label).toBeGreaterThanOrEqual(1);
        for (const block of blocks) {
          expect(textOf(block.querySelector('h3') as Element), label).toContain(label);
          expect(textOf(block), label).toContain(`${grok.personalityPath} (${label})`);
          expect(copyButtonIn(block)).toBeTruthy();
        }
      }
    });

    it('holds the build name in the label block, beside the personality, under step 2', () => {
      open(build);
      const step2 = stepWith(grok.installSteps[1].line);
      expect(blockTitles(step2)).toEqual([copy.certificate.soul, copy.certificate.blockTitles.label]);
      const label = within(step2).getByRole('group', { name: copy.certificate.blockTitles.label });
      expect(textOf(label.querySelector('pre') as Element)).toBe(rosterEntry('june').buildName);
    });

    it('puts the first task under step 3, with the memory sentence (W29)', () => {
      open(build);
      const step3 = stepWith(grok.installSteps[2].line);
      const titles = blockTitles(step3);
      expect(titles[0]).toBe(copy.certificate.seed);
      expect(titles).toHaveLength(2);
      expect(titles[1]).toMatch(/first task/i);
    });

    it('has no role step on a Grok build without roles', () => {
      open(golden('june.grok'));
      const items = stepItems();
      expect(items).toHaveLength(grok.installSteps.length);
      expect(screen.queryByText(/Create one Bot per role/)).toBeNull();
    });
  });

  describe('where a profile step shows roles', () => {
    const cases = [
      { id: 'marty.openclaw.roles', profile: 'openclaw' as const, step: 3 },
      { id: 'rook.hermes.roles', profile: 'hermes' as const, step: 3 },
    ];

    it.each(cases)('$id: the roles step holds a group per role with files at a path naming the role', ({ id, profile, step }) => {
      const build = golden(id);
      const p = profileById(profile);
      expect(p.installSteps[step].shows).toContain('roles');
      open(build);
      const li = stepWith(p.installSteps[step].line);
      const labels = (build.roles ?? []).map(roleLabel);
      const headings = within(li).getAllByRole('heading', { level: 2 });
      expect(headings.map(textOf)).toEqual(labels);
      for (const [i, heading] of headings.entries()) {
        const roleId = (build.roles ?? [])[i];
        for (const block of blocksIn(heading.parentElement as HTMLElement)) {
          const path = textOf(block.querySelector('p') as Element);
          expect(path.toLowerCase(), `${labels[i]} path`).toContain(roleId);
          expect(copyButtonIn(block)).toBeTruthy();
        }
      }
    });
  });

  describe('Sol on a Project with roles', () => {
    const build = golden('sol.chatgpt-project.roles');
    const project = profileById('chatgpt-project');
    const labels = (build.roles ?? []).map(roleLabel);
    const fallback = project.templates['fallback.roles'].line.replace('{roles}', labels.join(', '));

    it('turns the role fallback note into the last step, with a group per role', () => {
      open(build);
      const items = stepItems();
      const role = stepWith(fallback);
      expect(items[items.length - 1]).toBe(role);
      const headings = within(role).getAllByRole('heading', { level: 2 });
      expect(headings.map(textOf)).toEqual(labels);
      expect(screen.getAllByText(fallback)).toHaveLength(1);
    });
  });
});

// ============================================================================
// Free custom instructions, Marty: the steer, Switch to Paid, Not included
// ============================================================================

describe('free custom instructions Marty', () => {
  const build = golden('marty.chatgpt-instructions-free');
  const profile = profileById('chatgpt-instructions');
  const free = (profile.lengthCap as { free: number; paid: number }).free;
  const paid = (profile.lengthCap as { free: number; paid: number }).paid;

  // Marty's trigger skills and routines by library name: solana's Wallet glance and the memecoins pack.
  function skillAndRoutineNames(): string[] {
    const names = new Set<string>();
    for (const id of build.chips) for (const s of chipOf(id).skills ?? []) names.add(s.name);
    for (const id of build.packs) for (const s of packOf(id).skills) names.add(s.name);
    return [...names].sort();
  }

  const undelivered = (): string[] => {
    const item = screen.getByText(copy.certificate.summary.undelivered(copy.targetNames.chatgpt)).closest('li') as HTMLElement;
    return within(item).getAllByRole('listitem').map(textOf).sort();
  };

  it('is over the free cap, and says so in the summary', () => {
    open(build);
    expect(meterMax()).toBe(free);
    const over = meterValue() - free;
    expect(over).toBeGreaterThan(0);
    expect(
      screen.getByText(copy.certificate.summary.over(over, free, copy.targetNames.chatgpt)),
    ).toBeTruthy();
  });

  it('shows the Paid steer (B11) with a Switch to Paid button', () => {
    open(build);
    expect(screen.getByText(copy.target.paidSteer)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.gates.switchToPaid })).toBeTruthy();
  });

  it('Switch to Paid sets the plan to paid, and the steer and the over line go away', async () => {
    const user = userEvent.setup();
    open(build);
    expect(st().plan).toBe('free');
    await user.click(screen.getByRole('button', { name: copy.gates.switchToPaid }));
    expect(st().plan).toBe('paid');
    expect(screen.queryByText(copy.target.paidSteer)).toBeNull();
    expect(screen.queryByRole('button', { name: copy.gates.switchToPaid })).toBeNull();
    expect(meterMax()).toBe(paid);
    expect(meterValue()).toBeLessThanOrEqual(paid);
    expect(screen.queryByText(/limit for ChatGPT/)).toBeNull();
  });

  it('names the skills and routines that did not fit under "Not included on ChatGPT"', () => {
    open(build);
    const names = skillAndRoutineNames();
    expect(names).toEqual(['Edge-gone exit', 'Narrative watch', 'Position log', 'Rug check', 'Wallet glance']);
    expect(undelivered()).toEqual(names);
  });

  it('after Switch to Paid the skills fit again, so the list shrinks to what still cannot be delivered', async () => {
    const user = userEvent.setup();
    open(build);
    const before = undelivered();
    await user.click(screen.getByRole('button', { name: copy.gates.switchToPaid }));
    const after = undelivered();
    expect(after.length).toBeLessThan(before.length);
    // A routine is never a custom instruction, so Narrative watch stays on the list.
    expect(after).toContain('Narrative watch');
    expect(after).not.toContain('Rug check');
  });

  it('shows no steer on Paid, and no steer on a profile with no plan', () => {
    open(golden('marty.chatgpt-instructions-paid'));
    expect(screen.queryByText(copy.target.paidSteer)).toBeNull();
    expect(screen.queryByRole('button', { name: copy.gates.switchToPaid })).toBeNull();
    cleanup();
    open(golden('marty.muse'));
    expect(screen.queryByText(copy.target.paidSteer)).toBeNull();
  });

  it('shows the over state on the meter', () => {
    open(build);
    const over = meterValue() - free;
    expect(screen.getByText(copy.preview.over(over))).toBeTruthy();
  });
});

// ============================================================================
// Summary lines (W16)
// ============================================================================

describe('summary lines', () => {
  it('shows the auto line with the gate labels set to auto', () => {
    open({ ...golden('marty.openclaw'), gates: { trade: 'auto' } });
    const item = screen.getByText(copy.certificate.summary.auto).closest('li') as HTMLElement;
    expect(within(item).getAllByRole('listitem').map(textOf)).toEqual([gateOf('trade').label]);
  });

  it('shows no auto line when no gate is on auto', () => {
    open(golden('marty.openclaw'));
    expect(screen.queryByText(copy.certificate.summary.auto)).toBeNull();
  });

  it('on Hermes says the trimmed pack rules are still in AGENTS.md (W34)', () => {
    open(golden('marty.hermes'));
    const label = packOf('memecoins').label;
    expect(
      screen.getByText(
        new RegExp(`^To fit ${copy.targetNames.hermes}, \\d+ rules? from ${label} (is|are) in AGENTS\\.md, not in SOUL\\.md\\.$`),
      ),
    ).toBeTruthy();
    // They are still in the rules file, so there is no Left out list on Hermes.
    expect(screen.queryByRole('heading', { name: copy.certificate.groups.leftOut })).toBeNull();
  });

  it('on Muse and Grok lists the cut rules under Left out', () => {
    for (const id of ['marty.muse', 'marty.grok']) {
      open(golden(id));
      expect(screen.getByRole('heading', { name: copy.certificate.groups.leftOut }), id).toBeTruthy();
      cleanup();
    }
  });

  it('does not list Left out when nothing was trimmed', () => {
    open(golden('vera.muse'));
    expect(screen.queryByRole('heading', { name: copy.certificate.groups.leftOut })).toBeNull();
    expect(screen.queryByText(/^To fit /)).toBeNull();
  });

  it('shows what a link changed when it opened, and never echoes an unknown id', () => {
    const ghost = 'zz_not_a_chip';
    const drops: Drop[] = [{ field: 'chips', id: ghost, reason: 'unknown' }];
    open(golden('june.muse'), { drops });
    const item = screen.getByText(copy.certificate.summary.dropped).closest('li') as HTMLElement;
    expect(within(item).getByText(copy.certificate.summary.droppedUnknown(1))).toBeTruthy();
    expect(document.body.textContent).not.toContain(ghost);
  });

  it('names a known id that was left out by its library label', () => {
    const kids = chipOf('kids');
    const drops: Drop[] = [{ field: 'chips', id: 'kids', reason: 'unexposed' }];
    open(golden('june.muse'), { drops });
    expect(screen.getByText(copy.certificate.summary.droppedNamed(kids.label))).toBeTruthy();
  });

  it('shows no dropped line for a link that changed nothing', () => {
    open(golden('june.muse'), { drops: [] });
    expect(screen.queryByText(copy.certificate.summary.dropped)).toBeNull();
  });

  it('shows the retirement line from the library on a Custom GPT', () => {
    open(gptBuild('marty'));
    const mode = library.targets.targets
      .find((t) => t.id === 'chatgpt')
      ?.modes?.find((m) => m.id === 'gpt');
    expect(mode?.deprecated?.line).toBe('Custom GPTs retire on Dec 11, 2026.');
    const line = screen.getByText(mode?.deprecated?.line as string);
    // It is a summary line, above the install steps.
    expect(line.compareDocumentPosition(stepList()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // The library states that creating a GPT is off on personal plans. Today it is a note; before the
  // verify cleanup it was part of a verify line. Either way the text is read from the profile.
  function creationOffFact(): string {
    const gpt = profileById('chatgpt-gpt');
    const fact = [...(gpt.notes ?? []), ...gpt.verify]
      .map((l) => stripVerify(l.line))
      .find((t) => /creation is off/i.test(t));
    expect(fact, 'the library states that GPT creation is off on personal plans').toBeDefined();
    return fact as string;
  }

  it('shows a Custom GPT creation-off fact once, wherever it sits', () => {
    open(gptBuild('marty'));
    const fact = creationOffFact();
    // Count the leaf element that carries the text. An ancestor li also contains the text, so it
    // is skipped when a li or p inside it carries the same text: a fact that sits as a bullet in
    // the deprecated summary item counts once, not once for the item and once for the bullet.
    const carriers = Array.from(document.querySelectorAll('li, p')).filter((el) =>
      textOf(el).includes(fact),
    );
    const leaves = carriers.filter(
      (el) => !Array.from(el.querySelectorAll('li, p')).some((inner) => textOf(inner).includes(fact)),
    );
    expect(leaves.length).toBe(1);
  });

  // Plan section 4 (deprecated) and W32: the retirement line and the creation-off fact are one summary
  // item, and the Notes and Still checking lists do not repeat them.
  it('puts the creation-off fact in the deprecated summary item, with the retirement line', () => {
    open(gptBuild('marty'));
    const retirement = 'Custom GPTs retire on Dec 11, 2026.';
    const item = screen.getByText(retirement).closest('li') as HTMLElement;
    expect(within(item).getByText(creationOffFact())).toBeTruthy();
    for (const heading of [copy.certificate.notes, copy.certificate.stillChecking.heading]) {
      const section = screen.queryByRole('heading', { name: heading })?.parentElement;
      if (section) expect(textOf(section)).not.toContain(creationOffFact());
    }
  });

  it('shows a Custom GPT description, four starters and the Instructions block, each with a copy button', () => {
    open(gptBuild('marty'));
    const gpt = profileById('chatgpt-gpt');
    const descStep = stepWith(gpt.installSteps[1].line);
    expect(blockTitles(descStep)).toEqual([copy.certificate.blockTitles.description]);
    const startersStep = stepWith(gpt.installSteps[3].line);
    expect(blockTitles(startersStep)).toEqual([1, 2, 3, 4].map((n) => copy.certificate.blockTitles.starter(n)));
    for (const block of [...blocksIn(descStep), ...blocksIn(startersStep)]) {
      expect(copyButtonIn(block)).toBeTruthy();
    }
  });

  it('puts the summary lines in the plan order: auto, over, steer, trimmed, dropped, undelivered', () => {
    const build = { ...golden('marty.chatgpt-instructions-free'), gates: { trade: 'auto' as const } };
    open(build, { drops: [{ field: 'chips', id: 'zz_not_a_chip', reason: 'unknown' }] });
    const box = screen.getByText(copy.certificate.summary.auto).closest('section') as HTMLElement;
    const lines = within(box)
      .getAllByRole('listitem')
      .filter((li) => li.querySelector(':scope > p'))
      .map((li) => textOf(li.querySelector(':scope > p') as Element));
    const find = (re: RegExp) => lines.findIndex((l) => re.test(l));
    const order = [
      find(new RegExp(`^${copy.certificate.summary.auto}`)),
      find(/personality is \d+ characters over/),
      find(/Switch to Paid/),
      find(/^To fit ChatGPT,/),
      find(new RegExp(`^${copy.certificate.summary.dropped}`)),
      find(/^Not included on ChatGPT:/),
    ];
    expect(order.every((i) => i >= 0), JSON.stringify(lines)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

// ============================================================================
// Still checking, notes and the docs link, on every target
// ============================================================================

describe('Still checking and the docs link, on every target', () => {
  function stillChecking(): string[] {
    const heading = screen.queryByRole('heading', { name: copy.certificate.stillChecking.heading });
    if (!heading) return [];
    return within(heading.parentElement as HTMLElement).getAllByRole('listitem').map(textOf);
  }

  it.each(TARGETS)('$name: Still checking lines carry no "verify:" prefix and are library verify lines', ({ profile, build }) => {
    open(build());
    const p = profileById(profile);
    const all = p.verify.map((v) => stripVerify(v.line));
    const always = p.verify.filter((v) => !v.when || v.when.length === 0).map((v) => stripVerify(v.line));
    const items = stillChecking();

    for (const item of items) {
      expect(item).not.toMatch(/^verify/i);
      expect(item).not.toMatch(/verify:/i);
      expect(all, `"${item}" is a library verify line`).toContain(item);
    }
    // Lines with no condition always show.
    for (const line of always) expect(items, line).toContain(line);
    // One line each: no line twice.
    expect(new Set(items).size).toBe(items.length);
    // The heading shows only when there is something under it.
    expect(screen.queryByRole('heading', { name: copy.certificate.stillChecking.heading }) !== null).toBe(items.length > 0);
  });

  it.each(TARGETS)('$name: the docs link names the profile and date, opens in a new tab with rel noopener noreferrer', ({ profile, build }) => {
    open(build());
    const p = profileById(profile);
    const link = screen.getByRole('link', { name: copy.certificate.stillChecking.docsRead(p.label, p.docReadDate) });
    expect(link.getAttribute('href')).toBe(p.docUrl);
    expect(link.getAttribute('target')).toBe('_blank');
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/);
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it.each(TARGETS)('$name: no copied block or visible line carries a "verify:" prefix', ({ build }) => {
    open(build());
    expandAll();
    const clone = main().cloneNode(true) as HTMLElement;
    // The raw warnings behind Details are developer text, not part of the page.
    clone.querySelectorAll('details').forEach((d) => d.remove());
    expect(textOf(clone)).not.toMatch(/verify:/i);
  });

  it('the docs link is the last line of its section, after the list', () => {
    open(golden('marty.chatgpt-dot'));
    const p = profileById('chatgpt-dot');
    const link = screen.getByRole('link', { name: copy.certificate.stillChecking.docsRead(p.label, p.docReadDate) });
    const list = within(link.parentElement as HTMLElement).getByRole('list');
    expect(list.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a role-only verify line only when the build picked roles', () => {
    const p = profileById('hermes');
    const roleLine = p.verify.find((v) => v.when?.includes('roles'));
    expect(roleLine, 'hermes has a role-only verify line').toBeDefined();
    const text = stripVerify(roleLine?.line as string);
    open(golden('rook.hermes'));
    expect(stillChecking()).not.toContain(text);
    cleanup();
    open(golden('rook.hermes.roles'));
    expect(stillChecking()).toContain(text);
  });

  it('shows the library notes in Notes, at normal weight, one line each', () => {
    open(golden('marty.openclaw'));
    const notes = screen.getByRole('heading', { name: copy.certificate.notes }).parentElement as HTMLElement;
    const items = within(notes).getAllByRole('listitem').map(textOf);
    const p = profileById('openclaw');
    for (const note of p.notes ?? []) expect(items).toContain(note.line);
    if (p.reloadNote) expect(items).toContain(p.reloadNote.line);
  });
});

// ============================================================================
// Skipped lines (W15)
// ============================================================================

describe('skipped lines', () => {
  const SKIPPABLE = ['world', 'packs', 'limits', 'gates', 'stats', 'peeves', 'heart', 'outfit', 'roles'] as const;

  it('shows one "You skipped <name>." line for each skipped screen', () => {
    open(golden('june.muse'));
    store(() => useBuilder.setState({ skipped: [...SKIPPABLE] }));
    for (const id of SKIPPABLE) {
      expect(screen.getAllByText(copy.certificate.skipped(copy.certificate.skippedNames[id])), id).toHaveLength(1);
    }
    expect(screen.getAllByText(/^You skipped /)).toHaveLength(SKIPPABLE.length);
  });

  it('names the screens in plain words', () => {
    expect(copy.certificate.skipped(copy.certificate.skippedNames.world)).toBe('You skipped your world.');
    expect(copy.certificate.skipped(copy.certificate.skippedNames.gates)).toBe('You skipped approvals.');
  });

  it('shows none when nothing was skipped', () => {
    open(golden('june.muse'));
    expect(screen.queryByText(/^You skipped /)).toBeNull();
  });

  it('shows the lines for screens skipped in a real flow, and only those', () => {
    store((s) => {
      s.setTarget('muse');
      s.startBlank();
      s.setBase('trader');
      s.go('world');
      s.skip();
      s.skip();
      s.go('name');
      s.setName('Zed');
      s.go('certificate');
    });
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().skipped).toEqual(['world', 'packs']);
    expect(screen.getByText(copy.certificate.skipped(copy.certificate.skippedNames.world))).toBeTruthy();
    expect(screen.getByText(copy.certificate.skipped(copy.certificate.skippedNames.packs))).toBeTruthy();
    expect(screen.getAllByText(/^You skipped /)).toHaveLength(2);
  });
});

// ============================================================================
// Details (the raw warnings)
// ============================================================================

describe('Details', () => {
  it('holds the raw compiler warnings, closed by default', () => {
    const build = golden('marty.muse');
    const warnings = compile(build).warnings;
    expect(warnings.length).toBeGreaterThan(0);
    open(build);
    const details = main().querySelector('details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(textOf(details.querySelector('summary') as Element)).toBe(copy.certificate.details.summary);
    const lines = Array.from(details.querySelectorAll('li')).map(textOf);
    expect(lines).toEqual(warnings);
  });

  it('keeps the raw warnings out of the rest of the page', () => {
    open(golden('marty.muse'));
    const clone = main().cloneNode(true) as HTMLElement;
    clone.querySelectorAll('details').forEach((d) => d.remove());
    expect(textOf(clone)).not.toMatch(/(dedupe|length): (dropped|cut)/);
  });

  it('adds the warnings a link carried when it opened', () => {
    const build = golden('marty.muse');
    open(build, { warnings: ['a pick in this link was reset'] });
    const lines = Array.from((main().querySelector('details') as HTMLElement).querySelectorAll('li')).map(textOf);
    expect(lines).toEqual([...compile(build).warnings, 'a pick in this link was reset']);
  });

  it('is hidden when there are no warnings', () => {
    const build = golden('vera.muse');
    expect(compile(build).warnings).toEqual([]);
    open(build);
    expect(main().querySelector('details')).toBeNull();
    expect(screen.queryByText(copy.certificate.details.summary)).toBeNull();
  });
});

// ============================================================================
// The Mine switch (plan section 6, W12, W28, W36)
// ============================================================================

describe('Mine switch', () => {
  const build = golden('june.muse');
  const MINE = 'Never schedule anything before nine on weekdays.';
  const mineLabel = copy.certificate.mine.label;
  const switchEl = () => screen.getByRole('switch', { name: mineLabel });
  const personalityPre = (): string => {
    const block = screen.getByRole('group', { name: copy.certificate.soul });
    return textOf(block.querySelector('pre') as Element);
  };

  it('is hidden when nothing was pasted', () => {
    open(build);
    expect(screen.queryByRole('switch', { name: mineLabel })).toBeNull();
    expect(screen.queryByText(copy.certificate.mine.note)).toBeNull();
  });

  it('shows when the paste holds a line the build lacks, off by default, with the note beside it', () => {
    open(build);
    store((s) => s.setPasted(MINE));
    const toggle = switchEl();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(copy.certificate.mine.found(1))).toBeTruthy();
    // The user's own words are not checked against their approvals (W12).
    expect(screen.getByText(copy.certificate.mine.note)).toBeTruthy();
    expect(toggle.getAttribute('aria-describedby')).toBeTruthy();
    // Off: the personality block lacks the line, and there is no Mine block.
    expect(personalityPre()).not.toContain(MINE);
    expect(personalityPre()).not.toContain('## Mine');
    expect(screen.queryByRole('heading', { name: copy.certificate.blockTitles.mine })).toBeNull();
    expect(st().mineOn).toBe(false);
  });

  it('sits after the personality block and before the next block', () => {
    open(build);
    store((s) => s.setPasted(MINE));
    const personality = screen.getByRole('group', { name: copy.certificate.soul });
    const memory = screen.getByRole('group', { name: copy.certificate.seed });
    const toggle = switchEl();
    expect(personality.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.compareDocumentPosition(memory) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('turned on, puts "## Mine" and the line in the personality block, and the meter grows', async () => {
    const user = userEvent.setup();
    open(build);
    store((s) => s.setPasted(MINE));
    const before = meterValue();
    expect(before).toBe(personalityPre().length);

    await user.click(switchEl());
    expect(switchEl().getAttribute('aria-checked')).toBe('true');
    expect(st().mineOn).toBe(true);
    const text = personalityPre();
    expect(text).toContain('## Mine');
    expect(text).toContain(MINE);
    // The heading comes first, then the line.
    expect(text.indexOf('## Mine')).toBeLessThan(text.indexOf(MINE));
    expect(meterValue()).toBeGreaterThan(before);
    expect(meterValue()).toBe(text.length);
    // The note says the lines are already in the personality.
    expect(screen.getByText(copy.certificate.mine.included)).toBeTruthy();
  });

  it('turned on, keeps the Hard rules after the user lines (W28)', async () => {
    const user = userEvent.setup();
    open(build);
    store((s) => s.setPasted(MINE));
    await user.click(switchEl());
    const text = personalityPre();
    const rules = profileById('muse').templates['rules.heading'].line;
    expect(rules).toBe('## Hard rules');
    expect(text.indexOf('## Mine')).toBeLessThan(text.indexOf(rules));
  });

  it('turned on, shows a Mine block with the line, after the personality block', async () => {
    const user = userEvent.setup();
    open(build);
    store((s) => s.setPasted(MINE));
    await user.click(switchEl());
    const block = screen.getByRole('group', { name: copy.certificate.blockTitles.mine });
    expect(textOf(block.querySelector('pre') as Element)).toBe(MINE);
    const personality = screen.getByRole('group', { name: copy.certificate.soul });
    expect(personality.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('turned off again, takes the line out and keeps the switch so it can come back on', async () => {
    const user = userEvent.setup();
    open(build);
    store((s) => s.setPasted(MINE));
    await user.click(switchEl());
    await user.click(switchEl());
    expect(switchEl().getAttribute('aria-checked')).toBe('false');
    expect(personalityPre()).not.toContain(MINE);
    expect(screen.queryByRole('heading', { name: copy.certificate.blockTitles.mine })).toBeNull();
  });

  it('diffs a pasted personality against the build, so only the added line is Mine', async () => {
    const user = userEvent.setup();
    open(build);
    const pasted = `${compile(build).soul.replace(/\n/g, '\r\n')}\r\n\r\n${MINE}\r\n`;
    store((s) => s.setPasted(pasted));
    expect(screen.getByText(copy.certificate.mine.found(1))).toBeTruthy();
    await user.click(switchEl());
    const block = screen.getByRole('group', { name: copy.certificate.blockTitles.mine });
    expect(textOf(block.querySelector('pre') as Element)).toBe(MINE);
  });

  it('hides the switch again when every pasted line is already in the build', () => {
    open(build);
    // The library's gate line for pay=forbid, as the soul writes it (a bullet, then the line), is already in the build.
    store((s) => s.setPasted(`- ${gateOf('pay').soulLine.forbid as string}`));
    expect(screen.queryByRole('switch', { name: mineLabel })).toBeNull();
  });

  it('says long dashes were changed, and writes a spaced hyphen in the block (W28)', async () => {
    const user = userEvent.setup();
    open(build);
    store((s) => s.setPasted(`Be brief${EM}no filler${EM}ever.`));
    expect(screen.getByText(copy.certificate.mine.dashes)).toBeTruthy();
    await user.click(switchEl());
    const text = personalityPre();
    expect(text).not.toContain(EM);
    expect(text).toContain('Be brief - no filler - ever.');
    expect(document.body.textContent).not.toContain(EM);
  });

  it('does not mention dashes when the pasted lines had none', () => {
    open(build);
    store((s) => s.setPasted(MINE));
    expect(screen.queryByText(copy.certificate.mine.dashes)).toBeNull();
  });

  it('keeps 50 lines and says how many were left out', () => {
    open(build);
    const lines = Array.from({ length: 55 }, (_, i) => `Mine test line number ${i + 1}.`);
    store((s) => s.setPasted(lines.join('\n')));
    expect(screen.getByText(copy.certificate.mine.found(50))).toBeTruthy();
    expect(screen.getByText(copy.certificate.mine.dropped(5, 50))).toBeTruthy();
  });

  it('turns the over state on when Mine pushes the personality past the cap', async () => {
    const user = userEvent.setup();
    open(build);
    const cap = meterMax();
    expect(meterValue()).toBeLessThan(cap);
    const lines = Array.from({ length: 12 }, (_, i) => `Keep every reply under two sentences, rule ${i + 1}.`);
    store((s) => s.setPasted(lines.join('\n')));
    await user.click(switchEl());
    const over = meterValue() - cap;
    expect(over).toBeGreaterThan(0);
    expect(screen.getByText(copy.preview.over(over))).toBeTruthy();
    expect(
      screen.getByText(copy.certificate.summary.over(over, cap, copy.targetNames.muse)),
    ).toBeTruthy();
  });

  const everyProfile: [string, () => Build][] = [
    ['muse', () => golden('june.muse')],
    ['openclaw', () => golden('june.openclaw')],
    ['hermes', () => golden('june.hermes')],
    ['grok', () => golden('june.grok')],
    ['chatgpt dot', () => golden('june.chatgpt-dot')],
    ['chatgpt instructions paid', () => golden('june.chatgpt-instructions-paid')],
    ['chatgpt project', () => golden('june.chatgpt-project')],
    ['chatgpt gpt', () => gptBuild('june')],
  ];

  it.each(everyProfile)('%s: on, the personality block holds the line, and no other copy block does but Mine', async (_name, make) => {
    const user = userEvent.setup();
    open(make());
    // Instructions modes deliver the personality in a field that fits fewer characters, so the line is short.
    store((s) => s.setPasted(MINE));
    await user.click(switchEl());
    expandAll();
    const holders = blocksIn(main())
      .filter((b) => textOf(b.querySelector('pre') ?? b).includes(MINE))
      .map((b) => textOf(b.querySelector('h2, h3') as Element));
    // The personality block, and the Mine block that lists the lines. Nothing else carries it.
    expect(holders).toHaveLength(2);
    expect(holders).toContain(copy.certificate.blockTitles.mine);
    const mainBlock = holders.find((t) => t !== copy.certificate.blockTitles.mine) as string;
    const group = screen.getByRole('group', { name: mainBlock });
    expect(textOf(group.querySelector('pre') as Element)).toContain('## Mine');
  });

  it('opens clean after a reset: the paste and the switch are cleared (W27)', () => {
    open(build);
    store((s) => s.setPasted(MINE));
    store((s) => s.setMineOn(true));
    store((s) => s.reset());
    expect(st().pasted).toBe('');
    expect(st().mineOn).toBe(false);
  });
});

// ============================================================================
// Back
// ============================================================================

describe('Back', () => {
  it('is hidden on a certificate opened from a link', () => {
    open(golden('june.muse'));
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('link');
    expect(screen.queryByRole('button', { name: copy.buttons.back })).toBeNull();
  });

  it('is present after Use from the roster, and goes back to the roster', async () => {
    const user = userEvent.setup();
    store((s) => {
      s.setTarget('muse');
      s.useStarter('june');
    });
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(st().from).toBe('roster');
    const back = screen.getByRole('button', { name: copy.buttons.back });
    await user.click(back);
    expect(shown()).toBe('roster');
  });

  it('is present on a certificate reached by building your own', () => {
    store((s) => {
      s.setTarget('muse');
      s.startBlank();
      s.setBase('trader');
      s.setName('Zed');
      s.go('certificate');
    });
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(screen.getByRole('button', { name: copy.buttons.back })).toBeTruthy();
  });

  it('has no Skip and no progress dots (a result, not a station)', () => {
    open(golden('june.muse'));
    expect(screen.queryByRole('button', { name: copy.buttons.skip })).toBeNull();
    expect(screen.queryByRole('button', { name: copy.buttons.next })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    // The check is real: base, which is a numbered station, does show the progress dots.
    store((s) => s.go('base'));
    expect(shown()).toBe('base');
    expect(screen.queryByRole('progressbar')).not.toBeNull();
  });
});

// ============================================================================
// The meter (plan section 5)
// ============================================================================

describe('the meter', () => {
  it.each(TARGETS)('$name: measures the personality block against the library cap', ({ profile, build }) => {
    const b = build();
    open(b);
    const p = profileById(profile);
    const cap = typeof p.lengthCap === 'number' ? p.lengthCap : p.lengthCap[b.plan ?? 'free'];
    expect(meterMax()).toBe(cap);
    const block = screen.getByRole('group', { name: copy.certificate.soul });
    expect(meterValue()).toBe(textOf(block.querySelector('pre') as Element).length);
    expect(screen.getByRole('meter').getAttribute('aria-label')).toBe(copy.preview.title);
    const value = meterValue();
    const label = value > cap ? copy.preview.over(value - cap) : copy.preview.length(value, cap);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows the cap of the plan: 1,500 on Free and 5,000 on Paid', () => {
    const cap = profileById('chatgpt-instructions').lengthCap as { free: number; paid: number };
    expect(cap).toEqual({ free: 1500, paid: 5000 });
    open(golden('marty.chatgpt-instructions-free'));
    expect(meterMax()).toBe(1500);
    cleanup();
    open(golden('marty.chatgpt-instructions-paid'));
    expect(meterMax()).toBe(5000);
  });
});

// ============================================================================
// When a copy fails (W19)
// ============================================================================

describe('when both copy paths fail', () => {
  it('selects the block text and says to copy it by hand', () => {
    rig.exec.mockImplementation(() => false);
    open(golden('june.muse'));
    const block = screen.getByRole('group', { name: copy.certificate.soul });
    fireEvent.click(copyButtonIn(block));
    expect(within(block).getByRole('button', { name: copy.certificate.copyButton.failed })).toBeTruthy();
    expect(window.getSelection()?.toString()).toBe(textOf(block.querySelector('pre') as Element));
  });

  it('selects the action text of a custom rule card', () => {
    rig.exec.mockImplementation(() => false);
    open(golden('marty.chatgpt-dot'));
    const [card] = blocksIn(stepWith(profileById('chatgpt-dot').installSteps[1].line));
    fireEvent.click(copyButtonIn(card));
    expect(within(card).getByRole('button', { name: copy.certificate.copyButton.failed })).toBeTruthy();
    expect(window.getSelection()?.toString()).toBe(gateOf('trade').customRuleText);
  });

  it('tries the textarea copy inside the tap, before anything asynchronous', () => {
    open(golden('june.muse'));
    const block = screen.getByRole('group', { name: copy.certificate.soul });
    fireEvent.click(copyButtonIn(block));
    // No await between the click and this check.
    expect(rig.exec).toHaveBeenCalledTimes(1);
    expect(rig.copied).toEqual([textOf(block.querySelector('pre') as Element)]);
  });
});

// ============================================================================
// The certificate's selectors (src/ui/certificate/input.ts)
// ============================================================================

describe('certificate selectors', () => {
  const MINE = 'Never schedule anything before nine on weekdays.';

  function inputOf() {
    const input = certificateInput(st());
    if ('error' in input) throw new Error(input.error);
    return input;
  }

  beforeEach(() => {
    act(() => st().loadBuild(golden('june.muse'), { from: 'link' }));
  });

  it('gives the same input and model objects for the same state', () => {
    expect(certificateInput(st())).toBe(certificateInput(st()));
    expect(certificateModelOf(st())).toBe(certificateModelOf(st()));
  });

  it('a new paste is a new input, with the lines the build lacks, and Mine off', () => {
    const before = inputOf();
    expect(before.mine).toEqual({ lines: [], on: false, replacedDashes: false, dropped: 0 });
    act(() => st().setPasted(MINE));
    const after = inputOf();
    expect(after).not.toBe(before);
    expect(after.mine.lines).toEqual([MINE]);
    expect(after.mine.on).toBe(false);
    // Off: the result is the plain compile.
    expect(after.result).toBe(before.result);
    expect(after.result.soul).not.toContain(MINE);
  });

  it('turning Mine on puts the lines in the result, and the model changes with it', () => {
    act(() => st().setPasted(MINE));
    const off = inputOf();
    const offModel = certificateModelOf(st());
    act(() => st().setMineOn(true));
    const on = inputOf();
    expect(on.mine.on).toBe(true);
    expect(on.result).not.toBe(off.result);
    expect(on.result.soul).toContain(MINE);
    expect(on.result.length).toBeGreaterThan(off.result.length);
    expect(certificateModelOf(st())).not.toBe(offModel);
  });

  it('Mine on with nothing pasted changes nothing', () => {
    const plain = compiled(st());
    act(() => st().setMineOn(true));
    expect(inputOf().result).toBe(plain);
  });

  it('counts the lines the 50 line cap cut', () => {
    act(() => st().setPasted(Array.from({ length: 53 }, (_, i) => `Pasted line ${i + 1}.`).join('\n')));
    expect(inputOf().mine.lines).toHaveLength(50);
    expect(inputOf().mine.dropped).toBe(3);
  });

  it('carries the link, the skipped screens and the decode drops into the input', () => {
    const drops: Drop[] = [{ field: 'chips', id: 'zz_not_a_chip', reason: 'unknown' }];
    act(() => st().loadBuild(golden('june.muse'), { from: 'link', warnings: ['a warning'], drops }));
    act(() => useBuilder.setState({ skipped: ['world'] }));
    const input = inputOf();
    expect(input.from).toBe('link');
    expect(input.drops).toEqual(drops);
    expect(input.decodeWarnings).toEqual(['a warning']);
    expect(input.skipped).toEqual(['world']);
  });

  it('returns the compile error for a build that does not compile', () => {
    act(() => useBuilder.setState({ draft: { ...st().draft, name: 'x'.repeat(40) } }));
    expect('error' in certificateInput(st())).toBe(true);
    expect('error' in certificateModelOf(st())).toBe(true);
  });
});

// ============================================================================
// A compile error shows a generic message (W26)
// ============================================================================

describe('a build that does not compile', () => {
  it('shows a generic message and never the raw error', () => {
    store(() =>
      useBuilder.setState({ screen: 'certificate', draft: { ...st().draft, name: 'x'.repeat(40) } }),
    );
    const result = compiled(st());
    expect(isCompileError(result)).toBe(true);
    const raw = isCompileError(result) ? result.error : '';
    expect(raw.length).toBeGreaterThan(0);
    render(<App />);
    expect(shown()).toBe('certificate');
    expect(screen.getByRole('alert').textContent).toBe(copy.certificate.error);
    expect(document.body.textContent).not.toContain(raw);
    expect(document.body.textContent).not.toMatch(/Invalid build/i);
  });
});

// ============================================================================
// Every golden build and a gpt variant of each starter
// ============================================================================

describe('every golden build and a gpt variant of each starter', () => {
  const CASES: { id: string; build: Build }[] = [
    ...GOLDEN_SPECS.map((spec) => ({ id: spec.id, build: buildFor(spec, library) })),
    ...library.roster.map((e) => ({ id: `${e.id}.chatgpt-gpt`, build: gptBuild(e.id) })),
  ];
  const packRuleLines = new Set(library.packs.flatMap((p) => p.rulesLines.map((l) => l.line)));

  it('covers 55 golden builds and nine gpt variants', () => {
    expect(GOLDEN_SPECS).toHaveLength(55);
    expect(CASES).toHaveLength(64);
  });

  it.each(CASES)('$id: every artifact shows once with a copy button, and nothing else is a block', ({ build }) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    open(build);
    expandAll();

    // One h1, "Meet <Name>", and numbered steps counting up from 1.
    expect(textOf(screen.getByRole('heading', { level: 1 }))).toBe(`Meet ${build.name}`);
    const numbers = stepItems().map(stepNumber);
    expect(numbers).toEqual(stepItems().map((_, i) => String(i + 1)));

    // The artifacts the compile holds, as the text each one copies.
    const result = compile(build);
    const isGrok = build.target === 'grok';
    const expected: string[] = [
      ...result.files.map((f) => f.content),
      ...result.spoken.map((s) => s.text),
      ...(isGrok ? [result.buildName] : []),
      ...(result.description !== undefined ? [result.description] : []),
      ...(result.conversationStarters ?? []),
    ];
    const pres = Array.from(main().querySelectorAll('pre')).map(textOf);
    const count = (list: readonly string[], t: string) => list.filter((x) => x === t).length;
    for (const text of new Set(expected)) {
      expect(count(pres, text), `"${text.slice(0, 50)}" shows as many times as it is made`).toBe(count(expected, text));
    }
    // Anything else on the page is a cut pack rule under Left out, with the library's text.
    const extras = pres.filter((t) => !expected.includes(t));
    for (const text of extras) expect(packRuleLines.has(text), `extra block "${text.slice(0, 50)}"`).toBe(true);

    // Every custom rule is a card with its action once.
    const cards = blocksIn(main()).filter((b) => !b.querySelector('pre'));
    expect(cards.map(copyTextOf)).toEqual(result.customRules.map((r) => r.action));

    // Every block has exactly one working Copy button, and it copies what the block shows.
    const blocks = blocksIn(main());
    expect(blocks.length).toBe(pres.length + cards.length);
    rig.copied.length = 0;
    const shownTexts: string[] = [];
    for (const block of blocks) {
      const buttons = within(block).getAllByRole('button', { name: copy.certificate.copyButton.label });
      expect(buttons).toHaveLength(1);
      shownTexts.push(copyTextOf(block));
      fireEvent.click(buttons[0]);
    }
    expect(rig.copied).toEqual(shownTexts);

    // Headings never skip a level: h1, then h2, then h3 under an h2.
    const levels = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => {
      if (i > 0) expect(level, `heading ${i} follows level ${levels[i - 1]}`).toBeLessThanOrEqual(levels[i - 1] + 1);
    });

    // No long dash in anything the page says.
    expect(document.body.textContent).not.toContain(EM);
    // No key warnings or other React errors while rendering.
    expect(errors).not.toHaveBeenCalled();
  });
});

// ============================================================================
// At 375px (class names, because jsdom has no layout)
// ============================================================================

describe('at 375px', () => {
  const builds: [string, () => Build][] = [
    ['june on muse', () => golden('june.muse')],
    ['marty on openclaw', () => golden('marty.openclaw')],
    ['marty on dot', () => golden('marty.chatgpt-dot')],
    ['june on grok with roles', () => golden('june.grok.roles')],
    ['marty on free instructions', () => golden('marty.chatgpt-instructions-free')],
    ['marty on gpt', () => gptBuild('marty')],
  ];
  const WRAP = /overflow-wrap:anywhere|break-words|break-all|wrap-anywhere/;
  const classOf = (el: Element) => el.getAttribute('class') ?? '';

  // Whether an element, or an ancestor inside the page, can break a long unbroken word.
  function canBreakWords(el: Element, root: Element): boolean {
    for (let cur: Element | null = el; cur && cur !== root; cur = cur.parentElement) {
      if (WRAP.test(classOf(cur))) return true;
    }
    return false;
  }

  // Text nodes holding a run of 20 or more characters with no space: paths, ids, long names.
  function longTokenOwners(root: HTMLElement): { el: Element; token: string }[] {
    const out: { el: Element; token: string }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || el.closest('svg')) continue;
      for (const token of (node.textContent ?? '').match(/\S{20,}/g) ?? []) out.push({ el, token });
    }
    return out;
  }

  it.each(builds)('%s: every pre wraps, and none scrolls sideways', (_name, make) => {
    open(make());
    expandAll();
    const pres = Array.from(main().querySelectorAll('pre'));
    expect(pres.length).toBeGreaterThan(0);
    for (const pre of pres) {
      const tokens = classOf(pre).split(/\s+/);
      expect(tokens).toContain('whitespace-pre-wrap');
      expect(tokens).toContain('[overflow-wrap:anywhere]');
      for (const bad of ['whitespace-pre', 'whitespace-nowrap', 'overflow-x-auto', 'overflow-x-scroll', 'overflow-auto', 'overflow-scroll']) {
        expect(tokens, bad).not.toContain(bad);
      }
    }
  });

  it.each(builds)('%s: any text with a long unbroken word can break it', (_name, make) => {
    open(make());
    expandAll();
    // The h1 belongs to the shared Screen and has its own test below.
    const root = main();
    const h1 = root.querySelector('h1') as Element;
    for (const { el, token } of longTokenOwners(root)) {
      if (h1.contains(el)) continue;
      expect(canBreakWords(el, root), `<${el.tagName.toLowerCase()}> holding "${token.slice(0, 30)}"`).toBe(true);
    }
  });

  it.each(builds)('%s: no element is given a fixed width over 375px', (_name, make) => {
    open(make());
    expandAll();
    for (const el of Array.from(main().querySelectorAll('*'))) {
      for (const token of classOf(el).split(/\s+/)) {
        const m = /^(?:min-)?w-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(token);
        if (!m) continue;
        const px = m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
        expect(px, `${el.tagName.toLowerCase()}.${token}`).toBeLessThanOrEqual(375);
      }
    }
  });

  it.each(builds)('%s: every button, link and switch is a 44px target', (_name, make) => {
    open(make());
    expandAll();
    const targets = Array.from(document.querySelectorAll('button, a[href], summary, [role="switch"]'));
    expect(targets.length).toBeGreaterThan(0);
    for (const el of targets) {
      expect(classOf(el), `${el.tagName.toLowerCase()} "${textOf(el).slice(0, 30)}"`).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
    }
  });

  it('keeps the Mine switch a 44px target too', () => {
    open(golden('june.muse'));
    store((s) => s.setPasted('A line that is not in the build.'));
    expect(classOf(screen.getByRole('switch', { name: copy.certificate.mine.label }))).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
  });

  it('scales the radar to its container instead of using a fixed size', () => {
    open(golden('marty.muse'));
    const radar = screen.getByRole('img', { name: /^Slider levels/ });
    expect(radar.getAttribute('viewBox')).toBeTruthy();
    expect(radar.getAttribute('width')).toBeNull();
    expect(radar.getAttribute('height')).toBeNull();
    expect(classOf(radar)).toMatch(/\bw-full\b/);
  });

  // A 24 character name with no spaces and wide letters is longer than a 343px column at the h1's size.
  // Lead fix (wave 3 gate): the shared Screen h1 wraps anywhere, so the name never clips.
  it('lets the h1 break a 24 character name with no spaces', () => {
    open({ ...golden('june.muse'), name: 'W'.repeat(24) });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(textOf(h1)).toBe(`Meet ${'W'.repeat(24)}`);
    expect(classOf(h1)).toMatch(WRAP);
  });
});
