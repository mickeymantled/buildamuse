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

// A dismissed share sheet is not a failure.
function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

// The certificate footer: Copy link, Share, Download zip, Remix and "Make this for <target> instead".
// It reads the store itself, so the certificate passes it nothing. The link is built from the build
// alone: the Mine lines and the pasted text never enter it.
export function Actions() {
  const model = useBuilder(certificateModelOf);
  const build = useBuilder(previewBuild);
  const target = useBuilder((s) => s.target);
  const mode = useBuilder((s) => s.mode);
  const switchTarget = useBuilder((s) => s.switchTarget);
  const startRemix = useBuilder((s) => s.startRemix);
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

  const link = useMemo(
    () => shareUrl(window.location.origin, window.location.pathname, build),
    [build],
  );

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
        <CopyButton
          text={link}
          label={copy.actions.copyLink}
          copiedLabel={copy.actions.linkCopied}
          failedLabel={copy.actions.linkFailed}
          variant="primary"
          className="grow"
        />
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
      </div>
    </div>
  );
}
