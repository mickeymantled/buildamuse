// Pass: trim the soul under the max length. On a cap of 4,000 or less the tiers (author pack rules
// lines, then the short chassis records) run first; then low-priority lines drop.

import type {
  BuildCore,
  ChassisLine,
  CompileContext,
  FitResult,
  Item,
  Library,
  Line,
  PackId,
  Profile,
  RenderOptions,
  Trimmed,
} from '../types.js';
import { applyChassis } from '../profile.js';
import { render } from './render.js';

export const MAX_SOUL_LENGTH = 3600;

// B1 tiers apply on a profile whose cap is this or less. Free custom instructions fits itself.
export const TIER_CAP = 4000;

// Finds the chip-trigger item for a chip at a given trigger index, if present.
function findTrigger(items: Item[], chip: string, triggerIndex: number): Item | undefined {
  return items.find(
    (it) => it.kind === 'chip-trigger' && it.chip === chip && it.triggerIndex === triggerIndex
  );
}

// Finds the voice item for a chip, if present.
function findVoice(items: Item[], chip: string): Item | undefined {
  return items.find((it) => it.kind === 'voice' && it.chip === chip);
}

// Builds the ordered drop candidate list per the documented priority order.
function buildCandidates(items: Item[], build: BuildCore, lib: Library): Item[] {
  const reverseTapped = [...build.chips].reverse();
  const candidates: Item[] = [];
  const seen = new Set<string>();

  function add(item: Item | undefined): void {
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      candidates.push(item);
    }
  }

  // 1. Voice lines, last-tapped back.
  for (const chipId of reverseTapped) {
    add(findVoice(items, chipId));
  }

  // 2. Life/Time chips, last-tapped back: all triggers, highest index first.
  for (const chipId of reverseTapped) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip || (chip.group !== 'Life' && chip.group !== 'Time')) continue;
    const triggers = items.filter((it) => it.kind === 'chip-trigger' && it.chip === chipId);
    const sorted = [...triggers].sort((a, b) => (b.triggerIndex ?? 0) - (a.triggerIndex ?? 0));
    for (const t of sorted) add(t);
  }

  // 3. Work/Markets chips, last-tapped back: third trigger, then second.
  // First trigger of a Work/Markets chip is never a candidate.
  for (const chipId of reverseTapped) {
    const chip = lib.chips.find((c) => c.id === chipId);
    if (!chip || (chip.group !== 'Work' && chip.group !== 'Markets')) continue;
    add(findTrigger(items, chipId, 2));
    add(findTrigger(items, chipId, 1));
  }

  return candidates;
}

// S1 drops are voice lines and chip triggers; the item kind names which.
function trimmedOf(item: Item): Trimmed {
  return { kind: item.kind === 'voice' ? 'voice' : 'trigger', id: item.id, text: item.text };
}

// The cap and render options default to the soul layout, so a bare call behaves as it always did.
export function length(
  items: Item[],
  build: BuildCore,
  lib: Library,
  cap: number = MAX_SOUL_LENGTH,
  opts?: RenderOptions,
): FitResult {
  let current = items;
  let soulLength = render(current, lib, opts).soul.length;

  if (soulLength <= cap) {
    return { items: current, warnings: [], trimmed: [] };
  }

  const candidates = buildCandidates(items, build, lib);
  const warnings: string[] = [];
  const trimmed: Trimmed[] = [];

  for (const candidate of candidates) {
    if (soulLength <= cap) break;
    current = current.filter((it) => it.id !== candidate.id);
    warnings.push(`length: dropped ${candidate.id} (soul over ${cap})`);
    trimmed.push(trimmedOf(candidate));
    soulLength = render(current, lib, opts).soul.length;
  }

  if (soulLength > cap) {
    warnings.push(`length: soul is ${soulLength} characters, over ${cap} with nothing left to drop`);
  }

  return { items: current, warnings, trimmed };
}

export function usesTiers(profile: Profile, cap: number): boolean {
  return cap <= TIER_CAP && profile.id !== 'chatgpt-instructions';
}

interface Built {
  items: Item[];
  opts?: RenderOptions;
}

// The library record behind a pack rule item, and its pack. Looks through every pack the build
// selected, so a pack the profile cannot deliver still has its rules lines found.
function packRuleOf(
  item: Item,
  ctx: CompileContext,
): { line: Line; pack: PackId } | undefined {
  if (item.kind !== 'pack-rule') return undefined;
  for (const pack of ctx.lib.packs) {
    if (!ctx.build.packs.includes(pack.id)) continue;
    const line = pack.rulesLines.find((l) => l.id === item.id);
    if (line) return { line, pack: pack.id };
  }
  return undefined;
}

// Tier A: a pack rule whose Line is not Brian's text (origin 'brief') is an author line.
function isAuthorRule(item: Item, ctx: CompileContext): boolean {
  const rule = packRuleOf(item, ctx);
  return rule !== undefined && rule.line.origin !== 'brief';
}

function trimmedRule(item: Item, ctx: CompileContext): Trimmed {
  const rule = packRuleOf(item, ctx);
  return {
    kind: 'pack-rule',
    id: item.id,
    text: rule ? rule.line.line : item.text,
    ...(rule ? { pack: rule.pack } : {}),
  };
}

// Chassis ids can carry a suffix ("#short", "@profile"); the part before it names the line.
function chassisBase(id: string): string {
  return id.split(/[#@]/, 1)[0];
}

// Tier B: the chassis lines whose short form differs from the full form they replaced.
function shortened(full: ChassisLine[], short: ChassisLine[]): Trimmed[] {
  const fullOf = new Map(full.map((line) => [chassisBase(line.id), line]));
  const out: Trimmed[] = [];
  for (const line of short) {
    const was = fullOf.get(chassisBase(line.id));
    if (was && was.line !== line.line) {
      out.push({ kind: 'chassis-short', id: was.id, text: was.line });
    }
  }
  return out;
}

// Tier A, then Tier B, before any chip trigger drops (B1). A cuts every author pack rules line from
// this artifact only. B, if still over and the chassis is full, calls build again with the short
// chassis records and runs A on that. Chassis lines are never dropped. `build` is the caller's own
// layout (plus any passes that must follow it). The say strings carry the caller's warning text.
// `trimmed` records each cut rule and each shortened chassis line with its library text.
export function fitTiers<T extends Built>(
  ctx: CompileContext,
  build: (c: CompileContext) => T,
  say: { cut: (id: string) => string; short: string },
): { built: T; warnings: string[]; trimmed: Trimmed[] } {
  const base = build(ctx);
  if (!usesTiers(ctx.profile, ctx.cap)) {
    return { built: base, warnings: [], trimmed: [] };
  }
  const size = (b: Built): number => render(b.items, ctx.lib, b.opts).soul.length;
  const tierA = (b: T, c: CompileContext): { built: T; warnings: string[]; trimmed: Trimmed[] } => {
    if (size(b) <= c.cap) return { built: b, warnings: [], trimmed: [] };
    const cut = b.items.filter((item) => isAuthorRule(item, c));
    return {
      built: { ...b, items: b.items.filter((item) => !cut.includes(item)) },
      warnings: cut.map((item) => say.cut(item.id)),
      trimmed: cut.map((item) => trimmedRule(item, c)),
    };
  };

  const a = tierA(base, ctx);
  if (size(a.built) <= ctx.cap || ctx.form !== 'full') {
    return a;
  }
  const short: CompileContext = {
    ...ctx,
    form: 'short',
    chassis: applyChassis(ctx.resolved.chassis, ctx.profile, 'short'),
  };
  // B1 order: author pack rules are cut first, then chassis goes short. Rules cut in
  // Tier A stay cut in the short rebuild.
  const rebuilt = build(short);
  const cutIds = new Set(a.built === base ? [] : base.items.filter((item) => !a.built.items.includes(item)).map((item) => item.id));
  const kept = { ...rebuilt, items: rebuilt.items.filter((item) => !cutIds.has(item.id)) };
  const b = tierA(kept, short);
  return {
    built: b.built,
    warnings: [...a.warnings, say.short, ...b.warnings],
    trimmed: [...a.trimmed, ...shortened(ctx.chassis, short.chassis), ...b.trimmed],
  };
}
