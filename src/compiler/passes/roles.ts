// Roles: normalize a build's role set, compile each role into a short task soul, and deliver
// the set the way the profile can carry it (workspaces, profiles, descriptions, bundles or a
// note). Every text comes from a library record or template; this file only fills
// placeholders and lays out lines. Pure; library data is never mutated.

import { fill } from '../fill.js';
import { gateSoulItems, rulesItems } from '../gates.js';
import type {
  Build,
  BundleFile,
  ChassisLine,
  CompileContext,
  Item,
  Level,
  Library,
  Line,
  Profile,
  RenderOptions,
  RolePack,
  RoleSet,
  Section,
  StatId,
  Trimmed,
} from '../types.js';
import { fitTiers } from './length.js';
import { render } from './render.js';

export interface RoleNote {
  text: string;
  ids: string[];
}

export interface RoleOutputs {
  files: BundleFile[];
  notes: RoleNote[];
  warnings: string[]; // a role soul over the profile's length cap
  trimmed: Trimmed[]; // what each role soul's length tiers cut, tagged with the role and its path
}

// Where a role soul reports what its length tiers cut.
interface Sink {
  warnings: string[];
  trimmed: Trimmed[];
}

const ROLE_ORDER: readonly Section[] = [
  'rules-top',
  'opening',
  'mission',
  'want',
  'talk',
  'never',
  'reporting',
  'unsure',
  'act',
  'rules',
  'memory',
  'examples',
  'clash',
  'rules-bottom',
];

// Grok layout: one text box. The rules block is the Never section, so there is no rules section.
const GROK_ROLE_ORDER: readonly Section[] = [
  'who',
  'want',
  'talk',
  'never',
  'unsure',
  'reporting',
  'examples',
];

// AGENTS.md for a role: title and intro in one section, the never and rules bullets in the next.
const AGENTS_ORDER: readonly Section[] = ['opening', 'rules'];

// The gate lines go right after this chassis line.
const APPROVAL_ID = 'chassis.act.approval';

// Roles that audit another role's work and get the no-stake and no-fix lines.
const AUDIT_ROLES: readonly string[] = ['reviewer', 'fact-checker'];

// The word filled into {to} when a role reports to the person, not to another role.
const USER_RECIPIENT = 'me';

type RoleStat = Exclude<StatId, 'risk'>;
const TALK_STATS: readonly RoleStat[] = ['blunt', 'warm', 'funny', 'chatty', 'proactive'];

// Key of the team note template. Grok has none yet, so its note is a marked placeholder.
const TEAM_NOTE_KEY = 'fallback.roles';

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function templateOf(templates: Record<string, Line>, key: string, owner: string): Line {
  const found = own(templates, key);
  if (!found) {
    throw new Error(`roles: ${owner} has no template "${key}"`);
  }
  return found;
}

function heading(line: Line): { id: string; text: string } {
  return { id: line.id, text: line.line };
}

function roleById(id: string, lib: Library): RolePack {
  const role = lib.roles.find((r) => r.id === id);
  if (!role) {
    throw new Error(`roles: unknown role ${id}`);
  }
  return role;
}

function setOf(role: RolePack, lib: Library): RoleSet {
  const set = lib.roleSets.find((s) => s.id === role.set);
  if (!set) {
    throw new Error(`roles: unknown role set ${role.set} for role ${role.id}`);
  }
  return set;
}

// Chassis ids can carry a suffix after applyChassis ("#short", "@profile").
function baseId(id: string): string {
  return id.split(/[#@]/, 1)[0];
}

// How a soul-layout profile carries rules inside a role soul. The grok layout carries them in its
// Never section and does not use this.
function rulesMode(profile: Profile): 'section' | 'top-and-bottom' | 'none' {
  if (profile.rulesInSoul === 'section' || profile.roleFallback === 'profiles') {
    return 'section';
  }
  return profile.rulesInSoul === 'top-and-bottom' ? 'top-and-bottom' : 'none';
}

// The set is the first role's set. The result is the unique roles of that set plus its
// coordinator, in the set's member order.
export function normalizeRoles(build: Build, lib: Library): RolePack[] {
  const ids = build.roles ?? [];
  const first = ids.map((id) => lib.roles.find((r) => r.id === id)).find((r) => r !== undefined);
  if (!first) {
    return [];
  }
  const set = setOf(first, lib);
  const wanted = new Set<string>(ids);
  wanted.add(set.coordinator);
  const out: RolePack[] = [];
  for (const memberId of set.members) {
    if (!wanted.has(memberId)) {
      continue;
    }
    const role = lib.roles.find((r) => r.id === memberId && r.set === set.id);
    if (role) {
      out.push(role);
    }
  }
  return out;
}

function chassisItems(
  chassis: ChassisLine[],
  section: Section,
  format: Item['format'],
  blankBefore = false,
): Item[] {
  return chassis
    .filter((line) => line.section === section)
    .map((line) => ({
      id: line.id,
      text: line.line,
      kind: 'chassis',
      section,
      format,
      ...(blankBefore ? { blankBefore } : {}),
    }));
}

function openingItems(ctx: CompileContext): Item[] {
  const lines: { id: string; text: string }[] = [
    ...ctx.chassis
      .filter((line) => line.section === 'opening')
      .map((line) => ({ id: line.id, text: line.line })),
    ...ctx.profile.openingLines.map((line) => ({ id: line.id, text: line.line })),
  ];
  return lines.map((line, i) => ({
    id: line.id,
    text: line.text,
    kind: 'opening',
    section: 'opening',
    format: 'plain',
    ...(i > 0 ? { blankBefore: true } : {}),
  }));
}

// A role's level for one stat: its lock, else its own default (blunt, proactive), else the build's.
function levelOf(ctx: CompileContext, role: RolePack, stat: RoleStat): Level {
  const locked = role.lockedStats?.[stat];
  if (locked !== undefined) {
    return locked;
  }
  if (stat === 'blunt') {
    return role.bluntDefault;
  }
  if (stat === 'proactive') {
    return role.proactiveDefault;
  }
  return ctx.build.stats[stat];
}

function statItem(ctx: CompileContext, role: RolePack, stat: RoleStat, section: Section): Item {
  const level = levelOf(ctx, role, stat);
  const record = ctx.lib.stats.find((s) => s.stat === stat && s.level === level);
  if (!record) {
    throw new Error(`roles: missing stat line for ${stat} ${level}`);
  }
  return { id: record.id, text: record.line, kind: 'stat', section, format: 'bullet' };
}

function templateItem(
  line: Line,
  vars: Record<string, string>,
  section: Section,
  sources: string[],
): Item {
  return {
    id: line.id,
    text: fill(line.line, vars),
    kind: 'template',
    section,
    format: 'bullet',
    ...(sources.length > 0 ? { sources } : {}),
  };
}

// The role's own never lines, then the delegation line for everyone but the coordinator, then
// the no-stake and no-fix lines for the roles that audit someone else's work.
function neverItems(role: RolePack, lib: Library, section: Section): Item[] {
  const set = setOf(role, lib);
  const owner = `role set ${set.id}`;
  const items: Item[] = role.never.map((line) => ({
    id: line.id,
    text: line.line,
    kind: 'role',
    section,
    format: 'bullet',
  }));
  if (role.id !== set.coordinator) {
    const coordinator = roleById(set.coordinator, lib);
    items.push(
      templateItem(
        templateOf(set.templates, 'delegate', owner),
        { coordinator: coordinator.label },
        section,
        [coordinator.id],
      ),
    );
  }
  if (AUDIT_ROLES.includes(role.id)) {
    for (const key of ['noStake', 'noFix']) {
      items.push(templateItem(templateOf(set.templates, key, owner), {}, section, []));
    }
  }
  return items;
}

function reportingItems(role: RolePack, lib: Library): Item[] {
  const set = setOf(role, lib);
  const owner = `role set ${set.id}`;
  const section: Section = 'reporting';
  const items: Item[] = [];

  const to = role.reporting.to === 'user' ? undefined : roleById(role.reporting.to, lib);
  items.push(
    templateItem(
      templateOf(set.templates, 'reporting.to', owner),
      { to: to ? to.label : USER_RECIPIENT },
      section,
      to ? [to.id] : [],
    ),
  );
  items.push(
    templateItem(
      templateOf(set.templates, 'reporting.format', owner),
      { format: role.reporting.format.line },
      section,
      [role.reporting.format.id],
    ),
  );
  if (role.reporting.verdictFirst) {
    items.push(templateItem(templateOf(set.templates, 'reporting.verdictFirst', owner), {}, section, []));
  }
  return items;
}

// Chassis act lines with the gate soul lines after the approval line.
function actItems(ctx: CompileContext, section: Section): Item[] {
  const act = chassisItems(ctx.chassis, 'act', 'bullet').map((item): Item => ({ ...item, section }));
  const gates = gateSoulItems(ctx.gates, ctx.lib).map((item): Item => ({ ...item, section }));
  const at = act.findIndex((item) => baseId(item.id) === APPROVAL_ID) + 1;
  return [...act.slice(0, at), ...gates, ...act.slice(at)];
}

function rulesSoulItems(ctx: CompileContext): Item[] {
  const rules = (section: Section): Item[] =>
    rulesItems(ctx.build, ctx.gates, ctx.limits, ctx.lib, section);
  switch (rulesMode(ctx.profile)) {
    case 'section':
      return rules('rules');
    case 'top-and-bottom':
      return [...rules('rules-top'), ...rules('rules-bottom')];
    default:
      return [];
  }
}

// The role's own drive and counter-drive, then the build's third drive, which wins ties.
function wantItems(ctx: CompileContext, role: RolePack): Item[] {
  const items: Item[] = [];
  for (const line of [role.drive, role.counterDrive]) {
    items.push({ id: line.id, text: line.line, kind: 'role', section: 'want', format: 'bullet' });
  }
  items.push({
    id: ctx.resolved.d3.id,
    text: ctx.resolved.d3.line,
    kind: 'drive',
    section: 'want',
    format: 'bullet',
  });
  items.push(...chassisItems(ctx.chassis, 'want', 'plain', true));
  return items;
}

function talkItems(ctx: CompileContext, role: RolePack): Item[] {
  const items = TALK_STATS.map((stat) => statItem(ctx, role, stat, 'talk'));
  items.push(...chassisItems(ctx.chassis, 'talk', 'bullet'));
  return items;
}

function unsureItem(role: RolePack): Item {
  return {
    id: role.uncertaintyRule.id,
    text: role.uncertaintyRule.line,
    kind: 'role',
    section: 'unsure',
    format: 'plain',
  };
}

function anchorItems(role: RolePack): Item[] {
  const { me, you } = role.anchorExchange;
  return [
    { id: me.id, text: 'Me: ' + me.line, kind: 'example', section: 'examples', format: 'plain' },
    { id: you.id, text: 'You: ' + you.line, kind: 'example', section: 'examples', format: 'plain' },
  ];
}

function soulRoleItems(ctx: CompileContext, role: RolePack): Item[] {
  return [
    ...openingItems(ctx),
    {
      id: role.mission.id,
      text: role.mission.line,
      kind: 'role',
      section: 'mission',
      format: 'plain',
    },
    ...wantItems(ctx, role),
    ...talkItems(ctx, role),
    ...neverItems(role, ctx.lib, 'never'),
    ...reportingItems(role, ctx.lib),
    unsureItem(role),
    ...actItems(ctx, 'act'),
    ...rulesSoulItems(ctx),
    ...chassisItems(ctx.chassis, 'memory', 'bullet'),
    ...anchorItems(role),
    ...chassisItems(ctx.chassis, 'clash', 'plain'),
  ];
}

// Grok layout: the profile's name line with the role's label and mission, no opening lines, the
// chassis short forms, and the rules block (limits, pack rules) inside Never because a Bot
// description has no other rules layer.
function grokRoleItems(ctx: CompileContext, role: RolePack): Item[] {
  const owner = `profile ${ctx.profile.id}`;
  const nameLine = templateOf(ctx.profile.templates, 'grok.nameLine', owner);
  const autonomy = templateOf(ctx.profile.templates, 'grok.autonomy', owner);
  return [
    {
      id: nameLine.id,
      text: fill(nameLine.line, { name: role.label, job: role.mission.line }),
      kind: 'template',
      section: 'who',
      format: 'plain',
      sources: [role.mission.id],
    },
    ...wantItems(ctx, role),
    ...talkItems(ctx, role),
    ...actItems(ctx, 'talk'),
    { id: autonomy.id, text: autonomy.line, kind: 'template', section: 'talk', format: 'bullet' },
    ...chassisItems(ctx.chassis, 'memory', 'bullet').map((item): Item => ({ ...item, section: 'talk' })),
    ...chassisItems(ctx.chassis, 'clash', 'bullet').map((item): Item => ({ ...item, section: 'talk' })),
    ...neverItems(role, ctx.lib, 'never'),
    ...rulesItems(ctx.build, ctx.gates, ctx.limits, ctx.lib, 'never'),
    unsureItem(role),
    ...reportingItems(role, ctx.lib),
    ...anchorItems(role),
  ];
}

export function roleSoulItems(ctx: CompileContext, role: RolePack): Item[] {
  return ctx.profile.layout === 'grok' ? grokRoleItems(ctx, role) : soulRoleItems(ctx, role);
}

function grokRoleRenderOptions(ctx: CompileContext, role: RolePack): RenderOptions {
  const set = setOf(role, ctx.lib);
  const owner = `profile ${ctx.profile.id}`;
  const headingOf = (key: string) => heading(templateOf(ctx.profile.templates, key, owner));
  return {
    order: GROK_ROLE_ORDER,
    headings: {
      who: null,
      want: headingOf('grok.h.want'),
      talk: headingOf('grok.h.work'),
      never: headingOf('grok.h.never'),
      unsure: heading(templateOf(set.templates, 'h.unsure', `role set ${set.id}`)),
      reporting: headingOf('grok.h.return'),
      examples: headingOf('grok.h.sounds'),
    },
  };
}

export function roleRenderOptions(ctx: CompileContext, role: RolePack): RenderOptions {
  if (ctx.profile.layout === 'grok') {
    return grokRoleRenderOptions(ctx, role);
  }
  const set = setOf(role, ctx.lib);
  const owner = `role set ${set.id}`;
  const headings: NonNullable<RenderOptions['headings']> = {
    mission: heading(templateOf(set.templates, 'h.mission', owner)),
    never: heading(templateOf(set.templates, 'h.never', owner)),
    reporting: heading(templateOf(set.templates, 'h.reporting', owner)),
    unsure: heading(templateOf(set.templates, 'h.unsure', owner)),
  };
  const profileOwner = `profile ${ctx.profile.id}`;
  const mode = rulesMode(ctx.profile);
  if (mode === 'section') {
    headings.rules = heading(templateOf(ctx.profile.templates, 'rules.heading', profileOwner));
  } else if (mode === 'top-and-bottom') {
    headings['rules-top'] = heading(templateOf(ctx.profile.templates, 'rules.top', profileOwner));
    headings['rules-bottom'] = heading(templateOf(ctx.profile.templates, 'rules.bottom', profileOwner));
  }
  return { order: ROLE_ORDER, headings };
}

// A role soul on a cap of 4,000 or less goes through the same length tiers as the main soul (B1):
// author pack rules lines first, then the short chassis records. Tier warnings go to `warnings`.
// Role souls carry no chip triggers, so there is no trigger drop after the tiers. Each cut is also
// recorded in `trimmed` with its role and path; the bundle pass dedupes it against the main soul.
function soulFile(
  ctx: CompileContext,
  role: RolePack,
  path: string,
  label: string,
  delivery: BundleFile['delivery'],
  sink: Sink,
): BundleFile {
  const tiered = fitTiers(
    ctx,
    (c) => ({ items: roleSoulItems(c, role), opts: roleRenderOptions(c, role) }),
    {
      cut: (id) => `roles: cut ${id} (author pack rule, soul over ${ctx.cap}) in ${path}`,
      short: `roles: chassis switched to short forms (soul over ${ctx.cap}) in ${path}`,
    },
  );
  sink.warnings.push(...tiered.warnings);
  sink.trimmed.push(...tiered.trimmed.map((t): Trimmed => ({ ...t, role: role.id, path })));
  const { soul, soulLines } = render(tiered.built.items, ctx.lib, tiered.built.opts);
  return { path, label, delivery, kind: 'personality', role: role.id, content: soul, lines: soulLines };
}

// A worker that loads only AGENTS.md keeps the role's never lines and the hard rules.
function agentsFile(ctx: CompileContext, role: RolePack, path: string): BundleFile {
  const owner = `profile ${ctx.profile.id}`;
  const title = templateOf(ctx.profile.templates, 'agents.heading', owner);
  const intro = templateOf(ctx.profile.templates, 'agents.intro', owner);
  const items: Item[] = [
    { id: title.id, text: title.line, kind: 'heading', section: 'opening', format: 'plain' },
    {
      id: intro.id,
      text: intro.line,
      kind: 'template',
      section: 'opening',
      format: 'plain',
      blankBefore: true,
    },
    ...neverItems(role, ctx.lib, 'rules'),
    ...rulesItems(ctx.build, ctx.gates, ctx.limits, ctx.lib, 'rules'),
  ];
  const { soul, soulLines } = render(items, ctx.lib, {
    order: AGENTS_ORDER,
    headings: { rules: null },
  });
  return {
    path,
    label: `Role rules: ${role.label}`,
    delivery: 'file',
    kind: 'rules',
    role: role.id,
    content: soul,
    lines: soulLines,
  };
}

// The note that says how the roles travel on this profile. When the profile has no such template
// yet, the note is a visibly marked placeholder, never invented text.
function rolesNote(ctx: CompileContext): RoleNote {
  const id = `profile.${ctx.profile.id}.${TEAM_NOTE_KEY}`;
  const line = own(ctx.profile.templates, TEAM_NOTE_KEY);
  if (!line) {
    // TODO: add a "fallback.roles" template to this profile in src/library/profiles.json.
    return { text: `[TODO: ${id} is missing from src/library/profiles.json]`, ids: [id] };
  }
  const roles = ctx.roles.map((r) => r.label).join(', ');
  return { text: fill(line.line, { roles }), ids: [line.id] };
}

// Whether the profile compiles roles into something the user can use. A single dot only gets a
// note, and custom instructions have no place for roles at all.
export function carriesRoles(profile: Profile): boolean {
  return profile.roleFallback !== 'none' && profile.roleFallback !== 'single-dot-note';
}

export function roleOutputs(ctx: CompileContext): RoleOutputs {
  const files: BundleFile[] = [];
  const notes: RoleNote[] = [];
  const warnings: string[] = [];
  const trimmed: Trimmed[] = [];
  if (ctx.roles.length === 0) {
    return { files, notes, warnings, trimmed };
  }
  const sink: Sink = { warnings, trimmed };

  // Role souls obey the profile's length cap like any soul. Past the tiers nothing is dropped
  // here; the overflow is reported so the caller can see it.
  const addSoul = (file: BundleFile): void => {
    files.push(file);
    if (file.content.length > ctx.cap) {
      warnings.push(`roles: ${file.path} is ${file.content.length} characters, over ${ctx.cap}`);
    }
  };

  switch (ctx.profile.roleFallback) {
    case 'workspaces':
      for (const role of ctx.roles) {
        const dir = `workspace-${role.id}`;
        addSoul(soulFile(ctx, role, `${dir}/SOUL.md`, `Role soul: ${role.label}`, 'file', sink));
        files.push(agentsFile(ctx, role, `${dir}/AGENTS.md`));
      }
      break;
    case 'profiles':
      for (const role of ctx.roles) {
        addSoul(
          soulFile(ctx, role, `profiles/${role.id}/SOUL.md`, `Role soul: ${role.label}`, 'file', sink),
        );
      }
      break;
    case 'team':
      for (const role of ctx.roles) {
        addSoul(
          soulFile(
            ctx,
            role,
            `${ctx.profile.personalityPath} (${role.label})`,
            `Role description: ${role.label}`,
            'paste',
            sink,
          ),
        );
      }
      notes.push(rolesNote(ctx));
      break;
    case 'separate-bundles':
      for (const role of ctx.roles) {
        addSoul(
          soulFile(
            ctx,
            role,
            `${ctx.profile.personalityPath} (${role.label})`,
            `Role instructions: ${role.label}`,
            'paste',
            sink,
          ),
        );
      }
      notes.push(rolesNote(ctx));
      break;
    case 'single-dot-note':
      notes.push(rolesNote(ctx));
      break;
    case 'none': {
      const line = templateOf(ctx.profile.templates, 'fallback.none', `profile ${ctx.profile.id}`);
      notes.push({ text: line.line, ids: [line.id] });
      break;
    }
  }
  return { files, notes, warnings, trimmed };
}
