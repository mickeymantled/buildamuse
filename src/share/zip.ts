// Zip download of the bundle's file deliveries. A hand-rolled "stored" zip: no compression, no dependency.
// Bytes are deterministic (fixed DOS timestamp). zipFiles, slugName and zipFilename are pure;
// downloadZip is the one browser-only function and does nothing where there is no document.

export interface ZipFile {
  path: string;
  content: string;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const VERSION = 20; // 2.0, the minimum for UTF-8 names and stored entries
const FLAG_UTF8 = 0x0800; // bit 11
const METHOD_STORED = 0;
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const MAX_16 = 0xffff;
const MAX_32 = 0xffffffff;

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

export function zipFiles(files: ZipFile[]): Uint8Array<ArrayBuffer> {
  if (files.length > MAX_16) throw new RangeError('zip: too many files');
  const encoder = new TextEncoder();
  const entries: Entry[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    if (name.length > MAX_16) throw new RangeError('zip: path too long');
    entries.push({ name, data, crc: crc32(data), offset });
    offset += 30 + name.length + data.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const e of entries) centralSize += 46 + e.name.length;
  const total = centralStart + centralSize + 22;
  if (total > MAX_32) throw new RangeError('zip: archive too large');

  const out = new Uint8Array(new ArrayBuffer(total));
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number): void => {
    view.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number): void => {
    view.setUint32(p, v, true);
    p += 4;
  };
  const bytes = (b: Uint8Array): void => {
    out.set(b, p);
    p += b.length;
  };

  for (const e of entries) {
    u32(LOCAL_SIG);
    u16(VERSION);
    u16(FLAG_UTF8);
    u16(METHOD_STORED);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0); // extra length
    bytes(e.name);
    bytes(e.data);
  }
  for (const e of entries) {
    u32(CENTRAL_SIG);
    u16(VERSION); // made by
    u16(VERSION); // needed
    u16(FLAG_UTF8);
    u16(METHOD_STORED);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0); // extra length
    u16(0); // comment length
    u16(0); // disk number start
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(e.offset);
    bytes(e.name);
  }
  u32(END_SIG);
  u16(0); // this disk
  u16(0); // disk with the central directory
  u16(entries.length);
  u16(entries.length);
  u32(centralSize);
  u32(centralStart);
  u16(0); // comment length
  return out;
}

// Lowercase [a-z0-9-] only, runs of anything else collapsed to one dash, no edge dashes.
export function slugName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'bot' : slug;
}

export function zipFilename(name: string, profile: string): string {
  return `${slugName(name)}-${profile}.zip`;
}

export function downloadZip(files: ZipFile[], filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([zipFiles(files)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click, with a delay: some mobile browsers start the download late.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
