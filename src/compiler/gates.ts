// Effective gates and limits: pack defaults merged under the user's overrides, then the
// lines they emit. Gate order everywhere is lib.gates registry order. Pure; no input is mutated.

import type {
  ActionId,
  Build,
  CustomRule,
  GateSetting,
  Item,
  Library,
  LimitId,
  Profile,
  Section,
  WorkflowPack,
} from './types.js';

const STRICTNESS: Record<GateSetting, number> = { auto: 0, approve: 1, forbid: 2 };

function stricterGate(a: GateSetting, b: GateSetting): GateSetting {
  return STRICTNESS[b] > STRICTNESS[a] ? b : a;
}

// The selected packs, in build order. Unknown ids are skipped; validation rejects them earlier.
function selectedPacks(build: Build, lib: Library): WorkflowPack[] {
  const packs: WorkflowPack[] = [];
  for (const id of build.packs) {
    const pack = lib.packs.find((p) => p.id === id);
    if (pack) {
      packs.push(pack);
    }
  }
  return packs;
}

// Keys in registry order, then anything not in the registry in insertion order.
function inOrder<T>(map: Map<string, T>, registry: string[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of registry) {
    if (map.has(id)) {
      out[id] = map.get(id) as T;
    }
  }
  for (const [id, value] of map) {
    if (!Object.hasOwn(out, id)) {
      out[id] = value;
    }
  }
  return out;
}

// Auto is offered only where the library gives it soul text. A null auto line means the library
// treats auto as approve: publish, delete, write_query and force_push, and pay (forced to forbid).
// An action the library does not know is not offered either.
export function autoOffered(action: ActionId, lib: Library): boolean {
  const gate = lib.gates.find((g) => g.id === action);
  return gate !== undefined && gate.soulLine.auto !== null;
}

export function effectiveGates(build: Build, lib: Library): Record<ActionId, GateSetting> {
  const gates = new Map<ActionId, GateSetting>([['pay', 'forbid']]);
  for (const pack of selectedPacks(build, lib)) {
    for (const [action, setting] of Object.entries(pack.gatesDefault)) {
      const current = gates.get(action);
      gates.set(action, current === undefined ? setting : stricterGate(current, setting));
    }
  }
  for (const [action, setting] of Object.entries(build.gates)) {
    if (gates.has(action)) {
      gates.set(action, setting);
    }
  }
  gates.set('pay', 'forbid');
  // Clamp last, so neither a pack default nor an override can reach auto where it is not offered.
  for (const [action, setting] of gates) {
    if (setting === 'auto' && !autoOffered(action, lib)) {
      gates.set(action, 'approve');
    }
  }
  return inOrder(
    gates,
    lib.gates.map((g) => g.id),
  );
}

export function effectiveLimits(build: Build, lib: Library): Record<LimitId, number> {
  const limits = new Map<LimitId, number>();
  for (const pack of selectedPacks(build, lib)) {
    for (const [id, value] of Object.entries(pack.limitsDefault)) {
      const current = limits.get(id);
      if (current === undefined) {
        limits.set(id, value);
        continue;
      }
      const stricter = lib.limits.find((l) => l.id === id)?.stricter;
      limits.set(id, stricter === 'higher' ? Math.max(current, value) : Math.min(current, value));
    }
  }
  // Validation guarantees each key is a limit chip of a selected pack, which may have no default.
  for (const [id, value] of Object.entries(build.limits)) {
    limits.set(id, value);
  }
  return inOrder(
    limits,
    lib.limits.map((l) => l.id),
  );
}

// Personality-layer lines: one per gate whose setting has soul text.
export function gateSoulItems(gates: Record<ActionId, GateSetting>, lib: Library): Item[] {
  const items: Item[] = [];
  for (const gate of lib.gates) {
    if (!Object.hasOwn(gates, gate.id)) {
      continue;
    }
    const setting = gates[gate.id] as GateSetting;
    const text = gate.soulLine[setting];
    if (text !== null) {
      items.push({
        id: `gate.${gate.id}.soul.${setting}`,
        text,
        kind: 'gate',
        section: 'act',
        format: 'bullet',
      });
    }
  }
  return items;
}

// Rules-layer lines, in order: gates, limits, then each selected pack's own rules lines.
export function rulesItems(
  build: Build,
  gates: Record<ActionId, GateSetting>,
  limits: Record<LimitId, number>,
  lib: Library,
  section: Section,
): Item[] {
  const items: Item[] = [];
  for (const gate of lib.gates) {
    if (!Object.hasOwn(gates, gate.id)) {
      continue;
    }
    const setting = gates[gate.id] as GateSetting;
    items.push({
      id: `gate.${gate.id}.rules.${setting}`,
      text: gate.rulesLine[setting],
      kind: 'rule',
      section,
      format: 'bullet',
    });
  }
  for (const limit of lib.limits) {
    if (!Object.hasOwn(limits, limit.id)) {
      continue;
    }
    const value = limits[limit.id] as number;
    items.push({
      id: `limit.${limit.id}`,
      text: limit.rulesTemplate.replaceAll('{value}', () => String(value)),
      kind: 'limit',
      section,
      format: 'bullet',
    });
  }
  for (const pack of selectedPacks(build, lib)) {
    for (const rule of pack.rulesLines) {
      items.push({ id: rule.id, text: rule.line, kind: 'pack-rule', section, format: 'bullet' });
    }
  }
  return items;
}

// ChatGPT Custom Instructions "custom rules": one per gate, phrased with the profile's setting labels.
export function customRules(
  gates: Record<ActionId, GateSetting>,
  profile: Profile,
  lib: Library,
): CustomRule[] {
  const labels = profile.customRuleSettings;
  if (!labels) {
    throw new Error(`Profile ${profile.id} has no customRuleSettings`);
  }
  const rules: CustomRule[] = [];
  for (const gate of lib.gates) {
    if (!Object.hasOwn(gates, gate.id)) {
      continue;
    }
    const setting = gates[gate.id] as GateSetting;
    rules.push({
      gate: gate.id,
      action: gate.customRuleText,
      setting: labels[setting],
      ids: [`gate.${gate.id}.custom`, `profile.${profile.id}.setting.${setting}`],
    });
  }
  return rules;
}
