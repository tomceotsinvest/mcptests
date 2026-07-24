import { useState, useEffect, useRef, useCallback } from 'react'
import * as poseDetection from '@tensorflow-models/pose-detection'
import '@tensorflow/tfjs'
import {
  createRepCounter,
  elbowAngleFromKeypoints,
  keypointsByName,
} from './pushupCounter'
import './App.css'

const MINUTES_PER_PUSHUP = 1
const STORAGE_KEY = 'pushup-screentime'

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export default function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const detectorRef = useRef(null)
  const counterRef = useRef(createRepCounter())
  const rafRef = useRef(null)
  const streamRef = useRef(null)

  const [cameraState, setCameraState] = useState('idle') // idle | starting | on | error
  const [modelState, setModelState] = useState('idle') // idle | loading | ready | error
  const [statusMsg, setStatusMsg] = useState('')

  const [reps, setReps] = useState(0)
  const [phase, setPhase] = useState('up')
  const [angle, setAngle] = useState(null)

  // Screen-time bank, in seconds, persisted across reloads.
  const [bankSeconds, setBankSeconds] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? Number(saved) || 0 : 0
  })
  const [spending, setSpending] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(bankSeconds))
  }, [bankSeconds])

  const addEarnedTime = useCallback(() => {
    setBankSeconds((prev) => prev + MINUTES_PER_PUSHUP * 60)
  }, [])

  // --- Spend-timer: drains the bank one second at a time while active. ---
  useEffect(() => {
    if (!spending) return
    const id = setInterval(() => {
      setBankSeconds((prev) => {
        const next = prev - 1
        if (next <= 0) {
          setSpending(false)
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [spending])

  // --- Detection loop: runs while the pose model is ready. ---
  useEffect(() => {
    if (modelState !== 'ready') return
    let cancelled = false

    const loop = async () => {
      if (cancelled) return
      const detector = detectorRef.current
      const video = videoRef.current
      const canvas = canvasRef.current

      if (detector && video && video.readyState >= 2 && canvas) {
        let poses = []
        try {
          poses = await detector.estimatePoses(video, {
            flipHorizontal: false,
          })
        } catch {
          // Skip this frame on transient inference errors.
        }

        const ctx = canvas.getContext('2d')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        if (poses.length > 0) {
          const kps = poses[0].keypoints
          drawSkeleton(ctx, kps)
          const a = elbowAngleFromKeypoints(keypointsByName(kps))
          setAngle(a)
          const result = counterRef.current.update(a)
          setPhase(result.phase)
          if (result.completed) {
            setReps(result.reps)
            addEarnedTime()
          }
        } else {
          setAngle(null)
        }
      }

      if (!cancelled) rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [modelState, addEarnedTime])

  const startCamera = useCallback(async () => {
    setCameraState('starting')
    setStatusMsg('Requesting camera…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraState('on')
    } catch (err) {
      setCameraState('error')
      setStatusMsg(
        `Camera unavailable: ${err.message}. You can still count reps manually below.`,
      )
      return
    }

    setModelState('loading')
    setStatusMsg('Loading pose model…')
    try {
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
      )
      detectorRef.current = detector
      setModelState('ready')
      setStatusMsg('')
    } catch (err) {
      setModelState('error')
      setStatusMsg(
        `Pose model failed to load: ${err.message}. Camera is on — use the manual +1 button to count.`,
      )
    }
  }, [])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      detectorRef.current?.dispose?.()
    }
  }, [])

  const manualRep = () => {
    counterRef.current.reset()
    setReps((r) => r + 1)
    addEarnedTime()
  }

  const resetSession = () => {
    counterRef.current.reset()
    setReps(0)
    setPhase('up')
  }

  const phaseLabel =
    angle == null
      ? 'no pose detected'
      : phase === 'down'
        ? 'DOWN — push up!'
        : 'UP — go down'

  return (
    <div className="app">
      <header className="hero">
        <h1>💪 Pushups → Screen Time</h1>
        <p className="tagline">
          Every pushup you do earns {MINUTES_PER_PUSHUP} minute of screen time.
        </p>
      </header>

      <div className="bank">
        <div className="bank-label">Screen time banked</div>
        <div className="bank-clock">{formatClock(bankSeconds)}</div>
        <div className="bank-controls">
          <button
            onClick={() => setSpending((s) => !s)}
            disabled={bankSeconds <= 0}
            className={spending ? 'btn danger' : 'btn primary'}
          >
            {spending ? '⏸ Pause' : '▶ Spend time'}
          </button>
        </div>
      </div>

      <div className="stage">
        <div className="video-wrap">
          <video ref={videoRef} className="video" playsInline muted />
          <canvas ref={canvasRef} className="overlay" />
          {cameraState !== 'on' && (
            <div className="video-placeholder">
              <button
                className="btn primary big"
                onClick={startCamera}
                disabled={cameraState === 'starting'}
              >
                {cameraState === 'starting' ? 'Starting…' : '📷 Start camera'}
              </button>
            </div>
          )}
          {cameraState === 'on' && (
            <div className={`phase-badge ${phase}`}>{phaseLabel}</div>
          )}
        </div>

        <div className="stats">
          <div className="stat big">
            <div className="stat-value">{reps}</div>
            <div className="stat-label">pushups this session</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {angle == null ? '—' : `${Math.round(angle)}°`}
            </div>
            <div className="stat-label">elbow angle</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {modelState === 'ready'
                ? '🟢'
                : modelState === 'loading'
                  ? '🟡'
                  : '⚪'}
            </div>
            <div className="stat-label">pose model</div>
          </div>
        </div>
      </div>

      {statusMsg && <p className="status">{statusMsg}</p>}

      <div className="footer-controls">
        <button className="btn" onClick={manualRep}>
          +1 pushup (manual)
        </button>
        <button className="btn ghost" onClick={resetSession}>
          Reset session
        </button>
      </div>

      <details className="how">
        <summary>How the detection works</summary>
        <p>
          Get into a side-on view of the camera so your arm is visible. The app
          tracks the angle at your elbow (shoulder → elbow → wrist). Bend below
          ~100° to register the bottom of the pushup, then straighten past ~155°
          to complete the rep. Everything runs on-device in your browser — no
          video leaves your machine.
        </p>
      </details>
    </div>
  )
}

// --- Overlay drawing ---
const SKELETON = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
]

function drawSkeleton(ctx, keypoints) {
  const byName = {}
  for (const kp of keypoints) byName[kp.name] = kp

  ctx.lineWidth = 4
  ctx.strokeStyle = '#4ade80'
  for (const [a, b] of SKELETON) {
    const pa = byName[a]
    const pb = byName[b]
    if (pa?.score > 0.3 && pb?.score > 0.3) {
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }
  }

  ctx.fillStyle = '#f9fafb'
  for (const kp of keypoints) {
    if (kp.score > 0.3) {
      ctx.beginPath()
      ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI)
      ctx.fill()
    }
  }
}
