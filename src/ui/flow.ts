// Screen flow, and what each screen exposes for the picked packs and target.
// Pure functions of the store state. This file never imports the store, so the store can import it.

import type {
  ActionId,
  Build,
  ChatgptMode,
  LimitId,
  PackId,
  Plan,
  Profile,
  RoleSet,
  TargetId,
  WorkflowPack,
} from '../compiler/types.js';
import { resolveProfile } from '../compiler/profile.js';
import library from '../library/index.js';

export type ScreenId =
  | 'target'
  | 'roster'
  | 'base'
  | 'world'
  | 'packs'
  | 'limits'
  | 'gates'
  | 'stats'
  | 'peeves'
  | 'heart'
  | 'outfit'
  | 'roles'
  | 'name'
  | 'certificate'
  | 'remix';

// 'remix' is a side screen: it is a ScreenId but not in SCREEN_ORDER, so it has no place in the
// progress dots and no Skip. It sits between the certificate and base (see nextScreen and prevScreen).
export const SCREEN_ORDER: readonly ScreenId[] = [
  'target',
  'roster',
  'base',
  'world',
  'packs',
  'limits',
  'gates',
  'stats',
  'peeves',
  'heart',
  'outfit',
  'roles',
  'name',
  'certificate',
];

// Skip is allowed on stations 2 to 6 of the spec, extended to the v2 screens. Target, base and name are required.
const SKIPPABLE: ReadonlySet<ScreenId> = new Set<ScreenId>([
  'world',
  'packs',
  'limits',
  'gates',
  'stats',
  'peeves',
  'heart',
  'outfit',
  'roles',
]);

export const NAME_MIN = 1;
export const NAME_MAX = 24;

export function isNameValid(name: string): boolean {
  const n = name.trim().length;
  return n >= NAME_MIN && n <= NAME_MAX;
}

// The slice of the store state the flow reads. Declared here so this file does not import the store.
export interface FlowState {
  screen: ScreenId;
  from: 'roster' | 'blank' | 'remix' | 'link' | 'link-remix' | null;
  target: TargetId | null;
  mode?: ChatgptMode;
  plan?: Plan;
  draft: { base?: string; name: string; packs: PackId[] };
  advancedRoles: boolean;
}

// The delivery profile for a target and mode. Before a target is picked it reads as muse, like the preview build.
export function profileOf(s: { target: TargetId | null; mode?: ChatgptMode }): Profile {
  // resolveProfile reads only target and mode.
  return resolveProfile({ target: s.target ?? 'muse', mode: s.mode } as Build, library);
}

// Packs the profile can deliver, in library order. Packs it can't are hidden.
export function availablePacks(profile: Profile): WorkflowPack[] {
  return library.packs.filter((p) => p.profiles === undefined || p.profiles.includes(profile.id));
}

function selected(packIds: readonly PackId[]): WorkflowPack[] {
  return packIds
    .map((id) => library.packs.find((p) => p.id === id))
    .filter((p): p is WorkflowPack => p !== undefined);
}

// Limit chips the picked packs expose, in registry order.
export function exposedLimits(packIds: readonly PackId[]): LimitId[] {
  const ids = new Set<LimitId>(selected(packIds).flatMap((p) => p.limitChips));
  return library.limits.filter((l) => ids.has(l.id)).map((l) => l.id);
}

// Gated actions the picked packs expose, in registry order, without pay (pay is always locked at forbid).
export function exposedGates(packIds: readonly PackId[]): ActionId[] {
  const ids = new Set<ActionId>(selected(packIds).flatMap((p) => Object.keys(p.gatesDefault)));
  return library.gates.filter((g) => g.id !== 'pay' && ids.has(g.id)).map((g) => g.id);
}

// The rows of the gates screen: the exposed actions, with pay in its registry place. Empty when none are exposed.
export function gateRows(packIds: readonly PackId[]): ActionId[] {
  const exposed = new Set<ActionId>(exposedGates(packIds));
  if (exposed.size === 0) return [];
  return library.gates.filter((g) => g.id === 'pay' || exposed.has(g.id)).map((g) => g.id);
}

// Role sets that fit the picked packs, the first pack's sets first.
export function roleSetsFor(packIds: readonly PackId[]): RoleSet[] {
  const sets: RoleSet[] = [];
  for (const id of packIds) {
    for (const set of library.roleSets) {
      if (set.packs.includes(id) && !sets.includes(set)) sets.push(set);
    }
  }
  return sets;
}

function isVisible(id: ScreenId, s: FlowState): boolean {
  switch (id) {
    case 'limits':
      return exposedLimits(s.draft.packs).length > 0;
    case 'gates':
      return exposedGates(s.draft.packs).length > 0;
    case 'roles':
      return s.advancedRoles && profileOf(s).supportsRoles;
    default:
      return true;
  }
}

export function visibleScreens(s: FlowState): ScreenId[] {
  return SCREEN_ORDER.filter((id) => isVisible(id, s));
}

// The stations the progress dots count: base to name, the ones visible for this build.
export function progressScreens(s: FlowState): ScreenId[] {
  const from = SCREEN_ORDER.indexOf('base');
  const to = SCREEN_ORDER.indexOf('name');
  return visibleScreens(s).filter((id) => {
    const i = SCREEN_ORDER.indexOf(id);
    return i >= from && i <= to;
  });
}

export function nextScreen(s: FlowState): ScreenId {
  if (s.screen === 'remix') return 'base';
  const at = SCREEN_ORDER.indexOf(s.screen);
  return visibleScreens(s).find((id) => SCREEN_ORDER.indexOf(id) > at) ?? s.screen;
}

export function prevScreen(s: FlowState): ScreenId {
  if (s.screen === 'remix') return 'certificate';
  // A link opens on the certificate, so there is nothing behind it. A link remix opens on the remix screen.
  if (s.screen === 'certificate' && s.from === 'link') return 'certificate';
  if (s.screen === 'base' && s.from === 'link-remix') return 'remix';
  // A starter in use jumped from the roster to the certificate, so back returns to the roster.
  if (s.screen === 'certificate' && s.from === 'roster') return 'roster';
  const at = SCREEN_ORDER.indexOf(s.screen);
  const before = visibleScreens(s).filter((id) => SCREEN_ORDER.indexOf(id) < at);
  return before[before.length - 1] ?? s.screen;
}

// Whether Back leads anywhere. False on the target screen and on a link's certificate.
export function canGoBack(s: FlowState): boolean {
  return prevScreen(s) !== s.screen;
}

export function canSkip(screen: ScreenId): boolean {
  return SKIPPABLE.has(screen);
}

// Whether Next is allowed. Only target, base (U2) and name need a pick; every other screen continues on its defaults.
export function canContinue(s: FlowState): boolean {
  switch (s.screen) {
    case 'target':
      return s.target !== null;
    case 'base':
      return s.draft.base !== undefined;
    case 'name':
      return isNameValid(s.draft.name);
    default:
      return true;
  }
}
