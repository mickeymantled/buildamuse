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
- Waiting on Brian's go before M2.

## M2: stations 1 to 7 (not started, needs a go)

Open questions to settle first (spec "Open questions"): cap 14 or 16; skip behavior on stations 2 to 6; plus QUESTIONS.md Q11, Q25, Q26.

| # | Slice | Agent | Spec section | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Tailwind setup + src/ui/store.ts (Zustand: build, from flag, station index, memoized compile) | engineer | Screens: State | store actions for every station write; typecheck green | |
| 2 | src/ui/stations/Base.tsx + ProgressDots + App router shell | engineer | Screens: station 1, Layout | tapping a base sets defaults and chip group order | |
| 3 | src/ui/components/Chip.tsx, ChipGrid.tsx + stations/World.tsx | engineer | Screens: station 2 | n/6 counter, dimming at 6, group order from base, risk appears with Markets | |

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
