// The compiler entry point. One pure function: same Build and Library in,
// same CompileResult out, every time. Runs the ten passes in order and
// traces the result before returning.

import type { Build, CompileResult, Library } from './types.js';
import { validate } from './passes/validate.js';
import { resolve } from './passes/resolve.js';
import { assemble } from './passes/assemble.js';
import { dedupe } from './passes/dedupe.js';
import { contradictions } from './passes/contradictions.js';
import { length } from './passes/length.js';
import { render } from './passes/render.js';
import { buildName } from './passes/name.js';
import { seed } from './passes/seed.js';
import { skills } from './passes/skills.js';
import { trace } from './trace.js';
import library from '../library/index.js';

export { library };

export function compile(build: Build, lib: Library = library): CompileResult {
  // 1. Validate. Throws on the first violation found.
  validate(build, lib);

  // 2. Resolve conditions into the picks later passes render from.
  const resolved = resolve(build, lib);

  // 3. Assemble items in fixed section order. Examples (pass 7) are computed
  // here too, since the length pass must measure them.
  const assembled = assemble(build, lib, resolved);

  // 4. Dedupe restated, covered, and repeated lines.
  const deduped = dedupe(assembled, lib, resolved);

  // 5. Drop contradiction losers.
  const decontradicted = contradictions(deduped.items, build, lib);

  // 6. Trim under the max soul length.
  const trimmed = length(decontradicted.items, build, lib);

  // Render the final soul text and traced lines.
  const { soul, soulLines } = render(trimmed.items, lib);

  // 11. Trace: every line maps to exactly one library record id.
  trace(soul, soulLines, lib);

  const warnings = [...deduped.warnings, ...decontradicted.warnings, ...trimmed.warnings];

  return {
    soul,
    soulLines,
    seed: seed(build, lib),
    skills: skills(build, lib),
    badges: resolved.badges,
    buildName: buildName(build, lib),
    length: soul.length,
    warnings,
  };
}
