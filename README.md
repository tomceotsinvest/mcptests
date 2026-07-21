# Newton's Cradle

A simple, mobile-friendly Newton's cradle game built with React + Vite and an
HTML canvas. Pull a ball aside, release it, and watch momentum ripple through
the chain with satisfying clacks.

## Play

- **Drag** any ball aside and let go — works with both touch and mouse.
- Each collision is a **clack** and scores a point.
- Chain clacks quickly to build a **combo** multiplier.
- Your **best** score is saved locally on the device.

## How it works

Each ball is simulated as an independent pendulum (gravity + light damping).
Neighbouring bobs resolve as equal-mass elastic collisions, so hitting one end
sends a single ball flying off the other — the real Newton's cradle effect.
Collisions also drive short Web Audio "clack" tones whose pitch and volume
scale with impact speed.

The stage is a full-viewport, responsive `<canvas>` that adapts to any phone
size and orientation, with `touch-action: none` so dragging never scrolls the
page.

## Develop

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build
npm run lint     # eslint
```

Game logic and rendering live in [`src/App.jsx`](src/App.jsx); styling is in
[`src/App.css`](src/App.css).
