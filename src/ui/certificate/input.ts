// The certificate's input and model as selectors on the builder state (M4 slice 4.12, plan sections
// 4 to 6). Both are pure and memoized by a JSON key, like the selectors in store.ts, so a screen can
// pass them to useBuilder and get the same object back for the same state.

import { mineLines, mineTexts, withMine } from '../../share/mine.js';
import {
  capOf,
  compiled,
  isCompileError,
  previewBuild,
  profileOf,
  type BuilderState,
  type CompileError,
} from '../store.js';
import { certificateModel, starterIdOf, type CertInput, type CertModel } from './model.js';

// CertInput with the Mine count of lines the cap cut, which the model has no use for and the screen does.
export interface CertificateInput extends CertInput {
  mine: { lines: string[]; on: boolean; replacedDashes: boolean; dropped: number };
}

const MEMO_MAX = 32;

// Everything the input reads from the state. The pasted text is in the key, so a new paste misses.
function keyOf(s: BuilderState): string {
  return JSON.stringify([
    s.target,
    s.mode,
    s.plan,
    s.draft,
    s.from,
    s.skipped,
    s.drops,
    s.decodeWarnings,
    s.baseline,
    s.pasted,
    s.mineOn,
  ]);
}

const inputs = new Map<string, CertificateInput | CompileError>();

// The compile with Mine applied when its switch is on, and what the model needs beside it. A build
// that does not compile gives the compile error, as compiled() does.
export function certificateInput(state: BuilderState): CertificateInput | CompileError {
  const key = keyOf(state);
  const hit = inputs.get(key);
  if (hit !== undefined) return hit;

  const base = compiled(state);
  let value: CertificateInput | CompileError;
  if (isCompileError(base)) {
    value = base;
  } else {
    const build = previewBuild(state);
    const profile = profileOf(state);
    const found = mineLines(state.pasted, mineTexts(base, state.baseline));
    const on = state.mineOn;
    value = {
      result: on && found.lines.length > 0 ? withMine(base, profile, found.lines, build) : base,
      build,
      profile,
      cap: capOf(state),
      from: state.from,
      skipped: state.skipped,
      drops: state.drops,
      decodeWarnings: state.decodeWarnings,
      starterId: starterIdOf(build),
      mine: { lines: found.lines, on, replacedDashes: found.replacedDashes, dropped: found.dropped },
    };
  }

  inputs.set(key, value);
  if (inputs.size > MEMO_MAX) {
    const oldest = inputs.keys().next().value;
    if (oldest !== undefined) inputs.delete(oldest);
  }
  return value;
}

// One model per input object, so the model is as stable as the input.
const models = new WeakMap<CertificateInput, CertModel>();

// certificateModel(certificateInput(state)), or the compile error.
export function certificateModelOf(state: BuilderState): CertModel | CompileError {
  const input = certificateInput(state);
  if (!('result' in input)) return input;
  const hit = models.get(input);
  if (hit !== undefined) return hit;
  const model = certificateModel(input);
  models.set(input, model);
  return model;
}
