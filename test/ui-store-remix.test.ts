// Store tests for the certificate Remix and its Back (QUESTIONS W39), in the node environment, with
// no React. The certificate's Remix saves the `from` it replaces in `fromBeforeRemix`, and Back on
// the remix screen puts it back. A link certificate stays a link certificate (no Back past it), and a
// roster Use certificate goes back to the roster.
//
// Expected values come from the store's documented behavior (src/ui/store.ts comments on startRemix
// and back) and the flow rules in src/ui/flow.ts (prevScreen and canGoBack), not from copying output.
// The builds come from the library's roster through the migrate step, the same way the app makes
// a link build.

import { beforeEach, describe, expect, it } from 'vitest';

import { migrate } from '../src/compiler/migrate.js';
import type { Build } from '../src/compiler/types.js';
import library from '../src/library/index.js';
import { canGoBack, prevScreen } from '../src/ui/flow.js';
import { useBuilder } from '../src/ui/store.js';

const st = () => useBuilder.getState();

function june(): Build {
  const entry = library.roster.find((r) => r.id === 'june');
  if (!entry) throw new Error('test setup: no roster entry june');
  return migrate(entry.build, { target: 'muse' });
}

beforeEach(() => {
  st().reset();
});

// ---- A link certificate ----

describe('Remix from a link certificate', () => {
  it('saves from "link", and Back puts it back with nothing saved and no Back past the certificate', () => {
    st().loadBuild(june(), { from: 'link' });
    expect(st().screen).toBe('certificate');
    expect(st().from).toBe('link');
    expect(st().fromBeforeRemix).toBeUndefined();

    st().startRemix();
    expect(st().screen).toBe('remix');
    expect(st().from).toBe('link-remix');
    expect(st().fromBeforeRemix).toBe('link');
    // On the remix screen Back always leads to the certificate.
    expect(prevScreen(st())).toBe('certificate');
    expect(canGoBack(st())).toBe(true);

    st().back();
    expect(st().screen).toBe('certificate');
    expect(st().from).toBe('link');
    expect(st().fromBeforeRemix).toBeUndefined();
    // A link certificate has nothing behind it again.
    expect(prevScreen(st())).toBe('certificate');
    expect(canGoBack(st())).toBe(false);
  });
});

// ---- A roster Use certificate ----

describe('Remix from a roster Use certificate', () => {
  it('saves from "roster", Back restores it, and the certificate goes back to the roster', () => {
    st().setTarget('muse');
    st().useStarter('june');
    expect(st().screen).toBe('certificate');
    expect(st().from).toBe('roster');
    expect(st().fromBeforeRemix).toBeUndefined();

    st().startRemix();
    expect(st().screen).toBe('remix');
    expect(st().from).toBe('link-remix');
    expect(st().fromBeforeRemix).toBe('roster');

    st().back();
    expect(st().screen).toBe('certificate');
    expect(st().from).toBe('roster');
    expect(st().fromBeforeRemix).toBeUndefined();
    // With from restored, Back on the certificate leads to the roster.
    expect(prevScreen(st())).toBe('roster');
    expect(canGoBack(st())).toBe(true);

    st().back();
    expect(st().screen).toBe('roster');
  });
});

// ---- A ?remix=1 link ----

describe('Back on the remix screen of a ?remix=1 link', () => {
  it('goes to the certificate and keeps from "link-remix", since nothing was saved', () => {
    st().loadBuild(june(), { from: 'link-remix' });
    expect(st().screen).toBe('remix');
    expect(st().from).toBe('link-remix');
    expect(st().fromBeforeRemix).toBeUndefined();

    st().back();
    expect(st().screen).toBe('certificate');
    expect(st().from).toBe('link-remix');
    expect(st().fromBeforeRemix).toBeUndefined();
  });
});

// ---- Every entry point that starts a build clears the saved `from` (W27) ----

describe('entry points clear fromBeforeRemix', () => {
  // A state on the remix screen with a saved `from`, which each action below must leave clear.
  function onRemixScreen(): void {
    st().loadBuild(june(), { from: 'link' });
    st().startRemix();
    expect(st().screen).toBe('remix');
    expect(st().fromBeforeRemix, 'test setup: the Remix saved the old from').toBe('link');
  }

  const ACTIONS: Array<{ name: string; run: () => void; expectFrom: string | null }> = [
    { name: 'loadBuild (a link)', run: () => st().loadBuild(june(), { from: 'link' }), expectFrom: 'link' },
    {
      name: 'loadBuild (a ?remix=1 link)',
      run: () => st().loadBuild(june(), { from: 'link-remix' }),
      expectFrom: 'link-remix',
    },
    { name: 'startBlank', run: () => st().startBlank(), expectFrom: 'blank' },
    { name: 'useStarter', run: () => st().useStarter('june'), expectFrom: 'roster' },
    { name: 'remixStarter', run: () => st().remixStarter('june'), expectFrom: 'remix' },
    { name: 'reset', run: () => st().reset(), expectFrom: null },
  ];

  it.each(ACTIONS)('$name', ({ run, expectFrom }) => {
    onRemixScreen();
    run();
    // The action did run (from is what that entry point sets), and nothing is saved.
    expect(st().from).toBe(expectFrom);
    expect(st().fromBeforeRemix).toBeUndefined();
  });
});
