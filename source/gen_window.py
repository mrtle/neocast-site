#!/usr/bin/env python3
"""neocast.us v4: the web app window, rebuilt from approved screens 07 (map) and 11 (list).
Geometry is the screens' own (1920x1080 artboard; the map panel is 1520x920), drawn at --s = window width / 1920.
Groups are the leisure groups the backend covers today (no Career/Education); no third-party logos, no fake counts."""
import math, html

ICONS = {
 'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 'chat': '<path d="M4.5 18.5 3 21l3.6-1.2A9 9 0 1 0 4.5 18.5z"/>',
 'feed': '<rect x="3.5" y="4" width="17" height="7" rx="2.5"/><rect x="3.5" y="13" width="17" height="7" rx="2.5"/>',
 'import': '<path d="M12 3.5v12"/><path d="m7 10.5 5 5 5-5"/><path d="M4.5 20.5h15"/>',
 'apps': '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
 'settings': '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>',
 'tv': '<rect x="3" y="6" width="18" height="12.5" rx="2.5"/><path d="M8.5 21h7"/><path d="m9 2.5 3 3 3-3"/>',
 'film': '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7.5 3v18"/><path d="M16.5 3v18"/><path d="M3 12h18"/><path d="M3 7.5h4.5"/><path d="M3 16.5h4.5"/><path d="M16.5 7.5H21"/><path d="M16.5 16.5H21"/>',
 'music': '<path d="M9 18V5.5l11-2V16"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
 'pin': '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
 'ticket': '<path d="M3 9.5a2.5 2.5 0 0 0 0 5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18v-3.5a2.5 2.5 0 0 1 0-5V6a1.5 1.5 0 0 0-1.5-1.5h-15A1.5 1.5 0 0 0 3 6z"/><path d="M14.5 4.5v2"/><path d="M14.5 11v2"/><path d="M14.5 17.5v2"/>',
 'game': '<path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.4l-.8 4a2.4 2.4 0 0 1-4 1.2L14 16h-4l-2.6 2.6a2.4 2.4 0 0 1-4-1.2l-.8-4A4.5 4.5 0 0 1 7 8z"/><path d="M7.5 11v3"/><path d="M6 12.5h3"/><path d="M15.5 11.5h.01"/><path d="M17.5 13.5h.01"/>',
 'map': '<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13"/><path d="M15 6.5v13"/>',
 'list': '<path d="M9 6h11.5"/><path d="M9 12h11.5"/><path d="M9 18h11.5"/><path d="M4 6h.5"/><path d="M4 12h.5"/><path d="M4 18h.5"/>',
 'chev': '<path d="m9.5 6 6 6-6 6"/>',
 'lock': '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
}
def ico(name, cls='g', extra=''):
    return f'<svg class="ico {cls}"{extra} viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>'

ART_W, ART_H, CHROME = 1920, 1080, 64       # the window's artboard (approved shell) plus a browser bar
PANEL = (368, 128, 1520, 920)               # x, y, w, h of the glass current-view panel (screen 07)

# map geometry inside the panel (screen 07's own coordinates); our leisure groups take its six seats
ORB = (760, 450, 132)
NODES = [
 ('shows', 'Shows', 'tv', 'Suits · Billions', 430, 228, 116),
 ('movies', 'Movies', 'film', 'Iron Man · Knives Out', 1100, 214, 116),
 ('concerts', 'Concerts', 'ticket', 'This fall', 230, 500, 106),
 ('games', 'Games', 'game', 'Co-op nights', 480, 700, 108),
 ('music', 'Music', 'music', 'Late-night albums', 1290, 470, 108),
 ('places', 'Places', 'pin', 'Disneyland', 1060, 700, 108),
]
ROWS = [
 ('tv', 'Shows', 'Suits · Billions · Ted Lasso'),
 ('film', 'Movies', 'Iron Man · Knives Out · 2 more'),
 ('music', 'Music', 'Late-night albums · Live sets'),
 ('pin', 'Places', 'Disneyland · The churro stand'),
 ('ticket', 'Concerts', 'Shows near you this fall'),
 ('game', 'Games', 'Co-op nights with friends'),
]

def s(v):  # reference px -> css length
    return f'calc({v:g} * var(--s))'

def edge(ax, ay, ar, bx, by, br, gap=10):
    dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
    x1, y1 = ax + ux * (ar + gap), ay + uy * (ar + gap)
    x2, y2 = bx - ux * (br + gap), by - uy * (br + gap)
    bend = 0.08 * math.hypot(x2 - x1, y2 - y1)
    mx, my = (x1 + x2) / 2 - uy * bend, (y1 + y2) / 2 + ux * bend
    return f'M{x1:.1f} {y1:.1f} Q{mx:.1f} {my:.1f} {x2:.1f} {y2:.1f}'

def map_view():
    ox, oy, orr = ORB
    paths = ''.join(f'<path pathLength="1" d="{edge(ox, oy, orr, x, y, r)}"/>' for _, _, _, _, x, y, r in NODES)
    out = [f'<svg class="w-edges" viewBox="0 0 {PANEL[2]} {PANEL[3]}" aria-hidden="true"><defs><linearGradient id="w-eg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{PANEL[2]}" y2="{PANEL[3]}">'
           f'<stop offset="0" stop-color="#FD9013"/><stop offset=".4" stop-color="#FD3155"/><stop offset=".72" stop-color="#E409CF"/><stop offset="1" stop-color="#4315FF"/></linearGradient></defs>'
           f'<g stroke="url(#w-eg)">{paths}</g></svg>']
    out.append(f'<div class="w-orb" style="left:{s(ox - orr)};top:{s(oy - orr)};width:{s(2 * orr)};height:{s(2 * orr)}"><b>You</b><span>6 groups</span></div>')
    for i, (k, label, icon, meta, x, y, r) in enumerate(NODES):
        out.append(f'<button type="button" class="w-node" data-wn="{k}" style="--i:{i};left:{s(x - r)};top:{s(y - r)};width:{s(2 * r)};height:{s(2 * r)}">'
                   f'<span class="w-glyph">{ico(icon)}</span><b>{label}</b><span>{html.escape(meta)}</span></button>')
    return f'<div class="w-map" data-w-panel="map">{"".join(out)}</div>'

def list_view():
    rows = ''.join(f'<li style="--i:{i}"><span class="w-rtile">{ico(ic)}</span><span class="w-rtxt"><b>{t}</b><span>{html.escape(m)}</span></span>{ico("chev", "c")}</li>'
                   for i, (ic, t, m) in enumerate(ROWS))
    return (f'<div class="w-list" data-w-panel="list" hidden><div class="w-root"><i class="w-dot"></i><span class="w-rtxt"><b>You</b><span>6 groups</span></span></div>'
            f'<ul>{rows}</ul></div>')

def build():
    nav = [('user', 'You', True), ('chat', 'Chat', False), ('feed', 'Feed', False), None,
           ('import', 'Import memories', False), ('apps', 'Connect apps', False), None, ('settings', 'Settings', False)]
    side = ''.join('<i class="w-sep"></i>' if n is None else
                   f'<span class="w-navi{" on" if n[2] else ""}">{ico(n[0], "g" if n[2] else "n")}{n[1]}</span>' for n in nav)
    px, py, pw, ph = PANEL
    return f'''<div class="window" data-window data-ui>
  <div class="w-chrome"><i></i><i></i><i></i><span class="w-url">{ico("lock", "n")}neocast.live/tastebud</span></div>
  <div class="w-art">
    <div class="w-glow" aria-hidden="true"></div>
    <img class="w-brand" src="assets/brand/neocast-lockup-black.svg" alt="" width="1780" height="285">
    <span class="w-who">Welcome back <i class="w-avatar">{ico("user", "w")}</i></span>
    <div class="w-side" aria-hidden="true">{side}</div>
    <div class="w-panel" style="left:{s(px)};top:{s(py)};width:{s(pw)};height:{s(ph)}">
      <span class="w-crumb">{ico("user")}You</span>
      {map_view()}
      {list_view()}
      <div class="w-seg" role="group" aria-label="View">
        <button type="button" class="on" data-w-view="map" aria-pressed="true">{ico("map", "n")}Map</button>
        <button type="button" data-w-view="list" aria-pressed="false">{ico("list", "n")}List</button>
      </div>
      <span class="w-fab" aria-hidden="true"><img src="assets/brand/neocast-symbol-crop.svg" alt="" width="382" height="285"></span>
    </div>
  </div>
</div>'''

if __name__ == '__main__':
    print(build())
