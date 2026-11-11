# INTENT-001 — Banana Skyline

**Status:** Proposed · **Type:** Progressive product intent · **Version:** 0.1

## 1. Human intent: Why

Reimagine the early-1990s QBasic **GORILLAS.BAS** game for today's screens. Preserve the delight of choosing an angle and velocity, launching a banana across a city skyline, and adjusting your next shot from what happened. Make it beautiful, easy to pick up, and satisfying to replay. This is a small, working tribute to the programmer's first entry point—not an excuse to build a platform.

**Primary outcome:** A person can open a link, understand the game in seconds, play a complete match, and want to play again.

**Success is measured by:** playable fun and a dependable, shareable build—not architectural sophistication.

## 2. The experience

**Working title:** *Banana Skyline* (original branding; acknowledge inspiration from QBasic Gorillas in an About panel).

Two expressive gorillas face each other from randomly generated rooftops. Each turn, the player adjusts **angle** and **power/velocity**, then launches a banana. A visible wind indicator and gravity shape the banana's arc. Bananas collide with buildings, carve persistent craters, or hit the other gorilla. A successful hit earns a point, with a short playful victory animation. Start the next round with a fresh skyline.

**Look and feel:** A modern arcade postcard of the old DOS game: crisp pixel-inspired silhouettes, beautiful layered sunset/night skies, illuminated windows, playful gorilla expressions, satisfying banana trails, tiny particles, delightful sound, responsive motion. The original's simple physics remains recognizable. Offer a **Retro Mode** with a classic blue sky, chunky buildings, and minimalist effects.

**Controls:** Clear angle and power controls plus **Throw**, usable by mouse, touch, and keyboard. Display the player's previous angle/power to make small adjustments easy. Provide a first-run 15-second hint that disappears as soon as play begins.

## 3. Scope: small first release

**Must ship (v1):**
- Instant-play, single-page experience on desktop and mobile; no installation, account, sign-in, or backend.
- Two local players on one device, plus solo play against a simple computer opponent.
- Deterministic, understandable 2D projectile physics: launch angle, velocity, gravity, wind, collisions.
- Procedurally generated city skyline; visibly damaged buildings persist within a round.
- Turn handling, hit detection, score, round reset, and rematch.
- Responsive visuals, controls, sound toggle, and reduced-motion support.
- Retro Mode and a contemporary default art direction.
- A short About panel explaining the inspiration without claiming affiliation with Microsoft or IBM.

**Nice after v1, only if the core is already excellent:**
- Daily seeded skyline challenge, with a copyable challenge code.
- Skill-based trick-shot achievements (e.g., bank a banana through a narrow gap).
- Local best scores and optional instant-replay GIF/video capture if straightforward.
- Adjustable difficulty and palette themes.

**Not now:** Multiplayer servers, accounts, leaderboards, payments, ads, AI models, telemetry platforms, cloud deployment infrastructure, complex agent orchestration, elaborate progression systems, or a bespoke physics engine when straightforward math suffices.

## 4. Implementation freedom and boundaries

The implementation agent owns the HOW, including project structure, animation technique, rendering, physics implementation, and libraries, subject to these boundaries:

- **Default delivery:** Browser-based game using **TypeScript + Vite + HTML Canvas**, or a demonstrably simpler equivalent. Keep the game fully client-side and deployable as static files. No server is needed.
- Use established, lightweight tools where useful; do not introduce a heavyweight engine without an explicit benefit.
- Physics must be frame-rate-independent and reproducible in automated tests; separate simulation logic from drawing and UI.
- Favor generated art, procedural visuals, and original audio/assets. Do not copy proprietary original game source, sprites, sounds, or artwork into the product. Use the old game only as a behavioral reference.
- Preserve accessibility: keyboard support, touch targets, clear labels, visible focus, contrast, mute, and reduced motion.
- Favor clarity over clever abstractions. Complexity must earn its existence.

## 5. Acceptance criteria / observable evidence

1. **Entry point:** A fresh checkout can install dependencies and run locally with documented commands. A player sees a playable game immediately.
2. **Classic loop:** Two players can enter angle and velocity/power, throw bananas, observe plausible arcs with wind/gravity, see collision effects, score hits, and finish/restart a match.
3. **Solo mode:** A computer opponent takes turns and can occasionally hit, but does not require a network call or LLM.
4. **Repeatability:** Given a fixed skyline seed and shot inputs, the simulation produces the same shot trajectory and collision result on repeated tests.
5. **Visual delight:** The game is polished at common desktop and mobile sizes, not just a functioning physics demo; default and Retro modes both work.
6. **Reliability:** No obvious stuck turns, invisible projectiles, unresponsive touch controls, broken resizing, or scores persisting into an unintended new match.
7. **Evidence:** Include a brief README with run/build/test instructions, automated tests for trajectory/collisions/turn transitions, and a short screen capture or screenshots of gameplay at desktop and mobile sizes.
8. **Shipping:** Production build works as a static site, with no secrets, accounts, or paid services.

## 6. Progressive delivery / agent instructions

**First slice: Hello World, but playable.** Render one skyline and two gorillas; accept angle and velocity and animate one banana correctly. Run it and show evidence before adding decoration.

**Second slice: Complete game.** Add collisions, craters, alternating turns, scoring, new rounds, and simple solo opponent. Verify with tests and real gameplay.

**Third slice: Make it delightful.** Apply polished visuals, audio, accessible controls, Retro Mode, responsive layouts, and first-play hints. Verify on desktop and mobile viewports.

**Stop conditions:** If a change requires a backend, service account, complex framework, or new infrastructure, stop and explain why it is necessary before proceeding. If physics, scoring, or basic controls are not reliable, do not spend time polishing secondary features.

**Definition of done:** I can open the game in a browser, throw a banana at a gorilla, laugh at the explosion, play a rematch, and share the URL. The repository includes evidence that the core loop works.

## 7. Output expected from Claude Code

Implement the game in the current repository; create clear source files, tests, and README. Make pragmatic choices independently within the intent. Run the application and tests, inspect the experience, fix observable issues, and report what was completed, what was verified, and any remaining limitations. **Do not produce only a plan; produce a playable game.**
