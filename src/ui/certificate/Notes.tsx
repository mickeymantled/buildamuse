import type { BundleNote } from '../../compiler/types.js';
import { FOCUS, cx } from '../components/cx';
import { ChevronIcon } from '../components/icons';
import { copy } from '../copy.js';
import type { CertModel } from './model.js';

const HEADING = 'text-lg font-semibold leading-6 text-text';

// Notes at normal contrast: they are facts the user needs, not doubts.
export function Notes({ notes }: { notes: readonly BundleNote[] }) {
  if (notes.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className={HEADING}>{copy.certificate.notes}</h2>
      <ul role="list" className="flex list-none flex-col gap-2 p-0">
        {notes.map((note) => (
          <li key={note.id} className="text-sm leading-5 text-text [overflow-wrap:anywhere]">
            {note.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Lines the research has not settled, one each, and where the docs were read. The text is the muted
// token (at least 4.5:1 on the page in light and dark), not a faded one.
export function StillChecking({ items, docs }: { items: readonly BundleNote[]; docs: CertModel['docs'] }) {
  const c = copy.certificate.stillChecking;
  return (
    <section className="flex flex-col gap-2">
      {items.length > 0 && (
        <>
          <h2 className={HEADING}>{c.heading}</h2>
          <ul role="list" className="flex list-none flex-col gap-1 p-0">
            {items.map((note) => (
              <li key={note.id} className="text-sm leading-5 text-muted [overflow-wrap:anywhere]">
                {note.text}
              </li>
            ))}
          </ul>
        </>
      )}
      <a
        href={docs.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cx(
          'inline-flex min-h-[44px] items-center self-start rounded-lg text-sm leading-5 text-accent underline underline-offset-2 [overflow-wrap:anywhere]',
          FOCUS,
        )}
      >
        {c.docsRead(docs.label, docs.date)}
      </a>
    </section>
  );
}

// "You skipped <name>." for each screen the user skipped, muted like the still-checking lines.
export function Skipped({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul role="list" className="flex list-none flex-col gap-1 p-0">
      {lines.map((line) => (
        <li key={line} className="text-sm leading-5 text-muted">
          {line}
        </li>
      ))}
    </ul>
  );
}

// The raw compiler warnings behind a disclosure, for anyone who wants them. The chevron is only a
// cue: the details element already says open or closed.
export function Details({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <details className="group rounded-xl border border-border bg-surface">
      <summary
        className={cx(
          'flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium text-text [&::-webkit-details-marker]:hidden',
          FOCUS,
        )}
      >
        <span>{copy.certificate.details.summary}</span>
        <span aria-hidden="true" className="flex shrink-0 text-muted">
          <ChevronIcon dir="down" className="motion-safe:transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <ul role="list" className="flex list-none flex-col gap-2 p-3 pt-0">
        {lines.map((line, i) => (
          <li key={`${i}-${line}`} className="whitespace-pre-wrap text-sm leading-5 text-text [overflow-wrap:anywhere]">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}
