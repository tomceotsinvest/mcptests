# Milestone Roadmap

## M1 — Foundation (this release)
- TypeScript/Vite/React project, engine/UI separation, canvas renderer.
- Full stylised Zone-1 map: authored arterials + generated streets, Thames,
  ten bridges, parks, rail termini, landmarks, boroughs, piers.
- Existing Underground (11 line segments, ~60 stations) live from day one.
- Individual passenger agents with demand zones, time-of-day/weekend curves,
  multi-modal journey planner (walk + bus + tram + tube + boat + transfers).
- Bus/tram route editor (street-snapped), tube line builder, river routes.
- Vehicles with capacity, boarding, dwell, headways, congestion, bus lanes.
- Weather, seasons, incidents/events, news ticker.
- Economy: fares, opex, capex, loans, grants, inflation; 5 difficulty modes.
- Stats dashboard, history graphs, heatmap/congestion/coverage overlays.
- Day/night cycle, rain/snow effects, autosave + manual save/load + export.
- Achievements (first set).

## M2 — Depth of operations
- Timetables & per-route first/last services; night bus network flag.
- Depots and dead-running; driver rosters and strikes tied to pay policy.
- Per-stop dwell modelling upgrades (accessibility, level boarding).
- Express/limited-stop patterns and short-turn variants per route.
- Demand-responsive minibus zones.
- Pavement-graph walking (replace straight-line walk legs).

## M3 — Rail engineering
- Phased construction with build times and disruption during works.
- Platforms, junctions, crossovers, per-line signalling levels limiting tph.
- Station upgrades (entrances, step-free access, retail units).
- Interchange quality affecting transfer penalties.

## M4 — Traffic microsimulation
- Web-worker per-vehicle car/taxi/van simulation with signalised junctions,
  queuing, accidents and bus-lane violation enforcement.
- Congestion charge zone editor; parking policy.

## M5 — City evolution
- Redevelopment: land-use shifts responding to accessibility (TOD growth).
- Decade-scale tech: EV fleet transition, autonomous buses, new modes.
- Infrastructure ageing curves and renewal programmes.

## M6 — Content & longevity
- Scenario system + scripted campaign (5 scenarios: 1960s retro, Olympics,
  flood recovery, strike winter, car-free city).
- Random challenge generator, transport awards ceremony, leaderboards
  (local + shareable score codes), full achievement set.
- Modding hooks: JSON map/vehicle/scenario packs.

## M7 — Polish
- WebGL renderer path for >100k drawn entities, station interiors at max zoom,
  animated passengers on platforms, audio, localisation.
