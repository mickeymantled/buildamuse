// Regenerates test/golden/*.md from roster builds. CI fails if the committed
// goldens differ from a fresh compile, so a library edit has to come with a
// golden update (npm run golden).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { CompileResult, RosterEntry } from '../src/compiler/types.js';
import { compile, library } from '../src/compiler/compile.js';

// Pure: format one golden file's text from a roster entry and its compile result.
export function renderGolden(entry: RosterEntry, result: CompileResult): string {
  const lines: string[] = [];

  lines.push(`# ${entry.build.name}: ${result.buildName}`);
  lines.push('');
  lines.push('## Soul');
  lines.push('');
  lines.push('```md');
  lines.push(result.soul);
  lines.push('```');
  lines.push('');
  lines.push('## Seed');
  lines.push('');
  lines.push(result.seed);
  lines.push('');
  lines.push('## Skills');
  lines.push('');
  if (result.skills.length > 0) {
    for (const skill of result.skills) lines.push(`- ${skill.sentence}`);
  } else {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## Badges');
  lines.push('');
  if (result.badges.length > 0) {
    for (const badge of result.badges) lines.push(`- ${badge}`);
  } else {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## Warnings');
  lines.push('');
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  } else {
    lines.push('- none');
  }

  return lines.join('\n') + '\n';
}

function goldenDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'golden');
}

function main(): void {
  const args = process.argv.slice(2);
  const stdout = args.includes('--stdout');
  const ids = args.filter((a) => a !== '--stdout');

  const entries: RosterEntry[] =
    ids.length > 0
      ? ids.map((id) => {
          const entry = library.roster.find((r) => r.id === id);
          if (!entry) throw new Error(`Unknown roster id: ${id}`);
          return entry;
        })
      : library.roster;

  const dir = goldenDir();
  if (!stdout) {
    mkdirSync(dir, { recursive: true });
  }

  for (const entry of entries) {
    const result = compile(entry.build);
    const content = renderGolden(entry, result);
    if (stdout) {
      process.stdout.write(content);
    } else {
      const path = join(dir, `${entry.id}.md`);
      writeFileSync(path, content);
      console.log(`wrote test/golden/${entry.id}.md`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
