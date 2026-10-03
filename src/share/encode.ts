// Share links. The build travels in the URL hash as base64url(JSON(build)) with minified keys.
// The hash never reaches a server. Pure, and works in the browser and in Node (no Buffer).
// Decode never calls compile. It validates shape, migrates, drops or replaces unknown ids, repairs
// the fields that depend on them, and runs validateV2, so a decoded build always compiles or the
// decode throws a ShareDecodeError. Unknown ids are counted in the warnings, never echoed.

import type {
  BaseId,
  Build,
  BuildV1,
  ChatgptMode,
  DriveId,
  GateSetting,
  HardPartId,
  Level,
  Library,
  OutfitId,
  Stats,
  TargetId,
} from '../compiler/types.js';
import { MIGRATIONS, migrateToLatest, type MigrationSteps } from '../compiler/migrate.js';
import {
  FALLBACK_BASE,
  FALLBACK_HARD_PART,
  FALLBACK_OUTFIT,
  addRisk,
  cleanName,
  d2ForBlunt,
} from '../compiler/defaults.js';
import { validateV2 } from '../compiler/passes/validate.js';

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

// What decode changed, so the certificate can say so in the user's words. For reason 'unknown' and
// 'fallback' the id came from the link and may be anything: count it, never render it.
export type DropField =
  | 'base'
  | 'outfit'
  | 'chips'
  | 'peeves'
  | 'packs'
  | 'roles'
  | 'gates'
  | 'limits'
  | 'stats'
  | 'heart.hardPart'
  | 'heart.d1'
  | 'heart.d2'
  | 'name';
export type DropReason = 'unknown' | 'unexposed' | 'fallback' | 'cleaned';
export interface Drop {
  field: DropField;
  id: string;
  reason: DropReason;
}

export interface DecodeResult {
  build: Build;
  warnings: string[];
  drops: Drop[];
}

// Checks types only. Ranges, caps and cross-field rules belong to the compiler's validate pass.
function checkShape(x: unknown, version: number): Build {
  if (!isRecord(x)) return fail('build is not an object');
  if (x.v !== version) return fail(`unsupported build version ${String(x.v)}`);
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
  if (!TARGET_IDS.has(target)) return fail('unknown target');
  if (mode !== undefined && (typeof mode !== 'string' || !MODE_IDS.has(mode))) {
    return fail('unknown mode');
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
    // Build.v is the literal 2 until a real version bump; the migration already matched `version`.
    v: version as Build['v'],
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

type RecordDrop = (field: DropField, id: string, reason: DropReason) => void;

// A scalar id that is not in the library is replaced by its default.
function pickKnown<T extends string>(
  field: DropField,
  id: string,
  known: ReadonlySet<string>,
  fallback: T,
  record: RecordDrop,
): T {
  if (known.has(id)) return id as T;
  record(field, id, 'fallback');
  return fallback;
}

function keepKnown(
  field: DropField,
  ids: readonly string[],
  known: ReadonlySet<string>,
  record: RecordDrop,
): string[] {
  return ids.filter((id) => {
    if (known.has(id)) return true;
    record(field, id, 'unknown');
    return false;
  });
}

// Keeps a record key only if it is in the library registry and, when `exposed` is given, exposed by a
// surviving pack. `exempt` keys skip the exposure check (pay is in every build).
function keepKnownKeys<T>(
  field: DropField,
  rec: Readonly<Record<string, T>>,
  known: ReadonlySet<string>,
  record: RecordDrop,
  exposed?: ReadonlySet<string>,
  exempt?: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(rec).filter(([id]) => {
      if (!known.has(id)) {
        record(field, id, 'unknown');
        return false;
      }
      if (exposed && id !== exempt && !exposed.has(id)) {
        record(field, id, 'unexposed');
        return false;
      }
      return true;
    }),
  );
}

const STAT_KEYS = ['blunt', 'warm', 'funny', 'chatty', 'proactive'] as const;

function isLevel(n: unknown): n is Level {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 4;
}

// Developer warnings for the drops. An unknown id is only ever counted. The ids that are named here
// passed a library lookup, so they are library ids.
function warningsOf(drops: readonly Drop[]): string[] {
  const unknownCount = new Map<DropField, number>();
  for (const d of drops) {
    if (d.reason === 'unknown') unknownCount.set(d.field, (unknownCount.get(d.field) ?? 0) + 1);
  }
  const out: string[] = [];
  const counted = new Set<DropField>();
  for (const d of drops) {
    if (d.reason === 'unknown') {
      if (counted.has(d.field)) continue;
      counted.add(d.field);
      out.push(`share: dropped unknown ${d.field} (${unknownCount.get(d.field)})`);
    } else if (d.reason === 'cleaned') {
      out.push(`share: ${d.field} cleaned`);
    } else if (d.reason === 'unexposed') {
      if (d.field === 'stats') out.push('share: risk removed: no Markets chip is tapped');
      else if (d.field === 'heart.d1') out.push('share: heart.d1 reset to the hard part drive');
      else out.push(`share: dropped ${d.field} "${d.id}": no selected pack exposes it`);
    } else if (d.field === 'stats') {
      out.push('share: risk added at the default level');
    } else {
      out.push(`share: unknown ${d.field} replaced with the default`);
    }
  }
  return out;
}

function decodeChecked(payload: string, lib: Library, steps: MigrationSteps): DecodeResult {
  const raw = mapKeys(parsePayload(payload), SHORT_KEYS, OPAQUE_SHORT);
  let migrated: Build;
  try {
    migrated = migrateToLatest(raw, lib.version, steps);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'build could not be migrated');
  }
  const b = checkShape(migrated, lib.version);

  const drops: Drop[] = [];
  const record: RecordDrop = (field, id, reason) => {
    drops.push({ field, id, reason });
  };

  // A scalar id that is not in the library falls back to a default.
  const base = pickKnown<BaseId>('base', b.base, idsOf(lib.bases), FALLBACK_BASE, record);
  const outfit = pickKnown<OutfitId>('outfit', b.outfit, idsOf(lib.outfits), FALLBACK_OUTFIT, record);
  const hardPart = pickKnown<HardPartId>(
    'heart.hardPart',
    b.heart.hardPart,
    idsOf(lib.heart.hardParts),
    FALLBACK_HARD_PART,
    record,
  );

  // List and record ids are dropped.
  const chips = keepKnown('chips', b.chips, idsOf(lib.chips), record);
  const peeves = keepKnown('peeves', b.peeves, idsOf(lib.peeves), record);
  const packs = keepKnown('packs', b.packs, idsOf(lib.packs), record);
  const roles =
    b.roles === undefined ? undefined : keepKnown('roles', b.roles, idsOf(lib.roles), record);
  // Gates and limits are checked against the surviving packs, so a dropped pack takes its overrides with it.
  const kept = new Set<string>(packs);
  const surviving = lib.packs.filter((p) => kept.has(p.id));
  const exposedGates = new Set(surviving.flatMap((p) => Object.keys(p.gatesDefault)));
  const exposedLimits = new Set(surviving.flatMap((p) => p.limitChips));
  const gates = keepKnownKeys('gates', b.gates, idsOf(lib.gates), record, exposedGates, 'pay');
  const limits = keepKnownKeys('limits', b.limits, idsOf(lib.limits), record, exposedLimits);

  // Risk exists exactly when a Markets chip survives. Only the six stat keys are carried.
  const s = b.stats as unknown as Record<string, number>;
  let stats = {
    blunt: s.blunt,
    warm: s.warm,
    funny: s.funny,
    chatty: s.chatty,
    proactive: s.proactive,
    ...(s.risk !== undefined ? { risk: s.risk } : {}),
  } as Stats;
  const markets = chips.some((id) => lib.chips.find((c) => c.id === id)?.group === 'Markets');
  if (!markets && stats.risk !== undefined) {
    const { risk: _risk, ...rest } = stats;
    stats = rest;
    record('stats', 'risk', 'unexposed');
  } else if (markets && stats.risk === undefined && STAT_KEYS.every((k) => isLevel(stats[k]))) {
    // addRisk sheds stats in a loop, so it only runs on stats that are already levels.
    stats = addRisk(stats);
    record('stats', 'risk', 'fallback');
  }

  // d1 is the hard part's own drive or a surviving chip's suggestion. d2 is any d2 drive.
  const own = lib.heart.hardParts.find((h) => h.id === hardPart)?.d1;
  const offered = chips
    .map((id) => lib.chips.find((c) => c.id === id)?.d1Suggest)
    .filter((d): d is DriveId => d !== undefined);
  let d1: DriveId = b.heart.d1;
  if (own !== undefined && d1 !== own && !offered.includes(d1)) {
    record('heart.d1', d1, lib.heart.drives.some((d) => d.id === d1) ? 'unexposed' : 'fallback');
    d1 = own;
  }
  let d2: DriveId = b.heart.d2;
  if (!lib.heart.drives.some((d) => d.id === d2 && d.slot === 'd2')) {
    record('heart.d2', d2, 'fallback');
    d2 = d2ForBlunt(stats.blunt, lib);
  }

  const name = cleanName(b.name).trim();
  if (name !== b.name) record('name', 'name', 'cleaned');

  const build: Build = {
    ...b,
    base,
    chips,
    stats,
    peeves,
    heart: { hardPart, d1, d2 },
    outfit,
    name,
    packs,
    gates,
    limits,
  };
  // If every role was dropped, leave the key off rather than carry an empty list the build never had.
  if (roles && (roles.length > 0 || (b.roles?.length ?? 0) === 0)) build.roles = roles;
  else delete build.roles;

  // The version was matched against the library already, so validate the picks as a current build.
  try {
    validateV2({ ...build, v: 2 }, lib);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'build is not valid');
  }
  return { build, warnings: warningsOf(drops), drops };
}

// Returns the build, the developer warnings and the structured drops. Throws only ShareDecodeError.
// `steps` is for tests that add a synthetic migration step.
export function decodeBuild(
  payload: string,
  lib: Library,
  steps: MigrationSteps = MIGRATIONS,
): DecodeResult {
  try {
    return decodeChecked(payload, lib, steps);
  } catch (e) {
    if (e instanceof ShareDecodeError) throw e;
    return fail('link could not be decoded');
  }
}

// Accepts '#b=<payload>' or 'b=<payload>'.
export function fromShareHash(
  hash: string,
  lib: Library,
  steps: MigrationSteps = MIGRATIONS,
): DecodeResult {
  const part = hash
    .replace(/^#/, '')
    .split('&')
    .find((p) => p.startsWith('b='));
  if (part === undefined) return fail('link has no build payload');
  return decodeBuild(part.slice(2), lib, steps);
}
