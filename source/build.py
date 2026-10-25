"""Build index.html from source/index.src.html.

Run from anywhere:  python3 source/build.py
- writes the group labels and the screen-reader list of apps from source/apps.json
- versions site.css, site.js and map3d.js by content hash, so returning visitors
  never get old CSS or JS with new HTML (GitHub Pages caches for about 10 minutes)
- updates the stylesheet version in 404.html
"""
import re, json, html, pathlib, hashlib

S = pathlib.Path(__file__).resolve().parent
R = S.parent
data = json.loads((S / 'apps.json').read_text())
names = dict(data['groups'])

labels = '\n        '.join(
    f'<span class="glab" data-g="{k}"><svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-{k}"/></svg>{html.escape(n)}</span>'
    for k, n in data['groups'])
lists = '\n      '.join(
    f'<h3>{html.escape(n)}</h3><ul>' + ''.join(f'<li>{html.escape(a["name"])}</li>' for a in data['apps'] if a['group'] == k) + '</ul>'
    for k, n in data['groups'])

src = (S / 'index.src.html').read_text()
assert '<!--GROUP_LABELS-->' in src and '<!--APP_LIST-->' in src
out = src.replace('<!--GROUP_LABELS-->', labels).replace('<!--APP_LIST-->', lists)
v = {n: hashlib.sha256((R / 'assets' / n).read_bytes()).hexdigest()[:8] for n in ('site.css', 'site.js', 'map3d.js')}
for n, h in v.items():
    assert f'assets/{n}"' in out, n
    out = out.replace(f'assets/{n}"', f'assets/{n}?v={h}"')
(R / 'index.html').write_text(out)
p404 = R / '404.html'
p404.write_text(re.sub(r'/assets/site\.css(\?v=[0-9a-f]+)?"', f'/assets/site.css?v={v["site.css"]}"', p404.read_text()))
print('built index.html', len(out), 'bytes', v)
