import { useShallow } from 'zustand/react/shallow';
import { MAX_CHIPS } from '../../compiler/passes/validate.js';
import type { BaseId, ChipGroup } from '../../compiler/types.js';
import library from '../../library/index.js';
import { ChipGrid, type ChipGridItem } from '../components/ChipGrid';
import { copy } from '../copy.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

const GROUP_ORDER: readonly ChipGroup[] = ['Work', 'Markets', 'Life', 'Time'];

// Until a base is picked the preview reads as chaos (QUESTIONS U2).
const PREVIEW_BASE: BaseId = 'chaos';

const CHIPS_BY_GROUP: Record<ChipGroup, ChipGridItem[]> = { Work: [], Markets: [], Life: [], Time: [] };
for (const chip of library.chips) CHIPS_BY_GROUP[chip.group].push({ id: chip.id, label: chip.label });

// The base's chipsFirst group leads, the rest follow in the fixed order.
function groupOrder(base: BaseId | undefined): ChipGroup[] {
  const first = library.bases.find((b) => b.id === (base ?? PREVIEW_BASE))?.chipsFirst;
  return first ? [first, ...GROUP_ORDER.filter((g) => g !== first)] : [...GROUP_ORDER];
}

// Pinned under the page header so the count stays in view while the grid scrolls.
function Counter({ n }: { n: number }) {
  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 flex items-baseline justify-between gap-3 border-b border-border bg-background py-2">
      <p className="text-sm text-muted">{copy.world.pickUpTo(MAX_CHIPS)}</p>
      <p aria-live="polite" className="flex items-baseline gap-2 text-sm text-muted">
        <span aria-hidden="true" className="font-semibold tabular-nums text-text">
          {copy.counter(n, MAX_CHIPS)}
        </span>
        <span className="sr-only">{copy.world.counterLabel(n, MAX_CHIPS)}</span>
        {n >= MAX_CHIPS && <span>{copy.full}</span>}
      </p>
    </div>
  );
}

// Station 2. Skip is allowed (Station). Tapping toggles a chip; at the cap the untapped chips dim and
// the store refuses further taps.
export function World() {
  const base = useBuilder((s) => s.draft.base);
  const chips = useBuilder(useShallow((s) => s.draft.chips));
  const toggleChip = useBuilder((s) => s.toggleChip);

  return (
    <Station screen="world">
      <div className="flex flex-col gap-4">
        <Counter n={chips.length} />
        {groupOrder(base).map((group) => (
          <div key={group} className="flex flex-col gap-2">
            <ChipGrid
              groups={[{ id: group, heading: copy.groups[group], chips: CHIPS_BY_GROUP[group] }]}
              selected={chips}
              onToggle={toggleChip}
              max={MAX_CHIPS}
            />
            {group === 'Markets' && <p className="text-sm text-muted">{copy.stats.riskHint}</p>}
          </div>
        ))}
      </div>
    </Station>
  );
}
