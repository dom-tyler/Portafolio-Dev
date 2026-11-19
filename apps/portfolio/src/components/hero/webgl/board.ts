import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Quaternion,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildRibbons, mulberry32, pathLength, type RibbonPath } from './geometry';
import { dieMaterial, litMaterial, maskMaterial, traceMaterial } from './materials';
import { C, mix, HEX } from './palette';
import { chipMarkTexture, dieTextures, silkTexture, type SilkItem } from './textures';

export const BOARD_W = 30;
export const BOARD_H = 20;
export const CHIP_HALF = 1.2;
export const CHIP_H = 0.3;
const PINS = 16;
const PIN_LEN = 0.3;
const TRACE_W = 0.052;
const TRACE_H = 0.016;

export interface LiveTrace {
  len: number;
  speed: number;
  seed: number;
  start: Vector3;
  end: Vector3;
  last: number;
}

export interface Board {
  group: Group;
  traces: LiveTrace[];
  traceMat: ShaderMaterial;
  maskMat: ShaderMaterial;
  die: ShaderMaterial;
  arcs: LineSegments;
  arcMat: LineBasicMaterial;
  bondMat: ShaderMaterial;
  updateArcs(rand: () => number): void;
  dieTop: number;
}

const m4 = new Matrix4();
const q = new Quaternion();
const s = new Vector3();
const p = new Vector3();
const Y = new Vector3(0, 1, 0);

function instanced(geo: BufferGeometry, mat: ShaderMaterial, mats: Matrix4[]): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function at(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0): Matrix4 {
  q.setFromAxisAngle(Y, ry);
  return new Matrix4().compose(p.set(x, y, z), q, s.set(sx, sy, sz));
}

export function buildBoard(aniso: number): Board {
  const rand = mulberry32(26);
  const group = new Group();
  const paths: RibbonPath[] = [];
  const pads: Matrix4[] = [];
  const vias: Matrix4[] = [];
  const silk: SilkItem[] = [];
  const live: LiveTrace[] = [];

  /* ---------------- Abanico de pistas desde el QFP ---------------- */
  const pitch = (CHIP_HALF * 2) / (PINS + 1);
  const sides = [
    { ax: 1, az: 0, lx: 0, lz: 1 },
    { ax: -1, az: 0, lx: 0, lz: 1 },
    { ax: 0, az: -1, lx: 1, lz: 0 },
    { ax: 0, az: 1, lx: 1, lz: 0 },
  ];
  const y0 = 0.001;
  for (const sd of sides) {
    for (let i = 1; i <= PINS; i++) {
      const o = -CHIP_HALF + i * pitch;
      const sp = (i - (PINS + 1) / 2) / ((PINS - 1) / 2); // -1..1
      const as = Math.abs(sp);
      const start = new Vector3(sd.ax * (CHIP_HALF + PIN_LEN) + sd.lx * o, y0, sd.az * (CHIP_HALF + PIN_LEN) + sd.lz * o);
      const turn = 0.18 + (1 - as) * 0.95; // las externas giran antes: sin cruces
      const diag = Math.pow(as, 1.15) * 2.9;
      const dir = Math.sign(sp);
      const reach = sd.ax !== 0 ? BOARD_W / 2 - 1.5 : BOARD_H / 2 - 1.5;
      const remaining = reach - (CHIP_HALF + PIN_LEN) - turn - diag;
      const run = Math.max(0.6, remaining * (0.22 + rand() * 0.72) * (i % 2 ? 1 : 0.8));
      const p1 = start.clone().add(new Vector3(sd.ax * turn, 0, sd.az * turn));
      const p2 = p1.clone().add(new Vector3(sd.ax * diag + sd.lx * diag * dir, 0, sd.az * diag + sd.lz * diag * dir));
      const end = p2.clone().add(new Vector3(sd.ax * run, 0, sd.az * run));
      const pts = diag > 0.01 ? [start, p1, p2, end] : [start, end];
      const isLive = rand() > 0.38 ? 1 : 0;
      const speed = (1.6 + rand() * 2.2) * (rand() > 0.82 ? -1 : 1);
      const seed = rand();
      paths.push({ pts, width: TRACE_W, speed, seed, live: isLive });
      if (isLive) live.push({ len: pathLength(pts), speed, seed, start, end, last: 0 });
      if (rand() > 0.35) pads.push(at(end.x, 0, end.z, 1, 1, 1));
      else vias.push(at(end.x, 0, end.z, 1, 1, 1));
    }
  }

  /* ---------------- Buses de fondo en los cuadrantes ---------------- */
  const quadrants = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (const [qx, qz] of quadrants) {
    const groups = 2;
    for (let gI = 0; gI < groups; gI++) {
      const horizontal = gI === 0;
      const n = 4 + Math.floor(rand() * 4);
      const gap = 0.14;
      const bx = qx * (5.2 + rand() * 3.5);
      const bz = qz * (4.6 + rand() * 2.6);
      const len = 3 + rand() * 4;
      const jog = 0.6 + rand() * 0.8;
      const isLive = rand() > 0.4 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const off = k * gap;
        let pts: Vector3[];
        if (horizontal) {
          const z = bz + qz * off;
          const x0 = bx;
          const x1 = bx + qx * len;
          pts = [
            new Vector3(x0 - qx * off * 0.0, y0, z),
            new Vector3(x1, y0, z),
            new Vector3(x1 + qx * jog, y0, z + qz * jog),
            new Vector3(x1 + qx * (jog + len * 0.5), y0, z + qz * jog),
          ];
        } else {
          const x = bx + qx * off + qx * 3.2;
          const z0 = bz + qz * 1.2;
          const z1 = z0 + qz * len * 0.6;
          pts = [new Vector3(x, y0, z0), new Vector3(x, y0, z1), new Vector3(x + qx * jog, y0, z1 + qz * jog), new Vector3(x + qx * jog, y0, z1 + qz * (jog + len * 0.4))];
        }
        const speed = 1.1 + rand() * 1.2;
        const seed = rand();
        paths.push({ pts, width: TRACE_W * 0.8, speed, seed, live: isLive });
        if (isLive) live.push({ len: pathLength(pts), speed, seed, start: pts[0], end: pts[pts.length - 1], last: 0 });
        vias.push(at(pts[0].x, 0, pts[0].z, 0.8, 1, 0.8));
        vias.push(at(pts[3].x, 0, pts[3].z, 0.8, 1, 0.8));
      }
      silk.push({ kind: 'label', x: bx, z: bz - qz * 0.35, text: horizontal ? `D[${n - 1}:0]` : 'ADDR', size: 0.2 });
    }
    // Cobre bajo máscara (plano de tierra) en el cuadrante
    silk.push({ kind: 'pour', x: qx * 10.5, z: qz * 7, w: 5.5, h: 3.6 });
  }

  /* ---------------- Vías sueltas (stitching) ---------------- */
  for (let i = 0; i < 70; i++) {
    const x = (rand() - 0.5) * (BOARD_W - 3);
    const z = (rand() - 0.5) * (BOARD_H - 3);
    if (Math.abs(x) < 4.5 && Math.abs(z) < 4.5) continue;
    vias.push(at(x, 0, z, 0.7, 1, 0.7));
  }

  /* ---------------- Geometría de cobre ---------------- */
  const traceGeo = buildRibbons(paths, new Vector3(0, 1, 0), TRACE_H);
  const traceMat = traceMaterial();
  traceMat.transparent = false;
  const traceMesh = new Mesh(traceGeo, traceMat);
  group.add(traceMesh);

  const copper = litMaterial({ color: C.copper, spec: C.copperHi, shininess: 60, specK: 1.0, rim: 0.3 });
  const padMesh = instanced(new CylinderGeometry(0.085, 0.085, 0.024, 20).translate(0, 0.012, 0), copper, pads);
  group.add(padMesh);
  const holeMat = litMaterial({ color: C.graphite, specK: 0, rim: 0 });
  const viaMesh = instanced(new CylinderGeometry(0.06, 0.06, 0.02, 16).translate(0, 0.01, 0), copper, vias);
  const viaHole = instanced(new CylinderGeometry(0.026, 0.026, 0.004, 12).translate(0, 0.022, 0), holeMat, vias);
  const padHole = instanced(new CylinderGeometry(0.03, 0.03, 0.004, 12).translate(0, 0.026, 0), holeMat, pads);
  group.add(viaMesh, viaHole, padHole);

  /* ---------------- Componentes SMD ---------------- */
  const bodies: Matrix4[] = [];
  const caps: Matrix4[] = [];
  const smd = (x: number, z: number, ry: number, len = 0.32, wid = 0.16, label?: string) => {
    bodies.push(at(x, 0.05, z, len * 0.62, 0.09, wid, ry));
    const dx = Math.cos(ry) * len * 0.4;
    const dz = -Math.sin(ry) * len * 0.4;
    caps.push(at(x + dx, 0.048, z + dz, len * 0.2, 0.095, wid * 1.02, ry));
    caps.push(at(x - dx, 0.048, z - dz, len * 0.2, 0.095, wid * 1.02, ry));
    silk.push({ kind: 'rect', x, z, w: len * 1.35, h: wid * 1.9, rot: -ry });
    if (label) silk.push({ kind: 'label', x: x - len * 0.6, z: z - wid * 1.6, text: label, size: 0.17 });
  };
  // Desacople en las diagonales del chip (corredor libre entre abanicos)
  const dc = CHIP_HALF + 0.72;
  [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ].forEach(([sx, sz], i) => smd(sx * dc, sz * dc, (sx * sz > 0 ? -1 : 1) * Math.PI / 4, 0.3, 0.15, `C${i + 1}`));
  // Redes de resistencias en los cuadrantes
  let rN = 1;
  for (const [qx, qz] of quadrants) {
    const cx = qx * 6.6;
    const cz = qz * 7.4;
    for (let k = 0; k < 5; k++) smd(cx + k * 0.42 * qx, cz, Math.PI / 2, 0.34, 0.17, k === 0 ? `R${rN}` : undefined);
    rN += 5;
  }
  const bodyMat = litMaterial({ color: mix(HEX.graphite, HEX.ivory, 0.1), shininess: 30, specK: 0.25 });
  const capMat = litMaterial({ color: mix(HEX.copper, HEX.ivory, 0.35), spec: C.ivory, shininess: 70, specK: 0.9 });
  group.add(instanced(new BoxGeometry(1, 1, 1), bodyMat, bodies), instanced(new BoxGeometry(1, 1, 1), capMat, caps));

  /* ---------------- QFP ---------------- */
  const chipMat = litMaterial({ color: C.chipBody, spec: C.ivory, shininess: 18, specK: 0.12, rim: 0.12, map: chipMarkTexture(aniso) });
  const body = new Mesh(new BoxGeometry(CHIP_HALF * 2, CHIP_H, CHIP_HALF * 2).translate(0, CHIP_H / 2 + 0.02, 0), chipMat);
  group.add(body);
  // Patas gull-wing: tramo inclinado + pie
  const slants: Matrix4[] = [];
  const feet: Matrix4[] = [];
  for (const sd of sides) {
    const ry = sd.ax !== 0 ? 0 : Math.PI / 2;
    // Rotación que lleva el eje +x local hacia afuera del lado
    const out = Math.atan2(-sd.az, sd.ax);
    for (let i = 1; i <= PINS; i++) {
      const o = -CHIP_HALF + i * pitch;
      const rx = (r: number) => sd.ax * r + sd.lx * o;
      const rz = (r: number) => sd.az * r + sd.lz * o;
      const mid = CHIP_HALF + 0.07;
      slants.push(
        new Matrix4()
          .makeTranslation(rx(mid), 0.11, rz(mid))
          .multiply(new Matrix4().makeRotationY(out))
          .multiply(new Matrix4().makeRotationZ(-0.85))
          .multiply(new Matrix4().makeScale(0.2, 0.022, 0.06)),
      );
      feet.push(at(rx(CHIP_HALF + PIN_LEN - 0.08), 0.022, rz(CHIP_HALF + PIN_LEN - 0.08), 0.17, 0.02, 0.06, ry));
    }
  }
  const pinMat = litMaterial({ color: mix(HEX.copper, HEX.ivory, 0.5), spec: C.ivory, shininess: 80, specK: 1.2, rim: 0.4 });
  group.add(instanced(new BoxGeometry(1, 1, 1), pinMat, slants), instanced(new BoxGeometry(1, 1, 1), pinMat, feet));

  // Ventana decapada: cavidad, die y aros de pads
  const top = CHIP_H + 0.02;
  const cavity = new Mesh(new PlaneGeometry(1.52, 1.52).rotateX(-Math.PI / 2).translate(0, top + 0.002, 0), litMaterial({ color: mix(HEX.graphite, HEX.copper, 0.1), specK: 0.4, shininess: 20 }));
  group.add(cavity);
  const { map, glow } = dieTextures(aniso);
  const die = dieMaterial(map, glow);
  const dieTop = top + 0.03;
  const dieMesh = new Mesh(new PlaneGeometry(1.0, 1.0).rotateX(-Math.PI / 2).translate(0, dieTop, 0), die);
  group.add(dieMesh);
  // Canto del die: su cara superior queda 4 mm por debajo del plano del die (sin z-fighting).
  const dieEdge = new Mesh(new BoxGeometry(1.0, 0.024, 1.0).translate(0, top + 0.014, 0), litMaterial({ color: mix(HEX.graphite, HEX.ivory, 0.25), specK: 0.6 }));
  group.add(dieEdge);

  // Hilos de unión (bond wires) del die al marco
  const bonds: BufferGeometry[] = [];
  const ringPads: Matrix4[] = [];
  const nb = 12;
  for (const sd of sides) {
    for (let i = 0; i < nb; i++) {
      const o = -0.42 + (0.84 / (nb - 1)) * i;
      const a = new Vector3(sd.ax * 0.47 + sd.lx * o, dieTop + 0.002, sd.az * 0.47 + sd.lz * o);
      const b = new Vector3(sd.ax * 0.7 + sd.lx * o * 1.45, top + 0.004, sd.az * 0.7 + sd.lz * o * 1.45);
      const c = a.clone().lerp(b, 0.35).add(new Vector3(0, 0.12, 0));
      bonds.push(new TubeGeometry(new QuadraticBezierCurve3(a, c, b), 10, 0.0045, 4, false));
      ringPads.push(at(b.x, top + 0.003, b.z, 0.05, 0.004, 0.035, sd.ax !== 0 ? 0 : Math.PI / 2));
    }
  }
  const bondMat = litMaterial({ color: mix(HEX.copper, HEX.ivory, 0.6), spec: C.ivory, shininess: 90, specK: 1.4, rim: 0.6 });
  group.add(new Mesh(mergeGeometries(bonds), bondMat));
  bonds.forEach((g) => g.dispose());
  group.add(instanced(new BoxGeometry(1, 1, 1), pinMat, ringPads));

  // Arcos eléctricos sobre el die (se regeneran durante el parpadeo)
  const ARCS = 5;
  const SEG = 9;
  const arcGeo = new BufferGeometry();
  arcGeo.setAttribute('position', new BufferAttribute(new Float32Array(ARCS * SEG * 2 * 3), 3));
  const arcMat = new LineBasicMaterial({ color: C.neon.clone().multiplyScalar(7), transparent: true, opacity: 0 });
  const arcs = new LineSegments(arcGeo, arcMat);
  arcs.frustumCulled = false;
  group.add(arcs);
  const updateArcs = (r: () => number) => {
    const pos = arcGeo.attributes.position as BufferAttribute;
    let k = 0;
    const a = new Vector3();
    const b = new Vector3();
    const prev = new Vector3();
    const cur = new Vector3();
    for (let i = 0; i < ARCS; i++) {
      const side = sides[Math.floor(r() * 4)];
      const o = (r() - 0.5) * 0.8;
      a.set(side.ax * 0.46 + side.lx * o, dieTop + 0.01, side.az * 0.46 + side.lz * o);
      b.set((r() - 0.5) * 0.5, dieTop + 0.01, (r() - 0.5) * 0.5);
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

  /* ---------------- Serigrafía ---------------- */
  const fp = CHIP_HALF + PIN_LEN + 0.18;
  silk.push({ kind: 'bracket', x: 0, z: 0, w: fp * 2, h: fp * 2 });
  silk.push({ kind: 'label', x: -fp, z: -fp - 0.3, text: 'U1  SoC-26', size: 0.24 });
  silk.push({ kind: 'ring', x: -fp + 0.15, z: -fp + 0.15, r: 0.06 });
  silk.push({ kind: 'fiducial', x: -BOARD_W / 2 + 2.2, z: -BOARD_H / 2 + 2.2 });
  silk.push({ kind: 'fiducial', x: BOARD_W / 2 - 2.2, z: BOARD_H / 2 - 2.2 });
  silk.push({ kind: 'fiducial', x: BOARD_W / 2 - 2.2, z: -BOARD_H / 2 + 2.2 });
  for (const [qx, qz] of quadrants) silk.push({ kind: 'ring', x: qx * (BOARD_W / 2 - 1.2), z: qz * (BOARD_H / 2 - 1.2), r: 0.45 });
  silk.push({ kind: 'label', x: 4.6, z: 6.2, text: 'DO-26 · DEV BOARD · REV C', size: 0.3 });
  silk.push({ kind: 'label', x: 4.6, z: 6.7, text: 'SILICIO → INTERFAZ → IA', size: 0.22 });
  silk.push({ kind: 'label', x: 4.6, z: 7.15, text: 'MEDELLÍN  6.2442N 75.5812W', size: 0.18 });
  silk.push({ kind: 'label', x: -12.5, z: 1.1, text: '+3V3', size: 0.22 });
  silk.push({ kind: 'label', x: -12.5, z: -1.4, text: 'GND', size: 0.22 });
  silk.push({ kind: 'label', x: 10.5, z: -1.4, text: 'TP3', size: 0.2 });
  silk.push({ kind: 'label', x: 6.5, z: -6.2, text: 'J2  UART', size: 0.22 });

  const silkTex = silkTexture(BOARD_W, BOARD_H, silk, aniso);
  const maskMat = maskMaterial(silkTex, { w: BOARD_W, h: BOARD_H });
  const mask = new Mesh(new PlaneGeometry(BOARD_W, BOARD_H).rotateX(-Math.PI / 2), maskMat);
  mask.renderOrder = -1;
  group.add(mask);

  return { group, traces: live, traceMat, maskMat, die, arcs, arcMat, bondMat, updateArcs, dieTop };
}
