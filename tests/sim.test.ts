import { describe, expect, it } from 'vitest';
import { chooseAiShot, solveShot } from '../src/sim/ai';
import { createMatch, nextRound, resolveFlight, throwBanana } from '../src/sim/match';
import { DT, GRAVITY, POWER_SCALE, samplePath, simulateShot } from '../src/sim/physics';
import { mulberry32 } from '../src/sim/rng';
import { World, bananaStart, generateWorld, isSolid } from '../src/sim/world';

/** Flat, empty world: lets us compare the integrator with textbook ballistics. */
const openWorld = (wind = 0): World => ({
  seed: 0,
  width: 4000,
  height: 1000,
  buildings: [],
  craters: [],
  gorillas: [
    { x: 100, y: 900 },
    { x: 3900, y: 900 },
  ],
  wind,
});

/** First seed whose skyline has an exact solution for `player`. */
function hittableMatch(player: 0 | 1 = 0, target = 3) {
  for (let seed = 1; seed < 50; seed++) {
    const m = createMatch({ seed, target });
    const shot = solveShot(m.world, player);
    if (shot.miss === 0) return { m, shot, seed };
  }
  throw new Error('no hittable seed found');
}

describe('skyline generation', () => {
  it('is reproducible from a seed and differs between seeds', () => {
    expect(generateWorld(42)).toEqual(generateWorld(42));
    expect(generateWorld(42).buildings).not.toEqual(generateWorld(43).buildings);
  });

  it('fills the width and stands both gorillas on rooftops, at both aspect ratios', () => {
    for (const [w, h] of [[800, 450], [480, 620]]) {
      for (let seed = 0; seed < 200; seed++) {
        const world = generateWorld(seed, w, h);
        let x = 0;
        for (const b of world.buildings) {
          expect(b.x).toBe(x);
          expect(b.w).toBeGreaterThanOrEqual(36);
          x += b.w;
        }
        expect(x).toBe(w);
        const [a, b] = world.gorillas;
        expect(a.x).toBeLessThan(b.x - 100);
        for (const g of world.gorillas) {
          expect(isSolid(world, g.x, g.y + 1)).toBe(true);
          expect(isSolid(world, g.x, g.y - 1)).toBe(false);
        }
        expect(Math.abs(world.wind)).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe('trajectory', () => {
  it('repeats exactly for the same seed and inputs', () => {
    const a = simulateShot(generateWorld(7), { player: 0, angle: 52, power: 61 });
    const b = simulateShot(generateWorld(7), { player: 0, angle: 52, power: 61 });
    expect(a.outcome).toEqual(b.outcome);
    expect(a.impact).toEqual(b.impact);
    expect(Array.from(a.path)).toEqual(Array.from(b.path));
  });

  it('matches closed-form ballistics when there is no wind', () => {
    const world = openWorld();
    const r = simulateShot(world, { player: 0, angle: 45, power: 50 });
    const v = 50 * POWER_SCALE;
    const start = bananaStart(world.gorillas[0]);
    const apex = start.y - (v * Math.SQRT1_2) ** 2 / (2 * GRAVITY);
    let top = Infinity;
    for (let i = 1; i < r.path.length; i += 2) top = Math.min(top, r.path[i]);
    expect(top).toBeGreaterThan(apex - 2);
    expect(top).toBeLessThan(apex + 2);
    // x(t) is linear without wind
    const t = 1;
    expect(samplePath(r, t).x).toBeCloseTo(start.x + v * Math.SQRT1_2 * t, 0);
  });

  it('is pushed by wind, and mirrored for player two', () => {
    const shot = { player: 0 as const, angle: 60, power: 40 };
    const calm = simulateShot(openWorld(0), shot).impact.x;
    expect(simulateShot(openWorld(8), shot).impact.x).toBeGreaterThan(calm + 20);
    expect(simulateShot(openWorld(-8), shot).impact.x).toBeLessThan(calm - 20);
    const p2 = simulateShot(openWorld(0), { ...shot, player: 1 });
    expect(p2.impact.x).toBeLessThan(openWorld().gorillas[1].x);
  });

  it('samples the same position however finely the display steps time', () => {
    const r = simulateShot(openWorld(3), { player: 0, angle: 50, power: 45 });
    const at = (fps: number) => {
      let t = 0;
      while (t + 1 / fps <= 1.5) t += 1 / fps;
      return { t, p: samplePath(r, t) };
    };
    const a = at(30);
    const b = at(144);
    // both land on the same curve: compare against the path sampled at each one's own time
    expect(a.p).toEqual(samplePath(r, a.t));
    expect(Math.abs(a.p.x - samplePath(r, b.t).x)).toBeLessThan(400 * (1 / 30));
    expect(samplePath(r, 0)).toEqual(bananaStart(openWorld().gorillas[0]));
    expect(samplePath(r, 999)).toEqual({ x: r.path[r.steps * 2], y: r.path[r.steps * 2 + 1] });
    expect(r.duration).toBeCloseTo(r.steps * DT);
  });

  it('clamps out-of-range inputs and always terminates', () => {
    const r = simulateShot(openWorld(), { player: 0, angle: 500, power: 9999 });
    expect(r.input).toEqual({ player: 0, angle: 90, power: 100 });
    expect(['out', 'gorilla', 'building']).toContain(r.outcome.kind);
  });
});

describe('collisions', () => {
  it('stops at a building, and the crater it leaves lets the next banana through', () => {
    const m = createMatch({ seed: 3 });
    const flat = { angle: 0, power: 30 };
    const first = throwBanana(m, flat.angle, flat.power);
    expect(first.outcome.kind).toBe('building');
    expect(isSolid(m.world, first.impact.x, first.impact.y)).toBe(true);
    resolveFlight(m);
    expect(m.world.craters).toHaveLength(1);
    expect(isSolid(m.world, first.impact.x, first.impact.y)).toBe(false);
    const again = simulateShot(m.world, { player: 0, ...flat });
    expect(again.steps).toBeGreaterThan(first.steps);
  });

  it('detects a hit on the other gorilla', () => {
    const { m, shot } = hittableMatch();
    const r = simulateShot(m.world, { player: 0, ...shot });
    expect(r.outcome).toEqual({ kind: 'gorilla', victim: 1 });
    expect(r.closest).toBe(0);
  });

  it('lets a banana thrown straight up come back down on the thrower', () => {
    const r = simulateShot(openWorld(), { player: 0, angle: 90, power: 30 });
    expect(r.outcome).toEqual({ kind: 'gorilla', victim: 0 });
  });

  it('reports a miss when the banana leaves the city', () => {
    const r = simulateShot(generateWorld(5), { player: 0, angle: 45, power: 100 });
    expect(r.outcome.kind).toBe('out');
  });
});

describe('turns and scoring', () => {
  it('alternates players after a miss and remembers each last shot', () => {
    const m = createMatch({ seed: 5 });
    expect(m.current).toBe(0);
    throwBanana(m, 45, 100);
    expect(m.phase).toBe('flying');
    expect(() => throwBanana(m, 45, 50)).toThrow();
    resolveFlight(m);
    expect(m.phase).toBe('aiming');
    expect(m.current).toBe(1);
    expect(m.lastShots).toEqual([{ angle: 45, power: 100 }, null]);
    expect(() => resolveFlight(m)).toThrow();
    throwBanana(m, 45, 100);
    resolveFlight(m);
    expect(m.current).toBe(0);
    expect(m.scores).toEqual([0, 0]);
  });

  it('scores a hit, starts a fresh skyline, and keeps the score across rounds', () => {
    const { m, shot } = hittableMatch();
    throwBanana(m, 0, 30);
    resolveFlight(m); // p1 craters a building
    throwBanana(m, 45, 100);
    resolveFlight(m); // p2 misses
    const before = m.world;
    throwBanana(m, shot.angle, shot.power);
    resolveFlight(m);
    expect(m.scores).toEqual([1, 0]);
    expect(m.phase).toBe('roundOver');
    expect(m.victim).toBe(1);
    expect(() => throwBanana(m, 45, 50)).toThrow();
    nextRound(m);
    expect(m.round).toBe(2);
    expect(m.phase).toBe('aiming');
    expect(m.current).toBe(1); // opener alternates
    expect(m.world.craters).toHaveLength(0);
    expect(m.world.buildings).not.toEqual(before.buildings);
    expect(m.scores).toEqual([1, 0]);
  });

  it('gives the point to the opponent on a self-hit', () => {
    const m = createMatch({ seed: 1 });
    m.world.wind = 0;
    throwBanana(m, 90, 30);
    resolveFlight(m);
    expect(m.scores).toEqual([0, 1]);
    expect(m.victim).toBe(0);
  });

  it('ends the match at the target score; a rematch starts clean', () => {
    const { m, shot, seed } = hittableMatch(0, 1);
    throwBanana(m, shot.angle, shot.power);
    resolveFlight(m);
    expect(m.phase).toBe('matchOver');
    expect(m.winner).toBe(0);
    expect(() => nextRound(m)).toThrow();
    const rematch = createMatch({ seed: seed + 1, target: 1 });
    expect(rematch.scores).toEqual([0, 0]);
    expect(rematch.round).toBe(1);
    expect(rematch.lastShots).toEqual([null, null]);
  });
});

describe('computer opponent', () => {
  it('is deterministic for a given seed', () => {
    const world = generateWorld(11);
    expect(chooseAiShot(world, 1, 0, mulberry32(9))).toEqual(chooseAiShot(world, 1, 0, mulberry32(9)));
  });

  it('usually finds the target within a round, but rarely on the first throw', () => {
    let firstTry = 0;
    let within8 = 0;
    const games = 20;
    for (let seed = 1; seed <= games; seed++) {
      const world = generateWorld(seed);
      const rng = mulberry32(seed * 31);
      for (let attempt = 0; attempt < 8; attempt++) {
        const shot = chooseAiShot(world, 1, attempt, rng);
        const r = simulateShot(world, { player: 1, ...shot });
        if (r.outcome.kind === 'building') world.craters.push({ ...r.impact, r: 16 });
        if (r.outcome.kind === 'gorilla' && r.outcome.victim === 0) {
          if (attempt === 0) firstTry++;
          within8++;
          break;
        }
      }
    }
    expect(within8).toBeGreaterThanOrEqual(games * 0.7);
    expect(firstTry).toBeLessThanOrEqual(games * 0.5);
  });
});
