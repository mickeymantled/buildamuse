import { useId } from 'react';
import type { StatId, Stats } from '../../compiler/types.js';
import library from '../../library/index.js';
import { CardList } from '../components/Card';
import { Pill } from '../components/Pill';
import { FOCUS, ON_FILL, cx } from '../components/cx';
import { copy } from '../copy.js';
import { compiledStarter, isCompileError, useBuilder } from '../store.js';
import { Station } from './Station.js';

// Ties between equal levels break in this order.
const STAT_ORDER: readonly StatId[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive', 'risk'];
const LEVELS = [1, 2, 3, 4] as const;

interface StatBar {
  id: StatId;
  level: number;
}

// The two highest stats. Risk is skipped when the starter has none.
function topTwo(stats: Stats): StatBar[] {
  const present: Array<StatBar & { at: number }> = [];
  STAT_ORDER.forEach((id, at) => {
    const level = stats[id];
    if (level !== undefined) present.push({ id, level, at });
  });
  return present
    .sort((a, b) => b.level - a.level || a.at - b.at)
    .slice(0, 2)
    .map(({ id, level }) => ({ id, level }));
}

// One stat as four segments. The row is a meter, so a screen reader hears "Blunt, Level 4 of 4".
function LevelBar({ id, level }: StatBar) {
  return (
    <div
      role="meter"
      aria-label={copy.stats.labels[id]}
      aria-valuemin={1}
      aria-valuemax={4}
      aria-valuenow={level}
      aria-valuetext={copy.stats.level(level)}
      className="flex items-center gap-3"
    >
      <span aria-hidden="true" className="w-20 shrink-0 text-sm font-medium text-text">
        {copy.stats.labels[id]}
      </span>
      <span aria-hidden="true" className="flex flex-1 gap-1">
        {LEVELS.map((n) => (
          <span
            key={n}
            className={cx('h-2 flex-1 rounded-full', n <= level ? 'bg-accent' : 'bg-border')}
          />
        ))}
      </span>
    </div>
  );
}

interface StarterCardProps {
  name: string;
  buildName: string;
  tagline: string;
  stats: Stats;
  badges: string[];
  sampleHey: string | undefined;
  onUse: () => void;
  onRemix: () => void;
}

// A card holds two buttons, so it is a plain article and not a selectable Card.
function StarterCard({
  name,
  buildName,
  tagline,
  stats,
  badges,
  sampleHey,
  onUse,
  onRemix,
}: StarterCardProps) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="text-lg font-bold leading-6 text-text">
          {name}
        </h2>
        <p className="text-sm font-medium leading-5 text-muted">{buildName}</p>
      </div>
      <p className="text-sm leading-5 text-text">{tagline}</p>
      <div className="flex flex-col gap-2">
        {topTwo(stats).map((bar) => (
          <LevelBar key={bar.id} {...bar} />
        ))}
      </div>
      {badges.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <li key={badge}>
              <Pill>{badge}</Pill>
            </li>
          ))}
        </ul>
      )}
      {sampleHey && (
        <p className="border-l-2 border-accent pl-3 text-sm italic leading-5 text-text">{sampleHey}</p>
      )}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          aria-label={`${copy.buttons.use} ${name}`}
          onClick={onUse}
          className={cx(
            'min-h-[44px] rounded-xl bg-accent px-3 text-sm font-semibold',
            ON_FILL,
            FOCUS,
          )}
        >
          {copy.buttons.use}
        </button>
        <button
          type="button"
          aria-label={`${copy.buttons.remix} ${name}`}
          onClick={onRemix}
          className={cx(
            'min-h-[44px] rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text',
            FOCUS,
          )}
        >
          {copy.buttons.remix}
        </button>
      </div>
    </article>
  );
}

// Station 0, second screen. Two doors: a starter from the row (Use goes to the certificate, Remix to
// base with the build loaded), or Build your own. No Next, and no remix warning (QUESTIONS U8).
export function Roster() {
  const target = useBuilder((s) => s.target);
  const mode = useBuilder((s) => s.mode);
  const plan = useBuilder((s) => s.plan);
  const useAsIs = useBuilder((s) => s.useStarter);
  const remixFrom = useBuilder((s) => s.remixStarter);
  const startBlank = useBuilder((s) => s.startBlank);

  return (
    <Station screen="roster" hideNext>
      <CardList label={copy.buttons.pickStarter} role="group" layout="row">
        {library.roster.map((entry) => {
          const { build } = entry;
          // Badges follow the chosen target, so they come from a compile on it.
          const result = compiledStarter({ s: { target, mode, plan }, id: entry.id });
          const badgeIds = result && !isCompileError(result) ? result.badges : [];
          const badges = badgeIds.flatMap((id) => {
            const badge = library.badges.find((b) => b.id === id);
            return badge ? [badge.name] : [];
          });
          return (
            <StarterCard
              key={entry.id}
              name={build.name}
              buildName={entry.buildName}
              tagline={entry.tagline}
              stats={build.stats}
              badges={badges}
              sampleHey={library.outfits.find((o) => o.id === build.outfit)?.sampleHey}
              onUse={() => useAsIs(entry.id)}
              onRemix={() => remixFrom(entry.id)}
            />
          );
        })}
      </CardList>
      <button
        type="button"
        onClick={startBlank}
        className={cx(
          'min-h-[48px] w-full rounded-xl border border-border bg-surface px-4 text-base font-semibold text-text',
          FOCUS,
        )}
      >
        {copy.buttons.buildYourOwn}
      </button>
    </Station>
  );
}
