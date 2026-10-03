import { ON_FILL, cx } from '../components/cx';
import { CustomRules } from './CustomRules';
import { Group } from './Block';
import type { MineSlot } from './Block';
import type { CertGroup, CertStep } from './model.js';
import { copy } from '../copy.js';

// The group that holds the main personality block, where the Mine switch goes.
export function mineAnchorOf(steps: readonly CertStep[], extra: readonly CertGroup[]): string | undefined {
  const groups = [...steps.flatMap((s) => s.groups), ...extra];
  return groups.find((g) => g.blocks.some((b) => b.kind === 'personality'))?.key;
}

function StepBody({ step, mineSlot }: { step: CertStep; mineSlot?: MineSlot }) {
  if (step.groups.length === 0 && step.customRules === undefined) return null;
  return (
    <div className="flex flex-col gap-5">
      {step.groups.map((group) => (
        <Group key={group.key} group={group} mineSlot={mineSlot} />
      ))}
      {step.customRules !== undefined && <CustomRules table={step.customRules} />}
    </div>
  );
}

// The install steps in library order. Numbered steps are an ordered list; the closer has no number
// and comes after them.
export function Steps({ steps, mineSlot }: { steps: readonly CertStep[]; mineSlot?: MineSlot }) {
  const numbered = steps.filter((s) => s.n !== null);
  const closers = steps.filter((s) => s.n === null);
  return (
    <div className="flex flex-col gap-6">
      {numbered.length > 0 && (
        <ol role="list" aria-label={copy.certificate.steps} className="flex list-none flex-col gap-6 p-0">
          {numbered.map((step) => (
            <li key={step.id} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cx(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold',
                    ON_FILL,
                  )}
                >
                  {step.n}
                </span>
                <p className="min-w-0 pt-0.5 text-base leading-6 text-text [overflow-wrap:anywhere]">{step.text}</p>
              </div>
              <StepBody step={step} mineSlot={mineSlot} />
            </li>
          ))}
        </ol>
      )}
      {closers.map((step) => (
        <div key={step.id} className="flex flex-col gap-4">
          <p className="text-base font-medium leading-6 text-text [overflow-wrap:anywhere]">{step.text}</p>
          <StepBody step={step} mineSlot={mineSlot} />
        </div>
      ))}
    </div>
  );
}
