import { useShallow } from 'zustand/react/shallow';
import { MAX_PEEVES } from '../../compiler/passes/validate.js';
import library from '../../library/index.js';
import { ChipGrid, type ChipGridItem } from '../components/ChipGrid';
import { copy } from '../copy.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

// Reading: "non-empty dedupesWith" is narrowed to a chassis id. Those peeves have no line of their own
// (assemble skips them), so "already built in" is true. options_not_answer dedupes only against a badge,
// still has its line and only drops when that badge fires, so it gets no built-in treatment.
const CHASSIS_IDS = new Set(library.chassis.lines.map((line) => line.id));
const BUILT_IN = new Set(
  library.peeves.filter((p) => p.dedupesWith?.some((id) => CHASSIS_IDS.has(id))).map((p) => p.id),
);

// Pinned under the page header so the count stays in view while the grid scrolls.
function Counter({ n }: { n: number }) {
  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 flex items-baseline justify-between gap-3 border-b border-border bg-background py-2">
      <p className="text-sm text-muted">{copy.peeves.pickUpTo(MAX_PEEVES)}</p>
      <p aria-live="polite" className="flex items-baseline gap-2 text-sm text-muted">
        <span aria-hidden="true" className="font-semibold tabular-nums text-text">
          {copy.counter(n, MAX_PEEVES)}
        </span>
        <span className="sr-only">{copy.peeves.counterLabel(n, MAX_PEEVES)}</span>
        {n >= MAX_PEEVES && <span>{copy.full}</span>}
      </p>
    </div>
  );
}

// Station 4. Skip is allowed (Station). Tapping toggles a peeve; at the cap the untapped chips dim and
// the store refuses further taps. A picked built-in peeve shows a check and "already built in" on the
// chip itself (spec), and a tap still takes it back.
export function Peeves() {
  const peeves = useBuilder(useShallow((s) => s.draft.peeves));
  const togglePeeve = useBuilder((s) => s.togglePeeve);

  const items: ChipGridItem[] = library.peeves.map((peeve) => {
    const builtIn = BUILT_IN.has(peeve.id) && peeves.includes(peeve.id);
    return builtIn
      ? { id: peeve.id, label: peeve.label, checked: true, checkedLabel: copy.alreadyBuiltIn }
      : { id: peeve.id, label: peeve.label };
  });
  const anyBuiltIn = peeves.some((id) => BUILT_IN.has(id));

  return (
    <Station screen="peeves">
      <div className="flex flex-col gap-4">
        <Counter n={peeves.length} />
        <div role="group" aria-label={copy.screens.peeves.title} className="flex flex-col gap-4">
          <ChipGrid
            groups={[{ id: 'peeves', chips: items }]}
            selected={peeves}
            onToggle={togglePeeve}
            max={MAX_PEEVES}
          />
        </div>
        <p aria-live="polite" className="text-sm text-muted">
          {anyBuiltIn ? copy.peeves.builtInNote : null}
        </p>
      </div>
    </Station>
  );
}
