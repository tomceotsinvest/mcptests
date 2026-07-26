# London Transport Commissioner 🚇

A realistic public-transport management game for London **Zone 1**, running
entirely in the browser. You are the Transport Commissioner: design and operate
buses, trams, Underground lines and Thames river buses across a stylised but
geographically faithful map of Central London — while tens of thousands of
individually simulated Londoners judge every decision you make.

Built with **React + TypeScript + Vite + HTML5 Canvas**. A blend of
Cities: Skylines, Mini Metro, Transport Fever 2 and OpenTTD, focused entirely
on public transport.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` type-checks and produces a production bundle; `npm run preview` serves it.

## What's simulated

- **The map** — ~50 hand-digitised real arterials (Oxford Street, Strand, the
  Embankment, all ten Zone-1 bridges…), procedurally generated residential
  streets welded into one routable graph, the Thames, royal parks, national
  rail termini, landmarks, borough lines and river piers. One-way streets,
  bus lanes and pedestrian streets included.
- **The Underground** — 12 real Zone-1 line segments with ~60 stations, live
  from day one. Re-equip them, re-timetable them, or tunnel brand-new lines.
- **Passengers** — every trip is an agent with a purpose (commute, shopping,
  tourism…), walking speed, income, patience and a personal multi-modal
  journey plan (walk + bus + tram + Tube + boat + transfers) found by a
  generalised-cost Dijkstra over the live network. They queue, get left
  behind by full vehicles, replan around disruptions, abandon you for taxis,
  and remember whether you beat their expectations.
- **Demand** — emerges from residential/employment/attraction density zones,
  time-of-day and weekend curves, school holidays, weather and events. Rush
  hour is nothing like midnight.
- **Operations** — routes snapped to streets, headways from fleet size, nine
  vehicle types (double deckers, artics, electric/hydrogen buses, trams,
  trains, catamarans), capacity, dwell times, crowding feedback.
- **Traffic** — a macroscopic congestion model (peaks, weather, roadworks,
  car mode share, congestion charge) that slows buses — plus ambient cars,
  taxis and cyclists that keep the streets alive.
- **Weather & events** — seasonal Markov weather (rain fills buses, snow
  breaks timetables), signal failures, flooded stations, strikes, concerts,
  derbies, demonstrations — all reported on the news ticker.
- **Economy** — fares, staff, energy per vehicle-km, station upkeep, loans,
  weekly performance grants, inflation, advertising, congestion charging.
- **Long game** — five difficulty modes (Easy → Realistic, plus Sandbox),
  achievements, day/night cycle, statistics dashboards with history graphs,
  demand/congestion/coverage overlays, autosave + manual save + JSON export.

## Controls

| Input | Action |
| --- | --- |
| Drag / wheel | Pan / zoom |
| Click | Inspect or place stops (with a build tool) |
| Right-click / Backspace | Undo last draft stop |
| Space | Pause · `1–3` speeds |
| Esc | Cancel draft |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — full system design: map
  generation, simulation loop, passenger AI, routing, rendering, save format,
  performance strategy.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — milestone plan (timetables, depots,
  rail engineering, traffic microsimulation, scenarios, WebGL renderer…).
