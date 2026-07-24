// Pushup rep counting from pose keypoints.
//
// A rep is one full down-and-up cycle measured by elbow angle
// (the angle at the elbow formed by shoulder -> elbow -> wrist).
// When the arm bends past DOWN_ANGLE we enter the "down" phase;
// when it straightens past UP_ANGLE again we count a rep.

const DOWN_ANGLE = 100 // degrees; below this counts as "at the bottom"
const UP_ANGLE = 155 // degrees; above this counts as "arms extended"
const MIN_SCORE = 0.3 // minimum keypoint confidence to trust a joint

function angleAt(a, b, c) {
  // Angle in degrees at vertex b, formed by points a-b-c.
  const v1x = a.x - b.x
  const v1y = a.y - b.y
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const dot = v1x * v2x + v1y * v2y
  const mag1 = Math.hypot(v1x, v1y)
  const mag2 = Math.hypot(v2x, v2y)
  if (mag1 === 0 || mag2 === 0) return null
  let cos = dot / (mag1 * mag2)
  cos = Math.max(-1, Math.min(1, cos))
  return (Math.acos(cos) * 180) / Math.PI
}

// Average the left and right elbow angles from whichever side is confident.
export function elbowAngleFromKeypoints(byName) {
  const sides = [
    ['left_shoulder', 'left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow', 'right_wrist'],
  ]
  const angles = []
  for (const [s, e, w] of sides) {
    const shoulder = byName[s]
    const elbow = byName[e]
    const wrist = byName[w]
    if (
      shoulder?.score > MIN_SCORE &&
      elbow?.score > MIN_SCORE &&
      wrist?.score > MIN_SCORE
    ) {
      const ang = angleAt(shoulder, elbow, wrist)
      if (ang != null) angles.push(ang)
    }
  }
  if (angles.length === 0) return null
  return angles.reduce((a, b) => a + b, 0) / angles.length
}

export function keypointsByName(keypoints) {
  const byName = {}
  for (const kp of keypoints) byName[kp.name] = kp
  return byName
}

// Stateful rep counter. Call update() every frame with the current
// elbow angle; it returns whether a rep just completed.
export function createRepCounter() {
  let phase = 'up' // 'up' | 'down'
  let reps = 0

  return {
    update(angle) {
      let completed = false
      if (angle == null) return { completed, phase, reps }
      if (phase === 'up' && angle < DOWN_ANGLE) {
        phase = 'down'
      } else if (phase === 'down' && angle > UP_ANGLE) {
        phase = 'up'
        reps += 1
        completed = true
      }
      return { completed, phase, reps }
    },
    get reps() {
      return reps
    },
    get phase() {
      return phase
    },
    reset() {
      phase = 'up'
      reps = 0
    },
  }
}

export { DOWN_ANGLE, UP_ANGLE, MIN_SCORE }
