/**
 * canvas.tsx — the single Skia <Canvas> and the one imperative draw loop (§3).
 *
 * Design choice: the simulation and world state are plain mutable JS objects, so
 * the loop runs on the JS thread via requestAnimationFrame and records ONE Skia
 * Picture per frame. Only that single <Picture> element updates — no React
 * component per game object, no per-object reconciliation. (If a profiling pass
 * in M6 ever shows this is the bottleneck, the escape hatch is to move the loop
 * to a Reanimated frame callback + Skia value; the draw functions stay as-is.)
 *
 * Draw order: bg gradient + starfield in SCREEN space, then the camera transform
 * for world-space entities (trail, dust, planets, ship, debug), then screen-space
 * FX (grip flash) on top.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Canvas,
  Picture,
  Skia,
  TileMode,
  createPicture,
  type SkPicture,
} from '@shopify/react-native-skia';
import { SIM, T } from '@/config/tuning';
import { paletteFor } from '@/config/theme';
import { SHIP_SKINS, TRAIL_SKINS } from '@/config/theme';
import { advance, makeAccumulator } from '@/engine/loop';
import { drawShip } from '@/render/drawShip';
import { drawPlanet } from '@/render/drawPlanet';
import { drawTrail } from '@/render/drawTrail';
import { drawDust, drawCaptureRadii, drawGripFlash, drawOrbitPath } from '@/render/drawFx';
import { makeStarfield, drawStarfield, type Starfield } from '@/render/drawStarfield';
import {
  drainEvents,
  frame as frameWorld,
  simStep,
  type GameEvent,
  type World,
} from '@/world/world';

export interface DebugFlags {
  captureRadii: boolean;
  orbitPaths: boolean;
  freezeSpeed: boolean;
  godMode: boolean;
}

export interface HudSample {
  distance: number;
  combo: number;
  multiplier: number;
  stardust: number;
  fps: number;
  worstFrameMs: number;
}

interface Props {
  world: World;
  width: number;
  height: number;
  colorblind: boolean;
  shipSkin: string;
  trailSkin: string;
  debug?: DebugFlags;
  running?: boolean;
  onSample?: (s: HudSample) => void;
  onEvents?: (events: GameEvent[]) => void;
  onDeath?: () => void;
}

export function GameCanvas({
  world,
  width,
  height,
  colorblind,
  shipSkin,
  trailSkin,
  debug,
  running = true,
  onSample,
  onEvents,
  onDeath,
}: Props): React.JSX.Element {
  const runningRef = useRef(running);
  runningRef.current = running;
  const [picture, setPicture] = useState<SkPicture | null>(null);
  const acc = useRef(makeAccumulator());
  const lastT = useRef(0);
  const raf = useRef<number | null>(null);
  const diedRef = useRef(false);

  const palette = useMemo(() => paletteFor(colorblind), [colorblind]);
  const starfield = useRef<Starfield | null>(null);
  const bgShader = useMemo(() => {
    const paint = Skia.Paint();
    paint.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: 0, y: 0 },
        { x: 0, y: height },
        [Skia.Color(palette.bgTop), Skia.Color(palette.bgBottom)],
        [0, 1],
        TileMode.Clamp,
      ),
    );
    return paint;
  }, [palette, height]);

  // perf tracking
  const perf = useRef({ acc: 0, frames: 0, fps: 60, worst: 0, sampleT: 0 });

  useEffect(() => {
    starfield.current = makeStarfield(width, height, palette);
  }, [width, height, palette]);

  useEffect(() => {
    diedRef.current = false;
    const ship = SHIP_SKINS[shipSkin] ?? SHIP_SKINS.default!;
    const trail = TRAIL_SKINS[trailSkin] ?? TRAIL_SKINS.default!;

    const tick = (now: number) => {
      raf.current = requestAnimationFrame(tick);
      if (lastT.current === 0) lastT.current = now;
      let dt = (now - lastT.current) / 1000;
      lastT.current = now;
      if (dt > 0.25) dt = 0.25; // guard huge gaps (backgrounded)

      // ---- perf ----
      const p = perf.current;
      const frameMs = dt * 1000;
      if (frameMs > p.worst) p.worst = frameMs;
      p.acc += dt;
      p.frames++;
      p.sampleT += dt;

      if (runningRef.current) {
        // ---- simulate (fixed timestep, time-bent while orbiting) ----
        const orbiting = world.holding && world.ship.mode === 'orbit';
        const timeScale = orbiting ? T.HOLD_TIME_SCALE : 1;
        advance(acc.current, dt, timeScale, (simDt) => simStep(world, simDt));
        world.simStepsThisFrame = acc.current.steps;

        // ---- per-frame world update (camera, scroll, trail) ----
        frameWorld(world, dt);

        // ---- events -> audio/haptics/fx ----
        const events = drainEvents(world);
        if (events.length && onEvents) onEvents(events);
        if (world.dead && !diedRef.current) {
          diedRef.current = true;
          onDeath?.();
        }
      } else {
        // keep the accumulator from banking real time while paused/counting in.
        acc.current.acc = 0;
      }

      // ---- record one Picture ----
      const time = world.elapsed;
      const cam = world.camera;
      const sf = starfield.current;
      const pic = createPicture((canvas) => {
        // background (screen space)
        canvas.drawRect(Skia.XYWHRect(0, 0, width, height), bgShader);
        if (sf) drawStarfield(canvas, sf, cam.x, cam.y, time);

        // world space
        canvas.save();
        canvas.translate(width / 2 - cam.x + cam.shakeX, height / 2 - cam.y + cam.shakeY);

        if (debug?.captureRadii) drawCaptureRadii(canvas, world.planets);
        drawDust(canvas, world.dust, palette, time);
        for (let i = 0; i < world.planets.activeCount; i++) {
          drawPlanet(canvas, world.planets.get(i), palette);
        }
        if (debug?.orbitPaths) drawOrbitPath(canvas, world.ship);
        drawTrail(
          canvas,
          world.trailX,
          world.trailY,
          world.trailHead,
          world.trailCount,
          SIM.TRAIL_LENGTH,
          trail.a,
          trail.b,
        );
        if (!world.dead) {
          drawShip(canvas, world.ship, ship.hull, ship.core, ship.shape, world.ship.invuln > 0);
        }
        canvas.restore();

        // screen-space fx on top
        drawGripFlash(canvas, width, height, world.gripFlash / 0.18, palette);
      });
      setPicture(pic);

      // ---- HUD sample ~10Hz ----
      if (p.sampleT >= 0.1) {
        const fps = p.frames / p.acc;
        p.fps = fps;
        onSample?.({
          distance: world.distanceM,
          combo: world.combo,
          multiplier: world.multiplier,
          stardust: world.stardust,
          fps,
          worstFrameMs: p.worst,
        });
        p.acc = 0;
        p.frames = 0;
        p.sampleT = 0;
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      lastT.current = 0;
      acc.current = makeAccumulator();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, width, height, shipSkin, trailSkin, palette, bgShader, debug]);

  return (
    <Canvas style={{ width, height }}>{picture ? <Picture picture={picture} /> : null}</Canvas>
  );
}
