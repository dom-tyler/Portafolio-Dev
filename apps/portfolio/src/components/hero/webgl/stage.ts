import {
  CatmullRomCurve3,
  LinearSRGBColorSpace,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
  type ShaderMaterial,
} from 'three';
import { buildBoard, type Board } from './board';
import { buildComposer, buildDust, Sparks } from './fx';
import { mulberry32 } from './geometry';
import { shared } from './materials';
import { C } from './palette';
import { buildServices, FLOOR_Y, type Services } from './services';
import { loadFonts } from './textures';

export interface FrameInfo {
  progress: number;
  scene: 1 | 2 | 3;
  fps: number;
  dpr: number;
  cam: Vector3;
}

export interface StageOptions {
  hero: HTMLElement;
  container: HTMLElement;
  onLoad?: (pct: number, step: string) => void;
  onFrame?: (info: FrameInfo) => void;
  onError?: (err: unknown) => void;
}

export interface StageHandle {
  destroy(): void;
}

/* ------------------------------------------------------------------ */
/* Toma continua: claves de cámara indexadas por progreso de scroll       */
/* ------------------------------------------------------------------ */
interface Key {
  p: number;
  pos: [number, number, number];
  tgt: [number, number, number];
  fov: number;
}

// Encuadres resueltos con proyección: el foco 3D vive en el ~45 % derecho, libre del titular
// y por encima de la lista de escenas.
const KEYS: Key[] = [
  { p: 0.0, pos: [7.4, 9.4, 11.4], tgt: [-3.8, -1.8, 2.0], fov: 32 },
  { p: 0.16, pos: [5.4, 6.6, 7.6], tgt: [-2.6, -1.0, 1.3], fov: 34 },
  { p: 0.3, pos: [2.6, 3.4, 3.6], tgt: [-0.9, -0.2, 0.5], fov: 36 },
  { p: 0.38, pos: [0.42, 1.35, 0.78], tgt: [-0.05, 0.3, 0.02], fov: 40 },
  { p: 0.43, pos: [0.02, -0.25, 0.12], tgt: [0.0, -3.2, -0.9], fov: 46 },
  { p: 0.5, pos: [2.0, -3.3, 7.2], tgt: [0.9, -5.9, -0.4], fov: 42 },
  { p: 0.6, pos: [2.6, -5.0, 11.8], tgt: [0.5, -6.4, 0.0], fov: 38 },
  { p: 0.7, pos: [3.2, -3.4, 12.8], tgt: [0.5, -7.8, 0.3], fov: 38 },
  { p: 0.86, pos: [3.6, -1.6, 13.4], tgt: [0.6, -8.9, 0.6], fov: 38 },
  { p: 1.0, pos: [3.5, -1.5, 13.5], tgt: [0.6, -8.9, 0.6], fov: 38 },
];

const posCurve = new CatmullRomCurve3(KEYS.map((k) => new Vector3(...k.pos)), false, 'centripetal');
const tgtCurve = new CatmullRomCurve3(KEYS.map((k) => new Vector3(...k.tgt)), false, 'centripetal');

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function sampleCamera(p: number, pos: Vector3, tgt: Vector3): number {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const u = clamp01((p - a.p) / (b.p - a.p));
  // Mezcla de lineal y suavizado: velocidad continua, con leve asentamiento en cada clave.
  const uu = lerp(u, u * u * (3 - 2 * u), 0.55);
  const t = (i + uu) / (KEYS.length - 1);
  posCurve.getPoint(t, pos);
  tgtCurve.getPoint(t, tgt);
  return lerp(a.fov, b.fov, uu);
}

/** Cede el hilo entre pasos de construcción. Con la pestaña oculta rAF no corre: el timeout evita quedarse colgado. */
const nextFrame = () =>
  new Promise<void>((r) => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        r();
      }
    };
    requestAnimationFrame(go);
    setTimeout(go, 100);
  });

/* ------------------------------------------------------------------ */

export async function mountStage(o: StageOptions): Promise<StageHandle> {
  const { hero, container } = o;
  const report = (pct: number, step: string) => o.onLoad?.(pct, step);

  report(0.06, 'FUENTES');
  await loadFonts();

  report(0.14, 'CONTEXTO');
  const renderer = new WebGLRenderer({ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
  // El pase final hace tone mapping y sRGB: el renderer trabaja en lineal de punta a punta
  // (si no, RenderPass limpia con el color de fondo ya codificado en sRGB y levanta los negros).
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(C.graphite, 1);
  const maxDpr = Math.min(window.devicePixelRatio || 1, 1.75);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'webgl-canvas';
  container.appendChild(canvas);
  let w = container.clientWidth || window.innerWidth;
  let h = container.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const camera = new PerspectiveCamera(36, w / h, 0.03, 90);

  await nextFrame();
  report(0.32, 'PLACA');
  const board: Board = buildBoard(aniso);
  scene.add(board.group);

  await nextFrame();
  report(0.56, 'INTERFAZ');
  const dieUniforms = board.die.uniforms;
  const services: Services = buildServices(aniso, dieUniforms.uMap.value, dieUniforms.uGlow.value);
  scene.add(services.group);

  const dust = buildDust();
  const sparks = new Sparks();
  scene.add(dust, sparks.points);

  await nextFrame();
  report(0.72, 'SHADERS');
  const { composer, finish, fxaa } = buildComposer(renderer, scene, camera, w, h);
  fxaa.enabled = dpr < 1.5;
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  finish.uniforms.uAspect.value = w / h;
  const pointMats = [dust.material, sparks.points.material] as ShaderMaterial[];
  pointMats.forEach((m) => (m.uniforms.uPixelRatio.value = dpr * (h / 900)));

  // Compila con todo visible para que no haya tirones al cambiar de escena.
  sampleCamera(0, camera.position, tmpTgt);
  camera.lookAt(tmpTgt);
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    renderer.compile(scene, camera);
  }

  report(0.92, 'SEÑAL');

  /* ---------------- Estado ---------------- */
  let target = Number(getComputedStyle(hero).getPropertyValue('--hero-p')) || 0;
  let progress = target;
  let paused = hero.dataset.motion === 'paused';
  let inView = true;
  let pageVisible = document.visibilityState !== 'hidden';
  let destroyed = false;
  let raf = 0;
  let last = performance.now();
  let time = 0;
  let bootAt = -1;
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  const rand = mulberry32(1234);
  let flickerUntil = -1;
  let nextFlicker = 1.6;
  let arcTick = 0;
  let flicker = 0;
  let frames = 0;
  let acc = 0;
  let fps = 60;
  let infoTick = 0;
  let sceneN: 1 | 2 | 3 = 1;

  const tgt = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const tmp = new Vector3();

  const apply = (dt: number) => {
    const p = progress;
    sceneN = p < 1 / 3 ? 1 : p < 2 / 3 ? 2 : 3;
    shared.uTime.value = time;

    // Cámara + parallax del mouse
    camera.fov = sampleCamera(p, camera.position, tgt);
    mouse.sx += (mouse.x - mouse.sx) * (1 - Math.exp(-dt * 3));
    mouse.sy += (mouse.y - mouse.sy) * (1 - Math.exp(-dt * 3));
    camera.lookAt(tgt);
    right.setFromMatrixColumn(camera.matrix, 0);
    up.setFromMatrixColumn(camera.matrix, 1);
    const dist = camera.position.distanceTo(tgt);
    const k = Math.min(0.35, 0.02 + dist * 0.022);
    camera.position.addScaledVector(right, mouse.sx * k).addScaledVector(up, -mouse.sy * k * 0.6);
    camera.lookAt(tgt);
    camera.updateProjectionMatrix();

    // Cruce del die
    const camY = camera.position.y;
    const aboveDie = camY > board.dieTop + 0.015;
    const dy = camY - board.dieTop;
    const nearDie = p > 0.32 && p < 0.5;
    const flash = nearDie ? Math.exp(-(dy * dy) / 0.02) * 0.4 : 0;
    const heat = sm(0.33, 0.425, p) * (aboveDie ? 1 : 0);
    finish.uniforms.uFlash.value = flash;
    finish.uniforms.uTime.value = time % 10;
    board.group.visible = aboveDie;
    sparks.points.visible = aboveDie;
    services.group.visible = p > 0.36;

    // Corriente: arranque tras la carga
    const boot = bootAt < 0 ? 0 : sm(0, 1.4, time - bootAt);
    shared.uCurrent.value = boot;

    // Parpadeo de arco en el die
    if (time > nextFlicker && flickerUntil < 0 && board.group.visible) {
      flickerUntil = time + 0.22 + rand() * 0.25;
      sparks.burst(tmp.set((rand() - 0.5) * 0.6, board.dieTop, (rand() - 0.5) * 0.6), 10, 0.7);
    }
    if (flickerUntil > 0) {
      arcTick -= dt;
      if (arcTick <= 0) {
        arcTick = 0.045;
        flicker = rand() > 0.35 ? 0.4 + rand() * 0.6 : 0;
        board.updateArcs(rand);
      }
      if (time > flickerUntil) {
        flickerUntil = -1;
        flicker = 0;
        nextFlicker = time + 1.8 + rand() * 3.2;
      }
    }
    board.die.uniforms.uFlicker.value = flicker * boot;
    board.die.uniforms.uHeat.value = heat;
    board.arcMat.opacity = flicker * boot;
    services.llmDie.uniforms.uFlicker.value = 0;

    // Luz neón: del die (escena 1) al grafo (escena 3)
    const below = sm(0.42, 0.55, p);
    shared.uNeonLightPos.value.set(lerp(0, 5.8, below), lerp(0.55, FLOOR_Y + 1.4, below), lerp(0, 0.6, below));
    shared.uNeonLight.value = lerp(0.5 + flicker * 2.5 + heat * 3, 0.8, below) * boot;

    // Niebla según la distancia de trabajo
    shared.uFogNear.value = lerp(lerp(9, 2.5, sm(0.28, 0.4, p)), 9, sm(0.44, 0.6, p));
    shared.uFogFar.value = lerp(lerp(30, 12, sm(0.28, 0.4, p)), 28, sm(0.44, 0.6, p));

    // Chispas donde terminan los pulsos
    if (board.group.visible && boot > 0.5) {
      for (const tr of board.traces) {
        const period = tr.len + 5 + tr.seed * 4;
        const head = (time * Math.abs(tr.speed) + tr.seed * 37) % period;
        if (tr.last < tr.len && head >= tr.len && head - tr.last < 1) {
          sparks.burst(tr.speed > 0 ? tr.end : tr.start, 6, 0.8);
        }
        tr.last = head;
      }
    }
    sparks.update(dt);

    // Escena 2: paneles que nacen como pista y se despliegan
    services.panels.forEach((pn, i) => {
      const wv = sm(0.43 + i * 0.02, 0.47 + i * 0.02, p);
      const rv = sm(0.46 + i * 0.02, 0.53 + i * 0.02, p);
      const mv = sm(0.665 + i * 0.022, 0.78 + i * 0.022, p);
      const em = ease(mv);
      pn.mat.uniforms.uWidth.value = wv;
      pn.mat.uniforms.uReveal.value = rv;
      pn.mat.uniforms.uContent.value = 1 - sm(0, 0.55, mv);
      const op = wv * (1 - sm(0.82, 1, mv));
      pn.mat.uniforms.uOpacity.value = op;
      pn.mesh.visible = op > 0.002;
      // Primero se encoge de pie, luego se acuesta y aterriza sobre su nodo.
      pn.mesh.position.lerpVectors(pn.from.pos, pn.to.pos, em);
      pn.mesh.position.y += Math.sin(time * 0.7 + i * 1.7) * 0.035 * (1 - em);
      pn.mesh.quaternion.slerpQuaternions(pn.from.quat, pn.to.quat, ease(sm(0.35, 1, mv)));
      pn.mesh.scale.lerpVectors(pn.from.scale, pn.to.scale, ease(sm(0, 0.6, mv)));
    });
    services.riserMat.uniforms.uReveal.value = sm(0.405, 0.5, p) * services.riserLen;
    const riserOp = 1 - sm(0.66, 0.74, p);
    services.riserMat.uniforms.uOpacity.value = riserOp;
    services.risers.visible = p > 0.4 && riserOp > 0.01;
    services.gridMat.uniforms.uOpacity.value = sm(0.45, 0.6, p);

    // Escena 3: grafo de servicios
    services.nodes.forEach((nd, j) => {
      let grow: number;
      if (!nd.fresh) {
        const pi = services.panels.findIndex((pn) => pn.nodeIndex === j);
        grow = sm(0.665 + pi * 0.022 + 0.06, 0.78 + pi * 0.022 + 0.02, p);
      } else grow = sm(0.76 + j * 0.012, 0.86 + j * 0.012, p);
      nd.group.visible = grow > 0.002;
      nd.group.scale.set(1, Math.max(grow, 0.002), 1);
      nd.labelMat.opacity = sm(0.79 + j * 0.008, 0.85 + j * 0.008, p);
      nd.label.visible = nd.labelMat.opacity > 0.01;
    });
    services.edgeMat.uniforms.uReveal.value = sm(0.73, 0.9, p) * services.edgeLen;
    services.edges.visible = p > 0.725;
    services.llmDie.uniforms.uHeat.value = 0;

    // Polvo
    (dust.material as ShaderMaterial).uniforms.uOpacity.value = 0.6 + 0.4 * sm(0.4, 0.6, p);
  };

  const render = () => {
    composer.render();
  };

  /* ---------------- Bucle ---------------- */
  const running = () => !destroyed && !paused && inView && pageVisible;

  const loop = (now: number) => {
    if (!running()) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    progress += (target - progress) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(target - progress) < 1e-4) progress = target;
    apply(dt);
    render();

    // Rendimiento: FPS medio y DPR adaptativo (solo baja)
    frames++;
    acc += dt;
    if (acc >= 1.5) {
      fps = frames / acc;
      if (fps < 45 && dpr > 1 && time > 3) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
        fxaa.enabled = dpr < 1.5;
      }
      frames = 0;
      acc = 0;
    }
    infoTick -= dt;
    if (infoTick <= 0 && o.onFrame) {
      infoTick = 0.12;
      o.onFrame({ progress, scene: sceneN, fps, dpr, cam: camera.position });
    }
  };

  const kick = () => {
    if (!raf && running()) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };

  /** En pausa: sin animación temporal, pero la cámara sigue el scroll (un cuadro por evento). */
  const renderStill = () => {
    if (destroyed) return;
    progress = target;
    apply(0);
    render();
  };

  /* ---------------- Eventos ---------------- */
  const onProgress = (e: Event) => {
    const d = (e as CustomEvent<{ progress: number }>).detail;
    if (!d) return;
    target = d.progress;
    if (paused && inView) renderStill();
  };
  const onMotion = (e: Event) => {
    paused = Boolean((e as CustomEvent<{ paused: boolean }>).detail?.paused);
    if (paused) renderStill();
    else kick();
  };
  const onPointer = (e: PointerEvent) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onVisibility = () => {
    pageVisible = document.visibilityState !== 'hidden';
    kick();
  };
  const io = new IntersectionObserver(
    (entries) => {
      inView = entries.some((en) => en.isIntersecting);
      kick();
    },
    { threshold: 0 },
  );
  io.observe(hero);
  const ro = new ResizeObserver(() => {
    const nw = container.clientWidth;
    const nh = container.clientHeight;
    if (!nw || !nh || (nw === w && nh === h)) return;
    w = nw;
    h = nh;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    finish.uniforms.uAspect.value = w / h;
    pointMats.forEach((m) => (m.uniforms.uPixelRatio.value = dpr * (h / 900)));
    if (!running()) renderStill();
  });
  ro.observe(container);
  window.addEventListener('hero:progress', onProgress);
  window.addEventListener('hero:motion', onMotion);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    window.removeEventListener('hero:progress', onProgress);
    window.removeEventListener('hero:motion', onMotion);
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisibility);
    hero.classList.remove('is-media-ready');
    const mats = new Set<Material>();
    scene.traverse((obj) => {
      const m = obj as Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => mats.add(x));
      else if (mat) mats.add(mat);
    });
    mats.forEach((m) => {
      for (const v of Object.values(m as unknown as Record<string, unknown>)) {
        if (v && typeof v === 'object' && 'isTexture' in v) (v as { dispose(): void }).dispose();
      }
      const u = (m as ShaderMaterial).uniforms;
      if (u) for (const val of Object.values(u)) if (val?.value?.isTexture) val.value.dispose();
      m.dispose();
    });
    composer.dispose();
    renderer.dispose();
    canvas.remove();
  };

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    o.onError?.(new Error('webglcontextlost'));
    destroy();
  });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__heroStage = { scene, camera, board, services, composer, finish, fxaa, renderer, dust, sparks };
  }

  // Primer cuadro y fundido desde el póster
  apply(0);
  render();
  await nextFrame();
  if (destroyed) return { destroy };
  report(1, 'LISTO');
  hero.classList.add('is-media-ready');
  bootAt = time;
  if (paused) {
    // Con la pausa activa la corriente se muestra encendida pero quieta.
    bootAt = time - 2;
    renderStill();
  } else kick();

  return { destroy };
}

const tmpTgt = new Vector3();
