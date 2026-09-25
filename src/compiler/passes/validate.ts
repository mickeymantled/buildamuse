// Pass 1: validate a Build against a Library. Pure. Throws on the first violation found.

import type { Build, Library, StatId } from '../types.js';

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

export function validate(build: Build, lib: Library): void {
  // 1. v is a positive integer.
  if (!isPositiveInteger(build.v)) {
    fail('v must be a positive integer');
  }

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

  // 12. name is a string whose trimmed length is 1..24.
  if (typeof build.name !== 'string') {
    fail('name must be a string');
  }
  const trimmedLength = build.name.trim().length;
  if (trimmedLength < 1 || trimmedLength > 24) {
    fail('name trimmed length must be 1..24');
  }
}
