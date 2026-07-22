# ORBITAL

A one-thumb gravity-slingshot arcade game. Hold to attach to the nearest
planet's gravity well and swing around it; release to fly off on the tangent,
slingshotting toward the next planet. Chain clean slingshots for combo, collect
stardust, travel as far as you can up an endless procedural starfield.

Built with **Expo + React Native + TypeScript** and **`@shopify/react-native-skia`**
(single GPU canvas, one imperative draw loop). No third-party physics engine —
the orbit math is hand-rolled (`src/engine/physics.ts`).

---

## Run it on your phone (< 2 min)

```bash
cd orbital
npm install          # first time only
npx expo start       # scan the QR code with Expo Go (iOS/Android)
```

> Versions in `package.json` target the **Expo SDK 52** line. If your Expo Go is
> on a different SDK, run `npx expo install` once to align the native modules
> (Skia / Reanimated / async-storage), then `npx expo start` again.

Type-check without running:

```bash
npm run typecheck
```

---

## Controls

- **Hold** anywhere → grab the nearest planet within range and orbit it.
- **Release** → fling off along the current tangent (a gravity assist).
- Hold with **no planet in range** → a small "grip miss" flash + shake, no capture.
- Release inside the **perfect cone** toward the next planet → bonus stardust,
  a particle burst and a haptic (perfect-window rewards land at M3).

You are always effectively falling: the world scrolls up relentlessly (a rising
kill-line). Slingshot upward to keep pace, or fall off the bottom and the run ends.

---

## Architecture (why it hits 60fps)

```
App.tsx                     boot + hand-rolled screen switch (zustand)
src/
  config/  tuning.ts         EVERY gameplay number (single source of truth)
           theme.ts          palettes + colorblind + shop skins
           features.ts       feature flags (ads/iap off by default)
  state/   store.ts          zustand: screen, currency, unlocks, settings (META only)
           save.ts           AsyncStorage + schema v1 + migrate() + debounced writes
  engine/  loop.ts           fixed-timestep accumulator (DT = 1/120, interp alpha)
           physics.ts        free-flight + capture + orbit + release + perfect-window
           camera.ts         soft-lead follow + trauma-based screen shake
           rng.ts            seeded mulberry32 PRNG (deterministic layouts/replays)
           pool.ts           generic fixed-capacity object pool (no mid-run alloc)
  world/   entities.ts       plain mutable Ship/Planet/Dust/Hazard types
           world.ts          the live runtime: sim step, frame update, events
  render/  canvas.tsx        the single Skia <Canvas> + the one draw loop
           drawShip / drawPlanet / drawTrail / drawFx / drawStarfield
  screens/ Boot Menu Game GameOver Shop Settings
  ui/      Button
```

**Key idea:** gameplay state is **plain mutable objects in `world.ts`**, never
React state — so playing never triggers a re-render. The loop runs the fixed-
timestep simulation, then records **one** Skia `Picture` per frame (a single
`<Picture>` element updates, not a component per game object). The HUD samples
those values at ~10Hz; only lifecycle transitions touch React.

### The slingshot math (`engine/physics.ts`)
Orbit is **parametric**, not force-integrated: on capture we store the centre,
`radius = clamp(|p−C|)`, angle `θ`, and spin direction from `sign((p−C) × v)`.
Each step `θ += spinDir·ω·dt`, position snaps to `C + r·(cosθ, sinθ)`, and radius
decays gently inward. Release velocity is the exact tangent
`spinDir·ω·r·(−sinθ, cosθ)` times `(1 + SLINGSHOT_BOOST)`. Clean, readable, and
always solvable — and the release heading is the true arc tangent.

### Tuning
All feel lives in `src/config/tuning.ts` (`TUNING`) and is mirrored into a live-
editable `T`. The dev **Tuning Panel** (Settings → Dev tuning panel, `__DEV__`
only) will bind sliders to `T` and toggle debug overlays (capture radii, orbit
paths) — scaffolded now, full panel lands in M6.

---

## Milestone status

- [x] **M0** — Expo + Skia skeleton, fixed-timestep loop, on-screen FPS counter,
      screen state machine.
- [x] **M1** — core mechanic: auto-drift ship, hold-to-orbit, release-to-fling
      (correct tangent math), trail ribbon, soft-lead camera, off-screen death,
      distance score, world-speed ramp, starter recycled planet field.
      **← stop here for the feel check.**
- [ ] M2 — chunked generator + reachability guarantee, full pooling.
- [ ] M3 — particles, trauma shake, haptics, perfect-window, combo HUD, audio hooks.
- [ ] M4 — menu/gameover polish, economy, persistence, full settings.
- [ ] M5 — hazards (asteroids → rogue planets → clouds → wormholes), shop, tokens.
- [ ] M6 — tuning panel, perf pass, colorblind, share, icon/splash, ad/IAP stubs.

## Audio
The game is fully playable **muted**. Real clips wire in at M3/M4; see
[`assets/audio/README.md`](assets/audio/README.md) for the exact list of SFX and
music stems to drop in.
