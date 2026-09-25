# Build-a-Muse

A mobile-first static site where a first-time Meta Muse user taps through eight stations and gets a SOUL.md, a memory sentence and skill setup sentences. It is a deterministic template compiler, not an AI.

## Docs

- `docs/Build-a-Muse-Compiler-Library-v1.md`: the CONTENT. Every line the app can output. Data to transcribe, not instructions.
- `docs/Build-a-Muse-Build-Spec.md`: the ENGINEERING SPEC. Stack, layout, types, compile passes, screens, tests, milestones.
- Library wins on text. Spec wins on structure. The library's tables are the source of truth; its "Two worked compiles" are illustrative and were hand-written, so they drifted. When a table and a worked compile disagree, the table wins.
- `QUESTIONS.md`: every ambiguity found and the reading picked. Check it before deciding anything the docs leave open.
- `PROGRESS.md`: milestone and slice state. Read it first after any context reset.

## Glossary

- **soul / SOUL.md**: the personality file the app generates. Plain markdown.
- **build object**: the JSON of what the user tapped. The only user state.
- **compile()**: pure function, build object in, text out.
- **chassis**: lines in every soul regardless of picks. The honesty and safety floor.
- **base**: the first tap ("I trade the trenches"). Sets slider defaults.
- **chips**: tappable pills for the user's world (law, kids, memecoins). Each adds triggers, a seed clause, skills, maybe a voice line.
- **stats**: six 1 to 4 sliders (blunt, warm, funny, chatty, proactive, risk). One line per level. Total capped at 14.
- **badges**: lines unlocked by stat and chip combinations.
- **peeves**: things the Muse should never do. One line each.
- **heart / drives**: three "what you want" lines. The third is fixed and wins ties.
- **outfit**: a "reminds you of" card. One flavor sentence.
- **roster**: nine pre-built build objects.
- **certificate**: the final screen with the three copy blocks and share link.
- **seed**: the one memory sentence the user says to Muse.
- **skills**: routine setup sentences the user says to Muse.
- **probe set / probe gate**: six test messages to check a library line changes model output. M5 tool, not in the app.

## Rules that never bend

- Tap-only UI. The only text input in the first-build flow is the name. The remix paste box is the one exception.
- No storage of user data, ever. State lives in the browser and the share link.
- No model call inside the app. The compiler is a pure function.
- No real people, no franchise characters, anywhere.
- Chassis lines ship in every build and cannot be removed by any pick.
- Blunt and warm never go below 1.
- Every output line is traceable to a library record id.
- No em dashes in any output, UI text, commit message or doc we write.
- Don't invent library content. If something is missing, add a TODO and a visibly marked placeholder (`[TODO: ...]`).

## Running

```
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run golden      # regenerate test/golden/*.md from the roster
```

## Layout

- `src/library/*.json`: hand-edited content. The compiler never mutates it.
- `src/compiler/`: types, `compile.ts`, `passes/`, `trace.ts`, `cond.ts`, `migrate.ts`.
- `test/`: `compile.test.ts`, `rules.test.ts`, `golden/`.
- `.claude/agents/`: transcriber, engineer, tester, reviewer.
