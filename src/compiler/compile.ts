// The compiler entry point. One pure function: same Build and Library in,
// same CompileResult out, every time. Runs the passes in order and traces
// the result before returning. A v1 build is migrated to v2 first.

import type {
  Build,
  BuildV1,
  CompileContext,
  CompileResult,
  Item,
  Library,
  RenderOptions,
  WorkflowPack,
} from './types.js';
import { migrate } from './migrate.js';
import { applyChassis, capOf, chassisFormOf, resolveProfile } from './profile.js';
import { effectiveGates, effectiveLimits } from './gates.js';
import { validate, validateV2 } from './passes/validate.js';
import { resolve } from './passes/resolve.js';
import { assembleSoul, soulRenderOptions } from './passes/assemble.js';
import { grokItems, grokRenderOptions } from './passes/layouts/grok.js';
import { instructionsPass, instructionsRenderOptions } from './passes/layouts/instructions.js';
import { dedupe } from './passes/dedupe.js';
import { contradictions } from './passes/contradictions.js';
import { length } from './passes/length.js';
import { render } from './passes/render.js';
import { buildName } from './passes/name.js';
import { seed, seedIds } from './passes/seed.js';
import { skills } from './passes/skills.js';
import { normalizeRoles } from './passes/roles.js';
import { memoryDelivery, skillsAndRoutines } from './passes/deliver.js';
import { assembleBundle } from './passes/bundle.js';
import { traceBundle } from './trace.js';
import library from '../library/index.js';

export { library };

// The personality items and render options for the profile's layout. Instructions on the free
// plan fit themselves to the cap, so their warnings come back and the length pass is skipped.
function layout(
  ctx: CompileContext,
  delivery: ReturnType<typeof skillsAndRoutines>,
): { items: Item[]; opts: RenderOptions; fitWarnings: string[] } {
  switch (ctx.profile.layout) {
    case 'grok':
      return { items: grokItems(ctx), opts: grokRenderOptions(ctx), fitWarnings: [] };
    case 'instructions': {
      const fit = instructionsPass(ctx, {
        soulItems: assembleSoul(ctx),
        inlineSkills: delivery.inline,
      });
      return { items: fit.items, opts: instructionsRenderOptions(ctx), fitWarnings: fit.warnings };
    }
    case 'soul':
      return {
        items: [...assembleSoul(ctx), ...delivery.pointers],
        opts: soulRenderOptions(ctx),
        fitWarnings: [],
      };
  }
}

export function compile(build: Build | BuildV1, lib: Library = library): CompileResult {
  // 1. Validate. A v1 build is checked as v1 first so its errors stay v1 errors, then migrated.
  if (build.v === 1) {
    validate(build, lib);
  }
  const b = build.v === 1 ? migrate(build) : build;
  validateV2(b, lib);

  // 2. Resolve the profile, the picks, the gates and limits, and the shared context.
  const profile = resolveProfile(b, lib);
  const form = chassisFormOf(profile, b);
  const cap = capOf(profile, b);
  const resolved = resolve(b, lib);
  const packs = b.packs
    .map((id) => lib.packs.find((p) => p.id === id))
    .filter((p): p is WorkflowPack => p !== undefined);
  const ctx: CompileContext = {
    build: b,
    lib,
    profile,
    form,
    cap,
    resolved,
    chassis: applyChassis(resolved.chassis, profile, form),
    gates: effectiveGates(b, lib),
    limits: effectiveLimits(b, lib),
    packs,
    roles: normalizeRoles(b, lib),
  };

  // 3. Skills and routines, delivered the way the profile carries them.
  const delivery = skillsAndRoutines(ctx);

  // 4. Assemble the personality items for the profile's layout.
  const laid = layout(ctx, delivery);

  // 5. Dedupe, drop contradiction losers, then trim to the profile's cap.
  const deduped = dedupe(laid.items, lib, resolved);
  const decontradicted = contradictions(deduped.items, b, lib);
  const trimmed =
    profile.layout === 'instructions' && form === 'short'
      ? { items: decontradicted.items, warnings: laid.fitWarnings }
      : length(decontradicted.items, b, lib, cap, laid.opts);
  const { soul, soulLines } = render(trimmed.items, lib, laid.opts);

  const warnings = [...deduped.warnings, ...decontradicted.warnings, ...trimmed.warnings];
  // V25: nothing protected is dropped, so a soul still over its cap ships with a warning.
  const overCap = `length: soul is ${soul.length} characters, over ${cap}`;
  if (soul.length > cap && !warnings.some((w) => w.startsWith(overCap))) {
    warnings.push(overCap);
  }

  // 6. Seed and memory.
  const seedText = seed(
    b,
    lib,
    packs.flatMap((p) => p.seeds.map((s) => s.line)),
  );
  const memory = memoryDelivery(ctx, seedText, seedIds(b, lib, packs));

  // 7 to 12. The bundle: files, spoken sentences, custom rules, notes, roles.
  const name = buildName(b, lib);
  const bundle = assembleBundle(ctx, { soul, soulLines, buildName: name, memory, delivery });
  warnings.push(...bundle.warnings);

  const result: CompileResult = {
    profile: profile.id,
    files: bundle.files,
    spoken: bundle.spoken,
    customRules: bundle.customRules,
    ...(bundle.conversationStarters ? { conversationStarters: bundle.conversationStarters } : {}),
    ...(bundle.description !== undefined ? { description: bundle.description } : {}),
    installSteps: bundle.installSteps,
    notes: bundle.notes,
    gates: ctx.gates,
    limits: ctx.limits,
    packs: [...b.packs],
    roles: ctx.roles.map((r) => r.id),
    soul,
    soulLines,
    seed: seedText,
    skills: skills(b, lib),
    badges: resolved.badges,
    buildName: name,
    length: soul.length,
    warnings,
  };

  // 13. Trace: every line of every file and every spoken sentence maps to a library id.
  traceBundle(result, lib);
  return result;
}
