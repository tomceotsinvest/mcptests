/**
 * Game.tsx — owns a run: creates the world, renders the single GameCanvas,
 * routes touch to capture/release, shows the HUD (distance / combo / stardust),
 * an FPS counter, a 3-2-1 count-in, and the first-runs tip (§10).
 *
 * Gameplay state is NOT React state — it lives in the world object. Only the
 * HUD samples (~10Hz) and lifecycle transitions touch React.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameCanvas, type HudSample } from '@/render/canvas';
import { createWorld, pressDown, pressUp, type GameEvent, type World } from '@/world/world';
import { useStore } from '@/state/store';
import { FEATURES } from '@/config/features';
import type { DebugFlags } from '@/render/canvas';

export function Game(): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const go = useStore((s) => s.go);
  const commitRun = useStore((s) => s.commitRun);
  const save = useStore((s) => s.save);
  const showTuning = useStore((s) => s.showTuning);

  const [countIn, setCountIn] = useState(3);
  const [running, setRunning] = useState(false);
  const [hud, setHud] = useState<HudSample>({
    distance: 0,
    combo: 0,
    multiplier: 1,
    stardust: 0,
    fps: 60,
    worstFrameMs: 0,
  });
  const comboPeak = useRef(0);

  // one world per mount (Retry remounts Game -> fresh world).
  const world = useMemo<World>(() => {
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    return createWorld(seed, {
      w: width,
      h: height,
      top: insets.top,
      bottom: insets.bottom,
      left: insets.left,
      right: insets.right,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3 - 2 - 1 - GO count-in, then start simulating.
  useEffect(() => {
    if (countIn <= 0) {
      setRunning(true);
      return;
    }
    const t = setTimeout(() => setCountIn((c) => c - 1), 650);
    return () => clearTimeout(t);
  }, [countIn]);

  const onSample = useCallback((s: HudSample) => {
    setHud(s);
    if (s.combo > comboPeak.current) comboPeak.current = s.combo;
  }, []);

  const onDeath = useCallback(() => {
    // brief freeze-frame before results (§10). Commit the run and route.
    setRunning(false);
    const result = commitRun({
      distance: Math.floor(world.distanceM),
      stardust: world.stardust,
      comboPeak: comboPeak.current,
      seed: world.seed,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[run] dist=${result.distance}m dust=${result.stardust} comboPeak=${result.comboPeak} ` +
        `avgFps=${hud.fps.toFixed(0)} worstFrame=${hud.worstFrameMs.toFixed(1)}ms`,
    );
    setTimeout(() => go('gameover'), 850);
  }, [commitRun, go, world, hud.fps, hud.worstFrameMs]);

  const onEvents = useCallback((_events: GameEvent[]) => {
    // audio + haptics + particle spawns wire in at M3.
  }, []);

  const debug: DebugFlags | undefined =
    FEATURES.DEBUG_PANEL && showTuning
      ? { captureRadii: true, orbitPaths: true, freezeSpeed: false, godMode: false }
      : undefined;

  const showTip = !save.flags.seenTutorial || save.stats.runs < 3;

  return (
    <View style={styles.root}>
      <GameCanvas
        world={world}
        width={width}
        height={height}
        colorblind={save.settings.colorblind}
        shipSkin={save.equipped.ship}
        trailSkin={save.equipped.trail}
        running={running && countIn <= 0}
        debug={debug}
        onSample={onSample}
        onEvents={onEvents}
        onDeath={onDeath}
      />

      {/* full-screen input surface: hold to grab, release to fling */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPressIn={() => pressDown(world)}
        onPressOut={() => pressUp(world)}
      />

      {/* HUD (out of the thumb zone, up top) */}
      <View style={[styles.hud, { top: insets.top + 8 }]} pointerEvents="none">
        <Text style={styles.distance}>{Math.floor(hud.distance)}m</Text>
        <View style={styles.hudRow}>
          <Text style={styles.combo}>×{hud.multiplier.toFixed(2)}</Text>
          <Text style={styles.dust}>✦ {hud.stardust}</Text>
        </View>
        <Text style={styles.fps}>
          {hud.fps.toFixed(0)} fps · worst {hud.worstFrameMs.toFixed(0)}ms
        </Text>
      </View>

      {showTip && countIn <= 0 && (
        <View style={styles.tipWrap} pointerEvents="none">
          <Text style={styles.tip}>HOLD to grab a planet · RELEASE to fling</Text>
        </View>
      )}

      {countIn > 0 && (
        <View style={styles.countWrap} pointerEvents="none">
          <Text style={styles.count}>{countIn}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060B' },
  hud: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  distance: { color: '#EAF0FF', fontSize: 46, fontWeight: '900', letterSpacing: 1 },
  hudRow: { flexDirection: 'row', gap: 18, marginTop: 2 },
  combo: { color: '#5EE7FF', fontSize: 20, fontWeight: '800' },
  dust: { color: '#FFDD88', fontSize: 20, fontWeight: '800' },
  fps: { color: '#7C88B0', fontSize: 11, marginTop: 4, letterSpacing: 1 },
  tipWrap: { position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center' },
  tip: { color: '#AEB9E8', fontSize: 14, letterSpacing: 1 },
  countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { color: '#5EE7FF', fontSize: 120, fontWeight: '900' },
});
