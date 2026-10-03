# Build-a-Bot M4 plan: certificate as bundle (lead architecture, rev 2)

## Sources and rules

**Sources.**
- Brian's M4 go (QUESTIONS B11 to B16).
- docs/Build-a-Bot-v2-Brief.md Parts C, E and F.
- docs/Build-a-Muse-Build-Spec.md: station 8 Certificate, certificate copy, copy blocks, share links, remix, versioning.
- QUESTIONS S9, B6, B8 and U1 to U11.
- The M4 scout reports and the three-lens plan critique (2026-10-03).

**Rules.**
- Lead readings are W1 to W30 in QUESTIONS.md.
- This doc is the contract that parallel slices share.
- Every user-facing string lives in src/ui/copy/ or comes from the library, and every new string goes on the W-list for Brian.
- Subagents run on Sonnet. The lead checks every slice itself (diff, typecheck, suite, preview pane) before committing.

## 0. Safety fixes found in planning (W23, W24)

These ship in wave 1. Both bugs are reachable today.

1. **Auto on gates that don't offer it.** For publish, delete, write_query and force_push, `soulLine.auto` is null, and the library says auto is "not offered, treat as approve". But `effectiveGates` applies any override.
   - Today, delete=auto on ChatGPT dot compiles to the enforced Custom Rule "Take action without asking".
   - Fix: `effectiveGates` clamps auto to approve for any gate whose `soulLine.auto` is null. Pay stays forced to forbid.
   - The store's `setGate` refuses auto on those gates.
   - The Gates screen's Toggle3 shows Auto disabled on those rows.
   - A test over every gate and every profile proves no profile ever emits auto for those four gates in any layer (soul, rules file, custom rules, skills).
2. **Name injection.** Validate checks only trimmed length 1..24. A link name containing a newline adds a free line to the soul, and an em dash in a name reaches the output.
   - `cleanName(s)` replaces control characters and runs of whitespace with one space, and replaces U+2014 and U+2013 with "-".
   - The store's `setName` and decode apply it.
   - `validateCore` rejects any name containing a control character or U+2014.

## 1. Compiler: structured bundle fields (W2, W14, W25)

`installSteps: string[]` and `notes: string[]` stay. tools/golden.ts renders them.

```ts
export type ArtifactKind =
  | 'personality' | 'rules' | 'memory' | 'skills' | 'routines' | 'firstTask'
  | 'customRules' | 'label' | 'starters' | 'description' | 'roles';
export type StepWhen = 'skills' | 'routines' | 'roles';

// Profile install step: tags only, the text never changes for them.
export interface InstallStep extends Line {
  shows?: ArtifactKind[];   // artifacts that render under this step
  when?: StepWhen[];        // any-of: the step shows only if the build delivers at least one
  closer?: boolean;         // unnumbered closing line, rendered last (Muse "Then say hi.")
}
// Verify records may carry `when` too (role-only verify lines).
export interface VerifyLine extends Line { when?: StepWhen[] }

export interface BundleStep { id: string; text: string; shows: ArtifactKind[]; closer: boolean }
export type NoteKind = 'verify' | 'note' | 'reload' | 'venue' | 'role' | 'actions';
export interface BundleNote { id: string; text: string; kind: NoteKind }
export interface Undelivered { kind: 'skill' | 'routine' | 'pack' | 'roles'; id: string; name: string }
export interface Trimmed { kind: 'pack-rule' | 'trigger' | 'peeve' | 'stat' | 'voice' | 'example' | 'chassis-short'; id: string; text: string; pack?: PackId }

// SpokenItem gains   kind: 'personality' | 'memory' | 'skill' | 'routine' | 'firstTask'; role?: RoleId
// BundleFile gains   kind: 'personality' | 'memory' | 'rules' | 'skill' | 'knowledge'; role?: RoleId
// BundleFields gains:
//   steps: BundleStep[];        // `when` applied; numbered by the UI after hiding; closer last
//   noteItems: BundleNote[];    // same order and text as notes
//   verify: BundleNote[];       // noteItems with kind 'verify', `when` applied
//   undelivered: Undelivered[]; // computed AFTER the layout and length fit, from the final items
//   trimmed: Trimmed[];         // what the length tiers and S1 cut, structured (not parsed from warnings)
//   starterIds: string[][]; descriptionIds: string[]; buildNameIds: string[];
//   docUrl: string; docReadDate: string;
export function artifactKindOf(x: BundleFile | SpokenItem): ArtifactKind;
// role set -> 'roles'; files: personality, rules, memory map 1:1; skill and knowledge -> 'skills';
// spoken: personality, memory, firstTask map 1:1; skill -> 'skills'; routine -> 'routines'.
```

**Step `when` (any-of).** The values are evaluated on what the bundle delivers:
- `skills`: any skill file, or a spoken item of kind skill.
- `routines`: a spoken item of kind routine.
- `roles`: `result.roles` is non-empty and the profile compiles roles.

**Undelivered.**
- On custom instructions: every trigger skill whose inline item did not survive the fit, plus every routine. Inline items carry the skill id in `sources`.
- A pack the profile can't deliver: its gates, limits and rules lines stay in effect, but its skills, triggers, seeds and job lines are left out. It is listed as kind 'pack'.
- Roles on a profile without role support are listed as kind 'roles'.
- Each item also adds a developer warning, "undelivered: <id>". Expected golden changes are the marty and june instructions free and paid goldens; the slice regenerates them.

**Trimmed.** Each Tier A cut, Tier B short form and S1 drop is recorded with its id and library text.

**Tracing.** traceBundle also checks steps, noteItems, starterIds, descriptionIds and buildNameIds.

**Guard.** A test checks that no copyable output (soul, files, spoken, customRules, starters, description) contains "verify:".

## 2. Library changes (W1, W3, W4, W21)

1. **Split (W1).** `targets.json` becomes `TargetCard[]` (the five cards). `profiles.json` becomes `Profile[]` (the eight profiles). `library/index.ts` reassembles `targets: { targets, profiles }`, so the Library type is unchanged.

2. **Step tags (W3).** These are tags only; the step text stays byte-identical. Step numbers follow the library order.

| profile | step 1 | step 2 | step 3 | step 4 | step 5 | step 6 | step 7 | step 8 to 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| muse | personality | memory | skills, routines (when skills, routines) | closer | | | | |
| openclaw | personality | rules | skills (when skills) | roles (when roles) | memory | routines (when routines) | | |
| hermes | personality | memory, rules | skills (when skills) | roles (when roles) | routines (when routines) | (none) | | |
| grok | (none) | personality, label | memory, firstTask | skills (when skills) | routines (when routines) | (none) | (none) | |
| chatgpt-dot | (none) | customRules | personality | memory | skills (when skills) | routines (when routines) | (none) | (none) |
| chatgpt-gpt | the engineer reads the ten steps and tags: description, personality, starters, skills (when skills), memory, routines (when routines) | | | | | | | |
| chatgpt-instructions | (none) | memory | personality | the engineer reads the rest | | | | |
| chatgpt-project | (none) | personality | skills (when skills) | memory | routines (when routines) | | | |

The engineer checks each tag against the step text and reports any step whose text disagrees with the proposal.

`when` is allowed only on a step whose `shows` lists only skills, routines or roles, and whose text names none of these:
- AGENTS.md
- Custom Rule
- gate
- plugin
- Actions
- private

A test enforces the `when` rule. The rules artifact and customRules must sit under a step, never in `extra`, and before any step that connects accounts, plugins or Actions.

New library record, verbatim from the brief (Part C dots): `profile.chatgpt-dot.rulesPath` = "Settings > Personalization > Permissions > Custom rules". It is the caption of the Custom Rules table.

tools/golden.ts gains a `## Steps` section ("n. text [shows]" plus closer) in the same slice, so the tags are pinned by goldens. Goldens regenerate in that slice, with a safety pass on the diff.

3. **Verify cleanup (W4).** This is content: author proposal, then safety, then transcriber, then reviewer, as the one profiles.json writer of wave 3. The six embedded clauses are:
   - openclaw step.6
   - hermes step.5
   - grok reload
   - gpt step.9
   - project step.5
   - the gpt actions.consequential template

Each clause becomes its own verify record. The OpenClaw clause is the exception: it is removed, because V17 settled it.

The three safety-relevant notes keep a short inline caveat sentence, worded by the author:
- Grok reload
- GPT consequential flag
- OpenClaw new session

Every verify record gets a `when` where it is role-only.

Facts that research already settled move from verify to note (normal contrast, with a citation):
- V15 to V18
- the GPT creation-off fact goes to the deprecated summary

The author flags two more items:
- the Hermes step.6 and reload-note duplicate;
- Muse verify.1 saying "Soul.md".

Every edit is listed for Brian. Goldens regenerate, with safety PASS on every set.

3a. **Decided after wave 1 (W31, W32).**
- **Verify cleanup:** 4.5b applies the W32 edit list.
- **Verify `when`:** on verify lines, `roles` reads "the build picked roles", while skills and routines read "delivered". Steps keep the delivered reading for all three.
- **SKILL.md:** 4.5b adds the W31 frontmatter (templates plus hyphenated dirs, with a YAML-safe description) and a test that every OpenClaw and Hermes SKILL.md starts with valid frontmatter whose `name` equals its directory.

4. **SKILL.md (W21).** A general-purpose Sonnet agent with web tools reads the official OpenClaw and Hermes skill docs and records the URL and date.
   - If frontmatter is required, it goes into the profile's `skill.file` template in profiles.json, with a new `{dir}` variable, so it traces to the template id. The description is quoted.
   - If the docs don't settle it, add a verify record with `when: ['skills']`.
   - Either way it is applied by the wave 3 profiles.json writer, with a parse test.

## 2a. Links, decode and version (W8, W20, W26)

- **`src/compiler/defaults.ts` (new, pure).** It holds FALLBACK_BASE, FALLBACK_HARD_PART, FALLBACK_OUTFIT, addRisk, d2ForBlunt and cleanName, moved out of store.ts. store.ts imports them.
- **decodeBuild.**
  - An unknown chip, peeve, pack or role is dropped (as today).
  - An unknown base, outfit, hard part or drive falls back to a default.
  - After drops, decode repairs:
    - risk is removed when no Markets chip remains, and added at the U1 level when a Markets chip has none;
    - d1 is reset to the hard part's own d1 when its chip is gone;
    - cleanName is applied.
  - It returns structured `drops: { field, id, reason: 'unknown' | 'unexposed' | 'fallback' | 'cleaned' }[]` beside the warning strings.
  - It then runs validateV2. Any failure becomes a ShareDecodeError, so a decoded link always compiles, or the app shows the link error screen.
  - Unknown ids are reported as a count and never echoed.
  - A fuzz test mutates every field of every golden build: decode either returns a build that compiles or throws ShareDecodeError.
- **Version.**
  - `migrateToLatest(raw, target = LIBRARY_VERSION, steps = MIGRATIONS)`.
  - decodeBuild passes `lib.version`, and checkShape compares against it, not the literal 2.
  - M4 does not change the real LIBRARY_VERSION.
  - A synthetic test decodes a v1 and a v2 payload with `{ ...library, version: 3 }` and an identity step 2 to 3, and checks the picks are unchanged.

## 3. Store, flow and links (W7, W9, W10, W11, W27)

**State.**
- `From = 'roster' | 'blank' | 'remix' | 'link' | 'link-remix' | null`, mirrored in `FlowState.from`. 'remix' stays the starter remix.
- New fields:
  - `lastChatgpt?: { mode; plan }`
  - `baseline?: Build` (the build when a remix started)
  - `pasted: string` (memory only)
  - `mineOn: boolean`
  - `decodeWarnings: string[]`
  - `drops: Drop[]`
  - `linkError?: string`

**`loadBuild(build, { from, warnings, drops })`.** One `set()`, no `settle()`. It assigns:
- target, mode and plan from the build;
- the draft;
- `touched = { packs: !sameList(build.packs, packsFromChips(build.chips)), d2: as starterPatch, proactive: false }`;
- `nudged: false`;
- `advancedRoles` = roles present;
- `skipped: []`;
- `lastBadge: null`;
- `from`;
- `screen`: 'certificate' for a link, 'remix' for a link remix;
- `baseline` = build;
- `decodeWarnings` and `drops`;
- `pasted: ''`, `mineOn: false`, `linkError: undefined`.

startBlank, starterPatch, reset and initialState clear the same link and remix fields.

Round-trip test, for the 55 golden builds and the nine roster links: `compile(previewBuild(loadBuild(decode(encode(b)))))` equals `compile(b)`, and applying `settle()` to the loaded state changes nothing.

**Target switch.**
- `switchTarget(target)` is a plain `set()` of target, mode and plan:
  - ChatGPT uses `lastChatgpt`, mapping gpt to dot, defaulting to dot and free.
  - Leaving ChatGPT records `lastChatgpt`.
- `settle()` no longer filters packs by profile. Packs follow chips through packsFromChips, and the pack picker hides packs the profile can't deliver; the compiler handles delivery (section 1).
- The four pinned pruning tests in ui-store.test.ts are rewritten. The random-walk invariant becomes "packs are known library packs".
- New test/ui-switch.test.ts uses a synthetic pack with `profiles` restricted. For every ordered target pair, `{ draft, mode, plan }` is deep-equal after a switch and a switch back, including an edit in between. Gates after a switch are a superset of gates before.

**Remix screen.**
- 'remix' is a side screen: in ScreenId, App SCREENS and copy.screens, but not in SCREEN_ORDER. Its title is unique.
- `nextScreen('remix') = 'base'`.
- `prevScreen('remix') = 'certificate'`.
- `prevScreen('base') = 'remix'` when from is 'link-remix'.
- `prevScreen('certificate') = 'certificate'` when from is 'link'. Back is hidden there.
- No skip and no progress dots.
- The certificate's Remix button sets `baseline` to the current build and goes to 'remix'.
- The roster's Remix still goes straight to base (B13).

**Links.**
- A hook in App reads `location` once on start:
  - `#b=` decodes and calls loadBuild with 'link';
  - `?remix=1#b=` calls loadBuild with 'link-remix';
  - a failure sets `linkError`, and App renders the LinkError view (copy, plus a Start over button) ahead of the screen switch.
- The hook then calls `history.replaceState` to the clean `origin + pathname`.
- There is no address-bar sync, no hashchange loader and no reload restore. The link exists only when the user taps Copy link or Share. W7 has the reasoning.

**`src/share/url.ts` (pure).**
- `shareUrl(origin, pathname, build)`.
- `readLocation(href) -> { payload?, remix }`.
- `cleanHref(href)`.

## 4. Certificate model (pure, `src/ui/certificate/model.ts`)

```ts
interface CertInput {
  result: CompileResult;   // already with Mine applied when mineOn (section 6)
  build: Build; profile: Profile; cap: number;
  from: From; skipped: ScreenId[]; drops: Drop[]; decodeWarnings: string[];
  starterId?: string;      // starterIdOf(build): equal v1 core fields to a roster starter
  mine?: { lines: string[]; on: boolean; replacedDashes: boolean };
}
interface CertBlock { key: string; kind: ArtifactKind | 'mine'; title: string; text: string; ids: string[]; path?: string }
interface CertGroup { key: string; heading?: string; lead?: BundleNote; blocks: CertBlock[]; showFirst?: number }
interface CertStep { id: string; n: number | null; text: string; groups: CertGroup[]; customRules?: { caption: string; rows: CustomRule[]; note?: BundleNote } }
interface CertModel {
  header: { name: string; buildName: string; tagline?: string; stats: Stats; badges: { id: string; name: string }[] };
  summary: { key: string; kind: 'auto' | 'over' | 'steer' | 'trimmed' | 'dropped' | 'undelivered' | 'deprecated'; text: string; items?: string[] }[];
  steps: CertStep[];       // closer last with n null; n = index + 1 after hiding
  extra: CertGroup[];      // artifacts no step shows (role files on grok, gpt, project), each led by its fallback note
  leftOut?: CertGroup;     // the trimmed pack rule lines on muse and grok, so the user can add them by hand
  notes: BundleNote[];     // non-verify notes, normal contrast, after the steps (the dot note goes with the table instead)
  stillChecking: BundleNote[]; // verify notes, "verify: " stripped for display
  docs: { label: string; url: string; date: string };
  skipped: string[];
  details: string[];
  meter: { length: number; cap: number; label: string };
  zip?: { filename: string; files: { path: string; content: string }[] };
}
```

**Placement.**
- Each block renders exactly once, under the first step whose `shows` includes `artifactKindOf(item)`.
- Order within a group: files first, then spoken, in bundle order.
- Muse step 3 is one group under copy "Standing instructions" (B8): skills, then routines, the first three shown, then "Show more".
- Elsewhere the groups are Skills and Routines, each showing three first.
- Role files group per role (the role label is the heading) and are led by the role fallback note.
- Custom rules render as a stacked table at the step that shows customRules:
  - one row per rule, holding the action text with its copy button and the setting label under it;
  - the caption is the rulesPath record;
  - the dot note.1 is attached to the table.
- Mine, when present, is a block right after the personality block.
- Block keys are index-based and unique.

**Summary (user words, copy).**
- **auto:** "Auto, no yes asked:" plus the gate labels set to auto. It shows on every certificate that has any auto gate.
- **over:** the over-cap count.
- **steer:** free instructions over the cap. It uses the B11 line plus Switch to Paid.
- **trimmed:** "To fit <target>, n rules from <pack label> were left out", plus one short line for other trims.
- **dropped:** known ids by library label, plus a count for unknown ids.
- **undelivered:** "Not included on <target>: ...".
- **deprecated:** mode gpt only. It shows the library retirement line and the creation-off fact once; the verify list filters any duplicate.

The raw warnings go in `details`.

**Tests.**
- Every file content, spoken text, custom rule, starter and the description appears exactly once, for the 55 golden builds plus a mode-gpt variant of each starter.
- The rules artifact and customRules are never in `extra`.
- The Muse lines appear verbatim in order, with the closer last.
- June on Muse shows three items, then Show more.

## 5. Certificate screen (W5, W6, W17)

**Header.**
- The h1 is "Meet <Name>". UI tests identify screens by App's `data-screen` attribute.
- The build name.
- The tagline, only when starterIdOf(build) matches. Custom builds show none, because the library's compiled-tagline rule has no table.
- The radar: five axes, or six with risk. An accessible SVG plus a text alternative.
- Badge pills.

**Body, in this order.**
1. The summary.
2. The numbered steps with their blocks.
3. Extra.
4. Left out.
5. Notes.
6. Still checking: muted, but at least 4.5:1 contrast, one line each. It ends with "<profile label> docs read <date>", linked to docUrl with `target=_blank rel="noopener noreferrer"`.
7. Skipped lines ("You skipped <name>.").
8. The Details disclosure.

**Footer.**
- **Meter** (existing component): it measures the personality artifact (with Mine when on), against the cap, and has an over state.
- **Copy link:** always shown.
- **Share:** only where `navigator.share` exists. It calls `navigator.share({ title: 'Meet <Name>', text: buildName, url })` synchronously in the tap and treats AbortError as done.
- **Download zip:** when any file has `delivery: 'file'`.
- **Remix.**
- **"Make this for <short name> instead":** offered for each other target, never GPT. On a gpt certificate, it also offers ChatGPT (resolves to dot).

## 6. Mine diff (W12, W28, `src/share/mine.ts`, pure)

- **mineLines(pasted, texts).** Normalize CRLF, trim, skip blank lines and any "## Mine" heading, and return the pasted lines found in none of `texts`, as a set in paste order.
  - Caps: pasted text at 20,000 characters, at most 50 Mine lines (the rest dropped, with a summary).
  - `texts` = every copyable text of the current compile, plus the compile of `baseline` (in a try/catch).
- **withMine(result, profile, lines).** Returns a full, consistent CompileResult: soul, soulLines, the personality file or spoken item, length, and an over-cap warning.
  - Placement keeps every rules and clash section after Mine. On soul and grok layouts, Mine goes before the first section of the act, rules or never group. When `rulesInSoul === 'top-and-bottom'`, it goes before the profile's rules.bottom block.
  - The heading "## Mine" is spec text. Mine lines and the heading trace to `user.mine.heading` and `user.mine.<n>`. This is the one tracing carve-out, logged for Brian (W28) and noted in CLAUDE.md.
  - Em dashes in Mine lines become " - ", and the UI says so (W28).
  - A test per profile checks that, with Mine on, the last non-blank lines of the personality artifact are unchanged, and that Mine never appears in the link or in any other artifact.
- **The switch** defaults off. Next to it, the UI says Mine lines are the user's own words and aren't checked against their approvals.

## 7. Zip (W13, `src/share/zip.ts`, pure)

- **Format:** stored entries (no compression), CRC32, UTF-8 names (flag bit 11), and a fixed DOS time of 1980-01-01 00:00, so the bytes are deterministic. No dependency.
- **API:** `zipFiles(files)`.
- **Contents:** every bundle file with `delivery: 'file'`, at its bundle path, which the certificate also shows.
- **Name:** `<slug(name)>-<profile>.zip`, slugged to [a-z0-9-]. An empty slug becomes `bot`.
- **Download:** a Blob link; revoke the object URL after the click.
- **Copy blocks:** every file also has its own copy block.
- **Test:** an in-test unzip reads every entry back byte for byte.

## 8. Bundle split (W1, design A)

- **Shell.** `src/main.tsx` renders `src/ui/Shell.tsx`. Shell imports only the cards (`library/targets.json`), copy, components and the presentational `TargetPicker`. No store, flow, Station, compiler or library index.
- **TargetPicker.** `src/ui/screens/TargetPicker.tsx` is presentational. The App's Target screen wraps it.
- **Loading the app.**
  - Shell keeps the pick in local state.
  - On Next: `await Promise.all([import('./App.js'), import('./store.js')])`, then `setTarget` and `go('roster')`, then render App.
  - Prefetch runs on requestIdleCallback, with a setTimeout(1500) fallback.
  - A URL with `#b=` or `?remix=1` starts loading at once and shows the loading state.
- **Failure.** A failed import, or `vite:preloadError`, shows copy.load.failed with Retry.
- **Config.** vite.config.ts sets `base: './'` and `build.manifest: true`.
- **Check.** `npm run check:bundle` (tools/check-bundle.ts) runs vite build in a child process with NODE_ENV=production and asserts:
  - the entry chunk and its static imports contain no sample strings from packs, roles, profiles, chassis or stats;
  - stdout has no "larger than 500 kB" warning.

  It runs in the shell slice and again at the end.

## 9. CopyButton (W19)

- Inside the click handler:
  - run the textarea copy synchronously first;
  - if it returns false, call `navigator.clipboard.writeText` and settle on its promise.
- There is no async fallback anywhere.
- New `selectRef` prop: when both paths fail, select the block's `<pre>`.
- Tests stub both APIs and check the call order within the same click task.
- iOS Safari is checked in the Simulator by the lead. Android Chrome is a check for Brian.

## 10. Waves and file ownership (one writer per file per wave)

Code slices pair an engineer (src) with a tester (new test files, plus pinned-test edits named in the brief). A reviewer loop follows, then the lead gate: diff read, typecheck, suite, preview, commit. Only the lead writes QUESTIONS.md and PROGRESS.md.

**Wave 0 (lead).**
- This plan.
- copy.ts split into `src/ui/copy/*.ts`, spread into one `copy` object.
- QUESTIONS and PROGRESS.

**Wave 1.**

| slice | contents | writes |
| --- | --- | --- |
| 4.1 | split | src/library/index.ts, targets.json, profiles.json |
| 4.2 | compiler fields | types.ts, bundle.ts, deliver.ts, roles.ts, compile.ts, trace.ts, layouts/instructions.ts, the 4 instructions goldens |
| 4.0 | safety fixes | gates.ts, validate.ts, Toggle3.tsx, Gates.tsx |
| 4.6 | decode, version, defaults | encode.ts, migrate.ts, compiler/defaults.ts, store.ts (imports, setGate, setName only) |
| 4.7a | url helpers | src/share/url.ts |
| 4.8 | zip | src/share/zip.ts |
| 4.15 | CopyButton | CopyButton.tsx |
| 4.3 | SKILL.md research | text only |
| 4.5a | author verify proposal | text only |

**Wave 2.**

| slice | contents | writes |
| --- | --- | --- |
| 4.4 | step tags, rulesPath, golden Steps, goldens, safety | profiles.json, tools/golden.ts, goldens |
| 4.7b | store, flow, App, links, LinkError, switch | store.ts, flow.ts, App.tsx, copy/links.ts, ui-store tests |
| 4.9 | mine | src/share/mine.ts |
| 4.10 | shell | main.tsx, Shell.tsx, TargetPicker.tsx, Target.tsx, vite.config.ts, tools/check-bundle.ts, package.json scripts |
| 4.11 | model | src/ui/certificate/model.ts |

**Wave 3.**

| slice | contents | writes |
| --- | --- | --- |
| 4.5b | verify transcription, plus the SKILL.md template if needed; goldens, safety on all sets, guard test | profiles.json |
| 4.12 | certificate UI | Certificate.tsx, certificate/*.tsx except Actions, Radar.tsx, copy/certificate.ts; migrates the M3 certificate tests |
| 4.14 | remix screen | Remix.tsx, copy/remix.ts |

**Wave 4.**

| slice | contents | writes |
| --- | --- | --- |
| 4.13 | actions | certificate/Actions.tsx, copy/actions.ts, plus the PreviewStrip meter with Mine |
| 4.17 | integration tests | June and Rook links in the UI, switch, remix, zip, bundle check |

**Wave 5 (lead).**
- Golden and safety recheck.
- 4.18 docs.
- 4.19 multi-lens review, browser and iOS Simulator.
- 4.20 the M4 report plus the first three M5 slices.

## 11. M4 done criteria (lead-written; B14 gives none)

1. **Artifacts.** For the 55 golden builds and the gpt variants:
   - every artifact appears once with a copy block;
   - steps are in library order, with hidden steps and the closer per the tags;
   - rules and customRules always sit under a step;
   - verify lines appear only in Still checking.
2. **Muse.** The spec lines verbatim in order, Standing instructions with three shown and then Show more, and "Then say hi." last.
3. **Dot.** The stacked Custom Rules table with the rulesPath caption, the three B6 labels and the dot note.
4. **Zip.** It unpacks byte for byte to the bundle files.
5. **Links.**
   - June and Rook reproduce from their links in the UI.
   - A v1 link decodes.
   - The synthetic version bump passes.
   - Unknown or invalid links warn or show the link error, and never crash.
   - Link load and remix keep target, mode, plan, packs, limits, gates and roles.
   - Nothing is written to the address bar after load.
6. **Link remix.**
   - The warning shows the short target name.
   - The paste box shows.
   - Mine defaults off.
   - Mine placement is safe.
   - Mine never reaches the link.
   - Remix state is cleared on every entry point.
7. **Switch.** `{ draft, mode, plan }` is unchanged by a switch and a switch back, the gates superset holds, and GPT is never offered.
8. **Summary.** auto, over, steer, trimmed, dropped, undelivered and deprecated each render when they apply. A test exists per kind.
9. **Page sections.**
   - Still checking: one line each, with the doc label, date and link.
   - Skipped lines.
   - Show more.
   - Copy link always.
   - Share only with navigator.share, AbortError treated as done.
10. **Safety fixes.** No auto on not-offered gates on any profile. Names are cleaned everywhere.
11. **Bundle.** check:bundle passes.
12. **Rules and layout.**
    - Tap-only: the name plus the remix paste box.
    - At 375px: no sideways scroll, 44px targets.
    - Light and dark.
    - No em dashes in our text.
    - The copy rule ("your bot's personality").
13. **Goldens.** Regenerated by each output-changing slice, with safety PASS on every set at the end.
14. **Copy.** It works in iOS Safari in the Simulator. Android Chrome is listed for Brian.
