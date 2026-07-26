/**
 * Shared data models for the whole game.
 * The engine is plain TypeScript with no React dependency; everything the
 * UI needs crosses the boundary through these types.
 */

export interface Vec {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ map */

export enum RoadClass {
  Motorway = 0,
  A = 1,
  B = 2,
  Residential = 3,
  Pedestrian = 4,
}

export interface RoadNode {
  p: Vec;
  /** indices into CityMap.edges */
  adj: number[];
}

export interface RoadEdge {
  a: number;
  b: number;
  cls: RoadClass;
  len: number;
  /** traversable a->b only when true */
  oneWay: boolean;
  busLane: boolean;
  bridge: boolean;
  name?: string;
}

export interface Park {
  name: string;
  poly: Vec[];
}

export interface Landmark {
  name: string;
  p: Vec;
  icon: string;
  /** tourist/leisure demand weight */
  weight: number;
}

export interface Pier {
  name: string;
  p: Vec;
  /** distance along the Thames polyline, metres */
  s: number;
}

/** Demand zone cell (250 m grid). */
export interface Zone {
  cx: number;
  cy: number;
  res: number; // residential weight
  jobs: number; // employment weight
  attract: number; // leisure/tourism weight
}

export interface TubeStationDef {
  name: string;
  p: Vec;
}

export interface TubeLineDef {
  name: string;
  color: string;
  circular: boolean;
  /** indices into the station table */
  stations: number[];
  /** trains provided at game start */
  baseTrains: number;
}

export interface CityMap {
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  nodes: RoadNode[];
  edges: RoadEdge[];
  thames: Vec[];
  thamesCum: number[];
  thamesWidth: number;
  parks: Park[];
  landmarks: Landmark[];
  piers: Pier[];
  /** decorative national-rail polylines */
  rail: Vec[][];
  boroughs: Vec[][];
  tubeStations: TubeStationDef[];
  tubeLines: TubeLineDef[];
  zones: Zone[];
  zoneSize: number;
  zonesW: number;
  zonesH: number;
}

/* -------------------------------------------------------------- network */

export type Mode = 'bus' | 'tram' | 'tube' | 'boat';

export interface VehicleTypeDef {
  id: string;
  mode: Mode;
  name: string;
  capacity: number;
  /** free-flow speed m/s */
  speed: number;
  /** purchase price £ */
  price: number;
  /** £ per vehicle-km (fuel/energy + wear) */
  costPerKm: number;
  /** £ staff per vehicle-day */
  staffPerDay: number;
  /** g CO2 per passenger-km, for the emissions stat */
  co2PerKm: number;
}

export interface Stop {
  id: number;
  mode: Mode;
  p: Vec;
  /** road node the stop sits on (-1 for tube stations / piers) */
  nodeId: number;
  name: string;
  /** routes serving this stop */
  routes: number[];
  /** game-minute until which the stop is closed (incidents), 0 = open */
  closedUntil: number;
  /** true for pre-existing tube stations */
  legacy: boolean;
}

export interface Route {
  id: number;
  mode: Mode;
  name: string;
  color: string;
  /** ordered stop ids */
  stops: number[];
  /** geometry along streets / tunnels / river */
  path: Vec[];
  /** cumulative distance at each path vertex */
  cum: number[];
  /** index into path for each stop */
  stopPathIdx: number[];
  circular: boolean;
  vehicleType: string;
  /** desired number of vehicles in service */
  vehiclesTarget: number;
  active: boolean;
  /** slow factor applied by incidents (1 = normal) */
  slowUntil: number;
  slowFactor: number;
  /** rolling stats */
  boardingsToday: number;
  boardingsYesterday: number;
  /** load factor EMA 0..1+, drives crowding penalty in the planner */
  crowding: number;
  legacy: boolean;
}

export type VehicleState = 'run' | 'dwell';

export interface Vehicle {
  id: number;
  routeId: number;
  dir: 1 | -1;
  /** distance along route path, metres */
  s: number;
  state: VehicleState;
  dwell: number;
  nextStopIdx: number;
  passengers: number[];
  /** cached world position/heading for rendering */
  p: Vec;
  heading: number;
  occupancy: number;
}

/* --------------------------------------------------------------- agents */

export type AgentState =
  | 'walkToStop'
  | 'wait'
  | 'ride'
  | 'walkFinal'
  | 'done'
  | 'abandoned';

export type Purpose = 'commute' | 'return' | 'shop' | 'leisure' | 'tourism' | 'school';

export interface RideLeg {
  kind: 'ride';
  routeId: number;
  dir: 1 | -1;
  boardStop: number;
  alightStop: number;
  boardIdx: number; // stop index within route
  alightIdx: number;
}

export interface WalkLeg {
  kind: 'walk';
  from: Vec;
  to: Vec;
}

export type Leg = RideLeg | WalkLeg;

export interface Agent {
  id: number;
  state: AgentState;
  p: Vec;
  origin: Vec;
  dest: Vec;
  purpose: Purpose;
  walkSpeed: number;
  maxWalk: number;
  /** minutes willing to wait before replanning/abandoning */
  patience: number;
  /** £/hour value of time; scales fare sensitivity */
  valueOfTime: number;
  legs: Leg[];
  legIdx: number;
  /** progress on current walk leg, metres */
  walkS: number;
  waitMin: number;
  replanned: boolean;
  startMin: number;
  expectedMin: number;
  vehicleId: number;
}

/* -------------------------------------------------------------- weather */

export type WeatherKind =
  | 'clear'
  | 'cloud'
  | 'rain'
  | 'heavyRain'
  | 'storm'
  | 'fog'
  | 'wind'
  | 'snow'
  | 'heat';

export interface WeatherState {
  kind: WeatherKind;
  /** game-minute at which the state changes */
  until: number;
  temp: number;
}

/* --------------------------------------------------------------- events */

export type IncidentKind =
  | 'signalFailure'
  | 'stationClosed'
  | 'floodedStation'
  | 'roadworks'
  | 'breakdown'
  | 'demo'
  | 'concert'
  | 'football'
  | 'strike';

export interface Incident {
  id: number;
  kind: IncidentKind;
  title: string;
  /** absolute game-minute */
  start: number;
  end: number;
  routeId?: number;
  stopId?: number;
  /** demand spike centre */
  p?: Vec;
}

/* -------------------------------------------------------------- economy */

export interface Fares {
  bus: number;
  tram: number;
  tube: number;
  boat: number;
}

export interface Policies {
  congestionCharge: boolean;
  bikeShare: 0 | 1 | 2 | 3;
  advertising: boolean;
}

export interface DailyLedger {
  fareRevenue: number;
  otherRevenue: number;
  operatingCost: number;
  staffCost: number;
  maintenance: number;
  interest: number;
  grant: number;
  capex: number;
}

/* ---------------------------------------------------------------- stats */

export interface DayStats {
  day: number;
  passengers: number;
  abandoned: number;
  revenue: number;
  costs: number;
  profit: number;
  avgJourneyMin: number;
  happiness: number;
  co2Tonnes: number;
  congestion: number;
}

/* ----------------------------------------------------------- difficulty */

export type Difficulty = 'easy' | 'normal' | 'hard' | 'realistic' | 'sandbox';

export interface DifficultyDef {
  label: string;
  startCash: number;
  demandScale: number;
  costScale: number;
  grantScale: number;
  eventScale: number;
  /** passenger patience multiplier */
  patienceScale: number;
  sandbox: boolean;
}

/* ------------------------------------------------------------- save/load */

export interface SaveGame {
  version: number;
  seed: number;
  difficulty: Difficulty;
  minute: number;
  cash: number;
  loan: number;
  fares: Fares;
  policies: Policies;
  weather: WeatherState;
  stops: Array<{
    id: number;
    mode: Mode;
    p: Vec;
    nodeId: number;
    name: string;
    legacy: boolean;
  }>;
  routes: Array<{
    id: number;
    mode: Mode;
    name: string;
    color: string;
    stops: number[];
    circular: boolean;
    vehicleType: string;
    vehiclesTarget: number;
    active: boolean;
    legacy: boolean;
    crowding: number;
  }>;
  nextStopId: number;
  nextRouteId: number;
  history: DayStats[];
  achievements: string[];
  happiness: number;
  carShare: number;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
}

/* --------------------------------------------------------------- UI glue */

export type Tool =
  | 'select'
  | 'busRoute'
  | 'tramRoute'
  | 'tubeLine'
  | 'boatRoute'
  | 'delete';

export type Overlay = 'none' | 'demand' | 'congestion' | 'coverage';

export interface RouteDraft {
  mode: Mode;
  stops: number[]; // existing stop ids reused
  /** stops created for this draft (removed on cancel) */
  newStops: number[];
  path: Vec[];
  cost: number;
  valid: boolean;
  message: string;
}

/** Cheap snapshot for React (4 Hz). */
export interface UISnapshot {
  minute: number;
  day: number;
  timeLabel: string;
  dateLabel: string;
  speed: number;
  cash: number;
  loan: number;
  weather: WeatherKind;
  temp: number;
  happiness: number;
  rating: string;
  activeAgents: number;
  passengersToday: number;
  congestion: number;
  routeCount: number;
  vehicleCount: number;
  news: string[];
  tool: Tool;
  overlay: Overlay;
  draft: RouteDraft | null;
  selectedRoute: number;
  selectedStop: number;
  fares: Fares;
  policies: Policies;
  difficulty: Difficulty;
  history: DayStats[];
  achievements: string[];
  gameOver: boolean;
}
