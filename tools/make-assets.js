// Renders every icon, splash and store graphic from one drawing routine, so the art stays consistent.
// Run: NODE_PATH=$(npm root -g) node tools/make-assets.js   (needs Playwright + Chromium)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const serve = require('./serve');
const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android/app/src/main/res');

const jobs = [
  { out: 'www/icons/icon-192.png', w: 192, h: 192, kind: 'full' },
  { out: 'www/icons/icon-512.png', w: 512, h: 512, kind: 'full' },
  { out: 'www/icons/maskable-512.png', w: 512, h: 512, kind: 'maskable' },
  { out: 'store/icon-512.png', w: 512, h: 512, kind: 'full' },
  { out: 'store/feature-graphic-1024x500.png', w: 1024, h: 500, kind: 'feature' },
];
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  jobs.push({ out: `android/app/src/main/res/mipmap-${d}/ic_launcher.png`, w: 48 * k, h: 48 * k, kind: 'rounded' });
  jobs.push({ out: `android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, w: 48 * k, h: 48 * k, kind: 'round' });
  jobs.push({ out: `android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, w: 108 * k, h: 108 * k, kind: 'fg' });
}
// splash screens: keep whatever sizes the Android project already uses
if (fs.existsSync(RES)) {
  for (const dir of fs.readdirSync(RES)) {
    const f = path.join(RES, dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const b = fs.readFileSync(f);
    jobs.push({ out: path.relative(ROOT, f), w: b.readUInt32BE(16), h: b.readUInt32BE(20), kind: 'splash' });
  }
}

function draw(job) {
  const { w, h, kind } = job;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), TAU = Math.PI * 2;
  const bg = () => {
    const gr = g.createLinearGradient(0, 0, w * 0.3, h);
    gr.addColorStop(0, '#0a0d2c'); gr.addColorStop(1, '#3a1552');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#fff';
    for (let i = 0; i < Math.max(18, (w * h) / 9000); i++) { g.globalAlpha = 0.2 + rnd() * 0.6; const z = Math.max(1, Math.min(w, h) * 0.006 * (0.5 + rnd())); g.fillRect(rnd() * w, rnd() * h, z, z); }
    g.globalAlpha = 1;
  };
  const art = (cx, cy, R) => { // R = orbit radius
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.95);
    halo.addColorStop(0, 'rgba(255,110,140,.55)'); halo.addColorStop(1, 'rgba(255,110,140,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.42)'; g.lineWidth = R * 0.045; g.setLineDash([R * 0.1, R * 0.13]);
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke(); g.setLineDash([]);
    const pr = R * 0.5, pg = g.createRadialGradient(cx - pr * 0.35, cy - pr * 0.4, pr * 0.1, cx, cy, pr);
    pg.addColorStop(0, '#ffb09a'); pg.addColorStop(0.55, '#ff5a7a'); pg.addColorStop(1, '#7a1f6e');
    g.fillStyle = pg; g.beginPath(); g.arc(cx, cy, pr, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,.14)';
    g.beginPath(); g.arc(cx + pr * 0.3, cy + pr * 0.25, pr * 0.2, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx - pr * 0.3, cy + pr * 0.45, pr * 0.12, 0, TAU); g.fill();
    // comet with a tapering trail along the orbit
    const a1 = -Math.PI * 0.27, span = Math.PI * 0.95, N = 60;
    g.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const f = i / N, a = a1 - span * (1 - f), b = a1 - span * (1 - (i + 1) / N);
      g.strokeStyle = `hsla(${22 + f * 22},100%,${55 + f * 15}%,${f * f})`;
      g.lineWidth = R * (0.02 + 0.14 * f);
      g.beginPath(); g.arc(cx, cy, R, a, b); g.stroke();
    }
    const hx = cx + Math.cos(a1) * R, hy = cy + Math.sin(a1) * R;
    const hg = g.createRadialGradient(hx, hy, 0, hx, hy, R * 0.36);
    hg.addColorStop(0, 'rgba(255,214,120,.95)'); hg.addColorStop(1, 'rgba(255,194,75,0)');
    g.fillStyle = hg; g.beginPath(); g.arc(hx, hy, R * 0.36, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(hx, hy, R * 0.115, 0, TAU); g.fill();
  };
  const m = Math.min(w, h);
  if (kind === 'full' || kind === 'maskable') { bg(); art(w / 2, h / 2, m * (kind === 'maskable' ? 0.26 : 0.33)); }
  else if (kind === 'rounded' || kind === 'round') {
    g.beginPath();
    if (kind === 'round') g.arc(w / 2, h / 2, m / 2, 0, TAU); else g.roundRect(0, 0, w, h, m * 0.22);
    g.clip(); bg(); art(w / 2, h / 2, m * 0.31);
  }
  else if (kind === 'fg') art(w / 2, h / 2, m * 0.2);
  else if (kind === 'splash') { g.fillStyle = '#070a1c'; g.fillRect(0, 0, w, h); art(w / 2, h / 2, m * 0.13); }
  else if (kind === 'feature') {
    bg(); art(w * 0.76, h * 0.5, h * 0.3);
    g.fillStyle = '#fff'; g.font = `900 ${h * 0.25}px Unbounded, sans-serif`; g.textBaseline = 'alphabetic';
    const tg = g.createLinearGradient(0, h * 0.2, 0, h * 0.72); tg.addColorStop(0.2, '#fff'); tg.addColorStop(1, '#ffc24b');
    g.fillStyle = tg; g.fillText('LOOP', w * 0.07, h * 0.47); g.fillText('STAR', w * 0.07, h * 0.7);
    g.fillStyle = '#a3a8d0'; g.font = `500 ${h * 0.062}px system-ui, sans-serif`;
    g.fillText('Sling from planet to planet.', w * 0.073, h * 0.83);
  }
  return cv.toDataURL('image/png');
}

(async () => {
  const srv = await serve(path.join(ROOT, 'www'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${srv.port}/`);
  await page.evaluate(() => document.fonts.load('900 40px Unbounded'));
  for (const job of jobs) {
    const url = await page.evaluate(draw, job);
    const file = path.join(ROOT, job.out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close(); srv.close();
  console.log('wrote ' + jobs.length + ' images');
})();
