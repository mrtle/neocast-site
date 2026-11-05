// Neocast "Start from scratch": the engine behind the game (Martin, Oct 29 2026).
// It learns a whole life from taps, no connections: how much each of the forty areas is part of your life
// (a Beta belief per area), seventeen traits (a Gaussian belief each), the apps you use out of the 600, what you
// love, like, skip or want to try, facts you state, and a few estimates it checks with you (age band, budget band…).
//
// How it chooses: broad to narrow in chapters, then lanes chosen by Thompson sampling on the area beliefs, so a
// broad "no" lowers the odds of a lane without closing it. Every answer is evidence with a weight, never a hard
// filter. Weights follow the person's own response times, measured against their own baseline per card type:
//  - faster than their norm = a stronger preference, slower = more ambivalent (drift-diffusion: response time adds
//    information mainly for strong preferences; Li et al. 2024, "Enhancing Preference-based Linear Bandits via
//    Human Response Time");
//  - answers far faster than anyone reads are treated as careless, not as strong (survey "speeders");
//  - long dwell saturates instead of counting as interest (as in dwell-time reweighting of clicks, e.g. WeChat 2022),
//    and time with the tab hidden is not counted;
//  - hovering over another option before choosing, or changing an answer, reads as conflict (mouse-tracking studies),
//    and the near-miss option gets a little credit.
// Guesses ("I bet Duolingo is on your phone") come from the same beliefs and are only saved as the person answers them.
// The log replays deterministically: profile = f(log), so the server can check what the page saved.
//
// v2 (Martin, Nov 5 2026: "The active learning algorithm has to be real… learn as you go, adapt, make accurate guesses,
// and learn from the guesses' results"):
//  - Birth decade is a real belief that every answer moves (grew-up cards, apps, items, guess results), and every
//    prediction is made per decade and weighed by it: someone who grew up with cassettes is never guessed into IShowSpeed.
//  - Item answers update the decade belief by Bayes' rule: being into it, knowing it but passing, or never having heard
//    of it each say something different about when you were born.
//  - What the person said outright is tracked, so guesses go after what they didn't say (implicit, cross-area), never
//    a repeat of a tap or the other side of a this-or-that.
//  - Questions after the first instincts are no longer a fixed order: each next card is the one expected to teach the
//    most about this person right now (decade, areas, traits, facts), with probes when the decade is still unclear.
//  - Guesses start as early as the fourth answer, whenever one is confident and ambitious enough, and keep coming every
//    few answers. Each kind of guess keeps its own record: misses raise its confidence bar and temper its odds, hits
//    lower the bar, and every result also moves the beliefs behind it.

export const ENGINE_VERSION = 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
// an area counts as "yours" once answers have cut its uncertainty by a fifth (about 6 areas at 10 answers, 12 at 20)
const EVIDENCE = .2;
const sig = x => 1 / (1 + Math.exp(-x));
const AGE = ['z', 'y', 'x', 'o'];
const AGE_LABEL = { z: 'the 2000s', y: 'the 90s', x: 'the 80s', o: 'the 70s or earlier' };
const AGE_PRIOR = { z: .3, y: .32, x: .22, o: .16 };
const AGE_K = 1.6, AGE_MARK = 2.8;   // how far one chosen option moves the decade belief (2.8 on a "grew up with" card)
const YOUNG = { z: 1.7, y: 1.05, x: .4, o: .15 }, OLDER = { z: .3, y: .75, x: 1.35, o: 1.8 };   // app use by decade
const NO_GUESS = new Set(['dating', 'health']);   // never guessed out loud
const logit = p => { const q = Math.min(1 - 1e-4, Math.max(1e-4, p)); return Math.log(q / (1 - q)); };
// how a generation-specific item (g: the decades it belongs to) shifts the odds for each decade
function ageShift(g, b) { if (!g) return 0; let mx = 0; for (const v of Object.values(g)) mx = Math.max(mx, v); if (!mx) return 0; const gb = g[b] || 0; return gb > 0 ? 1.7 * gb - .35 * mx : -2.6 * mx; }
const H4 = p => -Object.values(p).reduce((s, x) => s + (x > 0 ? x * Math.log2(x) : 0), 0);   // 0 (sure) to 2 bits
const PFX = ['', '+', '++', '-'];  // tile states in the log: +v once, ++v twice, -v three times
// typical answer times (ms) per card type before we know the person's own pace
const BASE = { tt: 1800, react: 2600, pick: 3400, multi: 6500, rank: 7000, slider: 3800, duel: 3600, guess: 2600, tiles: 8000 };
const STANCE_W = { love: 1, like: .55, meh: .15, nope: -.7, want: .3, wish: .35, pass: -.35, unknown: 0, cant: 0, use: .8, used: .15, yes: 1 };
const BLOCK = new Set(['time', 'money', 'space', 'place', 'people', 'skill', 'health', 'life']);
// where people live, from the browser's time zone: only ever a guess the person confirms
const TZ_HOME = {
  'America/Los_Angeles': 'us-west', 'America/Vancouver': 'ca-west', 'America/Denver': 'us-mountain', 'America/Phoenix': 'us-mountain', 'America/Boise': 'us-mountain',
  'America/Chicago': 'us-central', 'America/New_York': 'us-east', 'America/Detroit': 'us-east', 'America/Toronto': 'ca-east', 'America/Montreal': 'ca-east',
  'Pacific/Honolulu': 'us-hawaii', 'America/Anchorage': 'us-alaska', 'America/Mexico_City': 'mx', 'America/Sao_Paulo': 'br', 'Europe/London': 'uk', 'Europe/Dublin': 'ie',
  'Europe/Paris': 'fr', 'Europe/Berlin': 'de', 'Europe/Madrid': 'es', 'Europe/Rome': 'it', 'Europe/Amsterdam': 'nl', 'Europe/Athens': 'gr', 'Asia/Seoul': 'kr', 'Asia/Tokyo': 'jp',
  'Asia/Shanghai': 'cn', 'Asia/Hong_Kong': 'hk', 'Asia/Taipei': 'tw', 'Asia/Singapore': 'sg', 'Asia/Manila': 'ph', 'Asia/Bangkok': 'th', 'Asia/Ho_Chi_Minh': 'vn',
  'Asia/Kolkata': 'in', 'Asia/Calcutta': 'in', 'Asia/Dubai': 'ae', 'Australia/Sydney': 'au', 'Australia/Melbourne': 'au', 'Pacific/Auckland': 'nz', 'Africa/Lagos': 'ng', 'Africa/Johannesburg': 'za',
};
// code: [country tile value, region (what the guess names), country name]
const HOME = {
  'us-west': ['usa', 'the West Coast', 'the US'], 'us-mountain': ['usa', 'the Mountain West', 'the US'], 'us-central': ['usa', 'the middle of the US', 'the US'],
  'us-east': ['usa', 'the East Coast', 'the US'], 'us-hawaii': ['usa', 'Hawaii', 'the US'], 'us-alaska': ['usa', 'Alaska', 'the US'],
  'ca-west': ['canada', 'western Canada', 'Canada'], 'ca-east': ['canada', 'eastern Canada', 'Canada'], mx: ['mexico', 'Mexico', 'Mexico'], br: ['brazil', 'Brazil', 'Brazil'],
  uk: ['uk', 'the UK', 'the UK'], ie: ['ireland', 'Ireland', 'Ireland'], fr: ['france', 'France', 'France'], de: ['germany', 'Germany', 'Germany'], es: ['spain', 'Spain', 'Spain'],
  it: ['italy', 'Italy', 'Italy'], nl: ['netherlands', 'the Netherlands', 'the Netherlands'], gr: ['greece', 'Greece', 'Greece'], kr: ['korea', 'Korea', 'Korea'], jp: ['japan', 'Japan', 'Japan'],
  cn: ['china', 'China', 'China'], hk: ['hongkong', 'Hong Kong', 'Hong Kong'], tw: ['taiwan', 'Taiwan', 'Taiwan'], sg: ['singapore', 'Singapore', 'Singapore'],
  ph: ['philippines', 'the Philippines', 'the Philippines'], th: ['thailand', 'Thailand', 'Thailand'], vn: ['vietnam', 'Vietnam', 'Vietnam'], in: ['india', 'India', 'India'],
  ae: ['uae', 'the UAE', 'the UAE'], au: ['australia', 'Australia', 'Australia'], nz: ['newzealand', 'New Zealand', 'New Zealand'], ng: ['nigeria', 'Nigeria', 'Nigeria'], za: ['southafrica', 'South Africa', 'South Africa'],
};
const REGIONAL = code => /^(us|ca)-/.test(code);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function betaSample(r, a, b) { // Thompson draw; a, b > 0 (Jöhnk's method is fine for small shapes)
  const g = k => { if (k < 1) return g(k + 1) * Math.pow(r(), 1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { const u1 = r(), u2 = r(); x = Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r(); if (u < 1 - .0331 * x ** 4 || Math.log(u) < .5 * x * x + d * (1 - v + Math.log(v))) return d * v; } };
  const x = g(a), y = g(b); return x / (x + y);
}
const ent = p => (p <= 0 || p >= 1) ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));

export function createEngine(bank) {
  const C = new Map(bank.cards.map(c => [c.id, c]));
  const ITEM = new Map(bank.items.map(i => [i.id, i]));
  const AREAS = bank.areas, AREA = new Map(AREAS.map(a => [a.k, a]));
  const APP = new Map(bank.apps.map(a => [a.k, a]));
  const TR = new Map(bank.traits.map(t => [t.k, t]));
  const DIVES = bank.dives;
  const appsOf = new Map(); for (const a of bank.apps) { if (!appsOf.has(a.area)) appsOf.set(a.area, []); appsOf.get(a.area).push(a); }
  const itemsOf = new Map(); for (const i of bank.items) { if (!itemsOf.has(i.area)) itemsOf.set(i.area, []); itemsOf.get(i.area).push(i); }
  const COPY = bank.copy;
  // a grid that was answered covers the single items it showed (Martin: no separate questions for what a grid
  // already asked; a tap, or leaving a tile untapped on a locked-in grid, is the answer)
  const tail = new Map(); for (const i of bank.items) { const t = i.id.split(':')[1]; if (!tail.has(t)) tail.set(t, []); tail.get(t).push(i.id); }
  const COVERS = new Map();   // tiles card id -> [[option value, item id]]
  for (const c of bank.cards) if (c.type === 'tiles' && c.mode !== 'apps') for (const o of c.opts) for (const id of tail.get(o.value) || []) {
    if (!COVERS.has(c.id)) COVERS.set(c.id, []); COVERS.get(c.id).push([o.value, id]);
  }
  const covered = (S, id) => S.covered.has(id);
  const CORE = 66;   // answers before the core map is "done" (about ten minutes); the game can always go on

  // ------------------------------------------------------------------ state
  function session(init = {}) {
    const S = {
      v: 1, bank: bank.v, log: [], asked: new Set(), chapter: 0, inCh: 0, answers: 0,
      A: {}, T: {}, apps: {}, items: {}, facts: {}, est: {}, tiles: {}, values: [], age: { z: 0, y: 0, x: 0, o: 0 },
      guesses: { made: 0, hits: 0, misses: 0, log: [], calN: 0, calHits: 0, calP: 0 }, lat: {}, dived: [], dive: null, since: { guess: 0, duel: 0 },
      covered: new Set(), blockers: {}, other: [], picks: [], readAt: 0,
      ex: { a: {}, t: {}, age: 0 }, shown: new Set(), cal: {}, gInCh: 0,
      tells: [], meta: init.meta || {}, seed: init.seed || 1, r: null, careless: 0, done: false, coreDone: false, ended: false,
    };
    for (const a of AREAS) S.A[a.k] = [a.prior * 2.4, (1 - a.prior) * 2.4];
    for (const t of bank.traits) S.T[t.k] = [0, .35];
    S.r = rng(S.seed);
    applyMeta(S);
    if (init.log) for (const e of init.log) replayOne(S, e);
    return S;
  }
  // what the browser says: the device and the hour are weak evidence, never facts on their own
  function applyMeta(S) {
    const m = S.meta || {};
    if (m.os === 'iOS') S.est.phone = { value: 'iPhone', conf: .85, via: 'device' };
    if (m.os === 'Android') S.est.phone = { value: 'Android', conf: .85, via: 'device' };
    if (Number.isInteger(m.hour)) {
      if (m.hour >= 23 || m.hour < 4) evT(S, 'night', .6, .35);
      else if (m.hour >= 5 && m.hour < 8) evT(S, 'night', -.5, .3);
    }
  }
  const mean = (S, k) => { const [a, b] = S.A[k]; return a / (a + b); };
  const varA = (S, k) => { const [a, b] = S.A[k]; return a * b / ((a + b) ** 2 * (a + b + 1)); };
  const var0 = k => { const p = AREA.get(k).prior; return p * (1 - p) / 3.4; };
  function evA(S, k, w, m = 1) { if (!S.A[k] || !w) return; const x = w * m * 1.8; if (x > 0) S.A[k][0] += x; else S.A[k][1] -= x; }
  function evT(S, k, y, w = 1) {
    if (!S.T[k]) return; const [m, v] = S.T[k]; const p = w * 4;
    const nv = 1 / (1 / v + p); S.T[k] = [clamp((m / v + y * p) * nv, -1, 1), nv];
  }
  function evG(S, g, w, k = AGE_K) { if (!g) return; for (const b of AGE) if (g[b]) S.age[b] += g[b] * w * k; }
  // Bayes: add log P(what they answered | born in that decade)
  function evAgeLik(S, lik, w) { for (const b of AGE) S.age[b] += w * Math.log(clamp(lik[b], .01, 1)); }
  function agePost(S) {
    const l = AGE.map(b => Math.log(AGE_PRIOR[b]) + S.age[b]), mx = Math.max(...l), e = l.map(x => Math.exp(x - mx)), z = e.reduce((s, x) => s + x, 0);
    return Object.fromEntries(AGE.map((b, i) => [b, e[i] / z]));
  }
  function addFact(S, k, v, replace) { if (!k) return; if (replace || !S.facts[k]) S.facts[k] = []; for (const x of [].concat(v)) if (!S.facts[k].includes(x)) S.facts[k].push(x); }
  // effects of one option: a = areas, t = traits, g = age, f = facts, apps. o.k: how strongly its decades count
  function applyFx(S, fx, m = 1, sign = 1, o = {}) {
    if (!fx) return;
    for (const [k, w] of Object.entries(fx.a || {})) evA(S, k, w * sign, m);
    for (const [k, y] of Object.entries(fx.t || {})) evT(S, k, clamp(y * sign, -1, 1), .55 * m * Math.min(1, Math.abs(y) + .4));
    if (sign > 0) evG(S, fx.g, m, o.k || AGE_K);
    if (sign > 0) for (const [k, v] of Object.entries(fx.f || {})) addFact(S, k, v);
    if (sign > 0 && fx.apps) for (const [st, ks] of Object.entries(fx.apps)) for (const k of ks) setApp(S, k, st === 'use' ? 'use' : st, .4);
    // what they said outright: a guess about it would only repeat them
    if (sign > 0 && m >= .5) {
      for (const [k, w] of Object.entries(fx.a || {})) if (w >= .45) S.ex.a[k] = (S.ex.a[k] || 0) + 1;
      for (const [k, y] of Object.entries(fx.t || {})) if (Math.abs(y) >= .5) S.ex.t[k] = (S.ex.t[k] || 0) + 1;
      if (fx.g && !o.k && Math.max(...Object.values(fx.g)) >= .8) S.ex.age++;
    }
  }
  const appAge = (a, b) => (a.tags.includes('young') ? YOUNG[b] : 1) * (a.tags.includes('older') ? OLDER[b] : 1);
  function setApp(S, k, st, ageW = 0) {
    const a = APP.get(k); if (!a) return;
    const prev = S.apps[k]; S.apps[k] = st;
    if (prev === st) return;
    evA(S, a.area, st === 'use' || st === 'love' ? .45 : st === 'used' ? .05 : -.04);
    if (a.tags.includes('apple') && (st === 'use' || st === 'love')) S.est.phone ||= { value: 'iPhone', conf: .6, via: 'apps' };
    // an app young people use (or older people) says something about when you were born
    if (ageW && (a.tags.includes('young') || a.tags.includes('older'))) {
      if (st === 'use' || st === 'love') evAgeLik(S, Object.fromEntries(AGE.map(b => [b, appAge(a, b) / 1.8])), ageW);
      else if (st === 'no') evAgeLik(S, Object.fromEntries(AGE.map(b => [b, 1 / (1 + .45 * appAge(a, b))])), ageW * .6);
    }
  }

  // ------------------------------------------------------------------ timing
  function strength(S, type, meta = {}) {
    const ms = Math.max(0, meta.ms || 0), n = Math.max(1, meta.n || 1);
    const lat = (S.lat[type] ||= []);
    const per = type === 'tiles' || type === 'multi' ? ms / Math.max(1, meta.taps || 1) : ms;
    const base = lat.length >= 3 ? [...lat].sort((a, b) => a - b)[lat.length >> 1] : (type === 'tiles' || type === 'multi' ? 2200 : (BASE[type] || 2500));
    const r = per / base;
    let m = 1, flag = null;
    if (!ms) m = 1;
    else if (per < 280 || r < .22) { m = .8; flag = 'careless'; S.careless++; }
    else if (r <= 1) { m = 1 + .32 * Math.min(1, Math.log2(1 / r)); if (r < .55) flag = 'fast'; }
    else { m = 1 - .28 * Math.min(1, Math.log2(r) / 2); if (r > 2.2) flag = 'slow'; }
    if (meta.h) m *= .88;
    if (meta.ch) m *= .9;
    if (ms) { lat.push(Math.min(per, base * 4)); if (lat.length > 15) lat.shift(); }
    return { m: clamp(m, .6, 1.35), flag, n };
  }

  // ------------------------------------------------------------------ predictions (for guesses and the map)
  function predictApp(S, k) {
    const a = APP.get(k); if (!a) return 0;
    if (S.apps[k]) return S.apps[k] === 'use' || S.apps[k] === 'love' ? 1 : 0;
    const area = AREA.get(a.area), m = areaEff(S, a.area);
    let p = m * clamp(a.pop / Math.max(.08, area.prior), .01, .92);
    const phone = (S.facts.phone || [])[0] || S.est.phone?.value;
    if (a.tags.includes('apple')) p *= phone === 'Android' ? .08 : phone === 'iPhone' ? 1.5 : 1;
    if (a.tags.includes('google') && phone === 'Android') p *= 1.35;
    if (a.tags.includes('samsung')) p *= phone === 'Android' ? 1.5 : .05;
    // per decade, weighed by how likely each decade is
    if (a.tags.includes('young') || a.tags.includes('older')) { const ag = agePost(S); let f = 0; for (const b of AGE) f += ag[b] * appAge(a, b); p *= f; }
    const spend = S.T.spend[0], luxe = S.T.luxe[0];
    if (a.tags.includes('premium')) p *= 1 + .6 * clamp(luxe + .5 * spend, -.8, 1);
    if (a.tags.includes('budget')) p *= 1 - .4 * clamp(luxe + .5 * spend, -1, 1);
    return clamp(p, .002, .97);
  }
  // Personas: the bank's archetypes as a mixture (plus "no strong type"), weighed by how well each fits the traits and
  // areas answered so far. They carry what one part of life says about another: "out, spend it, city lights" makes
  // concerts and events likelier before they're ever asked. Their pull fades as an area or trait gets answers of its own.
  function archPost(S) {
    if (S._ap && S._ap.n === S.log.length) return S._ap.v;
    const lw = bank.archetypes.map(a => {
      let l = Math.log(.6 / bank.archetypes.length);
      for (const t of bank.traits) { const [m, v] = S.T[t.k]; if (v > .3) continue; const mu = .7 * (a.t[t.k] || 0); l -= ((m - mu) ** 2 - m * m) / (2 * (v + .12)); }
      for (const ar of AREAS) { const c = 1 - varA(S, ar.k) / var0(ar.k); if (c < .15) continue; const d = mean(S, ar.k) - ar.prior, mu = .3 * (a.a[ar.k] || 0); l -= ((d - mu) ** 2 - d * d) / (2 * (.04 + .1 * (1 - c))); }
      return l;
    });
    const all = [...lw, Math.log(.4)], mx = Math.max(...all), e = all.map(x => Math.exp(x - mx)), z = e.reduce((x, y) => x + y, 0);
    const v = bank.archetypes.map((a, i) => [a, e[i] / z]);
    S._ap = { n: S.log.length, v };
    return v;
  }
  function areaEff(S, k) {
    const m = mean(S, k), c = clamp(1 - varA(S, k) / var0(k)); let sh = 0;
    for (const [a, w] of archPost(S)) sh += w * .25 * (a.a[k] || 0);
    return clamp(m + (1 - c) * sh, .01, .99);
  }
  function traitEff(S, k) {
    const [m, v] = S.T[k]; let sh = 0;
    for (const [a, w] of archPost(S)) sh += w * .6 * (a.t[k] || 0);
    return clamp(m + (v / .35) * sh, -1, 1);
  }
  // an item's odds before the decade: its area and the traits it speaks to (personas included)
  function itemBase(S, it) {
    let x = Math.log(.32 / .68) + 2.6 * (areaEff(S, it.area) - AREA.get(it.area).prior);
    for (const [k, w] of Object.entries(it.fx.t || {})) x += 1.5 * w * traitEff(S, k);
    return x;
  }
  // per decade: how likely someone born then is into it, and how likely they have even heard of it
  function itemByAge(S, it) {
    const x0 = itemBase(S, it), aw0 = logit(clamp(.25 + .7 * it.pop, .05, .97)), out = {};
    for (const b of AGE) { const sh = ageShift(it.fx.g, b); out[b] = { q: sig(x0 + sh), aware: sig(aw0 + 1.1 * sh) }; }
    return out;
  }
  function predictItem(S, id) {
    const it = ITEM.get(id); if (!it) return 0;
    const ag = agePost(S), by = itemByAge(S, it); let p = 0;
    for (const b of AGE) p += ag[b] * Math.min(by[b].q, by[b].aware);   // into it means having heard of it first
    return clamp(p, .01, .95);
  }
  const traitView = (S, k) => { const [m, v] = S.T[k], t = TR.get(k); return { k, m, v, label: m >= 0 ? t.hi : t.lo, you: m >= 0 ? t.yhi : t.ylo, sure: clamp(Math.abs(m) * (1 - v / .35)) }; };
  function budgetBand(S) {
    let x = .55 * S.T.spend[0] + .65 * S.T.luxe[0];
    const d = S.facts['dinner-for-two']?.[0]; if (d != null) x += clamp((Number(d) - 80) / 140, -.5, 1) * .9;
    const fl = S.facts.flight?.[0]; if (fl) x += { economy: -.5, legroom: .1, points: .2, business: .9, never: -.2 }[fl] || 0;
    const ride = S.facts.ride?.[0]; if (ride) x += { none: -.1, older: -.35, newer: .15, ev: .35, truck: .05, nice: .7 }[ride] || 0;
    const home = S.facts['home-status']?.[0]; if (home === 'own') x += .3;
    if ((S.facts.invests || []).some(v => ['stocks', 'realestate'].includes(v))) x += .25;
    if ((S.facts.splurges || []).includes('nothing')) x -= .3;
    const bands = [['tight', 'Watching every dollar'], ['careful', 'Careful with money'], ['mid', 'Comfortable mid-range'], ['upper', 'Comfortable, likes nice things'], ['high', 'Premium everything']];
    const i = x < -.6 ? 0 : x < -.15 ? 1 : x < .35 ? 2 : x < .85 ? 3 : 4;
    const evid = ['dinner-for-two', 'flight', 'ride', 'home-status', 'invests', 'splurges'].filter(f => S.facts[f]).length;
    return { k: bands[i][0], label: bands[i][1], conf: clamp(.3 + .1 * evid + .2 * Math.min(1, Math.abs(x))), x };
  }
  function educationGuess(S) {
    const st = S.facts.stage || [], field = S.facts.field || [], ag = agePost(S);
    let p = .45 + (st.includes('student') ? .25 : 0) + (field.some(f => ['tech', 'finance', 'law', 'science', 'health', 'education'].includes(f)) ? .2 : 0)
      + (S.facts['all-nighter']?.[0] === 'exam' ? .15 : 0) + .15 * S.T.learn[0] + (mean(S, 'books') - .5) * .2 - (ag.z > .6 && !st.includes('student') ? .15 : 0);
    return clamp(p, .1, .92);
  }
  function heightBand(S) { const v = S.facts['top-shelf']?.[0]; return v ? { easy: 'Tall', 'am-stool': 'Tall', tiptoe: 'Average height', stool: 'On the shorter side' }[v] : null; }
  // the closest archetype: how far each trait and area sits from where people usually are, matched to the archetype
  function archetype(S) {
    let best = null, bs = -Infinity;
    for (const a of bank.archetypes) {
      let s = 0, n = 0;
      for (const [k, w] of Object.entries(a.t)) { s += S.T[k][0] * w; n += Math.abs(w); }
      for (const [k, w] of Object.entries(a.a)) { const pr = AREA.get(k).prior; s += 2.2 * (mean(S, k) - pr) / Math.max(.15, 1 - pr) * w; n += Math.abs(w); }
      s /= n; if (s > bs) { bs = s; best = a; }
    }
    return best;
  }

  // ------------------------------------------------------------------ cards
  const asView = (S, c) => {
    const v = { id: c.id, type: c.type, q: c.q, sub: c.sub || '', area: c.area || null, chapter: S.chapter };
    if (c.art) v.art = c.art;
    if (c.type === 'tt') { v.opts = c.opts.map((o, i) => ({ value: i ? 'r' : 'l', label: o.label, img: o.img })); v.extra = [{ value: 'both', label: 'Both' }, { value: 'neither', label: 'Neither' }]; }
    else if (c.type === 'react') { const it = ITEM.get(c.item); v.item = { id: it.id, n: it.n, kind: it.kind, img: it.img, area: it.area }; v.opts = bank.answers[it.kind] || bank.answers.thing; v.q = reactQ(it); if (v.opts.some(o => o.value === 'wish')) v.blockers = bank.blockers; }
    else if (c.type === 'tiles') {
      v.mode = c.mode; v.states = c.states; v.none = c.none;
      const home = c.id === 'tiles:countries' ? homeCountry(S) : null;   // you live there; “been” would be odd
      v.opts = c.opts.filter(o => o.value !== home).map(o => ({ value: o.value, label: o.label, img: o.img }));
      // what a single question already answered shows up pre-set
      const pre = {}; for (const [val, id] of COVERS.get(c.id) || []) { const st = S.items[id]; const i = c.states.findIndex(x => x.s === st || (st === 'love' && x.s === 'love') || (st === 'like' && x.s === 'like')); if (st && i >= 0) pre[val] = i; }
      if (Object.keys(pre).length) v.pre = pre;
      if (c.states.some(x => x.s === 'wish')) v.blockers = bank.blockers;
    }
    else if (['pick', 'multi', 'rank'].includes(c.type)) { v.opts = c.opts.map(o => ({ value: o.value, label: o.label, img: o.img })); v.max = c.max; v.min = c.min; }
    else if (c.type === 'slider') Object.assign(v, { min: c.min, max: c.max, step: c.step, left: c.left, right: c.right, marks: c.marks, money: !!c.money });
    return v;
  };
  function reactQ(it) {
    return { music: 'Be honest.', person: 'Be honest.', creator: 'Be honest.', show: 'Seen it?', movie: 'Seen it?', franchise: 'Into it?', game: 'Played it?', book: 'Read it?',
      podcast: 'Listen to it?', food: 'How do you feel about it?', place: 'Been there?', activity: 'Your thing?', thing: 'Yes or no?' }[it.kind] || 'Be honest.';
  }
  function gateOk(S, c) {
    const g = c.gate; if (!g) return true;
    if (g.fact) { const [k, vals] = g.fact; return (S.facts[k] || []).some(v => vals.includes(v)); }
    return true;
  }
  // dynamic cards: duels (give one up) and guesses (I bet…). Their ids carry everything needed to replay them.
  function duelCard(S, a, b) {
    const A = AREA.get(a), B = AREA.get(b);
    return { id: `duel:${a}:${b}`, type: 'duel', q: 'One has to go for a year. Which do you give up?', sub: '', area: null, chapter: S.chapter,
      opts: [{ value: a, label: cap(A.giveup), img: 'glyph/' + A.g }, { value: b, label: cap(B.giveup), img: 'glyph/' + B.g }], extra: [{ value: 'neither', label: 'Can’t choose, I need both' }] };
  }
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const TIER = { mythical: 'Mythical pull', ambitious: 'Ambitious guess' };
  function guessView(S, kind, subj, p, extra = {}) {
    const pct = Math.round(clamp(p, .3, .97) * 100);
    const base = { id: `guess:${kind}:${subj}`, type: 'guess', kind, chapter: S.chapter, sub: `I’m ${pct}% sure.`, p,
      tag: TIER[extra.tier] || 'My guess', tier: extra.tier || null, streak: extra.streak || null, img: bank.guessArt?.[kind] || null };
    if (kind === 'trait') { const k = subj.slice(0, -1); base.img = bank.traitArt?.[k]?.[subj.endsWith('+') ? 0 : 1] || null; }
    if (kind === 'home') {
      const h = HOME[subj]; if (!h) return null;
      const opts = [{ value: 'yes', label: 'That’s right' }];
      if (REGIONAL(subj)) opts.push({ value: 'country', label: `${cap(h[2].replace(/^the /, ''))}, somewhere else` });
      opts.push({ value: 'else', label: 'Somewhere else' }, { value: 'skip', label: 'Rather not say' });
      return { ...base, q: `I bet you live ${/Coast$/.test(h[1]) ? 'on' : 'in'} ${h[1]}.`, opts };
    }
    if (kind === 'app') { const a = APP.get(subj); return { ...base, q: `I bet ${a.n} is on your phone.`, img: 'app/' + a.k, opts: [{ value: 'yes', label: 'Yes, it is' }, { value: 'used', label: 'Used to be' }, { value: 'no', label: 'Nope' }] }; }
    if (kind === 'item') { const it = ITEM.get(subj); return { ...base, q: `Bet you’re into ${it.n}.`, img: it.img, item: { n: it.n, kind: it.kind }, opts: [{ value: 'love', label: 'Called it' }, { value: 'like', label: 'It’s fine' }, { value: 'nope', label: 'Not for me' }, { value: 'unknown', label: 'Never tried it' }] }; }
    if (kind === 'noapp') { const a = APP.get(subj); if (!a) return null; return { ...base, q: `Bet ${a.n} isn’t on your phone.`, img: 'app/' + a.k, opts: [{ value: 'no', label: 'Called it' }, { value: 'used', label: 'Not anymore' }, { value: 'yes', label: 'It is, actually' }] }; }
    if (kind === 'not') { const it = ITEM.get(subj); if (!it) return null; return { ...base, q: NOT_LINES[[...subj].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % NOT_LINES.length](it.n), img: it.img, item: { n: it.n, kind: it.kind }, opts: [{ value: 'nope', label: 'Called it' }, { value: 'unknown', label: 'Never tried it' }, { value: 'like', label: 'It’s fine' }, { value: 'love', label: 'Actually, I love it' }] }; }
    if (kind === 'trait') { const t = TR.get(subj.slice(0, -1)), hi = subj.endsWith('+'); return { ...base, q: `You’re ${hi ? t.yhi : t.ylo}. Right?`, opts: [{ value: 'yes', label: 'That’s me' }, { value: 'some', label: 'Sometimes' }, { value: 'no', label: 'Not really' }] }; }
    if (kind === 'area') { const A = AREA.get(subj); return { ...base, q: `${cap(A.miss)} is a big part of your life.`, img: 'glyph/' + A.g, opts: [{ value: 'yes', label: 'So true' }, { value: 'some', label: 'Kind of' }, { value: 'no', label: 'Not really' }] }; }
    if (kind === 'age') return { ...base, q: `I’m guessing you were born in ${AGE_LABEL[subj]}.`, opts: [{ value: 'yes', label: 'Yes' }, { value: 'earlier', label: 'Earlier' }, { value: 'later', label: 'Later' }, { value: 'skip', label: 'Rather not say' }] };
    if (kind === 'edu') return { ...base, q: 'I’d guess you went to college.', opts: [{ value: 'yes', label: 'Yes' }, { value: 'grad', label: 'Grad school too' }, { value: 'now', label: 'I’m in school now' }, { value: 'no', label: 'Didn’t go' }, { value: 'skip', label: 'Rather not say' }] };
    if (kind === 'budget') { const b = budgetBand(S); return { ...base, q: `Your money style: ${b.label.toLowerCase()}.`, sub: 'Close?', opts: [{ value: 'yes', label: 'Spot on' }, { value: 'tighter', label: 'Tighter than that' }, { value: 'looser', label: 'Looser than that' }, { value: 'skip', label: 'Rather not say' }] }; }
    if (kind === 'arch') { const a = bank.archetypes.find(x => x.k === subj); return { ...base, q: `You’re ${a.name}.`, sub: a.line, opts: [{ value: 'yes', label: 'That’s me' }, { value: 'some', label: 'Kind of' }, { value: 'no', label: 'Not at all' }] }; }
    if (kind === 'phone') return { ...base, q: `You’re on ${subj === 'iPhone' ? 'an iPhone' : 'Android'}.`, opts: [{ value: 'yes', label: 'Yep' }, { value: 'no', label: 'Nope' }] };
    return null;
  }
  const article = s => /^[aeiou]/i.test(s) ? 'an ' : 'a ';
  const NEG = new Set(['not', 'noapp']);   // the "isn't your thing" guesses
  const NOT_LINES = [n => `Bet ${n} isn’t your thing.`, n => `${n}? Not really you, I bet.`, n => `I can tell ${n} isn’t for you.`, n => `You’d skip ${n}. Right?`];
  // infinite mode: two things you already like, one has to go
  function vsCard(S, a, b) {
    const A = ITEM.get(a), B = ITEM.get(b), same = A.kind === B.kind;
    return { id: `vs:${a}:${b}`, type: 'tt', vs: true, q: same ? 'Two you like. Pick one.' : 'Only one stays. Which?', sub: '', area: null, chapter: S.chapter,
      opts: [{ value: 'l', label: A.n, img: A.img }, { value: 'r', label: B.n, img: B.img }], extra: [{ value: 'both', label: 'Can’t choose' }] };
  }
  function cardFor(S, id) {
    if (C.has(id)) return asView(S, C.get(id));
    const p = id.split(':');
    if (p[0] === 'vs' && p.length === 5) { const a = p[1] + ':' + p[2], b = p[3] + ':' + p[4]; if (ITEM.has(a) && ITEM.has(b)) return vsCard(S, a, b); return null; }
    if (p[0] === 'duel' && AREA.has(p[1]) && AREA.has(p[2])) return duelCard(S, p[1], p[2]);
    if (p[0] === 'guess') { const subj = p.slice(2).join(':'); return guessView(S, p[1], subj, .7); }
    return null;
  }

  // ------------------------------------------------------------------ answering
  function answer(S, card, value, meta = {}) {
    // weigh the answer by the same rounded time the log keeps, so a replay rebuilds exactly what play saw (Vedant, b0711be)
    meta = { ...meta, ms: Math.min(600000, Math.round(meta.ms || 0)) };
    const c = C.get(card.id), out = { id: card.id };
    const st = strength(S, card.type === 'react' ? 'react' : card.type, { ...meta, taps: Array.isArray(value) ? value.length : 1 });
    const m = st.m;
    if (card.vs || card.id.startsWith('vs:')) {
      const [, k1, s1, k2, s2] = card.id.split(':'), a = k1 + ':' + s1, b = k2 + ':' + s2;
      if (value === 'l' || value === 'r') { const win = value === 'l' ? a : b; S.picks = [win, ...S.picks.filter(x => x !== win)].slice(0, 40); evA(S, ITEM.get(win).area, .12, m); out.picked = ITEM.get(win).n; }
    } else if (card.type === 'tt') {
      const [l, r] = c.opts;
      // both sides were on screen: neither is a guess anymore
      for (const o of [l, r]) { for (const ks of Object.values(o.fx?.apps || {})) for (const k of ks) S.shown.add(k); if (o.img?.startsWith?.('app/')) S.shown.add(o.img.slice(4)); }
      if (value === 'l' || value === 'r') {
        const o = value === 'l' ? l : r, other = value === 'l' ? r : l;
        applyFx(S, o.fx, m); if (meta.h) applyFx(S, other.fx, .15);
        out.picked = o.label;
      } else if (value === 'both') { applyFx(S, l.fx, .5); applyFx(S, r.fx, .5); }
      else if (value === 'neither') { applyFx(S, l.fx, .25, -1); applyFx(S, r.fx, .25, -1); }
    } else if (card.type === 'react') {
      if (typeof value === 'string' && value.startsWith('wish')) {
        applyStance(S, c.item, 'wish', m);
        const b = value.slice(5).split(',').filter(x => BLOCK.has(x)); if (b.length) S.blockers[c.item] = b.slice(0, 8);
      } else applyStance(S, c.item, value, m);
    } else if (card.type === 'tiles') {
      const states = c.states.map(x => x.s), got = new Map();
      const vals = Array.isArray(value) ? value : [];
      const blocks = vals.filter(v => typeof v === 'string' && v[0] === '?' && BLOCK.has(v.slice(1))).map(v => v.slice(1));
      vals.forEach((raw, i) => {
        const mm = /^(\+\+|\+|-|~)(.+)$/.exec(raw); if (!mm) return;
        const idx = { '+': 0, '++': 1, '-': 2, '~': 3 }[mm[1]], s = states[idx]; if (!s) return;
        got.set(mm[2], { s, first: i < 3 });
      });
      if (vals.includes('none')) got.clear();
      // a "grew up with" card: the decade is what it's for, so its taps count more, and what was left untapped counts a little
      const ageCard = c.opts.filter(o => o.fx?.g).length >= c.opts.length * .6;
      if (c.mode === 'apps' && vals.length && c.area) S.ex.a[c.area] = (S.ex.a[c.area] || 0) + 1;
      for (const o of c.opts) {
        const g = got.get(o.value);
        if (c.mode === 'apps') {
          if (o.value === 'other') { if (g && g.s !== 'used') { evA(S, c.area, .35, m); if (!S.other.includes(c.area)) S.other.push(c.area); } continue; }
          if (g) setApp(S, o.value, g.s === 'love' ? 'love' : g.s, .6); else if (vals.length) { if (!S.apps[o.value]) S.apps[o.value] = 'no'; } continue;
        }
        const key = `${c.kind}:${(c.area || 'x')}-${o.value}`;
        if (g) {
          const w = (STANCE_W[g.s] ?? .5) * m * (g.first ? 1.12 : 1);
          if (w > 0) applyFx(S, o.fx, w, 1, ageCard ? { k: AGE_MARK } : {}); else applyFx(S, o.fx, -w * .6, -1);
          S.tiles[key] = { s: g.s, n: o.label, kind: c.kind, area: c.area };
          if (g.s === 'wish' && blocks.length) S.tiles[key].b = blocks.slice(0, 8);
          if (c.fact && (g.s === 'love' || g.s === 'like' || g.s === 'want' || g.s === 'use')) addFact(S, c.fact, o.value);
        } else if (vals.length || vals.includes('none')) {
          applyFx(S, o.fx, .08, -1);   // not picked: a whisper, never a "no" (people miss tiles)
          // (less when they tapped only one or two: a quick tapper skips things they did have)
          if (ageCard && got.size && o.fx?.g) evG(S, o.fx.g, -.3 * Math.min(1, got.size / 3), AGE_MARK);
        }
      }
      if (c.mode === 'apps' && vals.length === 1 && vals[0] === 'none') evA(S, c.area, -.35);
      if (c.fact && vals.includes('none')) addFact(S, c.fact, 'none');
      if (vals.length) for (const [, id] of COVERS.get(c.id) || []) S.covered.add(id);
      out.count = got.size;
    } else if (card.type === 'pick') {
      const o = c.opts.find(o => o.value === value);
      if (o) { applyFx(S, o.fx, m); if (c.fact) addFact(S, c.fact, value, true); if (c.est) addFact(S, c.id.split(':')[1], value, true); }
    } else if (card.type === 'multi') {
      const vals = Array.isArray(value) ? value : [];
      vals.forEach((v, i) => { const o = c.opts.find(o => o.value === v); if (o) applyFx(S, o.fx, m * (i < 2 ? 1.1 : 1)); });
      if (c.miss) for (const o of c.opts) if (!vals.includes(o.value)) for (const [k, w] of Object.entries(o.fx?.a || {})) evA(S, k, c.miss.a * Math.sign(w));
      if (c.fact) addFact(S, c.fact, vals, true);
    } else if (card.type === 'rank') {
      const vals = Array.isArray(value) ? value : [];
      vals.forEach((v, i) => { const o = c.opts.find(o => o.value === v); if (o) applyFx(S, o.fx, m * [1.2, .9, .7][i] || .5); });
      S.values = vals.slice(0, 3);
    } else if (card.type === 'slider') {
      const x = Number(value), t = clamp((x - c.min) / (c.max - c.min));
      for (const [k, [lo, hi]] of Object.entries(c.fx?.t || {})) evT(S, k, lo + (hi - lo) * t, .5 * m);
      for (const [k, [lo, hi]] of Object.entries(c.fx?.a || {})) evA(S, k, lo + (hi - lo) * t, m);
      if (c.fact) addFact(S, c.fact, String(x), true);
    } else if (card.type === 'duel') {
      const [, a, b] = card.id.split(':');
      if (value === a || value === b) { const keep = value === a ? b : a; evA(S, keep, .4, m); evA(S, value, -.18, m); out.kept = keep; }
      else { evA(S, a, .25); evA(S, b, .25); }
      S.since.duel = 0;
    } else if (card.type === 'guess') {
      Object.assign(out, settleGuess(S, card, value));
      S.since.guess = 0; S.gInCh++;
    }
    if (st.flag && (st.flag === 'fast' || st.flag === 'slow') && meta.ms) noteTell(S, card, value, st.flag, meta.ms);
    S.asked.add(card.id); S.answers++; S.inCh++; S.since.guess++; S.since.duel++;
    if (S.dive && card.area === S.dive.area) S.dive.done++;
    out.flag = st.flag;
    const entry = { c: card.id, v: value ?? null, ms: Math.min(600000, Math.round(meta.ms || 0)), at: Math.min(14399999, Math.round(meta.at || 0)) };
    if (meta.h) entry.h = Math.min(60, meta.h); if (meta.ch) entry.ch = Math.min(60, meta.ch);
    S.log.push(entry);
    return out;
  }
  function applyStance(S, id, stance, m = 1) {
    const it = ITEM.get(id); if (!it) return;
    S.items[id] = stance;
    const fx = it.fx, w = STANCE_W[stance] ?? 0;
    // the decade first, from what was believed before this answer: into it, knows it but passes, or never heard of it
    if (fx.g && ['love', 'like', 'meh', 'nope', 'unknown'].includes(stance)) {
      const by = itemByAge(S, it), lik = {};
      for (const b of AGE) { const { q, aware } = by[b], into = Math.min(q, aware); lik[b] = stance === 'love' || stance === 'like' ? into : stance === 'unknown' ? 1 - aware : Math.max(.03, aware - into); }
      evAgeLik(S, lik, .8 * Math.min(1.1, m));
    } else if (fx.g && (stance === 'want' || stance === 'wish')) evG(S, fx.g, .25);
    if (stance === 'unknown') { for (const [k, x] of Object.entries(fx.a || {})) evA(S, k, -x * .25 * it.pop); return; }
    if (stance === 'cant') return;
    for (const [k, x] of Object.entries(fx.a || {})) evA(S, k, x * (stance === 'nope' ? .15 : stance === 'pass' ? -.4 : w), m);
    for (const [k, y] of Object.entries(fx.t || {})) {
      const obs = stance === 'love' ? y : stance === 'like' ? y * .5 : stance === 'nope' ? -y * .6 : stance === 'want' ? y * .3 : stance === 'wish' ? y * .35 : stance === 'pass' ? -y * .3 : 0;
      if (obs) evT(S, k, obs, (stance === 'love' ? .5 : .3) * m);
    }
  }
  function settleGuess(S, card, value) {
    const [, kind, ...rest] = card.id.split(':'), subj = rest.join(':');
    let hit = null;
    // what the guess was worth before the answer (recomputed here, so replays agree)
    const pre = guessScore(S, kind, subj);
    if (kind === 'app') {
      hit = value === 'yes'; setApp(S, subj, value === 'yes' ? 'use' : value === 'used' ? 'used' : 'no', .8);
      const a = APP.get(subj);
      if (a && value === 'no' && pre && pre.p >= .55) evA(S, a.area, -.25);   // a confident miss says something about the area too
      if (a && value === 'yes') { if (a.tags.includes('premium')) evT(S, 'luxe', .35, .5); if (a.tags.includes('budget')) evT(S, 'luxe', -.35, .5); }
      if (a && value === 'no') { if (a.tags.includes('premium')) evT(S, 'luxe', -.25, .35); if (a.tags.includes('budget')) evT(S, 'luxe', .2, .3); }
    }
    else if (kind === 'item') { hit = value === 'love' || value === 'like'; applyStance(S, subj, value); }
    else if (kind === 'noapp') { if (!APP.has(subj)) return { hit: null }; hit = value === 'no' || value === 'used'; setApp(S, subj, value === 'yes' ? 'use' : value === 'used' ? 'used' : 'no', .8); }
    else if (kind === 'not') { if (!ITEM.has(subj)) return { hit: null }; hit = value === 'nope' || value === 'unknown'; applyStance(S, subj, value); }
    else if (kind === 'home') {
      const h = HOME[subj];
      if (h && value === 'yes') { hit = true; S.est.home = { code: subj, level: REGIONAL(subj) ? 'region' : 'country' }; addFact(S, 'lives', [cap(h[1].replace(/^the /, ''))], true); }
      else if (h && value === 'country') { hit = null; S.est.home = { code: subj, level: 'country' }; addFact(S, 'lives', [cap(h[2].replace(/^the /, ''))], true); }
      else if (value === 'else') { hit = false; S.est.homeElse = true; }
      else S.est.homeSkip = true;
    }
    else if (kind === 'trait') { const k = subj.slice(0, -1), sgn = subj.endsWith('+') ? 1 : -1; hit = value === 'yes'; evT(S, k, value === 'yes' ? .75 * sgn : value === 'some' ? .3 * sgn : -.3 * sgn, value === 'yes' ? 1.2 : .7); }
    else if (kind === 'area') { hit = value === 'yes'; evA(S, subj, value === 'yes' ? .9 : value === 'some' ? .2 : -.6); }
    else if (kind === 'age') {
      hit = value === 'yes';
      if (value === 'yes') { S.est.age = { value: subj, conf: .95, confirmed: true }; S.age[subj] += 6; }
      else if (value === 'earlier' || value === 'later') { const i = AGE.indexOf(subj), j = value === 'earlier' ? i + 1 : i - 1; S.age[subj] -= 5; if (AGE[j]) S.age[AGE[j]] += 2; }
      else hit = null;
    } else if (kind === 'edu') { hit = value === 'yes' || value === 'grad' ? true : value === 'skip' ? null : false; if (value !== 'skip') S.est.education = { value, conf: .95, confirmed: true }; }
    else if (kind === 'budget') { hit = value === 'yes' ? true : value === 'skip' ? null : false; const b = budgetBand(S); const order = ['tight', 'careful', 'mid', 'upper', 'high']; let i = order.indexOf(b.k); if (value === 'tighter') i = Math.max(0, i - 1); if (value === 'looser') i = Math.min(4, i + 1); if (value !== 'skip') S.est.budget = { value: order[i], conf: value === 'yes' ? .9 : .7, confirmed: value === 'yes' }; }
    else if (kind === 'arch') { hit = value === 'yes' ? true : value === 'some' ? null : false; S.est.archetype = { value: subj, conf: value === 'yes' ? .9 : .5, confirmed: value === 'yes' }; }
    else if (kind === 'phone') { hit = value === 'yes'; addFact(S, 'phone', value === 'yes' ? subj : subj === 'iPhone' ? 'Android' : 'iPhone', true); }
    S.guesses.made++; if (hit === true) S.guesses.hits++; else if (hit === false) S.guesses.misses++;
    // a long shot (see guessCands) keeps its own record
    const long = (kind === 'item' || kind === 'app') && S.answers >= 30 && pre && pre.p < .66;
    if (long) S.longAt = S.answers;
    if (pre && hit !== null) {
      S.guesses.calN++; S.guesses.calP += pre.p; if (hit) S.guesses.calHits++;
      // each kind of guess keeps its own record: it sets that kind's confidence bar and tempers its odds
      const k = S.cal[long ? 'long' : kind] ||= { n: 0, h: 0, sp: 0 }; k.n++; k.sp += pre.p; if (hit) k.h++;
    }
    S.guesses.log.push({ s: card.id, o: hit === true ? 'hit' : hit === false ? 'miss' : 'pass' });
    const tier = pre?.tier;
    const pool = hit === true ? (tier === 'mythical' ? MYTH_HIT : tier === 'ambitious' ? BOLD_HIT : COPY.hit) : hit === false ? (tier ? LONG_MISS : COPY.miss) : ['Fair enough.'];
    return { hit, tier, line: pool[S.guesses.made % pool.length] };
  }
  const MYTH_HIT = ['Mythical pull. Landed.', 'A long shot, and it landed.', 'Nobody guesses that. I did.'];
  const BOLD_HIT = ['Bold call. Right again.', 'Ambitious, and right.', 'Went out on a limb. Worth it.'];
  const LONG_MISS = ['Long shot. Worth a try.', 'Too bold. Noted.', 'Swung big, missed. Learning.'];
  function noteTell(S, card, value, flag, ms) {
    let what = null;
    // infinite mode's "two you like" cards aren't in the bank: their own two sides (a quick pick there used to throw)
    if (card.type === 'tt') { const opts = C.get(card.id)?.opts || card.opts || []; const o = value === 'l' ? opts[0] : value === 'r' ? opts[1] : null; if (o) what = o.label; }
    else if (card.type === 'react') what = `${ITEM.get(C.get(card.id).item).n}`;
    if (!what) return;
    S.tells.push({ kind: flag, what, ms, id: card.id });
    if (S.tells.length > 30) S.tells.shift();
  }

  // ------------------------------------------------------------------ choosing the next card
  const CHAPTERS = [
    { n: 1, size: 8 }, { n: 2, size: 12 }, { n: 3, size: 0 }, { n: 4, size: 9 }, { n: 5, size: 4 }, { n: 6, size: 0 },
  ];
  // chapters 1 to 4 end with a reading (chapter 5 ends with the reveal)
  function endDue(S) {
    const ch = S.chapter;
    const q = S.inCh - S.gInCh;   // questions, not guesses: guesses now come any time
    return ch === 1 ? q >= 8 : ch === 2 ? q >= 12 : ch === 3 ? (S.answers >= CORE - 13 || !laneLeft(S)) : ch === 4 ? q >= 8 : false;
  }
  // a fresh read every 12 answers in the long middle chapter and every 15 in infinite mode (never mid-streak),
  // so the "seen" moments keep coming (Martin: after every 5, 10, 15 questions)
  function readDue(S) {
    const ch = S.chapter;
    return ((ch === 3 && S.inCh >= 12 && S.answers - S.readAt >= 12 && S.answers < CORE - 19) || (ch === 6 && S.inCh >= 15 && S.answers - S.readAt >= 15)) && !guessRuns(S).trail;
  }
  function next(S) {
    if (S.ended) return { kind: 'end' };
    if (S.chapter === 0) return startChapter(S, 1);
    const ch = S.chapter;
    // chapter ends
    if (ch >= 1 && ch <= 4 && endDue(S)) return reading(S, ch, ch + 1);
    if (ch === 5 && (S.inCh >= 4 || !finalGuess(S))) { if (!S.coreDone) { S.coreDone = true; S.log.push({ c: 'core', v: null, ms: 0, at: 0 }); return { kind: 'reveal' }; } return startChapter(S, 6); }
    if (readDue(S)) { S.readAt = S.answers; return { kind: 'reading', n: 6, ...readingFor(S, 6), after: ch }; }
    const card = pick(S);
    if (card) return { kind: 'card', card };
    if (ch < 6) return startChapter(S, ch === 5 ? 6 : ch + 1);
    S.ended = true; return { kind: 'end' };
  }
  function startChapter(S, n) {
    S.chapter = n; S.inCh = 0; S.gInCh = 0; S.dive = null;
    if (n === 6) S.dived = [];   // bonus rounds: every lane can be visited again for what's left
    S.log.push({ c: `ch:${n}`, v: null, ms: 0, at: 0 });
    const meta = COPY.chapters.find(x => x.n === n) || { n, title: 'Bonus rounds.', sub: 'Every answer sharpens your map.' };
    return { kind: 'chapter', n, title: meta.title, sub: meta.sub };
  }
  function reading(S, n, nextCh) {
    const r = readingFor(S, n);
    S.chapter = nextCh - .5;   // between chapters: the next call starts the next one
    return { kind: 'reading', n, ...r, after: nextCh };
  }
  // after a reading, next() starts the next chapter
  const _next = next;
  function nextOuter(S) {
    if (S.chapter % 1) return startChapter(S, Math.ceil(S.chapter));
    return _next(S);
  }
  const eligible = (S, c, ch) => c.ch.includes(ch) && !S.asked.has(c.id) && gateOk(S, c);
  function pick(S) {
    const ch = S.chapter;
    if (ch === 5) return finalGuess(S);
    if (ch !== 3 && ch !== 6) { const g = guessTurn(S); if (g) return g; }
    if (ch === 1) return pickTT(S, 1);
    if (ch === 2) return pickWorld(S);
    if (ch === 3 || ch === 6) return pickLane(S);
    if (ch === 4) return pickEdge(S);
    return null;
  }
  // what an option's decades would teach: nothing once the decade is clear, most when it's open and the option splits it
  function ageInfoG(S, g) {
    if (!g) return 0; const ag = agePost(S); let gm = 0, d = 0;
    for (const b of AGE) gm += ag[b] * (g[b] || 0); for (const b of AGE) d += ag[b] * Math.abs((g[b] || 0) - gm);
    return H4(ag) * d * 1.6;
  }
  // how likely this person is to know something with an age lean g, relative to a stranger (1 = no less likely): once
  // the answers say "born in the 70s", an IShowSpeed card drops to near zero instead of being asked anyway (Vedant, b0711be)
  function ageFit(S, g) {
    if (!g) return 1;
    const mx = Math.max(...AGE.map(b => g[b] || 0)); if (mx <= 0) return 1;
    const ag = agePost(S); let now = 0, p0 = 0;
    for (const b of AGE) { now += ag[b] * (g[b] || 0) / mx; p0 += AGE_PRIOR[b] * (g[b] || 0) / mx; }
    return clamp(now / Math.max(.05, p0));
  }
  const ttFit = (S, c) => .3 + .7 * Math.max(ageFit(S, c.opts[0].fx?.g), ageFit(S, c.opts[1].fx?.g));   // both sides off-age: a dud
  // what an answer about an item would teach about the decade
  function ageItemInfo(S, it) {
    if (!it.fx.g) return 0; const ag = agePost(S), by = itemByAge(S, it); let m = 0, d = 0;
    for (const b of AGE) m += ag[b] * by[b].aware; for (const b of AGE) d += ag[b] * Math.abs(by[b].aware - m);
    return H4(ag) * d * 2.4;
  }
  function infoOfFx(S, fx) {
    let s = 0;
    for (const [k, w] of Object.entries(fx?.a || {})) s += Math.abs(w) * varA(S, k) / var0(k) * .6 * (.4 + areaEff(S, k));
    for (const [k, y] of Object.entries(fx?.t || {})) s += Math.abs(y) * S.T[k][1] / .35;
    s += ageInfoG(S, fx?.g);
    for (const k of Object.keys(fx?.f || {})) s += S.facts[k] ? 0 : .5;
    for (const ks of Object.values(fx?.apps || {})) s += ks.filter(k => !S.apps[k]).length * .25;
    return s;
  }
  function pickTT(S, ch) {
    if (ch === 1 && !S.asked.has('tt:dogs-cats')) return asView(S, C.get('tt:dogs-cats'));   // a crowd-pleaser first
    // v2: after three instincts, "Which of these were part of your childhood?" while the decade is wide open: it is the
    // single most telling tap, and it makes the first guesses (the decade itself, then what people born then use) possible
    if (ch === 1 && S.inCh - S.gInCh >= 3 && !S.asked.has('tiles:grew-up') && H4(agePost(S)) > 1.2) { const g = C.get('tiles:grew-up'); if (g) return asView(S, g); }
    let best = null, bs = -1;
    const lastApp = (S.log.at(-1)?.c || '').match(/^tt:(ig-tiktok|spotify-apple|uber-lyft|doordash|netflix|amazon|chatgpt)/);
    for (const c of bank.cards) {
      if (c.type !== 'tt' || !eligible(S, c, ch)) continue;
      if (c.id === 'tt:iphone-android' && S.est.phone?.via === 'device') continue;   // the browser already said
      let s = (infoOfFx(S, c.opts[0].fx) + infoOfFx(S, c.opts[1].fx)) * (c.prio || 1) * (.85 + .3 * S.r()) * ttFit(S, c);
      if (lastApp && c.opts[0].img?.startsWith?.('app/')) s *= .4;
      if (s > bs) { bs = s; best = c; }
    }
    return best ? asView(S, best) : null;
  }
  // the cards of "Your world" and "Your edges": a pool, not an order. Each next card is the one expected to teach the
  // most about this person right now (Martin, Nov 5: "extremely fluid… as we learn more about the person")
  const WORLD = ['multi:phone-dies', 'multi:this-week', 'apps:home-screen', 'tiles:hobbies', 'multi:stage', 'tiles:grew-up', 'rank:values', 'pick:home', 'multi:living', 'tiles:devices', 'pick:2am', 'pick:all-nighter', 'slider:screen'];
  function cardValue(S, c) {
    let v;
    if (c.type === 'tt') v = (infoOfFx(S, c.opts[0].fx) + infoOfFx(S, c.opts[1].fx)) * ttFit(S, c);
    else if (c.type === 'react') {
      const it = ITEM.get(c.item), fit = ageFit(S, it.fx.g); if (fit < .2) return -1;   // off their decade: a wasted card
      v = (ent(predictItem(S, it.id)) * (.35 + .5 * it.pop) + infoOfFx(S, { t: it.fx.t }) * .4) * (.15 + .85 * fit) + ageItemInfo(S, it);
    }
    else if (c.type === 'slider') v = Object.keys(c.fx?.t || {}).reduce((x, k) => x + S.T[k][1] / .35, 0) * .8 + (c.fact && !S.facts[c.fact] ? .4 : 0);
    else if (c.mode === 'apps') { const open = c.opts.filter(o => o.value !== 'other' && !S.apps[o.value]).length; v = c.area ? mean(S, c.area) * (.8 + .1 * open) + .5 * varA(S, c.area) / var0(c.area) : .12 * open; }
    else { const xs = (c.opts || []).map(o => infoOfFx(S, o.fx)).sort((a, b) => b - a); v = xs.slice(0, 6).reduce((x, y) => x + y, 0) * .55 + (c.fact && !S.facts[c.fact] ? .5 : 0); }
    v *= c.prio || 1;
    v += steer(S, c);
    // variety: not the same kind of card three times running, not the same area back to back
    const last = []; for (let i = S.log.length - 1; i >= 0 && last.length < 2; i--) { const x = C.get(S.log[i].c); if (x) last.push(x); }
    if (last.length === 2 && last.every(x => x.type === c.type)) v *= .6;
    if (c.area && last.some(x => x.area === c.area)) v *= .7;
    return v;
  }
  function pickBest(S, pool) {
    let best = null, bs = -1;
    for (const c of pool) { const v = cardValue(S, c) * (.85 + .3 * S.r()); if (v > bs) { bs = v; best = c; } }
    return best ? asView(S, best) : null;
  }
  // when the decade is still open: the well-known item whose answer would split it best (a probe, not a lane)
  function ageProbe(S) {
    const ag = agePost(S); if (H4(ag) < 1.05) return null;
    let best = null, bs = .25;
    for (const it of bank.items) {
      if (!it.fx.g || it.pop < .55 || S.items[it.id] || covered(S, it.id) || S.asked.has('react:' + it.id) || !C.has('react:' + it.id)) continue;
      const v = ageItemInfo(S, it) * (.6 + .4 * it.pop); if (v > bs) { bs = v; best = C.get('react:' + it.id); }
    }
    return best;
  }
  function pool(S, ids, ch) {
    const out = [];
    for (const id of ids) { const c = C.get(id); if (c && !S.asked.has(id) && gateOk(S, c) && !out.includes(c)) out.push(c); }
    for (const c of bank.cards) if (c.type === 'tt' && c.ch.includes(ch) && !S.asked.has(c.id)) out.push(c);
    const pr = ageProbe(S); if (pr && !S.log.slice(-4).some(e => e.c === pr.id)) out.push(pr);
    return out;
  }
  function homeCode(S) { return TZ_HOME[S.meta?.tz] || null; }
  function homeCountry(S) { if (S.est.home?.code) return HOME[S.est.home.code][0]; if (S.est.homeElse || S.est.homeSkip) return null; return HOME[homeCode(S)]?.[0] || null; }
  function pickWorld(S) {
    const q = S.inCh - S.gInCh;
    if ((q === 4 || q === 9) && S.since.duel > 3) { const d = pickDuel(S); if (d) return d; }
    return pickBest(S, pool(S, WORLD, 2)) || pickTT(S, 2);
  }
  // only trade-offs people feel (no utilities: Martin took 46 s on family vs tools), and none that hurt to answer
  // (family, dating). Each "can't choose" makes the next pair more lopsided, reaching into niche parts of life, so
  // there is something they can actually give up (Martin, Oct 29).
  const DUEL_CORE = new Set(['music', 'movies', 'tv', 'games', 'sports', 'creators', 'social', 'food', 'travel', 'fitness', 'books', 'podcasts', 'concerts', 'events', 'fashion', 'pets', 'shopping', 'photos', 'learning', 'ai', 'news']);
  const DUEL_NICHE = new Set(['themeparks', 'festivals', 'livetv', 'radio', 'audiobooks', 'design', 'languages', 'filmmaking', 'musicproduction', 'coding']);
  function pickDuel(S) {
    const both = S.log.filter(e => e.c.startsWith('duel:') && e.v === 'neither').length;
    const target = Math.min(.55, .12 + .2 * both);
    const core = AREAS.filter(a => DUEL_CORE.has(a.k) && mean(S, a.k) > .45).map(a => a.k);
    const pool = AREAS.filter(a => (DUEL_CORE.has(a.k) || (both && DUEL_NICHE.has(a.k))) && mean(S, a.k) > (both ? .2 : .45)).map(a => a.k);
    let best = null, bs = -1;
    for (const a of core) for (const b of pool) {
      if (a === b || S.asked.has(`duel:${a}:${b}`) || S.asked.has(`duel:${b}:${a}`)) continue;
      const gap = Math.abs(mean(S, a) - mean(S, b));
      const s = (varA(S, a) + varA(S, b) + .02) * Math.exp(-((gap - target) ** 2) / (2 * .1 * .1)) * (.7 + .6 * S.r());
      if (s > bs) { bs = s; best = S.r() < .5 ? [a, b] : [b, a]; }
    }
    return best ? duelCard(S, best[0], best[1]) : null;
  }
  // Guesses (Martin, Oct 29): never about something just answered or plainly implied (no Google right after
  // "Google", no Apple Maps because of an iPhone: first-party apps are out), ambitious over safe (how much more
  // likely than most people), labelled when bold, recalibrated by how earlier guesses landed, and now and then a
  // streak of two or three in a row.
  const FIRST_PARTY = a => a.tags.includes('apple') || a.tags.includes('google') || a.tags.includes('samsung');
  let BASE_ITEM = null;   // how likely anyone is to be into each item (a fresh, unanswered game)
  function baseItem(id) { if (!BASE_ITEM) { const S0 = session({ seed: 1 }); BASE_ITEM = new Map(bank.items.map(i => [i.id, predictItem(S0, i.id)])); } return BASE_ITEM.get(id) ?? .3; }
  // how this kind of guess has landed so far: hits over what we expected (1 = as expected)
  function calib(S, kind) {
    const k = S.cal[kind]; if (!k || k.n < 2) return 1;
    return clamp(((k.h + 1) / (k.n + 2)) / ((k.sp + .7) / (k.n + 1)), .65, 1.15);
  }
  // the bar a guess has to clear: higher for the very first ones (first impressions), higher after misses of that kind,
  // a little lower after hits
  function guessBar(S, kind) {
    const k = S.cal[kind] || { n: 0, h: 0 }, miss = k.n - k.h;
    // a long stretch without a guess lowers the bar a little (never under 54%): the game has to keep giving
    const drought = S.answers >= 9 ? .035 * Math.min(2, Math.max(0, Math.floor((S.since.guess - 5) / 3))) : 0;
    return clamp(.58 + (S.guesses.made < 2 ? .05 : 0) + .06 * miss - .03 * k.h - drought, .54, .8);
  }
  function guessScore(S, kind, subj) {
    if (kind === 'app') {
      const a = APP.get(subj); if (!a) return null;
      const p = clamp(predictApp(S, subj) * calib(S, 'app'), 0, .97), lift = p / Math.max(.04, a.pop);
      return { p, lift, tier: lift >= 3 && a.pop <= .18 && p >= .45 ? 'mythical' : lift >= 2.5 && p >= .42 ? 'ambitious' : null };
    }
    if (kind === 'item') {
      if (!ITEM.has(subj)) return null;
      const p = clamp(predictItem(S, subj) * calib(S, 'item'), 0, .97), b0 = baseItem(subj), lift = p / Math.max(.05, b0);
      return { p, lift, tier: lift >= 2.1 && b0 <= .28 && p >= .5 ? 'mythical' : lift >= 1.9 ? 'ambitious' : null };
    }
    // an app they don't have: the chance it isn't on their phone, against how many phones it's missing from
    if (kind === 'noapp') {
      const a = APP.get(subj); if (!a) return null;
      const p = clamp((1 - predictApp(S, subj)) * calib(S, 'noapp'), 0, .97), lift = p / Math.max(.05, 1 - a.pop);
      return { p, lift, tier: null };
    }
    // what they're not into: the chance they don't love or like it, against how many people don't
    if (kind === 'not') {
      if (!ITEM.has(subj)) return null;
      const p = clamp((1 - predictItem(S, subj)) * calib(S, 'not'), 0, .97), lift = p / Math.max(.05, 1 - baseItem(subj));
      return { p, lift, tier: null };
    }
    if (kind === 'trait') { const k = subj.slice(0, -1); if (!S.T[k]) return null; const e = traitEff(S, k) * (subj.endsWith('+') ? 1 : -1); return { p: clamp((.5 + .45 * Math.max(0, e) - .15 * S.T[k][1]) * calib(S, 'trait'), .3, .93), lift: 1.5, tier: null }; }
    if (kind === 'area') { if (!S.A[subj]) return null; const pr = AREA.get(subj).prior, m = areaEff(S, subj); return { p: clamp(m * calib(S, 'area'), .05, .95), lift: m / Math.max(.1, pr), tier: null }; }
    if (kind === 'age') { if (!AGE.includes(subj)) return null; const p = agePost(S)[subj]; return { p, lift: p / AGE_PRIOR[subj], tier: null }; }
    return null;
  }
  // how much of a guess comes from things they didn't say: 1 = all inferred (their decade, their traits, other parts
  // of life), 0 = it only repeats an area they picked outright
  function implicitOf(S, area, p, b0) {
    const tot = Math.abs(logit(p) - logit(b0)) + .2;
    const said = S.ex.a[area] ? 3.2 * Math.abs(mean(S, area) - AREA.get(area).prior) : 0;
    return clamp(1 - said / tot);
  }
  const lastAsked = S => { for (let i = S.log.length - 1; i >= 0; i--) { const c = S.log[i].c; if (/^(ch:|lane:|core|guess:)/.test(c)) continue; return C.get(c) || null; } return null; };
  function guessCands(S, o = {}) {
    const cands = [], last = lastAsked(S), lastArea = last?.area || (last?.item && ITEM.get(last.item)?.area) || null;
    const floor = o.near ? .42 : 0;
    // the first guess sets the tone: a leap (at least twice as likely as for most people), never a safe bet, unless
    // nine answers in nothing bold has shown up yet (a long wait for a first guess is worse)
    const leap = S.guesses.made < 1 && S.answers < 9 ? 2 : 0;
    // past the first third the picture is personal, so a confident call on something fairly common still lands
    const late = S.answers >= 30;
    const lastKinds = []; for (let i = S.log.length - 1; i >= 0 && lastKinds.length < 2; i--) if (S.log[i].c.startsWith('guess:')) lastKinds.push(S.log[i].c.split(':')[1]);
    // a "you're into it" call on a thing or an app needs real confidence once the game is under way: those were
    // the guesses that missed most (Nov 5 simulations: right about half the time at 60%)
    const firm = (kind, g) => !late || (kind !== 'item' && kind !== 'app') || g.p >= .66;
    const push = (kind, subj, g, base, extra = {}) => {
      if (!g || g.p < Math.max(floor, o.near ? 0 : guessBar(S, kind))) return;
      if (leap && (kind === 'app' || kind === 'item') && g.lift < leap) return;
      if (!firm(kind, g)) return;
      if (o.near && g.p >= guessBar(S, kind)) return;
      // not about what they just answered, unless it's the lane they're in: a guess from what they just told us there
      // is the point (Nov 5: guesses all the way through, not just the first third)
      const inLane = S.dive && S.dive.done >= 1 && extra.area === S.dive.area && kind !== 'area';
      const near = lastArea && lastArea === extra.area && !inLane ? .45 : 1;
      // confidence first (a cubed odds), then how bold it is; "not your thing" never twice running
      // "not your thing" at most twice running (worded differently each time), so the yeses keep coming too
      if (NEG.has(kind) && NEG.has(lastKinds[0]) && NEG.has(lastKinds[1]) && S.since.guess < 7) return;
      const again = NEG.has(kind) && NEG.has(lastKinds[0]) ? .6 : 1;
      cands.push({ kind, subj, p: g.p, tier: g.tier || null, area: extra.area || null, s: g.p ** 3 * Math.log2(Math.max(1.05, g.lift)) * base * near * again * (inLane ? 1.5 : 1) * (extra.imp ?? 1) });
    };
    for (const a of bank.apps) {
      if (S.apps[a.k] || S.shown.has(a.k) || S.asked.has(`guess:app:${a.k}`) || FIRST_PARTY(a) || NO_GUESS.has(a.area)) continue;
      const g = guessScore(S, 'app', a.k); if (g.lift < (g.p >= .7 ? (late ? 1.3 : 1.45) : (late ? 1.55 : 1.7))) continue;
      push('app', a.k, g, 1, { area: a.area, imp: .5 + .5 * implicitOf(S, a.area, g.p, a.pop) });
    }
    for (const it of bank.items) {
      if (S.items[it.id] || covered(S, it.id) || S.asked.has(`guess:item:${it.id}`) || S.asked.has('react:' + it.id) || it.pop < .3 || NO_GUESS.has(it.area)) continue;
      if (ageFit(S, it.fx.g) < .5) continue;
      const g = guessScore(S, 'item', it.id); if (g.lift < (g.p >= .7 ? (late ? 1.2 : 1.35) : (late ? 1.4 : 1.5))) continue;
      push('item', it.id, g, 1.2, { area: it.area, imp: .5 + .5 * implicitOf(S, it.area, g.p, baseItem(it.id)) });
    }
    // what they're NOT into: something well known that most people like, that this person almost surely doesn't
    if (S.answers >= 10) for (const it of bank.items) {
      if (it.pop < (late ? .3 : .4) || S.items[it.id] || covered(S, it.id) || S.asked.has(`guess:not:${it.id}`) || S.asked.has(`guess:item:${it.id}`) || S.asked.has('react:' + it.id) || NO_GUESS.has(it.area)) continue;
      if (baseItem(it.id) < (late ? .2 : .25)) continue;
      const g = guessScore(S, 'not', it.id); if (g.lift < (late ? 1.1 : 1.15)) continue;
      push('not', it.id, g, .95, { area: it.area });
    }
    // an app that isn't on their phone: one most phones have
    if (S.answers >= 10) for (const a of bank.apps) {
      if (a.pop < .35 || S.apps[a.k] || S.shown.has(a.k) || S.asked.has(`guess:noapp:${a.k}`) || S.asked.has(`guess:app:${a.k}`) || FIRST_PARTY(a) || NO_GUESS.has(a.area)) continue;
      const g = guessScore(S, 'noapp', a.k); if (g.lift < 1.2) continue;
      push('noapp', a.k, g, .9, { area: a.area });
    }
    // a trait they never stated, read from everything else
    for (const t of bank.traits) {
      if (S.ex.t[t.k] || S.asked.has(`guess:trait:${t.k}+`) || S.asked.has(`guess:trait:${t.k}-`)) continue;
      const e = traitEff(S, t.k); if (Math.abs(e) < (late ? .32 : .45)) continue;
      push('trait', t.k + (e >= 0 ? '+' : '-'), guessScore(S, 'trait', t.k + (e >= 0 ? '+' : '-')), .85);
    }
    // a part of life they never picked: clearly above where most people are, not just its usual level
    for (const a of AREAS) {
      if (S.ex.a[a.k] || NO_GUESS.has(a.k) || S.asked.has(`guess:area:${a.k}`) || S.dived.includes(a.k) || S.asked.has('apps:' + a.k) || a.prior > .7) continue;
      const m = areaEff(S, a.k); if (m < .66 || m - a.prior < .18) continue;
      push('area', a.k, guessScore(S, 'area', a.k), .75, { area: a.k });
    }
    // the decade, as soon as it's clear (they never told us; a "retired" or "student" tap makes it less of a feat)
    if (!S.est.age && !AGE.some(b => S.asked.has('guess:age:' + b))) {
      const ag = agePost(S), [b, pb] = Object.entries(ag).sort((x, y) => y[1] - x[1])[0];
      if (pb >= .74) push('age', b, guessScore(S, 'age', b), S.ex.age ? .9 : 1.7);
    }
    // a long shot now and then (Martin, Oct 29: "ambitious guess", "mythical pull"; Nov 5: exciting to the very end):
    // once the game is under way and nothing safe is left, a bold call on something few people are into, labelled
    // as bold, with its honest odds. It keeps its own record, so a miss doesn't make the safe guesses timid.
    if (late && !o.near && S.answers - (S.longAt ?? -99) >= 4) {
      let best = null;
      const consider = (kind, subj, g, area, minLift) => { if (!g || g.p < .42 || g.p >= .66 || g.lift < minLift) return; const v = g.p * Math.log2(g.lift); if (!best || v > best.v) best = { kind, subj, g, area, v }; };
      for (const it of bank.items) {
        if (S.items[it.id] || covered(S, it.id) || S.asked.has(`guess:item:${it.id}`) || S.asked.has(`guess:not:${it.id}`) || S.asked.has('react:' + it.id) || it.pop < .3 || NO_GUESS.has(it.area) || ageFit(S, it.fx.g) < .5) continue;
        consider('item', it.id, guessScore(S, 'item', it.id), it.area, 2.2);
      }
      // (things only: a niche app is where the odds run hottest, Yousician for anyone into music)
      if (best) cands.push({ kind: best.kind, subj: best.subj, p: best.g.p, tier: best.g.tier || 'ambitious', area: best.area, long: true, s: .004 * best.v });
    }
    // where they live, from the time zone: a quick one, never the first
    const h = homeCode(S);
    if (!o.near && h && S.guesses.made >= 4 && S.answers >= 20 && !S.asked.has('guess:home:' + h) && !S.est.home && !S.est.homeElse && !S.est.homeSkip) cands.push({ kind: 'home', subj: h, p: .86, tier: null, s: .12 });
    return cands.sort((x, y) => y.s - x.s);
  }
  function pickGuess(S, o = {}) {
    let list = guessCands(S);
    if (o.avoid && list.some(c => c.kind !== o.avoid)) list = list.filter(c => c.kind !== o.avoid);
    if (!list.length) return null;
    // the best one, or now and then the runner-up when it's nearly as good (so two people don't get the same game)
    const c = list.length > 1 && list[1].s >= .85 * list[0].s && S.r() < .35 ? list[1] : list[0];
    return guessView(S, c.kind, c.subj, c.p, { tier: c.tier, streak: o.streak || null });
  }
  // guess runs, read from the log so a resumed game keeps its place
  function guessRuns(S) {
    let runs = 0, trail = 0, prev = false, last = null;
    for (const e of S.log) {
      const c = e.c; if (c.startsWith('lane:') || c.startsWith('ch:') || c === 'core') continue;
      const g = c.startsWith('guess:'); if (g && !prev) runs++;
      trail = g ? trail + 1 : 0; prev = g; if (g) last = c.split(':')[1];
    }
    return { runs, trail, last };
  }
  // the guesses it is close to making (just under their bar): the next questions aim at them, and never ask about the
  // very thing about to be guessed
  function nearGuesses(S) {
    if (S._near && S._near.n === S.log.length) return S._near.v;
    const v = guessCands(S, { near: true }).filter(c => (c.kind === 'app' || c.kind === 'item' || c.kind === 'area') && c.p >= .5).slice(0, 3);
    S._near = { n: S.log.length, v };
    return v;
  }
  function steer(S, c) {
    const near = nearGuesses(S); if (!near.length) return 0;
    const areas = new Set(near.map(n => n.area).filter(Boolean)), items = new Set(near.filter(n => n.kind === 'item').map(n => n.subj)), apps = new Set(near.filter(n => n.kind === 'app').map(n => n.subj));
    if (c.type === 'react') { if (items.has(c.item)) return -9; return areas.has(ITEM.get(c.item).area) ? .7 : 0; }
    if (c.mode === 'apps') return c.opts.some(o => apps.has(o.value)) ? -1.2 : 0;   // it would only ask what we're about to guess
    let b = 0;
    for (const o of c.opts || []) for (const [k, w] of Object.entries(o.fx?.a || {})) if (areas.has(k)) b += Math.min(.5, Math.abs(w));
    return Math.min(1.4, b);
  }
  // a run of two or three now and then, never in the first instincts
  // (Nov 5: from the lanes on, a streak every other time, so the end of the game is as lively as its start)
  const runLen = (S, idx) => S.chapter <= 1 ? 1 : S.chapter >= 3 ? [1, 2, 1, 3][idx % 4] : idx % 4 === 2 ? 3 : 1;
  // Guesses come as soon as one is good enough (from the fourth answer), then every few answers whenever one clears its
  // bar; when none does, the next question is the one that teaches the most, and the guess waits for it.
  function guessTurn(S) {
    if (S.answers < 4) return null;
    const r = guessRuns(S);
    if (r.trail > 0) { const n = runLen(S, r.runs - 1); return r.trail < n ? pickGuess(S, { avoid: r.last, streak: { i: r.trail + 1, n } }) : null; }
    // every third answer at most, every other one in the later chapters when several good guesses are waiting
    const gap = S.guesses.made === 0 ? 0 : 3;
    if (S.since.guess < gap && !(S.chapter >= 3 && S.since.guess >= 2 && guessCands(S).length >= 3)) return null;
    const n = runLen(S, r.runs), g = pickGuess(S, { streak: null });
    if (g && n > 1 && guessCands(S).length >= n) g.streak = { i: 1, n };
    return g;
  }
  // lanes: Thompson sampling over areas not visited yet; a visit runs the area's plan in order
  function laneLeft(S) { return AREAS.some(a => !S.dived.includes(a.k) && laneSteps(S, a.k).length); }
  function laneSteps(S, k) {
    const out = [];
    for (const st of DIVES[k] || []) {
      if (st.startsWith('react:')) { const n = +st.split(':')[1]; const left = (itemsOf.get(k) || []).filter(i => !S.items[i.id] && !covered(S, i.id) && !S.asked.has('react:' + i.id) && C.has('react:' + i.id) && C.get('react:' + i.id).ch.includes(3)); for (let i = 0; i < Math.min(n, left.length); i++) out.push('react'); continue; }
      const c = C.get(st); if (c && !S.asked.has(st) && gateOk(S, c)) out.push(st);
    }
    return out;
  }
  function pickLane(S) {
    const bonus = S.chapter === 6;
    { const g = guessTurn(S); if (g) return g; }
    if (S.since.duel >= (bonus ? 10 : 15)) { const d = pickDuel(S); if (d) return d; }
    // between visits: if the decade is still open, a probe that splits it (it shapes every guess after)
    if (!S.dive && S.answers >= 10) { const pr = ageProbe(S); if (pr && H4(agePost(S)) > 1.2) return asView(S, pr); }
    // between visits: anything left from "Your world" that would now teach more than a new lane
    if (!S.dive && !bonus) { const left = WORLD.map(id => C.get(id)).filter(c => c && !S.asked.has(c.id) && gateOk(S, c)); const w = left.length ? pickBest(S, left) : null; if (w && cardValue(S, C.get(w.id)) > 2.2) return w; }
    // continue the current visit
    if (S.dive) {
      const k = S.dive.area, probeNo = S.dive.done >= 1 && mean(S, k) < .22;
      const cap = S.chapter === 6 ? 14 : S.dive.full ? 4 : 2;
      if (!probeNo && S.dive.done < cap) { const c = laneCard(S, k); if (c) return c; }
      S.dive = null;
    }
    // choose the next area: a draw from each belief, times what's left to learn there
    let best = null, bs = -1;
    for (const a of AREAS) {
      if (S.dived.includes(a.k)) continue;
      const steps = laneSteps(S, a.k); if (!steps.length) continue;
      const [x, y] = S.A[a.k], th = betaSample(S.r, x, y);
      // what sets this person apart counts: an area they're into more than most people beats a near-universal one
      const near = nearGuesses(S).filter(n => n.area === a.k).length;
      const s = th * Math.sqrt(th / Math.max(.1, a.prior)) * (1 + .05 * Math.min(6, steps.length)) * (1 + .15 * near);
      if (s > bs) { bs = s; best = a.k; }
    }
    if (!best) return bonus ? pickAnything(S) : null;
    const full = mean(S, best) >= .5 || S.chapter === 6;
    S.dive = { area: best, done: 0, full }; S.dived.push(best);
    S.log.push({ c: `lane:${best}`, v: null, ms: 0, at: 0 });
    return laneCard(S, best) || pickLane(S);
  }
  function laneCard(S, k) {
    for (const st of DIVES[k] || []) {
      if (st.startsWith('react:')) {
        const n = +st.split(':')[1];
        const done = (itemsOf.get(k) || []).filter(i => S.asked.has('react:' + i.id)).length;
        if (done >= n * (1 + (S.chapter === 6 ? 1 : 0))) continue;
        // if the answer to a card here is already near-certain, say it instead of asking it (Nov 5: guesses all the
        // way through; in a lane they come from what the person just told us)
        { const g = laneCall(S, k); if (g) return g; }
        const it = pickItem(S, k); if (it) return asView(S, C.get('react:' + it.id));
        continue;
      }
      const c = C.get(st); if (c && !S.asked.has(st) && gateOk(S, c)) return asView(S, c);
    }
    return null;
  }
  function laneCall(S, k) {
    if (S.since.guess < 2 || S.answers < 12 || !S.dive || S.dive.done < 1) return null;
    const lk = []; for (let i = S.log.length - 1; i >= 0 && lk.length < 2; i--) if (S.log[i].c.startsWith('guess:')) lk.push(S.log[i].c.split(':')[1]);
    let best = null;
    for (const it of itemsOf.get(k) || []) {
      if (S.items[it.id] || covered(S, it.id) || S.asked.has('react:' + it.id) || S.asked.has(`guess:item:${it.id}`) || S.asked.has(`guess:not:${it.id}`) || it.pop < .3) continue;
      const b0 = baseItem(it.id);
      const yes = guessScore(S, 'item', it.id), no = guessScore(S, 'not', it.id);
      // a yes on something most people love, or a no on something nobody's into, says nothing
      if (yes.p >= .74 && b0 <= .6 && ageFit(S, it.fx.g) >= .5 && (!best || yes.p > best.p)) best = { kind: 'item', subj: it.id, p: yes.p, tier: yes.tier };
      if (no.p >= .78 && b0 >= .2 && !(NEG.has(lk[0]) && NEG.has(lk[1])) && (!best || no.p > best.p)) best = { kind: 'not', subj: it.id, p: no.p, tier: null };
    }
    return best ? guessView(S, best.kind, best.subj, best.p, { tier: best.tier }) : null;
  }
  function pickItem(S, k) {
    let best = null, bs = -1;
    for (const it of itemsOf.get(k) || []) {
      const id = 'react:' + it.id; if (!C.has(id) || S.asked.has(id) || S.items[it.id] || covered(S, it.id)) continue;
      const fit = ageFit(S, it.fx.g); if (fit < .2) continue;   // only among what this person is likely to know
      // the most informative: well-known first (an answer is likely), what we can't yet call either way, what splits
      // the open traits and, while it's open, the decade
      let s = (.45 * it.pop + .7 * ent(predictItem(S, it.id)) + infoOfFx(S, { t: it.fx.t }) * .45) * (.15 + .85 * fit) + ageItemInfo(S, it) + steer(S, C.get(id));
      s *= .8 + .4 * S.r();
      if (s > bs) { bs = s; best = it; }
    }
    return best;
  }
  function pickAnything(S) {
    for (const c of bank.cards) if (!S.asked.has(c.id) && gateOk(S, c) && c.type !== 'react' && c.ch.some(x => x >= 2)) return asView(S, c);
    for (const c of bank.cards) if (!S.asked.has(c.id) && c.type === 'react' && !covered(S, c.item) && !S.items[c.item]) return asView(S, c);
    return pickVs(S) || pickDuel(S);
  }
  // infinite mode: two things you like, one has to go (mostly the same kind, sometimes across your life)
  function pickVs(S) {
    const liked = Object.entries(S.items).filter(([id, s]) => (s === 'love' || s === 'like') && ITEM.get(id)?.img).map(([id]) => id);
    if (liked.length < 2) return null;
    const sameFirst = S.r() < .65;
    for (let pass = 0; pass < 2; pass++) for (let tries = 0; tries < 60; tries++) {
      const a = liked[Math.floor(S.r() * liked.length)], b = liked[Math.floor(S.r() * liked.length)];
      if (a === b) continue;
      const same = ITEM.get(a).kind === ITEM.get(b).kind;
      if (pass === 0 && same !== sameFirst) continue;
      const id = `vs:${a}:${b}`; if (id.length > 90 || S.asked.has(id) || S.asked.has(`vs:${b}:${a}`)) continue;
      return vsCard(S, a, b);
    }
    return null;
  }
  const EDGE = ['multi:instant-no', 'react:thing', 'multi:diet', 'multi:allergies', 'tiles:cuisines', 'tiles:splurge', 'react:thing', 'pick:top-shelf', 'pick:2am', 'pick:birth-order', 'react:thing', 'pick:all-nighter', 'pick:kids', 'pick:relationship', 'react:thing', 'tiles:going-out', 'tiles:topics'];
  function pickEdge(S) {
    const ids = EDGE.filter(id => id !== 'react:thing');
    const p = pool(S, [...ids, ...WORLD], 4);
    // a quick "Be honest" now and then: the best of the everyday things, never two in a row
    if (!S.log.slice(-1)[0]?.c.startsWith('react:')) {
      const things = bank.items.filter(i => (i.kind === 'thing' || ['music:taylor-swift', 'person:kim-kardashian', 'creator:mrbeast', 'food:pineapple-pizza'].includes(i.id)) && !S.asked.has('react:' + i.id) && !S.items[i.id] && !covered(S, i.id) && C.has('react:' + i.id));
      let best = null, bs = -1; for (const it of things) { const fit = ageFit(S, it.fx.g); if (fit < .2) continue; const s = (.4 * it.pop + infoOfFx(S, { t: it.fx.t, a: it.fx.a })) * (.15 + .85 * fit) + ageItemInfo(S, it) + .3 * S.r(); if (s > bs) { bs = s; best = it; } }
      if (best) p.push(C.get('react:' + best.id));
    }
    return pickBest(S, p);
  }
  function finalGuess(S) {
    const ag = agePost(S), [bAge, pAge] = Object.entries(ag).sort((a, b) => b[1] - a[1])[0];
    const st = { streak: { i: S.inCh + 1, n: 4 } };
    if (!S.asked.has(`guess:age:${bAge}`) && !S.est.age && pAge > .34) return guessView(S, 'age', bAge, pAge, st);
    if (!AGE.some(b => S.asked.has('guess:age:' + b)) && !S.est.age) return guessView(S, 'age', bAge, pAge, st);
    if (!S.asked.has('guess:edu:college') && !S.est.education) { const p = educationGuess(S); return guessView(S, 'edu', 'college', p, st); }
    if (!S.asked.has('guess:budget:band') && !S.est.budget) { const b = budgetBand(S); return guessView(S, 'budget', 'band', b.conf, st); }
    const a = archetype(S);
    if (a && !bank.archetypes.some(x => S.asked.has('guess:arch:' + x.k))) return guessView(S, 'arch', a.k, .7, st);
    return null;
  }

  // ------------------------------------------------------------------ readings: the "seen" moments
  function topAreas(S, n = 5) { return AREAS.map(a => ({ k: a.k, name: a.name, m: mean(S, a.k), g: a.g })).sort((a, b) => b.m - a.m).slice(0, n); }
  const fmtS = ms => (ms / 1000).toFixed(1) + 's';
  function readingFor(S, n) {
    const lines = [], tells = [];
    const tr = bank.traits.map(t => traitView(S, t.k)).filter(t => Math.abs(t.m) > .25).sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
    const m = S.meta || {};
    if (n === 1) {
      if (tr.length >= 2) lines.push(`You’re ${tr[0].you}, and ${tr[1].you}.`);
      else if (tr.length) lines.push(`You’re ${tr[0].you}.`);
      if (m.device && Number.isInteger(m.hour)) {
        const h = m.hour % 12 || 12, ampm = m.hour < 12 ? 'a.m.' : 'p.m.';
        const late = m.hour >= 23 || m.hour < 4;
        lines.push(`Playing on ${m.device} at ${h}${m.minute != null ? ':' + String(m.minute).padStart(2, '0') : ''} ${ampm}${late ? ' Night owl, noted.' : ''}`);
      }
    }
    if (n === 2) {
      const t = topAreas(S, 3); lines.push(`Your life runs on ${t[0].name.toLowerCase()}, ${t[1].name.toLowerCase()} and ${t[2].name.toLowerCase()}.`);
      const wk = (S.log.find(e => e.c === 'multi:this-week')?.v || []).length;
      if (wk >= 6) lines.push(`${wk} things this week. You don’t sit still.`); else if (wk && wk <= 2) lines.push('A quiet week. Nothing wrong with that.');
      const ag = agePost(S), top = Object.entries(ag).sort((a, b) => b[1] - a[1])[0];
      if (top[1] > .45 && !AGE.some(b => S.asked.has('guess:age:' + b))) lines.push(`I have a feeling about when you were born. I’ll tell you later.`);
    }
    if (n === 3) {
      const used = Object.entries(S.apps).filter(([, s]) => s === 'use' || s === 'love').map(([k]) => APP.get(k).n);
      if (used.length) lines.push(`${used.length} apps on your map: ${used.slice(0, 3).join(', ')}${used.length > 3 ? ' and more' : ''}.`);
      const loves = Object.entries(S.items).filter(([, s]) => s === 'love').map(([id]) => ITEM.get(id).n);
      if (loves.length) lines.push(`You lit up for ${loves.slice(0, 3).join(', ')}.`);
    }
    if (n === 4) {
      const nev = S.facts.never || []; if (nev.length) lines.push(`Never suggesting: ${nev.slice(0, 3).map(v => C.get('multi:instant-no').opts.find(o => o.value === v)?.label.toLowerCase()).filter(Boolean).join(', ')}.`);
      const want = Object.entries(S.items).filter(([, s]) => s === 'want').map(([id]) => ITEM.get(id).n);
      if (want.length) lines.push(`Next on your list: ${want.slice(0, 2).join(' and ')}.`);
    }
    if (n >= 6) {
      const pool = [], g = S.guesses;
      if (g.made >= 5) pool.push(`${g.hits} of ${g.made} guesses right. I’m getting to know you.`);
      const t = topAreas(S, 5); pool.push(`Right now your life leans ${t[0].name.toLowerCase()}, ${t[1].name.toLowerCase()} and ${t[2].name.toLowerCase()}.`);
      const tr6 = bank.traits.map(x => traitView(S, x.k)).filter(x => Math.abs(x.m) > .3).sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
      if (tr6[2]) pool.push(`Something new I noticed: you’re ${tr6[2].you}.`);
      const wish = [...Object.entries(S.items).filter(([, x]) => x === 'wish').map(([id]) => ITEM.get(id).n), ...Object.values(S.tiles).filter(x => x.s === 'wish').map(x => x.n)];
      if (wish.length) pool.push(`On your someday list: ${wish.slice(0, 3).join(', ')}.`);
      if (S.picks.length >= 2) pool.push(`When it comes down to it, you keep picking ${ITEM.get(S.picks[0]).n}.`);
      const want = Object.entries(S.items).filter(([, x]) => x === 'want').map(([id]) => ITEM.get(id).n);
      if (want.length >= 2) pool.push(`You’re curious about ${want.slice(-2).join(' and ')}. I’ll remember.`);
      const k = Math.floor(S.answers / 15);
      for (let i = 0; i < pool.length && lines.length < 3; i++) lines.push(pool[(k + i) % pool.length]);
    }
    for (const c of contrasts(S)) if (lines.length < 4) lines.push(c);
    const fast = S.tells.filter(t => t.kind === 'fast').sort((a, b) => a.ms - b.ms)[0], slow = S.tells.filter(t => t.kind === 'slow').sort((a, b) => b.ms - a.ms)[0];
    if (fast && !S._told?.includes(fast.id)) { tells.push(`${fast.what} in ${fmtS(fast.ms)}. ${COPY.fast[S.answers % COPY.fast.length]}`); (S._told ||= []).push(fast.id); }
    if (slow && !S._told?.includes(slow.id)) { tells.push(`${slow.what} took you ${fmtS(slow.ms)}. ${COPY.slow[S.answers % COPY.slow.length]}`); (S._told ||= []).push(slow.id); }
    return { lines: lines.slice(0, 4), tells: tells.slice(0, 2), top: topAreas(S, 6), pct: pct(S), guesses: { ...S.guesses } };
  }
  function contrasts(S) {
    const out = [], T = k => S.T[k][0];
    const d = Number(S.facts['dinner-for-two']?.[0]);
    if (T('spend') < -.3 && d >= 140) out.push('You say you’re a saver. Your dinner budget disagrees.');
    if (T('social') < -.35 && (S.items['place:festival'] === 'love' || mean(S, 'concerts') > .7)) out.push('Homebody, but you never miss a show.');
    if (T('health') > .35 && ['food:donuts', 'food:fries', 'food:fried-chicken'].some(i => S.items[i] === 'love')) out.push('Health first. Fries second. Fair.');
    if (T('novel') > .4 && ['show:friends-1994', 'show:the-office-2005', 'show:gilmore-girls-2000'].some(i => S.items[i] === 'love')) out.push('Always something new, except the comfort show you’ve seen ten times.');
    if (T('plan') > .4 && S.facts.trips?.includes('road')) out.push('A planner who loves a road trip. Bet it has a spreadsheet.');
    if (T('night') > .45 && S.facts['workout-time']?.[0] === 'morning') out.push('Up at 2 a.m. and at the gym before work. How?');
    if (mean(S, 'games') > .7 && T('social') > .4) out.push('Social, but your favorite people might be online.');
    return out;
  }
  function pct(S) {
    const ac = AREAS.reduce((s, a) => s + (1 - varA(S, a.k) / var0(a.k)), 0) / AREAS.length;
    const tc = bank.traits.reduce((s, t) => s + (1 - S.T[t.k][1] / .35), 0) / bank.traits.length;
    const known = Object.keys(S.apps).length + Object.keys(S.items).length + Object.keys(S.tiles).length;
    const x = .38 * ac + .32 * tc + .3 * Math.min(1, known / 160);
    return Math.round(100 * clamp(1 - Math.exp(-2.6 * x)) / (1 - Math.exp(-2.6)));
  }
  function status(S) {
    const lit = {};
    for (const a of AREAS) { const m = mean(S, a.k), c = 1 - varA(S, a.k) / var0(a.k); lit[a.k] = +(clamp((m - .3) / .45) * clamp(c * 2.6)).toFixed(3); }
    const appsOn = Object.entries(S.apps).filter(([, s]) => s === 'use' || s === 'love').map(([k]) => k);
    return { chapter: S.chapter, answers: S.answers, pct: pct(S), lit, appsOn, coreDone: S.coreDone, lane: S.dive?.area || null, guesses: { ...S.guesses } };
  }

  // ------------------------------------------------------------------ the profile (what is saved, after review)
  function profile(S, opts = {}) {
    const off = new Set(opts.off || []);
    const areas = AREAS.map(a => ({ k: a.k, name: a.name, score: +mean(S, a.k).toFixed(3), conf: +clamp(1 - varA(S, a.k) / var0(a.k)).toFixed(3) }));
    const appRow = k => { const a = APP.get(k); return { k, n: a.n, area: a.area }; };
    const apps = { use: [], used: [], no: [] };
    for (const [k, s] of Object.entries(S.apps)) {
      if (off.has('app:' + k)) continue;
      if (s === 'use' || s === 'love') apps.use.push(appRow(k)); else if (s === 'used') apps.used.push(appRow(k)); else if (s === 'no') apps.no.push(k);
    }
    const items = [];
    const v2 = !!opts.v2;   // the account understands wish answers, blockers and fact labels (deployed 2026-10-29)
    const st = x => (!v2 && x === 'wish' ? 'want' : x);
    for (const [id, s] of Object.entries(S.items)) { if (off.has('item:' + id)) continue; const it = ITEM.get(id); const row = { id, n: it.n, kind: it.kind, area: it.area, s: st(s) }; if (v2 && s === 'wish' && S.blockers[id]) row.b = S.blockers[id]; items.push(row); }
    for (const [id, t] of Object.entries(S.tiles)) { if (off.has('item:' + id)) continue; const row = { id, n: t.n, kind: t.kind, area: t.area || 'events', s: st(t.s === 'use' ? 'like' : t.s) }; if (v2 && t.b) row.b = t.b; items.push(row); }
    for (const v of S.facts.never || []) { const o = C.get('multi:instant-no').opts.find(o => o.value === v); if (o && !off.has('item:never:' + v)) items.push({ id: 'never:' + v, n: o.label, kind: 'genre', area: 'movies', s: 'nope' }); }
    const traits = bank.traits.map(t => { const tv = traitView(S, t.k); return { k: t.k, label: tv.label, v: +tv.m.toFixed(3), conf: +clamp(1 - tv.v / .35).toFixed(3) }; }).filter(t => !off.has('trait:' + t.k));
    const facts = {};
    for (const [k, v] of Object.entries(S.facts)) if (!off.has('fact:' + k) && v.length) facts[k] = v.slice(0, 20).map(String);
    if (S.other.length) facts['other-apps'] = S.other.map(k => AREA.get(k).name).slice(0, 20);
    if (S.picks.length) facts.favorites = S.picks.slice(0, 20).map(id => ITEM.get(id).n.slice(0, 60));
    const factLabels = {};
    if (v2) for (const [k, v] of Object.entries(facts)) factLabels[k] = { label: factLabel(k).slice(0, 40), values: v.map(x => (k === 'other-apps' || k === 'favorites' || k === 'lives' ? x : optLabel(k, x))).map(x => String(x).slice(0, 80)).slice(0, 20) };
    const estimates = estimatesOf(S).filter(e => !off.has('est:' + e.k));
    const a = archetype(S);
    const r = readingFor({ ...S, tells: [], _told: [] }, 3);
    return {
      v: 1, bank: bank.v, cards: Math.min(3000, S.answers), secs: Math.min(14400, Math.round((S.log.at(-1)?.at || 0) / 1000)),
      archetype: { k: a.k, name: a.name, line: a.line }, areas, apps, items: items.slice(0, 600), traits, facts, ...(v2 ? { factLabels } : {}),
      values: S.values.map(v => C.get('rank:values').opts.find(o => o.value === v)?.label).filter(Boolean),
      guesses: { made: S.guesses.made, hits: S.guesses.hits, misses: S.guesses.misses },
      tells: S.tells.slice(-8).map(t => ({ kind: t.kind, text: `${t.what}: ${fmtS(t.ms)}` })),
      lines: [...r.lines, ...contrasts(S)].slice(0, 10),
      estimates,
      meta: { device: String(S.meta.device || '').slice(0, 40), os: String(S.meta.os || '').slice(0, 40), tz: String(S.meta.tz || '').slice(0, 64), hour: Number.isInteger(S.meta.hour) ? S.meta.hour : 0, secs: Math.min(14400, Math.round((S.log.at(-1)?.at || 0) / 1000)), done: !!S.coreDone },
    };
  }
  function estimatesOf(S) {
    const out = [];
    const ag = agePost(S), [b, p] = Object.entries(ag).sort((x, y) => y[1] - x[1])[0];
    if (S.est.age) out.push({ k: 'born', label: 'Born in', value: AGE_LABEL[S.est.age.value], conf: S.est.age.conf, confirmed: !!S.est.age.confirmed });
    else if (p > .4) out.push({ k: 'born', label: 'Born in', value: AGE_LABEL[b], conf: +p.toFixed(2), confirmed: false });
    const bb = S.est.budget ? { value: S.est.budget.value, conf: S.est.budget.conf, confirmed: S.est.budget.confirmed } : null;
    const band = budgetBand(S);
    const bandLabel = k => ({ tight: 'Watching every dollar', careful: 'Careful with money', mid: 'Comfortable mid-range', upper: 'Comfortable, likes nice things', high: 'Premium everything' })[k];
    // an estimate needs something behind it: a money answer, a confirmed guess, or a clear lean in spending answers
    const moneyEvidence = ['dinner-for-two', 'flight', 'ride', 'home-status', 'invests', 'splurges'].some(f => S.facts[f]) || Math.abs(band.x) >= .35;
    const declined = S.asked.has('guess:budget:band') && !bb; // “Rather not say” means no money line at all
    if (!declined && (bb || moneyEvidence)) out.push({ k: 'budget', label: 'Money style', value: bandLabel(bb ? bb.value : band.k), conf: +(bb ? bb.conf : band.conf).toFixed(2), confirmed: !!bb?.confirmed });
    if (S.est.education) out.push({ k: 'education', label: 'School', value: { yes: 'College', grad: 'Grad school', now: 'In school now', no: 'Didn’t go to college' }[S.est.education.value] || 'Rather not say', conf: .95, confirmed: true });
    const hb = heightBand(S); if (hb) out.push({ k: 'height', label: 'Height', value: hb, conf: .7, confirmed: false });
    if (S.est.home?.code) { const h = HOME[S.est.home.code]; out.push({ k: 'home', label: 'Lives in', value: cap((S.est.home.level === 'region' ? h[1] : h[2]).replace(/^the /, '')), conf: .95, confirmed: true }); }
    const circ = S.facts['2am']?.[0]; if (circ) out.push({ k: 'circle', label: 'Close circle', value: { none: 'Small, mostly solo', one: 'One person you’d call', few: 'Two or three people', many: 'A big circle' }[circ], conf: .75, confirmed: false });
    const lp = S.facts['last-post']?.[0]; if (lp) out.push({ k: 'followers', label: 'Followers', value: { none: 'Doesn’t post', tiny: 'Under a few hundred', some: 'A few hundred to a few thousand', lots: 'Thousands', big: 'Tens of thousands or more' }[lp], conf: .6, confirmed: false });
    const phone = (S.facts.phone || [])[0] || S.est.phone?.value; if (phone) out.push({ k: 'phone', label: 'Phone', value: phone, conf: S.facts.phone ? .95 : S.est.phone.conf, confirmed: !!S.facts.phone });
    const liv = S.facts.living || []; if (liv.length) out.push({ k: 'household', label: 'At home', value: liv.map(v => ({ alone: 'Just you', partner: 'A partner', roommates: 'Roommates', family: 'Family', kids: 'Kids', pets: 'Pets' })[v]).filter(Boolean).join(', '), conf: .95, confirmed: true });
    if (S.est.archetype) { const a = bank.archetypes.find(x => x.k === S.est.archetype.value); if (a) out.push({ k: 'archetype', label: 'You are', value: a.name, conf: S.est.archetype.conf, confirmed: !!S.est.archetype.confirmed }); }
    return out.slice(0, 24);
  }
  // the brain's own signal vocabulary (categories it already knows); the person sees and approves each one
  function memories(S, opts = {}) {
    const off = new Set(opts.off || []), out = [];
    const add = (category, subject, polarity) => { const key = `${category}|${subject}`; if (!off.has('mem:' + key) && !out.some(m => m.key === key) && subject) out.push({ key, category, subject: subject.toLowerCase().slice(0, 60), polarity }); };
    for (const [id, t] of Object.entries(S.tiles)) if (t.kind === 'genre' && (t.s === 'love' || t.s === 'nope')) add('genre', t.n, t.s === 'love' ? 2 : -1);
    for (const v of S.facts.never || []) { const o = C.get('multi:instant-no').opts.find(o => o.value === v); if (o) add('genre', o.label, -2); }
    for (const [id, s] of Object.entries(S.items)) { const it = ITEM.get(id); if (['music', 'creator', 'person'].includes(it.kind) && s === 'love') add('creator', it.n, 2); }
    const so = S.T.social[0]; if (so > .4) add('social', 'friends', 1); else if (so < -.4) add('social', 'solo', 1);
    const nv = S.T.novel[0]; if (nv > .4) add('novelty', 'new things', 1); else if (nv < -.4) add('novelty', 'rewatches', 1);
    const ww = S.facts['win-wander']?.[0]; if (ww) add('gaming', { win: 'competitive', wander: 'exploration', cozy: 'casual', story: 'story' }[ww] || ww, 1);
    for (const [k, s] of Object.entries(S.apps)) { const a = APP.get(k); if ((s === 'use' || s === 'love') && ['movies', 'tv', 'livetv', 'music'].includes(a.area)) add('access', a.n, 1); }
    return out.slice(0, 25);
  }
  // ratings for the Tastebud (the graph's own entity ids), so the account starts with a real one
  function tastebud(S) {
    const ratings = {}, favs = [];
    for (const [id, s] of Object.entries(S.items)) {
      if (!/^(music|creator|person|show|movie|game|book|podcast|franchise):/.test(id)) continue;
      const v = { love: 1, like: .5, meh: 0, nope: -1 }[s]; if (v == null) continue;
      ratings[id] = v; if (s === 'love' && favs.length < 8) favs.push(id);
    }
    return Object.keys(ratings).length ? { ratings, favs } : null;
  }
  // what the review screen lists (each row can be turned off before saving)
  function review(S) {
    const P = profile(S), groups = [];
    groups.push({ k: 'about', title: 'About you', rows: P.estimates.map(e => ({ key: 'est:' + e.k, label: e.label, value: e.value, note: e.confirmed ? 'You confirmed this' : 'Estimate' })) });
    // only areas your answers actually touched; the rest are still population starting points, not you
    const top = P.areas.filter(a => a.conf >= EVIDENCE).sort((a, b) => b.score - a.score).slice(0, 8);
    if (top.length) groups.push({ k: 'areas', title: 'Your biggest areas', rows: top.map(a => ({ key: 'area:' + a.k, label: a.name, value: Math.round(a.score * 100) + '%', locked: true })) });
    groups.push({ k: 'apps', title: 'Your apps', rows: P.apps.use.map(a => ({ key: 'app:' + a.k, label: a.n, app: a.k })) });
    const love = P.items.filter(i => i.s === 'love' || i.s === 'like');
    groups.push({ k: 'loves', title: 'What you love', rows: love.slice(0, 80).map(i => ({ key: 'item:' + i.id, label: i.n, value: i.s === 'love' ? 'Love' : 'Like' })) });
    const want = P.items.filter(i => i.s === 'want');
    if (want.length) groups.push({ k: 'want', title: 'Want to try', rows: want.map(i => ({ key: 'item:' + i.id, label: i.n })) });
    const skip = P.items.filter(i => i.s === 'nope');
    if (skip.length) groups.push({ k: 'skip', title: 'Never suggest', rows: skip.map(i => ({ key: 'item:' + i.id, label: i.n })) });
    const sens = ['allergies', 'diet', 'relationship', 'dating-pref', 'kids'];
    const factRows = Object.entries(P.facts).filter(([k]) => !['never'].includes(k)).map(([k, v]) => ({ key: 'fact:' + k, label: factLabel(k), value: v.map(x => optLabel(k, x)).join(', '), sensitive: sens.includes(k) }));
    groups.push({ k: 'facts', title: 'Things you told me', rows: factRows });
    groups.push({ k: 'traits', title: 'How you are', rows: P.traits.filter(t => Math.abs(t.v) > .3).map(t => ({ key: 'trait:' + t.k, label: t.label })) });
    return groups.filter(g => g.rows.length);
  }
  const FACT_LABEL = { phone: 'Phone', stage: 'Right now', home: 'Home', living: 'At home with', diet: 'Diet', allergies: 'Allergies', pets: 'Pets', kids: 'Kids', relationship: 'Love life',
    'dating-pref': 'Want to meet', trips: 'Trips', 'trips-a-year': 'Trips a year', 'dinner-for-two': 'Dinner for two', 'spice-level': 'Spice', screen: 'Phone hours a day', 'gets-around': 'Gets around',
    style: 'Style', sleep: 'Sleep', tracks: 'Tracks', invests: 'Invests in', 'work-where': 'Works', field: 'Field', languages: 'Languages', 'home-status': 'Home', plays: 'Plays', 'movie-genres': 'Movie genres',
    'tv-genres': 'TV', 'music-genres': 'Music', 'game-genres': 'Games', 'book-genres': 'Books', 'creator-types': 'On your feed', moves: 'Moves', follows: 'Follows', places: 'Places', 'nights-out': 'Nights out',
    topics: 'Topics', splurges: 'Splurges on', lives: 'Lives in', parks: 'Theme parks', festivals: 'Festivals', 'other-apps': 'Also uses other apps for', favorites: 'Keeps picking', routine: 'Routine', devices: 'Devices', 'grew-up': 'Grew up with', cuisines: 'Cuisines', 'birth-order': 'Family', 'group-chats': 'Group chats', animal: 'Dogs or cats', eats: 'Cook or order', drink: 'Coffee or tea', spice: 'Spicy or mild', lean: 'City or country' };
  const factLabel = k => FACT_LABEL[k] || cap(k.replace(/-/g, ' '));
  function optLabel(k, v) {
    for (const c of bank.cards) if ((c.fact === k || c.id.split(':')[1] === k) && c.opts) { const o = c.opts.find(o => o.value === v); if (o) return o.label; }
    // this-or-that cards set facts through each side's effects (Dogs or cats → "dogs"): show that side's label
    for (const c of bank.cards) if (c.type === 'tt' && c.opts) { const o = c.opts.find(o => o.fx?.f?.[k]?.includes(v)); if (o) return o.label; }
    if (k === 'dinner-for-two') return '$' + v; const s = String(v); return s ? cap(s) : s;
  }

  // ------------------------------------------------------------------ replay
  // A replay rebuilds what the log doesn't hold the way play did: the readings already given (so a resumed or undone
  // game doesn't repeat one, or a tell it already told) and how long a lane visit runs.
  function replayOne(S, e) {
    if (!e || typeof e.c !== 'string') return;
    if (/^ch:\d$/.test(e.c)) {
      if (S.chapter >= 1 && S.chapter <= 4 && endDue(S)) readingFor(S, S.chapter);
      S.chapter = +e.c.slice(3); S.inCh = 0; S.gInCh = 0; S.dive = null; if (S.chapter === 6) S.dived = []; S.log.push(e); return;
    }
    if (e.c === 'core') { S.coreDone = true; S.log.push(e); return; }
    if (e.c.startsWith('lane:')) { const k = e.c.slice(5); if (AREA.has(k)) { S.dive = { area: k, done: 0, full: mean(S, k) >= .5 || S.chapter === 6 }; if (!S.dived.includes(k)) S.dived.push(k); } S.log.push(e); return; }
    const card = cardFor(S, e.c); if (!card) return;
    answer(S, card, e.v, { ms: e.ms, h: e.h, ch: e.ch, at: e.at });
    if (readDue(S) && !endDue(S)) { S.readAt = S.answers; readingFor(S, 6); }
  }
  function replay(log, init = {}) { return session({ ...init, log }); }
  function toLog(S) { return S.log.slice(); }
  // Undo (Martin, Oct 29: as many times as you like): the game without its latest answer, rebuilt by replay (the
  // chapter and lane markers after that answer go with it), and that answer's card to show again.
  const MARKER = /^(ch:\d|lane:|core$)/;
  function undo(S) {
    let i = S.log.length - 1; while (i >= 0 && MARKER.test(S.log[i].c)) i--;
    if (i < 0) return null;
    const entry = S.log[i], S2 = session({ seed: S.seed, meta: S.meta, log: S.log.slice(0, i) });
    return { S: S2, entry, card: cardFor(S2, entry.c) };
  }
  const canUndo = S => S.log.some(e => !MARKER.test(e.c));

  return {
    session, next: nextOuter, answer, status, profile, memories, tastebud, review, replay, toLog, cardFor, undo, canUndo,
    predictApp, predictItem, agePost: S => agePost(S), mean, archetype, budgetBand, readingFor,
    guessCands: S => guessCands(S),   // for tests: the guesses it could make right now, best first
    areas: AREAS, apps: APP, items: ITEM, version: bank.v,
  };
}
