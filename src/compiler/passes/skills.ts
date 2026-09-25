// Pass 10: skills. Turns each tapped chip's skills into a "Set up ..." or
// "<schedule>, ..." sentence, in tap order.

import type { Build, Library, SkillSentence } from '../types.js';

// Lowercase the first character unless the second character is uppercase,
// so "PR review (...)" stays put but "Standup summary (...)" becomes lowercase.
function lowerFirst(s: string): string {
  if (s.length < 2) return s.toLowerCase();
  const second = s[1];
  if (second >= 'A' && second <= 'Z') return s;
  return s[0].toLowerCase() + s.slice(1);
}

export function skills(build: Build, lib: Library): SkillSentence[] {
  const result: SkillSentence[] = [];
  for (const chipId of build.chips) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip || !chip.skills) continue;
    for (const skill of chip.skills) {
      const s = lowerFirst(skill.sentence);
      const sentence = skill.kind === 'trigger' ? `Set up ${s}.` : `${skill.schedule}, ${s}.`;
      result.push({ name: skill.name, sentence });
    }
  }
  return result;
}
