# Audio clips needed (drop these in — do not block on them)

The game is fully playable **muted**; audio wires in at **M3 (SFX hooks)** and
**M4 (music + mixer + settings)**. Until real clips are added, `audio.ts` plays
short procedural placeholder blips so nothing is silent-by-bug.

Drop the following files here (`assets/audio/`). Keep them **short and punchy**
(SFX 80–400ms). Formats: `.m4a`/`.aac` preferred, `.mp3`/`.wav` fine.

## SFX (§9)
| file            | when it plays                    | feel                                  |
|-----------------|----------------------------------|---------------------------------------|
| `capture.m4a`   | ship grabs a planet              | soft "chik"                           |
| `release.m4a`   | fling off orbit                  | "whoosh"; **pitch rises with combo**  |
| `perfect.m4a`   | release inside the perfect cone  | bright "shimmer"                      |
| `dust.m4a`      | stardust pickup                  | tiny "ping"                           |
| `gripmiss.m4a`  | hold with no planet in range     | dull "thunk"                          |
| `death.m4a`     | run ends                         | "boom" + reverse-sweep                |
| `ui_tap.m4a`    | button presses                   | short click                           |

## Music (§9)
| file             | notes                                                    |
|------------------|----------------------------------------------------------|
| `music_base.m4a` | calm, driving ambient synth loop (seamless loop point)   |
| `music_layer.m4a`| second stem, layered in past **combo 4**, same tempo/key |

`audio.ts` maps these names → preloaded `expo-av` sounds on boot. If a file is
missing it falls back to a procedural blip and logs which clip to add.
