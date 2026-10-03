import { Actions } from '../certificate/Actions';
import { Group } from '../certificate/Block';
import type { MineSlot } from '../certificate/Block';
import { Header } from '../certificate/Header';
import { MineSwitch } from '../certificate/MineSwitch';
import { Details, Notes, Skipped, StillChecking } from '../certificate/Notes';
import { Steps, mineAnchorOf } from '../certificate/Steps';
import { Summary } from '../certificate/Summary';
import { certificateInput, certificateModelOf } from '../certificate/input.js';
import { Meter } from '../components/Meter';
import { Screen } from '../components/Screen';
import { copy } from '../copy.js';
import { canGoBack } from '../flow.js';
import { useBuilder } from '../store.js';

// Station 8. The compiled bundle as a page: a summary, the install steps with a copy block under
// each, then notes, what is still being checked, and the footer. The shape comes from the pure
// certificate model; this file only lays it out.
export function Certificate() {
  const model = useBuilder(certificateModelOf);
  const input = useBuilder(certificateInput);
  const showBack = useBuilder((s) => canGoBack(s));
  const back = useBuilder((s) => s.back);
  const setPlan = useBuilder((s) => s.setPlan);
  const setMineOn = useBuilder((s) => s.setMineOn);

  // A link certificate has nothing behind it, so Back is hidden there.
  const backButton = showBack ? { label: copy.buttons.back, onClick: back } : undefined;

  if ('error' in model || 'error' in input) {
    return (
      <Screen title={copy.screens.certificate.title} back={backButton}>
        <p role="alert" className="text-base text-text">
          {copy.certificate.error}
        </p>
      </Screen>
    );
  }

  // The Mine switch shows whenever the paste holds lines the build lacks, on or off, so it can be
  // turned back on. It sits after the personality block, where the Mine block goes.
  const hasMine = input.mine.lines.length > 0;
  const anchor = hasMine ? mineAnchorOf(model.steps, model.extra) : undefined;
  const mineNode = hasMine ? <MineSwitch mine={input.mine} onChange={setMineOn} /> : null;
  const mineSlot: MineSlot | undefined = anchor === undefined ? undefined : { groupKey: anchor, node: mineNode };

  return (
    <Screen title={copy.certificate.title(model.header.name)} back={backButton}>
      <div className="flex flex-col gap-8">
        <Header header={model.header} />
        <Summary items={model.summary} onSwitchToPaid={() => setPlan('paid')} />
        <Steps steps={model.steps} mineSlot={mineSlot} />
        {hasMine && anchor === undefined && mineNode}
        {model.extra.length > 0 && (
          <section className="flex flex-col gap-5">
            <h2 className="text-lg font-semibold leading-6 text-text">{copy.certificate.sections.extra}</h2>
            {model.extra.map((group) => (
              <Group key={group.key} group={group} mineSlot={mineSlot} />
            ))}
          </section>
        )}
        {model.leftOut !== undefined && (
          <Group group={model.leftOut} hint={copy.certificate.sections.leftOutHint} />
        )}
        <Notes notes={model.notes} />
        <StillChecking items={model.stillChecking} docs={model.docs} />
        <Skipped lines={model.skipped} />
        <Details lines={model.details} />
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <Meter
            label={copy.preview.title}
            value={model.meter.length}
            cap={model.meter.cap}
            valueLabel={model.meter.label}
            overLabel={copy.preview.over(model.meter.length - model.meter.cap)}
          />
          <Actions />
        </div>
      </div>
    </Screen>
  );
}
