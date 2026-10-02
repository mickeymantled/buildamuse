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
