# Newton's Cradle

A mobile-friendly Newton's cradle game. Pull a ball aside, release it, and watch
momentum ripple through the chain with satisfying clacks. It ships in two forms:

- **`newtons-cradle.html`** — the full **puzzle game**: 8 levels, moving targets,
  time and launch limits, star ratings, and a per-level high score. Fully
  self-contained (no build, no server) — just open the file in any browser, or
  serve it. This is the headline experience.
- **`src/App.jsx`** — the original **React + Vite** version: an endless "clack &
  combo" toy, kept as a minimal example of the physics in a component.

## The puzzle game

Momentum transfer becomes *aiming*. Coins sit on the swing arcs, so a stronger
launch reaches a higher coin and one big pull can sweep a whole column.

- **Drag** the far ball and release — pulling one end launches the other.
- Collect every **coin** to clear a level. Each level tracks its own **best score**.
- Earn up to **3 stars** per level; higher scores need efficient launches and
  leftover time.
- Levels introduce one idea at a time: both-sides launches, column sweeps,
  precision, limited launches (**Rally**), **moving targets**, a countdown
  (**Beat the Clock**), and a combined **Grand Finale** — plus endless **Free Play**.

Progress, stars, and high scores are saved to `localStorage` on the device.

## How the physics works

Each ball is an independent pendulum (gravity + light damping). Neighbouring bobs
resolve as equal-mass elastic collisions, so hitting one end sends a single ball
flying off the other — the real Newton's cradle effect. Collisions drive short
Web Audio "clack" tones whose pitch and volume scale with impact speed.

The stage is a full-viewport, responsive `<canvas>` with `touch-action: none`, so
dragging never scrolls the page. The cradle is sized to keep a full end-ball pull
on-screen, and coin angles stay within the balls' actual reach.

## Run it

Easiest — just open `newtons-cradle.html` in a browser (it's one self-contained
file). To run the React version instead:

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build (also copies public/newtons-cradle.html)
npm run lint     # eslint
```

When served by Vite, the standalone puzzle game is also available at
`/newtons-cradle.html`.
