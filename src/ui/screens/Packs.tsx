import { useShallow } from 'zustand/react/shallow';
import { MAX_PACKS } from '../../compiler/passes/validate.js';
import library from '../../library/index.js';
import { Card, CardList } from '../components/Card';
import { FOCUS, cx } from '../components/cx';
import { copy } from '../copy.js';
import { availablePacks, profileOf, roleSetsFor } from '../flow.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

// After World. The packs this target can deliver, as toggle cards in library order. They start from
// the chips and follow them until the user taps one (the store handles that). At the cap the other
// cards dim, and their tap is refused by the store. Skip is allowed, and so is picking none.
// A picked pack this target can't deliver (a chip brought it, or the target changed) is listed too,
// with a note, so it can be unticked. An unpicked one stays hidden.
// At the bottom, the advanced roles switch, only for a target that supports roles and packs that have a team.
export function Packs() {
  const deliverable = useBuilder(useShallow((s) => availablePacks(profileOf(s))));
  const chosen = useBuilder(useShallow((s) => s.draft.packs));
  const packs = library.packs.filter((p) => deliverable.includes(p) || chosen.includes(p.id));
  const togglePack = useBuilder((s) => s.togglePack);
  // Shown while a pack has a team, and kept while on so it can always be turned off (U11).
  const showRoles = useBuilder(
    (s) => profileOf(s).supportsRoles && (s.advancedRoles || roleSetsFor(s.draft.packs).length > 0),
  );
  const advancedRoles = useBuilder((s) => s.advancedRoles);
  const setAdvancedRoles = useBuilder((s) => s.setAdvancedRoles);

  const full = chosen.length >= MAX_PACKS;

  return (
    <Station screen="packs">
      <div className="flex items-baseline justify-between gap-3">
        {chosen.length === 0 && <p className="min-w-0 flex-1 text-sm text-muted">{copy.packs.none}</p>}
        <p className="ml-auto flex items-baseline gap-2 text-sm text-muted" aria-live="polite">
          <span aria-hidden="true" className="font-semibold tabular-nums text-text">
            {copy.counter(chosen.length, MAX_PACKS)}
          </span>
          <span className="sr-only">{copy.packs.counterLabel(chosen.length, MAX_PACKS)}</span>
          {full && <span>{copy.full}</span>}
        </p>
      </div>

      <CardList label={copy.screens.packs.title} role="group">
        {packs.map((pack) => {
          const on = chosen.includes(pack.id);
          const carried = deliverable.includes(pack);
          return (
            <Card
              key={pack.id}
              mode="toggle"
              title={pack.label}
              description={pack.skills.map((skill) => skill.name).join(', ')}
              badge={carried ? undefined : copy.packs.notCarried}
              badgeTone="muted"
              selected={on}
              onSelect={() => togglePack(pack.id)}
              className={full && !on ? 'opacity-60' : undefined}
            />
          );
        })}
      </CardList>

      {showRoles && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
          <button
            type="button"
            role="switch"
            aria-checked={advancedRoles}
            aria-describedby="roles-toggle-hint"
            onClick={() => setAdvancedRoles(!advancedRoles)}
            className={cx('flex min-h-[44px] w-full items-center justify-between gap-3 text-left', FOCUS)}
          >
            <span className="text-base font-semibold text-text">{copy.roles.toggle}</span>
            <span
              aria-hidden="true"
              className={cx(
                'flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 motion-safe:transition-colors',
                advancedRoles ? 'border-accent bg-accent' : 'border-border bg-background',
              )}
            >
              <span
                className={cx(
                  'h-5 w-5 rounded-full motion-safe:transition-transform',
                  advancedRoles ? 'translate-x-5 bg-[color:var(--on-accent,var(--bg))]' : 'bg-muted',
                )}
              />
            </span>
          </button>
          <p id="roles-toggle-hint" className="text-sm text-muted">
            {copy.roles.toggleHint}
          </p>
        </div>
      )}
    </Station>
  );
}
