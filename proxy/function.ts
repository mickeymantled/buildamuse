// Preview chat proxy (docs/M5-PLAN.md sections 1 and 2). One Railway function, runs on Bun.
// It receives a compiled personality, the session's earlier turns and one user message, sends the
// personality as the system prompt, and returns the reply. It compiles nothing, stores nothing, and
// logs only error counts.
// Env: ANTHROPIC_API_KEY (nothing else).
import Anthropic from "@anthropic-ai/sdk@0.135.0";

// Verified on docs.claude.com on 2026-10-20.
export const MODEL = "claude-sonnet-5-5";
export const MAX_TOKENS = 2048;
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
// Under the page's own 30 second timeout, so the page sees our 502 and not an abort.
const UPSTREAM_TIMEOUT_MS = 25_000;

// The B22 rule allows one env var (the key), so the origin list is hard-coded. Brian names the domain.
export const ALLOWED_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "[TODO: production origin]",
];
// The placeholder must never match a request header.
const ORIGIN_SET = new Set(ALLOWED_ORIGINS.filter((o) => !o.startsWith("[TODO")));

export const MAX_BODY_BYTES = 128 * 1024;
export const MAX_PERSONALITY = 16_000;
export const MAX_MESSAGE = 200;
// The page holds the session (20 messages) and sends the earlier ones with each request (QUESTIONS X3):
// 19 earlier exchanges, the 20th message being the current one.
export const MAX_HISTORY_TURNS = 38;
export const MAX_REPLY_TURN = 4_000;
export const MAX_HISTORY_CHARS = 16_000;
export const WINDOW_MS = 10 * 60_000;
export const PER_WINDOW = 20;
export const DAY_MS = 24 * 60 * 60_000;
export const PER_DAY = 100;
// A ceiling on spend across every caller, in memory, reset on redeploy (QUESTIONS X8). Past it the proxy
// answers busy until the oldest request of the last 24 hours ages out.
export const GLOBAL_PER_DAY = 3000;
const MAX_TRACKED_IPS = 10_000;
const SWEEP_AT = 1_000;
// A reply sharing this many consecutive words with the personality is withheld.
export const RUN_WORDS = 10;
// A reply is also withheld when it holds at least this share of the personality's words in order
// (and at least COVER_FLOOR words). In-voice replies measure under a quarter; the leaks that slip past
// the verbatim run (filler after every few words, every second word dropped) measure one half or more.
export const COVER_SHARE = 0.5;
export const COVER_FLOOR = 50;

export type ErrorCode = "bad_request" | "origin" | "rate_limited" | "busy" | "upstream";
export type Counters = Partial<Record<ErrorCode, number>>;

export type Turn = { role: "user" | "assistant"; content: string };
export type ModelResult = { refused: true } | { refused: false; text: string };
// turns is the history followed by the current user message.
export type CallModel = (personality: string, turns: readonly Turn[]) => Promise<ModelResult>;

export type Verdict = { ok: true } | { ok: false; retryAfter: number };
export interface Limiter {
  // Counts one request against the all-callers daily ceiling; false when the ceiling is reached.
  takeGlobal(now: number): boolean;
  take(ip: string, now: number): Verdict;
}

export interface Deps {
  callModel: CallModel;
  now: () => number;
  limiter: Limiter;
  counters: Counters;
  log: (line: string) => void;
}

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Created = Pick<Anthropic.Beta.Messages.BetaMessage, "content" | "stop_reason">;
// The slice of the SDK client the proxy uses, so tests can pass a fake and read the call shape.
export interface ModelClient {
  beta: { messages: { create(params: CreateParams): PromiseLike<Created> } };
}

export function makeCallModel(client: ModelClient): CallModel {
  return async (personality, turns) => {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: personality,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
      output_config: { effort: "low" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    // Branch on stop_reason before reading content. A partial reply is discarded.
    if (res.stop_reason === "refusal") return { refused: true };
    let text = "";
    for (const block of res.content) {
      if (block.type === "text") text += block.text;
    }
    return { refused: false, text };
  };
}

// Per-IP sliding windows, in memory, reset on redeploy.
export function createLimiter(): Limiter {
  const hits = new Map<string, number[]>();
  let global: number[] = [];
  const sweep = (now: number) => {
    for (const [ip, list] of hits) {
      if (list.length === 0 || list[list.length - 1]! <= now - DAY_MS) hits.delete(ip);
    }
  };
  return {
    take(ip, now) {
      const day = (hits.get(ip) ?? []).filter((t) => t > now - DAY_MS);
      const recent = day.filter((t) => t > now - WINDOW_MS);
      const waits: number[] = [];
      if (recent.length >= PER_WINDOW) waits.push(recent[recent.length - PER_WINDOW]! + WINDOW_MS - now);
      if (day.length >= PER_DAY) waits.push(day[day.length - PER_DAY]! + DAY_MS - now);
      if (waits.length > 0) {
        hits.set(ip, day);
        return { ok: false, retryAfter: Math.max(1, Math.ceil(Math.max(...waits) / 1000)) };
      }
      if (!hits.has(ip)) {
        if (hits.size >= SWEEP_AT) sweep(now);
        if (hits.size >= MAX_TRACKED_IPS) hits.delete(hits.keys().next().value!);
      }
      day.push(now);
      hits.set(ip, day);
      return { ok: true };
    },
    takeGlobal(now) {
      global = global.filter((t) => t > now - DAY_MS);
      if (global.length >= GLOBAL_PER_DAY) return false;
      global.push(now);
      return true;
    },
  };
}

// Extraction guard (X4). Lowercase, straighten quotes, drop quote and list markers and markdown marks.
const chars = (...codes: number[]) => String.fromCharCode(...codes);
const SINGLE_QUOTES = new RegExp(`[${chars(0x2018, 0x2019, 0x201a, 0x201b, 0x2032)}]`, "g");
const DOUBLE_QUOTES = new RegExp(`[${chars(0x201c, 0x201d, 0x201e, 0x201f, 0x2033)}]`, "g");
const LINE_BREAKS = new RegExp(`\\r\\n|[\\r\\n${chars(0x2028, 0x2029)}]`);
const LIST_MARKER = new RegExp(`^(?:[-+*${chars(0x2022)}]|\\d+[.)])\\s+`);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .split(LINE_BREAKS)
    .map((line) => line.replace(/^\s*(?:>\s*)*/, "").replace(LIST_MARKER, ""))
    .join(" ")
    .replace(/[#*_>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Punctuation is not a word, so a quote mark or a full stop cannot break a run.
function words(text: string): string[] {
  return normalize(text).match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
}

// Length of the longest run of personality words that the reply also holds in the same order, with
// any other words allowed between them. A filler word after every few words leaves this untouched.
function sharedInOrder(ref: string[], out: string[]): number {
  const ids = new Map<string, number>();
  const id = (w: string) => {
    let n = ids.get(w);
    if (n === undefined) ids.set(w, (n = ids.size));
    return n;
  };
  const a = ref.map(id);
  const b = out.map(id);
  let prev = new Int32Array(b.length + 1);
  let cur = new Int32Array(b.length + 1);
  for (let i = 0; i < a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

export function withheld(reply: string, personality: string): boolean {
  const ref = words(personality);
  const out = words(reply);
  if (ref.length < RUN_WORDS || out.length < RUN_WORDS) return false;
  const seen = new Set<string>();
  for (let i = 0; i + RUN_WORDS <= ref.length; i++) seen.add(ref.slice(i, i + RUN_WORDS).join(" "));
  for (let i = 0; i + RUN_WORDS <= out.length; i++) {
    if (seen.has(out.slice(i, i + RUN_WORDS).join(" "))) return true;
  }
  // Coverage: a reply that carries a large share of the personality in order is the personality, even
  // when filler words or dropped words keep every verbatim run under RUN_WORDS.
  const need = Math.max(COVER_FLOOR, Math.ceil(COVER_SHARE * ref.length));
  return out.length >= need && sharedInOrder(ref, out) >= need;
}

// Input screen (QUESTIONS X4). A keyword match on a normalized copy of the text, not a classifier: a
// paraphrased ask, an ask in a language or spelling it does not list, or an encoded ask still reaches the
// model, and the output guard (withheld) is the backstop.
const OWN = "(?:your|ur|yr|(?:the|this) bots?)";
const ADJ = "(?:(?:own|hidden|secret|original|initial|hard|custom|exact|full|real|internal|core|current) ){0,3}";
const RULE_NOUN = "(?:rules?|instructions?|guidelines?|directives?|prompts?)";
// "your setup on this coin" is a trader's question, so on or for plus a word other than me or us passes.
const SETUP_NOUN = "set ?up(?! (?:on|for) (?!(?:me|us)\\b)\\w)";
const SETUP_ASKS: readonly RegExp[] = [
  /\b(?:system ?prompt|sys ?prompt|system (?:message|instructions?|rules|text))\b/,
  /\bdeveloper (?:message|prompt|instructions?)\b/,
  new RegExp(
    `\\b${OWN} ${ADJ}(?:instructions?|rules|prompts?|guidelines?|directives?|configs?|configuration|programming|personality (?:file|text|prompt)|persona prompt|${SETUP_NOUN})\\b`,
  ),
  /\bsoulfile\b/,
  new RegExp(`\\b${RULE_NOUN} you (?:were|have been|got|have|follow|received)\\b`),
  new RegExp(`\\b${RULE_NOUN} (?:do|did|must|should|have|are|were) you (?:follow|have|get|got|use|run|obey|been given|given|receive|received)\\b`),
  /\bwhat (?:were|are|was) you (?:told|given)\b/,
  /\bwhat you (?:were|are|have been) (?:told|given)\b/,
  /\bhow (?:were|are|was) you (?:set up|configured|programmed|instructed|prompted)\b/,
  // "message" is left out of these two: "your previous message" is ordinary in a multi-turn chat. So are
  // a game's "first rules" and a trader's "initial setup", so the loose ordinals take only the high-signal nouns.
  /\b(?:text|words|everything|anything|lines|content|instructions) (?:above(?! \d)|before this|preceding|at the top)\b/,
  // "my previous prompt" is the person's own earlier message.
  /\b(?<!\bmy )(?:previous|prior|earlier|initial|original|first|starting) (?:instructions?|prompt|directives)\b/,
  /\b(?:above|preceding|hidden|secret) (?:instructions?|prompt|rules|directives|guidelines)\b/,
  /\b(?:above|preceding|hidden|secret|initial|starting) text\b/,
  /\b(?:hidden|secret) setup\b/,
  // "ignore my previous message" is a correction, not an attack.
  /\bignore (?:(?:all|any|the|your|my) )?(?:previous|prior|above|earlier|preceding|former)\b(?! (?:messages?|msgs?|ones?|questions?|repl(?:y|ies)|answers?|texts?|comments?|posts?|emails?)\b)/,
  // A small non-English set.
  /\b(?:tus|tes|vos|deine[nmrs]?|ihre[nmrs]?|tuoi|tue|suas|seus) (?:instrucciones|instructions|consignes|regles|reglas|regeln|anweisungen|istruzioni|regole|instrucoes|regras)\b/,
  /\bprompt (?:del|du|de|di) (?:sistema|systeme)\b/,
  /\bmensaje del sistema\b/,
];

// Lowercase, strip accents, drop apostrophes, fold SOUL.md and "soul file" to one token (before the dot
// goes), then reduce everything outside a-z and 0-9 to single spaces.
function screenForm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(SINGLE_QUOTES, "")
    .replace(/'/g, "")
    .replace(/\bsoul(?:\s*\.?\s*md|\s+file)\b/g, " soulfile ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function asksForSetup(text: string): boolean {
  const form = screenForm(text);
  return SETUP_ASKS.some((re) => re.test(form));
}

function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin !== null && ORIGIN_SET.has(origin) ? { "access-control-allow-origin": origin } : {};
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      vary: "Origin",
      ...headers,
    },
  });
}

// Counters only. The log line never carries a body, message, personality, IP, origin, reply or error text.
function fail(
  deps: Deps,
  status: number,
  code: ErrorCode,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
): Response {
  deps.counters[code] = (deps.counters[code] ?? 0) + 1;
  deps.log(JSON.stringify({ errors: deps.counters }));
  return json(status, { error: code, ...extra }, headers);
}

// Railway's edge sets X-Real-IP to the client's remote IP (docs.railway.com, Public Networking specs,
// read 2026-10-20). X-Forwarded-For is never read: its first hop is whatever the client sent.
function clientIp(request: Request): string {
  return (request.headers.get("x-real-ip") ?? "").trim().slice(0, 64) || "unknown";
}

async function readCapped(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

// Earlier turns alternate user, assistant, starting with the user. Only role and content are passed on.
function parseHistory(value: unknown): Turn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length % 2 !== 0 || value.length > MAX_HISTORY_TURNS) return null;
  const turns: Turn[] = [];
  let chars = 0;
  for (let i = 0; i < value.length; i++) {
    const entry: unknown = value[i];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const { role, content } = entry as Record<string, unknown>;
    const want = i % 2 === 0 ? "user" : "assistant";
    if (role !== want || typeof content !== "string") return null;
    const n = content.trim().length;
    if (n < 1 || n > (want === "user" ? MAX_MESSAGE : MAX_REPLY_TURN)) return null;
    chars += content.length;
    turns.push({ role: want, content });
  }
  return chars > MAX_HISTORY_CHARS ? null : turns;
}

// Lengths are checked after trim. The values themselves go through unchanged.
function parseInput(raw: string): { personality: string; message: string; history: Turn[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { personality, message, history } = data as Record<string, unknown>;
  if (typeof personality !== "string" || typeof message !== "string") return null;
  const p = personality.trim().length;
  const m = message.trim().length;
  if (p < 1 || p > MAX_PERSONALITY || m < 1 || m > MAX_MESSAGE) return null;
  const turns = parseHistory(history);
  if (turns === null) return null;
  return { personality, message, history: turns };
}

function upstreamCode(err: unknown): "busy" | "upstream" {
  if (err instanceof Anthropic.RateLimitError) return "busy";
  const status = typeof err === "object" && err !== null ? (err as { status?: unknown }).status : undefined;
  return status === 429 || status === 529 ? "busy" : "upstream";
}

async function route(request: Request, deps: Deps): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/health") {
    return request.method === "GET" ? json(200, { ok: true }) : json(405, { error: "method_not_allowed" });
  }
  if (path !== "/chat") return json(404, { error: "not_found" });

  const cors = corsFor(request);
  const allowed = "access-control-allow-origin" in cors;
  if (request.method === "OPTIONS") {
    if (!allowed) return fail(deps, 403, "origin", {});
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        vary: "Origin",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
      },
    });
  }
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  // A missing Origin is not on the allowlist either.
  if (!allowed) return fail(deps, 403, "origin", {});

  const verdict = deps.limiter.take(clientIp(request), deps.now());
  if (!verdict.ok) {
    return fail(deps, 429, "rate_limited", { ...cors, "retry-after": String(verdict.retryAfter) }, { retryAfter: verdict.retryAfter });
  }
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") return fail(deps, 400, "bad_request", cors);
  const raw = await readCapped(request);
  const input = raw === null ? null : parseInput(raw);
  if (input === null) return fail(deps, 400, "bad_request", cors);
  // A screened ask costs no slot, no model call and no counter (X4). The per-IP take above still counted it.
  if (asksForSetup(input.message) || input.history.some((t) => t.role === "user" && asksForSetup(t.content))) {
    return json(200, { withheld: true }, cors);
  }
  // Only a valid request spends a slot of the all-callers ceiling, so junk bodies can't exhaust it (X8).
  if (!deps.limiter.takeGlobal(deps.now())) return fail(deps, 503, "busy", cors);

  let result: ModelResult;
  try {
    result = await deps.callModel(input.personality, [...input.history, { role: "user", content: input.message }]);
  } catch (err) {
    const code = upstreamCode(err);
    return fail(deps, code === "busy" ? 503 : 502, code, cors);
  }
  if (result.refused) return json(200, { refused: true }, cors);
  // Nothing usable came back (for example the token budget went to thinking).
  if (result.text.trim() === "") return fail(deps, 502, "upstream", cors);
  if (withheld(result.text, input.personality)) return json(200, { withheld: true }, cors);
  return json(200, { reply: result.text }, cors);
}

export async function handle(request: Request, deps: Deps): Promise<Response> {
  try {
    return await route(request, deps);
  } catch {
    // Never let a thrown error (whose text could carry request content) reach the runtime's logger.
    return fail(deps, 502, "upstream", corsFor(request));
  }
}

// The real wiring. The client is built on first use so importing this file needs no key.
let live: CallModel | undefined;
const callLive: CallModel = (personality, turns) => {
  live ??= makeCallModel(
    new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      logLevel: "off",
      maxRetries: 0,
      timeout: UPSTREAM_TIMEOUT_MS,
    }),
  );
  return live(personality, turns);
};

const liveDeps: Deps = {
  callModel: callLive,
  now: () => Date.now(),
  limiter: createLimiter(),
  counters: {},
  log: (line) => console.error(line),
};

export default {
  fetch: (request: Request): Promise<Response> => handle(request, liveDeps),
};
