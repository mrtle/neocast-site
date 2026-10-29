/* neocast.us: after Get A Headstart (Martin, Oct 27 2026). "Add every app you use." with all 600 apps (the v7 icons),
   search and categories; adding an app opens its sheet with every way to bring it into Neocast (for Instagram: saved
   folders, likes, follows and more), from the Oct 24 playbook. Nothing here connects anything or claims to: the choices
   are handed to the setup page (neocast.live/start) on Continue. Data: assets/connect.json, loaded on first open. */
(function () {
  'use strict';
  var pick = document.querySelector('[data-pick]'), go = pick && pick.querySelector('.opt-go');
  if (!pick || !go || !window.fetch) return;
  var doc = document.documentElement, motion = doc.classList.contains('motion');
  var meta = {}; try { meta = JSON.parse(document.getElementById('map-data').textContent); } catch (e) {}
  if (!meta.connect) return;
  var START = 'https://neocast.live/start';
  var data = null, loading = null, byK = {}, sel = {}, view = null, sheet = null, sheetApp = null, cat = 'all', q = '', lastTile = null;
  try { sel = JSON.parse(localStorage.getItem('nc-headstart') || '{}') || {}; } catch (e) { sel = {}; }
  function save() { try { localStorage.setItem('nc-headstart', JSON.stringify(sel)); } catch (e) {} }
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5.5 8.5 12l6.5 6.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.5 12.5 4.2 4.2 8.8-9.4"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    arw: '<svg class="arw" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/></svg>',
  };
  // the ways in, each with a small line icon (Lucide-style)
  var WAYI = {
    file: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    snap: '<rect x="3.5" y="6.5" width="13" height="11" rx="2.5"/><path d="m16.5 10.5 4-2.5v8l-4-2.5"/>',
    share: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M6 12.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5.5"/>',
    forward: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
    signin: '<path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14M9.5 8l4 4-4 4M13.5 12H4"/>',
    phone: '<rect x="6.5" y="3" width="11" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
    ai: '<path d="M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    request: '<path d="M7 3.5h7l4.5 4.5v12.5H7z"/><path d="M14 3.5V8h4.5M9.5 13h6M9.5 16.5h4"/>',
  };
  var wayIcon = function (w) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (WAYI[w] || '') + '</svg>'; };

  /* ---------- the view ---------- */
  function build() {
    view = document.createElement('section');
    view.className = 'hs'; view.hidden = true; view.setAttribute('aria-labelledby', 'hs-h');
    view.innerHTML =
      '<div class="hs-head"><button type="button" class="hs-back" data-hs-back aria-label="Back to the two options">' + ICON.back + '</button>' +
      '<div><h2 class="hs-h" id="hs-h">Add every app you <span class="gt">use.</span></h2><p class="hs-sub">You can always add more.</p></div></div>' +
      '<div class="hs-panel">' +
        '<div class="hs-bar"><label class="hs-search">' + ICON.search + '<span class="sr-only">Search apps</span><input type="search" placeholder="Search apps" autocomplete="off" spellcheck="false" data-hs-q></label>' +
        '<span class="hs-count" data-hs-count aria-live="polite">0 selected</span>' +
        '<a class="btn pri hs-go" href="' + START + '?path=headstart" data-hs-go>Continue' + ICON.arw + '</a></div>' +
        '<div class="hs-cats" role="tablist" aria-label="Categories" data-hs-cats></div>' +
        '<div class="hs-grid" data-hs-grid><p class="hs-wait">Loading the apps…</p></div>' +
      '</div>';
    var top = pick.querySelector('.pick-top'); top.parentNode.insertBefore(view, top.nextSibling);
    view.querySelector('[data-hs-back]').addEventListener('click', back);
    var qi = view.querySelector('[data-hs-q]');
    qi.addEventListener('input', function () { q = qi.value.trim().toLowerCase(); draw(); });
    view.querySelector('[data-hs-cats]').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; cat = b.dataset.k; drawCats(); draw();
      view.querySelector('[data-hs-grid]').scrollTop = 0;
    });
    view.querySelector('[data-hs-grid]').addEventListener('click', function (e) {
      var b = e.target.closest('.hs-app'); if (!b) return;
      var k = b.dataset.k; lastTile = b;
      if (!sel[k]) { sel[k] = { w: defaults(byK[k]), x: (byK[k].what || []).slice() }; save(); mark(k); count(); }
      openSheet(byK[k]);
    });
    view.querySelector('[data-hs-go]').addEventListener('click', function (e) {
      var ks = Object.keys(sel);
      if (!ks.length) { e.preventDefault(); return; }
      this.href = START + '?path=headstart&apps=' + encodeURIComponent(ks.map(function (k) { return byK[k] ? slug(byK[k].n) : k; }).join(','));
    });
  }
  var slug = function (n) { return n.toLowerCase().replace(/&/g, 'and').replace(/[’'.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var defaults = function (a) { return a.o.length ? [0] : []; };

  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) loading = fetch(new URL(meta.connect, document.baseURI).href).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      data = d; d.apps.forEach(function (a) { byK[a.k] = a; });
      Object.keys(sel).forEach(function (k) { if (!byK[k]) delete sel[k]; });
      return d;
    });
    return loading;
  }

  function drawCats() {
    var el = view.querySelector('[data-hs-cats]');
    if (!el.childElementCount) {
      el.innerHTML = '<button type="button" role="tab" data-k="all">All</button>' + data.cats.map(function (c) { return '<button type="button" role="tab" data-k="' + c.k + '">' + esc(c.name) + '</button>'; }).join('');
    }
    [].forEach.call(el.children, function (b) { var on = b.dataset.k === cat; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  }
  // the icon: one cell of the 600-icon atlases, as a background sprite
  function sprite(a, size) {
    var g = data.grid, per = g.cols * g.cols, c = a.cell % per, url = meta.atlases600[Math.floor(a.cell / per)], k = size / (g.cell - 2 * g.gut);
    return 'background-image:url(' + url + ');background-size:' + (g.size * k).toFixed(1) + 'px;background-position:' +
      (-((c % g.cols) * g.cell + g.gut) * k).toFixed(1) + 'px ' + (-(Math.floor(c / g.cols) * g.cell + g.gut) * k).toFixed(1) + 'px';
  }
  var tileSize = function () { return innerWidth < 760 ? 52 : 62; };
  function tile(a) {
    var on = !!sel[a.k];
    return '<button type="button" class="hs-app' + (on ? ' on' : '') + '" data-k="' + a.k + '" aria-pressed="' + on + '">' +
      '<span class="hs-ico" style="' + sprite(a, tileSize()) + '"><span class="hs-chk">' + ICON.check + '</span></span><span class="hs-n">' + esc(a.n) + '</span></button>';
  }
  function draw() {
    var grid = view.querySelector('[data-hs-grid]'), html = '';
    var match = function (a) { return !q || a.n.toLowerCase().indexOf(q) >= 0 || catName(a.c).toLowerCase().indexOf(q) >= 0; };
    if (q || cat !== 'all') {
      var list = data.apps.filter(function (a) { return (cat === 'all' || a.c === cat) && match(a); });
      html = list.length ? '<div class="hs-tiles">' + list.map(tile).join('') + '</div>' : '<p class="hs-wait">No apps match “' + esc(q) + '”.</p>';
    } else {
      data.cats.forEach(function (c) {
        var list = data.apps.filter(function (a) { return a.c === c.k; });
        html += '<h3 class="hs-cat">' + esc(c.name) + '</h3><div class="hs-tiles">' + list.map(tile).join('') + '</div>';
      });
    }
    grid.innerHTML = html;
  }
  var catName = function (k) { for (var i = 0; i < data.cats.length; i++) if (data.cats[i].k === k) return data.cats[i].name; return ''; };
  function mark(k) {
    var on = !!sel[k];
    [].forEach.call(view.querySelectorAll('.hs-app[data-k="' + k + '"]'), function (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  function count() {
    var n = Object.keys(sel).length;
    view.querySelector('[data-hs-count]').textContent = n + ' selected';
    view.querySelector('[data-hs-go]').classList.toggle('off', !n);
    view.querySelector('[data-hs-go]').setAttribute('aria-disabled', n ? 'false' : 'true');
  }

  /* ---------- open and close ---------- */
  var cards = function () { return [pick.querySelector('.pick-h'), pick.querySelector('.pick-opts'), pick.querySelector('.pick-have')].filter(Boolean); };
  function show() {
    if (!view) build();
    cards().forEach(function (el) { el.hidden = true; });
    pick.classList.add('hs-on'); view.hidden = false;
    if (motion) { view.classList.remove('in'); void view.offsetWidth; view.classList.add('in'); }
    try { if (location.hash !== '#apps') { history.pushState({ pick: 1, apps: 1 }, '', '#apps'); pushed = true; pick.dataset.appsPushed = '1'; } } catch (e) {}
    load().then(function () { drawCats(); draw(); count(); }, function () {
      view.querySelector('[data-hs-grid]').innerHTML = '<p class="hs-wait">The apps didn’t load. <a href="' + START + '?path=headstart">Continue to setup</a></p>';
    });
    view.querySelector('[data-hs-q]').focus({ preventScroll: true });
  }
  function hide() {
    if (!view || view.hidden) return;
    closeSheet(true);
    view.hidden = true; pick.classList.remove('hs-on');
    cards().forEach(function (el) { el.hidden = false; });
  }
  function back() {
    if (location.hash === '#apps') {
      if (pushed) { pushed = false; delete pick.dataset.appsPushed; try { history.back(); return; } catch (e) {} }
      try { history.replaceState(null, '', '#start'); } catch (e) {}
    }
    hide(); go.focus({ preventScroll: true });
  }
  go.addEventListener('click', function (e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // a new tab still goes to setup
    e.preventDefault(); show();
  });
  addEventListener('popstate', function () {
    if (location.hash === '#apps') { if (!pick.hidden) show(); }
    else if (view && !view.hidden) { pushed = false; delete pick.dataset.appsPushed; hide(); if (!pick.hidden) go.focus({ preventScroll: true }); }
  });
  // the frame closed (×, Esc, back past #start): start from the two options next time
  new MutationObserver(function () { if (pick.hidden) { pushed = false; hide(); } }).observe(pick, { attributes: true, attributeFilter: ['hidden'] });
  var pushed = false;
  // a reload or link on #apps: the frame is already open (site.js); show the picker on top of it
  if (location.hash === '#apps' && !pick.hidden) show();

  /* ---------- the sheet: every way to bring one app in ---------- */
  function openSheet(a) {
    closeSheet(true);
    sheetApp = a;
    var s = sel[a.k] || { w: [], x: [] };
    var what = a.what ? '<p class="hs-lab">What to bring in</p><div class="hs-what">' + a.what.map(function (w) {
      var on = s.x.indexOf(w) >= 0;
      return '<button type="button" class="hs-pill' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-x="' + esc(w) + '">' + ICON.check + esc(w) + '</button>';
    }).join('') + '</div>' : '';
    var how = a.o.length ? '<p class="hs-lab">' + (a.o.length > 1 ? 'Every way to bring it in' : 'How to bring it in') + '</p><div class="hs-ways">' + a.o.map(function (o, i) {
      var on = s.w.indexOf(i) >= 0;
      return '<button type="button" class="hs-way' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-i="' + i + '">' +
        '<span class="hs-wi">' + wayIcon(o.w) + '</span>' +
        '<span class="hs-wt"><span class="hs-wk">' + esc(data.ways[o.w] || '') + (i === 0 && a.o.length > 1 ? ' · Best' : '') + '</span><span class="hs-wn">' + esc(o.t) + '</span>' +
        '<span class="hs-wd">' + esc(o.d) + '</span>' + (o.g || o.m ? '<span class="hs-wm">' + esc([o.g, o.m].filter(Boolean).join(' · ')) + '</span>' : '') + '</span>' +
        '<span class="hs-tick">' + ICON.check + '</span></button>';
    }).join('') + '</div>' : '';
    sheet = document.createElement('div');
    sheet.className = 'hs-scrim';
    sheet.innerHTML = '<div class="hs-sheet" role="dialog" aria-modal="true" aria-labelledby="hs-sh">' +
      '<button type="button" class="hs-x" data-hs-done aria-label="Close">' + ICON.x + '</button>' +
      '<div class="hs-top"><span class="hs-ico big" style="' + sprite(a, 76) + '"></span><div><p class="hs-cn">' + esc(catName(a.c)) + '</p>' +
      '<h3 class="hs-an" id="hs-sh">' + esc(a.n) + '</h3>' + (a.g ? '<p class="hs-learn">' + esc(a.g) + '</p>' : '') + '</div></div>' +
      what + how + (a.note ? '<p class="hs-note">' + esc(a.note) + '</p>' : '') +
      '<div class="hs-foot"><button type="button" class="btn plain sm" data-hs-rm>Remove ' + esc(a.n) + '</button><button type="button" class="btn pri sm" data-hs-done>Done</button></div></div>';
    pick.appendChild(sheet);
    if (motion) sheet.classList.add('in');
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('[data-hs-done]')) { closeSheet(); return; }
      if (e.target.closest('[data-hs-rm]')) { delete sel[a.k]; save(); mark(a.k); count(); closeSheet(); return; }
      var w = e.target.closest('.hs-way'), x = e.target.closest('.hs-pill'), cur = sel[a.k] || (sel[a.k] = { w: [], x: [] });
      if (w) { var i = +w.dataset.i, at = cur.w.indexOf(i); if (at >= 0) cur.w.splice(at, 1); else cur.w.push(i); w.classList.toggle('on', at < 0); w.setAttribute('aria-pressed', at < 0); save(); }
      if (x) { var v = x.dataset.x, j = cur.x.indexOf(v); if (j >= 0) cur.x.splice(j, 1); else cur.x.push(v); x.classList.toggle('on', j < 0); x.setAttribute('aria-pressed', j < 0); save(); }
    });
    var f = sheet.querySelector('.hs-foot .pri'); if (f) f.focus({ preventScroll: true });
  }
  function closeSheet(quiet) {
    if (!sheet) return;
    sheet.remove(); sheet = null; sheetApp = null;
    if (!quiet && lastTile && lastTile.isConnected) lastTile.focus({ preventScroll: true });
  }

  // keys first (capture on window, before the frame's own Esc and Tab handling)
  addEventListener('keydown', function (e) {
    if (!view || view.hidden || pick.hidden) return;
    var scope = sheet ? sheet.querySelector('.hs-sheet') : pick;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (sheet) closeSheet(); else back(); return; }
    if (e.key === 'Tab') {
      var f = [].slice.call(scope.querySelectorAll('a[href],button,input')).filter(function (el) { return el.offsetParent !== null && !el.closest('[hidden]'); });
      var i = f.indexOf(document.activeElement); e.stopPropagation();
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }, true);
  addEventListener('resize', function () { if (data && view && !view.hidden) draw(); });
})();
