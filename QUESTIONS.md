# Questions and readings

Each entry: what's ambiguous, the readings, the one picked. "Decided by Brian" means settled; everything else is a lead call that Brian can overturn.

## Decided by Brian

**Q1. Worked compiles vs tables.** The June and Rook souls in "Two worked compiles" drifted from the tables (shortened chassis lines, "No corporate speak." cut short, merged voice lines, different Instincts order, Rook's d1 wording, Rook's greeting). Picked: tables win. June and Rook goldens are regenerated from the compiler and checked line by line against the tables. Instincts order follows spec pass 3.

**Q2. Naming rule.** Risk earns a word at 1 (Risk-Off), 3 (Risk-On), 4 (Degen); level 2 is silent. Tiebreak order unchanged: blunt, warm, funny, proactive, chatty, risk. Marty = "Blunt Degen Trench Companion", Odds = "Blunt Risk-On Trench Companion". The phrase "dropping Word2 if it equals Word1's tier" is ignored: no two stats share a word, so it can never fire.

**Q3. Seed formula.** The spec's pass 9 formula wins: the tail is always " when you need them." even for one noun. (The library's June example says "when you need it".)

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
