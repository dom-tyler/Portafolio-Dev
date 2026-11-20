import {
  DirectionalLight,
  Euler,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type ShaderMaterial,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildChip, PIN_COUNT, type Chip } from './chip';
import { buildComposer, buildDust, Sparks } from './fx';
import { GpuTimer, ResolutionController } from './quality';
import { mulberry32 } from './geometry';
import { buildHand, HAND_SCALE, type Hand } from './hand';
import { buildHolo, type Holo } from './holo';
import { shared } from './materials';
import { C, HEX, mix } from './palette';
import { loadFonts } from './textures';

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                        */
/* ------------------------------------------------------------------ */

export type BootPhase = 'ready' | 'ignite' | 'flight' | 'done';

export interface FrameInfo {
  progress: number;
  scene: 1 | 2 | 3;
  fps: number;
  tier: number;
  /** Resolución interna (píxeles por píxel CSS). */
  pr: number;
}

export interface StageOptions {
  hero: HTMLElement;
  container: HTMLElement;
  /** full: chip + mano + capas + bloom. lite (móvil): solo el chip, sin bloom. */
  mode: 'full' | 'lite';
  /** Onboarding: el chip se enciende en el centro y vuela al hero. */
  boot: { enabled: boolean; short: boolean; startedAt: number };
  onLoad?: (pct: number, step: string) => void;
  onFrame?: (info: FrameInfo) => void;
  onBootPhase?: (phase: BootPhase) => void;
  onError?: (err: unknown) => void;
}

export interface StageHandle {
  destroy(): void;
  /** Salta el onboarding (botón o clic): vuelo corto si la escena ya está lista. */
  skipBoot(): void;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                            */
/* ------------------------------------------------------------------ */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Cede el hilo entre pasos de construcción; con la pestaña oculta rAF no corre y el timeout evita colgarse. */
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

interface CamKey {
  p: number;
  pos: [number, number, number];
  tgt: [number, number, number];
  fov: number;
}

// Encuadres resueltos con proyección: el chip vive a la derecha del titular (~70 % / 42 %).
const DESKTOP: { boot: CamKey; keys: CamKey[] } = {
  boot: { p: 0, pos: [0, 3.6, 8.2], tgt: [0, 0, 0], fov: 32 },
  keys: [
    { p: 0, pos: [0.2, 3.6, 12.2], tgt: [-2.3, -1.0, 0], fov: 32 },
    { p: 0.34, pos: [-0.2, 3.0, 12.8], tgt: [-2.5, -1.1, 0], fov: 32 },
    { p: 0.55, pos: [0.0, 2.6, 14.2], tgt: [-2.6, -0.6, 0.4], fov: 33 },
    { p: 0.86, pos: [-0.5, 4.4, 16.4], tgt: [-2.8, 1.7, 0.6], fov: 33 },
    { p: 1, pos: [-0.5, 4.4, 16.4], tgt: [-2.8, 1.7, 0.6], fov: 33 },
  ],
};
const MOBILE: { boot: CamKey; keys: CamKey[] } = {
  boot: { p: 0, pos: [0, 3.8, 12.5], tgt: [0, 0, 0], fov: 36 },
  keys: [
    { p: 0, pos: [0, 3.6, 15.5], tgt: [0, -2.4, 0], fov: 36 },
    { p: 1, pos: [0, 3.6, 15.5], tgt: [0, -2.4, 0], fov: 36 },
  ],
};

const tmpA = new Vector3();
const tmpB = new Vector3();
function sampleKeys(keys: CamKey[], p: number, pos: Vector3, tgt: Vector3): number {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = ease(clamp01((p - a.p) / Math.max(1e-6, b.p - a.p)));
  pos.lerpVectors(tmpA.set(...a.pos), tmpB.set(...b.pos), u);
  tgt.lerpVectors(tmpA.set(...a.tgt), tmpB.set(...b.tgt), u);
  return lerp(a.fov, b.fov, u);
}

/* ------------------------------------------------------------------ */

export async function mountStage(o: StageOptions): Promise<StageHandle> {
  const { hero, container, mode } = o;
  const lite = mode === 'lite';
  // La etapa reporta el tramo 0.5 → 1 del progreso real (el resto lo cubre el script de entrada).
  const report = (t: number, step: string) => o.onLoad?.(0.5 + t * 0.5, step);

  await loadFonts();
  report(0.05, 'CONTEXTO');

  const renderer = new WebGLRenderer({ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
  // El pase final hace tone mapping y sRGB: el renderer trabaja en lineal de punta a punta.
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(C.graphite, 1);
  // El lienzo va a resolución nativa (tope 2x). La escena se dibuja a una resolución interna que
  // se adapta a la GPU: hasta 1.5x en pantallas 1x (supermuestreo) y nunca por debajo de 0.75x.
  const nativeDpr = Math.min(window.devicePixelRatio || 1, 2);
  const res = new ResolutionController({
    start: lite ? Math.min(nativeDpr, 1.5) : nativeDpr,
    min: Math.min(0.75, nativeDpr),
    max: lite ? nativeDpr : Math.max(nativeDpr, 1.5),
    budgetMs: 12,
  });
  let dpr = res.pr;
  let tier = 0;
  renderer.setPixelRatio(nativeDpr);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  let w = container.clientWidth || window.innerWidth;
  let h = container.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, w / h, 0.05, 80);
  const portrait = () => w / h < 0.85;
  let rig = portrait() ? MOBILE : DESKTOP;

  /* ---------------- Entorno y luces (sin HDRI: entorno procedural) ---------------- */
  await nextFrame();
  report(0.15, 'ENTORNO');
  const pmrem = new PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  const key = new DirectionalLight(C.ivory, 1.45);
  key.position.set(-4, 7, 6);
  const fill = new DirectionalLight(mix(HEX.copper, HEX.ivory, 0.4), 0.45);
  fill.position.set(5, -3, 2);
  const rim = new PointLight(mix(HEX.ivory, HEX.neon, 0.25), 0, 9, 2);
  scene.add(key, fill, rim);

  /* ---------------- Chip, mano y capas ---------------- */
  await nextFrame();
  report(0.35, 'CHIP');
  const chip: Chip = buildChip(aniso);
  chip.rig.matrixAutoUpdate = false;
  scene.add(chip.rig);

  let hand: Hand | null = null;
  let holo: Holo | null = null;
  if (!lite) {
    await nextFrame();
    report(0.55, 'MANO');
    hand = buildHand();
    scene.add(hand.root);
    holo = buildHolo(aniso, chip.dieTop);
    chip.rig.add(holo.group);
  }

  const dust = buildDust(lite ? 120 : 320);
  const sparks = new Sparks(lite ? 90 : 200);
  scene.add(dust, sparks.points);

  await nextFrame();
  report(0.7, 'SHADERS');
  const { composer, bloom, finish, setSceneScale } = buildComposer(renderer, scene, camera, w, h);
  const applyQuality = () => {
    dpr = res.pr;
    tier = !res.bloom ? 2 : dpr < nativeDpr - 1e-6 ? 1 : 0;
    // El composer (bloom y acabado) va a resolución nativa; solo la escena cambia de resolución.
    setSceneScale(dpr / nativeDpr);
    shared.uLineScale.value = dpr / nativeDpr;
    composer.setPixelRatio(nativeDpr);
    composer.setSize(w, h);
    bloom.enabled = !lite && res.bloom;
    finish.uniforms.uAspect.value = w / h;
    finish.uniforms.uSideDim.value = portrait() ? 0 : 1;
    (dust.material as ShaderMaterial).uniforms.uPixelRatio.value = dpr * (h / 900);
    (sparks.points.material as ShaderMaterial).uniforms.uPixelRatio.value = dpr * (h / 900);
  };
  applyQuality();

  /* ---------------- Poses de la mano (precalculadas) ---------------- */
  const P_HERO = new Vector3(0, 0, 0);
  const handGrasp = new Matrix4();
  const handStartQ = new Quaternion();
  const handGraspQ = new Quaternion();
  const handGraspP = new Vector3();
  const handStartP = new Vector3();
  const chipCanon = new Matrix4();
  // Dónde queda el chip presentado (mirando a la cámara) y el ancla relativa a la raíz de la mano.
  const P_PRESENT = new Vector3(0.25, 1.35, 0.6);
  const anchorOffset = new Vector3();
  const presentRoot = new Vector3();
  if (hand) {
    // Palma hacia arriba bajo el chip; los dedos apuntan hacia atrás a la izquierda y el
    // antebrazo entra desde abajo a la derecha, hacia la cámara.
    const fingersDir = new Vector3(-0.62, 0.0, -0.78).normalize();
    const palmN = new Vector3(0, 1, 0);
    const xAxis = new Vector3().crossVectors(fingersDir, palmN).normalize();
    handGrasp.makeBasis(xAxis, fingersDir, palmN);
    handGraspQ.setFromRotationMatrix(handGrasp);
    hand.root.quaternion.copy(handGraspQ);
    hand.root.position.set(0, 0, 0);
    hand.root.updateMatrixWorld(true);
    // Posición de la mano para que el ancla caiga sobre el chip
    const anchorWorld = new Vector3().setFromMatrixPosition(hand.anchor.matrixWorld);
    handGraspP.copy(P_HERO).sub(anchorWorld);
    handStartP.copy(handGraspP).add(new Vector3(4.2, -6.5, 4.5));
    handStartQ.copy(handGraspQ).multiply(new Quaternion().setFromEuler(new Euler(-0.7, 0.3, 0)));
    hand.root.position.copy(handGraspP);
    hand.root.updateMatrixWorld(true);
    chipCanon.copy(hand.anchor.matrixWorld);
    anchorOffset.copy(hand.anchor.position).multiplyScalar(HAND_SCALE);
  }

  // Compila con todo visible para que no haya tirones al cambiar de fase.
  camera.position.set(...rig.boot.pos);
  camera.lookAt(tmpA.set(...rig.boot.tgt));
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    renderer.compile(scene, camera);
  }
  report(1, 'LISTO');

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
  const rand = mulberry32(1234);

  // Onboarding
  type BootState = 'loading' | 'ignite' | 'flight' | 'done';
  let boot: BootState = o.boot.enabled ? 'loading' : 'done';
  let bootT = 0; // tiempo dentro del estado actual
  let flightDur = o.boot.short ? 0.75 : 1.5;
  const igniteDur = o.boot.short ? 0.25 : 0.7;
  const minLoad = o.boot.short ? 0.45 : 1.5;
  // Repetición 3D del encendido (contorno → pines → pistas) aunque la carga real ya haya terminado.
  const replay = o.boot.short ? 0.25 : 0.9;
  let skip = false;
  const setBoot = (s: BootState) => {
    boot = s;
    bootT = 0;
    if (s !== 'loading') o.onBootPhase?.(s);
  };

  // Vida
  let nextBeat = 0.4;
  let beatAt = -10;
  let flickerUntil = -1;
  let nextFlicker = 2.2;
  let arcTick = 0;
  let flicker = 0;
  let overload = 0;
  let hoverK = 0;
  let pArcTick = 0;
  let pArcOn = false;
  const pointer = { x: 0, y: 0, active: false, ndc: new Vector2() };
  const spring = { x: 0, y: 0, vx: 0, vy: 0 };

  // Rendimiento
  let frames = 0;
  let acc = 0;
  let fps = 60;
  let infoTick = 0;
  let gpuMs = 0;

  const camPos = new Vector3();
  const camTgt = new Vector3();
  const bootPos = new Vector3();
  const bootTgt = new Vector3();
  const raycaster = new Raycaster();
  const plane = new Plane();
  const pWorld = new Vector3();
  const chipPos = new Vector3();
  const chipQ = new Quaternion();
  const chipS = new Vector3(1, 1, 1);
  const freeQ = new Quaternion();
  const springQ = new Quaternion();
  const m4 = new Matrix4();
  const q2 = new Quaternion();
  const v2 = new Vector3();
  const sc2 = new Vector3();
  const tip = new Vector3();
  const camDir = new Vector3();
  const euler = new Euler(0, 0, 0, 'XYZ');

  /** Pose libre del chip (fase a): respira, gira con el scroll y se inclina hacia el puntero. */
  const freePose = (p: number, outP: Vector3, outQ: Quaternion) => {
    outP.copy(P_HERO);
    outP.y += Math.sin(time * 1.1) * 0.05;
    euler.set(0.62 + Math.sin(p * Math.PI * 1.5) * 0.22, time * 0.12 + p * Math.PI * 2.4, 0);
    outQ.setFromEuler(euler);
    springQ.setFromEuler(new Euler(spring.y * 0.32, spring.x * 0.45, 0, 'YXZ'));
    outQ.premultiply(springQ);
  };
  const bootPose = (outP: Vector3, outQ: Quaternion) => {
    outP.copy(P_HERO);
    outP.y += Math.sin(time * 1.4) * 0.04;
    euler.set(0.95, time * 0.25, 0);
    outQ.setFromEuler(euler);
  };

  /* ---------------- Cuadro ---------------- */
  const apply = (dt: number) => {
    const p = progress;
    shared.uTime.value = time;

    /* Onboarding */
    let loadVis = 1; // 1 = chip "en encendido" (contorno + pines), 0 = sólido
    let flightK = 1; // 0 = encuadre de carga, 1 = encuadre del hero
    if (boot === 'loading') {
      bootT += dt;
      loadVis = 1;
      flightK = 0;
      const elapsed = (performance.now() - o.boot.startedAt) / 1000;
      if (skip || (elapsed >= minLoad && bootT >= replay)) setBoot('ignite');
    }
    if (boot === 'ignite') {
      bootT += dt;
      loadVis = 1 - sm(0, igniteDur, bootT);
      flightK = 0;
      if (bootT >= igniteDur) setBoot('flight');
    } else if (boot === 'flight') {
      bootT += dt;
      loadVis = 0;
      flightK = ease(clamp01(bootT / flightDur));
      if (bootT >= flightDur) setBoot('done');
    } else if (boot === 'done') {
      loadVis = 0;
      flightK = 1;
    }
    const alive = boot === 'loading' ? 0 : boot === 'ignite' ? sm(0, igniteDur, bootT) : 1;

    // Pines que se encienden uno a uno con el progreso real (en carga todos ya cargaron)
    chip.pinU.uLit.value = boot === 'loading' ? Math.min(PIN_COUNT, Math.floor(clamp01(bootT / (replay * 0.7)) * PIN_COUNT)) : PIN_COUNT;
    chip.pinU.uBoot.value = loadVis;
    chip.contourMat.opacity = loadVis * 0.85;
    chip.contour.visible = loadVis > 0.01;
    chip.setSolid(1 - loadVis);

    /* Cámara */
    const camFov = sampleKeys(rig.keys, p, camPos, camTgt);
    if (flightK < 1) {
      bootPos.set(...rig.boot.pos);
      bootTgt.set(...rig.boot.tgt);
      camPos.lerpVectors(bootPos, camPos, flightK);
      camTgt.lerpVectors(bootTgt, camTgt, flightK);
      camera.fov = lerp(rig.boot.fov, camFov, flightK);
    } else camera.fov = camFov;
    camera.position.copy(camPos);
    camera.lookAt(camTgt);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    /* Puntero: punto en el plano del chip, hover y resorte */
    camDir.subVectors(P_HERO, camera.position).normalize();
    plane.setFromNormalAndCoplanarPoint(camDir, P_HERO);
    raycaster.setFromCamera(pointer.ndc, camera);
    const hit = raycaster.ray.intersectPlane(plane, pWorld) !== null;
    chipPos.setFromMatrixPosition(chip.rig.matrixWorld);
    const dist = hit && pointer.active ? pWorld.distanceTo(chipPos) : 99;
    const hoverTarget = boot === 'done' ? 1 - sm(1.6, 3.0, dist) : 0;
    hoverK += (hoverTarget - hoverK) * (1 - Math.exp(-dt * 6));
    const sx = pointer.active && boot === 'done' ? pointer.ndc.x : 0;
    const sy = pointer.active && boot === 'done' ? -pointer.ndc.y : 0;
    // Resorte críticamente amortiguado (un poco de rebote)
    const k = 38;
    const c = 7.5;
    spring.vx += ((sx - spring.x) * k - spring.vx * c) * dt;
    spring.vy += ((sy - spring.y) * k - spring.vy * c) * dt;
    spring.x += spring.vx * dt;
    spring.y += spring.vy * dt;

    /* Pose del chip: carga → libre → mano */
    freePose(p, chipPos, chipQ);
    if (flightK < 1) {
      bootPose(v2, q2);
      chipPos.lerpVectors(v2, chipPos, flightK);
      chipQ.slerpQuaternions(q2, chipQ, flightK);
    }
    let grip = 0;
    if (hand) {
      const approach = ease(sm(0.32, 0.5, p));
      grip = sm(0.49, 0.6, p);
      const lift = ease(sm(0.58, 0.7, p));
      const present = ease(sm(0.68, 0.86, p));
      hand.root.visible = p > 0.3;
      hand.root.position.lerpVectors(handStartP, handGraspP, approach);
      hand.root.quaternion.slerpQuaternions(handStartQ, handGraspQ, approach);
      hand.root.position.y += lift * 1.0;
      hand.root.position.z += lift * 0.5;
      if (present > 0) {
        // Presenta: la palma (cara del chip) gira hacia la cámara, dedos arriba.
        // Mira a la cámara con ~30° hacia arriba: la cara del chip se lee por delante de los dedos.
        const toCam = v2.subVectors(camera.position, P_PRESENT).normalize().add(tmpA.set(0, 0.55, 0)).normalize();
        const xA = tmpB.crossVectors(tmpA.set(0, 1, 0), toCam).normalize();
        const yA = new Vector3().crossVectors(toCam, xA).normalize();
        m4.makeBasis(xA, yA, toCam);
        q2.setFromRotationMatrix(m4);
        hand.root.quaternion.slerp(q2, present);
        // La raíz se coloca para que el ancla (el chip) caiga en P_PRESENT con la orientación final.
        presentRoot.copy(anchorOffset).applyQuaternion(q2).negate().add(P_PRESENT);
        hand.root.position.lerp(presentRoot, present);
      }
      hand.setGrip(grip);
      hand.setNeon(0.6 + 0.4 * Math.sin(time * 2.2) * 0.5 + overload * 0.8);
      hand.root.updateMatrixWorld(true);
      // El chip se entrega: primero se alinea con su pose canónica, luego sigue al ancla.
      const align = sm(0.36, 0.5, p);
      if (align > 0) {
        if (grip > 0.02) {
          hand.anchor.matrixWorld.decompose(v2, q2, sc2);
          chipPos.copy(v2);
          chipQ.copy(q2);
        } else {
          chipCanon.decompose(v2, q2, sc2);
          chipPos.lerp(v2, align);
          chipQ.slerp(q2, align);
        }
      }
    }
    const breath = 1 + Math.sin(time * 1.3) * 0.006 * alive;
    chipS.setScalar(breath);
    chip.rig.matrix.compose(chipPos, chipQ, chipS);
    chip.rig.matrixWorld.copy(chip.rig.matrix);
    chip.rig.updateMatrixWorld(true);

    /* Pistas: crecen en la carga, se retraen cuando la mano toma el chip */
    const grow = boot === 'loading' ? sm(0.35, 1, bootT / replay) : 1;
    const retract = hand ? 1 - sm(0.42, 0.56, p) : 1;
    chip.traceMat.uniforms.uReveal.value = chip.traceLen * grow * retract + 0.001;
    chip.traceMat.uniforms.uOpacity.value = 0.25 + 0.75 * retract;

    /* Latido irregular, overload, parpadeo */
    if (alive > 0 && time >= nextBeat) {
      beatAt = time;
      nextBeat = time + (rand() < 0.25 ? 0.22 : 0.75 + rand() * 0.6);
    }
    const bx = time - beatAt;
    const beat = bx < 0 ? 0 : Math.exp(-bx / 0.13) * (1 - Math.exp(-bx / 0.012)) * alive;
    overload = Math.max(0, overload - dt * 1.6);
    const flow = 1 + hoverK * 2.2 + overload * 5;
    shared.uFlow.value += dt * flow;
    shared.uCurrent.value = (0.35 + 0.65 * alive) * (0.85 + 0.6 * beat + overload);

    if (time > nextFlicker && flickerUntil < 0 && alive > 0.5) {
      flickerUntil = time + 0.18 + rand() * 0.25;
      sparks.burst(chip.rig.localToWorld(tip.set((rand() - 0.5) * 0.5, chip.dieTop, (rand() - 0.5) * 0.5)), 8, 0.6);
    }
    if (flickerUntil > 0) {
      arcTick -= dt;
      if (arcTick <= 0) {
        arcTick = 0.045;
        flicker = rand() > 0.35 ? 0.4 + rand() * 0.6 : 0;
        chip.updateArcs(rand);
      }
      if (time > flickerUntil) {
        flickerUntil = -1;
        flicker = 0;
        nextFlicker = time + 1.6 + rand() * 3;
      }
    }
    chip.die.uniforms.uBeat.value = beat + overload * 0.6;
    chip.die.uniforms.uFlicker.value = flicker * alive;
    chip.die.uniforms.uHeat.value = overload * 0.7;
    chip.arcMat.opacity = Math.max(flicker, overload) * alive;
    chip.pinU.uBeat.value = beat;
    chip.pinU.uWave.value += dt * (2.6 + hoverK * 4);
    chip.pinU.uWaveK.value = (0.45 + hoverK * 1.3 + overload * 2) * alive;
    chip.bondMat.emissiveIntensity = (beat * 1.2 + overload * 2) * alive;
    chip.neon.intensity = (0.5 + beat * 5 + flicker * 3 + overload * 14) * alive;

    /* Arco hacia el puntero desde el pin más cercano */
    pArcTick -= dt;
    if (hoverK > 0.15 && hit && boot === 'done') {
      if (pArcTick <= 0) {
        pArcTick = 0.05;
        pArcOn = rand() < 0.72;
        let best = 1e9;
        for (const t of chip.pinTips) {
          v2.copy(t).applyMatrix4(chip.rig.matrixWorld);
          const d = v2.distanceToSquared(pWorld);
          if (d < best) {
            best = d;
            tip.copy(v2);
          }
        }
        // El arco salta hacia el puntero pero no más de 1.3 unidades
        const reach = tmpA.subVectors(pWorld, tip);
        if (reach.length() > 1.3) reach.setLength(1.3);
        const endW = tmpB.copy(tip).add(reach);
        const inv = m4.copy(chip.rig.matrixWorld).invert();
        chip.updatePointerArc(tip.clone().applyMatrix4(inv), endW.applyMatrix4(inv), rand);
        if (pArcOn && rand() < 0.3) sparks.burst(tip, 3, 0.5);
      }
      chip.pointerArcMat.opacity = pArcOn ? hoverK : 0;
    } else chip.pointerArcMat.opacity = 0;
    chip.pointerArc.visible = chip.pointerArcMat.opacity > 0.01;

    /* Rim light que sigue al cursor (por detrás del chip, del lado del puntero) */
    if (hit && pointer.active) {
      rim.position.copy(chipPos).addScaledVector(v2.subVectors(pWorld, chipPos), 0.9).addScaledVector(camDir, 1.4);
    } else rim.position.copy(chipPos).add(tmpA.set(2.2, 2.0, -1.4));
    rim.intensity = (3.5 + hoverK * 16 + overload * 24) * alive;

    /* Capas holográficas */
    if (holo) holo.set(sm(0.78, 1.0, p));

    sparks.update(dt);
    (dust.material as ShaderMaterial).uniforms.uOpacity.value = 0.6;
    finish.uniforms.uTime.value = time % 10;
    finish.uniforms.uFlash.value = overload * 0.035;
    bloom.strength = 0.85 + beat * 0.25 + overload * 0.8;
  };

  const timer = GpuTimer.create(renderer.getContext());
  const render = () => {
    timer?.begin();
    composer.render();
    timer?.end();
  };

  /* ---------------- Bucle ---------------- */
  const running = () => !destroyed && !paused && inView && pageVisible;

  const loop = (now: number) => {
    if (!running()) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(loop);
    const rawDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dt = Math.min(0.05, rawDt);
    time += dt;
    progress += (target - progress) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(target - progress) < 1e-4) progress = target;
    apply(dt);
    render();

    // Resolución adaptativa: con temporizador de GPU sube y baja según el costo real del cuadro;
    // sin él, solo baja si los FPS no alcanzan. Solo sube con el onboarding terminado.
    const locked = import.meta.env.DEV && (window as unknown as { __heroLockTier?: boolean }).__heroLockTier;
    if (timer) {
      const ms = timer.poll();
      if (ms !== null) {
        gpuMs = ms;
        if (!locked && res.gpu(ms, now, boot === 'done')) applyQuality();
      }
    }
    frames++;
    acc += rawDt;
    if (acc >= 1.5) {
      fps = frames / acc;
      if (!timer && !locked && boot === 'done' && res.fps(fps, now)) applyQuality();
      frames = 0;
      acc = 0;
    }
    infoTick -= dt;
    if (infoTick <= 0 && o.onFrame) {
      infoTick = 0.12;
      o.onFrame({ progress, scene: progress < 1 / 3 ? 1 : progress < 2 / 3 ? 2 : 3, fps, tier, pr: dpr });
    }
  };

  const kick = () => {
    if (!raf && running()) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };

  /** En pausa: sin animación temporal; la escena sigue el scroll con un cuadro por evento. */
  const renderStill = () => {
    if (destroyed) return;
    progress = target;
    if (boot !== 'done') {
      boot = 'done';
      o.onBootPhase?.('done');
    }
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
    pointer.active = true;
    pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };
  const onLeave = () => {
    pointer.active = false;
  };
  const onDown = (e: PointerEvent) => {
    if (boot !== 'done') return;
    // Solo dentro del hero visible y no sobre enlaces/botones
    if ((e.target as HTMLElement | null)?.closest('a, button')) return;
    const r = hero.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || r.bottom <= 0) return;
    onPointer(e);
    overload = 1;
    for (let i = 0; i < 6; i++) {
      tip.copy(chip.pinTips[Math.floor(rand() * chip.pinTips.length)]).applyMatrix4(chip.rig.matrixWorld);
      sparks.burst(tip, 6, 1);
    }
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
    rig = portrait() ? MOBILE : DESKTOP;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyQuality();
    if (!running()) renderStill();
  });
  ro.observe(container);
  window.addEventListener('hero:progress', onProgress);
  window.addEventListener('hero:motion', onMotion);
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
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
    window.removeEventListener('pointerdown', onDown);
    document.documentElement.removeEventListener('pointerleave', onLeave);
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
    envRT.dispose();
    timer?.dispose();
    composer.dispose();
    renderer.dispose();
    canvas.remove();
  };

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    o.onError?.(new Error('webglcontextlost'));
    destroy();
  });

  const skipBoot = () => {
    skip = true;
    if (boot === 'loading' || boot === 'ignite') {
      flightDur = 0.4;
      setBoot('flight');
    } else if (boot === 'flight') {
      flightDur = Math.min(flightDur, bootT + 0.25);
    }
  };

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__heroStage = { scene, camera, chip, hand, holo, composer, bloom, finish, renderer, res, gpuMs: () => gpuMs, setPR: (p: number) => ((res.pr = p), applyQuality()) };
  }

  // Primer cuadro
  apply(0);
  render();
  await nextFrame();
  if (destroyed) return { destroy, skipBoot };
  hero.classList.add('is-media-ready');
  o.onBootPhase?.('ready');
  if (paused) renderStill();
  else kick();

  return { destroy, skipBoot };
}

