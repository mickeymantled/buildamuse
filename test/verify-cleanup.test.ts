// Verify cleanup (M4 slice 4.5b; QUESTIONS W4, W32 and W33; docs/M4-PLAN.md sections 2 item 3 and 3a).
//
// What is under test: the W32 edit list as it lands in src/library/profiles.json, and what it does to
// the compiled bundles. The six "verify:" clauses that sat inside install steps, reload notes and a
// template are now their own verify records or are gone; the settled facts (V15 to V18) are notes;
// three safety caveats are short inline sentences; the Hermes step 6 duplicate is folded into the
// reload note; and the verify records carry `when` tags (routine-only lines on routines, role-only
// lines on roles, with "roles" meaning "the build picked roles" on a verify line, W32 Q3).
//
// Where the expected values come from. Nothing here is copied from compiler output.
//   - The exact words of the three caveats, the GPT flag record, the Muse note and the Hermes
//     reload addition: QUESTIONS W32, written out below.
//   - The text each embedded clause leaves behind and the text of each new verify record: the
//     pre-edit profiles.json (git HEAD of the wave 2 gate), which held each clause inline. The new
//     record is that clause, unchanged, and the step is the old step minus the clause.
//   - The `when` tags: W32 Q1 (routine-only lines get routines), Q3 (roles on a verify line means
//     the build picked roles, so the dot teams line shows on dot), and the plan's "role-only
//     verify lines get when: roles".
//   - What a build delivers: the plan's any-of rule (a skill file or a spoken skill, a spoken
//     routine), plus the library's own skill records (a skill of kind "schedule" is a routine).
//
// Reading pinned here that W32 does not spell out: the settled-fact notes must carry a dated
// citation ("dated citations", edits 13 to 17), checked as a YYYY-MM-DD date in the note text.

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { libraryIds, traceBundle } from '../src/compiler/trace.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import type { GoldenSpec } from '../tools/golden.js';
import type { Build, CompileResult, Library, Profile, StepWhen } from '../src/compiler/types.js';

// ---------------------------------------------------------------------------------------------
// Helpers.

function profileOf(id: string, lib: Library = library): Profile {
  const found = lib.targets.profiles.find((p) => p.id === id);
  if (!found) {
    throw new Error(`no library profile ${id}`);
  }
  return found;
}

const specOf = (id: string): GoldenSpec => {
  const found = GOLDEN_SPECS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`no golden spec ${id}`);
  }
  return found;
};

const cache = new Map<string, CompileResult>();
function compiled(spec: GoldenSpec): CompileResult {
  let hit = cache.get(spec.id);
  if (!hit) {
    hit = compile(buildFor(spec, library));
    cache.set(spec.id, hit);
  }
  return hit;
}

// Every golden, plus every roster starter on the three ChatGPT modes the goldens only sample
// (custom GPT, custom instructions on both plans, project), so every profile is checked with
// every starter.
const ROSTER = library.roster.map((r) => r.id);
const EXTRA_SPECS: GoldenSpec[] = ROSTER.flatMap((starter): GoldenSpec[] => [
  { id: `${starter}.chatgpt-gpt`, starter, target: 'chatgpt', mode: 'gpt' },
  { id: `${starter}.chatgpt-instructions-free`, starter, target: 'chatgpt', mode: 'instructions', plan: 'free' },
  { id: `${starter}.chatgpt-instructions-paid`, starter, target: 'chatgpt', mode: 'instructions', plan: 'paid' },
  { id: `${starter}.chatgpt-project`, starter, target: 'chatgpt', mode: 'project' },
]);
const GOLDEN_IDS = new Set(GOLDEN_SPECS.map((s) => s.id));
const ALL_SPECS: GoldenSpec[] = [...GOLDEN_SPECS, ...EXTRA_SPECS.filter((s) => !GOLDEN_IDS.has(s.id))];

const VERIFY_PREFIX = /^verify: /;

// ---------------------------------------------------------------------------------------------
// 1. "verify:" lives only in verify records. No install step and no note says it.

describe('"verify:" appears only in verify records', () => {
  it('the whole library holds "verify:" only in the lines of profile verify records', () => {
    const hits: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        if (/verify:/i.test(value)) hits.push(path);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
      }
    };
    walk(library, 'library');
    const verifyPaths: string[] = [];
    library.targets.profiles.forEach((p, i) => {
      p.verify.forEach((_v, j) => verifyPaths.push(`library.targets.profiles[${i}].verify[${j}].line`));
    });
    expect(hits.sort()).toEqual(verifyPaths.sort());
    expect(hits.length).toBeGreaterThan(0);
  });

  for (const profile of library.targets.profiles) {
    it(`${profile.id}: no install step, reload note, note, template or venue note says "verify:"`, () => {
      for (const step of profile.installSteps) {
        expect(step.line, step.id).not.toMatch(/verify:/i);
      }
      if (profile.reloadNote) {
        expect(profile.reloadNote.line, profile.reloadNote.id).not.toMatch(/verify:/i);
      }
      for (const note of profile.notes ?? []) {
        expect(note.line, note.id).not.toMatch(/verify:/i);
      }
      for (const template of Object.values(profile.templates)) {
        expect(template.line, template.id).not.toMatch(/verify:/i);
      }
    });

    it(`${profile.id}: every verify record starts with "verify: " and says it once`, () => {
      for (const record of profile.verify) {
        expect(record.line, record.id).toMatch(VERIFY_PREFIX);
        expect(record.line.slice('verify:'.length), record.id).not.toMatch(/verify:/i);
        expect(record.id).toMatch(new RegExp(`^profile\\.${profile.id}\\.verify\\.[0-9]+$`));
      }
      expect(new Set(profile.verify.map((v) => v.id)).size).toBe(profile.verify.length);
    });
  }

  it('no compiled install step and no non-verify note says "verify:", on every spec', () => {
    for (const spec of ALL_SPECS) {
      const result = compiled(spec);
      for (const step of result.steps) {
        expect(step.text, `${spec.id} ${step.id}`).not.toMatch(/verify:/i);
      }
      for (const text of result.installSteps) {
        expect(text, `${spec.id} installSteps`).not.toMatch(/verify:/i);
      }
      for (const note of result.noteItems) {
        if (note.kind === 'verify') {
          expect(note.text, `${spec.id} ${note.id}`).toMatch(VERIFY_PREFIX);
        } else {
          expect(note.text, `${spec.id} ${note.id} (${note.kind})`).not.toMatch(/verify:/i);
        }
      }
      expect(result.verify, spec.id).toEqual(result.noteItems.filter((n) => n.kind === 'verify'));
    }
  });

  it('every compiled bundle still traces clean, so the new notes and records are library ids', () => {
    const ids = libraryIds(library);
    for (const profile of library.targets.profiles) {
      for (const note of profile.notes ?? []) expect(ids.has(note.id), note.id).toBe(true);
      for (const record of profile.verify) expect(ids.has(record.id), record.id).toBe(true);
    }
    for (const spec of ALL_SPECS) {
      expect(() => traceBundle(compiled(spec), library), spec.id).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Each W32 record has its exact text.

describe('W32 edit list: exact text', () => {
  // Edits 1 to 11. The clause left each step; the step is the old step minus " verify: ...".
  const STEPS: [string, number, string][] = [
    ['openclaw', 6, 'Say each routine sentence to your agent in chat, then ask it to read the schedule back.'],
    ['hermes', 5, 'Say each routine sentence to your agent in chat, then ask it to read the schedule back.'],
    ['chatgpt-gpt', 9, 'Say each routine sentence.'],
    ['chatgpt-project', 5, 'Say each routine sentence in a chat inside the Project.'],
  ];
  it.each(STEPS)('%s step %i has no clause left in it', (pid, n, text) => {
    const step = profileOf(pid).installSteps.find((s) => s.id === `profile.${pid}.step.${n}`);
    expect(step?.line).toBe(text);
  });

  // The reload notes. Grok and OpenClaw carry the three W32 caveats; Hermes carries the d1 merge.
  const RELOADS: [string, string, string][] = [
    [
      'grok',
      'profile.grok.reload',
      'Profile changes apply to new messages. A routine that is already running may not pick up a profile edit.',
    ],
    [
      'openclaw',
      'profile.openclaw.reload',
      'Start a new session to load changes to SOUL.md and AGENTS.md. They may not apply on the next turn.',
    ],
    [
      'hermes',
      'profile.hermes.reload',
      'Restart Hermes or start a new session to load changes. When testing, avoid --ignore-rules and --safe-mode; they skip SOUL.md.',
    ],
  ];
  it.each(RELOADS)('%s reload note is %s with the W32 wording', (pid, id, text) => {
    const note = profileOf(pid).reloadNote;
    expect(note?.id).toBe(id);
    expect(note?.line).toBe(text);
  });

  it('the GPT Actions template keeps its text and ends with the short caveat sentence (W32 edit 10)', () => {
    const template = profileOf('chatgpt-gpt').templates['actions.consequential'];
    expect(template.id).toBe('profile.chatgpt-gpt.actions.consequential');
    expect(template.line).toBe(
      'If you add Actions, mark every action that writes, sends or deletes as consequential by setting x-openai-isConsequential: true in its schema. Check the exact flag name before you rely on it.',
    );
  });

  // The clauses that became records of their own: the new record is the old clause, unchanged.
  const NEW_VERIFY: [string, string, StepWhen[] | undefined][] = [
    ['hermes', 'verify: whether Hermes keeps routines in files or in chat.', ['routines']],
    ['grok', 'verify: whether a running routine picks up a profile edit.', ['routines']],
    ['chatgpt-gpt', 'verify: whether your plan includes Tasks.', ['routines']],
    ['chatgpt-project', 'verify: whether your plan includes Tasks.', ['routines']],
    // W32: "keeps the author's context words", quoted in the decision.
    [
      'chatgpt-gpt',
      'verify: the exact name of the consequential flag, x-openai-isConsequential, before you rely on it.',
      undefined,
    ],
  ];
  it.each(NEW_VERIFY)('%s has one verify record "%s"', (pid, text, when) => {
    const matches = profileOf(pid).verify.filter((v) => v.line === text);
    expect(matches).toHaveLength(1);
    expect(matches[0].when).toEqual(when);
  });

  it('GPT and Project keep the plan-Tasks line as two separate records (W32 Q4)', () => {
    const gpt = profileOf('chatgpt-gpt').verify.find((v) => v.line === 'verify: whether your plan includes Tasks.');
    const project = profileOf('chatgpt-project').verify.find((v) => v.line === 'verify: whether your plan includes Tasks.');
    expect(gpt?.id).toMatch(/^profile\.chatgpt-gpt\.verify\.[0-9]+$/);
    expect(project?.id).toMatch(/^profile\.chatgpt-project\.verify\.[0-9]+$/);
    expect(gpt?.id).not.toBe(project?.id);
  });

  it('the dot teams line drops its code word (W32 Q3): "verify: when teams of dots arrive."', () => {
    const lines = profileOf('chatgpt-dot').verify.map((v) => v.line);
    expect(lines).toContain('verify: when teams of dots arrive.');
    expect(lines.join('\n')).not.toContain('supportsRoles');
  });

  it('the V19 and V20 lines stay verify records (W32 Q2), unchanged', () => {
    const staying: [string, string][] = [
      ['grok', 'verify: group chats hold 2 to 6 Bots and the Bots decide who answers; the coordinator is a convention, not a setting.'],
      ['chatgpt-dot', "verify: Teams access for dots is an invite-only alpha, and dots can't call you at launch."],
      ['chatgpt-gpt', 'verify: scheduled tasks by plan (Free: 3 active, at most once a day).'],
      ['chatgpt-instructions', 'verify: whether custom instructions show one field or two on your plan.'],
    ];
    for (const [pid, line] of staying) {
      expect(profileOf(pid).verify.map((v) => v.line), pid).toContain(line);
    }
  });

  it('the Muse note says the default Soul text is unpublished, without "Soul.md" (W32 d2)', () => {
    const notes = profileOf('muse').notes ?? [];
    expect(notes.map((n) => n.line)).toContain(
      'Meta has not published the default Soul text (Meta help, 2026-10-01); these opening lines come from Build-a-Bot.',
    );
    for (const note of notes) {
      expect(note.line, note.id).not.toContain('Soul.md');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 3. The OpenClaw step.6 clause is gone, with no verify record in its place.

describe('the OpenClaw routines clause (V17 settled it)', () => {
  const openclaw = profileOf('openclaw');

  it('step 6 says nothing about files versus chat', () => {
    const step = openclaw.installSteps.find((s) => s.id === 'profile.openclaw.step.6');
    expect(step?.line).not.toMatch(/verify/i);
    expect(step?.line).not.toMatch(/in files or in chat/i);
  });

  it('no OpenClaw verify record asks whether routines live in files or in chat', () => {
    for (const record of openclaw.verify) {
      expect(record.line, record.id).not.toMatch(/routines/i);
      expect(record.line, record.id).not.toMatch(/in files or in chat/i);
    }
    expect(openclaw.verify.some((v) => (v.when ?? []).includes('routines'))).toBe(false);
  });

  it('keeps one OpenClaw verify record, the reload question, and states the settled fact as a note', () => {
    expect(openclaw.verify.map((v) => v.line)).toEqual([
      'verify: whether edits to SOUL.md and AGENTS.md apply on the next turn or only in a new session.',
    ]);
    const facts = (openclaw.notes ?? []).filter((n) => /keeps automations in its own database/.test(n.line));
    expect(facts).toHaveLength(1);
    expect(facts[0].line).toContain('not as files');
  });

  it('no compiled OpenClaw bundle asks the files-or-chat question anywhere in its steps or notes', () => {
    for (const spec of ALL_SPECS.filter((s) => s.target === 'openclaw')) {
      const result = compiled(spec);
      for (const text of [...result.installSteps, ...result.notes]) {
        expect(text, spec.id).not.toMatch(/in files or in chat/i);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Hermes step 6 is gone and the reload note carries the merged text (W32 d1).

describe('the Hermes step 6 duplicate (W32 d1)', () => {
  const hermes = profileOf('hermes');
  const MERGED =
    'Restart Hermes or start a new session to load changes. When testing, avoid --ignore-rules and --safe-mode; they skip SOUL.md.';

  it('has five install steps, step.1 to step.5, and no step.6', () => {
    expect(hermes.installSteps.map((s) => s.id)).toEqual([1, 2, 3, 4, 5].map((n) => `profile.hermes.step.${n}`));
    expect(hermes.installSteps.some((s) => s.id === 'profile.hermes.step.6')).toBe(false);
  });

  it('no step says restart or names the skip flags; the reload note holds all of it', () => {
    for (const step of hermes.installSteps) {
      expect(step.line, step.id).not.toMatch(/--ignore-rules|--safe-mode|new session/);
    }
    expect(hermes.reloadNote?.line).toBe(MERGED);
  });

  it('the merged note keeps the old step 6 sentence about skipping SOUL.md', () => {
    // The old step 6 ended "When testing, avoid --ignore-rules and --safe-mode; they skip SOUL.md."
    expect(hermes.reloadNote?.line.endsWith('When testing, avoid --ignore-rules and --safe-mode; they skip SOUL.md.')).toBe(true);
  });

  it('every compiled Hermes bundle carries the merged reload note once, and says it nowhere else', () => {
    for (const spec of ALL_SPECS.filter((s) => s.target === 'hermes')) {
      const result = compiled(spec);
      const reloads = result.noteItems.filter((n) => n.kind === 'reload');
      expect(reloads, spec.id).toEqual([{ id: 'profile.hermes.reload', text: MERGED, kind: 'reload' }]);
      expect(result.steps.some((s) => s.id === 'profile.hermes.step.6'), spec.id).toBe(false);
      const mentions = [...result.installSteps, ...result.notes].filter((t) => t.includes('--ignore-rules'));
      expect(mentions, spec.id).toEqual([MERGED]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 5. Settled facts are notes with a dated citation, not verify records (W32 edits 13 to 17).

describe('settled facts are notes, not verify records', () => {
  interface Settled {
    pid: string;
    fact: RegExp;
    spec: string;
  }
  const SETTLED: Settled[] = [
    { pid: 'muse', fact: /Meta has not published the default Soul text/, spec: 'marty.muse' },
    { pid: 'muse', fact: /Muse skills are built in/, spec: 'marty.muse' },
    { pid: 'openclaw', fact: /OpenClaw keeps automations in its own database/, spec: 'marty.openclaw' },
    { pid: 'hermes', fact: /Hermes loads AGENTS\.md from the folder it runs in/, spec: 'marty.hermes' },
    { pid: 'chatgpt-gpt', fact: /GPT creation is off/i, spec: 'marty.chatgpt-gpt' },
  ];

  for (const { pid, fact, spec } of SETTLED) {
    describe(`${pid}: ${fact.source}`, () => {
      const profile = profileOf(pid);
      const note = (profile.notes ?? []).find((n) => fact.test(n.line));

      it('is a record in notes, with a note id, and does not start with "verify:"', () => {
        expect(note, `no note on ${pid} says it`).toBeDefined();
        expect(note?.id).toMatch(new RegExp(`^profile\\.${pid}\\.note\\.[0-9]+$`));
        expect(note?.line).not.toMatch(/^verify:/i);
      });

      it('is in no verify record of any profile', () => {
        for (const p of library.targets.profiles) {
          for (const record of p.verify) {
            expect(record.line, record.id).not.toMatch(fact);
          }
        }
      });

      it('carries a dated citation (YYYY-MM-DD)', () => {
        expect(note?.line).toMatch(/\d{4}-\d{2}-\d{2}/);
      });

      it('compiles as a note, not a verify line, and is not under Still checking', () => {
        const result = compiled(ALL_SPECS.find((s) => s.id === spec) ?? specOf(spec));
        const item = result.noteItems.find((n) => n.id === note?.id);
        expect(item?.kind).toBe('note');
        expect(item?.text).toBe(note?.line);
        expect(result.verify.map((v) => v.id)).not.toContain(note?.id);
        for (const v of result.verify) expect(v.text).not.toMatch(fact);
      });
    });
  }

  it('GPT: the creation-off fact is a note, and the retirement date stays on the card (W32 edit 17)', () => {
    const gpt = profileOf('chatgpt-gpt');
    for (const text of [...(gpt.notes ?? []).map((n) => n.line), ...gpt.verify.map((v) => v.line)]) {
      expect(text).not.toMatch(/Dec 11|retire/i);
    }
    const card = library.targets.targets.find((t) => t.id === 'chatgpt');
    const mode = card?.modes?.find((m) => m.id === 'gpt');
    expect(mode?.deprecated?.line).toContain('Dec 11, 2026');
  });

  it('GPT: no verify record is left that says creation is off', () => {
    for (const record of profileOf('chatgpt-gpt').verify) {
      expect(record.line, record.id).not.toMatch(/creation/i);
    }
  });

  it('Muse has no verify records left, and its two notes show on every Muse bundle', () => {
    const muse = profileOf('muse');
    expect(muse.verify).toEqual([]);
    for (const spec of ALL_SPECS.filter((s) => s.target === 'muse')) {
      const result = compiled(spec);
      expect(result.verify, spec.id).toEqual([]);
      const noteIds = result.noteItems.filter((n) => n.kind === 'note').map((n) => n.id);
      expect(noteIds, spec.id).toEqual((muse.notes ?? []).map((n) => n.id));
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 6. The `when` tags on verify records.

// Library text of the lines that carry a tag, by profile. Every other verify record has none.
const GROK_GROUP_CHATS =
  'verify: group chats hold 2 to 6 Bots and the Bots decide who answers; the coordinator is a convention, not a setting.';
const GROK_RUNNING_ROUTINE = 'verify: whether a running routine picks up a profile edit.';
const HERMES_DELEGATED = "verify: whether a delegated agent loads its role profile's SOUL.md.";
const HERMES_ROUTINES = 'verify: whether Hermes keeps routines in files or in chat.';
const DOT_TEAMS = 'verify: when teams of dots arrive.';
const TASKS = 'verify: whether your plan includes Tasks.';
const GPT_SCHEDULED_BY_PLAN = 'verify: scheduled tasks by plan (Free: 3 active, at most once a day).';

const WHEN_TAGS: Record<string, Record<string, StepWhen[]>> = {
  grok: { [GROK_GROUP_CHATS]: ['roles'], [GROK_RUNNING_ROUTINE]: ['routines'] },
  hermes: { [HERMES_DELEGATED]: ['roles'], [HERMES_ROUTINES]: ['routines'] },
  'chatgpt-dot': { [DOT_TEAMS]: ['roles'] },
  'chatgpt-gpt': { [GPT_SCHEDULED_BY_PLAN]: ['routines'], [TASKS]: ['routines'] },
  'chatgpt-project': { [TASKS]: ['routines'] },
};

describe('verify `when` tags in the library', () => {
  for (const profile of library.targets.profiles) {
    it(`${profile.id}: role-only lines say roles, routine-only lines say routines, every other line has no tag`, () => {
      const expected = WHEN_TAGS[profile.id] ?? {};
      for (const record of profile.verify) {
        expect(record.when ?? [], record.id).toEqual(expected[record.line] ?? []);
      }
      // Every tagged line in the table exists, so a reworded line cannot silently drop its row.
      for (const line of Object.keys(expected)) {
        expect(profile.verify.map((v) => v.line), profile.id).toContain(line);
      }
    });
  }

  it('uses only skills, routines or roles in a verify `when`', () => {
    for (const profile of library.targets.profiles) {
      for (const record of profile.verify) {
        for (const w of record.when ?? []) {
          expect(['skills', 'routines', 'roles'], record.id).toContain(w);
        }
      }
    }
  });
});

// The plan's any-of reading of what a build delivers, except `roles` on a verify line (W32 Q3):
// that is "the build picked roles", whether or not the profile delivers role files.
function holds(w: StepWhen, result: CompileResult, build: Build): boolean {
  switch (w) {
    case 'skills':
      return (
        result.files.some((f) => f.kind === 'skill' || f.kind === 'knowledge') ||
        result.spoken.some((s) => s.kind === 'skill')
      );
    case 'routines':
      return result.spoken.some((s) => s.kind === 'routine');
    case 'roles':
      return (build.roles ?? []).length > 0;
  }
}

function expectedVerify(profile: Profile, result: CompileResult, build: Build): { id: string; text: string; kind: 'verify' }[] {
  return profile.verify
    .filter((v) => v.when === undefined || v.when.length === 0 || v.when.some((w) => holds(w, result, build)))
    .map((v) => ({ id: v.id, text: v.line, kind: 'verify' as const }));
}

// The library oracle for routines: a chip skill or a pack skill of kind "schedule".
function buildHasScheduleSkill(build: Build, lib: Library = library): boolean {
  const chips = new Map(lib.chips.map((c) => [c.id as string, c]));
  const packs = new Map(lib.packs.map((p) => [p.id as string, p]));
  return (
    build.chips.some((id) => (chips.get(id)?.skills ?? []).some((s) => s.kind === 'schedule')) ||
    (build.packs ?? []).some((id) => (packs.get(id)?.skills ?? []).some((s) => s.kind === 'schedule'))
  );
}

describe('verify lines show by their `when` tag, on every spec', () => {
  it('the verify list is the profile verify records whose tag holds, in library order', () => {
    let tagged = 0;
    for (const spec of ALL_SPECS) {
      const build = buildFor(spec, library);
      const result = compiled(spec);
      const profile = profileOf(result.profile);
      expect(result.verify, spec.id).toEqual(expectedVerify(profile, result, build));
      tagged += profile.verify.filter((v) => (v.when ?? []).length > 0).length;
    }
    expect(tagged).toBeGreaterThan(0);
  });
});

describe('role-only verify lines show when the build picked roles', () => {
  const grokSpecs = ALL_SPECS.filter((s) => s.target === 'grok');

  it('grok verify.1 (group chats) shows exactly when the build picked roles, on every grok spec', () => {
    const picked: boolean[] = [];
    for (const spec of grokSpecs) {
      const build = buildFor(spec, library);
      const shown = compiled(spec).verify.some((v) => v.text === GROK_GROUP_CHATS);
      expect(shown, spec.id).toBe((build.roles ?? []).length > 0);
      picked.push((build.roles ?? []).length > 0);
    }
    // Both cases are present, so the test is not vacuous.
    expect(picked).toContain(true);
    expect(picked).toContain(false);
  });

  it('grok june without roles hides it, june with the chief-of-staff team shows it', () => {
    expect(compiled(specOf('june.grok')).verify.map((v) => v.text)).not.toContain(GROK_GROUP_CHATS);
    expect(compiled(specOf('june.grok.roles')).verify.map((v) => v.text)).toContain(GROK_GROUP_CHATS);
  });

  it('hermes verify.2 (delegated agent) shows exactly when the build picked roles', () => {
    expect(compiled(specOf('rook.hermes')).verify.map((v) => v.text)).not.toContain(HERMES_DELEGATED);
    expect(compiled(specOf('rook.hermes.roles')).verify.map((v) => v.text)).toContain(HERMES_DELEGATED);
  });

  it('dot verify.3 (teams of dots) shows on dot when roles are picked, though dot delivers no role files', () => {
    const base = buildFor(specOf('marty.chatgpt-dot'), library);
    const team = ['scout', 'risk-manager', 'journal'];
    const without = compile(base);
    const withTeam = compile({ ...base, roles: team });

    expect(base.roles).toBeUndefined();
    expect(without.verify.map((v) => v.text)).not.toContain(DOT_TEAMS);

    // Dot compiles no role files: a single dot gets a note, and no role artifact ships.
    expect(withTeam.files.filter((f) => f.role !== undefined || f.label.startsWith('Role '))).toEqual([]);
    expect(withTeam.steps.some((s) => s.shows.includes('roles'))).toBe(false);
    expect(withTeam.verify.map((v) => v.text)).toContain(DOT_TEAMS);
    // The line is the dot record, in library order among the other dot verify lines.
    const dot = profileOf('chatgpt-dot');
    expect(withTeam.verify.map((v) => v.id)).toEqual(dot.verify.map((v) => v.id));
  });

  it('muse and custom instructions, which have no role verify record, gain no verify line from roles', () => {
    for (const id of ['marty.muse', 'marty.chatgpt-instructions-free'] as const) {
      const spec = ALL_SPECS.find((s) => s.id === id) as GoldenSpec;
      const base = buildFor(spec, library);
      const without = compile(base);
      const withTeam = compile({ ...base, roles: ['scout', 'risk-manager', 'journal'] });
      expect(withTeam.verify, id).toEqual(without.verify);
    }
  });
});

describe('routine-only verify lines show only when routines are delivered', () => {
  // The four profiles that have one, five lines in all: hermes verify.3, grok verify.2, project
  // verify.2, and two on gpt (verify.3 scheduled tasks by plan, verify.4 Tasks in the plan). Under
  // W32 Q1 every routine-only verify line says routines; Q2 only keeps the V20 line a verify record.
  const ROUTINE_LINES: [string, string][] = [
    ['hermes', HERMES_ROUTINES],
    ['grok', GROK_RUNNING_ROUTINE],
    ['chatgpt-gpt', GPT_SCHEDULED_BY_PLAN],
    ['chatgpt-gpt', TASKS],
    ['chatgpt-project', TASKS],
  ];

  // The roster starters all carry trigger skills; this library has no schedule skills, so no
  // routine is delivered on any profile.
  const noSchedules: Library = {
    ...library,
    chips: library.chips.map((c) => ({ ...c, skills: (c.skills ?? []).filter((s) => s.kind === 'trigger') })),
    packs: library.packs.map((p) => ({ ...p, skills: p.skills.filter((s) => s.kind === 'trigger') })),
  };

  for (const [pid, line] of ROUTINE_LINES) {
    describe(pid, () => {
      const specs = ALL_SPECS.filter((s) => compiled(s).profile === pid);

      it('shows exactly when the bundle delivers a routine, and that matches the library skill records', () => {
        const seen = new Set<boolean>();
        expect(specs.length).toBeGreaterThan(0);
        for (const spec of specs) {
          const build = buildFor(spec, library);
          const result = compiled(spec);
          const delivers = result.spoken.some((s) => s.kind === 'routine');
          expect(delivers, `${spec.id}: spoken routines vs library schedule skills`).toBe(buildHasScheduleSkill(build));
          expect(result.verify.some((v) => v.text === line), spec.id).toBe(delivers);
          seen.add(delivers);
        }
        expect(seen.has(true), `${pid}: some spec delivers a routine`).toBe(true);
      });

      it('is hidden when the library has no schedule skills, and the other verify lines stay', () => {
        const spec = specs[0];
        const build = buildFor(spec, noSchedules);
        const result = compile(build, noSchedules);
        expect(buildHasScheduleSkill(build, noSchedules)).toBe(false);
        expect(result.spoken.some((s) => s.kind === 'routine')).toBe(false);
        expect(result.verify.map((v) => v.text)).not.toContain(line);
        // Lines with no tag are unaffected by the missing routines.
        const untagged = profileOf(pid).verify.filter((v) => (v.when ?? []).length === 0).map((v) => v.line);
        for (const text of untagged) {
          expect(result.verify.map((v) => v.text)).toContain(text);
        }
      });
    });
  }

  it('the routines line is not gated by roles: a team without routines does not show it', () => {
    const base = buildFor(specOf('june.grok.roles'), noSchedules);
    const result = compile(base, noSchedules);
    expect(base.roles).toBeDefined();
    expect(result.verify.map((v) => v.text)).toContain(GROK_GROUP_CHATS);
    expect(result.verify.map((v) => v.text)).not.toContain(GROK_RUNNING_ROUTINE);
  });
});
