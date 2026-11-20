import { AdditiveBlending, BufferAttribute, BufferGeometry, Euler, Matrix3, Matrix4, PerspectiveCamera, Points, Scene, ShaderMaterial, Vector3, WebGLRenderer } from 'three';

/**
 * Rostro de partículas del cierre (sección Contacto).
 *
 * Cada partícula nace en una celda de la rejilla del fondo (misma celda de 14 px y mismo píxel neón
 * que PixelField) y, con el scroll, viaja en arco hasta su punto en el rostro. A la vez PixelField
 * se apaga en la misma proporción: se lee como si el fondo migrara y construyera la cara.
 *
 * El muestreo sale de dos imágenes livianas (retrato + mapa de profundidad): la densidad mezcla la
 * luz de la foto con un sombreado de relieve calculado del mapa de profundidad; el lado del circuito
 * se clasifica por color (cobre, neón) y recibe pulsos de corriente.
 */

export interface FaceOptions {
  section: HTMLElement;
  lite: boolean;
  /** Capa DOM con nodos HUD numerados que siguen la proyección del rostro. */
  hud?: HTMLElement;
  onProgress?: (t: number) => void;
}

export interface FaceHandle {
  destroy(): void;
}

const CELL = 14; // misma rejilla que PixelField
const KIND = { skin: 0, copper: 1, neon: 2, dust: 3, led: 4 } as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

async function loadPixels(src: string, n: number): Promise<Uint8ClampedArray> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, n, n);
  return ctx.getImageData(0, 0, n, n).data;
}

/** Desenfoque de caja separable (para contraste local), sin depender de ctx.filter. */
function boxBlur(src: Float32Array, n: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const w = 2 * r + 1;
  for (let y = 0; y < n; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * n + Math.min(n - 1, Math.max(0, x))];
    for (let x = 0; x < n; x++) {
      tmp[y * n + x] = acc / w;
      acc += src[y * n + Math.min(n - 1, x + r + 1)] - src[y * n + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < n; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(n - 1, Math.max(0, y)) * n + x];
    for (let y = 0; y < n; y++) {
      out[y * n + x] = acc / w;
      acc += tmp[Math.min(n - 1, y + r + 1) * n + x] - tmp[Math.max(0, y - r) * n + x];
    }
  }
  return out;
}

interface Sample {
  target: Float32Array;
  kind: Float32Array;
  lum: Float32Array;
  count: number;
  depth: (u: number, v: number) => number;
}

/** Muestrea el rostro: densidad ponderada por luz + relieve + rasgos; clasifica circuito/neón/polvo. */
async function sampleFace(count: number): Promise<Sample> {
  const N = 320;
  const [rgb, dep] = await Promise.all([loadPixels('/face/portrait.webp', N), loadPixels('/face/depth.webp', N)]);
  const L = new Float32Array(N * N);
  const D = new Float32Array(N * N);
  const H = new Float32Array(N * N);
  const Sat = new Float32Array(N * N);
  const Mx = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = rgb[i * 4] / 255;
    const g = rgb[i * 4 + 1] / 255;
    const b = rgb[i * 4 + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const dl = Math.max(mx - mn, 1e-5);
    L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    Mx[i] = mx;
    Sat[i] = mx > 0 ? (mx - mn) / mx : 0;
    let h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
    h *= 60;
    H[i] = h < 0 ? h + 360 : h;
    D[i] = dep[i * 4] / 255;
  }
  const blur = boxBlur(L, N, 3);

  // Estira la luz dentro del primer plano (piel oscura: sin esto la cara queda rala)
  const fgL: number[] = [];
  for (let i = 0; i < N * N; i += 3) if (D[i] > 0.06) fgL.push(L[i]);
  fgL.sort((a, b) => a - b);
  const lo = fgL[Math.floor(fgL.length * 0.05)] ?? 0;
  const hi = fgL[Math.floor(fgL.length * 0.985)] ?? 1;

  const weight = new Float32Array(N * N);
  const kindMap = new Uint8Array(N * N);
  const lumMap = new Float32Array(N * N);
  const light = new Vector3(-0.55, 0.6, 0.6).normalize();
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      const u = x / N;
      const v = y / N;
      const d = D[i];
      const fg = d > 0.06;
      // Relieve: normal desde el gradiente del mapa de profundidad
      const dx = (D[i + 1] - D[i - 1]) * 6;
      const dy = (D[i + N] - D[i - N]) * 6;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const shade = Math.max(0, (-dx * light.x + dy * light.y + light.z) * inv);
      const ln = clamp01((L[i] - lo) / Math.max(1e-3, hi - lo));
      const edge = Math.min(1, Math.hypot(L[i + 1] - L[i - 1], L[i + N] - L[i - N]) * 6);
      const lc = L[i] - blur[i];

      const neon = u > 0.55 && v < 0.74 && Sat[i] > 0.55 && (H[i] < 14 || H[i] > 340) && Mx[i] > 0.45;
      const copper = !neon && u > 0.5 && u < 0.72 && v > 0.18 && v < 0.9 && H[i] > 12 && H[i] < 45 && Sat[i] > 0.35 && lc > 0.035 && L[i] > 0.22;
      const dust = !fg && u > 0.55 && L[i] > 0.18;

      let w = 0;
      let k: number = KIND.skin;
      if (fg) {
        // Hombros y torso se desvanecen hacia abajo; el rostro manda
        const body = 1 - smooth(0.74, 0.98, v);
        w = (0.36 + 0.42 * ln + 0.3 * shade) * (0.8 + edge * 1.5) * body;
        lumMap[i] = clamp01(0.58 * Math.pow(ln, 0.85) + 0.42 * shade * shade);
      }
      if (copper) {
        w = 2.6;
        k = KIND.copper;
        lumMap[i] = 1;
      } else if (neon) {
        w = 2.2;
        k = KIND.neon;
        lumMap[i] = 1;
      } else if (dust) {
        w = 1.6;
        k = KIND.dust;
        lumMap[i] = clamp01(L[i] * 1.6);
      }
      weight[i] = w;
      kindMap[i] = k;
    }
  }

  // Muestreo ponderado (acumulada + búsqueda binaria)
  const cum = new Float32Array(N * N);
  let total = 0;
  for (let i = 0; i < N * N; i++) {
    total += weight[i];
    cum[i] = total;
  }
  const extraDust = Math.floor(count * 0.06);
  const leds = 18;
  const main = count - extraDust - leds;
  const target = new Float32Array(count * 3);
  const kind = new Float32Array(count);
  const lum = new Float32Array(count);
  const depthAt = (u: number, v: number) => D[Math.min(N - 1, Math.floor(v * N)) * N + Math.min(N - 1, Math.floor(u * N))];
  const put = (j: number, u: number, v: number, z: number, k: number, l: number) => {
    target[j * 3] = u - 0.5;
    target[j * 3 + 1] = 0.5 - v;
    target[j * 3 + 2] = z;
    kind[j] = k;
    lum[j] = l;
  };
  for (let j = 0; j < main; j++) {
    const r = Math.random() * total;
    let a = 0;
    let b = cum.length - 1;
    while (a < b) {
      const m = (a + b) >> 1;
      if (cum[m] < r) a = m + 1;
      else b = m;
    }
    const x = a % N;
    const y = (a / N) | 0;
    const u = (x + Math.random()) / N;
    const v = (y + Math.random()) / N;
    const k = kindMap[a];
    const z = k === KIND.dust ? 0.05 + Math.random() * 0.25 : (D[a] - 0.45) * 0.42;
    put(j, u, v, z, k, lumMap[a]);
  }
  // Polvo extra: se desprende del lado del circuito hacia arriba a la derecha
  for (let j = main; j < main + extraDust; j++) {
    const u = 0.56 + Math.pow(Math.random(), 0.7) * 0.42;
    const v = 0.04 + Math.random() * 0.62;
    put(j, u, v, (Math.random() - 0.3) * 0.3, KIND.dust, 0.3 + Math.random() * 0.7);
  }
  // LEDs de estado verdes (el de la sien del retrato y uno en la mandíbula)
  const ledAt = [
    [0.643, 0.271],
    [0.62, 0.6],
  ];
  for (let j = main + extraDust; j < count; j++) {
    const [lu, lv] = ledAt[(j - main - extraDust) % 2];
    const u = lu + (Math.random() - 0.5) * 0.006;
    const v = lv + (Math.random() - 0.5) * 0.006;
    put(j, u, v, (depthAt(u, v) - 0.45) * 0.42 + 0.01, KIND.led, 1);
  }
  return { target, kind, lum, count, depth: depthAt };
}

const vertex = /* glsl */ `
  attribute vec3 aTarget;
  attribute vec2 aCell;
  attribute float aSeed;
  attribute float aKind;
  attribute float aLum;
  uniform float uT;
  uniform float uTime;
  uniform vec2 uView;
  uniform float uCell;
  uniform vec2 uHalf;
  uniform vec3 uCenter;
  uniform float uScale;
  uniform mat3 uRot;
  uniform float uPR;
  uniform float uCamZ;
  varying float vE;
  varying float vKind;
  varying float vLum;
  varying float vSeed;
  varying float vY;
  varying float vFade;
  void main() {
    // Origen: la celda de la rejilla del fondo en px CSS → plano z = 0
    vec2 cols = max(floor(uView / uCell), vec2(1.0));
    vec2 cell = (floor(aCell * cols) + 0.5) * uCell;
    vec3 start = vec3((cell.x / uView.x * 2.0 - 1.0) * uHalf.x, -(cell.y / uView.y * 2.0 - 1.0) * uHalf.y, 0.0);
    vec3 tgt = uCenter + uRot * (aTarget * uScale);

    // Llegada escalonada: primero el circuito, luego la piel, al final el polvo
    float order = aKind == 1.0 || aKind == 2.0 ? 0.0 : aKind == 3.0 ? 0.32 : 0.12;
    float delay = order + aSeed * 0.38;
    float k = clamp((uT - delay) / 0.5, 0.0, 1.0);
    float e = k * k * (3.0 - 2.0 * k);
    vec3 p = mix(start, tgt, e);
    // Vuelo en arco: sube hacia la cámara y remolinea
    float fl = sin(e * 3.14159);
    p.z += fl * (0.9 + aSeed * 1.6);
    p.xy += fl * vec2(sin(aSeed * 40.0 + uTime * 0.7), cos(aSeed * 31.0 + uTime * 0.6)) * 0.45 * uScale * 0.2;
    // Vida en reposo
    p += e * vec3(sin(uTime * 1.3 + aSeed * 50.0), cos(uTime * 1.1 + aSeed * 70.0), 0.0) * 0.004 * uScale;
    vFade = 1.0;
    if (aKind == 3.0) {
      // El polvo sigue desprendiéndose hacia afuera y se apaga
      float dr = fract(uTime * 0.035 + aSeed * 3.0);
      p += e * uRot * vec3(dr * 0.22, dr * 0.12, dr * 0.05) * uScale;
      vFade = 1.0 - dr;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float base = aKind == 2.0 ? 3.6 : aKind == 4.0 ? 5.0 : aKind == 1.0 ? 2.8 : aKind == 3.0 ? 1.8 + aLum : 1.7 + aLum * 2.0;
    float sz = mix(2.0, base * clamp(uScale / 4.5, 0.6, 1.6), e);
    gl_PointSize = sz * uPR * (uCamZ / max(-mv.z, 0.5));
    vE = e;
    vKind = aKind;
    vLum = aLum;
    vSeed = aSeed;
    vY = aTarget.y;
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uStartAlpha;
  uniform vec3 uNeon;
  uniform vec3 uIvory;
  uniform vec3 uCopper;
  uniform vec3 uPcb;
  varying float vE;
  varying float vKind;
  varying float vLum;
  varying float vSeed;
  varying float vY;
  varying float vFade;
  void main() {
    // Cuadrado nítido (píxel del fondo) que se vuelve punto suave al llegar
    vec2 q = gl_PointCoord - 0.5;
    float sq = max(abs(q.x), abs(q.y));
    float rd = length(q);
    float dist = mix(sq, rd, vE);
    if (dist > 0.5) discard;
    float soft = mix(1.0, 1.0 - smoothstep(0.1, 0.5, rd), vE);

    vec3 col;
    float a;
    if (vKind == 1.0) {
      // Cobre con pulsos de corriente que suben por el circuito
      float pulse = smoothstep(0.93, 1.0, fract(vY * 1.8 - uTime * 0.42 + vSeed * 0.12));
      col = mix(uCopper * 1.25, uNeon * 3.2, pulse);
      a = 0.85;
    } else if (vKind == 2.0) {
      col = uNeon * (1.8 + 1.2 * sin(uTime * 3.0 + vSeed * 20.0));
      a = 0.9;
    } else if (vKind == 4.0) {
      col = uPcb * (1.6 + 0.8 * step(0.5, fract(uTime * 0.7 + vSeed)));
      a = 1.0;
    } else if (vKind == 3.0) {
      col = mix(uIvory * 0.8, uNeon * 1.6, step(0.72, vSeed));
      a = vLum * vFade * 0.75;
    } else {
      col = uIvory * (0.16 + 0.95 * vLum);
      a = 0.42 + 0.58 * vLum;
    }
    // Barrido HUD de escaneo, solo con el rostro armado
    float scanY = 0.55 - fract(uTime * 0.09) * 1.3;
    float band = exp(-pow((vY - scanY) * 16.0, 2.0));
    col += uIvory * band * 0.55 * vE;
    // Mientras viaja conserva el neón del fondo y su opacidad
    vec3 c = mix(uNeon, col, smoothstep(0.0, 0.6, vE));
    float alpha = mix(uStartAlpha, a, smoothstep(0.0, 0.5, vE)) * soft;
    gl_FragColor = vec4(c * alpha, alpha);
  }
`;

export async function mountFace(o: FaceOptions): Promise<FaceHandle> {
  const { section, lite } = o;
  const count = lite ? 8000 : 24000;
  const sample = await sampleFace(count);

  const renderer = new WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  let dpr = Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr);
  const canvas = renderer.domElement;
  canvas.className = 'face-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const scene = new Scene();
  const CAMZ = 10;
  const camera = new PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, CAMZ);

  const geo = new BufferGeometry();
  const cells = new Float32Array(count * 2);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    cells[i * 2] = Math.random();
    cells[i * 2 + 1] = Math.random();
    seeds[i] = Math.random();
  }
  // position solo para el bounding (el shader calcula la posición real)
  geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aTarget', new BufferAttribute(sample.target, 3));
  geo.setAttribute('aCell', new BufferAttribute(cells, 2));
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  geo.setAttribute('aKind', new BufferAttribute(sample.kind, 1));
  geo.setAttribute('aLum', new BufferAttribute(sample.lum, 1));

  // El canvas compone directo sobre la página (sin pase final): colores en sRGB, como el CSS.
  const srgb = (hex: number) => new Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  const uniforms = {
    uT: { value: 0 },
    uTime: { value: 0 },
    uView: { value: [window.innerWidth, window.innerHeight] as [number, number] },
    uCell: { value: CELL },
    uHalf: { value: [1, 1] as [number, number] },
    uCenter: { value: new Vector3() },
    uScale: { value: 4 },
    uRot: { value: new Matrix3() },
    uPR: { value: dpr },
    uCamZ: { value: CAMZ },
    uStartAlpha: { value: 0.28 },
    uNeon: { value: srgb(0xff2a44) },
    uIvory: { value: srgb(0xece6d9) },
    uCopper: { value: srgb(0xd4823f) },
    uPcb: { value: srgb(0x1db46e) },
  };
  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  /* ---------------- Nodos HUD (referencia igloo.inc) ---------------- */
  const ANCHORS = [
    [0.585, 0.385],
    [0.643, 0.271],
    [0.69, 0.47],
    [0.6, 0.66],
  ];
  const anchorLocal = ANCHORS.map(([u, v]) => new Vector3(u - 0.5, 0.5 - v, (sample.depth(u, v) - 0.45) * 0.42));
  const nodeEls = o.hud ? Array.from(o.hud.querySelectorAll<HTMLElement>('[data-face-node]')) : [];
  const linkEl = o.hud?.querySelector<SVGPolylineElement>('[data-face-links]') ?? null;
  const proj = new Vector3();
  const placeHud = () => {
    if (!o.hud || vw < 768) return;
    const on = t > 0.9;
    o.hud.classList.toggle('is-on', on);
    if (!on) return;
    const pts: string[] = [];
    anchorLocal.forEach((a, i) => {
      proj.copy(a).multiplyScalar(uniforms.uScale.value).applyMatrix3(rot).add(uniforms.uCenter.value).project(camera);
      const x = (proj.x * 0.5 + 0.5) * vw;
      const y = (0.5 - proj.y * 0.5) * vh;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      // Etiqueta desplazada hacia afuera del rostro para no tapar rasgos
      const el = nodeEls[i];
      if (el) el.style.transform = `translate(${(x + 14).toFixed(1)}px, ${(y - 6).toFixed(1)}px)`;
    });
    linkEl?.setAttribute('points', pts.join(' '));
  };

  /* ---------------- Estado ---------------- */
  let target = 0;
  let t = 0;
  let time = 0;
  let raf = 0;
  let last = performance.now();
  let destroyed = false;
  let near = false;
  let pageVisible = document.visibilityState !== 'hidden';
  let paused = document.querySelector<HTMLElement>('[data-hero]')?.dataset.motion === 'paused';
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  const rot = new Matrix3();
  const m4 = new Matrix4();
  const eul = new Euler();
  let vw = window.innerWidth;
  let vh = window.innerHeight;

  const resize = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    const halfH = CAMZ * Math.tan((camera.fov * Math.PI) / 360);
    uniforms.uHalf.value = [halfH * camera.aspect, halfH];
    uniforms.uView.value = [vw, vh];
  };
  resize();

  const measure = () => {
    const r = section.getBoundingClientRect();
    // 0 cuando Contacto asoma por abajo; 1 cuando su borde superior llega arriba
    target = clamp01((vh * 1.05 - r.top) / (vh * 0.95));
    near = r.top < vh * 2 && r.bottom > -vh * 0.2;
    return r;
  };

  const place = (r: DOMRect) => {
    const [hw, hh] = uniforms.uHalf.value;
    const mobile = vw < 768;
    const sizePx = mobile ? Math.min(vw * 0.98, vh * 0.56) : Math.min(vh * 0.86, Math.max(r.height, vh) * 0.9, vw * 0.44);
    const cx = mobile ? vw * 0.5 : vw * 0.72;
    const cy = mobile ? r.top + vh * 0.29 : r.top + Math.max(r.height, vh) * 0.5;
    uniforms.uCenter.value.set((cx / vw) * 2 * hw - hw, -((cy / vh) * 2 * hh - hh), 0);
    uniforms.uScale.value = (sizePx / vh) * 2 * hh;
  };

  const frame = (dt: number) => {
    const r = measure();
    t += (target - t) * (1 - Math.exp(-dt * 4));
    if (Math.abs(target - t) < 1e-4) t = target;
    place(r);
    mouse.sx += (mouse.x - mouse.sx) * (1 - Math.exp(-dt * 3));
    mouse.sy += (mouse.y - mouse.sy) * (1 - Math.exp(-dt * 3));
    // Compensa la perspectiva (el rostro está a un lado): mira a la cámara, y el cursor lo gira levemente.
    const c = uniforms.uCenter.value;
    // Ry(θ) gira la normal +Z hacia +X: para mirar a la cámara (en el origen) el signo es opuesto a x.
    const faceYaw = -Math.atan2(c.x, CAMZ);
    const facePitch = Math.atan2(c.y, CAMZ);
    eul.set(facePitch + mouse.sy * 0.14 + Math.sin(time * 0.4) * 0.02, faceYaw + mouse.sx * 0.26 + Math.sin(time * 0.27) * 0.05, 0);
    m4.makeRotationFromEuler(eul);
    rot.setFromMatrix4(m4);
    uniforms.uRot.value.copy(rot);
    uniforms.uT.value = t;
    uniforms.uTime.value = time;
    o.onProgress?.(t);
    canvas.style.opacity = t > 0.001 ? '1' : '0';
    renderer.render(scene, camera);
    placeHud();
  };

  const running = () => !destroyed && near && pageVisible && !paused;
  const loop = (now: number) => {
    raf = 0;
    if (!running()) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    frame(dt);
  };
  const kick = () => {
    measure();
    if (!raf && running()) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    } else if (paused && near) {
      // Pausa: sin animación temporal, pero el rostro sigue el scroll
      t = target;
      frame(0);
    }
  };

  const onScroll = () => kick();
  const onResize = () => {
    resize();
    kick();
  };
  const onPointer = (e: PointerEvent) => {
    mouse.x = (e.clientX / vw) * 2 - 1;
    mouse.y = (e.clientY / vh) * 2 - 1;
  };
  const onVisibility = () => {
    pageVisible = document.visibilityState !== 'hidden';
    kick();
  };
  const onMotion = (e: Event) => {
    paused = Boolean((e as CustomEvent<{ paused: boolean }>).detail?.paused);
    kick();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('hero:motion', onMotion);
  document.addEventListener('visibilitychange', onVisibility);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('hero:motion', onMotion);
    document.removeEventListener('visibilitychange', onVisibility);
    o.onProgress?.(0);
    o.hud?.classList.remove('is-on');
    geo.dispose();
    mat.dispose();
    renderer.dispose();
    canvas.remove();
  };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    destroy();
  });

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__face = { uniforms, renderer, setDpr: (d: number) => ((dpr = d), renderer.setPixelRatio(d), (uniforms.uPR.value = d), resize()) };

  kick();
  return { destroy };
}
