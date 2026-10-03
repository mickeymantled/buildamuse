import type { ComponentType } from 'react';
import type { ScreenId } from './flow.js';
import { useBuilder } from './store.js';
import { Base } from './screens/Base.js';
import { Certificate } from './screens/Certificate.js';
import { Gates } from './screens/Gates.js';
import { Heart } from './screens/Heart.js';
import { Limits } from './screens/Limits.js';
import { Name } from './screens/Name.js';
import { Outfit } from './screens/Outfit.js';
import { Packs } from './screens/Packs.js';
import { Peeves } from './screens/Peeves.js';
import { Roles } from './screens/Roles.js';
import { Roster } from './screens/Roster.js';
import { Stats } from './screens/Stats.js';
import { Target } from './screens/Target.js';
import { World } from './screens/World.js';

const SCREENS: Record<ScreenId, ComponentType> = {
  target: Target,
  roster: Roster,
  base: Base,
  world: World,
  packs: Packs,
  limits: Limits,
  gates: Gates,
  stats: Stats,
  peeves: Peeves,
  heart: Heart,
  outfit: Outfit,
  roles: Roles,
  name: Name,
  certificate: Certificate,
};

// One centered column on the page background. The Screen component inside owns the 16px gutters and
// the safe-area insets, so the column adds none (QUESTIONS.md U7).
export function App() {
  const screen = useBuilder((s) => s.screen);
  const Current = SCREENS[screen];
  return (
    <div className="min-h-dvh bg-background text-text">
      <div className="mx-auto min-h-dvh w-full max-w-[430px]" data-screen={screen}>
        <Current />
      </div>
    </div>
  );
}
