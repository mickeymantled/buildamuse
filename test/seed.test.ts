// Tests: pass 9 (seed). The memory sentence a user says to Muse.
// Shape: "Remember that " + chip seed clauses joined by ", " + ". " + hard part
// clause + (domain nouns present ? " Ask me about " + nouns joined by " and " + tail : "").
// Tail is " when you need it." for one noun and " when you need them." for two or more (S7).
// Expected text comes from the library tables (chips.json seed and domainNoun,
// heart.json seedClause) and from the brief, never from compiler output.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import type { BuildV1 } from '../src/compiler/types.js';

const EM_DASH = String.fromCharCode(0x2014);

function rosterBuild(id: string): BuildV1 {
  const entry = library.roster.find((r) => r.id === id);
  if (!entry) throw new Error(`roster entry "${id}" not found`);
  return structuredClone(entry.build);
}

// Minimal valid build with a caller-chosen chip list. Hard part calmer, so the
// hard part clause is "The hard part right now is I need it calmer."
function minimalBuild(chips: string[]): BuildV1 {
  return {
    v: 1,
    base: 'chaos',
    chips,
    stats: { blunt: 1, warm: 1, funny: 1, chatty: 1, proactive: 1 },
    peeves: [],
    heart: { hardPart: 'calmer', d1: 'd1.calmer', d2: 'd2.blunt.1' },
    outfit: 'butler',
    name: 'Ada',
  };
}

const CALMER_CLAUSE = 'The hard part right now is I need it calmer.';

describe('seed: roster builds', () => {
  it('June: kids, cooking, dog, phone, hard part too much, one noun', () => {
    const { seed } = compile(rosterBuild('june'));
    expect(seed).toBe(
      "Remember that I have kids, I cook, I have a dog, I'm mostly on my phone. " +
        'The hard part right now is too much at once. ' +
        'Ask me about the family calendar when you need it.',
    );
  });

  it('Rook: engineering, founder, gaming, night owl, two nouns use the plural ending', () => {
    const { seed } = compile(rosterBuild('rook'));
    expect(seed).toBe(
      "Remember that I'm an engineer, I run a company, I game, I'm up late. " +
        'The hard part right now is I need my work checked. ' +
        'Ask me about the codebase and the company when you need them.',
    );
  });

  it('Vera: law and meetings, lowercases "My days" mid-sentence, singular ending', () => {
    const { seed } = compile(rosterBuild('vera'));
    expect(seed).toContain("I'm a lawyer, my days are meetings.");
    expect(seed.endsWith('Ask me about my matters when you need it.')).toBe(true);
  });

  it('Marty: hard part is forget, so the seed names it', () => {
    const marty = rosterBuild('marty');
    expect(marty.heart.hardPart).toBe('forget');
    const { seed } = compile(marty);
    expect(seed).toContain('The hard part right now is I forget things.');
    // One domain noun (memecoins), so singular ending.
    expect(seed).toBe(
      "Remember that I trade memecoins, I'm mostly on Solana, I follow the NBA, I'm up late. " +
        'The hard part right now is I forget things. ' +
        'Ask me about my positions when you need it.',
    );
  });
});

describe('seed: no domain nouns', () => {
  it('chips dog and gym produce no "Ask me about" tail', () => {
    const { seed } = compile(minimalBuild(['dog', 'gym']));
    expect(seed).not.toContain('Ask me about');
    expect(seed).toBe(`Remember that I have a dog, I train. ${CALMER_CLAUSE}`);
  });
});

describe('seed: no chips', () => {
  it('seed equals the hard part seed clause exactly', () => {
    const build = minimalBuild([]);
    const hardPart = library.heart.hardParts.find((h) => h.id === build.heart.hardPart);
    if (!hardPart) throw new Error('hard part not found in heart.json');
    const { seed } = compile(build);
    expect(seed).toBe(hardPart.seedClause);
    expect(seed).toBe(CALMER_CLAUSE);
    expect(seed).not.toContain('Remember that');
    expect(seed).not.toContain('Ask me about');
  });

  it('every hard part with no chips yields exactly its own seed clause', () => {
    for (const hp of library.heart.hardParts) {
      const build = minimalBuild([]);
      build.heart = { hardPart: hp.id, d1: hp.d1, d2: 'd2.blunt.1' };
      expect(compile(build).seed).toBe(hp.seedClause);
    }
  });
});

describe('seed: domain noun endings and joining', () => {
  it('one noun ends "when you need it."', () => {
    const { seed } = compile(minimalBuild(['law']));
    expect(seed).toBe(
      `Remember that I'm a lawyer. ${CALMER_CLAUSE} Ask me about my matters when you need it.`,
    );
  });

  it('two nouns join with " and " and end "when you need them."', () => {
    const { seed } = compile(minimalBuild(['law', 'sales']));
    expect(seed).toBe(
      `Remember that I'm a lawyer, I'm in sales. ${CALMER_CLAUSE} ` +
        'Ask me about my matters and my pipeline when you need them.',
    );
  });

  it('three nouns join with " and " between each and end "when you need them."', () => {
    const { seed } = compile(minimalBuild(['law', 'sales', 'founder']));
    expect(seed).toContain(
      'Ask me about my matters and my pipeline and the company when you need them.',
    );
    expect(seed.endsWith('when you need them.')).toBe(true);
  });

  it('nouns and clauses follow tap order', () => {
    const { seed } = compile(minimalBuild(['founder', 'law']));
    expect(seed).toBe(
      `Remember that I run a company, I'm a lawyer. ${CALMER_CLAUSE} ` +
        'Ask me about the company and my matters when you need them.',
    );
  });

  it('chips without a noun do not add to the noun list', () => {
    const { seed } = compile(minimalBuild(['dog', 'kids', 'gym']));
    expect(seed).toContain('Ask me about the family calendar when you need it.');
    expect(seed).not.toContain('when you need them.');
  });
});

describe('seed: clause casing and punctuation', () => {
  it('lowercases a clause that does not start with the pronoun I', () => {
    const { seed } = compile(minimalBuild(['meetings']));
    expect(seed).toBe(`Remember that my days are meetings. ${CALMER_CLAUSE}`);
  });

  it('keeps a clause starting with I or I\'m capitalized', () => {
    const { seed } = compile(minimalBuild(['dog', 'phone']));
    expect(seed.startsWith("Remember that I have a dog, I'm mostly on my phone. ")).toBe(true);
  });

  it('chip clauses lose their trailing period, so no doubled periods', () => {
    for (const entry of library.roster) {
      const { seed } = compile(structuredClone(entry.build));
      expect(seed).not.toContain('..');
      expect(seed).not.toContain(', .');
      expect(seed).not.toContain(EM_DASH);
    }
  });

  it('seed ends with a period for every roster build', () => {
    for (const entry of library.roster) {
      const { seed } = compile(structuredClone(entry.build));
      expect(seed.endsWith('.')).toBe(true);
    }
  });
});
