import { mixSeed } from './rng';
import { ShotResult, simulateShot } from './physics';
import { BLAST_RADIUS, CRATER_RADIUS, PlayerId, World, generateWorld } from './world';

/**
 * Match rules: turns, scoring, rounds. Pure state transitions, no timing —
 * the UI decides when to call each step.
 *
 *   aiming --throwBanana--> flying --resolveFlight--> aiming (miss, other player)
 *                                                 \-> roundOver --nextRound--> aiming
 *                                                 \-> matchOver --(createMatch)--> …
 */
export type Phase = 'aiming' | 'flying' | 'roundOver' | 'matchOver';
export interface Dims {
  width: number;
  height: number;
}
export interface MatchState {
  seed: number;
  target: number;
  round: number;
  scores: [number, number];
  current: PlayerId;
  phase: Phase;
  world: World;
  flight: ShotResult | null;
  /** Each player's previous angle/power, kept for the whole match. */
  lastShots: [{ angle: number; power: number } | null, { angle: number; power: number } | null];
  /** Who was hit by the shot that ended the round. */
  victim: PlayerId | null;
  winner: PlayerId | null;
}

const DEFAULT_DIMS: Dims = { width: 800, height: 450 };
const roundWorld = (seed: number, round: number, d: Dims) =>
  generateWorld(mixSeed(seed, round), d.width, d.height);

export function createMatch(opts: { seed: number; target?: number; dims?: Dims }): MatchState {
  return {
    seed: opts.seed >>> 0,
    target: Math.max(1, opts.target ?? 3),
    round: 1,
    scores: [0, 0],
    current: 0,
    phase: 'aiming',
    world: roundWorld(opts.seed >>> 0, 1, opts.dims ?? DEFAULT_DIMS),
    flight: null,
    lastShots: [null, null],
    victim: null,
    winner: null,
  };
}

export function throwBanana(state: MatchState, angle: number, power: number): ShotResult {
  if (state.phase !== 'aiming') throw new Error(`cannot throw while ${state.phase}`);
  const result = simulateShot(state.world, { player: state.current, angle, power });
  state.flight = result;
  state.phase = 'flying';
  state.lastShots[state.current] = { angle: result.input.angle, power: result.input.power };
  return result;
}

export function resolveFlight(state: MatchState): ShotResult {
  if (state.phase !== 'flying' || !state.flight) throw new Error('no banana in flight');
  const result = state.flight;
  const { outcome, impact } = result;
  state.flight = null;
  if (outcome.kind === 'gorilla') {
    state.world.craters.push({ ...impact, r: BLAST_RADIUS });
    const scorer: PlayerId = outcome.victim === 0 ? 1 : 0;
    state.scores[scorer]++;
    state.victim = outcome.victim;
    if (state.scores[scorer] >= state.target) {
      state.winner = scorer;
      state.phase = 'matchOver';
    } else {
      state.phase = 'roundOver';
    }
    return result;
  }
  if (outcome.kind === 'building') state.world.craters.push({ ...impact, r: CRATER_RADIUS });
  state.current = state.current === 0 ? 1 : 0;
  state.phase = 'aiming';
  return result;
}

export function nextRound(state: MatchState, dims?: Dims): void {
  if (state.phase !== 'roundOver') throw new Error(`cannot start a round while ${state.phase}`);
  state.round++;
  state.world = roundWorld(state.seed, state.round, dims ?? state.world);
  state.current = ((state.round - 1) % 2) as PlayerId;
  state.victim = null;
  state.phase = 'aiming';
}
