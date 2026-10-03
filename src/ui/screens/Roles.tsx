import { useShallow } from 'zustand/react/shallow';
import library from '../../library/index.js';
import { Card, CardList } from '../components/Card';
import { LockIcon } from '../components/icons';
import { copy } from '../copy.js';
import { roleSetsFor } from '../flow.js';
import { roleSetOf, useBuilder } from '../store.js';
import { Station } from './Station.js';

// After Outfit, only with the advanced toggle on. One section per role set the picked packs fit,
// each member a toggle card in library order. The coordinator is locked on. Tapping a member of
// another set switches sets (the store does it). Skip is allowed (Station).
export function Roles() {
  const packIds = useBuilder(useShallow((s) => s.draft.packs));
  const chosen = useBuilder(useShallow((s) => s.draft.roles));
  const advanced = useBuilder((s) => s.advancedRoles);
  const toggleRole = useBuilder((s) => s.toggleRole);

  const sets = roleSetsFor(packIds);

  if (chosen === undefined || sets.length === 0) {
    return (
      <Station screen="roles">
        <p className="text-sm text-muted">{advanced ? copy.roles.none : copy.roles.off}</p>
      </Station>
    );
  }

  const activeSet = roleSetOf(chosen);

  return (
    <Station screen="roles">
      {sets.map((set) => {
        const active = activeSet?.id === set.id;
        return (
          <section key={set.id} className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-text">{set.label}</h2>
            <CardList label={set.label} role="group">
              {set.members.map((id) => {
                const role = library.roles.find((r) => r.id === id);
                if (!role) return null;
                const on = chosen.includes(id);
                if (id === set.coordinator) {
                  // Not tappable. Locked on in the live set, waiting in the others.
                  return (
                    <Card
                      key={id}
                      mode="toggle"
                      title={role.label}
                      description={role.mission.line}
                      badge={active ? copy.roles.coordinator : copy.roles.coordinatorIdle}
                      badgeTone={active ? 'accent' : 'muted'}
                      icon={<LockIcon className="h-4 w-4 text-muted" />}
                      selected={on}
                      disabled
                      onSelect={() => undefined}
                      className="disabled:opacity-100"
                    />
                  );
                }
                return (
                  <Card
                    key={id}
                    mode="toggle"
                    title={role.label}
                    description={role.mission.line}
                    selected={on}
                    onSelect={() => toggleRole(id)}
                  />
                );
              })}
            </CardList>
          </section>
        );
      })}
    </Station>
  );
}
