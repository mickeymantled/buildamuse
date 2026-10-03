import { useShallow } from 'zustand/react/shallow';
import library from '../../library/index.js';
import { Stepper } from '../components/Stepper';
import { copy } from '../copy.js';
import { exposedLimits } from '../flow.js';
import { effectiveLimitsOf, profileOf, useBuilder } from '../store.js';
import { Station } from './Station.js';

// Number steppers for the limit chips the picked packs expose, never a text field. Skip is allowed,
// and a skipped screen keeps the pack defaults. Venue notes for the delivery profile sit under them.
export function Limits() {
  const ids = useBuilder(useShallow((s) => exposedLimits(s.draft.packs)));
  const packIds = useBuilder(useShallow((s) => s.draft.packs));
  const values = useBuilder(effectiveLimitsOf);
  const profileId = useBuilder((s) => profileOf(s).id);
  const setLimit = useBuilder((s) => s.setLimit);

  const rows = ids
    .map((id) => library.limits.find((l) => l.id === id))
    .filter((l) => l !== undefined);

  const notes = packIds.flatMap((id) => {
    const pack = library.packs.find((p) => p.id === id);
    const note = pack?.venueNotes?.[profileId];
    return pack && note ? [{ id: note.id, label: pack.label, line: note.line }] : [];
  });

  return (
    <Station screen="limits">
      {rows.length === 0 && <p className="text-sm text-muted">{copy.limits.none}</p>}
      {rows.length > 0 && profileId === 'chatgpt-dot' && (
        <p className="text-sm text-muted">{copy.limits.dotNote}</p>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((limit) => (
            <Stepper
              key={limit.id}
              label={limit.label}
              description={limit.unit}
              value={values[limit.id] ?? limit.min}
              min={limit.min}
              max={limit.max}
              step={limit.step}
              onChange={(v) => setLimit(limit.id, v)}
              decrementLabel={copy.limits.lower(limit.label)}
              incrementLabel={copy.limits.raise(limit.label)}
            />
          ))}
        </div>
      )}

      {notes.map((n) => (
        <aside
          key={n.id}
          className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4 text-sm text-muted"
        >
          <span className="font-semibold text-text">{n.label}</span>
          <span>{n.line}</span>
        </aside>
      ))}
    </Station>
  );
}
