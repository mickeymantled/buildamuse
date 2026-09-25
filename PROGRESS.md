# Progress

On restart: read CLAUDE.md, QUESTIONS.md, then this file. Resume at the first slice not marked done.

## M1: library JSON, compiler, tests, goldens

Done when: `npm test` green; June and Rook goldens regenerated from the compiler and checked line by line against the tables (QUESTIONS Q1); all nine roster starters golden-tested; every if-this-then-this row has a test.

| # | Slice | Agent | Spec section | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | types: src/compiler/types.ts | engineer | Data schemas, The compiler | typecheck green, all library and result types exported | |
| 2 | lib chassis.json | transcriber | Library: Chassis | every chassis line verbatim, headings, who template | |
| 3 | lib bases.json | transcriber | Library: Bases, Build names | 8 bases with defaults, line, noun | |
| 4 | lib stats.json | transcriber | Library: Stats | 24 stat levels verbatim | |
| 5 | lib badges.json | transcriber | Library: Badges | 15 badges with Cond | |
| 6 | lib chips.json | transcriber | Library: World chips, seed nouns | 33 chips verbatim | |
| 7 | lib peeves.json | transcriber | Library: Peeves | 18 peeves | |
| 8 | lib heart.json | transcriber | Library: Heart, seed clauses | 6 hard parts, all drives | |
| 9 | lib outfits.json | transcriber | Library: Outfits | 12 outfits | |
| 10 | lib examples.json | transcriber | Library: Examples | 6 greetings, 10 domain rows | |
| 11 | lib names.json | transcriber | Library: Build names + Q2 | words and tiebreak order | |
| 12 | lib roster.json | transcriber | Library: Roster | 9 builds | |
| 13 | lib contradictions.json + library index | transcriber | Library: Passes after assembly | pair table, src/library/index.ts | |
| 14 | cond: src/compiler/cond.ts | engineer | Data schemas: Cond | evalCond for every Cond shape | |
| 15 | pass 1 validate | engineer | Compiler pass 1 | throws on every invalid shape | |
| 16 | pass 2 resolve | engineer | Compiler pass 2 | active badges, d3, chassis | |
| 17 | pass 3 assemble (+ pass 7 examples, render) | engineer | Compiler pass 3, 7 | ordered items, render to soul | |
| 18 | pass 4 dedupe | engineer | Compiler pass 4 + Q9 | | |
| 19 | pass 5 contradictions | engineer | Compiler pass 5 | | |
| 20 | pass 6 length | engineer | Compiler pass 6 + Q13 | | |
| 21 | pass 8 name | engineer | Compiler pass 8 + Q2 | | |
| 22 | pass 9 seed | engineer | Compiler pass 9 | | |
| 23 | pass 10 skills | engineer | Compiler pass 10 + Q19 | | |
| 24 | pass 11 trace | engineer | Compiler pass 11 | | |
| 25 | compile.ts wiring | engineer | The compiler | compile(build, lib) returns CompileResult | |
| 26 | tests: validation, floors, cap, risk gating | tester | Tests | | |
| 27 | tests: chassis, act-vs-ask, em dash, determinism | tester | Tests | | |
| 28 | tests: dedupe, contradictions, length | tester | Tests | | |
| 29 | tests: names, trace, examples | tester | Tests | | |
| 30 | rules test: UI rules + emit rules | tester | If-this-then-this | every row has a test (UI rows: M2, marked todo) | |
| 31 | tools/golden.ts + June and Rook goldens | tester | Golden compiles | line-by-line check against tables | |
| 32 | goldens for the other seven | tester | Golden compiles | committed, CI diff test | |

## Log

