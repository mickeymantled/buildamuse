// Pass 8: Name. Picks the top two stat words plus the base noun.
// All word and noun text comes from the library (lib.names.words, lib.bases); none of it lives here.

import type { Build, Level, Library, StatId } from '../types.js';

// Fixed candidate set: every stat the Stats shape can carry. This is schema, not library text.
const ALL_STATS: StatId[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive', 'risk'];

export function buildName(build: Build, lib: Library): string {
  const base = lib.bases.find((b) => b.id === build.base);
  if (!base) {
    throw new Error(`buildName: no base found for id "${build.base}"`);
  }

  const order = lib.names.order;
  const orderIndex = (stat: StatId): number => {
    const idx = order.indexOf(stat);
    return idx === -1 ? order.length : idx;
  };

  const candidates: Array<{ stat: StatId; level: Level }> = ALL_STATS.filter(
    (stat) => build.stats[stat] !== undefined
  ).map((stat) => ({ stat, level: build.stats[stat] as Level }));

  const sorted = candidates.slice().sort((a, b) => {
    if (a.level !== b.level) return b.level - a.level;
    return orderIndex(a.stat) - orderIndex(b.stat);
  });

  const words: string[] = [];
  for (const { stat, level } of sorted) {
    if (words.length >= 2) break;
    const match = lib.names.words.find(
      (w) => w.stat === stat && (w.level === undefined || w.level === level)
    );
    if (match) {
      words.push(match.word);
    }
  }

  if (words.length < 2) {
    throw new Error('buildName: fewer than two name words found for build');
  }

  return [...words, base.noun].join(' ');
}
