# Architecture

Single-page static app. Two layers, one direction of dependency: UI → simulation.

| Path | Role |
|---|---|
| `src/sim/rng.ts` | Seeded random numbers |
| `src/sim/world.ts` | Skyline generation, craters, "is this point solid?" |
| `src/sim/physics.ts` | Fixed-timestep banana flight; a whole shot is computed up front |
| `src/sim/match.ts` | Turns, scoring, rounds (`aiming → flying → aiming / roundOver / matchOver`) |
| `src/sim/ai.ts` | Computer opponent: trial throws in the simulator, plus shrinking error |
| `src/render.ts` | Canvas drawing: sky, city, gorillas, banana, effects, Retro Mode |
| `src/audio.ts` | Synthesised sound effects (Web Audio) |
| `src/main.ts` | DOM, input, timing; the only file that mutates match state over time |

`src/sim` imports nothing from the browser, so tests run it in plain Node. The renderer only reads
the world. Because a shot's full path is computed at throw time, the display just samples it by
elapsed time — frame rate cannot change the result, and a paused tab cannot strand a turn.
