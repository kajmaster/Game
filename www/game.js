/* Loopstar - one-tap orbit-hopping arcade game. No dependencies. */
(() => {
'use strict';

// ---------- helpers ----------
const W = 400;                       // world width in units; height follows the screen
const TAU = Math.PI * 2;
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const FONT = '"Unbounded","Avenir Next","Segoe UI",Roboto,system-ui,sans-serif';

const FLY_SPEED = 470;
const BURN_TIME = 1.3;
const REVIVE_COST = 25;
const ZONE_LEN = 10;
const ZONE_HUES = [232, 268, 196, 322, 158, 214, 288, 12];

const SKINS = [
  { id: 'amber', name: 'Ember', cost: 0, h: 40, h2: 20 },
  { id: 'mint', name: 'Mint', cost: 60, h: 165, h2: 190 },
  { id: 'rose', name: 'Rosa', cost: 120, h: 340, h2: 300 },
  { id: 'ice', name: 'Glacier', cost: 200, h: 200, h2: 230 },
  { id: 'violet', name: 'Nebula', cost: 320, h: 275, h2: 320 },
  { id: 'aurora', name: 'Aurora', cost: 450, h: 95, h2: 175 },
  { id: 'solar', name: 'Solar', cost: 650, h: 55, h2: 350 },
  { id: 'prism', name: 'Prism', cost: 1000, rainbow: true },
];

const MISSIONS = {
  score: { txt: (n) => `Score ${n} in one run`, tiers: [12, 25, 40, 60, 90, 130, 180], max: true },
  gems: { txt: (n) => `Collect ${n} stardust`, tiers: [25, 50, 90, 140, 200] },
  bank: { txt: (n) => `Land ${n} wall-bounce shots`, tiers: [2, 4, 7, 10, 15] },
  swift: { txt: (n) => `Reach a swift streak of ${n}`, tiers: [4, 6, 9, 12, 16], max: true },
  hops: { txt: (n) => `Land on ${n} planets`, tiers: [40, 80, 150, 250, 400] },
  skip: { txt: (n) => `Skip ${n} planets`, tiers: [2, 4, 7, 10] },
  runs: { txt: (n) => `Play ${n} runs`, tiers: [3, 5, 8, 12] },
};
const DAILY = [10, 15, 20, 25, 30, 40, 60];

// ---------- save ----------
const KEY = 'loopstar.v1';
const DEFAULTS = () => ({
  best: 0, gems: 0, skin: 'amber', owned: ['amber'], sound: true, music: true, haptics: true,
  missions: [], mTier: {}, daily: { last: '', streak: 0 }, runs: 0,
});
let S = DEFAULTS();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) S = Object.assign(DEFAULTS(), JSON.parse(raw));
} catch (e) { /* storage unavailable: play without saving */ }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}

// ---------- audio ----------
let AC = null, master = null, musicBus = null, noiseBuf = null, musicTimer = null, musicStep = 0, musicNext = 0;
const PENTA = [0, 2, 4, 7, 9];
const noteHz = (n) => 261.63 * Math.pow(2, (Math.floor(n / 5) * 12 + PENTA[((n % 5) + 5) % 5]) / 12);

function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => {}); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.55; master.connect(AC.destination);
    musicBus = AC.createGain(); musicBus.gain.value = 0.5;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    musicBus.connect(lp); lp.connect(master);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.6, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    musicNext = AC.currentTime + 0.1;
    musicTimer = setInterval(musicTick, 90);
  } catch (e) { AC = null; }
}
function tone(f, dur, o = {}) {
  if (!AC) return;
  const t0 = (o.when || AC.currentTime) + (o.at || 0);
  const osc = AC.createOscillator(), g = AC.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(f, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  const v = o.vol == null ? 0.2 : o.vol;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(o.dest || master);
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}
function noise(dur, vol, freq) {
  if (!AC) return;
  const src = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter();
  src.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq || 900;
  g.gain.setValueAtTime(vol, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(); src.stop(AC.currentTime + dur);
}
function sfx(name, n = 0) {
  if (!AC || !S.sound) return;
  switch (name) {
    case 'launch': tone(240, 0.14, { type: 'triangle', to: 620, vol: 0.13 }); break;
    case 'land': {
      const hz = noteHz(5 + Math.min(n, 14));
      tone(hz, 0.34, { type: 'triangle', vol: 0.22 });
      tone(hz * 2, 0.22, { vol: 0.08 });
      tone(90, 0.12, { to: 50, vol: 0.2 });
      break;
    }
    case 'gem': tone(1250 + n * 60, 0.09, { to: 1900 + n * 60, vol: 0.09 }); break;
    case 'bounce': tone(180, 0.1, { type: 'square', to: 120, vol: 0.07 }); break;
    case 'power': [0, 1, 2, 3].forEach((i) => tone(noteHz(10 + i), 0.16, { at: i * 0.06, type: 'triangle', vol: 0.14 })); break;
    case 'shield': tone(700, 0.3, { type: 'sawtooth', to: 180, vol: 0.12 }); noise(0.25, 0.2, 1800); break;
    case 'die': tone(320, 0.55, { type: 'sawtooth', to: 45, vol: 0.2 }); noise(0.5, 0.35, 700); break;
    case 'click': tone(660, 0.06, { type: 'triangle', vol: 0.1 }); break;
    case 'lost': tone(330, 0.18, { type: 'triangle', to: 220, vol: 0.08 }); break;
    case 'best': [0, 2, 4, 5, 7].forEach((i, k) => tone(noteHz(10 + i), 0.3, { at: k * 0.09, type: 'triangle', vol: 0.16 })); break;
    case 'reward': [0, 2, 4].forEach((i, k) => tone(noteHz(12 + i), 0.22, { at: k * 0.07, vol: 0.14 })); break;
  }
}
// Soft generative arpeggio so the game is never silent.
const CHORDS = [[5, 7, 9, 12], [3, 5, 7, 10], [0, 2, 4, 7], [4, 6, 8, 11]];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
function musicTick() {
  if (!AC || AC.state !== 'running') return;
  if (musicNext < AC.currentTime) musicNext = AC.currentTime + 0.05;
  while (musicNext < AC.currentTime + 0.3) {
    if (S.music && !document.hidden) {
      const bar = Math.floor(musicStep / 8) % CHORDS.length, st = musicStep % 8, ch = CHORDS[bar];
      tone(noteHz(ch[ARP[st]]), 0.5, { when: musicNext, type: 'triangle', vol: 0.05, dest: musicBus });
      if (st === 0) tone(noteHz(ch[0] - 10), 2.1, { when: musicNext, vol: 0.09, dest: musicBus });
      if (st === 4 && bar % 2 === 1) tone(noteHz(ch[3] + 5), 0.9, { when: musicNext, vol: 0.025, dest: musicBus });
    }
    musicNext += 0.27; musicStep++;
  }
}
function buzz(ms) {
  if (!S.haptics) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ }
}

// ---------- canvas ----------
const canvas = $('#c');
const ctx = canvas.getContext('2d');
let H = 800, scale = 1, dpr = 1;
function resize() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  scale = r.width / W;
  H = r.height / scale;
}
window.addEventListener('resize', resize);

const glowCache = {};
function glowSprite(col) {
  let c = glowCache[col];
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col); gr.addColorStop(0.35, col);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.9; g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache[col] = c;
  return c;
}
function glow(x, y, rad, col, a) {
  ctx.globalAlpha = a;
  ctx.drawImage(glowSprite(col), x - rad, y - rad, rad * 2, rad * 2);
  ctx.globalAlpha = 1;
}

// ---------- game state ----------
const G = {
  mode: 'home', paused: false, t: 0, planets: [], gems: [], mines: [], picks: [], parts: [], texts: [],
  comet: null, camY: 0, voidY: 0, voidOn: false, score: 0, maxI: 0, streak: 0, bestStreak: 0, runGems: 0,
  revived: false, shake: 0, nextI: 0, lastPickI: 0, bgHue: ZONE_HUES[0], zone: 0, deadT: 0, flash: 0, gemChain: 0, gemChainT: 0,
};
const stars = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random(), z: rand(0.15, 1), s: rand(0.6, 1.9), tw: rand(0, TAU) }));

function skin() { return SKINS.find((s) => s.id === S.skin) || SKINS[0]; }
function skinHue(k) { // k: 0 head .. 1 tail
  const s = skin();
  if (s.rainbow) return (Math.round((G.t * 140 + k * 200) / 15) * 15) % 360;
  let d = s.h2 - s.h; if (d > 180) d -= 360; if (d < -180) d += 360;
  return (Math.round((s.h + d * k) / 5) * 5 + 360) % 360;
}

function genPlanet() {
  const i = G.nextI++, prev = G.planets[G.planets.length - 1];
  const d = clamp(i / 70, 0, 1);
  const R = i === 0 ? 74 : lerp(72, 50, d) + rand(-7, 7);
  let x = W / 2, y = 0;
  if (prev) {
    const dy = Math.max(lerp(168, 212, d) + rand(-14, 26), prev.R + R + 38);
    y = prev.y - dy;
    const lo = R + 16, hi = W - R - 16;
    for (let k = 0; k < 6; k++) { x = rand(lo, hi); if (Math.abs(x - prev.x0) > 55) break; }
  }
  const zone = Math.floor(i / ZONE_LEN);
  const p = {
    i, x0: x, x, y, R, r: R * rand(0.36, 0.46),
    hue: (ZONE_HUES[zone % ZONE_HUES.length] + 150 + rand(-50, 50)) % 360,
    w: lerp(2.3, 3.5, d) * Math.sqrt(62 / R), move: null, om: null, pulse: 0,
    ringed: Math.random() < 0.3, tilt: rand(-0.5, 0.5), spots: [rand(0, TAU), rand(0.3, 0.7), rand(0, TAU), rand(0.2, 0.6)],
  };
  if (i > 12 && Math.random() < lerp(0.15, 0.42, d)) {
    const a = Math.min(rand(24, 62), x - R - 10, W - R - 10 - x);
    if (a > 12) p.move = { a, f: rand(0.7, 1.2), ph: rand(0, TAU) };
  }
  if (i > 22 && Math.random() < lerp(0.1, 0.35, d)) p.om = { ph: rand(0, TAU), sp: rand(0.9, 1.5) * (Math.random() < 0.5 ? -1 : 1) };
  G.planets.push(p);
  if (prev) decorate(prev, p, i, d);
}
function decorate(a, b, i, d) {
  const dx = b.x0 - a.x0, dy = b.y - a.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const roll = Math.random();
  if (i <= 2 || roll < 0.5) {
    const s0 = a.R + 16, s1 = L - b.R - 16;
    for (let k = 0; k < 3; k++) {
      const s = lerp(s0, s1, k / 2);
      G.gems.push({ x: a.x0 + ux * s, y: a.y + uy * s, p: null, ph: rand(0, TAU) });
    }
  } else if (roll < 0.78) {
    const st = rand(0, TAU);
    for (let k = 0; k < 5; k++) G.gems.push({ x: 0, y: 0, p: b, ang: st + k * 0.5, ph: rand(0, TAU) });
  } else if (roll < 0.9) {
    // a tempting line down one wall, for bounce shots
    const wx = b.x0 < W / 2 ? W - 22 : 22;
    for (let k = 0; k < 3; k++) G.gems.push({ x: wx, y: lerp(a.y, b.y, 0.3 + k * 0.2), p: null, ph: rand(0, TAU) });
  }
  const side = Math.random() < 0.5 ? 1 : -1;
  if (i > 8 && Math.random() < lerp(0.2, 0.45, d)) {
    const off = rand(48, 86) * side;
    G.mines.push({ x: clamp(a.x0 + ux * L / 2 + nx * off, 22, W - 22), y: a.y + uy * L / 2 + ny * off, r: 10, ph: rand(0, TAU) });
  }
  if (i > 5 && i - G.lastPickI > 11 && Math.random() < 0.3) {
    G.lastPickI = i;
    const off = -58 * side;
    G.picks.push({ x: clamp(a.x0 + ux * L / 2 + nx * off, 26, W - 26), y: a.y + uy * L / 2 + ny * off, type: Math.random() < 0.5 ? 'shield' : 'magnet' });
  }
}

function reset() {
  Object.assign(G, {
    t: 0, planets: [], gems: [], mines: [], picks: [], parts: [], texts: [], voidOn: false, score: 0, maxI: 0, streak: 0,
    bestStreak: 0, runGems: 0, revived: false, shake: 0, nextI: 0, lastPickI: 0, zone: 0, deadT: 0, flash: 0, gemChain: 0, gemChainT: 0,
  });
  for (let k = 0; k < 6; k++) genPlanet();
  const p = G.planets[0];
  G.comet = { mode: 'orbit', p, src: p, ang: Math.PI * 0.75, dir: 1, orad: p.R, x: 0, y: 0, vx: 0, vy: 0, fuel: 1, swift: 1.15, swiftRel: false, banked: 0, left: false, shield: false, magnet: 0, trail: [] };
  G.camY = p.y - H * 0.64;
  G.voidY = p.y + 430;
  hud();
}

// ---------- flow ----------
function startRun() {
  audioInit();
  if (G.mode === 'over' || G.mode === 'dead' || G.score > 0 || G.voidOn) reset();
  G.mode = 'play'; G.paused = false;
  G.comet.swift = 1.15;
  S.runs++; track('runs', 1); persist();
  show('home', false); show('over', false);
  $('#pauseBtn').hidden = false; $('#scoreWrap').hidden = false;
  $('#hint').hidden = S.runs > 3;
  hud();
}
function goHome() {
  reset(); G.mode = 'home'; G.paused = false;
  show('over', false); show('paused', false); show('home', true);
  $('#pauseBtn').hidden = true; $('#scoreWrap').hidden = true; $('#hint').hidden = true;
  $('#homeBest').textContent = S.best;
  hud();
}
function tap() {
  audioInit();
  if (G.paused) return;
  if (G.mode === 'home') { startRun(); return; }
  if (G.mode !== 'play') return;
  const c = G.comet;
  if (c.mode !== 'orbit') return;
  c.mode = 'fly'; c.src = c.p; c.left = false; c.banked = 0; c.fuel = 1;
  c.vx = -Math.sin(c.ang) * c.dir * FLY_SPEED;
  c.vy = Math.cos(c.ang) * c.dir * FLY_SPEED;
  c.swiftRel = c.swift > 0;
  G.voidOn = true;
  $('#hint').hidden = true;
  sfx('launch'); buzz(8);
  burst(c.x, c.y, 6, skinHue(0), 90);
}
function capture(p, dx, dy) {
  const c = G.comet;
  c.mode = 'orbit'; c.p = p;
  c.ang = Math.atan2(dy, dx); c.orad = Math.hypot(dx, dy);
  c.dir = dx * c.vy - dy * c.vx >= 0 ? 1 : -1;
  c.swift = 1.15;
  p.pulse = 1;
  if (p.i > G.maxI) {
    const hops = p.i - G.maxI;
    G.maxI = p.i;
    if (c.swiftRel) G.streak++; else G.streak = 0;
    G.bestStreak = Math.max(G.bestStreak, G.streak);
    const m = mult();
    let pts = hops * m, label = '+' + pts;
    if (hops > 1) { label = 'SKIP +' + pts; track('skip', hops - 1); }
    if (c.banked > 0) { pts += 2 * m; label = 'BANK +' + pts; track('bank', 1); }
    G.score += pts;
    track('hops', 1); track('swift', G.streak, true); track('score', G.score, true);
    floatText(p.x, p.y - p.R - 14, label, hops > 1 || c.banked ? '#ffc24b' : '#ffffff', hops > 1 || c.banked ? 19 : 16);
    sfx('land', G.streak); buzz(hops > 1 || c.banked ? 30 : 14);
    const z = Math.floor(G.maxI / ZONE_LEN);
    if (z > G.zone) { G.zone = z; toast('Zone ' + (z + 1)); G.flash = 0.5; sfx('power'); }
    bumpScore();
  } else {
    if (G.streak > 0) sfx('lost');
    G.streak = 0;
    sfx('land', 0);
  }
  burst(c.x, c.y, 12, p.hue, 150);
  G.shake = Math.max(G.shake, 3);
  hud();
}
function mult() { return 1 + Math.min(4, Math.floor(G.streak / 3)); }
function rescue(resetVoid) {
  const c = G.comet;
  const p = G.planets.find((q) => q.i === G.maxI) || G.planets[0];
  c.mode = 'orbit'; c.p = p; c.src = p; c.ang = -Math.PI / 2; c.orad = p.R; c.dir = 1; c.swift = 1.15; c.fuel = 1; c.trail.length = 0;
  c.x = p.x; c.y = p.y - p.R;
  G.voidY = resetVoid ? p.y + 430 : Math.max(G.voidY, p.y + p.R + 170);
  G.streak = 0; p.pulse = 1;
  burst(c.x, c.y, 24, skinHue(0), 200);
  hud();
}
function die(why) {
  const c = G.comet;
  if (c.mode === 'dead') return;
  if (c.shield && why !== 'void') {
    c.shield = false; sfx('shield'); buzz(40); G.shake = 8;
    floatText(c.x, c.y - 20, 'SHIELD', '#6ff2d2', 16);
    if (why === 'burnout') rescue(false); else burst(c.x, c.y, 20, 165, 220);
    return;
  }
  c.mode = 'dead'; G.mode = 'dead'; G.deadT = 0.95; G.shake = 16; G.flash = 0.35;
  burst(c.x, c.y, 46, why === 'void' ? 345 : skinHue(0), 320);
  burst(c.x, c.y, 18, 0, 160, '#ffffff');
  sfx('die'); buzz([30, 40, 80]);
}
function showOver() {
  G.mode = 'over';
  const isBest = G.score > S.best;
  if (isBest) { S.best = G.score; sfx('best'); }
  persist();
  $('#overScore').textContent = G.score;
  $('#overBest').textContent = S.best;
  $('#overGems').textContent = G.runGems;
  $('#newBest').hidden = !isBest || G.score === 0;
  const rv = $('#reviveBtn');
  rv.hidden = G.revived || G.score < 5;
  rv.disabled = S.gems < REVIVE_COST;
  $('#shareBtn').hidden = !navigator.share;
  renderMissions($('#overMissions'));
  $('#pauseBtn').hidden = true;
  show('over', true);
}
function revive() {
  if (G.revived || S.gems < REVIVE_COST) return;
  S.gems -= REVIVE_COST; G.revived = true; persist();
  show('over', false);
  G.mode = 'play'; $('#pauseBtn').hidden = false;
  rescue(true); sfx('power');
}
function finishRun() { // rotate out completed missions once the run is really over
  let changed = false;
  S.missions = S.missions.filter((m) => { if (m.done) changed = true; return !m.done; });
  fillMissions();
  if (changed) persist();
}

// ---------- missions / economy ----------
function fillMissions() {
  const ids = Object.keys(MISSIONS);
  let guard = 0;
  while (S.missions.length < 3 && guard++ < 40) {
    const id = ids[Math.floor(Math.random() * ids.length)];
    if (S.missions.some((m) => m.id === id)) continue;
    const def = MISSIONS[id], tier = Math.min(S.mTier[id] || 0, def.tiers.length - 1);
    S.missions.push({ id, goal: def.tiers[tier], prog: 0, reward: 15 + tier * 10, done: false });
  }
}
function track(id, v, isMax) {
  for (const m of S.missions) {
    if (m.id !== id || m.done) continue;
    m.prog = isMax ? Math.max(m.prog, v) : m.prog + v;
    if (m.prog >= m.goal) {
      m.prog = m.goal; m.done = true;
      S.mTier[id] = (S.mTier[id] || 0) + 1;
      S.gems += m.reward; persist();
      toast('Mission done  +' + m.reward); sfx('reward'); hud();
    }
  }
}
function renderMissions(el) {
  el.innerHTML = '';
  for (const m of S.missions) {
    const li = document.createElement('li');
    if (m.done) li.className = 'done';
    const pct = Math.round((m.prog / m.goal) * 100);
    li.innerHTML = `<span></span><span class="rw">${m.done ? 'Done' : '<i class="gem"></i>' + m.reward}</span><div class="bar"><i style="width:${pct}%"></i></div>`;
    li.firstChild.textContent = MISSIONS[m.id].txt(m.goal) + (m.done ? '' : `  (${m.prog}/${m.goal})`);
    el.appendChild(li);
  }
}
function renderSkins() {
  const grid = $('#skinGrid');
  grid.innerHTML = '';
  for (const s of SKINS) {
    const owned = S.owned.includes(s.id), on = S.skin === s.id;
    const b = document.createElement('button');
    b.className = 'skin' + (on ? ' on' : '') + (owned ? '' : S.gems >= s.cost ? ' locked' : ' locked poor');
    const grad = s.rainbow
      ? 'linear-gradient(90deg,transparent,#ff5a7a,#ffc24b,#6ff2d2,#7aa8ff,#d58bff)'
      : `linear-gradient(90deg,transparent,hsl(${s.h2},90%,55%),hsl(${s.h},100%,68%))`;
    b.innerHTML = `<div class="trail" style="background:${grad}"></div><div class="nm">${s.name}</div><div class="st">${on ? 'Flying' : owned ? 'Tap to use' : '<i class="gem"></i>' + s.cost}</div>`;
    b.addEventListener('click', () => {
      if (owned) { S.skin = s.id; sfx('click'); }
      else if (S.gems >= s.cost) { S.gems -= s.cost; S.owned.push(s.id); S.skin = s.id; sfx('reward'); toast(s.name + ' unlocked'); }
      else { toast('Need ' + (s.cost - S.gems) + ' more stardust'); sfx('lost'); return; }
      persist(); hud(); renderSkins();
    });
    grid.appendChild(b);
  }
}
const dayKey = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
function checkDaily() {
  const today = dayKey(new Date());
  if (S.daily.last === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const streak = S.daily.last === dayKey(y) ? S.daily.streak + 1 : 1;
  const amt = DAILY[Math.min(streak, DAILY.length) - 1];
  $('#dailyDay').textContent = streak;
  $('#dailyAmt').textContent = amt;
  show('daily', true);
  $('#dailyBtn').onclick = () => {
    audioInit();
    S.daily = { last: today, streak }; S.gems += amt; persist(); hud();
    sfx('reward'); show('daily', false);
  };
}

// ---------- ui plumbing ----------
function show(id, on) { $('#' + id).hidden = !on; }
let toastT = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1700);
}
function hud() {
  $('#score').textContent = G.score;
  $('#gems').textContent = S.gems;
  const m = mult();
  $('#mult').textContent = G.mode !== 'home' && m > 1 ? 'x' + m + ' swift' : '';
}
function bumpScore() {
  const el = $('#score');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function setPaused(on) {
  if (G.mode !== 'play') return;
  G.paused = on; show('paused', on);
}

canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') { if (!e.repeat && !document.querySelector('.sheet:not([hidden]),.modal:not([hidden])')) tap(); e.preventDefault(); }
  else if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!G.paused);
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { setPaused(true); if (AC) AC.suspend().catch(() => {}); }
  else if (AC) AC.resume().catch(() => {});
});
$('#playBtn').addEventListener('click', () => { audioInit(); sfx('click'); startRun(); });
$('#againBtn').addEventListener('click', () => { sfx('click'); finishRun(); startRun(); });
$('#homeBtn').addEventListener('click', () => { sfx('click'); finishRun(); goHome(); });
$('#reviveBtn').addEventListener('click', revive);
$('#pauseBtn').addEventListener('click', () => { sfx('click'); setPaused(true); });
$('#resumeBtn').addEventListener('click', () => { audioInit(); sfx('click'); setPaused(false); });
$('#quitBtn').addEventListener('click', () => { G.paused = false; show('paused', false); G.comet.shield = false; G.revived = true; die('quit'); });
$('#shareBtn').addEventListener('click', () => {
  try { navigator.share({ title: 'Loopstar', text: `I hopped to ${G.score} in Loopstar. Can you beat it?` }).catch(() => {}); } catch (e) { /* ignore */ }
});
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
  audioInit(); sfx('click');
  const id = b.dataset.open;
  if (id === 'skins') renderSkins();
  if (id === 'missions') {
    renderMissions($('#missionList'));
    $('#streakDays').textContent = S.daily.streak || 1;
    $('#streakHint').textContent = 'Come back tomorrow for a bigger reward.';
  }
  show(id, true);
}));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { sfx('click'); b.closest('.sheet').hidden = true; }));
document.querySelectorAll('.sheet').forEach((s) => s.addEventListener('pointerdown', (e) => { if (e.target === s && s.id !== 'over') s.hidden = true; }));
[['optSound', 'sound'], ['optMusic', 'music'], ['optHaptics', 'haptics']].forEach(([id, k]) => {
  const el = $('#' + id);
  el.checked = S[k];
  el.addEventListener('change', () => { S[k] = el.checked; persist(); audioInit(); sfx('click'); if (k === 'haptics') buzz(20); });
});
let resetArmed = 0;
$('#resetBtn').addEventListener('click', () => {
  const b = $('#resetBtn');
  if (Date.now() - resetArmed < 4000) {
    S = DEFAULTS(); fillMissions(); persist(); b.textContent = 'Reset progress'; resetArmed = 0;
    ['optSound', 'optMusic', 'optHaptics'].forEach((id) => { $('#' + id).checked = true; });
    toast('Progress reset'); show('settings', false); goHome();
  } else { resetArmed = Date.now(); b.textContent = 'Tap again to erase everything'; setTimeout(() => { b.textContent = 'Reset progress'; }, 4000); }
});

// ---------- effects ----------
function burst(x, y, n, hue, speed, col) {
  for (let k = 0; k < n && G.parts.length < 260; k++) {
    const a = rand(0, TAU), v = rand(0.25, 1) * speed, life = rand(0.35, 0.85);
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col: col || `hsl(${Math.round(hue / 10) * 10},100%,68%)`, s: rand(3, 8) });
  }
}
function floatText(x, y, str, col, size) { G.texts.push({ x: clamp(x, 50, W - 50), y, str, col, size, life: 1 }); }

// ---------- update ----------
function gemPos(g) {
  if (g.p) { g.x = g.p.x + Math.cos(g.ang) * g.p.R; g.y = g.p.y + Math.sin(g.ang) * g.p.R; }
}
function flyStep(c, dt) {
  c.x += c.vx * dt; c.y += c.vy * dt;
  if (c.x < 7) { c.x = 7; c.vx = Math.abs(c.vx); wallHit(c); }
  else if (c.x > W - 7) { c.x = W - 7; c.vx = -Math.abs(c.vx); wallHit(c); }
  if (!c.left && Math.hypot(c.x - c.src.x, c.y - c.src.y) > c.src.R + 8) c.left = true;
  for (const p of G.planets) {
    if (p === c.src && !c.left) continue;
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy < p.R * p.R) { capture(p, dx, dy); return true; }
  }
  return false;
}
function wallHit(c) {
  c.banked++; sfx('bounce'); buzz(10);
  burst(c.x, c.y, 8, 200, 120, '#ffffff'); G.shake = Math.max(G.shake, 4);
}
function update(dt) {
  G.t += dt;
  const c = G.comet;
  for (const p of G.planets) {
    if (p.move) p.x = p.x0 + Math.sin(G.t * p.move.f + p.move.ph) * p.move.a;
    if (p.pulse > 0) p.pulse = Math.max(0, p.pulse - dt * 2.6);
  }
  if (c.mode === 'orbit') {
    const p = c.p;
    c.ang += c.dir * p.w * dt;
    c.orad += (p.R - c.orad) * Math.min(1, dt * 10);
    c.x = p.x + Math.cos(c.ang) * c.orad; c.y = p.y + Math.sin(c.ang) * c.orad;
    if (G.mode === 'play' && G.voidOn && c.swift > 0) {
      c.swift -= (p.w * dt) / TAU;
      if (c.swift <= 0 && G.streak > 0) { G.streak = 0; sfx('lost'); hud(); }
    }
  } else if (c.mode === 'fly') {
    for (let k = 0; k < 3 && c.mode === 'fly'; k++) flyStep(c, dt / 3);
    if (c.mode === 'fly') {
      c.fuel -= dt / BURN_TIME;
      if (c.fuel <= 0) die('burnout');
    }
  }
  if (c.mode !== 'dead') {
    c.trail.push(c.x, c.y);
    if (c.trail.length > 44) c.trail.splice(0, 2);
    if (c.magnet > 0) c.magnet -= dt;
    // stardust
    if (G.gemChainT > 0) { G.gemChainT -= dt; if (G.gemChainT <= 0) G.gemChain = 0; }
    for (let k = G.gems.length - 1; k >= 0; k--) {
      const g = G.gems[k];
      gemPos(g);
      const dx = c.x - g.x, dy = c.y - g.y, d2 = dx * dx + dy * dy;
      if (c.magnet > 0 && d2 < 130 * 130) { g.p = null; const d = Math.sqrt(d2) || 1; g.x += (dx / d) * 520 * dt; g.y += (dy / d) * 520 * dt; }
      if (d2 < 19 * 19) {
        G.gems.splice(k, 1); S.gems++; G.runGems++; track('gems', 1);
        sfx('gem', G.gemChain); G.gemChain = Math.min(G.gemChain + 1, 8); G.gemChainT = 0.8;
        burst(g.x, g.y, 5, 165, 90); hud();
      }
    }
    for (let k = G.picks.length - 1; k >= 0; k--) {
      const q = G.picks[k];
      if (Math.hypot(c.x - q.x, c.y - q.y) < 24) {
        G.picks.splice(k, 1); sfx('power'); buzz(25);
        if (q.type === 'shield') { c.shield = true; floatText(q.x, q.y - 18, 'SHIELD', '#6ff2d2', 16); }
        else { c.magnet = 9; floatText(q.x, q.y - 18, 'MAGNET', '#ffc24b', 16); }
        burst(q.x, q.y, 16, q.type === 'shield' ? 165 : 40, 180);
      }
    }
    if (G.mode === 'play') {
      for (let k = G.mines.length - 1; k >= 0 && c.mode !== 'dead'; k--) {
        const m = G.mines[k];
        if (Math.hypot(c.x - m.x, c.y - m.y) < m.r + 6) {
          burst(m.x, m.y, 16, 350, 200);
          if (c.shield) G.mines.splice(k, 1);
          die('mine');
        }
      }
      for (const p of G.planets) {
        if (!p.om || c.mode === 'dead') continue;
        const a = G.t * p.om.sp + p.om.ph, mx = p.x + Math.cos(a) * (p.R + 30), my = p.y + Math.sin(a) * (p.R + 30);
        if (Math.hypot(c.x - mx, c.y - my) < 15) { if (c.shield) p.om = null; burst(mx, my, 16, 350, 200); die('mine'); }
      }
    }
  }
  // the red tide
  if (G.voidOn && G.mode === 'play') {
    G.voidY -= (22 + Math.min(G.maxI, 90) * 0.42) * dt;
    G.voidY = Math.min(G.voidY, (c.mode === 'orbit' ? c.p.y : c.y) + 430);
    if (c.mode !== 'dead' && c.y + 5 > G.voidY) die('void');
  }
  // camera
  if (c.mode !== 'dead') {
    const ty = c.mode === 'orbit' ? c.p.y - H * 0.64 : Math.min(c.src.y - H * 0.64, c.y - H * 0.3);
    G.camY += (ty - G.camY) * Math.min(1, dt * 4.5);
  }
  // world upkeep
  while (G.planets[G.planets.length - 1].y > G.camY - 520) genPlanet();
  const cut = G.camY + H + 700;
  while (G.planets.length > 3 && G.planets[0].y > cut && G.planets[0].i < G.maxI) G.planets.shift();
  G.gems = G.gems.filter((g) => g.y < cut);
  if (G.gems.length > 120) G.gems.splice(0, G.gems.length - 120);
  G.mines = G.mines.filter((m) => m.y < cut);
  G.picks = G.picks.filter((m) => m.y < cut);
  // effects
  for (let k = G.parts.length - 1; k >= 0; k--) {
    const q = G.parts[k];
    q.life -= dt; if (q.life <= 0) { G.parts.splice(k, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 1 - 2.2 * dt; q.vy *= 1 - 2.2 * dt;
  }
  for (let k = G.texts.length - 1; k >= 0; k--) {
    const q = G.texts[k];
    q.life -= dt * 1.1; q.y -= 38 * dt; if (q.life <= 0) G.texts.splice(k, 1);
  }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 40);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt);
  let dh = ZONE_HUES[G.zone % ZONE_HUES.length] - G.bgHue;
  if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
  G.bgHue = (G.bgHue + dh * Math.min(1, dt * 1.5) + 360) % 360;
  if (G.mode === 'dead') { G.deadT -= dt; if (G.deadT <= 0) showOver(); }
}

// ---------- render ----------
function render() {
  const c = G.comet, t = G.t, top = G.camY, bot = G.camY + H;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, `hsl(${G.bgHue},58%,7%)`);
  bg.addColorStop(1, `hsl(${(G.bgHue + 34) % 360},62%,19%)`);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // stars
  ctx.fillStyle = '#fff';
  for (const s of stars) {
    const y = (((s.y * H * 1.3 - top * s.z * 0.22) % (H * 1.3)) + H * 1.3) % (H * 1.3) - H * 0.15;
    ctx.globalAlpha = (0.25 + 0.55 * s.z) * (0.75 + 0.25 * Math.sin(t * 2 + s.tw));
    ctx.fillRect(s.x, y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  const sx = G.shake ? rand(-1, 1) * G.shake * 0.6 : 0, sy = G.shake ? rand(-1, 1) * G.shake * 0.6 : 0;
  ctx.translate(sx, sy - top);

  // stardust
  for (const g of G.gems) {
    if (g.y < top - 20 || g.y > bot + 20) continue;
    const b = Math.sin(t * 4 + g.ph) * 1.5;
    ctx.globalCompositeOperation = 'lighter'; glow(g.x, g.y + b, 13, 'hsl(165,100%,60%)', 0.5); ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(g.x, g.y + b); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#c9fff0'; ctx.fillRect(-3.6, -3.6, 7.2, 7.2); ctx.restore();
  }
  // planets
  for (const p of G.planets) {
    if (p.y < top - 120 || p.y > bot + 120) continue;
    const cur = c.mode === 'orbit' && c.p === p, done = p.i < G.maxI || (p.i === G.maxI && !cur);
    ctx.lineWidth = cur ? 2.2 : 1.6;
    ctx.strokeStyle = `hsla(${p.hue},85%,78%,${cur ? 0.75 : done ? 0.16 : 0.42})`;
    if (!cur) { ctx.setLineDash([4, 8]); ctx.lineDashOffset = -t * 14; }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    if (p.pulse > 0) {
      ctx.strokeStyle = `hsla(${p.hue},100%,85%,${p.pulse * 0.7})`; ctx.lineWidth = 3 * p.pulse;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.R + (1 - p.pulse) * 30, 0, TAU); ctx.stroke();
    }
    if (cur && G.mode === 'play' && c.swift > 0 && G.voidOn) {
      ctx.strokeStyle = 'rgba(255,194,75,.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.R + 8, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, c.swift / 1.15)); ctx.stroke(); ctx.lineCap = 'butt';
    }
    ctx.globalCompositeOperation = 'lighter'; glow(p.x, p.y, p.r * 2.3, `hsl(${Math.round(p.hue / 10) * 10},90%,55%)`, done ? 0.18 : 0.42); ctx.globalCompositeOperation = 'source-over';
    const r = p.r * (1 + p.pulse * 0.12);
    const gr = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
    gr.addColorStop(0, `hsl(${p.hue},85%,${done ? 55 : 74}%)`);
    gr.addColorStop(1, `hsl(${(p.hue + 28) % 360},65%,${done ? 20 : 30}%)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.13)';
    ctx.beginPath(); ctx.arc(p.x + Math.cos(p.spots[0]) * r * p.spots[1], p.y + Math.sin(p.spots[0]) * r * p.spots[1], r * 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + Math.cos(p.spots[2]) * r * p.spots[3], p.y + Math.sin(p.spots[2]) * r * p.spots[3], r * 0.13, 0, TAU); ctx.fill();
    if (p.ringed) {
      ctx.strokeStyle = `hsla(${(p.hue + 40) % 360},90%,82%,.7)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.55, r * 0.36, p.tilt, 0, TAU); ctx.stroke();
    }
    if (p.om) {
      const a = t * p.om.sp + p.om.ph;
      drawMine(p.x + Math.cos(a) * (p.R + 30), p.y + Math.sin(a) * (p.R + 30), 9, t);
    }
  }
  for (const m of G.mines) if (m.y > top - 30 && m.y < bot + 30) drawMine(m.x, m.y, m.r, t + m.ph);
  for (const q of G.picks) {
    if (q.y < top - 30 || q.y > bot + 30) continue;
    const col = q.type === 'shield' ? '#6ff2d2' : '#ffc24b', pr = 15 + Math.sin(t * 5) * 1.5;
    ctx.globalCompositeOperation = 'lighter'; glow(q.x, q.y, 30, q.type === 'shield' ? 'hsl(165,100%,60%)' : 'hsl(40,100%,60%)', 0.5); ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(q.x, q.y, pr, 0, TAU); ctx.stroke();
    ctx.fillStyle = col;
    if (q.type === 'shield') { ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, TAU); ctx.fill(); }
    else { ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(q.x, q.y + 2, 6, Math.PI, TAU); ctx.stroke(); }
  }

  // aim guide
  if (c.mode === 'orbit' && (G.mode === 'play' || G.mode === 'home')) {
    const tx = -Math.sin(c.ang) * c.dir, ty = Math.cos(c.ang) * c.dir, len = lerp(130, 56, clamp(G.maxI / 45, 0, 1));
    ctx.fillStyle = '#fff';
    for (let s = 16; s < len; s += 13) {
      ctx.globalAlpha = 0.5 * (1 - s / len);
      ctx.beginPath(); ctx.arc(c.x + tx * s, c.y + ty * s, 1.7, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // comet
  ctx.globalCompositeOperation = 'lighter';
  if (c.mode !== 'dead') {
    const n = c.trail.length / 2, low = c.mode === 'fly' && c.fuel < 0.3;
    for (let k = 0; k < n; k++) {
      const f = (k + 1) / n;
      glow(c.trail[k * 2], c.trail[k * 2 + 1], 3 + f * 9, `hsl(${low ? 0 : skinHue(1 - f)},100%,62%)`, f * 0.5);
    }
    const size = c.mode === 'fly' ? 0.55 + 0.45 * c.fuel : 1;
    glow(c.x, c.y, 26 * size, `hsl(${low ? 0 : skinHue(0)},100%,66%)`, 0.9);
    if (c.magnet > 0) glow(c.x, c.y, 70 + Math.sin(t * 8) * 6, 'hsl(40,100%,60%)', 0.13);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = low && Math.sin(t * 40) > 0 ? '#ff8a8a' : '#fff';
    ctx.beginPath(); ctx.arc(c.x, c.y, 5.6 * size, 0, TAU); ctx.fill();
    if (c.mode === 'fly') {
      ctx.strokeStyle = low ? 'rgba(255,90,122,.95)' : 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, 12, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(c.fuel, 0, 1)); ctx.stroke();
    }
    if (c.shield) {
      ctx.strokeStyle = 'rgba(111,242,210,.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, 16 + Math.sin(t * 6), 0, TAU); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const q of G.parts) glow(q.x, q.y, q.s * (0.5 + q.life / q.max), q.col, q.life / q.max);
  ctx.globalCompositeOperation = 'source-over';

  // the red tide
  if (G.voidY < bot + 20) {
    const vy = G.voidY;
    ctx.beginPath(); ctx.moveTo(-20, bot + 40);
    for (let x = -20; x <= W + 20; x += 10) ctx.lineTo(x, vy + Math.sin(x * 0.05 + t * 2.2) * 6 + Math.sin(x * 0.12 - t * 3.1) * 3);
    ctx.lineTo(W + 20, bot + 40); ctx.closePath();
    const vg = ctx.createLinearGradient(0, vy - 8, 0, vy + 260);
    vg.addColorStop(0, 'hsla(345,100%,66%,.96)'); vg.addColorStop(0.12, 'hsla(335,90%,45%,.93)'); vg.addColorStop(1, 'hsla(300,80%,10%,.98)');
    ctx.fillStyle = vg; ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let x = 0; x <= W; x += 50) glow(x, vy, 60, 'hsl(345,100%,60%)', 0.22);
    ctx.globalCompositeOperation = 'source-over';
  }
  // floating labels
  ctx.textAlign = 'center';
  for (const q of G.texts) {
    ctx.globalAlpha = clamp(q.life * 2, 0, 1);
    ctx.font = `800 ${q.size}px ${FONT}`;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText(q.str, q.x + 1, q.y + 2);
    ctx.fillStyle = q.col; ctx.fillText(q.str, q.x, q.y);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  // danger vignette when the tide is close
  const near = G.mode === 'play' ? clamp(1 - (G.voidY - c.y) / 170, 0, 1) : 0;
  if (near > 0) {
    const dg = ctx.createLinearGradient(0, H * 0.45, 0, H);
    dg.addColorStop(0, 'rgba(255,60,100,0)'); dg.addColorStop(1, `rgba(255,60,100,${0.3 * near * (0.7 + 0.3 * Math.sin(t * 9))})`);
    ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
  }
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
}
function drawMine(x, y, r, t) {
  ctx.globalCompositeOperation = 'lighter'; glow(x, y, r * 2.6, 'hsl(350,100%,60%)', 0.45 + 0.2 * Math.sin(t * 6)); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ff5a7a'; ctx.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + t * 1.2, rr = k % 2 ? r * 0.62 : r * 1.25;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a0613'; ctx.beginPath(); ctx.arc(x, y, r * 0.36, 0, TAU); ctx.fill();
}

// ---------- loop ----------
let last = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000 || 0, 1 / 30);
  last = now;
  if (!G.paused && !G.manual) update(dt);
  render();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
resize();
finishRun();
reset();
$('#homeBest').textContent = S.best;
hud();
checkDaily();
if (document.fonts && document.fonts.load) document.fonts.load('800 16px Unbounded').catch(() => {});
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor && document.querySelector('link[rel="manifest"]')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__loopstar = { G, S: () => S, update, tap, render, resize, W, FLY_SPEED, BURN_TIME };
})();
