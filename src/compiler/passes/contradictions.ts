// Pass 5: contradictions. Apply the library's pair table to drop losing lines.
// The stat or chassis side always wins; each record only names what to drop.

import type { Build, Item, Library, PassResult } from '../types.js';
import { evalWhen } from '../cond.js';

// These kinds never lose a contradiction, even if a record names them.
const PROTECTED_KINDS = new Set(['chassis', 'opening', 'stat', 'drive']);

export function contradictions(items: Item[], build: Build, lib: Library): PassResult {
  const chips = lib.chips;
  const warnings: string[] = [];
  let current = items;

  for (const record of lib.contradictions) {
    if (!evalWhen(record.when, build, chips)) continue;

    const next: Item[] = [];
    for (const item of current) {
      const matches =
        item.kind === record.drop.kind &&
        !PROTECTED_KINDS.has(item.kind) &&
        (record.drop.group === undefined || item.group === record.drop.group) &&
        (record.drop.contains === undefined ||
          item.text.toLowerCase().includes(record.drop.contains.toLowerCase()));

      if (matches) {
        warnings.push(`contradiction: dropped ${item.id} (${record.id}: ${record.reason})`);
      } else {
        next.push(item);
      }
    }
    current = next;
  }

  return { items: current, warnings };
}
