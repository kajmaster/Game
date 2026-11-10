// Balance and smoke test for Road to 10K (tenk/index.html).
// Bots play many runs through the engine; then one run is clicked through the real UI.
// Run: NODE_PATH=$(npm root -g) node tools/tenk-playtest.js
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load/.test(m.text())) errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../tenk/index.html'));

  const res = await page.evaluate(() => {
    const T = window.TENK;
    const bots = {
      // Sensible founder: learn, build, grow, rest when tired, hire and raise prices as revenue allows.
      smart(s) {
        const p = [];
        const add = id => { if (p.length < 3) p.push(id); };
        let e = s.energy;
        const want = id => { const c = { build: 14, fix: 9, talk: 6, content: 11, ads: 4, outreach: 13, freelance: 16 }[id]; if (e - c < 28) { add('rest'); e += 32; } else { add(id); e -= c; } };
        if (s.cash < 2500 && T.weeklyNet(s) < 0) want('freelance');
        if (s.bugs > 22) want('fix');
        if (s.product < 70) { if (s.insight < 6) want('talk'); want('build'); }
        if (s.cash > 3000 && T.weeklyNet(s) > -400 && s.product > 30) want('ads');
        want(s.cust < 12 ? 'outreach' : 'content');
        want('content');
        s.plan = p;
        for (const u of T.UPS) if (!s.ups[u.id] && s.cash > u.cost + 4000) { s.cash -= u.cost; s.ups[u.id] = true; }
        const m = T.mrr(s);
        s.team.sup = m > 2500; s.team.mkt = m > 4000; s.team.dev = m > 6000;
        const i = T.PRICES.indexOf(s.price), up = T.PRICES[i + 1];
        if (up && s.priceCd === 0 && up < T.value(s) * 0.7) T.setPrice(s, up);
      },
      // Only ever builds: should not win.
      builder(s) { s.plan = s.energy < 40 ? ['rest', 'build', 'rest'] : ['build', 'build', 'talk']; },
      // Random taps.
      random(s) { const a = ['build', 'fix', 'talk', 'content', 'ads', 'outreach', 'freelance', 'rest']; s.plan = [0, 1, 2].map(() => a[Math.floor(Math.random() * a.length)]); },
      // Tries the cheap trick: jack the price up at the end.
      gouger(s) { bots.smart(s); if (T.mrr(s) > 4000 && s.priceCd === 0) T.setPrice(s, 149); }
    };
    const out = {};
    for (const [name, bot] of Object.entries(bots)) {
      const weeks = []; let won = 0, broke = 0, sold = 0; const N = 300;
      for (let r = 0; r < N; r++) {
        const s = T.newGame();
        while (!s.over && s.week < 260) {
          if (s.event) { const ex = s.event === 'exit'; T.resolveEvent(s, ex ? 1 : Math.floor(Math.random() * 2)); continue; }
          bot(s); T.runWeek(s);
        }
        if (s.over === 'won') { won++; weeks.push(s.hist.length - 1); } else if (s.over === 'broke') broke++; else if (s.over === 'sold') sold++;
      }
      weeks.sort((a, b) => a - b);
      out[name] = { won: won / N, broke: broke / N, median: weeks[Math.floor(weeks.length / 2)] || null, fastest: weeks[0] || null };
    }
    return out;
  });
  console.table(res);

  // UI run: tap through real buttons.
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  for (let i = 0; i < 40; i++) {
    const opt = page.locator('.opt[data-opt]').first();
    if (await opt.count()) { await opt.click(); continue; }
    if (await page.locator('[data-restart="now"]').count()) { await page.locator('[data-restart="now"]').click(); continue; }
    const acts = ['talk', 'build', 'content'];
    for (const a of acts) { const b = page.locator(`.act[data-act="${a}"]`); if (await b.count() && await b.isEnabled()) await b.click(); }
    await page.locator('#go').click();
  }
  while (await page.locator('.opt[data-opt]').count()) await page.locator('.opt[data-opt]').first().click();
  await page.locator('#tab-co').click();
  await page.locator('[data-hire="sup"]').click();
  await page.locator('#tab-num').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const week = await page.evaluate(() => window.TENK.state.week);
  await browser.close();

  const fail = [];
  if (errors.length) fail.push('script errors: ' + errors.join(' | '));
  if (overflow) fail.push('page scrolls sideways at phone width');
  if (week < 2) fail.push('UI run did not advance (week ' + week + ')');
  if (res.smart.won < 0.7) fail.push('sensible play wins too rarely');
  if (res.smart.median < 35 || res.smart.median > 110) fail.push('sensible play median out of range: ' + res.smart.median);
  if (res.builder.won > 0.05) fail.push('build-only play should not win');
  if (res.random.won > 0.2) fail.push('random play wins too often');
  if (res.gouger.won > res.smart.won + 0.05 && res.gouger.median < res.smart.median) fail.push('price gouging beats sensible play');
  if (fail.length) { console.error('FAIL\n- ' + fail.join('\n- ')); process.exit(1); }
  console.log('OK');
})();
