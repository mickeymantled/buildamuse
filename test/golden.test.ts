// Golden compile tests. Every .md file in test/golden/v2/ is a committed, expected render for one
// golden spec: a roster starter compiled on one profile (nine starters x six profiles = 54, Marty
// and June on the other three ChatGPT modes = 6 more, plus four role goldens = 64). This test
// recompiles each spec from the current library and compiler and asserts an exact match, so a
// library edit that changes output has to come with a golden update (npm run golden). It also
// asserts every golden file maps to a spec, so a stale or misspelled file is caught too.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { compile, library } from '../src/compiler/compile.js';
import { GOLDEN_SPECS, buildFor, renderGolden } from '../tools/golden.js';

const goldenDir = fileURLToPath(new URL('./golden/v2/', import.meta.url));

const goldenFiles = readdirSync(goldenDir).filter((name) => name.endsWith('.md'));
const specIds = new Set(GOLDEN_SPECS.map((s) => s.id));

describe('Golden compiles (v2)', () => {
  it('has 64 specs: 54 starter-profile goldens, 6 chatgpt extras, 4 role goldens', () => {
    expect(GOLDEN_SPECS.length).toBe(64);
    expect(GOLDEN_SPECS.filter((s) => !s.roles).length).toBe(60);
    expect(GOLDEN_SPECS.filter((s) => s.roles).length).toBe(4);
    expect(specIds.size).toBe(GOLDEN_SPECS.length);
  });

  it('has 64 golden files on disk', () => {
    expect(goldenFiles.length).toBe(64);
  });

  for (const spec of GOLDEN_SPECS) {
    it(`${spec.id}: golden file exists`, () => {
      expect(existsSync(goldenDir + spec.id + '.md')).toBe(true);
    });

    it(`${spec.id}: matches a fresh compile`, () => {
      const expected = readFileSync(goldenDir + spec.id + '.md', 'utf8');
      const actual = renderGolden(spec, compile(buildFor(spec, library)));
      expect(actual).toBe(expected);
    });
  }

  for (const file of goldenFiles) {
    const id = file.slice(0, -'.md'.length);
    it(`${id}: file maps to a golden spec`, () => {
      expect(specIds.has(id), `no golden spec with id "${id}"`).toBe(true);
    });
  }
});
