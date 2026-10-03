import type { StatId } from '../../compiler/types.js';
import { Pill } from '../components/Pill';
import { Radar } from '../components/Radar';
import type { RadarAxis } from '../components/Radar';
import { copy } from '../copy.js';
import type { CertModel } from './model.js';

const STAT_ORDER: readonly StatId[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive', 'risk'];

// The build name, the tagline when there is one, the stats as a radar, and the badges.
// The "Meet <Name>" heading is the Screen's title.
export function Header({ header }: { header: CertModel['header'] }) {
  const axes: RadarAxis[] = STAT_ORDER.flatMap((id) => {
    const level = header.stats[id];
    return level === undefined ? [] : [{ id, label: copy.stats.labels[id], level }];
  });
  const r = copy.certificate.radar;
  const radarLabel = r.label(axes.map((a) => r.item(a.label, a.level)).join(', '));
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold leading-6 text-text [overflow-wrap:anywhere]">{header.buildName}</p>
        {header.tagline !== undefined && (
          <p className="text-base italic leading-6 text-muted [overflow-wrap:anywhere]">{header.tagline}</p>
        )}
      </div>
      <Radar axes={axes} label={radarLabel} className="mx-auto" />
      {header.badges.length > 0 && (
        <ul role="list" aria-label={copy.stats.badgesHeading} className="flex list-none flex-wrap gap-2 p-0">
          {header.badges.map((badge) => (
            <li key={badge.id}>
              <Pill>{badge.name}</Pill>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
