import library from '../../library/index.js';
import { FOCUS, cx } from '../components/cx';
import { copy } from '../copy.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

// Stub for slice 3.6. Next needs a base, so the stub offers one placeholder pick to keep the flow running.
export function Base() {
  const setBase = useBuilder((s) => s.setBase);
  return (
    <Station screen="base">
      <p className="rounded-2xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
        {copy.todo('3.6')}
      </p>
      <button
        type="button"
        onClick={() => setBase(library.bases[0].id)}
        className={cx(
          'min-h-[44px] rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text',
          FOCUS,
        )}
      >
        {copy.stub.fill}
      </button>
    </Station>
  );
}
