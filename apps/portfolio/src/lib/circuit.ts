/**
 * Generador determinista de una placa de circuito (PCB) en SVG.
 * Se ejecuta en build: el HTML sale con las pistas ya calculadas y el cliente no corre JS.
 */

export interface Trace {
  d: string;
  /** Extremo de la pista, donde se dibuja un pad. */
  end: [number, number];
  /** Pista con corriente animada. */
  live: boolean;
  delay: number;
  duration: number;
}

export interface Board {
  width: number;
  height: number;
  chip: { x: number; y: number; size: number };
  pins: { x: number; y: number; w: number; h: number }[];
  traces: Trace[];
  bus: string[];
  vias: [number, number][];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildBoard({
  width = 1600,
  height = 900,
  cx = 1120,
  cy = 450,
  size = 210,
  pinsPerSide = 11,
  seed = 26,
} = {}): Board {
  const rand = mulberry32(seed);
  const half = size / 2;
  const pitch = size / (pinsPerSide + 1);
  const pinLen = 16;
  const pins: Board['pins'] = [];
  const traces: Trace[] = [];

  type Side = 'r' | 'l' | 't' | 'b';
  const sides: Side[] = ['r', 'l', 't', 'b'];

  for (const side of sides) {
    for (let i = 1; i <= pinsPerSide; i++) {
      const o = -half + i * pitch;
      // Origen de la pista en la punta del pin, y vectores: avance (ax,ay) y lateral (lx,ly)
      let sx: number, sy: number, ax: number, ay: number, lx: number, ly: number;
      if (side === 'r') {
        sx = cx + half + pinLen; sy = cy + o; ax = 1; ay = 0; lx = 0; ly = 1;
        pins.push({ x: cx + half, y: sy - 2.5, w: pinLen, h: 5 });
      } else if (side === 'l') {
        sx = cx - half - pinLen; sy = cy + o; ax = -1; ay = 0; lx = 0; ly = 1;
        pins.push({ x: sx, y: sy - 2.5, w: pinLen, h: 5 });
      } else if (side === 't') {
        sx = cx + o; sy = cy - half - pinLen; ax = 0; ay = -1; lx = 1; ly = 0;
        pins.push({ x: sx - 2.5, y: sy, w: 5, h: pinLen });
      } else {
        sx = cx + o; sy = cy + half + pinLen; ax = 0; ay = 1; lx = 1; ly = 0;
        pins.push({ x: sx - 2.5, y: cy + half, w: 5, h: pinLen });
      }

      // Las pistas se abren en abanico: las de los extremos se desvían más.
      const spread = (i - (pinsPerSide + 1) / 2) / ((pinsPerSide - 1) / 2); // -1..1
      const run1 = 24 + rand() * 50 + Math.abs(spread) * 10;
      const diag = Math.abs(spread) * (70 + rand() * 90) * (ax !== 0 ? 1 : 1.3);
      const dir = Math.sign(spread) || (rand() > 0.5 ? 1 : -1);
      const reach = ax !== 0 ? (ax > 0 ? width - sx : sx) : ay > 0 ? height - sy : sy;
      const run2 = Math.max(40, reach * (0.35 + rand() * 0.7) - run1 - diag);

      const p1x = sx + ax * run1;
      const p1y = sy + ay * run1;
      const p2x = p1x + ax * diag + lx * diag * dir;
      const p2y = p1y + ay * diag + ly * diag * dir;
      let ex = p2x + ax * run2;
      let ey = p2y + ay * run2;

      let d = `M${r1(sx)} ${r1(sy)}L${r1(p1x)} ${r1(p1y)}L${r1(p2x)} ${r1(p2y)}L${r1(ex)} ${r1(ey)}`;

      // Algunas pistas hacen un segundo quiebre para dar riqueza visual.
      if (rand() > 0.55) {
        const d2 = 30 + rand() * 60;
        const dir2 = rand() > 0.5 ? 1 : -1;
        const run3 = 40 + rand() * 160;
        const qx = ex + ax * d2 + lx * d2 * dir2;
        const qy = ey + ay * d2 + ly * d2 * dir2;
        ex = qx + ax * run3;
        ey = qy + ay * run3;
        d += `L${r1(qx)} ${r1(qy)}L${r1(ex)} ${r1(ey)}`;
      }

      traces.push({
        d,
        end: [r1(ex), r1(ey)],
        live: rand() > 0.42,
        delay: r1(rand() * 6),
        duration: r1(2.2 + rand() * 3.4),
      });
    }
  }

  // Buses de fondo: pistas paralelas tenues que no conectan con el chip.
  const bus: string[] = [];
  const busGroups = 7;
  for (let g = 0; g < busGroups; g++) {
    const horizontal = rand() > 0.4;
    const lines = 3 + Math.floor(rand() * 5);
    const gap = 9;
    const start = horizontal ? 40 + rand() * (height - 80) : 40 + rand() * (width - 80);
    const from = rand() * (horizontal ? width * 0.6 : height * 0.6);
    const len = 160 + rand() * 520;
    const bend = 30 + rand() * 40;
    for (let k = 0; k < lines; k++) {
      const off = start + k * gap;
      if (horizontal) {
        bus.push(`M${r1(from)} ${r1(off)}H${r1(from + len)}l${r1(bend)} ${r1(-bend)}h${r1(len * 0.4)}`);
      } else {
        bus.push(`M${r1(off)} ${r1(from)}V${r1(from + len)}l${r1(bend)} ${r1(bend)}v${r1(len * 0.4)}`);
      }
    }
  }

  const vias: [number, number][] = [];
  for (let v = 0; v < 46; v++) {
    vias.push([r1(rand() * width), r1(rand() * height)]);
  }

  return { width, height, chip: { x: cx, y: cy, size }, pins, traces, bus, vias };
}
