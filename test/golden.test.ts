// Golden compile tests. Every .md file in test/golden/ is a committed, expected
// soul/seed/skills render for one roster starter. This test regenerates each
// golden's content from the current library + compiler and asserts an exact
// match, so a library edit that changes output has to come with a golden
// update (npm run golden). It also asserts every golden file maps to a real
// roster entry, so a stale or misspelled file is caught too.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { compile, library } from '../src/compiler/compile.js';
import { renderGolden } from '../tools/golden.js';

const goldenDir = fileURLToPath(new URL('./golden/', import.meta.url));

const goldenFiles = readdirSync(goldenDir).filter((name) => name.endsWith('.md'));

describe('Golden compiles', () => {
  it('found at least one golden file', () => {
    expect(goldenFiles.length).toBeGreaterThan(0);
  });

  for (const file of goldenFiles) {
    const id = file.slice(0, -'.md'.length);

    it(`${id}: maps to a roster entry`, () => {
      const entry = library.roster.find((r) => r.id === id);
      expect(entry, `no roster entry with id "${id}"`).toBeDefined();
    });

    it(`${id}: matches a fresh compile`, () => {
      const entry = library.roster.find((r) => r.id === id);
      if (!entry) throw new Error(`no roster entry with id "${id}"`);

      const expected = readFileSync(goldenDir + file, 'utf8');
      const actual = renderGolden(entry, compile(entry.build));

      expect(actual).toBe(expected);
    });
  }
});
