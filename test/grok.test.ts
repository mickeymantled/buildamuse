// Bot Ready checks for the Grok profile. Brief Part C: every grok golden must pass all twelve
// checks from the community kit: job, sources, never-list, deliverable, first task, skill,
// no-data policy, autonomy level stated (default L1 draft), example, routine discipline,
// share-safe (no secrets or tokenized URLs), working style.
//
// Specs under test: every grok spec in GOLDEN_SPECS, which is the nine roster starters on the
// grok profile plus june.grok.roles (the main bundle: soul and spoken; role files are not checked).
//
// Profile shape (Brian): "<Name>. <Job in one sentence.> / ## What you want / ## How you work /
// ## Sources / ## Never / ## When data is missing / ## What you return / ## How this sounds."
//
// Expected text comes from the library JSON (profile templates, packs, stats, chassis), never from
// compiler output. The compiler is only asked for the soul and the spoken items under test.

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import type { GoldenSpec } from '../tools/golden.js';
import { resolveProfile } from '../src/compiler/profile.js';
import { effectiveGates } from '../src/compiler/gates.js';
import type {
  Build,
  CompileResult,
  Line,
  Skill,
  SpokenItem,
  StatId,
  WorkflowPack,
} from '../src/compiler/types.js';

const GROK_SPECS: GoldenSpec[] = GOLDEN_SPECS.filter((s) => s.target === 'grok');

// Brian's seven headings, in order (verbatim from the profile shape).
const HEADINGS = [
  '## What you want',
  '## How you work',
  '## Sources',
  '## Never',
  '## When data is missing',
  '## What you return',
  '## How this sounds',
] as const;

interface Compiled {
  spec: GoldenSpec;
  build: Build;
  result: CompileResult;
  lines: string[];
  headings: string[];
  packs: WorkflowPack[];
}

const cache = new Map<string, Compiled>();

function compiled(spec: GoldenSpec): Compiled {
  const hit = cache.get(spec.id);
  if (hit) return hit;
  const build = buildFor(spec, library);
  const result = compile(build);
  const lines = result.soul.split('\n');
  const packs = build.packs.map((id) => {
    const pack = library.packs.find((p) => p.id === id);
    if (!pack) throw new Error(`test: build ${spec.id} names unknown pack ${id}`);
    return pack;
  });
  const entry: Compiled = {
    spec,
    build,
    result,
    lines,
    headings: lines.filter((l) => l.startsWith('## ')),
    packs,
  };
  cache.set(spec.id, entry);
  return entry;
}

// The lines under a heading, up to the next "## " heading.
function sectionOf(c: Compiled, heading: string): string[] {
  const start = c.lines.indexOf(heading);
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < c.lines.length; i++) {
    if (c.lines[i].startsWith('## ')) break;
    out.push(c.lines[i]);
  }
  return out;
}

// "- text" lines with non-empty text.
function bulletsOf(lines: string[]): string[] {
  return lines.filter((l) => l.startsWith('- ') && l.slice(2).trim() !== '');
}

function template(c: Compiled, key: string): Line {
  const line = resolveProfile(c.build, library).templates[key];
  expect(line, `grok profile template ${key}`).toBeDefined();
  return line as Line;
}

// The job the library gives this build: the first selected pack with a job line, else the
// base's grok.job.<base> template.
function expectedJob(c: Compiled): string {
  const fromPack = c.packs.find((p) => p.job !== undefined)?.job;
  return (fromPack ?? template(c, `grok.job.${c.build.base}`)).line;
}

// Pack lines in pack order; the profile template when no selected pack supplies any.
function expectedPackLines(
  c: Compiled,
  pick: (p: WorkflowPack) => Line[],
  fallbackKey: string,
): string[] {
  // QUESTIONS V30: like the job line, sources and the deliverable come from the first
  // selected pack that has them.
  const pack = c.packs.find((p) => pick(p).length > 0);
  return pack ? pick(pack).map((l) => l.line) : [template(c, fallbackKey).line];
}

function spokenLabeled(c: Compiled, label: string): SpokenItem[] {
  return c.result.spoken.filter((s) => s.label === label);
}

// The approval text a skill carries in this build. A pack skill with no gated action in the
// build says its own requiresApproval; with gated actions the grok routine says the rules lines
// of the build's effective gates for those actions, in the library gate registry order.
function approvalFor(c: Compiled, skill: Skill): string {
  const gates = effectiveGates(c.build, library);
  const rules = library.gates
    // Brian: grok rules live in "the requiresApproval field of every skill": every approve or
    // forbid gate, plus any auto gate the skill itself uses.
    .filter((g) => Object.hasOwn(gates, g.id) && (gates[g.id] !== 'auto' || skill.actions.includes(g.id)))
    .map((g) => g.rulesLine[gates[g.id]]);
  return rules.length === 0 ? skill.requiresApproval : rules.join(' ');
}

// "Autonomy level stated (default L1 draft)": the sentence that names L1 must also name draft,
// so L1 is stated as the draft level and not as something else.
function statesL1Draft(text: string): boolean {
  const sentence = text.split(/(?<=[.!?:])\s+/).find((part) => part.includes('L1'));
  return sentence !== undefined && /\bdraft\b/i.test(sentence);
}

// Everything a user would copy and say or paste for the main bundle.
function copyBlocks(c: Compiled): string[] {
  return [c.result.soul, ...c.result.spoken.map((s) => s.text)];
}

describe('Grok Bot Ready: the spec set', () => {
  it('covers the nine roster starters on grok plus june.grok.roles', () => {
    const expected = [...library.roster.map((r) => `${r.id}.grok`), 'june.grok.roles'].sort();
    expect(GROK_SPECS.map((s) => s.id).sort()).toEqual(expected);
    expect(GROK_SPECS).toHaveLength(10);
  });

  it('every grok spec compiles to the grok profile', () => {
    for (const spec of GROK_SPECS) {
      expect(compiled(spec).result.profile, spec.id).toBe('grok');
    }
  });
});

describe('Grok Bot Ready: profile shape', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: the seven headings appear exactly once each, in Brian's order`, () => {
      expect(compiled(spec).headings).toEqual([...HEADINGS]);
    });

    it(`${spec.id}: the first line is the name line, before any heading`, () => {
      const c = compiled(spec);
      expect(c.lines[0].startsWith('#')).toBe(false);
      expect(c.lines[0].startsWith(`${c.build.name.trim()}. `)).toBe(true);
    });

    it(`${spec.id}: carries no no-self-edit and no rules-outrank line`, () => {
      const c = compiled(spec);
      for (const id of ['chassis.memory.no_self_edit', 'chassis.rules.outrank']) {
        const record = library.chassis.lines.find((l) => l.id === id);
        expect(record, `library chassis record ${id}`).toBeDefined();
        const texts = [record?.line, record?.short].filter((t): t is string => t !== undefined);
        expect(texts.length).toBeGreaterThan(0);
        for (const text of texts) {
          expect(c.result.soul, `${id}: ${text}`).not.toContain(text);
        }
        const emitted = c.result.soulLines.map((l) => l.id).filter((x) => x.startsWith(id));
        expect(emitted, `soulLines ids that start with ${id}`).toEqual([]);
      }
    });
  }
});

describe('Grok Bot Ready 1: job', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: first line equals "<name>. <job>", job non-empty, no TODO`, () => {
      const c = compiled(spec);
      const job = expectedJob(c);
      expect(job.trim()).not.toBe('');
      expect(job).not.toContain('[TODO');
      expect(c.lines[0]).toBe(`${c.build.name.trim()}. ${job}`);
      expect(c.lines[0]).not.toContain('[TODO');
    });

    it(`${spec.id}: the job is one sentence`, () => {
      const job = expectedJob(compiled(spec));
      expect(job.trim()).toMatch(/[.!?]$/);
      // Terminal punctuation followed by more text would mean a second sentence.
      expect(job.match(/[.!?](?=\s+\S)/g) ?? []).toEqual([]);
    });
  }
});

describe('Grok Bot Ready 2: sources', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: "## Sources" has at least one "- " line, carrying the library source lines`, () => {
      const c = compiled(spec);
      const bullets = bulletsOf(sectionOf(c, '## Sources'));
      expect(bullets.length).toBeGreaterThanOrEqual(1);
      for (const line of expectedPackLines(c, (p) => p.sources ?? [], 'grok.sources')) {
        expect(bullets).toContain(`- ${line}`);
      }
    });
  }
});

describe('Grok Bot Ready 3: never-list', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: "## Never" has at least one "- " line`, () => {
      expect(bulletsOf(sectionOf(compiled(spec), '## Never')).length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe('Grok Bot Ready 4: deliverable', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: "## What you return" has at least one "- " line, carrying the library deliverable`, () => {
      const c = compiled(spec);
      const bullets = bulletsOf(sectionOf(c, '## What you return'));
      expect(bullets.length).toBeGreaterThanOrEqual(1);
      for (const line of expectedPackLines(
        c,
        (p) => (p.deliverable ? [p.deliverable] : []),
        'grok.deliverable',
      )) {
        expect(bullets).toContain(`- ${line}`);
      }
    });
  }
});

describe('Grok Bot Ready 5: first task', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: spoken has one non-empty 'First task' item, from the library`, () => {
      const c = compiled(spec);
      const items = spokenLabeled(c, 'First task');
      expect(items).toHaveLength(1);
      expect(items[0].text.trim()).not.toBe('');
      expect(items[0].text).not.toContain('[TODO');
      const fromPack = c.packs.find((p) => p.firstTask !== undefined)?.firstTask;
      const expected = (fromPack ?? template(c, 'grok.firstTask')).line;
      expect(items[0].text).toBe(expected);
    });
  }
});

describe('Grok Bot Ready 6: skill', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: at least one spoken item labeled 'Skill: '`, () => {
      const skills = compiled(spec).result.spoken.filter((s) => s.label.startsWith('Skill: '));
      expect(skills.length).toBeGreaterThanOrEqual(1);
      for (const s of skills) expect(s.text.trim()).not.toBe('');
    });

    it(`${spec.id}: every pack skill sentence carries all six fields: when to use, inputs and access, sequence, validate, return, what requires approval`, () => {
      const c = compiled(spec);
      // Trigger skills are spoken as "Skill: <name>"; schedule skills are routines (check 10).
      for (const pack of c.packs) {
        for (const skill of pack.skills.filter((s) => s.kind === 'trigger')) {
          const items = spokenLabeled(c, `Skill: ${skill.name}`);
          expect(items, `spoken item for ${pack.id}/${skill.id}`).toHaveLength(1);
          const text = items[0].text;
          expect(text, `${skill.id} whenToUse`).toContain(`When to use: ${skill.whenToUse}`);
          expect(text, `${skill.id} inputs`).toContain(`Inputs and access: ${skill.inputs}`);
          expect(text, `${skill.id} sequence`).toContain('Sequence:');
          for (const step of skill.steps) expect(text, `${skill.id} step`).toContain(step);
          expect(text, `${skill.id} validate`).toContain(`Validate: ${skill.validate}`);
          expect(text, `${skill.id} returns`).toContain(`Return: ${skill.returns}`);
          // The sixth field. The skill's own requiresApproval always has its line; a gate rules
          // suffix is added after it, never in place of it.
          expect(text, `${skill.id} requiresApproval`).toContain(
            `What requires approval: ${skill.requiresApproval}`,
          );
        }
      }
    });
  }
});

describe('Grok Bot Ready 7: no-data policy', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: "## When data is missing" has at least one "- " line, the library no-data line`, () => {
      const c = compiled(spec);
      const bullets = bulletsOf(sectionOf(c, '## When data is missing'));
      expect(bullets.length).toBeGreaterThanOrEqual(1);
      expect(bullets).toContain(`- ${template(c, 'grok.noData').line}`);
    });
  }
});

describe('Grok Bot Ready 8: autonomy level stated (default L1 draft)', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: the soul carries the grok.autonomy template text, and it states L1 as the draft level`, () => {
      const c = compiled(spec);
      const text = template(c, 'grok.autonomy').line;
      expect(text).toContain('L1');
      expect(text).toMatch(/\bdraft\b/i);
      expect(statesL1Draft(text), 'L1 and draft in the same sentence').toBe(true);
      expect(c.result.soul).toContain(text);
    });
  }

  it('the L1 draft detector catches what it should (self-check)', () => {
    expect(statesL1Draft('Autonomy is L1, draft: you propose and draft, I approve.')).toBe(true);
    expect(statesL1Draft('Autonomy is L1, you act, I watch.')).toBe(false);
    expect(statesL1Draft('Autonomy is L1, you act, I watch. Draft anything you like.')).toBe(false);
    expect(statesL1Draft('Autonomy is L2, draft and send.')).toBe(false);
    expect(statesL1Draft('You draft things.')).toBe(false);
  });
});

describe('Grok Bot Ready 9: example', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: "## How this sounds" has a "Me: " line and a "You: " line`, () => {
      const section = sectionOf(compiled(spec), '## How this sounds');
      const me = section.findIndex((l) => l.startsWith('Me: ') && l.slice(4).trim() !== '');
      const you = section.findIndex((l) => l.startsWith('You: ') && l.slice(5).trim() !== '');
      expect(me).toBeGreaterThanOrEqual(0);
      expect(you).toBeGreaterThanOrEqual(0);
      // A Me line comes before the You line that answers it.
      expect(me).toBeLessThan(you);
    });
  }
});

describe('Grok Bot Ready 10: routine discipline', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: the soul carries the grok.routineDiscipline template text`, () => {
      const c = compiled(spec);
      expect(c.result.soul).toContain(template(c, 'grok.routineDiscipline').line);
    });

    it(`${spec.id}: every schedule pack skill is spoken as a routine with its schedule, inputs, returns and approval boundary`, () => {
      const c = compiled(spec);
      for (const pack of c.packs) {
        for (const skill of pack.skills.filter((s) => s.kind === 'schedule')) {
          const items = spokenLabeled(c, `Routine: ${skill.name}`);
          expect(items, `spoken routine for ${pack.id}/${skill.id}`).toHaveLength(1);
          expect(items[0].text, `${skill.id} schedule`).toContain(skill.schedule ?? '');
          expect(items[0].text, `${skill.id} inputs`).toContain(skill.inputs);
          expect(items[0].text, `${skill.id} returns`).toContain(skill.returns);
          expect(items[0].text, `${skill.id} approval boundary`).toContain(
            `Approval boundary: ${approvalFor(c, skill)}`,
          );
        }
      }
    });
  }
});

describe('Grok Bot Ready 11: share-safe', () => {
  // A URL with a query string, scheme or www form.
  const QUERY_URL = [/[a-z][a-z0-9+.-]*:\/\/\S*\?/i, /\bwww\.\S*\?/i];
  // An assignment of a secret-looking name: token=, key= (so api_key= too), secret=, password=.
  const ASSIGNMENT = /(token|key|secret|password|passwd|api_key|apikey)\s*=/i;
  // A run of 32 or more base64 or hex characters.
  const LONG_RUN = /[A-Za-z0-9+/]{32,}/;

  for (const spec of GROK_SPECS) {
    it(`${spec.id}: the soul and every spoken text have no tokenized URL, no secret assignment, no long key-like run`, () => {
      const c = compiled(spec);
      for (const text of copyBlocks(c)) {
        for (const re of QUERY_URL) expect(text).not.toMatch(re);
        expect(text).not.toMatch(ASSIGNMENT);
        expect(text).not.toMatch(LONG_RUN);
      }
    });
  }

  it('the detectors catch what they should (self-check)', () => {
    expect('see https://x.ai/share?id=3').toMatch(QUERY_URL[0]);
    expect('see www.x.ai/p?t=1').toMatch(QUERY_URL[1]);
    expect('token=abc').toMatch(ASSIGNMENT);
    expect('api_key = abc').toMatch(ASSIGNMENT);
    expect('password=hunter2').toMatch(ASSIGNMENT);
    expect('Never put secrets, tokens or keys in code.').not.toMatch(ASSIGNMENT);
    expect('a'.repeat(32)).toMatch(LONG_RUN);
    expect('deadbeef'.repeat(4)).toMatch(LONG_RUN);
    expect('Honesty, then my instructions, then brevity, then jokes.').not.toMatch(LONG_RUN);
  });
});

describe('Grok Bot Ready 12: working style', () => {
  const STATS: StatId[] = ['blunt', 'warm', 'funny', 'chatty'];

  for (const spec of GROK_SPECS) {
    it(`${spec.id}: "## How you work" has the build's blunt, warm, funny and chatty stat lines`, () => {
      const c = compiled(spec);
      const section = sectionOf(c, '## How you work');
      for (const stat of STATS) {
        const level = c.build.stats[stat];
        const record = library.stats.find((s) => s.stat === stat && s.level === level);
        expect(record, `library stat ${stat} ${level}`).toBeDefined();
        expect(section, `${stat} level ${level}`).toContain(`- ${record?.line}`);
      }
    });
  }
});

describe('Grok Bot Ready: no placeholders ship', () => {
  for (const spec of GROK_SPECS) {
    it(`${spec.id}: no [TODO in the soul or any spoken text`, () => {
      for (const text of copyBlocks(compiled(spec))) expect(text).not.toContain('[TODO');
    });
  }
});
