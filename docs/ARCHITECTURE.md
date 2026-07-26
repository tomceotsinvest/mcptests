# London Transport Commissioner — Architecture

A browser-based transport-management simulation of London Zone 1, built with
**React + TypeScript + Vite + HTML5 Canvas**. The player is the Transport
Commissioner: they design and operate bus, tram, Underground and river-boat
networks over a stylised but geographically faithful map of Central London,
serving tens of thousands of individually simulated passenger trips per day.

This document is the design that was produced *before* implementation, per the
project brief: every major system, the data models, the folder structure, the
optimisation strategy, the simulation loop, the rendering engine, AI behaviour,
save/load, and the milestone roadmap (see `ROADMAP.md`).

---

## 1. High-level architecture

The game is split into three strictly separated layers:

```
┌────────────────────────────────────────────────────────────┐
│  React UI (panels, toolbars, dashboards, modals)           │
│  - subscribes to a low-frequency snapshot of engine state  │
│  - issues commands (build route, set fare, change speed)   │
├────────────────────────────────────────────────────────────┤
│  Engine (plain TypeScript, zero React dependencies)        │
│  - Clock          - Weather        - Events                │
│  - Demand model   - Agents (passengers)                    │
│  - Network (routes, stops, vehicles, boarding)             │
│  - Planner (multi-modal journey pathfinding)               │
│  - Traffic/congestion   - Economy   - Stats  - Achievements│
├────────────────────────────────────────────────────────────┤
│  Static world (built once per seed, immutable)             │
│  - Road graph (authored arterials + generated streets)     │
│  - Thames, bridges, parks, rail lines, landmarks, piers    │
│  - Existing Underground lines & stations                   │
│  - Demand zones (residential / jobs / attraction density)  │
└────────────────────────────────────────────────────────────┘
```

**Key rule:** React never touches per-frame simulation data. The renderer
draws directly from engine state on `requestAnimationFrame`; the UI reads a
cheap snapshot at ~4 Hz via `useSyncExternalStore`. Commands flow one way,
UI → engine. This keeps React reconciliation entirely out of the hot path.

---

## 2. The map

### 2.1 Coordinate system

World coordinates are metres on a local equirectangular projection centred on
(−0.11°, 51.51°) — roughly Covent Garden. `x` grows east, `y` grows north
(the camera flips `y` for screen space). The playable world is
**16 km × 7.8 km**, covering Zone 1 from Notting Hill/High St Kensington in
the west to Whitechapel/Shadwell in the east, Regent's Park to Vauxhall.

### 2.2 Road network

Two sources are merged into one graph:

1. **Authored arterials** — ~50 hand-digitised polylines of real roads
   (Euston Road, Oxford Street, Strand, Embankment, all ten Zone-1 bridges,
   the inner ring, etc.), each tagged with a road class (Motorway/A/B/
   Residential/Pedestrian), one-way flag, bus-lane flag, bridge flag and name.
   Polylines are resampled to ~90 m vertex spacing, mutually intersected
   (segment–segment intersection with a spatial hash for candidate pairs),
   and split at crossings so junctions become shared graph nodes.
2. **Generated residential streets** — a jittered ~170 m lattice seeded from
   the game seed, filtered against the river, parks and map bounds. Lattice
   points close to an arterial snap onto the nearest arterial node so the two
   networks weld into a single connected graph. Edges that would cross the
   Thames are rejected — only authored bridges cross water.

The result is a graph of ~4–5 k nodes and ~8–9 k edges: every bus route,
congestion value and road drawing derives from it. Pedestrian-only streets
(e.g. Carnaby Street, the South Bank) are walkable/visible but closed to
vehicles. One-way streets are honoured by the bus route-path search.

### 2.3 Water, parks, rail, landmarks, boroughs

- **Thames**: a single authored polyline stroked with a wide pen; also used to
  reject street edges and to route river-boat services (piers project onto it).
- **Parks**: authored polygons (Hyde Park, Kensington Gardens, Regent's,
  Green, St James's, Battersea, Lincoln's Inn Fields…). They suppress streets
  and lower demand inside, and raise leisure demand at their edges.
- **National rail**: decorative hatched lines feeding the real termini
  (Paddington, Euston, King's Cross, Liverpool Street, Waterloo, Victoria…);
  termini act as strong demand generators (commuter inflow).
- **Landmarks**: ~25 real attractions with icons and demand weight
  (tourist trips) — Buckingham Palace, the Eye, Tower, St Paul's, museums…
- **Boroughs**: subtle boundary polylines for orientation.

### 2.4 Existing Underground

Eleven Zone-1 line segments (Bakerloo, Central, Victoria, Jubilee, both
Northern branches, Piccadilly, Circle, District, Elizabeth, Waterloo & City,
DLR) with ~60 real stations at approximate true positions. They are live from
day one — the Commissioner inherits them, controls their train counts, and
can extend the network with new lines.

### 2.5 Demand zones

A 250 m grid over the world. Each cell holds three weights — *residential*,
*jobs*, *attraction* — computed at build time from gaussian blobs around real
centres (the City and Canary-fringe for jobs, Soho/West End for leisure,
Bloomsbury for universities, termini for commuter inflow) plus seeded noise,
zeroed on water and damped in parks. All trip generation samples these zones,
so demand *emerges* from geography instead of being scripted.

---

## 3. Simulation loop

A single `Engine.update(realDtMs)` is called from `requestAnimationFrame`:

```
realDt (capped 100 ms) × speed  →  gameDt seconds
├─ Clock.advance(gameDt)             (date, season, weekday, day/night)
├─ Weather.update                    (Markov chain, 2–4 h states)
├─ Events.update                     (incidents start/expire)
├─ Traffic.update (per game-minute)  (congestion curve × weather × incidents)
├─ Agents.spawn (Poisson, λ(t))      (time-of-day + weekend + weather curves)
├─ Agents.step(gameDt)               (walk / wait / ride / replan / abandon)
├─ Network.step(gameDt)              (vehicle motion, dwell, board/alight)
├─ per game-minute: stats sampling, transit-graph refresh checks
└─ per game-day (03:00): economy settlement, achievements, city growth tick
```

Game speeds: pause, 1× (1 game-min/s), 3×, 10×. All motion integrates real
`gameDt` — there is no frame-locked logic, so speed changes are exact.
Per-minute and per-day work is triggered by minute/day boundary crossings, so
a slow frame never skips a settlement.

---

## 4. Passengers (agent AI)

Every trip is an individual **agent** with: origin, destination, purpose
(commute / return / shop / leisure / tourism / school), walk speed
(1.1–1.7 m/s), income (log-normal — sets value of time and fare sensitivity),
max acceptable walk, patience (max wait), and a happiness outcome.

Lifecycle state machine:

```
Plan → WalkToStop → Wait → Ride → (transfer: WalkToStop → Wait → Ride)* → WalkFinal → Done
          │            │
          │            └─ patience exceeded → Replan (once) → … or Abandon (car/taxi, unhappy)
          └─ no useful transit → WalkAll or Drive (adds to road traffic share)
```

Choices come from the **journey planner** (below) using each agent's own
weights, so rich behaviour (avoiding crowded lines, refusing long walks,
income-dependent fare sensitivity) falls out of one cost function. Disruptions
(closed station, suspended route) trigger replanning of the remaining journey.
Completed trips score happiness against the planned expectation; abandoned
trips hurt it. The city-wide happiness/rating is an exponential moving
average over trip outcomes and feeds grants and the performance rating.

Concurrency is capped (difficulty-scaled, ~3.5 k active agents) with excess
demand recorded statistically, so tens of thousands of daily trips remain
smooth at 60 fps.

---

## 5. Journey planner (multi-modal routing)

A time-independent generalised-cost **Dijkstra** over a compact transit graph,
rebuilt only when the network changes (and hourly, to refresh crowding):

- **Nodes**: every stop/station, plus one node per (route, direction, stop).
- **Edges**:
  - *board*: stop → route-stop. Cost = expected wait (headway/2, from the
    route's live vehicle count) + fare converted to minutes by the agent's
    value of time.
  - *ride*: consecutive route-stops. Cost = in-vehicle time from path distance
    and mode speed × congestion, inflated by yesterday's crowding on the route.
  - *alight*: route-stop → stop (fixed penalty).
  - *transfer walk*: stop ↔ stop pairs within 320 m (precomputed via the
    spatial grid) + a transfer penalty.
- **Origin/destination**: virtual sources — all stops within the agent's max
  walk are seeded with their walk cost (multi-source Dijkstra); the search
  finishes at any stop within walk range of the destination. The transit
  result must beat plain walking (and, for the wealthy, driving) or the agent
  doesn't use transit. Walking legs use straight-line paths (a deliberate,
  documented simplification; pavement-graph walking is on the roadmap).

The same road graph search (A*-weighted Dijkstra respecting one-way streets
and road class speeds) is used by the **route editor** to snap bus/tram routes
onto streets between consecutive stops.

---

## 6. Network operations

- **Routes** (bus, tram, boat, tube): ordered stops + a geometric path with
  cumulative distances. Non-circular routes ping-pong (vehicles reverse at
  termini); circular routes wrap. Each route has a vehicle type, target
  vehicle count (sets headway), and live performance stats.
- **Vehicles** move continuously along the path; speed = type speed ×
  congestion factor × weather × incident factor, with bus-lane relief for
  routes using bus-lane arterials. At each stop they dwell (base + per-boarder
  time), alight agents whose leg ends there, and board from per-direction
  queues up to capacity — full vehicles leave passengers behind (patience,
  crowding stats, replans).
- **Tube lines**: same machinery with rail speeds, big capacities and station
  dwell; the Circle line is circular. New tube lines are built by placing
  stations (heavy capex per km of tunnel and per station).
- **Piers** are fixed; river routes slice the Thames polyline between piers.

---

## 7. Traffic & congestion

A hybrid model, chosen deliberately for scale:

- **Macroscopic congestion**: a city congestion index from the time-of-day
  curve (AM/PM peaks), weekday/weekend, weather, roadworks/incidents and the
  simulated *car mode share* (agents who abandoned or chose driving push it
  up; congestion charging pushes it down). Road class modulates it; buses in
  bus lanes partially bypass it. This is what slows vehicles and journey
  times.
- **Microscopic ambience**: a few hundred visual cars/taxis/vans/cyclists
  flow along real road paths (count scales with the index) so streets look
  and feel alive, with headlights at night.

Full per-car microsimulation is a roadmap item (worker-based), but the
macro model is what management gameplay actually reacts to.

---

## 8. Weather, calendar & events

- **Weather**: seasonal Markov chain — clear, cloud, rain, heavy rain, storm,
  fog, wind, snow (winter), heatwave (summer). Multipliers hit walking speed,
  road speed, demand (rain pushes walkers onto buses; snow suppresses trips),
  and vehicle reliability.
- **Calendar**: weekdays vs weekends, seasons, school holidays and a bank
  holiday set change the demand curves.
- **Random events**: signal failures (line slow), station closures, flooded
  stations (rain-correlated), roadworks, vehicle breakdowns, demonstrations,
  concerts and football matches (localised demand spikes), strikes. Each has
  a duration, a target, gameplay effects, and a news-ticker entry. The
  planner and agents react automatically (replans, queue growth).

---

## 9. Economy

Daily settlement at 03:00: fare revenue (per boarding, per mode, player-set),
ancillary revenue (advertising per vehicle, station retail, congestion
charge), against operating costs (per-vehicle-km energy/fuel by vehicle type,
staff wages per vehicle-day, station upkeep, route administration, tube line
maintenance), loan interest, and weekly performance grants driven by rating.
Capex: vehicles, stops, stations, tunnels. Loans up to a cap with daily
accrual. Slow inflation raises costs and fare ceilings over the years.
Difficulty scales starting cash, grant generosity, demand and cost levels;
Sandbox removes money entirely.

---

## 10. Rendering engine

Canvas 2D, one full-screen canvas, world-space drawing via `setTransform`:

- **Static geometry as cached `Path2D`** objects built once per map: one path
  per road class, river, parks, rail, borough lines. Per frame they are
  stroked/filled with a single call each under the camera transform — the
  browser rasterises on GPU; panning/zooming costs almost nothing.
- **LOD**: minor streets, stop markers, labels, queue bars and walking agents
  fade in past zoom thresholds; line widths are world-scaled with clamps.
- **Dynamic layer**: routes (coloured offset strokes), stations/stops,
  vehicles (oriented rectangles with direction, occupancy tinting,
  headlights at night), sampled walking agents, waiting queues.
- **Overlays**: demand heatmap (zone grid), congestion (edge colouring),
  coverage (stop radii), each toggleable.
- **Atmosphere**: smooth day/night cycle (sky tint + windows/headlights),
  rain/snow particle pass, seasonal palette shift.
- Labels render in screen space with viewport culling.

The camera supports inertia-free pan (pointer drag), wheel/pinch zoom to
cursor, and min/max zoom clamps.

---

## 11. Save / load

`SaveGame` = seed + difficulty + clock + weather state + economy + fares +
policies + all player infrastructure (stops, routes, vehicle assignments, new
stations/lines) + stats ring buffers + achievements + camera. The static map
is *not* saved — it regenerates deterministically from the seed (seeded
mulberry32 RNG everywhere). Agents are transient by design (a save loads at
the start of a quiet minute; the population re-emerges within game-minutes).
Persistence: localStorage autosave (per game-day) + manual slots + JSON
export/import. Saves carry a schema version for migration.

---

## 12. Performance strategy

1. No per-frame allocations in hot loops; agents/vehicles pooled in arrays.
2. Spatial hashing (uniform grids) for: stop lookup around points, transfer
   pairs, road-node snapping, intersection candidate pruning.
3. Transit graph rebuilt only on network edits (dirty flag) or hourly.
4. Dijkstra with a binary heap over flat arrays; plans are computed
   incrementally (bounded per frame) so a demand spike never stalls a frame.
5. Path2D caching for all static geometry; screen-space culling for labels.
6. UI decoupled at 4 Hz snapshots; React never sees hot data.
7. Fixed caps with graceful degradation (agent cap scales, ambient traffic
   scales with fps headroom).
8. Web Workers are reserved (roadmap) for batch journey planning and future
   car microsimulation; the current budgeted main-thread planner keeps
   frame time < 4 ms for ~3.5 k active agents.

---

## 13. Folder structure

```
docs/                     Architecture & roadmap (this file)
src/
  main.tsx, App.tsx       React entry, layout shell
  styles.css              UI theme (dark management-game chrome)
  game/
    types.ts              All shared data models
    constants.ts          Tuning tables (speeds, costs, curves, colours)
    util.ts               Seeded RNG, vector maths, heap, spatial grid
    map/
      authoredRoads.ts    Hand-digitised arterials, bridges, ped streets
      tubeData.ts         Real Zone-1 lines & stations
      features.ts         Thames, parks, landmarks, rail, piers, boroughs
      buildMap.ts         Graph build, intersections, streets, zones
    sim/
      engine.ts           Orchestrator, clock, game loop, UI command API
      network.ts          Stops, routes, vehicles, boarding, transit graph
      planner.ts          Multi-modal journey planning (Dijkstra)
      agents.ts           Demand model + passenger lifecycle
      traffic.ts          Congestion index + ambient road traffic
      weather.ts          Seasonal weather Markov chain
      events.ts           Incidents, closures, concerts, strikes
      economy.ts          Fares, costs, loans, grants, inflation
      stats.ts            Ring buffers, KPIs, history
      achievements.ts     Achievement definitions & checks
      saveload.ts         Versioned serialisation
    render/
      camera.ts           Pan/zoom, world↔screen
      renderer.ts         All canvas drawing (map, network, agents, fx)
  ui/
    useEngine.ts          React↔engine bridge (snapshots + commands)
    TopBar.tsx            Clock, money, weather, rating, speed controls
    Toolbar.tsx           Tools & overlay toggles
    SidePanels.tsx        Route editor, inspectors, finance, stats
    Modals.tsx            New game, achievements, help
    Ticker.tsx            News ticker
```

---

## 14. Data models (abridged)

See `src/game/types.ts` for the authoritative definitions. The key entities:

- `CityMap { nodes, edges, thames, parks, landmarks, piers, rail, zones, tube }`
- `Stop { id, mode, p, nodeId, name, closedUntil, queues }`
- `Route { id, mode, name, color, stops[], path[], cum[], vehicles, vehicleType,
   circular, fareMode, live stats }`
- `Vehicle { routeId, dir, s, state, dwell, nextStop, passengers[], type }`
- `Agent { origin, dest, purpose, prefs…, legs[], legIdx, state, timers }`
- `Economy { cash, loans, fares, policies, daily ledger }`
- `SaveGame { version, seed, …everything player-owned }`

---

## 15. Difficulty & long-term play

Five modes — Easy, Normal, Hard, Realistic, Sandbox — scaling budget, demand,
costs, event frequency and passenger tolerance (Realistic passengers are
impatient, fare-sensitive and expect reliability; Sandbox is uncapped).
Long-term systems: yearly demand growth and shifting job/residential balance
(city growth tick), inflation, infrastructure ageing (maintenance creep),
achievements, and the performance rating that gates grants and awards.
Scenarios, campaign scripting and leaderboards are roadmap items layered on
the same engine (`ROADMAP.md`).
