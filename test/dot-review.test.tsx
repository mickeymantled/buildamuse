// @vitest-environment jsdom
//
// Regression tests for Brian's review of the ChatGPT dot exports (docs/DOT-FIX-PLAN.md, QUESTIONS D1
// to D8). The review asked for eight things, and each has a describe block below:
//
//   1. the full workflow contract on the dot (every field a pack gives, legacy workflows read cleanly);
//   2. one permission wording on the dot for trade, send, refund, deploy and publish, and a dot
//      wording for the clash order;
//   3. the trade floor (a dot never places trades, the build and its share link keep the pick; the
//      floor skill line replaces the pack's approval text when every action of the skill is floored);
//   4. permissions described as requested, not enforced (summary, rules table, Gates screen);
//   5. every dot routine ends with the confirm line, and step 6 says it is not running until confirmed;
//   6. the role fallback reads as one dot;
//   7. no unverified capability claims, and the 3600 budget is Build a Bot's own;
//   8. the preview chat discloses on a dot that it is a stand-in.
//
// The lead's review fixes (docs/DOT-FIX-PLAN.md, QUESTIONS D1 to D9) are pinned in the last block,
// "review fixes": the trade workflows' single approval line, a mixed-action skill, the clash variant
// and Mine, the Workflow and Scheduled task labels, the floor note wording, the role note and note.1.
//
// Where the expected text comes from. Nothing here is copied from compiler output.
//   - Dot template wording (workflow sentence, routine confirm, floor lines, chassis variants, step
//     and note texts, UI copy, the preview disclosure): the "strings are final" lists in
//     docs/DOT-FIX-PLAN.md, typed in below in the PLAN table. A drift in profiles.json or src/ui/copy
//     shows up as a failure, and the "plan strings are in the library" block says which side moved.
//   - Pack skill and routine fields: src/library/packs/*.json, read through the library.
//   - Chip skill sentences: src/library/chips.json, with the documented lower-first rule.
//   - Gate soul lines and labels: src/library/gates.json; the setting labels are the dot profile's
//     customRuleSettings, which the PLAN table also types in.
//   - Which packs offer which gate: the packs' gatesDefault.
//
// Suspected source bugs, if any, are kept as it.fails with a comment saying what the input was.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compile, library } from '../src/compiler/compile.js';
import { migrate, retarget } from '../src/compiler/migrate.js';
import { capOf, resolveProfile } from '../src/compiler/profile.js';
import { libraryIds, traceBundle } from '../src/compiler/trace.js';
import type {
  Build,
  ChatgptMode,
  CompileResult,
  GateSetting,
  Library,
  Plan,
  Profile,
  TargetId,
  WorkflowPack,
} from '../src/compiler/types.js';
import { fromShareHash, toShareHash } from '../src/share/encode.js';
import { withMine } from '../src/share/mine.js';
import { App } from '../src/ui/App.js';
import { certificateInput } from '../src/ui/certificate/input.js';
import { certificateModel, type CertModel } from '../src/ui/certificate/model.js';
import { resetPreviewSession } from '../src/ui/certificate/PreviewChat.js';
import { copy } from '../src/ui/copy.js';
import { compiled, isCompileError, previewBuild, useBuilder } from '../src/ui/store.js';

// ---------------------------------------------------------------------------------------------
// The plan's final strings (docs/DOT-FIX-PLAN.md), plain ASCII with straight quotes.

const PLAN = {
  // Section 1.
  skillSuffix: "Tell me which parts of this you can keep and use, what you'd need connected for it, and any step you can't do.",
  routineClose: "It follows my saved settings like any other run. If it can't ask me, it stops and tells me instead.",
  routineConfirm:
    "Before you call it set up, confirm the schedule and my time zone, and ask me if you don't know my time zone. Tell me what access it needs and tell me once the task is created. It isn't running until then.",
  legacySkillLead: "Here's a workflow I'd like you to use: ",
  legacyRoutineLead: "I'd like a scheduled task: ",

  // Section 2.
  chassis: {
    approval: {
      full: "Anything that spends, sends, posts, signs or can't be undone waits for my yes, unless a setting below lets you go ahead. When you ask, give me the decision, the cost and your pick in three lines.",
      short: 'Spend, send, post, sign, irreversible: my yes first, unless a setting below allows it. Ask in 3 lines: decision, cost, pick.',
    },
    reversible: {
      full: "Act only on what I asked for, within the permissions I've given you. Being able to undo something doesn't make it OK to do.",
      short: "Act only on what I asked, within the permissions I gave you. Undoable isn't the same as allowed.",
    },
    outrank: {
      full: "Follow my saved settings and the platform's requirements. If something I say in chat conflicts with them, ask me before you act.",
      short: 'Follow my saved settings and platform requirements. If chat conflicts with them, ask before acting.',
    },
    // The dot's own clash order (ids chassis.clash.order@chatgpt-dot and chassis.clash.order#short@chatgpt-dot).
    clash: {
      full: 'Honesty first, then my instructions and saved settings, then brevity, then jokes.',
      short: 'Honesty, then my instructions and settings, then brevity, then jokes.',
    },
  },
  sendApprove: 'Show me each message before it goes out. Send it only after my yes to that exact message.',
  floorSkill:
    'On this dot, never place, change or close a trade. Where a step says to place one, or to wait for my yes at the trade gate, give me the proposal instead, and I place it myself.',
  // The approval texts of the four trade workflows in the library, as they read in their packs. On the dot
  // the floor line replaces them (every trade workflow takes only the trade action).
  tradeApprovalPhrases: [
    'Without a yes, propose only',
    'trade: approve',
    'No order is placed until I say yes',
    'placing a bet needs a yes',
  ],
  skillLabel: 'Workflow',
  routineLabel: 'Scheduled task',
  dotSkillsGroup: 'Workflows',
  dotRoutinesGroup: 'Scheduled tasks',
  settingLabels: {
    auto: 'Take action without asking',
    approve: 'Ask before taking action',
    forbid: 'Hand off to you',
  } satisfies Record<GateSetting, string>,

  // Section 4.
  steps: [
    'Create your dot and name it.',
    "Before connecting work accounts: set up each permission below in your dot, if your account offers it, and check it saved. Copying this page doesn't set anything.",
    'Send the "Here\'s how I want you to work" message as a normal chat message. It gives your dot your preferences. It doesn\'t replace its own instructions or retrain it.',
    'Say the memory sentence, then ask your dot what it will remember.',
    "Send each workflow. Ask your dot to say what it can keep and use, what it needs connected, and any step it can't do.",
    "Send each scheduled task. It isn't running until your dot confirms the schedule, your time zone, the access it needs, and that the task was created.",
    'Connect only the apps your workflows need, and check what each one can do.',
    'Give it one project first.',
  ],
  verify3: 'verify: whether your account can run more than one dot.',
  verify4: 'verify: which permission settings, connected apps and scheduled tasks your account offers.',
  note1:
    'Where a permission says "Hand off to you", your dot should stop and give that step to you. Check that it does before you rely on it.',
  roleFallbackLead: "Your roles aren't in this setup. It makes one dot, not a separate agent per role. Your roles: ",
  promise: 'Messages to send your dot, plus permissions to set up.',
  modeNote: 'Recommended, if your plan includes dots.',

  // Section 5.
  gatesCopy:
    'these become permissions to request in your dot. They do nothing until you set them up there and check they saved.',
  tradesRow:
    "On a dot, this setup doesn't place trades. Your dot researches and proposes, and you place each trade. Your pick still applies if you switch to another bot.",
  autoDot: 'Requested to run without asking. Set this up in your dot and check it saved:',
  autoOld: 'Auto, no yes asked:',
  noLimitsOne:
    'You asked for this one to run without asking, and your dot\'s message has no limits to check it against. Request "Ask before taking action" instead, or add your limits by hand first:',
  noLimitsMany:
    'You asked for these to run without asking, and your dot\'s message has no limits to check them against. Request "Ask before taking action" instead, or add your limits by hand first:',
  tableCaption:
    "Permissions to request. Copying them doesn't set them: add each one in your dot if your account offers it, then check it saved.",
  tableSetting: 'Setting to request:',
  disclosure:
    "On a dot, this is a stand-in. It runs your dot's message on Build a Bot's preview model, not on ChatGPT. It doesn't test your permissions, connected apps, workflows, scheduled tasks or memory. It does remember recent messages in this preview.",
};

// The summary and over-cap phrases that name Build a Bot's own budget for a dot message.
const dotBudgetFor = (cap: number): string => `Build a Bot's ${cap}-character budget for a dot message`;

// "{setting}" is the label of the setting the user had: a pick, or a pack default.
const floorNoteFor = (had: GateSetting): string =>
  `Your setting for Trades is "${PLAN.settingLabels[had]}". This setup doesn't let your dot place trades: it researches and proposes, and you place each trade yourself.`;

// Plan section 5, over the cap, with a count other than 1 ("character" for 1 is checked on its own).
const overDotFor = (n: number, cap: number): string =>
  `Your bot's personality is ${n} characters over the ${cap}-character budget Build a Bot uses for a dot message.`;

// Wording the dot must no longer carry (section 2).
const BANNED_WORDING = ['outrank anything', 'Only irreversible', 'I turn on auto when I say so', 'Custom Rules'];

// Capability claims the dot must not make (section 7 of the task, section 4 of the plan).
const CAPABILITY_CLAIMS: { name: string; pattern: RegExp }[] = [
  { name: 'at launch', pattern: /at launch/i },
  { name: 'alpha', pattern: /\balpha\b/i },
  { name: 'no block setting', pattern: /no block setting/i },
  { name: 'Settings > ', pattern: /Settings > /i },
  { name: 'on desktop', pattern: /on desktop/i },
  { name: 'avatar', pattern: /avatar/i },
  { name: 'Pro or Business', pattern: /Pro or Business/i },
];

const EM_DASH = String.fromCharCode(0x2014);

// ---------------------------------------------------------------------------------------------
// Library readers and builds.

type PackSkill = WorkflowPack['skills'][number];

function rosterEntry(id: string) {
  const found = library.roster.find((r) => r.id === id);
  if (!found) throw new Error(`test setup: no starter ${id}`);
  return found;
}

function packOf(id: string): WorkflowPack {
  const found = library.packs.find((p) => p.id === id);
  if (!found) throw new Error(`test setup: no pack ${id}`);
  return found;
}

function skillOf(packId: string, skillId: string): PackSkill {
  const found = packOf(packId).skills.find((s) => s.id === skillId);
  if (!found) throw new Error(`test setup: no skill ${packId}/${skillId}`);
  return found;
}

function gateRecord(id: string) {
  const found = library.gates.find((g) => g.id === id);
  if (!found) throw new Error(`test setup: no gate ${id}`);
  return found;
}

function profileById(id: string, lib: Library = library): Profile {
  const found = lib.targets.profiles.find((p) => p.id === id);
  if (!found) throw new Error(`test setup: no profile ${id}`);
  return found;
}

const DOT = profileById('chatgpt-dot');
const STARTERS = library.roster.map((r) => r.id);
// The packs that offer the trade gate (every one defaults it to approve).
const TRADE_PACKS = library.packs.filter((p) => Object.hasOwn(p.gatesDefault, 'trade')).map((p) => p.id);

function onTarget(starter: string, target: TargetId, mode?: ChatgptMode, plan?: Plan): Build {
  return migrate(rosterEntry(starter).build, { target, mode, plan });
}

const dotOf = (starter: string): Build => onTarget(starter, 'chatgpt', 'dot');

// Vera has no packs and no routines, and carries three legacy chip skills (law).
const VERA = dotOf('vera');

function withPacks(base: Build, packs: string[], gates: Build['gates'] = {}): Build {
  return { ...base, packs, gates };
}

// A build of one chip and nothing else (no packs), so no pack skill shadows that chip's skills. A
// Markets chip needs a risk level (validate.ts rule 5), and only a Markets chip may have one.
function chipOnly(chipId: string): Build {
  const chip = library.chips.find((c) => c.id === chipId);
  if (!chip) throw new Error(`test setup: no chip ${chipId}`);
  const stats = chip.group === 'Markets' ? { ...VERA.stats, risk: 2 as const } : { ...VERA.stats };
  return { ...VERA, chips: [chipId], stats, packs: [], limits: {}, gates: {} };
}

// Compiles are pure, so the sweeps share them.
const runCache = new Map<string, CompileResult>();
function run(build: Build): CompileResult {
  const key = JSON.stringify(build);
  const hit = runCache.get(key);
  if (hit) return hit;
  const result = compile(build);
  runCache.set(key, result);
  return result;
}

// Every string a person can read in a bundle.
function bundleTexts(result: CompileResult): string[] {
  return [
    result.soul,
    ...result.files.flatMap((f) => [f.label, f.content]),
    ...result.spoken.flatMap((s) => [s.label, s.text]),
    ...result.customRules.flatMap((r) => [r.action, r.setting]),
    ...result.installSteps,
    ...result.notes,
    ...result.steps.map((s) => s.text),
    ...result.noteItems.map((n) => n.text),
    ...result.verify.map((n) => n.text),
    ...(result.description === undefined ? [] : [result.description]),
  ];
}

// Every string anywhere in a value.
function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out);
  else if (typeof value === 'object' && value !== null) for (const v of Object.values(value)) stringsIn(v, out);
  return out;
}

// Every record id a result cites, wherever it cites one.
function idsOfResult(result: CompileResult): string[] {
  return [
    ...result.soulLines.map((l) => l.id),
    ...result.files.flatMap((f) => f.lines.flatMap((l) => [l.id, ...(l.sources ?? [])])),
    ...result.spoken.flatMap((s) => s.ids),
    ...result.customRules.flatMap((r) => r.ids),
    ...result.noteItems.map((n) => n.id),
    ...result.steps.map((s) => s.id),
  ];
}

// The lower-first rule of the library (and passes/skills.ts): lowercase the first letter unless the
// second is uppercase.
function lowerFirst(s: string): string {
  if (s.length < 2) return s.toLowerCase();
  const second = s[1];
  if (second >= 'A' && second <= 'Z') return s;
  return s[0].toLowerCase() + s.slice(1);
}

// ---------------------------------------------------------------------------------------------
// Expected workflow text (plan section 1, with the floor skill line of section 2).

const stepsBlock = (skill: PackSkill): string => skill.steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
// The actions the dot floors (plan section 2: trade only).
const FLOORED_ACTIONS = ['trade'];
// The approval text of a dot workflow. Where every action of the skill is floored (every trade workflow),
// the floor line replaces the pack's approval text; where the skill also takes an unfloored action, the
// pack's text stays and the floor line follows it on its own line.
function approvalOf(skill: PackSkill): string {
  const floored = skill.actions.filter((a) => FLOORED_ACTIONS.includes(a));
  if (floored.length === 0) return skill.requiresApproval;
  const lines = floored.map(() => PLAN.floorSkill);
  return (floored.length === skill.actions.length ? lines : [skill.requiresApproval, ...lines]).join('\n');
}

function expectedSkillText(skill: PackSkill): string {
  return [
    `Here's a workflow called ${skill.name}.`,
    `Use it when: ${skill.whenToUse}`,
    `Inputs: ${skill.inputs}`,
    'Steps:',
    stepsBlock(skill),
    `Check before you answer: ${skill.validate}`,
    `Return: ${skill.returns}`,
    `Needs my approval first: ${approvalOf(skill)}`,
    PLAN.skillSuffix,
  ].join('\n');
}

function expectedRoutineText(skill: PackSkill): string {
  return [
    `I'd like a scheduled task called ${skill.name}.`,
    `Schedule: ${skill.schedule}`,
    `Use it when: ${skill.whenToUse}`,
    `Inputs: ${skill.inputs}`,
    'Steps:',
    stepsBlock(skill),
    `Check before you report: ${skill.validate}`,
    `Return: ${skill.returns}`,
    `Needs my approval first: ${approvalOf(skill)}`,
    PLAN.routineClose,
    PLAN.routineConfirm,
  ].join('\n');
}

// A line of a workflow that is a field label with nothing after it, or any field label at all.
const EMPTY_FIELD = /^(Use it when|Inputs|Return|Check before you (answer|report)|Needs my approval first|Schedule):\s*$/m;
const ANY_FIELD = /^(Use it when|Inputs|Steps|Return|Check before you (answer|report)|Needs my approval first|Schedule):/m;

const spokenWorkflows = (result: CompileResult) => result.spoken.filter((s) => s.kind === 'skill' || s.kind === 'routine');

// ---------------------------------------------------------------------------------------------
// Sweeps shared by several blocks: every starter with every pack added, on the dot.

interface Case {
  name: string;
  build: Build;
}

const SWEEP: Case[] = STARTERS.flatMap((starter) => {
  const base = dotOf(starter);
  return library.packs.map((pack) => ({
    name: `${starter} + ${pack.id}`,
    build: { ...base, packs: base.packs.includes(pack.id) ? base.packs : [...base.packs, pack.id] },
  }));
});

// One single-chip, no-pack build per chip that carries skills, so no pack skill shadows a chip skill.
const CHIPS_WITH_SKILLS = library.chips.filter((c) => (c.skills ?? []).length > 0);

// ---------------------------------------------------------------------------------------------
// UI setup shared by the rendering blocks.

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

const PROXY = 'https://preview.example.test';

beforeEach(() => {
  st().reset();
  resetPreviewSession();
  // The preview chat is off unless a block turns it on.
  vi.stubEnv('VITE_PREVIEW_URL', '');
  // jsdom implements neither scrollTo (every screen calls it) nor scrollIntoView (the chat log does).
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  st().reset();
});

// ---------------------------------------------------------------------------------------------
// The plan's strings are in the library (so a failure below can say which side moved).

describe('the plan strings are in the library records', () => {
  it('the dot chassis variants, short variants and gate soul variant', () => {
    expect(DOT.chassisVariants['chassis.act.approval']).toBe(PLAN.chassis.approval.full);
    expect(DOT.chassisVariants['chassis.act.reversible']).toBe(PLAN.chassis.reversible.full);
    expect(DOT.chassisVariants['chassis.rules.outrank']).toBe(PLAN.chassis.outrank.full);
    expect(DOT.chassisShortVariants?.['chassis.act.approval']).toBe(PLAN.chassis.approval.short);
    expect(DOT.chassisShortVariants?.['chassis.act.reversible']).toBe(PLAN.chassis.reversible.short);
    expect(DOT.chassisShortVariants?.['chassis.rules.outrank']).toBe(PLAN.chassis.outrank.short);
    expect(DOT.chassisVariants['chassis.clash.order']).toBe(PLAN.chassis.clash.full);
    expect(DOT.chassisShortVariants?.['chassis.clash.order']).toBe(PLAN.chassis.clash.short);
    expect(DOT.gateSoulVariants).toEqual({ 'gate.send.soul.approve': PLAN.sendApprove });
  });

  it('the trade floor: setting, note template, skill line and their ids', () => {
    const floors = DOT.gateFloors;
    expect(Object.keys(floors ?? {})).toEqual(['trade']);
    expect(floors?.trade.setting).toBe('forbid');
    expect(floors?.trade.skill).toEqual({ id: 'profile.chatgpt-dot.floor.trade.skill', line: PLAN.floorSkill });
    expect(floors?.trade.note.id).toBe('profile.chatgpt-dot.floor.trade.note');
    expect(floors?.trade.note.line.replace('{setting}', PLAN.settingLabels.approve)).toBe(floorNoteFor('approve'));
  });

  it('the workflow templates, the confirm line and the role fallback', () => {
    const t = DOT.templates;
    expect(t['skill.legacy'].line).toBe(`${PLAN.legacySkillLead}{sentence}.`);
    expect(t['routine.legacy'].line).toBe(`${PLAN.legacyRoutineLead}{schedule}, {sentence}.`);
    expect(t['skill.suffix'].line).toBe(PLAN.skillSuffix);
    expect(t['routine.confirm'].line).toBe(PLAN.routineConfirm);
    expect(t['fallback.roles'].line).toBe(`${PLAN.roleFallbackLead}{roles}.`);
  });

  it('the item labels: Workflow and Scheduled task on the dot, no label field on the others', () => {
    expect(DOT.skillLabel).toBe(PLAN.skillLabel);
    expect(DOT.routineLabel).toBe(PLAN.routineLabel);
    for (const p of library.targets.profiles.filter((x) => x.id !== 'chatgpt-dot')) {
      expect(p.routineLabel, `${p.id}: routineLabel`).toBeUndefined();
    }
  });

  it('the setting labels, the steps, the notes, the budget and the two target lines', () => {
    expect(DOT.customRuleSettings).toEqual(PLAN.settingLabels);
    expect(DOT.installSteps.map((s) => s.line)).toEqual(PLAN.steps);
    expect(DOT.verify.find((v) => v.id === 'profile.chatgpt-dot.verify.3')?.line).toBe(PLAN.verify3);
    expect(DOT.verify.find((v) => v.id === 'profile.chatgpt-dot.verify.4')?.line).toBe(PLAN.verify4);
    expect(DOT.notes?.map((n) => n.line)).toEqual([PLAN.note1]);
    expect(DOT.rulesPath).toBeUndefined();
    expect(DOT.lengthCap).toBe(3600);
    const chatgpt = library.targets.targets.find((t) => t.id === 'chatgpt');
    expect(chatgpt?.promise.line).toBe(PLAN.promise);
    expect(chatgpt?.modes?.find((m) => m.id === 'dot')?.note.line).toBe(PLAN.modeNote);
  });

  it('the UI copy', () => {
    expect(copy.gatesCopy['chatgpt-dot']).toBe(PLAN.gatesCopy);
    expect(copy.gates.floorNotes.trade).toBe(PLAN.tradesRow);
    expect(copy.certificate.summary.autoDot).toBe(PLAN.autoDot);
    expect(copy.certificate.summary.dotAutoNoLimits(1)).toBe(PLAN.noLimitsOne);
    expect(copy.certificate.summary.dotAutoNoLimits(2)).toBe(PLAN.noLimitsMany);
    expect(copy.certificate.summary.dotBudget(3600)).toBe(dotBudgetFor(3600));
    expect(copy.certificate.groups.dotSkills).toBe(PLAN.dotSkillsGroup);
    expect(copy.certificate.groups.dotRoutines).toBe(PLAN.dotRoutinesGroup);
    expect(copy.certificate.customRules.caption).toBe(PLAN.tableCaption);
    expect(copy.certificate.customRules.settingToRequest).toBe(PLAN.tableSetting);
    expect(copy.chat.dotDisclosure).toBe(PLAN.disclosure);
  });

  it('the old non-dot wording is untouched where the dot did not need it', () => {
    expect(copy.certificate.summary.auto).toBe(PLAN.autoOld);
    expect(copy.certificate.customRules.setting).toBe('Setting:');
    expect(copy.certificate.groups.skills).toBe('Skills');
    expect(copy.certificate.groups.routines).toBe('Routines');
  });
});

// ---------------------------------------------------------------------------------------------
// 1. Workflow contract.

describe('1. workflow contract on the dot', () => {
  const totalPackSkills = library.packs.reduce((n, p) => n + p.skills.length, 0);

  it('premise: every pack skill gives all seven fields, so a verbatim check is never vacuous', () => {
    expect(totalPackSkills).toBeGreaterThan(20);
    for (const pack of library.packs) {
      for (const s of pack.skills) {
        const where = `${pack.id}/${s.id}`;
        expect(s.whenToUse.trim().length, `${where} whenToUse`).toBeGreaterThan(0);
        expect(s.inputs.trim().length, `${where} inputs`).toBeGreaterThan(0);
        expect(s.steps.length, `${where} steps`).toBeGreaterThan(0);
        expect(s.validate.trim().length, `${where} validate`).toBeGreaterThan(0);
        expect(s.returns.trim().length, `${where} returns`).toBeGreaterThan(0);
        expect(s.requiresApproval.trim().length, `${where} requiresApproval`).toBeGreaterThan(0);
        expect(s.requiresApproval.includes('\n'), `${where} requiresApproval is one line`).toBe(false);
        if (s.kind === 'schedule') expect((s.schedule ?? '').trim().length, `${where} schedule`).toBeGreaterThan(0);
      }
    }
    expect(library.packs.flatMap((p) => p.skills).some((s) => s.kind === 'schedule')).toBe(true);
    expect(library.packs.flatMap((p) => p.skills).some((s) => s.kind === 'trigger')).toBe(true);
  });

  describe.each(STARTERS)('%s with each pack added', (starter) => {
    it('carries every field of every pack skill and routine, with every id traced and no placeholder left', () => {
      for (const c of SWEEP.filter((x) => x.name.startsWith(`${starter} + `))) {
        const result = run(c.build);
        expect(result.profile, c.name).toBe('chatgpt-dot');
        expect(() => traceBundle(result, library), `${c.name}: trace`).not.toThrow();

        for (const packId of c.build.packs) {
          for (const skill of packOf(packId).skills) {
            const routine = skill.kind === 'schedule';
            const id = `pack.${packId}.skill.${skill.id}`;
            const items = result.spoken.filter((s) => s.ids.includes(id));
            expect(items, `${c.name}: ${id} is delivered once`).toHaveLength(1);
            const item = items[0];
            expect(item.kind, `${c.name}: ${id} kind`).toBe(routine ? 'routine' : 'skill');
            expect(item.label, `${c.name}: ${id} label`).toBe(
              `${routine ? PLAN.routineLabel : PLAN.skillLabel}: ${skill.name}`,
            );

            const text = item.text;
            expect(text, `${c.name}: ${id} whenToUse`).toContain(skill.whenToUse);
            expect(text, `${c.name}: ${id} inputs`).toContain(skill.inputs);
            skill.steps.forEach((step, i) => {
              expect(text, `${c.name}: ${id} step ${i + 1}`).toContain(`${i + 1}. ${step}`);
            });
            expect(text, `${c.name}: ${id} validate`).toContain(skill.validate);
            expect(text, `${c.name}: ${id} returns`).toContain(skill.returns);
            expect(text.split('\n'), `${c.name}: ${id} approval line`).toContain(
              `Needs my approval first: ${approvalOf(skill).split('\n')[0]}`,
            );
            if (routine) expect(text, `${c.name}: ${id} schedule`).toContain(`Schedule: ${skill.schedule}`);
            // The whole text, label by label, in the order the plan gives.
            expect(text, `${c.name}: ${id} whole text`).toBe(routine ? expectedRoutineText(skill) : expectedSkillText(skill));
            expect(EMPTY_FIELD.test(text), `${c.name}: ${id} has an empty field line`).toBe(false);
          }
        }

        // No placeholder survives anywhere a person reads, and every id behind a spoken item traces.
        for (const text of bundleTexts(result)) {
          expect(text.includes('{') || text.includes('}'), `${c.name}: a brace is left in "${text.slice(0, 60)}"`).toBe(false);
        }
        const known = libraryIds(library);
        for (const item of result.spoken) {
          for (const id of item.ids) expect(known.has(id), `${c.name}: ${item.label} cites unknown id ${id}`).toBe(true);
        }
      }
    });
  });

  it('the sweep delivers every pack skill and routine in the library at least once', () => {
    const delivered = new Set<string>();
    for (const c of SWEEP) {
      for (const item of run(c.build).spoken) {
        for (const id of item.ids) if (/^pack\..+\.skill\./.test(id)) delivered.add(id);
      }
    }
    const all = library.packs.flatMap((p) => p.skills.map((s) => `pack.${p.id}.skill.${s.id}`));
    expect([...delivered].sort()).toEqual(all.sort());
  });

  describe('Personal-ops Morning brief', () => {
    const skill = skillOf('personal-ops', 'morning-brief');
    const june = run(dotOf('june'));
    const brief = june.spoken.find((s) => s.label === `${PLAN.routineLabel}: Morning brief`);

    it('premise: June carries the personal-ops pack, and the library text holds both phrases', () => {
      expect(dotOf('june').packs).toContain('personal-ops');
      expect(skill.validate).toContain('ten lines or fewer');
      expect(skill.returns).toContain('ten lines or fewer');
      expect(skill.returns).toContain('numbered asks');
    });

    it('keeps "ten lines or fewer" and "numbered asks", and its Check and Return lines verbatim', () => {
      expect(brief).toBeDefined();
      expect(brief!.text).toContain('ten lines or fewer');
      expect(brief!.text).toContain('numbered asks');
      const lines = brief!.text.split('\n');
      expect(lines).toContain(`Check before you report: ${skill.validate}`);
      expect(lines).toContain(`Return: ${skill.returns}`);
      expect(lines).toContain(`Schedule: ${skill.schedule}`);
      expect(lines).toContain(`Needs my approval first: ${skill.requiresApproval}`);
    });
  });

  describe('research and sales workflows keep their Check and Return lines', () => {
    const CASES: [string, string][] = [
      ['research', 'source-tier'],
      ['research', 'citation-check'],
      ['sales', 'pre-send-read'],
      ['sales', 'follow-up-cadence'],
    ];

    it.each(CASES)('%s / %s', (packId, skillId) => {
      const skill = skillOf(packId, skillId);
      const routine = skill.kind === 'schedule';
      const result = run(withPacks(VERA, [packId]));
      const item = result.spoken.find((s) => s.ids.includes(`pack.${packId}.skill.${skillId}`));
      expect(item).toBeDefined();
      const lines = item!.text.split('\n');
      expect(lines).toContain(`${routine ? 'Check before you report' : 'Check before you answer'}: ${skill.validate}`);
      expect(lines).toContain(`Return: ${skill.returns}`);
      expect(lines).toContain(`Inputs: ${skill.inputs}`);
      expect(lines).toContain(`Use it when: ${skill.whenToUse}`);
      expect(item!.kind).toBe(routine ? 'routine' : 'skill');
    });

    it('covers one routine and three skills', () => {
      expect(CASES.map(([p, s]) => skillOf(p, s).kind)).toEqual(['trigger', 'trigger', 'trigger', 'schedule']);
    });
  });

  describe('legacy chip workflows read cleanly', () => {
    it('premise: the library has chip skills and chip routines to check', () => {
      const all = CHIPS_WITH_SKILLS.flatMap((c) => c.skills ?? []);
      expect(all.length).toBeGreaterThan(30);
      expect(all.some((s) => s.kind === 'schedule')).toBe(true);
      expect(all.some((s) => s.kind === 'trigger')).toBe(true);
    });

    it.each(CHIPS_WITH_SKILLS.map((c) => [c.id] as const))('%s', (chipId) => {
      const chip = library.chips.find((c) => c.id === chipId)!;
      const result = run(chipOnly(chipId));
      expect(() => traceBundle(result, library), `${chipId}: trace`).not.toThrow();
      for (const skill of chip.skills ?? []) {
        const items = result.spoken.filter((s) => s.ids.includes(skill.id));
        expect(items, `${skill.id} is delivered once`).toHaveLength(1);
        const item = items[0];
        const routine = skill.kind === 'schedule';
        expect(item.kind, skill.id).toBe(routine ? 'routine' : 'skill');
        const expected = routine
          ? `${PLAN.legacyRoutineLead}${skill.schedule}, ${lowerFirst(skill.sentence)}.\n${PLAN.routineConfirm}`
          : `${PLAN.legacySkillLead}${lowerFirst(skill.sentence)}.\n${PLAN.skillSuffix}`;
        expect(item.text, skill.id).toBe(expected);
        // The legacy form is one sentence: no workflow field label, empty or not.
        expect(ANY_FIELD.test(item.text), `${skill.id}: field label in a legacy workflow`).toBe(false);
        expect(item.text.includes('undefined'), `${skill.id}: undefined`).toBe(false);
        expect(item.text.includes('{') || item.text.includes('}'), `${skill.id}: brace`).toBe(false);
      }
      for (const text of bundleTexts(result)) {
        expect(text.includes('{') || text.includes('}'), `${chipId}: a brace is left in "${text.slice(0, 60)}"`).toBe(false);
      }
    });

    it('every chip skill is delivered by its single-chip build', () => {
      const delivered = new Set<string>();
      for (const chip of CHIPS_WITH_SKILLS) {
        for (const item of run(chipOnly(chip.id)).spoken) {
          for (const id of item.ids) if (/^chip\..+\.skill\./.test(id)) delivered.add(id);
        }
      }
      expect([...delivered].sort()).toEqual(CHIPS_WITH_SKILLS.flatMap((c) => (c.skills ?? []).map((s) => s.id)).sort());
    });

    it('a pack skill with the same name replaces the chip skill, so each name is told once (Dash: sales)', () => {
      const result = run(dotOf('dash'));
      const names = spokenWorkflows(result).map((s) => s.label);
      expect(new Set(names).size).toBe(names.length);
      const preSend = result.spoken.filter((s) => s.label === `${PLAN.skillLabel}: Pre-send read`);
      expect(preSend).toHaveLength(1);
      expect(preSend[0].text.startsWith("Here's a workflow called Pre-send read.")).toBe(true);
    });
  });

  it('the personality, memory and every note carry no placeholder on any starter', () => {
    for (const starter of STARTERS) {
      const result = run(dotOf(starter));
      for (const text of bundleTexts(result)) {
        expect(text.includes('{') || text.includes('}'), `${starter}: a brace is left in "${text.slice(0, 60)}"`).toBe(false);
      }
      expect(() => traceBundle(result, library), starter).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 2. One permission wording.

describe('2. consistent permission wording on the dot', () => {
  const GATES = ['trade', 'send', 'refund', 'deploy', 'publish'] as const;
  const SETTINGS: GateSetting[] = ['auto', 'approve', 'forbid'];
  const offering = (gate: string) => library.packs.filter((p) => Object.hasOwn(p.gatesDefault, gate)).map((p) => p.id);

  // What the compiler must end at for a pick: Auto where the library gives no auto line is approve,
  // and the dot's trade floor is forbid.
  function settingFor(gate: string, picked: GateSetting): GateSetting {
    let s = picked;
    if (s === 'auto' && gateRecord(gate).soulLine.auto === null) s = 'approve';
    if (gate === 'trade' && s !== 'forbid') s = 'forbid';
    return s;
  }

  // The soul line a gate setting reads: the dot variant if the plan gives one, else the library line.
  function soulLineFor(gate: string, setting: GateSetting): { id: string; text: string } | null {
    const record = gateRecord(gate);
    const libText = record.soulLine[setting];
    if (libText === null) return null;
    const key = `gate.${gate}.soul.${setting}`;
    if (key === 'gate.send.soul.approve') return { id: `${key}@chatgpt-dot`, text: PLAN.sendApprove };
    return { id: key, text: libText };
  }

  it('premise: every gate is offered by at least one pack, and the library line the dot replaces is the old one', () => {
    for (const gate of GATES) expect(offering(gate).length, gate).toBeGreaterThan(0);
    expect(gateRecord('send').soulLine.approve).toContain('I turn on auto when I say so');
  });

  for (const gate of GATES) {
    for (const pack of offering(gate)) {
      for (const picked of SETTINGS) {
        it(`${gate} on ${pack}, picked ${picked}`, () => {
          const build = withPacks(VERA, [pack], { [gate]: picked });
          const result = run(build);
          const label = `${gate}/${pack}/${picked}`;
          expect(() => traceBundle(result, library), `${label}: trace`).not.toThrow();

          // The picked setting, after the library's auto clamp and the dot's trade floor.
          expect(result.gates[gate], `${label}: effective setting`).toBe(settingFor(gate, picked));

          // No old wording anywhere in the message the dot is sent.
          for (const banned of BANNED_WORDING) {
            expect(result.soul.includes(banned), `${label}: soul has "${banned}"`).toBe(false);
          }
          // The dot's own wording for approval, reversible things and which side outranks (full or short).
          for (const [name, v] of Object.entries(PLAN.chassis)) {
            expect(result.soul.includes(v.full) || result.soul.includes(v.short), `${label}: soul lacks the ${name} line`).toBe(true);
          }

          // The rules table agrees with the gates: one row per gate, its setting the label of that gate.
          expect(result.customRules.map((r) => r.gate), `${label}: rows`).toEqual(Object.keys(result.gates));
          for (const rule of result.customRules) {
            expect(rule.setting, `${label}: ${rule.gate} row`).toBe(PLAN.settingLabels[result.gates[rule.gate]]);
            expect(rule.action, `${label}: ${rule.gate} action`).toBe(gateRecord(rule.gate).customRuleText);
          }

          // The soul says, for each gate, the line for the setting the gate ended at, and no other.
          const present = result.soulLines
            .filter((l) => /^gate\..+\.soul\./.test(l.id))
            .map((l) => ({ id: l.id, text: l.text }))
            .sort((a, b) => a.id.localeCompare(b.id));
          const wanted = Object.entries(result.gates)
            .flatMap(([g, s]) => {
              const line = soulLineFor(g, s);
              return line === null ? [] : [{ id: line.id, text: `- ${line.text}` }];
            })
            .sort((a, b) => a.id.localeCompare(b.id));
          expect(present, `${label}: gate soul lines`).toEqual(wanted);
        });
      }
    }
  }

  it.each(STARTERS)('%s: the soul carries the dot approval, reversible and outrank wording', (starter) => {
    const soul = run(dotOf(starter)).soul;
    for (const [name, v] of Object.entries(PLAN.chassis)) {
      expect(soul.includes(v.full) || soul.includes(v.short), `${starter}: the ${name} line`).toBe(true);
    }
    for (const banned of BANNED_WORDING) expect(soul.includes(banned), `${starter}: "${banned}"`).toBe(false);
  });

  it('the old wording is gone from every spoken item, step and note too, on every starter', () => {
    for (const starter of STARTERS) {
      const result = run(dotOf(starter));
      for (const text of bundleTexts(result)) {
        for (const banned of BANNED_WORDING) {
          expect(text.includes(banned), `${starter}: "${banned}" in "${text.slice(0, 80)}"`).toBe(false);
        }
      }
    }
  });

  it('the send approve line is the dot variant, traced as such, and no other target gets it', () => {
    const dot = run(withPacks(VERA, ['sales']));
    expect(dot.gates.send).toBe('approve');
    const line = dot.soulLines.find((l) => l.id === 'gate.send.soul.approve@chatgpt-dot');
    expect(line?.text).toBe(`- ${PLAN.sendApprove}`);
    expect(dot.soulLines.some((l) => l.id === 'gate.send.soul.approve')).toBe(false);

    for (const [name, build] of [
      ['muse', onTarget('dash', 'muse')],
      ['openclaw', onTarget('dash', 'openclaw')],
      ['hermes', onTarget('dash', 'hermes')],
      ['grok', onTarget('dash', 'grok')],
    ] as [string, Build][]) {
      const result = run(build);
      const all = idsOfResult(result);
      expect(all.some((id) => id.includes('@chatgpt-dot')), `${name}: dot variant id`).toBe(false);
      expect(bundleTexts(result).some((t) => t.includes(PLAN.sendApprove)), `${name}: dot send wording`).toBe(false);
    }
  });

  it('the other targets still say what they said: Muse keeps the library reversible line', () => {
    const reversible = library.chassis.lines.find((l) => l.id === 'chassis.act.reversible')!;
    const muse = run(onTarget('marty', 'muse'));
    expect(muse.soul.includes(reversible.line) || muse.soul.includes(reversible.short ?? reversible.line)).toBe(true);
    expect(muse.soul.includes(PLAN.chassis.reversible.full)).toBe(false);
    expect(muse.soul.includes(PLAN.chassis.reversible.short)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. The trade floor.

describe('3. the trade floor on the dot', () => {
  const floorNotes = (r: CompileResult) => r.noteItems.filter((n) => n.kind === 'floor');

  it('premise: four packs offer trades, each defaults to approve, and some pack skills take the trade action', () => {
    expect([...TRADE_PACKS].sort()).toEqual(['memecoins', 'perps', 'prediction-markets', 'spot']);
    for (const id of TRADE_PACKS) expect(packOf(id).gatesDefault.trade, id).toBe('approve');
    expect(library.packs.flatMap((p) => p.skills).filter((s) => s.actions.includes('trade')).length).toBeGreaterThan(3);
  });

  describe.each(TRADE_PACKS)('on %s', (pack) => {
    it.each(['auto', 'approve'] as const)('trade picked %s compiles to forbid with one note naming the pick', (picked) => {
      const result = run(withPacks(VERA, [pack], { trade: picked }));
      expect(result.gates.trade).toBe('forbid');
      expect(result.gates.pay).toBe('forbid');
      expect(result.customRules.find((r) => r.gate === 'trade')?.setting).toBe(PLAN.settingLabels.forbid);
      const notes = floorNotes(result);
      expect(notes).toHaveLength(1);
      expect(notes[0].text).toBe(floorNoteFor(picked));
      expect(notes[0].id).toBe('profile.chatgpt-dot.floor.trade.note');
      expect(result.notes).toContain(floorNoteFor(picked));
      expect(() => traceBundle(result, library)).not.toThrow();
      // The soul says the forbid line for trades, and not the approve or auto line.
      const tradeLines = result.soulLines.filter((l) => /^gate\.trade\.soul\./.test(l.id));
      expect(tradeLines.map((l) => l.id)).toEqual(['gate.trade.soul.forbid']);
      expect(tradeLines[0].text).toBe(`- ${gateRecord('trade').soulLine.forbid}`);
    });

    it('the pack default alone (no pick in the build) is approve, so the note names "Ask before taking action"', () => {
      const result = run(withPacks(VERA, [pack]));
      expect(result.gates.trade).toBe('forbid');
      const notes = floorNotes(result);
      expect(notes).toHaveLength(1);
      expect(notes[0].text).toBe(floorNoteFor('approve'));
      expect(notes[0].text).toContain(`"${PLAN.settingLabels.approve}"`);
    });

    it('trade picked forbid adds no floor note and no floor id', () => {
      const result = run(withPacks(VERA, [pack], { trade: 'forbid' }));
      expect(result.gates.trade).toBe('forbid');
      expect(floorNotes(result)).toEqual([]);
      expect(result.notes.some((n) => n.includes('This setup doesn\'t let your dot place trades'))).toBe(false);
      expect(idsOfResult(result).includes('profile.chatgpt-dot.floor.trade.note')).toBe(false);
    });
  });

  it('two trade packs still give one note, and the strictest pack default does not matter', () => {
    const result = run(withPacks(VERA, ['memecoins', 'perps'], { trade: 'auto' }));
    expect(floorNotes(result)).toHaveLength(1);
    expect(floorNotes(result)[0].text).toBe(floorNoteFor('auto'));
  });

  it('a build with no trade gate gets no floor note, and Pay never gets one', () => {
    for (const pack of ['sales', 'research', 'support', 'content']) {
      const result = run(withPacks(VERA, [pack]));
      expect(floorNotes(result), pack).toEqual([]);
    }
    expect(floorNotes(run(VERA))).toEqual([]);
    // A starter gets the note exactly when its packs offer trades (every trade pack defaults to approve).
    for (const starter of STARTERS) {
      const result = run(dotOf(starter));
      expect(floorNotes(result).length, starter).toBe(Object.hasOwn(result.gates, 'trade') ? 1 : 0);
    }
  });

  describe('build.gates is never rewritten (share links keep working)', () => {
    it.each(['auto', 'approve', 'forbid'] as const)('a build with trade %s is the same object after compile', (picked) => {
      const build = withPacks(VERA, ['memecoins'], { trade: picked });
      const snapshot = structuredClone(build);
      const hashBefore = toShareHash(build);
      const result = compile(build);
      expect(result.gates.trade).toBe('forbid');
      expect(build).toEqual(snapshot);
      expect(build.gates).toEqual({ trade: picked });
      expect(toShareHash(build)).toBe(hashBefore);
      // The link still carries the pick, and opening it gives the same build back.
      const decoded = fromShareHash(hashBefore, library).build;
      expect(decoded.gates).toEqual({ trade: picked });
      expect(toShareHash(decoded)).toBe(hashBefore);
    });

    it('the starter builds and a build with a trade pack default are unchanged by compile too', () => {
      for (const starter of STARTERS) {
        const build = dotOf(starter);
        const hash = toShareHash(build);
        const snapshot = structuredClone(build);
        compile(build);
        expect(build, starter).toEqual(snapshot);
        expect(toShareHash(build), starter).toBe(hash);
      }
    });

    it('the library is not mutated either: the floor still reads forbid and the pack default still approve', () => {
      const before = JSON.stringify(library.targets.profiles) + JSON.stringify(library.packs);
      compile(withPacks(VERA, ['memecoins'], { trade: 'auto' }));
      expect(JSON.stringify(library.targets.profiles) + JSON.stringify(library.packs)).toBe(before);
    });
  });

  describe('switching target keeps the pick (the Gates note on a dot promises it)', () => {
    const picked = withPacks(dotOf('marty'), ['memecoins'], { trade: 'auto' });

    it('retarget: OpenClaw gets auto back, and the dot floors it again on the way back', () => {
      const elsewhere = retarget(picked, 'openclaw');
      expect(elsewhere.gates).toEqual({ trade: 'auto' });
      expect(compile(elsewhere).gates.trade).toBe('auto');
      const back = retarget(elsewhere, 'chatgpt', 'dot');
      expect(back.gates).toEqual({ trade: 'auto' });
      expect(compile(back).gates.trade).toBe('forbid');
    });

    it('in the app: "Make this for OpenClaw instead" and back', () => {
      act(() => st().loadBuild(picked, { from: 'link' }));
      const dotResult = compiled(st());
      expect(isCompileError(dotResult)).toBe(false);
      if (isCompileError(dotResult)) return;
      expect(dotResult.gates.trade).toBe('forbid');
      expect(dotResult.noteItems.filter((n) => n.kind === 'floor').map((n) => n.text)).toEqual([floorNoteFor('auto')]);

      act(() => st().switchTarget('openclaw'));
      const away = compiled(st());
      expect(isCompileError(away)).toBe(false);
      if (isCompileError(away)) return;
      expect(away.gates.trade).toBe('auto');
      expect(away.noteItems.filter((n) => n.kind === 'floor')).toEqual([]);
      expect(st().draft.gates.trade).toBe('auto');

      act(() => st().switchTarget('chatgpt'));
      const back = compiled(st());
      expect(isCompileError(back)).toBe(false);
      if (isCompileError(back)) return;
      expect(back.profile).toBe('chatgpt-dot');
      expect(back.gates.trade).toBe('forbid');
      expect(back.noteItems.filter((n) => n.kind === 'floor').map((n) => n.text)).toEqual([floorNoteFor('auto')]);
    });
  });

  describe('the floor skill line is the approval of every pack skill and routine whose only action is trade', () => {
    const TRADE_SKILLS = library.packs.flatMap((p) =>
      p.skills.filter((s) => s.actions.includes('trade')).map((s) => ({ pack: p.id, skill: s })),
    );

    it('premise: every trade workflow in the library takes only the trade action', () => {
      expect(TRADE_SKILLS.length).toBeGreaterThan(3);
      for (const { pack, skill } of TRADE_SKILLS) expect(skill.actions, `${pack}/${skill.id}`).toEqual(['trade']);
    });

    it.each(['auto', 'approve', 'forbid'] as const)(
      'whatever the pick (%s), "Needs my approval first:" is followed directly by the floor line, and the pack text is gone',
      (picked) => {
        for (const { pack, skill } of TRADE_SKILLS) {
          const result = run(withPacks(VERA, [pack], { trade: picked }));
          const id = `pack.${pack}.skill.${skill.id}`;
          const item = result.spoken.find((s) => s.ids.includes(id));
          expect(item, id).toBeDefined();
          const lines = item!.text.split('\n');
          const approvals = lines.filter((l) => l.startsWith('Needs my approval first:'));
          expect(approvals, `${id} (${picked}): one approval line`).toEqual([`Needs my approval first: ${PLAN.floorSkill}`]);
          expect(lines.filter((l) => l === PLAN.floorSkill), `${id}: no separate floor line`).toHaveLength(0);
          expect(item!.text.split(PLAN.floorSkill), `${id}: floor line once`).toHaveLength(2);
          // The pack's own trade approval text is not in the dot output at all.
          expect(item!.text.includes(skill.requiresApproval), `${id} (${picked}): pack approval text`).toBe(false);
          expect(item!.ids, `${id}: ids`).toContain('profile.chatgpt-dot.floor.trade.skill');
          expect(() => traceBundle(result, library)).not.toThrow();
        }
      },
    );

    it('but the pack approval text is still in the same skills on the other targets', () => {
      for (const { pack, skill } of TRADE_SKILLS) {
        const muse = compile(withPacks(onTarget('vera', 'muse'), [pack], { trade: 'approve' }));
        const spoken = muse.spoken.find((s) => s.ids.includes(`pack.${pack}.skill.${skill.id}`));
        expect(spoken?.text.includes(skill.requiresApproval), `${pack}/${skill.id} on muse`).toBe(true);
        const openclaw = compile(withPacks(onTarget('vera', 'openclaw'), [pack], { trade: 'approve' }));
        const file = openclaw.files.find((f) => f.path === `skills/${skill.id}/SKILL.md`);
        expect(file?.content.includes(skill.requiresApproval), `${pack}/${skill.id} on openclaw`).toBe(true);
      }
    });

    it('no skill or routine without the trade action carries it, and no legacy chip workflow does', () => {
      for (const c of SWEEP) {
        const result = run(c.build);
        for (const item of spokenWorkflows(result)) {
          const packSkill = library.packs
            .flatMap((p) => p.skills.map((s) => ({ id: `pack.${p.id}.skill.${s.id}`, s })))
            .find((x) => item.ids.includes(x.id));
          const wants = packSkill !== undefined && packSkill.s.actions.includes('trade');
          expect(item.text.includes(PLAN.floorSkill), `${c.name}: ${item.label}`).toBe(wants);
          expect(item.ids.includes('profile.chatgpt-dot.floor.trade.skill'), `${c.name}: ${item.label} ids`).toBe(wants);
        }
      }
    });

    it('the personality message does not repeat the floor skill line', () => {
      const result = run(withPacks(VERA, ['memecoins'], { trade: 'auto' }));
      expect(result.soul.includes(PLAN.floorSkill)).toBe(false);
    });
  });

  describe('other targets are not floored', () => {
    const TARGETS: { name: string; target: TargetId; mode?: ChatgptMode; plan?: Plan }[] = [
      { name: 'muse', target: 'muse' },
      { name: 'openclaw', target: 'openclaw' },
      { name: 'hermes', target: 'hermes' },
      { name: 'grok', target: 'grok' },
      { name: 'chatgpt gpt', target: 'chatgpt', mode: 'gpt' },
      { name: 'chatgpt project', target: 'chatgpt', mode: 'project' },
      { name: 'chatgpt instructions (paid)', target: 'chatgpt', mode: 'instructions', plan: 'paid' },
      { name: 'chatgpt instructions (free)', target: 'chatgpt', mode: 'instructions', plan: 'free' },
    ];

    it.each(TARGETS)('$name: trade auto stays auto, with no note and no dot ids', (t) => {
      for (const pack of TRADE_PACKS) {
        const build = withPacks(onTarget('vera', t.target, t.mode, t.plan), [pack], { trade: 'auto' });
        const result = compile(build);
        expect(result.gates.trade, `${pack}`).toBe('auto');
        expect(result.noteItems.filter((n) => n.kind === 'floor'), `${pack}: floor notes`).toEqual([]);
        expect(result.customRules, `${pack}: custom rules`).toEqual([]);
        const ids = idsOfResult(result);
        expect(ids.filter((id) => id.includes('@chatgpt-dot') || id.includes('.floor.')), `${pack}: dot ids`).toEqual([]);
        for (const text of bundleTexts(result)) {
          expect(text.includes(PLAN.floorSkill), `${pack}: floor skill line`).toBe(false);
          expect(text.includes("This setup doesn't let your dot place trades"), `${pack}: floor note text`).toBe(false);
        }
        expect(() => traceBundle(result, library), `${pack}: trace`).not.toThrow();
      }
    });

    it.each(TARGETS)('$name: a trade skill is not given the floor line', (t) => {
      const build = withPacks(onTarget('vera', t.target, t.mode, t.plan), ['memecoins'], { trade: 'auto' });
      const result = compile(build);
      const everything = [...bundleTexts(result), ...result.files.flatMap((f) => f.lines.map((l) => l.text))];
      expect(everything.some((x) => x.includes(PLAN.floorSkill))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Pending permission setup: requested, not enforced.

function modelFor(build: Build, without: readonly string[] = [], lib: Library = library): CertModel {
  const compiledResult = compile(build, lib);
  const soul = without.reduce((text, line) => text.split(line).join(''), compiledResult.soul);
  const profile = resolveProfile(build, lib);
  return certificateModel(
    {
      result: { ...compiledResult, soul },
      build,
      profile,
      cap: capOf(profile, build),
      skipped: [],
      drops: [],
      decodeWarnings: [],
    },
    lib,
  );
}

describe('4. requested, not enforced: the certificate model on the dot', () => {
  const autoSend = withPacks(VERA, ['sales'], { send: 'auto' });
  const sendLabel = gateRecord('send').label;

  it('an auto gate reads "Requested to run without asking...", not "Auto, no yes asked:"', () => {
    const model = modelFor(autoSend);
    const line = model.summary.find((s) => s.kind === 'auto');
    expect(line).toBeDefined();
    expect(line!.text).toBe(PLAN.autoDot);
    expect(line!.text).not.toBe(PLAN.autoOld);
    expect(line!.items).toEqual([sendLabel]);
    expect(model.summary.some((s) => s.text === PLAN.autoOld)).toBe(false);
  });

  it('the same build on Muse keeps "Auto, no yes asked:"', () => {
    const model = modelFor(withPacks(onTarget('vera', 'muse'), ['sales'], { send: 'auto' }));
    const line = model.summary.find((s) => s.kind === 'auto');
    expect(line?.text).toBe(PLAN.autoOld);
    expect(model.summary.some((s) => s.text === PLAN.autoDot)).toBe(false);
  });

  it('a trade the dot floored is not listed as auto (its setting is forbid)', () => {
    const model = modelFor(withPacks(VERA, ['memecoins'], { trade: 'auto' }));
    expect(model.summary.some((s) => s.kind === 'auto')).toBe(false);
  });

  it('an auto gate with a limit line missing from the message gets the "you asked for" wording (one gate)', () => {
    const limitLine = library.limits.find((l) => l.id === 'max_sends_per_day')!.rulesTemplate.replaceAll(
      '{value}',
      String(packOf('sales').limitsDefault.max_sends_per_day),
    );
    expect(compile(autoSend).soul).toContain(limitLine);
    const model = modelFor(autoSend, [limitLine]);
    const line = model.summary.find((s) => s.key === 'summary-dot-auto');
    expect(line).toBeDefined();
    expect(line!.text).toBe(PLAN.noLimitsOne);
    expect(line!.items).toEqual([sendLabel]);
  });

  it('and the plural wording for two gates', () => {
    const build = withPacks(VERA, ['sales', 'coding'], { send: 'auto', deploy: 'auto' });
    const limitLine = library.limits
      .find((l) => l.id === 'max_sends_per_day')!
      .rulesTemplate.replaceAll('{value}', String(packOf('sales').limitsDefault.max_sends_per_day));
    const model = modelFor(build, [limitLine]);
    const line = model.summary.find((s) => s.key === 'summary-dot-auto');
    expect(line).toBeDefined();
    expect(line!.text).toBe(PLAN.noLimitsMany);
    expect(line!.items).toEqual([sendLabel, gateRecord('deploy').label]);
  });

  describe('the trade floor is a summary item, not a note', () => {
    it.each(['auto', 'approve'] as const)('trade picked %s', (picked) => {
      const build = withPacks(dotOf('marty'), ['memecoins'], { trade: picked });
      const model = modelFor(build);
      const floor = model.summary.filter((s) => s.kind === 'floor');
      expect(floor).toHaveLength(1);
      expect(floor[0].text).toBe(floorNoteFor(picked));
      // Not in the notes list, not in Still checking, not beside the rules table.
      expect(model.notes.map((n) => n.text)).not.toContain(floorNoteFor(picked));
      expect(model.notes.some((n) => n.kind === 'floor')).toBe(false);
      expect(model.stillChecking.some((n) => n.kind === 'floor' || n.text === floorNoteFor(picked))).toBe(false);
      for (const step of model.steps) {
        expect(step.customRules?.note?.kind ?? 'note').not.toBe('floor');
        expect(step.groups.some((g) => g.lead?.kind === 'floor')).toBe(false);
      }
    });

    it('the dot keeps its Hand off note beside the table', () => {
      const model = modelFor(dotOf('marty'));
      const table = model.steps.find((s) => s.customRules !== undefined)?.customRules;
      expect(table?.note?.text).toBe(PLAN.note1);
    });

    it('trade picked forbid shows no floor line', () => {
      const model = modelFor(withPacks(dotOf('marty'), ['memecoins'], { trade: 'forbid' }));
      expect(model.summary.some((s) => s.kind === 'floor')).toBe(false);
    });

    it('Muse shows none of it', () => {
      const model = modelFor(withPacks(onTarget('marty', 'muse'), ['memecoins'], { trade: 'auto' }));
      expect(model.summary.some((s) => s.kind === 'floor')).toBe(false);
      expect(model.summary.map((s) => s.text).join(' ')).not.toContain("doesn't let your dot place trades");
      expect(model.steps.some((s) => s.customRules !== undefined)).toBe(false);
    });
  });

  describe('the rules table', () => {
    it('has the requested caption and the requested setting label on the dot', () => {
      const model = modelFor(dotOf('marty'));
      const table = model.steps.find((s) => s.customRules !== undefined)?.customRules;
      expect(table).toBeDefined();
      expect(table!.caption).toBe(PLAN.tableCaption);
      expect(table!.settingLabel).toBe(PLAN.tableSetting);
      expect(table!.rows.map((r) => r.setting)).toEqual(table!.rows.map((r) => PLAN.settingLabels[run(dotOf('marty')).gates[r.gate]]));
    });

    it('no longer names a Settings path', () => {
      const model = modelFor(dotOf('marty'));
      const table = model.steps.find((s) => s.customRules !== undefined)?.customRules;
      expect(table!.caption).not.toMatch(/Settings|Personalization|Custom rules/i);
    });
  });

  describe("Build a Bot's budget, not ChatGPT's limit", () => {
    it('the cap is still 3600 in the profile, the cap function and the meter', () => {
      expect(DOT.lengthCap).toBe(3600);
      expect(capOf(DOT, dotOf('marty'))).toBe(3600);
      expect(modelFor(dotOf('marty')).meter.cap).toBe(3600);
    });

    it('the trimmed line names the budget (Marty loses three Memecoins rules to fit)', () => {
      const result = run(dotOf('marty'));
      expect(result.trimmed.filter((t) => t.kind === 'pack-rule').length).toBe(3);
      const lines = modelFor(dotOf('marty')).summary.filter((s) => s.kind === 'trimmed');
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.text, line.text).toContain("Build a Bot's");
        expect(line.text, line.text).toContain('3600-character budget');
        expect(line.text, line.text).toContain('for a dot message');
        expect(line.text, line.text).toContain(`To fit ${dotBudgetFor(3600)},`);
        expect(line.text, line.text).not.toContain('ChatGPT');
        expect(line.text, line.text).not.toMatch(/limit for/);
      }
    });

    // A copy of the library whose builder base line is far too long, so the soul stays over 3600
    // after every cut the length pass can make (the technique of dot-hard-rules.test.ts).
    const big: Library = structuredClone(library);
    big.bases.find((b) => b.id === 'builder')!.baseLine = 'x'.repeat(4000);
    const tooLong: Build = {
      ...migrate(
        {
          v: 1,
          base: 'builder',
          chips: ['engineering', 'founder', 'sales'],
          stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
          peeves: [],
          heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' },
          outfit: 'staff_engineer',
          name: 'Too Long',
        },
        { target: 'chatgpt', mode: 'dot' },
      ),
      packs: ['perps', 'sales'],
    };

    it('an over-cap soul says how many characters over the budget Build a Bot uses', () => {
      const result = compile(tooLong, big);
      expect(result.length).toBeGreaterThan(3600);
      const model = modelFor(tooLong, [], big);
      const over = model.summary.find((s) => s.kind === 'over');
      expect(over).toBeDefined();
      expect(over!.text).toBe(overDotFor(result.length - 3600, 3600));
      expect(over!.text).not.toContain('ChatGPT');
      expect(over!.text).not.toMatch(/limit for/);
      expect(model.meter.cap).toBe(3600);
    });

    it('says "character" for exactly one', () => {
      expect(copy.certificate.summary.overDot(1, 3600)).toBe(
        "Your bot's personality is 1 character over the 3600-character budget Build a Bot uses for a dot message.",
      );
      expect(copy.certificate.summary.overDot(2, 3600)).toBe(overDotFor(2, 3600));
    });

    it('other targets still name the target and its limit (Muse, 4000)', () => {
      const long = structuredClone(library);
      long.bases.find((b) => b.id === 'builder')!.baseLine = 'x'.repeat(9000);
      const build = migrate(
        {
          v: 1,
          base: 'builder',
          chips: ['engineering'],
          stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
          peeves: [],
          heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.3' },
          outfit: 'staff_engineer',
          name: 'Too Long',
        },
        { target: 'muse' },
      );
      const result = compile(build, long);
      expect(result.length).toBeGreaterThan(4000);
      const over = modelFor(build, [], long).summary.find((s) => s.kind === 'over');
      expect(over).toBeDefined();
      expect(over!.text).toBe(
        `Your bot's personality is ${result.length - 4000} characters over the 4000 limit for Muse.`,
      );
      expect(over!.text).not.toContain('budget Build a Bot uses');
    });
  });
});

describe('4. requested, not enforced: the screens', () => {
  const tradeGroup = (id: string) => screen.getByRole('radiogroup', { name: gateRecord(id).label });

  function openGates(o: { target: TargetId; mode?: ChatgptMode; packs: string[] }): void {
    store((s) => {
      s.setTarget(o.target, o.mode);
      s.startBlank();
      s.setBase('trader');
      for (const pack of o.packs) s.togglePack(pack);
      s.go('gates');
    });
    render(<App />);
  }

  describe('the Gates screen on the dot', () => {
    it('describes the settings as permissions to request, and says they do nothing until set up', () => {
      openGates({ target: 'chatgpt', mode: 'dot', packs: ['memecoins'] });
      expect(screen.getByText(PLAN.gatesCopy)).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/enforce/i);
    });

    it.each(TRADE_PACKS)('shows the Trades floor note beside the Trades row (%s)', (pack) => {
      openGates({ target: 'chatgpt', mode: 'dot', packs: [pack] });
      expect(screen.getByText(PLAN.tradesRow)).toBeTruthy();
      const describedBy = (tradeGroup('trade').getAttribute('aria-describedby') ?? '').split(/\s+/);
      expect(describedBy.some((id) => document.getElementById(id)?.textContent === PLAN.tradesRow)).toBe(true);
      expect(screen.getAllByText(PLAN.tradesRow)).toHaveLength(1);
    });

    it('shows no floor note on a pack with no trade row', () => {
      openGates({ target: 'chatgpt', mode: 'dot', packs: ['sales'] });
      expect(screen.queryByText(PLAN.tradesRow)).toBeNull();
    });

    it('still lets the user pick Auto for Trades, and the stored pick stays auto', async () => {
      const user = userEvent.setup();
      openGates({ target: 'chatgpt', mode: 'dot', packs: ['memecoins'] });
      const group = tradeGroup('trade');
      const autoRadio = within(group).getByRole('radio', { name: PLAN.settingLabels.auto });
      expect(autoRadio.getAttribute('aria-disabled')).not.toBe('true');
      await user.click(autoRadio);

      expect(autoRadio.getAttribute('aria-checked')).toBe('true');
      expect(st().draft.gates.trade).toBe('auto');
      // The note stays, the build keeps the pick, and the compile floors it.
      expect(screen.getByText(PLAN.tradesRow)).toBeTruthy();
      expect(previewBuild(st()).gates.trade).toBe('auto');
      const result = compiled(st());
      expect(isCompileError(result)).toBe(false);
      if (!isCompileError(result)) {
        expect(result.gates.trade).toBe('forbid');
        expect(result.noteItems.filter((n) => n.kind === 'floor').map((n) => n.text)).toEqual([floorNoteFor('auto')]);
      }
    });

    it('uses the dot setting labels on the Trades row', () => {
      openGates({ target: 'chatgpt', mode: 'dot', packs: ['memecoins'] });
      const names = within(tradeGroup('trade'))
        .getAllByRole('radio')
        .map((r) => r.textContent);
      expect(names).toEqual([PLAN.settingLabels.auto, PLAN.settingLabels.approve, PLAN.settingLabels.forbid]);
    });
  });

  describe('on Muse none of it appears', () => {
    it('no floor note, no requested-permissions copy, the Muse copy instead', () => {
      openGates({ target: 'muse', packs: ['memecoins'] });
      expect(screen.queryByText(PLAN.tradesRow)).toBeNull();
      expect(screen.queryByText(PLAN.gatesCopy)).toBeNull();
      expect(document.body.textContent).not.toContain('permissions to request');
      expect(screen.getByText(copy.gatesCopy.muse)).toBeTruthy();
      expect(tradeGroup('trade').getAttribute('aria-describedby') ?? '').toBe('');
    });

    it('Auto for Trades is stored and compiled as auto', async () => {
      const user = userEvent.setup();
      openGates({ target: 'muse', packs: ['memecoins'] });
      await user.click(within(tradeGroup('trade')).getByRole('radio', { name: copy.gates.settings.auto }));
      expect(st().draft.gates.trade).toBe('auto');
      const result = compiled(st());
      expect(isCompileError(result)).toBe(false);
      if (!isCompileError(result)) expect(result.gates.trade).toBe('auto');
    });
  });

  describe('the certificate on the dot', () => {
    it('shows the requested wording for an auto gate, the table caption and the requested setting label', () => {
      open(withPacks(VERA, ['sales'], { send: 'auto' }));
      const text = document.body.textContent ?? '';
      expect(screen.getByText(PLAN.autoDot)).toBeTruthy();
      expect(text).not.toContain(PLAN.autoOld);
      expect(screen.getByText(PLAN.tableCaption)).toBeTruthy();
      const rows = run(withPacks(VERA, ['sales'], { send: 'auto' })).customRules.length;
      expect(screen.getAllByText(PLAN.tableSetting)).toHaveLength(rows);
      expect(screen.queryByText('Setting:')).toBeNull();
      for (const step of PLAN.steps.slice(0, 5)) expect(text).toContain(step);
    });

    it('shows the trade floor note once, as a summary line', () => {
      open(withPacks(dotOf('marty'), ['memecoins'], { trade: 'auto' }));
      expect(screen.getAllByText(floorNoteFor('auto'))).toHaveLength(1);
      const li = screen.getByText(floorNoteFor('auto')).closest('li');
      expect(li).not.toBeNull();
    });

    it("names Build a Bot's budget, not ChatGPT, in the line about rules left out to fit", () => {
      open(dotOf('marty'));
      const text = document.body.textContent ?? '';
      expect(text).toContain("To fit Build a Bot's 3600-character budget for a dot message,");
      expect(text).not.toContain('To fit ChatGPT');
      expect(text).not.toMatch(/limit for ChatGPT/);
    });

    it('shows none of the dot wording for the same build on Muse', () => {
      open(withPacks(onTarget('marty', 'muse'), ['memecoins'], { trade: 'auto' }));
      const text = document.body.textContent ?? '';
      expect(text).not.toContain(PLAN.tableCaption);
      expect(text).not.toContain(PLAN.tableSetting);
      expect(text).not.toContain("doesn't let your dot place trades");
      expect(text).not.toContain(PLAN.autoDot);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// 5. Routine verification.

describe('5. routine verification on the dot', () => {
  const PACK_ROUTINES = library.packs.flatMap((p) =>
    p.skills.filter((s) => s.kind === 'schedule').map((s) => ({ pack: p.id, skill: s })),
  );
  const LEGACY_ROUTINES = CHIPS_WITH_SKILLS.flatMap((c) =>
    (c.skills ?? []).filter((s) => s.kind === 'schedule').map((s) => ({ chip: c.id, skill: s })),
  );

  it('premise: the library has pack routines and legacy chip routines', () => {
    expect(PACK_ROUTINES.length).toBeGreaterThanOrEqual(5);
    expect(LEGACY_ROUTINES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(PACK_ROUTINES.map((r) => [`${r.pack}/${r.skill.id}`, r] as const))('pack routine %s ends with the confirm line', (_name, r) => {
    const result = run(withPacks(VERA, [r.pack]));
    const item = result.spoken.find((s) => s.ids.includes(`pack.${r.pack}.skill.${r.skill.id}`));
    expect(item).toBeDefined();
    expect(item!.kind).toBe('routine');
    expect(item!.text.endsWith(PLAN.routineConfirm)).toBe(true);
    expect(item!.text.split('\n').at(-1)).toBe(PLAN.routineConfirm);
    expect(item!.text.split(PLAN.routineConfirm)).toHaveLength(2);
    expect(item!.ids).toContain('profile.chatgpt-dot.routine.confirm');
    expect(item!.text).toContain("It isn't running until then.");
  });

  it.each(LEGACY_ROUTINES.map((r) => [r.skill.id, r] as const))('legacy routine %s ends with the confirm line', (_name, r) => {
    const result = run(chipOnly(r.chip));
    const item = result.spoken.find((s) => s.ids.includes(r.skill.id));
    expect(item).toBeDefined();
    expect(item!.kind).toBe('routine');
    expect(item!.text.split('\n').at(-1)).toBe(PLAN.routineConfirm);
    expect(item!.text.startsWith(PLAN.legacyRoutineLead)).toBe(true);
    expect(item!.ids).toContain('profile.chatgpt-dot.routine.confirm');
  });

  it('every routine in the whole sweep ends with it, and no skill carries it', () => {
    let routines = 0;
    for (const c of SWEEP) {
      for (const item of spokenWorkflows(run(c.build))) {
        if (item.kind === 'routine') {
          routines += 1;
          expect(item.text.split('\n').at(-1), `${c.name}: ${item.label}`).toBe(PLAN.routineConfirm);
        } else {
          expect(item.text.includes(PLAN.routineConfirm), `${c.name}: ${item.label}`).toBe(false);
        }
      }
    }
    expect(routines).toBeGreaterThan(50);
  });

  describe('install step 6', () => {
    it('says the task is not running until the dot confirms, and appears when the build has a routine', () => {
      for (const starter of ['june', 'marty', 'dash', 'rook', 'odds']) {
        const result = run(dotOf(starter));
        expect(spokenWorkflows(result).some((s) => s.kind === 'routine'), `${starter}: has a routine`).toBe(true);
        const step = result.steps.find((s) => s.shows.includes('routines'));
        expect(step, starter).toBeDefined();
        expect(step!.text).toBe(PLAN.steps[5]);
        expect(step!.text).toContain("isn't running until your dot confirms");
        expect(step!.text).toContain('your time zone');
        expect(step!.text).toContain('that the task was created');
        expect(result.installSteps).toContain(PLAN.steps[5]);
      }
    });

    it('is absent when the build has no routine', () => {
      const result = run(VERA);
      expect(spokenWorkflows(result).some((s) => s.kind === 'routine')).toBe(false);
      expect(result.installSteps.some((t) => t.includes('scheduled task'))).toBe(false);
    });

    it('a build with skills and routines gets the eight steps of the plan, in order', () => {
      const result = run(dotOf('june'));
      expect(result.installSteps).toEqual(PLAN.steps);
    });

    it('the notes and verify lines of the plan', () => {
      const result = run({ ...dotOf('june'), roles: ['chief-of-staff', 'scheduler'] });
      expect(result.notes).toContain(PLAN.note1);
      expect(result.notes).toContain(PLAN.verify3);
      expect(result.notes).toContain(PLAN.verify4);
      expect(result.notes.some((n) => n.includes('invite-only'))).toBe(false);
      expect(result.notes.some((n) => n.includes('teams of dots arrive'))).toBe(false);
      // Verify 3 shows only when the build picked roles.
      expect(run(dotOf('june')).notes).not.toContain(PLAN.verify3);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Role fallback.

describe('6. the role fallback on the dot', () => {
  const ROLE_SETS: { name: string; starter: string; roles: string[] }[] = [
    { name: 'trading roles', starter: 'marty', roles: ['scout', 'risk-manager', 'journal'] },
    { name: 'coding roles', starter: 'rook', roles: ['planner', 'implementer', 'reviewer', 'tester'] },
    { name: 'personal-ops roles', starter: 'june', roles: ['chief-of-staff', 'triager', 'scheduler'] },
  ];

  it.each(ROLE_SETS)('$name read as one dot, as a list', (c) => {
    const result = run({ ...dotOf(c.starter), roles: c.roles });
    const notes = result.noteItems.filter((n) => n.kind === 'role');
    expect(notes).toHaveLength(1);
    expect(notes[0].text.startsWith(PLAN.roleFallbackLead)).toBe(true);
    expect(notes[0].text.endsWith('.')).toBe(true);
    const labels = notes[0].text.slice(PLAN.roleFallbackLead.length, -1).split(', ');
    const wanted = c.roles.map((id) => library.roles.find((r) => r.id === id)!.label);
    expect([...labels].sort()).toEqual([...wanted].sort());
    expect(result.notes).toContain(notes[0].text);
    expect(result.files).toEqual([]);
    expect(() => traceBundle(result, library)).not.toThrow();
  });

  it('never says "one agent at launch", and never says "at launch" at all', () => {
    for (const c of ROLE_SETS) {
      const result = run({ ...dotOf(c.starter), roles: c.roles });
      for (const text of stringsIn(result)) {
        expect(/one agent at launch/i.test(text), `${c.name}: "${text.slice(0, 80)}"`).toBe(false);
        expect(/run one agent/i.test(text), `${c.name}: "${text.slice(0, 80)}"`).toBe(false);
        expect(/at launch/i.test(text), `${c.name}: "${text.slice(0, 80)}"`).toBe(false);
      }
    }
    expect(DOT.templates['fallback.roles'].line).not.toMatch(/at launch|one agent/i);
  });

  it('a build with no roles has no role note', () => {
    expect(run(dotOf('marty')).noteItems.filter((n) => n.kind === 'role')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 7. Capability claims.

describe('7. no unverified capability claims on the dot', () => {
  it.each(STARTERS)('%s: nothing in the bundle, the steps or the notes', (starter) => {
    const result = run(dotOf(starter));
    for (const text of stringsIn(result)) {
      for (const claim of CAPABILITY_CLAIMS) {
        expect(claim.pattern.test(text), `${starter}: "${claim.name}" in "${text.slice(0, 100)}"`).toBe(false);
      }
    }
    // Neither dash, and the steps are the plan's.
    for (const text of bundleTexts(result)) expect(text.includes(EM_DASH), `${starter}: em dash`).toBe(false);
  });

  it('also with roles, every pack and every gate pick (the whole sweep)', () => {
    for (const c of SWEEP) {
      const result = run(c.build);
      for (const text of bundleTexts(result)) {
        for (const claim of CAPABILITY_CLAIMS) {
          expect(claim.pattern.test(text), `${c.name}: "${claim.name}" in "${text.slice(0, 100)}"`).toBe(false);
        }
      }
    }
  });

  it('the dot profile record, the ChatGPT target card and the dot UI copy carry none either', () => {
    const texts = [
      ...stringsIn(DOT),
      ...stringsIn(library.targets.targets.find((t) => t.id === 'chatgpt')),
      copy.gatesCopy['chatgpt-dot'],
      copy.gates.floorNotes.trade,
      copy.certificate.summary.autoDot,
      copy.certificate.summary.dotAutoNoLimits(1),
      copy.certificate.summary.dotAutoNoLimits(2),
      copy.certificate.summary.overDot(5, 3600),
      copy.certificate.summary.dotBudget(3600),
      copy.certificate.customRules.caption,
      copy.certificate.customRules.settingToRequest,
      copy.chat.dotDisclosure,
    ];
    for (const text of texts) {
      for (const claim of CAPABILITY_CLAIMS) {
        expect(claim.pattern.test(text), `"${claim.name}" in "${text.slice(0, 100)}"`).toBe(false);
      }
      expect(text.includes(EM_DASH), text).toBe(false);
    }
  });

  it('the length cap is still 3600', () => {
    expect(DOT.lengthCap).toBe(3600);
    for (const starter of STARTERS) {
      const build = dotOf(starter);
      expect(capOf(DOT, build), starter).toBe(3600);
      expect(run(build).length, starter).toBeLessThanOrEqual(3600);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 8. Preview disclosure.

describe('8. the preview chat discloses that a dot preview is a stand-in', () => {
  const panel = () => screen.getByRole('region', { name: copy.chat.heading });
  // Visible means: no aria-hidden, hidden attribute or hiding class on the element or on anything
  // between it and the preview panel.
  function expectVisible(el: Element): void {
    const root = panel();
    for (let n: Element | null = el; n !== null; n = n.parentElement) {
      expect(n.getAttribute('aria-hidden'), 'aria-hidden').not.toBe('true');
      expect(n.hasAttribute('hidden'), 'hidden attribute').toBe(false);
      expect(n.getAttribute('class') ?? '', 'hiding class').not.toMatch(/(^|\s)(sr-only|hidden|invisible|opacity-0)(\s|$)/);
      if (n === root) break;
    }
  }

  const TARGET_BUILDS: [string, () => Build][] = [
    ['muse', () => onTarget('marty', 'muse')],
    ['openclaw', () => onTarget('marty', 'openclaw')],
    ['hermes', () => onTarget('marty', 'hermes')],
    ['grok', () => onTarget('marty', 'grok')],
    ['chatgpt project', () => onTarget('marty', 'chatgpt', 'project')],
    ['chatgpt gpt', () => onTarget('marty', 'chatgpt', 'gpt')],
    ['chatgpt instructions (paid)', () => onTarget('marty', 'chatgpt', 'instructions', 'paid')],
    ['chatgpt instructions (free)', () => onTarget('marty', 'chatgpt', 'instructions', 'free')],
  ];

  beforeEach(() => {
    vi.stubEnv('VITE_PREVIEW_URL', PROXY);
  });

  it('shows the disclosure on a dot, visibly, inside the preview panel', () => {
    open(dotOf('marty'));
    const el = within(panel()).getByText(PLAN.disclosure);
    expect(el.textContent).toBe(PLAN.disclosure);
    expectVisible(el);
    // The B22 label stays above it.
    expect(within(panel()).getByText(copy.chat.label)).toBeTruthy();
    expect(screen.getAllByText(PLAN.disclosure)).toHaveLength(1);
  });

  it.each([
    ['muse', () => onTarget('marty', 'muse')],
    ['openclaw', () => onTarget('marty', 'openclaw')],
  ] as [string, () => Build][])('does not show it on %s, though the panel is there', (_name, build) => {
    open(build());
    expect(panel()).toBeTruthy();
    expect(within(panel()).getByText(copy.chat.label)).toBeTruthy();
    expect(screen.queryByText(PLAN.disclosure)).toBeNull();
    expect(document.body.textContent).not.toContain('stand-in');
  });

  it.each(TARGET_BUILDS)('and not on %s', (_name, build) => {
    open(build());
    expect(screen.queryByRole('region', { name: copy.chat.heading })).not.toBeNull();
    expect(screen.queryByText(PLAN.disclosure)).toBeNull();
  });

  it('shows nothing, disclosure included, when no preview URL is set', () => {
    vi.stubEnv('VITE_PREVIEW_URL', '');
    open(dotOf('marty'));
    expect(screen.queryByRole('region', { name: copy.chat.heading })).toBeNull();
    expect(screen.queryByText(PLAN.disclosure)).toBeNull();
  });

  describe('the request is unchanged in shape', () => {
    interface Sent {
      url: string;
      raw: string;
      json: Record<string, unknown>;
    }
    let fetchMock: Mock<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>;

    beforeEach(() => {
      fetchMock = vi.fn(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ reply: 'Sure thing.' }),
        } as unknown as Response),
      );
      vi.stubGlobal('fetch', fetchMock);
    });

    const sent = (): Sent[] =>
      fetchMock.mock.calls.map(([url, init]) => {
        const raw = String(init?.body);
        return { url: String(url), raw, json: JSON.parse(raw) as Record<string, unknown> };
      });

    async function tapFirstChip(): Promise<void> {
      const group = within(panel()).getByRole('group', { name: copy.chat.chipsHint });
      const first = within(group).getAllByRole('button')[0];
      await act(async () => {
        fireEvent.click(first);
      });
      await waitFor(() => expect(screen.queryByText(copy.chat.thinking)).toBeNull());
    }

    const soulNow = (): string => {
      const input = certificateInput(st());
      if ('error' in input) throw new Error(`test setup: ${input.error}`);
      return input.result.soul;
    };

    it.each([
      ['chatgpt dot', () => dotOf('marty')],
      ['muse', () => onTarget('marty', 'muse')],
    ] as [string, () => Build][])('%s: one request with personality, message and history, nothing more', async (_name, build) => {
      open(build());
      await tapFirstChip();
      const calls = sent();
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`${PROXY}/chat`);
      expect(Object.keys(calls[0].json).sort()).toEqual(['history', 'message', 'personality']);
      expect(calls[0].json.personality).toBe(soulNow());
      expect(calls[0].json.message).toBe(library.probes[0].line);
      expect(calls[0].json.history).toEqual([]);
      // The disclosure is page copy: it is not sent to the model.
      expect(calls[0].raw.includes('stand-in')).toBe(false);
    });

    it('a second message on a dot carries the earlier turns, as it does elsewhere', async () => {
      open(dotOf('marty'));
      await tapFirstChip();
      const group = within(panel()).getByRole('group', { name: copy.chat.chipsHint });
      await act(async () => {
        fireEvent.click(within(group).getAllByRole('button')[1]);
      });
      await waitFor(() => expect(screen.queryByText(copy.chat.thinking)).toBeNull());
      const calls = sent();
      expect(calls).toHaveLength(2);
      expect(Object.keys(calls[1].json).sort()).toEqual(['history', 'message', 'personality']);
      expect(calls[1].json.history).toEqual([
        { role: 'user', content: library.probes[0].line },
        { role: 'assistant', content: 'Sure thing.' },
      ]);
      // The disclosure still shows after a reply.
      expect(screen.getAllByText(PLAN.disclosure)).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Review fixes (the lead's calls after Brian's review, QUESTIONS D1 to D9).

// A copy of the library with one pack skill's actions replaced, to build skills the library does not have.
function libraryWithActions(packId: string, skillId: string, actions: string[]): Library {
  const lib: Library = structuredClone(library);
  const pack = lib.packs.find((p) => p.id === packId);
  const skill = pack?.skills.find((s) => s.id === skillId);
  if (skill === undefined) throw new Error(`test setup: no skill ${packId}/${skillId}`);
  skill.actions = actions;
  return lib;
}

const occurrences = (text: string, part: string): number => text.split(part).length - 1;
const approvalLinesOf = (text: string): string[] => text.split('\n').filter((l) => l.startsWith('Needs my approval first:'));

// The group headings a model shows, in page order.
function headingsOf(model: CertModel): string[] {
  return [...model.steps.flatMap((s) => s.groups), ...model.extra]
    .map((g) => g.heading)
    .filter((h): h is string => h !== undefined);
}

// The committed goldens (read only). Vitest runs from the repo root; this file's jsdom environment gives
// import.meta.url a non-file scheme, so the path starts at the working directory.
const goldenDir = join(process.cwd(), 'test', 'golden', 'v2');
const dotGolden = (starter: string): string => readFileSync(join(goldenDir, `${starter}.chatgpt-dot.md`), 'utf8');

describe('review fixes: the trade workflows have one approval line, the floor line', () => {
  // The four trade workflows of the library, each with a phrase its pack's approval text carries.
  const TRADE_WORKFLOWS: { pack: string; skill: string; phrase: string }[] = [
    { pack: 'memecoins', skill: 'edge-gone-exit', phrase: 'Without a yes, propose only' },
    { pack: 'perps', skill: 'stop-placer', phrase: 'trade: approve' },
    { pack: 'prediction-markets', skill: 'edge-calc', phrase: 'placing a bet needs a yes' },
    { pack: 'spot', skill: 'earnings-prep', phrase: 'No order is placed until I say yes' },
  ];

  it('premise: these are all the trade workflows, and each pack text carries its phrase', () => {
    const all = library.packs.flatMap((p) => p.skills.filter((s) => s.actions.includes('trade')).map((s) => `${p.id}/${s.id}`));
    expect(all.sort()).toEqual(TRADE_WORKFLOWS.map((w) => `${w.pack}/${w.skill}`).sort());
    for (const w of TRADE_WORKFLOWS) {
      expect(skillOf(w.pack, w.skill).requiresApproval, `${w.pack}/${w.skill}`).toContain(w.phrase);
      expect(PLAN.tradeApprovalPhrases).toContain(w.phrase);
    }
  });

  describe.each(TRADE_WORKFLOWS)('$pack / $skill', ({ pack, skill: skillId, phrase }) => {
    const skill = skillOf(pack, skillId);
    const itemOf = (result: CompileResult) => result.spoken.find((s) => s.ids.includes(`pack.${pack}.skill.${skillId}`));

    it.each([undefined, 'auto', 'approve', 'forbid'] as const)('on the dot, trade %s: one approval line, and it is the floor line', (picked) => {
      const result = run(withPacks(VERA, [pack], picked === undefined ? {} : { trade: picked }));
      const item = itemOf(result);
      expect(item).toBeDefined();
      expect(item!.label).toBe(`Workflow: ${skill.name}`);
      const approvals = approvalLinesOf(item!.text);
      expect(approvals).toEqual([`Needs my approval first: ${PLAN.floorSkill}`]);
      for (const banned of PLAN.tradeApprovalPhrases) {
        expect(approvals[0].includes(banned), `approval line has "${banned}"`).toBe(false);
      }
      // The pack's text (and so its phrase) is nowhere in the dot item, not as a second line either.
      expect(item!.text.includes(skill.requiresApproval)).toBe(false);
      expect(item!.text.includes(phrase)).toBe(false);
      expect(occurrences(item!.text, PLAN.floorSkill)).toBe(1);
      expect(item!.ids).toContain('profile.chatgpt-dot.floor.trade.skill');
      expect(() => traceBundle(result, library)).not.toThrow();
    });

    it('on openclaw, the same skill keeps the pack text and has no floor line', () => {
      const result = compile(withPacks(onTarget('vera', 'openclaw'), [pack], { trade: 'approve' }));
      const file = result.files.find((f) => f.path === `skills/${skillId}/SKILL.md`);
      expect(file).toBeDefined();
      expect(file!.content).toContain(`## Requires approval\n${skill.requiresApproval}`);
      expect(file!.content).toContain(phrase);
      expect(file!.content.includes(PLAN.floorSkill)).toBe(false);
      expect(() => traceBundle(result, library)).not.toThrow();
    });

    it('on muse, the same skill keeps the pack text too', () => {
      const result = compile(withPacks(onTarget('vera', 'muse'), [pack], { trade: 'approve' }));
      const item = itemOf(result);
      expect(item?.text).toContain(phrase);
      expect(item?.text.includes(PLAN.floorSkill)).toBe(false);
    });
  });

  it('the dot goldens: no pack trade approval text anywhere, and the floor line only as an approval line', () => {
    let floorLines = 0;
    for (const starter of STARTERS) {
      const golden = dotGolden(starter);
      for (const banned of PLAN.tradeApprovalPhrases) {
        expect(golden.includes(banned), `${starter}.chatgpt-dot.md has "${banned}"`).toBe(false);
      }
      const approvalFloor = approvalLinesOf(golden).filter((l) => l === `Needs my approval first: ${PLAN.floorSkill}`).length;
      expect(occurrences(golden, PLAN.floorSkill), `${starter}: floor line outside an approval line`).toBe(approvalFloor);
      // One per trade workflow the starter's packs carry.
      const wanted = dotOf(starter).packs.reduce(
        (n, id) => n + packOf(id).skills.filter((s) => s.actions.includes('trade')).length,
        0,
      );
      expect(approvalFloor, `${starter}: trade workflows`).toBe(wanted);
      floorLines += approvalFloor;
    }
    expect(floorLines).toBeGreaterThan(0);
  });

  it('the dot chassis approval line asks for the card in three lines and no longer says "Make the card useful"', () => {
    const libraryApproval = library.chassis.lines.find((l) => l.id === 'chassis.act.approval')!;
    expect(libraryApproval.line).toContain('Make the card useful');
    for (const starter of STARTERS) {
      const soul = run(dotOf(starter)).soul;
      expect(soul.includes(libraryApproval.line), `${starter}: library approval line`).toBe(false);
      expect(soul.includes(libraryApproval.short ?? libraryApproval.line), `${starter}: library short approval`).toBe(false);
      expect(soul.includes('Make the card useful'), `${starter}: card wording`).toBe(false);
      expect(
        soul.includes('When you ask, give me the decision, the cost and your pick in three lines.') ||
          soul.includes('Ask in 3 lines: decision, cost, pick.'),
        `${starter}: three-line ask`,
      ).toBe(true);
    }
  });
});

describe('review fixes: a skill that takes trade and another action keeps the pack text and adds the floor line', () => {
  const MIXED: { name: string; actions: string[] }[] = [
    { name: 'trade, send', actions: ['trade', 'send'] },
    { name: 'send, trade', actions: ['send', 'trade'] },
  ];

  it.each(MIXED)('workflow with actions [$name]', ({ actions }) => {
    const lib = libraryWithActions('memecoins', 'edge-gone-exit', actions);
    const skill = lib.packs.find((p) => p.id === 'memecoins')!.skills.find((s) => s.id === 'edge-gone-exit')!;
    const result = compile(withPacks(VERA, ['memecoins']), lib);
    const item = result.spoken.find((s) => s.ids.includes('pack.memecoins.skill.edge-gone-exit'));
    expect(item).toBeDefined();
    const lines = item!.text.split('\n');
    const at = lines.indexOf(`Needs my approval first: ${skill.requiresApproval}`);
    expect(at, 'the pack approval line is kept').toBeGreaterThan(-1);
    expect(lines[at + 1], 'the floor line follows it, on its own line').toBe(PLAN.floorSkill);
    expect(occurrences(item!.text, PLAN.floorSkill)).toBe(1);
    expect(approvalLinesOf(item!.text)).toHaveLength(1);
    expect(item!.ids).toContain('profile.chatgpt-dot.floor.trade.skill');
    expect(item!.text.endsWith(PLAN.skillSuffix)).toBe(true);
    expect(() => traceBundle(result, lib)).not.toThrow();
  });

  it('the same mixed skill on openclaw keeps its pack text and gets no floor line', () => {
    const lib = libraryWithActions('memecoins', 'edge-gone-exit', ['trade', 'send']);
    const skill = lib.packs.find((p) => p.id === 'memecoins')!.skills.find((s) => s.id === 'edge-gone-exit')!;
    const result = compile(withPacks(onTarget('vera', 'openclaw'), ['memecoins']), lib);
    const file = result.files.find((f) => f.path === 'skills/edge-gone-exit/SKILL.md');
    expect(file?.content).toContain(`## Requires approval\n${skill.requiresApproval}`);
    expect(file?.content.includes(PLAN.floorSkill)).toBe(false);
  });

  it('a skill with only an unfloored action (send) gets no floor line, and its pack text is unchanged', () => {
    const lib = libraryWithActions('memecoins', 'edge-gone-exit', ['send']);
    const skill = lib.packs.find((p) => p.id === 'memecoins')!.skills.find((s) => s.id === 'edge-gone-exit')!;
    const item = compile(withPacks(VERA, ['memecoins']), lib).spoken.find((s) => s.ids.includes('pack.memecoins.skill.edge-gone-exit'));
    expect(approvalLinesOf(item!.text)).toEqual([`Needs my approval first: ${skill.requiresApproval}`]);
    expect(item!.text.includes(PLAN.floorSkill)).toBe(false);
    expect(item!.ids).not.toContain('profile.chatgpt-dot.floor.trade.skill');
  });

  it('a scheduled task whose only action is trade gets the floor line as its approval, then the confirm line last', () => {
    const lib = libraryWithActions('memecoins', 'narrative-watch', ['trade']);
    const result = compile(withPacks(VERA, ['memecoins']), lib);
    const item = result.spoken.find((s) => s.ids.includes('pack.memecoins.skill.narrative-watch'));
    expect(item?.kind).toBe('routine');
    expect(item?.label).toBe('Scheduled task: Narrative watch');
    expect(approvalLinesOf(item!.text)).toEqual([`Needs my approval first: ${PLAN.floorSkill}`]);
    expect(item!.text.split('\n').at(-1)).toBe(PLAN.routineConfirm);
    expect(item!.ids).toContain('profile.chatgpt-dot.floor.trade.skill');
    expect(() => traceBundle(result, lib)).not.toThrow();
  });

  it('a scheduled task with [trade, send] keeps the pack text, then the floor line, then the routine closing lines', () => {
    const lib = libraryWithActions('memecoins', 'narrative-watch', ['trade', 'send']);
    const skill = lib.packs.find((p) => p.id === 'memecoins')!.skills.find((s) => s.id === 'narrative-watch')!;
    const item = compile(withPacks(VERA, ['memecoins']), lib).spoken.find((s) => s.ids.includes('pack.memecoins.skill.narrative-watch'));
    const lines = item!.text.split('\n');
    const at = lines.indexOf(`Needs my approval first: ${skill.requiresApproval}`);
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1]).toBe(PLAN.floorSkill);
    expect(lines[at + 2]).toBe(PLAN.routineClose);
    expect(lines.at(-1)).toBe(PLAN.routineConfirm);
  });
});

describe('review fixes: the clash order is the dot variant', () => {
  const CLASH_LIBRARY = library.chassis.lines.find((l) => l.id === 'chassis.clash.order')!;
  const CLASH_HEADING_ID = library.chassis.headings.find((h) => h.section === 'clash')!.id;
  const isDotClash = (id: string): boolean =>
    id === 'chassis.clash.order@chatgpt-dot' || id === 'chassis.clash.order#short@chatgpt-dot';
  const variantFor = (id: string): string => (id.includes('#short') ? PLAN.chassis.clash.short : PLAN.chassis.clash.full);

  it('premise: the library line differs from the dot variants, and the dot variants carry the wording asked for', () => {
    expect(CLASH_LIBRARY.line).not.toBe(PLAN.chassis.clash.full);
    expect(CLASH_LIBRARY.short).not.toBe(PLAN.chassis.clash.short);
    expect(PLAN.chassis.clash.full).toContain('my instructions and saved settings');
    expect(PLAN.chassis.clash.short).toContain('my instructions and settings');
  });

  it.each(STARTERS)('%s: the soul ends with the dot variant, traced as such, and the library line is nowhere', (starter) => {
    const result = run(dotOf(starter));
    const clash = result.soulLines.filter((l) => l.id.startsWith('chassis.clash.'));
    expect(clash).toHaveLength(1);
    expect(isDotClash(clash[0].id), clash[0].id).toBe(true);
    expect(clash[0].text).toBe(variantFor(clash[0].id));
    expect(result.soul.trimEnd().endsWith(variantFor(clash[0].id))).toBe(true);
    expect(result.soulLines.some((l) => l.id === 'chassis.clash.order' || l.id === 'chassis.clash.order#short')).toBe(false);
    for (const text of bundleTexts(result)) {
      expect(text.includes(CLASH_LIBRARY.line), `${starter}: library clash line`).toBe(false);
      expect(text.includes(CLASH_LIBRARY.short ?? CLASH_LIBRARY.line), `${starter}: library short clash line`).toBe(false);
    }
    expect(() => traceBundle(result, library)).not.toThrow();
  });

  it.each(STARTERS)('%s golden: the "If rules clash" section holds the dot variant, not the library line', (starter) => {
    const golden = dotGolden(starter);
    const sections = [...golden.matchAll(/## If rules clash\n(.*)\n/g)].map((m) => m[1]);
    expect(sections.length).toBeGreaterThan(0);
    for (const line of sections) {
      expect([PLAN.chassis.clash.full, PLAN.chassis.clash.short], `${starter}: "${line}"`).toContain(line);
    }
    expect(golden.includes(CLASH_LIBRARY.line)).toBe(false);
    expect(golden.includes(CLASH_LIBRARY.short ?? CLASH_LIBRARY.line)).toBe(false);
  });

  it('the other targets keep the library clash line', () => {
    for (const target of ['muse', 'openclaw', 'hermes'] as const) {
      const result = run(onTarget('vera', target));
      const clash = result.soulLines.filter((l) => l.id.startsWith('chassis.clash.'));
      expect(clash.length, target).toBe(1);
      expect(clash[0].id.includes('@chatgpt-dot'), target).toBe(false);
      expect([CLASH_LIBRARY.line, CLASH_LIBRARY.short], `${target}: ${clash[0].text}`).toContain(clash[0].text);
    }
  });

  describe('a remix Mine section still lands before it', () => {
    const MINE = ['Open every reply with the day of the week.', 'Sign off with a single star.'];

    it.each(STARTERS)('%s', (starter) => {
      const before = run(dotOf(starter));
      const after = withMine(before, DOT, MINE);
      const lines = after.soulLines;
      const mineAt = lines.findIndex((l) => l.id === 'user.mine.heading');
      const clashAt = lines.findIndex((l) => isDotClash(l.id));
      expect(mineAt, 'Mine heading present').toBeGreaterThan(-1);
      expect(clashAt, 'dot clash line present').toBeGreaterThan(-1);
      expect(mineAt).toBeLessThan(clashAt);
      // Mine, its two lines, a blank, then the clash heading and the dot clash line, which stays last.
      expect(lines[mineAt - 1].kind).toBe('blank');
      expect(lines.slice(mineAt + 1, mineAt + 3).map((l) => l.text)).toEqual(MINE);
      expect(lines[mineAt + 3].kind).toBe('blank');
      expect(lines[mineAt + 4].id).toBe(CLASH_HEADING_ID);
      expect(lines[mineAt + 5].id).toBe(lines[clashAt].id);
      expect(clashAt).toBe(lines.length - 1);
      expect(lines[clashAt].text).toBe(variantFor(lines[clashAt].id));
      // The text a person copies agrees: Mine, then the clash heading, then the dot variant last.
      expect(after.soul.indexOf('## Mine')).toBeLessThan(after.soul.indexOf(lines[clashAt].text));
      expect(after.soul.trimEnd().endsWith(lines[clashAt].text)).toBe(true);
      const personality = after.spoken.find((s) => s.kind === 'personality');
      expect(personality?.text).toBe(after.soul);
      expect(() => traceBundle(after, library)).not.toThrow();
      // Nothing else moved: cut the Mine block (heading, its lines, the closing blank) and the lines are
      // the ones compiled before.
      const rest = [...lines.slice(0, mineAt), ...lines.slice(mineAt + 1 + MINE.length + 1)];
      expect(rest.map((l) => l.id)).toEqual(before.soulLines.map((l) => l.id));
    });
  });
});

describe('review fixes: Workflow and Scheduled task labels', () => {
  const NON_DOT: { name: string; target: TargetId; skill: string; routine: string }[] = [
    { name: 'muse', target: 'muse', skill: 'Standing instruction', routine: 'Routine' },
    { name: 'openclaw', target: 'openclaw', skill: 'Skill', routine: 'Routine' },
    { name: 'hermes', target: 'hermes', skill: 'Skill', routine: 'Routine' },
    { name: 'grok', target: 'grok', skill: 'Skill', routine: 'Routine' },
  ];

  // The labels of every skill and routine a result delivers, as spoken items and as files.
  const skillLabels = (r: CompileResult): string[] => [
    ...r.spoken.filter((s) => s.kind === 'skill').map((s) => s.label),
    ...r.files.filter((f) => f.label.startsWith('Skill: ')).map((f) => f.label),
  ];
  const routineLabels = (r: CompileResult): string[] =>
    r.spoken.filter((s) => s.kind === 'routine').map((s) => s.label);

  it.each(STARTERS)('%s on the dot: "Workflow: " and "Scheduled task: " on every spoken item', (starter) => {
    const result = run(dotOf(starter));
    const skills = result.spoken.filter((s) => s.kind === 'skill');
    const routines = result.spoken.filter((s) => s.kind === 'routine');
    expect(skills.length + routines.length).toBeGreaterThan(0);
    for (const item of skills) expect(item.label.startsWith('Workflow: '), item.label).toBe(true);
    for (const item of routines) expect(item.label.startsWith('Scheduled task: '), item.label).toBe(true);
    for (const item of result.spoken) {
      expect(/^(Skill|Routine|Standing instruction): /.test(item.label), `old label ${item.label}`).toBe(false);
    }
    // The name after the label is the skill's own name, from the library.
    for (const item of [...skills, ...routines]) {
      const name = item.label.slice(item.label.indexOf(': ') + 2);
      const known = [
        ...library.packs.flatMap((p) => p.skills.map((s) => s.name)),
        ...library.chips.flatMap((c) => (c.skills ?? []).map((s) => s.name)),
      ];
      expect(known, item.label).toContain(name);
    }
  });

  it('the dot has both kinds across the starters', () => {
    const all = STARTERS.flatMap((st2) => run(dotOf(st2)).spoken);
    expect(all.some((s) => s.kind === 'skill')).toBe(true);
    expect(all.some((s) => s.kind === 'routine')).toBe(true);
  });

  it.each(NON_DOT)('$name keeps its labels', (t) => {
    for (const starter of STARTERS) {
      const result = run(onTarget(starter, t.target));
      for (const label of skillLabels(result)) expect(label.startsWith(`${t.skill}: `), `${starter}: ${label}`).toBe(true);
      for (const label of routineLabels(result)) expect(label.startsWith(`${t.routine}: `), `${starter}: ${label}`).toBe(true);
      for (const label of [...skillLabels(result), ...routineLabels(result)]) {
        expect(/^(Workflow|Scheduled task): /.test(label), `${starter}: dot label on ${t.name}`).toBe(false);
      }
    }
  });

  describe('the certificate groups', () => {
    it.each(STARTERS)('%s on the dot: Workflows and Scheduled tasks, never Skills or Routines', (starter) => {
      const build = dotOf(starter);
      const result = run(build);
      const headings = headingsOf(modelFor(build));
      const hasSkills = result.spoken.some((s) => s.kind === 'skill');
      const hasRoutines = result.spoken.some((s) => s.kind === 'routine');
      expect(headings.includes(PLAN.dotSkillsGroup), `${starter}: Workflows`).toBe(hasSkills);
      expect(headings.includes(PLAN.dotRoutinesGroup), `${starter}: Scheduled tasks`).toBe(hasRoutines);
      for (const old of ['Skills', 'Routines', 'Standing instructions']) {
        expect(headings.includes(old), `${starter}: "${old}"`).toBe(false);
      }
    });

    it('a dot with both shows Workflows before Scheduled tasks', () => {
      const headings = headingsOf(modelFor(dotOf('marty')));
      expect(headings.indexOf(PLAN.dotSkillsGroup)).toBeGreaterThan(-1);
      expect(headings.indexOf(PLAN.dotRoutinesGroup)).toBeGreaterThan(headings.indexOf(PLAN.dotSkillsGroup));
    });

    it('muse keeps one "Standing instructions" group, openclaw keeps "Skills" and "Routines"', () => {
      for (const starter of ['marty', 'june', 'dash']) {
        const muse = headingsOf(modelFor(onTarget(starter, 'muse')));
        expect(muse, `muse ${starter}`).toContain('Standing instructions');
        for (const dot of [PLAN.dotSkillsGroup, PLAN.dotRoutinesGroup, 'Skills', 'Routines']) {
          expect(muse.includes(dot), `muse ${starter}: "${dot}"`).toBe(false);
        }
        const openclaw = headingsOf(modelFor(onTarget(starter, 'openclaw')));
        expect(openclaw, `openclaw ${starter}`).toContain('Skills');
        expect(openclaw, `openclaw ${starter}`).toContain('Routines');
        for (const dot of [PLAN.dotSkillsGroup, PLAN.dotRoutinesGroup, 'Standing instructions']) {
          expect(openclaw.includes(dot), `openclaw ${starter}: "${dot}"`).toBe(false);
        }
      }
    });

    it('hermes and grok keep "Skills" and "Routines" too', () => {
      for (const target of ['hermes', 'grok'] as const) {
        const headings = headingsOf(modelFor(onTarget('marty', target)));
        expect(headings, target).toContain('Skills');
        expect(headings, target).toContain('Routines');
        expect(headings.includes(PLAN.dotSkillsGroup), target).toBe(false);
        expect(headings.includes(PLAN.dotRoutinesGroup), target).toBe(false);
      }
    });

    it('rendered: the dot certificate has Workflows and Scheduled tasks headings and no Skills or Routines heading', () => {
      open(dotOf('marty'));
      expect(screen.getByRole('heading', { name: PLAN.dotSkillsGroup })).toBeTruthy();
      expect(screen.getByRole('heading', { name: PLAN.dotRoutinesGroup })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Skills' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Routines' })).toBeNull();
    });

    it('rendered: muse and openclaw show their own headings and none of the dot ones', () => {
      open(onTarget('marty', 'muse'));
      expect(screen.getByRole('heading', { name: 'Standing instructions' })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: PLAN.dotSkillsGroup })).toBeNull();
      expect(screen.queryByRole('heading', { name: PLAN.dotRoutinesGroup })).toBeNull();
      cleanup();
      open(onTarget('marty', 'openclaw'));
      expect(screen.getByRole('heading', { name: 'Skills' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Routines' })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: PLAN.dotSkillsGroup })).toBeNull();
      expect(screen.queryByRole('heading', { name: PLAN.dotRoutinesGroup })).toBeNull();
    });
  });
});

describe('review fixes: the floor note says "Your setting for Trades is"', () => {
  const LEAD = 'Your setting for Trades is "';
  const CASES: { name: string; gates: Build['gates']; had: GateSetting }[] = [
    { name: 'the pack default (no pick in the build)', gates: {}, had: 'approve' },
    { name: 'an explicit pick of approve', gates: { trade: 'approve' }, had: 'approve' },
    { name: 'an explicit pick of auto', gates: { trade: 'auto' }, had: 'auto' },
  ];

  describe.each(CASES)('$name', ({ gates, had }) => {
    const build = withPacks(dotOf('marty'), ['memecoins'], gates);

    it('the compiled note, the notes list and the summary line all read "Your setting for Trades is ..."', () => {
      const result = run(build);
      const notes = result.noteItems.filter((n) => n.kind === 'floor');
      expect(notes).toHaveLength(1);
      expect(notes[0].text.startsWith(`${LEAD}${PLAN.settingLabels[had]}".`)).toBe(true);
      expect(notes[0].text).toBe(floorNoteFor(had));
      expect(result.notes).toContain(floorNoteFor(had));
      const summary = modelFor(build).summary.filter((s) => s.kind === 'floor');
      expect(summary.map((s) => s.text)).toEqual([floorNoteFor(had)]);
    });

    it('never says "picked" or "You picked"', () => {
      const result = run(build);
      for (const text of [...result.notes, ...result.noteItems.map((n) => n.text), ...modelFor(build).summary.map((s) => s.text)]) {
        expect(/\bpicked\b/i.test(text), text).toBe(false);
      }
    });

    it('shows on the certificate once', () => {
      open(build);
      expect(screen.getAllByText(floorNoteFor(had))).toHaveLength(1);
      expect(document.body.textContent ?? '').not.toContain('You picked');
    });
  });

  it('a trade pick of forbid has no note at all', () => {
    const result = run(withPacks(dotOf('marty'), ['memecoins'], { trade: 'forbid' }));
    expect(result.noteItems.filter((n) => n.kind === 'floor')).toEqual([]);
    expect(result.notes.some((n) => n.startsWith(LEAD))).toBe(false);
  });

  it('the profile template is the one line with {setting}, in the library', () => {
    expect(DOT.gateFloors?.trade.note.line).toBe(
      'Your setting for Trades is "{setting}". This setup doesn\'t let your dot place trades: it researches and proposes, and you place each trade yourself.',
    );
  });
});

describe('review fixes: the role note on the dot matches the summary', () => {
  const ROLE_BUILDS: { name: string; starter: string; roles: string[] }[] = [
    { name: 'trading roles', starter: 'marty', roles: ['scout', 'risk-manager', 'journal'] },
    { name: 'coding roles', starter: 'rook', roles: ['planner', 'implementer', 'reviewer', 'tester'] },
    { name: 'personal-ops roles', starter: 'june', roles: ['chief-of-staff', 'triager', 'scheduler'] },
  ];

  it.each(ROLE_BUILDS)('$name: the note lists them as not in this setup, in the order the summary lists them', (c) => {
    const build = { ...dotOf(c.starter), roles: c.roles };
    const result = run(build);
    const note = result.noteItems.find((n) => n.kind === 'role');
    expect(note).toBeDefined();
    const labels = c.roles.map((id) => library.roles.find((r) => r.id === id)!.label);

    // The note: not in this setup, one dot, the role list.
    expect(note!.text.startsWith("Your roles aren't in this setup. It makes one dot, not a separate agent per role.")).toBe(true);
    expect(note!.text.slice(PLAN.roleFallbackLead.length, -1).split(', ')).toEqual(labels);

    // The summary: "Not included on ChatGPT:" with the same roles.
    const model = modelFor(build);
    const line = model.summary.find((s) => s.key === 'summary-undelivered');
    expect(line).toBeDefined();
    expect(line!.text).toBe(copy.certificate.summary.undelivered(copy.targetNames.chatgpt));
    expect(line!.items).toEqual(labels);
    expect(line!.text.startsWith('Not included on')).toBe(true);

    // It never says the roles are sent, given, or handed to the dot.
    for (const text of [note!.text, ...result.notes.filter((n) => n.includes('role'))]) {
      expect(/\b(sent|send|sends|sending|goes to|go to|given to|handed)\b/i.test(text), text).toBe(false);
    }
    expect(note!.text.includes('as a list')).toBe(false);
    expect(note!.text.includes('Tell your dot which role')).toBe(false);
    // And the role files do not exist: a dot has no role artifacts.
    expect(result.files.filter((f) => f.role !== undefined)).toEqual([]);
    expect(result.spoken.filter((s) => s.role !== undefined)).toEqual([]);
  });

  it('rendered: the summary line and the note both show on the certificate', () => {
    const build = { ...dotOf('marty'), roles: ['scout', 'risk-manager', 'journal'] };
    open(build);
    const text = document.body.textContent ?? '';
    expect(text).toContain(copy.certificate.summary.undelivered(copy.targetNames.chatgpt));
    expect(text).toContain(`${PLAN.roleFallbackLead}Scout, Risk manager, Journal.`);
  });

  it('a build with no roles has neither the note nor a roles entry in the summary', () => {
    const build = dotOf('marty');
    expect(run(build).noteItems.filter((n) => n.kind === 'role')).toEqual([]);
    const items = modelFor(build).summary.flatMap((s) => s.items ?? []);
    expect(items).not.toContain('Scout');
  });
});

describe('review fixes: note.1 has no "below" or "above"', () => {
  const NOTE_ID = 'profile.chatgpt-dot.note.1';

  it('the profile record', () => {
    const line = DOT.notes?.find((n) => n.id === NOTE_ID)?.line;
    expect(line).toBe(PLAN.note1);
    expect(/\b(below|above)\b/i.test(line ?? '')).toBe(false);
  });

  it.each(STARTERS)('%s: the compiled note and the model note beside the rules table', (starter) => {
    const build = dotOf(starter);
    const result = run(build);
    const note = result.noteItems.find((n) => n.id === NOTE_ID);
    expect(note?.text).toBe(PLAN.note1);
    expect(/\b(below|above)\b/i.test(note?.text ?? '')).toBe(false);
    expect(result.notes).toContain(PLAN.note1);
    const table = modelFor(build).steps.find((s) => s.customRules !== undefined)?.customRules;
    expect(table?.note?.text).toBe(PLAN.note1);
    expect(table?.note?.text.includes(`"${PLAN.settingLabels.forbid}"`)).toBe(true);
  });

  it('rendered: the note shows beside the table, without "below" or "above"', () => {
    open(dotOf('marty'));
    const el = screen.getByText(PLAN.note1);
    expect(/\b(below|above)\b/i.test(el.textContent ?? '')).toBe(false);
  });
});
