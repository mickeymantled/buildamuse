// Defaults and repairs shared by the builder store and the share decoder. Pure, no I/O.
// Moved out of the store so a decoded link and a tapped build fill the same gaps the same way.

import type {
  BaseId,
  DriveId,
  HardPartId,
  Level,
  Library,
  OutfitId,
  Stats,
} from './types.js';
import { STAT_CAP } from './passes/validate.js';
import library from '../library/index.js';

// Fills for a build with no pick yet (U2, U3), so the preview strip always compiles.
export const FALLBACK_BASE: BaseId = 'chaos';
export const FALLBACK_HARD_PART: HardPartId = 'calmer';
export const FALLBACK_OUTFIT: OutfitId = 'has_it_together';

// The stats shed one point at a time, highest first, when a new risk stat needs room (U1).
const SHED_ORDER = ['funny', 'chatty', 'proactive'] as const;

function statTotal(stats: Stats): number {
  return (
    stats.blunt + stats.warm + stats.funny + stats.chatty + stats.proactive + (stats.risk ?? 0)
  );
}

function withoutRisk(stats: Stats): Stats {
  const { blunt, warm, funny, chatty, proactive } = stats;
  return { blunt, warm, funny, chatty, proactive };
}

// U1: risk starts at 2. If that passes the cap it starts at 1, and if that still passes the cap the
// highest of funny, chatty and proactive drops by 1. Blunt and warm never move.
export function addRisk(stats: Stats): Stats {
  const base = withoutRisk(stats);
  if (statTotal(base) + 2 <= STAT_CAP) return { ...base, risk: 2 };
  const out: Stats = { ...base, risk: 1 };
  while (statTotal(out) > STAT_CAP) {
    const top = SHED_ORDER.reduce<(typeof SHED_ORDER)[number]>(
      (hi, s) => (out[s] > out[hi] ? s : hi),
      SHED_ORDER[0],
    );
    if (out[top] <= 1) break;
    out[top] = (out[top] - 1) as Level;
  }
  return out;
}

// The d2 drive that follows a blunt level. `lib` defaults to the shipped library.
export function d2ForBlunt(blunt: Level, lib: Library = library): DriveId {
  const drive = lib.heart.drives.find(
    (d) =>
      d.slot === 'd2' &&
      d.when !== undefined &&
      'stat' in d.when &&
      d.when.stat === 'blunt' &&
      d.when.eq === blunt,
  );
  return drive?.id ?? `d2.blunt.${blunt}`;
}

// Drops format characters (\p{Cf}: zero-width, bidi controls, Unicode tags, soft hyphen, BOM) and
// private-use characters (\p{Co}) with no replacement, so a hidden character cannot split a word or
// add a gap. Then it replaces every control character and every run of whitespace with one space,
// and the em and en dash with "-". It does not trim, so a name can be typed one character at a time.
// Dropping ZWJ (U+200D) splits a joined emoji such as a family into its parts; variation selectors,
// skin tones and flags made of regional indicators are kept.
export function cleanName(s: string): string {
  return s
    .replace(/[\p{Cf}\p{Co}]+/gu, '')
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .replace(/[\u2013\u2014]/g, '-');
}
