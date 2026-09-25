// Build-a-Muse compiler library.
// Assembles every library JSON file into the single Library object the compiler reads.
// JSON imports widen string literals, so each field is cast through `unknown` into its
// precise Library type.

import type { Library } from '../compiler/types.js';
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
} as Library;

export default library;
