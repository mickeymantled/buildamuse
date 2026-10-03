// Regenerates test/golden/v2/*.md from the roster. Each spec compiles one roster starter on one
// profile. CI fails if the committed goldens differ from a fresh compile, so a library edit has
// to come with a golden update (npm run golden).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type {
  Build,
  ChatgptMode,
  CompileResult,
  Library,
  Plan,
  RoleId,
  TargetId,
} from '../src/compiler/types.js';
import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { capOf, resolveProfile } from '../src/compiler/profile.js';

export interface GoldenSpec {
  id: string;
  starter: string; // roster entry id
  target: TargetId;
  mode?: ChatgptMode;
  plan?: Plan;
  roles?: RoleId[];
}

// The five profiles every starter is compiled on. The GPT mode is hidden from the picker, so it has no goldens.
const PROFILES: { suffix: string; target: TargetId; mode?: ChatgptMode }[] = [
  { suffix: 'muse', target: 'muse' },
  { suffix: 'openclaw', target: 'openclaw' },
  { suffix: 'hermes', target: 'hermes' },
  { suffix: 'grok', target: 'grok' },
  { suffix: 'chatgpt-dot', target: 'chatgpt', mode: 'dot' },
];

const CHATGPT_EXTRAS: { suffix: string; mode: ChatgptMode; plan?: Plan }[] = [
  { suffix: 'chatgpt-instructions-free', mode: 'instructions', plan: 'free' },
  { suffix: 'chatgpt-instructions-paid', mode: 'instructions', plan: 'paid' },
  { suffix: 'chatgpt-project', mode: 'project' },
];

function buildSpecs(): GoldenSpec[] {
  const specs: GoldenSpec[] = [];
  // Nine starters x five profiles = 45.
  for (const entry of library.roster) {
    for (const p of PROFILES) {
      specs.push({
        id: `${entry.id}.${p.suffix}`,
        starter: entry.id,
        target: p.target,
        ...(p.mode !== undefined ? { mode: p.mode } : {}),
      });
    }
  }
  // Marty and June on the other three ChatGPT modes = 6 more, 51 total.
  for (const starter of ['marty', 'june']) {
    for (const x of CHATGPT_EXTRAS) {
      specs.push({
        id: `${starter}.${x.suffix}`,
        starter,
        target: 'chatgpt',
        mode: x.mode,
        ...(x.plan !== undefined ? { plan: x.plan } : {}),
      });
    }
  }
  // Four role goldens, extra to the 51.
  specs.push(
    { id: 'marty.openclaw.roles', starter: 'marty', target: 'openclaw', roles: ['scout', 'risk-manager', 'journal'] },
    { id: 'rook.hermes.roles', starter: 'rook', target: 'hermes', roles: ['planner', 'implementer', 'reviewer', 'tester'] },
    { id: 'june.grok.roles', starter: 'june', target: 'grok', roles: ['chief-of-staff', 'triager', 'scheduler'] },
    { id: 'sol.chatgpt-project.roles', starter: 'sol', target: 'chatgpt', mode: 'project', roles: ['lead', 'searcher', 'synthesizer', 'fact-checker'] },
  );
  return specs;
}

export const GOLDEN_SPECS: GoldenSpec[] = buildSpecs();

// Pure: the v2 build for a spec. The roster build is migrated to the spec's target, then roles are set.
export function buildFor(spec: GoldenSpec, lib: Library): Build {
  const entry = lib.roster.find((r) => r.id === spec.starter);
  if (!entry) throw new Error(`Unknown roster starter: ${spec.starter}`);
  const build = migrate(entry.build, { target: spec.target, mode: spec.mode, plan: spec.plan });
  return spec.roles ? { ...build, roles: [...spec.roles] } : build;
}

// A fence one backtick longer than any run inside the text, never shorter than three.
function fenced(lang: string, text: string): string[] {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return [`${fence}${lang}`, text, fence];
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// Pure: format one golden file's text from a spec and its compile result.
export function renderGolden(spec: GoldenSpec, result: CompileResult, lib: Library = library): string {
  const build = buildFor(spec, lib);
  const cap = capOf(resolveProfile(build, lib), build);
  const sections: string[][] = [];

  sections.push([`# ${build.name}: ${result.buildName} (${spec.id})`]);
  sections.push(['## Build', '', ...fenced('json', JSON.stringify(build))]);
  sections.push([`## Personality (${result.length}/${cap} characters)`, '', ...fenced('md', result.soul)]);

  if (result.files.length > 0) {
    const out: string[] = ['## Files'];
    for (const file of result.files) {
      out.push('', `### ${file.path} (${file.label}, ${file.delivery})`, '', ...fenced('md', file.content));
    }
    sections.push(out);
  }

  if (result.spoken.length > 0) {
    const out: string[] = ['## Spoken'];
    for (const item of result.spoken) {
      out.push('', `### ${item.label}`, '', ...fenced('text', item.text));
    }
    sections.push(out);
  }

  if (result.customRules.length > 0) {
    sections.push([
      '## Custom rules',
      '',
      '| Action | Setting |',
      '| --- | --- |',
      ...result.customRules.map((r) => `| ${cell(r.action)} | ${cell(r.setting)} |`),
    ]);
  }

  if (result.conversationStarters && result.conversationStarters.length > 0) {
    sections.push(['## Conversation starters', '', ...result.conversationStarters.map((s) => `- ${s}`)]);
  }

  if (result.description !== undefined && result.description !== '') {
    sections.push(['## Description', '', ...fenced('text', result.description)]);
  }

  if (result.installSteps.length > 0) {
    sections.push(['## Install steps', '', ...result.installSteps.map((s, i) => `${i + 1}. ${s}`)]);
  }

  // The tagged steps the certificate renders: hidden steps are gone, the closer has no number.
  if (result.steps.length > 0) {
    let num = 0;
    sections.push([
      '## Steps',
      '',
      ...result.steps.map((s) => {
        const shows = `[${s.shows.length > 0 ? s.shows.join(', ') : 'none'}]`;
        return s.closer ? `closer: ${s.text} ${shows}` : `${++num}. ${s.text} ${shows}`;
      }),
    ]);
  }

  if (result.notes.length > 0) {
    sections.push(['## Notes', '', ...result.notes.map((n) => `- ${n}`)]);
  }

  const gates = Object.entries(result.gates);
  if (gates.length > 0) {
    sections.push(['## Gates', '', ...gates.map(([action, setting]) => `- ${action}: ${setting}`)]);
  }

  const limits = Object.entries(result.limits);
  if (limits.length > 0) {
    sections.push(['## Limits', '', ...limits.map(([limit, value]) => `- ${limit}: ${value}`)]);
  }

  if (result.badges.length > 0) {
    sections.push(['## Badges', '', ...result.badges.map((b) => `- ${b}`)]);
  }

  sections.push([
    '## Warnings',
    '',
    ...(result.warnings.length > 0 ? result.warnings.map((w) => `- ${w}`) : ['- none']),
  ]);

  return sections.map((s) => s.join('\n')).join('\n\n') + '\n';
}

function goldenDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'golden', 'v2');
}

function main(): void {
  const args = process.argv.slice(2);
  const stdout = args.includes('--stdout');
  const ids = args.filter((a) => a !== '--stdout');

  const specs: GoldenSpec[] =
    ids.length > 0
      ? ids.map((id) => {
          const spec = GOLDEN_SPECS.find((s) => s.id === id);
          if (!spec) throw new Error(`Unknown golden id: ${id}`);
          return spec;
        })
      : GOLDEN_SPECS;

  const dir = goldenDir();
  if (!stdout) {
    mkdirSync(dir, { recursive: true });
  }

  for (const spec of specs) {
    const result = compile(buildFor(spec, library));
    const content = renderGolden(spec, result);
    if (stdout) {
      process.stdout.write(content);
    } else {
      writeFileSync(join(dir, `${spec.id}.md`), content);
      console.log(`wrote test/golden/v2/${spec.id}.md`);
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
