// Build-a-Muse compiler types.
// The build object is the only user-facing state. Everything else is library.

export type Level = 1 | 2 | 3 | 4;

export type StatId = 'blunt' | 'warm' | 'funny' | 'chatty' | 'proactive' | 'risk';
export type BaseId =
  | 'trader'
  | 'builder'
  | 'professional'
  | 'parent'
  | 'student'
  | 'creator'
  | 'operator'
  | 'chaos';
export type HardPartId =
  | 'too_much'
  | 'forget'
  | 'need_a_push'
  | 'check_my_work'
  | 'calmer'
  | 'talk_it_through';
export type ChipGroup = 'Work' | 'Markets' | 'Life' | 'Time';

// Ids below live as data in the library JSON, not as code-level unions.
export type ChipId = string;
export type PeeveId = string;
export type BadgeId = string;
export type DriveId = string;
export type OutfitId = string;

// v2 ids. Targets and profiles are closed sets; the rest live as data in the library JSON.
export type TargetId = 'muse' | 'openclaw' | 'hermes' | 'grok' | 'chatgpt';
export type ChatgptMode = 'dot' | 'gpt' | 'instructions' | 'project';
export type ProfileId =
  | 'muse'
  | 'openclaw'
  | 'hermes'
  | 'grok'
  | 'chatgpt-dot'
  | 'chatgpt-gpt'
  | 'chatgpt-instructions'
  | 'chatgpt-project';
export type Plan = 'free' | 'paid';
export type PackId = string;
export type RoleId = string;
export type RoleSetId = string;
export type ActionId = string;
export type LimitId = string;
export type GateSetting = 'auto' | 'approve' | 'forbid';

export type Section =
  | 'opening'
  | 'who'
  | 'want'
  | 'talk'
  | 'instincts'
  | 'act'
  | 'trading'
  | 'proactive'
  | 'memory'
  | 'examples'
  | 'clash'
  | 'rules'
  | 'rules-top'
  | 'rules-bottom'
  | 'mission'
  | 'reporting'
  | 'unsure'
  | 'sources'
  | 'never'
  | 'missing'
  | 'return';

// The only runtime value in this file: section render order.
export const SECTION_ORDER: readonly Section[] = [
  'opening',
  'who',
  'want',
  'talk',
  'instincts',
  'act',
  'trading',
  'proactive',
  'memory',
  'examples',
  'clash',
  // v2 sections. Appended so today's soul output is unchanged; the layout slices order them per profile.
  'rules',
  'rules-top',
  'rules-bottom',
  'mission',
  'reporting',
  'unsure',
  'sources',
  'never',
  'missing',
  'return',
] as const;

// Small predicate language evaluated against a Build. Conditions live in JSON, not in code.
export type Cond =
  | { stat: StatId; gte?: Level; lte?: Level; eq?: Level }
  | { chip: ChipId }
  | { anyChipGroup: ChipGroup }
  | { base: BaseId }
  | { hardPart: HardPartId }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

export interface Stats {
  blunt: Level;
  warm: Level;
  funny: Level;
  chatty: Level;
  proactive: Level;
  risk?: Level; // present only if a Markets chip is tapped
}

// The v1 fields. Every v1 pass takes BuildCore, so it works on a v1 or a v2 build.
export interface BuildCore {
  base: BaseId;
  chips: ChipId[]; // max 6, insertion order matters
  stats: Stats; // sum <= 14 across present stats
  peeves: PeeveId[]; // max 5
  heart: { hardPart: HardPartId; d1: DriveId; d2: DriveId }; // d3 assigned by compiler
  outfit: OutfitId;
  name: string; // 1..24 chars, trimmed
}

export interface BuildV1 extends BuildCore {
  v: 1;
}

export interface Build extends BuildCore {
  v: 2;
  target: TargetId;
  mode?: ChatgptMode; // only when target is chatgpt; absent means 'dot'
  plan?: Plan; // only when the profile is chatgpt-instructions; absent means 'free'
  packs: PackId[]; // 0..3, unique
  limits: Record<LimitId, number>;
  gates: Record<ActionId, GateSetting>;
  roles?: RoleId[];
}

export type LineKind =
  | 'opening'
  | 'heading'
  | 'blank'
  | 'who'
  | 'drive'
  | 'chassis'
  | 'stat'
  | 'peeve'
  | 'chip-trigger'
  | 'badge'
  | 'hardpart-extra'
  | 'voice'
  | 'example'
  | 'pack-trigger'
  | 'gate'
  | 'rule'
  | 'limit'
  | 'pack-rule'
  | 'role';

export interface ChassisLine {
  id: string;
  section: Section;
  line: string;
  short?: string; // used when a profile's chassisForm is 'short'
  when?: Cond;
}

export interface Base {
  id: BaseId;
  label: string;
  defaults: Stats;
  chipsFirst: 'Work' | 'Markets' | 'Life';
  baseLine: string;
  noun: string;
}

export interface StatLevel {
  id: string;
  stat: StatId;
  level: Level;
  line: string;
  sample: string;
  label?: string;
}

export interface Badge {
  id: BadgeId;
  name: string;
  when: Cond;
  line: string;
  section: Section;
}

export interface Trigger {
  id: string;
  line: string;
}

// Chip skill: the v1 shape, one spoken sentence.
export interface ChipSkill {
  id: string;
  name: string;
  kind: 'trigger' | 'schedule';
  schedule?: string;
  sentence: string;
  detail: string; // verbatim parenthetical text from the library
}

export interface Chip {
  id: ChipId;
  group: ChipGroup;
  label: string;
  triggers: Trigger[]; // 0..3
  seed?: string; // one clause
  skills?: ChipSkill[];
  voice?: string;
  unlocks?: { risk?: boolean; badges?: BadgeId[]; proactivePlusOne?: boolean };
  d1Suggest?: DriveId;
  domainNoun?: string; // for the seed sentence
}

export interface Peeve {
  id: PeeveId;
  label: string;
  line?: string; // no line = chassis covers it
  dedupesWith?: string[];
}

export interface HardPart {
  id: HardPartId;
  label: string;
  d1: DriveId;
  extraLine?: string;
  forceBadge?: BadgeId;
  seedClause: string;
}

export interface Drive {
  id: DriveId;
  slot: 'd1' | 'd2' | 'd3';
  line: string;
  when?: Cond;
  hardPart?: HardPartId;
  chip?: ChipId; // which record offers it
}

export interface Outfit {
  id: OutfitId;
  card: string;
  anchor: string;
  sampleHey: string;
}

export interface ExampleGreeting {
  id: string;
  when: Cond;
  you: string; // me is always "hey"
}

export interface ExampleDomain {
  id: string;
  chip: ChipId | 'default';
  when?: Cond;
  me: string;
  youBlunt: string;
  youGentle: string;
}

export interface NameWord {
  stat: StatId;
  level?: Level;
  word: string;
}

export interface RosterEntry {
  id: string;
  build: BuildV1; // starters are target-agnostic; migrate() adds a target
  tagline: string;
  signature: string;
  buildName: string; // the expected build name from the roster table
}

export interface Heading {
  id: string;
  section: Section;
  text: string;
}

export interface Template {
  id: string;
  text: string;
}

export interface Contradiction {
  id: string;
  when: Cond;
  drop: { kind: LineKind; group?: ChipGroup; contains?: string };
  reason: string;
}

export interface TracedLine {
  text: string;
  id: string;
  kind: LineKind;
  sources?: string[];
}

// Internal draft line used by compile passes, before tracing collapses it into a TracedLine.
export interface Item {
  id: string;
  text: string;
  kind: LineKind;
  section: Section;
  format: 'bullet' | 'plain';
  blankBefore?: boolean;
  chip?: ChipId;
  group?: ChipGroup;
  triggerIndex?: number;
  sources?: string[];
}

// Output of the resolve pass: the picks that later passes render from.
export interface Resolved {
  badges: BadgeId[];
  chassis: ChassisLine[];
  d3: Drive;
  greeting: ExampleGreeting;
  domain: ExampleDomain;
}

export interface PassResult {
  items: Item[];
  warnings: string[];
}

// A library line with a record id. The unit of trace for v2 records.
export interface Line {
  id: string;
  line: string;
}

export interface TargetCard {
  id: TargetId;
  label: string;
  promise: Line;
  modes?: { id: ChatgptMode; label: string; note: Line }[];
}

// A profile is the unit of delivery: everything about how a bundle is built for one runtime.
export interface Profile {
  id: ProfileId;
  target: TargetId;
  mode?: ChatgptMode;
  label: string;
  docUrl: string;
  docReadDate: string; // pinned, YYYY-MM-DD
  layout: 'soul' | 'grok' | 'instructions';
  personalityPath: string; // literal path or UI location
  personalityDelivery: 'file' | 'paste' | 'spoken';
  openingLines: Line[];
  chassisForm: 'full' | 'short'; // 'short' uses each chassis line's `short` text
  chassisVariants: Record<string, string | null>; // chassis id -> replacement text, or null to omit
  rulesDelivery: 'AGENTS.md' | 'RULES.md' | 'inline' | 'description' | 'custom-rules';
  rulesInSoul: 'none' | 'section' | 'top-and-bottom';
  skillsDelivery: 'files' | 'spoken' | 'inline' | 'knowledge';
  memoryDelivery: 'file' | 'spoken' | 'inline';
  routinesDelivery: 'spoken' | 'files' | 'none';
  installSteps: Line[];
  reloadNote: Line | null;
  verify: Line[]; // each line text starts "verify: "
  supportsRoles: boolean;
  roleFallback: 'workspaces' | 'profiles' | 'team' | 'separate-bundles' | 'single-dot-note' | 'none';
  lengthCap: number | { free: number; paid: number };
  customRuleSettings?: Record<GateSetting, string>; // chatgpt-dot only
  templates: Record<string, Line>;
}

// Pack skill: the six-field shape. Every profile renders a subset.
export interface Skill {
  id: string;
  name: string;
  kind: 'trigger' | 'schedule';
  schedule?: string;
  whenToUse: string;
  inputs: string;
  steps: string[];
  validate: string;
  returns: string;
  requiresApproval: string; // human text; "none" when nothing needs a yes
  actions: ActionId[]; // machine list of gated actions this skill can take
}

export interface WorkflowPack {
  id: PackId;
  label: string;
  triggers: Line[]; // <= 8
  gatesDefault: Record<ActionId, GateSetting>;
  limitsDefault: Record<LimitId, number>;
  limitChips: LimitId[];
  skills: Skill[];
  seeds: Line[]; // memory clauses
  defaultRoles: RoleId[];
  rulesLines: Line[];
  venueNotes?: Record<string, Line>; // keyed by ProfileId
  job?: Line; // grok profile overrides
  sources?: Line[];
  deliverable?: Line;
  firstTask?: Line;
  profiles?: ProfileId[]; // absent = deliverable on every profile
}

export interface RoleSet {
  id: RoleSetId;
  label: string;
  coordinator: RoleId;
  members: RoleId[];
  defaultMembers: RoleId[];
  packs: PackId[];
  templates: Record<string, Line>;
}

export interface RolePack {
  id: RoleId;
  set: RoleSetId;
  label: string;
  mission: Line;
  drive: Line;
  counterDrive: Line;
  never: Line[]; // 3..6
  reporting: { to: RoleId | 'user'; format: Line; verdictFirst: boolean };
  proactiveDefault: Level;
  bluntDefault: Level;
  uncertaintyRule: Line;
  anchorExchange: { me: Line; you: Line };
  canDelegate: boolean;
  lockedStats?: Partial<Stats>;
}

export interface ActionGate {
  id: ActionId;
  label: string;
  class: 'money' | 'mail' | 'data' | 'other'; // the pack-default safety test uses this
  soulLine: Record<GateSetting, string | null>; // personality layer text per setting
  rulesLine: Record<GateSetting, string>; // rules layer text per setting
  customRuleText: string; // Dots phrasing: describes the action
}

export interface Limit {
  id: LimitId;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  stricter: 'lower' | 'higher';
  rulesTemplate: string; // uses {value}
}

export interface Library {
  version: number;
  chassis: { lines: ChassisLine[]; headings: Heading[]; who: Template; blank: Template };
  bases: Base[];
  stats: StatLevel[];
  badges: Badge[];
  chips: Chip[];
  peeves: Peeve[];
  heart: { hardParts: HardPart[]; drives: Drive[] };
  outfits: Outfit[];
  examples: { greetingMe: Template; greetings: ExampleGreeting[]; domains: ExampleDomain[] };
  names: { order: StatId[]; words: NameWord[] };
  roster: RosterEntry[];
  contradictions: Contradiction[];
  targets: { targets: TargetCard[]; profiles: Profile[] };
  gates: ActionGate[]; // registry order is the gate order everywhere
  limits: Limit[];
  packs: WorkflowPack[];
  roleSets: RoleSet[];
  roles: RolePack[];
}

export interface SkillSentence {
  name: string;
  sentence: string;
}

export interface CompileResult {
  soul: string; // the SOUL.md text
  soulLines: TracedLine[]; // every line with the record id that emitted it
  seed: string; // the memory sentence
  skills: SkillSentence[]; // in chip tap order
  badges: BadgeId[]; // for the UI and certificate
  buildName: string;
  length: number; // soul.length
  warnings: string[]; // e.g. over-length, dropped lines
}

// The v2 bundle fields. A later slice makes CompileResult extend this.
export interface BundleFile {
  path: string;
  label: string;
  delivery: 'file' | 'paste';
  content: string;
  lines: TracedLine[];
}

export interface SpokenItem {
  label: string;
  text: string;
  ids: string[];
}

export interface CustomRule {
  gate: ActionId;
  action: string;
  setting: string;
  ids: string[];
}

export interface BundleFields {
  profile: ProfileId;
  files: BundleFile[];
  spoken: SpokenItem[];
  customRules: CustomRule[]; // chatgpt-dot only, else []
  conversationStarters?: string[]; // chatgpt-gpt only
  description?: string; // chatgpt-gpt only, < 300 chars
  installSteps: string[];
  notes: string[]; // verify lines, reload note, venue notes, fallback warnings
  gates: Record<ActionId, GateSetting>;
  limits: Record<LimitId, number>;
  packs: PackId[];
  roles: RoleId[];
}
