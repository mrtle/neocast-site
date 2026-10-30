// neocast.us/play: Start from scratch (Martin, Oct 29 2026). The page draws; assets/play/engine.mjs decides.
// Flow: intro → chapters (heading alone) → cards → readings → the reveal (your own map) → review (what saves) →
// sign up on the Neocast app, which saves it all to the account and opens the map. "Save & start" works at any point.
// Progress lives in this browser (localStorage) until it's saved; a link from the app (#continue=…) picks it up again.
import { createEngine } from './engine.mjs?v=37676eda';

const doc = document.documentElement, motion = doc.classList.contains('motion');
const D = JSON.parse(document.getElementById('play-data').textContent);
const KEY = 'neocast.play.v1', WEEKS4 = 28 * 864e5;
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sleep = ms => new Promise(r => setTimeout(r, motion ? ms : Math.min(ms, 60)));
const stage = $('[data-card]'), panel = $('[data-map-panel]'), fx = $('[data-fx]');
const stageWrap = $('[data-stage]');
let bank, E, S, map = null, mapMod = null, cur = null, busy = false, credits = new Map(), lastLane = null;

// ---------------------------------------------------------------- images: 3D emoji, app icons, glyph spheres, artwork
function pic(spec, cls = '') {
  if (!spec) return el('span', 'ic ' + cls);
  const [kind, val] = [spec.slice(0, spec.indexOf('/')), spec.slice(spec.indexOf('/') + 1)];
  if (kind === 'e' || kind === 'art') {
    const i = new Image(); i.className = `ic ${kind === 'art' ? 'art' : ''} ${cls}`; i.alt = ''; i.decoding = 'async'; i.draggable = false;
    i.src = D.base + spec + (kind === 'e' ? '.webp' : '');
    return i;
  }
  if (kind === 'app') {
    const a = E.apps.get(val), n = el('span', 'ic app ' + cls); n.setAttribute('role', 'img'); n.setAttribute('aria-label', a ? a.n : '');
    if (a) sprite(n, D.apps600[Math.floor(a.cell / (bank.appGrid.cols ** 2))], a.cell % (bank.appGrid.cols ** 2), bank.appGrid);
    return n;
  }
  if (kind === 'glyph') { const n = el('span', 'ic gly ' + cls); sprite(n, D.glyphs, +val, { cols: 8, cell: 256, gut: 6, size: 2048 }); return n; }
  return el('span', 'ic ' + cls);
}
// a cell of an atlas as a CSS sprite, sized to the element once it has a size
function sprite(n, url, c, g) {
  n.style.backgroundImage = `url(${url})`;
  const set = () => {
    const w = n.getBoundingClientRect().width || 48, k = w / (g.cell - 2 * g.gut);
    n.style.backgroundSize = (g.size * k).toFixed(1) + 'px';
    n.style.backgroundPosition = `${(-((c % g.cols) * g.cell + g.gut) * k).toFixed(1)}px ${(-(Math.floor(c / g.cols) * g.cell + g.gut) * k).toFixed(1)}px`;
  };
  requestAnimationFrame(set); if (window.ResizeObserver) new ResizeObserver(set).observe(n);
}
const TINTS = ['rgba(253,144,19,.16)', 'rgba(253,49,85,.14)', 'rgba(228,9,207,.12)', 'rgba(67,21,255,.10)'];
const tint = s => TINTS[[...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length];
const KIND = { music: 'Artist', person: 'Famous face', creator: 'Creator', show: 'Show', movie: 'Movie', franchise: 'Franchise', game: 'Game', book: 'Book', podcast: 'Podcast', food: 'Food', place: 'Place', activity: 'Activity', thing: 'Hot take' };

// ---------------------------------------------------------------- the person's device, quietly (weak evidence only)
function readMeta() {
  const ua = navigator.userAgent || '', now = new Date();
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
  const device = /iPhone/.test(ua) ? 'an iPhone' : /iPad/.test(ua) || (ios && !/iPhone/.test(ua)) ? 'an iPad' : android ? (/Mobile/.test(ua) ? 'an Android phone' : 'an Android tablet') : /Mac OS X/.test(ua) ? 'a Mac' : /Windows/.test(ua) ? 'a Windows PC' : /CrOS/.test(ua) ? 'a Chromebook' : 'a computer';
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  return { device, os: ios ? 'iOS' : android ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'other', tz, hour: now.getHours(), minute: now.getMinutes() };
}

// ---------------------------------------------------------------- saving progress in this browser
function saveLocal() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, bank: bank.v, seed: S.seed, meta: S.meta, log: E.toLog(S), savedAt: Date.now() })); return true; }
  catch (e) { try { sessionStorage.setItem(KEY, JSON.stringify({ v: 1, bank: bank.v, seed: S.seed, meta: S.meta, log: E.toLog(S), savedAt: Date.now() })); } catch (e2) {} return false; }
}
function readLocal() {
  let raw = null; try { raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY); } catch (e) {}
  try { const d = raw && JSON.parse(raw); if (d && d.v === 1 && Array.isArray(d.log) && Date.now() - d.savedAt < WEEKS4) return d; } catch (e) {}
  return null;
}
function clearLocal() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {} }
// a link back from the app: #continue=<{ v, bank, log }>
function readContinue() {
  const h = location.hash; if (!h.startsWith('#continue=')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try { const d = JSON.parse(decodeURIComponent(h.slice(10))); if (d && d.v === 1 && Array.isArray(d.log) && d.log.length <= 600) return d; } catch (e) {}
  return null;
}

// ---------------------------------------------------------------- the map behind it all
let litTimer = 0;
async function mountMap(withApps = true) {
  const host = $('[data-map]');
  if (!host || !D.mod) return;
  let ok = false, soft = false;
  try {
    const c = document.createElement('canvas'), g = c.getContext('webgl2'); ok = !!g;
    const ext = g && g.getExtension('WEBGL_debug_renderer_info'), rn = ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rn);
    const lose = g && g.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
  } catch (e) { ok = false; }
  if (/[?&]still3d\b/.test(location.search)) soft = false;
  if (!ok) { if (!$('.poster', host)) { const i = new Image(); i.className = 'poster'; i.alt = ''; i.src = D.poster; host.append(i); } return; }
  try { mapMod ||= await import(D.mod); } catch (e) { return; }
  const st = S ? E.status(S) : { lit: {}, appsOn: [] };
  const apps = (withApps ? st.appsOn : []).map(k => E.apps.get(k)).filter(Boolean);
  // at most eight per area on the map (the rest are still saved)
  const per = {}; const shown = apps.filter(a => (per[a.area] = (per[a.area] || 0) + 1) <= 8);
  if (map) { try { map.destroy(); } catch (e) {} map = null; }
  const still = !motion || /[?&]still3d\b/.test(location.search);
  map = mapMod.mount(host, {
    cats: D.cats, apps: shown.map(a => ({ k: a.k, cat: a.area, cell: a.cell, color: a.color || '#ffffff' })), atlases: D.apps600, glyphs: D.glyphs, grid: bank.appGrid,
    still, lite: soft, p: mapMod.stepP(2, D.cats.length), open: 1, game: true, lit: st.lit, onFrame: onFrame,
  });
  map.frame = { top: 12, bottom: host.clientHeight - 64 };
  window.__playMap = map;
}
const labs = new Map();
function onFrame(out) {
  const box = $('[data-labels]'); if (!box) return;
  const st = S ? E.status(S) : null, lit = st ? st.lit : {};
  const maxL = box.clientHeight < 320 ? 4 : box.clientHeight < 520 ? 6 : 9;
  const order = Object.entries(lit).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > .3).slice(0, maxL).map(([k]) => k);
  const show = new Set(order); if (lastLane) show.add(lastLane);
  for (const c of D.cats) {
    let n = labs.get(c.k);
    const q = out.cats[c.k];
    const on = show.has(c.k) && q && q.on > .4 && q.front && !q.behind;
    if (!n) { if (!on) continue; n = el('span', 'pl-lab', c.name); box.append(n); labs.set(c.k, n); }
    n.classList.toggle('on', !!on);
    n.classList.toggle('hot', c.k === lastLane);
    if (on) n.style.transform = `translate(${(q.x - n.offsetWidth / 2).toFixed(1)}px,${(q.y + q.r + 6).toFixed(1)}px)`;
  }
  const you = $('[data-you]'); if (you && out.you) { you.style.left = out.you.x + 'px'; you.style.top = out.you.y + 'px'; you.classList.add('on'); }
  const th = $('[data-think]'); if (th && out.you) { th.style.left = out.you.x + 'px'; th.style.top = out.you.y + 'px'; }
}
function updateMap(touched) {
  const st = E.status(S);
  if (map) { map.lit = st.lane ? { ...st.lit, [st.lane]: Math.max(st.lit[st.lane] || 0, .8) } : st.lit; for (const k of touched || []) if (k) map.pulse(k); }
  const lane = st.lane;
  if (lane !== lastLane) { lastLane = lane; if (map && lane) map.pulse(lane); }
  meter(st.pct);
  laneChip(lane);
  dots(Math.floor(S.chapter));
  const c = $('[data-count]'); if (c) c.textContent = S.answers ? `${S.answers} answer${S.answers === 1 ? '' : 's'}` : '';
}
let shownPct = 0;
function meter(p) {
  const n = $('[data-pct]'), b = $('[data-meterbar]'); if (!n) return;
  b.style.width = p + '%';
  const from = shownPct, t0 = performance.now(); shownPct = p;
  if (!motion) { n.textContent = p; return; }
  (function roll(now) { const k = clamp((now - t0) / 560), e = 1 - Math.pow(1 - k, 3); n.textContent = Math.round(from + (p - from) * e); if (k < 1) requestAnimationFrame(roll); })(t0);
}
function laneChip(area) {
  const chip = $('[data-lane]'); if (!chip) return;
  if (!area) { chip.classList.remove('on'); return; }
  const a = E.areas.find(x => x.k === area); if (!a) return;
  chip.replaceChildren(pic('glyph/' + a.g, 'gly'), el('span', null, a.name)); chip.classList.add('on');
}
function dots(ch) {
  const box = $('[data-dots]'); if (!box) return;
  if (!box.children.length) for (let i = 1; i <= 5; i++) box.append(el('i'));
  [...box.children].forEach((d, i) => { d.classList.toggle('on', i + 1 === Math.min(5, ch)); d.classList.toggle('done', i + 1 < ch); });
}

// ---------------------------------------------------------------- effects
function rings(x, y) {
  if (!motion) return;
  const cols = ['#FD9013', '#FD3155', '#F0207F', '#E409CF', '#A512E6', '#6A14F8', '#4315FF'];
  cols.forEach((c, i) => { const r = el('i', 'ring'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.borderColor = c; r.style.setProperty('--r', (Math.max(innerWidth, innerHeight) * (.5 + i * .16)) + 'px'); r.style.animationDelay = (i * 32) + 'ms'; fx.append(r); setTimeout(() => r.remove(), 1300); });
  const f = el('i', 'flash'); fx.append(f); setTimeout(() => f.remove(), 400);
}
function stamp(text, grey) {
  const s = el('div', 'stamp' + (grey ? ' grey' : '')); s.append(el('i', 'hole'), el('span', null, text));
  stage.append(s); setTimeout(() => s.remove(), motion ? 950 : 700);
}
function zap(node, ms) {
  if (!motion || !node) return;
  const r = node.getBoundingClientRect(), z = el('span', 'zap', `⚡ ${(ms / 1000).toFixed(1)}s`);
  z.style.left = (r.left + r.width / 2) + 'px'; z.style.top = (r.top - 8) + 'px'; fx.append(z); setTimeout(() => z.remove(), 1200);
}

// ---------------------------------------------------------------- timing: from the moment a card can be answered
function tracker() {
  const t = { t0: performance.now(), hidden: 0, hidAt: 0, h: 0, ch: 0, hov: new Map() };
  t.onVis = () => { if (document.hidden) t.hidAt = performance.now(); else if (t.hidAt) { t.hidden += performance.now() - t.hidAt; t.hidAt = 0; } };
  document.addEventListener('visibilitychange', t.onVis);
  t.ms = () => Math.max(0, Math.round(performance.now() - t.t0 - t.hidden));
  // hovering another option for a beat before choosing reads as a near-miss
  t.watch = (node, value) => {
    node.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') t.hov.set(value, performance.now()); });
    node.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; const s = t.hov.get(value); if (s && performance.now() - s > 250) t.h++; t.hov.delete(value); });
  };
  t.done = () => document.removeEventListener('visibilitychange', t.onVis);
  return t;
}

// ---------------------------------------------------------------- flow
async function swap(build) {
  const old = stage.firstElementChild;
  if (old && motion) { old.classList.add('leave'); await sleep(230); }
  stage.replaceChildren();
  const box = el('div', 'pl-in' + (motion ? ' enter' : ''));
  build(box); stage.append(box);
  stageWrap.scrollTop = 0;
  busy = false;
  return box;
}
// a screen's own buttons (and its timer) move on once, however many times they fire
function advance() { if (busy) return; busy = true; step(); }
function step() {
  const s = E.next(S);
  saveLocal();
  if (s.kind === 'chapter') return showChapter(s);
  if (s.kind === 'reading') return showReading(s);
  if (s.kind === 'reveal' || s.kind === 'end') return showReveal(s.kind === 'end');
  if (s.kind === 'card') return showCard(s.card);
}
function heading(text, cls) {
  // display line: each word in its own mask, the last word in the gradient
  const h = el('h2', cls); const words = text.split(' ');
  words.forEach((w, i) => {
    const m = el('span', 'w'), wi = el('span', 'wi' + (i === words.length - 1 ? ' gt' : '')); wi.textContent = w; wi.style.setProperty('--i', i);
    m.append(wi); h.append(m); if (i < words.length - 1) h.append(' ');
  });
  return h;
}
async function showChapter(s) {
  cur = null;
  if (s.n === 2 || s.n === 4 || s.n === 6) mountMap(true);

  const box = await swap(b => {
    b.classList.add('pl-title');
    b.append(el('p', 'n', s.n <= 5 ? `Chapter ${s.n} of 5` : 'Bonus'), heading(s.title, ''), el('p', null, s.sub));
    const go = el('button', 'btn pri', 'Let’s go'); go.style.marginTop = '30px'; go.style.alignSelf = 'flex-start';
    go.onclick = () => { clearTimeout(t); advance(); }; b.append(go);
  });
  updateMap();
  const t = setTimeout(() => { if (box.isConnected) advance(); }, motion ? 2600 : 1200);
  keyOnce(k => { if (k === 'Enter' || k === ' ') { clearTimeout(t); advance(); return true; } });
}
let keyHandler = null;
function keyOnce(fn) { keyHandler = fn; }
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,[contenteditable]') && e.key !== 'Enter') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (keyHandler && keyHandler(e.key) === true) { e.preventDefault(); keyHandler = null; }
});

async function showCard(card) {
  const t = tracker();
  const build = { tt: buildTT, react: buildReact, tiles: buildTiles, pick: buildPick, multi: buildMulti, rank: buildRank, slider: buildSlider, duel: buildDuel, guess: buildGuess }[card.type];
  if (card.type === 'guess') { await thinking(); }
  await swap(b => build(b, card, t));
  cur = card;
  t.t0 = performance.now() + (motion ? 300 : 0);
  updateMap();
}
async function thinking() {
  panel.classList.add('thinking'); if (map) map.nudge = true;
  await swap(b => { const h = el('div', 'pl-hmm'); h.append(el('span', 'orb'), el('p', null, 'Hmm… let me guess.')); b.append(h); });
  await sleep(1000);
  panel.classList.remove('thinking'); if (map) map.nudge = false;
}
async function submit(card, value, t, node) {
  if (busy || card !== cur) return; busy = true; cur = null;   // one answer per card, never to a card that's leaving
  t.done(); keyHandler = null;
  const ms = t.ms(), at = Math.round(performance.now() - (window.__playT0 || 0));
  const res = E.answer(S, card, value, { ms, h: t.h, ch: t.ch, at });
  saveLocal();
  const touched = [card.area, card.item?.area];
  if (card.type === 'duel' && res.kept) touched.push(res.kept);
  if (card.id.startsWith('guess:app:')) touched.push(E.apps.get(card.id.split(':')[2])?.area);
  if (res.flag === 'fast' && node) zap(node, ms);
  if (card.type === 'guess' && res.hit != null) {
    const r = (node || stage).getBoundingClientRect();
    if (res.hit) { rings(r.left + r.width / 2, r.top + r.height / 2); stamp(res.line); }
    else { stage.classList.add('shake'); setTimeout(() => stage.classList.remove('shake'), 420); stamp(res.line, true); }
    updateMap(touched);
    await sleep(900);
  } else {
    updateMap(touched);
    await sleep(card.type === 'tiles' || card.type === 'multi' ? 220 : 160);
  }
  step();
}

// ---------------------------------------------------------------- card builders
function head(b, card, eyebrow) {
  if (eyebrow) b.append(el('p', 'pl-eyebrow', eyebrow));
  const q = el('h1', 'pl-q', card.q); q.tabIndex = -1; b.append(q);
  if (card.sub) b.append(el('p', 'pl-sub', card.sub));
  requestAnimationFrame(() => q.focus({ preventScroll: true }));
}
function keys(text) { const p = el('p', 'pl-keys'); p.innerHTML = text; return p; }

function buildTT(b, card, t) {
  head(b, card);
  const row = el('div', 'tt pl-body'), nodes = [];
  card.opts.forEach((o, i) => {
    const n = el('button', 'tt-o'); n.type = 'button'; n.style.setProperty('--tint', tint(o.label));
    n.append(el('span', 'bg'), pic(o.img), el('b', null, o.label));
    n.onclick = () => { n.classList.add('sel'); submit(card, o.value, t, n); };
    t.watch(n, o.value); tilt(n); row.append(n); nodes.push(n);
  });
  b.append(row);
  const x = el('div', 'tt-x'); card.extra.forEach(o => { const c = el('button', 'chip', o.label); c.type = 'button'; c.onclick = () => submit(card, o.value, t, c); x.append(c); });
  b.append(x, keys('<kbd>←</kbd> <kbd>→</kbd> to pick, <kbd>B</kbd> both, <kbd>N</kbd> neither'));
  keyOnce(k => {
    if (k === 'ArrowLeft') { nodes[0].click(); return true; } if (k === 'ArrowRight') { nodes[1].click(); return true; }
    if (k === 'b' || k === 'B') { submit(card, 'both', t); return true; } if (k === 'n' || k === 'N') { submit(card, 'neither', t); return true; }
  });
}
function tilt(n) {
  if (!motion || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  n.addEventListener('pointermove', e => { const r = n.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; n.style.transform = `perspective(900px) rotateY(${(x * 9).toFixed(2)}deg) rotateX(${(-y * 9).toFixed(2)}deg)`; });
  n.addEventListener('pointerleave', () => { n.style.transform = ''; });
}
function buildReact(b, card, t) {
  const it = card.item, wrap = el('div', 'it');
  const artCard = el('div', 'it-card' + (it.img.startsWith('e/') ? ' emo' : ''));
  artCard.style.setProperty('--tint', tint(it.n));
  artCard.append(pic(it.img), el('span', 'kind', KIND[it.kind] || 'Hot take'));
  if (it.img.startsWith('art/')) { const c = credits.get(it.id); if (c) artCard.append(el('span', 'cr', `${c.provider || ''}`)); }
  const st = el('span', 'stampx'); artCard.append(st);
  const right = el('div');
  right.append(el('p', 'pl-eyebrow', card.q));
  const name = el('h1', 'it-name', it.n); name.tabIndex = -1; right.append(name);
  const tried = card.opts.filter(o => o.group === 'tried'), fresh = card.opts.filter(o => o.group === 'new');
  const ans = el('div', 'ans'), row = el('div', 'ans-col');
  const byVal = {};
  let k = 1;
  const mk = (o, small) => {
    const p = el('button', 'pill' + (small ? ' sm' : '') + (o.value === 'love' ? ' love' : o.value === 'nope' ? ' no' : ''));
    p.type = 'button'; p.append(el('span', null, o.label), el('span', 'k', String(k++)));
    p.onclick = () => { p.classList.add('sel'); submit(card, o.value, t, p); };
    t.watch(p, o.value); byVal[o.value] = p; return p;
  };
  tried.forEach(o => row.append(mk(o)));
  ans.append(row);
  if (fresh.length) { const nr = el('div', 'ans-new'); fresh.forEach(o => nr.append(mk(o, true))); ans.append(nr); }
  right.append(ans);
  right.append(keys('<kbd>→</kbd> love, <kbd>←</kbd> not for me, or the number keys'));
  wrap.append(artCard, right); b.append(wrap);
  requestAnimationFrame(() => name.focus({ preventScroll: true }));
  const all = [...tried, ...fresh];
  keyOnce(key => {
    if (key === 'ArrowRight' && byVal.love) { byVal.love.click(); return true; }
    if (key === 'ArrowLeft' && byVal.nope) { byVal.nope.click(); return true; }
    if (key === 'ArrowUp' && byVal.want) { byVal.want.click(); return true; }
    const i = +key; if (i >= 1 && i <= all.length) { byVal[all[i - 1].value].click(); return true; }
  });
  swipe(artCard, st, dir => {
    const v = dir === 'r' ? 'love' : dir === 'l' ? 'nope' : dir === 'u' ? (byVal.want ? 'want' : null) : (byVal.unknown ? 'unknown' : byVal.pass ? 'pass' : null);
    if (v && byVal[v]) byVal[v].click(); else return false;
  });
}
// swipe the card: right love, left not for me, up want to try, down never heard / pass
function swipe(n, st, done) {
  let x0 = 0, y0 = 0, on = false, id = 0;
  n.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; on = true; id = e.pointerId; x0 = e.clientX; y0 = e.clientY; n.setPointerCapture(id); n.style.transition = 'none'; });
  n.addEventListener('pointermove', e => {
    if (!on || e.pointerId !== id) return; const dx = e.clientX - x0, dy = e.clientY - y0;
    n.style.transform = `translate(${dx}px,${dy * .6}px) rotate(${dx / 18}deg)`;
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy < 0 ? 'u' : 'd'), mag = Math.max(Math.abs(dx), Math.abs(dy));
    st.className = 'stampx ' + (d === 'r' ? 'love' : d === 'l' ? 'no' : 'want'); st.textContent = d === 'r' ? 'Love' : d === 'l' ? 'Nope' : d === 'u' ? 'Want to' : 'Never';
    st.style.opacity = clamp((mag - 30) / 60); st.style.transform = `translate(-50%,-50%) rotate(-10deg) scale(${.7 + .3 * clamp((mag - 30) / 60)})`;
  });
  const end = e => {
    if (!on || e.pointerId !== id) return; on = false; n.style.transition = '';
    const dx = e.clientX - x0, dy = e.clientY - y0, mag = Math.max(Math.abs(dx), Math.abs(dy));
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy < 0 ? 'u' : 'd');
    if (mag > 90 && done(d) !== false) { n.style.transform = `translate(${dx * 3}px,${dy * 2}px) rotate(${dx / 10}deg)`; return; }
    n.style.transform = ''; st.style.opacity = 0;
  };
  n.addEventListener('pointerup', end); n.addEventListener('pointercancel', end);
}
const BADGE = { like: '✓', love: '♥', nope: '✕', want: '+', use: '✓', used: '↺', yes: '✓' };
function buildTiles(b, card, t) {
  head(b, card);
  const states = card.states, nS = states.length, chosen = new Map(), order = [];
  if (nS > 1) {
    const lg = el('div', 'legend');
    states.forEach((s, i) => { const sp = el('span', `s${i + 1}${s.s === 'want' ? ' want' : ''}`); sp.append(el('b', null, BADGE[s.s] || '✓'), document.createTextNode(`${['Once', 'Twice', 'Three times'][i]}: ${s.label.toLowerCase()}`)); lg.append(sp); });
    b.append(lg);
  }
  const grid = el('div', 'tiles pl-body');
  const meta = el('span', 'meta', '');
  const count = () => { const n = chosen.size; meta.textContent = n ? `${n} picked` : ''; done.textContent = n ? 'Done' : 'Skip for now'; done.classList.toggle('pri', n > 0); };
  card.opts.forEach(o => {
    const n = el('button', 'tl'); n.type = 'button';
    const bd = el('span', 'bd');
    n.append(pic(o.img), el('span', null, o.label), bd);
    n.setAttribute('aria-pressed', 'false');
    n.onclick = () => {
      const s = ((chosen.get(o.value) || 0) + 1) % (nS + 1);
      n.classList.remove('st1', 'st2', 'st3', 'pop'); void n.offsetWidth;
      if (s) { chosen.set(o.value, s); n.classList.add('st' + s, 'pop'); if (states[s - 1].s === 'want') n.classList.add('want'); else n.classList.remove('want'); bd.className = `bd s${s}${states[s - 1].s === 'want' ? ' want' : ''}`; bd.textContent = BADGE[states[s - 1].s] || '✓'; if (!order.includes(o.value)) order.push(o.value); }
      else { chosen.delete(o.value); t.ch++; const i = order.indexOf(o.value); if (i >= 0) order.splice(i, 1); }
      n.setAttribute('aria-pressed', s ? 'true' : 'false'); n.setAttribute('aria-label', `${o.label}${s ? ': ' + states[s - 1].label : ''}`);
      count();
    };
    grid.append(n);
  });
  b.append(grid);
  const foot = el('div', 'pl-foot');
  const none = el('button', 'chip', card.none || 'None of these'); none.type = 'button';
  none.onclick = () => submit(card, ['none'], t, none);
  const done = el('button', 'btn', 'Skip for now'); done.type = 'button';
  done.onclick = () => submit(card, order.map(v => ['', '+', '++', '-'][chosen.get(v)] + v), t, done);
  foot.append(none, meta, done); b.append(foot);
  b.append(keys('Tap a tile again to change it. <kbd>Enter</kbd> when you’re done.'));
  count();
  keyOnce(k => { if (k === 'Enter') { done.click(); return true; } });
}
function optButton(o, cls = 'op') {
  const n = el('button', cls); n.type = 'button';
  if (o.img) n.append(pic(o.img)); n.append(el('span', null, o.label), el('i', 'n'));
  return n;
}
function buildPick(b, card, t) {
  head(b, card);
  const box = el('div', 'opts pl-body' + (card.opts.length <= 4 ? ' few' : ''));
  const nodes = card.opts.map((o, i) => { const n = optButton(o); n.onclick = () => { n.classList.add('sel'); submit(card, o.value, t, n); }; t.watch(n, o.value); box.append(n); return n; });
  b.append(box, keys('Number keys work too.'));
  keyOnce(k => { const i = +k; if (i >= 1 && i <= nodes.length) { nodes[i - 1].click(); return true; } });
}
function buildMulti(b, card, t) {
  head(b, card);
  const sel = [], box = el('div', 'opts pl-body');
  const meta = el('span', 'meta'), done = el('button', 'btn pri', 'Done'); done.type = 'button';
  const refresh = () => { meta.textContent = !sel.length ? (card.max && card.max < card.opts.length ? `Pick up to ${card.max}` : '') : card.max && card.max < card.opts.length ? `${sel.length} of ${card.max}` : `${sel.length} picked`; done.disabled = sel.length < (card.min || 0); };
  card.opts.forEach(o => {
    const n = optButton(o);
    n.onclick = () => {
      const i = sel.indexOf(o.value);
      if (i >= 0) { sel.splice(i, 1); n.classList.remove('sel'); t.ch++; }
      else {
        if (card.max && sel.length >= card.max) { const old = sel.shift(); box.querySelector(`[data-v="${CSS.escape(old)}"]`)?.classList.remove('sel'); }
        // "none" style options clear the rest
        if (/^(none|nothing|no)$/.test(o.value)) { sel.splice(0); box.querySelectorAll('.op.sel').forEach(x => x.classList.remove('sel')); }
        else { const ni = sel.findIndex(v => /^(none|nothing|no)$/.test(v)); if (ni >= 0) { box.querySelector(`[data-v="${CSS.escape(sel[ni])}"]`)?.classList.remove('sel'); sel.splice(ni, 1); } }
        sel.push(o.value); n.classList.add('sel');
      }
      refresh();
    };
    n.dataset.v = o.value; box.append(n);
  });
  done.onclick = () => submit(card, sel.slice(), t, done);
  const foot = el('div', 'pl-foot'); foot.append(meta, done);
  b.append(box, foot); refresh();
  keyOnce(k => { if (k === 'Enter' && !done.disabled) { done.click(); return true; } });
}
function buildRank(b, card, t) {
  head(b, card);
  const sel = [], box = el('div', 'opts pl-body');
  const nodes = new Map();
  const paint = () => { for (const [v, n] of nodes) { const i = sel.indexOf(v); n.classList.toggle('sel', i >= 0); n.querySelector('.n').textContent = i >= 0 ? String(i + 1) : ''; } };
  card.opts.forEach(o => {
    const n = optButton(o); nodes.set(o.value, n);
    n.onclick = () => {
      const i = sel.indexOf(o.value); if (i >= 0) { sel.splice(i, 1); t.ch++; } else if (sel.length < (card.max || 3)) sel.push(o.value);
      paint(); if (sel.length === (card.max || 3)) setTimeout(() => { if (sel.length === (card.max || 3)) submit(card, sel.slice(), t, n); }, 450);
    };
    box.append(n);
  });
  b.append(box);
}
function buildSlider(b, card, t) {
  head(b, card);
  const box = el('div', 'sl pl-body'), v = el('span', 'sl-v'), inp = document.createElement('input');
  inp.type = 'range'; inp.min = card.min; inp.max = card.max; inp.step = card.step || 1; inp.value = Math.round((card.min + card.max) / 2 / (card.step || 1)) * (card.step || 1);
  inp.setAttribute('aria-label', card.q);
  const mark = card.marks ? new Image() : null; if (mark) { mark.className = 'sl-mark'; mark.alt = ''; }
  let moved = false;
  const fmt = x => card.money ? (x >= card.max ? `$${x}+` : `$${x}`) : x >= card.max && card.right?.endsWith('+') ? `${x}+` : String(x);
  const draw = () => {
    const x = +inp.value, p = (x - card.min) / (card.max - card.min);
    v.textContent = fmt(x); inp.style.setProperty('--p', (p * 100).toFixed(1) + '%');
    if (mark) { const i = Math.round(p * (card.marks.length - 1)); mark.src = D.base + card.marks[i] + '.webp'; }
  };
  inp.oninput = () => { moved = true; draw(); };
  const top = el('div'); top.append(v); if (mark) top.append(mark);
  const ends = el('div', 'sl-ends'); ends.append(el('span', null, card.left || ''), el('span', null, card.right || ''));
  box.append(top, inp, ends); b.append(box);
  const foot = el('div', 'pl-foot'), go = el('button', 'btn pri', 'Lock it in'); go.type = 'button';
  go.onclick = () => submit(card, +inp.value, t, go);
  foot.append(go); b.append(foot); draw();
  keyOnce(k => { if (k === 'Enter') { go.click(); return true; } });
}
function buildDuel(b, card, t) {
  head(b, card);
  const row = el('div', 'duel pl-body');
  const nodes = card.opts.map(o => { const n = el('button', 'tt-o'); n.type = 'button'; n.style.setProperty('--tint', tint(o.value)); n.append(el('span', 'bg'), pic(o.img), el('b', null, o.label)); n.onclick = () => { n.classList.add('sel'); submit(card, o.value, t, n); }; t.watch(n, o.value); tilt(n); return n; });
  row.append(nodes[0], el('span', 'vs', 'vs'), nodes[1]); b.append(row);
  const x = el('div', 'tt-x'); card.extra.forEach(o => { const c = el('button', 'chip', o.label); c.type = 'button'; c.onclick = () => submit(card, o.value, t, c); x.append(c); });
  b.append(x);
  keyOnce(k => { if (k === 'ArrowLeft') { nodes[0].click(); return true; } if (k === 'ArrowRight') { nodes[1].click(); return true; } });
}
function buildGuess(b, card, t) {
  const g = el('div', 'gs');
  const art = el('div', 'gs-art');
  if (card.img) art.append(pic(card.img)); else { const o = el('span', 'orb'); o.style.cssText = 'width:58%;height:58%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffd1f1 0%,#ff6fd0 28%,#e21fc0 58%,#7a16d0 100%);box-shadow:0 18px 40px -14px rgba(228,9,207,.65)'; art.append(o); }
  const right = el('div');
  right.append(el('p', 'pl-eyebrow g', 'My guess'));
  const q = el('h1', 'pl-q', card.q); q.tabIndex = -1; right.append(q);
  const sure = el('div', 'gs-sure'), bar = el('span', 'bar'), fill = el('i'), pctN = el('b', null, card.sub || '');
  bar.append(fill); sure.append(bar, pctN); right.append(sure);
  setTimeout(() => { fill.style.width = Math.round(clamp(card.p || .7, .5, .97) * 100) + '%'; }, 120);
  const ans = el('div', 'ans'), row = el('div', 'ans-row'); row.style.setProperty('--n', Math.min(4, card.opts.length));
  const nodes = card.opts.map((o, i) => { const p = el('button', 'pill' + (i === 0 ? ' love' : '')); p.type = 'button'; p.append(el('span', null, o.label), el('span', 'k', String(i + 1))); p.onclick = () => submit(card, o.value, t, art); t.watch(p, o.value); row.append(p); return p; });
  ans.append(row); right.append(ans);
  g.append(art, right); b.append(g);
  requestAnimationFrame(() => q.focus({ preventScroll: true }));
  keyOnce(k => { const i = +k; if (i >= 1 && i <= nodes.length) { nodes[i - 1].click(); return true; } });
}

// ---------------------------------------------------------------- readings, the reveal, the review
async function showReading(r) {
  cur = null;
  mountMap(true);
  const box = await swap(b => {
    b.classList.add('pl-rd');
    b.append(el('p', 'pl-eyebrow g', `So far · ${r.pct}% of you`));
    b.append(heading(['', 'That was quick.', 'Your world, mapped.', 'Now I really see you.', 'Last stretch.'][r.n] || 'So far.', 'pl-q'));
    const pnl = el('div', 'glass panel'); pnl.style.marginTop = '28px';
    const ul = el('ul', 'lines'); r.lines.forEach((l, i) => { const li = el('li'); li.append(...wordsOf(l, i * 5)); ul.append(li); }); pnl.append(ul);
    if (r.tells?.length) { const tl = el('div', 'tells'); r.tells.forEach(x => tl.append(el('p', null, x))); pnl.append(tl); }
    const st = el('div', 'stamps');
    const tr = E.profile(S).traits.filter(x => Math.abs(x.v) > .35).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3);
    tr.forEach(x => st.append(el('span', null, x.label)));
    r.top.slice(0, 3).forEach(a => st.append(el('span', 'w2', a.name)));
    pnl.append(st); b.append(pnl);
    if (r.guesses?.made) b.append(el('p', 'pl-fine', `${r.guesses.hits} of ${r.guesses.made} guesses right so far.`));
    const act = el('div', 'pl-actions');
    const go = el('button', 'btn pri', 'Keep going'); go.type = 'button'; go.onclick = () => advance();
    const sv = el('button', 'btn', 'Save & start'); sv.type = 'button'; sv.onclick = () => showReview();
    act.append(go, sv); b.append(act);
  });
  updateMap();
  keyOnce(k => { if (k === 'Enter') { advance(); return true; } });
}
function wordsOf(text, offset = 0) {
  return text.split(' ').flatMap((w, i, a) => { const m = el('span', 'w'), wi = el('span', 'wi', w); wi.style.setProperty('--i', i + offset); m.append(wi); return i < a.length - 1 ? [m, document.createTextNode(' ')] : [m]; });
}
async function showReveal(ended) {
  cur = null;
  mountMap(true);
  lastLane = null;
  const P = E.profile(S);
  const top = [...P.areas].sort((a, b) => b.score - a.score).slice(0, 5);
  await swap(b => {
    b.classList.add('pl-reveal');
    b.append(el('p', 'pl-eyebrow g', `${E.status(S).pct}% of you, figured out`));
    b.append(heading('This is you.', 'pl-q'));
    b.append(el('p', 'pl-sub', `${P.archetype.name}. ${P.archetype.line}`));
    const grid = el('div', 'grid2'); grid.style.marginTop = '28px';
    const rw = el('div', 'glass rw');
    const topRow = el('div', 'rw-top'), logo = new Image(); logo.src = D.lockup; logo.alt = 'Neocast';
    topRow.append(logo, el('span', 'priv', 'Private'));
    const bars = el('div', 'rw-bars'); for (let i = 0; i < 6; i++) bars.append(el('i', i < 4 ? 'on' : ''));
    rw.append(topRow, bars, el('h3', null, 'Your biggest areas'));
    top.forEach((a, i) => {
      const row = el('div', 'rw-row'), area = E.areas.find(x => x.k === a.k);
      const bits = [...P.apps.use.filter(x => x.area === a.k).map(x => x.n), ...P.items.filter(x => x.area === a.k && x.s === 'love').map(x => x.n)].slice(0, 3);
      const tx = el('div'); tx.append(el('b', null, a.name), el('small', null, bits.join(' · ') || 'Part of your life'));
      row.append(el('span', 'rk', String(i + 1)), pic('glyph/' + area.g), tx, el('span', 'pc', Math.round(a.score * 100) + '%'));
      rw.append(row);
    });
    const side = el('div', 'side');
    const st = el('div', 'stamps'); st.style.margin = '0';
    st.append(el('span', null, P.archetype.name.replace(/^The /, '')));
    P.traits.filter(x => Math.abs(x.v) > .4).slice(0, 2).forEach(x => st.append(el('span', 'w2', x.label)));
    side.append(st);
    if (P.apps.use.length) { const m = el('div', 'glass mini'); m.append(el('h4', null, `${P.apps.use.length} apps on your map`)); const r = el('div', 'appsrow'); P.apps.use.slice(0, 18).forEach(a => r.append(pic('app/' + a.k))); m.append(r); side.append(m); }
    if (P.estimates.length) {
      const m = el('div', 'glass mini'); m.append(el('h4', null, 'My best guesses'));
      const dl = el('dl'); P.estimates.slice(0, 6).forEach(e => { const dd = el('dd', null, e.value + ' '); dd.append(el('small', null, e.confirmed ? '' : '· estimate')); dl.append(el('dt', null, e.label), dd); });
      m.append(dl); side.append(m);
    }
    grid.append(rw, side); b.append(grid);
    const act = el('div', 'pl-actions');
    const sv = el('button', 'btn pri xl', 'Save my map'); sv.type = 'button'; sv.onclick = () => showReview();
    act.append(sv);
    if (!ended) { const more = el('button', 'btn', 'Keep going'); more.type = 'button'; more.onclick = () => advance(); act.append(more); }
    b.append(act, el('p', 'pl-fine', ended ? 'You answered everything I had. Save it and the app takes it from here.' : 'Every answer sharpens your map. You can keep going now or later.'));
  });
  if (motion) { const r = panel.getBoundingClientRect(); rings(r.left + r.width / 2, r.top + r.height / 2); }
  updateMap();
}
async function showReview() {
  cur = null; keyHandler = null;
  const groups = E.review(S), off = new Set();
  await swap(b => {
    const w = el('div', 'glass ctl');
    const chrome = el('div', 'ctl-chrome'), logo = new Image(); logo.src = D.lockup; logo.alt = 'Neocast';
    chrome.append(el('i'), el('i'), el('i'), logo); w.append(chrome);
    const inn = el('div', 'ctl-in');
    inn.append(el('h3', null, 'What Neocast saves.'), el('p', 'lead', 'Turn off anything you’d rather keep to yourself. You can change it any time.'));
    for (const g of groups) {
      const sec = el('div', 'grp'), h = el('h4', null, g.title);
      const rows = el('div');
      const LIMIT = 6; let shown = 0;
      g.rows.forEach(r => {
        const row = el('div', 'row'); if (shown >= LIMIT) row.hidden = true; shown++;
        if (r.app) row.append(pic('app/' + r.app));
        const tx = el('div', 'tx'); tx.append(el('b', null, r.label)); if (r.value) tx.append(el('small', null, r.value)); row.append(tx);
        if (r.note) row.append(el('span', 'note', r.note));
        if (r.sensitive) row.append(el('span', 'note', 'Private'));
        const tg = el('button', 'tog'); tg.type = 'button'; tg.setAttribute('role', 'switch'); tg.setAttribute('aria-checked', 'true'); tg.setAttribute('aria-label', `Save ${r.label}`);
        if (r.locked) tg.disabled = true;
        tg.onclick = () => { const on = tg.getAttribute('aria-checked') !== 'true'; tg.setAttribute('aria-checked', String(on)); row.classList.toggle('off', !on); if (on) off.delete(r.key); else off.add(r.key); };
        row.append(tg); rows.append(row);
      });
      if (g.rows.length > LIMIT) { const mo = el('button', 'chip', `Show all ${g.rows.length}`); mo.type = 'button'; mo.onclick = () => { rows.querySelectorAll('.row[hidden]').forEach(x => (x.hidden = false)); mo.remove(); }; sec.append(h, rows, mo); }
      else sec.append(h, rows);
      inn.append(sec);
    }
    const act = el('div', 'pl-actions');
    const go = el('button', 'btn pri xl', 'Save and create my account'); go.type = 'button'; go.onclick = () => handoff('signup', off);
    const login = el('button', 'btn', 'I have an account'); login.type = 'button'; login.onclick = () => handoff('login', off);
    const back = el('button', 'btn plain', 'Keep answering'); back.type = 'button'; back.onclick = () => advance();
    act.append(go, login, back);
    inn.append(act, el('p', 'pl-fine', 'Free. Sign up with Google or email. Your answers stay in this browser until you save them.'));
    w.append(inn); b.append(w);
  });
}
// the hand-off to the app: it signs the person up (or in), saves this to their account and opens their map
function handoff(auth, off) {
  saveLocal();
  const offList = [...off];
  const payload = {
    v: 1, savedAt: Date.now(), bank: bank.v,
    log: filterLog(E.toLog(S), off),
    profile: E.profile(S, { off: offList }),
    memories: E.memories(S, { off: offList }).map(({ category, subject, polarity }) => ({ category, subject, polarity })),
  };
  const tb = E.tastebud(S); if (tb && !offList.some(k => k.startsWith('item:'))) payload.tastebud = tb;
  else if (tb) { for (const id of Object.keys(tb.ratings)) if (off.has('item:' + id)) delete tb.ratings[id]; tb.favs = tb.favs.filter(id => !off.has('item:' + id)); if (Object.keys(tb.ratings).length) payload.tastebud = tb; }
  location.assign(`${D.sesh}/app/onboarding/life?resume=1&handoff=${auth}#life=${encodeURIComponent(JSON.stringify(payload))}`);
}
// what the person turned off doesn't leave the browser in the log either
function filterLog(log, off) {
  if (!off.size) return log;
  const drop = new Set(), dropFact = new Set([...off].filter(k => k.startsWith('fact:')).map(k => k.slice(5)));
  for (const c of bank.cards) if (c.fact && dropFact.has(c.fact)) drop.add(c.id);
  for (const k of dropFact) drop.add('pick:' + k).add('multi:' + k).add('slider:' + k);
  const items = new Set([...off].filter(k => k.startsWith('item:')).map(k => k.slice(5)));
  const apps = new Set([...off].filter(k => k.startsWith('app:')).map(k => k.slice(4)));
  return log.filter(e => !drop.has(e.c) && !(e.c.startsWith('react:') && items.has(e.c.slice(6))) && !(e.c.startsWith('guess:app:') && apps.has(e.c.slice(10))))
    .map(e => Array.isArray(e.v) && e.c.startsWith('apps:') ? { ...e, v: e.v.filter(x => !apps.has(x.replace(/^(\+\+|\+|-)/, ''))) } : e);
}

// ---------------------------------------------------------------- start
async function intro(resume) {
  cur = null;
  await swap(b => {
    b.classList.add('pl-intro');
    if (resume) {
      b.append(heading('Welcome back.', ''), el('p', 'lead', `You’re ${resume.answers} answers in. Pick up where you left off?`));
      const act = el('div', 'pl-actions');
      const go = el('button', 'btn pri xl', 'Keep going'); go.type = 'button'; go.onclick = () => { window.__playT0 = performance.now() - (S.log.at(-1)?.at || 0); advance(); };
      const sv = el('button', 'btn', 'Save & start'); sv.type = 'button'; sv.onclick = () => showReview();
      const over = el('button', 'btn plain', 'Start over'); over.type = 'button'; over.onclick = () => { clearLocal(); S = E.session({ seed: (Math.random() * 1e9) | 0, meta: readMeta() }); updateMap(); intro(null); };
      act.append(go, sv, over); b.append(act);
      return;
    }
    const h = el('h1'); h.append(...wordsOf('Let’s map your')); h.append(' '); const m = el('span', 'w'), wi = el('span', 'wi gt', 'life.'); wi.style.setProperty('--i', 3); m.append(wi); h.append(m);
    b.append(h, el('p', 'lead', 'No apps to connect. No passwords. Answer on instinct and I’ll guess the rest.'));
    const facts = el('div', 'facts'); ['About ten minutes', 'Save and start any time', 'Private to your account'].forEach(x => facts.append(el('span', null, x))); b.append(facts);
    const act = el('div', 'pl-actions');
    const go = el('button', 'btn pri xl', 'Start'); go.type = 'button'; go.innerHTML = 'Start<svg class="arw" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/></svg>';
    go.onclick = () => { window.__playT0 = performance.now(); advance(); };
    act.append(go); b.append(act);
  });
  keyOnce(k => { if (k === 'Enter') { stage.querySelector('.btn.pri')?.click(); return true; } });
}
async function boot() {
  const r = await fetch(D.bank); if (!r.ok) throw Error('bank');
  bank = await r.json();
  for (const c of bank.credits || []) credits.set(c.id, c);
  E = createEngine(bank);
  const cont = readContinue(), local = cont ? null : readLocal();
  const meta = readMeta();
  if (cont) {
    S = E.session({ seed: (Math.random() * 1e9) | 0, meta, log: cont.log });
  } else if (local && local.bank === bank.v) {
    S = E.session({ seed: local.seed, meta: local.meta || meta, log: local.log });
  } else S = E.session({ seed: (Math.random() * 1e9) | 0, meta });
  window.__play = { E, get S() { return S; }, step, showReview };
  dots(0); updateMap(); mountMap(true);
  const save = $('[data-save]'); if (save) save.onclick = () => showReview();
  if (cont) { saveLocal(); window.__playT0 = performance.now() - (S.log.at(-1)?.at || 0); step(); return; }
  intro(S.answers ? { answers: S.answers } : null);
}
boot().catch(e => {
  stage.replaceChildren();
  const p = el('p', 'pl-err', 'The game couldn’t load. Refresh to try again.'); stage.append(p);
  if (window.console) console.warn('play', e && e.message);
});
