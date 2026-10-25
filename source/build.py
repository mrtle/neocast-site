"""Build index.html from source/index.src.html.

Run from anywhere:  python3 source/build.py
- writes the map data (the categories, their glyphs, the apps with atlas cells and sphere colours) and the
  screen-reader list of apps from source/apps.json
- versions site.css, site.js and map3d.js by content hash (GitHub Pages caches for about 10 minutes)
- updates the stylesheet version in 404.html
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
    'cats': [{'k': c['k'], 'name': c['name'], 'g': i} for i, c in enumerate(cats)],
    'apps': [{'k': a['key'], 'cat': a['cat'], 'cell': a['cell'], 'color': a.get('color', '#ffffff')} for a in apps],
    # versioned by content: the atlas files keep their names between versions, and a cached old atlas scrambles the icons
    'atlases': data.get('atlases') or [ver(f'assets/img/apps/atlas-{i}.webp') for i in range(n_atl)],
    'atlasesSm': data.get('atlasesSm') or [ver(f'assets/img/apps/atlas-{i}-sm.webp') for i in range(n_atl)],
    'glyphs': ver('assets/img/apps/glyphs.webp'),
    'poster': ver('assets/img/map-poster.webp'),
    'grid': grid,
}
lists = '\n      '.join(
    f'<h3>{html.escape(c["name"])}</h3><ul>' + ''.join(f'<li>{html.escape(a["name"])}</li>' for a in apps if a['cat'] == c['k']) + '</ul>'
    for c in cats)

src = (S / 'index.src.html').read_text()
assert '<!--MAP_DATA-->' in src and '<!--APP_LIST-->' in src
out = src.replace('<!--MAP_DATA-->', json.dumps(mapdata, separators=(',', ':')).replace('</', '<\\/')).replace('<!--APP_LIST-->', lists)
out = out.replace('src="assets/img/map-poster.webp"', 'src="' + mapdata['poster'] + '"')
v = {n: hashlib.sha256((R / 'assets' / n).read_bytes()).hexdigest()[:8] for n in ('site.css', 'site.js', 'map3d.js')}
for n, h in v.items():
    assert f'assets/{n}"' in out, n
    out = out.replace(f'assets/{n}"', f'assets/{n}?v={h}"')
(R / 'index.html').write_text(out)
p404 = R / '404.html'
p404.write_text(re.sub(r'/assets/site\.css(\?v=[0-9a-f]+)?"', f'/assets/site.css?v={v["site.css"]}"', p404.read_text()))
print('built index.html', len(out), 'bytes', len(cats), 'categories', len(apps), 'apps', n_atl, 'atlases', v)
