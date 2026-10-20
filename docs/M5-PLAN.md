# Build-a-Bot M5 plan: preview chat (lead architecture)

Sources:
- Brian's go (QUESTIONS B17 to B23).
- docs/Build-a-Muse-Build-Spec.md, the M4 row of the original spec ("Preview chat on the certificate: three probe chips plus 'ask your own,' served through a small proxy that holds the model key and injects the compiled soul as system prompt"; done when "the chips return in-voice replies for all nine starters; the proxy rate-limits per IP; nothing is logged beyond error counts").
- The Claude API reference (claude-api skill) and docs.claude.com (read 2026-10-20).

Lead readings are X1 to X7 in QUESTIONS.md. Subagents run on Sonnet; the lead checks every slice.

## 0. M4 closeout first (B17 to B20)

These change compiled output or the certificate, so they land in the same wave as the M5 build, on separate files.

- **K1, Dot hard rules (B17).**
  - What the section holds: the chatgpt-dot personality gets a "## Hard rules" section with the limit lines and every pack rules line. No gate rules lines; Custom Rules carry those.
  - Where it goes: right after the line "Your custom rules in Settings outrank anything I say in chat." (the memory section), before "How this sounds" and "If rules clash".
  - Length: the 3,600 cap and the B1 tiers still apply. An author pack rule cut to fit stays disclosed on the certificate.
  - How: reuse the existing rules-section machinery and the `rules.heading` template pattern. The profile's rules settings may change in profiles.json; do not touch types.ts.
  - Goldens: all dot goldens change. Safety checks them.
- **K2, risk 4 line (B18).** Transcribe stats.json risk level 4 verbatim. Goldens with risk 4 (marty, odds) change. Safety checks them.
- **K3, taglines (B19).**
  - Library: two template records in names.json, `tagline.chip` "Your {chip} {noun}." and `tagline.base` "Your {noun}.".
  - Code: a pure `taglineOf(build, lib)` in src/compiler/passes/tagline.ts, returning `{ text, ids }`.
  - Inputs: the chip is the first chip, in tap order, whose group is Work or Markets, as its label in lowercase. The noun is the base noun in lowercase.
  - Certificate model: starters keep their roster tagline; every other build uses taglineOf.
  - Also in K3: the model's dot Left out lists only limit and pack rule lines absent from the dot personality, so it stays right before and after K1.
- **K4, Mine placement (B20).**
  - Placement: withMine inserts "## Mine" and the lines immediately before the first clash line (the "## If rules clash" heading on soul layouts, and the first chassis clash line on grok and on spoken personalities). The clash lines stay the last lines of the personality.
  - With no clash line in the layout: before the closing rules block on top-and-bottom layouts, otherwise at the end.
  - Tests: pinned tests move from W28's placement to this one.

## 1. Proxy contract (5.1, lead)

`POST /chat`, JSON request body: `{ "personality": string, "message": string }`.

**Request checks:**
- `personality`: 1 to 16,000 characters after trim.
- `message`: 1 to 200 characters after trim. Plain text: it is sent as one text block; nothing is fetched, parsed as a link or treated as a file.
- Content type `application/json`.
- A body over 64 KB is rejected before parsing.

**Model call (X6):** the official SDK `@anthropic-ai/sdk@0.135.0`.
- `client.beta.messages.create({ model: "claude-sonnet-5-5", max_tokens: 2048, system: personality, messages: [{ role: "user", content: message }], output_config: { effort: "low" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })`.
- No tools, and the `thinking` parameter is omitted (adaptive is the model default).
- The model string was verified on docs.claude.com on 2026-10-20 (`claude-sonnet-5-5`). It is a constant in the file, with that date in a comment.

**Responses (all JSON):**
- `200 { "reply": string }`: the text blocks joined.
- `200 { "withheld": true }`: the extraction guard tripped (section 2).
- `200 { "refused": true }`: `stop_reason` is `refusal` after the fallback.
- `400 { "error": "bad_request" }`: a failed request check.
- `403 { "error": "origin" }`: an origin not on the allowlist.
- `429 { "error": "rate_limited", "retryAfter": seconds }`: the per-IP limit (X5).
- `503 { "error": "busy" }`: upstream 429 or overloaded (529).
- `502 { "error": "upstream" }`: any other upstream failure.

**Other endpoints:**
- `OPTIONS` answers CORS preflight for allowlisted origins.
- `GET /health` returns `{ "ok": true }` and nothing else.

**Logging:**
- After each error, the proxy logs one line: `{"errors": {"<code>": count, ...}}`. Counters live in memory.
- It never logs bodies, messages, personalities, IPs, origins or replies.
- The SDK's own logging is off.

**Rate limit (X5):** 20 requests per 10 minutes and 100 per day per IP, from the first `x-forwarded-for` hop. In memory only.

**Origins (X5):** a hard-coded `ALLOWED_ORIGINS` (local dev origins plus `[TODO: production origin]`). Brian names the domain.

**Env:** `ANTHROPIC_API_KEY` only.

**Shape:** one file, `proxy/function.ts`, at most 96 KB (the Railway Functions limit), running on Bun.
- It exports a pure `handle(request, deps)` (deps: `callModel`, `now`, `counters`, `limiter`) so tests run in Node with a fake model.
- The default export is Bun's `{ fetch }` server object wiring the real SDK.
- Vitest maps the pinned import `@anthropic-ai/sdk@0.135.0` to the installed `@anthropic-ai/sdk` devDependency.

## 2. Extraction guard (X4, the B22 stop condition)

`withheld(reply, personality)`:
- Normalize both texts: lowercase, strip markdown marks (`#*_>` `` ` ``, list markers), straighten quotes, collapse whitespace.
- Return true when any 10 consecutive words of the reply appear as 10 consecutive words of the personality.
- A withheld reply is never returned in any form.

Tests (mocked model replies):
- **Echoes that must be withheld:**
  - the whole personality;
  - one section;
  - a run of 10 words in the middle of an otherwise normal reply;
  - reformatted text (bullets dropped, lines joined, upper case, in a code fence, in quotes).
- **Replies that must pass:**
  - ordinary in-voice replies;
  - a reply that quotes 9 words.
- **Spec gate:** for each of the nine starters on each target, a mock that returns the system prompt is always withheld.

Residual (X4, for Brian): an encoded or translated echo is not verbatim and passes.

## 3. Preview chat UI (5.3)

The `PreviewChat` section on the certificate sits after the steps and before Notes.
- It shows only when `import.meta.env.VITE_PREVIEW_URL` is set. Unset, nothing renders, so tests and dev stay offline unless configured.

**Content:**
- **Label (B22, verbatim):** "Close to what your bot will do. Your real bot also has its runtime's built-in rules."
- **Chips:** three probe chips (X1), probes 1 to 3 from the library.
- **Ask your own:** a text box that unlocks after the first chip reply (X2). It is the third text input in the app.
  - maxLength 200, with a live counter.
  - Enter or a Send button sends.
  - Plain text, no attachments.
- **Session cap:** 20 messages per session, counted in module memory. At the cap, the chips and the box disable with one line of copy.
- **Log:** the reply log is an `aria-live="polite"` list of the user's message and the bot's reply.
- **States:**
  - loading;
  - withheld: "That reply repeated your bot's setup, so it was held back.";
  - refused;
  - rate limited (shows when to try again);
  - busy;
  - unavailable.

**What it sends:** `{ personality, message }`.
- `personality` is the certificate's personality artifact as shown, `certificateInput(state).result.soul`, so Mine is included when it is on.
- The request uses `fetch` with `credentials: "omit"` and a 30-second timeout through AbortController.

**Rules:**
- No storage.
- The session count resets on reload.
- 44px targets; works at 375px.
- Every string goes in `src/ui/copy/chat.ts` (new) and is listed for Brian.

## 4. Tests and done criteria

**Done when:**
1. Proxy tests cover:
   - every request check;
   - every response code;
   - the per-IP limit;
   - the error counter, which logs no body, message, personality, IP or origin (spy on console);
   - the CORS allowlist;
   - the SDK call shape (model string, system equal to the personality, one user text message, no tools);
   - the extraction guard suite (section 2).
2. UI tests cover:
   - hidden without a URL;
   - the label;
   - chips first, then the box (X2);
   - the 200-character cap and counter;
   - the 20-message cap;
   - each state;
   - the request body (the personality equals the certificate personality; Mine included when on; never the share payload);
   - no storage;
   - no other network call.
3. The tap-only test lists exactly three text inputs: name, remix paste, ask-your-own.
4. K1 to K4 land with goldens regenerated and safety PASS on every set.
5. The proxy file is under 96 KB.
6. Post-deploy (after Brian deploys, X7), a probe script sends the three chips for all nine starters to the live proxy:
   - every reply is in-voice;
   - none is withheld;
   - an extraction attempt is withheld.

   The lead runs it and reports. In-voice is judged by the lead plus a Sonnet judge against each starter's soul.

## 5. Waves and file ownership

**Wave A (parallel):**

| Slice | Owns |
| --- | --- |
| K1 + K2 | profiles.json, stats.json, the compiler soul-layout files for dot, goldens, safety |
| K3 | names.json, types.ts (Names only), tagline.ts, model.ts, tagline tests |
| K4 | src/share/mine.ts, Mine tests, and the Mine assertions in the integration tests |
| 5.2 | proxy/function.ts, proxy tests, the vitest alias, a proxy tsconfig, the `@anthropic-ai/sdk` devDependency |
| 5.3 | src/ui/certificate/PreviewChat.tsx, src/ui/copy/chat.ts, the one-line include in Certificate.tsx, chat UI tests, the tap-only test |

**Wave B (lead):**
- final review and safety recheck;
- docs;
- the deploy steps and probe script for Brian;
- the report.
