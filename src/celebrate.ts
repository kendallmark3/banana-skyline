/**
 * Winner's celebration, as a pure timeline: given seconds since it started,
 * say what the gorilla's body is doing. The renderer draws it; main.ts cues
 * the matching sounds from the same constants.
 *
 *   pound chest -> dance -> eat a banana in three bites -> finale
 *   (the finale adds a backflip when the whole match was won)
 */
export type Arm = 'down' | 'up' | 'chestIn' | 'chestOut' | 'mouth';
export interface Move {
  phase: 'ready' | 'pound' | 'dance' | 'eat' | 'finale';
  left: Arm;
  right: Arm;
  /** Sideways shuffle and height off the roof, in world units. */
  dx: number;
  lift: number;
  /** Whole-body rotation in radians (the backflip). */
  spin: number;
  banana: 'none' | 'high' | 'mouth';
  bites: number;
  chewing: boolean;
}

export const POUND_END = 0.75;
export const DANCE_END = 1.95;
export const EAT_END = 3.1;
export const THUMP_TIMES = [0.06, 0.23, 0.4, 0.57];
export const BITE_TIMES = [2.35, 2.6, 2.85];
const FLIP_SECONDS = 0.65;
/** How long the game waits before moving on. */
export const CELEBRATION_SECONDS = { round: 3.9, match: 4.6 };

const STILL: Move = {
  phase: 'finale', left: 'up', right: 'up', dx: 0, lift: 0, spin: 0, banana: 'none', bites: 3, chewing: false,
};

export function celebration(t: number, final: boolean, facing: 1 | -1, reduced = false): Move {
  if (reduced) return STILL; // reduced motion: one calm arms-up pose
  const m: Move = { ...STILL, phase: 'ready', left: 'down', right: 'down', bites: 0 };
  if (t < 0) return m;

  if (t < POUND_END) {
    m.phase = 'pound';
    const leftIn = Math.floor(t / 0.085) % 2 === 0;
    m.left = leftIn ? 'chestIn' : 'chestOut';
    m.right = leftIn ? 'chestOut' : 'chestIn';
    m.lift = 1.5 * Math.abs(Math.sin(t * 37));
    return m;
  }
  if (t < DANCE_END) {
    m.phase = 'dance';
    const sway = Math.sin((t - POUND_END) * Math.PI * 5);
    m.dx = sway * 5;
    m.lift = Math.abs(Math.sin((t - POUND_END) * Math.PI * 5)) * 6;
    m.left = sway > 0 ? 'up' : 'down';
    m.right = sway > 0 ? 'down' : 'up';
    return m;
  }
  const hand = facing > 0 ? 'right' : 'left'; // eat with the hand facing the loser
  if (t < EAT_END) {
    m.phase = 'eat';
    const showing = t < DANCE_END + 0.3; // hold the banana up first, then tuck in
    m[hand] = showing ? 'up' : 'mouth';
    m.banana = showing ? 'high' : 'mouth';
    m.bites = BITE_TIMES.filter((b) => t >= b).length;
    m.chewing = !showing && Math.sin(t * 34) > 0;
    if (m.bites >= BITE_TIMES.length) m.banana = 'none';
    return m;
  }
  m.phase = 'finale';
  m.left = m.right = 'up';
  m.bites = BITE_TIMES.length;
  const since = t - EAT_END;
  if (final && since < FLIP_SECONDS) {
    const k = since / FLIP_SECONDS;
    m.spin = -facing * k * Math.PI * 2;
    m.lift = Math.sin(k * Math.PI) * 24;
  } else {
    m.lift = Math.abs(Math.sin(since * 9)) * 5;
  }
  return m;
}
