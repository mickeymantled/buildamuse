// Validation, Floors, Cap, and Risk gating tests for the compiler.
// Expected values come from the spec text, not from running the compiler.

import { describe, it, expect } from 'vitest';
import { compile, library } from '../src/compiler/compile.js';
import type { Build } from '../src/compiler/types.js';

function juneBuild(): Build {
  return structuredClone(library.roster.find((r) => r.id === 'june')!.build);
}

const HONESTY_LINE =
  "If I'm about to make a mistake, any mistake, say so in the first line and say why.";
const WARM_1_LINE = "Even, calm tone. Don't perform sympathy. Get to what's useful.";
const BLUNT_1_LINE = "If I'm off track, raise it kindly and clearly before helping. Don't bury it at the end.";

describe('Validation', () => {
  it('v 0 throws', () => {
    const b = juneBuild();
    b.v = 0;
    expect(() => compile(b)).toThrow();
  });

  it('unknown base throws', () => {
    const b = juneBuild();
    // @ts-expect-error deliberately invalid base for the test
    b.base = 'wizard';
    expect(() => compile(b)).toThrow();
  });

  it('7 chips throws', () => {
    const b = juneBuild();
    b.chips = ['kids', 'cooking', 'dog', 'phone', 'gym', 'nba', 'travel'];
    expect(() => compile(b)).toThrow();
  });

  it('duplicate chip throws', () => {
    const b = juneBuild();
    b.chips = ['kids', 'kids', 'dog', 'phone'];
    expect(() => compile(b)).toThrow();
  });

  it('unknown chip id throws', () => {
    const b = juneBuild();
    b.chips = ['kids', 'cooking', 'dog', 'not_a_real_chip'];
    expect(() => compile(b)).toThrow();
  });

  it('blunt 0 throws', () => {
    const b = juneBuild();
    b.stats.blunt = 0 as unknown as 1;
    expect(() => compile(b)).toThrow();
  });

  it('warm 0 throws', () => {
    const b = juneBuild();
    b.stats.warm = 0 as unknown as 1;
    expect(() => compile(b)).toThrow();
  });

  it('funny 5 throws', () => {
    const b = juneBuild();
    b.stats.funny = 5 as unknown as 4;
    expect(() => compile(b)).toThrow();
  });

  it('chatty 2.5 throws', () => {
    const b = juneBuild();
    b.stats.chatty = 2.5 as unknown as 2;
    expect(() => compile(b)).toThrow();
  });

  it('stats summing to 15 throws (June with funny 4)', () => {
    const b = juneBuild();
    // June sums to 14 (2+3+3+2+4). Bumping funny from 3 to 4 makes it 15.
    b.stats.funny = 4;
    expect(() => compile(b)).toThrow();
  });

  it('risk present with no Markets chip throws', () => {
    const b = juneBuild();
    b.stats.risk = 2;
    expect(() => compile(b)).toThrow();
  });

  it('Markets chip present with risk absent throws', () => {
    const b = juneBuild();
    // Drop a Life chip to stay under 6 chips, then add a Markets chip without risk.
    b.chips = ['kids', 'cooking', 'phone', 'stocks'];
    expect(() => compile(b)).toThrow();
  });

  it('6 peeves throws', () => {
    const b = juneBuild();
    b.peeves = [
      'over_explains',
      'bullets_everything',
      'corporate_speak',
      'lectures_me',
      'narrates',
      'uses_my_name',
    ];
    expect(() => compile(b)).toThrow();
  });

  it('duplicate peeve throws', () => {
    const b = juneBuild();
    b.peeves = ['over_explains', 'over_explains'];
    expect(() => compile(b)).toThrow();
  });

  it('unknown peeve throws', () => {
    const b = juneBuild();
    b.peeves = ['not_a_real_peeve'];
    expect(() => compile(b)).toThrow();
  });

  it('unknown hardPart throws', () => {
    const b = juneBuild();
    // @ts-expect-error deliberately invalid hardPart for the test
    b.heart.hardPart = 'not_a_real_hard_part';
    expect(() => compile(b)).toThrow();
  });

  it("d1 = 'd1.chip.law' without law tapped throws", () => {
    const b = juneBuild();
    b.heart.d1 = 'd1.chip.law';
    expect(() => compile(b)).toThrow();
  });

  it("d1 = 'd1.chip.kids' when kids IS tapped does not throw", () => {
    const b = juneBuild();
    // June's chips already include kids.
    b.heart.d1 = 'd1.chip.kids';
    expect(() => compile(b)).not.toThrow();
  });

  it("d2 = 'd1.too_much' (wrong slot) throws", () => {
    const b = juneBuild();
    b.heart.d2 = 'd1.too_much';
    expect(() => compile(b)).toThrow();
  });

  it('unknown outfit throws', () => {
    const b = juneBuild();
    b.outfit = 'not_a_real_outfit';
    expect(() => compile(b)).toThrow();
  });

  it("name '' throws", () => {
    const b = juneBuild();
    b.name = '';
    expect(() => compile(b)).toThrow();
  });

  it("name '   ' throws", () => {
    const b = juneBuild();
    b.name = '   ';
    expect(() => compile(b)).toThrow();
  });

  it('name of 25 chars throws', () => {
    const b = juneBuild();
    b.name = 'a'.repeat(25);
    expect(() => compile(b)).toThrow();
  });

  it('name of exactly 24 chars does not throw', () => {
    const b = juneBuild();
    b.name = 'a'.repeat(24);
    expect(() => compile(b)).not.toThrow();
  });

  it("name ' June ' (padded, trims to 4) does not throw", () => {
    const b = juneBuild();
    b.name = ' June ';
    expect(() => compile(b)).not.toThrow();
  });

  it('every roster build compiles without throwing', () => {
    for (const entry of library.roster) {
      const b = structuredClone(entry.build);
      expect(() => compile(b)).not.toThrow();
    }
  });

  it('a build summing to exactly 14 compiles', () => {
    const b = juneBuild();
    // June's stats already sum to exactly 14 (2+3+3+2+4).
    expect(() => compile(b)).not.toThrow();
  });
});

describe('Floors', () => {
  it('blunt at 0 rejected', () => {
    const b = juneBuild();
    b.stats.blunt = 0 as unknown as 1;
    expect(() => compile(b)).toThrow();
  });

  it('warm at 0 rejected', () => {
    const b = juneBuild();
    b.stats.warm = 0 as unknown as 1;
    expect(() => compile(b)).toThrow();
  });

  it('a build with blunt 1 and warm 1 compiles and its soul contains both floor lines', () => {
    const b = juneBuild();
    b.stats.blunt = 1;
    b.stats.warm = 1;
    // Keep the stat sum at or under the cap of 14: 1+1+3+2+4 = 11.
    const result = compile(b);
    expect(result.soul).toContain(BLUNT_1_LINE);
    expect(result.soul).toContain(WARM_1_LINE);
  });

  it('every output contains the honesty and care lines (roster builds)', () => {
    for (const entry of library.roster) {
      const b = structuredClone(entry.build);
      const result = compile(b);
      expect(result.soul).toContain(HONESTY_LINE);
      // Honesty is the blunt stat line; care is the warm stat line.
      const bluntStatLine = library.stats.find(
        (s) => s.stat === 'blunt' && s.level === b.stats.blunt,
      );
      expect(bluntStatLine).toBeDefined();
      expect(result.soul).toContain(bluntStatLine!.line);
      const warmLevel = b.stats.warm;
      const warmStatLine = library.stats.find(
        (s) => s.stat === 'warm' && s.level === warmLevel,
      );
      expect(warmStatLine).toBeDefined();
      expect(result.soul).toContain(warmStatLine!.line);
    }
  });
});

describe('Cap', () => {
  it('a build summing to 15 is rejected', () => {
    const b = juneBuild();
    // June sums to 14 (2+3+3+2+4); bump funny to 4 to hit 15.
    b.stats.funny = 4;
    expect(() => compile(b)).toThrow();
  });
});

describe('Risk gating', () => {
  it('risk present without a Markets chip is rejected', () => {
    const b = juneBuild();
    b.stats.risk = 3;
    expect(() => compile(b)).toThrow();
  });

  it('Markets chip present without risk is rejected', () => {
    const b = juneBuild();
    b.chips = ['kids', 'cooking', 'phone', 'crypto'];
    expect(() => compile(b)).toThrow();
  });

  it.each([1, 2, 3, 4] as const)('a Markets build with risk %i compiles', (riskLevel) => {
    const b = juneBuild();
    b.chips = ['kids', 'cooking', 'phone', 'options'];
    // Keep the other five stats low so adding any risk level stays under the cap of 14.
    b.stats = { blunt: 1, warm: 1, funny: 1, chatty: 1, proactive: 1, risk: riskLevel };
    expect(() => compile(b)).not.toThrow();
  });
});
