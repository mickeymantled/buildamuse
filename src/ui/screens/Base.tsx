import library from '../../library/index.js';
import { Card, CardList } from '../components/Card';
import { copy } from '../copy.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

// Station 1. Required, no Skip. Tapping a base resets the stats to its defaults.
export function Base() {
  const base = useBuilder((s) => s.draft.base);
  const setBase = useBuilder((s) => s.setBase);

  return (
    <Station screen="base" hint={copy.base.required}>
      <CardList label={copy.screens.base.title}>
        {library.bases.map((b) => (
          <Card
            key={b.id}
            title={b.label}
            selected={b.id === base}
            // Tapping the picked base again must not reset a remixed starter's stats.
            onSelect={() => {
              if (b.id !== base) setBase(b.id);
            }}
          />
        ))}
      </CardList>
    </Station>
  );
}
