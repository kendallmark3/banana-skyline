import { Rng } from './rng';
import { simulateShot } from './physics';
import { PlayerId, World } from './world';

/**
 * Computer opponent: find a good shot by brute-force trial throws in the
 * simulator, then blur it. The blur shrinks with every attempt in a round,
 * so it "walks in" its aim the way a person does. No network, no model.
 */
export function solveShot(world: World, player: PlayerId) {
  let best = { angle: 45, power: 50, miss: Infinity };
  for (let angle = 20; angle <= 85; angle += 5) {
    for (let power = 10; power <= 100; power++) {
      const r = simulateShot(world, { player, angle, power }, false);
      const selfHit = r.outcome.kind === 'gorilla' && r.outcome.victim === player;
      const miss = selfHit ? 1e9 : r.closest;
      if (miss < best.miss) best = { angle, power, miss };
    }
  }
  return best;
}

const gauss = (rng: Rng) => (rng() + rng() + rng() - 1.5) * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function chooseAiShot(world: World, player: PlayerId, attempt: number, rng: Rng) {
  const ideal = solveShot(world, player);
  const blur = 1.5 * Math.pow(0.75, attempt);
  return {
    angle: clamp(Math.round(ideal.angle + gauss(rng) * 6 * blur), 5, 88),
    power: clamp(Math.round(ideal.power + gauss(rng) * 8 * blur), 5, 100),
  };
}
