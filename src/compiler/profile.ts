// Profile resolution: which delivery profile a build targets, its length cap, and how the
// chassis lines are rendered for it. Pure; the library is never mutated.

import type { Build, ChassisLine, Library, Profile, ProfileId } from './types.js';

export function profileIdOf(build: Build): ProfileId {
  return build.target === 'chatgpt' ? `chatgpt-${build.mode ?? 'dot'}` : build.target;
}

export function resolveProfile(build: Build, lib: Library): Profile {
  const id = profileIdOf(build);
  const profile = lib.targets.profiles.find((p) => p.id === id);
  if (!profile) {
    throw new Error(`Unknown profile: ${id}`);
  }
  return profile;
}

export function capOf(profile: Profile, build: Build): number {
  const cap = profile.lengthCap;
  return typeof cap === 'number' ? cap : cap[build.plan ?? 'free'];
}

// The free ChatGPT instructions box is the one place the short chassis form is forced by plan.
export function chassisFormOf(profile: Profile, build: Build): 'full' | 'short' {
  if (profile.id === 'chatgpt-instructions' && (build.plan ?? 'free') === 'free') {
    return 'short';
  }
  return profile.chassisForm;
}

// Own-key lookup so a chassis id can never collide with an Object.prototype member.
function own<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}

export function applyChassis(
  lines: ChassisLine[],
  profile: Profile,
  form: 'full' | 'short',
): ChassisLine[] {
  const out: ChassisLine[] = [];
  for (const line of lines) {
    const variant = own(profile.chassisVariants, line.id);
    if (variant === null) {
      continue;
    }
    if (form === 'short') {
      const profileShort = own(profile.chassisShortVariants, line.id);
      if (profileShort !== undefined) {
        out.push({ ...line, line: profileShort, id: `${line.id}#short@${profile.id}` });
        continue;
      }
      // A profile's own wording wins over the generic short form (a dot soul must not
      // get the file-target short text); with no profile short form, use the variant.
      if (line.short !== undefined && typeof variant !== 'string') {
        out.push({ ...line, line: line.short, id: `${line.id}#short` });
        continue;
      }
    }
    if (typeof variant === 'string') {
      out.push({ ...line, line: variant, id: `${line.id}@${profile.id}` });
    } else {
      out.push({ ...line });
    }
  }
  return out;
}
