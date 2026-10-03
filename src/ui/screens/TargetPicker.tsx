import type { ChatgptMode, Plan, TargetCard, TargetId } from '../../compiler/types.js';
import { Card, CardList } from '../components/Card';
import { Screen } from '../components/Screen';
import { copy } from '../copy.js';

const PLANS: readonly Plan[] = ['free', 'paid'];

const LEGEND = 'text-sm font-semibold text-text';

export interface TargetPickerProps {
  /** The five target cards, in picker order. */
  cards: readonly TargetCard[];
  target: TargetId | null;
  mode: ChatgptMode | undefined;
  plan: Plan | undefined;
  onTarget: (target: TargetId) => void;
  onMode: (mode: ChatgptMode) => void;
  onPlan: (plan: Plan) => void;
  onNext: () => void;
}

// Station 0, as a pure view: props in, taps out, no store. It renders inside Screen directly so the
// first paint (the shell) never loads Station and everything Station reaches. Required, no Skip.
// ChatGPT opens a mode picker, and Custom instructions opens a plan picker.
export function TargetPicker({ cards, target, mode, plan, onTarget, onMode, onPlan, onNext }: TargetPickerProps) {
  const picked = cards.find((t) => t.id === target);
  // Hidden modes (Custom GPT) stay in the compiler and out of the picker.
  const modes = picked?.modes?.filter((m) => !m.hidden) ?? [];
  const ok = target !== null;

  return (
    <Screen
      title={copy.screens.target.title}
      subtitle={copy.screens.target.subtitle}
      primary={{
        label: copy.buttons.next,
        onClick: onNext,
        disabled: !ok,
        hint: ok ? undefined : copy.target.required,
      }}
    >
      <CardList label={copy.screens.target.title}>
        {cards.map((t) => (
          <Card
            key={t.id}
            title={t.label}
            description={t.promise.line}
            selected={t.id === target}
            // Tapping the picked card again must not reset its mode.
            onSelect={() => {
              if (t.id !== target) onTarget(t.id);
            }}
          />
        ))}
      </CardList>

      {modes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={LEGEND}>{copy.target.modeLegend}</h2>
          <CardList label={copy.target.modeLegend}>
            {modes.map((m) => (
              <Card
                key={m.id}
                title={m.label}
                description={m.note.line}
                selected={m.id === mode}
                onSelect={() => onMode(m.id)}
              />
            ))}
          </CardList>
        </section>
      )}

      {mode === 'instructions' && (
        <section className="flex flex-col gap-2">
          <h2 className={LEGEND}>{copy.target.planLegend}</h2>
          <CardList label={copy.target.planLegend}>
            {PLANS.map((p) => (
              <Card
                key={p}
                title={copy.target.plans[p]}
                selected={p === plan}
                onSelect={() => onPlan(p)}
              />
            ))}
          </CardList>
        </section>
      )}
    </Screen>
  );
}
