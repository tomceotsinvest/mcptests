# RNG Shooter

A top-down infinite-wave shooter where every kill rolls random loot. Open
[`rng-shooter/index.html`](rng-shooter/index.html) directly in a browser — no build step or dependencies.

- **RNG loot loop** — every enemy kill drops a random weapon; 10% of the time it rolls an ability instead
- **Loadout** — hold up to 2 weapons (swap with `Q` / scroll) and 1 ability (`SPACE`)
- **12 unique weapons** across 5 rarities (Common → Legendary): Pistol, SMG, Shotgun, Burst Rifle, Assault Rifle, Dual Uzis, Sniper Rifle, Flamethrower, Rocket Launcher, Laser Repeater, Minigun, Railgun
- **6 abilities** — Dash, Nuke, Time Freeze, Med Kit, Shield, Auto Turret
- **7 enemy types** — grunt, shooter, bomber, tank, charger, sniper, splitter (splits into minis)
- **Infinite waves** with random spawn positions and scaling difficulty
- **2 maps** — Forest (trees, grass, flowers) and Mars (red dunes, rocks, craters)

Controls: `WASD` move · mouse aim/shoot · `F` pick up loot · `Q`/scroll swap weapon · `SPACE` use ability

**Mobile**: full touch support — left virtual joystick to move, right joystick to aim & auto-fire, plus on-screen SWAP / ABILITY / TAKE buttons (tap weapon slots to switch).

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
