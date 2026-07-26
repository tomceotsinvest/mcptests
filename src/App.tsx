import { useEffect, useRef, useState } from 'react';
import { useEngine } from './ui/useEngine';
import { Renderer } from './game/render/renderer';
import { panBy, screenToWorld, zoomAt } from './game/render/camera';
import { TopBar } from './ui/TopBar';
import { Toolbar } from './ui/Toolbar';
import { SidePanel, PanelKind } from './ui/SidePanels';
import { Ticker } from './ui/Ticker';
import { NewGameModal } from './ui/Modals';
import { loadFromLocal } from './game/sim/saveload';
import type { Difficulty, SaveGame } from './game/types';

export default function App() {
  const { engine, snapshot, start } = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [panel, setPanel] = useState<PanelKind>('inspector');
  const [showNewGame, setShowNewGame] = useState(true);
  const hasSave = !!loadFromLocal();

  /* game + render loop */
  useEffect(() => {
    if (!engine || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const renderer = new Renderer(engine);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      engine.update(dt);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      renderer.draw(ctx, w, h);
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  /* input */
  useEffect(() => {
    if (!engine || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      panBy(engine.camera, dx, dy);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (moved < 6) {
        const rect = canvas.getBoundingClientRect();
        const p = screenToWorld(engine.camera, rect.width, rect.height, e.clientX - rect.left, e.clientY - rect.top);
        if (e.button === 2) engine.undoDraftStop();
        else engine.handleMapClick(p, 14 / engine.camera.zoom);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(
        engine.camera,
        rect.width,
        rect.height,
        e.clientX - rect.left,
        e.clientY - rect.top,
        Math.pow(1.0015, -e.deltaY),
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        engine.setSpeed(engine.speedIdx === 0 ? 1 : 0);
      }
      if (e.code === 'Escape') {
        engine.cancelDraft();
        engine.setTool('select');
      }
      if (e.code === 'Backspace') engine.undoDraftStop();
      if (e.code === 'Digit1') engine.setSpeed(1);
      if (e.code === 'Digit2') engine.setSpeed(2);
      if (e.code === 'Digit3') engine.setSpeed(3);
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onCtx);
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('keydown', onKey);
    };
  }, [engine]);

  const handleStart = (difficulty: Difficulty, seed: number, save?: SaveGame) => {
    start(seed, save ? save.difficulty : difficulty, save);
    setShowNewGame(false);
  };

  return (
    <div className="app">
      <canvas ref={canvasRef} className="map-canvas" />
      {engine && snapshot && (
        <>
          <TopBar engine={engine} snap={snapshot} panel={panel} setPanel={setPanel} />
          <Toolbar engine={engine} snap={snapshot} />
          <SidePanel engine={engine} snap={snapshot} panel={panel} setPanel={setPanel} />
          <Ticker news={snapshot.news} />
          {snapshot.gameOver && (
            <div className="modal-backdrop">
              <div className="modal">
                <h2>Removed from office</h2>
                <p>The network ran out of money and credit. London deserves better.</p>
                <button onClick={() => setShowNewGame(true)}>Start again</button>
              </div>
            </div>
          )}
        </>
      )}
      {showNewGame && <NewGameModal hasSave={hasSave} onStart={handleStart} />}
    </div>
  );
}
