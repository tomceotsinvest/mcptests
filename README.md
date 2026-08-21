# J.A.R.V.I.S.

A voice-driven assistant in the browser: an **offline command core** that answers
instantly with no network at all, plus an **optional Claude link** for everything
the local core cannot do.

```
speech / typing ─▶ brain ─▶ local skills ──▶ answer ──▶ speech synthesis
                      └────▶ Claude bridge ─▶ answer (streamed)
```

The local core handles the clock, arithmetic, unit conversion, timers and notes.
Anything else falls through to Claude — if the bridge is running. Without it,
JARVIS still works; it just says so.

## Quick start

```bash
npm install
npm run dev          # UI only — local core, no Claude link
```

Open the printed URL and type or speak a command.

### No-install option

```bash
npm run build:standalone      # writes dist/jarvis.html
```

That is the whole app inlined into one file — open it by double-clicking, or
put it on any static host. It runs the local core with no server and no
network; the Claude link needs the bridge, so the status rail reports it
offline.

To add the Claude link:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or run `ant auth login`
npm start                             # bridge + UI together
```

The status rail shows `Claude link: ACTIVE` once the bridge answers.

## Commands the local core understands

| Say | Example |
| --- | --- |
| Time & date | `what time is it`, `what's the date`, `what day is it` |
| Arithmetic | `what is 12 * 7`, `sqrt(144)`, `2 to the power of 10`, `15% of 240` |
| Conversions | `convert 10 km to miles`, `how many ml in 3 cups`, `100 c in f` |
| Timers | `set a timer for 5 minutes called pasta`, `list timers`, `cancel the pasta timer` |
| Notes | `remember that the hangar code is 1701`, `what do you remember`, `forget note 1` |
| Dice & coins | `roll a d20`, `roll 2d6`, `flip a coin`, `random number between 1 and 100` |
| System | `status`, `mute`, `unmute`, `clear the log`, `wipe your memory` |
| Help | `help` |

Prefix anything with `jarvis` and it still works (`hey jarvis, what time is it`).
Prefix a question with `ask claude` to skip the local core entirely.

Notes, timers and the voice setting persist in `localStorage`; timers keep
counting across a reload and announce themselves with a chime when they finish.

## Layout

```
src/
  jarvis/
    brain.js        routing: local skills first, Claude second, graceful fallback
    skills/         one file per skill, tried in order (system → … → identity)
    math.js         recursive-descent arithmetic parser (never eval)
    units.js        conversion tables + spoken-request parser
    duration.js     "an hour and a half" → milliseconds
    memory.js       notes, timers, settings; storage-agnostic and crash-proof
    llm.js          browser client for the bridge (SSE streaming)
    speech.js       Web Speech API recognition + synthesis
  hooks/useJarvis.js  wires the pieces to React state
  components/         HUD: reactor, transcript, command bar, status rail
server/
  index.js          the Claude bridge (HTTP + SSE)
  lib.js            request building, validation, credential detection
```

### The Claude bridge

`server/index.js` is a ~200-line Node service. It exists so the Anthropic
credential stays on the server: the browser talks to `/api`, Vite proxies that
to the bridge, and the key never enters the client bundle.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/status` | whether a credential is present, and which model is configured |
| `POST /api/chat` | streams the reply as `text/event-stream` |

It calls the Messages API with `claude-opus-5`, a cached system prompt, and
`effort: low` for snappy spoken answers. Refusal fallbacks are enabled by
default (`fallbacks: "default"`), and the bridge retries once without them if
the endpoint rejects that parameter. Only requests from `localhost` origins are
served, so a random website cannot spend your credits.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | – | credential; `ANTHROPIC_AUTH_TOKEN` or an `ant auth login` profile also work |
| `JARVIS_PORT` | `8787` | bridge port (the Vite proxy follows it) |
| `JARVIS_HOST` | `127.0.0.1` | bridge bind address |
| `JARVIS_MODEL` | `claude-opus-5` | model id |
| `JARVIS_MAX_TOKENS` | `2048` | reply ceiling — small because replies are spoken |
| `JARVIS_EFFORT` | `low` | `low` \| `medium` \| `high` \| `xhigh` \| `max` |
| `JARVIS_FALLBACKS` | on | set to `off` to disable refusal fallbacks |

Copy `.env.example` if you prefer a file, and `source` it before `npm start`.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server (local core only unless the bridge is up) |
| `npm run server` | the Claude bridge alone |
| `npm start` | both, side by side |
| `npm test` | Vitest suite for the engine, memory and bridge helpers |
| `npm run lint` | ESLint |
| `npm run build` / `npm run preview` | production build and preview |
| `npm run build:standalone` | one self-contained `dist/jarvis.html` — no server needed |

## Browser support

Speech **recognition** needs the Web Speech API (Chrome, Edge, Safari); the
microphone button is disabled elsewhere and typing always works. Speech
**synthesis** is available nearly everywhere. Both are reported in the status
rail, and the whole HUD respects `prefers-reduced-motion`.
