// Pass: trim the soul under the max length by dropping low-priority lines.

import type { Build, Item, Library, PassResult } from '../types.js';
import { render } from './render.js';

export const MAX_SOUL_LENGTH = 3200;

// Finds the chip-trigger item for a chip at a given trigger index, if present.
function findTrigger(items: Item[], chip: string, triggerIndex: number): Item | undefined {
  return items.find(
    (it) => it.kind === 'chip-trigger' && it.chip === chip && it.triggerIndex === triggerIndex
  );
}

// Finds the voice item for a chip, if present.
function findVoice(items: Item[], chip: string): Item | undefined {
  return items.find((it) => it.kind === 'voice' && it.chip === chip);
}

// Builds the ordered drop candidate list per the documented priority order.
function buildCandidates(items: Item[], build: Build, lib: Library): Item[] {
  const reverseTapped = [...build.chips].reverse();
  const candidates: Item[] = [];
  const seen = new Set<string>();

  function add(item: Item | undefined): void {
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      candidates.push(item);
    }
  }

  // 1. Work/Markets chips, last-tapped back: third trigger, then second.
  // First trigger of a Work/Markets chip is never a candidate.
  for (const chipId of reverseTapped) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip || (chip.group !== 'Work' && chip.group !== 'Markets')) continue;
    add(findTrigger(items, chipId, 2));
    add(findTrigger(items, chipId, 1));
  }

  // 2. Life/Time chips, last-tapped back: all triggers, highest index first.
  for (const chipId of reverseTapped) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip || (chip.group !== 'Life' && chip.group !== 'Time')) continue;
    const triggers = items.filter((it) => it.kind === 'chip-trigger' && it.chip === chipId);
    const sorted = [...triggers].sort((a, b) => (b.triggerIndex ?? 0) - (a.triggerIndex ?? 0));
    for (const t of sorted) add(t);
  }

  // 3. Voice lines, last-tapped back.
  for (const chipId of reverseTapped) {
    add(findVoice(items, chipId));
  }

  return candidates;
}

export function length(items: Item[], build: Build, lib: Library): PassResult {
  let current = items;
  let soulLength = render(current, lib).soul.length;

  if (soulLength <= MAX_SOUL_LENGTH) {
    return { items: current, warnings: [] };
  }

  const candidates = buildCandidates(items, build, lib);
  const warnings: string[] = [];

  for (const candidate of candidates) {
    if (soulLength <= MAX_SOUL_LENGTH) break;
    current = current.filter((it) => it.id !== candidate.id);
    warnings.push(`length: dropped ${candidate.id} (soul over 3200)`);
    soulLength = render(current, lib).soul.length;
  }

  if (soulLength > MAX_SOUL_LENGTH) {
    warnings.push(`length: soul is ${soulLength} characters, over 3200 with nothing left to drop`);
  }

  return { items: current, warnings };
}
