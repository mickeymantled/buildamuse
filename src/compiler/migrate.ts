// Build migration. A v1 build becomes a v2 build with a target and packs derived from its chips.
// Pure: every function returns a new object and never mutates its input.

import type {
  Build,
  BuildCore,
  BuildV1,
  ChatgptMode,
  ChipId,
  PackId,
  Plan,
  TargetId,
} from './types.js';
import { LIBRARY_VERSION } from '../library/version.js';

export interface MigrateOpts {
  target?: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
}

// The v1 chip -> v2 pack map. A chip not listed here derives no pack.
const CHIP_TO_PACK: ReadonlyMap<string, PackId> = new Map([
  ['memecoins', 'memecoins'],
  ['solana', 'memecoins'],
  ['prediction_markets', 'prediction-markets'],
  ['options', 'spot'],
  ['stocks', 'spot'],
  ['engineering', 'coding'],
  ['sales', 'sales'],
  ['kids', 'personal-ops'],
]);

const MAX_PACKS = 3;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// The packs a chip list derives: map each chip, drop repeats, keep the first three.
export function packsFromChips(chips: readonly ChipId[]): PackId[] {
  const packs: PackId[] = [];
  for (const chip of chips) {
    const pack = CHIP_TO_PACK.get(chip);
    if (pack !== undefined && !packs.includes(pack)) packs.push(pack);
  }
  return packs.slice(0, MAX_PACKS);
}

// mode applies only to chatgpt, plan only to chatgpt in instructions mode.
function targetFields(
  target: TargetId,
  mode?: ChatgptMode,
  plan?: Plan,
): { mode?: ChatgptMode; plan?: Plan } {
  if (target !== 'chatgpt') return {};
  const m = mode ?? 'dot';
  return m === 'instructions' ? { mode: m, plan: plan ?? 'free' } : { mode: m };
}

function copyCore(b: BuildCore): BuildCore {
  return {
    base: b.base,
    chips: [...b.chips],
    stats: { ...b.stats },
    peeves: [...b.peeves],
    heart: { ...b.heart },
    outfit: b.outfit,
    name: b.name,
  };
}

// A v2 build with every field copied but target, mode and plan, which the caller supplies.
function withTarget(b: Build, target: TargetId, tf: { mode?: ChatgptMode; plan?: Plan }): Build {
  return {
    v: 2,
    ...copyCore(b),
    target,
    ...tf,
    packs: [...b.packs],
    limits: { ...b.limits },
    gates: { ...b.gates },
    ...(b.roles ? { roles: [...b.roles] } : {}),
  };
}

function fromV1(b: BuildV1, opts: MigrateOpts): Build {
  const target = opts.target ?? 'muse';
  return {
    v: 2,
    ...copyCore(b),
    target,
    ...targetFields(target, opts.mode, opts.plan),
    packs: packsFromChips(b.chips),
    // Pack defaults are filled at compile time; the stored build carries only user overrides.
    limits: {},
    gates: {},
  };
}

export function migrate(build: BuildV1 | Build, opts: MigrateOpts = {}): Build {
  if (build.v === 2) {
    return withTarget(build, build.target, {
      ...(build.mode !== undefined ? { mode: build.mode } : {}),
      ...(build.plan !== undefined ? { plan: build.plan } : {}),
    });
  }
  return fromV1(build, opts);
}

// "Make this for <other target> instead": every other pick stays as it is.
export function retarget(
  build: Build,
  target: TargetId,
  mode?: ChatgptMode,
  plan?: Plan,
): Build {
  return withTarget(build, target, targetFields(target, mode, plan));
}

// One step per version. Key n upgrades a v(n) build to v(n+1).
export type MigrationSteps = Record<number, (b: unknown) => unknown>;

export const MIGRATIONS: MigrationSteps = {
  1: (b) => {
    if (
      !isRecord(b) ||
      !Array.isArray(b.chips) ||
      !Array.isArray(b.peeves) ||
      !isRecord(b.stats) ||
      !isRecord(b.heart)
    ) {
      throw new Error('migrate: v1 build is malformed');
    }
    return fromV1(b as unknown as BuildV1, {});
  },
};

function isVersion(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

// Applies steps until the build is at `target` (the library version). Throws on a bad or newer version.
// `steps` is a parameter so a test can add a synthetic step without a real version bump.
export function migrateToLatest(
  raw: unknown,
  target: number = LIBRARY_VERSION,
  steps: MigrationSteps = MIGRATIONS,
): Build {
  if (!isRecord(raw)) throw new Error('migrate: build is not an object');
  let cur: unknown = raw;
  if (!isVersion(raw.v)) throw new Error('migrate: build.v must be an integer');
  let v: number = raw.v;
  if (v > target) {
    throw new Error(`migrate: build version ${v} is newer than library version ${target}`);
  }
  while (v < target) {
    const step = Object.hasOwn(steps, v) ? steps[v] : undefined;
    if (!step) throw new Error(`migrate: no migration from version ${v}`);
    cur = step(cur);
    const next = isRecord(cur) ? cur.v : undefined;
    if (!isVersion(next) || next <= v) throw new Error(`migrate: step ${v} did not advance the version`);
    if (next > target) throw new Error(`migrate: step ${v} went past version ${target}`);
    v = next;
  }
  return cur as Build;
}
