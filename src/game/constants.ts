import type { DifficultyDef, Difficulty, VehicleTypeDef, Fares } from './types';
import { RoadClass } from './types';

/* ------------------------------------------------------------- world/time */

/** World extents, metres (x east, y north, origin ≈ Covent Garden). */
export const WORLD = { minX: -8000, maxX: 8000, minY: -3900, maxY: 3900 };

export const ZONE_SIZE = 250;

/** Game seconds advanced per real second at 1× speed (1 game-min / sec). */
export const BASE_TIME_SCALE = 60;
export const SPEEDS = [0, 1, 3, 10];

export const MIN_PER_DAY = 1440;
/** economy settles / day rolls at 03:00 */
export const DAY_ROLL_MIN = 180;

/* ---------------------------------------------------------------- agents */

export const MAX_ACTIVE_AGENTS = 3500;
/** baseline daily trip demand at demandScale 1 */
export const DAILY_TRIPS_BASE = 60000;
/** search radius for stops around origin/destination, metres */
export const ACCESS_RADIUS = 650;
export const TRANSFER_RADIUS = 320;
export const WALK_ONLY_MAX = 2600;

/* --------------------------------------------------------------- traffic */

export const ROAD_SPEED: Record<RoadClass, number> = {
  [RoadClass.Motorway]: 22,
  [RoadClass.A]: 11,
  [RoadClass.B]: 9,
  [RoadClass.Residential]: 7,
  [RoadClass.Pedestrian]: 1.4,
};

/* ---------------------------------------------------------------- money */

export const COSTS = {
  busStop: 12_000,
  tramStop: 45_000,
  pierUse: 150_000,
  tubeStation: 28_000_000,
  tubePerKm: 45_000_000,
  tramPerKm: 900_000, // track in street
  routeAdminPerDay: 800,
  stationUpkeepPerDay: 4200,
  stopUpkeepPerDay: 12,
  loanMax: 800_000_000,
  loanDailyRate: 0.05 / 365,
  inflationPerYear: 0.025,
};

export const DEFAULT_FARES: Fares = { bus: 1.75, tram: 1.85, tube: 2.8, boat: 4.5 };

export const VEHICLE_TYPES: VehicleTypeDef[] = [
  { id: 'busSingle', mode: 'bus', name: 'Single decker', capacity: 60, speed: 8.5, price: 240_000, costPerKm: 1.4, staffPerDay: 420, co2PerKm: 900 },
  { id: 'busDouble', mode: 'bus', name: 'Double decker', capacity: 87, speed: 8.0, price: 350_000, costPerKm: 1.7, staffPerDay: 420, co2PerKm: 1050 },
  { id: 'busElectric', mode: 'bus', name: 'Electric double decker', capacity: 87, speed: 8.0, price: 480_000, costPerKm: 0.9, staffPerDay: 420, co2PerKm: 0 },
  { id: 'busHydrogen', mode: 'bus', name: 'Hydrogen single decker', capacity: 64, speed: 8.5, price: 520_000, costPerKm: 1.1, staffPerDay: 420, co2PerKm: 0 },
  { id: 'busArtic', mode: 'bus', name: 'Articulated bus', capacity: 120, speed: 7.5, price: 430_000, costPerKm: 2.0, staffPerDay: 430, co2PerKm: 1250 },
  { id: 'busMini', mode: 'bus', name: 'Minibus (DRT)', capacity: 24, speed: 9.0, price: 110_000, costPerKm: 0.8, staffPerDay: 380, co2PerKm: 450 },
  { id: 'tram', mode: 'tram', name: 'Tram (2-car)', capacity: 210, speed: 9.5, price: 2_400_000, costPerKm: 2.4, staffPerDay: 520, co2PerKm: 40 },
  { id: 'tubeTrain', mode: 'tube', name: 'Tube train (6-car)', capacity: 800, speed: 15.5, price: 9_500_000, costPerKm: 5.5, staffPerDay: 1500, co2PerKm: 60 },
  { id: 'riverBoat', mode: 'boat', name: 'River bus catamaran', capacity: 150, speed: 7.5, price: 3_000_000, costPerKm: 6.0, staffPerDay: 900, co2PerKm: 1800 },
];

export const vehicleType = (id: string): VehicleTypeDef =>
  VEHICLE_TYPES.find((v) => v.id === id) ?? VEHICLE_TYPES[0];

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { label: 'Easy', startCash: 2_500_000_000, demandScale: 1.0, costScale: 0.8, grantScale: 1.5, eventScale: 0.5, patienceScale: 1.5, sandbox: false },
  normal: { label: 'Normal', startCash: 1_200_000_000, demandScale: 1.0, costScale: 1.0, grantScale: 1.0, eventScale: 1.0, patienceScale: 1.0, sandbox: false },
  hard: { label: 'Hard', startCash: 600_000_000, demandScale: 1.1, costScale: 1.15, grantScale: 0.7, eventScale: 1.4, patienceScale: 0.8, sandbox: false },
  realistic: { label: 'Realistic', startCash: 400_000_000, demandScale: 1.2, costScale: 1.25, grantScale: 0.5, eventScale: 1.6, patienceScale: 0.65, sandbox: false },
  sandbox: { label: 'Sandbox', startCash: 0, demandScale: 1.0, costScale: 1.0, grantScale: 1.0, eventScale: 0.8, patienceScale: 1.2, sandbox: true },
};

/* --------------------------------------------------------------- colours */

export const ROUTE_COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
  '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff',
  '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1',
];

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'ltc-save-v1';
