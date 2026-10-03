import { useShallow } from 'zustand/react/shallow';
import library from '../../library/index.js';
import { FOCUS, ON_FILL, cx } from '../components/cx';
import { Toggle3 } from '../components/Toggle3';
import { copy } from '../copy.js';
import { gateRows } from '../flow.js';
import { capOf, compiled, effectiveGatesOf, isCompileError, profileOf, useBuilder } from '../store.js';
import { Station } from './Station.js';

// One three-state toggle per action the picked packs expose, with pay in its registry place, locked at
// forbid. The values are the pack defaults until the user sets one. Skip is allowed (Station).
export function Gates() {
  const rows = useBuilder(useShallow((s) => gateRows(s.draft.packs)));
  const values = useBuilder(useShallow(effectiveGatesOf));
  const profile = useBuilder((s) => profileOf(s));
  const plan = useBuilder((s) => s.plan);
  const overCap = useBuilder((s) => {
    const result = compiled(s);
    return !isCompileError(result) && result.length > capOf(s);
  });
  const setGate = useBuilder((s) => s.setGate);
  const setPlan = useBuilder((s) => s.setPlan);

  // Gate-heavy builds on the free Custom instructions box steer to Paid (B1).
  const steer = profile.id === 'chatgpt-instructions' && (plan ?? 'free') === 'free' && overCap;
  // ChatGPT dot names the three settings as Custom Rule settings, in the library.
  const labels = profile.customRuleSettings ?? copy.gates.settings;

  if (rows.length === 0) {
    return (
      <Station screen="gates">
        <p className="text-sm text-muted">{copy.gates.none}</p>
      </Station>
    );
  }

  return (
    <Station screen="gates">
      <p className="text-base text-text first-letter:uppercase">{copy.gatesCopy[profile.id]}</p>

      {profile.id === 'chatgpt-dot' &&
        profile.notes?.map((note) => (
          <aside
            key={note.id}
            className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted"
          >
            {note.line}
          </aside>
        ))}

      {steer && (
        <aside
          role="status"
          className="flex flex-col items-start gap-3 rounded-2xl border border-accent bg-surface p-4"
        >
          <p className="text-sm text-text">{copy.target.paidSteer}</p>
          <button
            type="button"
            onClick={() => setPlan('paid')}
            className={cx('min-h-[44px] rounded-xl bg-accent px-4 text-sm font-semibold', ON_FILL, FOCUS)}
          >
            {copy.gates.switchToPaid}
          </button>
        </aside>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((id) => {
          const gate = library.gates.find((g) => g.id === id);
          if (!gate) return null;
          const locked = id === 'pay';
          const value = values[id] ?? 'forbid';
          return (
            <Toggle3
              key={id}
              label={gate.label}
              description={copy.gates.hints[value]}
              value={value}
              onChange={(setting) => setGate(id, setting)}
              labels={labels}
              locked={locked}
              lockedMessage={locked ? copy.gates.payLocked : undefined}
            />
          );
        })}
      </div>
    </Station>
  );
}
