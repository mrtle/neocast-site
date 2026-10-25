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
  var PH = { pull: 0.004, full: 0.034, hold: 0.066, tour: 0.08, end: 0.966 };
  var stopP = function (i) { return PH.tour + (i + 0.22) / NC * (PH.end - PH.tour); };

  var bar = $('[data-bar]'), barCta = $('[data-bar-cta]'), start = $('[data-start]'), end = $('[data-end]'), endCopy = $('[data-end-copy]');
  var journey = $('[data-journey]'), stage = $('[data-stage]'), host = $('[data-map]'), copy = $('[data-copy]');
  var tour = $('[data-tour]'), tourName = $('[data-tour-name]'), tourStart = $('[data-tour-start]'), sub = $('.sub-txt'), rail = $('[data-rail]');
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
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', c.name);
      b.innerHTML = '<span>' + c.name + '</span>'; b.addEventListener('click', function () { goTo(stopP(i)); });
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

  // jumps (Return to main, the rail): a quick flash while the camera snaps there
  function goTo(p) {
    if (!journey) return;
    var span = journey.offsetHeight - innerHeight, y = p <= 0 ? 0 : journey.offsetTop + span * p;
    if (stage && motion) { stage.classList.remove('warp'); void stage.offsetWidth; stage.classList.add('warp'); }
    window.scrollTo({ top: y, behavior: 'instant' });
    if (map3d) map3d.jump(progress());
  }
  if (homeBtn) homeBtn.addEventListener('click', function () { goTo(0); if (start) start.focus({ preventScroll: true }); });

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
  function progress() {
    if (!journey) return 0;
    var r = journey.getBoundingClientRect(), span = r.height - innerHeight;
    var p = span > 0 ? clamp(-r.top / span) : 0;
    if (!motion) {   // reduced motion: still views only
      if (p < PH.full) return 0;
      if (p < PH.tour) return PH.hold;
      if (p < PH.end) { var s = Math.floor((p - PH.tour) / (PH.end - PH.tour) * NC); return stopP(Math.min(NC - 1, s)) + 0.0001; }
      return 1;
    }
    return p;
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
      var ys = out.you.r / 62;
      setEl(youTag, out.you.x, out.you.y, out.you.r > 22 && out.mode !== 'tour' ? 1 : 0, Math.max(0.5, Math.min(2.6, ys)));
    }
    // labels: the welcome frame and the whole system show them; the tour lets the overlay speak
    // labels never sit under the header, past the edges or under the dock
    var placed = [], showLabels = out.mode !== 'tour', top = bar ? bar.offsetHeight : 64;
    [homeBtn, aiBtn].forEach(function (el) {
      if (!el || (el === homeBtn && !dock.classList.contains('home-on'))) return;
      var q = el.getBoundingClientRect(); placed.push([q.left - 8, q.top - 8, q.right + 8, q.bottom + 8]);
    });
    var sc = out.mode === 'full' || out.mode === 'end' ? 0.86 : 1;
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
      if (motion) { tourName.classList.remove('swap'); void tourName.offsetWidth; tourName.classList.add('swap'); subFx.rgb = 7; }
      ticks.forEach(function (t, i) { t.classList.toggle('on', i === out.active); });
    }
    // the lens: around the welcome copy as it leaves, around the tour copy, around the ending
    if (map3d) {
      if (out.mode === 'welcome' || out.mode === 'pull') {
        var cr = copy && rectOf(copy, 24); var amt = out.mode === 'welcome' ? 0.85 : 0.85 * (1 - clamp(out.k * 1.6));
        if (cr) map3d.hole = { x: cr.x, y: cr.y, rx: cr.rx * 1.08, ry: cr.ry * 1.12, amt: amt };
      } else if (out.mode === 'tour' && tourOn) {
        // the lens sits on the copy itself (name to button), so the legs above it stay sharp
        var a1 = tourName.getBoundingClientRect(), a2 = sub.getBoundingClientRect(), a3 = tourStart.getBoundingClientRect();
        var l = Math.min(a1.left, a2.left, a3.left) - 28, rr = Math.max(a1.right, a2.right, a3.right) + 28, t0 = a1.top - 6, b0 = a3.bottom + 26;
        map3d.hole = { x: (l + rr) / 2, y: (t0 + b0) / 2, rx: Math.min(w * 0.46, (rr - l) / 2 * 1.08), ry: (b0 - t0) / 2 * 1.08, amt: 1 };
      } else if (out.mode === 'end' && endCopy) {
        var er = rectOf(endCopy, 24); map3d.hole = { x: er.x, y: er.y, rx: er.rx * 1.08, ry: er.ry * 1.12, amt: clamp(out.k * 1.4) * 0.85 };
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
      var img = new Image(); img.className = 'nojs-map'; img.alt = 'An example map: the Tastebud at the centre, with fifty categories around it, from movies and music to coffee, travel and space.';
      img.src = 'assets/img/map-poster.webp'; w.appendChild(img);
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
    if (!ok || !src || !cats.length) { noMap(); return; }
    measure();
    var still = !motion || /[?&]still3d\b/.test(location.search);   // still3d: for headless checks that render WebGL on the CPU
    if (soft) doc.classList.add('lite3d');
    var small = Math.min(innerWidth, innerHeight) < 700;
    var atl = (data.atlases || []).map(function (u) { return new URL(small && data.atlasesSm ? data.atlasesSm[data.atlases.indexOf(u)] : u, document.baseURI).href; });
    import(new URL(src, document.baseURI).href).then(function (mod) {
      map3d = mod.mount(host, {
        cats: cats, apps: data.apps, atlases: atl, glyphs: new URL(data.glyphs, document.baseURI).href,
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
    if (map3d) map3d.progress = progress();
  }
  function tick() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', function () { measure(); sendFrame(); tick(); });
  if (motion) (function spin() { if (tourOn) drawSub(); requestAnimationFrame(spin); })();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); sendFrame(); tick(); });
  mount();
  frame();
})();
