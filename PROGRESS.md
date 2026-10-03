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
| C1 | roster taglines | transcriber | B3 | nine taglines verbatim | |
| C2 | packs: content voice anchor, devops interval (trigger and skill N), perps rules line origin brief | transcriber | B5, B1 | text verbatim, origin flag | |
| C3 | muse standing-instruction templates ("From now on, ...") | author, safety | B8 | safety PASS | |
| C4 | targets.json: promises, mode order and gpt hidden + deprecated, caps 4,000 (muse, hermes, grok), grok cap verify removed, dot hand-off note, openclaw spoken memory, hermes test note, muse skill label and templates | transcriber | B1, B2, B4, B6, B8 | reviewer PASS | |
| C5 | length tiers on caps 4,000 or less: cut author pack rules, then short chassis, then S1 | engineer | B1 | reviewer PASS | |
| C6 | free instructions bottom block gate lines only; profile notes, deprecated mode, skill label in bundle and trace | engineer | B1, B2, B6, B8 | reviewer PASS | |
| C7 | golden specs without gpt (M3.1) | engineer | B2 | reviewer PASS | |
| C8 | goldens regenerated, tests updated, safety on every set | tester, safety | all | npm test green, safety PASS | |

## M3: UI

Done when (Part F): stations 0 through 7 as specced plus pack, limits, gates and roles screens; store; preview strip; floors and caps enforced. Mobile first (390px), tap-only, light and dark, 44px touch targets, no em dashes, UI copy says "your bot's personality" except where a target uses SOUL.md.

| # | Slice | Agent | Source | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| 3.1 | hide gpt mode, remove its goldens | (C4, C7, C8) | B2 | goldens without gpt | |
| 3.2 | Tailwind, Zustand store (build v2, station, from flag, retarget, memoized compile), UI copy file | engineer | spec Screens: State; Part E | store unit tests pass | |
| 3.3 | shared components: Card, Chip, ChipGrid, Slider, Stepper, Toggle3, Pill, ProgressDots, BottomSheet | engineer | spec Screens: Layout | reviewer PASS | |
| 3.4 | station 0 target picker + App router shell | engineer | Part E | five cards, chatgpt radios, plan tap | |
| 3.5 | roster screen (compiled against the chosen target) | engineer | spec Roster + Part E | nine cards, Use and Remix | |
| 3.6 | station 1 base | engineer | spec Screens | defaults set, chip order | |
| 3.7 | station 2 world (chip grid n/6) | engineer | spec Screens | cap 6, dimming | |
| 3.8 | pack screen | engineer | Part E | preselected from chips, max 3 | |
| 3.9 | limits screen | engineer | Part E | steppers, venue notes | |
| 3.10 | gates screen | engineer | Part E, B1 | three-state, pay locked, copy per target, Paid steer | |
| 3.11 | station 3 stats | engineer | spec Screens, library Stats | n/14, floors, samples, risk with Markets, badges | |
| 3.12 | station 4 peeves | engineer | spec Screens | n/5, built-in checkmarks | |
| 3.13 | station 5 heart | engineer | spec Screens | d1 alternate, d2, d3 locked | |
| 3.14 | station 6 outfit | engineer | spec Screens | twelve cards with sample hey | |
| 3.15 | station 7 name | engineer | spec Screens | the only text input, 1..24 | |
| 3.16 | roles screen (advanced) | engineer | Part E | hidden when supportsRoles false | |
| 3.17 | preview strip + peek sheet | engineer | spec Screens | length vs cap, last badge, chassis muted | |
| 3.18 | skipped stations (S9) | engineer | S9 | defaults kept, skipped list in store | |
| 3.19 | UI tests: store, flow, caps and floors | tester | Part F | green | |

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
