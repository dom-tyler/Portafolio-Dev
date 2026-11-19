import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

export interface RibbonPath {
  pts: Vector3[];
  width: number;
  /** Velocidad del pulso (negativa = viaja hacia el inicio). */
  speed: number;
  seed: number;
  /** 1 = lleva corriente, 0 = solo cobre. */
  live: number;
  /** Desplaza la distancia acumulada (encadena una cinta a continuación de otra). */
  offset?: number;
}

export function pathLength(pts: Vector3[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += pts[i].distanceTo(pts[i - 1]);
  return l;
}

/** Punto a una distancia `d` a lo largo de la polilínea. */
export function pointAt(pts: Vector3[], d: number, out = new Vector3()): Vector3 {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = pts[i].distanceTo(pts[i - 1]);
    if (acc + seg >= d) return out.lerpVectors(pts[i - 1], pts[i], seg > 0 ? (d - acc) / seg : 0);
    acc += seg;
  }
  return out.copy(pts[pts.length - 1]);
}

/**
 * Cintas con uniones a inglete (pistas de PCB a 45°) en una sola geometría.
 * `normal` es la normal del plano de la cinta; con `height` > 0 añade paredes laterales (relieve del cobre).
 * Atributos: aDist (distancia acumulada), aAcross (-1..1), aTrace (largo, semilla, velocidad, viva).
 */
export function buildRibbons(paths: RibbonPath[], normal = new Vector3(0, 1, 0), height = 0): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const dist: number[] = [];
  const across: number[] = [];
  const trace: number[] = [];
  const index: number[] = [];

  const side = new Vector3();
  const prevSide = new Vector3();
  const miter = new Vector3();
  const t = new Vector3();
  const up = normal.clone().normalize().multiplyScalar(height);

  for (const path of paths) {
    const { pts, width } = path;
    const n = pts.length;
    if (n < 2) continue;
    const len = pathLength(pts);
    const hw = width / 2;
    const offsets: { m: Vector3; k: number; d: number }[] = [];
    let acc = path.offset ?? 0;

    for (let i = 0; i < n; i++) {
      if (i > 0) acc += pts[i].distanceTo(pts[i - 1]);
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      if (i < n - 1) {
        t.subVectors(pts[i + 1], pts[i]).normalize();
        side.crossVectors(t, normal).normalize();
      }
      if (i === 0) prevSide.copy(side);
      miter.copy(prevSide).add(side).normalize();
      let k = 1 / Math.max(0.35, miter.dot(side));
      if (i === n - 1) {
        t.subVectors(b, a).normalize();
        side.crossVectors(t, normal).normalize();
        miter.copy(side);
        k = 1;
      }
      offsets.push({ m: miter.clone(), k, d: acc });
      prevSide.copy(side);
    }

    const tr = [len, path.seed, path.speed, path.live];
    const pushV = (p: Vector3, nx: Vector3, d: number, ac: number) => {
      pos.push(p.x, p.y, p.z);
      nor.push(nx.x, nx.y, nx.z);
      dist.push(d);
      across.push(ac);
      trace.push(...tr);
    };

    const tmp = new Vector3();
    const nUp = normal.clone().normalize();
    // Cara superior
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const { m, k, d } = offsets[i];
      pushV(tmp.copy(pts[i]).addScaledVector(m, hw * k).add(up), nUp, d, 1);
      pushV(tmp.copy(pts[i]).addScaledVector(m, -hw * k).add(up), nUp, d, -1);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }

    if (height > 0) {
      for (const s of [1, -1]) {
        const wb = pos.length / 3;
        for (let i = 0; i < n; i++) {
          const { m, k, d } = offsets[i];
          const wn = m.clone().multiplyScalar(s);
          pushV(tmp.copy(pts[i]).addScaledVector(m, s * hw * k).add(up), wn, d, s);
          pushV(tmp.copy(pts[i]).addScaledVector(m, s * hw * k), wn, d, s);
        }
        for (let i = 0; i < n - 1; i++) {
          const a = wb + i * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('aDist', new BufferAttribute(new Float32Array(dist), 1));
  g.setAttribute('aAcross', new BufferAttribute(new Float32Array(across), 1));
  g.setAttribute('aTrace', new BufferAttribute(new Float32Array(trace), 4));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** PRNG determinista: la placa es siempre la misma. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruta ortogonal con chaflán a 45° entre dos puntos del plano XZ (estilo pista de PCB). */
export function route45(a: Vector3, b: Vector3, bias = 0.5): Vector3[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const adx = Math.abs(dx);
  const adz = Math.abs(dz);
  if (adz < 1e-3 || adx < 1e-3) return [a.clone(), b.clone()];
  if (adx >= adz) {
    const run = (adx - adz) * bias;
    const p1 = new Vector3(a.x + Math.sign(dx) * run, a.y, a.z);
    const p2 = new Vector3(p1.x + Math.sign(dx) * adz, a.y, b.z);
    return [a.clone(), p1, p2, b.clone()];
  }
  const run = (adz - adx) * bias;
  const p1 = new Vector3(a.x, a.y, a.z + Math.sign(dz) * run);
  const p2 = new Vector3(b.x, a.y, p1.z + Math.sign(dz) * adx);
  return [a.clone(), p1, p2, b.clone()];
}
