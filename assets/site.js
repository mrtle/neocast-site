/* neocast.us v5: the welcome frame, the header's Start now, and the 3D map journey.
   Without script the page is a welcome frame with a picture of the map. With reduced motion the map is
   drawn still and the journey jumps between three views: the welcome frame, the full map, home again. */
(function () {
  'use strict';
  var doc = document.documentElement, motion = doc.classList.contains('motion');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v) { return Math.min(1, Math.max(0, v)); };

  var bar = $('[data-bar]'), barCta = $('[data-bar-cta]'), start = $('[data-start]'), end = $('[data-end]');
  var journey = $('[data-journey]'), stage = $('[data-stage]'), host = $('[data-map]');
  var youTag = host && $('[data-you]', host), labs = {}, sizes = {};
  if (host) $$('.glab', host).forEach(function (el) { labs[el.getAttribute('data-g')] = el; });
  var map3d = null;

  /* ---------- header ---------- */
  var startSeen = true, endSeen = false;
  function drawBar() {
    if (!bar) return;
    bar.classList.toggle('solid', scrollY > 8);
    var on = !startSeen && !endSeen;
    bar.classList.toggle('cta-on', on);
    if (barCta) { barCta.tabIndex = on ? 0 : -1; barCta.setAttribute('aria-hidden', on ? 'false' : 'true'); }
  }
  if ('IntersectionObserver' in window) {
    if (start) new IntersectionObserver(function (es) { startSeen = es[0].isIntersecting; drawBar(); }).observe(start);
    if (end) new IntersectionObserver(function (es) { endSeen = es[0].isIntersecting; drawBar(); }).observe($('.start', end) || end);
    if (end) new IntersectionObserver(function (es) { if (es[0].isIntersecting) end.classList.add('is-in'); }, { rootMargin: '0px 0px -35% 0px' }).observe(end);
  } else if (end) end.classList.add('is-in');

  /* ---------- the journey ---------- */
  function progress() {
    if (!journey) return 0;
    var r = journey.getBoundingClientRect(), span = r.height - innerHeight;
    var p = span > 0 ? clamp(-r.top / span) : 0;
    if (!motion) p = p < 0.3 ? 0 : p < 0.75 ? 0.34 : 1;   // reduced motion: three still views
    return p;
  }
  function measure() {
    Object.keys(labs).forEach(function (k) { sizes[k] = [labs[k].offsetWidth, labs[k].offsetHeight]; });
  }
  function setEl(el, x, y, o) {
    el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)';
    el.style.opacity = o.toFixed(3);
  }
  // the map reports where the orb and the groups landed; the labels follow
  function onFrame(out) {
    var w = host.clientWidth, h = host.clientHeight;
    if (youTag) setEl(youTag, out.you.x, out.you.y, out.you.r > 24 ? 1 : 0);
    Object.keys(labs).forEach(function (k) {
      var s = out.groups[k], el = labs[k]; if (!s) return;
      var sz = sizes[k] || [100, 36], x = s.x, y = s.y + s.r + 7 + sz[1] / 2;
      var inView = x > -sz[0] && x < w + sz[0] && y > -sz[1] && y < h + sz[1];
      var o = inView ? s.on * (s.behind ? 0.15 : 1) * (0.25 + 0.75 * s.fog) : 0;
      setEl(el, x, y, o);
      el.style.visibility = o < 0.02 ? 'hidden' : 'visible';
    });
  }
  // no WebGL here: the page becomes the welcome frame with a picture of the map, as without script
  function noMap() {
    if (!host) return;
    doc.classList.add('no3d');
    var p = $('[data-poster]', host), w = $('[data-welcome]');
    if (p && w && !$('.nojs-map', w)) {
      var img = new Image(); img.className = 'nojs-map'; img.alt = 'An example map: You at the centre, with movies, shows, music, games, sports, events, podcasts, books and creators around you.';
      img.src = p.getAttribute('data-src'); w.appendChild(img);
    }
  }
  function mount() {
    if (!stage || !host) return;
    var src = stage.getAttribute('data-mod'), ok = false;
    try { var c = document.createElement('canvas'); ok = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { ok = false; }
    if (!ok || !src) { noMap(); return; }
    measure();
    var still = !motion || /[?&]still3d\b/.test(location.search);   // still3d: for headless checks that render WebGL on the CPU
    import(new URL(src, document.baseURI).href).then(function (mod) {
      map3d = mod.mount(host, {
        atlas: new URL(stage.getAttribute('data-atlas'), document.baseURI).href,
        still: still, p: progress(), open: motion && !still ? 0 : 1, onFrame: onFrame,
        tall: host.clientWidth / host.clientHeight < 0.9,
      });
      window.__tastebudMap = map3d;   // read by the layout checks
      if (motion && !still) {
        var t0 = performance.now();
        (function unravel(now) {
          var t = clamp((now - t0 - 200) / 1800);
          map3d.open = 1 - Math.pow(1 - t, 3);
          if (t < 1) requestAnimationFrame(unravel);
        })(t0);
      }
    }).catch(function (e) { noMap(); if (window.console) console.warn('map3d', e && e.message); });
  }

  var queued = false;
  function frame() {
    queued = false;
    drawBar();
    if (map3d) map3d.progress = progress();
  }
  function tick() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', function () { measure(); tick(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); tick(); });
  mount();
  frame();
})();
