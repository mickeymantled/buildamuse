// @vitest-environment jsdom
//
// CopyButton tests (M4 slice 4.15, W19). Renders <CopyButton/> in jsdom with document.execCommand
// and navigator.clipboard.writeText stubbed, and records the order the two copy paths run in.
//
// The behavior under test comes from docs/M4-PLAN.md section 9 and QUESTIONS.md W19:
//   - inside the click, the textarea copy (execCommand) runs synchronously first;
//   - if it returns false, navigator.clipboard.writeText is the second try and the button settles
//     on its promise;
//   - there is no async fallback anywhere (no second legacy copy after a rejection);
//   - when both paths fail, the block named by `selectRef` is selected and the failed label shows.
//
// The visible labels are props, so the tests pass their own and assert on those. Nothing here is
// copied from what the component happened to render.

import { createRef, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CopyButton } from '../src/ui/components/CopyButton.js';

// ---- Fixtures ----

const LABEL = 'Copy it';
const COPIED = 'It is copied';
const FAILED = 'Select it by hand';
// The clipboard text and the block text differ on purpose, so a check that "the block is selected"
// cannot be satisfied by the hidden textarea the copy helper uses.
const CLIPBOARD_TEXT = 'clipboard payload line one\nline two';
const BLOCK_TEXT = 'visible block text the reader can select';
const OTHER_TEXT = 'some other paragraph on the page';

// ---- Stubs ----

type ExecMode = 'true' | 'false' | 'throw';
type WriteMode = 'resolve' | 'reject' | 'throw' | 'deferred' | 'absent';

interface Rig {
  /** Every stub call, in order, as a short tag. */
  calls: string[];
  exec: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  /** Snapshot of the hidden textarea at the moment execCommand ran. */
  execSeen: {
    isTextarea: boolean;
    value: string;
    selStart: number | null;
    selEnd: number | null;
    readOnly: boolean;
    fontSize: string;
    ariaHidden: string | null;
    inDocument: boolean;
    command: string;
  }[];
  /** Settlers for the 'deferred' write mode. */
  resolveWrite: () => void;
  rejectWrite: () => void;
}

const saved = new Map<string, PropertyDescriptor | undefined>();

function stash(target: object, key: string, id: string) {
  if (!saved.has(id)) saved.set(id, Object.getOwnPropertyDescriptor(target, key));
}

function restoreAll() {
  const targets: Record<string, [object, string]> = {
    execCommand: [document, 'execCommand'],
    clipboard: [navigator, 'clipboard'],
    isSecureContext: [window, 'isSecureContext'],
  };
  for (const [id, desc] of saved) {
    const [target, key] = targets[id]!;
    if (desc) Object.defineProperty(target, key, desc);
    else delete (target as Record<string, unknown>)[key];
  }
  saved.clear();
}

function install(opts: { exec: ExecMode; write: WriteMode; secure?: boolean }): Rig {
  const calls: string[] = [];
  const execSeen: Rig['execSeen'] = [];
  let resolveWrite: () => void = () => {};
  let rejectWrite: () => void = () => {};

  const exec = vi.fn((command: string) => {
    calls.push('execCommand');
    const el = document.activeElement;
    const ta = el instanceof HTMLTextAreaElement ? el : null;
    execSeen.push({
      isTextarea: !!ta,
      value: ta?.value ?? '',
      selStart: ta?.selectionStart ?? null,
      selEnd: ta?.selectionEnd ?? null,
      readOnly: ta?.readOnly ?? false,
      fontSize: ta?.style.fontSize ?? '',
      ariaHidden: ta?.getAttribute('aria-hidden') ?? null,
      inDocument: !!ta && document.body.contains(ta),
      command,
    });
    if (opts.exec === 'throw') throw new Error('execCommand blew up');
    return opts.exec === 'true';
  });

  const write = vi.fn((_text: string) => {
    calls.push('writeText');
    if (opts.write === 'throw') throw new Error('writeText blew up');
    if (opts.write === 'reject') return Promise.reject(new Error('denied'));
    if (opts.write === 'deferred') {
      return new Promise<void>((res, rej) => {
        resolveWrite = res;
        rejectWrite = () => rej(new Error('denied'));
      });
    }
    return Promise.resolve();
  });

  stash(document, 'execCommand', 'execCommand');
  Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: exec });

  stash(navigator, 'clipboard', 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: opts.write === 'absent' ? undefined : { writeText: write },
  });

  stash(window, 'isSecureContext', 'isSecureContext');
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: opts.secure ?? true,
  });

  return {
    calls,
    exec,
    write,
    execSeen,
    resolveWrite: () => resolveWrite(),
    rejectWrite: () => rejectWrite(),
  };
}

// ---- Harness ----

function Harness({
  onCopied,
  withSelectRef = true,
}: {
  onCopied?: () => void;
  withSelectRef?: boolean;
}) {
  const pre = useRef<HTMLPreElement>(null);
  return (
    <div>
      <p data-testid="other">{OTHER_TEXT}</p>
      <pre data-testid="block" ref={pre}>
        {BLOCK_TEXT}
      </pre>
      <CopyButton
        text={CLIPBOARD_TEXT}
        label={LABEL}
        copiedLabel={COPIED}
        failedLabel={FAILED}
        selectRef={withSelectRef ? pre : undefined}
        onCopied={onCopied}
      />
    </div>
  );
}

function button(name: string = LABEL) {
  return screen.getByRole('button', { name });
}

function status() {
  return screen.getByRole('status');
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function selectedText() {
  return window.getSelection()?.toString() ?? '';
}

function selectOther() {
  const sel = window.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(screen.getByTestId('other'));
  sel.removeAllRanges();
  sel.addRange(range);
}

beforeEach(() => {
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreAll();
  window.getSelection()?.removeAllRanges();
});

// ---- Tests ----

describe('CopyButton: textarea copy first, W19', () => {
  it('when execCommand returns true, writeText is never called and the copied state shows', async () => {
    const rig = install({ exec: 'true', write: 'resolve' });
    const onCopied = vi.fn();
    render(<Harness onCopied={onCopied} />);

    await userEvent.click(button());
    await flush();

    expect(rig.exec).toHaveBeenCalledTimes(1);
    expect(rig.exec).toHaveBeenCalledWith('copy');
    expect(rig.write).not.toHaveBeenCalled();
    expect(button(COPIED)).toBeTruthy();
    expect(status().textContent).toBe(COPIED);
    expect(onCopied).toHaveBeenCalledTimes(1);
  });

  it('copies the text prop, selected whole, from a hidden textarea that is in the document at that moment', async () => {
    const rig = install({ exec: 'true', write: 'resolve' });
    render(<Harness />);

    await userEvent.click(button());

    expect(rig.execSeen).toHaveLength(1);
    const seen = rig.execSeen[0]!;
    expect(seen.command).toBe('copy');
    expect(seen.isTextarea).toBe(true);
    expect(seen.inDocument).toBe(true);
    expect(seen.value).toBe(CLIPBOARD_TEXT);
    expect(seen.selStart).toBe(0);
    expect(seen.selEnd).toBe(CLIPBOARD_TEXT.length);
  });

  it('keeps the iOS keyboard down and avoids focus zoom: the textarea is readonly, aria-hidden and 16px', async () => {
    const rig = install({ exec: 'true', write: 'resolve' });
    render(<Harness />);

    await userEvent.click(button());

    const seen = rig.execSeen[0]!;
    expect(seen.readOnly).toBe(true);
    expect(seen.ariaHidden).toBe('true');
    expect(seen.fontSize).toBe('16px');
  });

  it('removes the textarea after the copy and gives focus back to the button', async () => {
    install({ exec: 'true', write: 'resolve' });
    render(<Harness />);
    const btn = button();

    await userEvent.click(btn);
    await flush();

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(document.activeElement).toBe(button(COPIED));
  });

  it('does not touch the page selection after a successful copy', async () => {
    install({ exec: 'true', write: 'resolve' });
    render(<Harness />);

    await userEvent.click(button());
    await flush();

    expect(selectedText()).not.toContain(BLOCK_TEXT);
  });
});

describe('CopyButton: Clipboard API is the second try, W19', () => {
  it('when execCommand returns false and writeText resolves, the copied state shows', async () => {
    const rig = install({ exec: 'false', write: 'resolve' });
    const onCopied = vi.fn();
    render(<Harness onCopied={onCopied} />);

    await userEvent.click(button());
    await flush();

    expect(rig.write).toHaveBeenCalledTimes(1);
    expect(rig.write).toHaveBeenCalledWith(CLIPBOARD_TEXT);
    expect(button(COPIED)).toBeTruthy();
    expect(status().textContent).toBe(COPIED);
    expect(onCopied).toHaveBeenCalledTimes(1);
  });

  it('runs execCommand before writeText', async () => {
    const rig = install({ exec: 'false', write: 'resolve' });
    render(<Harness />);

    await userEvent.click(button());
    await flush();

    expect(rig.calls).toEqual(['execCommand', 'writeText']);
  });

  it('when execCommand throws, writeText is still tried and can settle as copied', async () => {
    const rig = install({ exec: 'throw', write: 'resolve' });
    render(<Harness />);

    await userEvent.click(button());
    await flush();

    expect(rig.calls).toEqual(['execCommand', 'writeText']);
    expect(button(COPIED)).toBeTruthy();
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('settles on the writeText promise: the button is not copied while the promise is pending', async () => {
    const rig = install({ exec: 'false', write: 'deferred' });
    render(<Harness />);

    await userEvent.click(button());
    await flush();

    expect(rig.write).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: COPIED })).toBeNull();
    expect(screen.queryByRole('button', { name: FAILED })).toBeNull();
    expect(status().textContent).toBe('');

    rig.resolveWrite();
    await flush();

    expect(button(COPIED)).toBeTruthy();
  });

  it('settles as failed when the pending writeText promise rejects', async () => {
    const rig = install({ exec: 'false', write: 'deferred' });
    render(<Harness />);

    await userEvent.click(button());
    await flush();
    rig.rejectWrite();
    await flush();

    expect(button(FAILED)).toBeTruthy();
    expect(status().textContent).toBe(FAILED);
  });
});

describe('CopyButton: both paths fail, W19', () => {
  it('shows the failed state and selects the selectRef block when execCommand is false and writeText rejects', async () => {
    const rig = install({ exec: 'false', write: 'reject' });
    const onCopied = vi.fn();
    render(<Harness onCopied={onCopied} />);
    selectOther();

    fireEvent.click(button());
    await flush();

    expect(rig.calls).toEqual(['execCommand', 'writeText']);
    expect(button(FAILED)).toBeTruthy();
    expect(status().textContent).toBe(FAILED);
    expect(selectedText()).toBe(BLOCK_TEXT);
    expect(onCopied).not.toHaveBeenCalled();
  });

  it('selects the block whole: the selection range covers the selectRef element and nothing else', async () => {
    install({ exec: 'false', write: 'reject' });
    render(<Harness />);
    selectOther();

    fireEvent.click(button());
    await flush();

    const sel = window.getSelection()!;
    expect(sel.rangeCount).toBe(1);
    const block = screen.getByTestId('block');
    const range = sel.getRangeAt(0);
    expect(block.contains(range.startContainer)).toBe(true);
    expect(block.contains(range.endContainer)).toBe(true);
    expect(selectedText()).not.toContain(OTHER_TEXT);
  });

  it('fails and selects the block when the Clipboard API is unavailable', async () => {
    const rig = install({ exec: 'false', write: 'absent' });
    render(<Harness />);
    selectOther();

    fireEvent.click(button());
    await flush();

    expect(rig.calls).toEqual(['execCommand']);
    expect(button(FAILED)).toBeTruthy();
    expect(selectedText()).toBe(BLOCK_TEXT);
  });

  it('fails without calling writeText when the context is not secure', async () => {
    const rig = install({ exec: 'false', write: 'resolve', secure: false });
    render(<Harness />);
    selectOther();

    fireEvent.click(button());
    await flush();

    expect(rig.write).not.toHaveBeenCalled();
    expect(button(FAILED)).toBeTruthy();
    expect(selectedText()).toBe(BLOCK_TEXT);
  });

  it('counts a synchronous throw from writeText as failed and selects the block', async () => {
    const rig = install({ exec: 'false', write: 'throw' });
    render(<Harness />);
    selectOther();

    fireEvent.click(button());
    await flush();

    expect(rig.calls).toEqual(['execCommand', 'writeText']);
    expect(button(FAILED)).toBeTruthy();
    expect(selectedText()).toBe(BLOCK_TEXT);
  });

  it('fails cleanly with no selectRef: failed label shows and nothing throws', async () => {
    install({ exec: 'false', write: 'reject' });
    render(<Harness withSelectRef={false} />);
    selectOther();

    fireEvent.click(button());
    await flush();

    expect(button(FAILED)).toBeTruthy();
    expect(selectedText()).not.toContain(BLOCK_TEXT);
  });

  it('fails cleanly when selectRef.current is null', async () => {
    install({ exec: 'false', write: 'reject' });
    const emptyRef = createRef<HTMLElement>();
    render(
      <CopyButton
        text={CLIPBOARD_TEXT}
        label={LABEL}
        copiedLabel={COPIED}
        failedLabel={FAILED}
        selectRef={emptyRef}
      />,
    );

    fireEvent.click(button());
    await flush();

    expect(button(FAILED)).toBeTruthy();
  });

  it('leaves the textarea out of the document on the failure path too', async () => {
    install({ exec: 'false', write: 'reject' });
    render(<Harness />);

    fireEvent.click(button());
    await flush();

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});

describe('CopyButton: everything starts inside the click task, W19', () => {
  it('calls execCommand synchronously in the click, before any microtask can run', () => {
    const rig = install({ exec: 'true', write: 'resolve' });
    render(<Harness />);

    let microtaskRan = false;
    void Promise.resolve().then(() => {
      microtaskRan = true;
    });
    let calledBeforeMicrotask = false;
    rig.exec.mockImplementationOnce(() => {
      calledBeforeMicrotask = !microtaskRan;
      return true;
    });

    fireEvent.click(button());

    expect(rig.exec).toHaveBeenCalledTimes(1);
    expect(calledBeforeMicrotask).toBe(true);
    expect(microtaskRan).toBe(false);
  });

  it('has already called execCommand by the time the click event reaches the document', () => {
    const rig = install({ exec: 'true', write: 'resolve' });
    render(<Harness />);

    let execCallsAtDocumentClick = -1;
    const probe = () => {
      execCallsAtDocumentClick = rig.exec.mock.calls.length;
    };
    document.addEventListener('click', probe);
    try {
      fireEvent.click(button());
    } finally {
      document.removeEventListener('click', probe);
    }

    expect(execCallsAtDocumentClick).toBe(1);
  });

  it('when execCommand is false, calls writeText in the same click task, after execCommand and before any microtask', () => {
    const rig = install({ exec: 'false', write: 'resolve' });
    render(<Harness />);

    let microtaskRan = false;
    void Promise.resolve().then(() => {
      microtaskRan = true;
    });
    const microtaskAtCall: Record<string, boolean> = {};
    const realExec = rig.exec.getMockImplementation() as (command: string) => boolean;
    rig.exec.mockImplementation((command: string) => {
      microtaskAtCall.execCommand = microtaskRan;
      return realExec(command);
    });
    const realWrite = rig.write.getMockImplementation() as (text: string) => Promise<void>;
    rig.write.mockImplementation((text: string) => {
      microtaskAtCall.writeText = microtaskRan;
      return realWrite(text);
    });

    fireEvent.click(button());

    expect(rig.calls).toEqual(['execCommand', 'writeText']);
    expect(microtaskAtCall).toEqual({ execCommand: false, writeText: false });
    expect(microtaskRan).toBe(false);
  });

  it('when execCommand throws, still calls writeText inside the same click task', () => {
    const rig = install({ exec: 'throw', write: 'resolve' });
    render(<Harness />);

    fireEvent.click(button());

    // No await between the click and these assertions.
    expect(rig.calls).toEqual(['execCommand', 'writeText']);
  });

  it('shows the copied state synchronously after an execCommand success, with no await', () => {
    install({ exec: 'true', write: 'resolve' });
    render(<Harness />);

    fireEvent.click(button());

    expect(screen.queryByRole('button', { name: COPIED })).not.toBeNull();
  });
});

describe('CopyButton: no async fallback anywhere, W19', () => {
  it('runs no second legacy copy after writeText rejects, even after timers run', async () => {
    vi.useFakeTimers();
    const rig = install({ exec: 'false', write: 'reject' });
    const createElement = vi.spyOn(document, 'createElement');
    render(<Harness />);

    fireEvent.click(button());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(rig.calls).toEqual(['execCommand', 'writeText']);
    expect(rig.exec).toHaveBeenCalledTimes(1);
    const textareasCreated = createElement.mock.calls.filter(([tag]) => tag === 'textarea');
    expect(textareasCreated).toHaveLength(1);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('runs no second legacy copy after a pending writeText promise rejects later', async () => {
    const rig = install({ exec: 'false', write: 'deferred' });
    const createElement = vi.spyOn(document, 'createElement');
    render(<Harness />);

    fireEvent.click(button());
    await flush();
    expect(rig.exec).toHaveBeenCalledTimes(1);

    rig.rejectWrite();
    await flush();

    expect(rig.exec).toHaveBeenCalledTimes(1);
    expect(createElement.mock.calls.filter(([tag]) => tag === 'textarea')).toHaveLength(1);
    expect(button(FAILED)).toBeTruthy();
  });

  it('runs no further copy attempts when writeText resolves', async () => {
    const rig = install({ exec: 'false', write: 'resolve' });
    render(<Harness />);

    fireEvent.click(button());
    await flush();

    expect(rig.exec).toHaveBeenCalledTimes(1);
    expect(rig.write).toHaveBeenCalledTimes(1);
  });

  it('runs no async legacy copy when the Clipboard API is unavailable', async () => {
    vi.useFakeTimers();
    const rig = install({ exec: 'false', write: 'absent' });
    render(<Harness />);

    fireEvent.click(button());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(rig.exec).toHaveBeenCalledTimes(1);
  });
});

describe('CopyButton: state, reset and unmount', () => {
  it('returns to the idle label after a while following a successful copy', async () => {
    vi.useFakeTimers();
    install({ exec: 'true', write: 'resolve' });
    render(<Harness />);

    fireEvent.click(button());
    expect(button(COPIED)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(button(LABEL)).toBeTruthy();
    expect(status().textContent).toBe('');
  });

  it('returns to the idle label after a failed copy, so the button can be tried again', async () => {
    vi.useFakeTimers();
    install({ exec: 'false', write: 'reject' });
    render(<Harness />);

    fireEvent.click(button());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(button(LABEL)).toBeTruthy();
  });

  it('can be clicked again after a failure and copy on the second try', async () => {
    const rig = install({ exec: 'false', write: 'reject' });
    render(<Harness />);

    await userEvent.click(button());
    await flush();
    expect(button(FAILED)).toBeTruthy();

    rig.exec.mockImplementation(() => true);
    await userEvent.click(button(FAILED));
    await flush();

    expect(button(COPIED)).toBeTruthy();
  });

  it('does not call onCopied when writeText resolves after unmount', async () => {
    const rig = install({ exec: 'false', write: 'deferred' });
    const onCopied = vi.fn();
    const { unmount } = render(<Harness onCopied={onCopied} />);

    fireEvent.click(button());
    await flush();
    unmount();
    rig.resolveWrite();
    await flush();

    expect(onCopied).not.toHaveBeenCalled();
  });

  it('does not select the block when writeText rejects after unmount', async () => {
    const rig = install({ exec: 'false', write: 'deferred' });
    // The block lives outside React, so the ref stays valid after the button unmounts and a
    // late settle would be able to select it if the component did not guard against unmount.
    const block = document.createElement('pre');
    block.textContent = BLOCK_TEXT;
    document.body.appendChild(block);
    const { unmount } = render(
      <CopyButton
        text={CLIPBOARD_TEXT}
        label={LABEL}
        copiedLabel={COPIED}
        failedLabel={FAILED}
        selectRef={{ current: block }}
      />,
    );

    fireEvent.click(button());
    await flush();
    unmount();
    rig.rejectWrite();
    await flush();

    expect(selectedText()).not.toContain(BLOCK_TEXT);
    block.remove();
  });

  it('keeps the existing visual contract: a checkmark only in the copied state', async () => {
    install({ exec: 'true', write: 'resolve' });
    render(<Harness />);

    expect(button(LABEL).querySelector('svg')).toBeNull();
    fireEvent.click(button());
    expect(button(COPIED).querySelector('svg')).not.toBeNull();
  });

  it('the status region is empty when idle and announces the labels after a copy', async () => {
    install({ exec: 'false', write: 'resolve' });
    render(<Harness />);

    expect(status().textContent).toBe('');
    await userEvent.click(button());
    await flush();
    expect(status().textContent).toBe(COPIED);
  });
});
