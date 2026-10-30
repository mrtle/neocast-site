"""Build index.html from source/index.src.html.

Run from anywhere:  python3 source/build.py
- writes the map data (the categories, their glyphs, the apps with atlas cells and sphere colours) and the
  screen-reader list of apps from source/apps.json
- versions site.css, site.js, cursor.js and map3d.js by content hash (GitHub Pages caches for about 10 minutes)
- updates the stylesheet and cursor versions in 404.html
"""
import re, json, html, pathlib, hashlib

S = pathlib.Path(__file__).resolve().parent
R = S.parent
data = json.loads((S / 'apps.json').read_text())
cats = data['cats']
apps = data['apps']
grid = data.get('grid') or {'cols': 8, 'cell': 256, 'gut': 6, 'size': 2048}   # app atlas layout
n_atl = max(a['cell'] for a in apps) // (grid['cols'] ** 2) + 1
def ver(path): return path + '?v=' + hashlib.sha256((R / path).read_bytes()).hexdigest()[:8]
mapdata = {
    'cats': [{'k': c['k'], 'name': c['name'], 'g': c.get('g', i)} for i, c in enumerate(cats)],
    'apps': [{'k': a['key'], 'cat': a['cat'], 'cell': a['cell'], 'color': a.get('color', '#ffffff')} for a in apps],
    # versioned by content: the atlas files keep their names between versions, and a cached old atlas scrambles the icons
    'atlases': data.get('atlases') or [ver(f'assets/img/apps/atlas-{i}.webp') for i in range(n_atl)],
    'atlasesSm': data.get('atlasesSm') or [ver(f'assets/img/apps/atlas-{i}-sm.webp') for i in range(n_atl)],
    'glyphs': ver('assets/img/apps/glyphs.webp'),
    'poster': ver('assets/img/map-poster.webp'),
    'grid': grid,
    # after Get A Headstart: the 600-app picker (v7's icons) and every way in per app (source/data/connect.py)
    'connect': ver('assets/connect.json'),
    'atlases600': [ver(f'assets/img/apps600/atlas-{i}.webp') for i in range(5)],
}
lists = '\n      '.join(
    f'<h3>{html.escape(c["name"])}</h3><ul>' + ''.join(f'<li>{html.escape(a["name"])}</li>' for a in apps if a['cat'] == c['k']) + '</ul>'
    for c in cats)

src = (S / 'index.src.html').read_text()
assert '<!--MAP_DATA-->' in src and '<!--APP_LIST-->' in src
out = src.replace('<!--MAP_DATA-->', json.dumps(mapdata, separators=(',', ':')).replace('</', '<\\/')).replace('<!--APP_LIST-->', lists)
out = out.replace('src="assets/img/map-poster.webp"', 'src="' + mapdata['poster'] + '"')
v = {n: hashlib.sha256((R / 'assets' / n).read_bytes()).hexdigest()[:8] for n in ('site.css', 'site.js', 'cursor.js', 'headstart.js', 'map3d.js')}
for n, h in v.items():
    assert f'assets/{n}"' in out, n
    out = out.replace(f'assets/{n}"', f'assets/{n}?v={h}"')
(R / 'index.html').write_text(out)
p404 = R / '404.html'
t404 = p404.read_text()
for n in ('site.css', 'cursor.js'):
    assert f'/assets/{n}' in t404, n
    t404 = re.sub(r'/assets/' + re.escape(n) + r'(\?v=[0-9a-f]+)?"', f'/assets/{n}?v={v[n]}"', t404)
p404.write_text(t404)
print('built index.html', len(out), 'bytes', len(cats), 'categories', len(apps), 'apps', n_atl, 'atlases', v)

# ---------- /play: Start from scratch (Oct 29 2026) ----------
SESH = 'https://sesh-production-6061.up.railway.app'
def h8(path): return hashlib.sha256((R / path).read_bytes()).hexdigest()[:8]
eng = h8('assets/play/engine.mjs')
pj = R / 'assets/play/play.js'
pjs = re.sub(r"from './engine\.mjs(\?v=[0-9a-f]+)?'", f"from './engine.mjs?v={eng}'", pj.read_text())
pj.write_text(pjs)
playdata = {
    'bank': '/' + ver('assets/play/bank.json'), 'base': '/assets/play/', 'sesh': SESH,
    'mod': '/' + ver('assets/map3d.js'), 'glyphs': '/' + mapdata['glyphs'], 'poster': '/' + mapdata['poster'],
    'apps600': ['/' + u for u in mapdata['atlases600']], 'lockup': '/assets/brand/neocast-lockup-black.svg',
    'cats': [{'k': c['k'], 'name': c['name'], 'g': c.get('g', i)} for i, c in enumerate(cats)],
}
psrc = (S / 'play.src.html').read_text()
assert '<!--PLAY_DATA-->' in psrc
pout = psrc.replace('<!--PLAY_DATA-->', json.dumps(playdata, separators=(',', ':')).replace('</', '<\\/')).replace('<!--SESH-->', SESH)
for n in ('site.css', 'play/play.css', 'play/play.js'):
    assert f'/assets/{n}"' in pout, n
    pout = pout.replace(f'/assets/{n}"', f'/assets/{n}?v={h8("assets/" + n)}"')
(R / 'play').mkdir(exist_ok=True)
(R / 'play' / 'index.html').write_text(pout)
print('built play/index.html', len(pout), 'bytes')

# image credits for the game: the artwork's sources and the Fluent emoji licence
import html as _h
bankj = json.loads((R / 'assets/play/bank.json').read_text())
rows = ''.join(f'<li><a href="{_h.escape(c.get("source") or "")}">{_h.escape(c.get("title") or c["id"])}</a> via {_h.escape(c.get("provider") or "")}. {_h.escape(c.get("license") or "")}</li>' for c in bankj.get('credits', []))
cred = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Image credits | Neocast</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/assets/site.css?v={h8('assets/site.css')}"><style>main{{max-width:760px;margin:0 auto;padding:110px 24px 80px}}h1{{font-size:44px;letter-spacing:-.04em;margin:0 0 18px}}li{{margin:6px 0;font-size:15px}}a{{color:inherit}}p{{color:var(--ink-2)}}</style></head>
<body><main><h1>Image credits.</h1><p>Food, places, activities and objects are <a href="https://github.com/microsoft/fluentui-emoji">Microsoft Fluent Emoji</a> (MIT License, Copyright (c) Microsoft Corporation). App icons are the apps’ official App Store artwork and belong to their owners; Neocast isn’t affiliated with them. Photos of people and titles:</p><ul>{rows}</ul><p><a href="/play/">Back to the game</a></p></main></body></html>"""
(R / 'play' / 'credits.html').write_text(cred)
print('built play/credits.html', len(bankj.get('credits', [])), 'credits')
