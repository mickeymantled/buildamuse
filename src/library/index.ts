// Build-a-Muse compiler library.
// Assembles every library JSON file into the single Library object the compiler reads.
// JSON imports widen string literals, so each field is cast through `unknown` into its
// precise Library type.

import type { Library, Line, RolePack, RoleSet, WorkflowPack } from '../compiler/types.js';
import { LIBRARY_VERSION } from './version.js';

import chassisData from './chassis.json';
import basesData from './bases.json';
import statsData from './stats.json';
import badgesData from './badges.json';
import chipsData from './chips.json';
import peevesData from './peeves.json';
import heartData from './heart.json';
import outfitsData from './outfits.json';
import examplesData from './examples.json';
import namesData from './names.json';
import rosterData from './roster.json';
import contradictionsData from './contradictions.json';
import targetsData from './targets.json';
import profilesData from './profiles.json';
import gatesData from './gates.json';
import limitsData from './limits.json';
import probesData from '../probes/probes.json';

import memecoinsPack from './packs/memecoins.json';
import perpsPack from './packs/perps.json';
import predictionMarketsPack from './packs/prediction-markets.json';
import spotPack from './packs/spot.json';
import codingPack from './packs/coding.json';
import researchPack from './packs/research.json';
import contentPack from './packs/content.json';
import salesPack from './packs/sales.json';
import personalOpsPack from './packs/personal-ops.json';
import supportPack from './packs/support.json';
import dataPack from './packs/data.json';
import devopsPack from './packs/devops.json';

import tradingRoles from './roles/trading.json';
import codingRoles from './roles/coding.json';
import researchRoles from './roles/research.json';
import personalOpsRoles from './roles/personal-ops.json';

const chassis = chassisData as unknown as Library['chassis'];
const bases = basesData as unknown as Library['bases'];
const stats = statsData as unknown as Library['stats'];
const badges = badgesData as unknown as Library['badges'];
const chips = chipsData as unknown as Library['chips'];
const peeves = peevesData as unknown as Library['peeves'];
const heart = heartData as unknown as Library['heart'];
const outfits = outfitsData as unknown as Library['outfits'];
const examples = examplesData as unknown as Library['examples'];
const names = namesData as unknown as Library['names'];
const roster = rosterData as unknown as Library['roster'];
const contradictions = contradictionsData as unknown as Library['contradictions'];
// targets.json holds the five target cards and profiles.json the eight delivery profiles.
// They are split so the first paint can load the cards alone.
const targets = {
  targets: targetsData,
  profiles: profilesData,
} as unknown as Library['targets'];
const gates = gatesData as unknown as Library['gates'];
const limits = limitsData as unknown as Library['limits'];

// A pack file is null until its content lands. Fixed order; nulls are dropped.
const packFiles: unknown[] = [
  memecoinsPack,
  perpsPack,
  predictionMarketsPack,
  spotPack,
  codingPack,
  researchPack,
  contentPack,
  salesPack,
  personalOpsPack,
  supportPack,
  dataPack,
  devopsPack,
];
const packs = packFiles.filter((f) => f !== null) as WorkflowPack[];

// A role file is null, or { set, roles } once its content lands.
interface RoleFile {
  set: RoleSet;
  roles: RolePack[];
}
const roleFiles = (
  [tradingRoles, codingRoles, researchRoles, personalOpsRoles] as unknown[]
).filter((f) => f !== null) as RoleFile[];
const roleSets: RoleSet[] = roleFiles.map((f) => f.set);
const roles: RolePack[] = roleFiles.flatMap((f) => f.roles);

// The probe messages, numbered from 1 so ids read probe.1 to probe.6.
const probes: Line[] = (probesData as string[]).map((line, i) => ({ id: `probe.${i + 1}`, line }));

export const library: Library = {
  version: LIBRARY_VERSION,
  chassis,
  bases,
  stats,
  badges,
  chips,
  peeves,
  heart,
  outfits,
  examples,
  names,
  roster,
  contradictions,
  targets,
  gates,
  limits,
  packs,
  roleSets,
  roles,
  probes,
} as Library;

export default library;
