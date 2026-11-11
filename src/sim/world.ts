import { mulberry32 } from './rng';

/**
 * World model. Units are abstract "world units"; y grows downward and the
 * street is at y = height. Nothing in here knows about canvas or the DOM.
 */
export interface Building {
  x: number;
  w: number;
  h: number;
}
export interface Crater {
  x: number;
  y: number;
  r: number;
}
/** A gorilla is located by its feet: centre x, rooftop y. */
export interface Gorilla {
  x: number;
  y: number;
}
export interface World {
  seed: number;
  width: number;
  height: number;
  buildings: Building[];
  craters: Crater[];
  gorillas: [Gorilla, Gorilla];
  /** Integer -10..10. Positive blows right. */
  wind: number;
}
export type PlayerId = 0 | 1;

export const GORILLA_HEIGHT = 30;
export const GORILLA_RADIUS = 14;
export const BANANA_RADIUS = 3;
export const CRATER_RADIUS = 16;
export const BLAST_RADIUS = 26;

export const gorillaCenter = (g: Gorilla) => ({ x: g.x, y: g.y - GORILLA_HEIGHT / 2 });
export const bananaStart = (g: Gorilla) => ({ x: g.x, y: g.y - GORILLA_HEIGHT - 6 });

export function generateWorld(seed: number, width = 800, height = 450): World {
  const rng = mulberry32(seed);
  const widths: number[] = [];
  for (let x = 0; x < width; ) {
    let w = 44 + Math.floor(rng() * 30);
    if (width - (x + w) < 36) w = width - x;
    widths.push(w);
    x += w;
  }
  const n = widths.length;
  const minH = height * 0.14;
  const maxH = height * 0.58;
  const shape = Math.floor(rng() * 4); // rising, falling, valley, hill
  const buildings: Building[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const trend = [t, 1 - t, Math.abs(2 * t - 1), 1 - Math.abs(2 * t - 1)][shape];
    const h = Math.round(minH + (maxH - minH) * (0.15 + 0.5 * trend + 0.35 * rng()));
    buildings.push({ x, w: widths[i], h });
    x += widths[i];
  }
  const left = buildings[1 + (rng() < 0.5 ? 0 : 1)];
  const right = buildings[n - 2 - (rng() < 0.5 ? 0 : 1)];
  const stand = (b: Building): Gorilla => ({ x: b.x + b.w / 2, y: height - b.h });
  const wind = Math.round((rng() + rng() - 1) * 10);
  return { seed, width, height, buildings, craters: [], gorillas: [stand(left), stand(right)], wind };
}

/** True when (x, y) is inside a building that has not been blasted away there. */
export function isSolid(world: World, x: number, y: number): boolean {
  for (const b of world.buildings) {
    if (x < b.x || x >= b.x + b.w) continue;
    if (y < world.height - b.h || y > world.height) return false;
    for (const c of world.craters) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy < c.r * c.r) return false;
    }
    return true;
  }
  return false;
}
