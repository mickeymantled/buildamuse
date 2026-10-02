// Pass 9: seed. Builds the "Remember that ..." memory sentence from tapped chips
// and the hard part, plus a domain nouns tail when any tapped chip has one.

import type { BuildCore, Library, WorkflowPack } from '../types.js';

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

// packClauses (pack seed lines) follow the chip clauses and get the same treatment.
export function seed(build: BuildCore, lib: Library, packClauses: string[] = []): string {
  const hardPart = lib.heart.hardParts.find((h) => h.id === build.heart.hardPart);
  if (!hardPart) {
    throw new Error(`Unknown hard part: ${build.heart.hardPart}`);
  }

  const clauses: string[] = [];
  const nouns: string[] = [];
  for (const chipId of build.chips) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip) continue;
    if (chip.seed) {
      clauses.push(midSentence(stripTrailingPeriod(chip.seed)));
    }
    if (chip.domainNoun) {
      nouns.push(chip.domainNoun);
    }
  }
  for (const clause of packClauses) {
    clauses.push(midSentence(stripTrailingPeriod(clause)));
  }

  // No chip or pack clauses (including the no-chips case): just the hard part clause.
  const remember = clauses.length > 0 ? `Remember that ${clauses.join(', ')}. ` : '';
  // S7: singular ending for one noun, plural for two or more.
  const ending = nouns.length === 1 ? 'when you need it.' : 'when you need them.';
  const tail = nouns.length > 0 ? ` Ask me about ${nouns.join(' and ')} ${ending}` : '';

  return remember + hardPart.seedClause + tail;
}

// Record ids behind the seed text, in the order the clauses appear: chip clauses, pack
// clauses, then the hard part clause.
export function seedIds(build: BuildCore, lib: Library, packs: WorkflowPack[]): string[] {
  const ids: string[] = [];
  for (const chipId of build.chips) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (chip?.seed) {
      ids.push(`chip.${chip.id}.seed`);
    }
  }
  for (const pack of packs) {
    for (const line of pack.seeds) {
      ids.push(line.id);
    }
  }
  ids.push(`heart.${build.heart.hardPart}.seedClause`);
  return ids;
}
