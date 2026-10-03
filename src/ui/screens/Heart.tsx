import { copy } from '../copy.js';
import { Station } from './Station.js';

export function Heart() {
  return (
    <Station screen="heart">
      <p className="rounded-2xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
        {copy.todo('3.13')}
      </p>
    </Station>
  );
}
