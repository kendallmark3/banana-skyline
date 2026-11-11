import {
  BANANA_RADIUS,
  GORILLA_RADIUS,
  PlayerId,
  World,
  bananaStart,
  gorillaCenter,
  isSolid,
} from './world';

/**
 * Projectile simulation. A whole shot is computed up front with a fixed
 * timestep, so the result never depends on the display's frame rate: the
 * renderer just samples the recorded path by elapsed time.
 */
export const DT = 1 / 120;
export const GRAVITY = 300; // units / s^2
export const POWER_SCALE = 8; // launch speed = power * POWER_SCALE (units / s)
export const WIND_ACCEL = 5; // horizontal accel per wind point (units / s^2)
export const MAX_FLIGHT = 20; // seconds
const SELF_HIT_GRACE = 0.35; // seconds before the thrower can hit themselves
const MARGIN = 100; // how far past the side edges a banana may wander

export const ANGLE_MIN = 0;
export const ANGLE_MAX = 90;
export const POWER_MIN = 1;
export const POWER_MAX = 100;

export interface ShotInput {
  player: PlayerId;
  /** Degrees above horizontal, measured toward the opponent. */
  angle: number;
  power: number;
}
export type Outcome =
  | { kind: 'gorilla'; victim: PlayerId }
  | { kind: 'building' }
  | { kind: 'out' };

export interface ShotResult {
  input: ShotInput;
  /** x,y pairs; index 0 is the launch point, then one pair per step. */
  path: Float32Array;
  steps: number;
  duration: number;
  outcome: Outcome;
  impact: { x: number; y: number };
  /** Smallest gap to the opponent during flight (0 on a hit). */
  closest: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function simulateShot(world: World, raw: ShotInput, record = true): ShotResult {
  const input: ShotInput = {
    player: raw.player,
    angle: clamp(raw.angle, ANGLE_MIN, ANGLE_MAX),
    power: clamp(raw.power, POWER_MIN, POWER_MAX),
  };
  const dir = input.player === 0 ? 1 : -1;
  const rad = (input.angle * Math.PI) / 180;
  const speed = input.power * POWER_SCALE;
  let { x, y } = bananaStart(world.gorillas[input.player]);
  let vx = dir * Math.cos(rad) * speed;
  let vy = -Math.sin(rad) * speed;
  const ax = world.wind * WIND_ACCEL;

  const other: PlayerId = input.player === 0 ? 1 : 0;
  const centers = [gorillaCenter(world.gorillas[0]), gorillaCenter(world.gorillas[1])];
  const hitR = GORILLA_RADIUS + BANANA_RADIUS;
  const graceSteps = Math.round(SELF_HIT_GRACE / DT);
  const maxSteps = Math.round(MAX_FLIGHT / DT);

  const pts: number[] = record ? [x, y] : [];
  let closest = Infinity;
  let outcome: Outcome = { kind: 'out' };
  let steps = 0;

  while (steps < maxSteps) {
    steps++;
    vx += ax * DT;
    vy += GRAVITY * DT;
    x += vx * DT;
    y += vy * DT;
    if (record) pts.push(x, y);

    const dOther = Math.hypot(x - centers[other].x, y - centers[other].y);
    closest = Math.min(closest, Math.max(0, dOther - hitR));
    if (dOther < hitR) {
      outcome = { kind: 'gorilla', victim: other };
      break;
    }
    if (steps > graceSteps) {
      const me = centers[input.player];
      if (Math.hypot(x - me.x, y - me.y) < hitR) {
        outcome = { kind: 'gorilla', victim: input.player };
        break;
      }
    }
    if (isSolid(world, x, y)) {
      outcome = { kind: 'building' };
      break;
    }
    if (x < -MARGIN || x > world.width + MARGIN || y > world.height) break;
  }

  return {
    input,
    path: new Float32Array(pts),
    steps,
    duration: steps * DT,
    outcome,
    impact: { x, y },
    closest,
  };
}

/** Banana position `t` seconds into a recorded shot (linear between steps). */
export function samplePath(result: ShotResult, t: number): { x: number; y: number } {
  const f = clamp(t / DT, 0, result.steps);
  const i = Math.min(Math.floor(f), result.steps - 1);
  const k = f - i;
  const p = result.path;
  return {
    x: p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * k,
    y: p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * k,
  };
}
