import type { Plan } from '../../compiler/types.js';
import library from '../../library/index.js';
import { Card, CardList } from '../components/Card';
import { copy } from '../copy.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

const PLANS: readonly Plan[] = ['free', 'paid'];

const LEGEND = 'text-sm font-semibold text-text';

// Station 0. Required, no Skip. ChatGPT opens a mode picker, and Custom instructions opens a plan picker.
export function Target() {
  const target = useBuilder((s) => s.target);
  const mode = useBuilder((s) => s.mode);
  const plan = useBuilder((s) => s.plan);
  const setTarget = useBuilder((s) => s.setTarget);
  const setMode = useBuilder((s) => s.setMode);
  const setPlan = useBuilder((s) => s.setPlan);

  const picked = library.targets.targets.find((t) => t.id === target);
  // Hidden modes (Custom GPT) stay in the compiler and out of the picker.
  const modes = picked?.modes?.filter((m) => !m.hidden) ?? [];

  return (
    <Station screen="target" hint={copy.target.required}>
      <CardList label={copy.screens.target.title}>
        {library.targets.targets.map((t) => (
          <Card
            key={t.id}
            title={t.label}
            description={t.promise.line}
            selected={t.id === target}
            // Tapping the picked card again must not reset its mode.
            onSelect={() => {
              if (t.id !== target) setTarget(t.id);
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
                onSelect={() => setMode(m.id)}
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
                onSelect={() => setPlan(p)}
              />
            ))}
          </CardList>
        </section>
      )}
    </Station>
  );
}
