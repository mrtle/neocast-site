"""Copy this site's landing and the whole life map game into Vedant's repo (VedSoni-dev/neocast), and check nothing drifted.

Martin, Oct 30 2026: every change here also goes to Vedant's repo. Nov 5 2026: "update the game in every push", so the
game ships everywhere it runs, every time:
  - neocast.live (apps/neocast): the landing, /play and all its files (engine, page, styles, bank, looks, sounds),
  - the account app (apps/sesh/web/public/play): the same engine and bank, which it uses to replay saved games.

The copies keep that repo's local edits: account links and the game's account address on app.neocast.live, and the
custom cursor off (owner direction, Oct 28 2026). Everything else is byte for byte.

  python3 source/build.py                         # build this site first
  python3 source/sync_vedant.py ../neocast        # copy, then check (exits 1 if anything still differs)
  python3 source/sync_vedant.py ../neocast --check   # check only
"""
import pathlib, re, shutil, sys

S = pathlib.Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith('--')]
V = pathlib.Path(args[0] if args else S.parent / 'neocast').resolve()
A = V / 'apps/neocast'
SESH_PLAY = V / 'apps/sesh/web/public/play'
CHECK_ONLY = '--check' in sys.argv
if not A.is_dir(): sys.exit(f'not a clone of VedSoni-dev/neocast: {V}')

def app_links(t):
    t = t.replace('href="https://sesh-production-6061.up.railway.app/', 'href="https://app.neocast.live/')
    return t.replace('"sesh":"https://sesh-production-6061.up.railway.app"', '"sesh":"https://app.neocast.live"')
def no_cursor(t):
    new, n = re.subn(r'<script src="assets/cursor\.js\?v=[0-9a-f]+" defer></script>',
                     '<!-- Neocast: the site-wide custom cursor (assets/cursor.js) is off by owner direction, Oct 28 2026. -->', t)
    assert n == 1, 'cursor script line not found'
    return new

TEXT = {  # this site -> (Vedant's repo, transform)
    'assets/site.css': (A / 'public/assets/site.css', None), 'assets/site.js': (A / 'public/assets/site.js', None),
    'assets/headstart.js': (A / 'public/assets/headstart.js', None), 'assets/map3d.js': (A / 'public/assets/map3d.js', None),
    'index.html': (A / 'src/site/index.html', lambda t: no_cursor(app_links(t))),
    '404.html': (A / 'site-source/404.html', app_links),
    'source/index.src.html': (A / 'site-source/index.src.html', app_links),
    'source/map3d/map3d.js': (A / 'site-source/map3d/map3d.js', None),
    # the game
    'play/index.html': (A / 'src/site/play.html', app_links), 'play/credits.html': (A / 'public/play/credits.html', None),
    'source/play.src.html': (A / 'site-source/play.src.html', app_links),
    'assets/play/engine.mjs': (A / 'public/assets/play/engine.mjs', None), 'assets/play/play.js': (A / 'public/assets/play/play.js', None),
    'assets/play/play.css': (A / 'public/assets/play/play.css', None), 'assets/play/looks.mjs': (A / 'public/assets/play/looks.mjs', None),
    'assets/play/bank.json': (A / 'public/assets/play/bank.json', None),
    # the account app replays saved games with the same engine and bank (apps/sesh/web/src/life/merge.ts)
    'assets/play/engine.mjs#sesh': (SESH_PLAY / 'engine.mjs', None), 'assets/play/bank.json#sesh': (SESH_PLAY / 'bank.json', None),
}
BINARY = [(f, A / 'public/assets/play/sfx' / f.name) for f in sorted((S / 'assets/play/sfx').glob('*.mp3'))]
BINARY += [(f, A / 'site-source/play' / f.name) for f in sorted((S / 'source/play').iterdir()) if f.is_file()]

def want(src, f):
    t = (S / src.split('#')[0]).read_text()
    return f(t) if f else t

if not CHECK_ONLY:
    for src, (dst, f) in TEXT.items():
        dst.parent.mkdir(parents=True, exist_ok=True); dst.write_text(want(src, f))
    for src, dst in BINARY:
        dst.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(src, dst)

bad = [str(dst.relative_to(V)) for src, (dst, f) in TEXT.items() if not dst.exists() or dst.read_text() != want(src, f)]
bad += [str(dst.relative_to(V)) for src, dst in BINARY if not dst.exists() or dst.read_bytes() != src.read_bytes()]
print(f'{"checked" if CHECK_ONLY else "synced"} {len(TEXT) + len(BINARY)} files into {V.name}:', 'all match' if not bad else f'{len(bad)} differ')
for b in bad: print('  differs:', b)
sys.exit(1 if bad else 0)
