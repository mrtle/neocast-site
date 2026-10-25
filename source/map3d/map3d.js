// neocast.us v5: "Your Tastebud." The life map in 3D: the You orb, nine groups and the apps where
// what you love lives, as official App Store icons on glossy tiles. Scrolling flies the camera out to
// the full map, around it and back home. The page owns copy and layout; the map reports where its
// orb and groups land on screen so the page can pin labels to them.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Object3D, SphereGeometry, MeshPhysicalMaterial,
  MeshBasicMaterial, Color, ACESFilmicToneMapping, SRGBColorSpace, PMREMGenerator, TubeGeometry,
  QuadraticBezierCurve3, Vector3, Quaternion, Matrix4, BufferAttribute, DirectionalLight, Sprite, SpriteMaterial,
  CanvasTexture, TextureLoader, Shape, ShapeGeometry, ExtrudeGeometry, Fog, LinearMipmapLinearFilter, LinearFilter,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const STOPS = ['#FD9013', '#FD3155', '#E409CF', '#4315FF'].map(c => new Color(c));
function gradAt(t) {
  t = Math.min(1, Math.max(0, t)) * 3; const i = Math.min(2, Math.floor(t));
  return STOPS[i].clone().lerp(STOPS[i + 1], t - i);
}
const clamp01 = v => Math.min(1, Math.max(0, v));
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const backOut = t => { t = clamp01(t); const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const rad = d => d * Math.PI / 180;

// Groups around You. a: angle (deg), R: distance, z: depth, fan: where its apps sit around it (deg).
// The first five are the memo's and fill the welcome frame; the outer four appear as you scroll.
export const GROUPS = [
  { k: 'movies', a: 24, R: 4.05, z: 0.35, fan: [-52, 92], inner: true },
  { k: 'events', a: -36, R: 4.1, z: -0.3, fan: [-128, 24], inner: true, tall: [-30, 4.4] },
  { k: 'sports', a: -113, R: 2.75, z: 0.45, fan: [-200, -30], inner: true, tall: [-125, 3.0] },
  { k: 'music', a: 191, R: 4.1, z: -0.15, fan: [118, 258], inner: true },
  { k: 'games', a: 147, R: 4.1, z: 0.2, fan: [92, 218], inner: true },
  { k: 'shows', a: 64, R: 7.2, z: -1.1, fan: [-14, 142] },
  { k: 'creators', a: 114, R: 7.2, z: -0.8, fan: [40, 186] },
  { k: 'podcasts', a: 206, R: 7.5, z: -1.2, fan: [140, 290] },
  { k: 'books', a: 292, R: 7.1, z: -0.9, fan: [206, 364] },
];

// The icon atlas: 8 x 8 cells of 256 px, icon in the inner 244 px, in this order.
export const APPS = [
  ['netflix', 'movies'], ['disneyplus', 'movies'], ['appletv', 'movies'], ['primevideo', 'movies'], ['letterboxd', 'movies'], ['amc', 'movies'], ['fandango', 'movies'],
  ['hbomax', 'shows'], ['hulu', 'shows'], ['peacock', 'shows'], ['paramountplus', 'shows'], ['crunchyroll', 'shows'], ['tubi', 'shows'],
  ['youtube', 'music'], ['spotify', 'music'], ['applemusic', 'music'], ['soundcloud', 'music'], ['tidal', 'music'], ['shazam', 'music'], ['amazonmusic', 'music'],
  ['riot', 'games'], ['ea', 'games'], ['playstation', 'games'], ['steam', 'games'], ['epic', 'games'], ['xbox', 'games'], ['nintendo', 'games'], ['roblox', 'games'], ['discord', 'games'],
  ['nba', 'sports'], ['nfl', 'sports'], ['espn', 'sports'], ['seatgeek', 'sports'], ['mlb', 'sports'], ['f1tv', 'sports'], ['ufc', 'sports'],
  ['luma', 'events'], ['partiful', 'events'], ['eventbrite', 'events'], ['ticketmaster', 'events'], ['dice', 'events'], ['stubhub', 'events'], ['bandsintown', 'events'],
  ['applepodcasts', 'podcasts'], ['pocketcasts', 'podcasts'], ['overcast', 'podcasts'], ['iheart', 'podcasts'],
  ['goodreads', 'books'], ['kindle', 'books'], ['audible', 'books'], ['libby', 'books'], ['applebooks', 'books'],
  ['tiktok', 'creators'], ['twitch', 'creators'], ['instagram', 'creators'], ['patreon', 'creators'],
];
const CELL = 256 / 2048, INNER = 244 / 2048, GUT = 6 / 2048;

// Camera journey, keyed by scroll progress. D: distance, yaw/pitch: degrees around the target,
// tilt/spin: the map's own lean and turn (radians), tx/ty: target on the map, cx/cy: where the target sits on screen.
const KEYS_WIDE = [
  { p: 0.00, D: 15.2, yaw: 0, pitch: 0, tilt: 0, spin: 0, tx: 0, ty: 0, cx: 0.5, cy: 0.6 },
  { p: 0.14, D: 17.5, yaw: -8, pitch: 4, tilt: -0.1, spin: 0.02, tx: 0, ty: 0, cx: 0.5, cy: 0.56 },
  { p: 0.32, D: 30, yaw: -14, pitch: 9, tilt: -0.38, spin: 0.06, tx: 0, ty: 0.1, cx: 0.5, cy: 0.53 },
  { p: 0.52, D: 10.5, yaw: -40, pitch: 10, tilt: -0.3, spin: 0.12, tx: -3.6, ty: 1.6, cx: 0.5, cy: 0.5 },
  { p: 0.70, D: 11, yaw: 38, pitch: -8, tilt: -0.15, spin: 0.2, tx: 3.9, ty: 2.4, cx: 0.5, cy: 0.5 },
  { p: 0.86, D: 19, yaw: 12, pitch: 3, tilt: -0.12, spin: 0.08, tx: 0.4, ty: -0.2, cx: 0.5, cy: 0.56 },
  { p: 1.00, D: 15.2, yaw: 0, pitch: 0, tilt: 0, spin: 0, tx: 0, ty: 0, cx: 0.5, cy: 0.6 },
];
const KEYS_TALL = [
  { p: 0.00, D: 27, yaw: 0, pitch: 0, tilt: 0, spin: 0, tx: 0, ty: 0, cx: 0.5, cy: 0.66 },
  { p: 0.14, D: 31, yaw: -6, pitch: 4, tilt: -0.1, spin: 0.02, tx: 0, ty: 0, cx: 0.5, cy: 0.6 },
  { p: 0.32, D: 44, yaw: -10, pitch: 8, tilt: -0.4, spin: 0.05, tx: 0, ty: 0.3, cx: 0.5, cy: 0.5 },
  { p: 0.52, D: 17, yaw: -32, pitch: 10, tilt: -0.3, spin: 0.1, tx: -2.1, ty: 2.6, cx: 0.5, cy: 0.5 },
  { p: 0.70, D: 17, yaw: 30, pitch: -6, tilt: -0.15, spin: 0.16, tx: 2.2, ty: 3.4, cx: 0.5, cy: 0.5 },
  { p: 0.86, D: 32, yaw: 10, pitch: 3, tilt: -0.12, spin: 0.06, tx: 0.2, ty: -0.3, cx: 0.5, cy: 0.6 },
  { p: 1.00, D: 27, yaw: 0, pitch: 0, tilt: 0, spin: 0, tx: 0, ty: 0, cx: 0.5, cy: 0.66 },
];
const PARAMS = ['D', 'yaw', 'pitch', 'tilt', 'spin', 'tx', 'ty', 'cx', 'cy'];
function sampleKeys(keys, p, out) {
  p = clamp01(p);
  let i = 0; while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = (p - k1.p) / (k2.p - k1.p || 1);
  const t2 = t * t, t3 = t2 * t;
  PARAMS.forEach(n => {   // Catmull-Rom through the keys
    const a = k0[n], b = k1[n], c = k2[n], d = k3[n];
    out[n] = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  });
  return out;
}

// Lay the map out in the plane: groups by hand, apps fanned around them, then relaxed so nothing touches
// and nothing sits under the headline in the welcome frame.
function layout(tall) {
  const sx = tall ? 0.6 : 1, sy = tall ? 1.22 : 1, tile = tall ? 0.7 : 0.62, MIN = tile + (tall ? 0.24 : 0.22);
  const groups = GROUPS.map(g => { const [a, R] = tall && g.tall ? g.tall : [g.a, g.R]; return { ...g, x: Math.cos(rad(a)) * R * sx, y: Math.sin(rad(a)) * R * sy }; });
  // where the welcome frame's copy sits, in map units around You (headline band, then the button and the cue)
  const zones = tall ? [{ x0: -4, x1: 4, y0: 3.3, y1: 30 }, { x0: -1.9, x1: 1.9, y0: 2.2, y1: 3.3 }]
    : [{ x0: -4.55, x1: 4.55, y0: 2.45, y1: 30 }, { x0: -1.8, x1: 1.8, y0: 1.15, y1: 2.45 }];
  const apps = [];
  groups.forEach(g => {
    const list = APPS.map((a, idx) => ({ k: a[0], g: a[1], idx })).filter(a => a.g === g.k), n = list.length;
    list.forEach((a, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1), ang = rad(g.fan[0] + (g.fan[1] - g.fan[0]) * t);
      const r = (tall ? 1.65 : 1.55) + (n > 5 && i % 2 ? 0.48 : 0);
      const tx = g.x + Math.cos(ang) * r, ty = g.y + Math.sin(ang) * r;
      apps.push({ ...a, group: g, tx, ty, x: tx, y: ty, i });
    });
  });
  for (let it = 0; it < 320; it++) {
    const k = it < 200 ? 0.05 : 0.02;
    apps.forEach(a => { a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k; });
    for (let i = 0; i < apps.length; i++) for (let j = i + 1; j < apps.length; j++) {
      const a = apps[i], b = apps[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-3;
      if (d < MIN) { const m = (MIN - d) / 2 / d; a.x -= dx * m; a.y -= dy * m; b.x += dx * m; b.y += dy * m; }
    }
    apps.forEach(a => {
      const push = (cx, cy, r) => { const dx = a.x - cx, dy = a.y - cy, d = Math.hypot(dx, dy) || 1e-3; if (d < r) { a.x = cx + dx / d * r; a.y = cy + dy / d * r; } };
      push(0, 0, 1.75);
      groups.forEach(g => { push(g.x, g.y, 0.98); push(g.x, g.y - 0.8, 0.82); });
      if (a.group.inner) zones.forEach(z => {
        const h = tile / 2 + 0.06;
        if (a.x > z.x0 - h && a.x < z.x1 + h && a.y > z.y0 - h && a.y < z.y1 + h) {
          const out = [a.x - (z.x0 - h), (z.x1 + h) - a.x, a.y - (z.y0 - h), (z.y1 + h) - a.y];
          const m = Math.min(...out);
          if (m === out[0]) a.x = z.x0 - h; else if (m === out[1]) a.x = z.x1 + h; else if (m === out[2]) a.y = z.y0 - h; else a.y = z.y1 + h;
        }
      });
    });
  }
  apps.forEach(a => { a.z = a.group.z + (((a.idx * 37) % 7) - 3) * 0.1; });
  return { groups, apps, tile };
}

function roundedRect(w, h, r) {
  const s = new Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function mount(host, opts) {
  opts = opts || {};
  const canvas = document.createElement('canvas');
  canvas.className = 'map3d';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const paper = new Color('#F6F3F0');
  scene.fog = new Fog(paper, 20, 60);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  const key = new DirectionalLight(0xffffff, 1.5); key.position.set(-3, 4, 5); scene.add(key);
  const rimL = new DirectionalLight(0xffc7ec, 0.9); rimL.position.set(4, -2, -3); scene.add(rimL);

  const camera = new PerspectiveCamera(32, 1, 1, 160);
  const world = new Group(); scene.add(world);

  // the You orb (as v4): vertex gradient, clearcoat
  const orbGeo = new SphereGeometry(1, 72, 48);
  const op = orbGeo.attributes.position, oc = new Float32Array(op.count * 3);
  const c0 = new Color('#FF7FD0'), c1 = new Color('#EE2FC2'), c2 = new Color('#C70FB8'), c3 = new Color('#7A16D0');
  for (let i = 0; i < op.count; i++) {
    const t = (-op.getX(i) * 0.55 - op.getY(i) * 0.8 + 1.35) / 2.7;
    const c = t < 0.4 ? c0.clone().lerp(c1, t / 0.4) : t < 0.72 ? c1.clone().lerp(c2, (t - 0.4) / 0.32) : c2.clone().lerp(c3, (t - 0.72) / 0.28);
    oc.set([c.r, c.g, c.b], i * 3);
  }
  orbGeo.setAttribute('color', new BufferAttribute(oc, 3));
  const orb = new Mesh(orbGeo, new MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.24, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12,
    sheen: 0.5, sheenColor: new Color('#ff9fe0'), sheenRoughness: 0.45, emissive: new Color('#b0108f'), emissiveIntensity: 0.3, envMapIntensity: 0.55, fog: false,
  }));
  world.add(orb);
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const g2 = gc.getContext('2d'), rg = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, 'rgba(228,9,207,0.30)'); rg.addColorStop(0.5, 'rgba(253,49,85,0.09)'); rg.addColorStop(1, 'rgba(253,49,85,0)');
  g2.fillStyle = rg; g2.fillRect(0, 0, 256, 256);
  const glow = new Sprite(new SpriteMaterial({ map: new CanvasTexture(gc), transparent: true, depthWrite: false, fog: false }));
  glow.scale.set(5, 5, 1); glow.position.set(0, -0.6, -1.4); world.add(glow);

  // group pearls
  const pearlGeo = new SphereGeometry(1, 48, 32);
  const sp = pearlGeo.attributes.position, sc = new Float32Array(sp.count * 3);
  const w0 = new Color('#ffffff'), w1 = new Color('#ffcfe4');
  for (let i = 0; i < sp.count; i++) { const c = w0.clone().lerp(w1, Math.max(0, -sp.getY(i)) * 0.55); sc.set([c.r, c.g, c.b], i * 3); }
  pearlGeo.setAttribute('color', new BufferAttribute(sc, 3));
  const pearlMat = new MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1,
    sheen: 1, sheenColor: new Color('#ffd3ea'), sheenRoughness: 0.45, emissive: new Color('#fff1f7'), emissiveIntensity: 0.3, envMapIntensity: 1.35,
  });

  // tiles: a glossy white slab with the official icon on its face (unlit, so the artwork keeps its colours)
  const atlas = new TextureLoader().load(opts.atlas, () => draw());
  atlas.colorSpace = SRGBColorSpace;
  atlas.minFilter = LinearMipmapLinearFilter; atlas.magFilter = LinearFilter;
  atlas.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const faceMat = new MeshBasicMaterial({ map: atlas, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const bodyMat = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.1 });
  const threadMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, toneMapped: false });
  const twigMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, toneMapped: false });

  let L = null, groups = [], tiles = [], threads = [], twigs = [], tall = !!opts.tall;
  const built = new Group(); world.add(built);
  function tubeColored(curve, seg, radius, cFrom, cTo, wash) {
    const geo = new TubeGeometry(curve, seg, radius, 6, false);
    const n = geo.attributes.position.count, cc = new Float32Array(n * 3), white = new Color('#ffffff');
    for (let v = 0; v < n; v++) { const c = gradAt(cFrom + (Math.floor(v / 7) / seg) * (cTo - cFrom)); if (wash) c.lerp(white, wash); cc.set([c.r, c.g, c.b], v * 3); }
    geo.setAttribute('color', new BufferAttribute(cc, 3));
    return geo;
  }
  function build() {
    built.clear();
    [...threads, ...twigs].forEach(m => m.geometry.dispose()); tiles.forEach(t => t.face.geometry.dispose());
    L = layout(tall);
    const T = L.tile, body = new ExtrudeGeometry(roundedRect(T, T, T * 0.225), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.028, bevelSegments: 3, curveSegments: 8 });
    body.translate(0, 0, -0.06);
    groups = L.groups.map((g, gi) => {
      const m = new Mesh(pearlGeo, pearlMat); m.position.set(g.x, g.y, g.z); m.scale.setScalar(g.inner ? 0.44 : 0.42);
      m.userData = { g, gi, s: m.scale.x }; built.add(m);
      return m;
    });
    threads = groups.map(m => {
      const g = m.userData.g, p = m.position, dir = p.clone().normalize(), len = p.length();
      const a = dir.clone().multiplyScalar(1.1), b = dir.clone().multiplyScalar(len - m.userData.s - 0.14);
      const mid = a.clone().add(b).multiplyScalar(0.5).add(new Vector3(-dir.y * 0.25, dir.x * 0.25, 0.4));
      const t = new Mesh(tubeColored(new QuadraticBezierCurve3(a, mid, b), 40, 0.024, 0.1, 0.75, 0), threadMat);
      t.frustumCulled = false; t.userData = { count: t.geometry.index.count, g }; built.add(t);
      return t;
    });
    tiles = []; twigs = [];
    L.apps.forEach(a => {
      const holder = new Object3D(); holder.position.set(a.x, a.y, a.z);
      const tile = new Object3D(); holder.add(tile);
      tile.add(new Mesh(body, bodyMat));
      const face = new ShapeGeometry(roundedRect(T, T, T * 0.225), 8);
      const uv = face.attributes.uv, pos = face.attributes.position;
      const col = a.idx % 8, row = Math.floor(a.idx / 8);
      const u0 = col * CELL + GUT, v0 = 1 - (row * CELL + GUT + INNER);
      for (let v = 0; v < uv.count; v++) uv.setXY(v, u0 + (pos.getX(v) / T + 0.5) * INNER, v0 + (pos.getY(v) / T + 0.5) * INNER);
      const fm = new Mesh(face, faceMat); fm.position.z = 0.032; tile.add(fm);
      built.add(holder);
      // a personal lean, so the field never looks gridded
      const lean = new Quaternion().setFromAxisAngle(new Vector3(Math.sin(a.idx * 1.7), Math.cos(a.idx * 2.3), 0).normalize(), rad(6 + (a.idx % 5) * 1.6));
      tiles.push({ holder, tile, face: fm, a, lean, q: new Quaternion(), seeded: false });
      // twig from its group's pearl to the tile
      const gp = groups.find(m => m.userData.g.k === a.g).position, tp = holder.position;
      const dir = tp.clone().sub(gp), len = dir.length(); dir.normalize();
      const s = gp.clone().add(dir.clone().multiplyScalar(0.5)), e = gp.clone().add(dir.clone().multiplyScalar(Math.max(0.6, len - T * 0.62)));
      const mid = s.clone().add(e).multiplyScalar(0.5).add(new Vector3(0, 0, 0.15));
      const tw = new Mesh(tubeColored(new QuadraticBezierCurve3(s, mid, e), 16, 0.011, 0.3, 0.7, 0.45), twigMat);
      tw.frustumCulled = false; tw.userData = { count: tw.geometry.index.count, a }; built.add(tw); twigs.push(tw);
    });
  }
  build();

  let W = 1, H = 1;
  const state = {
    p: opts.p || 0, sp: opts.p || 0, open: opts.still ? 1 : (opts.open == null ? 1 : opts.open),
    px: 0, py: 0, tpx: 0, tpy: 0, still: !!opts.still, t0: performance.now(), cam: {},
  };
  let pr = 1, prCap = 2, slow = 0;
  function resize() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    pr = Math.min(W > 900 ? 1.75 : 2, prCap, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    const nowTall = W / H < 0.9;
    if (nowTall !== tall) { tall = nowTall; build(); }
  }

  const v3 = new Vector3(), m4 = new Matrix4(), qW = new Quaternion(), qWinv = new Quaternion(), qFace = new Quaternion(), qT = new Quaternion(), tmpV = new Vector3(), UP = new Vector3(0, 1, 0);
  function project(p, local) {
    v3.copy(p); if (local !== false) local.localToWorld(v3);
    const d = v3.distanceTo(camera.position); v3.project(camera);
    return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H, d };
  }

  function placeCamera(c) {
    // aspect: keys are drawn for 16:10 (wide) and 9:19.5 (tall); in between, pull back so the sides still fit
    const ar = W / H, fit = tall ? Math.pow(0.46 / Math.min(0.9, ar), 0.55) : Math.max(1, Math.pow(1.6 / ar, 0.75));
    const D = c.D * fit;
    world.rotation.set(c.tilt + state.py * 0.08, state.px * 0.12, c.spin);
    world.updateMatrixWorld(true);
    const T = new Vector3(c.tx, c.ty, 0).applyMatrix4(world.matrixWorld);
    const yaw = rad(c.yaw), pitch = rad(c.pitch);
    camera.position.set(T.x + D * Math.sin(yaw) * Math.cos(pitch), T.y + D * Math.sin(pitch), T.z + D * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(T);
    camera.setViewOffset(W, H, W / 2 - c.cx * W, H / 2 - c.cy * H, W, H);
    camera.updateMatrixWorld(true);
    scene.fog.near = D * 1.05; scene.fog.far = D * 3.4;
  }

  function frame(now) {
    const t = (now - state.t0) / 1000, still = state.still;
    state.sp += (state.p - state.sp) * (still ? 1 : 0.14);
    if (Math.abs(state.p - state.sp) < 1e-4) state.sp = state.p;
    state.px += (state.tpx - state.px) * (still ? 1 : 0.06); state.py += (state.tpy - state.py) * (still ? 1 : 0.06);
    const c = sampleKeys(tall ? KEYS_TALL : KEYS_WIDE, state.sp, state.cam);
    if (state.pose) Object.assign(c, state.pose);   // a fixed view, for the poster and share images
    placeCamera(c);
    orb.rotation.y = t * 0.12;

    // what is open: the inner five unravel on load, the outer four as you scroll out
    const open = state.open, outer = clamp01((state.sp - 0.08) / 0.24) * (1 - clamp01((state.sp - 0.87) / 0.1));   // the outer four fold back as you come home
    groups.forEach((m, gi) => {
      const g = m.userData.g, oi = g.inner ? clamp01((open - gi * 0.06) / 0.5) : clamp01((outer - (gi - 5) * 0.12) / 0.6);
      m.userData.on = oi;
      const bob = still ? 0 : Math.sin(t * 0.8 + gi * 1.3) * 0.06;
      m.position.set(g.x, g.y + bob, g.z);
      m.scale.setScalar(m.userData.s * Math.max(0.001, backOut(oi))); m.visible = oi > 0.01;
      const th = threads[gi], grow = clamp01(oi * 1.6);
      th.visible = grow > 0.01; th.geometry.setDrawRange(0, Math.floor(th.userData.count * easeOut(grow) / 3) * 3);
      th.position.y = bob * 0.5;
    });
    world.updateMatrixWorld(true);
    world.getWorldQuaternion(qW); qWinv.copy(qW).invert();
    const lag = still ? 1 : 0.09;
    tiles.forEach((T, n) => {
      const a = T.a, g = groups.find(m => m.userData.g.k === a.g), gon = g.userData.on;
      const oi = clamp01((gon - 0.35 - a.i * 0.07) / 0.45);
      const bob = still ? 0 : Math.sin(t * 0.9 + n * 0.7) * 0.05;
      T.holder.position.set(a.x, a.y + bob, a.z);
      T.holder.visible = oi > 0.01; T.holder.scale.setScalar(Math.max(0.001, backOut(oi)));
      // turn toward the camera (about 70%), with a lag: as the camera moves, the field of icons follows it
      T.holder.getWorldPosition(tmpV);
      m4.lookAt(camera.position, tmpV, UP); qFace.setFromRotationMatrix(m4);
      qT.copy(qW).slerp(qFace, 0.7); qT.premultiply(qWinv).multiply(T.lean);
      if (!T.seeded || still) { T.q.copy(qT); T.seeded = true; } else T.q.slerp(qT, lag);
      T.tile.quaternion.copy(T.q);
      const tw = twigs[n], grow = clamp01((oi - 0.1) / 0.6);
      tw.visible = grow > 0.01; tw.geometry.setDrawRange(0, Math.floor(tw.userData.count * easeOut(grow) / 3) * 3);
    });
    renderer.render(scene, camera);

    // where the orb and the groups landed on screen
    const you = project(new Vector3(0, 0, 0), world), edge = project(new Vector3(1, 0, 0), world);
    const out = { you: { x: you.x, y: you.y, r: Math.hypot(edge.x - you.x, edge.y - you.y), d: you.d }, groups: {}, p: state.sp, t };
    groups.forEach(m => {
      const p = project(m.position, built), side = project(m.position.clone().add(new Vector3(m.scale.x, 0, 0)), built);
      const r = Math.hypot(side.x - p.x, side.y - p.y);
      const behind = p.d > you.d && Math.hypot(p.x - you.x, p.y - you.y) < out.you.r * 1.05;
      const fog = clamp01((scene.fog.far - p.d) / (scene.fog.far - scene.fog.near));
      out.groups[m.userData.g.k] = { x: p.x, y: p.y, r, d: p.d, on: m.userData.on || 0, behind, fog };
    });
    if (opts.onFrame) opts.onFrame(out);
  }

  let raf = 0, running = false, visible = true, prev = 0;
  const loop = now => {
    const t0 = performance.now(); frame(now); const cost = performance.now() - t0;
    slow = cost > 22 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 12 && pr > 1) { prCap = Math.max(1, pr - 0.25); slow = 0; resize(); }
    if (running) raf = requestAnimationFrame(cost > 40 && prev > 40 ? () => { raf = requestAnimationFrame(loop); } : loop);
    prev = cost;
  };
  function start() { if (!running && visible && !state.still) { running = true; raf = requestAnimationFrame(loop); } }
  function halt() { running = false; cancelAnimationFrame(raf); }
  function draw() { if (!running) frame(performance.now()); }

  resize();
  addEventListener('resize', () => { resize(); draw(); });
  if (!state.still) {
    if (matchMedia('(hover: hover) and (pointer: fine)').matches)
      addEventListener('pointermove', e => { state.tpx = e.clientX / innerWidth - 0.5; state.tpy = e.clientY / innerHeight - 0.5; }, { passive: true });
    new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (visible) start(); else halt(); })).observe(host);
    document.addEventListener('visibilitychange', () => { if (document.hidden) halt(); else start(); });
  }
  draw();
  start();

  return {
    set progress(v) { state.p = clamp01(v); if (state.still) state.sp = state.p; draw(); },
    get progress() { return state.p; },
    set open(v) { state.open = v; draw(); },
    set pose(v) { state.pose = v; draw(); },
    get open() { return state.open; },
    resize() { resize(); draw(); },
    draw,
    // screen boxes of every visible tile, for layout checks
    rects() {
      const T = L.tile / 2, out = [];
      tiles.forEach(x => {
        if (!x.holder.visible) return;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        [[-T, -T], [T, -T], [T, T], [-T, T]].forEach(([a, b]) => {
          const p = project(new Vector3(a, b, 0.03), x.tile);
          x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
        });
        out.push({ k: x.a.k, g: x.a.g, x0, y0, x1, y1 });
      });
      return out;
    },
  };
}
