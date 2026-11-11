// Plays the built game in headless Chrome and saves screenshots to docs/screenshots.
// Usage: npm run build && npm run evidence   (needs Google Chrome installed)
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import assert from 'node:assert/strict';

const OUT = 'docs/screenshots';
const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'silent' });
const base = 'http://localhost:4179/';
const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];
const log = (msg) => console.log(`ok  ${msg}`);

async function open(viewport, query, extra = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, ...extra });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.goto(`${base}?debug=1&${query}`);
  await page.waitForFunction(() => window.__banana);
  return page;
}
const state = (page) =>
  page.evaluate(() => {
    const s = window.__banana.state();
    return { phase: s.phase, current: s.current, scores: s.scores, round: s.round, craters: s.world.craters.length };
  });
const setAim = (page, angle, power) =>
  page.evaluate(
    ([a, p]) => {
      for (const [id, v] of [['angle', a], ['power', p]]) {
        const el = document.getElementById(id);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    [angle, power],
  );
const settled = (page) => page.waitForFunction(() => window.__banana.state().phase !== 'flying', null, { timeout: 30000 });
const humanTurn = (page) =>
  page.waitForFunction(
    () => {
      const s = window.__banana.state();
      return (s.phase === 'aiming' && s.current === 0) || s.phase === 'matchOver';
    },
    null,
    { timeout: 60000 },
  );

// ---- 1. Desktop, first run: instant play, hint, keyboard throw --------------------
{
  const page = await open({ width: 1280, height: 800 }, 'seed=7');
  assert.equal((await state(page)).phase, 'aiming');
  assert.ok(await page.isVisible('#hint'), 'first-run hint is shown');
  await page.screenshot({ path: `${OUT}/desktop-start.png` });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');
  assert.equal(await page.inputValue('#angle'), '46');
  assert.equal(await page.inputValue('#power'), '55');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).phase, 'flying');
  assert.ok(await page.isHidden('#hint'), 'hint disappears when play begins');
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/desktop-flight.png` });
  await settled(page);
  log('desktop: instant play, hint, keyboard aim and throw');

  // computer takes its turn without any network and hands control back
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await humanTurn(page);
  assert.equal(requests.length, 0, 'no network calls during play');
  log('solo: computer took a turn, no network requests');

  // difficulty is offered in the New game dialog and defaults to Normal
  await page.click('#menuBtn');
  assert.equal(await page.inputValue('#difficulty'), 'normal');
  await page.selectOption('#difficulty', 'hard');
  await page.screenshot({ path: `${OUT}/desktop-new-game.png` });
  await page.click('#startBtn');
  await page.waitForFunction(() => /hard/.test(document.getElementById('last').textContent), null, { timeout: 2000 });

  // keep missing on purpose until the computer wins a round
  for (let i = 0; i < 14 && (await state(page)).scores[1] === 0; i++) {
    await setAim(page, 45, 100);
    await page.click('#throw');
    await settled(page);
    await humanTurn(page);
  }
  assert.ok((await state(page)).scores[1] >= 1, 'computer can hit');
  log('solo: computer eventually scores');
  await page.context().close();
}

// ---- 2. Two players: a whole match through the real UI, then rematch --------------
{
  const page = await open({ width: 1280, height: 800 }, 'seed=21');
  await page.click('#menuBtn');
  await page.check('input[name=mode][value=duo]');
  await page.selectOption('#target', '3');
  await page.click('#startBtn');
  let shotHit = false;
  for (let turn = 0; turn < 60; turn++) {
    const s = await state(page);
    if (s.phase === 'matchOver') break;
    if (s.phase === 'roundOver') {
      await page.waitForFunction(() => window.__banana.state().phase === 'aiming', null, { timeout: 10000 });
      continue;
    }
    // player 1 plays well, player 2 lobs short shots into the buildings
    const good = await page.evaluate((p) => window.__banana.solve(p), s.current);
    const [angle, power] = s.current === 0 ? [good.angle, good.power] : [30, 22];
    await setAim(page, angle, power);
    await page.click('#throw');
    assert.ok(await page.isDisabled('#throw'), 'cannot throw twice while a banana is flying');
    await settled(page);
    const after = await state(page);
    if (after.phase === 'aiming') assert.notEqual(after.current, s.current, 'turn passes after a miss');
    if (after.scores[0] > s.scores[0] && !shotHit) {
      shotHit = true;
      await page.waitForTimeout(160);
      await page.screenshot({ path: `${OUT}/desktop-hit.png` });
      // the winner's celebration: chest-pound, dance, banana snack
      const canvasShot = async (name) => (await page.$('#game')).screenshot({ path: `${OUT}/${name}.png` });
      await page.waitForTimeout(700);
      await canvasShot('celebrate-1-pound');
      await page.waitForTimeout(900);
      await canvasShot('celebrate-2-dance');
      await page.waitForTimeout(750);
      await canvasShot('celebrate-3-eat');
      assert.equal(await page.textContent('#throw'), 'Next round');
      await page.click('#throw'); // skipping the celebration starts the next round at once
      await page.waitForFunction(() => window.__banana.state().phase === 'aiming', null, { timeout: 1000 });
      assert.equal((await state(page)).round, 2);
    }
    if (after.phase === 'matchOver') {
      await page.waitForTimeout(3950);
      await (await page.$('#game')).screenshot({ path: `${OUT}/celebrate-4-backflip.png` });
    }
  }
  const end = await state(page);
  assert.equal(end.phase, 'matchOver');
  assert.equal(end.scores[0], 3);
  await page.waitForSelector('#over[open]');
  await page.screenshot({ path: `${OUT}/desktop-match-over.png` });
  await page.click('#rematchBtn');
  await page.waitForFunction(() => window.__banana.state().phase === 'aiming');
  const fresh = await state(page);
  assert.deepEqual([fresh.phase, fresh.scores, fresh.round, fresh.craters], ['aiming', [0, 0], 1, 0]);
  assert.equal(await page.textContent('#score0'), '0');
  log(`two players: full match to 3 in ${end.round} rounds, rematch starts 0–0`);

  // retro mode + live resize
  await page.keyboard.press('r');
  await page.screenshot({ path: `${OUT}/desktop-retro.png` });
  for (const size of [{ width: 700, height: 500 }, { width: 1600, height: 600 }, { width: 420, height: 900 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    const fits = await page.evaluate(() => {
      const c = document.getElementById('game').getBoundingClientRect();
      const s = document.getElementById('stage').getBoundingClientRect();
      const t = document.getElementById('throw').getBoundingClientRect();
      return c.width > 150 && c.left >= s.left && c.right <= s.right + 1 && c.bottom <= s.bottom + 1 && t.bottom <= innerHeight;
    });
    assert.ok(fits, `layout fits at ${size.width}x${size.height}`);
  }
  log('retro mode toggles; canvas and controls fit after resizing');
  await page.context().close();
}

// ---- 3. Phone: touch controls ------------------------------------------------------
{
  const phone = { hasTouch: true, isMobile: true };
  const page = await open({ width: 390, height: 844 }, 'seed=12', phone);
  await page.screenshot({ path: `${OUT}/mobile-start.png` });
  await page.tap('#angleUp');
  await page.tap('#powerUp');
  await page.tap('#powerUp');
  assert.equal(await page.inputValue('#angle'), '46');
  assert.equal(await page.inputValue('#power'), '52');
  const small = await page.$$eval('button', (els) =>
    els.filter((b) => b.offsetParent && (b.offsetHeight < 44 || b.offsetWidth < 44)).map((b) => b.id),
  );
  assert.deepEqual(small, [], 'touch targets are at least 44px');
  await setAim(page, 62, 44);
  await page.tap('#throw');
  assert.equal((await state(page)).phase, 'flying');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/mobile-flight.png` });
  await settled(page);
  await humanTurn(page);
  await page.tap('#retroBtn');
  await page.screenshot({ path: `${OUT}/mobile-retro.png` });
  log('phone: touch aim and throw, 44px targets');
  await page.context().close();

  const wide = await open({ width: 844, height: 390 }, 'seed=12', phone);
  await wide.screenshot({ path: `${OUT}/mobile-landscape.png` });
  await setAim(wide, 50, 50);
  await wide.tap('#throw');
  assert.equal((await state(wide)).phase, 'flying', 'throw works in phone landscape');
  await wide.context().close();
}

await browser.close();
await new Promise((r) => server.httpServer.close(r));
assert.deepEqual(problems, [], 'no console or page errors');
log('no console errors');
console.log(`\nScreenshots written to ${OUT}/`);
