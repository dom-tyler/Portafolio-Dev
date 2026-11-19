import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace } from 'three';
import { mulberry32 } from './geometry';
import { HEX, mixCss, rgba } from './palette';

/**
 * Texturas generadas en canvas 2D: sin descargas, todo determinista.
 * Los paneles evocan los casos (catálogo con selector de presentación, filtro + mapa) con formas
 * abstractas; no imitan capturas de productos.
 */

export const MONO = '"IBM Plex Mono", ui-monospace, monospace';
export const SANS = '"Instrument Sans Variable", ui-sans-serif, sans-serif';

export async function loadFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`400 24px ${MONO}`),
        document.fonts.load(`500 24px ${MONO}`),
        document.fonts.load(`600 24px ${SANS}`),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* las fuentes de respaldo bastan */
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function tex(c: HTMLCanvasElement, color = true, aniso = 4): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = aniso;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

const mono = (px: number, weight = 400) => `${weight} ${px}px ${MONO}`;

/* ------------------------------------------------------------------ */
/* Serigrafía + cobre bajo máscara                                      */
/* ------------------------------------------------------------------ */

export interface SilkItem {
  kind: 'rect' | 'label' | 'ring' | 'pour' | 'fiducial' | 'bracket';
  x: number;
  z: number;
  w?: number;
  h?: number;
  r?: number;
  rot?: number;
  text?: string;
  size?: number;
}

/** R = serigrafía, G = cobre bajo máscara. Coordenadas en unidades de placa (x, z). */
export function silkTexture(boardW: number, boardH: number, items: SilkItem[], aniso: number): CanvasTexture {
  const ppu = 72;
  const { c, ctx } = canvas(Math.round(boardW * ppu), Math.round(boardH * ppu));
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'lighter';
  const px = (x: number) => (x + boardW / 2) * ppu;
  const pz = (z: number) => (z + boardH / 2) * ppu;
  const SILK = 'rgb(255,0,0)';
  const POUR = 'rgb(0,255,0)';
  ctx.lineWidth = 0.028 * ppu;
  ctx.lineCap = 'square';

  for (const it of items) {
    ctx.save();
    ctx.translate(px(it.x), pz(it.z));
    if (it.rot) ctx.rotate(it.rot);
    const w = (it.w ?? 0) * ppu;
    const h = (it.h ?? 0) * ppu;
    switch (it.kind) {
      case 'rect':
        ctx.strokeStyle = SILK;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        break;
      case 'bracket': {
        ctx.strokeStyle = SILK;
        const l = Math.min(w, h) * 0.18;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          ctx.moveTo((sx * w) / 2, (sy * h) / 2 - sy * l);
          ctx.lineTo((sx * w) / 2, (sy * h) / 2);
          ctx.lineTo((sx * w) / 2 - sx * l, (sy * h) / 2);
        }
        ctx.stroke();
        break;
      }
      case 'label':
        ctx.fillStyle = SILK;
        ctx.font = mono(Math.round((it.size ?? 0.22) * ppu), 500);
        ctx.textBaseline = 'middle';
        ctx.fillText(it.text ?? '', 0, 0);
        break;
      case 'ring':
        ctx.strokeStyle = SILK;
        ctx.beginPath();
        ctx.arc(0, 0, (it.r ?? 0.2) * ppu, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'fiducial':
        ctx.fillStyle = POUR;
        ctx.beginPath();
        ctx.arc(0, 0, 0.14 * ppu, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = SILK;
        ctx.beginPath();
        ctx.arc(0, 0, 0.32 * ppu, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'pour': {
        ctx.fillStyle = POUR;
        const r = 0.35 * ppu;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, r);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  // Regla de escala en el borde superior
  ctx.strokeStyle = SILK;
  ctx.lineWidth = 0.02 * ppu;
  const z0 = pz(-boardH / 2 + 1.3);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const x = px(-9 + i * 0.25);
    const l = i % 4 === 0 ? 0.28 : 0.14;
    ctx.moveTo(x, z0);
    ctx.lineTo(x, z0 + l * ppu);
  }
  ctx.moveTo(px(-9), z0);
  ctx.lineTo(px(1), z0);
  ctx.stroke();
  return tex(c, false, aniso);
}

/* ------------------------------------------------------------------ */
/* Die decapado                                                          */
/* ------------------------------------------------------------------ */

export function dieTextures(aniso: number): { map: CanvasTexture; glow: CanvasTexture } {
  const S = 1024;
  const { c, ctx } = canvas(S, S);
  const { c: gc, ctx: g } = canvas(512, 512);
  const rand = mulberry32(7);
  const k = 512 / S;

  const grad = ctx.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, mixCss(HEX.graphite, HEX.ivory, 0.2));
  grad.addColorStop(0.5, mixCss(HEX.graphite, HEX.pcb, 0.16));
  grad.addColorStop(1, mixCss(HEX.graphite, HEX.copper, 0.2));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);

  const margin = 96;
  type R = { x: number; y: number; w: number; h: number };
  const blocks: R[] = [];
  const split = (r: R, depth: number) => {
    if (depth > 4 || (r.w < 150 && r.h < 150) || (depth > 1 && rand() < 0.18)) {
      blocks.push(r);
      return;
    }
    const gap = 14;
    if (r.w > r.h) {
      const s = r.w * (0.3 + rand() * 0.4);
      split({ x: r.x, y: r.y, w: s - gap / 2, h: r.h }, depth + 1);
      split({ x: r.x + s + gap / 2, y: r.y, w: r.w - s - gap / 2, h: r.h }, depth + 1);
    } else {
      const s = r.h * (0.3 + rand() * 0.4);
      split({ x: r.x, y: r.y, w: r.w, h: s - gap / 2 }, depth + 1);
      split({ x: r.x, y: r.y + s + gap / 2, w: r.w, h: r.h - s - gap / 2 }, depth + 1);
    }
  };
  split({ x: margin, y: margin, w: S - margin * 2, h: S - margin * 2 }, 0);

  // Canales entre bloques: líneas de bus que brillan.
  g.strokeStyle = '#fff';
  for (const b of blocks) {
    const kind = rand();
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    if (kind < 0.38) {
      // Memoria: retícula densa
      ctx.fillStyle = mixCss(HEX.graphite, HEX.copper, 0.32);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = mixCss(HEX.copper, HEX.ivory, 0.35, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = b.x; x < b.x + b.w; x += 4) {
        ctx.moveTo(x + 0.5, b.y);
        ctx.lineTo(x + 0.5, b.y + b.h);
      }
      ctx.stroke();
      ctx.strokeStyle = rgba(HEX.graphite, 0.5);
      ctx.beginPath();
      for (let y = b.y; y < b.y + b.h; y += 9) {
        ctx.moveTo(b.x, y + 0.5);
        ctx.lineTo(b.x + b.w, y + 0.5);
      }
      ctx.stroke();
    } else if (kind < 0.75) {
      // Lógica: celdas estándar en filas
      ctx.fillStyle = mixCss(HEX.graphite, HEX.pcb, 0.22);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      for (let y = b.y + 2; y < b.y + b.h; y += 7) {
        let x = b.x + 2;
        while (x < b.x + b.w) {
          const w = 3 + rand() * 14;
          const t = rand();
          ctx.fillStyle =
            t < 0.5 ? mixCss(HEX.pcb, HEX.ivory, 0.3, 0.35) : t < 0.8 ? mixCss(HEX.copper, HEX.ivory, 0.2, 0.4) : rgba(HEX.ivory, 0.5);
          ctx.fillRect(x, y, w, 4);
          x += w + 1 + rand() * 3;
        }
      }
    } else {
      // Analógico / núcleo: rectángulos concéntricos
      ctx.fillStyle = mixCss(HEX.graphite, HEX.ivory, 0.12);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = mixCss(HEX.copper, HEX.ivory, 0.4, 0.7);
      ctx.lineWidth = 2;
      for (let i = 6; i < Math.min(b.w, b.h) / 2; i += 9) ctx.strokeRect(b.x + i, b.y + i, b.w - i * 2, b.h - i * 2);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect((b.x + b.w * 0.35) * k, (b.y + b.h * 0.35) * k, b.w * 0.3 * k, b.h * 0.3 * k);
    }
    ctx.restore();
    // Contorno del bloque y su canal brillante
    ctx.strokeStyle = rgba(HEX.ivory, 0.22);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    g.lineWidth = 2.2;
    g.strokeStyle = `rgba(255,255,255,${0.35 + rand() * 0.65})`;
    g.strokeRect((b.x - 6) * k, (b.y - 6) * k, (b.w + 12) * k, (b.h + 12) * k);
  }

  // Bus perimetral y pads de soldadura de los hilos
  ctx.strokeStyle = mixCss(HEX.copper, HEX.ivory, 0.25, 0.8);
  ctx.lineWidth = 3;
  ctx.strokeRect(margin - 30, margin - 30, S - (margin - 30) * 2, S - (margin - 30) * 2);
  g.lineWidth = 3;
  g.strokeStyle = '#fff';
  g.strokeRect((margin - 30) * k, (margin - 30) * k, (S - (margin - 30) * 2) * k, (S - (margin - 30) * 2) * k);
  const pads = 16;
  for (let i = 0; i < pads; i++) {
    const o = margin + ((S - margin * 2) / (pads - 1)) * i;
    for (const [x, y] of [
      [o, 34],
      [o, S - 34],
      [34, o],
      [S - 34, o],
    ]) {
      ctx.fillStyle = mixCss(HEX.copper, HEX.ivory, 0.45);
      ctx.fillRect(x - 13, y - 13, 26, 26);
      ctx.fillStyle = rgba(HEX.graphite, 0.35);
      ctx.fillRect(x - 6, y - 6, 12, 12);
    }
  }
  ctx.fillStyle = rgba(HEX.ivory, 0.55);
  ctx.font = mono(18, 500);
  ctx.fillText('DO·26  SILICIO', margin, S - margin + 40);

  return { map: tex(c, true, aniso), glow: tex(gc, false, aniso) };
}

/** Marcado láser del encapsulado QFP (alfa sobre el cuerpo). */
export function chipMarkTexture(aniso: number): CanvasTexture {
  const S = 512;
  const { c, ctx } = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = rgba(HEX.ivory, 0.42);
  ctx.textAlign = 'center';
  ctx.font = mono(26, 500);
  ctx.fillText('D.OSORIO  SoC-26', S / 2, 62);
  ctx.font = mono(18, 400);
  ctx.fillStyle = rgba(HEX.ivory, 0.3);
  ctx.fillText('MDE · 2611 · C4', S / 2, S - 44);
  ctx.beginPath();
  ctx.arc(46, 46, 11, 0, Math.PI * 2);
  ctx.fill();
  // Marco de la ventana decapada
  ctx.strokeStyle = rgba(HEX.ivory, 0.18);
  ctx.lineWidth = 2;
  ctx.strokeRect(S * 0.18, S * 0.18, S * 0.64, S * 0.64);
  return tex(c, true, aniso);
}

/* ------------------------------------------------------------------ */
/* Paneles de interfaz                                                   */
/* ------------------------------------------------------------------ */

export type PanelKind = 'catalog' | 'map' | 'order' | 'telemetry';

const IV = (a: number) => rgba(HEX.ivory, a);

function header(ctx: CanvasRenderingContext2D, W: number, idx: string, title: string, status: string, ok = true) {
  ctx.font = mono(20, 500);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = IV(0.42);
  ctx.fillText(`[ ${idx} ]`, 34, 40);
  ctx.fillStyle = IV(0.9);
  ctx.fillText(title, 110, 40);
  ctx.textAlign = 'right';
  ctx.fillStyle = ok ? rgba(HEX.pcb, 0.95) : rgba(HEX.neon, 0.95);
  ctx.fillText(status, W - 34, 40);
  ctx.beginPath();
  ctx.arc(W - 34 - ctx.measureText(status).width - 16, 40, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = IV(0.12);
  ctx.fillRect(34, 70, W - 68, 1.5);
}

function footer(ctx: CanvasRenderingContext2D, W: number, H: number, text: string, right: string) {
  ctx.fillStyle = IV(0.12);
  ctx.fillRect(34, H - 54, W - 68, 1.5);
  ctx.font = mono(16, 400);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = IV(0.4);
  ctx.fillText(text, 34, H - 30);
  ctx.textAlign = 'right';
  ctx.fillText(right, W - 34, H - 30);
  ctx.textAlign = 'left';
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawCatalog(ctx: CanvasRenderingContext2D, W: number, H: number) {
  header(ctx, W, '01', 'CATÁLOGO', 'EN VIVO');
  // Selector de presentación (segmentado)
  const opts = ['FRASCO', 'DECANT 10', 'DECANT 5'];
  const sx = 34;
  const sy = 96;
  const sw = 150;
  ctx.font = mono(17, 500);
  opts.forEach((o, i) => {
    const x = sx + i * (sw + 8);
    const active = i === 1;
    ctx.strokeStyle = active ? rgba(HEX.neon, 0.95) : IV(0.22);
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.strokeRect(x, sy, sw, 40);
    ctx.fillStyle = active ? rgba(HEX.neon, 0.14) : 'transparent';
    if (active) ctx.fillRect(x, sy, sw, 40);
    ctx.fillStyle = active ? IV(0.95) : IV(0.5);
    ctx.textAlign = 'center';
    ctx.fillText(o, x + sw / 2, sy + 21);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = IV(0.4);
  ctx.textAlign = 'right';
  ctx.fillText('PRESENTACIÓN', W - 34, sy + 21);
  ctx.textAlign = 'left';

  // Rejilla de productos (formas abstractas de frasco)
  const cols = 4;
  const rows = 2;
  const gx = 34;
  const gy = 160;
  const gw = (W - 68 - (cols - 1) * 16) / cols;
  const gh = (H - gy - 74 - (rows - 1) * 16) / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = gx + col * (gw + 16);
      const y = gy + r * (gh + 16);
      const sel = r === 0 && col === 1;
      ctx.strokeStyle = sel ? rgba(HEX.neon, 0.9) : IV(0.16);
      ctx.lineWidth = sel ? 2 : 1.5;
      ctx.strokeRect(x, y, gw, gh);
      // Frasco: cuerpo + cuello + tapa
      const cx = x + gw / 2;
      const by = y + gh * 0.16;
      const bw = gw * (0.26 + ((r + col) % 3) * 0.05);
      const bh = gh * 0.42;
      ctx.strokeStyle = sel ? rgba(HEX.copper, 0.95) : rgba(HEX.copper, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2, by + bh * 0.28, bw, bh * 0.72, 6);
      ctx.stroke();
      ctx.strokeRect(cx - bw * 0.14, by + bh * 0.12, bw * 0.28, bh * 0.16);
      ctx.fillStyle = sel ? rgba(HEX.copper, 0.5) : IV(0.14);
      ctx.fillRect(cx - bw * 0.2, by, bw * 0.4, bh * 0.12);
      // Etiquetas abstractas
      bar(ctx, x + 14, y + gh * 0.68, gw * 0.55, 7, IV(0.45));
      bar(ctx, x + 14, y + gh * 0.68 + 16, gw * 0.32, 6, IV(0.2));
      ctx.font = mono(15, 500);
      ctx.fillStyle = sel ? rgba(HEX.neon, 0.95) : IV(0.55);
      ctx.textAlign = 'right';
      ctx.fillText(sel ? '10 ML' : '— ML', x + gw - 14, y + gh - 18);
      ctx.textAlign = 'left';
    }
  }
  footer(ctx, W, H, 'EXCENTRIX · SELECTOR DE PRESENTACIÓN', 'SKU 0412');
}

function drawMap(ctx: CanvasRenderingContext2D, W: number, H: number) {
  header(ctx, W, '02', 'FILTRO + MAPA', '128 RESULTADOS');
  const rand = mulberry32(11);
  const fx = 34;
  const fw = 250;
  let y = 100;
  ctx.font = mono(15, 500);
  const label = (t: string) => {
    ctx.fillStyle = IV(0.42);
    ctx.fillText(t, fx, y);
    y += 26;
  };
  label('ZONA');
  ['NORTE', 'CENTRO', 'SUR'].forEach((t, i) => {
    ctx.strokeStyle = i === 0 ? rgba(HEX.pcb, 0.9) : IV(0.2);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(fx + i * 82, y - 14, 74, 30);
    ctx.fillStyle = i === 0 ? rgba(HEX.pcb, 0.95) : IV(0.5);
    ctx.fillText(t, fx + i * 82 + 8, y + 2);
  });
  y += 52;
  label('PRECIO');
  ctx.fillStyle = IV(0.18);
  ctx.fillRect(fx, y, fw, 2);
  ctx.fillStyle = rgba(HEX.neon, 0.9);
  ctx.fillRect(fx + fw * 0.22, y, fw * 0.46, 2);
  for (const t of [0.22, 0.68]) {
    ctx.beginPath();
    ctx.arc(fx + fw * t, y + 1, 8, 0, Math.PI * 2);
    ctx.fillStyle = HEX.graphite;
    ctx.fill();
    ctx.strokeStyle = rgba(HEX.neon, 0.95);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  y += 44;
  label('HABITACIONES');
  ['1', '2', '3', '4+'].forEach((t, i) => {
    const on = i === 2;
    ctx.strokeStyle = on ? IV(0.8) : IV(0.2);
    ctx.strokeRect(fx + i * 60, y - 14, 50, 30);
    ctx.fillStyle = on ? IV(0.95) : IV(0.5);
    ctx.fillText(t, fx + i * 60 + 16, y + 2);
  });
  y += 52;
  label('FAVORITOS');
  ctx.strokeStyle = IV(0.25);
  ctx.beginPath();
  ctx.roundRect(fx, y - 14, 56, 28, 14);
  ctx.stroke();
  ctx.fillStyle = rgba(HEX.pcb, 0.9);
  ctx.beginPath();
  ctx.arc(fx + 42, y, 9, 0, Math.PI * 2);
  ctx.fill();

  // Mapa abstracto: red vial, río y lotes
  const mx = fx + fw + 30;
  const my = 92;
  const mw = W - mx - 34;
  const mh = H - my - 74;
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  ctx.fillStyle = rgba(HEX.ivory, 0.025);
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = IV(0.08);
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const vx = mx + rand() * mw;
    ctx.beginPath();
    ctx.moveTo(vx, my);
    ctx.lineTo(vx + (rand() - 0.5) * 120, my + mh);
    ctx.stroke();
    const hy = my + rand() * mh;
    ctx.beginPath();
    ctx.moveTo(mx, hy);
    ctx.lineTo(mx + mw, hy + (rand() - 0.5) * 80);
    ctx.stroke();
  }
  ctx.strokeStyle = IV(0.2);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mx, my + mh * 0.62);
  ctx.bezierCurveTo(mx + mw * 0.3, my + mh * 0.4, mx + mw * 0.6, my + mh * 0.9, mx + mw, my + mh * 0.55);
  ctx.stroke();
  ctx.strokeStyle = rgba(HEX.pcb, 0.35);
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(mx + mw * 0.15, my);
  ctx.bezierCurveTo(mx + mw * 0.35, my + mh * 0.35, mx + mw * 0.1, my + mh * 0.7, mx + mw * 0.32, my + mh);
  ctx.stroke();
  for (let i = 0; i < 14; i++) {
    const px = mx + 20 + rand() * (mw - 40);
    const py = my + 20 + rand() * (mh - 40);
    ctx.fillStyle = rgba(HEX.pcb, 0.85);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pin activo + tarjeta
  const ax = mx + mw * 0.62;
  const ay = my + mh * 0.42;
  ctx.strokeStyle = rgba(HEX.neon, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax, ay, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgba(HEX.neon, 1);
  ctx.beginPath();
  ctx.arc(ax, ay, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(HEX.graphite, 0.9);
  ctx.fillRect(ax + 30, ay - 52, 170, 74);
  ctx.strokeStyle = IV(0.3);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ax + 30, ay - 52, 170, 74);
  bar(ctx, ax + 44, ay - 36, 110, 7, IV(0.6));
  bar(ctx, ax + 44, ay - 20, 70, 6, IV(0.25));
  ctx.font = mono(15, 500);
  ctx.fillStyle = rgba(HEX.neon, 0.95);
  ctx.fillText('3 HAB · 84 M²', ax + 44, ay + 6);
  ctx.restore();
  ctx.strokeStyle = IV(0.16);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mx, my, mw, mh);
  footer(ctx, W, H, 'DAYED · DESCUBRIMIENTO DE INMUEBLES', '6.24° N');
}

function drawOrder(ctx: CanvasRenderingContext2D, W: number, H: number) {
  header(ctx, W, '03', 'PEDIDO', 'LISTO');
  const rows = [
    ['PRODUCTO', 0.5],
    ['PRESENTACIÓN', 0.0],
    ['PRECIO', 0.32],
  ] as const;
  let y = 120;
  ctx.font = mono(19, 500);
  rows.forEach(([k, w], i) => {
    ctx.fillStyle = IV(0.45);
    ctx.fillText(k, 40, y);
    if (i === 1) {
      ctx.fillStyle = rgba(HEX.neon, 0.95);
      ctx.textAlign = 'right';
      ctx.fillText('DECANT 10 ML', W - 40, y);
      ctx.textAlign = 'left';
    } else bar(ctx, W - 40 - (W - 340) * (w + 0.4), y - 5, (W - 340) * (w + 0.4), 9, IV(0.55));
    ctx.fillStyle = IV(0.1);
    ctx.fillRect(40, y + 30, W - 80, 1.5);
    y += 70;
  });
  // Botón
  const by = H - 150;
  ctx.strokeStyle = rgba(HEX.neon, 0.95);
  ctx.lineWidth = 2;
  ctx.strokeRect(40, by, W - 80, 62);
  ctx.fillStyle = rgba(HEX.neon, 0.16);
  ctx.fillRect(40, by, W - 80, 62);
  ctx.fillStyle = IV(0.95);
  ctx.font = mono(19, 500);
  ctx.fillText('ENVIAR PEDIDO  →', 66, by + 32);
  footer(ctx, W, H, 'MENSAJE CON PEDIDO COMPLETO', '200 OK');
}

function drawTelemetry(ctx: CanvasRenderingContext2D, W: number, H: number) {
  header(ctx, W, '04', 'API', 'P95 41 MS');
  const rand = mulberry32(5);
  const cx = 40;
  const cy = 100;
  const cw = W - 80;
  const ch = 190;
  ctx.strokeStyle = IV(0.08);
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + (ch / 4) * i);
    ctx.lineTo(cx + cw, cy + (ch / 4) * i);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(HEX.copper, 0.95);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let v = 0.5;
  for (let i = 0; i <= 60; i++) {
    v = Math.min(0.92, Math.max(0.12, v + (rand() - 0.5) * 0.18));
    const x = cx + (cw / 60) * i;
    const y = cy + ch * (1 - v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.font = mono(16, 400);
  const logs = [
    ['GET', '/productos', '200', '38ms'],
    ['POST', '/pedidos', '201', '54ms'],
    ['GET', '/inmuebles?zona=n', '200', '41ms'],
    ['POST', '/rag/consulta', '200', '312ms'],
  ];
  let y = cy + ch + 40;
  for (const [m, p, s, t] of logs) {
    ctx.fillStyle = IV(0.4);
    ctx.fillText(m, cx, y);
    ctx.fillStyle = IV(0.75);
    ctx.fillText(p, cx + 70, y);
    ctx.fillStyle = rgba(HEX.pcb, 0.9);
    ctx.fillText(s, cx + cw - 120, y);
    ctx.fillStyle = IV(0.45);
    ctx.textAlign = 'right';
    ctx.fillText(t, cx + cw, y);
    ctx.textAlign = 'left';
    y += 30;
  }
  footer(ctx, W, H, 'SERVICIOS · TELEMETRÍA', 'UTC-5');
}

export function panelTexture(kind: PanelKind, aspect: number, aniso: number): CanvasTexture {
  const W = 1024;
  const H = Math.round(W / aspect);
  const { c, ctx } = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  if (kind === 'catalog') drawCatalog(ctx, W, H);
  else if (kind === 'map') drawMap(ctx, W, H);
  else if (kind === 'order') drawOrder(ctx, W, H);
  else drawTelemetry(ctx, W, H);
  return tex(c, true, aniso);
}

/** Etiqueta HUD de un nodo del grafo (sprite). */
export function labelTexture(title: string, sub: string, accent: 'neon' | 'pcb', aniso: number): CanvasTexture {
  const W = 512;
  const H = 136;
  const { c, ctx } = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.font = mono(46, 500);
  const tw = ctx.measureText(title).width;
  ctx.font = mono(22, 400);
  const sw = ctx.measureText(sub).width;
  const bw = Math.max(tw, sw) + 64;
  const x0 = (W - bw) / 2;
  ctx.fillStyle = rgba(HEX.graphite, 0.72);
  ctx.fillRect(x0, 8, bw, H - 16);
  ctx.strokeStyle = IV(0.28);
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, 8, bw, H - 16);
  ctx.fillStyle = accent === 'neon' ? rgba(HEX.neon, 1) : rgba(HEX.pcb, 1);
  ctx.fillRect(x0, 8, 5, H - 16);
  ctx.textAlign = 'center';
  ctx.font = mono(46, 500);
  ctx.fillStyle = IV(0.96);
  ctx.fillText(title, W / 2, 54);
  ctx.font = mono(22, 400);
  ctx.fillStyle = IV(0.5);
  ctx.fillText(sub, W / 2, 98);
  return tex(c, true, aniso);
}
