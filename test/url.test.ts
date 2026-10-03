// Link helper tests (M4 slice 4.7a, src/share/url.ts). Plan section 3 and QUESTIONS W7.
// A share link is origin + path + "#b=<payload>", never a query string. The one query param the app
// knows is remix=1 (a remix link is origin + path + "?remix=1#b=<payload>"). The app reads the link once,
// then replaces the address bar with cleanHref, so the build never lingers in history.
// Expected values come from the plan, the W7 reading and the engineer's stated readings, never from
// running the helpers and copying the output. The payload's own encoding is covered in share.test.ts;
// here the payload is only checked as an opaque token that must survive a URL round trip.

import { describe, it, expect } from 'vitest';

import { library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import {
  decodeBuild,
  encodeBuild,
  fromShareHash,
  ShareDecodeError,
  toShareHash,
} from '../src/share/encode.js';
import { cleanHref, readLocation, shareUrl } from '../src/share/url.js';
import type { Build, BuildV1 } from '../src/compiler/types.js';

// --- Helpers ---------------------------------------------------------------

function starter(id: string): Build {
  const spec = GOLDEN_SPECS.find((s) => s.id === `${id}.muse`);
  if (!spec) throw new Error(`no golden spec for starter "${id}"`);
  return buildFor(spec, library);
}

function rosterV1(id: string): BuildV1 {
  const entry = library.roster.find((r) => r.id === id);
  if (!entry) throw new Error(`roster entry "${id}" not found`);
  return structuredClone(entry.build);
}

// A remix link as the Remix flow writes it: the query sits before the hash.
function remixLink(origin: string, pathname: string, build: Build): string {
  return `${origin}${pathname}?remix=1${toShareHash(build)}`;
}

// What the App hook does with a link: read the payload and decode it.
function loadedFrom(href: string): Build {
  const { payload } = readLocation(href);
  if (payload === undefined) throw new Error('link has no payload');
  return decodeBuild(payload, library).build;
}

const ORIGINS_AND_PATHS: [string, string][] = [
  ['https://x.dev', '/app/'],
  ['https://x.dev', '/app'],
  ['https://x.dev', '/'],
  ['http://localhost:5173', '/'],
  ['https://someone.github.io', '/buildamuse/'],
  ['https://x.dev:8443', '/a/b/c/'],
];

// --- shareUrl --------------------------------------------------------------

describe('shareUrl: origin + pathname + "#b=" + payload', () => {
  it('is exactly origin, pathname, then the hash from toShareHash', () => {
    const build = starter('marty');
    expect(shareUrl('https://x.dev', '/app/', build)).toBe(
      'https://x.dev/app/#b=' + encodeBuild(build),
    );
  });

  it('puts the payload in the hash and never writes a query string', () => {
    for (const [origin, path] of ORIGINS_AND_PATHS) {
      const url = shareUrl(origin, path, starter('june'));
      expect(url.startsWith(origin + path + '#b=')).toBe(true);
      expect(url).not.toContain('?');
      expect(url.split('#')).toHaveLength(2);
    }
  });

  it('keeps the pathname as given, with or without a trailing slash', () => {
    const build = starter('rook');
    expect(shareUrl('https://x.dev', '/app/', build).startsWith('https://x.dev/app/#b=')).toBe(true);
    expect(shareUrl('https://x.dev', '/app', build).startsWith('https://x.dev/app#b=')).toBe(true);
  });

  it('writes a payload made only of url-safe base64 characters', () => {
    const build: Build = { ...starter('marty'), name: 'Zoë 日本語 🎲 a+b/c=d&e#f?g' };
    const hash = shareUrl('https://x.dev', '/app/', build).split('#')[1];
    expect(hash.startsWith('b=')).toBe(true);
    expect(hash.slice(2)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('accepts a v1 build and the link decodes to a v2 build', () => {
    const v1 = rosterV1('marty');
    const url = shareUrl('https://x.dev', '/app/', v1);
    const decoded = loadedFrom(url);
    expect(decoded.v).toBe(2);
    expect(decoded).toEqual(migrate(v1, { target: 'muse' }));
  });
});

// --- Round trip ------------------------------------------------------------

describe('round trip: readLocation(shareUrl(...)) gives a payload that decodes to the same build', () => {
  for (const spec of GOLDEN_SPECS) {
    it(`${spec.id}: payload decodes to the build`, () => {
      const build = buildFor(spec, library);
      const read = readLocation(shareUrl('https://x.dev', '/app/', build));
      expect(read.remix).toBe(false);
      expect(read.payload).toBeDefined();
      const decoded = decodeBuild(read.payload as string, library);
      expect(decoded.build).toEqual(build);
      expect(decoded.warnings).toEqual([]);
      expect(decoded.drops).toEqual([]);
    });
  }

  it('holds for each origin and path shape, including a root path and no trailing slash', () => {
    const build = starter('june');
    for (const [origin, path] of ORIGINS_AND_PATHS) {
      expect(loadedFrom(shareUrl(origin, path, build))).toEqual(build);
    }
  });

  it('holds for a name with spaces and non-ASCII text', () => {
    const build: Build = { ...starter('sol'), name: 'Zoë 日本語 🎲 a+b/c=d&e#f?g' };
    expect(loadedFrom(shareUrl('https://x.dev', '/app/', build))).toEqual(build);
  });

  it('holds for a build with roles', () => {
    const spec = GOLDEN_SPECS.find((s) => s.id === 'marty.openclaw.roles');
    if (!spec) throw new Error('missing golden spec');
    const build = buildFor(spec, library);
    expect(build.roles).toEqual(['scout', 'risk-manager', 'journal']);
    expect(loadedFrom(shareUrl('https://x.dev', '/app/', build))).toEqual(build);
  });

  it('gives the same payload as the hash the encoder makes', () => {
    const build = starter('rook');
    expect(readLocation(shareUrl('https://x.dev', '/app/', build)).payload).toBe(
      toShareHash(build).slice('#b='.length),
    );
  });

  it('agrees with fromShareHash on the hash of the same link', () => {
    const build = starter('june');
    const url = shareUrl('https://x.dev', '/app/', build);
    const viaHelper = loadedFrom(url);
    const viaHash = fromShareHash(new URL(url).hash, library).build;
    expect(viaHelper).toEqual(viaHash);
    expect(viaHelper).toEqual(build);
  });

  it('a remix link reads the same payload, with remix true', () => {
    for (const [origin, path] of ORIGINS_AND_PATHS) {
      const build = starter('marty');
      const read = readLocation(remixLink(origin, path, build));
      expect(read.remix).toBe(true);
      expect(decodeBuild(read.payload as string, library).build).toEqual(build);
    }
  });
});

// --- readLocation: remix ---------------------------------------------------

describe('readLocation: remix detection', () => {
  it('a plain visit has no payload and no remix', () => {
    const read = readLocation('https://x.dev/app/');
    expect(read.payload).toBeUndefined();
    expect(read.remix).toBe(false);
  });

  it('?remix=1 alone is a remix with no payload', () => {
    const read = readLocation('https://x.dev/app/?remix=1');
    expect(read.remix).toBe(true);
    expect(read.payload).toBeUndefined();
  });

  it('?remix=1 with a hash is a remix with the payload', () => {
    expect(readLocation('https://x.dev/app/?remix=1#b=abc_-')).toEqual({
      payload: 'abc_-',
      remix: true,
    });
  });

  it('finds remix=1 with other params before, after and around it', () => {
    expect(readLocation('https://x.dev/?a=1&remix=1&b=2#b=abc').remix).toBe(true);
    expect(readLocation('https://x.dev/?remix=1&a=1#b=abc').remix).toBe(true);
    expect(readLocation('https://x.dev/?a=1&b=2&remix=1#b=abc').remix).toBe(true);
    expect(readLocation('https://x.dev/?a=1&b=2&remix=1#b=abc').payload).toBe('abc');
  });

  it('other params without remix are not a remix', () => {
    expect(readLocation('https://x.dev/?a=1&b=2#b=abc')).toEqual({ payload: 'abc', remix: false });
  });

  it('remix is true only for the value 1', () => {
    for (const value of ['2', '0', '', 'true', 'yes', '11', '01', ' 1']) {
      expect(readLocation(`https://x.dev/?remix=${value}#b=abc`).remix).toBe(false);
    }
    expect(readLocation('https://x.dev/?remix#b=abc').remix).toBe(false);
  });

  it('a param that only starts or ends like remix does not count', () => {
    expect(readLocation('https://x.dev/?remixer=1#b=abc').remix).toBe(false);
    expect(readLocation('https://x.dev/?xremix=1#b=abc').remix).toBe(false);
    expect(readLocation('https://x.dev/?Remix=1#b=abc').remix).toBe(false);
  });

  it('a remix in the hash does not count', () => {
    expect(readLocation('https://x.dev/#b=abc&remix=1')).toEqual({ payload: 'abc', remix: false });
    expect(readLocation('https://x.dev/#remix=1&b=abc')).toEqual({ payload: 'abc', remix: false });
  });

  it('a "?remix=1" written after the "#" belongs to the hash, not the query', () => {
    expect(readLocation('https://x.dev/#b=abc?remix=1').remix).toBe(false);
  });
});

// --- readLocation: payload -------------------------------------------------

describe('readLocation: payload', () => {
  it('no hash means no payload', () => {
    expect(readLocation('https://x.dev/app/').payload).toBeUndefined();
    expect(readLocation('https://x.dev/app/?a=1').payload).toBeUndefined();
  });

  it('an empty hash means no payload', () => {
    expect(readLocation('https://x.dev/app/#').payload).toBeUndefined();
  });

  it('reads #b=<payload>', () => {
    expect(readLocation('https://x.dev/app/#b=abc_-XYZ019')).toEqual({
      payload: 'abc_-XYZ019',
      remix: false,
    });
  });

  it('a ?b= query is not read as a payload', () => {
    expect(readLocation('https://x.dev/app/?b=abc')).toEqual({ remix: false });
    expect(readLocation('https://x.dev/app/?b=abc&remix=1')).toEqual({ remix: true });
  });

  it('with both ?b= and #b=, the hash wins', () => {
    expect(readLocation('https://x.dev/app/?b=fromquery#b=fromhash').payload).toBe('fromhash');
  });

  it('finds the payload when the hash has other keys, before or after it', () => {
    expect(readLocation('https://x.dev/#x=1&b=abc').payload).toBe('abc');
    expect(readLocation('https://x.dev/#b=abc&x=1').payload).toBe('abc');
    expect(readLocation('https://x.dev/#x=1&b=abc&y=2').payload).toBe('abc');
  });

  it('a hash with other keys and no b= has no payload', () => {
    expect(readLocation('https://x.dev/#x=1&y=2').payload).toBeUndefined();
  });

  it('the key is exactly "b": a longer or differently cased key is not a payload', () => {
    expect(readLocation('https://x.dev/#ab=abc').payload).toBeUndefined();
    expect(readLocation('https://x.dev/#bb=abc').payload).toBeUndefined();
    expect(readLocation('https://x.dev/#B=abc').payload).toBeUndefined();
    expect(readLocation('https://x.dev/#b').payload).toBeUndefined();
  });

  it('the first b= wins when there are two', () => {
    expect(readLocation('https://x.dev/#b=one&b=two').payload).toBe('one');
  });

  it('an empty "#b=" is an empty payload, not a missing one, so decode reports the error', () => {
    const read = readLocation('https://x.dev/#b=');
    expect(read.payload).toBe('');
    expect(() => decodeBuild(read.payload as string, library)).toThrow(ShareDecodeError);
  });

  it('a payload that is not a build is passed through for decode to reject', () => {
    const read = readLocation('https://x.dev/#b=!!!not-a-build');
    expect(read.payload).toBe('!!!not-a-build');
    expect(() => decodeBuild(read.payload as string, library)).toThrow(ShareDecodeError);
  });

  it('keeps the payload apart from the path and query of the link', () => {
    const build = starter('june');
    const read = readLocation(shareUrl('https://x.dev', '/a/b/', build));
    expect(read.payload).not.toContain('/a/b/');
    expect(read.payload).not.toContain('x.dev');
  });
});

// --- readLocation: bad input -----------------------------------------------

describe('readLocation: an href that does not parse', () => {
  it('reads as an ordinary visit and does not throw', () => {
    for (const href of ['not a url', '', '   ', '://nope', '/relative/path?remix=1#b=abc']) {
      expect(() => readLocation(href)).not.toThrow();
      expect(readLocation(href)).toEqual({ remix: false });
    }
  });
});

// --- cleanHref -------------------------------------------------------------

// Plan section 3 (Links): the hook calls history.replaceState to "the clean origin + pathname".
// W7: the link is "cleared from the address bar". The plan names no case where another query param
// survives, so cleanHref is origin + pathname for every input, with or without a query. If other
// params should ever be kept, that is a plan change to put to Brian, not something a test decides.
describe('cleanHref: origin + pathname only, no query and no hash', () => {
  it('drops remix=1 and the hash', () => {
    expect(cleanHref('https://x.dev/app/?remix=1#b=abc')).toBe('https://x.dev/app/');
  });

  it('drops the hash of a plain share link', () => {
    expect(cleanHref('https://x.dev/app/#b=abc')).toBe('https://x.dev/app/');
  });

  it('drops remix and every other param, wherever remix sits', () => {
    expect(cleanHref('https://x.dev/app/?a=1&remix=1&b=2#b=abc')).toBe('https://x.dev/app/');
    expect(cleanHref('https://x.dev/app/?remix=1&a=1&b=2#b=abc')).toBe('https://x.dev/app/');
    expect(cleanHref('https://x.dev/app/?a=1&b=2&remix=1#b=abc')).toBe('https://x.dev/app/');
  });

  it('drops the query when remix is absent, with or without a hash', () => {
    expect(cleanHref('https://x.dev/app/?a=1&b=2#b=abc')).toBe('https://x.dev/app/');
    expect(cleanHref('https://x.dev/app/?a=1&b=2')).toBe('https://x.dev/app/');
  });

  it('leaves no trailing "?" when remix was the only param', () => {
    expect(cleanHref('https://x.dev/app/?remix=1')).toBe('https://x.dev/app/');
    expect(cleanHref('https://x.dev/app/?remix=1#b=abc').endsWith('?')).toBe(false);
  });

  it('leaves no trailing "?" or "#" on a bare "?" or "#" in the input', () => {
    expect(cleanHref('https://x.dev/app/?')).toBe('https://x.dev/app/');
    expect(cleanHref('https://x.dev/app/#')).toBe('https://x.dev/app/');
  });

  it('returns a link with no query and no hash unchanged', () => {
    expect(cleanHref('https://x.dev/app/')).toBe('https://x.dev/app/');
    expect(cleanHref('https://x.dev/app')).toBe('https://x.dev/app');
  });

  it('drops a query however it is spelled or ordered', () => {
    expect(cleanHref('https://x.dev/?q=a%20b&x=a+b&z=%E2%9C%93&remix=1#b=abc')).toBe('https://x.dev/');
    expect(cleanHref('https://x.dev/?b=2&a=1&remix=1')).toBe('https://x.dev/');
  });

  it('drops repeated params of any name', () => {
    expect(cleanHref('https://x.dev/?a=1&remix=1&a=2')).toBe('https://x.dev/');
    expect(cleanHref('https://x.dev/?remix=1&a=1&remix=1')).toBe('https://x.dev/');
  });

  it('drops a remix param whatever its value, so a stray remix=2 leaves the address bar too', () => {
    expect(cleanHref('https://x.dev/?remix=2&a=1')).toBe('https://x.dev/');
    expect(cleanHref('https://x.dev/?a=1&remix=#b=abc')).toBe('https://x.dev/');
    expect(cleanHref('https://x.dev/?a=1&remix')).toBe('https://x.dev/');
  });

  it('drops params that only look like remix, since no query survives', () => {
    expect(cleanHref('https://x.dev/?remixer=1&xremix=1&remix2=1&Remix=1')).toBe('https://x.dev/');
  });

  it('drops a remix param written with a percent-encoded name, as readLocation reads it', () => {
    const href = 'https://x.dev/?%72emix=1&a=1#b=abc';
    expect(readLocation(href).remix).toBe(true);
    expect(cleanHref(href)).toBe('https://x.dev/');
  });

  it('is exactly origin + pathname for a link with a query and for the same link without one', () => {
    const withQuery = 'https://x.dev:8443/a/b/?a=1&remix=1&utm_source=x#b=abc';
    const withoutQuery = 'https://x.dev:8443/a/b/#b=abc';
    expect(cleanHref(withQuery)).toBe('https://x.dev:8443/a/b/');
    expect(cleanHref(withoutQuery)).toBe('https://x.dev:8443/a/b/');
    expect(cleanHref(withQuery)).toBe(cleanHref(withoutQuery));
  });

  it('never returns a "?" for a parseable link', () => {
    for (const href of [
      'https://x.dev/?',
      'https://x.dev/app/?a=1',
      'https://x.dev/app/?remix=1#b=abc',
      'http://localhost:5173/?q=a+b',
    ]) {
      expect(cleanHref(href)).not.toContain('?');
    }
  });

  it('keeps a path with a trailing slash, a nested path and a path without a slash', () => {
    expect(cleanHref('https://x.dev/a/b/?remix=1#b=abc')).toBe('https://x.dev/a/b/');
    expect(cleanHref('https://x.dev/a/b?remix=1#b=abc')).toBe('https://x.dev/a/b');
    expect(cleanHref('https://x.dev/index.html?remix=1#b=abc')).toBe('https://x.dev/index.html');
  });

  it('gives a bare origin the root path', () => {
    expect(cleanHref('https://x.dev#b=abc')).toBe('https://x.dev/');
    expect(cleanHref('https://x.dev?remix=1#b=abc')).toBe('https://x.dev/');
  });

  it('keeps the port and the scheme', () => {
    expect(cleanHref('http://localhost:5173/?remix=1#b=abc')).toBe('http://localhost:5173/');
    expect(cleanHref('https://x.dev:8443/app/#b=abc')).toBe('https://x.dev:8443/app/');
  });

  it('a file: href keeps its path and does not print "null"', () => {
    const out = cleanHref('file:///Users/me/app/index.html?remix=1#b=abc');
    expect(out).toBe('file:///Users/me/app/index.html');
    expect(out).not.toContain('null');
  });

  it('an href that does not parse comes back with anything from "#" onward cut off, and does not throw', () => {
    expect(() => cleanHref('not a url#b=abc')).not.toThrow();
    expect(cleanHref('not a url#b=abc')).toBe('not a url');
    expect(cleanHref('not a url')).toBe('not a url');
    expect(cleanHref('')).toBe('');
  });

  it('never returns a "#" and never leaves a remix param, for any of these links', () => {
    const hrefs = [
      'https://x.dev/',
      'https://x.dev/app/#b=abc',
      'https://x.dev/app/?remix=1#b=abc',
      'https://x.dev/app/?a=1&remix=1&b=2#b=abc&x=1',
      'https://x.dev/?remix=2',
      'https://x.dev/?remix=1&remix=1',
      'https://x.dev/?%72emix=1',
      'http://localhost:5173/a/b/?remix=1&q=a+b#b=abc',
    ];
    for (const href of hrefs) {
      const out = cleanHref(href);
      expect(out).not.toContain('#');
      expect(readLocation(out)).toEqual({ remix: false });
      expect(new URL(out).searchParams.has('remix')).toBe(false);
    }
  });

  it('is idempotent', () => {
    for (const href of [
      'https://x.dev/app/?a=1&remix=1&b=2#b=abc',
      'https://x.dev/app/#b=abc',
      'https://x.dev/',
      'not a url#b=abc',
    ]) {
      expect(cleanHref(cleanHref(href))).toBe(cleanHref(href));
    }
  });
});

// --- Link lifecycle --------------------------------------------------------

describe('link lifecycle: read once, then the address bar shows origin + path', () => {
  it('cleaning a share link gives back origin + pathname', () => {
    for (const [origin, path] of ORIGINS_AND_PATHS) {
      const url = shareUrl(origin, path, starter('marty'));
      expect(cleanHref(url)).toBe(origin + path);
    }
  });

  it('cleaning a remix link gives back origin + pathname', () => {
    for (const [origin, path] of ORIGINS_AND_PATHS) {
      expect(cleanHref(remixLink(origin, path, starter('marty')))).toBe(origin + path);
    }
  });

  it('the cleaned address holds no build: a reload reads as a plain visit', () => {
    const link = remixLink('https://x.dev', '/app/', starter('june'));
    expect(readLocation(link).payload).toBeDefined();
    expect(readLocation(cleanHref(link))).toEqual({ remix: false });
  });

  it('cleaning a link with a param the app does not know still gives origin + pathname', () => {
    const link = 'https://x.dev/app/?utm_source=x&remix=1' + toShareHash(starter('june'));
    expect(cleanHref(link)).toBe('https://x.dev/app/');
    expect(readLocation(link).remix).toBe(true);
  });
});
