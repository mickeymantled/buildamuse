# Progress

On restart: read CLAUDE.md, QUESTIONS.md, then this file. Resume at the first slice not marked done.

## M1: library JSON, compiler, tests, goldens

Done when: `npm test` green; June and Rook goldens regenerated from the compiler and checked line by line against the tables (QUESTIONS Q1); all nine roster starters golden-tested; every if-this-then-this row has a test.

| # | Slice | Agent | Spec section | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | types: src/compiler/types.ts | engineer | Data schemas, The compiler | typecheck green, all library and result types exported | done |
| 2 | lib chassis.json | transcriber | Library: Chassis | every chassis line verbatim, headings, who template | done |
| 3 | lib bases.json | transcriber | Library: Bases, Build names | 8 bases with defaults, line, noun | done |
| 4 | lib stats.json | transcriber | Library: Stats | 24 stat levels verbatim | done |
| 5 | lib badges.json | transcriber | Library: Badges | 15 badges with Cond | done |
| 6 | lib chips.json | transcriber | Library: World chips, seed nouns | 32 chips verbatim | done |
| 7 | lib peeves.json | transcriber | Library: Peeves | 18 peeves | done |
| 8 | lib heart.json | transcriber | Library: Heart, seed clauses | 6 hard parts, all drives | done |
| 9 | lib outfits.json | transcriber | Library: Outfits | 12 outfits | done |
| 10 | lib examples.json | transcriber | Library: Examples | 6 greetings, 10 domain rows | done |
| 11 | lib names.json | transcriber | Library: Build names + Q2 | words and tiebreak order | done |
| 12 | lib roster.json | transcriber | Library: Roster | 9 builds | done |
| 13 | lib contradictions.json + library index | transcriber | Library: Passes after assembly | pair table, src/library/index.ts | done |
| 14 | cond: src/compiler/cond.ts | engineer | Data schemas: Cond | evalCond for every Cond shape | done |
| 15 | pass 1 validate | engineer | Compiler pass 1 | throws on every invalid shape | done |
| 16 | pass 2 resolve | engineer | Compiler pass 2 | active badges, d3, chassis | done |
| 17 | pass 3 assemble (+ pass 7 examples, render) | engineer | Compiler pass 3, 7 | ordered items, render to soul | done |
| 18 | pass 4 dedupe | engineer | Compiler pass 4 + Q9 | | done |
| 19 | pass 5 contradictions | engineer | Compiler pass 5 | | done |
| 20 | pass 6 length | engineer | Compiler pass 6 + Q13 | | done |
| 21 | pass 8 name | engineer | Compiler pass 8 + Q2 | | done |
| 22 | pass 9 seed | engineer | Compiler pass 9 | | done |
| 23 | pass 10 skills | engineer | Compiler pass 10 + Q19 | | done |
| 24 | pass 11 trace | engineer | Compiler pass 11 | | done |
| 25 | compile.ts wiring | engineer | The compiler | compile(build, lib) returns CompileResult | done |
| 26 | tests: validation, floors, cap, risk gating | tester | Tests | | done |
| 27 | tests: chassis, act-vs-ask, em dash, determinism | tester | Tests | | done |
| 28 | tests: dedupe, contradictions, length | tester | Tests | | done |
| 29 | tests: names, trace, examples | tester | Tests | | done |
| 30 | rules test: UI rules + emit rules | tester | If-this-then-this | every row has a test (UI rows: M2, marked todo) | done |
| 31 | tools/golden.ts + June and Rook goldens | tester | Golden compiles | line-by-line check against tables | done |
| 32 | goldens for the other seven | tester | Golden compiles | committed, CI diff test | done |

## M1 status: DONE (2026-09-25)

- `npm test`: 6 files, 260 passed, 11 todo (the 11 UI rows of the rules table, deferred to M2). `npm run typecheck` clean.
- June and Rook goldens regenerated from the compiler and checked line by line against the tables by a tester and an independent reviewer: no mismatches.
- All nine roster starters golden-tested (test/golden/*.md).
- Every if-this-then-this row has a test (emit rows real, UI rows as M2 todos).
- Brian said go (2026-10-01) with a new brief; see M2 below.

## M2 (Build-a-Bot): data model v2, six runtimes, bundles

Brief: docs/Build-a-Bot-v2-Brief.md (Brian, 2026-10-01, supersedes everything since M1). Architecture: docs/V2-DESIGN.md (lead). M3 (UI) and later are on hold until Brian says go after M2.

Done when (Part F): npm test green; every gate appears in both layers for every golden; every dot golden emits one Custom Rule per gate; every grok golden passes all twelve Bot Ready checks; every chatgpt golden fits its mode's cap; a v1 Marty link decodes to v2 and compiles; no pack default violates Part D. Plus: 60 goldens committed, pack probe files stored, every golden set safety-reviewed with PASS.

Loop per slice: plan, dispatch, verify (npm test, typecheck), review (reviewer for code, safety for goldens, safety then reviewer for content), commit. Content for packs, roles, gates, limits and target templates comes from author (never transcriber guessing, never lead).

| # | Slice | Agent | Brief section | Done when | Status |
| --- | --- | --- | --- | --- | done |
| 0.1 | standing S1: length cap 3600, reversed order | engineer | Part A standing calls | review PASS | done |
| 0.2 | standing S2: Risk-Off Word2 | engineer | Part A | review PASS | done |
| 0.3 | standing S3: example 2 any group | engineer | Part A | review PASS | done |
| 0.4 | standing S7: singular seed ending | engineer | Part A | review PASS | done |
| 0.5 | standing S4: accounting d1 | transcriber | Part A | review PASS | done |
| 0.6 | standing S5: Marty forget | transcriber | Part A | review PASS | done |
| 0.7 | tests: length S1 | tester | Part A | review PASS, tests green | done |
| 0.8 | tests: names S2, examples S3 | tester | Part A | review PASS | done |
| 0.9 | tests: seed S7 | tester | Part A | review PASS | done |
| 0.10 | regenerate nine v1 goldens | tester | Part A | every diff line explained | done |
| 1 | types v2 | engineer | Part B + V2-DESIGN 2-4 | typecheck green | done |
| 2 | targets.json facts: 5 cards, 8 profiles, pinned docs, verify lines | transcriber | Part C | every Part C fact present, placeholders elsewhere | done |
| 3 | chassis.json: no_self_edit, rules.outrank | transcriber | Part C chassis changes | records verbatim | done |
| 4 | gates.json content | author, safety, transcriber | Parts B, D + V2-DESIGN 3, 7 | safety PASS, reviewer PASS | done |
| 5 | limits.json content | author, safety, transcriber | Parts B, D | safety PASS, reviewer PASS | done |
| 6 | profile templates, chassis variants, chassis short forms | author, safety, transcriber | Part C + V2-DESIGN 5, 6 | safety PASS, reviewer PASS | done |
| 7-18 | packs x12 (memecoins, perps, prediction-markets, spot, coding, research, content, sales, personal-ops, support, data, devops) incl. probe files | author, safety, transcriber | Part D | per pack: safety PASS, reviewer PASS, probes stored | done |
| 19-22 | role sets x4 (trading, coding, research, personal-ops) | author, safety, transcriber | Part D roles | per set: safety PASS, reviewer PASS | done |
| 23 | migrate v1 to v2 + share encode/decode | engineer | Part B migration + spec share links | typecheck, v1 Marty link decodes | done |
| 24 | migrate + share tests | tester | Part B | review PASS | done |
| 25 | validate v2 | engineer | V2-DESIGN 2 | review PASS | done |
| 26 | profile resolution, effective gates and limits | engineer | V2-DESIGN 1, 2, 3 | review PASS | done |
| 27 | soul layout v2: pack triggers, gate lines, rules section and blocks, chassis variants | engineer | V2-DESIGN 5 | review PASS | done |
| 28 | grok layout | engineer | Part C grok + V2-DESIGN 5 | review PASS | done |
| 29 | instructions layout incl. compact | engineer | Part C instructions + V2-DESIGN 5 | review PASS | done |
| 30 | rules layer: AGENTS.md, Never block, custom rules, top and bottom | engineer | V2-DESIGN 7 | review PASS | done |
| 31 | skills, routines, memory delivery | engineer | V2-DESIGN 8 | review PASS | done |
| 32 | roles compile | engineer | Part D roles + V2-DESIGN 9 | review PASS | done |
| 33 | bundle assembly, compile wiring, trace v2, length by profile | engineer | Part B bundle + V2-DESIGN 4 | review PASS | done |
| 34 | test: gate in both layers | tester | Part C chassis changes + V2-DESIGN 7 | review PASS | done |
| 35 | test: dot custom rules | tester | Part C dot | review PASS | done |
| 36 | test: grok Bot Ready | tester | Part C grok | review PASS | done |
| 37 | test: chatgpt caps | tester | Part C chatgpt | review PASS | done (2 cases it.fails, V25) |
| 38 | test: pack-default safety | tester | Part D defaults | review PASS | done |
| 39 | test: roles (40 to 120 lines, one coordinator, locked stats, delegation lines) | tester | Part D roles | review PASS | done |
| 40 | tools/golden.ts v2 | engineer | Part F | review PASS | done |
| 41 | goldens, 60 (+ role goldens) | tester | Part F | safety PASS per profile set | done |
| 42 | probe files check, all 12 packs | author | Part D | five probes each, one gate probe | done |

### M2 status (2026-10-01): done except one blocking decision

| Done criterion (Part F) | Status |
| --- | --- |
| npm test green | yes: 12 files, 4,494 passed, 2 expected fail (V25), 11 todo (UI rules, M3) |
| every gate in both layers for every golden | yes (test/gates.test.ts, all 64 bundles) |
| every dot golden one Custom Rule per gate | yes (pay maps to "Hand off to you", V14) |
| every grok golden passes the twelve Bot Ready checks | yes (test/grok.test.ts) |
| every chatgpt golden fits its cap | NO for marty and june on free custom instructions (2,602 and 2,922 of 1,500): blocked on V25 |
| v1 Marty link decodes to v2 and compiles | yes (test/share.test.ts) |
| no pack default violates Part D | yes (test/gates.test.ts, safety PASS on all 12 packs) |
| 60 goldens committed, safety-reviewed | yes: 60 plus 4 role goldens, safety PASS on all eight sets |
| pack probe files stored | yes: test/packs/*.probes.json, five each |

Waiting on Brian: V25 caps (blocking), V14 dot forbid label, V15 custom GPT retirement, V16 to V19 doc findings, V21 extra gates, V22 author content approval, S6 taglines, V13 promise lines. M3 does not start without a go.

## M2 closeout (Brian's decisions 2026-10-02, QUESTIONS B1 to B10)

| # | Slice | Agent | Source | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| C1 | roster taglines | transcriber | B3 | nine taglines verbatim | done |
| C2 | packs: content voice anchor, devops interval (trigger and skill N), perps rules line origin brief | transcriber | B5, B1 | text verbatim, origin flag | done |
| C3 | muse standing-instruction templates ("From now on, ...") | author, safety | B8 | safety PASS | done |
| C4 | targets.json: promises, mode order and gpt hidden + deprecated, caps 4,000 (muse, hermes, grok), grok cap verify removed, dot hand-off note, openclaw spoken memory, hermes test note, muse skill label and templates | transcriber | B1, B2, B4, B6, B8 | reviewer PASS | done |
| C5 | length tiers on caps 4,000 or less: cut author pack rules, then short chassis, then S1 | engineer | B1 | reviewer PASS | done |
| C6 | free instructions bottom block gate lines only; profile notes, deprecated mode, skill label in bundle and trace | engineer | B1, B2, B6, B8 | reviewer PASS | done |
| C7 | golden specs without gpt (M3.1) | engineer | B2 | reviewer PASS | done |
| C8 | goldens regenerated, tests updated, safety on every set | tester, safety | all | npm test green, safety PASS | done |

## M3: UI (done 2026-10-03)

Done when (Part F): stations 0 through 7 as specced plus pack, limits, gates and roles screens; store; preview strip; floors and caps enforced. Mobile first (390px), tap-only, light and dark, 44px touch targets, no em dashes, UI copy says "your bot's personality" except where a target uses SOUL.md.

| # | Slice | Agent | Source | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| 3.1 | hide gpt mode, remove its goldens | (C4, C7, C8) | B2 | goldens without gpt | done |
| 3.2 | Tailwind, Zustand store (build v2, station, from flag, retarget, memoized compile), UI copy file | engineer | spec Screens: State; Part E | store unit tests pass | done (6a1916c; tests in 3.19a) |
| 3.3 | shared components: Card, Chip, ChipGrid, Slider, Stepper, Toggle3, Pill, ProgressDots, BottomSheet | engineer | spec Screens: Layout | reviewer PASS | done (cb218ea) |
| 3.4 | station 0 target picker + App router shell | engineer | Part E | five cards, chatgpt radios, plan tap | done (dbe3681) |
| 3.5 | roster screen (compiled against the chosen target) | engineer | spec Roster + Part E | nine cards, Use and Remix | done (4f9335d) |
| 3.6 | station 1 base | engineer | spec Screens | defaults set, chip order | done (e552096) |
| 3.7 | station 2 world (chip grid n/6) | engineer | spec Screens | cap 6, dimming | done (32cbb58) |
| 3.8 | pack screen | engineer | Part E | preselected from chips, max 3 | done (f197688) |
| 3.9 | limits screen | engineer | Part E | steppers, venue notes | done (4c2d721) |
| 3.10 | gates screen | engineer | Part E, B1 | three-state, pay locked, copy per target, Paid steer | done (360ef53) |
| 3.11 | station 3 stats | engineer | spec Screens, library Stats | n/14, floors, samples, risk with Markets, badges | done (419513e) |
| 3.12 | station 4 peeves | engineer | spec Screens | n/5, built-in checkmarks | done (42454e7) |
| 3.13 | station 5 heart | engineer | spec Screens | d1 alternate, d2, d3 locked | done (06c4d6a) |
| 3.14 | station 6 outfit | engineer | spec Screens | twelve cards with sample hey | done (5dfe9e5) |
| 3.15 | station 7 name | engineer | spec Screens | the only text input, 1..24 | done (abc84fb) |
| 3.16 | roles screen (advanced) | engineer | Part E | hidden when supportsRoles false | done (aaf4b32) |
| 3.17 | preview strip + peek sheet | engineer | spec Screens | length vs cap, last badge, chassis muted | done (2949b31) |
| 3.18 | skipped stations (S9) | engineer | S9 | defaults kept, skipped list in store | done: store records skipped (6a1916c), tested in 2d6de47 |
| 3.19 | UI tests: store, flow, caps and floors | tester | Part F | green | done: store tests (2d6de47, 546), flow and copy tests (172) |

## Log

- Agent files in .claude/agents/ are not picked up until the session restarts. Until then each role runs as a general-purpose Sonnet subagent with the role file pasted into its prompt.
- Lead verifies every library JSON with a verbatim check (every text string must appear in the doc) before review. Only expected misses: the derived chip d1 lines in heart.json (Q5).
- Slices 17 to 24 dispatched in parallel since each touches its own file and depends only on types.ts. Slice 20 (length) waits on render.ts from slice 17.
- Overruled one reviewer finding on slice 13 (dead "walk me through" contradiction), see QUESTIONS Q28.
- Test files split per QUESTIONS Q27 so testers can run in parallel.
- Slice 31 split: engineer writes tools/golden.ts, tester generates and checks June and Rook goldens.
- Lead fixed seed.ts capitalization (Q29) and removed a stale @ts-expect-error in test/validation.test.ts directly; both faster than a re-dispatch.
- Lead applied the slice 26 review fix directly: Floors test now asserts the blunt (honesty) stat line per build, not only the chassis mistake line.
- Lead applied the slice 28 review fix directly: Second Look test now uses hard part calmer so the two chips are the only trigger.
- M2 0.7: length-test slice failed review twice (test strength: no Markets chip, no multi-trigger Life chip, cap pinned only from above). Lead added two tests directly: stop-point check and a Markets plus injected two-trigger Life build.
- M2 content: every pack, role set, gate, limit and profile template was written by author, passed safety, then was transcribed byte for byte and reviewed. Author-written lines await Brian (QUESTIONS V22).
- M2 doc research (2026-10-01): official docs read for all five runtimes; facts that differ from the brief are logged as V14 to V20 and pinned as verify lines in targets.json.
- M2 Wave B (slices 27 to 32) passed review except instructions (29), which failed twice on caps; lead removed its repeated-block drop and logged the cap conflict.
- BLOCKING: V25 caps. Grok 2,000, free custom instructions 1,500, paid 5,000 and some 3,600 souls can't hold every chassis line plus the rules layer. Needs Brian; until then over-cap output ships with a warning.
- M2 Wave D: tests and 64 goldens landed; lead fixed a dedupe bug (pack twins), grok approval fields and two tests after review rounds (V28). Safety PASS on every golden set.
- M2 closeout done (2026-10-02): Brian's B1 to B10 landed; lead fixes V29 (short-form precedence, Tier A cuts kept) and V30 (grok sources from one pack); 55 goldens, safety PASS on every set; 5,055 tests pass, 2 expected fail (Marty and June on free custom instructions, UI steers to Paid).
- M3 3.2 failed review round 2 on one nit (hardcoded tab title); lead set document.title from copy and made the kids nudge reversible (U6b) rather than re-dispatching. 3.3 passed in two rounds.
- M3 wave 2: store tests (3.19a), 3.4 and 3.5 passed review. Lead removed the unused startersLabel and normalized .js imports in screens. The preview pane's dev server hung on "starting" (policy check), so the visual check is deferred; engineers verified 390px layout with a temporary vite server.
- M3 wave 3: 3.6 to 3.9 passed review in one round each; readings logged as U9.
- Lead visual check (2026-10-02, preview pane at 375px, dark and light): target with ChatGPT modes and plan, roster row (page does not scroll sideways), Remix Marty to base, world with sticky counter, packs, limits. All as specced. .claude/launch.json runs vite through node directly (npx hung in the pane).
- M3 wave 4: 3.10 to 3.13 passed review (peeves in two rounds). Lead fix on 3.12: Chip checked state made tappable so "already built in" sits on the chip (spec) and the pick can be undone. Lead clicked through gates, stats, peeves and heart on a June remix. Readings in U10.
- M3 wave 5: 3.14 to 3.17 passed review (name in two rounds, preview in three). Lead fix on 3.16: the roles switch stays visible while on. Lead clicked an OpenClaw Rook remix end to end: preview strip, peek sheet, roles switch and screen, name, certificate placeholder. Readings in U11. 3.18 needed no UI: skip recording is in the store and its tests.
- Lead audit (2026-10-03, 375px, Grok Odds remix, base through name plus target and roster): every button, radio, switch and input is at least 44 by 44, and scrollWidth equals the viewport on every screen.
- M3 3.19b: UI flow and copy tests passed review in two rounds and found one bug (the peek sheet was not a dialog); lead fixed BottomSheet (role dialog, aria-modal, focus moves in on open) and flipped the test.
- M3 DONE (2026-10-03). Done criteria checked: stations 0 to 7 plus packs, limits, gates and roles; store; preview strip; floors and caps enforced in the store and through the UI; tap-only (one textbox, on name); 375px with no sideways scroll; 44px targets audited; light and dark checked; no em dashes (test plus repo sweep); copy has no SOUL.md and Muse only where allowed (test). Suite: 15 files, 5,774 passed, 2 expected fail (V25 caps), 11 todo; typecheck clean; vite build clean (one chunk-size warning: the library ships in the main bundle, worth splitting in M4). Waiting for Brian's go on M4.

## M4: certificate as bundle

Done when: the criteria in docs/M4-PLAN.md section 11 (lead-written; B14 gives none). The architecture, the contracts and the wave plan are in docs/M4-PLAN.md rev 2; the readings are W1 to W30 in QUESTIONS.md. Subagents run on Sonnet; the lead checks every slice before it is committed.

| # | Slice | Wave | Agents | Writes | Status |
| --- | --- | --- | --- | --- | --- |
| 4.p | plan, scouts, three-lens critique, copy split, W-list | 0 | lead (+ Sonnet scouts, critics) | docs/M4-PLAN.md, src/ui/copy/, QUESTIONS, PROGRESS | done |
| 4.0 | safety fixes: auto clamp on not-offered gates (W23), name rules (W24) | 1 | engineer, tester | gates.ts, validate.ts, Toggle3.tsx, Gates.tsx | done (4791acd) |
| 4.1 | library split: cards + profiles.json | 1 | engineer, tester | library/index.ts, targets.json, profiles.json | done (cc57e7f) |
| 4.2 | compiler fields: steps, noteItems, verify, undelivered (after fit), trimmed, kinds, ids, docs | 1 | engineer, tester | types, bundle, deliver, roles, compile, trace, layouts/instructions, 4 goldens | done (9408662) |
| 4.3 | SKILL.md format research | 1 | general-purpose (sonnet, web) | text only | done: frontmatter required on OpenClaw (W31) |
| 4.5a | verify cleanup proposal | 1 | author | text only | done: approved as W32 |
| 4.6 | decode hardening, drops, version param, defaults.ts | 1 | engineer, tester | encode, migrate, compiler/defaults.ts, store.ts (imports, setGate, setName) | done (d67889e) |
| 4.7a | url helpers | 1 | engineer, tester | src/share/url.ts | done (d202628) |
| 4.8 | zip writer | 1 | engineer, tester | src/share/zip.ts | done (52d235f) |
| 4.15 | CopyButton copies inside the tap | 1 | engineer, tester | CopyButton.tsx | done (7cba1f7) |
| 4.4 | step tags, rulesPath, golden Steps section, goldens + safety | 2 | engineer, tester, safety | profiles.json, tools/golden.ts, goldens | done (W33 role step, safety PASS) |
| 4.7b | store loadBuild, switchTarget, remix side screen, links hook, LinkError | 2 | engineer, tester | store, flow, App, copy/links, ui-store tests | done (W35, W36) |
| 4.9 | Mine diff module | 2 | engineer, tester | src/share/mine.ts | done (W36 carve-out) |
| 4.10 | shell and lazy loading, check:bundle | 2 | engineer, tester | main, Shell, TargetPicker, Target, vite.config, tools/check-bundle | done (check:bundle green) |
| 4.11 | certificate model (pure) | 2 | engineer, tester | src/ui/certificate/model.ts | done (W34) |
| 4.5b | verify transcription (+ SKILL.md template), goldens, safety all sets, guard test | 3 | author, safety, transcriber, reviewer | profiles.json, goldens | done (safety PASS all sets) |
| 4.12 | certificate UI | 3 | engineer, tester | Certificate, certificate/*, Radar, copy/certificate | done |
| 4.14 | remix screen and Mine switch | 3 | engineer, tester | Remix, copy/remix | done |
| 4.13 | certificate actions: share, copy link, zip, remix, switch, steer; preview meter with Mine | 4 | engineer, tester | certificate/Actions, copy/actions, PreviewStrip | |
| 4.17 | integration tests: links, switch, remix, zip, bundle | 4 | tester | tests | |
| 4.16 | golden and safety recheck | 5 | tester, safety | | |
| 4.18 | docs: CLAUDE.md, V2-DESIGN, UI-PLAN | 5 | lead | | |
| 4.19 | multi-lens review, browser, iOS Simulator | 5 | lead (+ Sonnet reviewers) | | |
| 4.20 | M4 report + first three M5 slices | 5 | lead | | |
- M4 wave 1 (2026-10-03, 42 Sonnet agents): all seven code slices passed review. 4.6 failed round 3 only on scope (the tester edited share.test.ts and ui-flow.test.tsx beyond its list, and the plan forced both edits), so the lead read the diffs and ratified them. Lead fix: setName no longer splits a surrogate pair. The lead read every diff. Suite: 24 files, 10,146 passed, 2 expected fail (V25). The research found OpenClaw skips skills without frontmatter; the lead confirmed it in the loader source (W31).
- M4 wave 2 (2026-10-03, 29 Sonnet agents plus a 3-agent gate): 4.4, 4.7b and 4.10 passed review. 4.9 and 4.11 failed round 3 on real bugs, which the lead fixed: the Grok label was not counted as copyable, and a copy function took an array and broke the copy walker. Lead added tests for the kept-rules wording. Safety on 4.4 flagged role gate blocks with no install step on Grok and Project. The lead promoted the role fallback note to a step (W33); a tester updated the pinned tests, and safety re-ran: PASS on the full golden diff. More lead fixes: settle kept dropping a link's roles (W35); certificate Remix Back and the paste reset (W36); the Mine trace carve-out wired and narrowed (W36). Suite: 31 files, 12,795 passed, 3 expected fail (V25 x2, the Back button on a link certificate, which 4.12 wires).
- M4 wave 3 (2026-10-03, 21 Sonnet agents): 4.12 and 4.14 passed review. 4.5b failed round 3 only because a model.ts id pointed at a record 4.5b had renamed; the lead fixed it (W38), plus the Screen h1 wrap. Safety PASS on the full golden set after the verify cleanup and the SKILL.md frontmatter. The lead opened June (Muse) and Marty (Dot) links in the preview at 375px. Each opened on the certificate with the URL cleaned and no sideways scroll; the Muse spec lines, Standing instructions, Left out list, Dot rules table, caption and hand-off note all render. Suite: 35 files, 13,339 passed, 2 expected fail (V25). Found W37 (risk 4 "Same as 3") for Brian.
