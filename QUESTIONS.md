# Questions and readings

Each entry: what's ambiguous, the readings, the one picked. "Decided by Brian" means settled; everything else is a lead call that Brian can overturn.

## Decided by Brian

**Q1. Worked compiles vs tables.** The June and Rook souls in "Two worked compiles" drifted from the tables (shortened chassis lines, "No corporate speak." cut short, merged voice lines, different Instincts order, Rook's d1 wording, Rook's greeting). Picked: tables win. June and Rook goldens are regenerated from the compiler and checked line by line against the tables. Instincts order follows spec pass 3.

**Q2. Naming rule.** Risk earns a word at 1 (Risk-Off), 3 (Risk-On), 4 (Degen); level 2 is silent. Tiebreak order unchanged: blunt, warm, funny, proactive, chatty, risk. Marty = "Blunt Degen Trench Companion", Odds = "Blunt Risk-On Trench Companion". The phrase "dropping Word2 if it equals Word1's tier" is ignored: no two stats share a word, so it can never fire.

**Q3. Seed formula.** The spec's pass 9 formula wins: the tail is always " when you need them." even for one noun. (The library's June example says "when you need it".)

## Decided by Brian (2026-10-01 standing calls, docs/Build-a-Bot-v2-Brief.md Part A)

**S1. Soul cap and drop order** (supersedes Q13, Q25). Cap 3,600. Reversed order: voice lines drop first, then Life and Time chip triggers, then Work and Markets triggers (third, then second), last-tapped chip first in each group. A Work or Markets chip's first trigger is never dropped.

**S2. Risk-Off** (supersedes Q26). Whenever risk = 1, Word2 is Risk-Off. Word1 is the top non-risk stat by the usual sort and tiebreak.

**S3. Example 2 row** (supersedes Q11). The first tapped chip in tap order that has a row, any group; else the default row. June gets the kids row.

**S4. Accounting d1** (supersedes Q5 for accounting). "To make the number tie. A figure that doesn't reconcile isn't a figure yet."

**S5. Marty's hard part** (supersedes Q4). forget. d1 stays the memecoins suggestion ("To be early.").

**S6. Taglines.** Brian's brief says "the nine taglines I gave", but they are not in the brief, this repo, or the docs. Open: Brian, please paste them. Until then each stays `[TODO: tagline]` (Q22).

**S7. Seed ending** (supersedes Q3). One domain noun: " when you need it." Two or more: " when you need them."

**S8. Stat cap** stays 14 (spec open question closed).

**S9. Skipped stations** keep base defaults; the certificate shows a muted "you skipped X" line (UI, M3/M4).

## Lead calls

**Q4. Marty's hard part.** The roster Heart column for Marty says "be early", which is the memecoins d1 suggestion, not a hard part. A build needs a hard part. Picked: `calmer` (no forced badge, fits a trader). d1 is the memecoins drive.

**Q5. Chip d1 suggestions are phrases, not drive lines.** The library gives "d1: be early", not a full "To ..." line. Picked: the drive line is "To " + phrase + "." ("To be early."). Accounting's phrase "the number has to tie" doesn't read after "To", so its line is the placeholder `[TODO: accounting d1 drive line] the number has to tie.` Brian should write the real lines.

**Q6. How you talk order.** Spec pass 3: chassis always-on lines, then blunt/warm/funny/chatty stat lines, then the chassis funny variant, then peeve lines. The worked compiles interleave differently. Picked: pass 3. Unconditional chassis lines first (in chassis.json order), stat lines, then conditional chassis lines, then peeves in tap order.

**Q7. Instincts order.** Picked: pass 3. Chip triggers in chip tap order, then badge lines in badges.json order, then the hard part extra line, then voice lines in chip tap order.

**Q8. Which chips' voice lines emit.** The worked compiles only show Life voice lines. The tables give Work chips voice lines too. Picked: tables win, every tapped chip's voice line is emitted. At funny = 1 the Life chips' voice lines are dropped (emit rule + contradiction pair).

**Q9. Badge vs trigger overlap.** Spec dedupe only drops a badge line that exactly equals a chip trigger. Kid Guard's line is both kids triggers joined; Cheap Fix's line contains the trades trigger; Triage's line contains the too_much extra line. Exact match would ship the same sentence twice. Picked: (a) a badge line equal to an emitted chip trigger is dropped (Chase Caller, Displacement); (b) a chip trigger or hard part extra line whose normalized text is contained in an emitted badge line is dropped, and the badge line stays (Kid Guard, Cheap Fix, Triage). Normalized = lowercase, trimmed, whitespace collapsed, trailing period removed.

**Q10. Where the risk line goes.** Compile order puts only blunt/warm/funny/chatty in How you talk. The library says "Acting for me: chassis, with risk variants" and "risk absent: no Trading subsection at all". Picked: a `### Trading` section right after `## Acting for me`, holding the risk stat line. Absent when risk is absent.

**Q11. Example 2 row selection.** Spec and the if-this table both say: first Work or Markets chip, else the default row. That makes the kids row unreachable (kids is Life). Picked: the stated rule. Take the first tapped Work or Markets chip that has a row; if none, `default`. June therefore gets the landlord row. Brian: should Life chips with rows (kids) be eligible when there's no Work or Markets chip?

**Q12. Greeting rows at warm 2.** The greeting table keys warm as any / 1 / 3+, so warm 2 with funny 2+ matches nothing. Picked: warm 2 uses the warm 1 row (`warm lte 2`).

**Q13. Length pass groups.** The drop order names Work and Life chips. Picked: Markets counts with Work; Time counts with Life. Order: last-tapped Work/Markets chip's third trigger, then its second, then the same for earlier Work/Markets chips; then Life/Time chip triggers from last-tapped back (all of them); then voice lines from last-tapped back. A Work/Markets chip's first trigger is never dropped. If still over 3,200, keep it and add a warning.

**Q14. "as an AI" peeve names Marty.** The line is "Never say "as an AI." You're Marty, or whoever I named you." Picked: verbatim. The "name appears exactly once" check applies to builds without this peeve.

**Q15. d3 when several conditions hold.** Picked: first match in table order: risk = 4, then base = parent, then base = student, else default.

**Q16. "funny = 1: no seasoning line, no seatbelt joke line".** No seasoning line exists in the library and the seatbelt joke line isn't defined. Picked: no-op; the Seatbelt badge still emits at risk 4.

**Q17. Ids.** Library labels with spaces become snake_case ids (`real_estate`, `prediction_markets`, `night_owl`).

**Q18. Tracing composite lines.** The Who you are paragraph joins the name, outfit anchor and base line. Picked: a structure record `structure.who` (template `{name}. {anchor} {baseLine}`) in chassis.json owns the line; `sources` lists the three inputs. Headings and example "Me:/You:" lines are also owned by library records. Blank lines get id `structure.blank`.

**Q19. Skill sentences.** The library gives skills as `Name (details)` and says "prefixed by Set up for triggered routines and by a schedule for recurring ones", naming three schedules. Picked: if the details start with a schedule token, it is a schedule skill: `morning:` → "Every morning at 8", `Sunday:` → "Every Sunday", `Monday:` → "Every Monday", `weekly:` → "Every week", `monthly:` → "Every month", `end of day:` → "At the end of every day" (the last three are derived, not in the library). The token is removed from the details. Output: `Set up <sentence>.` or `<schedule>, <sentence>.` where the sentence's first letter is lowercased unless the second letter is uppercase ("PR review").

**Q20. Seed with no chips.** "Remember that . ..." would be broken. Picked: with no chips, the seed starts at the hard part clause.

**Q21. d2 swaps.** Station 5 lets the user "swap" d2 but doesn't say to what. Picked: any d2 drive is valid in the build; the UI decides the offer later (M2).

**Q22. Roster taglines.** RosterEntry has `tagline` but the roster table has none. Picked: `[TODO: tagline]` placeholder per entry.

**Q23. Roster peeves.** Only June and Rook have peeves (from the worked compile build blocks). The other seven have none.

**Q24. Pass order.** Examples (pass 7) must exist before the length pass (6) can measure the soul. Picked: examples are computed inside assemble; the pass module still lives in `passes/examples.ts`. Examples are never dropped.

**Q25. Rook runs over length with the full table lines.** With the tables' full chassis and peeve wording (Q1), Rook compiles to about 3,400 characters before the length pass. The library's drop order then removes founder's third and second triggers and engineering's third and second triggers before any voice line ("Terse. Code blocks over prose.", "Short, action first."), so Rook loses "If I'm about to ship something you'd flag in review, flag it before I ship." Picked: follow the documented drop order. Brian: consider dropping voice lines before a Work chip's second trigger, or raising the cap, or trimming chassis wording (the chassis alone is well over the doc's "about 1,100 characters").

**Q26. Risk-Off can never appear in a build name.** Every non-risk stat is at least 1 and always has a word, and risk sorts last on ties, so risk at level 1 can never be in the top two. Risk-On (3) and Degen (4) do appear (Odds, Marty). Picked: implement the rule as written; Risk-Off stays in names.json but is unreachable. Brian: if Risk-Off should show, one option is letting risk 1 and 4 outrank ties, or giving risk-off its own slot.

**Q27. Test file split.** The spec puts all compiler unit tests in `test/compile.test.ts`. To let testers work in parallel without touching the same file, they're split into `test/validation.test.ts`, `test/output.test.ts`, `test/passes.test.ts`, `test/names-trace-examples.test.ts`, plus `test/rules.test.ts` and `test/golden.test.ts`.

**Q28. "Walk me through" contradiction has no current target.** No chip trigger in the library contains "walk me through" (only the chatty 4 stat line does, and stat lines always win). The reviewer flagged the record as dead. Picked: keep it, because the library lists the pair explicitly and it engages as soon as such a chip line is added; tests exercise it with an injected line. Also noted by review: the id `student` is both a base id and a chip id. They live in different namespaces (base ids never become soul line ids), so no trace collision.

**Q29. Seed clause capitalization.** The meetings chip seed is "My days are meetings." and it lands mid-sentence ("Remember that I'm a lawyer, My days are meetings."). Picked: lowercase the first letter of each chip clause unless it is the pronoun I. Only this one clause changes today. Lead fixed this directly in seed.ts (two lines) rather than re-dispatching.

## M2 (Build-a-Bot v2) lead calls

Architecture is in docs/V2-DESIGN.md. Each entry below is a call Brian can overturn.

**V1. "Six targets", "6 records".** Part C lists five targets (Muse, OpenClaw, Hermes, Grok Bot, ChatGPT) with ChatGPT in four modes, which is eight delivery profiles. Picked: targets.json holds 5 target cards (station 0) and 8 delivery profiles. The six golden columns are muse, openclaw, hermes, grok, chatgpt-dot, chatgpt-gpt.

**V2. Instructions plan default.** Part B makes `plan` optional. Picked: absent means free (the stricter 1,500 cap), so a build without a plan still fits.

**V3. Gate and limit merging.** Picked: pay is present in every build and locked at forbid ("pay defaults to forbid everywhere"). When two selected packs default the same action differently, the stricter setting wins (forbid over approve over auto); when they default the same limit differently, the stricter value wins (each limit says whether lower or higher is stricter). User overrides apply after, except pay.

**V4. Packs that act without a Part D gate.** prediction-markets places bets but Part D gives it no gates, and support replies to customers but has only refund. Under "Any pack with trade: trade=approve" and the new stop condition, picked: author and safety must give every pack a gate for any money, mail or data action it can take; any gate added beyond Part D is listed here once authored.
- V4 added gate, devops: send=approve and publish=approve (status updates to the incident channel and a status page), write_query=forbid and force_push=forbid (the pack names changing production data and rewriting git history; Part D gives devops only deploy, delete and rollback). Matches data (write_query=forbid) and coding (force_push=forbid).

**V5. Who writes gate, limit and template text.** Parts B and D give gate and limit names but almost no text (only the trade soul line, the dot opener and suffix, the dot setting names, the grok install steps and the variants in Part C). Picked: the author agent writes the missing text as testable lines, safety reviews it, the transcriber writes the JSON. Every authored line is reported so Brian can approve or rewrite it. Text Brian gave is used verbatim.

**V6. Act-vs-ask pair in v2.** Picked: chassis.act.approval stays as a generic catch-all (chassis can't be removed), followed by one generated soul line per gate, then chassis.act.reversible. The rules layer lists the same gates with thresholds.

**V7. Chassis inside small caps.** Grok's description is capped at 2,000 and free custom instructions at 1,500; the full chassis alone is about 950 characters. Brian's compact list for 1,500 doesn't mention chassis. Picked: every chassis line still ships, in a short form (a `short` text per chassis line, authored and safety-reviewed) on grok and on instructions free. Brian: confirm, or say which chassis lines the compact variant may leave out.

**V8. Bundle shape extensions.** Part B's CompileResult plus: each file has `label`, `delivery` ('file' or 'paste') and traced `lines`; spoken items carry `ids`; `notes` (verify lines, reload notes, venue notes, fallback warnings) for the certificate; `description` (gpt); the effective `gates`, `limits`, `packs`, `roles`.

**V9. Roster stays target-agnostic.** Starters keep the v1 build shape; compiling a starter for a target runs the v1 to v2 migration with that target (packs from chips, default gates and limits).

**V10. Skill shapes.** Pack skills use the six-field shape plus an `actions` list (the gated actions the skill can take) so tests can check each skill's approval field. Chip skills keep their v1 shape and render through a per-profile legacy template.

**V11. Rules-outrank line.** Present for openclaw and hermes (Part C text) and for chatgpt-dot (Part C variant). Muse, grok, gpt, instructions and project carry their rules in the same text as the personality, so they have no outrank line. Muse keeps the refine line (Part C); every other profile drops it (it contradicts "You never edit this file").

**V12. Role fallbacks Part C doesn't name.** Muse and custom instructions: no role output, one note saying roles aren't supported there. Project: like gpt, one instructions bundle per role plus the manual-handoff warning.

**V13. Placeholders that only Brian can fill.** The OpenClaw template opener text and the five promise lines are not in the brief. Picked: `[TODO: ...]` placeholders, shown in goldens.

## M2 doc research (official docs read 2026-10-01; full results in the M2 log)

**V14. Dots custom rule settings.** Brian: "choose Take action without asking / Ask before taking action / prevent"; "On Dots, pay compiles to prevent." The ChatGPT dots docs (learn.chatgpt.com/docs/dots/controls) list four options and none is named "prevent": Take action without asking; Take action when you say so; Ask before taking action; Hand off to you (the dot asks you to do it yourself). Picked: auto -> "Take action without asking", approve -> "Ask before taking action", forbid -> "Hand off to you", the documented option that keeps the dot from doing it, with a verify line. The safety check "pay = prevent" is read as "pay maps to the forbid setting". Brian: confirm, or keep the literal word "prevent".

**V15. Custom GPT retirement.** OpenAI help (articles 8554407 and 20001519): new GPT creation and publishing are off on personal plans (Free, Go, Plus, Pro), and custom GPTs retire Dec 11, 2026 (Feb 11, 2027 for approved Enterprise deferrals). The 8,000-character Instructions limit and the 300-character Description limit are community-reported, not in OpenAI's docs. Picked: build chatgpt-gpt as briefed, with verify lines on the certificate. Brian: the gpt mode may be worth hiding or demoting before M3.

**V16. Muse skills.** Meta help ("How Muse works with skills"): skills are built in and Meta-authored; users can't add them. A spoken sentence creates reminders and scheduled tasks. Muse does confirm stored routines in words (closes the spec's open question). Meta has not published the default Soul.md text; the two opening lines are Brian's. Picked: keep Muse skill sentences, with a verify line saying they act as standing instructions or reminders, not installed skills. Brian: consider renaming them on the certificate for Muse.

**V17. OpenClaw opener and memory.** The opener comes from OpenClaw's own SOUL.md template (docs.openclaw.ai/reference/templates/SOUL): "# SOUL.md - Who You Are" then "_You're not a chatbot. You're becoming someone._" Picked: those two lines as openclaw openingLines (closes the V13 placeholder for OpenClaw). OpenClaw stores routines as automations in a database (spoken or CLI, not files): routines are spoken. OpenClaw's USER.md has its own format (one Always, Never or Prefer directive per entry, 4,000-character cap; facts belong in MEMORY.md). Picked: keep Brian's USER.md, with a verify line. Brian: USER.md as bullets of facts may not match OpenClaw's format; options are MEMORY.md, or spoken memory.

**V18. Hermes.** `hermes -z` runs the same agent (CLI reference); the modes that skip SOUL.md are `--ignore-rules` and `--safe-mode`. Picked: keep Brian's install note verbatim and add a verify line with the documented modes. Brian: the note may be wrong. AGENTS.md loads from the working directory Hermes runs in, not from ~/.hermes or a profile folder; USER.md lives at ~/.hermes/memories/USER.md; skills at ~/.hermes/skills/<id>/SKILL.md; profiles at ~/.hermes/profiles/<name>/ with their own SOUL.md. Picked: role rules for hermes ride in each profile's SOUL.md rules section (Hermes already restates rules in SOUL.md); per-role AGENTS.md is not emitted for hermes.

**V19. Grok Bot.** xAI docs do not state a 2,000-character description cap (only Team Bot descriptions, 140). Group chats hold 2 to 6 Bots and the Bots decide who responds; a coordinator is an example, not a setting. Picked: keep cap 2,000 and roles as a group chat with the coordinator convention, both with verify lines.

**V20. ChatGPT smaller facts.** Teams access for dots is an invite-only alpha; dots can't call you at launch; custom instructions may show one field, not two; scheduled tasks exist on every plan with caps (Free 3 active, once a day). All become verify lines.

**V21. Gates added beyond Part D (V4, all safety-reviewed).** prediction-markets: trade=approve (bets move money). support: send=approve (replies to customers). coding: send=approve (pr-review and standup post messages). devops: send=approve, publish=approve (incident status updates), write_query=forbid, force_push=forbid. perps, prediction-markets, spot, support also list pay=forbid (redundant with the global pay lock). Brian: approve or trim.

**V22. Author-written content awaiting Brian's approval.** Everything below was written by the author agent because the brief gives names but no text; each passed safety review. Gates: labels, every soul and rules line except trade's approve soul line, every customRuleText (src/library/gates.json). Limits: labels, units, min, max, step, stricter, rules templates (refund ceiling assumed USD) (src/library/limits.json). Packs: labels, every skill's six fields, seeds, extra rules lines, Grok job, sources, deliverable and first task, probe prompts, defaultRoles except memecoins (src/library/packs/*.json, test/packs/*.probes.json). Roles: every role's mission, drives, never-list, reporting format, defaults, uncertainty rule and anchor exchange, plus the role set templates other than Brian's three lines (src/library/roles/*.json). Profiles: every template, install step and chassis variant that is not Brian's verbatim text, and every chassis short form (src/library/targets.json, chassis.json). Placeholders left for Brian: content pack voice-anchor trigger, devops status interval N (two places), five promise lines, nine taglines.

**V23. Default roles.** Two sources disagree for some sets: each pack's defaultRoles (used when the roles toggle turns on from a pack) and each role set's defaultMembers (used when no pack names roles). Picked: the first selected pack's defaultRoles win; the set's defaultMembers is the fallback; the coordinator is always added. Trading never includes executor by default in either source.

**V24. Install-step wording to tidy (copied as given).** openclaw and hermes step 5 and grok's reload note carry an inline "verify:" clause; hermes step 6 is Brian's install note as written ("restart or new session; don't test with hermes -z"), which reads as a note rather than a step (see V18); chatgpt-gpt step 3 states "The hard limit is 8,000 characters" while its verify line says that limit is community-reported (V15). Brian or the author can reword in a later content pass.

## M2 caps: BLOCKING, needs Brian (stop condition: "the cap or floors need changing")

**V25. The caps can't all hold with every chassis line plus the rules layer.** Measured with the real library (Wave B, 2026-10-01):
- Grok description, cap 2,000: rendered 3,100 to 4,700; the protected floor alone (chassis in short form, drives, rules block, required Bot Ready lines, examples) is 2,300 to 3,300, even with no packs (Vera 2,282).
- Custom instructions free, cap 1,500: 4 of 9 starters fit (Vera, Sol, Pip, Ink, after dropping optional lines); Marty, June, Rook, Dash and Odds stay 860 to 1,930 over, because short chassis (about 740) plus one rules block (530 to 1,060) plus drives already passes 1,500, and the block must appear twice.
- Custom instructions paid, cap 5,000: Marty 5,226, June 5,233 before trimming.
- Soul profiles, cap 3,600: Marty on Muse is 4,231 before the length pass; pack triggers and rules lines are never dropped, so some gate-heavy builds may stay over.
- Role souls: grok role descriptions about 3,300 to 3,400 against 2,000; hermes role souls 60 to 700 over 3,600.
Options for Brian (any mix): (a) raise or drop the 2,000 grok cap (xAI documents no limit, V19); (b) allow a compact rules form on small caps (gate lines only, limits and pack rules once, or the repeat block holding gate lines only); (c) trim author-added pack rules lines (only perps' rules line is Brian's) and shorten author templates; (d) let small-cap profiles drop named chassis lines (bends the chassis rule, Brian's call only); (e) steer gate-heavy builds away from free custom instructions in the UI. Until Brian decides: nothing protected is dropped, over-cap output ships with an "over N" warning, and the cap checks report rather than fail.
- Grok cap test (Brian, 2026-10-02): a 5,499-character description saved in full in a real Grok Bot, so the real limit is above 5,500 and undocumented. Our cap stays at 4,000 as a quality choice, not a product limit. The Grok cap "verify" line is removed from src/library/targets.json; the group chat verify line stays (now profile.grok.verify.1). Decision recorded under B1.

**V26. Free custom instructions drop order (provisional).** To get under 1,500 the compact variant drops, in order: inline skills, the example pair, chip triggers, peeves, then the proactive, chatty and funny stat lines (blunt and warm never). This goes beyond Brian's compact list (which keeps five stat lines, three peeves, one example). The repeated rules block never drops (lead fix after two review rounds; the gates must be at the top and the bottom).

**V27. Role soul details.** The role proactive line sits with the other stat lines under How you talk (design section 9), not in its own section. Grok has no `fallback.roles` template yet, so the grok team note is a visible placeholder; the author will write one.

**V28. Lead fixes after Wave D (review rounds used up).** (1) Dedupe: a chip trigger whose text equals a pack trigger's gives way to the pack copy, because pack triggers never drop (V25) and keeping the chip copy let the length pass delete the line (Marty on Muse lost two memecoins triggers). (2) Grok: every pack skill and routine now carries every approve/forbid gate's rules line in its approval field, matching Brian's "the requiresApproval field of every skill" (safety flagged June's Conflict scan missing pay). (3) A gate test derived its gate set from compiler output; it now uses pack defaults plus the pay lock. (4) The length test for Markets ordering now uses options (no pack twin) instead of memecoins.

## Decided by Brian (2026-10-02): M2 closeout and go for M3

**B1. Caps (closes V25).**
- Grok: cap 4,000. Brian tested on 2026-10-02: a 5,499-character description saved in full in a real Grok Bot, so the product limit is above 5,500 and undocumented. 4,000 is a quality choice, not a product limit; the Grok cap verify line is removed.
- Free custom instructions: the bottom repeat block carries gate lines only (limits and pack rules once, at the top). The UI steers gate-heavy builds to Paid.
- Muse and Hermes: cap 4,000. On any profile whose cap is 4,000 or less, before any chip trigger drops: first cut the author's extra pack rules lines (every pack rules line except Brian's perps line), then switch chassis lines to their short-form records. Chassis lines are never dropped; a short-form record is allowed because it is traceable. Lead reading: "under 4,000" includes the 4,000 caps (Muse, Hermes, Grok), since those are the caps Brian set; OpenClaw and dot stay 3,600; paid instructions (5,000) is unchanged. The author lines are cut only from the capped artifact, never from AGENTS.md.

**B2. GPT mode.** Kept in the compiler, hidden from the picker, flagged deprecated: "Custom GPTs retire on Dec 11, 2026." ChatGPT radios: Dot (recommended), Project, Custom instructions. Its goldens are removed.

**B3. Taglines (closes S6).** Marty: Your terminally online memecoin desk. June: Runs the family calendar so you don't have to. Rook: Catches it before it ships. Vera: Never lets a draft go out hot. Sol: Explains it, then quizzes you. Dash: Tells you what every yes displaces. Pip: Remembers the thing you forgot. Ink: Won't smooth your voice out. Odds: Says what the crowd thinks, and whether it's wrong.

**B4. Promise lines (closes V13).** Meta Muse: "A personality to paste, then three things to say." OpenClaw: "A zip with SOUL.md, AGENTS.md and skills." Hermes Agent: "A zip with SOUL.md and skills, ready for a profile." Grok Bot: "A profile to paste, skills and routines to say, then a template link to share." ChatGPT: "Three things to say to your dot, plus rules to add in Settings." Mode notes: Project: "Instructions and files for a Project." Custom instructions: "Two blocks to paste into Settings."

**B5. Placeholders.** Content voice anchor: "Match the voice in my saved samples. If there are none, ask me for two posts before you draft anything." Devops interval: "Post status every 15 minutes during an incident, and once when it's over." (The devops skill's "[TODO: N]" becomes 15.)

**B6. Dots forbid (closes V14).** "Hand off to you." Certificate copy: "ChatGPT has no block setting; Hand off means it stops and gives the step to you."

**B7. Added gates (closes V21).** Keep all.

**B8. Doc corrections (closes V16, V17, V18).** Muse: the skills section is renamed "Standing instructions" and each is phrased "From now on, ..." OpenClaw: the memory sentence is spoken; no USER.md. Hermes: the -z note is replaced with: avoid --ignore-rules and --safe-mode.

**B9. Author content (V22).** Approved provisionally; Brian reads gates.json first during M3. Nothing blocked.

**B10. V23 and V26.** Lead recommendations stand.

## M3 UI lead calls (docs/UI-PLAN.md)

**U1. Risk joining a full stat budget.** The first Markets chip adds risk at 2 (library: "Risk ... defaults to 2"). If that passes the cap of 14, risk starts at 1, and if still over, the highest of funny, chatty and proactive drops by 1 (never blunt or warm below 1).

**U2. Preview before a base is chosen.** The preview strip needs a whole build; until the user picks a base it uses chaos defaults. The strip only shows from the world station on, after base, so this is a fallback.

**U3. Defaults for skipped or not-yet-reached choices.** Heart: hard part calmer (no forced badge) with its d1, d2 from blunt. Outfit: has_it_together. Name: a copy default until the name station. S9: a skipped station keeps these defaults and is listed as skipped.

**U4. "Muse" in UI copy.** Part E says UI copy says "your bot's personality". The spec's floor line ("every Muse comes with a little honesty and a little care already in.") becomes "every bot comes with ..." in the UI. Library text is unchanged.

**U5. UI strings the docs do not give (src/ui/copy.ts, for Brian to confirm).** Verbatim from the spec or brief: "Pick a starter", "Build your own", "full", "already built in", the five gates lines per target (Part E), the remix warning, and "Make this for <other target> instead". The floor line is the spec's with "bot" for "Muse" (U4). The station titles for base, world, stats, peeves, heart, outfit and name are the spec's station names. Everything else is plain wording the author wrote, listed here so Brian can swap it:
- App and buttons: appName "Build-a-Bot" (taken from the v2 brief's name), buttons.close "Close", Next, Back, Skip, Use, Remix.
- Screen titles not in the spec: target "Pick your bot", packs "What should it do?", limits "Set your limits", gates "What needs your yes?", roles "Roles", certificate "Your bot". The roster title reuses "Pick a starter".
- Every screen subtitle (all 14), for example target "Where will your bot live? You can switch later and keep your picks." and gates "For each action, choose whether your bot just does it, asks first, or never does it."
- defaultName "My bot" (U3), step(n, total) "Step n of total", level(n) "Level n of 4", riskHint "Risk shows up when you tap a Markets chip.", stat and group labels (capitalized ids), counter and name count "n/max".
- Target screen: required "Pick one to continue.", modeLegend "ChatGPT mode", planLegend "ChatGPT plan", plan labels "Free" and "Paid", and paidSteer "This many rules will not fit well on the free plan. The paid plan has room for all of them." (the B1 steer; Brian gave no wording).
- Heart: question "What is the hard part for you?", d1 "It wants this first", d1Alternate "Or, from your world", d2 "And this second", d3 "And this, always", d3Locked "every bot has this one." (the spec's "every Muse has this one." with "bot", same reading as U4).
- Gates: setting labels Auto, Approve and Forbid, hints "Does it on its own", "Asks you first" and "Never does it", locked "Locked", payLocked "Payments are always off."
- Roles: toggle "Advanced: split into roles" (the brief says only "advanced"), coordinator "Always on".
- Preview strip: open "Preview", close "Close", length "n/cap characters", badgeLit "Badge unlocked".
- Slice 3.4: the certificate placeholder headings Name, Personality, Memory sentence, Skills, Custom rules, Description, Conversation starters, Install steps, Notes and Warnings. The target screen's accessible group name reuses the screen title "Pick your bot".
- Slices 3.6 to 3.9: base.required "Pick one to continue."; world.pickUpTo "Pick up to 6" and world.counterLabel "3 of 6 chosen" (screen reader); packs.none "No packs picked. Your bot will still work without them." and packs.counterLabel "3 of 3 packs chosen" (screen reader); limits.none "Nothing to set for your picks.", limits.lower "Lower <label>" and limits.raise "Raise <label>" (stepper button names).
- Slices 3.10 to 3.13: gates.none "Nothing to approve for your picks.", gates.switchToPaid "Switch to Paid"; stats.budget "Points used", stats.counterLabel "n of 14 points used" (screen reader), stats.stops "Low, Medium, High, Max" (level names for the five stats the library names none for; risk uses its library labels), stats.sampleLabel "Sounds like", stats.badgesHeading "Badges", stats.noBadges "No badges yet. Moving the sliders can light them up.", stats.badgeNew "New badge" (screen reader); peeves.pickUpTo "Pick up to 5", peeves.counterLabel "n of 5 chosen" (screen reader), peeves.builtInNote "Every bot already has these, so they add no line." Heart adds none.
- Slices 3.14 to 3.17: name.countLabel "n of 24 characters" (screen reader), name.required "Give it a name to continue."; roles.toggleHint "Turn one bot into a small team, each with its own job.", roles.coordinatorIdle "Joins when you pick a role here", roles.off "Roles are off. You can turn them on at the bottom of the packs screen.", roles.none "None of your packs have a team yet."; preview.title "Your bot's personality" (Part E wording), preview.chassisLabel "every bot gets these." (the spec's "every Muse gets these." with bot, U4), preview.over "Over by n". The 3.4 stub strings (stub.fill, todo) are gone with the stubs.
- Remix warning: kept verbatim, so it still says "Muse". On a non-Muse target it reads wrong. Brian to pick wording, for example "...the file in your bot...".

**U6. Plan readings in the store and flow.** (a) setHardPart sets d2 from blunt (d2.blunt.N) even if the user had swapped d2, and clears touched.d2, so d2 follows blunt again until swapped; the plan text gives the d2 formula and says only setD2 marks d2 as swapped. (b) The kids nudge (proactive +1) does not set touched.proactive; only setStat does, as the plan says. Lead fix: the store remembers the nudge (nudged), and untapping kids takes it back while proactive is untouched, so tapping kids on and off never ratchets proactive up. A nudge the cap blocked is not applied later. setBase clears touched.proactive because it resets stats to the base defaults. (c) Next is blocked only on target, base (U2) and name. On heart and outfit with no pick, Next keeps the defaults of U3 and does not record the screen in skipped; only Skip does. (d) The plan says setStat "sets touched.proactive when stat is proactive". Reading picked: it means a move of proactive. A setStat to the level proactive already shows is a no-op (the store returns before it records anything), so it leaves touched.proactive false and a later kids tap still nudges proactive by 1. Pinned by a plain passing test in test/ui-store.test.ts. If a same-level tap should count as hand-setting proactive, move the same-level early return in setStat in src/ui/store.ts below the touched and nudged update, and flip that test.

**U7. App column has no pad-safe (slice 3.4).** The 3.4 spec line says the App column is `mx-auto max-w-[430px]` with the pad-safe utility. Picked: the column is `mx-auto min-h-dvh w-full max-w-[430px]` with no pad-safe. The Screen component (slice 3.3) already applies the 16px side gutters widened by the safe-area insets (GUTTER on its header, main and footer) plus the top and bottom insets, so pad-safe on the column as well would double them on a notched phone. The page still gets exactly one gutter and one set of insets, which is what docs/UI-PLAN.md asks for. Amended 3.4 reading: the column is the centering and width wrapper only, and the gutters and insets come from Screen. pad-safe stays defined in index.css for any screen that renders outside Screen.

**U8. Roster screen readings (slice 3.5).** The brief for 3.5 numbers this entry U7, but U7 was already taken by the slice 3.4 App column entry, so it is U8. (a) No remix warning on the roster: the spec's warning ("This rebuilds from your picks. Changes you made to the file in Muse won't carry over.") is for a link remix (?remix=1, M4), because that user has a file in Muse. A starter has no file in Muse yet, so Remix goes straight to base with the starter loaded. The remixWarning string stays in copy.ts for M4. (b) The screen title "Pick a starter" and the row's heading are the same words, so the row carries them as its accessible name (copy.buttons.pickStarter) and no second visible heading repeats them. copy.roster.startersLabel was unused and the lead removed it. (c) Card contents come from the library entry: name, stats and outfit from entry.build, buildName and tagline from the entry, badge names from a compile of the starter on the chosen target (compiledStarter), so badges can differ between targets. (d) Top-two stats tie-break in the order blunt, warm, funny, chatty, proactive, risk, and risk is skipped when the starter has none. (e) Use and Remix show the plain words "Use" and "Remix"; their accessible names add the starter's name ("Use Marty"). No new copy strings.

**U9. Screen readings, slices 3.6 to 3.9 (lead log).** (a) Base: tapping the base that is already selected does nothing, so a stray tap can't reset a remixed starter's stats to base defaults; tapping another base resets them (plan). (b) World: the n/6 counter is the screen's own sticky bar (ChipGrid's header is not sticky), and the risk hint sits under the Markets chips. Before a base is picked the group order follows chaos (U2). (c) Packs: cards use the shared Card toggle (aria-pressed), the same pattern as Chip, rather than role=checkbox. At 3, unselected cards dim but stay focusable and the store refuses the tap. No pack restricts profiles today, so every target sees all 12 packs; the hiding path is in place. (d) Limits: the unit sits under the label, values come from effective limits (pack default until set), and venue notes for the current profile follow the steppers.

**U10. Screen readings, slices 3.10 to 3.13 (lead log).** (a) Gates: the Part E lines start lowercase; the text stays verbatim and CSS capitalizes the first letter on screen. Every setting shows its hint, including dot's "Hand off to you" ("Never does it"), with the dot note beside it. The Paid steer shows on free custom instructions when the compiled personality is over the plan cap (B1), and "Switch to Paid" calls setPlan. (b) Stats: a slider's up moves stop where the total would pass 14, which matches what the store refuses; only the header says "full", not each slider. The badge strip is aria-live and the last badge to light is highlighted. (c) Peeves: "already built in" is shown for peeves that dedupe against a chassis line (they have no line of their own). options_not_answer dedupes only against the No Menu badge and keeps its line otherwise, so it gets no check. Lead fix: Chip's checked state is no longer inert, so the check and "already built in" sit on the chip itself (spec) and a tap still takes the peeve back. (d) Heart: tapping the selected hard part does nothing (it would reset the drives); d1 alternates show their chip; d3 is the drive resolve() picks for the preview build.

**U11. Screen readings, slices 3.14 to 3.17 (lead log).** (a) Outfit: no card shows as selected until a pick; Next keeps the U3 default. (b) Name: Enter submits when the name is valid; the form never posts. (c) Roles: the advanced switch sits at the bottom of the packs screen, shown on profiles that support roles when a picked pack has a team. Lead fix: it stays visible while on, so it can always be turned off even after the team packs are dropped. When packs span several role sets, only the live set's coordinator shows "Always on"; the others show "Joins when you pick a role here", and tapping a member switches sets. (d) Preview strip: shown on world through roles (spec stations 2 to 6 plus the v2 screens between them). Over the cap it shows "Over by n" and, on a narrow bar, drops the word Preview before shortening the badge name. The peek sheet lists the compiled personality with chassis lines muted under "every bot gets these."

**V29. Closeout fixes and notes (lead, 2026-10-02).** (1) Short-form chassis: a profile's own variant now wins over the generic short form when the profile has no short variant of its own (otherwise a dot soul received the file-target text "AGENTS.md rules outrank this file"). (2) B1 order kept through Tier B: author pack rules cut in Tier A stay cut when chassis goes short. (3) On Grok, cut author pack rules leave the bundle entirely, because Grok has no AGENTS.md (they are author lines, not Brian's). (4) Free custom instructions after the gate-only bottom block: Vera, Sol, Pip and Ink fit; Marty 2,157, June 2,437 and other gate-heavy builds stay over, so the UI steers them to Paid (B1) and the two cap tests stay marked it.fails. (5) Goldens: removing gpt leaves 55 specs (45 profile goldens, 6 chatgpt extras, 4 role goldens); the lead's earlier "61" was an arithmetic slip.

**V30. Grok sources and deliverable from one pack.** Odds on Grok (two packs: prediction-markets and spot) stayed at 4,142 against the 4,000 cap after every B1 tier, because Sources and What you return listed both packs' lines while the job line already came from the first pack only. Picked: Sources and What you return come from the first selected pack that has them, like the job line (one job, one source list, one deliverable). Odds on Grok is now 3,902. The second pack's skills, triggers and rules still ship.


## Decided by Brian (2026-10-03): M3 closeout and go for M4

**B11. UI wording (closes U5).** Approved as written, with one swap: the Paid steer reads "Packs with money or email gates fit better on Paid. Switch to Paid?" "What needs your yes?" stays.

**B12. Remix warning and paste box.** Generic warning: "This rebuilds from your picks. Changes you made inside <target label> won't carry over." The slot takes Brian's short names: Muse, OpenClaw, Hermes, Grok Bot, ChatGPT (copy.targetNames; the picker cards keep the library labels "Meta Muse" and "Hermes Agent"). Paste-box label: "Paste your current personality to keep your edits." (the spec's "soul" becomes "personality", per Part E).

**B13. U8, U10, U11 approved.** Starters skip the remix warning; link remixes show it. Gates lines capitalized on screen. Roles switch on the packs screen, kept visible while on.

**B14. Go for M4.** Scope as specced: certificate as bundle, per-target install steps, copy blocks with tap-to-copy and checkmarks, Custom Rules table for dot, Standing instructions section for Muse, zip download for file targets, share link, link-remix flow with the warning and paste-box diff, "Make this for <target> instead" switch. Two additions: (1) split the bundle, lazy-loading the library per target so the first paint isn't the whole JSON; (2) verify lines render on the certificate as a muted "Still checking" list, one line each.

**B15. Deferred.** The Grok "Setup Bot" URL endpoint (Part F's candidate hosted raw endpoint that compiles a profile from the share-link payload) moves to M5 or later. Logged, not built.

**B16. Loop.** Same loop as M3. Stop at the end of M4 with the same report shape plus the first three M5 slices.

## M4 lead calls (docs/M4-PLAN.md rev 2, after a three-lens plan critique)

Marked "for Brian" where the call changes product behavior or bends a rule; the rest are engineering readings.

**W1. Bundle split, design A.** The first paint is a small shell: the target cards and copy. The compiler, the library and the rest of the UI load in one lazy chunk, prefetched on idle and loaded at once when the URL holds a link. targets.json splits into the cards (targets.json) and the eight profiles (profiles.json). For Brian, "per target": the target-specific JSON is about 6.6 kB gzip, so per-profile chunks would cost an async store for little gain. Design A takes the whole library out of first paint. Done when `npm run check:bundle` passes: the entry chunk holds no library JSON and there is no 500 kB warning.

**W2. Structured bundle fields.** These fields carry ids: steps, noteItems, verify, undelivered, trimmed, the starter, description and build-name ids, docUrl and docReadDate. installSteps and notes stay as string arrays for goldens.

**W3. Step tags.** Install steps get `shows` (which artifacts render under the step), `when` (any-of skills, routines or roles: hide the step when the build delivers none of them) and `closer` (Muse "Then say hi."). The text is unchanged. `when` is allowed only on skill, routine and role steps, never on a step about rules, plugins, Actions or private data. The tag table is in docs/M4-PLAN.md section 2, and goldens gain a Steps section that pins the tags.

**W4. Verify cleanup (content, for Brian).**
- The six "verify:" clauses embedded in steps and notes become their own verify records. The OpenClaw step.6 clause is removed instead, because V17 settled it.
- The three safety-relevant notes keep a short inline caveat sentence: Grok reload, the GPT consequential flag, and the OpenClaw new session.
- Facts research settled (V15 to V18) move from "Still checking" to notes.
- Role-only verify lines get `when: roles`.
- The author also flags the Hermes step.6 and reload-note duplicate, and Muse verify.1 saying "Soul.md".
- Every edit is listed for Brian.

**W5. Header.** The certificate h1 is "Meet <Name>" (spec). The tagline shows only when the build's v1 core picks equal a roster starter's (B3 gave taglines for those nine only). The library's "tagline compiled from outfit + top chip" has no table, so custom builds show none rather than invented text. The radar has five axes without risk and six with it.

**W6. Copy blocks.**
- Every artifact gets a copy block: files, paste blocks, spoken items, the action text of each dot rule, starters, the description, and the Grok label.
- Muse step 3 is one "Standing instructions" group (B8): skills, then routines, three shown, then Show more.
- The Dot table stacks each rule as a card at 375px. Its caption is the Settings path, transcribed verbatim from the brief (new record profile.chatgpt-dot.rulesPath), and the B6 note is attached to it.

**W7. Links and the address bar (for Brian).** A link is read once on load, then cleared from the address bar with replaceState. There is no address-bar sync, no reload restore and no hashchange loader: writing the build into history, session restore and synced tabs without a tap is too close to storage. The link exists only when the user taps Copy link or Share. Share uses the native sheet ("Meet <Name>", with the build name as text) only where it exists, and Copy link is always there.

**W8. Bad links.**
- Unknown chips, peeves, packs and roles are dropped.
- An unknown base, outfit, hard part or drive falls back to the default.
- Risk and d1 are repaired, and the name is cleaned.
- Decode then runs the compiler's own validation. Anything still invalid shows a link error screen with Start over, never a crash or a developer string.
- Unknown ids are reported as a count and never echoed back into the page.
- This replaces the share tests that pinned throwing on unknown scalar ids.

**W9. loadBuild.** One atomic load with no `settle()`. It sets the target, mode and plan from the link, keeps the link's packs, gates, limits, roles and d2, and resets every remix and link field. Packs keep following chips only if they matched the chip-derived packs. Links carry no skipped list.

**W10. Target switch.**
- Short names (B12). GPT is never offered; a gpt certificate also offers ChatGPT, which resolves to dot.
- ChatGPT returns to the last ChatGPT mode and plan.
- The switch leaves the draft untouched. The store no longer prunes packs by profile.
- A pack a profile can't deliver keeps its gates, limits and rules in effect, drops its skills and triggers, and is named under "Not included". No pack restricts profiles today, so this is tested with a synthetic one.

**W11. Remix from the certificate.** The certificate's Remix snapshots the build as the diff baseline and opens the remix screen (warning plus paste box). The roster's Remix still skips it (B13). The remix screen is a side screen: Continue goes to base, and Back goes to the certificate.

**W12. Mine diff.** Matching is set-based on normalized lines, against the current compile and the baseline compile. The switch defaults off. The paste is capped at 20,000 characters and 50 Mine lines. Next to the switch: Mine lines are the user's own words and aren't checked against their approvals.

**W13. Zip.**
- A hand-rolled, stored zip with CRC32 and a fixed timestamp, so the bytes are deterministic. No dependency.
- It holds every file delivery at its bundle path (the same path the certificate shows). Each file also gets its own copy block.
- For Brian, OpenClaw: the role workspaces (workspace-<role>/) sit beside the main files, while step 1 puts the main files in ~/.openclaw/workspace. An option is to prefix entries with install-relative folders (workspace/...). Kept as bundle paths until Brian picks.

**W14. Undelivered.** Computed after the length fit, from what the paste field actually holds. On free custom instructions the fit drops the inline skills too, so this lists every skill that didn't survive plus every routine. The certificate names them under "Not included on <target>".

**W15. Skipped lines.** One muted "You skipped <name>." per skipped screen (S9).

**W16. Summary lines in user words.** auto, over, steer, trimmed, dropped, undelivered and deprecated. The raw compiler warnings sit behind Details.

**W17. Paid steer on the certificate.** It shows on free custom instructions builds over the cap, with Switch to Paid. The roster's Use skips the gates screen.

**W18. Computer hint: dropped.** Only Dot's desktop setup is sourced, and Dot's step 1 already says it.

**W19. Copy inside the tap.** The textarea copy runs synchronously first; the Clipboard API is the second try. There is no async fallback. When both fail, the block's text is selected. The lead checks iOS Safari in the Simulator; Android Chrome is for Brian.

**W20. Version.** migrateToLatest and decode take the target version as a parameter (lib.version). A synthetic v3 test shows v1 and v2 links still decode. M4 does not change the real LIBRARY_VERSION.

**W21. SKILL.md format.** Research the official OpenClaw and Hermes skill docs. If frontmatter is required, it goes into the profile's skill file template, so it traces. If the docs don't settle it, add a verify line with `when: skills`.

**W22. Grok Setup Bot endpoint (B15).** Not built. Note for M5: it would send the share payload to a server, which cuts against the reason the build lives in the hash (spec: "nothing hits a server log"). Brian's call.

**W23. Safety fix: auto on gates that don't offer it.** For publish, delete, write_query and force_push, the library says auto is "not offered, treat as approve", but the compiler applied any override. Delete=auto on ChatGPT dot compiled to the enforced Custom Rule "Take action without asking" (lead probe, 2026-10-03). The M3 Gates screen offered Auto on those rows.
- effectiveGates now clamps auto to approve for those gates.
- The store refuses it, and the Gates screen disables Auto there.
- A test covers every gate on every profile.
- The certificate's "auto" summary line names any gate left on auto.

**W24. Safety fix: names.** A link name with a newline added a free line to the soul (lead probe). Names are now cleaned everywhere: control characters and runs of whitespace become one space, and long dashes become "-". Validation rejects anything uncleaned.

**W25. Trimmed rules are shown.** On Muse, Hermes and Grok (cap 4,000), Tier A cuts the author's pack rules lines, and on Muse and Grok they leave the bundle entirely. Those lines extend the gates (for example, calendar counts as send). The certificate says how many rules from which pack were left out to fit. On Muse and Grok it also lists the cut lines under "Left out", so the user can add them by hand.

**W26. Link errors.** A link that can't be decoded or validated shows a link error view with Start over. The certificate never prints a raw "Invalid build" string.

**W27. Remix state lifecycle.** The pasted text, the Mine switch, the baseline and the link drops are cleared by every entry point: link load, starter, blank and reset. So a previous paste never rides into the next build.

**W28. Mine placement and its rule exceptions (for Brian).**
- The spec says Mine goes "at the end of the soul". It is placed before the act, rules and never sections instead, so Hard rules, Never and "If rules clash" stay after the user's lines. On top-and-bottom layouts it goes above the bottom rules block.
- Mine lines are the one tracing exception (user.mine.<n>). The spec's Mine section is user text by design.
- Long dashes in pasted lines become " - ", and the UI says so.
- Brian can revert any of these.

**W29. Grok first task (for Brian).** No Grok step names the first task, so its block sits under step 3 ("Say the memory sentence."). A clearer option is a new step line, "Give it its first task.", which Brian would have to approve as content.

**W30. Dot rules path.** profile.chatgpt-dot.rulesPath is "Settings > Personalization > Permissions > Custom rules", verbatim from brief Part C. It is the caption of the Custom Rules table, because step 2 says only "below".

**W31. SKILL.md frontmatter (research 2026-10-03; lead checked the OpenClaw loader source).** OpenClaw skips any skill without frontmatter `name` and `description`: the loader returns null with "description is required". So every OpenClaw skill file we shipped would have been silently skipped. Hermes loads files without frontmatter, but its validator and docs require both fields. Both runtimes follow the agentskills.io format.
- **Fix in 4.5b:** the openclaw and hermes skill file templates gain `name: {dir}` and `description: "{description}"`. The description is the skill's whenToUse (pack skills) or detail (chip skills), on one line, escaped. A new skill.chipFile template replaces the hard-coded chip skill text.
- **Directory names:** skill folders use hyphens, not underscores (underscores are off-spec for OpenClaw).
- **Goldens:** every OpenClaw and Hermes skill file and path changes.
- **Logged for Brian, not fixed in M4:** OpenClaw role agents in other workspaces don't see the main workspace's skills (docs). They need a copy, or the skills go in ~/.openclaw/skills.
- **Not added:** a note that Hermes cuts skill descriptions to 57 characters in its skill list.
- **Sources:** docs.openclaw.ai/tools/skills, docs.openclaw.ai/tools/creating-skills, agentskills.io/specification, hermes-agent.nousresearch.com/docs/user-guide/features/skills (all read 2026-10-03).

**W32. Verify cleanup approvals (lead, pending Brian).** The author's 4.5a proposal is approved as follows.
- **Edits 1 to 11:** the six clauses move out.
  - The OpenClaw clause is removed, because V17 settled it.
  - Hermes, Grok, GPT and Project gain verify records.
  - The GPT flag record keeps the author's context words: "verify: the exact name of the consequential flag, x-openai-isConsequential, before you rely on it."
- **Caveats (edits 4, 10, 12):** "A routine that is already running may not pick up a profile edit." (Grok reload); "Check the exact flag name before you rely on it." (GPT Actions note); new OpenClaw reload note: "Start a new session to load changes to SOUL.md and AGENTS.md. They may not apply on the next turn."
- **Settled facts become notes with dated citations (edits 13 to 17):** muse.verify.1 and .2, openclaw.verify.1, hermes.verify.1, and gpt.verify.1. For gpt.verify.1, the creation-off half goes to the deprecated summary, and the retirement date stays on the card.
- **The author's open questions:**
  - Q1: routine-only verify lines get `when: ['routines']`.
  - Q2: V19 and V20 lines stay verify.
  - Q3: on verify lines, `when: roles` means the build picked roles (not that the profile delivers them), so dot's teams line still shows on dot. That line drops the code word: "verify: when teams of dots arrive."
  - Q4: keep the plan-Tasks records separate.
- **Hermes duplicate (d1):** step.6 folds into the reload note, which gains "; they skip SOUL.md", and step.6 is removed.
- **Muse wording (d2):** the Muse note reads "Meta has not published the default Soul text (Meta help, 2026-10-01); these opening lines come from Build-a-Bot."
- **For Brian:** every wording above, especially the three caveats and the two notes reworded for users.

**W33. Role fallback note becomes the role step (lead fix after the wave 2 safety review).** On Grok, Project and GPT, role descriptions and instructions carry their own gate blocks, but no install step showed them; only a note said what to do. When role files ship and no step shows roles, the role fallback note (same library id and text) becomes the last non-closer step, and leaves Notes. A missing template's [TODO] placeholder stays a note. Safety PASS on the full wave 2 golden set afterwards.

**W34. Trimmed pack rules: where they went.** On Hermes, the author pack rules cut from SOUL.md to fit are still in AGENTS.md, so the certificate says "To fit Hermes, 5 rules from Personal ops are in AGENTS.md, not in SOUL.md." On Muse and Grok they leave the bundle, so it says "... were left out." and lists the lines under Left out. This is a reading of W25 for Brian.

**W35. Roles and packs in the store.** settle() drops roles only when a change takes away the packs their role set fitted. Roles that a link carried without fitting packs stay. The compiler accepts them; the Sol project roles golden is one. Before this fix, any edit after opening such a link silently dropped the team.

**W36. Remix from the certificate and the Mine trace.** The certificate's Remix sets from 'link-remix', so Back on base returns to the remix screen. It also clears any old paste. The W28 trace carve-out applies only to the main personality artifact (a file, the soul or Dot's spoken personality). A user.mine id anywhere else still fails the trace.

**W37. Content question for Brian (found on the certificate, 2026-10-03).** The risk 4 stat line is "Same as 3, plus: the only two words you say against a trade are "chasing" and "rug."" (library doc, stats table, verbatim). The soul carries only one risk line per build, so a risk-4 bot reads "Same as 3" with no level 3 line to refer to. Marty and Odds show it. Suggested fix, for Brian: write the risk 4 line out in full. Not changed: it's library content.

**W38. Wave 3 lead fixes.**
- 4.5b renamed the GPT creation-off record (verify.1 becomes note.1), so the certificate model now looks it up by its new id. The deprecated summary shows the fact once again.
- The shared Screen h1 wraps anywhere, so a 24-character name with no spaces never clips at 375px.
- 4.5b also tagged gpt.verify.3 ("scheduled tasks by plan") as routine-only. Lead accepted this as a W32 Q1 reading.
- Hyphenated skill folders apply only on OpenClaw and Hermes. Project and GPT file names keep their record ids.

**W39. Back out of a certificate Remix (accepted lead fix, wave 4).** The certificate's Remix saves the old `from` in `fromBeforeRemix` before setting 'link-remix' (W11, W36). Back on the remix screen puts it back. So a link certificate stays without a Back button, and a roster Use certificate's Back still returns to the roster. A ?remix=1 link has nothing saved, so Back keeps 'link-remix'. Every entry point clears the field (W27). The 4.13 engineer made this change outside its file list; the lead read it, accepted it, and had store-level tests added (test/ui-store-remix.test.ts).
