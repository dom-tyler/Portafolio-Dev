import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  QuadraticBezierCurve3,
  Quaternion,
  TubeGeometry,
  Vector3,
  type Material,
  type ShaderMaterial,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildRibbons, mulberry32, pathLength, type RibbonPath } from './geometry';
import { dieMaterial, traceMaterial } from './materials';
import { C, HEX, mix } from './palette';
import { chipMarkTexture, dieTextures } from './textures';

/**
 * El chip protagonista: QFP con biseles, marcado láser, 64 pines metálicos instanciados,
 * ventana del die con shader emisivo, hilos de unión y un abanico de pistas en su propio plano
 * que se pierde en la oscuridad. Todo cuelga de `rig` para poder girarlo, inclinarlo o
 * entregárselo a la mano sin que nada se despegue.
 */

export const CHIP_HALF = 1.2;
export const CHIP_H = 0.3;
const PINS_PER_SIDE = 16;
export const PIN_COUNT = PINS_PER_SIDE * 4;
const PIN_OUT = 0.34;

export interface PinUniforms {
  uLit: { value: number };
  uPins: { value: number };
  uWave: { value: number };
  uWaveK: { value: number };
  uBeat: { value: number };
  uBoot: { value: number };
  uNeonC: { value: Color };
  uCopperC: { value: Color };
}

export interface Chip {
  rig: Group;
  /** Puntas de los pines en coordenadas locales del rig (orden perimetral). */
  pinTips: Vector3[];
  traceMat: ShaderMaterial;
  traceLen: number;
  die: ShaderMaterial;
  pinU: PinUniforms;
  bondMat: MeshStandardMaterial;
  neon: PointLight;
  contour: LineSegments;
  contourMat: LineBasicMaterial;
  arcMat: LineBasicMaterial;
  pointerArc: LineSegments;
  pointerArcMat: LineBasicMaterial;
  dieTop: number;
  /** Opacidad de las piezas sólidas (cuerpo, marcado, die, hilos) durante el encendido. */
  setSolid(alpha: number): void;
  updateArcs(rand: () => number): void;
  updatePointerArc(from: Vector3, to: Vector3, rand: () => number): void;
}

const Y = new Vector3(0, 1, 0);

export function buildChip(aniso: number): Chip {
  const rand = mulberry32(26);
  const rig = new Group();
  rig.name = 'chip';
  const top = CHIP_H / 2;
  const bottom = -CHIP_H / 2;

  /* ---------------- Encapsulado ---------------- */
  const bodyMat = new MeshPhysicalMaterial({
    color: mix(HEX.graphite, HEX.ivory, 0.035),
    roughness: 0.68,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.55,
  });
  const body = new Mesh(new RoundedBoxGeometry(CHIP_HALF * 2, CHIP_H, CHIP_HALF * 2, 3, 0.05), bodyMat);
  rig.add(body);

  const markMat = new MeshStandardMaterial({
    map: chipMarkTexture(aniso),
    transparent: true,
    roughness: 0.92,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const mark = new Mesh(new PlaneGeometry(CHIP_HALF * 2 - 0.08, CHIP_HALF * 2 - 0.08).rotateX(-Math.PI / 2).translate(0, top + 0.001, 0), markMat);
  rig.add(mark);

  /* ---------------- Ventana: cavidad, die, canto y aros ---------------- */
  const cavityMat = new MeshStandardMaterial({ color: mix(HEX.graphite, HEX.copper, 0.14), roughness: 0.45, metalness: 0.4 });
  rig.add(new Mesh(new PlaneGeometry(1.42, 1.42).rotateX(-Math.PI / 2).translate(0, top + 0.003, 0), cavityMat));
  const { map, glow } = dieTextures(aniso);
  const die = dieMaterial(map, glow);
  const dieTop = top + 0.028;
  rig.add(new Mesh(new PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2).translate(0, dieTop, 0), die));
  const dieEdgeMat = new MeshStandardMaterial({ color: mix(HEX.graphite, HEX.ivory, 0.3), roughness: 0.3, metalness: 0.6 });
  // Cara superior del canto 4 mm por debajo del die (sin z-fighting)
  rig.add(new Mesh(new BoxGeometry(0.92, 0.021, 0.92).translate(0, top + 0.0135, 0), dieEdgeMat));

  const sides = [
    { ax: 0, az: -1, lx: 1, lz: 0 }, // arriba: izq → der
    { ax: 1, az: 0, lx: 0, lz: 1 }, // derecha: arriba → abajo
    { ax: 0, az: 1, lx: -1, lz: 0 }, // abajo: der → izq
    { ax: -1, az: 0, lx: 0, lz: -1 }, // izquierda: abajo → arriba
  ];

  const bonds: BufferGeometry[] = [];
  const ringPads: Matrix4[] = [];
  const nb = 12;
  for (const sd of sides) {
    for (let i = 0; i < nb; i++) {
      const o = -0.4 + (0.8 / (nb - 1)) * i;
      const a = new Vector3(sd.ax * 0.43 + sd.lx * o, dieTop + 0.002, sd.az * 0.43 + sd.lz * o);
      const b = new Vector3(sd.ax * 0.66 + sd.lx * o * 1.4, top + 0.005, sd.az * 0.66 + sd.lz * o * 1.4);
      const c = a.clone().lerp(b, 0.35).add(new Vector3(0, 0.09, 0));
      bonds.push(new TubeGeometry(new QuadraticBezierCurve3(a, c, b), 10, 0.004, 4, false));
      ringPads.push(new Matrix4().compose(b, new Quaternion().setFromAxisAngle(Y, sd.ax !== 0 ? 0 : Math.PI / 2), new Vector3(0.045, 0.004, 0.03)));
    }
  }
  const bondMat = new MeshStandardMaterial({
    color: mix(HEX.copper, HEX.ivory, 0.6),
    metalness: 1,
    roughness: 0.22,
    emissive: C.neon.clone(),
    emissiveIntensity: 0,
  });
  rig.add(new Mesh(mergeGeometries(bonds), bondMat));
  bonds.forEach((g) => g.dispose());

  /* ---------------- Pines gull-wing (orden perimetral) ---------------- */
  const pinU: PinUniforms = {
    uLit: { value: PIN_COUNT },
    uPins: { value: PIN_COUNT },
    uWave: { value: 0 },
    uWaveK: { value: 0 },
    uBeat: { value: 0 },
    uBoot: { value: 0 },
    uNeonC: { value: C.neon.clone() },
    uCopperC: { value: C.copper.clone() },
  };
  const pinMat = new MeshStandardMaterial({ color: mix(HEX.copper, HEX.ivory, 0.35), metalness: 1, roughness: 0.32, envMapIntensity: 0.7 });
  // Emisión por pin: encendido uno a uno (carga) y ola de energía que recorre el perímetro.
  pinMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, pinU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vPinId;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPinId = float(gl_InstanceID);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vPinId;
        uniform float uLit; uniform float uPins; uniform float uWave; uniform float uWaveK;
        uniform float uBeat; uniform float uBoot; uniform vec3 uNeonC; uniform vec3 uCopperC;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float pid = mod(vPinId, uPins);
        float lit = step(pid + 0.5, uLit);
        float w = pow(0.5 + 0.5 * cos(6.2831853 * pid / uPins - uWave), 16.0);
        totalEmissiveRadiance += uCopperC * lit * uBoot * 0.7 + uNeonC * (w * uWaveK + uBeat * 0.3);`,
      );
  };
  pinMat.customProgramCacheKey = () => 'chip-pins';

  const pitch = (CHIP_HALF * 2) / (PINS_PER_SIDE + 1);
  const slants: Matrix4[] = [];
  const feet: Matrix4[] = [];
  const pinTips: Vector3[] = [];
  for (const sd of sides) {
    const out = Math.atan2(-sd.az, sd.ax);
    const ry = sd.ax !== 0 ? 0 : Math.PI / 2;
    for (let i = 1; i <= PINS_PER_SIDE; i++) {
      const o = -CHIP_HALF + i * pitch;
      const px = (r: number) => sd.ax * r + sd.lx * o;
      const pz = (r: number) => sd.az * r + sd.lz * o;
      const mid = CHIP_HALF + 0.08;
      slants.push(
        new Matrix4()
          .makeTranslation(px(mid), -0.04, pz(mid))
          .multiply(new Matrix4().makeRotationY(out))
          .multiply(new Matrix4().makeRotationZ(-0.85))
          .multiply(new Matrix4().makeScale(0.2, 0.022, 0.065)),
      );
      const footC = CHIP_HALF + PIN_OUT - 0.09;
      feet.push(new Matrix4().compose(new Vector3(px(footC), bottom + 0.012, pz(footC)), new Quaternion().setFromAxisAngle(Y, ry), new Vector3(0.18, 0.022, 0.065)));
      pinTips.push(new Vector3(px(CHIP_HALF + PIN_OUT), bottom + 0.012, pz(CHIP_HALF + PIN_OUT)));
    }
  }
  const pinGeo = new BoxGeometry(1, 1, 1);
  for (const mats of [slants, feet]) {
    const m = new InstancedMesh(pinGeo, pinMat, mats.length);
    mats.forEach((x, k) => m.setMatrixAt(k, x));
    m.computeBoundingSphere();
    rig.add(m);
  }
  const ringMat = new MeshStandardMaterial({ color: mix(HEX.copper, HEX.ivory, 0.5), metalness: 1, roughness: 0.3 });
  const ring = new InstancedMesh(pinGeo, ringMat, ringPads.length);
  ringPads.forEach((x, k) => ring.setMatrixAt(k, x));
  rig.add(ring);

  /* ---------------- Abanico de pistas en el plano del chip ---------------- */
  const paths: RibbonPath[] = [];
  sides.forEach((sd, s) => {
    for (let i = 1; i <= PINS_PER_SIDE; i++) {
      const tip = pinTips[s * PINS_PER_SIDE + i - 1];
      const sp = (i - (PINS_PER_SIDE + 1) / 2) / ((PINS_PER_SIDE - 1) / 2);
      const as = Math.abs(sp);
      // En los lados con l invertido el abanico debe abrirse igual hacia afuera
      const dir = Math.sign(sp);
      const start = new Vector3(tip.x, bottom + 0.001, tip.z);
      const turn = 0.16 + (1 - as) * 0.8;
      const diag = Math.pow(as, 1.15) * 2.4;
      const run = 0.8 + rand() * 2.6;
      const p1 = start.clone().add(new Vector3(sd.ax * turn, 0, sd.az * turn));
      const p2 = p1.clone().add(new Vector3(sd.ax * diag + sd.lx * diag * dir, 0, sd.az * diag + sd.lz * diag * dir));
      const end = p2.clone().add(new Vector3(sd.ax * run, 0, sd.az * run));
      const pts = diag > 0.01 ? [start, p1, p2, end] : [start, end];
      paths.push({ pts, width: 0.05, speed: (1.4 + rand() * 1.8) * (rand() > 0.85 ? -1 : 1), seed: rand(), live: rand() > 0.3 ? 1 : 0 });
    }
  });
  const traceLen = Math.max(...paths.map((p) => pathLength(p.pts)));
  const traceMat = traceMaterial();
  // Las pistas se pierden en la oscuridad: cobre apagado y desvanecimiento corto.
  traceMat.uniforms.uFadeOut.value.set(0.6, 2.7, 0);
  traceMat.uniforms.uBase.value = 0.4;
  traceMat.uniforms.uGlow.value = 0.75;
  traceMat.depthWrite = false;
  const traces = new Mesh(buildRibbons(paths, new Vector3(0, 1, 0), 0.012), traceMat);
  traces.renderOrder = -1;
  rig.add(traces);

  /* ---------------- Luz neón del die (late con el corazón) ---------------- */
  const neon = new PointLight(C.neon, 0, 5, 2);
  neon.position.set(0, top + 0.35, 0);
  rig.add(neon);

  /* ---------------- Contorno de línea fina (encendido) ---------------- */
  const contourGeo = mergeGeometries([
    new EdgesGeometry(new BoxGeometry(CHIP_HALF * 2, CHIP_H, CHIP_HALF * 2)),
    new EdgesGeometry(new BoxGeometry(0.92, 0.001, 0.92).translate(0, dieTop, 0)),
  ]);
  const contourMat = new LineBasicMaterial({ color: C.ivory.clone().multiplyScalar(0.9), transparent: true, opacity: 0, depthWrite: false });
  const contour = new LineSegments(contourGeo, contourMat);
  rig.add(contour);

  /* ---------------- Arcos: sobre el die y hacia el puntero ---------------- */
  const ARCS = 5;
  const SEG = 9;
  const arcGeo = new BufferGeometry();
  arcGeo.setAttribute('position', new BufferAttribute(new Float32Array(ARCS * SEG * 6), 3));
  const arcMat = new LineBasicMaterial({ color: C.neon.clone().multiplyScalar(7), transparent: true, opacity: 0, depthWrite: false });
  const arcs = new LineSegments(arcGeo, arcMat);
  arcs.frustumCulled = false;
  rig.add(arcs);

  const PSEG = 14;
  const pArcGeo = new BufferGeometry();
  pArcGeo.setAttribute('position', new BufferAttribute(new Float32Array(PSEG * 2 * 2 * 3), 3));
  const pointerArcMat = new LineBasicMaterial({ color: C.neon.clone().multiplyScalar(9), transparent: true, opacity: 0, depthWrite: false });
  const pointerArc = new LineSegments(pArcGeo, pointerArcMat);
  pointerArc.frustumCulled = false;
  rig.add(pointerArc);

  const a = new Vector3();
  const b = new Vector3();
  const prev = new Vector3();
  const cur = new Vector3();
  const updateArcs = (r: () => number) => {
    const pos = arcGeo.attributes.position as BufferAttribute;
    let k = 0;
    for (let i = 0; i < ARCS; i++) {
      const side = sides[Math.floor(r() * 4)];
      const o = (r() - 0.5) * 0.8;
      a.set(side.ax * 0.44 + side.lx * o, dieTop + 0.008, side.az * 0.44 + side.lz * o);
      b.set((r() - 0.5) * 0.5, dieTop + 0.008, (r() - 0.5) * 0.5);
      prev.copy(a);
      for (let j = 1; j <= SEG; j++) {
        const t = j / SEG;
        cur.lerpVectors(a, b, t);
        const jit = Math.sin(t * Math.PI) * 0.07;
        cur.x += (r() - 0.5) * jit;
        cur.z += (r() - 0.5) * jit;
        cur.y += Math.sin(t * Math.PI) * 0.05 + r() * 0.02;
        pos.setXYZ(k++, prev.x, prev.y, prev.z);
        pos.setXYZ(k++, cur.x, cur.y, cur.z);
        prev.copy(cur);
      }
    }
    pos.needsUpdate = true;
  };
  updateArcs(rand);

  const updatePointerArc = (from: Vector3, to: Vector3, r: () => number) => {
    const pos = pArcGeo.attributes.position as BufferAttribute;
    let k = 0;
    const len = from.distanceTo(to);
    // Dos hebras: una principal y una rama que se apaga a mitad de camino
    for (let s = 0; s < 2; s++) {
      prev.copy(from);
      const reach = s === 0 ? 1 : 0.55;
      for (let j = 1; j <= PSEG; j++) {
        const t = (j / PSEG) * reach;
        cur.lerpVectors(from, to, t);
        const jit = Math.sin(t * Math.PI) * len * (s === 0 ? 0.12 : 0.2);
        cur.x += (r() - 0.5) * jit;
        cur.y += (r() - 0.5) * jit;
        cur.z += (r() - 0.5) * jit;
        pos.setXYZ(k++, prev.x, prev.y, prev.z);
        pos.setXYZ(k++, cur.x, cur.y, cur.z);
        prev.copy(cur);
      }
    }
    pos.needsUpdate = true;
  };

  const solids: Material[] = [bodyMat, markMat, cavityMat, dieEdgeMat, bondMat, ringMat];
  const markBase = 1;
  const setSolid = (alpha: number) => {
    for (const m of solids) {
      const wantT = m === markMat || alpha < 0.999;
      if (m.transparent !== wantT) {
        m.transparent = wantT;
        m.needsUpdate = true;
      }
      m.opacity = m === markMat ? markBase * alpha : alpha;
      m.depthWrite = m === markMat ? false : alpha > 0.5;
    }
    die.uniforms.uFade.value = alpha;
  };

  return { rig, pinTips, traceMat, traceLen, die, pinU, bondMat, neon, contour, contourMat, arcMat, pointerArc, pointerArcMat, dieTop, setSolid, updateArcs, updatePointerArc };
}
