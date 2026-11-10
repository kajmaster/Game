// Automated playtest: loads the game in a phone-sized browser, checks for script errors,
// then lets a bot play several runs at accelerated speed to prove the levels are always beatable.
const path = require('path');
const { chromium } = require('playwright');
const serve = require('./serve');

(async () => {
  const shots = process.env.SHOTS || '';
  const srv = await serve(path.join(__dirname, '..', 'www'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: shots ? 2 : 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${srv.port}/`);
  await page.waitForTimeout(600);
  if (await page.locator('#daily').isVisible()) await page.click('#dailyBtn');
  if (shots) await page.screenshot({ path: path.join(shots, '1-home.png') });
  await page.click('#playBtn');

  const runs = await page.evaluate(async (wantShots) => {
    const L = window.__loopstar, G = L.G;
    G.manual = true;
    const marks = [];
    function willHit() {
      const c = G.comet;
      let x = c.x, y = c.y, vx = -Math.sin(c.ang) * c.dir * L.FLY_SPEED, vy = Math.cos(c.ang) * c.dir * L.FLY_SPEED;
      const dt = 1 / 120;
      for (let t = 0; t < L.BURN_TIME * 0.92; t += dt) {
        x += vx * dt; y += vy * dt;
        if (x < 7) { x = 7; vx = Math.abs(vx); } else if (x > L.W - 7) { x = L.W - 7; vx = -Math.abs(vx); }
        if (y > G.voidY - 20) return false;
        for (const m of G.mines) if (Math.hypot(x - m.x, y - m.y) < m.r + 12) return false;
        for (const p of G.planets) {
          if (p.om && Math.hypot(x - p.x, y - p.y) < p.R + 46 && Math.hypot(x - p.x, y - p.y) > p.R + 14) {
            const a = (G.t + t) * p.om.sp + p.om.ph;
            if (Math.hypot(x - p.x - Math.cos(a) * (p.R + 30), y - p.y - Math.sin(a) * (p.R + 30)) < 24) return false;
          }
          if (p.i <= c.p.i) continue;
          const px = p.move ? p.x0 + Math.sin((G.t + t) * p.move.f + p.move.ph) * p.move.a : p.x;
          if (Math.hypot(x - px, y - p.y) < p.R * 0.85) return true;
        }
      }
      return false;
    }
    const out = [];
    for (let run = 0; run < 6; run++) {
      let frames = 0;
      while (G.mode !== 'over' && frames < 60 * 60 * 8) {
        L.update(1 / 60); frames++;
        if (G.mode === 'play' && G.comet.mode === 'orbit' && willHit()) L.tap();
        if (wantShots && run === 0 && (G.maxI === 4 || G.maxI === 27) && G.comet.mode === 'fly' && !marks.includes(G.maxI)) {
          marks.push(G.maxI); L.render(); await new Promise((r) => setTimeout(r, 700));
        }
        if (G.maxI >= 400) break;
      }
      out.push({ score: G.score, planets: G.maxI, seconds: Math.round(frames / 60), streak: G.bestStreak, gems: G.runGems });
      if (G.mode !== 'over') { G.revived = true; G.comet.shield = false; document.querySelector('#quitBtn').click(); while (G.mode !== 'over') L.update(1 / 60); }
      if (run < 5) document.querySelector('#againBtn').click();
    }
    G.manual = false;
    return out;
  }, !!shots).catch((e) => { errors.push(String(e)); return []; });

  console.table(runs);
  if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(shots, '4-over.png') }); }
  const save = await page.evaluate(() => window.__loopstar.S());
  console.log('save:', JSON.stringify({ best: save.best, gems: save.gems, runs: save.runs, missions: save.missions }));
  await browser.close(); srv.close();
  const reached = runs.filter((r) => r.planets >= 60).length;
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  if (reached < 4) { console.error(`Bot only passed 60 planets in ${reached}/6 runs - level generation may be unfair.`); process.exit(1); }
  console.log('OK: no script errors, bot passed 60 planets in ' + reached + '/6 runs');
})();
