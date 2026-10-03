// Every UI string in one object. Library text (target promises, mode notes, pack and gate labels,
// stat samples, outfit cards) stays in src/library and is read from there, never copied here.
// Strings the spec or brief gives are verbatim. The rest are plain wording for Brian to confirm
// (QUESTIONS U5). Part E: the UI says "bot", not "SOUL.md" or "Muse", except where a target uses a SOUL.md file.

import type { ChipGroup, GateSetting, Plan, ProfileId, StatId } from '../compiler/types.js';
import type { ScreenId } from './flow.js';

export const copy = {
  appName: 'Build-a-Bot',

  buttons: {
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    use: 'Use',
    remix: 'Remix',
    pickStarter: 'Pick a starter',
    buildYourOwn: 'Build your own',
    close: 'Close',
  },

  // Titles for stations 1 to 7 are the spec's station names. Subtitles and the v2 screens are plain wording.
  screens: {
    target: {
      title: 'Pick your bot',
      subtitle: 'Where will your bot live? You can switch later and keep your picks.',
    },
    roster: {
      title: 'Pick a starter',
      subtitle: 'Start from a ready-made bot, or build your own from scratch.',
    },
    base: {
      title: 'Choose your base',
      subtitle: 'Which one sounds most like you? It sets where the sliders start.',
    },
    world: {
      title: 'Your world',
      subtitle: 'Tap what is part of your life.',
    },
    packs: {
      title: 'What should it do?',
      subtitle: 'These came from your world. Change them if you like.',
    },
    limits: {
      title: 'Set your limits',
      subtitle: 'Numbers your bot will not go past.',
    },
    gates: {
      title: 'What needs your yes?',
      subtitle: 'For each action, choose whether your bot just does it, asks first, or never does it.',
    },
    stats: {
      title: 'Stuff it',
      subtitle: 'Slide each one to set how your bot sounds and acts.',
    },
    peeves: {
      title: 'Pet peeves',
      subtitle: 'Tap what your bot should never do.',
    },
    heart: {
      title: 'Heart',
      subtitle: 'What is the hard part for you? Your answer picks what your bot wants most.',
    },
    outfit: {
      title: 'Dress it',
      subtitle: 'Who does your bot remind you of?',
    },
    roles: {
      title: 'Roles',
      subtitle: 'Split the work between a small team. Each role gets its own job and its own never list.',
    },
    name: {
      title: 'Name it',
      subtitle: 'Give your bot a name.',
    },
    certificate: {
      title: 'Your bot',
      subtitle: 'Here is what you built.',
    },
  } satisfies Record<ScreenId, { title: string; subtitle: string }>,

  // The name given to a build that has none yet, so the preview always compiles (U3).
  defaultName: 'My bot',

  // Remix warning, verbatim from the spec. It names Muse; the UI says "bot" elsewhere (QUESTIONS U5).
  remixWarning: "This rebuilds from your picks. Changes you made to the file in Muse won't carry over.",

  // The floor line under Blunt and Warm at level 1. The spec's line names Muse; Part E says bot (U4).
  floorLine: 'every bot comes with a little honesty and a little care already in.',

  // Chip and counter wording.
  full: 'full',
  alreadyBuiltIn: 'already built in',
  counter: (n: number, max: number) => `${n}/${max}`,
  step: (n: number, total: number) => `Step ${n} of ${total}`,
  groups: {
    Work: 'Work',
    Markets: 'Markets',
    Life: 'Life',
    Time: 'Time',
  } satisfies Record<ChipGroup, string>,

  stats: {
    labels: {
      blunt: 'Blunt',
      warm: 'Warm',
      funny: 'Funny',
      chatty: 'Chatty',
      proactive: 'Proactive',
      risk: 'Risk',
    } satisfies Record<StatId, string>,
    level: (n: number) => `Level ${n} of 4`,
    riskHint: 'Risk shows up when you tap a Markets chip.',
    // Stats screen. Sample replies and the risk level names come from the library.
    budget: 'Points used',
    counterLabel: (n: number, max: number) => `${n} of ${max} points used`,
    // Level names for the stats the library gives none for (risk has its own).
    stops: ['Low', 'Medium', 'High', 'Max'],
    sampleLabel: 'Sounds like',
    badgesHeading: 'Badges',
    noBadges: 'No badges yet. Moving the sliders can light them up.',
    badgeNew: 'New badge',
  },

  // Target screen. The promise lines, mode names and mode notes come from the library.
  target: {
    required: 'Pick one to continue.',
    modeLegend: 'ChatGPT mode',
    planLegend: 'ChatGPT plan',
    plans: { free: 'Free', paid: 'Paid' } satisfies Record<Plan, string>,
    paidSteer: 'This many rules will not fit well on the free plan. The paid plan has room for all of them.',
  },

  // Base screen. The eight labels come from the library.
  base: {
    required: 'Pick one to continue.',
  },

  // World screen. Chip labels come from the library; group headings are copy.groups.
  world: {
    pickUpTo: (max: number) => `Pick up to ${max}`,
    counterLabel: (n: number, max: number) => `${n} of ${max} chosen`,
  },

  // Packs screen. Pack labels and their skill names come from the library.
  packs: {
    none: 'No packs picked. Your bot will still work without them.',
    counterLabel: (n: number, max: number) => `${n} of ${max} packs chosen`,
  },

  // Peeves screen. Chip labels come from the library; "already built in" is copy.alreadyBuiltIn.
  peeves: {
    pickUpTo: (max: number) => `Pick up to ${max}`,
    counterLabel: (n: number, max: number) => `${n} of ${max} chosen`,
    builtInNote: 'Every bot already has these, so they add no line.',
  },

  heart: {
    question: 'What is the hard part for you?',
    d1: 'It wants this first',
    d1Alternate: 'Or, from your world',
    d2: 'And this second',
    d3: 'And this, always',
    d3Locked: 'every bot has this one.',
  },

  name: {
    label: 'Name',
    count: (n: number, max: number) => `${n}/${max}`,
  },

  // Limits screen. Labels, units and venue notes come from the library.
  limits: {
    none: 'Nothing to set for your picks.',
    lower: (label: string) => `Lower ${label}`,
    raise: (label: string) => `Raise ${label}`,
  },

  gates: {
    // Plain labels for the three settings, and one line each saying what it means.
    settings: {
      auto: 'Auto',
      approve: 'Approve',
      forbid: 'Forbid',
    } satisfies Record<GateSetting, string>,
    hints: {
      auto: 'Does it on its own',
      approve: 'Asks you first',
      forbid: 'Never does it',
    } satisfies Record<GateSetting, string>,
    locked: 'Locked',
    payLocked: 'Payments are always off.',
    none: 'Nothing to approve for your picks.',
    switchToPaid: 'Switch to Paid',
  },

  // What each profile does with the gate settings. Verbatim from Part E, one per profile.
  gatesCopy: {
    muse: "these go in your soul and Muse's approval cards do the rest",
    openclaw: 'these also go in AGENTS.md so they survive delegation',
    hermes: 'these also go in AGENTS.md so they survive delegation',
    grok: "these go in the Bot description and in every skill's approval field",
    'chatgpt-dot': 'these become Custom Rules in Settings, which ChatGPT enforces',
    'chatgpt-gpt':
      'these go at the top and bottom of your instructions; ChatGPT has no approval surface beyond this, so they do all the work.',
    'chatgpt-instructions':
      'these go at the top and bottom of your instructions; ChatGPT has no approval surface beyond this, so they do all the work.',
    'chatgpt-project':
      'these go at the top and bottom of your instructions; ChatGPT has no approval surface beyond this, so they do all the work.',
  } satisfies Record<ProfileId, string>,

  roles: {
    toggle: 'Advanced: split into roles',
    // One line under the packs-screen switch.
    toggleHint: 'Turn one bot into a small team, each with its own job.',
    coordinator: 'Always on',
    // A team's lead before any role in that team is picked.
    coordinatorIdle: 'Joins when you pick a role here',
    off: 'Roles are off. You can turn them on at the bottom of the packs screen.',
    none: 'None of your packs have a team yet.',
  },

  // Certificate is M4. "Make this for <other target> instead" is verbatim from Part E.
  makeFor: (targetLabel: string) => `Make this for ${targetLabel} instead`,

  // M3 placeholder headings for the plain-text bundle on the certificate screen. M4 replaces them.
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
  },

  // Stub screens until their slice lands. The marker is deliberately visible.
  todo: (slice: string) => `[TODO: slice ${slice}]`,
  stub: {
    fill: 'Use a placeholder for now',
  },

  preview: {
    open: 'Preview',
    close: 'Close',
    length: (len: number, cap: number) => `${len}/${cap} characters`,
    badgeLit: 'Badge unlocked',
    // The peek sheet. The chassis label is the spec's "every Muse gets these." with "bot" (U4).
    title: "Your bot's personality",
    chassisLabel: 'every bot gets these.',
    over: (n: number) => `Over by ${n}`,
  },
};

export type Copy = typeof copy;
