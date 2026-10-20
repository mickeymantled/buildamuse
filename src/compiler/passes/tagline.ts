// Tagline (B19): the line under the build name for a build that is not a roster starter.
// "Your <first Work or Markets chip label> <base noun>.", or "Your <base noun>." with no such chip.
// Both templates are library text (lib.names.taglines); the chip label and the base noun fill them,
// lowercased. Starters keep their hand-written roster tagline, so the caller decides who gets this.

import { fill } from '../fill.js';
import type { BuildCore, ChipGroup, Library } from '../types.js';

// The chip groups whose label can lead the tagline. This is schema, not library text.
const TAGLINE_GROUPS: readonly ChipGroup[] = ['Work', 'Markets'];

export interface Tagline {
  text: string;
  ids: string[]; // the template id, the chip id when one filled the slot, then the base id
}

export function taglineOf(build: BuildCore, lib: Library): Tagline {
  const base = lib.bases.find((b) => b.id === build.base);
  if (!base) {
    throw new Error(`taglineOf: no base found for id "${build.base}"`);
  }
  const noun = base.noun.toLowerCase();

  // Tap order is the order of build.chips. An id the library does not know is skipped.
  const chip = build.chips
    .map((id) => lib.chips.find((c) => c.id === id))
    .find((c) => c !== undefined && TAGLINE_GROUPS.includes(c.group));

  if (chip === undefined) {
    const template = lib.names.taglines.base;
    return { text: fill(template.line, { noun }), ids: [template.id, base.id] };
  }
  const template = lib.names.taglines.chip;
  return {
    text: fill(template.line, { chip: chip.label.toLowerCase(), noun }),
    ids: [template.id, chip.id, base.id],
  };
}
