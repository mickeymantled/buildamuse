// The one Zustand store. Screens read state and call actions; nothing else changes the build.
// No persistence middleware: state lives in memory and in the share link, never in storage.
// Everything below the store hook is a pure function of the state, so tests need no React.

import { create } from 'zustand';
import type {
  ActionId,
  BadgeId,
  BaseId,
  Build,
  BuildCore,
  ChatgptMode,
  ChipId,
  CompileResult,
  DriveId,
  GateSetting,
  HardPartId,
  Level,
  Limit,
  LimitId,
  OutfitId,
  PackId,
  PeeveId,
  Plan,
  RoleId,
  RoleSet,
  StatId,
  Stats,
  TargetId,
} from '../compiler/types.js';
import { compile } from '../compiler/compile.js';
import {
  FALLBACK_BASE,
  FALLBACK_HARD_PART,
  FALLBACK_OUTFIT,
  addRisk,
  cleanName,
  d2ForBlunt,
} from '../compiler/defaults.js';
import { effectiveGates, effectiveLimits } from '../compiler/gates.js';
import { migrate, packsFromChips, retarget } from '../compiler/migrate.js';
import { capOf as compilerCapOf } from '../compiler/profile.js';
import { MAX_CHIPS, MAX_PACKS, MAX_PEEVES, STAT_CAP } from '../compiler/passes/validate.js';
import library from '../library/index.js';
import { copy } from './copy.js';
import {
  availablePacks,
  canContinue,
  canSkip,
  exposedGates,
  exposedLimits,
  isNameValid,
  nextScreen,
  prevScreen,
  profileOf,
  roleSetsFor,
  type ScreenId,
} from './flow.js';

export { profileOf };

export type From = 'roster' | 'blank' | 'remix' | null;

export interface Draft {
  base?: BaseId;
  chips: ChipId[];
  stats?: Stats;
  peeves: PeeveId[];
  heart?: BuildCore['heart'];
  outfit?: OutfitId;
  name: string; // raw input, capped at 24; trimmed when it becomes a build
  packs: PackId[];
  limits: Record<LimitId, number>; // user overrides only; pack defaults fill in at compile time
  gates: Record<ActionId, GateSetting>; // user overrides only
  roles?: RoleId[];
}

// What the user has changed by hand, so a derived default stops following its source.
export interface Touched {
  proactive: boolean;
  packs: boolean;
  d2: boolean;
}

export interface BuilderState {
  screen: ScreenId;
  from: From;
  target: TargetId | null;
  mode?: ChatgptMode;
  plan?: Plan;
  draft: Draft;
  touched: Touched;
  advancedRoles: boolean;
  skipped: ScreenId[];
  lastBadge: BadgeId | null;
  // Proactive carries a chip's +1 nudge that the user hasn't moved, so untapping the chip takes it back.
  nudged: boolean;
}

export interface BuilderActions {
  setTarget: (target: TargetId, mode?: ChatgptMode, plan?: Plan) => void;
  setMode: (mode: ChatgptMode) => void;
  setPlan: (plan: Plan) => void;
  useStarter: (id: string) => void;
  remixStarter: (id: string) => void;
  startBlank: () => void;
  setBase: (id: BaseId) => void;
  toggleChip: (id: ChipId) => void;
  setStat: (stat: StatId, level: Level) => void;
  togglePack: (id: PackId) => void;
  setLimit: (id: LimitId, value: number) => void;
  setGate: (action: ActionId, setting: GateSetting) => void;
  togglePeeve: (id: PeeveId) => void;
  setHardPart: (id: HardPartId) => void;
  setD1: (id: DriveId) => void;
  setD2: (id: DriveId) => void;
  setOutfit: (id: OutfitId) => void;
  setName: (text: string) => void;
  setAdvancedRoles: (on: boolean) => void;
  toggleRole: (id: RoleId) => void;
  go: (screen: ScreenId) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  reset: () => void;
}

export type BuilderStore = BuilderState & BuilderActions;

export interface CompileError {
  error: string;
}

export function isCompileError(r: CompileResult | CompileError): r is CompileError {
  return 'error' in r;
}

const GATE_SETTINGS: readonly GateSetting[] = ['auto', 'approve', 'forbid'];

export function initialState(): BuilderState {
  return {
    screen: 'target',
    from: null,
    target: null,
    mode: undefined,
    plan: undefined,
    draft: emptyDraft(),
    touched: { proactive: false, packs: false, d2: false },
    advancedRoles: false,
    skipped: [],
    lastBadge: null,
    nudged: false,
  };
}

function emptyDraft(): Draft {
  return { chips: [], peeves: [], name: '', packs: [], limits: {}, gates: {} };
}

// ---- Stats ----

export function statTotal(stats: Stats): number {
  return (
    stats.blunt + stats.warm + stats.funny + stats.chatty + stats.proactive + (stats.risk ?? 0)
  );
}

function withoutRisk(stats: Stats): Stats {
  const { blunt, warm, funny, chatty, proactive } = stats;
  return { blunt, warm, funny, chatty, proactive };
}

function baseDefaults(id: BaseId): Stats {
  const base = library.bases.find((b) => b.id === id);
  if (!base) throw new Error(`store: unknown base ${id}`);
  return { ...base.defaults };
}

function isMarkets(chip: ChipId): boolean {
  return library.chips.find((c) => c.id === chip)?.group === 'Markets';
}

export function hasMarkets(chips: readonly ChipId[]): boolean {
  return chips.some(isMarkets);
}

// The draft's stats, or the base defaults when none are set yet (chaos until a base is chosen).
export function statsOf(d: Draft): Stats {
  if (d.stats) return d.stats;
  const defaults = baseDefaults(d.base ?? FALLBACK_BASE);
  return hasMarkets(d.chips) ? addRisk(defaults) : defaults;
}

// Caps a name at 24 UTF-16 units without leaving half of a surrogate pair at the end.
function capName(text: string): string {
  const cut = text.slice(0, 24);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

// ---- Heart ----

function hardPartOf(id: HardPartId) {
  return library.heart.hardParts.find((h) => h.id === id);
}

// The d1 drives a build may carry: the hard part's own, or a tapped chip's d1Suggest.
export function d1Options(heart: { hardPart: HardPartId }, chips: readonly ChipId[]): DriveId[] {
  const own = hardPartOf(heart.hardPart)?.d1;
  const suggested = chips
    .map((c) => library.chips.find((chip) => chip.id === c)?.d1Suggest)
    .filter((d): d is DriveId => d !== undefined);
  return [...(own !== undefined ? [own] : []), ...suggested];
}

function defaultHeart(blunt: Level): BuildCore['heart'] {
  return {
    hardPart: FALLBACK_HARD_PART,
    d1: hardPartOf(FALLBACK_HARD_PART)?.d1 ?? `d1.${FALLBACK_HARD_PART}`,
    d2: d2ForBlunt(blunt),
  };
}

// ---- Limits ----

// Clamps a value to the limit's min..max and snaps it to its step.
export function snapLimit(limit: Limit, value: number): number {
  const maxSteps = Math.floor((limit.max - limit.min) / limit.step + 1e-9);
  const steps = Math.min(maxSteps, Math.max(0, Math.round((value - limit.min) / limit.step)));
  return Math.round((limit.min + steps * limit.step) * 1e6) / 1e6;
}

// ---- Roles ----

export function roleSetOf(roles: readonly RoleId[] | undefined): RoleSet | undefined {
  const role = (roles ?? []).map((id) => library.roles.find((r) => r.id === id)).find((r) => r);
  return role ? library.roleSets.find((s) => s.id === role.set) : undefined;
}

// The roles a fresh team starts with: the coordinator plus the picked packs' default roles.
// Falls back to the set's default members when the packs name none.
function seedRoles(packIds: readonly PackId[]): RoleId[] | undefined {
  const set = roleSetsFor(packIds)[0];
  if (!set) return undefined;
  const wanted = new Set<RoleId>();
  for (const id of packIds) {
    if (!set.packs.includes(id)) continue;
    for (const role of library.packs.find((p) => p.id === id)?.defaultRoles ?? []) {
      if (set.members.includes(role)) wanted.add(role);
    }
  }
  const picked = wanted.size > 0 ? wanted : new Set(set.defaultMembers);
  picked.add(set.coordinator);
  return set.members.filter((m) => picked.has(m));
}

// ---- Derived selectors ----

function keyOf(s: BuilderState): string {
  return JSON.stringify([s.target, s.mode, s.plan, s.draft]);
}

const MEMO_MAX = 64;

// Memoizes by a JSON key of the inputs, so a selector returns the same object for the same picks.
function memoize<K, T>(key: (k: K) => string, fn: (k: K) => T): (k: K) => T {
  const cache = new Map<string, T>();
  return (k) => {
    const id = key(k);
    if (cache.has(id)) return cache.get(id) as T;
    const value = fn(k);
    cache.set(id, value);
    if (cache.size > MEMO_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return value;
  };
}

// The build the preview strip compiles. Gaps are filled with defaults so it always validates:
// base chaos until one is chosen (U2); heart calmer with its d1 and a d2 from blunt, outfit
// has_it_together and the default name (U3).
export const previewBuild = memoize(keyOf, (s: BuilderState): Build => {
  const d = s.draft;
  const stats = statsOf(d);
  const core: Build = {
    v: 2,
    base: d.base ?? FALLBACK_BASE,
    chips: [...d.chips],
    stats,
    peeves: [...d.peeves],
    heart: d.heart ? { ...d.heart } : defaultHeart(stats.blunt),
    outfit: d.outfit ?? FALLBACK_OUTFIT,
    name: d.name.trim() || copy.defaultName,
    target: 'muse',
    packs: [...d.packs],
    limits: { ...d.limits },
    gates: { ...d.gates },
    ...(d.roles ? { roles: [...d.roles] } : {}),
  };
  return retarget(core, s.target ?? 'muse', s.mode, s.plan);
});

// compile(previewBuild), or an error object. The UI never builds an invalid build, but the strip must not crash.
export const compiled = memoize(keyOf, (s: BuilderState): CompileResult | CompileError => {
  try {
    return compile(previewBuild(s));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

export function capOf(s: BuilderState): number {
  return compilerCapOf(profileOf(s), previewBuild(s));
}

// Gates and limits as the compiler will use them: pack defaults under the user's overrides.
export const effectiveGatesOf = memoize(keyOf, (s: BuilderState) =>
  effectiveGates(previewBuild(s), library),
);
export const effectiveLimitsOf = memoize(keyOf, (s: BuilderState) =>
  effectiveLimits(previewBuild(s), library),
);

// The required picks are made: a target, a base and a valid name. Skipped screens keep their defaults.
export function isComplete(s: BuilderState): boolean {
  return s.target !== null && s.draft.base !== undefined && isNameValid(s.draft.name);
}

// A roster starter on the current target. Null before a target is picked or for an unknown id.
export function starterBuild(
  s: Pick<BuilderState, 'target' | 'mode' | 'plan'>,
  id: string,
): Build | null {
  const entry = library.roster.find((e) => e.id === id);
  if (!entry || s.target === null) return null;
  return migrate(entry.build, { target: s.target, mode: s.mode, plan: s.plan });
}

export const compiledStarter = memoize(
  (a: { s: Pick<BuilderState, 'target' | 'mode' | 'plan'>; id: string }) =>
    JSON.stringify([a.s.target, a.s.mode, a.s.plan, a.id]),
  (a): CompileResult | CompileError | null => {
    const build = starterBuild(a.s, a.id);
    if (!build) return null;
    try {
      return compile(build);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
);

function badgesOf(s: BuilderState): BadgeId[] {
  const c = compiled(s);
  return isCompileError(c) ? [] : c.badges;
}

// The first badge that lit between two states, for the preview strip.
function litBadge(prev: BuilderState, next: BuilderState): BadgeId | null {
  const before = new Set(badgesOf(prev));
  return badgesOf(next).find((b) => !before.has(b)) ?? null;
}

// ---- Invariants ----

// Brings the dependent parts of a state back in line after a change: packs follow chips until the
// user picks packs, limits, gates and roles drop what the packs no longer expose, risk exists
// exactly when a Markets chip is tapped, and the heart stays valid and d2 follows blunt until swapped.
function settle<S extends BuilderState>(s: S): S {
  const d = s.draft;
  const available = new Set(availablePacks(profileOf(s)).map((p) => p.id));
  const packs = (s.touched.packs ? d.packs : packsFromChips(d.chips)).filter((id) =>
    available.has(id),
  );

  let stats = d.stats;
  if (stats) {
    const markets = hasMarkets(d.chips);
    if (markets && stats.risk === undefined) stats = addRisk(stats);
    else if (!markets && stats.risk !== undefined) stats = withoutRisk(stats);
  }

  const limitIds = new Set(exposedLimits(packs));
  const gateIds = new Set(exposedGates(packs));
  const limits = Object.fromEntries(Object.entries(d.limits).filter(([id]) => limitIds.has(id)));
  const gates = Object.fromEntries(Object.entries(d.gates).filter(([id]) => gateIds.has(id)));

  let roles = d.roles;
  if (roles !== undefined) {
    const set = roleSetOf(roles);
    if (!set || !roleSetsFor(packs).includes(set)) roles = undefined;
  }
  if (s.advancedRoles && roles === undefined) roles = seedRoles(packs);

  let heart = d.heart;
  if (heart) {
    const d1 = d1Options(heart, d.chips).includes(heart.d1)
      ? heart.d1
      : (hardPartOf(heart.hardPart)?.d1 ?? heart.d1);
    const d2 = s.touched.d2 ? heart.d2 : d2ForBlunt(statsOf({ ...d, stats }).blunt);
    heart = { hardPart: heart.hardPart, d1, d2 };
  }

  return { ...s, draft: { ...d, packs, stats, limits, gates, roles, heart } };
}

// ---- The store ----

// A starter loaded as a draft. d2 counts as touched only when it differs from what blunt would pick.
function starterPatch(s: BuilderState, id: string): Partial<BuilderState> | null {
  const b = starterBuild(s, id);
  if (!b) return null;
  return {
    draft: {
      base: b.base,
      chips: [...b.chips],
      stats: { ...b.stats },
      peeves: [...b.peeves],
      heart: { ...b.heart },
      outfit: b.outfit,
      name: b.name,
      packs: [...b.packs],
      limits: { ...b.limits },
      gates: { ...b.gates },
      roles: b.roles ? [...b.roles] : undefined,
    },
    touched: { proactive: false, packs: false, d2: b.heart.d2 !== d2ForBlunt(b.stats.blunt) },
    advancedRoles: false,
    skipped: [],
    nudged: false,
  };
}

export const useBuilder = create<BuilderStore>()((set, get) => {
  // Applies one change to the draft side of the state. `update` returns the changed fields, or
  // null to refuse the change. The result is settled, and the badge that just lit is recorded.
  const commit = (update: (s: BuilderState) => Partial<BuilderState> | null): void => {
    set((s) => {
      const patch = update(s);
      if (patch === null) return s;
      const next = settle({ ...s, ...patch });
      return { ...next, lastBadge: litBadge(s, next) };
    });
  };

  const draftPatch = (s: BuilderState, change: Partial<Draft>): Partial<BuilderState> => ({
    draft: { ...s.draft, ...change },
  });

  return {
    ...initialState(),

    setTarget: (target, mode, plan) =>
      commit(() => {
        const m = target === 'chatgpt' ? (mode ?? 'dot') : undefined;
        return { target, mode: m, plan: m === 'instructions' ? (plan ?? 'free') : undefined };
      }),

    setMode: (mode) =>
      commit((s) =>
        s.target === 'chatgpt'
          ? { mode, plan: mode === 'instructions' ? (s.plan ?? 'free') : undefined }
          : null,
      ),

    setPlan: (plan) =>
      commit((s) => (s.target === 'chatgpt' && s.mode === 'instructions' ? { plan } : null)),

    useStarter: (id) =>
      commit((s) => {
        const patch = starterPatch(s, id);
        return patch && { ...patch, from: 'roster', screen: 'certificate' };
      }),

    remixStarter: (id) =>
      commit((s) => {
        const patch = starterPatch(s, id);
        return patch && { ...patch, from: 'remix', screen: 'base' };
      }),

    startBlank: () =>
      commit(() => ({
        draft: emptyDraft(),
        touched: { proactive: false, packs: false, d2: false },
        advancedRoles: false,
        skipped: [],
        nudged: false,
        from: 'blank',
        screen: 'base',
      })),

    setBase: (id) =>
      commit((s) => {
        if (!library.bases.some((b) => b.id === id)) return null;
        return {
          ...draftPatch(s, { base: id, stats: baseDefaults(id) }),
          touched: { ...s.touched, proactive: false },
          nudged: false,
        };
      }),

    toggleChip: (id) =>
      commit((s) => {
        const chip = library.chips.find((c) => c.id === id);
        if (!chip) return null;
        const has = s.draft.chips.includes(id);
        if (!has && s.draft.chips.length >= MAX_CHIPS) return null;
        const chips = has ? s.draft.chips.filter((c) => c !== id) : [...s.draft.chips, id];
        let stats = s.draft.stats;
        let nudged = s.nudged;
        // A chip with proactivePlusOne (kids) nudges proactive up by 1 if the user hasn't moved it and the cap allows.
        // Untapping the last such chip takes the nudge back, so tapping on and off never ratchets proactive up.
        const nudges = (ids: readonly ChipId[]) =>
          ids.some((c) => library.chips.find((x) => x.id === c)?.unlocks?.proactivePlusOne === true);
        if (stats && !s.touched.proactive) {
          if (!has && chip.unlocks?.proactivePlusOne === true && !nudged && stats.proactive < 4) {
            const bumped: Stats = { ...stats, proactive: (stats.proactive + 1) as Level };
            if (statTotal(bumped) <= STAT_CAP) {
              stats = bumped;
              nudged = true;
            }
          } else if (nudged && !nudges(chips)) {
            stats = { ...stats, proactive: Math.max(1, stats.proactive - 1) as Level };
            nudged = false;
          }
        }
        return { ...draftPatch(s, { chips, stats }), nudged };
      }),

    setStat: (stat, level) =>
      commit((s) => {
        if (!Number.isInteger(level) || level < 1 || level > 4) return null;
        const cur = statsOf(s.draft);
        if (stat === 'risk' && cur.risk === undefined) return null;
        if (cur[stat] === level) return null;
        const next: Stats = { ...cur, [stat]: level };
        if (statTotal(next) > STAT_CAP) return null;
        return {
          ...draftPatch(s, { stats: next }),
          touched: stat === 'proactive' ? { ...s.touched, proactive: true } : s.touched,
          nudged: stat === 'proactive' ? false : s.nudged,
        };
      }),

    togglePack: (id) =>
      commit((s) => {
        if (!availablePacks(profileOf(s)).some((p) => p.id === id)) return null;
        const has = s.draft.packs.includes(id);
        if (!has && s.draft.packs.length >= MAX_PACKS) return null;
        const packs = has ? s.draft.packs.filter((p) => p !== id) : [...s.draft.packs, id];
        return { ...draftPatch(s, { packs }), touched: { ...s.touched, packs: true } };
      }),

    setLimit: (id, value) =>
      commit((s) => {
        const limit = library.limits.find((l) => l.id === id);
        if (!limit || !Number.isFinite(value) || !exposedLimits(s.draft.packs).includes(id)) {
          return null;
        }
        return draftPatch(s, { limits: { ...s.draft.limits, [id]: snapLimit(limit, value) } });
      }),

    setGate: (action, setting) =>
      commit((s) => {
        // Pay is locked at forbid, so no change to it is ever stored.
        if (action === 'pay' || !GATE_SETTINGS.includes(setting)) return null;
        if (!exposedGates(s.draft.packs).includes(action)) return null;
        // A gate with no auto soul line does not offer auto (treat as approve).
        if (setting === 'auto' && library.gates.find((g) => g.id === action)?.soulLine.auto === null) {
          return null;
        }
        return draftPatch(s, { gates: { ...s.draft.gates, [action]: setting } });
      }),

    togglePeeve: (id) =>
      commit((s) => {
        if (!library.peeves.some((p) => p.id === id)) return null;
        const has = s.draft.peeves.includes(id);
        if (!has && s.draft.peeves.length >= MAX_PEEVES) return null;
        return draftPatch(s, {
          peeves: has ? s.draft.peeves.filter((p) => p !== id) : [...s.draft.peeves, id],
        });
      }),

    setHardPart: (id) =>
      commit((s) => {
        const hardPart = hardPartOf(id);
        if (!hardPart) return null;
        // A new answer resets both drives: d1 is the hard part's, d2 follows blunt again.
        const d2 = d2ForBlunt(statsOf(s.draft).blunt);
        return {
          ...draftPatch(s, { heart: { hardPart: id, d1: hardPart.d1, d2 } }),
          touched: { ...s.touched, d2: false },
        };
      }),

    setD1: (id) =>
      commit((s) => {
        const heart = s.draft.heart;
        if (!heart || !d1Options(heart, s.draft.chips).includes(id)) return null;
        return draftPatch(s, { heart: { ...heart, d1: id } });
      }),

    setD2: (id) =>
      commit((s) => {
        const heart = s.draft.heart;
        if (!heart || !library.heart.drives.some((d) => d.id === id && d.slot === 'd2')) {
          return null;
        }
        return {
          ...draftPatch(s, { heart: { ...heart, d2: id } }),
          touched: { ...s.touched, d2: true },
        };
      }),

    setOutfit: (id) =>
      commit((s) =>
        library.outfits.some((o) => o.id === id) ? draftPatch(s, { outfit: id }) : null,
      ),

    setName: (text) => commit((s) => draftPatch(s, { name: capName(cleanName(text)) })),

    setAdvancedRoles: (on) =>
      commit((s) => ({
        advancedRoles: on,
        ...draftPatch(s, { roles: on ? s.draft.roles : undefined }),
      })),

    toggleRole: (id) =>
      commit((s) => {
        const role = library.roles.find((r) => r.id === id);
        const set = role && library.roleSets.find((x) => x.id === role.set);
        if (!set || !roleSetsFor(s.draft.packs).includes(set) || id === set.coordinator) {
          return null;
        }
        // Roles from another set are replaced, and the coordinator is always in.
        const same = roleSetOf(s.draft.roles)?.id === set.id;
        const current = new Set<RoleId>(same ? s.draft.roles : []);
        current.add(set.coordinator);
        if (current.has(id)) current.delete(id);
        else current.add(id);
        return draftPatch(s, { roles: set.members.filter((m) => current.has(m)) });
      }),

    go: (screen) => set({ screen, lastBadge: null }),

    next: () => {
      const s = get();
      if (!canContinue(s)) return;
      // Moving on from a screen means it was answered, so it is no longer skipped.
      set({
        screen: nextScreen(s),
        skipped: s.skipped.filter((id) => id !== s.screen),
        lastBadge: null,
      });
    },

    back: () => {
      const s = get();
      set({ screen: prevScreen(s), lastBadge: null });
    },

    skip: () => {
      const s = get();
      if (!canSkip(s.screen)) return;
      set({
        screen: nextScreen(s),
        skipped: s.skipped.includes(s.screen) ? s.skipped : [...s.skipped, s.screen],
        lastBadge: null,
      });
    },

    reset: () => set(initialState()),
  };
});
