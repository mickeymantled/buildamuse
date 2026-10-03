// Zip tests (M4 slice 4.8, src/share/zip.ts). Plan section 7 and QUESTIONS.md W13:
// - format: stored entries (no compression), CRC32, UTF-8 names (flag bit 11), fixed DOS time of
//   1980-01-01 00:00 so the bytes are deterministic, no dependency;
// - contents: every bundle file with delivery 'file', at its bundle path;
// - name: <slug(name)>-<profile>.zip, slugged to [a-z0-9-], an empty slug becomes "bot";
// - download: a Blob link, the object URL revoked after the click;
// - test: an in-test unzip reads every entry back byte for byte.
//
// The expected values do not come from running zipFiles and copying its output. The unzip below is
// written from the zip format (end of central directory, then central directory, then local headers).
// The CRC32 check is a bitwise reference written here, itself checked against published vectors and
// node:zlib. Expected paths for the real bundles come from docs/V2-DESIGN.md (openclaw layout) and
// src/library/targets.json ("A zip with SOUL.md, AGENTS.md and skills.").
//
// Engineer readings pinned here and called out in comments: slugName collapses a run of characters
// outside [a-z0-9] into one dash and trims edge dashes; non-ASCII letters are separators, not
// transliterated; downloadZip revokes the URL on a timer, not synchronously.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';

import { downloadZip, slugName, zipFilename, zipFiles } from '../src/share/zip.js';
import type { ZipFile } from '../src/share/zip.js';
import type { ProfileId } from '../src/compiler/types.js';

// --- Independent CRC32 -----------------------------------------------------

// Bitwise, no table, reflected polynomial 0xEDB88320. Deliberately not the table form zip.ts uses.
function crc32Reference(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc ^ bytes[i]) >>> 0;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc >>> 1) ^ (0xedb88320 & -(crc & 1))) >>> 0;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

function bytesOf(text: string): Uint8Array {
  return encoder.encode(text);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
}

// --- Minimal unzip, written from the zip format ----------------------------

interface ReadEntry {
  name: string;
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  flags: number;
  method: number;
  time: number;
  date: number;
  compressedSize: number;
  uncompressedSize: number;
  extraLength: number;
  commentLength: number;
  externalAttributes: number;
  offset: number;
}

interface ReadZip {
  entries: ReadEntry[];
  length: number;
  eocdOffset: number;
  diskNumber: number;
  centralDisk: number;
  countOnDisk: number;
  count: number;
  centralSize: number;
  centralOffset: number;
  commentLength: number;
}

// Strict: throws on any inconsistency between the end record, the central directory and the local headers.
function readZip(zip: Uint8Array): ReadZip {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const u16 = (p: number): number => view.getUint16(p, true);
  const u32 = (p: number): number => view.getUint32(p, true);

  // End of central directory: scan back for its signature with a comment length that fits the file.
  let eocd = -1;
  for (let p = zip.length - 22; p >= 0; p--) {
    if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === zip.length) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end of central directory record');

  const diskNumber = u16(eocd + 4);
  const centralDisk = u16(eocd + 6);
  const countOnDisk = u16(eocd + 8);
  const count = u16(eocd + 10);
  const centralSize = u32(eocd + 12);
  const centralOffset = u32(eocd + 16);
  const commentLength = u16(eocd + 20);
  if (centralOffset + centralSize !== eocd) throw new Error('central directory does not end at the end record');

  const entries: ReadEntry[] = [];
  let p = centralOffset;
  for (let i = 0; i < count; i++) {
    if (u32(p) !== 0x02014b50) throw new Error(`bad central header signature at ${p}`);
    const flags = u16(p + 8);
    const method = u16(p + 10);
    const time = u16(p + 12);
    const date = u16(p + 14);
    const crc = u32(p + 16);
    const compressedSize = u32(p + 20);
    const uncompressedSize = u32(p + 24);
    const nameLength = u16(p + 28);
    const extraLength = u16(p + 30);
    const commentLen = u16(p + 32);
    const externalAttributes = u32(p + 38);
    const offset = u32(p + 42);
    const nameBytes = zip.slice(p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLen;

    if (method !== 0) throw new Error(`entry ${i} is not stored (method ${method})`);
    if (compressedSize !== uncompressedSize) throw new Error(`entry ${i} stored sizes differ`);

    // The local header must agree with the central one.
    if (u32(offset) !== 0x04034b50) throw new Error(`bad local header signature at ${offset}`);
    const same: [string, number, number][] = [
      ['flags', u16(offset + 6), flags],
      ['method', u16(offset + 8), method],
      ['time', u16(offset + 10), time],
      ['date', u16(offset + 12), date],
      ['crc', u32(offset + 14), crc],
      ['compressed size', u32(offset + 18), compressedSize],
      ['uncompressed size', u32(offset + 22), uncompressedSize],
      ['name length', u16(offset + 26), nameLength],
    ];
    for (const [what, local, central] of same) {
      if (local !== central) throw new Error(`entry ${i}: local ${what} ${local} differs from central ${central}`);
    }
    const localExtra = u16(offset + 28);
    const localName = zip.slice(offset + 30, offset + 30 + nameLength);
    if (!sameBytes(localName, nameBytes)) throw new Error(`entry ${i}: local name differs from central name`);
    const dataStart = offset + 30 + nameLength + localExtra;
    if (dataStart + compressedSize > centralOffset) throw new Error(`entry ${i}: data runs into the central directory`);

    entries.push({
      name: strictDecoder.decode(nameBytes),
      nameBytes,
      data: zip.slice(dataStart, dataStart + compressedSize),
      crc,
      flags,
      method,
      time,
      date,
      compressedSize,
      uncompressedSize,
      extraLength,
      commentLength: commentLen,
      externalAttributes,
      offset,
    });
  }
  if (p !== centralOffset + centralSize) throw new Error('central directory size does not match its entries');

  return {
    entries,
    length: zip.length,
    eocdOffset: eocd,
    diskNumber,
    centralDisk,
    countOnDisk,
    count,
    centralSize,
    centralOffset,
    commentLength,
  };
}

// Zip the files, read them back, and assert every entry byte for byte, plus every stored CRC against the
// independent reference. Also asserts the layout is tight: local entries back to back from offset 0, the
// central directory straight after, the end record last, nothing trailing.
function roundTrip(files: ZipFile[]): ReadZip {
  const zip = zipFiles(files);
  const parsed = readZip(zip);

  expect(parsed.count).toBe(files.length);
  expect(parsed.entries.map((e) => e.name)).toEqual(files.map((f) => f.path));

  let expectedOffset = 0;
  let expectedCentral = 0;
  parsed.entries.forEach((entry, i) => {
    const expected = bytesOf(files[i].content);
    expect(sameBytes(entry.data, expected), `bytes of ${entry.name}`).toBe(true);
    expect(entry.uncompressedSize, `size of ${entry.name}`).toBe(expected.length);
    expect(entry.crc, `crc of ${entry.name}`).toBe(crc32Reference(expected));
    expect(entry.offset, `offset of ${entry.name}`).toBe(expectedOffset);
    expectedOffset += 30 + entry.nameBytes.length + expected.length;
    expectedCentral += 46 + entry.nameBytes.length;
  });
  expect(parsed.centralOffset).toBe(expectedOffset);
  expect(parsed.centralSize).toBe(expectedCentral);
  expect(parsed.eocdOffset).toBe(expectedOffset + expectedCentral);
  expect(parsed.length).toBe(expectedOffset + expectedCentral + 22);
  return parsed;
}

// --- Fixtures --------------------------------------------------------------

// Printable ASCII, deterministic LCG, exactly `length` bytes.
function randomAscii(length: number, seed: number): string {
  let state = seed >>> 0;
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    chars.push(String.fromCharCode(32 + ((state >>> 16) % 95)));
  }
  return chars.join('');
}

// At least `minBytes` UTF-8 bytes of mixed ASCII, accents, CJK, emoji and CRLF lines.
function mixedText(minBytes: number): string {
  const parts: string[] = [];
  let bytes = 0;
  for (let i = 0; bytes < minBytes; i++) {
    const line = `line ${i} Zażółć gęślą jaźń 日本語 🚀🎉 café${'.'.repeat(i % 37)}\r\n`;
    parts.push(line);
    bytes += bytesOf(line).length;
  }
  return parts.join('');
}

// --- Test setup ------------------------------------------------------------

const hasUnzip = spawnSync('unzip', ['-v'], { encoding: 'utf8' }).error === undefined;
let tmp = '';

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'buildamuse-zip-'));
});

afterAll(() => {
  if (tmp !== '') rmSync(tmp, { recursive: true, force: true });
});

// --- The reference CRC is itself right -------------------------------------

describe('reference CRC32 (test helper)', () => {
  it('matches the published check vectors', () => {
    expect(crc32Reference(bytesOf(''))).toBe(0x00000000);
    expect(crc32Reference(bytesOf('a'))).toBe(0xe8b7be43);
    expect(crc32Reference(bytesOf('123456789'))).toBe(0xcbf43926);
    expect(crc32Reference(bytesOf('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });

  it('matches node:zlib crc32 when this Node has it', () => {
    const crc = (zlib as { crc32?: (data: Uint8Array) => number }).crc32;
    if (typeof crc !== 'function') return;
    for (const text of ['', 'x', randomAscii(5000, 7), mixedText(20000)]) {
      const bytes = bytesOf(text);
      expect(crc32Reference(bytes)).toBe(crc(bytes));
    }
  });
});

// --- Container structure ---------------------------------------------------

describe('zipFiles: container structure', () => {
  it('an empty file list gives a valid 22 byte archive with zero entries', () => {
    const zip = zipFiles([]);
    expect(zip.length).toBe(22);
    const parsed = readZip(zip);
    expect(parsed.count).toBe(0);
    expect(parsed.countOnDisk).toBe(0);
    expect(parsed.centralSize).toBe(0);
    expect(parsed.centralOffset).toBe(0);
    expect(parsed.commentLength).toBe(0);
  });

  it('writes one stored, UTF-8 flagged, fixed-time entry per file with no extras', () => {
    const parsed = roundTrip([
      { path: 'SOUL.md', content: '# Soul\n' },
      { path: 'AGENTS.md', content: 'rules\n' },
    ]);
    expect(parsed.diskNumber).toBe(0);
    expect(parsed.centralDisk).toBe(0);
    expect(parsed.countOnDisk).toBe(2);
    expect(parsed.commentLength).toBe(0);
    for (const entry of parsed.entries) {
      expect(entry.method, 'stored, no compression').toBe(0);
      expect(entry.flags & 0x0800, 'UTF-8 name flag (bit 11)').toBe(0x0800);
      expect(entry.compressedSize).toBe(entry.uncompressedSize);
      // DOS 1980-01-01 00:00:00: date = ((1980 - 1980) << 9) | (1 << 5) | 1, time = 0.
      expect(entry.date).toBe((0 << 9) | (1 << 5) | 1);
      expect(entry.time).toBe(0);
      expect(entry.extraLength).toBe(0);
      expect(entry.commentLength).toBe(0);
    }
  });

  it('returns a Uint8Array that owns an exact-length ArrayBuffer (usable as a Blob part)', () => {
    const zip = zipFiles([{ path: 'a.md', content: 'hello' }]);
    expect(zip).toBeInstanceOf(Uint8Array);
    expect(zip.buffer).toBeInstanceOf(ArrayBuffer);
    expect(zip.byteOffset).toBe(0);
    expect(zip.buffer.byteLength).toBe(zip.length);
  });

  it('does not mutate or reorder its input', () => {
    const files: ZipFile[] = [
      { path: 'b.md', content: 'two' },
      { path: 'a.md', content: 'one' },
    ];
    const snapshot = structuredClone(files);
    Object.freeze(files);
    for (const f of files) Object.freeze(f);
    zipFiles(files);
    expect(files).toEqual(snapshot);
    expect(readZip(zipFiles(files)).entries.map((e) => e.name)).toEqual(['b.md', 'a.md']);
  });

  it('stores the CRC32 of the check string "123456789" as 0xCBF43926', () => {
    const parsed = readZip(zipFiles([{ path: 'check.txt', content: '123456789' }]));
    expect(parsed.entries[0].crc).toBe(0xcbf43926);
  });
});

// --- Round trips -----------------------------------------------------------

describe('zipFiles: byte for byte round trip', () => {
  it('reads several ASCII files back in input order', () => {
    roundTrip([
      { path: 'SOUL.md', content: '# Soul\n\nBe direct.\n' },
      { path: 'AGENTS.md', content: '# Rules\n\n- Never invent a price.\n' },
      { path: 'USER.md', content: 'Likes quiet mornings.' },
      { path: 'skills/rug-check/SKILL.md', content: '---\nname: rug-check\n---\nCheck the contract.\n' },
    ]);
  });

  it('keeps line endings, a missing final newline, NUL and a leading BOM exactly', () => {
    const files: ZipFile[] = [
      { path: 'crlf.md', content: 'one\r\ntwo\r\nthree\r\n' },
      { path: 'lf-no-final.md', content: 'one\ntwo' },
      { path: 'nul.bin', content: 'a\u0000b\u0000' },
      { path: 'bom.md', content: '﻿with bom' },
    ];
    const parsed = roundTrip(files);
    expect(Array.from(parsed.entries[3].data.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(Array.from(parsed.entries[2].data)).toEqual([0x61, 0x00, 0x62, 0x00]);
  });

  it('stores UTF-8 bytes for content: accents, CJK and emoji', () => {
    const parsed = roundTrip([
      { path: 'short.md', content: 'é🚀' },
      { path: 'long.md', content: mixedText(3000) },
    ]);
    // 'é' is C3 A9 and U+1F680 is F0 9F 9A 80 in UTF-8, so 6 bytes for 3 UTF-16 code units.
    expect(Array.from(parsed.entries[0].data)).toEqual([0xc3, 0xa9, 0xf0, 0x9f, 0x9a, 0x80]);
    expect(parsed.entries[0].uncompressedSize).toBe(6);
    expect(parsed.entries[0].crc).toBe(crc32Reference(new Uint8Array([0xc3, 0xa9, 0xf0, 0x9f, 0x9a, 0x80])));
  });

  it('stores UTF-8 bytes for names: an emoji and accented letters', () => {
    const files: ZipFile[] = [
      { path: 'é.md', content: 'accent' },
      { path: '🚀/launch.md', content: 'emoji folder' },
      { path: 'café-menu/naïve résumé.md', content: 'spaces and accents' },
      { path: '日本語/メモ.md', content: 'cjk' },
    ];
    const parsed = roundTrip(files);
    // Name length is in bytes, not UTF-16 code units.
    expect(Array.from(parsed.entries[0].nameBytes)).toEqual([0xc3, 0xa9, 0x2e, 0x6d, 0x64]);
    expect(Array.from(parsed.entries[1].nameBytes.subarray(0, 4))).toEqual([0xf0, 0x9f, 0x9a, 0x80]);
    expect(parsed.entries[1].nameBytes.length).toBe(4 + '/launch.md'.length);
    for (const entry of parsed.entries) {
      expect(entry.flags & 0x0800, `UTF-8 flag on ${entry.name}`).toBe(0x0800);
    }
  });

  it('handles an empty file: size 0, CRC 0, still listed', () => {
    const parsed = roundTrip([
      { path: 'before.md', content: 'x' },
      { path: 'empty.md', content: '' },
      { path: 'after.md', content: 'y' },
    ]);
    expect(parsed.entries[1].uncompressedSize).toBe(0);
    expect(parsed.entries[1].data.length).toBe(0);
    expect(parsed.entries[1].crc).toBe(0);
  });

  it('handles an archive of only empty files', () => {
    const parsed = roundTrip([
      { path: 'a', content: '' },
      { path: 'b/c', content: '' },
    ]);
    expect(parsed.entries.every((e) => e.uncompressedSize === 0 && e.crc === 0)).toBe(true);
  });

  it('handles a 200 kB ASCII file (exactly 200000 bytes) and 32 bit offsets after it', () => {
    const big = randomAscii(200_000, 1);
    expect(bytesOf(big).length).toBe(200_000);
    const parsed = roundTrip([
      { path: 'big.txt', content: big },
      { path: 'small-after.md', content: 'after the big one' },
    ]);
    expect(parsed.entries[0].uncompressedSize).toBe(200_000);
    // The second local header sits past 65535, so it needs more than 16 bits to address.
    expect(parsed.entries[1].offset).toBeGreaterThan(0xffff);
  });

  it('handles a 200 kB multibyte file with CRLF lines', () => {
    const big = mixedText(200_000);
    const parsed = roundTrip([
      { path: 'mixed.md', content: big },
      { path: 'tail.md', content: 'tail' },
    ]);
    expect(parsed.entries[0].uncompressedSize).toBeGreaterThanOrEqual(200_000);
    expect(parsed.entries[0].uncompressedSize).toBeGreaterThan(big.length);
  });

  it('handles several big files with small files between them', () => {
    roundTrip([
      { path: 'a-big.txt', content: randomAscii(150_000, 2) },
      { path: 'b-small.md', content: 'small' },
      { path: 'c-big.txt', content: randomAscii(120_000, 3) },
      { path: 'd-empty.md', content: '' },
      { path: 'e-big.md', content: mixedText(90_000) },
    ]);
  });

  it('keeps nested paths exactly as given, with no directory entries added', () => {
    const files: ZipFile[] = [
      { path: 'SOUL.md', content: 's' },
      { path: 'skills/rug-check/SKILL.md', content: 'k1' },
      { path: 'skills/position-log/SKILL.md', content: 'k2' },
      { path: 'workspace-risk-manager/AGENTS.md', content: 'r' },
      { path: 'a/b/c/d/e/f/deep.md', content: 'deep' },
      { path: 'a/b.md', content: 'file and folder share a prefix' },
      { path: 'a/b/c.md', content: 'sibling' },
      { path: 'MixedCase/File.MD', content: 'case kept' },
    ];
    const parsed = roundTrip(files);
    expect(parsed.entries).toHaveLength(files.length);
    expect(parsed.entries.some((e) => e.name.endsWith('/'))).toBe(false);
  });

  it('round trips 1000 small files', () => {
    const files: ZipFile[] = [];
    for (let i = 0; i < 1000; i++) files.push({ path: `dir${i % 10}/file-${i}.md`, content: `file ${i}\n` });
    roundTrip(files);
  });

  it('a corrupted byte shows up as a CRC mismatch in the helper (the check is not vacuous)', () => {
    const zip = zipFiles([{ path: 'a.md', content: 'hello world' }]);
    const copy = zip.slice();
    copy[30 + 'a.md'.length + 2] ^= 0xff;
    const entry = readZip(copy).entries[0];
    expect(crc32Reference(entry.data)).not.toBe(entry.crc);
  });
});

// --- Limits ----------------------------------------------------------------

describe('zipFiles: limits', () => {
  it('throws RangeError for more than 65535 files', () => {
    const files = Array.from({ length: 65536 }, () => ({ path: 'a', content: '' }));
    expect(() => zipFiles(files)).toThrow(RangeError);
  });

  it('accepts exactly 65535 files', () => {
    const files = Array.from({ length: 65535 }, (_, i) => ({ path: `f${i}`, content: '' }));
    const parsed = readZip(zipFiles(files));
    expect(parsed.count).toBe(65535);
    expect(parsed.entries[65534].name).toBe('f65534');
  });

  it('throws RangeError for a path over 65535 bytes, measured in bytes not characters', () => {
    expect(() => zipFiles([{ path: 'a'.repeat(65536), content: '' }])).toThrow(RangeError);
    // 32768 two-byte characters is 65536 bytes but only 32768 characters.
    expect(() => zipFiles([{ path: 'é'.repeat(32768), content: '' }])).toThrow(RangeError);
  });

  it('accepts a path of exactly 65535 bytes', () => {
    const path = 'é'.repeat(32767) + 'a';
    expect(bytesOf(path).length).toBe(65535);
    const parsed = readZip(zipFiles([{ path, content: 'x' }]));
    expect(parsed.entries[0].name).toBe(path);
  });
});

// --- Determinism -----------------------------------------------------------

describe('zipFiles: deterministic bytes', () => {
  const files: ZipFile[] = [
    { path: 'SOUL.md', content: '# Soul\n' },
    { path: 'skills/x/SKILL.md', content: 'é🚀\n' },
    { path: 'empty.md', content: '' },
  ];

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the same input gives identical bytes on every call', () => {
    const first = zipFiles(files);
    const second = zipFiles(files);
    expect(sameBytes(first, second)).toBe(true);
  });

  it('equal input in fresh objects gives identical bytes', () => {
    const copy = structuredClone(files);
    expect(sameBytes(zipFiles(files), zipFiles(copy))).toBe(true);
  });

  it('does not depend on the clock', () => {
    const real = zipFiles(files);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-07-04T23:59:58Z'));
    const later = zipFiles(files);
    vi.setSystemTime(new Date('1999-12-31T00:00:00Z'));
    const earlier = zipFiles(files);
    expect(sameBytes(real, later)).toBe(true);
    expect(sameBytes(real, earlier)).toBe(true);
  });

  it('a different file list gives different bytes', () => {
    expect(sameBytes(zipFiles(files), zipFiles(files.slice(0, 2)))).toBe(false);
    const edited = files.map((f, i) => (i === 0 ? { ...f, content: f.content + ' ' } : f));
    expect(sameBytes(zipFiles(files), zipFiles(edited))).toBe(false);
  });
});

// --- Real bundles ----------------------------------------------------------

// The compiler and the library are loaded lazily, inside the tests that need a real bundle, so the pure zip
// tests above never depend on the compiler being loadable. The spec ids come from the golden file names.
const goldenDir = fileURLToPath(new URL('./golden/v2/', import.meta.url));
const GOLDEN_IDS = readdirSync(goldenDir)
  .filter((name) => name.endsWith('.md'))
  .map((name) => name.slice(0, -'.md'.length))
  .sort();

const deliveryCache = new Map<string, Promise<ZipFile[]>>();

// The file deliveries of one golden spec: what the certificate's zip button would pack.
function fileDeliveries(specId: string): Promise<ZipFile[]> {
  let cached = deliveryCache.get(specId);
  if (!cached) {
    cached = (async () => {
      const [{ compile, library }, { GOLDEN_SPECS, buildFor }] = await Promise.all([
        import('../src/compiler/compile.js'),
        import('../tools/golden.js'),
      ]);
      const spec = GOLDEN_SPECS.find((s) => s.id === specId);
      if (!spec) throw new Error(`no golden spec ${specId}`);
      const result = compile(buildFor(spec, library));
      return result.files.filter((f) => f.delivery === 'file').map((f) => ({ path: f.path, content: f.content }));
    })();
    deliveryCache.set(specId, cached);
  }
  return cached;
}

describe('real bundle: marty.openclaw.roles', () => {
  let files: ZipFile[] = [];

  beforeAll(async () => {
    files = await fileDeliveries('marty.openclaw.roles');
  });

  it('has the openclaw layout from the design: main files, skills, and a workspace per role', () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain('SOUL.md');
    expect(paths).toContain('AGENTS.md');
    expect(paths.some((p) => /^skills\/[^/]+\/SKILL\.md$/.test(p))).toBe(true);
    // Roles for this spec: scout, risk-manager, journal. V2-DESIGN: workspace-<role>/SOUL.md and /AGENTS.md.
    for (const role of ['scout', 'risk-manager', 'journal']) {
      expect(paths, `workspace-${role}/SOUL.md`).toContain(`workspace-${role}/SOUL.md`);
      expect(paths, `workspace-${role}/AGENTS.md`).toContain(`workspace-${role}/AGENTS.md`);
    }
  });

  it('zips every file delivery and reads each one back byte for byte, with matching CRCs', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    const parsed = roundTrip(files);
    expect(parsed.entries.length).toBe(files.length);
  });

  it('keeps the unicode in the real content intact (decode the bytes, compare to the string)', () => {
    const parsed = readZip(zipFiles(files));
    parsed.entries.forEach((entry, i) => {
      expect(strictDecoder.decode(entry.data), entry.name).toBe(files[i].content);
    });
  });

  it('has unique, relative, forward-slash paths (safe to extract)', () => {
    const paths = files.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) {
      expect(p, p).not.toBe('');
      expect(p.startsWith('/'), `${p} is not absolute`).toBe(false);
      expect(p.includes('\\'), `${p} has no backslash`).toBe(false);
      expect(/^[A-Za-z]:/.test(p), `${p} has no drive letter`).toBe(false);
      expect(p.split('/').includes('..'), `${p} has no parent segment`).toBe(false);
      expect(p.split('/').includes('.'), `${p} has no dot segment`).toBe(false);
    }
  });
});

describe('real bundles: every golden spec', () => {
  it('finds the golden specs on disk', () => {
    expect(GOLDEN_IDS.length).toBeGreaterThanOrEqual(55);
    expect(GOLDEN_IDS).toContain('marty.openclaw.roles');
  });

  for (const id of GOLDEN_IDS) {
    it(`${id}: file deliveries zip and read back byte for byte`, async () => {
      const files = await fileDeliveries(id);
      const parsed = roundTrip(files);
      expect(parsed.count).toBe(files.length);
      const paths = files.map((f) => f.path);
      expect(new Set(paths).size, 'unique paths').toBe(paths.length);
      for (const p of paths) {
        expect(p === '' || p.startsWith('/') || p.includes('\\') || p.split('/').includes('..'), `unsafe path ${p}`).toBe(false);
      }
    });
  }
});

// --- Real unzip ------------------------------------------------------------

function runUnzip(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('unzip', args, { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function writeZip(name: string, zip: Uint8Array): string {
  const file = join(tmp, name);
  writeFileSync(file, zip);
  return file;
}

describe.skipIf(!hasUnzip)('zipFiles: the system unzip accepts the archive', () => {
  it('unzip -t reports no errors for ASCII, nested, empty and 200 kB entries', () => {
    const files: ZipFile[] = [
      { path: 'SOUL.md', content: '# Soul\n' },
      { path: 'skills/rug-check/SKILL.md', content: 'check\n' },
      { path: 'a/b/c/deep.md', content: 'deep' },
      { path: 'empty.md', content: '' },
      { path: 'big.txt', content: randomAscii(200_000, 9) },
    ];
    const file = writeZip('plain.zip', zipFiles(files));
    const r = runUnzip(['-t', file]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('No errors detected');
    expect(r.stdout).not.toMatch(/bad CRC|warning|mismatch/i);
    // One OK line per entry.
    expect((r.stdout.match(/OK$/gm) ?? []).length).toBe(files.length);
  });

  it('unzip -t reports no errors for UTF-8 names and UTF-8 content', () => {
    const files: ZipFile[] = [
      { path: 'é.md', content: 'accent' },
      { path: '🚀/launch.md', content: mixedText(5000) },
      { path: 'café-menu/naïve résumé.md', content: 'x' },
    ];
    const file = writeZip('utf8.zip', zipFiles(files));
    const r = runUnzip(['-t', file]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('No errors detected');
    expect((r.stdout.match(/OK$/gm) ?? []).length).toBe(files.length);
  });

  it('unzip -t catches a flipped data byte (so a pass above means something)', () => {
    const zip = zipFiles([{ path: 'a.md', content: 'hello world' }]);
    const copy = zip.slice();
    copy[30 + 'a.md'.length + 2] ^= 0xff;
    const r = runUnzip(['-t', writeZip('corrupt.zip', copy)]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/bad CRC/i);
  });

  it('lists and extracts the marty.openclaw.roles bundle identically to the compiled files', async () => {
    const files = await fileDeliveries('marty.openclaw.roles');
    const zipPath = writeZip('marty-openclaw.zip', zipFiles(files));

    const test = runUnzip(['-t', zipPath]);
    expect(test.status, test.stdout + test.stderr).toBe(0);
    expect(test.stdout).toContain('No errors detected');

    const list = runUnzip(['-Z1', zipPath]);
    expect(list.status, list.stderr).toBe(0);
    expect(list.stdout.split('\n').filter((l) => l !== '')).toEqual(files.map((f) => f.path));

    const outDir = join(tmp, 'marty-extracted');
    mkdirSync(outDir, { recursive: true });
    const extract = runUnzip(['-o', '-d', outDir, zipPath]);
    expect(extract.status, extract.stdout + extract.stderr).toBe(0);
    for (const f of files) {
      const onDisk = readFileSync(join(outDir, f.path));
      expect(sameBytes(onDisk, bytesOf(f.content)), `extracted ${f.path}`).toBe(true);
      // The folder for a nested path was created by unzip, so the path really was nested.
      expect(dirname(join(outDir, f.path)).startsWith(outDir)).toBe(true);
    }
  });

  it('unzip -t accepts the 65535 file maximum (0xFFFF entries is not mistaken for Zip64)', () => {
    const files = Array.from({ length: 65535 }, (_, i) => ({ path: `f${i}`, content: 'x' }));
    const r = runUnzip(['-tq', writeZip('max-files.zip', zipFiles(files))]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('No errors detected');
  });

  it('unzip -t is clean for every golden spec that has file deliveries', async () => {
    let tested = 0;
    for (const id of GOLDEN_IDS) {
      const files = await fileDeliveries(id);
      if (files.length === 0) continue;
      const r = runUnzip(['-t', writeZip(`${id}.zip`, zipFiles(files))]);
      expect(r.status, `${id}: ${r.stdout}${r.stderr}`).toBe(0);
      expect(r.stdout, id).toContain('No errors detected');
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });
});

// --- Python zipfile as a second independent reader -------------------------

// Python decodes a name as UTF-8 only when general purpose flag bit 11 is set, otherwise as cp437, so this
// is an independent check on the flag, the names, the fixed timestamp and the CRCs.
const hasPython = spawnSync('python3', ['--version'], { encoding: 'utf8' }).error === undefined;

const PY_READER = `
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
out = {"bad": z.testzip(), "entries": []}
for info in z.infolist():
    out["entries"].append({
        "name": info.filename,
        "flagUtf8": (info.flag_bits & 0x800) != 0,
        "date": list(info.date_time),
        "compressType": info.compress_type,
        "crc": info.CRC,
        "size": info.file_size,
        "text": z.read(info.filename).decode("utf-8"),
    })
print(json.dumps(out))
`;

describe.skipIf(!hasPython)('zipFiles: python zipfile reads the archive', () => {
  it('names, flags, timestamps, CRCs and UTF-8 text all agree', () => {
    const files: ZipFile[] = [
      { path: 'SOUL.md', content: '# Soul\r\nline two\n' },
      { path: 'é.md', content: 'accent' },
      { path: '🚀/launch.md', content: 'é🚀 日本語\n' },
      { path: 'café-menu/naïve résumé.md', content: mixedText(2000) },
      { path: 'empty.md', content: '' },
      { path: 'big.txt', content: randomAscii(200_000, 5) },
    ];
    const file = writeZip('python.zip', zipFiles(files));
    const r = spawnSync('python3', ['-c', PY_READER, file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout) as {
      bad: string | null;
      entries: {
        name: string;
        flagUtf8: boolean;
        date: number[];
        compressType: number;
        crc: number;
        size: number;
        text: string;
      }[];
    };
    expect(out.bad).toBeNull();
    expect(out.entries.map((e) => e.name)).toEqual(files.map((f) => f.path));
    out.entries.forEach((e, i) => {
      const expected = bytesOf(files[i].content);
      expect(e.flagUtf8, e.name).toBe(true);
      expect(e.date, e.name).toEqual([1980, 1, 1, 0, 0, 0]);
      expect(e.compressType, e.name).toBe(0);
      expect(e.size, e.name).toBe(expected.length);
      expect(e.crc, e.name).toBe(crc32Reference(expected));
      expect(e.text === files[i].content, `text of ${e.name}`).toBe(true);
    });
  });
});

// --- slugName and zipFilename ----------------------------------------------

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('slugName', () => {
  it('lowercases and joins words with single dashes', () => {
    expect(slugName('Marty')).toBe('marty');
    expect(slugName('Sir Reginald III')).toBe('sir-reginald-iii');
    expect(slugName('Bot 2000')).toBe('bot-2000');
    expect(slugName('already-a-slug')).toBe('already-a-slug');
  });

  it('collapses runs of punctuation and spaces to one dash', () => {
    expect(slugName('a   b')).toBe('a-b');
    expect(slugName('a --- b')).toBe('a-b');
    expect(slugName('a___b...c')).toBe('a-b-c');
    expect(slugName("O'Brien & Sons")).toBe('o-brien-sons');
  });

  it('trims leading and trailing separators', () => {
    expect(slugName('  Marty  ')).toBe('marty');
    expect(slugName('--marty--')).toBe('marty');
    expect(slugName('!!!Marty???')).toBe('marty');
    expect(slugName('  Mr. Wörld!! ').startsWith('mr-')).toBe(true);
  });

  it('turns an empty slug into "bot"', () => {
    for (const name of ['', ' ', '   ', '---', '___', '!!!', '...', '\n\t', '🚀', '🚀🚀', 'ÄÖÜ', '日本語', '😀 !!! 😀']) {
      expect(slugName(name), JSON.stringify(name)).toBe('bot');
    }
  });

  it('only ever outputs [a-z0-9-] with no empty, leading, trailing or doubled dashes', () => {
    const hostile = [
      'Marty',
      '../../etc/passwd',
      'a/b\\c',
      'name.zip',
      'CON',
      'x\u0000y',
      'line1\nline2',
      '"quoted"; rm -rf /',
      '<script>alert(1)</script>',
      'Wörld',
      'naïve café',
      '🚀 Rocket 🚀',
      'a'.repeat(500),
      '-',
      'a-',
      '-a',
      'Źalgo',
    ];
    for (const name of hostile) {
      const slug = slugName(name);
      expect(slug, JSON.stringify(name)).toMatch(SLUG);
    }
  });

  it('is idempotent', () => {
    for (const name of ['Marty', '  Mr. Wörld!! ', '', '---', 'Sir Reginald III', '../x', 'a--b']) {
      const once = slugName(name);
      expect(slugName(once), JSON.stringify(name)).toBe(once);
    }
  });

  it('treats non-ASCII letters as separators, not as transliterated letters (engineer reading)', () => {
    // The plan says "slugged to [a-z0-9-]" and nothing about folding accents, so the letter drops out.
    expect(slugName('Wörld')).toBe('w-rld');
    expect(slugName('  Mr. Wörld!! ')).toBe('mr-w-rld');
    expect(slugName('café')).toBe('caf');
  });
});

describe('zipFilename', () => {
  const profiles: ProfileId[] = [
    'muse',
    'openclaw',
    'hermes',
    'grok',
    'chatgpt-dot',
    'chatgpt-gpt',
    'chatgpt-instructions',
    'chatgpt-project',
  ];

  it('is <slug(name)>-<profile>.zip', () => {
    expect(zipFilename('Marty', 'openclaw')).toBe('marty-openclaw.zip');
    expect(zipFilename('Sir Reginald III', 'hermes')).toBe('sir-reginald-iii-hermes.zip');
    expect(zipFilename('Rook', 'chatgpt-project')).toBe('rook-chatgpt-project.zip');
  });

  it('works for every profile id', () => {
    for (const profile of profiles) {
      expect(zipFilename('Marty', profile)).toBe(`marty-${profile}.zip`);
    }
  });

  it('uses "bot" when the name slugs to nothing', () => {
    expect(zipFilename('', 'chatgpt-gpt')).toBe('bot-chatgpt-gpt.zip');
    expect(zipFilename('   ', 'muse')).toBe('bot-muse.zip');
    expect(zipFilename('!!!', 'grok')).toBe('bot-grok.zip');
    expect(zipFilename('🚀', 'openclaw')).toBe('bot-openclaw.zip');
    expect(zipFilename('日本語', 'hermes')).toBe('bot-hermes.zip');
  });

  it('is the same for an empty name and a name that is literally "bot"', () => {
    expect(zipFilename('', 'muse')).toBe(zipFilename('bot', 'muse'));
  });

  it('is a safe file name for hostile bot names: [a-z0-9-] stem, one .zip extension, no path parts', () => {
    const hostile = ['../../etc/passwd', 'a/b\\c', 'name.zip', 'x\u0000y', 'line1\nline2', '"quoted"; rm -rf /', 'a'.repeat(300)];
    for (const name of hostile) {
      for (const profile of ['openclaw', 'chatgpt-dot']) {
        const file = zipFilename(name, profile);
        expect(file, JSON.stringify(name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.zip$/);
        expect(file.endsWith(`-${profile}.zip`)).toBe(true);
        expect(file.includes('/') || file.includes('\\') || file.includes('..')).toBe(false);
      }
    }
  });

  it('names real roster builds with the profile they compile on', async () => {
    const { library } = await import('../src/compiler/compile.js');
    for (const entry of library.roster) {
      const file = zipFilename(entry.build.name, 'openclaw');
      expect(file, entry.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-openclaw\.zip$/);
    }
  });
});

// --- downloadZip -----------------------------------------------------------

interface FakeDom {
  log: string[];
  anchor: { href: string; download: string; style: { display: string }; click: () => void; remove: () => void };
  appended: unknown[];
  created: string[];
  blobs: Blob[];
  revoked: string[];
  urls: string[];
}

// Node has no document, so the test installs a recording stand-in. The real object URL functions are
// replaced with recorders so no blob is registered with the process.
function installFakeDom(): FakeDom {
  const dom: FakeDom = {
    log: [],
    anchor: {
      href: '',
      download: '',
      style: { display: '' },
      click: () => dom.log.push('click'),
      remove: () => dom.log.push('remove'),
    },
    appended: [],
    created: [],
    blobs: [],
    revoked: [],
    urls: [],
  };
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      dom.created.push(tag);
      dom.log.push(`create:${tag}`);
      return dom.anchor;
    },
    body: {
      appendChild: (el: unknown) => {
        dom.appended.push(el);
        dom.log.push('append');
        return el;
      },
    },
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
    dom.blobs.push(obj as Blob);
    const url = `blob:test/${dom.blobs.length}`;
    dom.urls.push(url);
    dom.log.push('createObjectURL');
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    dom.revoked.push(url);
    dom.log.push('revoke');
  });
  return dom;
}

describe('downloadZip', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const files: ZipFile[] = [
    { path: 'SOUL.md', content: '# Soul\n' },
    { path: 'skills/x/SKILL.md', content: 'é🚀\n' },
  ];

  it('does nothing where there is no document (node)', () => {
    expect(typeof document).toBe('undefined');
    const create = vi.spyOn(URL, 'createObjectURL');
    expect(() => downloadZip(files, 'marty-openclaw.zip')).not.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('does nothing where there is no URL', () => {
    const dom = installFakeDom();
    vi.stubGlobal('URL', undefined);
    expect(() => downloadZip(files, 'marty-openclaw.zip')).not.toThrow();
    expect(dom.created).toEqual([]);
    expect(dom.log).toEqual([]);
  });

  it('hands the browser one application/zip Blob that unzips to the given files', async () => {
    const dom = installFakeDom();
    vi.useFakeTimers();
    downloadZip(files, 'marty-openclaw.zip');

    expect(dom.blobs).toHaveLength(1);
    const blob = dom.blobs[0];
    expect(blob.type).toBe('application/zip');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const parsed = readZip(bytes);
    expect(parsed.entries.map((e) => e.name)).toEqual(files.map((f) => f.path));
    parsed.entries.forEach((entry, i) => {
      expect(sameBytes(entry.data, bytesOf(files[i].content)), entry.name).toBe(true);
      expect(entry.crc).toBe(crc32Reference(bytesOf(files[i].content)));
    });
    // The Blob is exactly what zipFiles gives for the same input.
    expect(sameBytes(bytes, zipFiles(files))).toBe(true);
  });

  it('clicks a hidden anchor with the object URL and the filename, then removes it', () => {
    const dom = installFakeDom();
    vi.useFakeTimers();
    downloadZip(files, zipFilename('Marty', 'openclaw'));

    expect(dom.created).toEqual(['a']);
    expect(dom.anchor.href).toBe(dom.urls[0]);
    expect(dom.anchor.download).toBe('marty-openclaw.zip');
    expect(dom.anchor.style.display).toBe('none');
    expect(dom.appended).toEqual([dom.anchor]);
    expect(dom.log.filter((l) => l === 'click')).toHaveLength(1);
    expect(dom.log.filter((l) => l === 'remove')).toHaveLength(1);
    const order = ['createObjectURL', 'create:a', 'append', 'click', 'remove'];
    expect(dom.log.filter((l) => order.includes(l))).toEqual(order);
  });

  it('revokes the object URL after the click, once, and not synchronously (engineer reading)', () => {
    const dom = installFakeDom();
    vi.useFakeTimers();
    downloadZip(files, 'marty-openclaw.zip');

    // Not revoked in the same tick: some mobile browsers start the download late.
    expect(dom.revoked).toEqual([]);

    vi.runAllTimers();
    expect(dom.revoked).toEqual([dom.urls[0]]);
    expect(dom.log.indexOf('revoke')).toBeGreaterThan(dom.log.indexOf('click'));
    expect(dom.log.filter((l) => l === 'revoke')).toHaveLength(1);

    // Nothing more fires later.
    vi.advanceTimersByTime(60_000);
    expect(dom.revoked).toHaveLength(1);
  });

  it('a second download makes its own URL and revokes its own', () => {
    const dom = installFakeDom();
    vi.useFakeTimers();
    downloadZip(files, 'one.zip');
    downloadZip(files.slice(0, 1), 'two.zip');
    vi.runAllTimers();
    expect(dom.urls).toHaveLength(2);
    expect(new Set(dom.urls).size).toBe(2);
    expect([...dom.revoked].sort()).toEqual([...dom.urls].sort());
  });
});
