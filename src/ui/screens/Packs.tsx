import { useShallow } from 'zustand/react/shallow';
import { MAX_PACKS } from '../../compiler/passes/validate.js';
import { Card, CardList } from '../components/Card';
import { copy } from '../copy.js';
import { availablePacks, profileOf } from '../flow.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

// After World. The packs this target can deliver, as toggle cards in library order. They start from
// the chips and follow them until the user taps one (the store handles that). At the cap the other
// cards dim, and their tap is refused by the store. Skip is allowed, and so is picking none.
export function Packs() {
  const packs = useBuilder(useShallow((s) => availablePacks(profileOf(s))));
  const chosen = useBuilder(useShallow((s) => s.draft.packs));
  const togglePack = useBuilder((s) => s.togglePack);

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
          return (
            <Card
              key={pack.id}
              mode="toggle"
              title={pack.label}
              description={pack.skills.map((skill) => skill.name).join(', ')}
              selected={on}
              onSelect={() => togglePack(pack.id)}
              className={full && !on ? 'opacity-60' : undefined}
            />
          );
        })}
      </CardList>
    </Station>
  );
}
