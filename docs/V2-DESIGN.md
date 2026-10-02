# Build-a-Bot v2 design (lead architecture)

Structure only. Every word that lands in a bot's output comes from library JSON authored per docs/Build-a-Bot-v2-Brief.md (Brian's text verbatim where he gave it, the author agent's text where he did not, `[TODO: ...]` where neither). This doc never supplies output text; where it shows example strings they are illustrations of shape, not content. Decisions here are logged in QUESTIONS.md as V-numbered entries.

## 1. Ids and delivery profiles

- `TargetId = 'muse' | 'openclaw' | 'hermes' | 'grok' | 'chatgpt'` (the five cards on station 0).
- `ChatgptMode = 'dot' | 'gpt' | 'instructions' | 'project'`.
- `ProfileId = 'muse' | 'openclaw' | 'hermes' | 'grok' | 'chatgpt-dot' | 'chatgpt-gpt' | 'chatgpt-instructions' | 'chatgpt-project'`.
- `profileIdOf(build)`: `target === 'chatgpt' ? 'chatgpt-' + (mode ?? 'dot') : target`.
- A **profile** is the unit of delivery: everything about how a bundle is built for one runtime. `targets.json` holds `{ targets: TargetCard[5], profiles: Profile[8] }` (V1).

## 2. Build v2

```ts
interface BuildCore { base; chips; stats; peeves; heart; outfit; name }        // v1 fields, unchanged
interface BuildV1 extends BuildCore { v: 1 }
interface Build extends BuildCore {
  v: 2;
  target: TargetId;
  mode?: ChatgptMode;        // only when target is chatgpt; absent means 'dot'
  plan?: 'free' | 'paid';    // only when profile is chatgpt-instructions; absent means 'free' (V2)
  packs: PackId[];           // 0..3, unique
  limits: Record<LimitId, number>;
  gates: Record<ActionId, GateSetting>;
  roles?: RoleId[];
}
type GateSetting = 'auto' | 'approve' | 'forbid';
```

- Every v1 pass keeps taking `BuildCore` (cond, resolve, assemble, name, seed...).
- `RosterEntry.build` stays `BuildV1`: starters are target-agnostic. A roster card compiles for a target through `migrate(entry.build, { target, mode, plan })`.
- `compile(build: Build | BuildV1, lib)` migrates a v1 build to v2 first (target muse) so old links keep working.

### Effective gates and limits (V3)

`effectiveGates(build, lib)`:
1. Start with `{ pay: 'forbid' }` (pay is present in every build: "pay defaults to forbid everywhere").
2. For each selected pack in order, for each `[action, setting]` of `pack.gatesDefault`: if the action is unset, set it; if set, keep the stricter (`forbid` > `approve` > `auto`).
3. Apply `build.gates` overrides for actions in the set.
4. Force `pay = 'forbid'` (locked; validation already rejects anything else).

`effectiveLimits(build, lib)`: for each selected pack in order, each `limitsDefault` entry; on conflict keep the stricter value per the limit's `stricter: 'lower' | 'higher'`; then apply `build.limits` overrides.

Gate order everywhere (soul lines, rules lines, custom rules): `lib.gates` registry order.

### Validation additions (pass 1)

- `v === 2`; `target` known; `mode` only for chatgpt and known; `plan` only for chatgpt-instructions.
- `packs`: 0..3, unique, known.
- `gates`: every key is `pay` or an action some selected pack exposes in `gatesDefault`; values are GateSettings; `pay`, if present, is `forbid`.
- `limits`: every key is in some selected pack's `limitChips`; value within the limit's `min..max` and on its `step`.
- `roles`: all known, all from ONE role set. The set's coordinator is added by normalization if absent (not an error).
- Existing v1 rules unchanged (cap 14, floors, risk iff a Markets chip, chips <= 6, peeves <= 5, name 1..24).

## 3. Library record types (all in src/compiler/types.ts)

```ts
interface Line { id: string; line: string }

interface TargetCard { id: TargetId; label: string; promise: Line; modes?: { id: ChatgptMode; label: string; note: Line }[] }

interface Profile {
  id: ProfileId; target: TargetId; mode?: ChatgptMode; label: string;
  docUrl: string; docReadDate: string;          // pinned, YYYY-MM-DD
  layout: 'soul' | 'grok' | 'instructions';
  personalityPath: string;                        // literal path or UI location from the brief
  personalityDelivery: 'file' | 'paste' | 'spoken';
  openingLines: Line[];
  chassisForm: 'full' | 'short';                  // 'short' uses each chassis line's `short` text (grok, instructions free)
  chassisVariants: Record<string, string | null>; // chassis id -> replacement text, or null to omit
  rulesDelivery: 'AGENTS.md' | 'RULES.md' | 'inline' | 'description' | 'custom-rules';
  rulesInSoul: 'none' | 'section' | 'top-and-bottom';
  skillsDelivery: 'files' | 'spoken' | 'inline' | 'knowledge';
  memoryDelivery: 'file' | 'spoken' | 'inline';
  routinesDelivery: 'spoken' | 'files' | 'none';
  installSteps: Line[];
  reloadNote: Line | null;
  verify: Line[];                                 // each line text starts "verify: "
  supportsRoles: boolean;
  roleFallback: 'workspaces' | 'profiles' | 'team' | 'separate-bundles' | 'single-dot-note' | 'none';
  lengthCap: number | { free: number; paid: number };
  customRuleSettings?: Record<GateSetting, string>; // chatgpt-dot only
  templates: Record<string, Line>;                // keys in section 6
}

interface Skill {        // pack skills, the six-field shape
  id: string; name: string; kind: 'trigger' | 'schedule'; schedule?: string;
  whenToUse: string; inputs: string; steps: string[]; validate: string; returns: string;
  requiresApproval: string;     // human text; "none" when nothing needs a yes
  actions: ActionId[];          // machine list of gated actions this skill can take
}
// Chip skills keep their v1 shape (ChipSkill: id, name, kind, schedule?, sentence, detail).

interface WorkflowPack {
  id: PackId; label: string;
  triggers: Line[];                               // <= 8
  gatesDefault: Record<ActionId, GateSetting>;
  limitsDefault: Record<LimitId, number>;
  limitChips: LimitId[];
  skills: Skill[];
  seeds: Line[];                                  // memory clauses
  defaultRoles: RoleId[];
  rulesLines: Line[];
  venueNotes?: Record<string, Line>;              // keyed by ProfileId
  job?: Line; sources?: Line[]; deliverable?: Line; firstTask?: Line;   // grok profile overrides
  profiles?: ProfileId[];                         // absent = deliverable on every profile
}

interface RoleSet { id: RoleSetId; label: string; coordinator: RoleId; members: RoleId[]; defaultMembers: RoleId[]; packs: PackId[]; templates: Record<string, Line> }

interface RolePack {
  id: RoleId; set: RoleSetId; label: string;
  mission: Line; drive: Line; counterDrive: Line;
  never: Line[];                                  // 3..6
  reporting: { to: RoleId | 'user'; format: Line; verdictFirst: boolean };
  proactiveDefault: Level; bluntDefault: Level;
  uncertaintyRule: Line;
  anchorExchange: { me: Line; you: Line };
  canDelegate: boolean;
  lockedStats?: Partial<Stats>;
}

interface ActionGate {
  id: ActionId; label: string;
  class: 'money' | 'mail' | 'data' | 'other';    // pack-default safety test uses this
  soulLine: Record<GateSetting, string | null>;   // personality layer text per setting
  rulesLine: Record<GateSetting, string>;         // rules layer text per setting
  customRuleText: string;                         // Dots: describes the action
}

interface Limit { id: LimitId; label: string; unit: string; min: number; max: number; step: number; stricter: 'lower' | 'higher'; rulesTemplate: string }  // template uses {value}
```

`ChassisLine` gains `short?: string`. Two new chassis records: `chassis.memory.no_self_edit` and `chassis.rules.outrank` (text from Part C). Profiles that must not carry them set them to `null` in `chassisVariants`.

## 4. CompileResult v2 (a bundle)

```ts
interface BundleFile { path: string; label: string; delivery: 'file' | 'paste'; content: string; lines: TracedLine[] }
interface SpokenItem { label: string; text: string; ids: string[] }
interface CustomRule { gate: ActionId; action: string; setting: string; ids: string[] }
interface CompileResult {
  profile: ProfileId;
  files: BundleFile[];
  spoken: SpokenItem[];
  customRules: CustomRule[];           // chatgpt-dot only, else []
  conversationStarters?: string[];     // chatgpt-gpt only
  description?: string;                // chatgpt-gpt only, < 300 chars
  installSteps: string[];
  notes: string[];                     // verify lines, reload note, venue notes, fallback warnings
  gates: Record<ActionId, GateSetting>; limits: Record<LimitId, number>;
  packs: PackId[]; roles: RoleId[];
  soul: string; soulLines: TracedLine[]; // the main personality artifact as delivered (see section 5)
  seed: string; skills: SkillSentence[]; badges: BadgeId[]; buildName: string;
  length: number; warnings: string[];
}
```

Trace (pass 11) holds for every line of every file and every spoken item: every non-blank line's id, and every id in `SpokenItem.ids` and `CustomRule.ids`, is a library id.

## 5. Layers per profile

Three layers: PERSONALITY, RULES, SKILLS, plus memory, routines and install steps.

| Profile | Personality artifact (`soul`) | Rules layer | Skills | Memory | Routines |
| --- | --- | --- | --- | --- | --- |
| muse | paste `Identity > Soul`: soul layout + rules section | inline section in the soul | spoken (v1 sentences) | spoken seed | spoken |
| openclaw | file `SOUL.md` | file `AGENTS.md` | files `skills/<id>/SKILL.md` | file `USER.md` | spoken + verify note |
| hermes | file `SOUL.md` + rules section | file `AGENTS.md` and the SOUL.md section | files `skills/<id>/SKILL.md` | file `USER.md` | spoken + verify note |
| grok | paste `Edit Profile > Description`: grok layout | its `## Never` block, and every skill's approval field | spoken, six fields | spoken seed | spoken, six confirmations |
| chatgpt-dot | spoken item `Personality`: opening line + soul layout | custom rules (one per gate) | spoken + Brian's suffix | spoken seed | spoken |
| chatgpt-gpt | paste `Configure > Instructions`: gates block, soul, skill pointers, gates block | top and bottom blocks | knowledge files `knowledge/<id>.md` + pointer lines | spoken seed | spoken + verify note |
| chatgpt-instructions | paste field 2: gates block, soul (compact when free), inline skills, gates block | top and bottom blocks | inline, top three, one line each | paste field 1 (memory block) | none |
| chatgpt-project | paste `Project > Instructions`: like gpt | top and bottom blocks | files `project/<id>.md` + pointer lines | spoken seed | spoken + verify note |

`length` = `soul.length`; the cap applies to `soul` (and to field 1 for instructions). Caps: muse, openclaw, hermes, chatgpt-dot 3,600; grok 2,000; chatgpt-gpt and chatgpt-project 8,000; chatgpt-instructions 1,500 free, 5,000 paid; gpt description < 300.

### Soul layout (muse, openclaw, hermes, dot, gpt, project, instructions paid)

v1 sections in v1 order, with these additions:
- opening: `profile.openingLines` (replaces chassis opening lines for every profile except muse, whose opening lines ARE the chassis opening records).
- instincts: after chip triggers, each selected pack's triggers (kind `pack-trigger`, in pack order), then badges, hard part extra, voice.
- act: `chassis.act.approval` (kept, generic), then one gate soul line per effective gate whose `soulLine[setting]` is non-null (kind `gate`), then the rest of the act chassis lines.
- memory: chassis memory lines with variants applied (`no_self_edit`, `refine`, `rules.outrank` per profile).
- rules section (when `rulesInSoul === 'section'`): heading from `templates['rules.heading']`, then the rules block (section 7).
- top-and-bottom (when `rulesInSoul === 'top-and-bottom'`): the rules block before the opening and again after the clash line, with `templates['rules.top']` and `templates['rules.bottom']` headings.

### Grok layout

`<Name>. <job>` (template `grok.nameLine` with `{name}` and `{job}`; job = first selected pack's `job`, else `grok.job.<baseId>`), then sections with headings from `templates`: What you want (drives, tiebreak), How you work (stat lines, chassis talk lines, peeves, instincts, act lines incl. gate soul lines and trading line, proactive line, `grok.autonomy`, `grok.routineDiscipline`, chassis memory and clash lines), Sources (packs' `sources` or `grok.sources`), Never (rules block), When data is missing (`grok.noData`), What you return (packs' `deliverable` or `grok.deliverable`), How this sounds (examples). Chassis uses `short` forms. No opening lines, no no-self-edit, no rules-outrank.

### Instructions layout

Paid: soul layout capped at 5,000. Free (1,500): compact soul: drives, gate soul lines, chassis in `short` form, five stat lines, the first three peeves, the first two chip triggers, one example (example 2). Field 1 is the memory block (template `memory.block` with `{seed}`).

## 6. Profile templates (keys; text authored per profile)

Placeholders in braces are filled by code. Required keys by profile:
- all: `memory.sentence` (`{seed}`), `skill.legacy` (`{sentence}`, for chip skills), `routine.legacy` (`{schedule}`, `{sentence}`).
- soul profiles with a rules section or blocks: `rules.heading` or `rules.top` + `rules.bottom`.
- openclaw, hermes: `agents.heading`, `agents.intro`, `skill.file` (`{name}`, `{whenToUse}`, `{inputs}`, `{steps}`, `{validate}`, `{returns}`, `{requiresApproval}`; `{steps}` renders as numbered lines), `memory.file.heading`, `routine.sentence`.
- grok: `grok.nameLine`, `grok.job.<baseId>` x8, `grok.sources`, `grok.deliverable`, `grok.firstTask`, `grok.noData`, `grok.autonomy`, `grok.routineDiscipline`, headings `grok.h.want`, `grok.h.work`, `grok.h.sources`, `grok.h.never`, `grok.h.missing`, `grok.h.return`, `grok.h.sounds`, `skill.sentence` (all six fields), `skill.approvalSuffix` (`{rules}`), `routine.sentence` (six confirmations).
- chatgpt-dot: `personality.opener` (Brian: "Here's how I want you to work:"), `skill.sentence`, `skill.suffix` (Brian: "Save this as how you do <task> and tell me when you've got it." with `{task}`), `routine.sentence`, `fallback.roles`.
- chatgpt-gpt, chatgpt-project: `skill.pointer` (`{whenToUse}`, `{file}`), `knowledge.file`, `description` (`{name}`, `{buildName}`, `{baseLine}`), `routine.sentence`, `fallback.roles`, gpt only `actions.consequential`.
- chatgpt-instructions: `skill.inline`, `memory.block`.

## 7. Rules block

Lines, in order: for each effective gate in registry order, `rulesLine[setting]` (kind `rule`); for each effective limit, `rulesTemplate` with `{value}` (kind `limit`); each selected pack's `rulesLines` (kind `pack-rule`). AGENTS.md = `agents.heading`, `agents.intro`, the rules block, and the chassis `rules.outrank` line is NOT repeated there. Grok's Never block = the rules block. Dot's rules layer = custom rules: one per effective gate, `{ gate, action: gate.customRuleText, setting: profile.customRuleSettings[setting] }`.

### Gate both-layers definition (the test)

For every effective gate with setting `approve` or `forbid`:
- personality: `soul` contains `gate.soulLine[setting]`.
- rules: muse and hermes: `soul` contains `gate.rulesLine[setting]` (hermes: AGENTS.md too); openclaw: AGENTS.md contains it; grok: the `## Never` section contains it, and every pack skill whose `actions` include the gate carries it in its approval field; chatgpt-dot: `customRules` has exactly one entry for the gate with the mapped setting; gpt, project, instructions: `soul` contains it at least twice (top and bottom blocks).

### Pack default safety (the test)

For every pack: if it exposes `trade`, `gatesDefault.trade === 'approve'` and `gates.trade.soulLine.approve` is Brian's line; `send` and `delete`, where present, default to `approve` or `forbid`; `pay`, where present, is `forbid`; no action of class `money`, `mail` or `data` defaults to `auto`.

## 8. Skills, memory, routines

- Pack skills (six-field) and chip skills (v1) both feed the bundle, chips first in tap order, then packs in order. Trigger kind = skill; schedule kind = routine.
- files profiles: each trigger skill -> `skills/<id>/SKILL.md` (pack skills via `skill.file`; chip skills render `# {name}` then `detail`). Routines -> spoken.
- spoken profiles: `skill.sentence` (pack) or `skill.legacy` (chip); dot appends `skill.suffix`.
- grok: every pack skill sentence states all six fields and ends with `skill.approvalSuffix` carrying the build's rules lines for the skill's `actions`; chip skills use `skill.legacy` plus `skill.approvalSuffix` with all approve/forbid rules lines.
- knowledge/project files: `knowledge/<id>.md` / `project/<id>.md` via `knowledge.file`, plus one `skill.pointer` line in the instructions.
- instructions: the first three skills, one line each, via `skill.inline`, inside field 2.
- Memory: the v1 seed sentence plus each selected pack's `seeds` clauses. File profiles write `USER.md` (`memory.file.heading`, then one bullet per chip seed, pack seed, and the hard part clause; ids `chip.<id>.seed`, `pack.<id>.seed.<n>`, `heart.<hardPart>.seedClause`).

## 9. Roles

- `build.roles` normalized: coordinator of the set added if absent; order = set `members` order.
- Role soul (soul layout or grok layout per profile): opening, `## Mission`, What you want (drive, counter-drive, the build's d3, tiebreak), How you talk (stat lines with `bluntDefault`/`proactiveDefault` replacing the user's blunt and proactive, then `lockedStats` overriding everything), Never (role `never`, then `Report to <coordinator>. Never delegate.` for non-coordinators, reviewer and fact-checker lines), Reporting (to, format, verdict-first line), When you're unsure (`uncertaintyRule`), Acting for me (chassis + gate soul lines), memory chassis, How this sounds (`anchorExchange`), clash. 40..120 lines including blanks.
- Delivery: openclaw `workspace-<role>/SOUL.md` and `workspace-<role>/AGENTS.md` (role never-lines, delegation line and the rules block, so a worker that loads only AGENTS.md keeps its rules); hermes `profiles/<role>/SOUL.md` and `profiles/<role>/AGENTS.md` (verify paths); grok one description per role plus a team note; chatgpt-gpt and project one Instructions paste per role plus `fallback.roles` note; chatgpt-dot one `fallback.roles` note; muse and instructions: no role output, one note.

## 10. File ownership for parallel slices

- `src/library/targets.json`, `gates.json`, `limits.json`, `packs/<id>.json` (one per pack), `roles/<set>.json` (one per set), `chassis.json` (new records), `index.ts`.
- `src/compiler/` new: `profile.ts`, `gates.ts`, `migrate.ts`; `passes/` new: `packs.ts`, `rules.ts`, `deliver.ts`, `memory.ts`, `roles.ts`, `bundle.ts`, `layouts/grok.ts`, `layouts/instructions.ts`. Changed: `types.ts`, `validate.ts`, `resolve.ts`, `assemble.ts`, `render.ts`, `length.ts`, `trace.ts`, `compile.ts`.
- `src/share/encode.ts`.
- `test/packs/<pack>.probes.json`; `test/golden/v2/<starter>.<profile>[.<plan>].md`.
