// Builds the app in a child process and checks the first-paint chunk (docs/M4-PLAN.md section 8, W1).
// Fails when the entry chunk, or anything it imports statically, holds library text or when vite
// prints its 500 kB chunk warning. Run it with `npm run check:bundle`.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

import library from '../src/library/index.js';

export interface Sample {
  kind: string;
  id: string;
  /** A plain run of the line's text. Quotes, backslashes and non-ASCII are left out, so the bundler's string escaping cannot hide it. */
  needle: string;
}

interface ManifestChunk {
  file: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
}

const MIN_NEEDLE = 20;
const SAFE_RUN = /[^A-Za-z0-9 ,.\-]+/;
const WARNING = 'larger than 500 kB';

export function needleOf(line: string): string {
  let best = '';
  for (const run of line.split(SAFE_RUN)) {
    const t = run.trim();
    if (t.length > best.length) best = t;
  }
  return best;
}

// The line with the longest plain run in each category, so the sample is distinctive.
function pickSample(kind: string, lines: { id: string; line: string }[]): Sample {
  let best: Sample | undefined;
  for (const l of lines) {
    const needle = needleOf(l.line);
    if (best === undefined || needle.length > best.needle.length) best = { kind, id: l.id, needle };
  }
  if (best === undefined || best.needle.length < MIN_NEEDLE) {
    throw new Error(`check-bundle: no usable ${kind} line in the library (need ${MIN_NEEDLE} plain characters)`);
  }
  return best;
}

export function samples(): Sample[] {
  return [
    pickSample('pack trigger', library.packs.flatMap((p) => p.triggers)),
    pickSample('role mission', library.roles.map((r) => r.mission)),
    pickSample('profile install step', library.targets.profiles.flatMap((p) => p.installSteps)),
    pickSample('chassis line', library.chassis.lines),
    pickSample('stat line', library.stats),
  ];
}

function jsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.js'))
    .sort();
}

// The entry's file plus the files of every chunk it imports statically, followed through the manifest.
export function staticFiles(manifest: Record<string, ManifestChunk>): {
  entry: string;
  files: string[];
  css: string[];
} {
  const entries = Object.entries(manifest).filter(([, c]) => c.isEntry);
  if (entries.length !== 1) throw new Error(`check-bundle: expected one entry chunk, found ${entries.length}`);
  const seen = new Set<string>();
  const walk = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const next of manifest[key]?.imports ?? []) walk(next);
  };
  walk(entries[0][0]);
  const chunks = [...seen].map((k) => manifest[k]);
  return { entry: entries[0][1].file, files: chunks.map((c) => c.file), css: chunks.flatMap((c) => c.css ?? []) };
}

const kB = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

function size(path: string): string {
  const raw = readFileSync(path);
  return `${kB(raw.length)} (gzip ${kB(gzipSync(raw).length)})`;
}

function main(): void {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const out = mkdtempSync(join(tmpdir(), 'buildabot-bundle-'));
  const problems: string[] = [];

  try {
    const built = spawnSync(
      process.execPath,
      [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', out, '--emptyOutDir'],
      {
        cwd: root,
        env: { ...process.env, NODE_ENV: 'production', NO_COLOR: '1', FORCE_COLOR: '0' },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (built.status !== 0) {
      console.error(built.stdout + built.stderr);
      console.error('check-bundle: vite build failed');
      process.exitCode = 1;
      return;
    }
    // Vite writes the chunk-size warning to stderr, so look at both streams.
    if ((built.stdout + built.stderr).includes(WARNING)) problems.push(`vite printed "${WARNING}"`);

    const manifest = JSON.parse(readFileSync(join(out, '.vite', 'manifest.json'), 'utf8')) as Record<
      string,
      ManifestChunk
    >;
    const { entry, files, css } = staticFiles(manifest);
    const firstPaint = new Set(files);
    const text = new Map(jsFilesUnder(out).map((f) => [f, readFileSync(join(out, f), 'utf8')]));

    for (const s of samples()) {
      const holders = [...text].filter(([, t]) => t.includes(s.needle)).map(([f]) => f);
      if (holders.length === 0) {
        problems.push(`${s.kind} ${s.id} is in no chunk, so this check cannot see it`);
        continue;
      }
      const leaked = holders.filter((f) => firstPaint.has(f));
      if (leaked.length > 0) problems.push(`${s.kind} ${s.id} is in the first-paint chunk ${leaked.join(', ')}`);
    }

    console.log(`entry     ${entry}  ${size(join(out, entry))}`);
    for (const f of files) if (f !== entry) console.log(`  static  ${f}  ${size(join(out, f))}`);
    for (const f of css) console.log(`  css     ${f}  ${size(join(out, f))}`);
    for (const f of text.keys()) {
      if (!firstPaint.has(f)) console.log(`lazy      ${f}  ${size(join(out, f))}`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log('check:bundle passed');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
