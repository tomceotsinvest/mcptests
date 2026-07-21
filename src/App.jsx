import { useEffect, useRef, useState } from 'react'
import './App.css'

// ---- Tunable constants -------------------------------------------------
const NUM_BALLS = 5
const GRAVITY = 2200 // px/s^2 (scaled world gravity)
const DAMPING = 0.13 // energy loss per second (keeps things lively but finite)
const RESTITUTION = 0.995 // energy kept on each clack
const COMBO_WINDOW = 1100 // ms: clacks within this window keep a combo alive

function readBest() {
  const v = Number(localStorage.getItem('cradle-best'))
  return Number.isFinite(v) ? v : 0
}

export default function App() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const scoreRef = useRef(0)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(readBest)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    // ---- Layout (recomputed on resize) ---------------------------------
    const layout = { pivotX: (i) => i }
    function computeLayout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      layout.w = w
      layout.h = h
      // Ball radius scales with the smaller dimension so it fits any phone.
      const r = Math.max(14, Math.min(w / (NUM_BALLS * 2.6), h * 0.075))
      layout.r = r
      layout.length = Math.min(h * 0.5, w * 0.85) // string length
      layout.barY = h * 0.14
      const spacing = 2 * r
      const totalW = spacing * (NUM_BALLS - 1)
      layout.startX = w / 2 - totalW / 2
      layout.spacing = spacing
      layout.pivotX = (i) => layout.startX + i * spacing
    }

    // ---- Ball state ----------------------------------------------------
    // Each ball is a pendulum: angle (0 = straight down), angular velocity.
    const balls = Array.from({ length: NUM_BALLS }, () => ({ angle: 0, vel: 0 }))
    stateRef.current = { balls }

    // ---- Audio (lazy, unlocked on first interaction) -------------------
    let audioCtx = null
    function ensureAudio() {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext
        if (AC) audioCtx = new AC()
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
    }
    function clack(strength) {
      if (!audioCtx) return
      const t = audioCtx.currentTime
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      const vol = Math.min(0.35, 0.05 + strength * 0.5)
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(240 + strength * 900, t)
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.09)
      gain.gain.setValueAtTime(vol, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(t)
      osc.stop(t + 0.13)
    }

    // ---- Pointer / drag handling ---------------------------------------
    let dragIndex = -1
    let lastComboTime = 0

    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect()
      const p = e.touches ? e.touches[0] : e
      return { x: p.clientX - rect.left, y: p.clientY - rect.top }
    }
    function bobPos(i) {
      const { barY, length } = layout
      const a = balls[i].angle
      return { x: layout.pivotX(i) + Math.sin(a) * length, y: barY + Math.cos(a) * length }
    }
    function onDown(e) {
      ensureAudio()
      setStarted(true)
      const { x, y } = pointerPos(e)
      // Grab the nearest ball within a generous radius.
      let bestDist = layout.r * 1.9
      let idx = -1
      for (let i = 0; i < NUM_BALLS; i++) {
        const b = bobPos(i)
        const d = Math.hypot(b.x - x, b.y - y)
        if (d < bestDist) {
          bestDist = d
          idx = i
        }
      }
      if (idx >= 0) {
        dragIndex = idx
        balls[idx].vel = 0
        e.preventDefault()
      }
    }
    function onMove(e) {
      if (dragIndex < 0) return
      const { x } = pointerPos(e)
      const dx = x - layout.pivotX(dragIndex)
      // Angle from horizontal displacement, clamped to a sane pull range.
      let a = Math.asin(Math.max(-1, Math.min(1, dx / layout.length)))
      a = Math.max(-1.2, Math.min(1.2, a))
      balls[dragIndex].angle = a
      balls[dragIndex].vel = 0
      e.preventDefault()
    }
    function onUp() {
      dragIndex = -1
    }

    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('touchstart', onDown, { passive: false })
    canvas.addEventListener('touchmove', onMove, { passive: false })
    canvas.addEventListener('touchend', onUp)

    // ---- Simulation ----------------------------------------------------
    function registerClack(strength) {
      clack(strength)
      const now = performance.now()
      if (now - lastComboTime < COMBO_WINDOW) {
        setCombo((c) => c + 1)
      } else {
        setCombo(1)
      }
      lastComboTime = now
      scoreRef.current += 1
      const ns = scoreRef.current
      setScore(ns)
      setBest((b) => {
        if (ns > b) {
          localStorage.setItem('cradle-best', String(ns))
          return ns
        }
        return b
      })
    }

    function step(dt) {
      const { length, r } = layout
      // Integrate each pendulum (skip the one being dragged).
      for (let i = 0; i < NUM_BALLS; i++) {
        if (i === dragIndex) continue
        const b = balls[i]
        const accel = -(GRAVITY / length) * Math.sin(b.angle)
        b.vel += accel * dt
        b.vel *= Math.max(0, 1 - DAMPING * dt)
        b.angle += b.vel * dt
      }

      // Resolve collisions between neighbours (iterate for stacked hits).
      for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < NUM_BALLS - 1; i++) {
          const a = balls[i]
          const c = balls[i + 1]
          const xa = layout.pivotX(i) + Math.sin(a.angle) * length
          const xc = layout.pivotX(i + 1) + Math.sin(c.angle) * length
          const gap = xc - xa
          if (gap < 2 * r - 0.5) {
            // Horizontal velocities of the two bobs.
            const va = Math.cos(a.angle) * a.vel
            const vc = Math.cos(c.angle) * c.vel
            if (va - vc > 0) {
              // Equal-mass elastic collision => exchange horizontal velocities.
              const cosA = Math.cos(a.angle) || 1
              const cosC = Math.cos(c.angle) || 1
              a.vel = (vc / cosA) * RESTITUTION
              c.vel = (va / cosC) * RESTITUTION
              // va/vc are angular; multiply by length for true horizontal speed (px/s).
              const strength = Math.min(1, (Math.abs(va - vc) * length) / 700)
              if (strength > 0.03) registerClack(strength)
            }
            // Separate so the bobs don't overlap or stick.
            const push = (2 * r - gap) / 2 / length
            a.angle -= push
            c.angle += push
          }
        }
      }

      // Break the combo once everything has settled.
      const moving = balls.some((b) => Math.abs(b.vel) > 0.05 || Math.abs(b.angle) > 0.01)
      if (!moving && performance.now() - lastComboTime > COMBO_WINDOW) {
        setCombo(0)
      }
    }

    // ---- Rendering -----------------------------------------------------
    function drawBall(x, y, r) {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
      g.addColorStop(0, '#f5f7fa')
      g.addColorStop(0.35, '#c7ced6')
      g.addColorStop(0.7, '#8a93a0')
      g.addColorStop(1, '#3f4753')
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = g
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(20,24,30,0.4)'
      ctx.stroke()
      // highlight
      ctx.beginPath()
      ctx.arc(x - r * 0.32, y - r * 0.36, r * 0.22, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.fill()
    }

    function draw() {
      const { w, h, r, length, barY } = layout
      ctx.clearRect(0, 0, w, h)

      // Support bar the strings hang from.
      const barPad = layout.spacing
      ctx.fillStyle = '#20252e'
      ctx.fillRect(
        layout.pivotX(0) - barPad,
        barY - r * 0.5,
        layout.spacing * (NUM_BALLS - 1) + barPad * 2,
        r * 0.5,
      )

      const floorY = barY + length + r * 1.7
      for (let i = 0; i < NUM_BALLS; i++) {
        const px = layout.pivotX(i)
        const b = bobPos(i)
        // string
        ctx.beginPath()
        ctx.moveTo(px, barY)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = 'rgba(180,190,205,0.55)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        // pivot dot
        ctx.beginPath()
        ctx.arc(px, barY, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#4a525f'
        ctx.fill()
        // soft shadow beneath the ball
        ctx.beginPath()
        ctx.ellipse(b.x, floorY, r * 0.8, r * 0.22, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.fill()
        // ball
        drawBall(b.x, b.y, r)
      }
    }

    // ---- Main loop -----------------------------------------------------
    computeLayout()
    let raf
    let prev = performance.now()
    function loop(now) {
      let dt = (now - prev) / 1000
      prev = now
      dt = Math.min(dt, 1 / 30) // clamp to avoid tunnelling after a lag spike
      const sub = 3 // sub-step for stable collisions
      for (let s = 0; s < sub; s++) step(dt / sub)
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const onResize = () => computeLayout()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('touchstart', onDown)
      canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('touchend', onUp)
    }
  }, [setScore, setCombo, setBest, setStarted])

  function reset() {
    const s = stateRef.current
    if (s) {
      s.balls.forEach((b) => {
        b.angle = 0
        b.vel = 0
      })
    }
    scoreRef.current = 0
    setScore(0)
    setCombo(0)
  }

  return (
    <div className="game">
      <header className="hud">
        <div className="stat">
          <span className="label">Clacks</span>
          <span className="value">{score}</span>
        </div>
        <div className={`stat combo ${combo > 1 ? 'hot' : ''}`}>
          <span className="label">Combo</span>
          <span className="value">{combo > 1 ? `x${combo}` : '—'}</span>
        </div>
        <div className="stat">
          <span className="label">Best</span>
          <span className="value">{best}</span>
        </div>
      </header>

      <canvas ref={canvasRef} className="stage" />

      <footer className="controls">
        <p className="hint">
          {started ? 'Pull a ball aside and let it go.' : 'Tap a ball, drag it aside, and release to swing.'}
        </p>
        <button className="reset" onClick={reset}>Reset</button>
      </footer>
    </div>
  )
}
