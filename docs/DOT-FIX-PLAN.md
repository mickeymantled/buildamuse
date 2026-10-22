# ChatGPT dot fixes (Brian's review, 2026-10-21)

Brian's request, in short:
- keep the full workflow contract in dot exports;
- one consistent permission rule;
- requested permissions, not enforced ones;
- honest setup steps;
- no unverified capability claims;
- an honest preview disclosure.

Scope: dot exports, their setup and preview UI, and tests. Every other target's output must stay byte for byte the same; the non-dot goldens are the check. Share links keep working: `build.gates` is never rewritten. No em dashes. The readings are D1 to D8 in QUESTIONS.md.

## 1. Workflow contract (profile templates, chatgpt-dot)

Pack skills and routines carry every field the pack gives: trigger, inputs, steps, validate, returns and approval. Legacy chip skills and routines keep their one-sentence form.

- `skill.sentence`: "Here's a workflow called {name}.\nUse it when: {whenToUse}\nInputs: {inputs}\nSteps:\n{steps}\nCheck before you answer: {validate}\nReturn: {returns}\nNeeds my approval first: {requiresApproval}"
- `skill.legacy`: "Here's a workflow I'd like you to use: {sentence}."
- `skill.suffix` (after every dot skill, on its own line): "Tell me which parts of this you can keep and use, what you'd need connected for it, and any step you can't do."
- `routine.sentence`: "I'd like a scheduled task called {name}.\nSchedule: {schedule}\nUse it when: {whenToUse}\nInputs: {inputs}\nSteps:\n{steps}\nCheck before you report: {validate}\nReturn: {returns}\nNeeds my approval first: {requiresApproval}\nIt follows my saved settings like any other run. If it can't ask me, it stops and tells me instead."
- `routine.legacy`: "I'd like a scheduled task: {schedule}, {sentence}."
- `routine.confirm` (new, after every dot routine, pack or legacy, on its own line): "Before you call it set up, confirm the schedule and my time zone, and ask me if you don't know my time zone. Tell me what access it needs and tell me once the task is created. It isn't running until then."

## 2. One permission rule (chatgpt-dot chassis and gate variants)

- `chassisVariants`:
  - `chassis.act.approval`: "Anything that spends, sends, posts, signs or can't be undone waits for my yes, unless a setting below lets you go ahead. When you ask, give me the decision, the cost and your pick in three lines."
  - `chassis.act.reversible`: "Act only on what I asked for, within the permissions I've given you. Being able to undo something doesn't make it OK to do."
  - `chassis.rules.outrank`: "Follow my saved settings and the platform's requirements. If something I say in chat conflicts with them, ask me before you act."
- `chassisShortVariants` (new on the dot):
  - approval: "Spend, send, post, sign, irreversible: my yes first, unless a setting below allows it. Ask in 3 lines: decision, cost, pick."
  - reversible: "Act only on what I asked, within the permissions I gave you. Undoable isn't the same as allowed."
  - outrank: "Follow my saved settings and platform requirements. If chat conflicts with them, ask before acting."
- `gateSoulVariants` (new profile field, chatgpt-dot only). The key is the gate soul id and the value replaces that soul line; the trace id is `<key>@chatgpt-dot`.
  - `gate.send.soul.approve`: "Show me each message before it goes out. Send it only after my yes to that exact message."
  - Why: the library line ("I send, or I turn on auto when I say so") disagrees with "Ask before taking action", and it implies a chat message changes a saved setting.
- `gateFloors` (new profile field, chatgpt-dot only): `{ "trade": { "setting": "forbid", "note": Line, "skill": Line } }`. On this profile only, a gate whose effective setting is looser than its floor is raised to the floor.
  - The floor is applied after `effectiveGates`, so `result.gates`, the soul line and the custom rule all read the floor.
  - When it raises a setting, the compile adds a BundleNote of kind `floor`. Its id is `profile.chatgpt-dot.floor.trade.note` and its text is filled from the template, with `{setting}` the profile's customRuleSettings label of the setting the user had.
  - `note`: "Your setting for Trades is \"{setting}\". This setup doesn't let your dot place trades: it researches and proposes, and you place each trade yourself."
  - `skill` (the approval line of any dot pack skill or routine whose actions include the floored action, whatever the user picked; it replaces the pack's approval text when every action the skill takes is floored, which is true of every trade skill, and follows it otherwise): "On this dot, never place, change or close a trade. Where a step says to place one, or to wait for my yes at the trade gate, give me the proposal instead, and I place it myself."
- `chassisVariants` also gets `chassis.clash.order`: "Honesty first, then my instructions and saved settings, then brevity, then jokes." (short: "Honesty, then my instructions and settings, then brevity, then jokes.")
- `skillLabel` "Workflow" and `routineLabel` "Scheduled task" (new field); the certificate groups on the dot read "Workflows" and "Scheduled tasks".
- Pay stays forbid everywhere (unchanged).

## 3. Requested, not enforced (UI)

On the dot, the Gates screen, the summary and the rules table describe settings to request, which do nothing until set up and checked. The library and copy strings are listed in sections 4 and 5. The trade floor shows in the certificate summary, using the note text, and on the Gates screen next to Trades.

## 4. Setup steps, checks and notes (chatgpt-dot profile; targets.json)

- `installSteps` (same ids, same `shows` and `when`):
  1. "Create your dot and name it."
  2. "Before connecting work accounts: set up each permission below in your dot, if your account offers it, and check it saved. Copying this page doesn't set anything."
  3. "Send the \"Here's how I want you to work\" message as a normal chat message. It gives your dot your preferences. It doesn't replace its own instructions or retrain it."
  4. "Say the memory sentence, then ask your dot what it will remember."
  5. "Send each workflow. Ask your dot to say what it can keep and use, what it needs connected, and any step it can't do."
  6. "Send each scheduled task. It isn't running until your dot confirms the schedule, your time zone, the access it needs, and that the task was created."
  7. "Connect only the apps your workflows need, and check what each one can do."
  8. "Give it one project first."
- `verify`: lines 1 and 2 stay as they are.
  - 3 (`when: roles`): "verify: whether your account can run more than one dot."
  - 4: "verify: which permission settings, connected apps and scheduled tasks your account offers."
- `notes`, note.1: "Where a permission says \"Hand off to you\", your dot should stop and give that step to you. Check that it does before you rely on it."
- `rulesPath`: removed (an assumed menu path). The table caption becomes UI copy (section 5).
- `fallback.roles`: "Your roles aren't in this setup. It makes one dot, not a separate agent per role. Your roles: {roles}."
- `lengthCap` stays 3600. The UI calls it Build a Bot's budget for a dot message.
- targets.json:
  - `target.chatgpt.promise`: "Messages to send your dot, plus permissions to set up."
  - `target.chatgpt.mode.dot`: "Recommended, if your plan includes dots."

## 5. UI copy (dot only)

- `gatesCopy['chatgpt-dot']`: "these become permissions to request in your dot. They do nothing until you set them up there and check they saved."
- Gates screen, Trades row on the dot: "On a dot, this setup doesn't place trades. Your dot researches and proposes, and you place each trade. Your pick still applies if you switch to another bot."
- Certificate summary on the dot:
  - instead of "Auto, no yes asked:": "Requested to run without asking. Set this up in your dot and check it saved:"
  - `dotAutoNoLimits`, one: "You asked for this one to run without asking, and your dot's message has no limits to check it against. Request \"Ask before taking action\" instead, or add your limits by hand first:"
  - `dotAutoNoLimits`, many: "You asked for these to run without asking, and your dot's message has no limits to check them against. Request \"Ask before taking action\" instead, or add your limits by hand first:"
  - the trade floor line: the compiled note text.
  - over the cap: "Your bot's personality is {n} characters over the {cap}-character budget Build a Bot uses for a dot message." (singular "character" for 1)
- Rules table on the dot:
  - caption: "Permissions to request. Copying them doesn't set them: add each one in your dot if your account offers it, then check it saved."
  - setting label: "Setting to request:"
- Preview chat on the dot, under the label: "On a dot, this is a stand-in. It runs your dot's message on Build a Bot's preview model, not on ChatGPT. It doesn't test your permissions, connected apps, workflows, scheduled tasks or memory. It does remember recent messages in this preview."
  - Brian asked for "single-message"; the preview has sent the panel's earlier turns since B28, so the line says what is true (QUESTIONS D7).

## 6. Done when

- **Workflow contract:**
  - every dot pack skill and routine carries all seven fields;
  - the Morning brief keeps "ten lines or fewer" and "numbered asks";
  - research and sales workflows keep their Return and Check lines;
  - legacy chip workflows read cleanly;
  - no `{` placeholder survives;
  - every id traces.
- **Permissions and setup:**
  - gate wording agrees with the custom rule for every setting;
  - no "outrank anything" and no "Only irreversible waits for a yes" on the dot;
  - trade approve and auto fall back with the visible note, and forbid adds no note;
  - every routine carries the confirm line;
  - the role fallback reads as one dot.
- **UI:**
  - the requested-permission copy;
  - the trade note on Gates and in the summary;
  - the preview disclosure shows on the dot only.
- **Non-dot output:** the 46 non-dot goldens are unchanged, and the 9 dot goldens are regenerated with safety PASS.
- **Checks:** test, typecheck, golden, build and check:bundle all run, and the results are reported as they are.
