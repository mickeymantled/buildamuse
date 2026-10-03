// Bundle split tests (M4 slice 4.10, W1, docs/M4-PLAN.md section 8).
//
// The first block runs the real thing: `npm run check:bundle` builds the app in a child process and
// fails when the entry chunk (or anything it imports statically) holds library text, or when vite
// prints its 500 kB chunk warning. The test asserts exit code 0 with a 120 s timeout.
//
// The second block tests the script's exported helpers against the library tables and a synthetic
// manifest. Expectations are derived from the library and from the plan, not from the script's own
// output.

import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import library from '../src/library/index.js';
import { needleOf, samples, staticFiles } from '../tools/check-bundle.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_TIMEOUT_MS = 120_000;

interface Ran {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[]): Promise<Ran> {
  return new Promise((done) => {
    execFile(
      command,
      args,
      {
        cwd: ROOT,
        timeout: BUILD_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      },
      (error, stdout, stderr) => {
        const e = error as (Error & { code?: number | string | null; signal?: string | null }) | null;
        done({
          code: e === null ? 0 : typeof e.code === 'number' ? e.code : null,
          signal: e?.signal ?? null,
          stdout,
          stderr,
        });
      },
    );
  });
}

// One build serves both tests: a vite build is the slow part.
let build: Promise<Ran> | undefined;
const buildOnce = () => (build ??= run('npm', ['run', 'check:bundle', '--silent']));

describe('npm run check:bundle', () => {
  it(
    'exits 0: the entry chunk holds no library text and vite prints no 500 kB warning',
    async () => {
      const ran = await buildOnce();
      const out = `exit ${ran.code} signal ${ran.signal}\n${ran.stdout}\n${ran.stderr}`;
      expect(ran.signal, out).toBeNull();
      expect(ran.code, out).toBe(0);
      expect(ran.stdout, out).toContain('check:bundle passed');
      expect(ran.stderr, out).not.toMatch(/FAIL /);
      expect(`${ran.stdout}\n${ran.stderr}`, out).not.toContain('larger than 500 kB');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'reports one entry chunk and at least one lazy chunk, so the split really happened',
    async () => {
      const ran = await buildOnce();
      const out = `exit ${ran.code}\n${ran.stdout}\n${ran.stderr}`;
      expect(ran.code, out).toBe(0);
      const entries = ran.stdout.split('\n').filter((l) => /^entry\s/.test(l));
      expect(entries, out).toHaveLength(1);
      // The App and the store (compiler, library) are the lazy chunks.
      const lazy = ran.stdout.split('\n').filter((l) => /^lazy\s/.test(l));
      expect(lazy.length, out).toBeGreaterThanOrEqual(1);
    },
    BUILD_TIMEOUT_MS,
  );
});

// ---- Script helpers ----

// Typographic characters a bundler may escape, written by code point.
const DASH = String.fromCharCode(0x2014);
const OPEN_QUOTE = String.fromCharCode(0x201c);
const CLOSE_QUOTE = String.fromCharCode(0x201d);

describe('check-bundle needleOf', () => {
  it('returns the longest run of plain characters, trimmed', () => {
    expect(needleOf(`short ${DASH} a rather longer plain stretch here ${OPEN_QUOTE}quoted${CLOSE_QUOTE}`)).toBe(
      'a rather longer plain stretch here',
    );
  });

  it('never returns quotes, backslashes or non-ASCII, which a bundler may escape', () => {
    for (const line of [
      `He said "stop" and she didn't, which is a longer sentence than the rest`,
      'path\\with\\backslashes and a long plain clause after them for length',
      'café and naïve plain text that goes on for a good while longer',
    ]) {
      const n = needleOf(line);
      expect(n).toMatch(/^[A-Za-z0-9 ,.-]*$/);
      expect(n.length).toBeGreaterThan(0);
      expect(line.includes(n)).toBe(true);
    }
  });

  it('is empty for a line with no plain characters', () => {
    expect(needleOf(`"\\${DASH}${OPEN_QUOTE}${CLOSE_QUOTE}`)).toBe('');
  });
});

describe('check-bundle samples', () => {
  const all = samples();

  it('draws one sample from each library category the plan names', () => {
    expect(all.map((s) => s.kind)).toEqual([
      'pack trigger',
      'role mission',
      'profile install step',
      'chassis line',
      'stat line',
    ]);
  });

  it('gives every sample a distinctive needle of at least 20 plain characters', () => {
    for (const s of all) {
      expect(s.needle.length, `${s.kind} ${s.id}`).toBeGreaterThanOrEqual(20);
      expect(s.needle, `${s.kind} ${s.id}`).toMatch(/^[A-Za-z0-9 ,.-]+$/);
    }
  });

  it('takes every needle from a real library line, by its record id', () => {
    const find = (s: { kind: string; id: string }): string | undefined => {
      switch (s.kind) {
        case 'pack trigger':
          return library.packs.flatMap((p) => p.triggers).find((t) => t.id === s.id)?.line;
        case 'role mission':
          return library.roles.map((r) => r.mission).find((m) => m.id === s.id)?.line;
        case 'profile install step':
          return library.targets.profiles.flatMap((p) => p.installSteps).find((l) => l.id === s.id)?.line;
        case 'chassis line':
          return library.chassis.lines.find((l) => l.id === s.id)?.line;
        case 'stat line':
          return library.stats.find((l) => l.id === s.id)?.line;
        default:
          return undefined;
      }
    };
    for (const s of all) {
      const line = find(s);
      expect(line, `${s.kind} ${s.id} is not in the library`).toBeDefined();
      expect(line?.includes(s.needle), `${s.kind} ${s.id}: needle is not in its line`).toBe(true);
    }
  });

  it('keeps the profiles and the pack text out of the card file, which is the only library JSON the shell may load', () => {
    // The cards carry labels, promise lines and mode notes. None of the sampled needles may be in them.
    const cards = JSON.stringify(library.targets.targets);
    for (const s of all) expect(cards.includes(s.needle), `${s.kind} ${s.id} is in the cards`).toBe(false);
  });
});

describe('check-bundle staticFiles', () => {
  it('follows static imports through the manifest and leaves dynamic imports out', () => {
    const manifest = {
      'index.html': {
        file: 'assets/index-a.js',
        isEntry: true,
        imports: ['_vendor.js'],
        dynamicImports: ['src/ui/App.tsx', 'src/ui/store.ts'],
        css: ['assets/index-a.css'],
      },
      '_vendor.js': { file: 'assets/vendor-b.js', imports: ['_deep.js'] },
      '_deep.js': { file: 'assets/deep-c.js', css: ['assets/deep-c.css'] },
      'src/ui/App.tsx': { file: 'assets/App-d.js', imports: ['_vendor.js'] },
      'src/ui/store.ts': { file: 'assets/store-e.js', imports: ['_vendor.js'] },
    };
    const found = staticFiles(manifest);
    expect(found.entry).toBe('assets/index-a.js');
    expect([...found.files].sort()).toEqual(['assets/deep-c.js', 'assets/index-a.js', 'assets/vendor-b.js']);
    expect([...found.css].sort()).toEqual(['assets/deep-c.css', 'assets/index-a.css']);
    expect(found.files).not.toContain('assets/App-d.js');
    expect(found.files).not.toContain('assets/store-e.js');
  });

  it('does not loop on an import cycle', () => {
    const manifest = {
      entry: { file: 'e.js', isEntry: true, imports: ['a'] },
      a: { file: 'a.js', imports: ['b'] },
      b: { file: 'b.js', imports: ['a', 'entry'] },
    };
    expect([...staticFiles(manifest).files].sort()).toEqual(['a.js', 'b.js', 'e.js']);
  });

  it('throws when there is no entry chunk or more than one', () => {
    expect(() => staticFiles({ a: { file: 'a.js' } })).toThrow(/expected one entry chunk, found 0/);
    expect(() =>
      staticFiles({ a: { file: 'a.js', isEntry: true }, b: { file: 'b.js', isEntry: true } }),
    ).toThrow(/expected one entry chunk, found 2/);
  });
});
