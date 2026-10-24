/* neocast.us v4: behaviour, the 3D map's story and the scroll-motion layer.
   Without script the page is finished (a poster stands in for the 3D map). With reduced motion the map is drawn
   still and every state changes in steps, never in motion. Scroll-driven parts are written once per frame. */
(function () {
  'use strict';
  var doc = document.documentElement;
  var motion = doc.classList.contains('motion');
  var clamp = function (v, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a || 0, v)); };
  var ramp = function (v, a, b) { return clamp((v - a) / (b - a)); };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  var expoOut = function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- the live things ---------- */
  // Map / List in the app window (the in-window switch and the phone switch under it).
  var win = $('[data-window]');
  function setView(v) {
    if (!win) return;
    $$('[data-w-view]').forEach(function (b) { var on = b.getAttribute('data-w-view') === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $$('[data-w-panel]', win).forEach(function (p) { p.hidden = p.getAttribute('data-w-panel') !== v; });
  }
  $$('[data-w-view]').forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-w-view')); }); });
  // a node in the window opens the list (the group's contents live there in this preview)
  $$('.w-node').forEach(function (n) { n.addEventListener('click', function () { setView('list'); }); });
  // The controls you can flip.
  $$('.controls .tog').forEach(function (t) {
    t.addEventListener('click', function () {
      var on = !t.classList.contains('on');
      t.classList.toggle('on', on); t.setAttribute('aria-checked', on ? 'true' : 'false');
      var s = t.parentNode.querySelector('.rt span[data-on]');
      if (s) s.textContent = s.getAttribute(on ? 'data-on' : 'data-off');
    });
  });
  // Copy the setup prompt.
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = $(b.getAttribute('data-copy')).textContent;
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy prompt'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {});
    });
  });
  // The launch film: YouTube loads only when someone presses play.
  $$('[data-yt]').forEach(function (f) {
    var btn = $('button', f);
    btn.addEventListener('click', function () {
      var i = document.createElement('iframe');
      i.src = 'https://www.youtube-nocookie.com/embed/' + f.getAttribute('data-yt') + '?autoplay=1&rel=0';
      i.title = 'Neocast launch film'; i.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; i.allowFullscreen = true;
      f.innerHTML = ''; f.appendChild(i); f.classList.add('playing');
    });
  });
  // VPRWRE: swap in the newest four stories from vprwre.com when it is reachable.
  (function () {
    var list = $('[data-latest]');
    if (!list || !window.fetch) return;
    var esc = function (s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    var months = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
    fetch('https://vprwre.com/posts.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (posts) {
        if (!Array.isArray(posts) || posts.length < 4) return;
        list.innerHTML = posts.slice(0, 4).map(function (p, i) {
          var slug = p.url.replace(/\/$/, '').split('/').pop();
          var ymd = String(p.published || '').slice(0, 10).split('-');
          var date = ymd.length === 3 ? months[+ymd[1] - 1] + ' ' + (+ymd[2]) + ', ' + ymd[0] : '';
          return '<li style="--i:' + i + '"><a href="' + esc(p.url) + '"><span class="sthumb"><img src="https://vprwre.com/images/' + esc(slug) + '/thumb.jpg" width="600" height="750" loading="lazy" alt="" onerror="this.style.visibility=\'hidden\'"></span>' +
            (p.section ? '<span class="ssec">' + esc(p.section) + '</span>' : '') +
            '<b>' + esc(p.title) + '</b><time datetime="' + esc(p.published) + '">' + date + '</time></a></li>';
        }).join('');
      })
      .catch(function () { /* keep the built-in stories */ });
  })();

  /* ---------- counters ---------- */
  function countTo(el, dur) {
    var to = parseFloat(el.getAttribute('data-count')), from = parseFloat(el.getAttribute('data-from') || '0');
    var dec = +(el.getAttribute('data-dec') || 0), suf = el.getAttribute('data-suffix') || '';
    var t0 = performance.now();
    el.setAttribute('aria-label', to.toFixed(dec) + suf);
    (function step(now) {
      var t = clamp((now - t0) / dur), v = from + (to - from) * expoOut(t);
      el.textContent = v.toFixed(dec) + suf;
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---------- the header: solid once the page moves, ink over the dark chapter ---------- */
  var bar = $('[data-bar]'), dark = $$('[data-chapter="dark"]');
  function drawBar() {
    var y = bar.offsetHeight - 1, on = dark.some(function (s) { var r = s.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
    bar.classList.toggle('dark', on);
    bar.classList.toggle('solid', scrollY > 8);
  }

  /* =====================================================================
     The 3D map and its story
     ===================================================================== */
  var stage = $('[data-stage]'), host = $('[data-map3d]'), story = $('[data-story]');
  var steps = $$('.step');
  var youTag = $('[data-you]'), sats = {}, leaves = {}, links = {};
  $$('[data-sat]').forEach(function (e) { sats[e.getAttribute('data-sat')] = e; });
  $$('[data-leaf]').forEach(function (e) { leaves[e.getAttribute('data-leaf')] = e; });
  $$('[data-link]').forEach(function (e) { links[e.getAttribute('data-link')] = e; });
  var ctlLegal = $('[data-ctl-legal]'), ctlHarvey = $('[data-ctl-harvey]'), ctlBtn = $('[data-ctl-btn]');
  var matchMeter = $('[data-match] [data-meter]'), matchCount = $('[data-match] [data-count]');
  var map3d = null, last = null, openT0 = 0;
  var st = { legal: 0, harvey: 0, disney: 0, witty: 0, tony: 0, crispy: 0, struck: false };

  var ANCHORS = {
    legal: ['shows', -0.2, 1.08, 0.3], harvey: ['shows', -0.2, 1.08, 0.3], witty: [null, 0.15, 2.45, 0.4],
    tony: ['movies', 0.35, 1.08, 0.3], disney: [null, 0, -1.45, 0.6], crispy: [null, 0, -2.12, 0.6]
  };
  // phones: fewer leaves (the Disneyland thread is left to bigger screens)
  var ANCHORS_TALL = {
    legal: ['shows', -0.6, 0.62, 0.3], harvey: ['shows', -0.6, 0.62, 0.3], witty: [null, 0, 4.1, 0.4],
    tony: ['movies', 0.6, 0.62, 0.3]
  };
  function tall() { return innerWidth / innerHeight < 0.8; }
  function wide() { return innerWidth >= 900; }

  // where the world sits on the stage: the hero, then the story
  function placeFor(p) {
    var w = wide(), h0, h1;
    if (w) {
      // the story map fits in the room between the text column and the right edge
      var px = innerHeight / 5.984, card = cards[0] && cards[0].getBoundingClientRect();
      var textR = card && card.width ? card.right : innerWidth * 0.44, room = innerWidth - textR - 24;
      h0 = [0.5, 0.81, Math.min(0.6, 0.9 * innerWidth / (6.8 * px))];
      h1 = [(textR + 24 + room * 0.47) / innerWidth, 0.52, Math.min(0.76, room / (6.9 * px))];
    }
    else if (tall()) { h0 = [0.5, 0.775, 0.46]; h1 = [0.5, 0.44, 0.42]; }
    else { h0 = [0.5, 0.72, 0.62]; h1 = [0.5, 0.4, 0.66]; }
    var e = easeOut(p);
    return [h0[0] + (h1[0] - h0[0]) * e, h0[1] + (h1[1] - h0[1]) * e, h0[2] + (h1[2] - h0[2]) * e];
  }
  var cards = steps.map(function (s) { return s.querySelector('.step-card'); });
  function stepProgress(i, vh) {
    var s = steps[i]; if (!s) return 1;
    if (!wide()) {
      // phones: the map holds the top of the screen; a step plays as its card rises into the lower half
      var c = cards[i].getBoundingClientRect();
      return clamp((vh * 0.96 - c.top) / (vh * 0.34));
    }
    var r = s.getBoundingClientRect();
    return clamp((vh * 0.78 - r.top) / (vh * 0.5));
  }
  // phones: a card fades before it would cover the map
  function drawCardsOnPhone(vh) {
    var w = wide();
    cards.forEach(function (c) {
      if (w) { c.style.opacity = ''; return; }
      var t = c.getBoundingClientRect().top;
      c.style.opacity = clamp((t - vh * 0.42) / (vh * 0.1)).toFixed(3);
    });
  }
  function readStory(vh) {
    var p = clamp((scrollY - vh * 0.18) / (vh * 0.7));
    var s1 = stepProgress(0, vh), s2 = stepProgress(1, vh), s3 = stepProgress(2, vh);
    if (!motion) {
      // reduced motion: states change in steps, never in motion
      p = p > 0.5 ? 1 : 0; s1 = s1 > 0.5 ? 1 : 0; s2 = s2 > 0.5 ? 1 : 0; s3 = s3 > 0.5 ? 1 : 0;
    }
    st.legal = ramp(s1, 0.1, 0.6) * (1 - ramp(s2, 0.2, 0.6));
    st.struck = s2 > 0.15;
    st.disney = ramp(s1, 0.3, 0.8);
    st.harvey = ramp(s2, 0.5, 0.9);
    st.witty = ramp(s3, 0, 0.35); st.tony = ramp(s3, 0.25, 0.65); st.crispy = ramp(s3, 0.45, 0.85);
    return { p: p, s1: s1, s2: s2, s3: s3 };
  }

  function W() { return host ? host.clientWidth : innerWidth; }
  function setEl(el, x, y, o, sc) {
    el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)' + (sc !== undefined && sc !== 1 ? ' scale(' + sc.toFixed(3) + ')' : '');
    el.style.opacity = o.toFixed(3);
  }
  function edgePoint(c, r, tx, ty) {
    var dx = tx - c.x, dy = ty - c.y, L = Math.hypot(dx, dy) || 1;
    return { x: c.x + dx / L * (r + 6), y: c.y + dy / L * (r + 6) };
  }
  function curve(path, a, b, o) {
    if (!path) return;
    if (o <= 0.01) { path.style.opacity = '0'; return; }
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.12;
    path.setAttribute('d', 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1));
    path.style.opacity = (0.85 * o).toFixed(3);
  }
  // the map reports where things landed; the DOM follows
  function onFrame(out) {
    last = out;
    var w = W(), pad = 12;
    if (youTag) setEl(youTag, out.you.x, out.you.y, out.you.r > 30 ? 1 : 0);
    Object.keys(sats).forEach(function (k) {
      var s = out.sats[k], el = sats[k]; if (!s) return;
      var half = el.offsetWidth / 2, x = clamp(s.x, pad + half, w - pad - half);
      setEl(el, x, s.y + s.r + 8 + el.offsetHeight / 2, s.on * (s.behind ? 0.3 : 1));
    });
    var A = out.anchors;
    function leaf(id, o, struck) {
      var el = leaves[id], a = A[id]; if (!el) return;
      if (!a) { el.style.opacity = '0'; el.style.visibility = 'hidden'; return; }
      var half = el.offsetWidth / 2, x = clamp(a.x, pad + half, w - pad - half);
      setEl(el, x, a.y + (1 - o) * 10, o, 0.86 + 0.14 * o);
      el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
      a._x = x;
      if (struck !== undefined) el.classList.toggle('struck', struck);
    }
    leaf('legal', st.legal, st.struck); leaf('harvey', st.harvey); leaf('disney', st.disney);
    leaf('witty', st.witty); leaf('tony', st.tony); leaf('crispy', st.crispy);
    var S = out.sats;
    function pt(id) { var a = A[id]; return { x: a._x !== undefined ? a._x : a.x, y: a.y }; }
    if (S.shows && A.legal) {
      curve(links.legal, edgePoint(S.shows, S.shows.r, A.legal.x, A.legal.y), pt('legal'), st.legal);
      curve(links.harvey, edgePoint(S.shows, S.shows.r, A.harvey.x, A.harvey.y), pt('harvey'), st.harvey);
    }
    if (!A.disney && links.disney) links.disney.style.opacity = '0';
    if (!A.crispy && links.crispy) links.crispy.style.opacity = '0';
    if (S.places && A.disney) curve(links.disney, edgePoint(S.places, S.places.r, A.disney.x, A.disney.y), pt('disney'), st.disney);
    if (A.witty) {
      curve(links.witty, pt('harvey'), pt('witty'), st.witty * (st.harvey > 0.5 ? 1 : 0));
      curve(links.tony, pt('witty'), pt('tony'), st.tony);
      if (S.movies) curve(links.tonym, edgePoint(S.movies, S.movies.r, A.tony.x, A.tony.y), pt('tony'), st.tony);
      if (A.disney && A.crispy) curve(links.crispy, pt('disney'), pt('crispy'), st.crispy);
    }
  }
  function drawCards(s) {
    if (ctlLegal) {
      var forgot = s.s2 > 0.35;
      ctlLegal.classList.toggle('done', forgot);
      if (ctlBtn) ctlBtn.textContent = forgot ? 'Forgotten' : 'Forget';
      ctlHarvey.style.opacity = (0.35 + 0.65 * ramp(s.s2, 0.45, 0.9)).toFixed(3);
    }
    if (matchMeter) {
      var m = ramp(s.s3, 0.15, 0.75);
      matchMeter.style.transform = 'scaleX(' + easeOut(m).toFixed(3) + ')';
      if (matchCount) matchCount.textContent = Math.round(78 * easeOut(m)) + '% match';
    }
  }
  function drawStory(vh) {
    if (!stage) return;
    var sr = story.getBoundingClientRect();
    if (sr.bottom < -20 || sr.top > vh + 20) return;   // off screen: leave the map alone
    // the map bows out as the story ends, so nothing of it lingers over the next section
    var fade = wide() ? clamp((sr.bottom - vh * 0.3) / (vh * 0.4)) : clamp((sr.bottom - vh * 0.55) / (vh * 0.35));
    host.style.opacity = fade.toFixed(3);
    host.style.visibility = fade < 0.01 ? 'hidden' : 'visible';
    var s = readStory(vh);
    drawCards(s); drawCardsOnPhone(vh);
    if (map3d) {
      var pl = placeFor(s.p);
      map3d.place(pl[0], pl[1], pl[2]);
    } else if (posterOn) {
      // the poster follows the same path as the live map would (its orb is about 9.6% of its width)
      var q = placeFor(s.p), bw = posterEl.offsetWidth || 1, k = q[2] * (innerHeight / 5.984) / (0.0964 * bw);
      posterEl.style.transform = 'translate3d(' + (q[0] * W() - bw / 2).toFixed(1) + 'px,' + (q[1] * innerHeight - posterEl.offsetHeight / 2).toFixed(1) + 'px,0) scale(' + k.toFixed(3) + ')';
    }
  }
  // no WebGL here: the rendered poster of the same map stands in
  var posterEl = null, posterOn = false;
  function noMap() {
    host.classList.add('no3d');
    posterEl = $('[data-poster]', host); if (!posterEl) return;
    posterOn = true;
    if (posterEl.getAttribute('data-src')) posterEl.src = posterEl.getAttribute('data-src');
    requestAnimationFrame(function () { drawStory(innerHeight); });
  }
  function mount3d() {
    if (!host) return;
    var src = stage.getAttribute('data-mod');
    var ok = false;
    try { var c = document.createElement('canvas'); ok = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { ok = false; }
    if (!ok || !src) { noMap(); return; }
    import(new URL(src, document.baseURI).href).then(function (mod) {
      var portrait = tall();
      var still = !motion || /[?&]still3d\b/.test(location.search); // still3d: for headless checks, which render WebGL on the CPU
      map3d = mod.mount(host, { still: still, open: motion && !still ? 0 : 1, anchors: portrait ? ANCHORS_TALL : ANCHORS, portrait: portrait, onFrame: onFrame });
      var pl = placeFor(readStory(innerHeight).p); map3d.place(pl[0], pl[1], pl[2], true);
      if (motion && !still) {
        openT0 = performance.now();
        (function unravel(now) {
          var t = clamp((now - openT0 - 250) / 1700);
          map3d.open = expoOut(t);
          if (t < 1) requestAnimationFrame(unravel);
        })(openT0);
      }
      requestTick();
    }).catch(function (e) { noMap(); if (window.console) console.warn('map3d', e && e.message); });
  }

  /* ---------- finished page (no script or reduced motion) ---------- */
  if (!motion || !('IntersectionObserver' in window)) {
    doc.classList.remove('motion');
    $$('[data-r]').forEach(function (el) { el.classList.add('is-in'); });
    if (win) win.classList.add('is-in');
    mount3d();
    var tick = function () { drawBar(); drawStory(innerHeight); };
    addEventListener('scroll', function () { requestAnimationFrame(tick); }, { passive: true });
    addEventListener('resize', function () { requestAnimationFrame(tick); });
    tick();
    return;
  }

  /* ---------- headings: split into masked words, grouped by line ---------- */
  function splitLines(h) {
    var units = [];
    Array.prototype.slice.call(h.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var parts = n.textContent.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        parts.forEach(function (p) {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
          var w = document.createElement('span'); w.className = 'w';
          var wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = p;
          w.appendChild(wi); frag.appendChild(w); units.push(w);
        });
        h.replaceChild(frag, n);
      } else if (n.nodeType === 1) {
        var w2 = document.createElement('span'); w2.className = 'w';
        var wi2 = document.createElement('span'); wi2.className = 'wi';
        h.replaceChild(w2, n); wi2.appendChild(n); w2.appendChild(wi2); units.push(w2);
      }
    });
    var tops = [];
    units.forEach(function (w) {
      var t = w.offsetTop, k = tops.findIndex(function (x) { return Math.abs(x - t) < 6; });
      if (k < 0) { tops.push(t); k = tops.length - 1; }
      w.firstChild.style.setProperty('--li', k);
    });
    h.classList.add('is-split');
  }

  /* ---------- reveals: once, as the element's top passes 88% of the screen ---------- */
  var selfWatch = new WeakSet(), proxies = new Map();
  function reveal(el) {
    el.classList.add('is-in');
    $$('[data-count]', el).concat(el.hasAttribute('data-count') ? [el] : []).forEach(function (c) {
      if (!c.closest('[data-match]') && !c.dataset.counted) { c.dataset.counted = '1'; countTo(c, 1100); }
    });
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      io.unobserve(el);
      (proxies.get(el) || []).forEach(reveal);
      proxies.delete(el);
      if (selfWatch.has(el)) reveal(el);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
  // a shutter starts with zero visible area, which an observer never reports: watch its parent
  function watch(el) {
    var t = el;
    if (el.getAttribute('data-r') === 'shutter' && el.parentElement) {
      t = el.parentElement;
      if (!proxies.has(t)) proxies.set(t, []);
      proxies.get(t).push(el);
    } else selfWatch.add(el);
    io.observe(t);
  }
  $$('[data-r="deal"],[data-r="deal-x"]').forEach(function (el) {
    Array.prototype.slice.call(el.children).forEach(function (c, i) { c.style.setProperty('--i', i); });
  });
  $$('[data-r]').forEach(watch);
  $$('[data-meter]').forEach(function (el) { if (!el.closest('[data-match]')) watch(el); });
  $$('[data-count]').forEach(function (el) {
    if (el.closest('[data-match]')) return;
    var from = el.getAttribute('data-from') || '0', dec = +(el.getAttribute('data-dec') || 0);
    el.textContent = parseFloat(from).toFixed(dec) + (el.getAttribute('data-suffix') || '');
    if (!el.closest('[data-r]')) watch(el);
  });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    $$('[data-lines]').forEach(function (h) { splitLines(h); watch(h); });
  });

  /* ---------- the app window: one 3D move as it arrives ---------- */
  var appFig = $('[data-app-fig]');
  function drawWindow(vh) {
    if (!win || !appFig) return;
    var r = appFig.getBoundingClientRect();
    var p = clamp((vh - r.top) / (vh * 0.85)), e = easeOut(p);
    win.style.transform = 'rotateX(' + (18 * (1 - e)).toFixed(2) + 'deg) translateY(' + (70 * (1 - e)).toFixed(1) + 'px) scale(' + (0.93 + 0.07 * e).toFixed(4) + ')';
    if (p > 0.3) win.classList.add('is-in');
  }

  /* ---------- the opening window (10 Humans vs. AI) ---------- */
  var opening = $('[data-opening]'), opPic = $('[data-op-pic]'), opImg = opPic && $('img', opPic), opCopy = $('[data-op-copy]');
  if (opening) opening.classList.add('is-live');
  function drawOpening(vh) {
    if (!opening) return;
    var r = opening.getBoundingClientRect();
    if (r.bottom < -50 || r.top > vh + 50) return;
    var run = Math.max(1, r.height - vh), p = clamp(-r.top / run), phone = innerWidth < 700;
    var q = easeOut(ramp(p, 0, 0.62));
    var iy = (phone ? 16 : 20) * (1 - q), ix = (phone ? 6 : 27) * (1 - q), rad = 28 * (1 - q);
    opPic.style.clipPath = 'inset(' + iy.toFixed(2) + '% ' + ix.toFixed(2) + '% ' + iy.toFixed(2) + '% ' + ix.toFixed(2) + '% round ' + rad.toFixed(1) + 'px)';
    if (opImg) opImg.style.transform = 'scale(' + (1.14 - 0.14 * q).toFixed(4) + ')';
    var c = easeOut(ramp(p, 0.5, 0.82));
    opCopy.style.opacity = c.toFixed(3);
    opCopy.style.transform = 'translateY(' + (28 * (1 - c)).toFixed(1) + 'px)';
    opCopy.style.pointerEvents = c > 0.5 ? 'auto' : 'none';
  }

  /* ---------- quiet scroll-linked pictures ---------- */
  var poster = $('.film-play img'), footMark = $('[data-foot-mark]'), startImg = $('[data-start-img]'), askImg = $('.ask-plate .plate-img');
  function through(el, vh) { var r = el.getBoundingClientRect(); return { t: clamp((vh - r.top) / (vh + r.height)), on: r.bottom > -40 && r.top < vh + 40 }; }
  function drawQuiet(vh) {
    if (poster && poster.isConnected) { var a = through(poster.parentNode, vh); if (a.on) poster.style.transform = 'scale(1.08) translateY(' + ((0.5 - a.t) * 5).toFixed(2) + '%)'; }
    if (startImg) { var b = through(startImg.parentNode, vh); if (b.on) startImg.style.transform = 'scale(' + (1.16 - 0.16 * b.t).toFixed(4) + ') rotate(' + ((0.5 - b.t) * 3).toFixed(2) + 'deg)'; }
    if (askImg) { var c = through(askImg.parentNode, vh); if (c.on) askImg.style.transform = 'scale(1.06) translateY(' + ((0.5 - c.t) * 4).toFixed(2) + '%)'; }
    if (footMark) {
      var f = footMark.getBoundingClientRect();
      if (f.top < vh + 40) {
        var u = easeOut(clamp((vh - f.top) / (vh * 0.7)));
        footMark.style.transform = 'translateY(' + ((1 - u) * 14).toFixed(2) + '%) scale(' + (0.9 + 0.1 * u).toFixed(4) + ')';
        footMark.style.opacity = (0.25 + 0.75 * u).toFixed(3);
      }
    }
  }

  /* ---------- one frame loop for everything the scroll drives ---------- */
  var queued = false;
  function frame() {
    queued = false;
    var vh = innerHeight;
    drawBar(); drawStory(vh); drawWindow(vh); drawOpening(vh); drawQuiet(vh);
  }
  function requestTick() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', requestTick, { passive: true });
  addEventListener('resize', requestTick);
  mount3d();
  frame();
})();
