import { useShallow } from 'zustand/react/shallow';
import { STAT_CAP } from '../../compiler/passes/validate.js';
import type { BadgeId, Level, StatId } from '../../compiler/types.js';
import library from '../../library/index.js';
import { Pill } from '../components/Pill';
import { Slider } from '../components/Slider';
import { cx } from '../components/cx';
import { copy } from '../copy.js';
import { compiled, isCompileError, statTotal, statsOf, useBuilder } from '../store.js';
import { Station } from './Station.js';

// Risk comes last, and only when the stats have it.
const STAT_ORDER: readonly StatId[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive', 'risk'];
const LEVELS: readonly Level[] = [1, 2, 3, 4];

// The floor line shows under the two stats that never go below 1 for a reason the user should hear.
const FLOORED: ReadonlySet<StatId> = new Set<StatId>(['blunt', 'warm']);

function recordOf(stat: StatId, level: Level) {
  return library.stats.find((r) => r.stat === stat && r.level === level);
}

// One name per level: the library's own (risk has them), else the shared Low to Max scale.
const STOPS: Record<StatId, string[]> = Object.fromEntries(
  STAT_ORDER.map((stat) => [stat, LEVELS.map((l) => recordOf(stat, l)?.label ?? copy.stats.stops[l - 1])]),
) as Record<StatId, string[]>;

const BADGE_NAMES = new Map<BadgeId, string>(library.badges.map((b) => [b.id, b.name]));

// Pinned under the page header so the budget stays in view while the sliders scroll.
function Counter({ total }: { total: number }) {
  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 flex items-baseline justify-between gap-3 border-b border-border bg-background py-2">
      <p className="text-sm text-muted">{copy.stats.budget}</p>
      <p aria-live="polite" className="flex items-baseline gap-2 text-sm text-muted">
        <span aria-hidden="true" className="font-semibold tabular-nums text-text">
          {copy.counter(total, STAT_CAP)}
        </span>
        <span className="sr-only">{copy.stats.counterLabel(total, STAT_CAP)}</span>
        {total >= STAT_CAP && <span>{copy.full}</span>}
      </p>
    </div>
  );
}

// The badges the current build has lit. The one that just lit is highlighted.
function BadgeStrip({ ids, latest }: { ids: readonly BadgeId[]; latest: BadgeId | null }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-text">{copy.stats.badgesHeading}</h2>
      <ul aria-live="polite" className="flex flex-wrap gap-2">
        {ids.length === 0 && <li className="text-sm text-muted">{copy.stats.noBadges}</li>}
        {ids.map((id) => {
          const isNew = id === latest;
          return (
            <li key={id}>
              <Pill tone={isNew ? 'accent' : 'muted'} className={cx(isNew && 'ring-2 ring-accent')}>
                {isNew && <span className="sr-only">{copy.stats.badgeNew}: </span>}
                {BADGE_NAMES.get(id) ?? id}
              </Pill>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Station 3. Skip is allowed (Station). Six scoop sliders on a budget of STAT_CAP. Blunt and warm stop
// at 1. At the cap the sliders can't go up, and the store refuses it anyway; moves down stay allowed.
export function Stats() {
  const stats = useBuilder(useShallow((s) => statsOf(s.draft)));
  const result = useBuilder(compiled);
  const latest = useBuilder((s) => s.lastBadge);
  const setStat = useBuilder((s) => s.setStat);

  const total = statTotal(stats);
  const room = STAT_CAP - total;
  const badges = isCompileError(result) ? [] : result.badges;

  return (
    <Station screen="stats">
      <div className="flex flex-col gap-4">
        <Counter total={total} />
        <BadgeStrip ids={badges} latest={latest} />
        {STAT_ORDER.map((stat) => {
          const level = stats[stat];
          if (level === undefined) {
            return stat === 'risk' ? (
              <p key={stat} className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
                {copy.stats.riskHint}
              </p>
            ) : null;
          }
          return (
            <Slider
              key={stat}
              label={copy.stats.labels[stat]}
              stops={STOPS[stat]}
              value={level}
              onChange={(l) => setStat(stat, l as Level)}
              sample={recordOf(stat, level)?.sample}
              sampleLabel={copy.stats.sampleLabel}
              maxLevel={Math.min(4, level + room)}
              floorMessage={FLOORED.has(stat) ? copy.floorLine : undefined}
            />
          );
        })}
      </div>
    </Station>
  );
}
