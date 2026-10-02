// Pass 8: Name. Picks the top two stat words plus the base noun.
// When risk is 1, Word2 is the risk level 1 word and Word1 is the top non-risk stat.
// All word and noun text comes from the library (lib.names.words, lib.bases); none of it lives here.

import type { BuildCore, Level, Library, StatId } from '../types.js';

// Fixed candidate set: every stat the Stats shape can carry. This is schema, not library text.
const ALL_STATS: StatId[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive', 'risk'];

export function buildName(build: BuildCore, lib: Library): string {
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

  const wordFor = (stat: StatId, level: Level): string | undefined =>
    lib.names.words.find((w) => w.stat === stat && (w.level === undefined || w.level === level))
      ?.word;

  const words: string[] = [];
  if (build.stats.risk === 1) {
    // Risk-Off always takes slot two; slot one is the top non-risk stat.
    const top = sorted
      .filter(({ stat }) => stat !== 'risk')
      .map(({ stat, level }) => wordFor(stat, level))
      .find((w) => w !== undefined);
    const riskOff = wordFor('risk', 1);
    if (top !== undefined && riskOff !== undefined) {
      words.push(top, riskOff);
    }
  } else {
    for (const { stat, level } of sorted) {
      if (words.length >= 2) break;
      const word = wordFor(stat, level);
      if (word !== undefined) {
        words.push(word);
      }
    }
  }

  if (words.length < 2) {
    throw new Error('buildName: fewer than two name words found for build');
  }

  return [...words, base.noun].join(' ');
}
