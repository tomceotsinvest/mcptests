# 🚦 GRIDLOCK — Traffic Engineer Simulator

A browser-based traffic management simulation game in the spirit of *Mini Motorways*, *Cities: Skylines* traffic tuning and *Transport Fever* — focused purely on solving congestion. You are hired as the city's traffic engineer: every level starts with a working city that is drowning in traffic, and your job is to untangle it with smarter junctions, better networks, public transport and demand management — not just more asphalt.

Pure HTML/CSS/JavaScript. **No build step, no server, no dependencies** — open `index.html` in any modern browser and play.

```bash
# option 1: just open it
open traffic-game/index.html          # macOS
xdg-open traffic-game/index.html      # Linux

# option 2: serve it (needed for OSM import in some browsers)
npx serve traffic-game
```

## Game modes

- **Campaign** — 7 increasingly difficult cities (village → suburb → dense grid → historic European → large American grid → mountain → coastal), each with unique traffic problems and objectives. Earn stars, unlock the next city.
- **Sandbox** — unlimited money, any city style/size/population/seed, plus tools to spawn accidents, roadworks, events, weather and demand changes.
- **Real-world map import** — type any place ("Soho, London"), paste coordinates or a maps link with `@lat,lng`, pick a radius, and the game imports the real road network from **OpenStreetMap** via the Overpass API (open data, ODbL — no Google scraping). Real roads keep their speed limits, lane counts, one-way restrictions, traffic signals, roundabouts, bridges, tunnels and land use; a synthetic population then brings the real city to life. Requires an internet connection.

## Simulation

- Every vehicle is an individual agent with an origin, destination, route, speed, patience and type (car, van, truck, bus, tram, taxi, emergency). Car-following keeps vehicles from clipping; queues, spillback and full gridlock emerge naturally.
- Drivers obey traffic lights (with tunable per-phase timings and green-wave sync), stop signs, roundabouts, speed limits, one-ways and rail level crossings — and reroute intelligently around congestion and accidents. Frustrated drivers eventually give up.
- Demand comes from land use: homes, offices, schools, shops, industry, stadiums. A full day/night cycle drives morning rush, school run, lunch traffic, evening rush and quiet nights, with different weekend patterns, and a gravity model keeps trips realistic.
- Mode choice is real: citizens walk, cycle (if you build lanes), ride your buses/trams/metro/rail (if they beat driving) or drive. Park & ride intercepts long car trips.
- Weather (sun, rain, heavy rain, fog, snow, ice) changes speeds, accident risk and demand. Random accidents get emergency response; breakdowns, roadworks, football matches, concerts, festivals, floods and school holidays keep every day different.
- Economy: construction and maintenance cost money; happy, well-connected citizens pay more tax and attract population growth.

## Tools

Roads (build/upgrade/downgrade/demolish, bridges, tunnels), junction control (signals + timings + synchronisation, stop signs, roundabouts), one-ways, speed limits, temporary closures, low-traffic neighbourhoods, pedestrian crossings and streets, bus/cycle/turn lanes, and a full transit kit (bus, tram, metro, commuter rail, bike hire, park & ride, car parks, taxi ranks). Undo/redo included.

## UI

Left: construction tools. Right: live stats, score breakdown and objectives. Top: clock, weather, time controls (pause/1×/4×/14×), search, budget. Bottom: detail panel for any selected road, junction or vehicle with suggested fixes. Overlays: congestion heatmap (green→red), pollution, noise, transit lines, vehicle paths, zones. Minimap with live congestion dots. Toasts for incidents; click one to jump to it.

**Controls:** drag to pan · scroll to zoom · double-click to zoom in · `Home` fit city · `Space` pause · `1/2/3` speeds · `Q` select · `R` road · `T` signals · `O` one-way · `B` bus route · `H` heatmap · `U` upgrade · `X` demolish · `G` stats · `Ctrl+Z/Y` undo/redo · `Esc` cancel/menu.

## Persistence & extras

Autosave every 2 minutes plus 4 manual slots (localStorage). Achievements, a local leaderboard, statistics graphs (congestion, speed, journeys, transit use, budget, population, CO₂, score), difficulty levels from Easy to Expert, and a guided tutorial in the first campaign level.

## Performance

Fixed-timestep simulation decoupled from rendering; spatial hashing for all proximity queries; congestion-aware A* routing; per-edge vehicle lists (only active edges are simulated); viewport culling, level-of-detail rendering (vehicles become dots when zoomed out) and a cached minimap. Comfortably runs thousands of vehicles.

---
Map data from OpenStreetMap imports © OpenStreetMap contributors, ODbL.
