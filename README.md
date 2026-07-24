# Pushups → Screen Time

A webcam app that counts your pushups and rewards each one with **1 minute of screen time**.

Get into a side-on view of your camera, and the app uses on-device pose
detection to watch your elbow angle: bend down past ~100° and straighten back
past ~155° to complete a rep. Every completed pushup adds a minute to your
screen-time bank, which you can spend with a live countdown timer.

## Features

- **Live pushup counting** via [TensorFlow.js MoveNet](https://www.tensorflow.org/hub/tutorials/movenet) pose detection, with a skeleton overlay on the video feed.
- **Screen-time bank** — each rep banks 1 minute; hit **Spend time** to run the countdown, **Pause** to stop it. The balance persists across reloads.
- **Private by design** — all pose inference runs in your browser. No video ever leaves your machine.
- **Manual fallback** — if the camera or model can't load, a `+1 pushup` button keeps the app usable.

## Running it

```bash
npm install
npm run dev
```

Then open the printed URL and click **Start camera** (your browser will ask
for camera permission). Camera access requires a secure context — `localhost`
during development, or HTTPS if you deploy it.

## How rep detection works

The counter (in `src/pushupCounter.js`) computes the angle at each elbow from
the shoulder, elbow, and wrist keypoints. It runs a small state machine: from
the "up" phase, bending below ~100° switches to "down"; straightening back
past ~155° counts one rep and returns to "up". Angle thresholds and the minimum
keypoint confidence live at the top of that file if you want to tune them.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — run ESLint
- `npm run preview` — preview the production build
