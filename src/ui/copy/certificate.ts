// Certificate screen strings (M4 slice 4.12 owns this file). Spread into copy in src/ui/copy.ts.
// The summary, group, block and skipped strings are the certificate model's (slice 4.11). The rest
// are the screen's (slice 4.12): the header, the copy button labels, Show more, the custom rules
// table, Left out, Still checking, Details and the Mine switch. Library text (gate, pack, role and
// limit labels, notes, step lines, docs labels) is never copied here.
// Every function here takes numbers or strings only and builds one template literal, so the copy
// walker in test/ui-copy.test.ts can call it with sample arguments.

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
    // M3 titles that tests still read. Block titles now come from the bundle labels, which say the
    // same on the first two blocks.
    soul: 'Personality',
    seed: 'Memory sentence',
    steps: 'Install steps',
    notes: 'Notes',

    // Header. The spec's heading is "Meet <Name>".
    title: (name: string) => `Meet ${name}`,
    // The radar's text alternative: "<list>" is the stat labels with their levels, joined by the screen.
    radar: {
      item: (name: string, level: number) => `${name} ${level} of 4`,
      label: (list: string) => `Slider levels: ${list}`,
    },

    // A build that did not compile. The UI never builds one, so this is a safety net.
    error: 'Something went wrong building this bot. Go back and try again.',

    // Copy button labels, for every block and every custom rule.
    copyButton: {
      label: 'Copy',
      copied: 'Copied',
      failed: 'Copy it by hand',
    },
    showMore: 'Show more',

    // The ChatGPT dot rules table. Each rule is a card: the action text, then its setting.
    customRules: {
      setting: 'Setting:',
    },

    // Page sections that have no heading in the model.
    sections: {
      extra: 'Also included',
      leftOutHint: 'These rules did not fit. Add them by hand if you want them.',
    },

    // The lines the user is not sure about yet, then where they were read.
    stillChecking: {
      heading: 'Still checking',
      docsRead: (label: string, date: string) => `${label} docs read ${date}`,
    },

    // The raw compiler warnings, for anyone who wants them.
    details: {
      summary: 'Details',
    },

    // The switch for lines the user pasted on the remix screen. Next to it: their own words, unchecked (W12).
    mine: {
      label: 'Keep my edits',
      note: "These lines are your own words. They aren't checked against your approvals.",
      found: (n: number) =>
        `${n} ${plural(n, 'line', 'lines')} from what you pasted ${plural(n, 'is', 'are')} not in this build.`,
      included: 'Your lines are already in the personality above.',
      dashes: 'Long dashes in your lines were changed to hyphens.',
      dropped: (n: number, max: number) =>
        `${n} ${plural(n, 'line was', 'lines were')} left out. The limit is ${max} lines.`,
    },

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
