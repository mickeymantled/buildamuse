// SKILL.md frontmatter (M4 slice 4.5b; QUESTIONS W21 and W31; docs/M4-PLAN.md section 3a).
//
// OpenClaw skips a skill whose SKILL.md has no frontmatter `name` and `description`, and Hermes'
// validator and docs require both (W31, agentskills.io format). So every SKILL.md the compiler ships
// on openclaw and hermes must start with a frontmatter block whose `name` is the skill's directory,
// whose directory follows the folder rules, and whose `description` is one YAML double-quoted line.
//
// Where the expected values come from. Nothing here is copied from compiler output.
//   - The folder rule: W31 and the agentskills.io folder name rule, written as the regex
//     ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ with length 64 or less (the lead's task).
//   - The description: the skill's own library record. A pack skill uses `whenToUse` and a chip
//     skill uses `detail` (W31), on one line (newline runs become one space), and it must be under
//     160 characters (the lead's task).
//   - The file body: the pre-edit skill.file template text (git HEAD of the wave 2 gate), which
//     follows the four frontmatter lines unchanged, and the chipFile template (W31: it replaces the
//     hard-coded chip text, so a chip file is the frontmatter, "# <name>", a blank line, the detail).
//   - Which skills must ship: the library's chip and pack skill records. A trigger skill is a
//     file; a schedule skill is a spoken routine. A chip skill whose name a selected pack skill also
//     carries is replaced by the pack skill (library rule).
//   - The YAML double-quoted form: YAML 1.2 section 7.3.1. The tiny parser below reads only that
//     form and returns undefined for anything that is not one valid single-line scalar.
//
// Not pinned here: the ChatGPT knowledge and project file names. The engineer's rename of "_" to "-"
// also reached those paths (project/pickup-guard.md); whether it should is open and is the lead's call.
// These tests only pin that those profiles get no frontmatter.

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { traceBundle } from '../src/compiler/trace.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import type { GoldenSpec } from '../tools/golden.js';
import type { Build, BundleFile, ChipSkill, CompileResult, Library, Profile, Skill } from '../src/compiler/types.js';

// ---------------------------------------------------------------------------------------------
// A tiny parser for one YAML double-quoted scalar.

const YAML_SIMPLE_ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  '\t': '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  N: '\x85',
  _: '\xa0',
  L: ' ',
  P: ' ',
};
const YAML_HEX_ESCAPES: Record<string, number> = { x: 2, u: 4, U: 8 };

// The whole of `src` must be one double-quoted scalar on one line. Undefined when it is not: no
// opening or closing quote, an unescaped quote inside, a trailing lone backslash, an escape YAML
// does not define, a short or non-hex \x \u \U, or a raw control character.
function parseYamlDoubleQuoted(src: string): string | undefined {
  if (src.length < 2 || src[0] !== '"' || src[src.length - 1] !== '"') return undefined;
  const end = src.length - 1;
  let out = '';
  let i = 1;
  while (i < end) {
    const ch = src[i];
    if (ch === '"') return undefined;
    if (ch === '\\') {
      i += 1;
      if (i >= end) return undefined;
      const e = src[i];
      if (Object.hasOwn(YAML_SIMPLE_ESCAPES, e)) {
        out += YAML_SIMPLE_ESCAPES[e];
        i += 1;
        continue;
      }
      if (Object.hasOwn(YAML_HEX_ESCAPES, e)) {
        const n = YAML_HEX_ESCAPES[e];
        const hex = src.slice(i + 1, i + 1 + n);
        if (i + 1 + n > end || !/^[0-9a-fA-F]+$/.test(hex) || hex.length !== n) return undefined;
        const cp = parseInt(hex, 16);
        if (cp > 0x10ffff) return undefined;
        out += String.fromCodePoint(cp);
        i += 1 + n;
        continue;
      }
      return undefined;
    }
    // Raw control characters other than tab are not allowed (this also rules out a raw newline).
    if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(ch)) return undefined;
    out += ch;
    i += 1;
  }
  return out;
}

describe('the tiny YAML double-quoted parser', () => {
  it('reads plain text, escaped quotes and backslashes, and unicode escapes', () => {
    expect(parseYamlDoubleQuoted('"plain"')).toBe('plain');
    expect(parseYamlDoubleQuoted('""')).toBe('');
    expect(parseYamlDoubleQuoted('"say \\"hi\\""')).toBe('say "hi"');
    expect(parseYamlDoubleQuoted('"a \\\\ b"')).toBe('a \\ b');
    expect(parseYamlDoubleQuoted('"caf\\u00e9"')).toBe('café');
    expect(parseYamlDoubleQuoted('"tab\\there"')).toBe('tab\there');
    expect(parseYamlDoubleQuoted('"colon: and # hash"')).toBe('colon: and # hash');
  });

  it('rejects anything that is not one valid double-quoted scalar', () => {
    expect(parseYamlDoubleQuoted('plain')).toBeUndefined();
    expect(parseYamlDoubleQuoted('"unterminated')).toBeUndefined();
    expect(parseYamlDoubleQuoted('"a"b"')).toBeUndefined();
    expect(parseYamlDoubleQuoted('"ends with a slash\\"')).toBeUndefined();
    expect(parseYamlDoubleQuoted('"bad \\q escape"')).toBeUndefined();
    expect(parseYamlDoubleQuoted('"short \\u12"')).toBeUndefined();
    expect(parseYamlDoubleQuoted('"not hex \\u12zz"')).toBeUndefined();
    expect(parseYamlDoubleQuoted('"raw\nnewline"')).toBeUndefined();
    expect(parseYamlDoubleQuoted("'single quoted'")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Oracles and helpers.

const DIR_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const DIR_MAX = 64;
const DESCRIPTION_MAX = 160; // the description is under this many characters
const FRONTMATTER_PROFILES = ['openclaw', 'hermes'] as const;

const hyphenated = (s: string): string => s.replace(/_/g, '-');
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameKey = (name: string): string => name.trim().toLowerCase();

// One line: each run of newlines (with the spaces around it) is one space.
function oneLine(text: string): string {
  return text
    .split(/[\r\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');
}

function profileOf(id: string, lib: Library = library): Profile {
  const found = lib.targets.profiles.find((p) => p.id === id);
  if (!found) {
    throw new Error(`no library profile ${id}`);
  }
  return found;
}

interface SkillRecord {
  kind: 'chip' | 'pack';
  id: string;
  packId?: string;
  skill: ChipSkill | Skill;
}

// The library record behind a skill file, found from the skill id the file's lines cite. Two skills
// of one pack can share an id on a synthetic library, so the file's label ("Skill: <name>") picks
// between them.
function recordOf(file: BundleFile, lib: Library): SkillRecord | undefined {
  const id = file.lines[0].sources?.[0] ?? '';
  const name = file.label.replace(/^Skill: /, '');
  const m = /^pack\.([^.]+)\.skill\.(.+)$/.exec(id);
  if (m) {
    const pack = lib.packs.find((p) => p.id === m[1]);
    const same = (pack?.skills ?? []).filter((s) => s.id === m[2]);
    const skill = same.find((s) => s.name === name) ?? same[0];
    return skill ? { kind: 'pack', id, packId: m[1], skill } : undefined;
  }
  for (const chip of lib.chips) {
    const skill = (chip.skills ?? []).find((s) => s.id === id);
    if (skill) return { kind: 'chip', id, skill };
  }
  return undefined;
}

const isSkillMd = (f: BundleFile): boolean => /(^|\/)SKILL\.md$/.test(f.path);

// The trigger skills a build must ship as files, from the library records alone.
function expectedSkillIds(build: Build, profileId: string, lib: Library): string[] {
  const packs = build.packs
    .map((id) => lib.packs.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .filter((p) => p.profiles === undefined || p.profiles.includes(profileId as never));
  const packNames = new Set(packs.flatMap((p) => p.skills.map((s) => nameKey(s.name))));
  const chipSkills = build.chips
    .flatMap((id) => lib.chips.find((c) => c.id === id)?.skills ?? [])
    .filter((s) => !packNames.has(nameKey(s.name)));
  return [
    ...chipSkills.filter((s) => s.kind === 'trigger').map((s) => s.id),
    ...packs.flatMap((p) => p.skills.filter((s) => s.kind === 'trigger').map((s) => `pack.${p.id}.skill.${s.id}`)),
  ];
}

// ---------------------------------------------------------------------------------------------
// The checks, one function per property so a failure names the property.

function skillMds(result: CompileResult): BundleFile[] {
  return result.files.filter(isSkillMd);
}

function dirOf(file: BundleFile): string {
  const m = /^skills\/([^/]+)\/SKILL\.md$/.exec(file.path);
  expect(m, `path ${file.path} is skills/<dir>/SKILL.md`).not.toBeNull();
  return (m as RegExpExecArray)[1];
}

function checkFrontmatterShape(result: CompileResult, label: string): void {
  for (const file of skillMds(result)) {
    const lines = file.content.split('\n');
    expect(lines[0], `${label} ${file.path} line 1`).toBe('---');
    expect(lines[1], `${label} ${file.path} line 2`).toBe(`name: ${dirOf(file)}`);
    expect(lines[2], `${label} ${file.path} line 3`).toMatch(/^description: "/);
    expect(lines[3], `${label} ${file.path} line 4`).toBe('---');
    expect(lines[4], `${label} ${file.path} line 5 is the skill heading`).toMatch(/^# \S/);
  }
}

function checkDirs(result: CompileResult, label: string): void {
  const dirs = skillMds(result).map(dirOf);
  for (const dir of dirs) {
    expect(dir, `${label} dir`).toMatch(DIR_PATTERN);
    expect(dir.length, `${label} ${dir} length`).toBeLessThanOrEqual(DIR_MAX);
    expect(dir, `${label} ${dir} has no underscore`).not.toContain('_');
  }
  expect(new Set(dirs).size, `${label} dirs are unique`).toBe(dirs.length);
  expect(new Set(skillMds(result).map((f) => f.path)).size, `${label} paths are unique`).toBe(dirs.length);
}

function checkDescription(result: CompileResult, lib: Library, label: string): void {
  for (const file of skillMds(result)) {
    const raw = file.content.split('\n')[2].replace(/^description: /, '');
    const parsed = parseYamlDoubleQuoted(raw);
    expect(parsed, `${label} ${file.path}: description is a YAML double-quoted string: ${raw}`).toBeDefined();
    const description = parsed as string;
    expect(description.length, `${label} ${file.path}: description length`).toBeGreaterThan(0);
    expect(description.length, `${label} ${file.path}: description is under ${DESCRIPTION_MAX} characters`).toBeLessThan(
      DESCRIPTION_MAX,
    );
    expect(description, `${label} ${file.path}: description has no newline`).not.toMatch(/[\r\n]/);
    expect(description, `${label} ${file.path}: description has no edge whitespace`).toBe(description.trim());

    const id = file.lines[0].sources?.[0] ?? '';
    const record = recordOf(file, lib);
    expect(record, `${label} ${file.path}: the library has skill ${id}`).toBeDefined();
    const text = record?.kind === 'pack' ? (record.skill as Skill).whenToUse : (record?.skill as ChipSkill).detail;
    expect(description, `${label} ${file.path}: description is the skill's ${record?.kind === 'pack' ? 'whenToUse' : 'detail'}`).toBe(
      oneLine(text),
    );
  }
}

// The directory comes from the skill id: a chip skill from the last segment of its id, a pack skill
// from its id, with underscores as hyphens. A taken name gets the pack id in front, then -2, -3.
function checkDirNames(result: CompileResult, lib: Library, label: string): void {
  for (const file of skillMds(result)) {
    const dir = dirOf(file);
    const id = file.lines[0].sources?.[0] ?? '';
    const record = recordOf(file, lib) as SkillRecord;
    const own = record.kind === 'pack' ? (record.skill as Skill).id : (id.split('.').at(-1) as string);
    const names = [hyphenated(own)];
    if (record.kind === 'pack') names.push(hyphenated(`${record.packId}-${own}`));
    const ok = names.some((n) => dir === n || new RegExp(`^${escapeRegExp(n)}-[0-9]+$`).test(dir) || (n.length > DIR_MAX && n.startsWith(dir)));
    expect(ok, `${label} ${dir} comes from skill ${id}`).toBe(true);
  }
}

function checkTemplateAndTrace(result: CompileResult, lib: Library, label: string): void {
  const pid = result.profile;
  const profile = profileOf(pid, lib);
  for (const file of skillMds(result)) {
    const id = file.lines[0].sources?.[0] ?? '';
    const record = recordOf(file, lib) as SkillRecord;
    const template = record.kind === 'chip' ? profile.templates['skill.chipFile'] : profile.templates['skill.file'];
    expect(template.id).toBe(`profile.${pid}.skill.${record.kind === 'chip' ? 'chipFile' : 'file'}`);

    // Every non-blank line, frontmatter included, traces to the template and cites the skill.
    for (const line of file.lines.filter((l) => l.kind !== 'blank')) {
      expect(line.id, `${label} ${file.path}: "${line.text}"`).toBe(template.id);
      expect(line.sources, `${label} ${file.path}: "${line.text}"`).toEqual([id]);
    }
    expect(file.lines.slice(0, 4).map((l) => l.id), `${label} ${file.path} frontmatter ids`).toEqual(
      Array(4).fill(template.id),
    );

    const dir = dirOf(file);
    const front = file.content.split('\n').slice(0, 4).join('\n');
    const body = file.content.split('\n').slice(4).join('\n');
    expect(front.startsWith(`---\nname: ${dir}\ndescription: "`)).toBe(true);
    if (record.kind === 'chip') {
      const chip = record.skill as ChipSkill;
      expect(body, `${label} ${file.path}: chip skill body`).toBe(`# ${chip.name}\n\n${chip.detail}`);
    } else {
      const skill = record.skill as Skill;
      expect(body.startsWith(`# ${skill.name}\n\n## When to use\n${skill.whenToUse}\n\n## Inputs\n${skill.inputs}\n\n## Steps\n`), `${label} ${file.path}: pack skill body`).toBe(true);
      const at = (h: string): number => body.indexOf(`\n\n## ${h}\n`);
      expect(at('Steps')).toBeGreaterThan(-1);
      expect(at('Validate')).toBeGreaterThan(at('Steps'));
      expect(at('Returns')).toBeGreaterThan(at('Validate'));
      expect(at('Requires approval')).toBeGreaterThan(at('Returns'));
    }
  }
}

// Every skill the library says should ship does, and nothing else does.
function checkInventory(result: CompileResult, build: Build, lib: Library, label: string): void {
  const shipped = skillMds(result).map((f) => f.lines[0].sources?.[0] ?? '');
  expect([...shipped].sort(), `${label} shipped skills`).toEqual([...expectedSkillIds(build, result.profile, lib)].sort());
}

function checkTrace(result: CompileResult, lib: Library, label: string): void {
  expect(() => traceBundle(result, lib), `${label} traceBundle`).not.toThrow();
}

function checkAll(result: CompileResult, build: Build, lib: Library, label: string): void {
  checkFrontmatterShape(result, label);
  checkDirs(result, label);
  checkDescription(result, lib, label);
  checkDirNames(result, lib, label);
  checkTemplateAndTrace(result, lib, label);
  checkInventory(result, build, lib, label);
  checkTrace(result, lib, label);
}

// ---------------------------------------------------------------------------------------------
// 1. The templates.

describe('the SKILL.md templates in profiles.json', () => {
  const FRONT = '---\nname: {dir}\ndescription: "{description}"\n---\n';
  const SKILL_BODY =
    '# {name}\n\n## When to use\n{whenToUse}\n\n## Inputs\n{inputs}\n\n## Steps\n{steps}\n\n## Validate\n{validate}\n\n## Returns\n{returns}\n\n## Requires approval\n{requiresApproval}';
  const CHIP_BODY = '# {name}\n\n{detail}';

  for (const pid of FRONTMATTER_PROFILES) {
    it(`${pid}: skill.file is the four frontmatter lines, then the old template text`, () => {
      const t = profileOf(pid).templates['skill.file'];
      expect(t.id).toBe(`profile.${pid}.skill.file`);
      expect(t.line).toBe(FRONT + SKILL_BODY);
    });

    it(`${pid}: skill.chipFile is the same frontmatter, "# {name}", a blank line and {detail}`, () => {
      const t = profileOf(pid).templates['skill.chipFile'];
      expect(t.id).toBe(`profile.${pid}.skill.chipFile`);
      expect(t.line).toBe(FRONT + CHIP_BODY);
    });
  }

  it('no other profile has a skill.chipFile template or frontmatter in a skill or knowledge template', () => {
    for (const p of library.targets.profiles) {
      if ((FRONTMATTER_PROFILES as readonly string[]).includes(p.id)) continue;
      expect(Object.keys(p.templates), p.id).not.toContain('skill.chipFile');
      for (const key of ['skill.file', 'knowledge.file']) {
        if (Object.hasOwn(p.templates, key)) {
          expect(p.templates[key].line, `${p.id} ${key}`).not.toMatch(/^---/);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Every golden on openclaw and hermes.

const SKILL_SPECS = GOLDEN_SPECS.filter((s) => (FRONTMATTER_PROFILES as readonly string[]).includes(s.target));

describe('SKILL.md frontmatter on every openclaw and hermes golden spec', () => {
  it('covers the nine starters on both profiles and the two role goldens', () => {
    expect(SKILL_SPECS).toHaveLength(2 * library.roster.length + 2);
    expect(SKILL_SPECS.filter((s) => s.target === 'openclaw').length).toBe(library.roster.length + 1);
    expect(SKILL_SPECS.filter((s) => s.target === 'hermes').length).toBe(library.roster.length + 1);
  });

  const cache = new Map<string, { build: Build; result: CompileResult }>();
  const run = (spec: GoldenSpec): { build: Build; result: CompileResult } => {
    let hit = cache.get(spec.id);
    if (!hit) {
      const build = buildFor(spec, library);
      hit = { build, result: compile(build) };
      cache.set(spec.id, hit);
    }
    return hit;
  };

  it('ships at least one SKILL.md on most specs, so the checks are not vacuous', () => {
    const counts = SKILL_SPECS.map((s) => skillMds(run(s).result).length);
    expect(counts.filter((n) => n > 0).length).toBeGreaterThanOrEqual(SKILL_SPECS.length - 4);
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(40);
  });

  describe.each(SKILL_SPECS.map((s) => [s.id, s] as const))('%s', (_id, spec) => {
    it('every skills/<dir>/SKILL.md starts with --- , name: <dir>, a quoted description line, ---', () => {
      checkFrontmatterShape(run(spec).result, spec.id);
    });

    it('every dir matches ^[a-z][a-z0-9]*(-[a-z0-9]+)*$, is at most 64 characters and is unique', () => {
      checkDirs(run(spec).result, spec.id);
    });

    it('every description parses as a YAML double-quoted string under 160 characters, and is the skill text on one line', () => {
      checkDescription(run(spec).result, library, spec.id);
    });

    it('every dir comes from its skill id, with hyphens for underscores', () => {
      checkDirNames(run(spec).result, library, spec.id);
    });

    it('chip skills use the chipFile template, pack skills the skill.file template, and every line traces to it', () => {
      checkTemplateAndTrace(run(spec).result, library, spec.id);
    });

    it('ships exactly the trigger skills the library says, and the bundle traces clean', () => {
      const { build, result } = run(spec);
      checkInventory(result, build, library, spec.id);
      checkTrace(result, library, spec.id);
    });
  });

  it('some spec ships a chip skill file and some ships a pack skill file', () => {
    const kinds = new Set<string>();
    for (const spec of SKILL_SPECS) {
      for (const file of skillMds(run(spec).result)) {
        kinds.add((recordOf(file, library) as SkillRecord).kind);
      }
    }
    expect([...kinds].sort()).toEqual(['chip', 'pack']);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Every chip and every pack, alone and together, on both profiles.

describe('SKILL.md frontmatter on synthetic builds (every chip, every pack)', () => {
  // Any valid build with the chips and packs overridden: stats that fit the cap, risk only with a
  // Markets chip, and the d1 the hard part gives, so validation passes whatever the chips are.
  function synth(target: 'openclaw' | 'hermes', chips: string[], packs: string[]): Build {
    const base = buildFor({ id: `synth.${target}`, starter: 'vera', target }, library);
    const hasMarkets = chips.some((id) => library.chips.find((c) => c.id === id)?.group === 'Markets');
    const hardPart = library.heart.hardParts.find((h) => h.id === base.heart.hardPart);
    const { roles: _roles, ...rest } = base;
    return {
      ...rest,
      chips: chips as Build['chips'],
      packs: packs as Build['packs'],
      stats: { blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2, ...(hasMarkets ? { risk: 2 } : {}) },
      peeves: [],
      limits: {},
      gates: {},
      heart: { ...base.heart, d1: hardPart?.d1 ?? base.heart.d1 },
    };
  }

  const chipIds = library.chips.map((c) => c.id as string);
  const skillChipIds = library.chips.filter((c) => (c.skills ?? []).length > 0).map((c) => c.id as string);
  const packIds = library.packs.map((p) => p.id as string);

  const windows = <T,>(items: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  };

  interface Case {
    name: string;
    chips: string[];
    packs: string[];
  }
  const CASES: Case[] = [
    ...skillChipIds.map((id) => ({ name: `chip ${id} alone`, chips: [id], packs: [] })),
    ...packIds.map((id) => ({ name: `pack ${id} alone`, packs: [id], chips: [] })),
    ...packIds.flatMap((a, i) =>
      packIds.slice(i + 1).map((b) => ({ name: `packs ${a} + ${b}`, chips: [], packs: [a, b] })),
    ),
    // Six chips at a time, so every chip skill is in a build with three packs.
    ...windows(chipIds, 6).map((chips, i) => ({
      name: `chips window ${i + 1} + three packs`,
      chips,
      packs: windows(packIds, 3)[i % windows(packIds, 3).length],
    })),
    // A chip whose skill names a pack skill (the pack skill wins), and two packs that share a skill id.
    { name: 'memecoins chip + memecoins pack + perps pack', chips: ['memecoins', 'solana'], packs: ['memecoins', 'perps'] },
    { name: 'prediction markets chip + pack', chips: ['prediction_markets'], packs: ['prediction-markets'] },
    { name: 'sales chip + sales pack', chips: ['sales'], packs: ['sales'] },
  ];

  it('covers every chip with a skill and every pack, so no skill record goes unchecked', () => {
    const chipsCovered = new Set(CASES.flatMap((c) => c.chips));
    for (const id of skillChipIds) expect(chipsCovered.has(id), id).toBe(true);
    const packsCovered = new Set(CASES.flatMap((c) => c.packs));
    for (const id of packIds) expect(packsCovered.has(id), id).toBe(true);
  });

  for (const target of FRONTMATTER_PROFILES) {
    it(`${target}: every case passes every check`, () => {
      let files = 0;
      for (const c of CASES) {
        const build = synth(target, c.chips, c.packs);
        const result = compile(build);
        checkAll(result, build, library, `${target} ${c.name}`);
        files += skillMds(result).length;
      }
      expect(files).toBeGreaterThan(100);
    });

    it(`${target}: two packs that share a skill id get distinct, valid directories`, () => {
      const build = synth(target, [], ['memecoins', 'perps']);
      const dirs = skillMds(compile(build)).map(dirOf);
      // Both packs carry a position-log skill.
      expect(dirs.filter((d) => d.endsWith('position-log')).length).toBe(2);
      expect(dirs).toContain('position-log');
      expect(dirs).toContain('perps-position-log');
    });

    it(`${target}: a chip skill that a selected pack skill also names ships once, as the pack skill`, () => {
      const build = synth(target, ['memecoins'], ['memecoins']);
      const ids = skillMds(compile(build)).map((f) => f.lines[0].sources?.[0] ?? '');
      expect(ids.filter((id) => id.endsWith('rug_check') || id.endsWith('rug-check'))).toEqual(['pack.memecoins.skill.rug-check']);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 4. Hostile text on a synthetic library: quoting, newlines and long or odd skill ids.

describe('SKILL.md frontmatter on a synthetic library with awkward skill text and ids', () => {
  const NASTY =
    'Say "hi" and \\ then:\nstop # not a comment\n\n  * starts after a break, café “quoted”  ';
  const LONG = `${'a'.repeat(63)}-tail`; // 69 characters; a cut at 64 would end in a hyphen

  function synthLibrary(): Library {
    const memecoins = library.packs.find((p) => p.id === 'memecoins') as NonNullable<(typeof library.packs)[number]>;
    const [s0, s1, s2, s3] = memecoins.skills;
    const skills: Skill[] = [
      { ...s0, kind: 'trigger', id: LONG, name: 'Long one', whenToUse: NASTY },
      { ...s1, kind: 'trigger', id: LONG, name: 'Long two', whenToUse: 'Second skill with the same long id.' },
      { ...s2, kind: 'trigger', id: LONG, name: 'Long three', whenToUse: 'Third skill with the same long id.' },
      { ...s3, kind: 'trigger', id: 'under_score_id', name: 'Underscored', whenToUse: 'An id with underscores.' },
    ];
    return {
      ...library,
      packs: library.packs.map((p) => (p.id === 'memecoins' ? { ...p, skills } : p)),
      chips: library.chips.map((c) =>
        c.id === 'solana'
          ? {
              ...c,
              skills: (c.skills ?? []).map((s, i) =>
                i === 0 ? { ...s, detail: 'Chip text with a "quote", a \\ backslash,\nand a second line: ok.' } : s,
              ),
            }
          : c,
      ),
    };
  }

  const lib = synthLibrary();
  const base = buildFor({ id: 'synth.vera', starter: 'vera', target: 'openclaw' }, lib);
  const build = (target: 'openclaw' | 'hermes'): Build => {
    const { roles: _roles, ...rest } = buildFor({ id: `synth.${target}`, starter: 'vera', target }, lib);
    return {
      ...rest,
      chips: ['solana'] as Build['chips'],
      packs: ['memecoins'] as Build['packs'],
      stats: { ...base.stats, blunt: 2, warm: 2, funny: 2, chatty: 2, proactive: 2, risk: 2 },
      peeves: [],
      limits: {},
      gates: {},
      heart: { ...base.heart, d1: lib.heart.hardParts.find((h) => h.id === base.heart.hardPart)?.d1 ?? base.heart.d1 },
    };
  };

  for (const target of FRONTMATTER_PROFILES) {
    describe(target, () => {
      const b = build(target);
      const result = compile(b, lib);

      it('ships the four synthetic pack skills and the chip skill', () => {
        const ids = skillMds(result).map((f) => f.lines[0].sources?.[0] ?? '');
        expect(ids.filter((id) => id.startsWith('pack.memecoins.skill.')).length).toBe(4);
        expect(ids).toContain('chip.solana.skill.wallet_glance');
      });

      it('keeps the frontmatter to four lines whatever newlines the skill text holds', () => {
        checkFrontmatterShape(result, target);
      });

      it('escapes quotes, backslashes and newlines so every description parses back to the skill text on one line', () => {
        checkDescription(result, lib, target);
        const byLabel = new Map(skillMds(result).map((f) => [f.label, f]));
        const nasty = byLabel.get('Skill: Long one') as BundleFile;
        const raw = nasty.content.split('\n')[2].replace(/^description: /, '');
        expect(parseYamlDoubleQuoted(raw)).toBe('Say "hi" and \\ then: stop # not a comment * starts after a break, café “quoted”');
        const chip = skillMds(result).find((f) => f.lines[0].sources?.[0] === 'chip.solana.skill.wallet_glance') as BundleFile;
        const chipRaw = chip.content.split('\n')[2].replace(/^description: /, '');
        expect(parseYamlDoubleQuoted(chipRaw)).toBe('Chip text with a "quote", a \\ backslash, and a second line: ok.');
      });

      it('keeps every directory valid, within 64 characters and unique, when ids are long, repeated or underscored', () => {
        checkDirs(result, target);
        const dirs = skillMds(result).map(dirOf);
        expect(dirs.length).toBeGreaterThanOrEqual(5);
        expect(dirs.some((d) => d.length > 55), 'a long directory is present').toBe(true);
        // No directory ends in a hyphen from a cut at 64 characters.
        for (const d of dirs) expect(d, d).not.toMatch(/-$/);
        // The underscored id became hyphens.
        expect(dirs).toContain('under-score-id');
      });

      it('takes the chip skill body from the chip text and traces clean', () => {
        checkTemplateAndTrace(result, lib, target);
        checkTrace(result, lib, target);
      });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 5. Other profiles get no frontmatter.

describe('profiles other than openclaw and hermes get no SKILL.md frontmatter', () => {
  const OTHERS = GOLDEN_SPECS.filter((s) => !(FRONTMATTER_PROFILES as readonly string[]).includes(s.target));

  it('no file on any other golden spec is a SKILL.md, or starts with a frontmatter fence', () => {
    let checked = 0;
    for (const spec of OTHERS) {
      const result = compile(buildFor(spec, library));
      for (const file of result.files.filter((f) => f.kind === 'skill' || f.kind === 'knowledge')) {
        checked += 1;
        expect(file.path, spec.id).not.toMatch(/SKILL\.md$/);
        expect(file.content.startsWith('---'), `${spec.id} ${file.path}`).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('the custom GPT knowledge files carry no frontmatter either', () => {
    const spec: GoldenSpec = { id: 'marty.chatgpt-gpt', starter: 'marty', target: 'chatgpt', mode: 'gpt' };
    const result = compile(buildFor(spec, library));
    const files = result.files.filter((f) => f.kind === 'knowledge');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file.content.startsWith('---'), file.path).toBe(false);
  });
});
