import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import library from '../../library/index.js';
import { FOCUS, ON_FILL, cx } from '../components/cx';
import { copy } from '../copy.js';
import { useBuilder } from '../store.js';
import { certificateInput } from './input.js';

// The preview chat (M5 slice 5.3, docs/M5-PLAN.md section 3). It sends the certificate's personality
// and one short message to the preview proxy and shows the reply. It is the app's only network call
// (QUESTIONS B22, B23). It stores nothing: the log lives in this component and the session count in
// module memory, so a reload starts over. The share link, the build and the pasted text never leave.

export const MESSAGE_MAX = 200;
export const SESSION_MAX = 20;
export const TIMEOUT_MS = 30_000;

// The proxy base URL, or undefined when the chat is off. This is the only place the variable is read,
// so a test can stub it. A trailing slash is dropped so the path joins cleanly.
export function previewUrl(): string | undefined {
  const raw: unknown = import.meta.env.VITE_PREVIEW_URL;
  if (typeof raw !== 'string') return undefined;
  const url = raw.trim().replace(/\/+$/, '');
  return url === '' ? undefined : url;
}

// What the person has done this visit. Module memory only: a reload clears it.
const session = { sent: 0, unlocked: false };

// For tests: start a fresh visit.
export function resetPreviewSession(): void {
  session.sent = 0;
  session.unlocked = false;
}

// The three chips are probes 1 to 3 in library order (QUESTIONS X1).
const CHIPS = library.probes.slice(0, 3);

export type Outcome =
  | { kind: 'reply'; text: string }
  | { kind: 'withheld' }
  | { kind: 'refused' }
  | { kind: 'rateLimited'; retryAfter: number | null }
  | { kind: 'busy' }
  | { kind: 'unavailable' };

function fieldOf(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;
}

// Reads the proxy's answer (docs/M5-PLAN.md section 1). Anything it does not recognise is unavailable.
export function outcomeOf(status: number, body: unknown): Outcome {
  if (status >= 200 && status < 300) {
    // A held reply wins over any reply field: the page is the last hop (QUESTIONS B22).
    if (fieldOf(body, 'withheld') === true) return { kind: 'withheld' };
    const reply = fieldOf(body, 'reply');
    if (typeof reply === 'string' && reply.trim() !== '') return { kind: 'reply', text: reply };
    if (fieldOf(body, 'refused') === true) return { kind: 'refused' };
    return { kind: 'unavailable' };
  }
  if (status === 429) {
    const after = fieldOf(body, 'retryAfter');
    return { kind: 'rateLimited', retryAfter: typeof after === 'number' && Number.isFinite(after) && after > 0 ? after : null };
  }
  if (status === 503) return { kind: 'busy' };
  return { kind: 'unavailable' };
}

async function ask(url: string, personality: string, message: string, signal: AbortSignal): Promise<Outcome> {
  const res = await fetch(`${url}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personality, message }),
    credentials: 'omit',
    signal,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return outcomeOf(res.status, body);
}

function noteOf(outcome: Exclude<Outcome, { kind: 'reply' }>): string {
  const c = copy.chat;
  switch (outcome.kind) {
    case 'withheld':
      return c.withheld;
    case 'refused':
      return c.refused;
    case 'rateLimited':
      return outcome.retryAfter === null ? c.rateLimitedNoTime : c.rateLimited(outcome.retryAfter);
    case 'busy':
      return c.busy;
    case 'unavailable':
      return c.unavailable;
  }
}

interface Entry {
  id: number;
  kind: 'you' | 'bot' | 'note';
  text: string;
}

const HEADING = 'text-lg font-semibold leading-6 text-text';
const BUBBLE = 'max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-5 [overflow-wrap:anywhere]';

function Message({ entry }: { entry: Entry }) {
  const c = copy.chat;
  if (entry.kind === 'you') {
    return (
      <li className={cx(BUBBLE, 'self-end bg-accent', ON_FILL)}>
        <span className="sr-only">{c.you}: </span>
        {entry.text}
      </li>
    );
  }
  if (entry.kind === 'bot') {
    return (
      <li className={cx(BUBBLE, 'self-start border border-border bg-surface text-text')}>
        <span className="sr-only">{c.bot}: </span>
        {entry.text}
      </li>
    );
  }
  return <li className={cx(BUBBLE, 'self-start border border-dashed border-border text-text')}>{entry.text}</li>;
}

const CHIP =
  'inline-flex min-h-[44px] max-w-full items-center rounded-xl border border-border bg-surface px-4 py-2 text-left text-sm font-medium leading-5 text-text [overflow-wrap:anywhere] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-60';

function ChatPanel({ url, personality }: { url: string; personality: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(session.sent);
  const [unlocked, setUnlocked] = useState(session.unlocked);
  const [draft, setDraft] = useState('');
  const alive = useRef(true);
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const logRef = useRef<HTMLUListElement>(null);
  const capRef = useRef<HTMLParagraphElement>(null);
  const headingId = useId();
  const hintId = useId();
  const inputId = useId();
  const countId = useId();
  const lockId = useId();

  const capped = sent >= SESSION_MAX;
  const askOpen = unlocked && !capped;

  // This panel is keyed by the personality, so a new personality is a new panel. Leaving ends a
  // request that is still out.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);

  // Bring the newest line into view. The ask box sits under the log, so without this a reply could
  // land above the part of the page the person is looking at.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const last = logRef.current?.lastElementChild;
    if (last instanceof HTMLElement && typeof last.scrollIntoView === 'function') {
      last.scrollIntoView({ block: 'nearest' });
    }
  }, [entries, loading]);

  // The last message disables the chips and the box. Focus moves to the line that says why, so it
  // does not fall back to the top of the page.
  const capSeen = useRef(capped);
  useEffect(() => {
    if (capped && !capSeen.current) capRef.current?.focus({ preventScroll: true });
    capSeen.current = capped;
  }, [capped]);

  const add = (kind: Entry['kind'], text: string): void => {
    setEntries((list) => [...list, { id: nextId.current++, kind, text }]);
  };

  const send = async (raw: string): Promise<void> => {
    const message = raw.trim().slice(0, MESSAGE_MAX);
    if (message === '' || inFlight.current || session.sent >= SESSION_MAX) return;
    inFlight.current = true;
    session.sent += 1;
    setSent(session.sent);
    add('you', message);
    setLoading(true);

    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let outcome: Outcome;
    try {
      outcome = await ask(url, personality, message, controller.signal);
    } catch {
      outcome = { kind: 'unavailable' };
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
    }

    // Only a reply the person can read opens the box (QUESTIONS X2).
    if (outcome.kind === 'reply') session.unlocked = true;
    if (!alive.current) return;
    setUnlocked(session.unlocked);
    setLoading(false);
    if (outcome.kind === 'reply') add('bot', outcome.text);
    else add('note', noteOf(outcome));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!askOpen || loading || draft.trim() === '') return;
    const text = draft;
    setDraft('');
    void send(text);
  };

  const c = copy.chat;
  const n = draft.length;
  const sendBlocked = loading || draft.trim() === '';
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id={headingId} className={HEADING}>
          {c.heading}
        </h2>
        <p className="text-sm leading-5 text-text">{c.label}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p id={hintId} className="text-sm leading-5 text-muted">
          {c.chipsHint}
        </p>
        <div role="group" aria-labelledby={hintId} className="flex flex-wrap gap-2">
          {CHIPS.map((probe) => (
            <button
              key={probe.id}
              type="button"
              disabled={capped}
              aria-disabled={loading || undefined}
              onClick={() => void send(probe.line)}
              className={cx(CHIP, FOCUS)}
            >
              {probe.line}
            </button>
          ))}
        </div>
      </div>

      <ul
        ref={logRef}
        role="list"
        aria-live="polite"
        aria-label={c.logLabel}
        className="flex list-none flex-col gap-2 p-0 empty:hidden"
      >
        {entries.map((entry) => (
          <Message key={entry.id} entry={entry} />
        ))}
        {loading && (
          <li className={cx(BUBBLE, 'self-start border border-dashed border-border text-muted motion-safe:animate-pulse')}>
            {c.thinking}
          </li>
        )}
      </ul>

      <p
        ref={capRef}
        role="status"
        tabIndex={-1}
        className={cx('rounded-lg text-sm leading-5 text-text empty:hidden', FOCUS)}
      >
        {capped ? c.capReached(SESSION_MAX) : null}
      </p>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={inputId} className="text-base font-semibold text-text">
            {c.askLabel}
          </label>
          <p id={countId} className="text-sm text-muted">
            <span aria-hidden="true" className="font-semibold tabular-nums text-text">
              {c.counter(n, MESSAGE_MAX)}
            </span>
            <span className="sr-only">{c.counterLabel(n, MESSAGE_MAX)}</span>
          </p>
        </div>
        {!unlocked && (
          <p id={lockId} className="text-sm leading-5 text-muted">
            {c.askLocked}
          </p>
        )}
        <div className="flex gap-2">
          {/* 16px text so iOS Safari does not zoom on focus. */}
          <input
            id={inputId}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MESSAGE_MAX}
            disabled={!askOpen}
            autoComplete="off"
            autoCapitalize="sentences"
            spellCheck={false}
            enterKeyHint="send"
            aria-describedby={unlocked ? countId : `${countId} ${lockId}`}
            className={cx(
              'min-h-[48px] min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-base text-text disabled:opacity-50',
              FOCUS,
            )}
          />
          <button
            type="submit"
            disabled={!askOpen}
            aria-disabled={askOpen && sendBlocked ? true : undefined}
            className={cx(
              'inline-flex min-h-[48px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-accent bg-accent px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-60',
              ON_FILL,
              FOCUS,
            )}
          >
            {c.send}
          </button>
        </div>
      </form>
    </section>
  );
}

// Shows only when VITE_PREVIEW_URL is set, so tests and dev stay offline unless it is configured.
// The personality is the certificate's own, Mine included when its switch is on. The panel is keyed
// by it: a new target or a Mine toggle starts a fresh log, since the old replies came from another
// personality.
export function PreviewChat() {
  const input = useBuilder(certificateInput);
  const [url] = useState(previewUrl);
  if (url === undefined || 'error' in input) return null;
  const personality = input.result.soul;
  return <ChatPanel key={personality} url={url} personality={personality} />;
}
