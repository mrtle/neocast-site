// neocast.us v4: the life map as glossy 3D candy (the V15 film's map, live in the page).
// The You orb at the centre, six pearl satellites (the groups) and gradient threads that stop short.
// The page owns layout and story: it tells the map where to sit on screen (lens shift), how big,
// and how far it has unravelled; the map reports where its satellites and anchors land on screen.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, SphereGeometry, MeshPhysicalMaterial,
  MeshBasicMaterial, Color, ACESFilmicToneMapping, SRGBColorSpace, PMREMGenerator, TubeGeometry,
  QuadraticBezierCurve3, Vector3, BufferAttribute, DirectionalLight, Sprite, SpriteMaterial, CanvasTexture
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const STOPS = ['#FD9013', '#FD3155', '#E409CF', '#4315FF'].map(c => new Color(c));
function gradAt(t) {
  t = Math.min(1, Math.max(0, t)) * 3; const i = Math.min(2, Math.floor(t));
  return STOPS[i].clone().lerp(STOPS[i + 1], t - i);
}
const clamp = v => Math.min(1, Math.max(0, v));
const ease = t => 1 - Math.pow(1 - clamp(t), 3);
const ramp = (v, a, b) => ease((v - a) / (b - a));

// groups on a tilted ring: angle (deg), y lift, size
const GROUPS = [
  { key: 'shows', a: 128, y: 0.62, s: 0.46 },
  { key: 'movies', a: 52, y: 0.66, s: 0.46 },
  { key: 'music', a: 4, y: 0.02, s: 0.4 },
  { key: 'places', a: -48, y: -0.58, s: 0.44 },
  { key: 'concerts', a: -132, y: -0.54, s: 0.42 },
  { key: 'games', a: 176, y: -0.02, s: 0.38 },
];
const RING = 2.55;

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
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  const key = new DirectionalLight(0xffffff, 1.5); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new DirectionalLight(0xffc7ec, 0.9); rim.position.set(4, -2, -3); scene.add(rim);

  const camera = new PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0, 12);

  const rig = new Group(); scene.add(rig);       // scale + float
  const world = new Group(); rig.add(world);     // rotation (sway + pointer)
  world.rotation.x = -0.16;

  // the You orb: vertex gradient pink (top-left) to violet (bottom-right), clearcoat
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
    sheen: 0.5, sheenColor: new Color('#ff9fe0'), sheenRoughness: 0.45, emissive: new Color('#b0108f'), emissiveIntensity: 0.3, envMapIntensity: 0.55,
  }));
  world.add(orb);

  // a soft magenta pool under the orb
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const g = gc.getContext('2d'), rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, 'rgba(228,9,207,0.30)'); rg.addColorStop(0.5, 'rgba(253,49,85,0.09)'); rg.addColorStop(1, 'rgba(253,49,85,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  const glow = new Sprite(new SpriteMaterial({ map: new CanvasTexture(gc), transparent: true, depthWrite: false }));
  glow.scale.set(4.6, 4.6, 1); glow.position.set(0, -0.6, -1.4); world.add(glow);

  // satellites: white pearls with a faint warm underside
  const satGeo = new SphereGeometry(1, 48, 32);
  const sp = satGeo.attributes.position, sc = new Float32Array(sp.count * 3);
  const w0 = new Color('#ffffff'), w1 = new Color('#ffcfe4');
  for (let i = 0; i < sp.count; i++) { const c = w0.clone().lerp(w1, Math.max(0, -sp.getY(i)) * 0.55); sc.set([c.r, c.g, c.b], i * 3); }
  satGeo.setAttribute('color', new BufferAttribute(sc, 3));
  const satMat = new MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1,
    sheen: 1, sheenColor: new Color('#ffd3ea'), sheenRoughness: 0.45, emissive: new Color('#fff1f7'), emissiveIntensity: 0.3, envMapIntensity: 1.35,
  });
  // portrait stages (phones) get the same ring squeezed sideways and stretched up and down
  const px = opts.portrait ? 0.56 : 1, py = opts.portrait ? 1.65 : 1;
  const sats = GROUPS.map(gr => {
    const m = new Mesh(satGeo, satMat), a = gr.a * Math.PI / 180;
    m.userData = { key: gr.key, s: gr.s, home: new Vector3(Math.cos(a) * RING * 1.12 * px, (gr.y * 1.75 + Math.sin(a) * 0.3) * py, Math.sin(a) * 1.4) };
    m.scale.setScalar(gr.s); world.add(m);
    return m;
  });
  const satBy = {}; sats.forEach(m => { satBy[m.userData.key] = m; });

  // threads, built once at home; grown with drawRange and scaled with the unravel
  const threadMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, toneMapped: false });
  const threads = sats.map(m => {
    const p = m.userData.home, dir = p.clone().normalize(), L = p.length();
    const a = dir.clone().multiplyScalar(1.1), b = dir.clone().multiplyScalar(L - m.userData.s - 0.14);
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new Vector3(0, 0.22, 0));
    const geo = new TubeGeometry(new QuadraticBezierCurve3(a, mid, b), 48, 0.017, 8, false);
    const n = geo.attributes.position.count, cc = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) { const c = gradAt(0.12 + (Math.floor(v / 9) / 48) * 0.62); cc.set([c.r, c.g, c.b], v * 3); }
    geo.setAttribute('color', new BufferAttribute(cc, 3));
    const t = new Mesh(geo, threadMat); t.frustumCulled = false; t.userData.count = geo.index.count; world.add(t);
    return t;
  });

  // anchors for leaves: id -> [satellite key or null, x, y, z]
  const anchors = opts.anchors || {};

  let W = 1, H = 1;
  const state = {
    open: opts.open == null ? 1 : opts.open, cx: 0.5, cy: 0.5, scale: 1, tcx: 0.5, tcy: 0.5, tscale: 1,
    px: 0, py: 0, tpx: 0, tpy: 0, still: !!opts.still, t0: performance.now(),
  };

  // pixel ratio adapts: if frames run slow on this device, it steps down (never below 1)
  let pr = 1, prCap = 2, slow = 0;
  function resize() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    pr = Math.min(W > 900 ? 1.75 : 2, prCap, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  const v3 = new Vector3();
  function project(p) {
    v3.copy(p); world.localToWorld(v3);
    const d = v3.distanceTo(camera.position); v3.project(camera);
    return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H, d };
  }

  function frame(now) {
    const t = (now - state.t0) / 1000;
    const k = state.still ? 1 : 0.08, f = state.still ? 1 : 0.16;
    state.cx += (state.tcx - state.cx) * f; state.cy += (state.tcy - state.cy) * f; state.scale += (state.tscale - state.scale) * f;
    state.px += (state.tpx - state.px) * k; state.py += (state.tpy - state.py) * k;
    // lens shift: put the world's centre at (cx, cy) of the stage without changing perspective
    camera.setViewOffset(W, H, W / 2 - state.cx * W, H / 2 - state.cy * H, W, H);
    rig.scale.setScalar(state.scale);
    rig.position.y = state.still ? 0 : Math.sin(t * 0.6) * 0.05;
    world.rotation.y = (state.still ? 0 : Math.sin(t * 0.22) * 0.14) + state.px * 0.3;
    world.rotation.x = -0.16 + state.py * 0.14;
    orb.rotation.y = t * 0.12;

    const o = state.open;
    sats.forEach((m, i) => {
      const ki = ramp(o, i * 0.07, 0.55 + i * 0.07), fk = 0.25 + 0.75 * ki;
      const bob = state.still ? 0 : Math.sin(t * 0.8 + i * 1.3) * 0.06;
      m.position.copy(m.userData.home).multiplyScalar(fk); m.position.y += bob;
      m.scale.setScalar(m.userData.s * Math.max(0.001, ki)); m.visible = ki > 0.01;
      const th = threads[i], grow = ramp(o, 0.25 + i * 0.06, 0.9 + i * 0.015);
      th.visible = grow > 0.01; th.scale.setScalar(fk); th.position.y = bob;
      th.geometry.setDrawRange(0, Math.floor(th.userData.count * grow / 3) * 3);
    });
    renderer.render(scene, camera);

    // where things landed on screen
    const you = project(new Vector3(0, 0, 0)), edge = project(new Vector3(1, 0, 0));
    const out = { you: { x: you.x, y: you.y, r: Math.hypot(edge.x - you.x, edge.y - you.y), d: you.d }, sats: {}, anchors: {}, t };
    sats.forEach(m => {
      const p = project(m.position), side = project(m.position.clone().add(new Vector3(m.scale.x, 0, 0)));
      const r = Math.hypot(side.x - p.x, side.y - p.y);
      const behind = p.d > you.d && Math.hypot(p.x - you.x, p.y - you.y) < out.you.r * 0.95;
      out.sats[m.userData.key] = { x: p.x, y: p.y, r, d: p.d, on: m.visible ? Math.min(1, m.scale.x / m.userData.s) : 0, behind };
    });
    Object.keys(anchors).forEach(id => {
      const a = anchors[id], base = a[0] ? satBy[a[0]].position : new Vector3();
      const p = project(base.clone().add(new Vector3(a[1], a[2], a[3])));
      out.anchors[id] = { x: p.x, y: p.y };
    });
    if (opts.onFrame) opts.onFrame(out);
  }

  let raf = 0, running = false, visible = true, prev = 0;
  const loop = now => {
    const t0 = performance.now(); frame(now); const cost = performance.now() - t0;
    slow = cost > 22 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 12 && pr > 1) { prCap = Math.max(1, pr - 0.25); slow = 0; resize(); }
    // a device that still can't keep up gets every other frame
    if (running) raf = requestAnimationFrame(cost > 40 && prev > 40 ? n => { raf = requestAnimationFrame(loop); } : loop);
    prev = cost;
  };
  function start() { if (!running && visible && !state.still) { running = true; raf = requestAnimationFrame(loop); } }
  function stop() { running = false; cancelAnimationFrame(raf); }
  const draw = () => { if (!running) frame(performance.now()); };

  resize();
  addEventListener('resize', () => { resize(); draw(); });
  if (!state.still) {
    addEventListener('pointermove', e => { state.tpx = e.clientX / innerWidth - 0.5; state.tpy = e.clientY / innerHeight - 0.5; }, { passive: true });
    new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (visible) start(); else stop(); })).observe(host);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  }
  draw();
  start();

  return {
    // layout: where the world's centre sits (fractions of the stage) and how big it is
    place(cx, cy, scale, now) {
      state.tcx = cx; state.tcy = cy; state.tscale = scale;
      if (now || state.still) { state.cx = cx; state.cy = cy; state.scale = scale; }
      draw();
    },
    set open(v) { state.open = v; draw(); },
    get open() { return state.open; },
    resize() { resize(); draw(); },
    draw,
  };
}
