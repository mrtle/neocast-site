/* neocast.us v6: the welcome frame, the solar-system journey, the tour overlay, the dock.
   Without script the page is a welcome frame with a picture of the map. With reduced motion the map is drawn
   still and the journey steps through still views: the welcome frame, the whole system, each category, home. */
(function () {
  'use strict';
  var doc = document.documentElement, motion = doc.classList.contains('motion');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v) { return Math.min(1, Math.max(0, v)); };

  var data = {}; try { data = JSON.parse($('#map-data').textContent); } catch (e) { data = { cats: [], apps: [] }; }
  var cats = data.cats || [], NC = cats.length || 50;
  // v7: the journey moves in steps, one scroll = one move: welcome, map pulled up, the whole system,
  // each category, home. Each step is a snap point one screen tall; the map tweens to the step's view.
  var PH = { pull: 0.004, full: 0.034, hold: 0.066, tour: 0.08, end: 0.966 };
  var NS = NC + 4, stepAt = null, steps = [];
  var stepP = function (k) {   // same as stepP in map3d.js
    if (k <= 0) return 0; if (k === 1) return PH.full; if (k === 2) return PH.hold; if (k >= NC + 3) return 1;
    return PH.tour + (k - 3) / Math.max(1, NC - 1) * (PH.end - PH.tour);
  };

  var bar = $('[data-bar]'), barCta = $('[data-bar-cta]'), start = $('[data-start]'), end = $('[data-end]'), endCopy = $('[data-end-copy]');
  var journey = $('[data-journey]'), stage = $('[data-stage]'), host = $('[data-map]'), copy = $('[data-copy]');
  var tour = $('[data-tour]'), tourName = $('[data-tour-name]'), tourStart = $('[data-tour-start]'), sub = $('.sub-txt'), rail = $('[data-rail]');
  var tourFree = tour && $('.free', tour), legal = $('.legal');
  var dock = $('[data-dock]'), homeBtn = $('[data-home]'), aiBtn = $('[data-ai]'), aiPanel = $('[data-ai-panel]');
  var youTag = host && $('[data-you]', host), labs = {}, sizes = {}, ticks = [];
  var map3d = null, last = null, tourOn = false, activeShown = -1;

  /* ---------- labels and the rail, from the data ---------- */
  cats.forEach(function (c, i) {
    if (host) {
      var el = document.createElement('span'); el.className = 'clab'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<i></i>' + c.name; host.appendChild(el); labs[c.k] = el;
    }
    if (rail) {
      if (!i) {
        var hb = document.createElement('button'); hb.type = 'button'; hb.className = 'rail-home'; hb.setAttribute('aria-label', 'Return to main');
        hb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span>Return to main</span>';
        hb.addEventListener('click', function () { goTo(0); if (start) start.focus({ preventScroll: true }); });
        rail.appendChild(hb);
      }
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tick'; b.setAttribute('aria-label', c.name);
      b.innerHTML = '<span>' + c.name + '</span>';
      b.addEventListener('click', function (e) { if (e.detail === 0) goTo(i + 3); });   // keyboard (Enter/Space); pointer clicks: see the rail's pointerup
      rail.appendChild(b); ticks.push(b);
    }
  });

  function measure() { Object.keys(labs).forEach(function (k) { sizes[k] = [labs[k].offsetWidth, labs[k].offsetHeight]; }); }

  /* ---------- header and dock ---------- */
  var seen = { start: true, end: false };
  function drawChrome() {
    if (bar) bar.classList.toggle('solid', scrollY > 8);
    var on = !seen.start && !seen.end && !tourOn;
    if (bar) bar.classList.toggle('cta-on', on);
    if (barCta) { barCta.tabIndex = on ? 0 : -1; barCta.setAttribute('aria-hidden', on ? 'false' : 'true'); }
    if (dock) dock.classList.toggle('home-on', scrollY > innerHeight * 0.6);
    if (homeBtn) homeBtn.tabIndex = scrollY > innerHeight * 0.6 ? 0 : -1;
  }
  if ('IntersectionObserver' in window) {
    if (start) new IntersectionObserver(function (es) { seen.start = es[0].isIntersecting; drawChrome(); }).observe(start);
    if (end) new IntersectionObserver(function (es) { seen.end = es[0].isIntersecting; if (es[0].isIntersecting) end.classList.add('is-in'); drawChrome(); }, { rootMargin: '0px 0px -30% 0px' }).observe(end);
  } else if (end) end.classList.add('is-in');

  // jumps (Return to main, the rail): a quick flash while the camera snaps there; next door just moves
  function stepTop(k) { return k <= 0 ? 0 : journey.offsetTop + k * innerHeight; }
  var progUntil = 0;   // while the page scrolls itself, scroll events aren't the visitor's
  var goFrom = 0, goAt = -1e9;   // where the last move started, and when
  function goTo(k, near) {
    if (!journey) return;
    k = Math.max(0, Math.min(NS - 1, k));
    var far = !near && Math.abs(k - (stepAt == null ? 0 : stepAt)) > 1;
    if (far && stage && motion) { stage.classList.remove('warp'); void stage.offsetWidth; stage.classList.add('warp'); }
    progUntil = performance.now() + (motion && !far ? 1100 : 120); goFrom = scrollY; goAt = performance.now();
    window.scrollTo({ top: stepTop(k), behavior: motion && !far ? 'smooth' : 'instant' });
    stepAt = k; window.__tastebudTarget = stepP(k);
    if (map3d) { if (far) map3d.jump(stepP(k)); else map3d.progress = stepP(k); }
    clearTimeout(loopT); loopT = 0;
    if (k === NS - 1) loopT = setTimeout(checkLoop, (motion && !far ? 1100 : 150) + 450);
    drawChrome();
  }
  var loopT = 0, loopTries = 0;
  function checkLoop() {
    loopT = 0;
    if (stepAt !== NS - 1) return;
    if (Math.abs(scrollY - stepTop(NS - 1)) > 3 || (map3d && map3d.moving)) { if (++loopTries < 15) loopT = setTimeout(checkLoop, 200); return; }
    loopTries = 0; loopToTop();
  }
  /* one gesture = one step: a wheel or trackpad push, a swipe, or a key moves exactly one category.
     The tail of a trackpad flick (its momentum) is ignored; past the last step the page scrolls normally to the footer. */
  var lastStepAt = 0;
  function inSteps(dir) {
    if (!journey || !steps.length) return false;
    var y = scrollY, last = stepTop(NS - 1);
    if (y > last + 2) return false;   // in the footer: native scrolling (back up, the page settles on the last step)
    return true;
  }
  function stepBy(dir) {
    var now = performance.now(), cur = stepAt == null ? currentStep() : stepAt; lastStepAt = now;
    if (cur + dir > NS - 1) { loopToTop(); return; }   // past the end: round to the top
    goTo(cur + dir, true);
  }
  /* v8 (Martin, 4:46 PM): an infinite loop. The end view is the welcome frame again, so once the camera is home the
     page quietly swaps to the top: the main page and Start Now, ready to scroll round again. */
  function loopToTop() {
    clearTimeout(loopT); loopT = 0;
    if (!journey || stepAt !== NS - 1) return;
    progUntil = performance.now() + 200; goFrom = 0; goAt = performance.now();
    window.scrollTo({ top: 0, behavior: 'instant' });
    stepAt = 0; window.__tastebudTarget = stepP(0);
    if (map3d) map3d.quietJump(stepP(0));
    if (end) end.classList.remove('is-in');
    drawChrome();
  }
  /* v8: a light two-finger swipe is enough. A push starts after a pause, after a short break that isn't the tail of a
     flick still fading, on a change of direction, or when the push rises again out of a fading tail; it moves one step
     as soon as it adds up to a few pixels, and the rest of it (the flick's momentum) is ignored. Times are event
     times, so a busy frame can't make one flick look like several. */
  function makeGate() {
    var MIN = 6, g = { t: -1e9, a: 0, gap: 1e9, peak: 0, lo: 1e9, acc: 0, dir: 0, used: true, t0: 0 }, lastStep = -1e9;
    return function (now, d) {
      var a = Math.abs(d), dir = d > 0 ? 1 : -1, gap = now - g.t;
      // tail: the push is fading (a flick's momentum). rate: size per frame, so a batch of events delivered late reads like its tail
      var tail = g.peak > 0 && g.a < g.peak * 0.7, rate = a * 16 / Math.max(16, gap);
      var fresh = gap > 320 || (dir !== g.dir && a >= 2) ||
        (gap > 110 && (tail ? a <= Math.max(4, g.a * 1.5) : g.gap > 110 && a >= g.a * 0.8)) ||   // a short break; or wheel notches
        (tail && now - g.t0 > 220 && g.lo < 1e9 && rate > g.lo * 1.6 + 6);                       // rising again out of the tail
      if (fresh) { g.used = false; g.acc = 0; g.peak = 0; g.lo = 1e9; g.t0 = now; g.dir = dir; }
      g.t = now; g.a = a; g.gap = gap;
      if (a > g.peak) { g.peak = a; g.lo = 1e9; } else g.lo = Math.min(g.lo, a);
      if (g.used || dir !== g.dir) return 0;
      g.acc += a;
      if (g.acc < MIN || now - lastStep < 200) return 0;
      g.used = true; lastStep = now; return dir;
    };
  }
  window.__tastebudGate = makeGate;   // read by the gesture checks
  var gate = makeGate();
  addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;   // pinch zoom
    var d = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1);
    if (!d || !inSteps(d > 0 ? 1 : -1)) return;
    if (aiPanel && !aiPanel.hidden && aiPanel.contains(e.target)) return;
    e.preventDefault();
    var dir = gate(e.timeStamp || performance.now(), d);
    if (dir) stepBy(dir);
  }, { passive: false });
  var ty0 = null, tx0 = 0;
  addEventListener('touchstart', function (e) {
    if (e.touches.length === 1 && !(rail && rail.contains(e.target))) { ty0 = e.touches[0].clientY; tx0 = e.touches[0].clientX; } else ty0 = null;   // a drag on the rail scrubs instead
  }, { passive: true });
  addEventListener('touchmove', function (e) {
    if (ty0 == null || e.touches.length !== 1) return;
    var dy = ty0 - e.touches[0].clientY;
    if (inSteps(dy > 0 ? 1 : -1) && e.cancelable) e.preventDefault();
  }, { passive: false });
  addEventListener('touchend', function (e) {
    if (ty0 == null) return;
    var t = e.changedTouches[0], dy = ty0 - t.clientY, dx = tx0 - t.clientX; ty0 = null;
    if (Math.abs(dy) < 34 || Math.abs(dy) < Math.abs(dx) || !inSteps(dy > 0 ? 1 : -1)) return;
    stepBy(dy > 0 ? 1 : -1);
  }, { passive: true });
  addEventListener('keydown', function (e) {
    var t = e.target, tag = t && t.tagName;
    if (e.altKey || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test(tag) || (t && t.isContentEditable)) return;
    var k = e.key, dir = 0;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey && !/BUTTON|A/.test(tag))) dir = 1;
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey && !/BUTTON|A/.test(tag))) dir = -1;
    else if (k === 'Home' && steps.length) { e.preventDefault(); goTo(0); return; }
    else if (k === 'End' && steps.length) { e.preventDefault(); goTo(NS - 1); return; }
    if (!dir || !inSteps(dir)) return;
    e.preventDefault(); stepBy(dir);
  });
  if (homeBtn) homeBtn.addEventListener('click', function () { goTo(0); if (start) start.focus({ preventScroll: true }); });

  /* the rail: press and drag along it to scrub through the categories (v8). A press without a drag is a click. */
  var scrub = null;
  function tickAt(y) {
    var best = 0, bd = 1e9;
    for (var i = 0; i < ticks.length; i++) { var q = ticks[i].getBoundingClientRect(), d = Math.abs(y - (q.top + q.height / 2)); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function scrubTo(i) {
    var k = i + 3; if (k === stepAt) return;
    progUntil = performance.now() + 250; goFrom = stepTop(k); goAt = performance.now();
    window.scrollTo({ top: stepTop(k), behavior: 'instant' });
    stepAt = k; window.__tastebudTarget = stepP(k);
    if (map3d) map3d.scrub(stepP(k));
    drawChrome();
  }
  if (rail) {
    rail.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest && e.target.closest('.rail-home')) return;
      scrub = { id: e.pointerId, y0: e.clientY, moved: false };
      try { rail.setPointerCapture(e.pointerId); } catch (err) {}
    });
    rail.addEventListener('pointermove', function (e) {
      if (!scrub || e.pointerId !== scrub.id) return;
      if (!scrub.moved && Math.abs(e.clientY - scrub.y0) < 5) return;
      if (!scrub.moved) { scrub.moved = true; rail.classList.add('scrubbing'); }
      e.preventDefault();
      scrubTo(tickAt(e.clientY));
    });
    var endScrub = function (e) {
      if (!scrub || (e && e.pointerId !== scrub.id)) return;
      var moved = scrub.moved; scrub = null; rail.classList.remove('scrubbing');
      if (!moved && e && e.type === 'pointerup') goTo(tickAt(e.clientY) + 3);   // a press without a drag: jump there
    };
    rail.addEventListener('pointerup', endScrub); rail.addEventListener('pointercancel', endScrub);
  }

  // Neocast AI: the chat circle opens a small panel that starts the chat in the assistant you already use
  var PROMPT = 'Set up my Tastebud using https://neocast.live/tastebud/skill. Continue here in this chat.';
  if (aiPanel) {
    var gpt = $('[data-ai-open="chatgpt"]', aiPanel), cl = $('[data-ai-open="claude"]', aiPanel), cp = $('[data-ai-copy]', aiPanel);
    if (gpt) gpt.href = 'https://chatgpt.com/?q=' + encodeURIComponent(PROMPT);
    if (cl) cl.href = 'https://claude.ai/new?q=' + encodeURIComponent(PROMPT);
    if (cp) cp.addEventListener('click', function () {
      var done = function () { cp.textContent = 'Copied'; setTimeout(function () { cp.textContent = 'Copy setup prompt'; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(PROMPT).then(done, done); else done();
    });
  }
  function setPanel(open) {
    if (!aiPanel || !aiBtn) return;
    aiPanel.hidden = !open; aiBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var f = $('a,button', aiPanel); if (f) f.focus(); }
  }
  if (aiBtn) aiBtn.addEventListener('click', function () { setPanel(aiPanel.hidden); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aiPanel && !aiPanel.hidden) { setPanel(false); aiBtn.focus(); } });
  document.addEventListener('click', function (e) { if (aiPanel && !aiPanel.hidden && dock && !dock.contains(e.target)) setPanel(false); });

  /* ---------- "Create your own tastebud.": the light follows the cursor ---------- */
  var subFx = { tx: 0, ty: 0, rgb: 0, mx: 50, my: 50, ctx: 0, cty: 0, cmx: 50, cmy: 50, hl: 0, chl: 0 };
  if (sub && motion) {
    addEventListener('pointermove', function (e) {
      var r = sub.getBoundingClientRect(); if (!r.width) return;
      var nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), ny = (e.clientY - (r.top + r.height / 2)) / Math.max(60, r.height * 2);
      var near = clamp(1.6 - Math.hypot(nx * 0.6, ny)); subFx.hl = e.pointerType === 'mouse' ? near : 0;
      subFx.ty = Math.max(-1, Math.min(1, nx)) * 9 * near; subFx.tx = -Math.max(-1, Math.min(1, ny)) * 12 * near;
      subFx.mx = clamp((e.clientX - r.left) / r.width) * 100; subFx.my = clamp((e.clientY - r.top) / r.height) * 100;
      subFx.rgb = Math.min(6, subFx.rgb + Math.hypot(e.movementX || 0, e.movementY || 0) * 0.05 * (0.3 + near));
    }, { passive: true });
  }
  function drawSub() {
    if (!sub || !motion) return;
    subFx.ctx += (subFx.tx - subFx.ctx) * 0.12; subFx.cty += (subFx.ty - subFx.cty) * 0.12;
    subFx.cmx += (subFx.mx - subFx.cmx) * 0.15; subFx.cmy += (subFx.my - subFx.cmy) * 0.15; subFx.rgb *= 0.9; subFx.chl += (subFx.hl - subFx.chl) * 0.1;
    sub.style.setProperty('--hl', subFx.chl.toFixed(3));
    sub.style.setProperty('--tx', subFx.ctx.toFixed(2) + 'deg'); sub.style.setProperty('--ty', subFx.cty.toFixed(2) + 'deg');
    sub.style.setProperty('--mx', subFx.cmx.toFixed(1) + '%'); sub.style.setProperty('--my', subFx.cmy.toFixed(1) + '%');
    sub.style.setProperty('--rgb', subFx.rgb.toFixed(2) + 'px'); sub.style.setProperty('--go', Math.min(0.55, subFx.rgb / 5).toFixed(3));
  }

  /* ---------- the journey ---------- */
  // the step the page has snapped (or is snapping) to
  function currentStep() {
    if (!journey) return 0;
    var y = -journey.getBoundingClientRect().top;
    return Math.max(0, Math.min(NS - 1, Math.round(y / innerHeight)));
  }
  function progress() { return stepP(currentStep()); }
  window.__tastebudStepP = stepP;   // read by the layout checks
  // one screen-tall snap point per step between the welcome frame and the ending
  function buildSteps() {
    if (!journey || steps.length) return;
    var endEl = $('[data-end]');
    for (var k = 1; k < NS - 1; k++) {
      var d = document.createElement('div'); d.className = 'step'; d.setAttribute('aria-hidden', 'true');
      journey.insertBefore(d, endEl); steps.push(d);
    }
    doc.classList.add('snap');
  }
  function setEl(el, x, y, o, k) {
    el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)' + (k && k !== 1 ? ' scale(' + k.toFixed(3) + ')' : '');
    el.style.opacity = o.toFixed(3);
  }
  function rectOf(el, pad) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rx: r.width / 2 + pad, ry: r.height / 2 + pad };
  }
  // the map reports where the sun and the categories landed; labels, the tour and the lens follow
  function onFrame(out) {
    last = out;
    var w = host.clientWidth, h = host.clientHeight;
    if (youTag) {
      // drawn at its largest size and scaled down, so the word stays sharp on the big Tastebud
      var ys = out.you.r / 62;
      setEl(youTag, out.you.x, out.you.y, out.you.r > 22 && out.mode !== 'tour' ? 1 : 0, Math.max(0.5, Math.min(2.6, ys)) * 40 / 104);
    }
    // labels: the welcome frame and the whole system show them; the tour lets the overlay speak
    // labels never sit under the header, past the edges or under the dock
    var placed = [], showLabels = out.mode !== 'tour', top = bar ? bar.offsetHeight : 64;
    [homeBtn, aiBtn, legal].forEach(function (el) {
      if (!el || (el === homeBtn && !dock.classList.contains('home-on'))) return;
      var q = el.getBoundingClientRect(); placed.push([q.left - 8, q.top - 8, q.right + 8, q.bottom + 8]);
    });
    var sc = out.mode === 'full' ? 0.86 : 1;
    var order = cats.map(function (c) { return c.k; }).sort(function (a, b) { return (out.cats[a].ring - out.cats[b].ring) || (out.cats[a].fog < out.cats[b].fog ? 1 : -1); });
    order.forEach(function (k) {
      var s = out.cats[k], el = labs[k]; if (!s || !el) return;
      var sz = sizes[k] || [90, 34], lw = sz[0] * sc, lh = sz[1] * sc;
      var x = s.x, y = s.y + s.r + 6 + lh / 2;
      var o = showLabels && s.front ? s.on * s.focus * (s.behind ? 0 : 1) * (0.3 + 0.7 * s.fog) : 0;
      if (x - lw / 2 < 6 || x + lw / 2 > w - 6 || y - lh / 2 < top + 4 || y + lh / 2 > h - 6) o = 0;
      if (o > 0.05) {
        var box = [x - lw / 2 - 4, y - lh / 2 - 3, x + lw / 2 + 4, y + lh / 2 + 3];
        for (var q = 0; q < placed.length; q++) { var b = placed[q]; if (box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]) { o = 0; break; } }
        if (o > 0.05) placed.push(box);
      }
      setEl(el, x, y, o, sc);
      el.style.visibility = o < 0.02 ? 'hidden' : 'visible';
    });
    // the tour overlay
    var inTour = out.mode === 'tour' && out.settle > 0.6;
    if (inTour !== tourOn) { tourOn = inTour; tour.classList.toggle('on', inTour); if (rail) rail.classList.toggle('on', inTour); drawChrome(); }
    if (out.active >= 0 && out.active !== activeShown && cats[out.active]) {
      activeShown = out.active;
      tourName.textContent = cats[out.active].name;
      tourStart.setAttribute('aria-label', 'Start Now: create your own tastebud, starting with ' + cats[out.active].name);
      var quick = !!scrub || !!(map3d && map3d.fast);
      if (motion) { tourName.classList.remove('swap', 'swap-q'); void tourName.offsetWidth; tourName.classList.add(quick ? 'swap-q' : 'swap'); subFx.rgb = quick ? 1.5 : 7; }
      ticks.forEach(function (t, i) { t.classList.toggle('on', i === out.active); });
    }
    // the lens: around the tour copy only (v8, Martin 4:30 PM: no distortion on the main page, so none at the welcome or home)
    if (map3d) {
      if (out.mode === 'tour' && tourOn) {
        // the lens sits on the copy itself (name to button), so the legs above it stay sharp
        var a1 = tourName.getBoundingClientRect(), a2 = sub.getBoundingClientRect(), a3 = (tourFree || tourStart).getBoundingClientRect();
        var l = Math.min(a1.left, a2.left, a3.left) - 28, rr = Math.max(a1.right, a2.right, a3.right) + 28, t0 = a1.top - 6, b0 = a3.bottom + 20;
        map3d.hole = { x: (l + rr) / 2, y: (t0 + b0) / 2, rx: Math.min(w * 0.46, (rr - l) / 2 * 1.08), ry: (b0 - t0) / 2 * 1.08, amt: 1 };
      } else map3d.hole = { amt: 0 };
    }
  }
  // the free space for each stop: below the header, above the category name
  function sendFrame() {
    if (!map3d || !tour || !tourName) return;
    var top = (bar ? bar.offsetHeight : 64) + 12, bottom = tour.offsetTop + tourName.offsetTop - 20;
    map3d.frame = { top: top, bottom: Math.max(top + 120, bottom) };
  }
  function noMap() {
    if (!host) return;
    doc.classList.add('no3d');
    var w = $('[data-welcome]');
    if (w && !$('.nojs-map', w)) {
      var img = new Image(); img.className = 'nojs-map'; img.alt = 'An example map: the Tastebud at the centre, with forty categories around it, from movies, music and games to travel, money and AI.';
      img.src = data.poster || 'assets/img/map-poster.webp'; w.appendChild(img);
    }
  }
  function mount() {
    if (!stage || !host) return;
    var src = stage.getAttribute('data-mod'), ok = false, soft = false;
    try {
      var c = document.createElement('canvas'), g = c.getContext('webgl2'); ok = !!g;
      // no GPU (Chrome with hardware acceleration off, some VMs): software WebGL can't keep up with the full scene
      var ext = g && g.getExtension('WEBGL_debug_renderer_info'), rn = ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rn);
      var lose = g && g.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    } catch (e) { ok = false; }
    if (/[?&]still3d\b/.test(location.search)) soft = false;   // headless checks emulate a GPU visitor
    if (/[?&]lite3d\b/.test(location.search)) soft = true;
    if (/[?&]stepsonly\b/.test(location.search)) { buildSteps(); return; }   // gesture checks without the 3D cost
    if (!ok || !src || !cats.length) { noMap(); return; }
    buildSteps();
    measure();
    var still = !motion || /[?&]still3d\b/.test(location.search);   // still3d: for headless checks that render WebGL on the CPU
    if (soft) doc.classList.add('lite3d');
    var small = Math.min(innerWidth, innerHeight) < 700;
    var atl = (data.atlases || []).map(function (u) { return new URL(small && data.atlasesSm ? data.atlasesSm[data.atlases.indexOf(u)] : u, document.baseURI).href; });
    import(new URL(src, document.baseURI).href).then(function (mod) {
      map3d = mod.mount(host, {
        cats: cats, apps: data.apps, atlases: atl, glyphs: new URL(data.glyphs, document.baseURI).href, grid: data.grid,
        still: still, lite: soft, p: progress(), open: motion && !still && !soft ? 0 : 1, onFrame: onFrame,
      });
      window.__tastebudMap = map3d;   // read by the layout checks
      sendFrame();
      if (motion && !still && !soft) {
        var t0 = performance.now();
        (function unravel(now) {
          var t = clamp((now - t0 - 150) / 1900);
          map3d.open = 1 - Math.pow(1 - t, 3);
          if (t < 1) requestAnimationFrame(unravel);
        })(t0);
      }
    }).catch(function (e) { noMap(); if (window.console) console.warn('map3d', e && e.message); });
  }

  var queued = false;
  function frame() {
    queued = false;
    drawChrome(); drawSub();
    if (!steps.length) return;
    if (stepAt == null) { stepAt = currentStep(); window.__tastebudTarget = stepP(stepAt); return; }
    settle();
  }
  // the scrollbar, find-in-page, a resize or an interrupted glide moved the page: settle on the nearest step
  var settleT = 0;
  function settle() {
    clearTimeout(settleT);
    settleT = setTimeout(function () {
      if (performance.now() < progUntil) { settle(); return; }
      if (scrollY > stepTop(NS - 1) + 2) return;   // in the footer
      // a move of ours still on its way (a slow machine's smooth scroll): finish it, never snap back to where it started
      if (stepAt != null && performance.now() - goAt < 2500) {
        var tgt = stepTop(stepAt), span = tgt - goFrom, done = scrollY - goFrom;
        if (Math.abs(span) > 2 && done * span >= -4 && Math.abs(done) <= Math.abs(span) + 4) {
          if (Math.abs(scrollY - tgt) > 2) window.scrollTo({ top: tgt, behavior: 'instant' });
          return;
        }
      }
      var k = currentStep();
      if (k !== stepAt || Math.abs(scrollY - stepTop(k)) > 2) goTo(k, Math.abs(k - stepAt) <= 1);
    }, Math.max(160, progUntil - performance.now() + 80));
  }
  function tick() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', function () { measure(); sendFrame(); tick(); });
  if (motion) (function spin() { if (tourOn) drawSub(); requestAnimationFrame(spin); })();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); sendFrame(); tick(); });
  mount();
  frame();
})();
