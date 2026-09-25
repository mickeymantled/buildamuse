// Pass 4: dedupe. Drops lines that restate a chassis line, peeves covered by an
// already-emitted badge, badge lines that repeat a chip trigger, chip triggers or
// hard part extras folded into a surviving badge line, and any remaining exact repeat.

import type { Item, Library, Resolved, PassResult } from '../types.js';
import { normalize } from './normalize.js';

function warn(id: string, reason: string): string {
  return `dedupe: dropped ${id} (${reason})`;
}

export function dedupe(items: Item[], lib: Library, resolved: Resolved): PassResult {
  const warnings: string[] = [];
  let remaining = items;

  // 1. Chassis restatement: drop any non-chassis, non-opening item whose
  // normalized text equals a chassis line's normalized text.
  const chassisNorms = lib.chassis.lines.map((line) => normalize(line.line));
  remaining = remaining.filter((item) => {
    if (item.kind === 'chassis' || item.kind === 'opening') return true;
    const matches = chassisNorms.includes(normalize(item.text));
    if (matches) warnings.push(warn(item.id, 'restates chassis line'));
    return !matches;
  });

  // 2. Peeves covered: drop peeve items whose peeve record dedupes with a
  // badge that is already emitted.
  remaining = remaining.filter((item) => {
    if (item.kind !== 'peeve') return true;
    const peeve = lib.peeves.find((p) => p.id === item.id);
    const covered = peeve?.dedupesWith?.some((id) => resolved.badges.includes(id)) ?? false;
    if (covered) warnings.push(warn(item.id, 'peeve covered by badge'));
    return !covered;
  });

  // 3. Badge equals trigger: drop badge items whose normalized text equals a
  // remaining chip-trigger item's normalized text.
  const triggerNorms = remaining
    .filter((item) => item.kind === 'chip-trigger')
    .map((item) => normalize(item.text));
  remaining = remaining.filter((item) => {
    if (item.kind !== 'badge') return true;
    const matches = triggerNorms.includes(normalize(item.text));
    if (matches) warnings.push(warn(item.id, 'badge equals chip trigger'));
    return !matches;
  });

  // 4. Contained in badge: drop chip-trigger or hardpart-extra items whose
  // normalized text is a substring of a remaining badge item's normalized text.
  // The badge line itself stays.
  const badgeNorms = remaining
    .filter((item) => item.kind === 'badge')
    .map((item) => normalize(item.text));
  remaining = remaining.filter((item) => {
    if (item.kind !== 'chip-trigger' && item.kind !== 'hardpart-extra') return true;
    const norm = normalize(item.text);
    const contained = badgeNorms.some((badgeNorm) => badgeNorm.includes(norm));
    if (contained) warnings.push(warn(item.id, 'contained in badge'));
    return !contained;
  });

  // 5. Exact repeats: among the remaining items that are not chassis, opening
  // or example, drop any item whose normalized text equals an earlier such
  // item's normalized text. Keep the first.
  const seen = new Set<string>();
  remaining = remaining.filter((item) => {
    if (item.kind === 'chassis' || item.kind === 'opening' || item.kind === 'example') {
      return true;
    }
    const norm = normalize(item.text);
    if (seen.has(norm)) {
      warnings.push(warn(item.id, 'exact repeat'));
      return false;
    }
    seen.add(norm);
    return true;
  });

  return { items: remaining, warnings };
}
