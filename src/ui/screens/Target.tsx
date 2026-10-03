import library from '../../library/index.js';
import { useBuilder } from '../store.js';
import { TargetPicker } from './TargetPicker.js';

// Station 0 inside the app: the shell's picker wired to the store, for Back from the roster.
export function Target() {
  const target = useBuilder((s) => s.target);
  const mode = useBuilder((s) => s.mode);
  const plan = useBuilder((s) => s.plan);
  const setTarget = useBuilder((s) => s.setTarget);
  const setMode = useBuilder((s) => s.setMode);
  const setPlan = useBuilder((s) => s.setPlan);
  const next = useBuilder((s) => s.next);

  return (
    <TargetPicker
      cards={library.targets.targets}
      target={target}
      mode={mode}
      plan={plan}
      onTarget={(t) => setTarget(t)}
      onMode={setMode}
      onPlan={setPlan}
      onNext={next}
    />
  );
}
