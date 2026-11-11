# Current Feature — Banana Skyline v1

Full intent: [INTENT-001-banana-skyline.md](INTENT-001-banana-skyline.md) (source of truth; not rewritten here).

## Outcome
A person can open a link, understand the game in seconds, play a complete banana-throwing match
(two players on one device, or solo against the computer), and want to play again.

## Success / Evidence
- `npm install && npm run dev` shows a playable game immediately.
- `npm test` passes: trajectory repeatability, collisions, turn transitions, scoring, computer opponent.
- `npm run build` produces a static site in `dist/` with no server, secrets or accounts.
- `npm run evidence` plays whole matches in headless Chrome at desktop and phone sizes and writes
  screenshots to `docs/screenshots/`.

## Constraints / Boundaries
- Client-side only: TypeScript + Vite + Canvas. No backend, telemetry, accounts or AI models.
- Simulation (`src/sim`) stays separate from drawing and UI, and is frame-rate independent.
- Original, generated art and sound only; the 1990s game is a behavioural reference, nothing is copied.

## Deltas
- **Slice 1–3 delivered together (v0.1.0):** playable throw, full game loop, then polish, Retro Mode,
  audio, accessibility and responsive layouts. Evidence in `docs/screenshots/`.
- **Not built (listed "nice after v1"):** daily seeded challenge, achievements, best scores, replay
  capture, difficulty and palette settings. `?seed=N` already replays a skyline.

### Delta 1 — after first play (2026-11-11)
- **Keep:** everything in v0.1.0.
- **Change:** the winning gorilla should put on a show. Now: chest-pound, dance, eats a banana in
  three bites, confetti, and a backflip on a match win. Skippable; a still pose under reduced motion.
- **Change:** one computer difficulty was a showstopper. Now Easy / Normal / Hard in *New game*.
- **Evidence:** `tests/celebrate.test.ts`, the difficulty ordering test in `tests/sim.test.ts`,
  and `docs/screenshots/celebrate-*.png`.
