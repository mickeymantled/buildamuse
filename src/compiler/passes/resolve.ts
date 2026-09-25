// Pass 2: resolve conditions. Evaluate every Cond in the library once against the build.
// Produces the active set of badges, chassis variants, drive variants and example rows.

import type { Build, ChipGroup, Library, Resolved, BadgeId } from '../types.js';
import { evalCond, evalWhen } from '../cond.js';

const DOMAIN_GROUPS: ChipGroup[] = ['Work', 'Markets'];

export function resolve(build: Build, lib: Library): Resolved {
  const chips = lib.chips;

  // Badges: library order, when holds, or the id is the hard part's forceBadge. No duplicates.
  const hardPart = lib.heart.hardParts.find((h) => h.id === build.heart.hardPart);
  const forceBadge = hardPart?.forceBadge;
  const badges: BadgeId[] = [];
  for (const badge of lib.badges) {
    const active = evalCond(badge.when, build, chips) || badge.id === forceBadge;
    if (active && !badges.includes(badge.id)) {
      badges.push(badge.id);
    }
  }

  // Chassis: every line whose when holds, kept in library order.
  const chassis = lib.chassis.lines.filter((line) => evalWhen(line.when, build, chips));

  // d3: first drive in library order with slot d3 whose when holds.
  const d3 = lib.heart.drives.find((d) => d.slot === 'd3' && evalWhen(d.when, build, chips));
  if (!d3) {
    throw new Error('No d3 drive matches');
  }

  // Greeting: first greetings row whose when holds.
  const greeting = lib.examples.greetings.find((g) => evalCond(g.when, build, chips));
  if (!greeting) {
    throw new Error('No greeting row matches');
  }

  // Domain: first Work or Markets chip in tap order with a matching row wins, else default.
  let domain: Library['examples']['domains'][number] | undefined;
  for (const chipId of build.chips) {
    const chip = chips.find((c) => c.id === chipId);
    if (!chip || !DOMAIN_GROUPS.includes(chip.group)) continue;
    const row = lib.examples.domains.find(
      (d) => d.chip === chipId && evalWhen(d.when, build, chips),
    );
    if (row) {
      domain = row;
      break;
    }
  }
  if (!domain) {
    domain = lib.examples.domains.find((d) => d.chip === 'default');
  }
  if (!domain) {
    throw new Error('No default domain row found');
  }

  return { badges, chassis, d3, greeting, domain };
}
