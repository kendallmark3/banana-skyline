import { describe, expect, it } from 'vitest';
import { BITE_TIMES, CELEBRATION_SECONDS, EAT_END, celebration } from '../src/celebrate';

const times = Array.from({ length: 500 }, (_, i) => i * 0.01);

describe("winner's celebration", () => {
  it('runs pound, dance, eat, finale in order and never goes backwards', () => {
    const order = ['pound', 'dance', 'eat', 'finale'];
    let stage = 0;
    for (const t of times) {
      const i = order.indexOf(celebration(t, false, 1).phase);
      expect(i).toBeGreaterThanOrEqual(stage);
      stage = i;
    }
    expect(stage).toBe(3);
    expect(celebration(-0.2, false, 1).phase).toBe('ready');
  });

  it('eats the banana in three bites, then it is gone', () => {
    let bites = 0;
    for (const t of times) {
      const m = celebration(t, false, 1);
      expect(m.bites).toBeGreaterThanOrEqual(bites);
      bites = m.bites;
      if (m.banana !== 'none') expect(m.bites).toBeLessThan(3);
    }
    expect(bites).toBe(BITE_TIMES.length);
    expect(celebration(BITE_TIMES[0] + 0.01, false, 1).banana).toBe('mouth');
  });

  it('eats with the hand facing the opponent', () => {
    const t = BITE_TIMES[0];
    expect(celebration(t, false, 1).right).toBe('mouth');
    expect(celebration(t, false, -1).left).toBe('mouth');
  });

  it('backflips only for a match win, and lands upright before the game moves on', () => {
    for (const t of times) expect(celebration(t, false, 1).spin).toBe(0);
    expect(Math.abs(celebration(EAT_END + 0.3, true, 1).spin)).toBeGreaterThan(1);
    expect(celebration(CELEBRATION_SECONDS.match, true, 1).spin).toBe(0);
    expect(celebration(CELEBRATION_SECONDS.match, true, 1).left).toBe('up');
  });

  it('stays close to the rooftop and finite throughout', () => {
    for (const final of [false, true]) {
      for (const t of times) {
        const m = celebration(t, final, -1);
        expect(Math.abs(m.dx)).toBeLessThanOrEqual(6);
        expect(m.lift).toBeGreaterThanOrEqual(0);
        expect(m.lift).toBeLessThanOrEqual(25);
      }
    }
  });

  it('is a single still pose when motion is reduced', () => {
    const still = celebration(0.3, true, 1, true);
    for (const t of times) expect(celebration(t, true, 1, true)).toEqual(still);
    expect([still.dx, still.lift, still.spin]).toEqual([0, 0, 0]);
  });
});
