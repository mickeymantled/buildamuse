// Cond evaluator: a small predicate language evaluated against a Build.
// Conditions live in JSON, not in code, so every Cond shape must be handled here.

import type { Build, Chip, Cond } from './types';

export function evalCond(cond: Cond, build: Build, chips: Chip[]): boolean {
  if ('stat' in cond) {
    const level = build.stats[cond.stat];
    if (level === undefined) return false;
    if (cond.gte !== undefined && !(level >= cond.gte)) return false;
    if (cond.lte !== undefined && !(level <= cond.lte)) return false;
    if (cond.eq !== undefined && !(level === cond.eq)) return false;
    return true;
  }
  if ('chip' in cond) {
    return build.chips.includes(cond.chip);
  }
  if ('anyChipGroup' in cond) {
    return build.chips.some((id) => {
      const chip = chips.find((c) => c.id === id);
      return chip !== undefined && chip.group === cond.anyChipGroup;
    });
  }
  if ('base' in cond) {
    return build.base === cond.base;
  }
  if ('hardPart' in cond) {
    return build.heart.hardPart === cond.hardPart;
  }
  if ('all' in cond) {
    return cond.all.every((c) => evalCond(c, build, chips));
  }
  if ('any' in cond) {
    return cond.any.some((c) => evalCond(c, build, chips));
  }
  if ('not' in cond) {
    return !evalCond(cond.not, build, chips);
  }
  throw new Error('Unknown Cond: ' + JSON.stringify(cond));
}

export function evalWhen(when: Cond | undefined, build: Build, chips: Chip[]): boolean {
  if (when === undefined) return true;
  return evalCond(when, build, chips);
}
