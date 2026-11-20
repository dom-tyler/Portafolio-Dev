import {
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { C, HEX, mix } from './palette';

/**
 * Mano robótica procedural (sin assets). Marco local: muñeca en el origen, dedos hacia +Y,
 * palma mirando a +Z. Cada articulación es un Object3D: la pose se interpola por ángulos.
 *
 * Agarre "de cuna": el chip apoya en la palma, los cuatro dedos se cierran sobre su borde lejano
 * y el pulgar sobre el borde izquierdo. `anchor` marca dónde va el chip (con escala unitaria).
 */

export const HAND_SCALE = 1.5;

interface Finger {
  joints: Object3D[];
  open: number[];
  grip: number[];
  spread: number;
}

export interface Hand {
  root: Group;
  anchor: Object3D;
  neonMats: MeshStandardMaterial[];
  /** 0 = abierta, 1 = agarre. Los dedos cierran con un leve desfase entre sí. */
  setGrip(t: number): void;
  setNeon(k: number): void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function buildHand(): Hand {
  const root = new Group();
  root.name = 'hand';
  const keep = <T extends BufferGeometry>(g: T) => g;

  const metal = new MeshPhysicalMaterial({
    color: mix(HEX.graphite, HEX.ivory, 0.13),
    metalness: 0.75,
    roughness: 0.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });
  const metalDark = new MeshPhysicalMaterial({ color: mix(HEX.graphite, HEX.ivory, 0.06), metalness: 0.6, roughness: 0.45, clearcoat: 0.3 });
  const copper = new MeshStandardMaterial({ color: C.copper, metalness: 1, roughness: 0.3 });
  const rubber = new MeshStandardMaterial({ color: mix(HEX.graphite, HEX.ivory, 0.05), metalness: 0, roughness: 0.75 });
  const neonMats: MeshStandardMaterial[] = [];
  const neonMat = () => {
    const m = new MeshStandardMaterial({ color: C.neon, emissive: C.neon, emissiveIntensity: 3, roughness: 0.4, metalness: 0 });
    neonMats.push(m);
    return m;
  };
  const strip = neonMat();

  const box = (w: number, h: number, d: number, r = 0.05) => keep(new RoundedBoxGeometry(w, h, d, 2, r));
  const joint = (radius: number, length: number) => keep(new CylinderGeometry(radius, radius, length, 20).rotateZ(Math.PI / 2));

  /* ---------------- Palma ---------------- */
  const palmLen = 2.0;
  const palmW = 2.1;
  const palmT = 0.42;
  const palm = new Mesh(box(palmW, palmLen, palmT, 0.09), metal);
  palm.position.set(0, 0.15 + palmLen / 2, 0);
  root.add(palm);
  // Paneles biselados del dorso con tiras neón entre ellos
  for (const sx of [-1, 1]) {
    const plate = new Mesh(box(0.86, 1.5, 0.09, 0.035), metalDark);
    plate.position.set(sx * 0.5, 1.2, -palmT / 2 - 0.035);
    root.add(plate);
  }
  const backStrip = new Mesh(box(0.05, 1.45, 0.03, 0.012), strip);
  backStrip.position.set(0, 1.2, -palmT / 2 - 0.06);
  root.add(backStrip);
  for (const sx of [-1, 1]) {
    const s2 = new Mesh(box(0.04, 0.9, 0.03, 0.012), strip);
    s2.position.set(sx * 0.98, 1.15, -palmT / 2 - 0.01);
    root.add(s2);
  }
  // Placa de la palma (cara interior) con rejilla de agarre
  const pad = new Mesh(box(1.7, 1.55, 0.06, 0.025), metalDark);
  pad.position.set(0, 1.12, palmT / 2 + 0.015);
  root.add(pad);

  /* ---------------- Dedos ---------------- */
  const fingers: Finger[] = [];
  const fingerSpec = [
    { x: -0.72, len: [0.62, 0.42, 0.34], spread: 0.07 },
    { x: -0.24, len: [0.68, 0.46, 0.36], spread: 0.02 },
    { x: 0.24, len: [0.64, 0.44, 0.34], spread: -0.02 },
    { x: 0.72, len: [0.52, 0.38, 0.3], spread: -0.08 },
  ];
  const fw = 0.36;
  const ft = 0.32;
  const chain = (parent: Object3D, lens: number[], width: number, thick: number) => {
    const joints: Object3D[] = [];
    let node: Object3D = parent;
    lens.forEach((L, k) => {
      const j = new Object3D();
      if (k > 0) j.position.y = lens[k - 1] + 0.1;
      node.add(j);
      const knuckle = new Mesh(joint(k === 0 ? 0.13 : 0.11, width * 0.96), copper);
      j.add(knuckle);
      const ph = new Mesh(box(width * (1 - k * 0.06), L, thick * (1 - k * 0.05), 0.06), metal);
      ph.position.y = L / 2 + 0.05;
      j.add(ph);
      // Tira neón en el dorso de cada falange
      const ns = new Mesh(box(0.045, L * 0.62, 0.025, 0.01), strip);
      ns.position.set(0, L / 2 + 0.05, -thick / 2 - 0.01);
      j.add(ns);
      if (k === lens.length - 1) {
        // Yema: almohadilla de cobre
        const tip = new Mesh(box(width * 0.7, 0.1, thick * 0.5, 0.03), copper);
        tip.position.set(0, L + 0.02, thick * 0.12);
        j.add(tip);
      }
      joints.push(j);
      node = j;
    });
    return joints;
  };
  for (const f of fingerSpec) {
    const base = new Object3D();
    base.position.set(f.x, 0.15 + palmLen + 0.02, 0);
    root.add(base);
    const joints = chain(base, f.len, fw, ft);
    fingers.push({ joints, open: [-0.22, 0.14, 0.1], grip: [1.36, 1.12, 0.62], spread: f.spread });
  }
  // Pulgar: apunta hacia -X y se pliega sobre el borde izquierdo del chip.
  const thumbBase = new Object3D();
  thumbBase.position.set(-palmW / 2 - 0.02, 1.15, 0.02);
  thumbBase.rotation.z = Math.PI / 2;
  root.add(thumbBase);
  const thumbMount = new Mesh(box(0.34, 0.5, 0.36, 0.06), metal);
  thumbMount.position.set(0, -0.12, 0);
  thumbBase.add(thumbMount);
  const thumb = chain(thumbBase, [0.44, 0.36, 0.3], 0.4, 0.34);
  fingers.push({ joints: thumb, open: [-0.25, 0.12, 0.1], grip: [1.5, 1.08, 0.5], spread: 0 });

  /* ---------------- Muñeca, antebrazo, pistones y cables ---------------- */
  const wrist = new Mesh(joint(0.22, 1.34), copper);
  wrist.position.set(0, 0.04, 0);
  root.add(wrist);
  const forearm = new Mesh(box(1.5, 2.8, 0.95, 0.14), metal);
  forearm.position.set(0, -1.58, -0.05);
  root.add(forearm);
  const collar = new Mesh(box(1.62, 0.22, 1.04, 0.06), metalDark);
  collar.position.set(0, -0.32, -0.05);
  root.add(collar);
  for (const sx of [-1, 1]) {
    const sleeve = new Mesh(keep(new CylinderGeometry(0.09, 0.09, 1.1, 16)), metalDark);
    sleeve.position.set(sx * 0.82, -0.85, -0.18);
    root.add(sleeve);
    const rod = new Mesh(keep(new CylinderGeometry(0.045, 0.045, 0.95, 12)), copper);
    rod.position.set(sx * 0.82, 0.05, -0.18);
    root.add(rod);
    const fs = new Mesh(box(0.04, 2.0, 0.03, 0.012), strip);
    fs.position.set(sx * 0.55, -1.7, -0.54);
    root.add(fs);
  }
  // Cables expuestos del antebrazo al dorso de la palma
  const cableSpec = [
    { x: -0.32, mat: rubber, r: 0.045 },
    { x: 0.0, mat: neonMat(), r: 0.03 },
    { x: 0.32, mat: rubber, r: 0.045 },
  ];
  for (const c of cableSpec) {
    const curve = new CatmullRomCurve3([
      new Vector3(c.x, -1.3, -0.55),
      new Vector3(c.x * 1.1, -0.55, -0.72),
      new Vector3(c.x * 0.9, 0.05, -0.6),
      new Vector3(c.x * 0.7, 0.45, -0.28),
    ]);
    root.add(new Mesh(keep(new TubeGeometry(curve, 24, c.r, 8, false)), c.mat));
  }

  /* ---------------- Ancla del chip ---------------- */
  const anchor = new Object3D();
  // Centro del chip sobre la palma; su +Y (cara del die) mira hacia +Z (afuera de la palma).
  anchor.position.set(0, 1.1, palmT / 2 + 0.045 + 0.15 / HAND_SCALE + 0.01);
  anchor.rotation.x = Math.PI / 2;
  anchor.scale.setScalar(1 / HAND_SCALE);
  root.add(anchor);

  root.scale.setScalar(HAND_SCALE);

  const setGrip = (t: number) => {
    fingers.forEach((f, i) => {
      // Desfase: el meñique cierra primero y el pulgar al final, como un agarre real
      const lag = i === 4 ? 0.22 : (3 - i) * 0.05;
      const k = ease(clamp01((t - lag) / (1 - 0.22)));
      f.joints.forEach((j, n) => {
        j.rotation.x = f.open[n] + (f.grip[n] - f.open[n]) * k;
      });
      f.joints[0].rotation.z = f.spread * (1 - k);
    });
  };
  setGrip(0);

  const setNeon = (k: number) => {
    for (const m of neonMats) m.emissiveIntensity = 3 * k;
  };

  return { root, anchor, neonMats, setGrip, setNeon };
}
