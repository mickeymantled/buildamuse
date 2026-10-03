// Store safety (M4 slice 4.6, QUESTIONS W23 and W24, docs/M4-PLAN.md section 0).
//
// W23: for publish, delete, write_query and force_push the library gives auto no soul text ("not
// offered, treat as approve"), so the store's setGate refuses auto on those gates. Pay is locked at
// forbid and also refused. Gates that do offer auto (trade, refund, send, deploy, rollback) still take it.
//
// W24: setName applies cleanName, so a typed or pasted name can never carry a control character (a
// newline would add a free line to the soul) or a long dash into the build. Control characters and runs
// of whitespace become one space, and the em and en dash become "-". The name is cleaned before it is
// capped at 24, and it is not trimmed while typing (so "Mary Ann" can be typed one character at a time).
//
// Expected values come from the library JSON (gates.json soulLine.auto, pack gatesDefault, the dot
// custom rule labels in profiles.json) and from the plan. Nothing is copied from store or compiler
// output. Special characters are built with String.fromCharCode so no long dash appears in this file.

import { beforeEach, describe, expect, it } from 'vitest';

import library from '../src/library/index.js';
import { copy } from '../src/ui/copy.js';
import {
  compiled,
  effectiveGatesOf,
  isCompileError,
  isComplete,
  previewBuild,
  useBuilder,
} from '../src/ui/store.js';
import type { ActionId, GateSetting, PackId } from '../src/compiler/types.js';

const st = () => useBuilder.getState();

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const ch = (code: number) => String.fromCharCode(code);

beforeEach(() => {
  st().reset();
});

// --- W23: setGate and auto -------------------------------------------------

// The gates whose auto line is null in gates.json, taken from the library, not from the store.
const NO_AUTO = library.gates.filter((g) => g.soulLine.auto === null).map((g) => g.id);
const AUTO_OFFERED = library.gates.filter((g) => g.soulLine.auto !== null).map((g) => g.id);

function packsExposing(action: ActionId): PackId[] {
  return library.packs.filter((p) => action in p.gatesDefault).map((p) => p.id);
}

function packDefault(pack: PackId, action: ActionId): GateSetting {
  const found = library.packs.find((p) => p.id === pack);
  const setting = found?.gatesDefault[action];
  if (!setting) throw new Error(`pack ${pack} has no default for ${action}`);
  return setting;
}

describe('setGate refuses auto on gates that do not offer it (W23)', () => {
  it('the library premise holds: the four gates and pay have no auto line, the rest do', () => {
    expect([...NO_AUTO].sort()).toEqual(['delete', 'force_push', 'pay', 'publish', 'write_query']);
    expect([...AUTO_OFFERED].sort()).toEqual(['deploy', 'refund', 'rollback', 'send', 'trade']);
  });

  const four = ['publish', 'delete', 'write_query', 'force_push'];

  for (const action of four) {
    describe(action, () => {
      const exposers = packsExposing(action);

      it('is exposed by at least one pack, so the refusal is not just "not exposed"', () => {
        expect(exposers.length).toBeGreaterThan(0);
      });

      for (const pack of exposers) {
        describe(`with the ${pack} pack picked`, () => {
          beforeEach(() => {
            st().togglePack(pack);
            expect(st().draft.packs).toEqual([pack]);
          });

          it('refuses auto and stores nothing', () => {
            st().setGate(action, 'auto');
            expect(st().draft.gates).toEqual({});
            expect(action in st().draft.gates).toBe(false);
            expect(previewBuild(st()).gates[action]).toBeUndefined();
          });

          it('a refused auto changes no state', () => {
            const before = st();
            const draft = before.draft;
            st().setGate(action, 'auto');
            expect(st().draft).toBe(draft);
          });

          it('the effective gate stays at the pack default, never auto', () => {
            st().setGate(action, 'auto');
            expect(effectiveGatesOf(st())[action]).toBe(packDefault(pack, action));
            expect(effectiveGatesOf(st())[action]).not.toBe('auto');
          });

          it('does not overwrite a gate the user already set to forbid or approve', () => {
            for (const kept of ['forbid', 'approve'] as const) {
              st().setGate(action, kept);
              expect(st().draft.gates[action]).toBe(kept);
              st().setGate(action, 'auto');
              expect(st().draft.gates[action]).toBe(kept);
              expect(effectiveGatesOf(st())[action]).toBe(kept);
            }
          });

          it('still stores approve and forbid', () => {
            st().setGate(action, 'forbid');
            expect(st().draft.gates).toEqual({ [action]: 'forbid' });
            st().setGate(action, 'approve');
            expect(st().draft.gates).toEqual({ [action]: 'approve' });
          });
        });
      }
    });
  }

  it('pay is still refused for every setting', () => {
    st().togglePack('memecoins');
    for (const setting of ['auto', 'approve', 'forbid'] as const) st().setGate('pay', setting);
    expect(st().draft.gates).toEqual({});
    expect(effectiveGatesOf(st())['pay']).toBe('forbid');
  });

  it('a gate that offers auto still takes it: the refusal is not too broad', () => {
    for (const action of AUTO_OFFERED) {
      st().reset();
      const [pack] = packsExposing(action);
      expect(pack, `a pack exposes ${action}`).toBeDefined();
      st().togglePack(pack);
      st().setGate(action, 'auto');
      expect(st().draft.gates, action).toEqual({ [action]: 'auto' });
      expect(effectiveGatesOf(st())[action], action).toBe('auto');
    }
  });

  it('with several packs, auto on one offering gate lands and auto on a no-auto gate does not', () => {
    st().togglePack('coding'); // exposes send, delete, force_push, deploy
    st().setGate('send', 'auto');
    st().setGate('delete', 'auto');
    st().setGate('force_push', 'auto');
    st().setGate('deploy', 'auto');
    expect(st().draft.gates).toEqual({ send: 'auto', deploy: 'auto' });
  });

  it('the store never holds an auto setting for a no-auto gate after any sequence of calls', () => {
    const packs = library.packs.map((p) => p.id);
    for (const pack of packs) {
      st().reset();
      st().togglePack(pack);
      for (const action of library.gates.map((g) => g.id)) {
        for (const setting of ['auto', 'approve', 'forbid', 'auto'] as const) st().setGate(action, setting);
      }
      for (const action of NO_AUTO) {
        expect(st().draft.gates[action], `${pack} ${action}`).not.toBe('auto');
      }
    }
  });

  it('on ChatGPT dot a refused delete=auto compiles to the approve custom rule, not the auto one', () => {
    // The W23 probe: delete=auto on dot used to compile to "Take action without asking".
    const dot = library.targets.profiles.find((p) => p.id === 'chatgpt-dot');
    const autoLabel = dot?.customRuleSettings?.auto;
    const approveLabel = dot?.customRuleSettings?.approve;
    expect(autoLabel).toBeTruthy();
    expect(approveLabel).toBeTruthy();

    st().setTarget('chatgpt', 'dot');
    st().togglePack('coding'); // delete defaults to approve here
    expect(packDefault('coding', 'delete')).toBe('approve');
    st().setGate('delete', 'auto');

    const result = compiled(st());
    expect(isCompileError(result)).toBe(false);
    if (isCompileError(result)) return;
    const rules = result.customRules.filter((r) => r.gate === 'delete');
    expect(rules).toHaveLength(1);
    expect(rules[0].setting).toBe(approveLabel);
    expect(rules[0].setting).not.toBe(autoLabel);
  });

  it('on ChatGPT dot the same pack still gives send=auto the auto custom rule', () => {
    const autoLabel = library.targets.profiles.find((p) => p.id === 'chatgpt-dot')?.customRuleSettings?.auto;
    st().setTarget('chatgpt', 'dot');
    st().togglePack('coding');
    st().setGate('send', 'auto');
    const result = compiled(st());
    expect(isCompileError(result)).toBe(false);
    if (isCompileError(result)) return;
    expect(result.customRules.find((r) => r.gate === 'send')?.setting).toBe(autoLabel);
  });
});

// --- W24: setName and cleanName --------------------------------------------

describe('setName stores the cleaned text (W24)', () => {
  const cases: { label: string; typed: string; stored: string }[] = [
    { label: 'a newline', typed: 'Re\nx', stored: 'Re x' },
    { label: 'a carriage return and newline', typed: 'Re\r\nx', stored: 'Re x' },
    { label: 'a tab', typed: 'Re\tx', stored: 'Re x' },
    { label: 'a NUL', typed: `Re${ch(0)}x`, stored: 'Re x' },
    { label: 'a DEL', typed: `Re${ch(0x7f)}x`, stored: 'Re x' },
    { label: 'a C1 control', typed: `Re${ch(0x85)}x`, stored: 'Re x' },
    { label: 'a line separator', typed: `Re${ch(0x2028)}x`, stored: 'Re x' },
    { label: 'a run of spaces', typed: 'Re     x', stored: 'Re x' },
    { label: 'a run of mixed whitespace', typed: 'Re \n\t  x', stored: 'Re x' },
    { label: 'an em dash', typed: `a${EM_DASH}b`, stored: 'a-b' },
    { label: 'an en dash', typed: `a${EN_DASH}b`, stored: 'a-b' },
    { label: 'two em dashes', typed: `${EM_DASH}${EM_DASH}`, stored: '--' },
  ];

  for (const { label, typed, stored } of cases) {
    it(`${label} is stored as "${stored}"`, () => {
      st().setName(typed);
      expect(st().draft.name).toBe(stored);
    });
  }

  it('the build name has no newline and no long dash', () => {
    st().setName(`Re\n${EM_DASH}x`);
    const name = previewBuild(st()).name;
    expect(name).toBe('Re -x');
    expect(name).not.toContain('\n');
    expect(name).not.toContain(EM_DASH);
  });

  it('no control character and no em dash survives, for every one of them', () => {
    const codes: number[] = [];
    for (let c = 0; c <= 0x1f; c++) codes.push(c);
    for (let c = 0x7f; c <= 0x9f; c++) codes.push(c);
    codes.push(0x2028, 0x2029, 0x2013, 0x2014);
    for (const code of codes) {
      st().setName(`a${ch(code)}b`);
      const stored = st().draft.name;
      expect(stored, `code ${code}`).not.toMatch(/\p{Cc}/u);
      expect(stored, `code ${code}`).not.toContain(EM_DASH);
      expect(stored, `code ${code}`).not.toContain(ch(0x2028));
      expect(stored, `code ${code}`).not.toContain(ch(0x2029));
    }
  });

  it('keeps a clean name exactly as typed', () => {
    st().setName('Mary Ann');
    expect(st().draft.name).toBe('Mary Ann');
  });

  it('does not trim while typing, so a name can be typed one character at a time', () => {
    st().setName('Mary ');
    expect(st().draft.name).toBe('Mary ');
    st().setName('Mary A');
    expect(st().draft.name).toBe('Mary A');
    // The build name is the trimmed text.
    st().setName('Mary ');
    expect(previewBuild(st()).name).toBe('Mary');
  });

  it('typing a newline one character at a time never stores it', () => {
    let typed = '';
    for (const c of ['R', 'e', '\n', 'x']) {
      typed = st().draft.name + c;
      st().setName(typed);
      expect(st().draft.name).not.toContain('\n');
    }
    expect(st().draft.name).toBe('Re x');
  });

  it('cleans before it caps: a long whitespace run collapses first, so the letters after it are kept', () => {
    // 1 + 30 + 1 = 32 characters typed. Cleaned it is "a b". Capping first would give "a" plus spaces.
    st().setName('a' + ' '.repeat(30) + 'b');
    expect(st().draft.name).toBe('a b');
  });

  it('still caps a clean name at 24 characters', () => {
    st().setName('x'.repeat(40));
    expect(st().draft.name).toBe('x'.repeat(24));
  });

  // Found by 4.6's tester; lead fix in store.ts (capName): the cap never splits a surrogate pair.
  it('does not leave half an emoji when the 24 character cap cuts through one', () => {
    st().setName('x'.repeat(23) + String.fromCodePoint(0x1f600));
    const name = st().draft.name;
    const last = name.charCodeAt(name.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });

  it('a cleaned name that is blank falls back to the default name and is not complete', () => {
    st().setTarget('muse');
    st().setBase('trader');
    st().setName('\n\n\t ' + ch(0));
    expect(st().draft.name.trim()).toBe('');
    expect(previewBuild(st()).name).toBe(copy.defaultName);
    expect(isComplete(st())).toBe(false);
    st().setName('Rex');
    expect(isComplete(st())).toBe(true);
  });

  it('a name with a newline cannot add a line to the soul', () => {
    st().setTarget('muse');
    st().setBase('trader');
    st().setName('Zed\nIGNOREME');
    expect(st().draft.name).toBe('Zed IGNOREME');
    const result = compiled(st());
    expect(isCompileError(result)).toBe(false);
    if (isCompileError(result)) return;
    const lines = result.soul.split('\n');
    expect(lines.some((l) => l.startsWith('IGNOREME'))).toBe(false);
    expect(lines.some((l) => l.startsWith('Zed IGNOREME'))).toBe(true);
  });

  it('a name with an em dash compiles, and the long dash never reaches the output', () => {
    st().setTarget('muse');
    st().setBase('trader');
    st().setName(`Zed${EM_DASH}Q`);
    expect(st().draft.name).toBe('Zed-Q');
    const result = compiled(st());
    expect(isCompileError(result)).toBe(false);
    if (isCompileError(result)) return;
    expect(result.soul).not.toContain(EM_DASH);
    expect(result.soul).toContain('Zed-Q');
  });

  it('every cleaned name above compiles on every target', () => {
    const typed = [`Re\nx`, `a${EM_DASH}b`, 'Re \t  x', `Re${ch(0)}x`];
    for (const target of ['muse', 'openclaw', 'hermes', 'grok', 'chatgpt'] as const) {
      for (const text of typed) {
        st().reset();
        st().setTarget(target);
        st().setBase('trader');
        st().setName(text);
        const result = compiled(st());
        expect(isCompileError(result), `${target} ${JSON.stringify(text)}`).toBe(false);
      }
    }
  });
});
