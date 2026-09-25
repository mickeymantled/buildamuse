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
  | 'clash';

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

export interface Build {
  v: number; // LIBRARY_VERSION at time of build
  base: BaseId;
  chips: ChipId[]; // max 6, insertion order matters
  stats: Stats; // sum <= 14 across present stats
  peeves: PeeveId[]; // max 5
  heart: { hardPart: HardPartId; d1: DriveId; d2: DriveId }; // d3 assigned by compiler
  outfit: OutfitId;
  name: string; // 1..24 chars, trimmed
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
  | 'example';

export interface ChassisLine {
  id: string;
  section: Section;
  line: string;
  when?: Cond;
}

export interface Base {
  id: BaseId;
  label: string;
  defaults: Build['stats'];
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

export interface Skill {
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
  skills?: Skill[];
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
  build: Build;
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
