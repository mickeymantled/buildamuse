import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { resolve } from '../../compiler/passes/resolve.js';
import type { DriveId } from '../../compiler/types.js';
import library from '../../library/index.js';
import { Card, CardList } from '../components/Card';
import { LockIcon } from '../components/icons';
import { copy } from '../copy.js';
import { d1Options, previewBuild, useBuilder } from '../store.js';
import { Station } from './Station.js';

const HEADING = 'text-base font-semibold text-text';

const DRIVES = new Map(library.heart.drives.map((d) => [d.id, d]));
const D2_DRIVES = library.heart.drives.filter((d) => d.slot === 'd2');

interface DriveCardProps {
  id: DriveId;
  selected: boolean;
  onPick: (id: DriveId) => void;
}

// One drive line as a radio card. A drive a chip offers carries that chip's label so the line has context.
// Tapping the selected card does nothing, so confirming d2 never marks it as swapped.
function DriveCard({ id, selected, onPick }: DriveCardProps) {
  const drive = DRIVES.get(id);
  if (!drive) return null;
  const chip = drive.chip === undefined ? undefined : library.chips.find((c) => c.id === drive.chip);
  return (
    <Card
      title={drive.line}
      badge={chip?.label}
      badgeTone="muted"
      selected={selected}
      onSelect={() => {
        if (!selected) onPick(id);
      }}
    />
  );
}

// Station 5. One question, then the drives it picks: d1 (the hard part's, or a chip's), d2 (follows blunt
// until swapped) and d3 (locked). Before an answer, Next continues on the defaults (QUESTIONS U3). Skip is
// allowed (Station).
export function Heart() {
  const heart = useBuilder(useShallow((s) => s.draft.heart));
  const chips = useBuilder(useShallow((s) => s.draft.chips));
  const preview = useBuilder(previewBuild);
  const setHardPart = useBuilder((s) => s.setHardPart);
  const setD1 = useBuilder((s) => s.setD1);
  const setD2 = useBuilder((s) => s.setD2);

  const d1Ids = useMemo(() => (heart ? d1Options(heart, chips) : []), [heart, chips]);
  // The d3 the compiler will use for the build as it stands, which earlier stations can change.
  const d3 = useMemo(() => (heart ? resolve(preview, library).d3 : undefined), [heart, preview]);

  const own = d1Ids.filter((id) => DRIVES.get(id)?.chip === undefined);
  const alternates = d1Ids.filter((id) => DRIVES.get(id)?.chip !== undefined);

  return (
    <Station screen="heart">
      <section className="flex flex-col gap-2">
        <h2 className={HEADING}>{copy.heart.question}</h2>
        <CardList label={copy.heart.question}>
          {library.heart.hardParts.map((part) => {
            const selected = part.id === heart?.hardPart;
            return (
              <Card
                key={part.id}
                title={part.label}
                selected={selected}
                // Tapping the picked answer again must not reset the drives the user chose.
                onSelect={() => {
                  if (!selected) setHardPart(part.id);
                }}
              />
            );
          })}
        </CardList>
      </section>

      {heart && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className={HEADING}>{copy.heart.d1}</h2>
            <CardList label={copy.heart.d1}>
              {own.map((id) => (
                <DriveCard key={id} id={id} selected={id === heart.d1} onPick={setD1} />
              ))}
              {alternates.length > 0 && (
                <p className="pt-2 text-sm font-semibold text-muted">{copy.heart.d1Alternate}</p>
              )}
              {alternates.map((id) => (
                <DriveCard key={id} id={id} selected={id === heart.d1} onPick={setD1} />
              ))}
            </CardList>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className={HEADING}>{copy.heart.d2}</h2>
            <CardList label={copy.heart.d2}>
              {D2_DRIVES.map((drive) => (
                <DriveCard key={drive.id} id={drive.id} selected={drive.id === heart.d2} onPick={setD2} />
              ))}
            </CardList>
          </section>

          {d3 && (
            <section className="flex flex-col gap-2">
              <h2 className={HEADING}>{copy.heart.d3}</h2>
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
                <p className="text-base font-semibold leading-6 text-text">{d3.line}</p>
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <LockIcon className="h-4 w-4 shrink-0" />
                  <span>{copy.heart.d3Locked}</span>
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </Station>
  );
}
