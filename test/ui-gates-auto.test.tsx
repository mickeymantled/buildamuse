// @vitest-environment jsdom
//
// Gates screen: Auto is off where the library does not offer it (M4 slice 4.0, QUESTIONS W23,
// docs/M4-PLAN.md section 0).
//
// For publish, delete, write_query and force_push the library gives auto no soul text ("not offered,
// treat as approve"), so the Gates screen shows Auto disabled on those rows and says why. Send, and
// every other gate with an auto line, keeps Auto. Pay is locked at forbid and is a separate case.
//
// Expected behavior comes from the plan and the library. UI strings are read from src/ui/copy.ts and
// the dot option labels from the library's customRuleSettings. The gate rows an action shows come from
// the pack JSON (devops exposes all four gates plus send, deploy and rollback).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import library from '../src/library/index.js';
import { App } from '../src/ui/App.js';
import { Toggle3 } from '../src/ui/components/Toggle3.js';
import { copy } from '../src/ui/copy.js';
import { compiled, isCompileError, useBuilder } from '../src/ui/store.js';
import type { BuilderStore } from '../src/ui/store.js';
import type { ActionId, ChatgptMode, GateSetting, Plan, TargetId } from '../src/compiler/types.js';

// ---- Library facts, written out from the plan ----

// M4-PLAN section 0: these four have a null soulLine.auto. Checked against gates.json below.
const NO_AUTO_GATES: readonly ActionId[] = ['publish', 'delete', 'write_query', 'force_push'];
// Gates with an auto line that the devops pack also exposes.
const AUTO_GATES_ON_DEVOPS: readonly ActionId[] = ['send', 'deploy', 'rollback'];

const gate = (id: ActionId) => {
  const found = library.gates.find((g) => g.id === id);
  if (!found) throw new Error(`library has no gate ${id}`);
  return found;
};
const gateLabel = (id: ActionId) => gate(id).label;

const devops = library.packs.find((p) => p.id === 'devops');
if (!devops) throw new Error('library has no devops pack');
const DEVOPS_EXPOSED = Object.keys(devops.gatesDefault);

const dotLabels = (() => {
  const dot = library.targets.profiles.find((p) => p.id === 'chatgpt-dot');
  if (!dot?.customRuleSettings) throw new Error('library has no dot customRuleSettings');
  return dot.customRuleSettings;
})();

// ---- Rendering and driving ----

beforeEach(() => {
  useBuilder.getState().reset();
  // jsdom does not implement scrollTo, and every screen calls it on mount.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useBuilder.getState().reset();
});

function store(fn: (s: BuilderStore) => void): void {
  act(() => {
    fn(useBuilder.getState());
  });
}

interface Seed {
  target?: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
  packs?: readonly string[];
}

// A blank build with a target and packs, parked on the gates screen, then rendered.
function openGates(o: Seed = {}): void {
  store((s) => {
    s.setTarget(o.target ?? 'muse', o.mode, o.plan);
    s.startBlank();
    s.setBase('trader');
    for (const pack of o.packs ?? ['devops']) s.togglePack(pack);
    s.go('gates');
  });
  render(<App />);
}

const group = (id: ActionId) => screen.getByRole('radiogroup', { name: gateLabel(id) });
const autoRadio = (id: ActionId, label: string = copy.gates.settings.auto) =>
  within(group(id)).getByRole('radio', { name: label });
const checked = (id: ActionId) =>
  within(group(id))
    .getAllByRole('radio')
    .map((r) => r.getAttribute('aria-checked'));
const isAriaDisabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
const draftGate = (id: ActionId) => useBuilder.getState().draft.gates[id];

// Position in the radiogroup: auto, approve, forbid.
const AT: Record<GateSetting, number> = { auto: 0, approve: 1, forbid: 2 };
const only = (setting: GateSetting): string[] =>
  (['auto', 'approve', 'forbid'] as const).map((s) => String(s === setting));

// The text of the elements a group's aria-describedby points at.
function describedText(el: HTMLElement): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

// ---- Premises ----

describe('premises', () => {
  it('the four gates have a null soulLine.auto in the library, and the others on devops do not', () => {
    for (const id of NO_AUTO_GATES) expect(gate(id).soulLine.auto, id).toBeNull();
    for (const id of AUTO_GATES_ON_DEVOPS) expect(typeof gate(id).soulLine.auto, id).toBe('string');
  });

  it('devops exposes the four gates and the three auto gates (so one pack covers every case below)', () => {
    for (const id of [...NO_AUTO_GATES, ...AUTO_GATES_ON_DEVOPS]) expect(DEVOPS_EXPOSED, id).toContain(id);
  });

  it('the new hint line exists in copy and has no em dash', () => {
    expect(copy.gates.autoNotOffered.length).toBeGreaterThan(0);
    expect(copy.gates.autoNotOffered).not.toContain(String.fromCharCode(0x2014));
  });
});

// ---- The Gates screen on Muse with devops ----

describe('gates screen: rows with no auto line', () => {
  it.each(NO_AUTO_GATES)('%s: the Auto option is aria-disabled and Approve and Forbid are not', (id) => {
    openGates();
    expect(isAriaDisabled(autoRadio(id))).toBe(true);
    expect(isAriaDisabled(within(group(id)).getByRole('radio', { name: copy.gates.settings.approve }))).toBe(false);
    expect(isAriaDisabled(within(group(id)).getByRole('radio', { name: copy.gates.settings.forbid }))).toBe(false);
  });

  it.each(NO_AUTO_GATES)('%s: tapping Auto changes nothing, from the pack default', async (id) => {
    const user = userEvent.setup();
    openGates();
    const before = checked(id);
    const draftBefore = draftGate(id);
    await user.click(autoRadio(id));
    expect(checked(id)).toEqual(before);
    expect(draftGate(id)).toBe(draftBefore);
    expect(draftGate(id)).not.toBe('auto');
  });

  it('delete: devops defaults it to forbid, and tapping Auto leaves forbid selected', async () => {
    const user = userEvent.setup();
    openGates();
    expect(devops.gatesDefault.delete).toBe('forbid');
    expect(checked('delete')).toEqual(only('forbid'));
    await user.click(autoRadio('delete'));
    expect(checked('delete')).toEqual(only('forbid'));
    expect(draftGate('delete')).toBeUndefined();
  });

  it('delete: after the user sets Approve, tapping Auto leaves approve set and stores no auto', async () => {
    const user = userEvent.setup();
    openGates();
    await user.click(within(group('delete')).getByRole('radio', { name: copy.gates.settings.approve }));
    expect(checked('delete')).toEqual(only('approve'));
    expect(draftGate('delete')).toBe('approve');

    await user.click(autoRadio('delete'));
    expect(checked('delete')).toEqual(only('approve'));
    expect(draftGate('delete')).toBe('approve');
  });

  it('delete: the other two options still work (so the disabled Auto test is not vacuous)', async () => {
    const user = userEvent.setup();
    openGates();
    await user.click(within(group('delete')).getByRole('radio', { name: copy.gates.settings.approve }));
    expect(draftGate('delete')).toBe('approve');
    await user.click(within(group('delete')).getByRole('radio', { name: copy.gates.settings.forbid }));
    expect(draftGate('delete')).toBe('forbid');
    expect(checked('delete')).toEqual(only('forbid'));
  });

  it('no sequence of taps on the four rows ever stores auto in the draft', async () => {
    const user = userEvent.setup();
    openGates();
    for (const id of NO_AUTO_GATES) {
      await user.click(within(group(id)).getByRole('radio', { name: copy.gates.settings.approve }));
      await user.click(autoRadio(id));
      await user.click(within(group(id)).getByRole('radio', { name: copy.gates.settings.forbid }));
      await user.click(autoRadio(id));
    }
    const draft = useBuilder.getState().draft.gates;
    for (const id of NO_AUTO_GATES) expect(draft[id], id).toBe('forbid');
    expect(Object.values(draft)).not.toContain('auto');
  });

  it('each of the four rows says why, and no other row does', () => {
    openGates();
    // One hint per row that has Auto disabled and is not pay: the exposed gates with a null auto line.
    const expected = DEVOPS_EXPOSED.filter((id) => id !== 'pay' && gate(id).soulLine.auto === null);
    expect([...expected].sort()).toEqual([...NO_AUTO_GATES].sort());
    expect(screen.getAllByText(copy.gates.autoNotOffered)).toHaveLength(expected.length);
    for (const id of NO_AUTO_GATES) {
      expect(within(group(id).parentElement as HTMLElement).getByText(copy.gates.autoNotOffered), id).toBeTruthy();
    }
    for (const id of AUTO_GATES_ON_DEVOPS) {
      expect(within(group(id).parentElement as HTMLElement).queryByText(copy.gates.autoNotOffered), id).toBeNull();
    }
  });

  it('the hint is part of the group description for a screen reader', () => {
    openGates();
    for (const id of NO_AUTO_GATES) expect(describedText(group(id)), id).toContain(copy.gates.autoNotOffered);
    for (const id of AUTO_GATES_ON_DEVOPS) {
      expect(describedText(group(id)), id).not.toContain(copy.gates.autoNotOffered);
    }
  });
});

describe('gates screen: rows with an auto line', () => {
  it.each(AUTO_GATES_ON_DEVOPS)('%s: the Auto option is enabled', (id) => {
    openGates();
    expect(isAriaDisabled(autoRadio(id))).toBe(false);
  });

  it('send: tapping Auto selects it and stores auto', async () => {
    const user = userEvent.setup();
    openGates();
    expect(devops.gatesDefault.send).toBe('approve');
    expect(checked('send')).toEqual(only('approve'));
    await user.click(autoRadio('send'));
    expect(checked('send')).toEqual(only('auto'));
    expect(draftGate('send')).toBe('auto');
  });

  it('send: Auto is on after the tap while delete beside it is still not auto', async () => {
    const user = userEvent.setup();
    openGates();
    await user.click(autoRadio('send'));
    await user.click(autoRadio('delete'));
    expect(draftGate('send')).toBe('auto');
    expect(draftGate('delete')).not.toBe('auto');
    expect(checked('delete')[AT.auto]).toBe('false');
  });
});

describe('gates screen: pay stays locked', () => {
  it('pay: Auto is disabled by the lock, shows the lock message and no auto hint', async () => {
    const user = userEvent.setup();
    openGates();
    expect(isAriaDisabled(autoRadio('pay'))).toBe(true);
    expect(checked('pay')).toEqual(only('forbid'));
    expect(screen.getByText(copy.gates.payLocked)).toBeTruthy();
    expect(describedText(group('pay'))).toContain(copy.gates.payLocked);
    expect(describedText(group('pay'))).not.toContain(copy.gates.autoNotOffered);
    expect(within(group('pay').parentElement as HTMLElement).queryByText(copy.gates.autoNotOffered)).toBeNull();

    await user.click(autoRadio('pay'));
    expect(checked('pay')).toEqual(only('forbid'));
    expect(draftGate('pay')).toBeUndefined();
  });
});

// ---- Keyboard ----

describe('gates screen: arrow keys skip the disabled Auto', () => {
  it('delete at Approve: ArrowLeft and Home leave it on Approve, with focus kept', async () => {
    const user = userEvent.setup();
    openGates();
    await user.click(within(group('delete')).getByRole('radio', { name: copy.gates.settings.approve }));
    const approve = within(group('delete')).getByRole('radio', { name: copy.gates.settings.approve });
    act(() => approve.focus());
    expect(document.activeElement).toBe(approve);

    await user.keyboard('{ArrowLeft}');
    expect(checked('delete')).toEqual(only('approve'));
    expect(draftGate('delete')).toBe('approve');
    expect(document.activeElement).toBe(approve);

    await user.keyboard('{Home}');
    expect(checked('delete')).toEqual(only('approve'));
    expect(draftGate('delete')).toBe('approve');
    expect(document.activeElement).toBe(approve);
  });

  it('delete at Approve: ArrowRight still moves to Forbid, and ArrowLeft from Forbid goes back to Approve', async () => {
    const user = userEvent.setup();
    openGates();
    await user.click(within(group('delete')).getByRole('radio', { name: copy.gates.settings.approve }));
    act(() => within(group('delete')).getByRole('radio', { name: copy.gates.settings.approve }).focus());

    await user.keyboard('{ArrowRight}');
    expect(checked('delete')).toEqual(only('forbid'));
    expect(draftGate('delete')).toBe('forbid');

    await user.keyboard('{ArrowLeft}');
    expect(checked('delete')).toEqual(only('approve'));
    expect(draftGate('delete')).toBe('approve');
    await user.keyboard('{ArrowLeft}');
    expect(checked('delete')).toEqual(only('approve'));
  });

  it('send at Approve: ArrowLeft reaches Auto (the arrow keys are only blocked on disabled options)', async () => {
    const user = userEvent.setup();
    openGates();
    expect(checked('send')).toEqual(only('approve'));
    act(() => within(group('send')).getByRole('radio', { name: copy.gates.settings.approve }).focus());
    await user.keyboard('{ArrowLeft}');
    expect(checked('send')).toEqual(only('auto'));
    expect(draftGate('send')).toBe('auto');
  });
});

// ---- Every profile ----

describe('the delete row on every visible profile', () => {
  const profiles: { label: string; seed: Seed }[] = [
    { label: 'muse', seed: { target: 'muse' } },
    { label: 'openclaw', seed: { target: 'openclaw' } },
    { label: 'hermes', seed: { target: 'hermes' } },
    { label: 'grok', seed: { target: 'grok' } },
    { label: 'chatgpt dot', seed: { target: 'chatgpt', mode: 'dot' } },
    { label: 'chatgpt project', seed: { target: 'chatgpt', mode: 'project' } },
    { label: 'chatgpt instructions free', seed: { target: 'chatgpt', mode: 'instructions', plan: 'free' } },
    { label: 'chatgpt instructions paid', seed: { target: 'chatgpt', mode: 'instructions', plan: 'paid' } },
  ];
  const isDot = (s: Seed) => s.target === 'chatgpt' && (s.mode ?? 'dot') === 'dot';

  it.each(profiles)('$label: Auto is disabled on delete, enabled on send, and a tap leaves delete alone', async ({ seed }) => {
    const user = userEvent.setup();
    openGates(seed);
    // Dot names the three options with the library's custom rule settings; the others use the copy labels.
    const labels = isDot(seed) ? dotLabels : copy.gates.settings;
    expect(isAriaDisabled(autoRadio('delete', labels.auto))).toBe(true);
    expect(isAriaDisabled(autoRadio('send', labels.auto))).toBe(false);

    const before = checked('delete');
    await user.click(autoRadio('delete', labels.auto));
    expect(checked('delete')).toEqual(before);
    expect(draftGate('delete')).toBeUndefined();

    await user.click(autoRadio('send', labels.auto));
    expect(draftGate('send')).toBe('auto');
  });

  it('chatgpt dot: tapping the "Take action without asking" option on delete never reaches the custom rule', async () => {
    const user = userEvent.setup();
    openGates({ target: 'chatgpt', mode: 'dot' });
    // A blank build has no name yet, and the compiler needs one.
    store((s) => s.setName('Zephyr'));
    await user.click(within(group('delete')).getByRole('radio', { name: dotLabels.approve }));
    await user.click(autoRadio('delete', dotLabels.auto));

    const result = compiled(useBuilder.getState());
    if (isCompileError(result)) throw new Error(`the dot build did not compile: ${result.error}`);
    const rule = result.customRules.find((r) => r.gate === 'delete');
    expect(rule?.setting).toBe(dotLabels.approve);
    expect(result.customRules.filter((r) => r.gate === 'delete').map((r) => r.setting)).not.toContain(dotLabels.auto);
  });
});

// ---- Toggle3 on its own: the component layer of the fix, with no store behind it ----
//
// The store also refuses auto on these gates, so the screen tests above are guarded twice. These
// render the control with a spy, so a click that reaches onChange would show here.

describe('Toggle3 disabledOptions', () => {
  const labels = copy.gates.settings;

  function renderToggle(props: {
    value: GateSetting;
    disabledOptions?: GateSetting[];
    disabledHint?: string;
    locked?: boolean;
    lockedMessage?: string;
  }) {
    const onChange = vi.fn();
    render(<Toggle3 label="Deletes" labels={labels} onChange={onChange} {...props} />);
    const radio = (setting: GateSetting) => screen.getByRole('radio', { name: labels[setting] });
    return { onChange, radio, group: screen.getByRole('radiogroup', { name: 'Deletes' }) };
  }

  it('a click on a disabled option does not call onChange; a click on an enabled one does', async () => {
    const user = userEvent.setup();
    const { onChange, radio } = renderToggle({ value: 'approve', disabledOptions: ['auto'], disabledHint: 'why' });
    await user.click(radio('auto'));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(radio('forbid'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('forbid');
  });

  it('only the disabled option carries aria-disabled', () => {
    const { radio } = renderToggle({ value: 'approve', disabledOptions: ['auto'], disabledHint: 'why' });
    expect(radio('auto').getAttribute('aria-disabled')).toBe('true');
    expect(radio('approve').hasAttribute('aria-disabled')).toBe(false);
    expect(radio('forbid').hasAttribute('aria-disabled')).toBe(false);
  });

  it('with no disabledOptions, Auto is enabled and no hint shows', async () => {
    const user = userEvent.setup();
    const { onChange, radio } = renderToggle({ value: 'approve', disabledHint: 'why' });
    expect(radio('auto').hasAttribute('aria-disabled')).toBe(false);
    expect(screen.queryByText('why')).toBeNull();
    await user.click(radio('auto'));
    expect(onChange).toHaveBeenCalledWith('auto');
  });

  it('the hint shows as a caption and the group is described by it', () => {
    const { group } = renderToggle({ value: 'approve', disabledOptions: ['auto'], disabledHint: 'why' });
    expect(screen.getByText('why')).toBeTruthy();
    expect(describedText(group)).toBe('why');
  });

  it('a locked row with a hint is described by both the lock message and the hint', () => {
    const { group } = renderToggle({
      value: 'forbid',
      locked: true,
      lockedMessage: 'locked because',
      disabledOptions: ['auto'],
      disabledHint: 'why',
    });
    const text = describedText(group);
    expect(text).toContain('locked because');
    expect(text).toContain('why');
  });

  it('arrow keys, Home and End skip a disabled Auto and stay put when nothing is enabled that way', async () => {
    const user = userEvent.setup();
    const { onChange, radio } = renderToggle({ value: 'approve', disabledOptions: ['auto'], disabledHint: 'why' });
    act(() => radio('approve').focus());
    for (const key of ['{ArrowLeft}', '{ArrowUp}', '{Home}']) {
      await user.keyboard(key);
      expect(onChange, key).not.toHaveBeenCalled();
      expect(document.activeElement, key).toBe(radio('approve'));
    }
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('forbid');
  });

  it('Home from Forbid lands on Approve when Auto is disabled', async () => {
    const user = userEvent.setup();
    const { onChange, radio } = renderToggle({ value: 'forbid', disabledOptions: ['auto'], disabledHint: 'why' });
    act(() => radio('forbid').focus());
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('approve');
  });

  it('a disabled option that is the current value still shows as selected', () => {
    const { radio } = renderToggle({ value: 'auto', disabledOptions: ['auto'], disabledHint: 'why' });
    expect(radio('auto').getAttribute('aria-checked')).toBe('true');
  });
});
