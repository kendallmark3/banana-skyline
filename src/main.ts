import './style.css';
import { Sfx } from './audio';
import { BITE_TIMES, CELEBRATION_SECONDS, EAT_END, POUND_END, THUMP_TIMES } from './celebrate';
import { Pose, Renderer } from './render';
import { DIFFICULTY, Difficulty, chooseAiShot, solveShot } from './sim/ai';
import { Dims, MatchState, createMatch, nextRound, resolveFlight, throwBanana } from './sim/match';
import { DT, ShotResult, samplePath } from './sim/physics';
import { Rng, mixSeed, mulberry32 } from './sim/rng';
import { PlayerId } from './sim/world';

/** UI glue: owns timing, input and the DOM. Game rules live in ./sim. */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const store = {
  get(key: string, fallback: string): string {
    try {
      return localStorage.getItem(`banana.${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(`banana.${key}`, value);
    } catch {
      /* private mode etc. — settings just won't persist */
    }
  },
};

const canvas = $<HTMLCanvasElement>('game');
const stage = $('stage');
const angleEl = $<HTMLInputElement>('angle');
const powerEl = $<HTMLInputElement>('power');
const throwBtn = $<HTMLButtonElement>('throw');
const menuDlg = $<HTMLDialogElement>('menu');
const overDlg = $<HTMLDialogElement>('over');
const aboutDlg = $<HTMLDialogElement>('about');
const hint = $('hint');
const banner = $('banner');

const renderer = new Renderer(canvas);
const sfx = new Sfx();
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => motionQuery.matches || params.get('motion') === 'reduce';

type Mode = 'solo' | 'duo';
let mode: Mode = store.get('mode', 'solo') === 'duo' ? 'duo' : 'solo';
let target = Number(store.get('target', '3')) || 3;
const asDifficulty = (v: string): Difficulty => (v in DIFFICULTY ? (v as Difficulty) : 'normal');
let difficulty = asDifficulty(store.get('difficulty', 'normal'));
let retro = store.get('retro', '0') === '1';
sfx.muted = store.get('muted', '0') === '1';

let match: MatchState;
let aiRng: Rng;
let aiAttempts = 0;
let flight: { result: ShotResult; t0: number } | null = null;
let trace: Float32Array | null = null;
let throwPoseUntil = 0;
// When the winner's celebration starts (a beat after the explosion), and whether confetti has fired.
let celebrateAt = 0;
let confettiDone = false;
const CELEBRATE_DELAY = 0.55;
// Deadlines (ms, performance.now clock) checked by the frame loop; 0 = none.
let aiAt = 0;
let roundAt = 0;
let overAt = 0;
let seedFromUrl: number | null = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;

const names = (): [string, string] => (mode === 'solo' ? ['You', 'Computer'] : ['Player 1', 'Player 2']);
const isAiTurn = () => mode === 'solo' && match.current === 1;
const canAct = () => match.phase === 'aiming' && !isAiTurn();
const anyDialogOpen = () => menuDlg.open || overDlg.open || aboutDlg.open;

/** Wide screens get a 16:9 city; tall phones get a taller, narrower one. */
function dims(): Dims {
  const r = stage.getBoundingClientRect();
  return r.width / Math.max(1, r.height) > 1.15 ? { width: 800, height: 450 } : { width: 480, height: 620 };
}

function fitCanvas(): void {
  const r = stage.getBoundingClientRect();
  const { width, height } = match.world;
  const k = Math.max(0.1, Math.min((r.width - 8) / width, (r.height - 8) / height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${Math.floor(width * k)}px`;
  canvas.style.height = `${Math.floor(height * k)}px`;
  const w = Math.floor(width * k * dpr);
  const h = Math.floor(height * k * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    renderer.repaint();
  }
}

function say(text: string): void {
  $('live').textContent = text;
}
function showBanner(text: string): void {
  banner.textContent = text;
  banner.classList.toggle('show', text !== '');
}

function newMatch(): void {
  const seed = seedFromUrl ?? (Math.random() * 2 ** 32) >>> 0;
  seedFromUrl = null; // a URL seed pins the first match only
  match = createMatch({ seed, target, dims: dims() });
  aiRng = mulberry32(mixSeed(seed, 777));
  flight = null;
  trace = null;
  aiAt = roundAt = overAt = 0;
  showBanner('');
  startRound();
}

function startRound(): void {
  aiAttempts = 0;
  trace = null;
  renderer.setWorld(match.world, retro);
  fitCanvas();
  beginTurn();
}

function beginTurn(): void {
  const last = match.lastShots[match.current];
  setAim(last?.angle ?? 45, last?.power ?? 50);
  aiAt = isAiTurn() ? performance.now() + 1100 : 0;
  syncUI();
}

function setAim(angle: number, power: number): void {
  angleEl.value = String(angle);
  powerEl.value = String(power);
  $('angleOut').textContent = `${angleEl.value}°`;
  $('powerOut').textContent = powerEl.value;
}

function nudge(el: HTMLInputElement, by: number): void {
  if (!canAct()) return;
  const before = el.value;
  el.value = String(Number(el.value) + by);
  setAim(Number(angleEl.value), Number(powerEl.value));
  if (el.value !== before) sfx.tick();
}

function dismissHint(): void {
  if (hint.hidden) return;
  hint.hidden = true;
  store.set('hinted', '1');
}

function launch(angle: number, power: number): void {
  if (match.phase !== 'aiming') return;
  dismissHint();
  showBanner('');
  const result = throwBanana(match, angle, power);
  flight = { result, t0: performance.now() };
  throwPoseUntil = flight.t0 + 350;
  sfx.throw();
  syncUI();
}

function onThrowPressed(): void {
  sfx.unlock();
  if (match.phase === 'matchOver') return newMatch();
  if (match.phase === 'roundOver') {
    roundAt = performance.now(); // skip the rest of the celebration
    return;
  }
  if (canAct()) launch(Number(angleEl.value), Number(powerEl.value));
}

function finishFlight(now: number): void {
  const thrower = match.current;
  const result = resolveFlight(match);
  flight = null;
  trace = result.path;
  const who = names();
  const { outcome, impact } = result;
  if (outcome.kind === 'gorilla') {
    const scorer: PlayerId = outcome.victim === 0 ? 1 : 0;
    renderer.explode(impact.x, impact.y, true, reduced());
    sfx.boom();
    const selfHit = outcome.victim === thrower;
    const verb = mode === 'solo' && scorer === 0 ? 'score' : 'scores';
    const line = selfHit ? `Oops! ${who[scorer]} ${verb}` : `${who[scorer]} ${verb}!`;
    showBanner(line);
    say(`${line} ${who[0]} ${match.scores[0]}, ${who[1]} ${match.scores[1]}.`);
    const final = match.phase === 'matchOver';
    celebrateAt = now + CELEBRATE_DELAY * 1000;
    confettiDone = false;
    if (!reduced()) {
      for (const t of THUMP_TIMES) sfx.thump(CELEBRATE_DELAY + t);
      for (const t of BITE_TIMES) sfx.chomp(CELEBRATE_DELAY + t);
      if (final) sfx.whee(CELEBRATE_DELAY + EAT_END);
    }
    sfx.win(final, CELEBRATE_DELAY + POUND_END);
    const wait = (CELEBRATE_DELAY + (final ? CELEBRATION_SECONDS.match : CELEBRATION_SECONDS.round)) * 1000;
    if (final) overAt = now + wait;
    else roundAt = now + wait;
  } else {
    if (outcome.kind === 'building') {
      renderer.explode(impact.x, impact.y, false, reduced());
      sfx.thud();
      say(`${who[thrower]} hit a building.`);
    } else {
      sfx.miss();
      say(`${who[thrower]} missed.`);
    }
    beginTurn();
  }
  syncUI();
}

function showMatchOver(): void {
  const who = names();
  const w = match.winner!;
  $('overTitle').textContent = mode === 'solo' ? (w === 0 ? 'You win!' : 'Computer wins') : `${who[w]} wins!`;
  $('overText').textContent = `Final score ${match.scores[0]} – ${match.scores[1]} after ${match.round} round${match.round > 1 ? 's' : ''}.`;
  showBanner('');
  if (!anyDialogOpen()) {
    overDlg.returnValue = '';
    overDlg.showModal();
    $('rematchBtn').focus();
  }
}

function syncUI(): void {
  const who = names();
  for (const i of [0, 1] as const) {
    $(`name${i}`).textContent = who[i];
    $(`score${i}`).textContent = String(match.scores[i]);
    $(`score${i}`).setAttribute('aria-label', `${who[i]} score`);
    $(`card${i}`).classList.toggle('active', match.current === i && match.phase !== 'matchOver');
  }
  const wind = match.world.wind;
  const gusts = wind === 0 ? '' : (wind > 0 ? '›' : '‹').repeat(Math.ceil(Math.abs(wind) / 3.4));
  $('windText').textContent = wind === 0 ? 'calm' : wind > 0 ? `${wind} ${gusts}` : `${gusts} ${-wind}`;
  $('wind').setAttribute('aria-label', wind === 0 ? 'Wind calm' : `Wind ${Math.abs(wind)} blowing ${wind > 0 ? 'right' : 'left'}`);

  const turn = $('turn');
  turn.className = `turn p${match.current}`;
  const mine = mode === 'solo' && match.current === 0;
  if (match.phase === 'matchOver') turn.textContent = 'Match over';
  else if (match.phase === 'roundOver') turn.textContent = 'Point scored!';
  else if (match.phase === 'flying') turn.textContent = 'Banana away…';
  else if (isAiTurn()) turn.textContent = 'Computer is aiming…';
  else turn.textContent = mine ? 'Your throw' : `${who[match.current]}'s throw`;

  const last = match.lastShots[match.current];
  $('last').textContent =
    match.phase === 'matchOver' ? '' : last ? `Last: ${last.angle}° · power ${last.power}` : `Round ${match.round} · first to ${match.target}${mode === 'solo' ? ` · ${difficulty}` : ''}`;

  const locked = !canAct();
  for (const id of ['angle', 'power', 'angleDown', 'angleUp', 'powerDown', 'powerUp']) {
    $<HTMLInputElement>(id).disabled = locked;
  }
  throwBtn.disabled = locked && match.phase !== 'matchOver' && match.phase !== 'roundOver';
  throwBtn.textContent = match.phase === 'matchOver' ? 'Rematch' : match.phase === 'roundOver' ? 'Next round' : 'Throw';
  $('soundBtn').setAttribute('aria-pressed', String(!sfx.muted));
  $('retroBtn').setAttribute('aria-pressed', String(retro));
  document.body.classList.toggle('retro', retro);
}

function poses(now: number): [Pose, Pose] {
  const out: [Pose, Pose] = ['idle', 'idle'];
  if (match.phase === 'roundOver' || match.phase === 'matchOver') {
    const victim = match.victim!;
    out[victim] = 'dazed';
    out[victim === 0 ? 1 : 0] = 'cheer';
  } else if (flight && now < throwPoseUntil) {
    out[flight.result.input.player] = 'throw';
  }
  return out;
}

let lastFrame = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  // Advance the game by wall-clock deadlines, so a slow or paused tab can
  // delay a step but never skip or strand one.
  let banana: { x: number; y: number } | null = null;
  let trail: { path: Float32Array; upto: number } | null = null;
  if (flight) {
    const t = (now - flight.t0) / 1000;
    if (t >= flight.result.duration) {
      finishFlight(now);
    } else {
      banana = samplePath(flight.result, t);
      trail = { path: flight.result.path, upto: Math.floor(t / DT) };
    }
  } else if (aiAt && now >= aiAt && match.phase === 'aiming' && isAiTurn()) {
    aiAt = 0;
    const shot = chooseAiShot(match.world, 1, aiAttempts++, aiRng, difficulty);
    setAim(shot.angle, shot.power);
    launch(shot.angle, shot.power);
  } else if (roundAt && now >= roundAt && match.phase === 'roundOver') {
    roundAt = 0;
    nextRound(match, dims());
    showBanner(`Round ${match.round}`);
    say(`Round ${match.round}. ${names()[match.current]} to throw.`);
    startRound();
  } else if (overAt && now >= overAt && match.phase === 'matchOver') {
    overAt = 0;
    showMatchOver();
  }

  const celebrating = match.phase === 'roundOver' || match.phase === 'matchOver';
  const celebrate = celebrating ? { t: (now - celebrateAt) / 1000, final: match.phase === 'matchOver' } : null;
  if (celebrate && !confettiDone && celebrate.t >= EAT_END && !reduced()) {
    confettiDone = true;
    const champ = match.world.gorillas[match.victim === 0 ? 1 : 0];
    renderer.confetti(champ.x, champ.y - 30);
  }
  const last = match.lastShots[match.current];
  renderer.draw({
    world: match.world,
    time: now / 1000,
    dt,
    banana,
    trail,
    trace,
    aim: canAct()
      ? { player: match.current, angle: Number(angleEl.value), power: Number(powerEl.value), prevAngle: last?.angle ?? null }
      : null,
    poses: poses(now),
    celebrate,
    reduced: reduced(),
  });
  requestAnimationFrame(frame);
}

// ---------- input ----------
for (const el of [angleEl, powerEl]) {
  el.addEventListener('input', () => setAim(Number(angleEl.value), Number(powerEl.value)));
}
$('angleDown').addEventListener('click', () => nudge(angleEl, -1));
$('angleUp').addEventListener('click', () => nudge(angleEl, 1));
$('powerDown').addEventListener('click', () => nudge(powerEl, -1));
$('powerUp').addEventListener('click', () => nudge(powerEl, 1));
throwBtn.addEventListener('click', onThrowPressed);

function toggleSound(): void {
  sfx.muted = !sfx.muted;
  store.set('muted', sfx.muted ? '1' : '0');
  sfx.unlock();
  sfx.tick();
  syncUI();
}
function toggleRetro(): void {
  retro = !retro;
  store.set('retro', retro ? '1' : '0');
  renderer.setWorld(match.world, retro);
  syncUI();
}
$('soundBtn').addEventListener('click', toggleSound);
$('retroBtn').addEventListener('click', toggleRetro);
$('aboutBtn').addEventListener('click', () => aboutDlg.showModal());

function openMenu(): void {
  menuDlg.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) => (r.checked = r.value === mode));
  $<HTMLSelectElement>('target').value = String(target);
  $<HTMLSelectElement>('difficulty').value = difficulty;
  menuDlg.returnValue = '';
  menuDlg.showModal();
}
$('menuBtn').addEventListener('click', openMenu);
menuDlg.addEventListener('close', () => {
  if (menuDlg.returnValue !== 'start') {
    if (match.phase === 'matchOver') syncUI(); // Throw button doubles as Rematch
    return;
  }
  mode = menuDlg.querySelector<HTMLInputElement>('input[name=mode]:checked')?.value === 'duo' ? 'duo' : 'solo';
  target = Number($<HTMLSelectElement>('target').value) || 3;
  store.set('mode', mode);
  store.set('target', String(target));
  difficulty = asDifficulty($<HTMLSelectElement>('difficulty').value);
  store.set('difficulty', difficulty);
  sfx.unlock();
  newMatch();
});
overDlg.addEventListener('close', () => {
  if (overDlg.returnValue === 'rematch') {
    sfx.unlock();
    newMatch();
  } else if (overDlg.returnValue === 'menu') {
    openMenu();
  }
});

addEventListener('keydown', (e) => {
  if (anyDialogOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = document.activeElement;
  const onSlider = el instanceof HTMLInputElement && el.type === 'range';
  const onButton = el instanceof HTMLButtonElement || el instanceof HTMLSelectElement;
  const step = e.shiftKey ? 5 : 1;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
    if (onSlider) return; // the focused slider handles its own arrows
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    nudge(horizontal ? angleEl : powerEl, key === 'ArrowRight' || key === 'ArrowUp' ? step : -step);
    e.preventDefault();
  } else if (key === ' ' || key === 'Enter') {
    if (onButton) return; // let the focused button do its own thing
    e.preventDefault();
    onThrowPressed();
  } else if (key === 'm') toggleSound();
  else if (key === 'r') toggleRetro();
});

new ResizeObserver(() => match && fitCanvas()).observe(stage);

// ---------- go ----------
newMatch();
if (store.get('hinted', '0') !== '1') {
  hint.hidden = false;
  setTimeout(dismissHint, 15000);
}
if (params.has('debug')) {
  // Handle for the evidence script (scripts/capture.mjs); not used by the game.
  Object.assign(window, { __banana: { state: () => match, solve: (p: PlayerId) => solveShot(match.world, p) } });
}
requestAnimationFrame(frame);
