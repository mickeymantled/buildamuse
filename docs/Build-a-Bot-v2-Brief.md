# Build-a-Bot v2 brief (from Brian, 2026-10-01)

Verbatim copy of the brief that supersedes every instruction since M1 shipped. Dispatches paste sections from here.

======================================================================
PART A. WHAT CHANGED AND WHY
======================================================================

The product is Build-a-Bot: one builder, six runtimes, and output that is a bundle of files and spoken sentences, not one soul. Research findings that drive the design:

1. OpenClaw sub-agents load only AGENTS.md. Hermes delegated agents fall back to a built-in identity. A rule that lives only in SOUL.md disappears when the agent becomes a worker.
2. "Don't act until I say so" in prose is not a control. In a documented case the instruction was dropped by context compaction and the agent deleted 200+ emails. Approval gates must be restated in a rules layer the runtime loads, and enforced by product permissions where they exist.
3. The best task souls are short contracts: mission, one dominant drive plus a counter-drive, a testable never-list, a reporting contract (verdict first, fixed format, named recipient), one or two example exchanges. Procedures go to skills. Facts go to memory.
4. Three of the six targets (Muse, Grok Bot, ChatGPT Dots) have no soul file at all. They take personality by being told, and they hold hard rules in a product setting (Muse approval cards, Grok Bot description, Dots Custom Rules). The compiler emits per-target delivery; the UI copy stops saying "SOUL.md" and says "your bot's personality."

So the compiler emits three layers per target: PERSONALITY (soul: voice and judgment), RULES (hard limits and approval gates, in whatever the runtime actually enforces or loads for workers), SKILLS (procedures), plus the memory seed, routines and install steps.

Standing calls from before, all still in force: soul cap 3,600 with reversed drop order (voice lines and Life triggers drop first, Work and Markets triggers last); Risk-Off is Word2 whenever risk = 1; example 2 comes from the first chip in tap order with a row, any group; accounting d1 = "To make the number tie. A figure that doesn't reconcile isn't a figure yet."; Marty hard part = forget; the nine taglines I gave; singular seed ending ("when you need it") for one noun; cap stays 14; a skipped station keeps base defaults with a muted "you skipped X" line on the certificate. Land these first, regenerate goldens, then start M2.

======================================================================
PART B. DATA MODEL V2
======================================================================

New Build fields:
  v: 2
  target: 'muse' | 'openclaw' | 'hermes' | 'grok' | 'chatgpt'
  mode?: 'dot' | 'gpt' | 'instructions' | 'project'    // chatgpt only; default 'dot'
  plan?: 'free' | 'paid'                               // chatgpt instructions mode only
  packs: WorkflowPackId[]                              // 0..3
  limits: Record<LimitId, number>
  gates: Record<ActionId, 'auto'|'approve'|'forbid'>
  roles?: RoleId[]                                     // optional; if present a coordinator is always included

Migration v1 -> v2: target = 'muse'; packs derived from chips (memecoins or solana -> memecoins, prediction markets -> prediction-markets, options or stocks -> spot, engineering -> coding, sales -> sales, kids -> personal-ops, others -> none); gates and limits from pack defaults; roles absent. A v1 link must decode and compile with no errors.

New library record types (types.ts plus one JSON file each):
  Target { id, label, modes?, promise, personalityPath, openingLines: string[], chassisVariants: Record<chassisId, string>, rulesDelivery: 'AGENTS.md'|'RULES.md'|'inline'|'description'|'custom-rules', skillsDelivery: 'files'|'spoken'|'inline'|'knowledge', memoryDelivery: 'file'|'spoken'|'inline', routinesDelivery: 'spoken'|'files'|'none', installSteps: string[], reloadNote, supportsRoles: boolean, lengthCap?: number }
  WorkflowPack { id, label, triggers: Line[] (<=8), gatesDefault, limitsDefault, limitChips: LimitId[], skills: Skill[], seeds: string[], defaultRoles: RoleId[], rulesLines: Line[], venueNotes?: Record<targetId, string> }
  RolePack { id, label, mission, drive, counterDrive, never: Line[] (3..6), reporting: { to: RoleId|'user', format, verdictFirst }, proactiveDefault, bluntDefault, uncertaintyRule, anchorExchange: { me, you }, canDelegate: boolean, lockedStats?: Partial<Stats> }
  ActionGate { id, label, soulLine, rulesLine, customRuleText }   // customRuleText is the Dots phrasing
  Limit { id, label, unit, min, max, step, rulesTemplate }
  Skill { id, name, kind: 'trigger'|'schedule', schedule?, whenToUse, inputs, steps, validate, returns, requiresApproval }   // the six Grok Bot fields; every target renders a subset

CompileResult becomes a bundle:
  files: { path, content }[]
  spoken: { label, text }[]           // ordered sentences for spoken-delivery targets
  customRules: { action, setting }[]  // Dots only
  conversationStarters?: string[]     // chatgpt gpt mode only
  installSteps: string[]
  plus everything it returns today (soul, soulLines, seed, skills, badges, buildName, length, warnings)
Trace holds for every line in every file and every spoken sentence.

======================================================================
PART C. THE SIX TARGETS
======================================================================

MUSE (Meta)
  openingLines: Meta's two shipped lines. personalityPath: Identity > Soul (paste over). rulesDelivery: inline (gates restated in the soul; Muse's approval cards enforce). skills, memory, routines: spoken. supportsRoles: false. Chassis variant keeps "if you refine this file, tell me what changed." Cap 3,600.

OPENCLAW
  openingLines: OpenClaw template opener. personalityPath: ~/.openclaw/workspace/SOUL.md. rulesDelivery: AGENTS.md. skills: files (skills/<id>/SKILL.md). memory: USER.md. routines: files or spoken, verify. supportsRoles: true; roles compile to per-agent workspaces. Cap 3,600.

HERMES (Nous Research)
  openingLines: none (Hermes says add personality, don't restate defaults). personalityPath: ~/.hermes/SOUL.md. rulesDelivery: AGENTS.md plus restated in SOUL.md. skills: files. memory: USER.md. supportsRoles: true; roles compile to profiles. Install note: restart or new session; don't test with hermes -z. Cap 3,600.

GROK BOT (xAI, built with Cursor)
  Facts: a Bot has name, label, description, avatar, memory, skills, routines. Docs: "Put explicit safety boundaries in the Bot description." The description holds durable rules; the conversation holds task instructions. Skills are one private library shared across all the user's Bots and are created by asking the Bot; a useful skill states six things (when to use, inputs and access, sequence, validate, return, what requires approval). Routines are per-Bot schedules (max 50), created by asking, with Test run; docs require confirming owning Bot, schedule and time zone, input source, expected result, approval boundary, missing-source behavior. Plugins are account-wide. Templates are created in-app (Share > Create template) and shared as x.ai/bot/<id> links; they cannot be authored as files. Public links expose the whole config. Teams are group chats with one coordinator; supportsRoles true.
  openingLines: none. The profile opens with the JOB in operational terms. personalityPath: Edit Profile > Description. rulesDelivery: description (a "## Never" block) AND the requiresApproval field of every skill. skills, memory, routines: spoken. Cap 2,000 (one text box).
  Profile shape: <Name>. <Job in one sentence.> / ## What you want / ## How you work / ## Sources / ## Never / ## When data is missing / ## What you return / ## How this sounds. Omit no-self-edit and rules-outrank lines.
  installSteps: 1 New > Create new Bot, name it. 2 Edit Profile: paste Description, set label to the build name. 3 Say the memory sentence. 4 Say each skill sentence. 5 Say each routine sentence; Test run before enabling; don't enable until two runs look right. 6 Connect only the plugins the skills name; plugins are account-wide. 7 Optional: Share > Create template for an x.ai link; remove anything private first.
  reloadNote: "Profile changes apply to new messages. verify: whether a running routine picks up a profile edit."
  Bot Ready check (from the community kit, all twelve required for a grok golden): job, sources, never-list, deliverable, first task, skill, no-data policy, autonomy level stated (default L1 draft), example, routine discipline, share-safe (no secrets or tokenized URLs), working style.

CHATGPT (OpenAI), four modes
  Card shows four radios: Dot (recommended; Pro or Business Premium), Custom GPT, Custom instructions, Project. Instructions mode adds one tap: Free (1,500 chars) or Paid (5,000).
  Shared chassis variants: omit no-self-edit; capability check reads "Before you say you can't, check what you have on: web, files, code, your connected apps."

  mode: dot   (always-on agent, launched Sept 29 2026; own cloud computer; GPT-6 Astra; ChatGPT, Slack, Teams, voice; desktop-only setup; one dot per user at launch)
    Facts: no soul file and no instructions box. Starts from ChatGPT memory. Preferences go in conversation ("show me drafts before sending them" is OpenAI's example). Custom Rules at Settings > Personalization > Permissions > Custom rules: Add, describe the action, choose Take action without asking / Ask before taking action / prevent. Plugin permissions are separate. Auto-review checks actions against instructions, rules and safety. Proactive research is read-only. Scheduled tasks exist. Learns from feedback.
    This is the only target where gates map one to one onto a product feature: gate=approve -> "Ask before taking action"; forbid -> prevent; auto -> "Take action without asking." Emit one Custom Rule per gate. The soul still carries the act-vs-ask pair; enforcement is the rule.
    personalityPath: spoken, one message opening "Here's how I want you to work:". rulesDelivery: custom-rules. skills, memory, routines: spoken; skill sentences end "Save this as how you do <task> and tell me when you've got it." supportsRoles: false at launch; role sets compile to a single-dot note. Cap 3,600. Rules-outrank variant: "Your custom rules in Settings outrank anything I say in chat."
    installSteps: 1 Create your dot on desktop; name it, pick or generate the avatar. 2 Before connecting work accounts: add each Custom Rule below with the setting shown. 3 Send the "Here's how I want you to work" message. 4 Say the memory sentence. 5 Say each skill sentence. 6 Say each scheduled task; confirm the time zone. 7 Connect plugins only for what the skills need; review plugin permissions separately. 8 Give it one project first.
    verify lines (show on certificate): whether dots read the custom instructions fields; whether a rule added mid-task applies to that task; when teams of dots arrive (flips supportsRoles).

  mode: gpt   (Custom GPT: Name, Description, Instructions 8,000-char hard wall, Conversation starters, Knowledge files, Capabilities, Actions; shareable by link or Store)
    personalityPath: Configure > Instructions. rulesDelivery: inline, gates block at TOP and repeated at END; if Actions are used, certificate tells the user to mark write actions consequential (x-openai-isConsequential: true, verify name). skills: knowledge (each skill is a .md uploaded as Knowledge plus one pointer line in Instructions). memory: spoken. routines: spoken via Tasks (verify by plan). supportsRoles: false; role sets compile to separate GPT bundles plus a manual-handoff warning. Cap 8,000. Also emit four conversation starters (from the probe set and the first chip's example) and a description under 300 chars.

  mode: instructions   (Settings > Personalization > Custom instructions, two fields)
    First field gets the memory block, second field gets the soul. Cap 1,500 free or 5,000 paid. At 1,500 compile the compact variant: drives, gates, five stat lines, three peeves, one example; chip triggers past the first two dropped. skills inline, top three, one line each. supportsRoles: false.

  mode: project   (Project > Instructions plus files)
    Like gpt without starters or actions. skills: files uploaded to the Project. Treat cap as 8,000.

Chassis changes across all targets:
- File-based targets (openclaw, hermes) add: "You never edit this file. Lessons go to memory, not here." and "Rules in AGENTS.md outrank this file. If they conflict, the rules win."
- The act-vs-ask pair is generated from the gates registry: soul line names which actions wait for a yes; the rules layer lists the same actions with thresholds. Test: every gate set to approve or forbid appears in both layers, every build, every target and mode.

======================================================================
PART D. PACK AND ROLE CONTENT, FIRST PASS
======================================================================

Packs (visible placeholders where I gave no text):
memecoins: triggers = existing chip triggers plus "Assume every new token is a rug until three checks pass" and "Never raise size after a loss." Gates: trade=approve, pay=forbid. Limits: per_trade_pct 1, daily_loss_pct 3, max_trades_per_day 10. Skills: rug-check, narrative-watch, position-log, edge-gone-exit. Default roles: scout, risk-manager, journal.
perps: triggers "Every position has a stop at entry," "Never average down," "Check funding before entry." Gates: trade=approve. Limits: leverage_cap 5, per_trade_pct 2, daily_loss_pct 2. Rules line: "The agent wallet is trade-only. It cannot withdraw." venueNotes hermes/openclaw: "Use a trade-only agent wallet; one per process." Skills: funding-check, stop-placer, position-log.
prediction-markets: triggers "State your probability before you look at the price," "Read resolution rules before any bet," "No edge, no trade." Limits: kelly_fraction 0.25, min_edge_pct 8, max_exposure_pct 30. Skills: resolution-read, edge-calc, calibration-journal.
spot: triggers "Separate the business from the ticker," "Never trade a headline you haven't read in full." Gates: trade=approve. Skills: earnings-prep.
coding: triggers "Done means tests ran and passed; say which," "Smallest diff that solves the ticket." Gates: deploy=approve, delete=approve, force_push=forbid. Skills: pr-review, break-check, standup.
research: triggers "One question gets one search pass; a comparison gets parallel passes," "Say what you couldn't verify," "If sources disagree, show both." Gates: none. Skills: source-tier, citation-check.
content: triggers "No claim without a source link," plus a voice-anchor slot from memory. Gates: publish=approve. Skills: headline-test, draft-read.
sales: triggers "Every fact about the prospect comes from a source you can quote," "If unsure it's relevant, don't send," "Opt-outs are permanent." Gates: send=approve. Limits: max_sends_per_day 30. Skills: pre-send-read, follow-up-cadence.
personal-ops: triggers "Propose, don't perform, for anything that deletes, sends, pays, or commits my time," "Batch your asks." Gates: send=approve, delete=approve, pay=forbid. Skills: inbox-triage, conflict-scan, morning-brief.
support: triggers "Quote policy, never paraphrase it into a promise," "Verify identity before account details." Gates: refund=approve. Limits: refund_ceiling 100. Skills: escalation-router.
data: triggers "Read-only unless told otherwise," "Show the query," "Name the denominator." Gates: write_query=forbid. Skills: fanout-check.
devops: triggers "Mitigate before you diagnose, but only with reversible actions," "Post status every N minutes." Gates: deploy=approve, delete=forbid, rollback=auto. Skills: incident-status.

Every skill is authored in the six-field shape (whenToUse, inputs, steps, validate, returns, requiresApproval). Grok renders all six; other targets render steps plus requiresApproval at minimum.

Roles:
Trading: scout, analyst, risk-manager (coordinator), executor, journal.
Coding: planner (coordinator), implementer, reviewer, tester, debugger, release-manager.
Research: lead (coordinator), searcher, synthesizer, fact-checker, writer.
Personal ops: chief-of-staff (coordinator), triager, scheduler, drafter.
Rules: exactly one coordinator per set, canDelegate=true; all others canDelegate=false and emit "Report to <coordinator>. Never delegate." risk-manager and reviewer lock blunt=4, warm=1. drafter and executor lock proactive=1. reviewer and fact-checker emit "You did not produce this and have no stake in it passing" and "Never fix it yourself." Role souls 40 to 120 lines. Trading sets never include executor by default. On targets with supportsRoles=false, a role set compiles to the target's documented fallback (separate GPT bundles, or a single-dot note).

Defaults that protect users (these are tests):
- Any pack with trade: trade=approve and the soul line "Propose trades. I execute, or I turn on auto when I say so." Auto is a user flip, never a default.
- send and delete default to approve wherever they exist. pay defaults to forbid everywhere. On Dots, pay compiles to prevent.
- A pack whose defaults would let the agent move money, send mail, or delete data without approval is a failing test.
- Every pack ships five probe prompts in test/packs/<pack>.probes.json, one of which tries to get past a gate. M6 runs them; M2 stores them.

======================================================================
PART E. UI CHANGES (for M3)
======================================================================

Station 0 is the target picker, the first screen, before the roster. Five cards: Meta Muse, OpenClaw, Hermes Agent, Grok Bot, ChatGPT (with the four mode radios, Dot preselected). Each card shows its promise line. Required, no skip. Everything downstream reads target and mode:
- Roster cards compile against the chosen target.
- Pack screen after World: packs pre-selected from chips, adjustable, max 3. Packs the target can't deliver are hidden.
- Limits screen only when a selected pack exposes limit chips: number steppers, never text. Shows venueNotes.
- Gates screen: three-state toggles per action the packs expose; pay locked at forbid. Copy per target: openclaw/hermes "these also go in AGENTS.md so they survive delegation"; muse "these go in your soul and Muse's approval cards do the rest"; grok "these go in the Bot description and in every skill's approval field"; chatgpt dot "these become Custom Rules in Settings, which ChatGPT enforces"; chatgpt gpt/instructions/project "these go at the top and bottom of your instructions; ChatGPT has no approval surface beyond this, so they do all the work."
- Roles screen behind an "advanced" toggle, off by default, hidden when supportsRoles is false.
- Certificate renders from the target's installSteps; copy blocks for spoken targets; a Custom Rules table for dot; zip download for file targets; "Make this for <other target> instead" recompiles without touching other picks.
Share links carry target, mode, plan, packs, limits, gates, roles. Remix keeps them.
Landing and UI copy say "your bot's personality," not "SOUL.md," except where a target actually uses a SOUL.md file.

======================================================================
PART F. MILESTONES (new order)
======================================================================

M2  Data model v2: types, targets.json (6 records incl. chatgpt modes), gates.json, limits.json, packs.json, roles.json, chassis variants, bundle output, migrations v1->v2, goldens: nine starters x (muse, openclaw, hermes, grok, chatgpt-dot, chatgpt-gpt) = 54, plus Marty and June for chatgpt-instructions (free and paid) and chatgpt-project = 6 more, 60 total. Pack probe files stored. Done when: npm test green; every gate appears in both layers for every golden; every dot golden emits one Custom Rule per gate; every grok golden passes all twelve Bot Ready checks; every chatgpt golden fits its mode's cap; a v1 Marty link decodes to v2 and compiles; no pack default violates Part D.
M3  UI: stations 0 through 7 as specced plus pack, limits, gates and roles screens; store; preview strip; floors and caps enforced.
M4  Certificate as bundle: per-target install steps, copy blocks, Custom Rules table, zip download, share link, remix, target switch. Candidate, not committed: a hosted raw endpoint that compiles a profile on the fly from the share-link payload (no storage) so a Grok "Setup" Bot can fetch it by URL.
M5  Preview chat (unchanged from the spec).
M6  Gate tooling: probe gate, weak-model pack tests, Bot Ready check promoted to all targets, CONTRIBUTING for packs and roles, roster nomination form.

Stop conditions, added: any pack whose defaults would let the agent move money, send mail, or delete data without approval. That is a bug, not a config.

======================================================================
PART G. HOW YOU WORK: THE SUBAGENT LOOP
======================================================================

You plan, dispatch, verify and decide. You write code only to fix a subagent's work when that's faster than re-dispatching. The four agents in .claude/agents/ (transcriber, engineer, tester, reviewer, all model: sonnet) stay as defined. Add two:

.claude/agents/author.md (sonnet)
  Writes library CONTENT for one named pack or role from the brief in Part D and the patterns in Part A. Produces JSON records in the six-field skill shape plus the five probe prompts. Every line must be a testable behavior, not an adjective. Never writes code. Never writes a line that lets an agent act on money, mail or data without a gate. Returns the record and a one-line note per placeholder it left.

.claude/agents/safety.md (sonnet)
  Reads one compiled golden bundle and checks only: every approve/forbid gate appears in both layers; dot bundles emit one Custom Rule per gate with pay=prevent; no pack default violates Part D; the no-self-edit line is present for file targets; the rules-outrank line (or its variant) is present; role souls are 40 to 120 lines; coordinators are exactly one per set; grok bundles pass all twelve Bot Ready checks; chatgpt bundles fit their cap. Returns PASS or a numbered list with file and line. Never fixes anything.

Slice rules (unchanged): one agent, one slice, one dispatch; paste the exact brief text into every dispatch, never a pointer; max two review rounds per slice, then fix it yourself and log why; one commit per slice; PROGRESS.md is the only state that survives a restart, read it first on every start.

The loop per slice:
  1 PLAN     one line in PROGRESS.md: what, agent, brief section, done criterion
  2 DISPATCH the brief text, allowed paths, done criterion. Nothing else.
  3 VERIFY   npm test and npm run typecheck yourself
  4 REVIEW   reviewer for code slices, safety for golden slices, both for pack and role slices (author's content goes to safety first, then its JSON goes to reviewer)
  5 COMMIT   "<milestone> <slice>: <what>"
  6 NEXT

M2 slice plan, in order:
  types v2                                     engineer
  targets.json (6 records)                     transcriber from Part C
  gates.json (incl. customRuleText), limits    transcriber from Parts B and D
  migrate v1->v2 plus tests                    engineer, then tester
  chassis variants per target and mode         transcriber
  bundle assembly pass (files, spoken, customRules, starters)   engineer
  packs: one slice per pack (12)               author -> safety -> transcriber
  roles: one slice per set (4)                 author -> safety -> transcriber
  gate-in-both-layers test                     tester
  dot custom-rules test                        tester
  grok Bot Ready test                          tester
  chatgpt cap tests                            tester
  pack-default safety tests                    tester
  goldens, 60                                  tester generates; safety reviews each target's set
  probe files for all packs                    author
Then stop, report, and wait for a go on M3.

Rules for you as lead, additions to the existing list:
- Content for packs and roles comes from author, never from transcriber guessing and never from you. If Part D gives no text, author leaves a visible placeholder and you log it in QUESTIONS.md.
- Safety review is not optional and not skippable under time pressure. A golden set with a safety FAIL does not get committed.
- When a runtime fact is unverified (OpenClaw routine delivery, whether a running Grok routine picks up a profile edit, whether dots read custom instructions, whether a Dots rule applies mid-task, the consequential-action flag name, Tasks availability by plan), write it into the target record as "verify:" text so the certificate can show it, and log it in QUESTIONS.md.
- Dots and Grok Bot docs will change weekly for a while. Pin the doc URL and the date you read it in each target record.
- No em dashes anywhere, including library content, commit messages, PROGRESS.md and probe prompts.

Begin: land the standing calls and regenerate goldens, update PROGRESS.md with the M2 slice plan above, create author.md and safety.md, then dispatch the types v2 slice.
