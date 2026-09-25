// Pass 9: seed. Builds the "Remember that ..." memory sentence from tapped chips
// and the hard part, plus a domain nouns tail when any tapped chip has one.

import type { Build, Library } from '../types.js';

// Chip seed values end with a period in the library ("I have kids."). Strip
// exactly one trailing period so clauses can be joined with commas.
function stripTrailingPeriod(clause: string): string {
  return clause.endsWith('.') ? clause.slice(0, -1) : clause;
}

// Clauses land mid-sentence after "Remember that", so lowercase the first letter
// ("My days are meetings" becomes "my days ...") unless it is the pronoun I.
function midSentence(clause: string): string {
  if (/^I\b/.test(clause)) return clause;
  return clause.charAt(0).toLowerCase() + clause.slice(1);
}

export function seed(build: Build, lib: Library): string {
  const hardPart = lib.heart.hardParts.find((h) => h.id === build.heart.hardPart);
  if (!hardPart) {
    throw new Error(`Unknown hard part: ${build.heart.hardPart}`);
  }

  const chipClauses: string[] = [];
  const nouns: string[] = [];
  for (const chipId of build.chips) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip) continue;
    if (chip.seed) {
      chipClauses.push(midSentence(stripTrailingPeriod(chip.seed)));
    }
    if (chip.domainNoun) {
      nouns.push(chip.domainNoun);
    }
  }

  // No chip seed clauses (including the no-chips case): just the hard part clause.
  const remember = chipClauses.length > 0 ? `Remember that ${chipClauses.join(', ')}. ` : '';
  const tail = nouns.length > 0 ? ` Ask me about ${nouns.join(' and ')} when you need them.` : '';

  return remember + hardPart.seedClause + tail;
}
