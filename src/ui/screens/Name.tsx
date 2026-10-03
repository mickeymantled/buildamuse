import { FOCUS, cx } from '../components/cx';
import { copy } from '../copy.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

// Stub for slice 3.15. Next needs a valid name, so the stub offers one placeholder pick to keep the flow running.
export function Name() {
  const setName = useBuilder((s) => s.setName);
  return (
    <Station screen="name">
      <p className="rounded-2xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
        {copy.todo('3.15')}
      </p>
      <button
        type="button"
        onClick={() => setName(copy.defaultName)}
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
