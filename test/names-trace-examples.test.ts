// Tests for Names, Trace, and Examples behaviors.
// Expected values come from the spec/library text in the task prompt, never from
// copying compiler output.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import { libraryIds, trace, traceLine } from '../src/compiler/trace.js';
import type { Build } from '../src/compiler/types.js';

function findRoster(id: string) {
  const entry = library.roster.find((r) => r.id === id);
  if (!entry) throw new Error(`roster entry not found: ${id}`);
  return entry;
}

// A minimal, valid, self-contained build used as the starting point for
// constructed test builds. hardPart/d1 are fixed so heart.d1 validation
// (d1 === hardPart.d1) always holds no matter what chips are tapped.
function baseBuild(): Build {
  return {
    v: 1,
    base: 'operator',
    chips: [],
    stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 },
    peeves: [],
    heart: { hardPart: 'talk_it_through', d1: 'd1.talk_it_through', d2: 'd2.blunt.2' },
    outfit: 'butler',
    name: 'Test',
  };
}

describe('Names', () => {
  it('all nine roster builds compile to their roster buildName', () => {
    expect(library.roster.length).toBe(9);
    for (const entry of library.roster) {
      const result = compile(entry.build, library);
      expect(result.buildName).toBe(entry.buildName);
    }
  });

  it('Rook compiles to "Blunt Feral Reviewer"', () => {
    const rook = findRoster('rook');
    const result = compile(rook.build, library);
    expect(result.buildName).toBe('Blunt Feral Reviewer');
  });

  it('June compiles to "Two-Way Steady Playmaker"', () => {
    const june = findRoster('june');
    const result = compile(june.build, library);
    expect(result.buildName).toBe('Two-Way Steady Playmaker');
  });

  it('Marty compiles to "Blunt Degen Trench Companion"', () => {
    const marty = findRoster('marty');
    const result = compile(marty.build, library);
    expect(result.buildName).toBe('Blunt Degen Trench Companion');
  });

  it('Odds compiles to "Blunt Risk-On Trench Companion"', () => {
    const odds = findRoster('odds');
    const result = compile(odds.build, library);
    expect(result.buildName).toBe('Blunt Risk-On Trench Companion');
  });

  describe('constructed tiebreaks', () => {
    // Base builder chips (engineering, founder, gaming, night_owl), peeves
    // cleared per the case instructions. Only stats (and d2, to keep the
    // build internally consistent) change per case.
    function builderTieBuild(stats: Build['stats']): Build {
      const build = structuredClone(findRoster('rook').build);
      build.stats = stats;
      build.peeves = [];
      build.heart.d2 = `d2.blunt.${stats.blunt}`;
      return build;
    }

    it('blunt 3, warm 3, funny 3, chatty 1, proactive 1 -> "Blunt Steady Reviewer"', () => {
      const build = builderTieBuild({ blunt: 3, warm: 3, funny: 3, chatty: 1, proactive: 1 });
      const result = compile(build, library);
      expect(result.buildName).toBe('Blunt Steady Reviewer');
    });

    it('blunt 4, warm 1, funny 2, chatty 1, proactive 2 -> "Blunt Feral Reviewer" (funny beats proactive)', () => {
      const build = builderTieBuild({ blunt: 4, warm: 1, funny: 2, chatty: 1, proactive: 2 });
      const result = compile(build, library);
      expect(result.buildName).toBe('Blunt Feral Reviewer');
    });

    it('blunt 3, warm 1, funny 1, chatty 2, proactive 2 -> "Blunt Two-Way Reviewer" (proactive beats chatty)', () => {
      const build = builderTieBuild({ blunt: 3, warm: 1, funny: 1, chatty: 2, proactive: 2 });
      const result = compile(build, library);
      expect(result.buildName).toBe('Blunt Two-Way Reviewer');
    });

    it('trader with stocks, blunt 2/warm 1/funny 1/chatty 1/proactive 1/risk 2 -> "Blunt Steady Trench Companion" (risk 2 silent)', () => {
      const build = structuredClone(findRoster('rook').build);
      build.base = 'trader';
      build.chips = ['stocks'];
      build.stats = { blunt: 2, warm: 1, funny: 1, chatty: 1, proactive: 1, risk: 2 };
      build.peeves = [];
      build.heart = { hardPart: 'talk_it_through', d1: 'd1.talk_it_through', d2: 'd2.blunt.2' };
      build.outfit = 'librarian';
      const result = compile(build, library);
      expect(result.buildName).toBe('Blunt Steady Trench Companion');
    });

    it('trader with stocks, blunt 3/warm 1/funny 1/chatty 1/proactive 1/risk 4 -> "Degen Blunt Trench Companion"', () => {
      const build = structuredClone(findRoster('rook').build);
      build.base = 'trader';
      build.chips = ['stocks'];
      build.stats = { blunt: 3, warm: 1, funny: 1, chatty: 1, proactive: 1, risk: 4 };
      build.peeves = [];
      build.heart = { hardPart: 'talk_it_through', d1: 'd1.talk_it_through', d2: 'd2.blunt.3' };
      build.outfit = 'librarian';
      const result = compile(build, library);
      expect(result.buildName).toBe('Degen Blunt Trench Companion');
    });
  });
});

describe('Trace', () => {
  it('every soulLines id is in libraryIds(library), for all roster builds plus June with funny 1', () => {
    const ids = libraryIds(library);
    const builds: Build[] = library.roster.map((entry) => entry.build);

    const juneFunny1 = structuredClone(findRoster('june').build);
    juneFunny1.stats = { ...juneFunny1.stats, funny: 1 };
    builds.push(juneFunny1);

    for (const build of builds) {
      const result = compile(build, library);
      expect(result.soulLines.map((l) => l.text).join('\n')).toBe(result.soul);
      for (const line of result.soulLines) {
        expect(ids.has(line.id)).toBe(true);
      }
    }
  });

  it('traceLine finds June\'s d1 line by its record id', () => {
    const june = findRoster('june');
    const result = compile(june.build, library);
    const id = traceLine(
      result.soulLines,
      '- To keep the whole picture. Everything on one board, nothing falling off it.',
    );
    expect(id).toBe('d1.too_much');
  });

  it('trace() throws when one soulLines entry\'s id is replaced with "bogus.id"', () => {
    const june = findRoster('june');
    const result = compile(june.build, library);
    const tampered = structuredClone(result.soulLines);
    expect(tampered.length).toBeGreaterThan(0);
    tampered[0].id = 'bogus.id';
    expect(() => trace(result.soul, tampered, library)).toThrow();
  });
});

describe('Examples', () => {
  function makeBuild(overrides: {
    base?: Build['base'];
    chips?: string[];
    stats: Build['stats'];
  }): Build {
    const build = baseBuild();
    if (overrides.base) build.base = overrides.base;
    if (overrides.chips) build.chips = overrides.chips;
    build.stats = overrides.stats;
    build.heart.d2 = `d2.blunt.${overrides.stats.blunt}`;
    return build;
  }

  function soulHas(soul: string, line: string): boolean {
    return soul.split('\n').includes(line);
  }

  describe('greeting row selection', () => {
    it('chatty 1, funny 1 (any warm) -> "Hi. What do you need?"', () => {
      const build = makeBuild({ stats: { blunt: 2, warm: 2, funny: 1, chatty: 1, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'You: Hi. What do you need?')).toBe(true);
    });

    it('chatty 1, funny 2+, warm <= 2 -> "Yo. What\'s up."', () => {
      const build = makeBuild({ stats: { blunt: 2, warm: 1, funny: 2, chatty: 1, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, "You: Yo. What's up.")).toBe(true);
    });

    it('chatty 1, funny 2+, warm 2 -> uses the warm 1 row ("Yo. What\'s up.")', () => {
      const build = makeBuild({ stats: { blunt: 2, warm: 2, funny: 2, chatty: 1, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, "You: Yo. What's up.")).toBe(true);
    });

    it('chatty 1, funny 2+, warm 3+ -> "Hey you. What\'s going on?"', () => {
      const build = makeBuild({ stats: { blunt: 2, warm: 3, funny: 2, chatty: 1, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, "You: Hey you. What's going on?")).toBe(true);
    });

    it('chatty 2+, funny 1 (any warm) -> "Hi. What can I take off your plate?"', () => {
      const build = makeBuild({ stats: { blunt: 2, warm: 2, funny: 1, chatty: 2, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'You: Hi. What can I take off your plate?')).toBe(true);
    });

    it('chatty 2+, funny 2+, warm <= 2 -> "Hey. What are we dealing with today."', () => {
      const build = makeBuild({ stats: { blunt: 2, warm: 1, funny: 2, chatty: 2, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'You: Hey. What are we dealing with today.')).toBe(true);
    });

    it('chatty 2+, funny 2+, warm 2 -> uses the warm 1 row ("Hey. What are we dealing with today.")', () => {
      const build = makeBuild({ stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'You: Hey. What are we dealing with today.')).toBe(true);
    });

    it('chatty 2+, funny 2+, warm 3+ -> "Hey! Good to see you. What\'s on your mind?"', () => {
      const build = makeBuild({ stats: { blunt: 2, warm: 3, funny: 2, chatty: 2, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, "You: Hey! Good to see you. What's on your mind?")).toBe(true);
    });
  });

  describe('domain row selection', () => {
    it('law, blunt 3 -> blunt column', () => {
      const build = makeBuild({ chips: ['law'], stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'Me: can you send the draft to opposing counsel')).toBe(true);
      expect(
        soulHas(
          soul,
          "You: Not yet. Paragraph 3 cites the wrong rule and the date in the header is last month's. Fix those and I'll send.",
        ),
      ).toBe(true);
    });

    it('law, blunt 2 -> gentle column', () => {
      const build = makeBuild({ chips: ['law'], stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2 } });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'Me: can you send the draft to opposing counsel')).toBe(true);
      expect(
        soulHas(
          soul,
          "You: Before I send: paragraph 3 cites the wrong rule and the header date looks like last month's. Want me to fix both first?",
        ),
      ).toBe(true);
    });

    it('engineering tapped first (before law) -> engineering row', () => {
      const build = makeBuild({
        chips: ['engineering', 'law'],
        stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'Me: ship it')).toBe(true);
      expect(
        soulHas(
          soul,
          'You: Blocking on one thing: the retry loop has no backoff, so a flaky API takes the whole worker down. Two-line fix. Then ship.',
        ),
      ).toBe(true);
    });

    it('consulting then law (consulting has no row) -> law row', () => {
      const build = makeBuild({
        chips: ['consulting', 'law'],
        stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'Me: can you send the draft to opposing counsel')).toBe(true);
      expect(
        soulHas(
          soul,
          "You: Not yet. Paragraph 3 cites the wrong rule and the date in the header is last month's. Fix those and I'll send.",
        ),
      ).toBe(true);
    });

    it('memecoins, risk 3 -> risk_hi row, blunt column', () => {
      const build = makeBuild({
        chips: ['memecoins'],
        stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 3 },
      });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'Me: thinking of aping this one, chart looks insane')).toBe(true);
      expect(
        soulHas(
          soul,
          'You: You\'re chasing. Top 10 wallets hold 41% and the "community" is one account and its alts. Meme\'s actually funny, which is the only reason it isn\'t zero yet. I\'d wait for a flush. Your call.',
        ),
      ).toBe(true);
    });

    it('memecoins, risk 2 -> risk_lo row, gentle column', () => {
      const build = makeBuild({
        chips: ['memecoins'],
        stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 2 },
      });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'Me: thinking of aping this one, chart looks insane')).toBe(true);
      expect(
        soulHas(
          soul,
          "You: Let me give you the downside first: 41% in ten wallets and the LP isn't locked. I'd sit this one out, but if you want in, keep it small.",
        ),
      ).toBe(true);
    });

    it('no Work/Markets chips (only kids, dog) -> default row (Q11)', () => {
      const build = makeBuild({
        chips: ['kids', 'dog'],
        stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'Me: can you handle the thing with the landlord')).toBe(true);
      expect(
        soulHas(soul, "You: Done. Email's in your drafts, sounds like you, no jokes. Send when you're ready."),
      ).toBe(true);
    });

    it('founder, blunt 3 -> blunt column', () => {
      const build = makeBuild({
        chips: ['founder'],
        stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 },
      });
      const { soul } = compile(build, library);
      expect(soulHas(soul, 'Me: I want to add a referral program this sprint')).toBe(true);
      expect(soulHas(soul, 'You: It displaces the onboarding fix. Which one?')).toBe(true);
    });
  });

  it('renders the examples block as Me/You/blank/Me/You', () => {
    const build = makeBuild({ chips: ['law'], stats: { blunt: 3, warm: 2, funny: 2, chatty: 2, proactive: 2 } });
    const { soul } = compile(build, library);
    const lines = soul.split('\n');
    const headingIdx = lines.indexOf('## How this sounds');
    expect(headingIdx).toBeGreaterThanOrEqual(0);
    const block = lines.slice(headingIdx + 1, headingIdx + 6);
    expect(block[0]).toBe('Me: hey');
    expect(block[1].startsWith('You: ')).toBe(true);
    expect(block[2]).toBe('');
    expect(block[3].startsWith('Me: ')).toBe(true);
    expect(block[4].startsWith('You: ')).toBe(true);
  });
});
