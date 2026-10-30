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

export const ENGINE_VERSION = 1;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sig = x => 1 / (1 + Math.exp(-x));
const AGE = ['z', 'y', 'x', 'o'];
const AGE_LABEL = { z: 'the 2000s', y: 'the 90s', x: 'the 80s', o: 'the 70s or earlier' };
const AGE_PRIOR = { z: .3, y: .32, x: .22, o: .16 };
const PFX = ['', '+', '++', '-'];  // tile states in the log: +v once, ++v twice, -v three times
// typical answer times (ms) per card type before we know the person's own pace
const BASE = { tt: 1800, react: 2600, pick: 3400, multi: 6500, rank: 7000, slider: 3800, duel: 3600, guess: 2600, tiles: 8000 };
const STANCE_W = { love: 1, like: .55, meh: .15, nope: -.7, want: .3, pass: -.35, unknown: 0, cant: 0, use: .8, used: .15, yes: 1 };

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
  const CORE = 64;   // answers before the core map is "done" (about ten minutes); the game can always go on

  // ------------------------------------------------------------------ state
  function session(init = {}) {
    const S = {
      v: 1, bank: bank.v, log: [], asked: new Set(), chapter: 0, inCh: 0, answers: 0,
      A: {}, T: {}, apps: {}, items: {}, facts: {}, est: {}, tiles: {}, values: [], age: { z: 0, y: 0, x: 0, o: 0 },
      guesses: { made: 0, hits: 0, misses: 0, log: [] }, lat: {}, dived: [], dive: null, since: { guess: 0, duel: 0 },
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
  function evG(S, g, w) { if (!g) return; for (const b of AGE) if (g[b]) S.age[b] += g[b] * w * 1.4; }
  function agePost(S) {
    const l = AGE.map(b => Math.log(AGE_PRIOR[b]) + S.age[b]), mx = Math.max(...l), e = l.map(x => Math.exp(x - mx)), z = e.reduce((s, x) => s + x, 0);
    return Object.fromEntries(AGE.map((b, i) => [b, e[i] / z]));
  }
  function addFact(S, k, v, replace) { if (!k) return; if (replace || !S.facts[k]) S.facts[k] = []; for (const x of [].concat(v)) if (!S.facts[k].includes(x)) S.facts[k].push(x); }
  // effects of one option: a = areas, t = traits, g = age, f = facts, apps
  function applyFx(S, fx, m = 1, sign = 1) {
    if (!fx) return;
    for (const [k, w] of Object.entries(fx.a || {})) evA(S, k, w * sign, m);
    for (const [k, y] of Object.entries(fx.t || {})) evT(S, k, clamp(y * sign, -1, 1), .55 * m * Math.min(1, Math.abs(y) + .4));
    if (sign > 0) evG(S, fx.g, m);
    if (sign > 0) for (const [k, v] of Object.entries(fx.f || {})) addFact(S, k, v);
    if (sign > 0 && fx.apps) for (const [st, ks] of Object.entries(fx.apps)) for (const k of ks) setApp(S, k, st === 'use' ? 'use' : st);
  }
  function setApp(S, k, st) {
    const a = APP.get(k); if (!a) return;
    const prev = S.apps[k]; S.apps[k] = st;
    if (prev === st) return;
    evA(S, a.area, st === 'use' || st === 'love' ? .45 : st === 'used' ? .05 : -.04);
    if (a.tags.includes('apple') && (st === 'use' || st === 'love')) S.est.phone ||= { value: 'iPhone', conf: .6, via: 'apps' };
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
    const area = AREA.get(a.area), m = mean(S, a.area);
    let p = m * clamp(a.pop / Math.max(.08, area.prior), .01, .92);
    const phone = (S.facts.phone || [])[0] || S.est.phone?.value;
    if (a.tags.includes('apple')) p *= phone === 'Android' ? .08 : phone === 'iPhone' ? 1.5 : 1;
    if (a.tags.includes('google') && phone === 'Android') p *= 1.35;
    if (a.tags.includes('samsung')) p *= phone === 'Android' ? 1.5 : .05;
    const ag = agePost(S);
    if (a.tags.includes('young')) p *= .55 + 1.2 * (ag.z + .5 * ag.y);
    if (a.tags.includes('older')) p *= .55 + 1.3 * (ag.x + ag.o);
    const spend = S.T.spend[0], luxe = S.T.luxe[0];
    if (a.tags.includes('premium')) p *= 1 + .6 * clamp(luxe + .5 * spend, -.8, 1);
    if (a.tags.includes('budget')) p *= 1 - .4 * clamp(luxe + .5 * spend, -1, 1);
    return clamp(p, .002, .97);
  }
  function predictItem(S, id) {
    const it = ITEM.get(id); if (!it) return 0;
    let x = Math.log(.32 / .68) + 1.6 * ((mean(S, it.area) - AREA.get(it.area).prior));
    for (const [k, w] of Object.entries(it.fx.t || {})) x += 1.5 * w * S.T[k][0];
    const ag = agePost(S); for (const b of AGE) x += .9 * (it.fx.g?.[b] || 0) * (ag[b] - AGE_PRIOR[b]) * 3;
    return clamp(sig(x) * (.6 + .4 * it.pop), .01, .95);
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
    if (c.type === 'tt') { v.opts = c.opts.map((o, i) => ({ value: i ? 'r' : 'l', label: o.label, img: o.img })); v.extra = [{ value: 'both', label: 'Both' }, { value: 'neither', label: 'Neither' }]; }
    else if (c.type === 'react') { const it = ITEM.get(c.item); v.item = { id: it.id, n: it.n, kind: it.kind, img: it.img, area: it.area }; v.opts = bank.answers[it.kind] || bank.answers.thing; v.q = reactQ(it); }
    else if (c.type === 'tiles') { v.mode = c.mode; v.states = c.states; v.none = c.none; v.opts = c.opts.map(o => ({ value: o.value, label: o.label, img: o.img })); }
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
  function guessView(S, kind, subj, p) {
    const pct = Math.round(clamp(p, .51, .97) * 100);
    const base = { id: `guess:${kind}:${subj}`, type: 'guess', kind, chapter: S.chapter, sub: `I’m ${pct}% sure.`, p };
    if (kind === 'app') { const a = APP.get(subj); return { ...base, q: `I bet ${a.n} is on your phone.`, img: 'app/' + a.k, opts: [{ value: 'yes', label: 'Yes, it is' }, { value: 'used', label: 'Used to be' }, { value: 'no', label: 'Nope' }] }; }
    if (kind === 'item') { const it = ITEM.get(subj); return { ...base, q: `Bet you’re into ${it.n}.`, img: it.img, item: { n: it.n, kind: it.kind }, opts: [{ value: 'love', label: 'Called it' }, { value: 'like', label: 'It’s fine' }, { value: 'nope', label: 'Not for me' }, { value: 'unknown', label: 'Never tried it' }] }; }
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
  function cardFor(S, id) {
    if (C.has(id)) return asView(S, C.get(id));
    const p = id.split(':');
    if (p[0] === 'duel' && AREA.has(p[1]) && AREA.has(p[2])) return duelCard(S, p[1], p[2]);
    if (p[0] === 'guess') { const subj = p.slice(2).join(':'); return guessView(S, p[1], subj, .7); }
    return null;
  }

  // ------------------------------------------------------------------ answering
  function answer(S, card, value, meta = {}) {
    const c = C.get(card.id), out = { id: card.id };
    const st = strength(S, card.type === 'react' ? 'react' : card.type, { ...meta, taps: Array.isArray(value) ? value.length : 1 });
    const m = st.m;
    if (card.type === 'tt') {
      const [l, r] = c.opts;
      if (value === 'l' || value === 'r') {
        const o = value === 'l' ? l : r, other = value === 'l' ? r : l;
        applyFx(S, o.fx, m); if (meta.h) applyFx(S, other.fx, .15);
        out.picked = o.label;
      } else if (value === 'both') { applyFx(S, l.fx, .5); applyFx(S, r.fx, .5); }
      else if (value === 'neither') { applyFx(S, l.fx, .25, -1); applyFx(S, r.fx, .25, -1); }
    } else if (card.type === 'react') {
      applyStance(S, c.item, value, m);
    } else if (card.type === 'tiles') {
      const states = c.states.map(x => x.s), got = new Map();
      const vals = Array.isArray(value) ? value : [];
      vals.forEach((raw, i) => {
        const mm = /^(\+\+|\+|-)(.+)$/.exec(raw); if (!mm) return;
        const idx = mm[1] === '+' ? 0 : mm[1] === '++' ? 1 : 2, s = states[idx]; if (!s) return;
        got.set(mm[2], { s, first: i < 3 });
      });
      if (vals.includes('none')) got.clear();
      for (const o of c.opts) {
        const g = got.get(o.value);
        if (c.mode === 'apps') { if (g) setApp(S, o.value, g.s === 'love' ? 'love' : g.s); else if (vals.length) { if (!S.apps[o.value]) S.apps[o.value] = 'no'; } continue; }
        const key = `${c.kind}:${(c.area || 'x')}-${o.value}`;
        if (g) {
          const w = (STANCE_W[g.s] ?? .5) * m * (g.first ? 1.12 : 1);
          if (w > 0) applyFx(S, o.fx, w); else applyFx(S, o.fx, -w * .6, -1);
          S.tiles[key] = { s: g.s, n: o.label, kind: c.kind, area: c.area };
          if (c.fact && (g.s === 'love' || g.s === 'like' || g.s === 'want' || g.s === 'use')) addFact(S, c.fact, o.value);
        } else if (vals.length || vals.includes('none')) {
          applyFx(S, o.fx, .08, -1);   // not picked: a whisper, never a "no" (people miss tiles)
        }
      }
      if (c.mode === 'apps' && vals.length === 1 && vals[0] === 'none') evA(S, c.area, -.35);
      if (c.fact && vals.includes('none')) addFact(S, c.fact, 'none');
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
      S.since.guess = 0;
    }
    if (st.flag && (st.flag === 'fast' || st.flag === 'slow') && meta.ms) noteTell(S, card, value, st.flag, meta.ms);
    S.asked.add(card.id); S.answers++; S.inCh++; S.since.guess++; S.since.duel++;
    if (S.dive && card.area === S.dive.area) S.dive.done++;
    out.flag = st.flag;
    const entry = { c: card.id, v: value ?? null, ms: Math.round(meta.ms || 0), at: Math.round(meta.at || 0) };
    if (meta.h) entry.h = Math.min(60, meta.h); if (meta.ch) entry.ch = Math.min(60, meta.ch);
    S.log.push(entry);
    return out;
  }
  function applyStance(S, id, stance, m = 1) {
    const it = ITEM.get(id); if (!it) return;
    S.items[id] = stance;
    const fx = it.fx, w = STANCE_W[stance] ?? 0;
    if (stance === 'unknown') { for (const [k, x] of Object.entries(fx.a || {})) evA(S, k, -x * .25 * it.pop); evG(S, fx.g, -.5 * it.pop); return; }
    if (stance === 'cant') return;
    for (const [k, x] of Object.entries(fx.a || {})) evA(S, k, x * (stance === 'nope' ? .15 : stance === 'pass' ? -.4 : w), m);
    for (const [k, y] of Object.entries(fx.t || {})) {
      const obs = stance === 'love' ? y : stance === 'like' ? y * .5 : stance === 'nope' ? -y * .6 : stance === 'want' ? y * .3 : stance === 'pass' ? -y * .3 : 0;
      if (obs) evT(S, k, obs, (stance === 'love' ? .5 : .3) * m);
    }
    if (['love', 'like', 'meh', 'nope'].includes(stance)) evG(S, fx.g, .8 * m); else if (stance === 'want') evG(S, fx.g, .3);
  }
  function settleGuess(S, card, value) {
    const [, kind, ...rest] = card.id.split(':'), subj = rest.join(':');
    let hit = null;
    if (kind === 'app') { hit = value === 'yes'; setApp(S, subj, value === 'yes' ? 'use' : value === 'used' ? 'used' : 'no'); }
    else if (kind === 'item') { hit = value === 'love' || value === 'like'; applyStance(S, subj, value); }
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
    S.guesses.log.push({ s: card.id, o: hit === true ? 'hit' : hit === false ? 'miss' : 'pass' });
    const pool = hit === true ? COPY.hit : hit === false ? COPY.miss : ['Fair enough.'];
    return { hit, line: pool[S.guesses.made % pool.length] };
  }
  function noteTell(S, card, value, flag, ms) {
    let what = null;
    if (card.type === 'tt') { const c = C.get(card.id); const o = value === 'l' ? c.opts[0] : value === 'r' ? c.opts[1] : null; if (o) what = o.label; }
    else if (card.type === 'react') what = `${ITEM.get(C.get(card.id).item).n}`;
    if (!what) return;
    S.tells.push({ kind: flag, what, ms, id: card.id });
    if (S.tells.length > 30) S.tells.shift();
  }

  // ------------------------------------------------------------------ choosing the next card
  const CHAPTERS = [
    { n: 1, size: 8 }, { n: 2, size: 12 }, { n: 3, size: 0 }, { n: 4, size: 9 }, { n: 5, size: 4 }, { n: 6, size: 0 },
  ];
  function next(S) {
    if (S.ended) return { kind: 'end' };
    if (S.chapter === 0) return startChapter(S, 1);
    const ch = S.chapter;
    // chapter ends
    if (ch === 1 && S.inCh >= 8) return reading(S, 1, 2);
    if (ch === 2 && S.inCh >= 12) return reading(S, 2, 3);
    if (ch === 3 && (S.answers >= CORE - 13 || !laneLeft(S))) return reading(S, 3, 4);
    if (ch === 4 && S.inCh >= 9) return reading(S, 4, 5);
    if (ch === 5 && (S.inCh >= 4 || !finalGuess(S))) { if (!S.coreDone) { S.coreDone = true; S.log.push({ c: 'core', v: null, ms: 0, at: 0 }); return { kind: 'reveal' }; } return startChapter(S, 6); }
    const card = pick(S);
    if (card) return { kind: 'card', card };
    if (ch < 6) return startChapter(S, ch === 5 ? 6 : ch + 1);
    S.ended = true; return { kind: 'end' };
  }
  function startChapter(S, n) {
    S.chapter = n; S.inCh = 0; S.dive = null;
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
    if (ch === 1) return pickTT(S, 1);
    if (ch === 2) return pickWorld(S);
    if (ch === 3 || ch === 6) return pickLane(S);
    if (ch === 4) return pickEdge(S);
    if (ch === 5) return finalGuess(S);
    return null;
  }
  function infoOfFx(S, fx) {
    let s = 0;
    for (const [k, w] of Object.entries(fx?.a || {})) s += Math.abs(w) * varA(S, k) / var0(k) * .6;
    for (const [k, y] of Object.entries(fx?.t || {})) s += Math.abs(y) * S.T[k][1] / .35;
    for (const b of AGE) s += (fx?.g?.[b] || 0) * .15;
    for (const k of Object.keys(fx?.f || {})) s += S.facts[k] ? 0 : .5;
    for (const ks of Object.values(fx?.apps || {})) s += ks.filter(k => !S.apps[k]).length * .25;
    return s;
  }
  function pickTT(S, ch) {
    if (ch === 1 && !S.asked.has('tt:dogs-cats')) return asView(S, C.get('tt:dogs-cats'));   // a crowd-pleaser first
    let best = null, bs = -1;
    const lastApp = (S.log.at(-1)?.c || '').match(/^tt:(ig-tiktok|spotify-apple|uber-lyft|doordash|netflix|amazon|chatgpt)/);
    for (const c of bank.cards) {
      if (c.type !== 'tt' || !eligible(S, c, ch)) continue;
      if (c.id === 'tt:iphone-android' && S.est.phone?.via === 'device') continue;   // the browser already said
      let s = (infoOfFx(S, c.opts[0].fx) + infoOfFx(S, c.opts[1].fx)) * (c.prio || 1) * (.85 + .3 * S.r());
      if (lastApp && c.opts[0].img?.startsWith?.('app/')) s *= .4;
      if (s > bs) { bs = s; best = c; }
    }
    return best ? asView(S, best) : null;
  }
  const WORLD = ['multi:phone-dies', 'multi:this-week', 'tiles:hobbies', 'multi:stage', 'tiles:grew-up', 'rank:values', 'pick:home', 'multi:living', 'tiles:devices', 'pick:2am', 'pick:all-nighter', 'slider:screen'];
  function pickWorld(S) {
    if (S.inCh === 4 || S.inCh === 9) { const d = pickDuel(S); if (d) return d; }
    if (S.inCh === 7) { const g = pickGuess(S, ['area', 'app', 'trait']); if (g) return g; }
    for (const id of WORLD) { const c = C.get(id); if (c && !S.asked.has(id) && gateOk(S, c)) return asView(S, c); }
    return pickTT(S, 2);
  }
  function pickDuel(S) {
    const cand = AREAS.filter(a => mean(S, a.k) > .45).map(a => a.k);
    let best = null, bs = -1;
    for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
      const a = cand[i], b = cand[j], ids = [`duel:${a}:${b}`, `duel:${b}:${a}`];
      if (ids.some(x => S.asked.has(x))) continue;
      const s = (varA(S, a) + varA(S, b)) * (1 - Math.abs(mean(S, a) - mean(S, b))) * (.7 + .6 * S.r());
      if (s > bs) { bs = s; best = [a, b]; }
    }
    return best ? duelCard(S, best[0], best[1]) : null;
  }
  function pickGuess(S, kinds) {
    const cands = [];
    if (kinds.includes('app')) for (const a of bank.apps) {
      if (S.apps[a.k] || S.asked.has(`guess:app:${a.k}`)) continue;
      const p = predictApp(S, a.k); if (p < .55) continue;
      cands.push({ kind: 'app', subj: a.k, p, s: p * Math.sqrt(1 - Math.min(.9, a.pop)) });
    }
    if (kinds.includes('item')) for (const it of bank.items) {
      if (S.items[it.id] || S.asked.has(`guess:item:${it.id}`) || S.asked.has('react:' + it.id)) continue;
      const p = predictItem(S, it.id); if (p < .6 || it.pop < .6) continue;
      cands.push({ kind: 'item', subj: it.id, p, s: p * .9 });
    }
    if (kinds.includes('trait')) for (const t of bank.traits) {
      const tv = traitView(S, t.k), subj = t.k + (tv.m >= 0 ? '+' : '-');
      if (S.asked.has(`guess:trait:${t.k}+`) || S.asked.has(`guess:trait:${t.k}-`)) continue;
      if (Math.abs(tv.m) < .38) continue;
      cands.push({ kind: 'trait', subj, p: clamp(.5 + Math.abs(tv.m) * .55 - tv.v * .3, .5, .95), s: Math.abs(tv.m) * .8 });
    }
    if (kinds.includes('area')) for (const a of AREAS) {
      if (S.asked.has(`guess:area:${a.k}`) || S.dived.includes(a.k)) continue;
      const m = mean(S, a.k); if (m < .7 || a.prior > .8) continue;
      cands.push({ kind: 'area', subj: a.k, p: m, s: m * (1 - a.prior) });
    }
    if (!cands.length) return null;
    cands.sort((x, y) => y.s - x.s);
    const c = cands[Math.min(cands.length - 1, Math.floor(S.r() * Math.min(2, cands.length)))];
    return guessView(S, c.kind, c.subj, c.p);
  }
  // lanes: Thompson sampling over areas not visited yet; a visit runs the area's plan in order
  function laneLeft(S) { return AREAS.some(a => !S.dived.includes(a.k) && laneSteps(S, a.k).length); }
  function laneSteps(S, k) {
    const out = [];
    for (const st of DIVES[k] || []) {
      if (st.startsWith('react:')) { const n = +st.split(':')[1]; const left = (itemsOf.get(k) || []).filter(i => !S.items[i.id] && !S.asked.has('react:' + i.id) && C.has('react:' + i.id) && C.get('react:' + i.id).ch.includes(3)); for (let i = 0; i < Math.min(n, left.length); i++) out.push('react'); continue; }
      const c = C.get(st); if (c && !S.asked.has(st) && gateOk(S, c)) out.push(st);
    }
    return out;
  }
  function pickLane(S) {
    const bonus = S.chapter === 6;
    if (S.since.guess >= (bonus ? 5 : 6)) { const g = pickGuess(S, ['app', 'item', 'trait', 'area']); if (g) return g; }
    if (S.since.duel >= 10) { const d = pickDuel(S); if (d) return d; }
    // continue the current visit
    if (S.dive) {
      const k = S.dive.area, probeNo = S.dive.done >= 1 && mean(S, k) < .22;
      const cap = S.chapter === 6 ? 14 : S.dive.full ? 6 : 3;
      if (!probeNo && S.dive.done < cap) { const c = laneCard(S, k); if (c) return c; }
      S.dive = null;
    }
    // choose the next area: a draw from each belief, times what's left to learn there
    let best = null, bs = -1;
    for (const a of AREAS) {
      if (S.dived.includes(a.k)) continue;
      const steps = laneSteps(S, a.k); if (!steps.length) continue;
      const [x, y] = S.A[a.k], th = betaSample(S.r, x, y);
      const s = th * (1 + .08 * Math.min(6, steps.length)) * (bonus ? 1 : 1);
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
        const it = pickItem(S, k); if (it) return asView(S, C.get('react:' + it.id));
        continue;
      }
      const c = C.get(st); if (c && !S.asked.has(st) && gateOk(S, c)) return asView(S, c);
    }
    return null;
  }
  function pickItem(S, k) {
    let best = null, bs = -1;
    for (const it of itemsOf.get(k) || []) {
      const id = 'react:' + it.id; if (!C.has(id) || S.asked.has(id) || S.items[it.id]) continue;
      // the most informative: well-known first (an answer is likely), then what splits the uncertain traits
      let s = .6 * it.pop + infoOfFx(S, { t: it.fx.t, g: it.fx.g }) * .5 + .25 * ent(predictItem(S, it.id));
      s *= .8 + .4 * S.r();
      if (s > bs) { bs = s; best = it; }
    }
    return best;
  }
  function pickAnything(S) {
    for (const c of bank.cards) if (!S.asked.has(c.id) && gateOk(S, c) && c.type !== 'react' && c.ch.some(x => x >= 2)) return asView(S, c);
    for (const c of bank.cards) if (!S.asked.has(c.id) && c.type === 'react') return asView(S, c);
    return null;
  }
  const EDGE = ['multi:instant-no', 'react:thing', 'multi:diet', 'multi:allergies', 'tiles:splurge', 'react:thing', 'pick:top-shelf', 'pick:2am', 'pick:birth-order', 'react:thing', 'pick:all-nighter', 'pick:kids', 'pick:relationship', 'react:thing', 'tiles:going-out', 'tiles:topics'];
  function pickEdge(S) {
    if (S.inCh === 5) { const g = pickGuess(S, ['item', 'app', 'trait']); if (g) return g; }
    for (const id of EDGE) {
      if (id === 'react:thing') {
        const things = bank.items.filter(i => (i.kind === 'thing' || ['music:taylor-swift', 'person:kim-kardashian', 'creator:mrbeast', 'food:pineapple-pizza'].includes(i.id)) && !S.asked.has('react:' + i.id) && !S.items[i.id] && C.has('react:' + i.id));
        if (!things.length) continue;
        if (S.log.slice(-1)[0]?.c.startsWith('react:')) continue;
        let best = null, bs = -1; for (const it of things) { const s = .4 * it.pop + infoOfFx(S, { t: it.fx.t, a: it.fx.a }) + .3 * S.r(); if (s > bs) { bs = s; best = it; } }
        return asView(S, C.get('react:' + best.id));
      }
      const c = C.get(id); if (c && !S.asked.has(id) && gateOk(S, c)) return asView(S, c);
    }
    return null;
  }
  function finalGuess(S) {
    const ag = agePost(S), [bAge, pAge] = Object.entries(ag).sort((a, b) => b[1] - a[1])[0];
    if (!S.asked.has(`guess:age:${bAge}`) && !S.est.age && pAge > .34) return guessView(S, 'age', bAge, pAge);
    if (!AGE.some(b => S.asked.has('guess:age:' + b)) && !S.est.age) return guessView(S, 'age', bAge, pAge);
    if (!S.asked.has('guess:edu:college') && !S.est.education) { const p = educationGuess(S); return guessView(S, 'edu', 'college', p); }
    if (!S.asked.has('guess:budget:band') && !S.est.budget) { const b = budgetBand(S); return guessView(S, 'budget', 'band', b.conf); }
    const a = archetype(S);
    if (a && !bank.archetypes.some(x => S.asked.has('guess:arch:' + x.k))) return guessView(S, 'arch', a.k, .7);
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
      if (top[1] > .45) lines.push(`I have a feeling about when you were born. I’ll tell you later.`);
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
    for (const [id, s] of Object.entries(S.items)) { if (off.has('item:' + id)) continue; const it = ITEM.get(id); items.push({ id, n: it.n, kind: it.kind, area: it.area, s }); }
    for (const [id, t] of Object.entries(S.tiles)) { if (off.has('item:' + id)) continue; items.push({ id, n: t.n, kind: t.kind, area: t.area || 'events', s: t.s === 'use' ? 'like' : t.s }); }
    for (const v of S.facts.never || []) { const o = C.get('multi:instant-no').opts.find(o => o.value === v); if (o && !off.has('item:never:' + v)) items.push({ id: 'never:' + v, n: o.label, kind: 'genre', area: 'movies', s: 'nope' }); }
    const traits = bank.traits.map(t => { const tv = traitView(S, t.k); return { k: t.k, label: tv.label, v: +tv.m.toFixed(3), conf: +clamp(1 - tv.v / .35).toFixed(3) }; }).filter(t => !off.has('trait:' + t.k));
    const facts = {};
    for (const [k, v] of Object.entries(S.facts)) if (!off.has('fact:' + k) && v.length) facts[k] = v.slice(0, 20).map(String);
    const estimates = estimatesOf(S).filter(e => !off.has('est:' + e.k));
    const a = archetype(S);
    const r = readingFor({ ...S, tells: [], _told: [] }, 3);
    return {
      v: 1, bank: bank.v, cards: S.answers, secs: Math.round((S.log.at(-1)?.at || 0) / 1000),
      archetype: { k: a.k, name: a.name, line: a.line }, areas, apps, items: items.slice(0, 600), traits, facts,
      values: S.values.map(v => C.get('rank:values').opts.find(o => o.value === v)?.label).filter(Boolean),
      guesses: { made: S.guesses.made, hits: S.guesses.hits, misses: S.guesses.misses },
      tells: S.tells.slice(-8).map(t => ({ kind: t.kind, text: `${t.what}: ${fmtS(t.ms)}` })),
      lines: [...r.lines, ...contrasts(S)].slice(0, 10),
      estimates,
      meta: { device: String(S.meta.device || '').slice(0, 40), os: String(S.meta.os || '').slice(0, 40), tz: String(S.meta.tz || '').slice(0, 64), hour: Number.isInteger(S.meta.hour) ? S.meta.hour : 0, secs: Math.round((S.log.at(-1)?.at || 0) / 1000), done: !!S.coreDone },
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
    out.push({ k: 'budget', label: 'Money style', value: bandLabel(bb ? bb.value : band.k), conf: +(bb ? bb.conf : band.conf).toFixed(2), confirmed: !!bb?.confirmed });
    if (S.est.education) out.push({ k: 'education', label: 'School', value: { yes: 'College', grad: 'Grad school', now: 'In school now', no: 'Didn’t go to college' }[S.est.education.value] || 'Rather not say', conf: .95, confirmed: true });
    const hb = heightBand(S); if (hb) out.push({ k: 'height', label: 'Height', value: hb, conf: .7, confirmed: false });
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
    const top = [...P.areas].sort((a, b) => b.score - a.score).slice(0, 8);
    groups.push({ k: 'areas', title: 'Your biggest areas', rows: top.map(a => ({ key: 'area:' + a.k, label: a.name, value: Math.round(a.score * 100) + '%', locked: true })) });
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
    topics: 'Topics', splurges: 'Splurges on', routine: 'Routine', devices: 'Devices', 'grew-up': 'Grew up with', cuisines: 'Cuisines', 'birth-order': 'Family', 'group-chats': 'Group chats', animal: 'Dogs or cats', eats: 'Cook or order', drink: 'Coffee or tea', spice: 'Spicy or mild', lean: 'City or country' };
  const factLabel = k => FACT_LABEL[k] || cap(k.replace(/-/g, ' '));
  function optLabel(k, v) {
    for (const c of bank.cards) if ((c.fact === k || c.id.split(':')[1] === k) && c.opts) { const o = c.opts.find(o => o.value === v); if (o) return o.label; }
    if (k === 'dinner-for-two') return '$' + v; return String(v);
  }

  // ------------------------------------------------------------------ replay
  function replayOne(S, e) {
    if (!e || typeof e.c !== 'string') return;
    if (/^ch:\d$/.test(e.c)) { S.chapter = +e.c.slice(3); S.inCh = 0; S.dive = null; if (S.chapter === 6) S.dived = []; S.log.push(e); return; }
    if (e.c === 'core') { S.coreDone = true; S.log.push(e); return; }
    if (e.c.startsWith('lane:')) { const k = e.c.slice(5); if (AREA.has(k)) { S.dive = { area: k, done: 0, full: true }; if (!S.dived.includes(k)) S.dived.push(k); } S.log.push(e); return; }
    const card = cardFor(S, e.c); if (!card) return;
    answer(S, card, e.v, { ms: e.ms, h: e.h, ch: e.ch, at: e.at });
  }
  function replay(log, init = {}) { return session({ ...init, log }); }
  function toLog(S) { return S.log.slice(); }

  return {
    session, next: nextOuter, answer, status, profile, memories, tastebud, review, replay, toLog, cardFor,
    predictApp, predictItem, agePost: S => agePost(S), mean, archetype, budgetBand, readingFor,
    areas: AREAS, apps: APP, items: ITEM, version: bank.v,
  };
}
