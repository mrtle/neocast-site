// neocast.us v6–v8: "Your Tastebud." as a solar system. The Tastebud (the You orb) is the sun; forty categories (v8)
// orbit it on three rings. Every category is a glossy icon sphere (a music note for Music, a roller coaster
// for Theme parks) with ten octopus legs, and at the tip of each leg the app's official App Store icon on a
// glossy sphere of its own. Scrolling: the welcome frame (the system sits low), the pull-up, the whole system
// filling the screen, then an orbit that stops at every category in turn, and home.
// A post pass adds the black-hole lens that clears the space under the page's copy, an RGB glitch, and a
// lens flare that follows the cursor. The page owns copy and layout; this module reports screen positions.
import {
  WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Group, Mesh, InstancedMesh, Object3D,
  SphereGeometry, PlaneGeometry, MeshPhysicalMaterial, MeshBasicMaterial, ShaderMaterial, LineBasicMaterial,
  Color, SRGBColorSpace, NoToneMapping, PMREMGenerator, Vector2, Vector3, Vector4, Quaternion, Matrix4,
  BufferGeometry, BufferAttribute, InstancedBufferAttribute, DirectionalLight, Sprite, SpriteMaterial,
  CanvasTexture, TextureLoader, DataTexture, Fog, LineLoop, LinearMipmapLinearFilter, LinearFilter,
  WebGLRenderTarget, HalfFloatType, CubicBezierCurve3, QuadraticBezierCurve3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const STOPS = ['#FD9013', '#FD3155', '#E409CF', '#4315FF'].map(c => new Color(c));
const gradAt = t => { t = Math.min(1, Math.max(0, t)) * 3; const i = Math.min(2, Math.floor(t)); return STOPS[i].clone().lerp(STOPS[i + 1], t - i); };
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = t => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const backOut = t => { t = clamp01(t); const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const rad = d => d * Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };

export const RINGS = [{ r: 11.5, n: 8 }, { r: 21, n: 14 }, { r: 31, n: 18 }];   // v8: 40 categories
const SUN = 3.2, CAT_R = 0.86, APP_R = 0.47;
// journey phases (positions along the camera path): welcome, pull-up, whole system, the tour, home
export const PHASE = { pull: 0.004, full: 0.034, hold: 0.066, tour: 0.08, end: 0.966 };
// v7: the page moves in steps, one scroll = one move. Steps: welcome, map pulled up, the whole system,
// each category, home. stepP(k, n) is where step k sits on the camera path (n = number of categories).
export const stopP = (i, n) => PHASE.tour + i / Math.max(1, n - 1) * (PHASE.end - PHASE.tour);
export function stepP(k, n) {
  if (k <= 0) return 0;
  if (k === 1) return PHASE.full;
  if (k === 2) return PHASE.hold;
  if (k >= n + 3) return 1;
  return stopP(k - 3, n);
}

// three's ACES (fixed exposure), injected into lit materials, so it can be skipped where colour must stay exact
const ACES = `
vec3 ncRRT( vec3 v ) { vec3 a = v * ( v + 0.0245786 ) - 0.000090537; vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081; return a / b; }
vec3 ncACES( vec3 color ) {
  const mat3 I = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
  const mat3 O = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
  color *= 1.05 / 0.6; color = I * color; color = ncRRT( color ); color = O * color; return clamp( color, 0.0, 1.0 );
}`;
// focus: grey and fade toward paper whatever isn't the point right now
const FOCUS_FRAG = `
  { float g = clamp( 1.0 - vFocus, 0.0, 1.0 ); float l = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( l ), g * 0.95 ); gl_FragColor.rgb = mix( gl_FragColor.rgb, uPaper, g * 0.76 ); }`;
// the decal: an atlas cell projected onto the sphere's front, so it reads flat and true when the sphere faces you
const DECAL = `
vec4 ncDecal() {
  vec3 n = normalize( vObjN );
  if ( n.z <= 0.0 ) return vec4( 0.0 );
  vec2 q = n.xy / uHalf; vec2 a = abs( q ); float r = uCorner;
  float d = length( max( a - ( 1.0 - r ), 0.0 ) ) + min( max( a.x, a.y ) - ( 1.0 - r ), 0.0 ) - r;
  float m = 1.0 - smoothstep( -0.018, 0.018, d );
  vec2 uv = clamp( q * 0.5 + 0.5, 0.0, 1.0 );
  float inner = uGrid.x - 2.0 * uGrid.y;
  vec2 auv = vec2( vCell.x * uGrid.x + uGrid.y + uv.x * inner, 1.0 - ( vCell.y * uGrid.x + uGrid.y + ( 1.0 - uv.y ) * inner ) );
  return vec4( texture2D( uAtlas, auv ).rgb, m * smoothstep( 0.02, 0.16, n.z ) );
}`;
function sphereMat(paper, cfg) {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, roughness: cfg.rough, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
    sheen: cfg.sheen || 0, sheenColor: new Color('#ffd3ea'), sheenRoughness: 0.45, envMapIntensity: cfg.env });
  m.userData.u = { uAtlas: { value: cfg.atlas }, uPaper: { value: paper }, uHalf: { value: cfg.half }, uCorner: { value: cfg.corner }, uGrid: { value: new Vector2(cfg.cellN || 0.125, cfg.gutN || 6 / 2048) } };
  // three caches programs by the text of onBeforeCompile: without its own key every sphere set (and every tube)
  // would share the first compiled program and its baked-in values
  m.customProgramCacheKey = () => 'nc-sphere-' + cfg.glowEm.toFixed(3) + (cfg.aces ? '-aces' : '');
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, m.userData.u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell; attribute vec3 aColor; attribute float aFocus;\nvarying vec2 vCell; varying vec3 vBase; varying float vFocus; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCell = aCell; vBase = aColor; vFocus = aFocus; vObjN = normal;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas; uniform vec3 uPaper; uniform float uHalf; uniform float uCorner; uniform vec2 uGrid;\nvarying vec2 vCell; varying vec3 vBase; varying float vFocus; varying vec3 vObjN;' + ACES + DECAL)
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec4 ncD = ncDecal(); diffuseColor.rgb = mix( vBase, ncD.rgb, ncD.a );')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${cfg.glowEm.toFixed(3)};`)
      .replace('#include <tonemapping_fragment>', cfg.aces ? 'gl_FragColor.rgb = ncACES( gl_FragColor.rgb );' : 'gl_FragColor.rgb = min( gl_FragColor.rgb, vec3( 1.0 ) );')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>' + FOCUS_FRAG);
  };
  return m;
}

// a tapered tube along a curve, with per-vertex attributes for the shader (category, position along, wiggle)
function taperTube(curve, seg, r0, r1, extra) {
  const radial = 6, pts = curve.getSpacedPoints(seg), fr = curve.computeFrenetFrames(seg, false);
  const pos = [], idx = [], t = [];
  for (let i = 0; i <= seg; i++) {
    const r = lerp(r0, r1, i / seg), p = pts[i], N = fr.normals[i], B = fr.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
      pos.push(p.x + r * (cx * N.x + cy * B.x), p.y + r * (cx * N.y + cy * B.y), p.z + r * (cx * N.z + cy * B.z));
      t.push(i / seg);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { pos, idx, t, n: (seg + 1) * (radial + 1), extra };
}
function mergeTubes(list, colorFrom, colorTo, wash) {
  let nv = 0, ni = 0; list.forEach(x => { nv += x.n; ni += x.idx.length; });
  const P = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), T = new Float32Array(nv), K = new Float32Array(nv), Wg = new Float32Array(nv * 3), Ph = new Float32Array(nv);
  const I = new Uint32Array(ni), white = new Color('#ffffff');
  let v = 0, k = 0;
  list.forEach(x => {
    for (let i = 0; i < x.n; i++) {
      P[(v + i) * 3] = x.pos[i * 3]; P[(v + i) * 3 + 1] = x.pos[i * 3 + 1]; P[(v + i) * 3 + 2] = x.pos[i * 3 + 2];
      const c = gradAt(colorFrom + x.t[i] * (colorTo - colorFrom)); if (wash) c.lerp(white, wash);
      Cc[(v + i) * 3] = c.r; Cc[(v + i) * 3 + 1] = c.g; Cc[(v + i) * 3 + 2] = c.b;
      T[v + i] = x.t[i]; K[v + i] = x.extra.cat;
      Wg[(v + i) * 3] = x.extra.wig.x; Wg[(v + i) * 3 + 1] = x.extra.wig.y; Wg[(v + i) * 3 + 2] = x.extra.wig.z; Ph[v + i] = x.extra.phase;
    }
    x.idx.forEach(j => { I[k++] = j + v; });
    v += x.n;
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(P, 3)); g.setAttribute('color', new BufferAttribute(Cc, 3));
  g.setAttribute('aT', new BufferAttribute(T, 1)); g.setAttribute('aCat', new BufferAttribute(K, 1));
  g.setAttribute('aWig', new BufferAttribute(Wg, 3)); g.setAttribute('aPhase', new BufferAttribute(Ph, 1));
  g.setIndex(new BufferAttribute(I, 1));
  return g;
}
const TUBE_FOCUS = `
  { float g = clamp( 1.0 - vFocus, 0.0, 1.0 ); float l = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( l ), g ); gl_FragColor.rgb = mix( gl_FragColor.rgb, uPaper, g * 0.9 ); }`;
function tubeMaterial(paper, NC, legs) {
  const m = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  // per category: uFH = (focus, hide), uOff = push aside; legs also turn round their category (uCtr, uQ) to face the camera early on
  m.userData.u = { uTime: { value: 0 }, uAmp: { value: 0 }, uGrow: { value: 0 }, uFH: { value: Array.from({ length: NC }, () => new Vector2(1, 0)) }, uOff: { value: Array.from({ length: NC }, () => new Vector3()) }, uAng: { value: new Float32Array(NC) }, uPaper: { value: paper } };
  if (legs) Object.assign(m.userData.u, { uCtr: { value: Array.from({ length: NC }, () => new Vector3()) }, uQ: { value: Array.from({ length: NC }, () => new Vector4(0, 0, 0, 1)) } });
  // v8 fix: legs and threads build different shaders from the same function; give each its own program
  // (sharing one made the threads run the legs' code, so they turned with the legs and missed the Tastebud)
  m.customProgramCacheKey = () => 'nc-tube-' + (legs ? 'legs' : 'thread') + '-' + NC;
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, m.userData.u);
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
attribute float aT; attribute float aCat; attribute vec3 aWig; attribute float aPhase;
uniform float uTime; uniform float uAmp; uniform vec2 uFH[${NC}]; uniform vec3 uOff[${NC}]; uniform float uAng[${NC}];${legs ? `\nuniform vec3 uCtr[${NC}]; uniform vec4 uQ[${NC}];\nvec3 ncRot( vec4 q, vec3 v ) { return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v ); }` : ''}
varying float vFocus; varying float vT; varying float vHide;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
int ci = int( aCat + 0.5 ); vFocus = uFH[ ci ].x; vHide = uFH[ ci ].y; vT = aT;
${legs ? 'transformed = uCtr[ ci ] + ncRot( uQ[ ci ], transformed - uCtr[ ci ] );' : ''}
transformed += uOff[ ci ] * ${legs ? '1.0' : 'aT'};
${legs ? 'transformed += ncRot( uQ[ ci ], aWig ) * sin( uTime * 1.15 + aPhase + aT * 2.4 ) * pow( aT, 1.6 ) * uAmp;' : ''}
{ float ca = cos( uAng[ ci ] ), sa = sin( uAng[ ci ] ); transformed.xz = vec2( ca * transformed.x + sa * transformed.z, ca * transformed.z - sa * transformed.x ); }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFocus; varying float vT; varying float vHide; uniform vec3 uPaper; uniform float uGrow;')
      .replace('void main() {', 'void main() {\n if ( vT > uGrow || vFocus < -0.5 || vT > 1.0 - vHide ) discard;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>' + TUBE_FOCUS);
  };
  return m;
}

export function mount(host, opts) {
  opts = opts || {};
  const cats = opts.cats, apps = opts.apps, NC = cats.length;
  const canvas = document.createElement('canvas');
  canvas.className = 'map3d'; canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const paper = new Color('#F6F3F0');   // linear working space

  const scene = new Scene();
  scene.fog = new Fog(new Color('#F6F3F0'), 30, 120);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  const key = new DirectionalLight(0xffffff, 1.5); key.position.set(-6, 10, 8); scene.add(key);
  const rimL = new DirectionalLight(0xffc7ec, 0.9); rimL.position.set(8, -3, -6); scene.add(rimL);
  const camera = new PerspectiveCamera(34, 1, 0.8, 420);
  const world = new Group(); scene.add(world);

  // ---------- the sun: the Tastebud ----------
  const sunGeo = new SphereGeometry(1, 96, 64);
  { const op = sunGeo.attributes.position, oc = new Float32Array(op.count * 3);
    const c0 = new Color('#FF7FD0'), c1 = new Color('#EE2FC2'), c2 = new Color('#C70FB8'), c3 = new Color('#7A16D0');
    for (let i = 0; i < op.count; i++) {
      const t = (-op.getX(i) * 0.55 - op.getY(i) * 0.8 + 1.35) / 2.7;
      const c = t < 0.4 ? c0.clone().lerp(c1, t / 0.4) : t < 0.72 ? c1.clone().lerp(c2, (t - 0.4) / 0.32) : c2.clone().lerp(c3, (t - 0.72) / 0.28);
      oc[i * 3] = c.r; oc[i * 3 + 1] = c.g; oc[i * 3 + 2] = c.b;
    }
    sunGeo.setAttribute('color', new BufferAttribute(oc, 3)); }
  const sunMat = new MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1,
    sheen: 0.5, sheenColor: new Color('#ff9fe0'), sheenRoughness: 0.45, emissive: new Color('#b0108f'), emissiveIntensity: 0.32, envMapIntensity: 0.6, fog: false });
  sunMat.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>' + ACES).replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = ncACES( gl_FragColor.rgb );');
  };
  const sun = new Mesh(sunGeo, sunMat); world.add(sun);
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  { const g2 = gc.getContext('2d'), rg = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, 'rgba(228,9,207,0.34)'); rg.addColorStop(0.45, 'rgba(253,49,85,0.12)'); rg.addColorStop(1, 'rgba(253,49,85,0)');
    g2.fillStyle = rg; g2.fillRect(0, 0, 256, 256); }
  const glowTex = new CanvasTexture(gc);
  const glow = new Sprite(new SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false }));
  world.add(glow);
  // v9 (Martin, Oct 26 4:00 PM): the nudge to keep scrolling. After a short pause on the first two scroll stages,
  // You glows a little: a soft halo that breathes, and the sphere itself a touch brighter
  const halo = new Sprite(new SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  halo.visible = false; world.add(halo);

  // ---------- orbits ----------
  // v8: each ring's orbit line appears with its categories (only the inner one before the whole system)
  const orbitMats = RINGS.map(() => new LineBasicMaterial({ color: new Color('#e9c5da'), transparent: true, opacity: 0.8, fog: true }));
  RINGS.forEach((R, ri) => {
    const g = new BufferGeometry(), n = 320, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p[i * 3] = Math.cos(a) * R.r; p[i * 3 + 2] = Math.sin(a) * R.r; }
    g.setAttribute('position', new BufferAttribute(p, 3)); world.add(new LineLoop(g, orbitMats[ri]));
  });

  // ---------- categories on the rings, in tour order ----------
  const UP = new Vector3(0, 1, 0);
  const C = []; let ci = 0, theta0 = rad(67.5);   // v8: the inner ring sits symmetric about the view (pairs left and right); the tour starts at the front (Movies)
  RINGS.forEach((R, ri) => {
    for (let i = 0; i < R.n && ci < NC; i++, ci++) {
      const th = theta0 + i * Math.PI * 2 / R.n;
      const P = new Vector3(Math.cos(th) * R.r, ri === 0 ? 0 : Math.sin(ci * 1.7) * 0.55, Math.sin(th) * R.r);
      const u = new Vector3(Math.cos(th), 0, Math.sin(th)), t = new Vector3(-Math.sin(th), 0, Math.cos(th));
      // the direction the tour camera looks back from; the legs fan out across it
      const e = rad(34), a = rad(-24);
      const n = u.clone().multiplyScalar(Math.cos(e) * Math.cos(a)).add(t.clone().multiplyScalar(Math.cos(e) * Math.sin(a))).add(UP.clone().multiplyScalar(Math.sin(e))).normalize();
      // v8: the legs fan straight outward (no pinwheel), so the map reads symmetric before the tour starts
      const n0 = u.clone().multiplyScalar(Math.cos(e)).add(UP.clone().multiplyScalar(Math.sin(e))).normalize();
      const b1 = new Vector3().crossVectors(UP, n0).normalize(), b2 = new Vector3().crossVectors(n0, b1).normalize();
      C.push({ k: cats[ci].k, glyph: cats[ci].g, ring: ri, th, P, u, t, n, n0, b1, b2, focus: 1, tf: 1, hide: 0, th: 0, qf: new Quaternion(), off: new Vector3(), toff: new Vector3(), q: new Quaternion(), seeded: false, show: 1, bob: 0 });
    }
    if (RINGS[ri + 1]) theta0 = theta0 + (R.n - 1) * Math.PI * 2 / R.n + Math.PI * 2 / RINGS[ri + 1].n * 0.7;
  });

  // legs (one per app) and the threads from the sun
  const L = [], legTubes = [], threadTubes = [];
  C.forEach((c, i) => {
    const mine = apps.filter(a => a.cat === c.k), nLeg = Math.max(10, mine.length);
    mine.forEach((a, j) => {
      // ten legs, evenly round the category (a set that mirrors onto itself), with a little life in length and curl
      const phi = rad(j * 360 / nLeg + 90 + 180 / nLeg + (rnd(i, j) - 0.5) * 6);
      const len = 2.45 + rnd(j, i) * 0.4;
      const dir = c.b1.clone().multiplyScalar(Math.cos(phi)).add(c.b2.clone().multiplyScalar(Math.sin(phi)));
      const perp = new Vector3().crossVectors(c.n0, dir).normalize();
      const bulge = 0.3 + rnd(i * 3, j) * 0.4, curl = (j % 2 ? 1 : -1) * (0.35 + rnd(j * 5, i) * 0.3);
      const tip = c.P.clone().add(dir.clone().multiplyScalar(len)).add(c.n0.clone().multiplyScalar(bulge));
      const p0 = c.P.clone().add(dir.clone().multiplyScalar(CAT_R * 0.8));
      const p1 = c.P.clone().add(dir.clone().multiplyScalar(len * 0.42)).add(c.n0.clone().multiplyScalar(0.5)).add(perp.clone().multiplyScalar(curl));
      const p2 = c.P.clone().add(dir.clone().multiplyScalar(len * 0.78)).add(perp.clone().multiplyScalar(-curl * 0.6)).add(c.n0.clone().multiplyScalar(bulge * 0.8));
      const p3 = tip.clone().sub(dir.clone().multiplyScalar(APP_R * 0.42));
      const phase = i * 1.37 + j * 0.91;
      legTubes.push(taperTube(new CubicBezierCurve3(p0, p1, p2, p3), 18, 0.07, 0.02, { cat: i, wig: perp, phase }));
      L.push({ a, c: i, j, tip, cur: tip.clone(), perp, phase, q: new Quaternion(), seeded: false, m: new Matrix4(), vis: false });
    });
    // v8 (Martin 6:00 PM): each thread starts inside the Tastebud and ends inside its category sphere (no blunt ends, no gaps)
    const d = c.P.clone().setY(0).normalize(), s0 = d.clone().multiplyScalar(SUN * 0.72), s1 = c.P.clone().sub(d.clone().multiplyScalar(CAT_R * 0.4));
    const mid = d.clone().multiplyScalar(SUN * 1.04).add(s1).multiplyScalar(0.5).add(new Vector3(0, 1.4 + c.ring * 0.7, 0));
    threadTubes.push(taperTube(new QuadraticBezierCurve3(s0, mid, s1), 40, 0.06 - c.ring * 0.008, 0.032, { cat: i, wig: new Vector3(), phase: 0 }));
  });
  const tipsOf = C.map((c, i) => L.filter(x => x.c === i));
  const legMat = tubeMaterial(paper, NC, true), threadMat = tubeMaterial(paper, NC, false);
  const legMesh = new Mesh(mergeTubes(legTubes, 0.25, 0.75, 0.42), legMat); legMesh.frustumCulled = false; world.add(legMesh);
  const threadMesh = new Mesh(mergeTubes(threadTubes, 0.08, 0.8, 0.18), threadMat); threadMesh.frustumCulled = false; world.add(threadMesh);

  // ---------- spheres: icons for categories, logos for apps ----------
  const white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;
  const sphereGeo = new SphereGeometry(1, 40, 28), appGeo = new SphereGeometry(1, 28, 20);   // app spheres are small: fewer triangles
  function sphereSet(count, cfg) {
    const geo = (cfg.geo || sphereGeo).clone();
    const cell = new InstancedBufferAttribute(new Float32Array(count * 2), 2), col = new InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3), foc = new InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
    geo.setAttribute('aCell', cell); geo.setAttribute('aColor', col); geo.setAttribute('aFocus', foc);
    const mat = sphereMat(paper, Object.assign({ atlas: white }, cfg));
    const im = new InstancedMesh(geo, mat, count); im.frustumCulled = false; world.add(im);
    return { im, cell, col, foc, mat };
  }
  // category spheres: the glyph keeps its exact gradient (no tone curve), like the app logos keep their colours
  const catSet = sphereSet(NC, { rough: 0.26, env: 1.0, sheen: 0, half: 0.8, corner: 0.5, glowEm: 0.36, aces: false });
  C.forEach((c, i) => { catSet.cell.setXY(i, c.glyph % 8, Math.floor(c.glyph / 8)); });
  const appSets = [];
  // app atlases: G.cols x G.cols cells of G.cell px in a G.size px texture (v7: 12 x 160 px in 2048 px)
  const G = Object.assign({ cols: 8, cell: 256, gut: 6, size: 2048 }, opts.grid || {}), PER = G.cols * G.cols;
  const atlasOf = x => Math.floor(x.a.cell / PER);
  for (let k = 0; k < (opts.atlases || []).length; k++) {
    const members = []; L.forEach((x, i) => { if (atlasOf(x) === k) members.push(i); });
    if (!members.length) continue;
    const S = sphereSet(members.length, { rough: 0.24, env: 1.0, half: 0.62, corner: 0.225, glowEm: 0.42, aces: false, geo: appGeo, cellN: G.cell / G.size, gutN: G.gut / G.size });
    members.forEach((n, m) => {
      const c = L[n].a.cell % PER; S.cell.setXY(m, c % G.cols, Math.floor(c / G.cols));
      const col = new Color(L[n].a.color || '#ffffff'); S.col.setXYZ(m, col.r, col.g, col.b);
    });
    S.k = k; S.members = members; appSets.push(S);
  }
  const loader = new TextureLoader(), maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function loadInto(url, mat) {
    loader.load(url, tex => {
      tex.colorSpace = SRGBColorSpace; tex.minFilter = LinearMipmapLinearFilter; tex.magFilter = LinearFilter; tex.anisotropy = maxAniso;
      mat.userData.u.uAtlas.value = tex; draw();
    });
  }
  if (opts.glyphs) loadInto(opts.glyphs, catSet.mat);
  appSets.slice(0, 2).forEach(S => loadInto(opts.atlases[S.k], S.mat));
  setTimeout(() => appSets.slice(2).forEach((S, i) => setTimeout(() => loadInto(opts.atlases[S.k], S.mat), i * 140)), 300);

  // ---------- post: the black-hole lens, RGB glitch and lens flare ----------
  // lite: software WebGL (no GPU). Drawn on demand at a lower resolution without MSAA, so scrolling stays usable
  const lite = !!opts.lite;
  const rt = new WebGLRenderTarget(2, 2, { type: HalfFloatType, samples: lite ? 0 : 4 });
  const post = new ShaderMaterial({
    uniforms: {
      tScene: { value: rt.texture }, uRes: { value: new Vector2(1, 1) }, uHole: { value: [0, 0, 1, 1] }, uHoleAmt: { value: 0 },
      uMouse: { value: new Vector2(-9999, -9999) }, uFlare: { value: 0 }, uGlitch: { value: 0 }, uTime: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: `
precision highp float;
uniform sampler2D tScene; uniform vec2 uRes; uniform float uHole[4]; uniform float uHoleAmt; uniform vec2 uMouse; uniform float uFlare; uniform float uGlitch; uniform float uTime;
varying vec2 vUv;
float hash( float n ) { return fract( sin( n ) * 43758.5453 ); }
vec3 toSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 0.41666 ) ) - 0.055, step( vec3( 0.0031308 ), c ) ); }
vec3 grad( float t ) { t = clamp( t, 0.0, 1.0 ) * 3.0;
  vec3 a = vec3( 0.98, 0.28, 0.006 ), b = vec3( 0.98, 0.031, 0.09 ), c = vec3( 0.78, 0.0027, 0.62 ), d = vec3( 0.056, 0.0074, 1.0 );
  return t < 1.0 ? mix( a, b, t ) : t < 2.0 ? mix( b, c, t - 1.0 ) : mix( c, d, t - 2.0 ); }
void main() {
  vec2 px = vUv * uRes, c = vec2( uHole[0], uHole[1] ), R = max( vec2( uHole[2], uHole[3] ), vec2( 1.0 ) );
  vec2 d = ( px - c ) / R; float r = length( d ), R2 = 1.75;
  vec2 src = px; float ca = 0.0, clear = 0.0;
  if ( uHoleAmt > 0.001 && r < R2 ) {
    float w = 1.0 - smoothstep( 0.0, R2, r );
    float s = r * ( 1.0 - uHoleAmt * 0.42 * w * w );          // what's near the copy is eased outward, like a lens
    float ang = atan( d.y, d.x ) + uHoleAmt * 0.12 * w * w;
    src = c + vec2( cos( ang ), sin( ang ) ) * s * R;
    ca = uHoleAmt * 0.0018 * smoothstep( 0.55, 1.0, r ) * ( 1.0 - smoothstep( 1.0, 1.6, r ) );   // a thin RGB split only at the rim
    clear = uHoleAmt * ( 1.0 - smoothstep( 0.5, 1.12, r ) );  // and the space under the copy clears
  }
  float band = floor( vUv.y * 52.0 + floor( uTime * 16.0 ) * 5.0 );
  float gx = uGlitch * step( 0.66, hash( band ) ) * ( hash( band + 7.0 ) - 0.5 ) * 0.045;
  vec2 suv = src / uRes + vec2( gx, 0.0 );
  vec2 dir = ( src - c ) / uRes; float dl = length( dir ); dir = dl > 0.0 ? dir / dl : vec2( 1.0, 0.0 );
  vec2 off = dir * ( ca + uGlitch * 0.004 ) + vec2( uGlitch * 0.0035, 0.0 );
  vec4 cr = texture2D( tScene, suv + off ), cg = texture2D( tScene, suv ), cb = texture2D( tScene, suv - off );
  vec4 col = vec4( cr.r, cg.g, cb.b, max( cg.a, max( cr.a, cb.a ) ) );
  col *= 1.0 - clear;
  if ( uFlare > 0.001 ) {
    vec2 m = uMouse; float fd = length( px - m );
    float glowF = exp( -fd * fd / ( 2.0 * 64.0 * 64.0 ) ) * 0.13;
    vec3 f = vec3( 1.0, 0.78, 0.9 ) * glowF;   // v8 (Martin 5:21 PM): no horizontal streak following the cursor
    for ( int i = 0; i < 3; i++ ) {
      float kk = i == 0 ? 0.42 : i == 1 ? -0.6 : 1.35;
      vec2 gp = c + ( c - m ) * kk; float rr = i == 0 ? 24.0 : i == 1 ? 44.0 : 15.0;
      float gd = length( px - gp ); f += grad( 0.2 + 0.3 * float( i ) ) * smoothstep( rr, rr * 0.5, gd ) * 0.05;
    }
    f *= uFlare; col.rgb += f; col.a = max( col.a, max( f.r, max( f.g, f.b ) ) );
  }
  col.a = clamp( col.a, 0.0, 1.0 );
  vec3 rgb = col.a > 0.0001 ? col.rgb / col.a : vec3( 0.0 );
  gl_FragColor = vec4( toSRGB( clamp( rgb, 0.0, 1.0 ) ) * col.a, col.a );
}`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const postScene = new Scene(), postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new Mesh(new PlaneGeometry(2, 2), post));

  // ---------- state ----------
  let W = 1, H = 1, tall = false;
  const state = {
    p: opts.p || 0, sp: opts.p || 0, open: (opts.still || opts.lite) ? 1 : (opts.open == null ? 1 : opts.open), still: !!(opts.still || opts.lite), t0: performance.now(),
    hole: { x: 0, y: 0, rx: 1, ry: 1, amt: 0 }, shole: { x: 0, y: 0, rx: 1, ry: 1, amt: 0 }, lastMove: 0,
    mouse: new Vector2(-9999, -9999), mv: 0, flare: 0, glitch: 0, active: -1, pose: null, nudge: false, nz: 0,
    ring: [0, 0, 0], slow: [1, 1, 1], orbitW: 0, hot: -1, lastT: 0,
  };
  let pr = 1, prCap = lite ? 0.7 : 2, slow = 0;
  // one move per step: an eased tween along the camera path (about a second per category)
  const tw = { from: 0, to: 0, t0: 0, dur: 0 }, STEP = (PHASE.end - PHASE.tour) / Math.max(1, NC - 1);
  // v8 fast mode (Martin, 4:47 PM): only for fast scrolling and scrubbing the rail, never for one move at a time.
  // Moves are shorter, the RGB flash on a category change is small and the others grey a little less.
  let fastUntil = 0;
  const isFast = () => performance.now() < fastUntil;
  function setTarget(v, scrub) {
    v = clamp01(v);
    if (Math.abs(v - state.p) < 1e-7) return;
    if (!state.still) {
      const now = performance.now(), n = Math.abs(v - state.sp) / STEP;
      const under = tw.dur > 0 && now - tw.t0 < tw.dur * 0.85;   // the last move is still under way: scrolling fast
      if (scrub || under) fastUntil = now + (scrub ? 700 : 1100);
      tw.from = state.sp; tw.to = v; tw.t0 = now;
      tw.dur = scrub ? Math.min(420, 140 + n * 35) : under ? Math.min(1100, 600 + Math.max(0, n - 1) * 80) : Math.min(1800, 950 + Math.max(0, n - 1) * 120);
    }
    state.p = v;
  }
  function resize() {
    // v11: the layout size, not the on-screen box (which a transform or a phone toolbar can change), so the picture and
    // the labels always use the same size
    W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight);
    pr = lite ? prCap : Math.min(2, prCap, window.devicePixelRatio || 1);
    // at retina density 2x MSAA is enough (and half the memory of 4x)
    const ms = lite ? 0 : pr >= 1.75 ? 2 : 4;
    if (rt.samples !== ms) { rt.samples = ms; rt.dispose(); }
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    rt.setSize(Math.round(W * pr), Math.round(H * pr));
    post.uniforms.uRes.value.set(W * pr, H * pr);
    tall = W / H < 0.9;
    camera.fov = tall ? 50 : 34; camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  // ---------- poses ----------
  const tmp = new Vector3(), tmp2 = new Vector3();
  function freePose(name) {
    const ar = W / H, wfit = tall ? 1 : Math.max(1, Math.pow(1.6 / ar, 0.8));
    // v11 (Martin, Oct 28 7:41 PM: on phones the map was squished before any scroll): a higher angle, fitted under the copy
    if (name === 'welcome' && tall) return fitFull({ pos: new Vector3(0, 30, 36), tgt: new Vector3(0, 0.5, 0), cy: 0.72, sun: 1, sc: 1 }, { inner: true, top: H * 0.5, bot: H - 24, key: 'w' });
    if (name === 'welcome') return tall ? null
      : { pos: new Vector3(0, 16 * wfit, 31 * wfit), tgt: new Vector3(0, 0.6, 0), cy: 0.75, sun: 1, sc: 1 };   // v8: closer under the button, the crown seen from a little higher
    // v8: the eight core categories as a clean, symmetric crown round the Tastebud, all of it on screen
    if (name === 'pull') return tall ? { pos: new Vector3(0, 54, 48), tgt: new Vector3(0, 0, 0), cy: 0.5, sun: 1.05, sc: 1 }
      : { pos: new Vector3(0, 33 * wfit, 33 * wfit), tgt: new Vector3(0, 0, 0), cy: 0.53, sun: 1.05, sc: 1 };
    // the whole system: the Tastebud massive in the middle, everything else shrunk to fit
    // v10 (Martin, Oct 28 2026: "i cant see everything. so reframe it"): the camera keeps its angle but backs off until
    // all 40 categories, their apps and their labels fit between the header and the bottom edge, on every screen
    return fitFull(tall ? { pos: new Vector3(0, 80, 30), tgt: new Vector3(0, -1, 0), cy: 0.5, sun: 2.4, sc: 0.84 }
      : { pos: new Vector3(0, 61, 44.5), tgt: new Vector3(0, -2.8, 0), cy: 0.5, sun: 2.7, sc: 0.78 });
  }
  const fullCache = new Map(), fitRight = new Vector3();
  function fitFull(base, o) {
    o = o || {};
    const top = o.top != null ? o.top : (state.frame ? state.frame.top : 76) + 4, key = (o.key || 'f') + W + 'x' + H + ':' + Math.round(top);
    if (fullCache.has(key)) return fullCache.get(key);
    // the room: under the header, above the bottom edge; labels hang about 44 px under each sphere and are up to ~80 px wide
    const padX = tall ? 22 : 92, labB = tall ? 34 : 46, bot = o.bot != null ? o.bot : H - (tall ? 10 : 14), availH = bot - top, availW = W - 2 * padX;
    const dir = base.pos.clone().sub(base.tgt), D0 = dir.length(); dir.normalize();
    const pts = [];
    C.forEach(c => { if (!o.inner || c.ring === 0) pts.push([c.P, CAT_R * base.sc * 1.06, true]); });
    if (!o.inner) L.forEach(x => pts.push([x.tip, APP_R * base.sc * 1.04, false]));
    fitCam.fov = camera.fov; fitCam.aspect = W / H; fitCam.updateProjectionMatrix();
    const boxAt = D => {
      fitCam.position.copy(base.tgt).addScaledVector(dir, D); fitCam.lookAt(base.tgt); fitCam.updateMatrixWorld(true);
      fitRight.setFromMatrixColumn(fitCam.matrixWorld, 0);
      const b = [1e9, 1e9, -1e9, -1e9];
      pts.forEach(([p, r, lab]) => {
        [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, u]) => {
          fv.copy(p).addScaledVector(fitCam.up, u * r).addScaledVector(fitRight, a * r).project(fitCam);
          const x = (fv.x * 0.5 + 0.5) * W, y = (-fv.y * 0.5 + 0.5) * H;
          if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y + (lab && u === -1 ? labB : 0) > b[3]) b[3] = y + (lab && u === -1 ? labB : 0);
        });
      });
      return b;
    };
    // phones keep the whole ring on screen too (Martin, Oct 28 8:12 PM: "don't zoom in… stay zoomed out"); only a label
    // at the very edge may be cut a little
    const fits = b => b[3] - b[1] <= availH && b[2] - b[0] <= availW;
    let lo = D0 * 0.6, hi = D0 * 3.2;
    if (fits(boxAt(lo))) hi = lo;
    for (let it = 0; it < 26 && hi - lo > 0.05; it++) { const mid = (lo + hi) / 2; if (fits(boxAt(mid))) hi = mid; else lo = mid; }
    const b = boxAt(hi);
    // centre the system in the room (the view offset moves the picture without changing the angle)
    const cy = Math.max(0.3, Math.min(o.inner ? 0.86 : 0.7, 0.5 + ((top + bot) / 2 - (b[1] + b[3]) / 2) / H));
    const out = { pos: base.tgt.clone().addScaledVector(dir, hi), tgt: base.tgt.clone(), cy, sun: base.sun, sc: base.sc };
    fullCache.set(key, out);
    return out;
  }
  // each stop is framed so the category and all ten legs fit between the header and the tour copy
  const fitCam = new PerspectiveCamera(34, 1, 0.8, 420), fitCache = new Map(), fv = new Vector3();
  function fitStop(i) {
    const fr = state.frame || { top: H * 0.1, bottom: H * 0.62 };
    const key = i + ':' + W + 'x' + H + ':' + Math.round(fr.top) + ':' + Math.round(fr.bottom);
    if (fitCache.has(key)) return fitCache.get(key);
    const c = C[i], T = c.P.clone().add(c.n.clone().multiplyScalar(0.35));
    const top = Math.max(0, fr.top), bot = Math.min(H, fr.bottom), bh = Math.max(90, bot - top), bw = Math.max(120, W - (tall ? 28 : 120));
    const pts = [[c.P, CAT_R * 1.04]];
    L.forEach(x => { if (x.c === i) pts.push([x.tip, APP_R * 1.04 + 0.16]); });
    fitCam.fov = camera.fov; fitCam.aspect = W / H; fitCam.updateProjectionMatrix();
    let D = tall ? 19 : 16, box = null;
    for (let it = 0; it < 3; it++) {
      fitCam.position.copy(T).addScaledVector(c.n, D); fitCam.lookAt(T); fitCam.updateMatrixWorld(true);
      box = [1e9, 1e9, -1e9, -1e9];
      pts.forEach(([p, r]) => {
        [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => {
          fv.copy(p).addScaledVector(fitCam.up, b * r).add(new Vector3().setFromMatrixColumn(fitCam.matrixWorld, 0).multiplyScalar(a * r));
          world.localToWorld(fv); fv.project(fitCam);
          const x = fv.x * 0.5 * W, y = -fv.y * 0.5 * H;
          box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
        });
      });
      const s = Math.max((box[3] - box[1]) / bh, (box[2] - box[0]) / bw);
      D = Math.min(36, Math.max(11, D * s));
    }
    // the target lands on cy; move it so the cluster's box centres in the free space
    const cy = ((top + bot) / 2 - (box[1] + box[3]) / 2) / H;
    const out = { D, cy: Math.min(0.62, Math.max(0.12, cy)) };
    fitCache.set(key, out);
    return out;
  }
  function stopPose(i, f) {
    i = Math.max(0, Math.min(NC - 1, i));
    const c = C[i], fit = fitStop(i), T = c.P.clone().add(c.n.clone().multiplyScalar(0.35));
    const drift = rad((f - 0.25) * 16), q = new Quaternion().setFromAxisAngle(UP, drift);
    const pos = T.clone().add(c.n.clone().applyQuaternion(q).multiplyScalar(fit.D));
    return { pos, tgt: T, cy: fit.cy, sun: 1.25, sc: 1 };
  }
  function mixPose(a, b, t) {
    return { pos: a.pos.clone().lerp(b.pos, t), tgt: a.tgt.clone().lerp(b.tgt, t), cy: lerp(a.cy, b.cy, t), sun: lerp(a.sun, b.sun, t), sc: lerp(a.sc, b.sc, t) };
  }
  // between two stops the camera swings round the sun instead of cutting across it
  function orbitMix(a, b, t) {
    const pa = a.pos, pb = b.pos, ta = Math.atan2(pa.z, pa.x); let tb = Math.atan2(pb.z, pb.x);
    while (tb - ta > Math.PI) tb -= Math.PI * 2; while (tb - ta < -Math.PI) tb += Math.PI * 2;
    const th = lerp(ta, tb, t), rr = lerp(Math.hypot(pa.x, pa.z), Math.hypot(pb.x, pb.z), t) + Math.sin(t * Math.PI) * 2.5;
    const pos = new Vector3(Math.cos(th) * rr, lerp(pa.y, pb.y, t) + Math.sin(t * Math.PI) * 1.8, Math.sin(th) * rr);
    const ga = Math.atan2(a.tgt.z, a.tgt.x); let gb = Math.atan2(b.tgt.z, b.tgt.x);
    while (gb - ga > Math.PI) gb -= Math.PI * 2; while (gb - ga < -Math.PI) gb += Math.PI * 2;
    const gt = lerp(ga, gb, t), gr = lerp(Math.hypot(a.tgt.x, a.tgt.z), Math.hypot(b.tgt.x, b.tgt.z), t);
    return { pos, tgt: new Vector3(Math.cos(gt) * gr, lerp(a.tgt.y, b.tgt.y, t), Math.sin(gt) * gr), cy: lerp(a.cy, b.cy, t), sun: lerp(a.sun, b.sun, t), sc: lerp(a.sc, b.sc, t) };
  }
  function journey(p) {
    const P = PHASE;
    if (p < P.pull) return { pose: freePose('welcome'), mode: 'welcome', active: -1, outer: 0, apps: 0, face: 1, k: 0 };
    if (p < P.full) { const t = smooth((p - P.pull) / (P.full - P.pull)); return { pose: mixPose(freePose('welcome'), freePose('pull'), t), mode: 'pull', active: -1, outer: 0, apps: t, face: 1, k: t }; }
    if (p < P.hold) { const t = smooth((p - P.full) / (P.hold - P.full)); return { pose: mixPose(freePose('pull'), freePose('full'), t), mode: 'full', active: -1, outer: t, face: 1 - t, k: t }; }
    if (p < P.tour) { const t = smooth((p - P.hold) / (P.tour - P.hold)); return { pose: mixPose(freePose('full'), stopPose(0, 0.25), t), mode: t > 0.55 ? 'tour' : 'full', active: t > 0.55 ? 0 : -1, outer: 1, settle: t, i: 0, f: 0, k: 1 }; }
    if (p <= P.end + 1e-9) {   // the last category sits exactly at P.end
      const s = (p - P.tour) / (P.end - P.tour) * (NC - 1), i = Math.min(NC - 2, Math.max(0, Math.floor(s))), u = clamp01(s - i);
      if (u < 1e-5) return { pose: stopPose(i, 0.25), mode: 'tour', active: i, outer: 1, settle: 1, i, f: 0 };
      if (u > 1 - 1e-5) return { pose: stopPose(i + 1, 0.25), mode: 'tour', active: i + 1, outer: 1, settle: 1, i: i + 1, f: 0 };
      return { pose: orbitMix(stopPose(i, 0.25), stopPose(i + 1, 0.25), u), mode: 'tour', active: u < 0.5 ? i : i + 1, outer: 1, travel: u, settle: 1, i, f: u };
    }
    // home: the welcome frame again under the closing line (v8: the Tastebud and the eight core categories, calm)
    const t = smooth((p - P.end) / (1 - P.end));
    return { pose: mixPose(stopPose(NC - 1, 0.25), freePose('welcome'), t), mode: 'end', active: t < 0.4 ? NC - 1 : -1, outer: 1 - t, apps: 1 - t, face: t, k: t };
  }

  const m4 = new Matrix4(), qFace = new Quaternion(), qT = new Quaternion(), qBase = new Quaternion(), Zp = new Vector3(0, 0, 1);
  const tipV = new Vector3(), sV = new Vector3(), dummy = new Object3D(), qI = new Quaternion(), pV = new Vector3();
  let last = null;
  function faceCam(obj, pos, base, toCam, q, seeded, lag) {
    qBase.setFromUnitVectors(Zp, base);
    m4.lookAt(camera.position, pos, UP); qFace.setFromRotationMatrix(m4);
    qT.copy(qBase).slerp(qFace, toCam);
    if (!seeded) q.copy(qT); else q.slerp(qT, lag);
  }
  // v11 (Martin, Oct 28 2026): on the first two scrolls the rings orbit the Tastebud, slow and steady: the inner ring
  // clockwise, the middle one counter-clockwise, the outer one clockwise (seen from above). Each category turns round
  // the Tastebud's axis by its ring's angle; in the tour the rings unwind to where the tour expects them
  // v11 (Martin, Oct 28 7:29 PM: match the perceived speed of the 3 rings): every category moves along its ring at the same
  // speed (0.65 units/s), so the angular speed is that over each ring's radius (11.5, 21, 31): about 1.9, 3.4 and 5 minutes a turn
  const ORB_V = 0.65, ORB = [-ORB_V / 11.5, ORB_V * 0.9 / 21, -ORB_V / 31];   // middle ring 10% slower (Martin, Oct 28 8:07 PM: it still read slightly fast)   // rad/s (negative = clockwise from above)
  function orb(c, v) { const a = state.ring[c.ring]; if (!a) return v; const ca = Math.cos(a), sa = Math.sin(a), x = v.x; v.x = ca * x + sa * v.z; v.z = ca * v.z - sa * x; return v; }
  // a category's cluster on screen (px): its sphere and every app sphere, each padded by its own radius (+ pad, world units)
  const HIDE_PAD = 10, cbV = new Vector3();
  function clusterBox(i, pad) {
    const c = C[i], f = H / (2 * Math.tan(rad(camera.fov) / 2)), box = [1e9, 1e9, -1e9, -1e9];
    let any = false;
    const add = (p, r) => {
      cbV.copy(p); world.localToWorld(cbV);
      const d = cbV.distanceTo(camera.position); cbV.project(camera);
      if (cbV.z > 1 || cbV.z < -1 || d < 0.5) return;
      const x = (cbV.x * 0.5 + 0.5) * W, y = (-cbV.y * 0.5 + 0.5) * H, rp = (r + pad) * f / d;
      box[0] = Math.min(box[0], x - rp); box[1] = Math.min(box[1], y - rp); box[2] = Math.max(box[2], x + rp); box[3] = Math.max(box[3], y + rp); any = true;
    };
    add(orb(c, tmp2.copy(c.P).add(c.off)), CAT_R);
    tipsOf[i].forEach(x => add(orb(c, tmp2.copy(x.cur).add(c.off)), APP_R));
    return any ? box : null;
  }
  function frame(now) {
    const t = (now - state.t0) / 1000, still = state.still;
    if (still || !tw.dur) state.sp = state.p;
    else { const k = clamp01((now - tw.t0) / tw.dur); state.sp = lerp(tw.from, tw.to, k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2); if (k >= 1) tw.dur = 0; }
    const J = journey(state.sp), pose = state.pose ? Object.assign({}, J.pose, state.pose) : J.pose;
    last = J;
    // in the tour the active category keeps its colour and the stage; the rest grey out, sink and step aside
    const A = (J.mode === 'tour' || J.mode === 'end') ? J.active : -1;
    const fast = isFast();
    if (A !== state.active) { state.active = A; if (!still) state.glitch = Math.max(state.glitch, fast ? 0.12 : 0.9); }
    C.forEach((c, i) => {
      if (A < 0 || i === A) { c.tf = 1; c.toff.set(0, 0, 0); }
      else {
        const dx = c.P.x - C[A].P.x, dz = c.P.z - C[A].P.z, dist = Math.hypot(dx, dz) || 1;
        const push = 6.2 * Math.exp(-dist / 9);
        c.tf = fast ? 0.32 : 0.08; c.toff.set(dx / dist * push, -2.4 * Math.exp(-dist / 12) - 0.6, dz / dist * push);
      }
      const k = still ? 1 : fast ? 0.16 : 0.08;
      c.focus += (c.tf - c.focus) * k; c.off.lerp(c.toff, k);
    });
    { // the orbit: on in the pull-up and the whole system, unwinding everywhere else; the ring under the cursor slows
      const dt = state.lastT ? Math.min(0.1, Math.max(0, (now - state.lastT) / 1000)) : 0; state.lastT = now;
      const w = still ? 0 : J.mode === 'pull' ? (J.k || 0) : J.mode === 'full' ? 1 - (J.settle || 0) : 0;
      state.orbitW = w;
      const hr = state.hot >= 0 && w > 0.5 ? C[state.hot].ring : -1;
      for (let r = 0; r < 3; r++) {
        state.slow[r] += ((r === hr ? 0.3 : 1) - state.slow[r]) * Math.min(1, dt * 3);
        if (still) { state.ring[r] = 0; continue; }
        state.ring[r] += ORB[r] * state.slow[r] * dt * w;
        if (w < 1) { const tgt = Math.round(state.ring[r] / (Math.PI * 2)) * Math.PI * 2; state.ring[r] += (tgt - state.ring[r]) * Math.min(1, dt * 3.5 * (1 - w)); if (Math.abs(tgt - state.ring[r]) < 1e-4) state.ring[r] = tgt; }
      }
      C.forEach((c, i) => { c.hl = (c.hl || 0) + ((i === state.hot && w > 0.5 ? 1 : 0) - (c.hl || 0)) * (still ? 1 : Math.min(1, dt * 8)); });
    }
    const open = state.open, sc = pose.sc;
    camera.position.copy(pose.pos); camera.lookAt(pose.tgt);
    camera.setViewOffset(W, H, 0, H / 2 - pose.cy * H, W, H);
    camera.updateMatrixWorld(true);
    // v8: before the tour, each category's legs turn round it to face the camera, so every cluster reads as a round
    // flower and the crown round the Tastebud stays symmetric; in the tour they keep their own angle
    const face = (J.face || 0) * 0.92;
    C.forEach((c, i) => {
      // v11: only the inner ring turns to face the camera (the outer rings are hidden then); turning the fading outer
      // rings too made their legs swing out as big bare starbursts when scrolling back up
      if (face < 1e-3 || c.ring !== 0) c.qf.identity();
      else {
        tmp.copy(camera.position).sub(orb(c, sV.copy(c.P).add(c.off))).normalize();
        const a = -state.ring[c.ring], ca = Math.cos(a), sa = Math.sin(a), x = tmp.x; tmp.x = ca * x + sa * tmp.z; tmp.z = ca * tmp.z - sa * x;
        c.qf.setFromUnitVectors(c.n0, tmp); c.qf.slerp(qI, 1 - face);
      }
      tipsOf[i].forEach(x => { x.cur.copy(x.tip).sub(c.P).applyQuaternion(c.qf).add(c.P); });
    });
    // v8: nothing passes over the category in focus. Any other category whose cluster (sphere, legs, apps) would
    // overlap the focused cluster on screen, in front or behind, folds away: its legs pull in and its spheres shrink
    if (A >= 0) {
      const fb = clusterBox(A, 0, 0);
      C.forEach((c, i) => {
        if (i === A) { c.th = 0; return; }
        const b = clusterBox(i, 0.45, 0);
        c.th = fb && b && b[0] < fb[2] + HIDE_PAD && b[2] > fb[0] - HIDE_PAD && b[1] < fb[3] + HIDE_PAD && b[3] > fb[1] - HIDE_PAD ? 1 : 0;
      });
    } else C.forEach(c => { c.th = 0; });
    C.forEach(c => { c.hide += (c.th - c.hide) * (still ? 1 : 0.16); if (Math.abs(c.th - c.hide) < 0.002) c.hide = c.th; });
    const dist = camera.position.distanceTo(pose.tgt);
    scene.fog.near = dist * 1.15; scene.fog.far = dist * 3.6;
    const sunS = SUN * pose.sun * Math.max(0.001, backOut(open * 1.4));
    sun.scale.setScalar(sunS); sun.rotation.y = t * 0.08;
    glow.scale.setScalar(sunS * 3.4); glow.position.set(0, -sunS * 0.15, 0);
    state.nz += ((state.nudge ? 1 : 0) - state.nz) * (still ? 1 : 0.05); if (Math.abs((state.nudge ? 1 : 0) - state.nz) < 0.002) state.nz = state.nudge ? 1 : 0;
    { const br = still ? 0.6 : 0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 2.6), nz = state.nz;
      sunMat.emissiveIntensity = 0.32 + nz * (0.06 + 0.14 * br);
      halo.visible = nz > 0.003; halo.material.opacity = nz * (0.5 + 0.5 * br);
      halo.scale.setScalar(sunS * (4.0 + 0.7 * br)); halo.position.copy(glow.position); }
    const legU = legMat.userData.u, thU = threadMat.userData.u;
    legU.uTime.value = still ? 0 : t; legU.uAmp.value = still ? 0 : 0.13;
    // v11: each leg carries its app at its tip as it grows or pulls in (no bare legs, no floating apps)
    const G = smooth(clamp01(open * 1.6 - 0.45) * (J.apps == null ? 1 : J.apps));
    legU.uGrow.value = G; thU.uGrow.value = clamp01(open * 1.5 - 0.2);
    const lag = still ? 1 : 0.08;
    orbitMats.forEach((m, ri) => { const o = ri === 0 ? 1 : clamp01(J.outer * 1.4 - (ri - 1) * 0.35); m.opacity = 0.8 * o; m.visible = o > 0.01; });
    C.forEach((c, i) => {
      const show = c.ring === 0 ? 1 : clamp01(J.outer * 1.4 - (c.ring - 1) * 0.35);
      const s = CAT_R * (c.ring === 0 ? 1.06 : 1) * sc * (0.86 + 0.14 * c.focus) * Math.max(0.001, backOut(clamp01(open * 1.3 - 0.15)) * show * (1 - smooth(c.hide)));
      const bob = still ? 0 : Math.sin(t * 0.8 + i * 1.3) * 0.08;
      c.show = show; c.bob = bob;
      tipV.copy(c.P).add(c.off); tipV.y += bob; orb(c, tipV);
      faceCam(null, tipV, c.n, 0.8, c.q, c.seeded && !still, lag); c.seeded = true;
      dummy.position.copy(tipV); dummy.quaternion.copy(c.q); dummy.scale.setScalar(s * (1 + 0.16 * c.hl)); dummy.updateMatrix();
      catSet.im.setMatrixAt(i, dummy.matrix); catSet.foc.setX(i, c.focus);
      const fv = show < 0.02 ? -1 : c.focus;
      // v11: a fading ring's legs and wires pull in with it instead of hanging there without their spheres
      const hideT = Math.max(c.hide, 1 - smooth(show));
      legU.uFH.value[i].set(fv, hideT); thU.uFH.value[i].set(fv, hideT);
      legU.uAng.value[i] = state.ring[c.ring]; thU.uAng.value[i] = state.ring[c.ring];
      legU.uOff.value[i].copy(c.off).y += bob; thU.uOff.value[i].copy(c.off).y += bob;
      legU.uCtr.value[i].copy(c.P); legU.uQ.value[i].set(c.qf.x, c.qf.y, c.qf.z, c.qf.w);
    });
    catSet.im.instanceMatrix.needsUpdate = true; catSet.foc.needsUpdate = true;
    const legGrow = clamp01(open * 1.6 - 0.45) * (J.apps == null ? 1 : J.apps);
    L.forEach(x => {
      const c = C[x.c], grow = G * c.show;
      const wig = still ? 0 : Math.sin(t * 1.15 + x.phase + 2.4) * 0.13;
      tipV.copy(x.cur).sub(c.P).multiplyScalar(G).add(c.P).add(c.off).addScaledVector(pV.copy(x.perp).applyQuaternion(c.qf), wig * G); tipV.y += c.bob; orb(c, tipV);
      faceCam(null, tipV, c.n, 0.66, x.q, x.seeded && !still, lag); x.seeded = true;
      const s = APP_R * sc * (0.82 + 0.18 * c.focus) * (1 + 0.1 * c.hl) * Math.max(0.001, Math.min(1, grow * 1.25)) * Math.max(0.001, 1 - smooth(c.hide * 1.25));
      dummy.position.copy(tipV); dummy.quaternion.copy(x.q); dummy.scale.setScalar(s); dummy.updateMatrix();
      x.m.copy(dummy.matrix); x.vis = s > 0.01; x.s = s;
    });
    appSets.forEach(S => { S.members.forEach((n, m) => { S.im.setMatrixAt(m, L[n].m); S.foc.setX(m, C[L[n].c].focus); }); S.im.instanceMatrix.needsUpdate = true; S.foc.needsUpdate = true; });

    // render the scene, then the lens
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    // where things landed (before the lens), for the page's labels; the page answers with the lens for this frame
    const proj = v => { tmp.copy(v); world.localToWorld(tmp); const d = tmp.distanceTo(camera.position); tmp.project(camera); return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H, d, z: tmp.z }; };
    const you = proj(sV.set(0, 0, 0)), edge = proj(tmp2.set(sunS, 0, 0).applyQuaternion(camera.quaternion));
    const out = { you: { x: you.x, y: you.y, r: Math.hypot(edge.x - you.x, edge.y - you.y), d: you.d }, cats: {}, mode: J.mode, active: A, i: J.i, f: J.f, travel: J.travel || 0, settle: J.settle || 0, k: J.k || 0, p: state.sp, t };
    C.forEach((c, i) => {
      const s = CAT_R * sc * (0.86 + 0.14 * c.focus);
      const ctr = sV.copy(c.P).add(c.off); ctr.y += c.bob; orb(c, ctr);
      const p0 = proj(ctr), p1 = proj(tmp2.copy(ctr).addScaledVector(camera.up, s));
      const r = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const behind = p0.d > you.d && Math.hypot(p0.x - you.x, p0.y - you.y) < out.you.r * 1.02;
      const fog = clamp01((scene.fog.far - p0.d) / (scene.fog.far - scene.fog.near));
      out.cats[c.k] = { x: p0.x, y: p0.y, r, on: c.show * clamp01(open * 1.5 - 0.3) * (1 - c.hide), focus: c.focus, behind, fog, front: p0.z < 1, ring: c.ring, hl: c.hl };
    });
    out.orbit = state.orbitW; out.hot = state.hot >= 0 && state.orbitW > 0.5 ? C[state.hot].k : null;
    lastOut = out;
    // the category under the cursor (its sphere and legs), for the slow-down and the highlight
    if (!still && state.orbitW > 0.5 && state.mouse.x > -9000) {
      let best = -1, bd = 1e9;
      C.forEach((c, i) => { const q = out.cats[c.k]; if (!q || q.on < 0.3 || !q.front || q.behind) return; const d = Math.hypot(q.x - state.mouse.x, q.y - state.mouse.y); if (d < Math.max(30, q.r * 7) && d < bd) { bd = d; best = i; } });
      state.hot = best;
    } else state.hot = -1;
    if (opts.onFrame) opts.onFrame(out);

    const h = state.hole, H2 = state.shole, kk = still ? 1 : 0.2;
    ['x', 'y', 'rx', 'ry', 'amt'].forEach(k => { H2[k] += (h[k] - H2[k]) * kk; });
    post.uniforms.uHole.value = [H2.x * pr, (H - H2.y) * pr, H2.rx * pr, H2.ry * pr];
    post.uniforms.uHoleAmt.value = H2.amt;
    post.uniforms.uTime.value = t;
    state.glitch *= still ? 0 : fast ? 0.8 : 0.9; post.uniforms.uGlitch.value = state.glitch;
    const md = Math.hypot((state.mouse.x - H2.x) / Math.max(1, H2.rx * 1.6), (state.mouse.y - H2.y) / Math.max(1, H2.ry * 1.6));
    const ft = still ? 0 : clamp01(1.4 - md) * (0.5 + 0.5 * Math.min(1, state.mv)) * H2.amt;
    state.flare += (ft - state.flare) * 0.1; state.mv *= 0.94;
    post.uniforms.uFlare.value = state.flare;
    post.uniforms.uMouse.value.set(state.mouse.x * pr, (H - state.mouse.y) * pr);
    renderer.render(postScene, postCam);
  }

  let lastOut = null;
  // what's under a point on screen: an app sphere or a category (for clicks), front-most first
  function hit(x, y) {
    if (!lastOut) return null;
    const f = H / (2 * Math.tan(rad(camera.fov) / 2)), v = new Vector3();
    // the closest centre wins, measured in each sphere's own radius (an app overlapping a category's edge doesn't steal it)
    let best = null, bn = 1e9;
    L.forEach(a => {
      const c = C[a.c]; if (!a.vis || c.show < 0.5 || c.hide > 0.5 || a.s < 0.05) return;
      v.setFromMatrixPosition(a.m); world.localToWorld(v); const d = v.distanceTo(camera.position); v.project(camera);
      if (v.z > 1) return;
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H, r = a.s * f / d + 3, n = Math.hypot(px - x, py - y) / r;
      if (n < 1.15 && n < bn) { bn = n; best = { type: 'app', k: a.a.k, cat: c.k, i: a.c }; }
    });
    C.forEach((c, i) => {
      const q = lastOut.cats[c.k]; if (!q || q.on < 0.3 || !q.front || q.behind) return;
      const n = Math.hypot(q.x - x, q.y - y) / (q.r + 4);
      if (n < 1.25 && n < bn) { bn = n; best = { type: 'cat', k: c.k, i }; }
    });
    return best;
  }
  let raf = 0, running = false, visible = true, prev = 0;
  // at most 60 frames a second (120 Hz screens draw every other refresh); 30 when nothing moves
  let lastAt = 0;
  const loop = now => {
    if (running) raf = requestAnimationFrame(loop);
    const busy = tw.dur > 0 || now - state.lastMove < 1200 || state.glitch > 0.02 || state.open < 1 || now - lastJump < 900 || state.orbitW > 0.01 || state.ring.some(a => Math.abs(a % (Math.PI * 2)) > 1e-4);
    if (now - lastAt < (busy ? 15 : 31)) return;
    // too slow for this density (the frame itself, or the GPU holding back the next refresh): step the pixel ratio down
    const gap = now - lastAt; lastAt = now;
    const t0 = performance.now(); frame(now); const cost = performance.now() - t0;
    const late = cost > 20 || (busy && prev && gap > 27 && gap < 200);
    slow = late ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 8 && pr > 1) { prCap = Math.max(1, pr - 0.25); slow = 0; resize(); }
    prev = busy ? 1 : 0;
  };
  let lastJump = 0;
  let paused = false;
  function start() { if (!running && visible && !paused && !state.still) { running = true; raf = requestAnimationFrame(loop); } }
  function halt() { running = false; cancelAnimationFrame(raf); }
  let pend = 0, lastDraw = 0;
  function draw() {
    if (running) return;
    if (!lite) { frame(performance.now()); return; }
    // at most one software frame per 120 ms; the last change is always drawn
    const now = performance.now(), wait = 120 - (now - lastDraw);
    clearTimeout(pend);
    if (wait <= 0) { lastDraw = now; frame(now); }
    else pend = setTimeout(() => { lastDraw = performance.now(); frame(lastDraw); }, wait);
  }

  resize();
  addEventListener('resize', () => { resize(); draw(); });
  // the map's box can change without a window resize (a phone's toolbar, fonts, layout): follow it
  if (window.ResizeObserver) { let rw = 0, rh = 0; new ResizeObserver(() => { if (host.clientWidth !== rw || host.clientHeight !== rh) { rw = host.clientWidth; rh = host.clientHeight; resize(); fitCache.clear(); fullCache.clear(); draw(); } }).observe(host); }
  if (!state.still) {
    addEventListener('pointermove', e => {
      const dx = e.clientX - state.mouse.x, dy = e.clientY - state.mouse.y;
      if (state.mouse.x > -9000) state.mv = Math.min(1.5, state.mv + Math.hypot(dx, dy) / 120);
      state.lastMove = performance.now();
      state.mouse.set(e.clientX, e.clientY);
    }, { passive: true });
    new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (visible) start(); else halt(); })).observe(host);
    document.addEventListener('visibilitychange', () => { if (document.hidden) halt(); else start(); });
  }
  draw(); start();

  return {
    set progress(v) { setTarget(v); if (state.still) state.sp = state.p; draw(); },
    // scrubbing the rail: a quick move with the calm (fast) look
    scrub(v) { setTarget(v, true); if (state.still) state.sp = state.p; draw(); },
    get fast() { return isFast(); },
    // the loop back to the top: same view, so no flash
    quietJump(v) { state.p = state.sp = clamp01(v); tw.dur = 0; draw(); },
    get progress() { return state.p; },
    // jump without flying through everything in between
    jump(v) { state.p = state.sp = clamp01(v); tw.dur = 0; lastJump = performance.now(); C.forEach(c => { c.seeded = false; }); L.forEach(x => { x.seeded = false; }); state.glitch = 1; draw(); },
    get moving() { return tw.dur > 0; },
    set open(v) { state.open = v; draw(); },
    get open() { return state.open; },
    set hole(v) { Object.assign(state.hole, v); },
    // v9: You glows a little to say there's more below (the page turns it on after a pause on stages 1 and 2)
    set nudge(v) { v = !!v; if (v === state.nudge) return; state.nudge = v; draw(); },
    get nudge() { return state.nudge; },
    // v11: what's under a point (an app or a category), for clicks
    hit,
    get orbit() { return state.orbitW; },
    // the free space for a stop, in px from the top of the stage: under the header, above the tour copy
    set frame(v) { state.frame = v; fitCache.clear(); fullCache.clear(); draw(); },
    glitch(v) { state.glitch = Math.max(state.glitch, v == null ? 1 : v); },
    set pose(v) { state.pose = v; draw(); },
    get state() { return last; },
    // a full-screen frame covers the map (Start Now): stop drawing until it closes
    set paused(v) { paused = !!v; if (paused) halt(); else { start(); draw(); } },
    resize() { resize(); draw(); },
    draw,
    // other categories' spheres still drawn inside the focused cluster's box (v8 check: none once settled)
    occluders() {
      const A = state.active; if (A < 0) return [];
      const fb = clusterBox(A, 0); if (!fb) return [];
      const out = [], f = H / (2 * Math.tan(rad(camera.fov) / 2));
      const test = (p, r, k) => {
        cbV.copy(p); world.localToWorld(cbV); const d = cbV.distanceTo(camera.position); cbV.project(camera);
        if (cbV.z > 1 || r < 0.02) return;
        const x = (cbV.x * 0.5 + 0.5) * W, y = (-cbV.y * 0.5 + 0.5) * H, rp = r * f / d;
        if (x + rp > fb[0] && x - rp < fb[2] && y + rp > fb[1] && y - rp < fb[3]) out.push(k);
      };
      C.forEach((c, i) => {
        if (i === A || c.show < 0.02) return;
        const e = new Matrix4(); catSet.im.getMatrixAt(i, e); const sc = new Vector3().setFromMatrixScale(e).x;
        test(new Vector3().setFromMatrixPosition(e), sc, 'cat-' + c.k);
        tipsOf[i].forEach(x => { if (x.vis) test(new Vector3().setFromMatrixPosition(x.m), x.s, x.a.k); });
      });
      return out;
    },
    // screen boxes of the visible, in-focus spheres (apps, categories, the sun), for layout checks
    rects() {
      const out = [];
      const box = (center, r, k, g) => {
        const p0 = (tmp.copy(center), world.localToWorld(tmp), tmp.clone().project(camera));
        const p1 = tmp2.copy(center).addScaledVector(camera.up, r); world.localToWorld(p1); p1.project(camera);
        const x = (p0.x * 0.5 + 0.5) * W, y = (-p0.y * 0.5 + 0.5) * H, rr = Math.abs((p1.y - p0.y) * 0.5 * H) * 1.02;
        if (p0.z < 1) out.push({ k, g, x0: x - rr, y0: y - rr, x1: x + rr, y1: y + rr });
      };
      L.forEach(x => { if (x.vis && C[x.c].focus > 0.5) box(new Vector3().setFromMatrixPosition(x.m), x.s, x.a.k, x.a.cat); });
      C.forEach(c => { if (c.show > 0.5 && c.focus > 0.5) box(orb(c, new Vector3().copy(c.P).add(c.off).setY(c.P.y + c.off.y + c.bob)), CAT_R * 0.9, 'cat-' + c.k, c.k); });
      box(new Vector3(), sun.scale.x, 'you', 'you');
      return out;
    },
  };
}
