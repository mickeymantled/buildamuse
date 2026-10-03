// Golden compile tests. Every .md file in test/golden/v2/ is a committed, expected render for one
// golden spec: a roster starter compiled on one profile (nine starters x five profiles = 45: muse,
// openclaw, hermes, grok, chatgpt-dot), Marty and June on the other three ChatGPT modes (instructions
// free, instructions paid, project = 6 more), plus four role goldens = 55. The ChatGPT "gpt" mode
// stays in the compiler but is hidden from the picker and deprecated (QUESTIONS.md B2), so it has no
// goldens. This test recompiles each spec from the current library and compiler and asserts an exact
// match, so a library edit that changes output has to come with a golden update (npm run golden). It
// also asserts every golden file maps to a spec, so a stale or misspelled file is caught too.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { compile, library } from '../src/compiler/compile.js';
import { GOLDEN_SPECS, buildFor, renderGolden } from '../tools/golden.js';

const goldenDir = fileURLToPath(new URL('./golden/v2/', import.meta.url));

const goldenFiles = readdirSync(goldenDir).filter((name) => name.endsWith('.md'));
const specIds = new Set(GOLDEN_SPECS.map((s) => s.id));

describe('Golden compiles (v2)', () => {
  it('has 55 specs: 45 starter-profile goldens, 6 chatgpt extras, 4 role goldens', () => {
    expect(GOLDEN_SPECS.length).toBe(55);
    expect(GOLDEN_SPECS.filter((s) => !s.roles).length).toBe(51);
    expect(GOLDEN_SPECS.filter((s) => s.roles).length).toBe(4);
    expect(specIds.size).toBe(GOLDEN_SPECS.length);
  });

  it('has 45 starter-profile specs on muse, openclaw, hermes, grok and chatgpt-dot', () => {
    const profiles = ['muse', 'openclaw', 'hermes', 'grok', 'chatgpt-dot'];
    const starters = library.roster.map((r) => r.id);
    expect(starters.length).toBe(9);
    for (const starter of starters) {
      for (const profile of profiles) {
        expect(specIds.has(`${starter}.${profile}`), `missing spec ${starter}.${profile}`).toBe(true);
      }
    }
    const profileSpecs = GOLDEN_SPECS.filter((s) => profiles.some((p) => s.id === `${s.starter}.${p}`));
    expect(profileSpecs.length).toBe(45);
  });

  it('has the six chatgpt extras: marty and june on instructions free, instructions paid, project', () => {
    const extras = ['chatgpt-instructions-free', 'chatgpt-instructions-paid', 'chatgpt-project'];
    for (const starter of ['marty', 'june']) {
      for (const extra of extras) {
        expect(specIds.has(`${starter}.${extra}`), `missing spec ${starter}.${extra}`).toBe(true);
      }
    }
  });

  it('has the four role goldens', () => {
    const roleSpecIds = GOLDEN_SPECS.filter((s) => s.roles).map((s) => s.id).sort();
    expect(roleSpecIds).toEqual([
      'june.grok.roles',
      'marty.openclaw.roles',
      'rook.hermes.roles',
      'sol.chatgpt-project.roles',
    ]);
  });

  it('has no gpt-mode specs and no chatgpt-gpt files (gpt mode is deprecated, B2)', () => {
    expect(GOLDEN_SPECS.filter((s) => s.mode === 'gpt').length).toBe(0);
    expect(GOLDEN_SPECS.filter((s) => s.id.includes('chatgpt-gpt')).length).toBe(0);
    expect(goldenFiles.filter((f) => f.includes('chatgpt-gpt')).length).toBe(0);
  });

  it('has 55 golden files on disk', () => {
    expect(goldenFiles.length).toBe(55);
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
