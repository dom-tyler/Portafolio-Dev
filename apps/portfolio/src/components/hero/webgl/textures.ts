import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace } from 'three';
import { mulberry32 } from './geometry';
import { HEX, mixCss, rgba } from './palette';

/**
 * Texturas generadas en canvas 2D: sin descargas, todo determinista.
 */

export const MONO = '"IBM Plex Mono", ui-monospace, monospace';
export const SANS = '"Unbounded Variable", ui-sans-serif, sans-serif';

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

/** Marcado láser del encapsulado QFP (alfa sobre el cuerpo): mate y apenas más claro que la resina. */
export function chipMarkTexture(aniso: number): CanvasTexture {
  const S = 1024;
  const { c, ctx } = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(HEX.ivory, 0.5);
  ctx.font = mono(58, 500);
  ctx.fillText('DO·26 / ARCH-CORE', S / 2, 96);
  ctx.font = mono(30, 400);
  ctx.fillStyle = rgba(HEX.ivory, 0.32);
  ctx.fillText('MDE 2611 · REV C · SILICIO → IA', S / 2, S - 86);
  // Marca de pin 1 (hundida) y logotipo de línea fina
  ctx.beginPath();
  ctx.arc(92, 92, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(HEX.ivory, 0.26);
  ctx.lineWidth = 3;
  ctx.strokeRect(S - 150, S - 150, 70, 70);
  ctx.strokeRect(S - 132, S - 132, 34, 34);
  // Marco de la ventana del die
  ctx.strokeStyle = rgba(HEX.ivory, 0.2);
  ctx.lineWidth = 4;
  ctx.strokeRect(S * 0.2, S * 0.2, S * 0.6, S * 0.6);
  return tex(c, true, aniso);
}

/** Capa holográfica: índice, nombre de la capa, microtexto HUD y una pequeña glifo por capa. */
export function holoTexture(index: string, title: string, sub: string, aniso: number): CanvasTexture {
  const W = 1024;
  const H = 640;
  const { c, ctx } = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.font = mono(24, 500);
  ctx.fillStyle = rgba(HEX.copper, 0.95);
  ctx.fillText(`[ ${index} ]`, 48, 64);
  ctx.textAlign = 'right';
  ctx.fillStyle = rgba(HEX.pcb, 0.95);
  ctx.fillText('● LINK', W - 48, 64);
  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(HEX.ivory, 0.14);
  ctx.fillRect(48, 104, W - 96, 2);
  ctx.font = `750 112px ${SANS}`;
  ctx.fillStyle = rgba(HEX.ivory, 0.96);
  ctx.fillText(title, 48, 260);
  ctx.font = mono(28, 400);
  ctx.fillStyle = rgba(HEX.ivory, 0.55);
  ctx.fillText(sub, 52, 360);
  // Retícula de "datos" abstracta
  for (let i = 0; i < 18; i++) {
    const x = 52 + i * 50;
    const h = 20 + ((i * 37) % 70);
    ctx.fillStyle = i % 5 === 0 ? rgba(HEX.neon, 0.85) : rgba(HEX.ivory, 0.22);
    ctx.fillRect(x, 520 - h, 26, h);
  }
  ctx.font = mono(22, 500);
  ctx.fillStyle = rgba(HEX.ivory, 0.4);
  ctx.textAlign = 'right';
  ctx.fillText('VER PROYECTOS →', W - 48, H - 50);
  return tex(c, true, aniso);
}
