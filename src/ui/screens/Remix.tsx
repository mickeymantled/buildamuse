import { cx, FOCUS, ON_FILL } from '../components/cx';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

// Side screen between the certificate and base. Stub until slice 4.14, which replaces this file and
// moves the label into copy/remix.ts. Continue goes to base.
const CONTINUE = 'Continue';

export function Remix() {
  const next = useBuilder((s) => s.next);
  return (
    <Station
      screen="remix"
      footer={
        <button
          type="button"
          onClick={next}
          className={cx(
            'min-h-[48px] w-full rounded-xl bg-[color:var(--accent)] px-4 text-base font-semibold',
            ON_FILL,
            FOCUS,
          )}
        >
          {CONTINUE}
        </button>
      }
    >
      <p className="text-base text-[color:var(--text)]">[TODO: slice 4.14]</p>
    </Station>
  );
}
