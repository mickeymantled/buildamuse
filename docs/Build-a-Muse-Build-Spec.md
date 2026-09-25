# Build-a-Muse: Build Spec for Claude Code

Sep 25, 2026 · Brian

Content source of truth: `Build-a-Muse-Compiler-Library-v1.md` (same folder). This doc is the engineering spec; that doc is the library. When they disagree, the library wins on content and this doc wins on architecture.

## What to build

A mobile-first static web app where a first-time Meta Muse user builds their assistant's personality by tapping through eight stations, then gets a certificate with three things: a SOUL.md to paste into Muse, one sentence to say to Muse (memory seed), and up to three sentences to say to Muse (skill setups). The app is a deterministic compiler: a build object in, text out, no model call. A roster of nine pre-built starters sits in front of the stations. Every build is shareable as a link that encodes the build object.

Target user: someone who has never had an agent. The seasoned dev and the parent running a family both finish in under three minutes and both get a soul that changes how their Muse behaves.

**Rules that never bend**

- Tap-only. The only text input in the first-build flow is the name at station 7. The remix paste box is the one exception and appears only on remix.
- No storage. The app keeps nothing about any user. State lives in the browser and in the share link.
- No model call at build time. The compiler is a pure function. A model is used only in the optional preview chat (M4) and the probe gate tool (M5).
- No real people, no franchise characters, anywhere: outfits, roster, samples.
- Chassis lines ship in every build and cannot be removed by any pick.
- Blunt and Warm floor at 1. The user cannot build a Muse with no honesty or no care.
- Every library line must be traceable: given a line in an output soul, the compiler can name the record that emitted it.
- No em dashes in any generated text or UI copy.
- Content comes from the library doc. Do not invent library lines; if one is missing, add a TODO and use a placeholder that is visibly a placeholder.

## Stack and repo layout

Static site, no backend for M1 to M3. Vite + React + TypeScript, Tailwind, Zustand for the build object, Vitest for tests. Deploy as static files (Railway static or any CDN). M4 adds one tiny serverless proxy for the preview chat so the model key never ships to the browser.

```
build-a-muse/
  CLAUDE.md                 pointer to both docs, the rules that never bend, how to run tests
  package.json
  src/
    library/                the content, as JSON, one file per record type
      chassis.json
      bases.json
      stats.json
      badges.json
      chips.json
      peeves.json
      heart.json
      outfits.json
      examples.json
      names.json
      roster.json
      contradictions.json
      version.ts            LIBRARY_VERSION = 1
    compiler/
      types.ts              Build, Library record types, CompileResult
      compile.ts            compile(build, library): CompileResult
      passes/               assemble, dedupe, contradictions, length, examples, name, seed, skills
      trace.ts              line -> record id map
      migrate.ts            build v(n) -> v(n+1)
    share/
      encode.ts             build -> base64url, decode with version check
    ui/
      App.tsx               router: roster, stations 1..8, certificate
      stations/             Base, World, Stuff, Peeves, Heart, Outfit, Name
      Roster.tsx
      Certificate.tsx
      components/           Chip, ChipGrid, Slider, Badge, Radar, CopyBlock, LengthMeter, ProgressDots
      store.ts              Zustand: build object + derived compile
    probes/
      probes.json           the six probe messages
  tools/
    gate.ts                 M5: runs a library line with/without against the probes via a model, reports diff
    golden.ts               regenerates test/golden/*.md from roster builds
  test/
    compile.test.ts
    rules.test.ts
    golden/                 one expected soul per roster starter
```

Library JSON is hand-edited content. The compiler never mutates it. Every record has an `id` and the compiler records which `id` produced each output line.

## Data schemas

The build object is the only user-facing state. Everything else is library.

```ts
type Level = 1 | 2 | 3 | 4;

interface Build {
  v: number;                       // LIBRARY_VERSION at time of build
  base: BaseId;
  chips: ChipId[];                 // max 6, insertion order matters
  stats: {
    blunt: Level; warm: Level; funny: Level; chatty: Level; proactive: Level;
    risk?: Level;                  // present only if a Markets chip is tapped
  };                               // sum <= 14 across present stats
  peeves: PeeveId[];               // max 5
  heart: { hardPart: HardPartId; d1: DriveId; d2: DriveId };  // d3 assigned by compiler
  outfit: OutfitId;
  name: string;                    // 1..24 chars, trimmed
}
```

Library record types. Every `line` is a string that lands in the soul verbatim. Every record has an `id` used for tracing.

```ts
interface ChassisLine { id: string; section: Section; line: string; when?: Cond }

interface Base { id: BaseId; label: string; defaults: Build['stats']; chipsFirst: 'Work'|'Markets'|'Life'; baseLine: string; noun: string }

interface StatLevel { id: string; stat: StatId; level: Level; line: string; sample: string; label?: string }

interface Badge { id: BadgeId; name: string; when: Cond; line: string; section: Section }

interface Chip {
  id: ChipId; group: 'Work'|'Markets'|'Life'|'Time'; label: string;
  triggers: { id: string; line: string }[];          // 0..3
  seed?: string;                                       // one clause
  skills?: { id: string; name: string; kind: 'trigger'|'schedule'; schedule?: string; sentence: string }[];
  voice?: string;
  unlocks?: { risk?: boolean; badges?: BadgeId[]; proactivePlusOne?: boolean };
  d1Suggest?: DriveId;
  domainNoun?: string;                                 // for the seed sentence
}

interface Peeve { id: PeeveId; label: string; line?: string; dedupesWith?: string[] }  // no line = chassis covers it

interface HardPart { id: HardPartId; label: string; d1: DriveId; extraLine?: string; forceBadge?: BadgeId; seedClause: string }
interface Drive { id: DriveId; slot: 'd1'|'d2'|'d3'; line: string; when?: Cond }

interface Outfit { id: OutfitId; card: string; anchor: string; sampleHey: string }

interface ExampleGreeting { when: Cond; you: string }                       // me is always "hey"
interface ExampleDomain  { chip: ChipId | 'default'; when?: Cond; me: string; youBlunt: string; youGentle: string }

interface NameWord { stat: StatId; level?: Level; word: string }

interface RosterEntry { id: string; build: Build; tagline: string; signature: string }
```

`Cond` is a small predicate language evaluated against a Build, so conditions live in JSON and not in code:

```ts
type Cond =
  | { stat: StatId; gte?: Level; lte?: Level; eq?: Level }
  | { chip: ChipId }
  | { anyChipGroup: 'Markets'|'Work'|'Life'|'Time' }
  | { base: BaseId }
  | { hardPart: HardPartId }
  | { all: Cond[] } | { any: Cond[] } | { not: Cond };
```

The if-this-then-this table in the library doc is the complete list of conditions that must be expressible. If a row can't be written as a `Cond`, extend `Cond` rather than hardcoding the rule.

## The compiler

One pure function. Same build in, same output out, every time. It runs on every UI change (it's string assembly, so it's cheap) and once more for the certificate.

```ts
function compile(build: Build, lib: Library): CompileResult

interface CompileResult {
  soul: string;                      // the SOUL.md text
  soulLines: TracedLine[];           // every line with the record id that emitted it
  seed: string;                      // the memory sentence
  skills: { name: string; sentence: string }[];   // in chip tap order
  badges: BadgeId[];                 // for the UI and certificate
  buildName: string;
  length: number;                    // soul.length
  warnings: string[];                // e.g. over-length, dropped lines
}
```

**Passes, in order**

1. **Validate.** Stats within 1..4, sum <= 14, blunt >= 1, warm >= 1, risk present iff a Markets chip is present, chips <= 6, peeves <= 5, name 1..24 chars. Invalid build throws; the UI never produces one.
2. **Resolve conditions.** Evaluate every `Cond` in the library once against the build. Produces the active set of badges, chassis variants, drive variants and example rows.
3. **Assemble** in the fixed section order from the library doc: opening lines; Who you are (name, outfit anchor, base line); What you want (d1, d2, d3, tiebreak); How you talk (chassis always lines, blunt/warm/funny/chatty stat lines, chassis funny variant, peeve lines); Instincts (chip triggers in chip order, then badge lines, then hard part extra line, then voice permissions); Acting for me (chassis); Proactive (stat line); Memory and this file (chassis); How this sounds (two examples); If rules clash (chassis).
4. **Dedupe.** Drop any non-chassis line whose normalized text equals a chassis line. Drop a badge line whose text equals an already-emitted chip trigger. Drop a peeve with no `line`. Second Look emitted once even if several chips unlock it; wording from the first tapped chip.
5. **Contradictions.** Apply the pair table from the library (small, data-driven, in `library/contradictions.json`). Stat line wins over chip line; chassis wins over both. Record each drop in `warnings`.
6. **Length.** If `soul.length > 3200`, drop in the documented priority order (last-tapped Work chip's third trigger, then second, then earlier chips, then Life chip triggers, then voice permissions) until under. Never drop chassis, drives, stat lines, peeves or examples. Record drops.
7. **Examples.** Greeting row by (chatty, funny, warm). Domain row by first Work or Markets chip in tap order, else `default`; pick `youBlunt` if blunt >= 3 else `youGentle`; risk-split rows for memecoins.
8. **Name.** Sort stats descending with the tiebreak order blunt, warm, funny, proactive, chatty, risk. Word for top two plus base noun. Risk only contributes a word at level 1 or 4.
9. **Seed.** `Remember that ` + chip seed clauses joined by `, ` + `. ` + hard part clause + (domain nouns present ? ` Ask me about ` + nouns joined by ` and ` + ` when you need them.` : ``).
10. **Skills.** For each tapped chip in order, for each skill: `Set up <sentence>` for `trigger` kind, `<schedule>, <sentence>` for `schedule` kind. All returned; the UI shows three and a "show more."
11. **Trace.** Every line in `soul` maps to exactly one record id. Assert this in tests.

**Text rules enforced by the compiler**

- Output never contains an em dash. Assert in tests.
- Opening two lines are byte-identical to the chassis record. Assert.
- Blank line between sections, none inside a bullet run.
- Name appears exactly once, as the first word of Who you are.

## Screens

Mobile first, one thing per screen, progress dots, back always allowed, skip allowed on stations 2 through 6. Every station writes to the build object; the preview strip at the bottom recompiles on change and shows the length meter and any badges that just lit.

| # | Screen | Writes | Key UI |
| --- | --- | --- | --- |
| 0 | Roster | whole build (on Use or Remix) | Two doors: "Pick a starter" (nine cards, horizontal scroll) or "Build your own." Card: name, build name, tagline, top-two stat bars, badge pills, sample "hey," Use, Remix. |
| 1 | Choose your base | `base`, stats defaults | Eight tappable cards with the on-screen label. Tapping sets slider defaults and chip group order. |
| 2 | Your world | `chips` | Chip grid grouped Work / Markets / Life / Time, group order from base. Counter "n/6" pinned top. Tap toggles. At 6, untapped chips dim. |
| 3 | Stuff it | `stats` | Six horizontal scoop sliders (Risk appears only with a Markets chip). Each level shows its sample reply under the slider as you drag. Header shows "n/14" and "full" at cap. Blunt and Warm stop at 1 with the floor line. Badges light in a sidebar as conditions are met. |
| 4 | Pet peeves | `peeves` | Chip grid, counter "n/5." Chips that dedupe against chassis show a checkmark on tap and a tooltip "already built in." |
| 5 | Heart | `heart` | One question, six answers. Then two drive cards: d1 (hard part's, with a chip's `d1Suggest` as an alternate if present), d2 (from blunt). User confirms or swaps each. d3 shown locked with a lock icon and "every Muse has this one." |
| 6 | Dress it | `outfit` | Twelve cards, each with its sample "hey." |
| 7 | Name it | `name` | The only text field. 1..24 chars. |
| 8 | Certificate | none | Header: Meet <Name>, build name, tagline. Radar of six stats. Badge pills. Three copy blocks: Soul (paste), Memory (say), Message your Muse after (say, one at a time, first three, show more). "Then say hi." Footer: share link, remix, length meter. |

**Preview strip** (visible on stations 2 through 6): compiled length as a small meter, the last badge that lit, and a "peek" button that opens the current soul in a bottom sheet with chassis lines in muted color labeled "every Muse gets these."

**Copy blocks:** each has a tap-to-copy button with a checkmark on success. Use the Clipboard API with a textarea fallback. Never rely on long-press.

**Certificate copy, verbatim:**

- Soul: "Paste this over the file in Identity › Soul."
- Memory: "Say this to your Muse in chat."
- Skills: "One at a time. It should confirm each. If it doesn't, say it again in a fresh chat."
- Closer: "Then say hi."

**Layout:** 390px design width, no horizontal scroll, safe-area insets respected, dark and light via `prefers-color-scheme`. Chip grids are wrap layouts with 8px gaps. Sliders are 44px tall touch targets.

**State:** one Zustand store holding `build` and a memoized `compile(build)`. Stations read and write the store. No router state beyond the current station index and a `from: 'roster' | 'blank' | 'remix'` flag.

## Share links, remix, versioning

**Encoding.** `#b=<base64url(JSON(build))>` in the URL hash, never the query string, so nothing hits a server log. Keys minified with a fixed key map to keep links short. Decode validates the shape and the version before loading.

**Version.** `build.v` is the `LIBRARY_VERSION` at build time. On decode, if `v < LIBRARY_VERSION`, run `migrate(build)` step by step through `migrations/v1_to_v2.ts` and so on, then compile. A migration can rename an id, drop a removed chip with a warning, or map a removed stat level. A missing or unknown id after migration is dropped with a warning shown on the certificate, never a crash.

**Roster entries** are stored at the current version and regenerated by `tools/golden.ts` whenever the library changes, so the bench is always compiled fresh.

**Remix.** Loading a link with `?remix=1` opens station 1 with the build pre-filled and `from: 'remix'`. Before station 1, show the remix warning: "This rebuilds from your picks. Changes you made to the file in Muse won't carry over." Under it, an optional paste box: "Paste your current soul to keep your edits." If used, on the certificate the compiler output is diffed line by line against the pasted text; lines only in the pasted text are shown under a `## Mine` section at the end of the soul with a toggle to include them. The diff is done in the browser and the pasted text is never persisted or encoded into the link.

**Share.** The certificate's share button copies the link and, where the Web Share API exists, offers the native sheet with the title "Meet <Name>" and the build name as text.

## Tests

**Compiler unit tests** (`test/compile.test.ts`), all pure, run in CI:

- Determinism: same build twice yields identical output.
- Validation: each invalid build shape throws.
- Floors: blunt or warm at 0 rejected; every output contains the honesty and care lines.
- Chassis: every output contains every always-on chassis line, byte-identical; opening two lines first.
- Act-vs-ask pair: both lines present or the test fails.
- Cap: a build summing to 15 rejected.
- Risk gating: risk present without a Markets chip rejected; Markets chip without risk rejected.
- Dedupe: peeve "agrees just to be nice" emits nothing; Second Look emitted once with two unlocking chips.
- Contradictions: each pair in the table resolves as documented.
- Length: an over-length build drops in the documented order and never drops a protected line.
- Names: Rook compiles to "Blunt Feral Reviewer," June to "Two-Way Steady Playmaker," Marty to "Blunt Feral Trench Companion." Tiebreak order is asserted with a constructed tie.
- Trace: every soul line maps to exactly one record id.
- No em dash anywhere in output.
- Examples: greeting row selection and domain row selection for each documented combination.

**Golden compiles** (`test/golden/`): one expected soul, seed and skills per roster starter. `tools/golden.ts` regenerates them; CI fails if the committed goldens differ from a fresh compile, so a library edit has to come with a golden update. This is the traceability rule as a test.

**Rules test** (`test/rules.test.ts`): every row of the if-this-then-this table expressed as a build and an assertion. Missing rows are a failing test, so the table and the code stay in sync.

**Probe gate tool** (`tools/gate.ts`, M5): for a given library record id, compile two souls (with and without the line) for three reference builds, send each of the six probes to a model with each soul as the system prompt, and print the paired responses side by side with a similarity score. A line whose responses are near-identical across all probes is flagged as a candidate for cutting. This is a tool a human runs, not a CI gate, because it costs money and needs judgment.

## Milestones

Each is shippable on its own. Build them in order; don't start M2 until M1's tests pass.

| M | Scope | Done when |
| --- | --- | --- |
| M1 | Library JSON transcribed from the library doc, all record types, `Cond` evaluator, `compile()` with all eleven passes, unit tests, golden compiles for the nine roster starters | `npm test` green; `compile(roster.marty)` prints the Marty soul from the library doc byte for byte; every rules-table row has a test |
| M2 | Stations 1 through 7, store, preview strip, chip grids, scoop sliders with samples, badge sidebar, floors and caps enforced in UI | A phone user can go from blank to a named build with no text input except the name; length meter and badges update live |
| M3 | Roster screen, certificate, copy blocks, share link encode and decode, remix flow with warning and paste-box diff, migrations scaffold | June and Rook builds from the library doc reproduce from their share links; copy works on iOS Safari and Android Chrome; a v1 link still decodes after a no-op bump to v2 |
| M4 | Preview chat on the certificate: three probe chips plus "ask your own," served through a small proxy that holds the model key and injects the compiled soul as system prompt | The chips return in-voice replies for all nine starters; the proxy rate-limits per IP; nothing is logged beyond error counts |
| M5 | `tools/gate.ts` probe gate, `tools/golden.ts`, a CONTRIBUTING.md for adding chips and roster entries, a roster nomination form that just captures a share link | A new chip can be added with only JSON edits plus goldens; the gate report for an existing line runs end to end |

Deploy target for M1 to M3 is static hosting. M4 is the first thing that needs a server; keep it to one function.

## Open questions

Decide before M2; M1 doesn't depend on them.

- [ ] Cap at 14 or 16 points? 14 forces tradeoffs; 16 means fewer users hit the wall.
- [ ] Should skipping a station (2 through 6) leave the base defaults, or prompt once on the certificate for the skipped ones?
- [ ] M4 model: which provider for the preview chat, and is Muse Spark reachable through Meta's Model API for a closer match?
- [ ] Roster art: illustrated avatars per starter, or a generated radar-shaped mark? No real faces either way.
- [ ] Domain: buildamuse.com or under an existing site?
- [ ] Does Muse actually confirm a stored routine in words? If not, the skills copy on the certificate changes.
