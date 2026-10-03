import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { ChatgptMode, Plan, TargetCard, TargetId } from '../compiler/types.js';
import cardsData from '../library/targets.json';
import { FOCUS, GUTTER, ON_FILL, cx } from './components/cx';
import { copy } from './copy.js';
import { TargetPicker } from './screens/TargetPicker.js';

// First paint: the target cards and copy, and nothing else. The compiler, the library, the store and
// the rest of the UI sit behind one dynamic import (docs/M4-PLAN.md section 8). The static imports
// above must stay light: tools/check-bundle.ts fails the build if library text reaches this chunk.

const CARDS = cardsData as unknown as TargetCard[];

// requestIdleCallback is missing in Safari, so a timer stands in. The idle timeout keeps a busy page from starving it.
const PREFETCH_FALLBACK_MS = 1500;
const PREFETCH_IDLE_TIMEOUT_MS = 4000;

function loadApp() {
  return Promise.all([import('./App.js'), import('./store.js')]);
}

// One shared load, so the idle prefetch, a link open and the Next tap never start two.
let loading: ReturnType<typeof loadApp> | undefined;

function startLoad() {
  if (loading === undefined) {
    const attempt = loadApp();
    loading = attempt;
    // A failed load is forgotten, so Retry starts a fresh import.
    attempt.catch(() => {
      if (loading === attempt) loading = undefined;
    });
  }
  return loading;
}

// A shared link or a remix link: App's own hook reads and decodes it once App is mounted.
function opensLink(): boolean {
  const { hash, search } = window.location;
  return /(^#|&)b=/.test(hash) || new URLSearchParams(search).get('remix') === '1';
}

interface Pick {
  target: TargetId | null;
  mode?: ChatgptMode;
  plan?: Plan;
}

type Phase = 'pick' | 'loading' | 'failed' | 'ready';

// The same page column App draws, so the hand-off does not shift anything.
function Frame({ screen, children }: { screen?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-text">
      <div className="mx-auto min-h-dvh w-full max-w-[430px]" data-screen={screen}>
        {children}
      </div>
    </div>
  );
}

// Retry reloads the page. A browser keeps a failed dynamic import for the life of the page, so
// importing again would fail without a request. A link survives the reload: App clears it only after reading it.
function LoadFailed() {
  const retry = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    retry.current?.focus();
  }, []);
  return (
    <div className={cx('flex min-h-dvh flex-col items-center justify-center gap-4', GUTTER)}>
      <p role="alert" className="text-center text-base leading-6 text-[color:var(--text)]">
        {copy.load.failed}
      </p>
      <button
        ref={retry}
        type="button"
        onClick={() => window.location.reload()}
        className={cx(
          'min-h-[48px] w-full rounded-xl bg-[color:var(--accent)] px-4 text-base font-semibold',
          ON_FILL,
          FOCUS,
        )}
      >
        {copy.load.retry}
      </button>
    </div>
  );
}

export function Shell() {
  const [fromLink] = useState(opensLink);
  const [phase, setPhase] = useState<Phase>(fromLink ? 'loading' : 'pick');
  const [pick, setPick] = useState<Pick>({ target: null });
  const [app, setApp] = useState<{ App: ComponentType } | null>(null);
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // handoff: the pick to give the store before App renders. Left out for a link, which App reads itself.
  const open = useCallback((handoff?: Pick) => {
    setPhase('loading');
    startLoad().then(
      ([appModule, storeModule]) => {
        if (!alive.current) return;
        if (handoff?.target) {
          const s = storeModule.useBuilder.getState();
          s.setTarget(handoff.target, handoff.mode, handoff.plan);
          s.go('roster');
        }
        setApp({ App: appModule.App });
        setPhase('ready');
      },
      () => {
        if (alive.current) setPhase('failed');
      },
    );
  }, []);

  // A link needs the app now.
  useEffect(() => {
    if (fromLink) open();
  }, [fromLink, open]);

  // Everyone else gets the app warmed up while they read the cards.
  useEffect(() => {
    if (phase !== 'pick') return;
    const warm = () => {
      startLoad().catch(() => {});
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(warm, { timeout: PREFETCH_IDLE_TIMEOUT_MS });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(warm, PREFETCH_FALLBACK_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // Vite raises this when a chunk or its CSS fails to preload. Only a person waiting on the app sees it.
  useEffect(() => {
    const onPreloadError = () => {
      loading = undefined;
      setPhase((p) => (p === 'loading' ? 'failed' : p));
    };
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => window.removeEventListener('vite:preloadError', onPreloadError);
  }, []);

  if (phase === 'ready' && app) return <app.App />;

  if (phase === 'failed') {
    return (
      <Frame>
        <LoadFailed />
      </Frame>
    );
  }

  if (phase === 'loading') {
    return (
      <Frame>
        <div className={cx('flex min-h-dvh items-center justify-center', GUTTER)}>
          <p role="status" className="text-base leading-6 text-[color:var(--muted)]">
            {copy.load.loading}
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame screen="target">
      <TargetPicker
        cards={CARDS}
        target={pick.target}
        mode={pick.mode}
        plan={pick.plan}
        onTarget={(target) =>
          setPick({ target, mode: target === 'chatgpt' ? 'dot' : undefined, plan: undefined })
        }
        onMode={(mode) =>
          setPick((p) =>
            p.target === 'chatgpt'
              ? { ...p, mode, plan: mode === 'instructions' ? (p.plan ?? 'free') : undefined }
              : p,
          )
        }
        onPlan={(plan) =>
          setPick((p) => (p.target === 'chatgpt' && p.mode === 'instructions' ? { ...p, plan } : p))
        }
        onNext={() => open(pick)}
      />
    </Frame>
  );
}
