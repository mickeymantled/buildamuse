import { useEffect, useMemo, useRef, useState } from 'react';
import type { TargetId } from '../../compiler/types.js';
import library from '../../library/index.js';
import { shareUrl } from '../../share/url.js';
import { downloadZip } from '../../share/zip.js';
import { CopyButton } from '../components/CopyButton';
import { FOCUS, cx } from '../components/cx';
import { copy } from '../copy.js';
import { previewBuild, useBuilder } from '../store.js';
import { certificateModelOf } from './input.js';

const TARGET_IDS: readonly TargetId[] = library.targets.targets.map((t) => t.id);

// Wraps its label instead of clipping it, so a long target name still fits at 375px.
const BUTTON = cx(
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-center text-sm font-semibold text-text [overflow-wrap:anywhere]',
  FOCUS,
);

// The quiet way out of a certificate that has nothing behind it: no fill, no border, muted text.
const QUIET = cx(
  'inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-medium text-muted underline underline-offset-4 [overflow-wrap:anywhere]',
  FOCUS,
);

// A dismissed share sheet is not a failure.
function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

// The link to this build, made from the build alone. The Mine lines and the pasted text never enter it.
export function useShareLink(): string {
  const build = useBuilder(previewBuild);
  return useMemo(() => shareUrl(window.location.origin, window.location.pathname, build), [build]);
}

// Copy link, as the footer and the top of the page both show it.
export function CopyLinkButton({
  variant = 'primary',
  className,
}: {
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  const link = useShareLink();
  return (
    <CopyButton
      text={link}
      label={copy.actions.copyLink}
      copiedLabel={copy.actions.linkCopied}
      failedLabel={copy.actions.linkFailed}
      variant={variant}
      className={className}
    />
  );
}

// A compact row under the header: Copy link, and why to tap it before leaving to paste. The page
// keeps nothing on reload (W7), so the link is the way back.
export function CopyLinkRow() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <CopyLinkButton variant="secondary" className="shrink-0" />
      <p className="min-w-0 flex-1 basis-48 text-sm leading-5 text-muted">{copy.certificateUi.leavingNote}</p>
    </div>
  );
}

// The certificate footer: Copy link, Share, Download zip, Remix and "Make this for <target> instead".
// It reads the store itself, so the certificate passes it nothing. The link is built from the build
// alone: the Mine lines and the pasted text never enter it.
export function Actions() {
  const model = useBuilder(certificateModelOf);
  const target = useBuilder((s) => s.target);
  const mode = useBuilder((s) => s.mode);
  const fromLink = useBuilder((s) => s.from === 'link');
  const switchTarget = useBuilder((s) => s.switchTarget);
  const startRemix = useBuilder((s) => s.startRemix);
  const reset = useBuilder((s) => s.reset);
  const root = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const [shareFailed, setShareFailed] = useState(false);
  const [switches, setSwitches] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The certificate is now for another target, so it starts over: back to the top, with the heading
  // focused (the tapped button may be gone, and the heading text is the same, so Screen does not do it).
  useEffect(() => {
    if (switches === 0) return;
    window.scrollTo(0, 0);
    const scope: ParentNode = root.current?.closest('main') ?? document;
    scope.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [switches]);

  const link = useShareLink();

  if ('error' in model) return null;

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  // A Custom GPT certificate also offers ChatGPT, which resolves to the Dot mode.
  const others = TARGET_IDS.filter((id) => id !== target || (id === 'chatgpt' && mode === 'gpt'));

  // navigator.share runs inside the tap, before anything async. A dismissed sheet is done.
  const share = (): void => {
    setShareFailed(false);
    const failed = (err: unknown): void => {
      if (mounted.current && !isAbort(err)) setShareFailed(true);
    };
    try {
      navigator
        .share({ title: copy.certificate.title(model.header.name), text: model.header.buildName, url: link })
        .then(undefined, failed);
    } catch (err) {
      failed(err);
    }
  };

  const zip = model.zip;

  return (
    <div ref={root} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <CopyLinkButton className="grow" />
        {canShare && (
          <button type="button" onClick={share} className={cx(BUTTON, 'grow')}>
            {copy.actions.share}
          </button>
        )}
        {zip !== undefined && (
          <button
            type="button"
            onClick={() => downloadZip(zip.files, zip.filename)}
            className={cx(BUTTON, 'grow')}
          >
            {copy.actions.downloadZip}
          </button>
        )}
      </div>
      {shareFailed && (
        <p role="alert" className="text-sm leading-5 text-danger">
          {copy.actions.shareFailed}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <button type="button" onClick={startRemix} className={cx(BUTTON, 'w-full')}>
          {copy.buttons.remix}
        </button>
        {others.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              switchTarget(id);
              setSwitches((n) => n + 1);
            }}
            className={cx(BUTTON, 'w-full')}
          >
            {copy.makeFor(copy.targetNames[id])}
          </button>
        ))}
        {fromLink && (
          <button type="button" onClick={reset} className={QUIET}>
            {copy.buttons.buildYourOwn}
          </button>
        )}
      </div>
    </div>
  );
}
