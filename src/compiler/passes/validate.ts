// Pass 1: validate a Build against a Library. Pure. Throws on the first violation found.

import type { Build, BuildCore, BuildV1, Library, StatId } from '../types.js';

export const STAT_CAP = 14;
export const MAX_CHIPS = 6;
export const MAX_PEEVES = 5;

function fail(reason: string): never {
  throw new Error(`Invalid build: ${reason}`);
}

function isPositiveInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

function isLevel(n: unknown): n is 1 | 2 | 3 | 4 {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 4;
}

function hasDuplicates(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

// Every check except the version check. Works on a v1 or a v2 build.
export function validateCore(build: BuildCore & { v?: unknown }, lib: Library): void {
  // 2. base is the id of a base in lib.bases.
  if (!lib.bases.some((b) => b.id === build.base)) {
    fail('base is not a known base id');
  }

  // 3. chips: array of length 0..6, no duplicates, every id exists in lib.chips.
  if (!Array.isArray(build.chips) || build.chips.length > MAX_CHIPS) {
    fail(`chips must be an array of at most ${MAX_CHIPS}`);
  }
  if (hasDuplicates(build.chips)) {
    fail('chips contains duplicates');
  }
  for (const chipId of build.chips) {
    if (!lib.chips.some((c) => c.id === chipId)) {
      fail(`chip id not found in library: ${chipId}`);
    }
  }

  // 4. blunt, warm, funny, chatty, proactive are integers 1..4. risk, if present, is 1..4.
  const requiredStats: StatId[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive'];
  for (const stat of requiredStats) {
    if (!isLevel(build.stats[stat])) {
      fail(`stat ${stat} must be an integer 1..4`);
    }
  }
  if (build.stats.risk !== undefined && !isLevel(build.stats.risk)) {
    fail('risk must be an integer 1..4 when present');
  }

  // 5. Risk gating: risk present iff a tapped chip belongs to the Markets group.
  const hasMarkets = build.chips.some((chipId) => {
    const chip = lib.chips.find((c) => c.id === chipId);
    return chip?.group === 'Markets';
  });
  if (hasMarkets && build.stats.risk === undefined) {
    fail('risk must be present when a Markets chip is tapped');
  }
  if (!hasMarkets && build.stats.risk !== undefined) {
    fail('risk must be absent when no Markets chip is tapped');
  }

  // 6. Sum of all present stats <= STAT_CAP.
  const sum =
    build.stats.blunt +
    build.stats.warm +
    build.stats.funny +
    build.stats.chatty +
    build.stats.proactive +
    (build.stats.risk ?? 0);
  if (sum > STAT_CAP) {
    fail(`sum of stats exceeds ${STAT_CAP}`);
  }

  // 7. peeves: length 0..5, no duplicates, every id exists in lib.peeves.
  if (!Array.isArray(build.peeves) || build.peeves.length > MAX_PEEVES) {
    fail(`peeves must be an array of at most ${MAX_PEEVES}`);
  }
  if (hasDuplicates(build.peeves)) {
    fail('peeves contains duplicates');
  }
  for (const peeveId of build.peeves) {
    if (!lib.peeves.some((p) => p.id === peeveId)) {
      fail(`peeve id not found in library: ${peeveId}`);
    }
  }

  // 8. heart.hardPart exists in lib.heart.hardParts.
  const hardPart = lib.heart.hardParts.find((h) => h.id === build.heart.hardPart);
  if (!hardPart) {
    fail('heart.hardPart is not a known hard part id');
  }

  // 9. heart.d1 is either that hard part's d1, or the d1Suggest of a tapped chip.
  const tappedChipD1Suggests = build.chips
    .map((chipId) => lib.chips.find((c) => c.id === chipId)?.d1Suggest)
    .filter((d): d is string => d !== undefined);
  const d1IsHardPartDrive = build.heart.d1 === hardPart.d1;
  const d1IsChipSuggested = tappedChipD1Suggests.includes(build.heart.d1);
  if (!d1IsHardPartDrive && !d1IsChipSuggested) {
    fail('heart.d1 is not the hard part drive or a tapped chip d1Suggest');
  }

  // 10. heart.d2 is the id of a drive in lib.heart.drives with slot === 'd2'.
  if (!lib.heart.drives.some((d) => d.id === build.heart.d2 && d.slot === 'd2')) {
    fail('heart.d2 is not a known d2 drive id');
  }

  // 11. outfit exists in lib.outfits.
  if (!lib.outfits.some((o) => o.id === build.outfit)) {
    fail('outfit is not a known outfit id');
  }

  // 12. name is a string whose trimmed length is 1..24, with no control characters or em dash.
  if (typeof build.name !== 'string') {
    fail('name must be a string');
  }
  const trimmedLength = build.name.trim().length;
  if (trimmedLength < 1 || trimmedLength > 24) {
    fail('name trimmed length must be 1..24');
  }
  // Any control character (C0, DEL, C1 including NEL) or line or paragraph separator, or an em
  // dash, in a name reaches the output. cleanName turns all of these into a space or a hyphen.
  if (/[\p{Cc}\u2028\u2029\u2014]/u.test(build.name)) {
    fail('name must not contain control characters or an em dash');
  }
}

export function validate(build: BuildV1, lib: Library): void {
  // 1. v is a positive integer.
  if (!isPositiveInteger(build.v)) {
    fail('v must be a positive integer');
  }
  validateCore(build, lib);
}

const TARGETS: readonly string[] = ['muse', 'openclaw', 'hermes', 'grok', 'chatgpt'];
const MODES: readonly string[] = ['dot', 'gpt', 'instructions', 'project'];
const PLANS: readonly string[] = ['free', 'paid'];
const GATE_SETTINGS: readonly string[] = ['auto', 'approve', 'forbid'];
export const MAX_PACKS = 3;
const STEP_EPSILON = 1e-6;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function validateV2(build: Build, lib: Library): void {
  // v is exactly 2.
  if ((build.v as unknown) !== 2) {
    fail('v must be 2');
  }

  validateCore(build, lib);

  // target is one of the five known targets.
  if (!TARGETS.includes(build.target)) {
    fail('target is not a known target id');
  }

  // mode only for chatgpt, and a known mode.
  if (build.mode !== undefined) {
    if (build.target !== 'chatgpt') {
      fail('mode is only allowed when target is chatgpt');
    }
    if (!MODES.includes(build.mode)) {
      fail('mode is not a known chatgpt mode');
    }
  }

  // plan only for chatgpt in instructions mode (absent mode means dot), and a known plan.
  if (build.plan !== undefined) {
    if (build.target !== 'chatgpt' || (build.mode ?? 'dot') !== 'instructions') {
      fail('plan is only allowed for chatgpt in instructions mode');
    }
    if (!PLANS.includes(build.plan)) {
      fail('plan is not a known plan');
    }
  }

  // packs: array of 0..3, unique, every id exists in lib.packs.
  if (!Array.isArray(build.packs) || build.packs.length > MAX_PACKS) {
    fail(`packs must be an array of at most ${MAX_PACKS}`);
  }
  if (hasDuplicates(build.packs)) {
    fail('packs contains duplicates');
  }
  const selected = build.packs.map((packId) => {
    const pack = lib.packs.find((p) => p.id === packId);
    if (!pack) {
      fail(`pack id not found in library: ${String(packId)}`);
    }
    return pack;
  });

  // gates: keys are pay or an action some selected pack exposes; values are gate settings; pay is forbid.
  if (!isRecord(build.gates)) {
    fail('gates must be an object');
  }
  const gateActions = new Set<string>(['pay']);
  for (const pack of selected) {
    for (const action of Object.keys(pack.gatesDefault)) {
      gateActions.add(action);
    }
  }
  for (const [action, setting] of Object.entries(build.gates)) {
    if (!gateActions.has(action)) {
      fail(`gate action is not exposed by a selected pack: ${action}`);
    }
    if (typeof setting !== 'string' || !GATE_SETTINGS.includes(setting)) {
      fail(`gate ${action} must be auto, approve or forbid`);
    }
  }
  if (build.gates.pay !== undefined && build.gates.pay !== 'forbid') {
    fail('gate pay must be forbid');
  }

  // limits: keys are in some selected pack's limitChips; values within min..max and on step.
  if (!isRecord(build.limits)) {
    fail('limits must be an object');
  }
  const limitIds = new Set<string>();
  for (const pack of selected) {
    for (const limitId of pack.limitChips) {
      limitIds.add(limitId);
    }
  }
  for (const [limitId, value] of Object.entries(build.limits)) {
    if (!limitIds.has(limitId)) {
      fail(`limit is not exposed by a selected pack: ${limitId}`);
    }
    const limit = lib.limits.find((l) => l.id === limitId);
    if (!limit) {
      fail(`limit id not found in library: ${limitId}`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(`limit ${limitId} must be a number`);
    }
    if (value < limit.min - STEP_EPSILON || value > limit.max + STEP_EPSILON) {
      fail(`limit ${limitId} must be within ${limit.min}..${limit.max}`);
    }
    const steps = (value - limit.min) / limit.step;
    if (Math.abs(steps - Math.round(steps)) > STEP_EPSILON) {
      fail(`limit ${limitId} must be on a step of ${limit.step}`);
    }
  }

  // roles: known ids, all from one role set, no duplicates.
  if (build.roles !== undefined) {
    if (!Array.isArray(build.roles)) {
      fail('roles must be an array when present');
    }
    const sets = new Set<string>();
    for (const roleId of build.roles) {
      const role = lib.roles.find((r) => r.id === roleId);
      if (!role) {
        fail(`role id not found in library: ${String(roleId)}`);
      }
      sets.add(role.set);
    }
    if (sets.size > 1) {
      fail('roles must all belong to one role set');
    }
    if (hasDuplicates(build.roles)) {
      fail('roles contains duplicates');
    }
  }
}
