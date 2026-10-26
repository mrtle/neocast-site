/* neocast.us: the cursor, across the whole site (v9, Martin Oct 26 2026: "the entire site should have the cursor").
   It's the cursor from the Start Now frame: a gradient ring that trails the pointer, stretches with speed and sheds
   sparkles. Moving leaves a light trail of sparkles anywhere; over Start Now and the Get A Headstart card they keep coming
   in the brand colours, over Start from Scratch in soft greys. Links and buttons make the ring a little bigger, a press
   a little smaller. Only on a mouse with motion allowed; touch, pens and reduced motion keep the normal cursor. */
(function () {
  'use strict';
  var doc = document.documentElement;
  if (!doc.classList.contains('motion') || !window.matchMedia || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var ring = document.createElement('span'), cv = document.createElement('canvas'), cx = cv.getContext && cv.getContext('2d');
  if (!cx) return;
  ring.className = 'nc-cur'; cv.className = 'nc-fx';
  ring.setAttribute('aria-hidden', 'true'); cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv); document.body.appendChild(ring);

  var COLS = ['#FD9013', '#FD3155', '#E409CF', '#4315FF', '#ffffff'], GREYS = ['#b9b6bd', '#d6d2cf', '#ffffff'];
  var HOT = '.opt-go,.btn.pri,[data-start],[data-tour-start],[data-end-start],[data-bar-cta]', SOFT = '.opt-plain';
  var LINK = 'a[href],button,[role="button"],.rail,summary,label';
  var P = [], raf = 0, dpr = 1, dirty = null, on = false;
  var ptr = { x: -999, y: -999, px: -999, py: -999, hot: 0, link: false, down: false }, pos = { x: -999, y: -999 }, k = 1;

  function size() { dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); dirty = null; }
  function spark(x, y, grey, small) {
    var a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 1.4, pal = grey ? GREYS : COLS;
    var s = small ? 2.2 + Math.random() * 2.6 : grey ? 2.6 + Math.random() * 2.5 : 3.5 + Math.random() * 4.5;
    P.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, life: 1, dec: 0.018 + Math.random() * 0.02, s: s, c: pal[(Math.random() * pal.length) | 0], r: Math.random() * Math.PI });
    if (P.length > 160) P.shift();
  }
  function star(x, y, s, r) {
    cx.save(); cx.translate(x, y); cx.rotate(r); cx.beginPath();
    for (var i = 0; i < 4; i++) { cx.lineTo(0, -s); cx.quadraticCurveTo(0, 0, s, 0); cx.rotate(Math.PI / 2); }
    cx.closePath(); cx.fill(); cx.restore();
  }
  function tick() {
    raf = 0;
    pos.x += (ptr.x - pos.x) * 0.38; pos.y += (ptr.y - pos.y) * 0.38;
    var vx = ptr.x - ptr.px, vy = ptr.y - ptr.py, v = Math.min(60, Math.hypot(vx, vy)); ptr.px = ptr.x; ptr.py = ptr.y;
    var want = (ptr.link ? 1.18 : 1) * (ptr.down ? 0.8 : 1); k += (want - k) * 0.25;
    var st = (1 + Math.min(0.55, v / 70)) * k, sq = (1 - Math.min(0.28, v / 140)) * k, ang = Math.atan2(vy, vx) * 180 / Math.PI, rgb = Math.min(5, v / 8);
    ring.style.transform = 'translate3d(' + pos.x.toFixed(1) + 'px,' + pos.y.toFixed(1) + 'px,0) rotate(' + ang.toFixed(1) + 'deg) scale(' + st.toFixed(3) + ',' + sq.toFixed(3) + ')';
    ring.style.boxShadow = (-rgb).toFixed(1) + 'px 0 0 rgba(255,42,109,.45),' + rgb.toFixed(1) + 'px 0 0 rgba(43,210,255,.45),0 6px 18px -6px rgba(228,9,207,.45)';
    if (on) {
      var j = (Math.random() - 0.5) * 10, n, i;
      if (ptr.hot) { n = Math.min(4, v / 9) + (Math.random() < 0.18 ? 1 : 0); for (i = 0; i < n; i++) spark(ptr.x + (Math.random() - 0.5) * 10, ptr.y + (Math.random() - 0.5) * 10, ptr.hot === 2); }
      else if (v > 5) { n = Math.min(2, v / 16) + (Math.random() < 0.35 ? 1 : 0); for (i = 0; i < n; i++) spark(ptr.x + j, ptr.y + (Math.random() - 0.5) * 10, false, true); }
    }
    // clear only where last frame's sparkles were
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (dirty) cx.clearRect(dirty[0], dirty[1], dirty[2] - dirty[0], dirty[3] - dirty[1]);
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var q = P.length - 1; q >= 0; q--) {
      var o = P[q]; o.x += o.vx; o.y += o.vy; o.vy += 0.02; o.vx *= 0.98; o.life -= o.dec; o.r += 0.05;
      if (o.life <= 0) { P.splice(q, 1); continue; }
      var s = o.s * (0.4 + o.life * 0.6);
      cx.globalAlpha = Math.min(1, o.life * 1.4); cx.fillStyle = o.c; star(o.x, o.y, s, o.r);
      if (o.x - s < x0) x0 = o.x - s; if (o.y - s < y0) y0 = o.y - s; if (o.x + s > x1) x1 = o.x + s; if (o.y + s > y1) y1 = o.y + s;
    }
    cx.globalAlpha = 1;
    dirty = P.length ? [Math.floor(x0 - 3), Math.floor(y0 - 3), Math.ceil(x1 + 3), Math.ceil(y1 + 3)] : null;
    if (P.length || (on && ptr.hot) || Math.abs(pos.x - ptr.x) + Math.abs(pos.y - ptr.y) > 0.5 || Math.abs(want - k) > 0.004 || v > 0.5) raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf) raf = requestAnimationFrame(tick); }
  function show(v) {
    if (v === on) return; on = v;
    ring.classList.toggle('on', v);
    if (v) doc.classList.add('nc-cursor');   // the normal cursor hides from the first mouse move on
  }
  function aim(t) {
    var el = t && t.closest ? t : null;
    ptr.hot = el && el.closest(HOT) ? 1 : el && el.closest(SOFT) ? 2 : 0;
    ptr.link = !!(el && el.closest(LINK));
  }
  addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') { show(false); return; }
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (!on) { if (pos.x < -900 || P.length === 0) { pos.x = ptr.x; pos.y = ptr.y; ptr.px = ptr.x; ptr.py = ptr.y; } show(true); }
    aim(e.target); wake();
  }, { passive: true });
  addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse') { ptr.down = true; wake(); } else show(false); }, { passive: true });
  addEventListener('pointerup', function () { ptr.down = false; wake(); }, { passive: true });
  // the page scrolled under a still pointer (a step, the loop): what's under it may have changed
  addEventListener('scroll', function () { if (on) aim(document.elementFromPoint(ptr.x, ptr.y)); }, { passive: true });
  document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) { show(false); ptr.hot = 0; } });   // left the window
  addEventListener('blur', function () { show(false); ptr.hot = 0; });
  addEventListener('resize', size);
  size();
})();
