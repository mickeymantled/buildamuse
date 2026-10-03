import { copy } from '../copy.js';
import { Station } from './Station.js';

export function World() {
  return (
    <Station screen="world">
      <p className="rounded-2xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
        {copy.todo('3.7')}
      </p>
    </Station>
  );
}
