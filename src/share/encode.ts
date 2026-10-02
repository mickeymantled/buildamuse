// Share links. The build travels in the URL hash as base64url(JSON(build)) with minified keys.
// The hash never reaches a server. Pure, and works in the browser and in Node (no Buffer).
// Decode never calls compile: it validates shape, migrates, and drops unknown ids with warnings.

import type {
  Build,
  BuildV1,
  ChatgptMode,
  GateSetting,
  Library,
  TargetId,
} from '../compiler/types.js';
import { migrateToLatest } from '../compiler/migrate.js';

export class ShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareDecodeError';
  }
}

function fail(message: string): never {
  throw new ShareDecodeError(`share: ${message}`);
}

// Fixed key map. Keys inside limits and gates are ids, not field names, so they are never mapped.
const KEYS: ReadonlyMap<string, string> = new Map([
  ['v', 'v'],
  ['base', 'b'],
  ['chips', 'c'],
  ['stats', 's'],
  ['blunt', 'bl'],
  ['warm', 'w'],
  ['funny', 'f'],
  ['chatty', 'ch'],
  ['proactive', 'p'],
  ['risk', 'r'],
  ['peeves', 'pv'],
  ['heart', 'h'],
  ['hardPart', 'hp'],
  ['d1', 'd1'],
  ['d2', 'd2'],
  ['outfit', 'o'],
  ['name', 'n'],
  ['target', 't'],
  ['mode', 'm'],
  ['plan', 'pl'],
  ['packs', 'pk'],
  ['limits', 'l'],
  ['gates', 'g'],
  ['roles', 'rl'],
]);
const SHORT_KEYS: ReadonlyMap<string, string> = new Map(
  [...KEYS].map(([long, short]) => [short, long]),
);
const OPAQUE_LONG: ReadonlySet<string> = new Set(['limits', 'gates']);
const OPAQUE_SHORT: ReadonlySet<string> = new Set(['l', 'g']);

// Renames every object key through `map`. Values under an opaque key pass through untouched.
// Object.fromEntries makes own properties, so a key like "__proto__" is data, not a prototype.
function mapKeys(
  value: unknown,
  map: ReadonlyMap<string, string>,
  opaque: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, map, opaque));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      map.get(key) ?? key,
      opaque.has(key) ? inner : mapKeys(inner, map, opaque),
    ]),
  );
}

// Closed id sets. `satisfies` makes the compiler flag a missing member.
const TARGET_IDS: ReadonlySet<string> = new Set(
  Object.keys({ muse: 0, openclaw: 0, hermes: 0, grok: 0, chatgpt: 0 } satisfies Record<
    TargetId,
    0
  >),
);
const MODE_IDS: ReadonlySet<string> = new Set(
  Object.keys({ dot: 0, gpt: 0, instructions: 0, project: 0 } satisfies Record<ChatgptMode, 0>),
);
const GATE_SETTINGS: ReadonlySet<string> = new Set(
  Object.keys({ auto: 0, approve: 0, forbid: 0 } satisfies Record<GateSetting, 0>),
);

// base64url without padding, written by hand so Node and the browser behave the same.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const n = (bytes[i] << 16) | ((has1 ? bytes[i + 1] : 0) << 8) | (has2 ? bytes[i + 2] : 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (has1) out += ALPHABET[(n >> 6) & 63];
    if (has2) out += ALPHABET[n & 63];
  }
  return out;
}

function fromBase64Url(text: string): Uint8Array {
  const body = text.replace(/=+$/, '');
  if (body.length % 4 === 1) fail('payload is not valid base64url');
  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    const value = code < 128 ? LOOKUP[code] : -1;
    if (value < 0) fail('payload is not valid base64url');
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 255;
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

export function encodeBuild(build: Build | BuildV1): string {
  const json = JSON.stringify(mapKeys(build, KEYS, OPAQUE_LONG));
  return toBase64Url(new TextEncoder().encode(json));
}

export function toShareHash(build: Build | BuildV1): string {
  return '#b=' + encodeBuild(build);
}

function parsePayload(payload: string): unknown {
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(payload));
  } catch (e) {
    if (e instanceof ShareDecodeError) throw e;
    return fail('payload is not valid UTF-8');
  }
  try {
    return JSON.parse(json);
  } catch {
    return fail('payload is not valid JSON');
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isStrings(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((item) => typeof item === 'string');
}

function idsOf(rows: readonly { id: string }[]): ReadonlySet<string> {
  return new Set(rows.map((r) => r.id));
}

// Checks types only. Ranges, caps and cross-field rules belong to the compiler's validate pass.
function checkShape(x: unknown): Build {
  if (!isRecord(x)) return fail('build is not an object');
  if (x.v !== 2) return fail(`unsupported build version ${String(x.v)}`);
  const { base, chips, stats, peeves, heart, outfit, name, target, mode, plan } = x;
  const { packs, limits, gates, roles } = x;
  if (typeof base !== 'string') return fail('base must be a string');
  if (!isStrings(chips)) return fail('chips must be a list of ids');
  if (!isRecord(stats) || !Object.values(stats).every((n) => typeof n === 'number')) {
    return fail('stats must map stat ids to numbers');
  }
  if (!isStrings(peeves)) return fail('peeves must be a list of ids');
  if (
    !isRecord(heart) ||
    typeof heart.hardPart !== 'string' ||
    typeof heart.d1 !== 'string' ||
    typeof heart.d2 !== 'string'
  ) {
    return fail('heart must have hardPart, d1 and d2 ids');
  }
  if (typeof outfit !== 'string') return fail('outfit must be a string');
  if (typeof name !== 'string') return fail('name must be a string');
  if (typeof target !== 'string') return fail('target must be a string');
  if (!TARGET_IDS.has(target)) return fail(`unknown target "${target}"`);
  if (mode !== undefined && (typeof mode !== 'string' || !MODE_IDS.has(mode))) {
    return fail(`unknown mode "${String(mode)}"`);
  }
  if (plan !== undefined && plan !== 'free' && plan !== 'paid') {
    return fail('plan must be "free" or "paid"');
  }
  if (!isStrings(packs)) return fail('packs must be a list of ids');
  if (!isRecord(limits) || !Object.values(limits).every((n) => typeof n === 'number')) {
    return fail('limits must map limit ids to numbers');
  }
  if (!isRecord(gates) || !Object.values(gates).every((s) => GATE_SETTINGS.has(s as string))) {
    return fail('gates must map action ids to auto, approve or forbid');
  }
  if (roles !== undefined && !isStrings(roles)) return fail('roles must be a list of ids');
  return {
    v: 2,
    base: base as Build['base'],
    chips,
    stats: stats as unknown as Build['stats'],
    peeves,
    heart: { hardPart: heart.hardPart, d1: heart.d1, d2: heart.d2 } as Build['heart'],
    outfit,
    name,
    target: target as TargetId,
    ...(mode !== undefined ? { mode: mode as ChatgptMode } : {}),
    ...(plan !== undefined ? { plan } : {}),
    packs,
    limits: limits as Record<string, number>,
    gates: gates as Record<string, GateSetting>,
    ...(roles !== undefined ? { roles } : {}),
  };
}

function requireKnown(field: string, id: string, known: ReadonlySet<string>): void {
  if (!known.has(id)) fail(`unknown ${field} "${id}"`);
}

function keepKnown(
  field: string,
  ids: readonly string[],
  known: ReadonlySet<string>,
  warnings: string[],
): string[] {
  return ids.filter((id) => {
    if (known.has(id)) return true;
    warnings.push(`share: dropped unknown ${field} "${id}"`);
    return false;
  });
}

// Keeps a record key only if it is in the library registry and, when `exposed` is given, exposed by a
// surviving pack. `exempt` keys skip the exposure check (pay is in every build).
function keepKnownKeys<T>(
  field: string,
  rec: Readonly<Record<string, T>>,
  known: ReadonlySet<string>,
  warnings: string[],
  exposed?: ReadonlySet<string>,
  exempt?: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(rec).filter(([id]) => {
      if (!known.has(id)) {
        warnings.push(`share: dropped unknown ${field} "${id}"`);
        return false;
      }
      if (exposed && id !== exempt && !exposed.has(id)) {
        warnings.push(`share: dropped ${field} "${id}": no selected pack exposes it`);
        return false;
      }
      return true;
    }),
  );
}

export function decodeBuild(
  payload: string,
  lib: Library,
): { build: Build; warnings: string[] } {
  const raw = mapKeys(parsePayload(payload), SHORT_KEYS, OPAQUE_SHORT);
  let migrated: Build;
  try {
    migrated = migrateToLatest(raw);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'build could not be migrated');
  }
  const b = checkShape(migrated);

  // Scalar ids cannot be dropped, so an unknown one fails the whole decode.
  requireKnown('base', b.base, idsOf(lib.bases));
  requireKnown('outfit', b.outfit, idsOf(lib.outfits));
  requireKnown('heart.hardPart', b.heart.hardPart, idsOf(lib.heart.hardParts));
  const drives = idsOf(lib.heart.drives);
  requireKnown('heart.d1', b.heart.d1, drives);
  requireKnown('heart.d2', b.heart.d2, drives);

  // List and record ids are dropped with a warning.
  const warnings: string[] = [];
  const chips = keepKnown('chips', b.chips, idsOf(lib.chips), warnings);
  const peeves = keepKnown('peeves', b.peeves, idsOf(lib.peeves), warnings);
  const packs = keepKnown('packs', b.packs, idsOf(lib.packs), warnings);
  const roles =
    b.roles === undefined ? undefined : keepKnown('roles', b.roles, idsOf(lib.roles), warnings);
  // Gates and limits are checked against the surviving packs, so a dropped pack takes its overrides with it.
  const kept = new Set<string>(packs);
  const surviving = lib.packs.filter((p) => kept.has(p.id));
  const exposedGates = new Set(surviving.flatMap((p) => Object.keys(p.gatesDefault)));
  const exposedLimits = new Set(surviving.flatMap((p) => p.limitChips));
  const gates = keepKnownKeys('gates', b.gates, idsOf(lib.gates), warnings, exposedGates, 'pay');
  const limits = keepKnownKeys('limits', b.limits, idsOf(lib.limits), warnings, exposedLimits);

  const build: Build = { ...b, chips, peeves, packs, gates, limits };
  // If every role was dropped, leave the key off rather than carry an empty list the build never had.
  if (roles && (roles.length > 0 || (b.roles?.length ?? 0) === 0)) build.roles = roles;
  else delete build.roles;
  return { build, warnings };
}

// Accepts '#b=<payload>' or 'b=<payload>'.
export function fromShareHash(hash: string, lib: Library): { build: Build; warnings: string[] } {
  const part = hash
    .replace(/^#/, '')
    .split('&')
    .find((p) => p.startsWith('b='));
  if (part === undefined) return fail('link has no build payload');
  return decodeBuild(part.slice(2), lib);
}
