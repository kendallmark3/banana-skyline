import { Arm, celebration } from './celebrate';
import { mixSeed, mulberry32 } from './sim/rng';
import { Gorilla, PlayerId, World, bananaStart } from './sim/world';

/**
 * Canvas renderer. Reads the world, never changes it. Everything is drawn
 * procedurally in world units and scaled to the canvas, so there are no
 * image assets.
 */
export type Pose = 'idle' | 'throw' | 'cheer' | 'dazed';
export interface Scene {
  world: World;
  time: number; // seconds, for idle animation
  dt: number;
  banana: { x: number; y: number } | null;
  /** Path of the banana currently flying, drawn up to point index `upto`. */
  trail: { path: Float32Array; upto: number } | null;
  /** Path of the previous throw, shown as faint dots to aim against. */
  trace: Float32Array | null;
  aim: { player: PlayerId; angle: number; power: number; prevAngle: number | null } | null;
  poses: [Pose, Pose];
  /** Seconds into the winner's celebration, and whether it won the match. */
  celebrate: { t: number; final: boolean } | null;
  reduced: boolean;
}

interface Theme {
  retro: boolean;
  sky: string[];
  far: string[];
  buildings: string[];
  lit: string;
  unlit: string;
  orb: string;
  glow: string;
  stars: number;
}
const MODERN: Theme[] = [
  {
    retro: false,
    sky: ['#2b1055', '#6d2a7c', '#c94b6d', '#f58f5a', '#ffd38a'],
    far: ['#8f4477', '#5e2c66'],
    buildings: ['#2a1a40', '#33204d', '#261a3a', '#3a2350'],
    lit: '#ffd27a',
    unlit: '#1a1030',
    orb: '#fff1c2',
    glow: 'rgba(255, 220, 150, 0.35)',
    stars: 14,
  },
  {
    retro: false,
    sky: ['#0f1b4d', '#3a2f7a', '#8a4a9a', '#e07a9a', '#ffb59a'],
    far: ['#5f4f92', '#3a3270'],
    buildings: ['#161a3d', '#1d2148', '#141736', '#222655'],
    lit: '#ffe29a',
    unlit: '#0d1030',
    orb: '#ffe6cf',
    glow: 'rgba(255, 190, 170, 0.3)',
    stars: 30,
  },
  {
    retro: false,
    sky: ['#050816', '#0b1230', '#141e4a', '#22306a'],
    far: ['#16204a', '#0f1738'],
    buildings: ['#0a0e22', '#0e1330', '#0c1028', '#121838'],
    lit: '#ffd76a',
    unlit: '#070a1a',
    orb: '#e8eeff',
    glow: 'rgba(200, 215, 255, 0.22)',
    stars: 80,
  },
];
const RETRO: Theme = {
  retro: true,
  sky: ['#0000a8'],
  far: [],
  buildings: ['#00a8a8', '#a80000', '#a8a8a8'],
  lit: '#fcfc54',
  unlit: '#545454',
  orb: '#fcfc54',
  glow: '',
  stars: 0,
};
export const PLAYER_COLORS = ['#ff7a6b', '#3ddbc8'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}
interface Ring {
  x: number;
  y: number;
  age: number;
  dur: number;
  r: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bg = document.createElement('canvas');
  private city = document.createElement('canvas');
  private world: World | null = null;
  private theme: Theme = MODERN[0];
  private paintedCraters = -1;
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private shake = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  setWorld(world: World, retro: boolean): void {
    this.world = world;
    this.theme = retro ? RETRO : MODERN[world.seed % MODERN.length];
    this.particles = [];
    this.rings = [];
    this.shake = 0;
    const rng = mulberry32(mixSeed(world.seed, 9001));
    this.stars = Array.from({ length: this.theme.stars }, () => ({
      x: rng() * world.width,
      y: rng() * world.height * 0.55,
      r: 0.5 + rng() * 0.9,
      p: rng() * 6.28,
    }));
    this.repaint();
  }

  /** Call after the canvas backing size changes. */
  repaint(): void {
    if (!this.world) return;
    this.paintBackground();
    this.paintCity();
  }

  explode(x: number, y: number, big: boolean, reduced: boolean): void {
    this.rings.push({ x, y, age: 0, dur: big ? 0.7 : 0.4, r: big ? 44 : 22 });
    if (reduced || this.theme.retro) return;
    this.shake = big ? 9 : 3;
    const n = big ? 46 : 16;
    const colors = big ? ['#ffd23f', '#ff9a3d', '#fff3b0', '#ff5d5d'] : ['#ffd23f', '#c9b9a0', '#8d8399'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (big ? 60 : 30) + Math.random() * (big ? 220 : 110);
      const max = 0.4 + Math.random() * (big ? 0.9 : 0.5);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        life: max,
        max,
        size: 1.5 + Math.random() * 2.5,
        color: colors[i % colors.length],
      });
    }
  }

  /** Banana-yellow confetti for the winner's finale. */
  confetti(x: number, y: number): void {
    if (this.theme.retro) return;
    const colors = ['#ffd23f', '#fff3b0', PLAYER_COLORS[0], PLAYER_COLORS[1]];
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const s = 120 + Math.random() * 160;
      const max = 0.8 + Math.random() * 0.8;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, size: 2 + Math.random() * 2, color: colors[i % 4] });
    }
  }

  private scale(): number {
    return this.world ? this.canvas.width / this.world.width : 1;
  }

  private layer(c: HTMLCanvasElement): CanvasRenderingContext2D {
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    const s = this.scale();
    g.setTransform(s, 0, 0, s, 0, 0);
    return g;
  }

  private paintBackground(): void {
    const w = this.world!;
    const t = this.theme;
    const g = this.layer(this.bg);
    if (t.sky.length === 1) {
      g.fillStyle = t.sky[0];
    } else {
      const grad = g.createLinearGradient(0, 0, 0, w.height);
      t.sky.forEach((c, i) => grad.addColorStop(i / (t.sky.length - 1), c));
      g.fillStyle = grad;
    }
    g.fillRect(0, 0, w.width, w.height);
    // distant skyline silhouettes for depth
    t.far.forEach((color, layer) => {
      const rng = mulberry32(mixSeed(w.seed, 500 + layer));
      g.fillStyle = color;
      for (let x = -10; x < w.width; ) {
        const bw = 18 + rng() * 34;
        const bh = w.height * (0.3 + rng() * 0.3 - layer * 0.08);
        g.fillRect(x, w.height - bh, bw + 1, bh);
        if (rng() < 0.3) g.fillRect(x + bw / 2 - 1, w.height - bh - 8, 2, 8);
        x += bw;
      }
    });
  }

  private paintCity(): void {
    const w = this.world!;
    const t = this.theme;
    const g = this.layer(this.city);
    const gorillaXs = w.gorillas.map((p) => p.x);
    w.buildings.forEach((b, i) => {
      const rng = mulberry32(mixSeed(w.seed, i + 1));
      const top = w.height - b.h;
      g.fillStyle = t.buildings[Math.floor(rng() * t.buildings.length)];
      if (t.retro) {
        g.fillRect(b.x + 1, top, b.w - 2, b.h);
      } else {
        g.fillRect(b.x, top, b.w, b.h);
        const shade = g.createLinearGradient(b.x, 0, b.x + b.w, 0);
        shade.addColorStop(0, 'rgba(255,255,255,0.10)');
        shade.addColorStop(0.5, 'rgba(255,255,255,0)');
        shade.addColorStop(1, 'rgba(0,0,0,0.22)');
        g.fillStyle = shade;
        g.fillRect(b.x, top, b.w, b.h);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(b.x, top, b.w, 1.5);
        const occupied = gorillaXs.some((gx) => gx > b.x && gx < b.x + b.w);
        const deco = rng();
        if (!occupied && deco < 0.3) {
          g.fillStyle = 'rgba(20,16,40,0.9)';
          g.fillRect(b.x + b.w * 0.6, top - 14, 1.5, 14);
          g.fillStyle = '#ff5d5d';
          g.fillRect(b.x + b.w * 0.6 - 0.75, top - 16, 3, 3);
        } else if (!occupied && deco < 0.55) {
          g.fillStyle = 'rgba(20,16,40,0.9)';
          g.fillRect(b.x + 8, top - 9, 14, 9);
          g.fillRect(b.x + 10, top - 12, 10, 3);
        }
      }
      const winW = t.retro ? 4 : 5;
      const winH = 7;
      const cols = Math.floor((b.w - 8) / 10);
      const pad = (b.w - (cols * 10 - (10 - winW))) / 2;
      for (let y = top + 8; y < w.height - 10; y += 13) {
        for (let c = 0; c < cols; c++) {
          const lit = rng() < 0.62;
          g.fillStyle = lit ? t.lit : t.unlit;
          g.globalAlpha = t.retro || !lit ? 1 : 0.75 + rng() * 0.25;
          g.fillRect(b.x + pad + c * 10, y, winW, winH);
        }
      }
      g.globalAlpha = 1;
    });
    if (!t.retro) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(0,0,0,0.5)';
      for (const c of w.craters) {
        g.beginPath();
        g.arc(c.x, c.y, c.r + 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalCompositeOperation = 'destination-out';
    for (const c of w.craters) {
      g.beginPath();
      g.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    this.paintedCraters = w.craters.length;
  }

  draw(scene: Scene): void {
    const w = scene.world;
    if (w !== this.world) return;
    if (w.craters.length !== this.paintedCraters) this.paintCity();
    const ctx = this.ctx;
    const t = this.theme;
    const s = this.scale();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = t.sky[0];
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.shake = scene.reduced ? 0 : Math.max(0, this.shake - scene.dt * 22);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.setTransform(s, 0, 0, s, sx * s, sy * s);

    ctx.drawImage(this.bg, 0, 0, w.width, w.height);
    for (const st of this.stars) {
      const tw = scene.reduced ? 0.8 : 0.55 + 0.45 * Math.sin(scene.time * 2 + st.p);
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      ctx.fillRect(st.x, st.y, st.r, st.r);
    }
    this.drawOrb(scene);
    ctx.drawImage(this.city, 0, 0, w.width, w.height);

    if (scene.trace) this.dots(scene.trace, scene.trace.length / 2, 10, 0.3, 1.1);
    w.gorillas.forEach((g, i) => this.drawGorilla(g, i as PlayerId, scene));
    if (scene.aim) this.drawAim(scene);
    if (scene.trail) {
      const from = Math.max(0, scene.trail.upto - 60);
      for (let i = from; i < scene.trail.upto; i += 3) {
        const a = (i - from) / 60;
        ctx.fillStyle = `rgba(255, 226, 120, ${a * 0.7})`;
        const r = t.retro ? 1 : 0.8 + a * 1.6;
        ctx.fillRect(scene.trail.path[i * 2] - r, scene.trail.path[i * 2 + 1] - r, r * 2, r * 2);
      }
    }
    if (scene.banana) this.drawBanana(scene.banana, scene);
    this.drawEffects(scene);
  }

  private dots(path: Float32Array, count: number, every: number, alpha: number, r: number): void {
    this.ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = every; i < count; i += every) this.ctx.fillRect(path[i * 2] - r, path[i * 2 + 1] - r, r * 2, r * 2);
  }

  private drawOrb(scene: Scene): void {
    const ctx = this.ctx;
    const w = scene.world;
    const t = this.theme;
    const x = w.width / 2;
    const y = w.height * 0.13;
    const r = 19;
    if (t.glow) {
      const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.2);
      glow.addColorStop(0, t.glow);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    }
    ctx.fillStyle = t.orb;
    if (t.retro) {
      ctx.strokeStyle = t.orb;
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
        ctx.lineTo(x + Math.cos(a) * (r + 11), y + Math.sin(a) * (r + 11));
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // a face that notices bananas flying past
    const b = scene.banana;
    const startled = !!b && Math.hypot(b.x - x, b.y - y) < 70;
    const ink = t.retro ? '#0000a8' : 'rgba(60, 30, 60, 0.75)';
    ctx.fillStyle = ink;
    ctx.fillRect(x - 7, y - 5, 3, startled ? 4 : 3);
    ctx.fillRect(x + 4, y - 5, 3, startled ? 4 : 3);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (startled) ctx.arc(x, y + 7, 3.5, 0, Math.PI * 2);
    else ctx.arc(x, y + 2, 8, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }

  private drawGorilla(g: Gorilla, id: PlayerId, scene: Scene): void {
    const ctx = this.ctx;
    const retro = this.theme.retro;
    const pose = scene.poses[id];
    const facing = id === 0 ? 1 : -1;
    const t = scene.time;
    const fur = retro ? '#fca854' : '#5e3d2b';
    const dark = retro ? '#a85400' : '#3b2418';
    const skin = retro ? '#fcd8a8' : '#cf9668';
    const ink = '#1a0f0a';
    const rect = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    const move =
      pose === 'cheer' && scene.celebrate
        ? celebration(scene.celebrate.t, scene.celebrate.final, facing, scene.reduced)
        : null;
    let left: Arm = pose === 'throw' && facing > 0 ? 'up' : 'down';
    let right: Arm = pose === 'throw' && facing < 0 ? 'up' : 'down';
    if (move) ({ left, right } = move);

    ctx.save();
    ctx.translate(g.x + (move?.dx ?? 0), g.y - (move?.lift ?? 0));
    if (move?.spin) {
      ctx.translate(0, -16);
      ctx.rotate(move.spin);
      ctx.translate(0, 16);
    } else if (move) ctx.rotate(move.dx * 0.025);
    if (pose === 'dazed') ctx.rotate(scene.reduced ? 0.12 : 0.12 + Math.sin(t * 5) * 0.05);

    // soft outline so the gorilla reads against any sky
    if (!retro) rect(-11, -33, 22, 33, 'rgba(0,0,0,0.18)');
    rect(-9, -9, 7, 9, fur);
    rect(2, -9, 7, 9, fur);
    rect(-11, -2, 9, 2, dark);
    rect(2, -2, 9, 2, dark);
    rect(-10, -22, 20, 14, fur);
    rect(-6, -20, 12, 8, retro ? fur : '#6f4a35');

    const arm = (side: -1 | 1, a: Arm) => {
      const x = side < 0 ? -14 : 10;
      if (a === 'down') {
        rect(x, -22, 4, 14, fur);
        rect(x, -9, 4, 3, dark);
      } else if (a === 'up') {
        rect(x, -35, 4, 14, fur);
        rect(x, -37, 4, 3, dark);
      } else if (a === 'mouth') {
        rect(x, -22, 4, 5, fur);
        rect(side < 0 ? -13 : 8, -28, 5, 8, fur);
        rect(side < 0 ? -9 : 5, -28, 4, 3, dark);
      } else if (a === 'chestIn') {
        rect(x, -22, 4, 5, fur);
        rect(side < 0 ? -13 : 3, -18, 10, 4, fur);
        rect(side < 0 ? -5 : 1, -18, 4, 4, dark);
      } else {
        rect(x, -22, 4, 5, fur);
        rect(side < 0 ? -19 : 9, -20, 10, 4, fur);
        rect(side < 0 ? -21 : 17, -20, 4, 4, dark);
      }
    };
    arm(-1, left);
    arm(1, right);

    rect(-6, -32, 12, 11, fur);
    rect(-6, -33, 12, 3, PLAYER_COLORS[id]); // headband = player colour
    rect(-4, -28, 8, 6, skin);

    // eyes follow the banana, or the opponent
    const target = scene.banana ?? scene.world.gorillas[id === 0 ? 1 : 0];
    const look = Math.sign(target.x - g.x) * 0.8;
    const blink = !scene.reduced && pose === 'idle' && (t * 0.6 + id * 0.37) % 1 > 0.96;
    if (pose === 'dazed') {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1;
      for (const ex of [-2.5, 2.5]) {
        ctx.beginPath();
        ctx.moveTo(ex - 1.2, -27.5);
        ctx.lineTo(ex + 1.2, -25);
        ctx.moveTo(ex + 1.2, -27.5);
        ctx.lineTo(ex - 1.2, -25);
        ctx.stroke();
      }
      rect(-1.5, -24.5, 3, 2.5, dark);
    } else {
      const happy = pose === 'cheer';
      rect(-3.5 + look, blink ? -26 : -27, 2, blink || happy ? 1 : 2, ink);
      rect(1.5 + look, blink ? -26 : -27, 2, blink || happy ? 1 : 2, ink);
      const b = scene.banana;
      const worried = !!b && pose === 'idle' && Math.hypot(b.x - g.x, b.y - (g.y - 15)) < 90;
      if (move?.chewing) rect(-1.5, -25, 3, 2.5, ink);
      else if (happy) {
        rect(-3, -24.5, 6, 1.5, ink);
        rect(-3, -25.5, 1, 1, ink);
        rect(2, -25.5, 1, 1, ink);
      } else if (worried) rect(-1, -24.8, 2, 2.2, ink);
      else rect(-2, -24, 4, 1, ink);
    }
    if (move && move.banana !== 'none') {
      const left = (1 - move.bites / 3) * 0.9 + 0.1;
      if (move.banana === 'high') this.bananaShape(facing * 12, -39, facing * 0.5, 1);
      else this.bananaShape(facing * 7, -24, facing * 1.2, left);
    }
    ctx.restore();
  }

  private drawAim(scene: Scene): void {
    const ctx = this.ctx;
    const aim = scene.aim!;
    const start = bananaStart(scene.world.gorillas[aim.player]);
    const dir = aim.player === 0 ? 1 : -1;
    const ray = (deg: number, len: number) => {
      const r = (deg * Math.PI) / 180;
      return { x: start.x + dir * Math.cos(r) * len, y: start.y - Math.sin(r) * len };
    };
    ctx.lineCap = 'round';
    if (aim.prevAngle !== null && aim.prevAngle !== aim.angle) {
      const p = ray(aim.prevAngle, 34);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    const len = 20 + aim.power * 0.7;
    const tip = ray(aim.angle, len);
    ctx.setLineDash([5, 5]);
    for (const [color, width] of [['rgba(0,0,0,0.55)', 4], ['#ffffff', 2]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = PLAYER_COLORS[aim.player];
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    this.bananaShape(start.x, start.y, -0.4);
  }

  private bananaShape(x: number, y: number, rot: number, whole = 1): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.lineCap = 'round';
    for (const [color, width] of [['#3a2a00', 5.5], [this.theme.retro ? '#fcfc54' : '#ffd23f', 3.2]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(0, -5, 6.5, 0.15 * Math.PI, (0.15 + 0.7 * whole) * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBanana(b: { x: number; y: number }, scene: Scene): void {
    const ctx = this.ctx;
    if (b.y < -6) {
      // above the screen: show where it is
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x, 4);
      ctx.lineTo(b.x - 7, 15);
      ctx.lineTo(b.x + 7, 15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    }
    this.bananaShape(b.x, b.y, scene.reduced ? 0.4 : scene.time * 14);
  }

  private drawEffects(scene: Scene): void {
    const ctx = this.ctx;
    const retro = this.theme.retro;
    this.rings = this.rings.filter((r) => (r.age += scene.dt) < r.dur);
    for (const r of this.rings) {
      const k = r.age / r.dur;
      const radius = scene.reduced ? r.r * 0.8 : r.r * (0.25 + 0.75 * Math.sqrt(k));
      if (retro) {
        ['#fc5454', '#fcfc54', '#ffffff'].forEach((c, i) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(r.x, r.y, radius * (1 - i * 0.3), 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        const grad = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, radius);
        grad.addColorStop(0, `rgba(255,255,230,${1 - k})`);
        grad.addColorStop(0.5, `rgba(255,190,70,${0.9 * (1 - k)})`);
        grad.addColorStop(1, 'rgba(255,90,50,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.particles = this.particles.filter((p) => (p.life -= scene.dt) > 0);
    for (const p of this.particles) {
      p.vy += 320 * scene.dt;
      p.x += p.vx * scene.dt;
      p.y += p.vy * scene.dt;
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
