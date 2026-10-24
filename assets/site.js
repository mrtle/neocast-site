/* neocast.us v3: behaviour and the scroll-motion layer.
   Without script, or with reduced motion, every part of the page is already in its finished state.
   Scroll-driven parts are written once per animation frame; reveals fire once and never replay. */
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
  // Map / List switch in the Tastebud preview.
  $$('.seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      var box = b.closest('.mapbox'), v = b.getAttribute('data-view');
      $$('.seg button', box).forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      $$('[data-view-panel]', box).forEach(function (p) { p.hidden = p.getAttribute('data-view-panel') !== v; });
      box.setAttribute('data-view', v);
      if (motion) { measure(); requestTick(); }
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

  /* ---------- counters (the accent number rolls to its value once) ---------- */
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

  /* ---------- the header takes the ink of the chapter beneath it (a colour change, kept under reduced motion) ---------- */
  var bar = $('[data-bar]'), dark = $$('[data-chapter="dark"]');
  function drawBar() {
    var y = bar.offsetHeight - 1, on = dark.some(function (s) { var r = s.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
    bar.classList.toggle('dark', on);
  }
  addEventListener('scroll', function () { requestAnimationFrame(drawBar); }, { passive: true });
  drawBar();

  if (!motion || !('IntersectionObserver' in window)) {
    // Finished page: nothing hidden, nothing moving.
    doc.classList.remove('motion');
    $$('[data-r]').forEach(function (el) { el.classList.add('is-in'); });
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

  /* ---------- reveals ---------- */
  // A shutter starts fully clipped (zero visible area), which an observer never reports,
  // so it is watched through its parent.
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
    el.dataset.final = el.textContent;
    var from = el.getAttribute('data-from') || '0', dec = +(el.getAttribute('data-dec') || 0);
    el.textContent = parseFloat(from).toFixed(dec) + (el.getAttribute('data-suffix') || '');
    if (!el.closest('[data-r]')) watch(el);
  });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    $$('[data-lines]').forEach(function (h) { splitLines(h); watch(h); });
  });

  /* ---------- the held map: see it, control it, learn from it ---------- */
  var mapbox = $('[data-mapbox]'), map = $('[data-map]');
  var steps = $$('.step');
  var ctlLegal = $('[data-ctl-legal]'), ctlHarvey = $('[data-ctl-harvey]'), ctlBtn = $('[data-ctl-btn]');
  var matchMeter = $('[data-match] [data-meter]'), matchCount = $('[data-match] [data-count]');
  var groups = $$('.mnode[data-i]', map), ghosts = {}, leaves = {}, edges = {};
  $$('.ghost', map).forEach(function (g) { ghosts[g.getAttribute('data-ghost')] = g; });
  $$('.leaf,.stamp', map).forEach(function (l) { leaves[l.getAttribute('data-leaf')] = l; });
  var geo = { phone: false, w: 1, h: 1 };
  function measure() {
    if (!map || mapbox.getAttribute('data-view') === 'list') return;
    geo.w = map.clientWidth; geo.h = map.clientHeight; geo.phone = mapbox.clientWidth <= 560;
    groups.forEach(function (n) {
      var cs = getComputedStyle(n);
      var x = parseFloat(cs.getPropertyValue(geo.phone ? '--mx' : '--dx')), y = parseFloat(cs.getPropertyValue(geo.phone ? '--my' : '--dy'));
      n._ox = (50 - x) / 100 * geo.w; n._oy = (50 - y) / 100 * geo.h;
    });
    edges = {};
    $$('.edges.' + (geo.phone ? 'em' : 'ed') + ' [data-e]', map).forEach(function (p) {
      var k = p.getAttribute('data-e'); (edges[k] = edges[k] || []).push(p);
    });
    geo.ghostEdges = {};
    $$('.edges.' + (geo.phone ? 'em' : 'ed') + ' [data-ghost-edge]', map).forEach(function (p) { geo.ghostEdges[p.getAttribute('data-ghost-edge')] = p; });
  }
  function setEdge(k, e) {
    (edges[k] || []).forEach(function (p) {
      if (p.classList.contains('ln')) p.style.strokeDashoffset = (1 - e).toFixed(3);
      p.style.opacity = e > 0.001 ? Math.min(1, e * 1.4).toFixed(3) : '0';
    });
  }
  function setLeaf(k, e) {
    var l = leaves[k]; if (!l) return;
    l.style.opacity = e.toFixed(3);
    l.style.transform = 'translate(-50%,-50%) translateY(' + ((1 - e) * 10).toFixed(1) + 'px) scale(' + (0.85 + 0.15 * e).toFixed(3) + ')';
    l.style.visibility = e < 0.01 ? 'hidden' : 'visible';
  }
  function stepProgress(i, vh) {
    var s = steps[i]; if (!s) return 1;
    var r = s.getBoundingClientRect();
    return clamp((vh * 0.66 - r.top) / (vh * 0.38));
  }
  function drawMap(vh) {
    if (!map) return;
    var wide = innerWidth > 900, mapOn = mapbox.getAttribute('data-view') !== 'list';
    var s1;
    if (wide) s1 = clamp(scrollY / (vh * 0.55));
    else { var mr = map.getBoundingClientRect(); s1 = clamp((vh * 0.92 - mr.top) / (vh * 0.55)); }
    var s2 = stepProgress(1, vh), s3 = stepProgress(2, vh);
    if (mapOn) drawNodes(s1, s2, s3);
    drawCards(s2, s3, vh, wide);
  }
  function drawNodes(s1, s2, s3) {
    groups.forEach(function (n) {
      var i = +n.getAttribute('data-i'), k = n.getAttribute('data-node');
      var e = easeOut(ramp(s1, i * 0.07, i * 0.07 + 0.5));
      n.style.opacity = e.toFixed(3);
      n.style.transform = 'translate(-50%,-50%) translate(' + (n._ox * (1 - e)).toFixed(1) + 'px,' + (n._oy * (1 - e)).toFixed(1) + 'px) scale(' + (0.4 + 0.6 * e).toFixed(3) + ')';
      if (ghosts[k]) ghosts[k].style.opacity = (1 - e).toFixed(3);
      if (geo.ghostEdges && geo.ghostEdges[k]) geo.ghostEdges[k].style.opacity = (1 - e).toFixed(3);
      setEdge(k, e);
    });
    var legalIn = ramp(s1, 0.55, 0.95), legalOut = ramp(s2, 0, 0.45);
    var legal = legalIn * (1 - legalOut);
    setLeaf('legal', legal); setEdge('legal', legal);
    if (leaves.legal) leaves.legal.classList.toggle('struck', s2 > 0.1);
    var harvey = ramp(s2, 0.4, 0.85); setLeaf('harvey', harvey); setEdge('harvey', harvey);
    var disney = ramp(s1, 0.7, 1); setLeaf('disney', disney); setEdge('disney', disney);
    var witty = ramp(s3, 0, 0.35), tony = ramp(s3, 0.25, 0.65), crispy = ramp(s3, 0.45, 0.85);
    setLeaf('witty', witty); setEdge('witty', witty);
    setLeaf('tony', tony); setEdge('tony', tony);
    setLeaf('crispy', crispy); setEdge('crispy', crispy);
  }
  function drawCards(s2, s3, vh, wide) {
    // the cards in the statements follow the same scroll
    if (ctlLegal) {
      var forgot = s2 > 0.35;
      ctlLegal.classList.toggle('done', forgot);
      if (ctlBtn) ctlBtn.textContent = forgot ? 'Forgotten' : 'Forget';
      ctlHarvey.style.opacity = (0.35 + 0.65 * ramp(s2, 0.4, 0.85)).toFixed(3);
    }
    if (matchMeter) {
      var m = ramp(s3, 0.15, 0.75);
      matchMeter.style.transform = 'scaleX(' + easeOut(m).toFixed(3) + ')';
      if (matchCount) matchCount.textContent = Math.round(78 * easeOut(m)) + '% match';
    }
    // dim the statements that are not being read (desktop, where the map holds)
    if (wide) {
      var mid = vh * 0.5;
      steps.forEach(function (st) {
        var r = st.getBoundingClientRect();
        st.classList.toggle('dim', !(r.top <= mid && r.bottom >= mid) && scrollY > vh * 0.3);
      });
    } else steps.forEach(function (st) { st.classList.remove('dim'); });
  }

  /* ---------- the opening window (10 Humans vs. AI) ---------- */
  var opening = $('[data-opening]'), opPic = $('[data-op-pic]'), opImg = opPic && $('img', opPic), opCopy = $('[data-op-copy]');
  if (opening) opening.classList.add('is-live');
  function drawOpening(vh) {
    if (!opening) return;
    var r = opening.getBoundingClientRect();
    var run = Math.max(1, r.height - vh);
    var p = clamp(-r.top / run);
    var phone = innerWidth < 700;
    var q = easeOut(ramp(p, 0, 0.62));
    var iy = (phone ? 16 : 20) * (1 - q), ix = (phone ? 6 : 27) * (1 - q), rad = 28 * (1 - q);
    opPic.style.clipPath = 'inset(' + iy.toFixed(2) + '% ' + ix.toFixed(2) + '% ' + iy.toFixed(2) + '% ' + ix.toFixed(2) + '% round ' + rad.toFixed(1) + 'px)';
    if (opImg) opImg.style.transform = 'scale(' + (1.14 - 0.14 * q).toFixed(4) + ')';
    var c = easeOut(ramp(p, 0.5, 0.82));
    opCopy.style.opacity = c.toFixed(3);
    opCopy.style.transform = 'translateY(' + (28 * (1 - c)).toFixed(1) + 'px)';
    opCopy.style.pointerEvents = c > 0.5 ? 'auto' : 'none';
  }

  /* ---------- quiet scroll-linked pictures: the film poster drifts, the closing name grows into place ---------- */
  var poster = $('.film-play img'), footMark = $('[data-foot-mark]');
  function drawQuiet(vh) {
    if (poster && poster.isConnected) {
      var r = poster.parentNode.getBoundingClientRect();
      var t = clamp((vh - r.top) / (vh + r.height));
      poster.style.transform = 'scale(1.08) translateY(' + ((0.5 - t) * 5).toFixed(2) + '%)';
    }
    if (footMark) {
      var f = footMark.getBoundingClientRect();
      var u = easeOut(clamp((vh - f.top) / (vh * 0.7)));
      footMark.style.transform = 'translateY(' + ((1 - u) * 14).toFixed(2) + '%) scale(' + (0.9 + 0.1 * u).toFixed(4) + ')';
      footMark.style.opacity = (0.25 + 0.75 * u).toFixed(3);
    }
  }

  /* ---------- one frame loop for everything the scroll drives ---------- */
  var queued = false;
  function frame() {
    queued = false;
    var vh = innerHeight;
    drawMap(vh); drawOpening(vh); drawBar(); drawQuiet(vh);
  }
  function requestTick() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', requestTick, { passive: true });
  addEventListener('resize', function () { measure(); requestTick(); });
  measure(); frame();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); requestTick(); });
})();
