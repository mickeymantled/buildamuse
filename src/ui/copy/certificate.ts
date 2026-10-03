// Certificate screen strings (M4 slice 4.12 owns this file). Spread into copy in src/ui/copy.ts.
// The first block of keys is the M3 placeholder's; slice 4.12 replaces it.
// The keys after it are the certificate model's (slice 4.11): summary lines, group and block titles,
// the skipped lines. Library text (gate, pack, role and limit labels, notes) is never copied here.

// The screens a user can skip. Each gets a "You skipped <name>." line on the certificate.
export type SkippedScreen =
  | 'world'
  | 'packs'
  | 'limits'
  | 'gates'
  | 'stats'
  | 'peeves'
  | 'heart'
  | 'outfit'
  | 'roles';

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export const certificateCopy = {
  certificate: {
    name: 'Name',
    soul: 'Personality',
    seed: 'Memory sentence',
    skills: 'Skills',
    rules: 'Custom rules',
    description: 'Description',
    starters: 'Conversation starters',
    steps: 'Install steps',
    notes: 'Notes',
    warnings: 'Warnings',

    // Summary lines, in plain words. The model fills the slots from the build and the library.
    summary: {
      auto: 'Auto, no yes asked:',
      over: (n: number, cap: number, target: string) =>
        `Your bot's personality is ${n} ${plural(n, 'character', 'characters')} over the ${cap} limit for ${target}.`,
      trimmedPack: (target: string, n: number, pack: string) =>
        `To fit ${target}, ${n} ${plural(n, 'rule', 'rules')} from ${pack} ${plural(n, 'was', 'were')} left out.`,
      // Cut from the personality text only: a rules file still carries the rule. `where` is the
      // rules file paths, joined, and `soul` the personality file path, both read from the bundle.
      keptPack: (target: string, n: number, pack: string, where: string, soul: string | undefined) =>
        `To fit ${target}, ${n} ${plural(n, 'rule', 'rules')} from ${pack} ${plural(n, 'is', 'are')} in ${where}, not in ${soul ?? 'the personality text'}.`,
      trimmedOther: (target: string, n: number) =>
        `To fit ${target}, ${n} ${plural(n, 'line was', 'lines were')} shortened or left out.`,
      dropped: 'Changed when this link opened:',
      droppedNamed: (label: string) => `${label} (left out)`,
      droppedUnknown: (n: number) =>
        `${n} ${plural(n, 'pick in this link was', 'picks in this link were')} not recognized, so ${plural(n, 'it was', 'they were')} left out or reset.`,
      droppedRiskRemoved: 'Risk was removed because no Markets chip is picked.',
      droppedRiskAdded: 'Risk was added at its default level.',
      droppedDriveReset: 'What it wants first was reset to match the hard part.',
      droppedNameCleaned: 'The name was tidied up.',
      undelivered: (target: string) => `Not included on ${target}:`,
    },

    // Group headings and block titles. Titles of files and spoken items come from the bundle.
    groups: {
      skills: 'Skills',
      routines: 'Routines',
      standing: 'Standing instructions',
      starters: 'Conversation starters',
      leftOut: 'Left out',
    },
    blockTitles: {
      label: 'Label',
      description: 'Description',
      starter: (n: number) => `Starter ${n}`,
      mine: 'Mine',
    },

    skipped: (name: string) => `You skipped ${name}.`,
    skippedNames: {
      world: 'your world',
      packs: 'packs',
      limits: 'limits',
      gates: 'approvals',
      stats: 'the sliders',
      peeves: 'pet peeves',
      heart: 'heart',
      outfit: 'outfit',
      roles: 'roles',
    } satisfies Record<SkippedScreen, string>,
  },
};
