// Share link tests (M2 slice 24). A build travels as "#b=<base64url(JSON(build))>" with minified keys.
// Brief: "A v1 link must decode and compile with no errors."
// Done criterion: "a v1 Marty link decodes to v2 and compiles".
// Migration map (brief): memecoins or solana -> memecoins, prediction markets -> prediction-markets,
// options or stocks -> spot, engineering -> coding, sales -> sales, kids -> personal-ops, others -> none.
// Expected values come from the brief, the design and the library JSON, never from compiler output.
// The one thing taken from the code is the fixed key map (docs say only "a fixed key map"); a change
// to it breaks every old link, so it is pinned here on purpose.

import { describe, it, expect } from 'vitest';

import { compile, library } from '../src/compiler/compile.js';
import { migrate } from '../src/compiler/migrate.js';
import { GOLDEN_SPECS, buildFor } from '../tools/golden.js';
import {
  decodeBuild,
  encodeBuild,
  fromShareHash,
  ShareDecodeError,
  toShareHash,
} from '../src/share/encode.js';
import type { Build, BuildV1 } from '../src/compiler/types.js';

// --- Helpers ---------------------------------------------------------------

function rosterV1(id: string): BuildV1 {
  const entry = library.roster.find((r) => r.id === id);
  if (!entry) throw new Error(`roster entry "${id}" not found`);
  return structuredClone(entry.build);
}

// An independent base64url writer (Node's own), so the hand-written one in encode.ts is cross-checked.
function payloadOfJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

// Builds a payload for a deliberately wrong build. The cast is the point of the helper.
function badPayload(build: unknown): string {
  return encodeBuild(build as Build);
}

// Runs decodeBuild on a payload that must fail, and returns the typed error so a test can read the message.
function decodeFailure(payload: string): ShareDecodeError {
  let error: unknown;
  try {
    decodeBuild(payload, library);
  } catch (e) {
    error = e;
  }
  if (error === undefined) throw new Error('decodeBuild returned a build; it should have thrown');
  expect(error).toBeInstanceOf(ShareDecodeError);
  return error as ShareDecodeError;
}

function payloadOfHash(hash: string): string {
  return hash.replace(/^#b=/, '');
}

function martyV2(): Build {
  return migrate(rosterV1('marty'), { target: 'muse' });
}

// --- v1 Marty link -> v2 ---------------------------------------------------

describe('Share: a v1 Marty link decodes to v2 and compiles', () => {
  it('roster v1 Marty -> toShareHash -> fromShareHash gives the v2 build', () => {
    const hash = toShareHash(rosterV1('marty'));
    const { build, warnings } = fromShareHash(hash, library);

    expect(warnings).toEqual([]);
    expect(build).toEqual({
      v: 2,
      base: 'trader',
      chips: ['memecoins', 'solana', 'nba', 'night_owl'],
      stats: { blunt: 4, warm: 1, funny: 3, chatty: 1, proactive: 1, risk: 4 },
      peeves: [],
      heart: { hardPart: 'forget', d1: 'd1.chip.memecoins', d2: 'd2.blunt.4' },
      outfit: 'terminally_online',
      name: 'Marty',
      target: 'muse',
      packs: ['memecoins'],
      limits: {},
      gates: {},
    });
  });

  it("carries every one of Marty's v1 fields from the library roster", () => {
    const v1 = rosterV1('marty');
    const { build } = fromShareHash(toShareHash(v1), library);
    const { v: _v, ...fields } = v1;
    expect(build.v).toBe(2);
    expect(build).toMatchObject(fields);
  });

  it('has target muse, one pack (memecoins and solana collapse), empty gates and limits, no roles', () => {
    const { build } = fromShareHash(toShareHash(rosterV1('marty')), library);
    expect(build.target).toBe('muse');
    expect(build.packs).toEqual(['memecoins']);
    expect(build.gates).toEqual({});
    expect(build.limits).toEqual({});
    expect(build.roles).toBeUndefined();
    expect(build.mode).toBeUndefined();
    expect(build.plan).toBeUndefined();
  });

  it('compile() of the decoded build does not throw and returns a soul', () => {
    const { build } = fromShareHash(toShareHash(rosterV1('marty')), library);
    let result: ReturnType<typeof compile> | undefined;
    expect(() => {
      result = compile(build);
    }).not.toThrow();
    expect(result?.soul.length).toBeGreaterThan(0);
    expect(result?.profile).toBe('muse');
    expect(result?.packs).toEqual(['memecoins']);
  });

  it('a hand-minified v1 Marty payload (no encodeBuild) decodes the same way', () => {
    // What a link made before v2 carries: v1 build, fixed minified keys, base64url of the JSON.
    const payload = payloadOfJson({
      v: 1,
      b: 'trader',
      c: ['memecoins', 'solana', 'nba', 'night_owl'],
      s: { bl: 4, w: 1, f: 3, ch: 1, p: 1, r: 4 },
      pv: [],
      h: { hp: 'forget', d1: 'd1.chip.memecoins', d2: 'd2.blunt.4' },
      o: 'terminally_online',
      n: 'Marty',
    });
    const { build, warnings } = fromShareHash(`#b=${payload}`, library);

    expect(warnings).toEqual([]);
    expect(build).toEqual(martyV2());
    expect(() => compile(build)).not.toThrow();
  });

  it('decoding a v1 Marty link then compiling equals compiling the migrated roster build', () => {
    const { build } = fromShareHash(toShareHash(rosterV1('marty')), library);
    expect(build).toEqual(martyV2());
    expect(compile(build)).toEqual(compile(martyV2()));
  });
});

// --- Every roster starter's v1 link ---------------------------------------

describe('Share: every roster starter v1 link decodes and compiles', () => {
  for (const entry of library.roster) {
    describe(entry.id, () => {
      const hash = toShareHash(entry.build);

      it('decodes with no warnings to a v2 muse build equal to the migrated starter', () => {
        const { build, warnings } = fromShareHash(hash, library);
        expect(warnings).toEqual([]);
        expect(build.v).toBe(2);
        expect(build.target).toBe('muse');
        expect(build).toEqual(migrate(entry.build, { target: 'muse' }));
      });

      it('compiles with no error and keeps the library build name', () => {
        const { build } = fromShareHash(hash, library);
        const result = compile(build);
        expect(result.soul.length).toBeGreaterThan(0);
        expect(result.buildName).toBe(entry.buildName);
      });
    });
  }
});

// --- Migration map through a link -----------------------------------------

describe('Share: migration map per starter', () => {
  // Hand-derived from the brief's map and each starter's chips in the library roster.
  const EXPECTED_PACKS: Record<string, string[]> = {
    marty: ['memecoins'], // memecoins, solana, nba, night_owl
    odds: ['prediction-markets', 'spot'], // prediction_markets, stocks, early_riser
    june: ['personal-ops'], // kids, cooking, dog, phone
    rook: ['coding'], // engineering, founder, gaming, night_owl
    dash: ['sales'], // founder, sales, meetings
    vera: [], // law, meetings
    sol: [], // student, music
    pip: [], // gym, cooking, dog, phone
    ink: [], // creative, music
  };

  it('the expected table covers exactly the roster', () => {
    expect(Object.keys(EXPECTED_PACKS).sort()).toEqual(library.roster.map((r) => r.id).sort());
  });

  for (const [id, packs] of Object.entries(EXPECTED_PACKS)) {
    it(`${id} -> [${packs.join(', ')}]`, () => {
      const { build } = fromShareHash(toShareHash(rosterV1(id)), library);
      expect(build.packs).toEqual(packs);
      expect(build.gates).toEqual({});
      expect(build.limits).toEqual({});
      expect(build.roles).toBeUndefined();
    });
  }
});

describe('Share: migration map per chip', () => {
  // The brief's map keyed by library chip id ("prediction markets" is the prediction_markets chip).
  const CHIP_TO_PACKS: Record<string, string[]> = {
    memecoins: ['memecoins'],
    solana: ['memecoins'],
    prediction_markets: ['prediction-markets'],
    options: ['spot'],
    stocks: ['spot'],
    engineering: ['coding'],
    sales: ['sales'],
    kids: ['personal-ops'],
  };

  it('every mapped chip id exists in the library', () => {
    const ids = new Set(library.chips.map((c) => c.id));
    for (const chip of Object.keys(CHIP_TO_PACKS)) expect(ids.has(chip)).toBe(true);
  });

  for (const chip of library.chips) {
    const expected = CHIP_TO_PACKS[chip.id] ?? [];
    it(`chip ${chip.id} -> ${expected.length === 0 ? 'none' : expected.join(', ')}`, () => {
      // Decode never validates cross-field rules, so one chip on Vera's build is enough.
      const v1: BuildV1 = { ...rosterV1('vera'), chips: [chip.id] };
      const { build, warnings } = fromShareHash(toShareHash(v1), library);
      expect(warnings).toEqual([]);
      expect(build.packs).toEqual(expected);
    });
  }

  it('two chips that map to one pack give that pack once', () => {
    const memes: BuildV1 = { ...rosterV1('marty'), chips: ['solana', 'memecoins'] };
    expect(fromShareHash(toShareHash(memes), library).build.packs).toEqual(['memecoins']);
    const spot: BuildV1 = { ...rosterV1('odds'), chips: ['options', 'stocks'] };
    expect(fromShareHash(toShareHash(spot), library).build.packs).toEqual(['spot']);
  });

  it('packs follow chip tap order', () => {
    const v1: BuildV1 = { ...rosterV1('odds'), chips: ['stocks', 'prediction_markets'] };
    expect(fromShareHash(toShareHash(v1), library).build.packs).toEqual(['spot', 'prediction-markets']);
  });

  it('a v1 link whose chips map to more than three packs keeps three and still compiles', () => {
    // Six chips (the v1 max) that map to six distinct packs' worth of chips. v2 allows 0..3 packs.
    const v1: BuildV1 = {
      ...rosterV1('marty'),
      chips: ['memecoins', 'prediction_markets', 'stocks', 'engineering', 'sales', 'kids'],
    };
    const { build } = fromShareHash(toShareHash(v1), library);
    expect(build.packs).toEqual(['memecoins', 'prediction-markets', 'spot']);
    expect(() => compile(build)).not.toThrow();
  });
});

// --- Round trips -----------------------------------------------------------

describe('Share: every golden build round-trips', () => {
  it('there is at least one golden spec', () => {
    expect(GOLDEN_SPECS.length).toBeGreaterThan(0);
  });

  for (const spec of GOLDEN_SPECS) {
    it(`${spec.id}: encode then decode deep-equals, no warnings`, () => {
      const build = buildFor(spec, library);
      const { build: decoded, warnings } = decodeBuild(encodeBuild(build), library);
      expect(warnings).toEqual([]);
      expect(decoded).toEqual(build);
    });

    it(`${spec.id}: the hash round-trips and the decoded build compiles to the same bundle`, () => {
      const build = buildFor(spec, library);
      const { build: decoded, warnings } = fromShareHash(toShareHash(build), library);
      expect(warnings).toEqual([]);
      expect(decoded).toEqual(build);
      expect(compile(decoded)).toEqual(compile(build));
    });
  }

  it('target, mode, plan and roles survive the trip', () => {
    const spec = GOLDEN_SPECS.find((s) => s.id === 'marty.chatgpt-instructions-paid');
    if (!spec) throw new Error('golden spec marty.chatgpt-instructions-paid not found');
    const { build } = decodeBuild(encodeBuild(buildFor(spec, library)), library);
    expect(build.target).toBe('chatgpt');
    expect(build.mode).toBe('instructions');
    expect(build.plan).toBe('paid');

    const roles = GOLDEN_SPECS.find((s) => s.id === 'rook.hermes.roles');
    if (!roles) throw new Error('golden spec rook.hermes.roles not found');
    const decodedRoles = decodeBuild(encodeBuild(buildFor(roles, library)), library).build;
    expect(decodedRoles.target).toBe('hermes');
    expect(decodedRoles.roles).toEqual(['planner', 'implementer', 'reviewer', 'tester']);
  });

  it('gate and limit overrides survive the trip and still compile', () => {
    // Stricter than the memecoins defaults (trade approve, per_trade_pct 1), so the build is valid.
    const build: Build = {
      ...martyV2(),
      gates: { trade: 'forbid' },
      limits: { per_trade_pct: 0.5, daily_loss_pct: 2 },
    };
    const { build: decoded, warnings } = decodeBuild(encodeBuild(build), library);
    expect(warnings).toEqual([]);
    expect(decoded).toEqual(build);
    expect(() => compile(decoded)).not.toThrow();
  });

  it('a name with non-ASCII text and every length mod 3 round-trips', () => {
    for (const name of ['A', 'AB', 'ABC', 'ABCD', 'Zoë', 'Zoë \u{1F642}', 'マーティ']) {
      const build: Build = { ...martyV2(), name };
      const { build: decoded } = decodeBuild(encodeBuild(build), library);
      expect(decoded.name).toBe(name);
      expect(decoded).toEqual(build);
    }
  });

  it('the payload is valid base64url for the same JSON Node would encode', () => {
    const build = martyV2();
    const payload = encodeBuild(build);
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    // Re-encoding the decoded JSON with Node's encoder gives back the exact payload (no padding).
    expect(Buffer.from(json, 'utf8').toString('base64url')).toBe(payload);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('keys are minified, so the payload is shorter than the plain-key encoding', () => {
    const build = martyV2();
    const plain = Buffer.from(JSON.stringify(build), 'utf8').toString('base64url');
    const payload = encodeBuild(build);
    expect(payload.length).toBeLessThan(plain.length);
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(json).not.toHaveProperty('base');
    expect(json).not.toHaveProperty('chips');
    expect(json).not.toHaveProperty('target');
    expect(json.v).toBe(2);
  });
});

// --- The hash, never a query string ---------------------------------------

describe('Share: the hash never uses a query string', () => {
  const builds: { label: string; build: Build | BuildV1 }[] = [
    ...library.roster.map((r) => ({ label: `v1 ${r.id}`, build: r.build })),
    ...GOLDEN_SPECS.map((s) => ({ label: `v2 ${s.id}`, build: buildFor(s, library) })),
  ];

  for (const { label, build } of builds) {
    it(`${label}: starts with #b= and has no ? or &`, () => {
      const hash = toShareHash(build);
      expect(hash.startsWith('#b=')).toBe(true);
      expect(hash).not.toContain('?');
      expect(hash).not.toContain('&');
      // base64url alphabet only: no +, / or = padding to be escaped in a URL.
      expect(payloadOfHash(hash)).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  }

  it('toShareHash is "#b=" plus encodeBuild', () => {
    const build = martyV2();
    expect(toShareHash(build)).toBe('#b=' + encodeBuild(build));
  });

  it('fromShareHash accepts the hash with or without the leading #', () => {
    const build = martyV2();
    const hash = toShareHash(build);
    expect(fromShareHash(hash, library).build).toEqual(build);
    expect(fromShareHash(hash.slice(1), library).build).toEqual(build);
  });

  it('a query-string link ("?b=...") is not read as a share link', () => {
    const payload = encodeBuild(martyV2());
    expect(() => fromShareHash(`?b=${payload}`, library)).toThrow(ShareDecodeError);
  });

  it('a hash with no b= payload throws ShareDecodeError', () => {
    expect(() => fromShareHash('', library)).toThrow(ShareDecodeError);
    expect(() => fromShareHash('#', library)).toThrow(ShareDecodeError);
    expect(() => fromShareHash('#x=1', library)).toThrow(ShareDecodeError);
  });
});

// --- Unknown ids drop with a warning ---------------------------------------

describe('Share: unknown ids are dropped with a "share: dropped unknown" warning', () => {
  it('an unknown chip id in a v2 payload is dropped, the known chips stay in order', () => {
    const build: Build = { ...martyV2(), chips: ['memecoins', 'not_a_chip', 'solana', 'nba'] };
    const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

    expect(decoded.chips).toEqual(['memecoins', 'solana', 'nba']);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/^share: dropped unknown/);
    expect(warnings[0]).toContain('not_a_chip');
    expect(() => compile(decoded)).not.toThrow();
  });

  it('an unknown chip id in a v1 link is dropped the same way', () => {
    const v1: BuildV1 = { ...rosterV1('marty'), chips: ['memecoins', 'not_a_chip', 'nba'] };
    const { build, warnings } = fromShareHash(toShareHash(v1), library);

    expect(build.v).toBe(2);
    expect(build.chips).toEqual(['memecoins', 'nba']);
    expect(build.packs).toEqual(['memecoins']);
    expect(warnings.some((w) => w.startsWith('share: dropped unknown') && w.includes('not_a_chip'))).toBe(
      true,
    );
    expect(() => compile(build)).not.toThrow();
  });

  it('several unknown ids give one warning each', () => {
    const build: Build = { ...martyV2(), chips: ['nope_one', 'memecoins', 'nope_two'] };
    const { build: decoded, warnings } = decodeBuild(badPayload(build), library);
    expect(decoded.chips).toEqual(['memecoins']);
    expect(warnings.length).toBe(2);
    expect(warnings.every((w) => w.startsWith('share: dropped unknown'))).toBe(true);
    expect(warnings.some((w) => w.includes('nope_one'))).toBe(true);
    expect(warnings.some((w) => w.includes('nope_two'))).toBe(true);
  });

  it('an unknown peeve, pack or role is dropped with a warning too', () => {
    const build: Build = {
      ...migrate(rosterV1('rook'), { target: 'hermes' }),
      peeves: ['asks_permission', 'not_a_peeve'],
      packs: ['coding', 'not_a_pack'],
      roles: ['planner', 'not_a_role'],
    };
    const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

    expect(decoded.peeves).toEqual(['asks_permission']);
    expect(decoded.packs).toEqual(['coding']);
    expect(decoded.roles).toEqual(['planner']);
    expect(warnings.length).toBe(3);
    for (const id of ['not_a_peeve', 'not_a_pack', 'not_a_role']) {
      expect(warnings.some((w) => w.startsWith('share: dropped unknown') && w.includes(id))).toBe(true);
    }
  });

  it('a clean link has no warnings', () => {
    expect(decodeBuild(encodeBuild(martyV2()), library).warnings).toEqual([]);
  });
});

// --- Gate and limit overrides: unknown ids, and overrides no surviving pack exposes ---------------
// V2-DESIGN validation: a gates key is "pay or an action some selected pack exposes in gatesDefault";
// a limits key is "in some selected pack's limitChips". Spec: "A missing or unknown id after migration
// is dropped with a warning ..., never a crash." Two drop reasons, two warnings:
//   unknown to the library registry -> 'share: dropped unknown <field> "<id>"'
//   known, but no surviving pack exposes it -> 'share: dropped <field> "<id>": no selected pack exposes it'

describe('Share: gate and limit overrides are dropped with a warning', () => {
  const unknownWarning = (field: 'gates' | 'limits', id: string) =>
    `share: dropped unknown ${field} "${id}"`;
  const unexposedWarning = (field: 'gates' | 'limits', id: string) =>
    `share: dropped ${field} "${id}": no selected pack exposes it`;

  const pack = (id: string) => {
    const found = library.packs.find((p) => p.id === id);
    if (!found) throw new Error(`pack "${id}" not found in the library`);
    return found;
  };

  it('fixture premises hold in the library JSON', () => {
    const gateIds = new Set(library.gates.map((g) => g.id));
    const limitIds = new Set(library.limits.map((l) => l.id));
    // Registry membership.
    for (const id of ['trade', 'pay', 'send', 'deploy']) expect(gateIds.has(id)).toBe(true);
    for (const id of ['per_trade_pct', 'daily_loss_pct', 'leverage_cap', 'max_sends_per_day']) {
      expect(limitIds.has(id)).toBe(true);
    }
    expect(gateIds.has('not_a_gate')).toBe(false);
    expect(limitIds.has('not_a_limit')).toBe(false);
    // Exposure: memecoins exposes trade and three limits, but not deploy or leverage_cap.
    expect(Object.keys(pack('memecoins').gatesDefault)).toContain('trade');
    expect(Object.keys(pack('memecoins').gatesDefault)).not.toContain('deploy');
    expect(pack('memecoins').limitChips).toContain('per_trade_pct');
    expect(pack('memecoins').limitChips).not.toContain('leverage_cap');
    // sales exposes send and max_sends_per_day, and neither trade nor per_trade_pct.
    expect(Object.keys(pack('sales').gatesDefault)).toContain('send');
    expect(Object.keys(pack('sales').gatesDefault)).not.toContain('trade');
    expect(pack('sales').limitChips).toContain('max_sends_per_day');
    expect(pack('sales').limitChips).not.toContain('per_trade_pct');
    // Vera has no packs, so only the pay exemption can keep a gate.
    expect(martyV2().packs).toEqual(['memecoins']);
    expect(migrate(rosterV1('vera'), { target: 'muse' }).packs).toEqual([]);
  });

  describe('an id the library does not know', () => {
    it('an unknown gate id is dropped, the known gate stays', () => {
      const build: Build = { ...martyV2(), gates: { trade: 'forbid', not_a_gate: 'forbid' } };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.gates).toEqual({ trade: 'forbid' });
      expect(warnings).toEqual([unknownWarning('gates', 'not_a_gate')]);
      expect(() => compile(decoded)).not.toThrow();
    });

    it('an unknown limit id is dropped, the known limit stays', () => {
      const build: Build = { ...martyV2(), limits: { per_trade_pct: 0.5, not_a_limit: 3 } };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.limits).toEqual({ per_trade_pct: 0.5 });
      expect(warnings).toEqual([unknownWarning('limits', 'not_a_limit')]);
      expect(() => compile(decoded)).not.toThrow();
    });

    it('a build whose only gate and only limit are unknown decodes to empty records', () => {
      const build: Build = {
        ...martyV2(),
        gates: { removed_gate: 'approve' },
        limits: { removed_limit: 1 },
      };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.gates).toEqual({});
      expect(decoded.limits).toEqual({});
      expect(warnings).toEqual([
        unknownWarning('gates', 'removed_gate'),
        unknownWarning('limits', 'removed_limit'),
      ]);
      expect(() => compile(decoded)).not.toThrow();
    });

    it('a "__proto__" key in gates is plain data: dropped as unknown, no prototype pollution', () => {
      const gates = JSON.parse('{"__proto__":"forbid","trade":"forbid"}') as Record<string, string>;
      const build = { ...martyV2(), gates };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.gates).toEqual({ trade: 'forbid' });
      expect(Object.getPrototypeOf(decoded.gates)).toBe(Object.prototype);
      expect(warnings).toEqual([unknownWarning('gates', '__proto__')]);
    });

    it('a v1 link carries no gates or limits, so it can never warn about them', () => {
      const { warnings } = fromShareHash(toShareHash(rosterV1('marty')), library);
      expect(warnings.filter((w) => /gates|limits/.test(w))).toEqual([]);
    });
  });

  describe('a known id that no surviving pack exposes', () => {
    it('a gate from another pack is dropped, the exposed gate stays', () => {
      // deploy is a library gate, but memecoins (Marty's only pack) does not expose it.
      const build: Build = { ...martyV2(), gates: { trade: 'forbid', deploy: 'forbid' } };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.gates).toEqual({ trade: 'forbid' });
      expect(warnings).toEqual([unexposedWarning('gates', 'deploy')]);
      expect(() => compile(decoded)).not.toThrow();
    });

    it('a limit from another pack is dropped, the exposed limit stays', () => {
      // leverage_cap is a library limit exposed by perps only.
      const build: Build = { ...martyV2(), limits: { per_trade_pct: 0.5, leverage_cap: 2 } };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.limits).toEqual({ per_trade_pct: 0.5 });
      expect(warnings).toEqual([unexposedWarning('limits', 'leverage_cap')]);
      expect(() => compile(decoded)).not.toThrow();
    });

    it('pay is exempt from the exposure check: kept with no packs, while trade is dropped', () => {
      const vera = migrate(rosterV1('vera'), { target: 'muse' });
      const build: Build = { ...vera, gates: { pay: 'forbid', trade: 'forbid' } };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.packs).toEqual([]);
      expect(decoded.gates).toEqual({ pay: 'forbid' });
      expect(warnings).toEqual([unexposedWarning('gates', 'trade')]);
      expect(() => compile(decoded)).not.toThrow();
    });

    it('with no packs every limit is dropped, since nothing exposes any', () => {
      const vera = migrate(rosterV1('vera'), { target: 'muse' });
      const build: Build = { ...vera, limits: { per_trade_pct: 1 } };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.limits).toEqual({});
      expect(warnings).toEqual([unexposedWarning('limits', 'per_trade_pct')]);
    });
  });

  describe('a dropped pack takes its overrides with it', () => {
    it('an unknown pack is dropped and the gate and limit that needed a real pack go too', () => {
      const build: Build = {
        ...martyV2(),
        packs: ['not_a_pack'],
        gates: { trade: 'forbid' },
        limits: { per_trade_pct: 0.5 },
      };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.packs).toEqual([]);
      expect(decoded.gates).toEqual({});
      expect(decoded.limits).toEqual({});
      // Pack warning first (packs are filtered before gates and limits), then gates, then limits.
      expect(warnings).toEqual([
        'share: dropped unknown packs "not_a_pack"',
        unexposedWarning('gates', 'trade'),
        unexposedWarning('limits', 'per_trade_pct'),
      ]);
      expect(() => compile(decoded)).not.toThrow();
    });

    it('overrides are checked against the surviving packs only', () => {
      // memecoins is replaced by an unknown id: sales survives, so send and max_sends_per_day stay,
      // while trade and per_trade_pct (memecoins only) go.
      const build: Build = {
        ...martyV2(),
        packs: ['sales', 'not_a_pack'],
        gates: { send: 'forbid', trade: 'forbid' },
        limits: { max_sends_per_day: 10, per_trade_pct: 0.5 },
      };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(decoded.packs).toEqual(['sales']);
      expect(decoded.gates).toEqual({ send: 'forbid' });
      expect(decoded.limits).toEqual({ max_sends_per_day: 10 });
      expect(warnings).toEqual([
        'share: dropped unknown packs "not_a_pack"',
        unexposedWarning('gates', 'trade'),
        unexposedWarning('limits', 'per_trade_pct'),
      ]);
      expect(() => compile(decoded)).not.toThrow();
    });

    it('overrides exposed by any one of several surviving packs all stay', () => {
      const build: Build = {
        ...martyV2(),
        packs: ['memecoins', 'sales'],
        gates: { trade: 'forbid', send: 'forbid' },
        limits: { per_trade_pct: 0.5, max_sends_per_day: 10 },
      };
      const { build: decoded, warnings } = decodeBuild(badPayload(build), library);

      expect(warnings).toEqual([]);
      expect(decoded.packs).toEqual(['memecoins', 'sales']);
      expect(decoded.gates).toEqual({ trade: 'forbid', send: 'forbid' });
      expect(decoded.limits).toEqual({ per_trade_pct: 0.5, max_sends_per_day: 10 });
      expect(() => compile(decoded)).not.toThrow();
    });
  });
});

// --- Garbage and future versions throw ShareDecodeError --------------------

describe('Share: garbage and a v3 payload throw ShareDecodeError', () => {
  it('ShareDecodeError is an Error named ShareDecodeError', () => {
    const e = new ShareDecodeError('x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ShareDecodeError');
  });

  const garbage: { label: string; payload: string }[] = [
    { label: 'empty string', payload: '' },
    { label: 'plain words', payload: 'not a payload' },
    { label: 'punctuation', payload: '!!!###$$$' },
    { label: 'standard base64 characters (+ and /)', payload: 'a+b/c+d/' },
    { label: 'impossible base64 length', payload: 'A' },
    { label: 'base64url of text that is not JSON', payload: Buffer.from('hello world').toString('base64url') },
    { label: 'base64url of bytes that are not UTF-8', payload: Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url') },
    { label: 'JSON null', payload: payloadOfJson(null) },
    { label: 'JSON string', payload: payloadOfJson('Marty') },
    { label: 'JSON number', payload: payloadOfJson(2) },
    { label: 'JSON array', payload: payloadOfJson([1, 2, 3]) },
    { label: 'empty object', payload: payloadOfJson({}) },
    { label: 'version as a string', payload: payloadOfJson({ v: '2' }) },
    { label: 'version 0', payload: payloadOfJson({ v: 0 }) },
  ];

  for (const { label, payload } of garbage) {
    it(`decodeBuild: ${label}`, () => {
      expect(() => decodeBuild(payload, library)).toThrow(ShareDecodeError);
    });

    it(`fromShareHash: ${label}`, () => {
      expect(() => fromShareHash(`#b=${payload}`, library)).toThrow(ShareDecodeError);
    });
  }

  it('a v3 payload throws ShareDecodeError', () => {
    const v3 = { ...martyV2(), v: 3 };
    const payload = badPayload(v3);
    expect(() => decodeBuild(payload, library)).toThrow(ShareDecodeError);
    expect(() => fromShareHash(`#b=${payload}`, library)).toThrow(ShareDecodeError);
  });

  it('a v3 payload error names the version', () => {
    const payload = badPayload({ ...martyV2(), v: 3 });
    expect(() => decodeBuild(payload, library)).toThrow(/3/);
  });

  it('a v1 payload with the wrong shape throws ShareDecodeError, not a bare Error', () => {
    const payload = payloadOfJson({ v: 1, b: 'trader', c: 'memecoins' });
    expect(() => decodeBuild(payload, library)).toThrow(ShareDecodeError);
  });

  it('a v2 payload with an unknown target throws ShareDecodeError', () => {
    const build = { ...martyV2(), target: 'toaster' };
    expect(() => decodeBuild(badPayload(build), library)).toThrow(ShareDecodeError);
  });

  it('a v2 payload with a wrong-typed field throws ShareDecodeError', () => {
    const build = { ...martyV2(), name: 42 };
    expect(() => decodeBuild(badPayload(build), library)).toThrow(ShareDecodeError);
  });

  describe('an unknown scalar id fails the whole decode', () => {
    // Spec: "A missing or unknown id after migration is dropped with a warning". A scalar (base,
    // outfit, hard part, drive) cannot be dropped from a build, so decode throws a typed
    // ShareDecodeError (never a bare Error, never a silent partial build). This pins that choice.
    // QUESTIONS.md records no decision on it, so it is flagged in the slice report.
    const scalarCases: { field: string; id: string; mutate: (b: Record<string, unknown>) => void }[] = [
      { field: 'base', id: 'not_a_base', mutate: (b) => (b.base = 'not_a_base') },
      { field: 'outfit', id: 'not_an_outfit', mutate: (b) => (b.outfit = 'not_an_outfit') },
      {
        field: 'heart.hardPart',
        id: 'not_a_hard_part',
        mutate: (b) => (b.heart = { ...(b.heart as object), hardPart: 'not_a_hard_part' }),
      },
      {
        field: 'heart.d1',
        id: 'not_a_drive_1',
        mutate: (b) => (b.heart = { ...(b.heart as object), d1: 'not_a_drive_1' }),
      },
      {
        field: 'heart.d2',
        id: 'not_a_drive_2',
        mutate: (b) => (b.heart = { ...(b.heart as object), d2: 'not_a_drive_2' }),
      },
    ];

    for (const { field, id, mutate } of scalarCases) {
      it(`unknown ${field} "${id}" throws ShareDecodeError naming the field and the id`, () => {
        const raw = structuredClone(martyV2()) as unknown as Record<string, unknown>;
        mutate(raw);
        const payload = badPayload(raw);

        const error = decodeFailure(payload);
        expect(error.message).toMatch(/^share: /);
        expect(error.message).toContain(field);
        expect(error.message).toContain(id);
        expect(() => fromShareHash(`#b=${payload}`, library)).toThrow(ShareDecodeError);
      });
    }

    it('the same unknown id in a v1 link throws ShareDecodeError too', () => {
      for (const key of ['base', 'outfit'] as const) {
        const v1: BuildV1 = { ...rosterV1('marty'), [key]: 'not_a_real_id' };
        const error = (() => {
          try {
            fromShareHash(toShareHash(v1), library);
          } catch (e) {
            return e;
          }
          return undefined;
        })();
        expect(error).toBeInstanceOf(ShareDecodeError);
        expect((error as ShareDecodeError).message).toContain('not_a_real_id');
      }
    });

    it('every known id from the library for these fields decodes', () => {
      // The guard is "unknown", not "unusual": the first library id of each kind passes.
      const raw = structuredClone(martyV2());
      const build: Build = {
        ...raw,
        base: library.bases[0].id as Build['base'],
        outfit: library.outfits[0].id,
        heart: {
          hardPart: library.heart.hardParts[0].id as Build['heart']['hardPart'],
          d1: library.heart.drives[0].id as Build['heart']['d1'],
          d2: library.heart.drives[1].id as Build['heart']['d2'],
        },
      };
      const { build: decoded, warnings } = decodeBuild(encodeBuild(build), library);
      expect(warnings).toEqual([]);
      expect(decoded).toEqual(build);
    });
  });

  describe('a v2 payload with the wrong shape is rejected before compile', () => {
    // One case per checkShape branch. Each mutation breaks one field of an otherwise valid Marty v2
    // build; the message must name the field so the certificate can say what is wrong.
    const shapeCases: {
      label: string;
      mention: string;
      mutate: (b: Record<string, unknown>) => void;
    }[] = [
      // base, outfit, name, target: must be strings
      { label: 'base is a number', mention: 'base', mutate: (b) => (b.base = 7) },
      { label: 'outfit is a number', mention: 'outfit', mutate: (b) => (b.outfit = 3) },
      { label: 'name is null', mention: 'name', mutate: (b) => (b.name = null) },
      { label: 'target is a number', mention: 'target', mutate: (b) => (b.target = 7) },
      { label: 'target is unknown', mention: 'target', mutate: (b) => (b.target = 'toaster') },
      // chips, peeves, packs: must be lists of strings
      { label: 'chips is a string', mention: 'chips', mutate: (b) => (b.chips = 'memecoins') },
      { label: 'chips holds a number', mention: 'chips', mutate: (b) => (b.chips = ['memecoins', 1]) },
      { label: 'peeves is a string', mention: 'peeves', mutate: (b) => (b.peeves = 'asks_permission') },
      { label: 'peeves holds null', mention: 'peeves', mutate: (b) => (b.peeves = [null]) },
      { label: 'packs is a string', mention: 'packs', mutate: (b) => (b.packs = 'memecoins') },
      { label: 'packs holds a number', mention: 'packs', mutate: (b) => (b.packs = [5]) },
      // stats: an object of numbers
      { label: 'stats is a string', mention: 'stats', mutate: (b) => (b.stats = '4,1,3,1,1,4') },
      { label: 'stats is an array', mention: 'stats', mutate: (b) => (b.stats = [4, 1, 3, 1, 1, 4]) },
      { label: 'stats is null', mention: 'stats', mutate: (b) => (b.stats = null) },
      {
        label: 'a stats value is a string',
        mention: 'stats',
        mutate: (b) => (b.stats = { ...(b.stats as object), blunt: '4' }),
      },
      {
        label: 'a stats value is null',
        mention: 'stats',
        mutate: (b) => (b.stats = { ...(b.stats as object), warm: null }),
      },
      // heart: an object with three string ids
      { label: 'heart is a string', mention: 'heart', mutate: (b) => (b.heart = 'forget') },
      { label: 'heart is null', mention: 'heart', mutate: (b) => (b.heart = null) },
      {
        label: 'heart is missing hardPart',
        mention: 'heart',
        mutate: (b) => (b.heart = { d1: 'd1.chip.memecoins', d2: 'd2.blunt.4' }),
      },
      {
        label: 'heart is missing d1',
        mention: 'heart',
        mutate: (b) => (b.heart = { hardPart: 'forget', d2: 'd2.blunt.4' }),
      },
      {
        label: 'heart is missing d2',
        mention: 'heart',
        mutate: (b) => (b.heart = { hardPart: 'forget', d1: 'd1.chip.memecoins' }),
      },
      {
        label: 'heart.hardPart is a number',
        mention: 'heart',
        mutate: (b) => (b.heart = { hardPart: 1, d1: 'd1.chip.memecoins', d2: 'd2.blunt.4' }),
      },
      // mode: absent or one of the four chatgpt modes
      { label: 'mode is an unknown string', mention: 'mode', mutate: (b) => (b.mode = 'projector') },
      { label: 'mode is a number', mention: 'mode', mutate: (b) => (b.mode = 5) },
      { label: 'mode is null, not absent', mention: 'mode', mutate: (b) => (b.mode = null) },
      // plan: absent, free or paid
      { label: 'plan is an unknown string', mention: 'plan', mutate: (b) => (b.plan = 'enterprise') },
      { label: 'plan is wrong-cased', mention: 'plan', mutate: (b) => (b.plan = 'Paid') },
      { label: 'plan is a number', mention: 'plan', mutate: (b) => (b.plan = 1) },
      { label: 'plan is null, not absent', mention: 'plan', mutate: (b) => (b.plan = null) },
      // limits: an object of numbers
      { label: 'limits is an array', mention: 'limits', mutate: (b) => (b.limits = []) },
      { label: 'limits is a string', mention: 'limits', mutate: (b) => (b.limits = 'none') },
      { label: 'limits is null', mention: 'limits', mutate: (b) => (b.limits = null) },
      {
        label: 'a limits value is a numeric string',
        mention: 'limits',
        mutate: (b) => (b.limits = { per_trade_pct: '0.5' }),
      },
      {
        label: 'a limits value is null',
        mention: 'limits',
        mutate: (b) => (b.limits = { per_trade_pct: null }),
      },
      // gates: an object of auto, approve or forbid
      { label: 'gates is an array', mention: 'gates', mutate: (b) => (b.gates = []) },
      { label: 'gates is a string', mention: 'gates', mutate: (b) => (b.gates = 'approve') },
      { label: 'gates is null', mention: 'gates', mutate: (b) => (b.gates = null) },
      {
        label: 'a gates value is not a setting',
        mention: 'gates',
        mutate: (b) => (b.gates = { trade: 'maybe' }),
      },
      {
        label: 'a gates value is wrong-cased',
        mention: 'gates',
        mutate: (b) => (b.gates = { trade: 'Approve' }),
      },
      {
        label: 'a gates value is a number',
        mention: 'gates',
        mutate: (b) => (b.gates = { trade: 1 }),
      },
      {
        label: 'a gates value is null',
        mention: 'gates',
        mutate: (b) => (b.gates = { trade: null }),
      },
      // roles: absent or a list of strings
      { label: 'roles is a string', mention: 'roles', mutate: (b) => (b.roles = 'planner') },
      { label: 'roles holds numbers', mention: 'roles', mutate: (b) => (b.roles = [1, 2]) },
      {
        label: 'roles holds one non-string',
        mention: 'roles',
        mutate: (b) => (b.roles = ['planner', 7]),
      },
      { label: 'roles is null, not absent', mention: 'roles', mutate: (b) => (b.roles = null) },
    ];

    for (const { label, mention, mutate } of shapeCases) {
      it(`${label}: throws ShareDecodeError naming "${mention}"`, () => {
        const raw = structuredClone(martyV2()) as unknown as Record<string, unknown>;
        mutate(raw);

        const error = decodeFailure(badPayload(raw));
        expect(error.message).toMatch(/^share: /);
        expect(error.message.toLowerCase()).toContain(mention.toLowerCase());
        expect(() => fromShareHash(toShareHash(raw as unknown as Build), library)).toThrow(
          ShareDecodeError,
        );
      });
    }

    // Every field of the v2 shape except mode, plan and roles is required.
    const required = [
      'base', 'chips', 'stats', 'peeves', 'heart', 'outfit', 'name', 'target', 'packs', 'limits', 'gates',
    ];
    for (const key of required) {
      it(`a payload with "${key}" missing throws ShareDecodeError`, () => {
        const raw = structuredClone(martyV2()) as unknown as Record<string, unknown>;
        delete raw[key];
        expect(() => decodeBuild(badPayload(raw), library)).toThrow(ShareDecodeError);
      });
    }

    it('mode, plan and roles may be absent, and every valid value decodes', () => {
      // Absent is fine: Marty's v2 build has none of the three.
      const marty = martyV2();
      expect(marty.mode).toBeUndefined();
      expect(decodeBuild(encodeBuild(marty), library).warnings).toEqual([]);

      for (const mode of ['dot', 'gpt', 'instructions', 'project'] as const) {
        const { build, warnings } = decodeBuild(encodeBuild({ ...marty, target: 'chatgpt', mode }), library);
        expect(warnings).toEqual([]);
        expect(build.mode).toBe(mode);
      }
      for (const plan of ['free', 'paid'] as const) {
        const { build, warnings } = decodeBuild(encodeBuild({ ...marty, plan }), library);
        expect(warnings).toEqual([]);
        expect(build.plan).toBe(plan);
      }
    });

    it('every valid gate setting decodes: auto, approve and forbid', () => {
      for (const setting of ['auto', 'approve', 'forbid'] as const) {
        const build: Build = { ...martyV2(), packs: ['sales'], gates: { send: setting } };
        const { build: decoded, warnings } = decodeBuild(encodeBuild(build), library);
        expect(warnings).toEqual([]);
        expect(decoded.gates).toEqual({ send: setting });
      }
    });

    it('a malformed payload never produces a build: nothing is returned, the error is typed', () => {
      for (const { mutate } of shapeCases) {
        const raw = structuredClone(martyV2()) as unknown as Record<string, unknown>;
        mutate(raw);
        let returned: unknown;
        let caught: unknown;
        try {
          returned = decodeBuild(badPayload(raw), library);
        } catch (e) {
          caught = e;
        }
        expect(returned).toBeUndefined();
        expect(caught).toBeInstanceOf(ShareDecodeError);
      }
    });
  });

  it('every garbage case throws only ShareDecodeError, never another error type', () => {
    for (const { payload } of garbage) {
      let caught: unknown;
      try {
        decodeBuild(payload, library);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ShareDecodeError);
    }
  });
});
