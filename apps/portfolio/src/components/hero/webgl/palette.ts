import { Color, SRGBColorSpace } from 'three';

/**
 * Paleta estricta de 5 colores (packages/design-tokens). Todo lo demás son mezclas de estos.
 * Los hex están en sRGB; THREE.Color los guarda en lineal.
 */
export const HEX = {
  graphite: '#07090a',
  ivory: '#ece6d9',
  neon: '#ff2a44',
  copper: '#d4823f',
  pcb: '#1db46e',
} as const;

type Hex = (typeof HEX)[keyof typeof HEX];

function srgb(hex: string) {
  const out = { r: 0, g: 0, b: 0 };
  new Color(hex).getRGB(out, SRGBColorSpace);
  return out;
}

/** Mezcla en sRGB (como color-mix del CSS del sitio). Devuelve un Color (lineal). */
export function mix(a: Hex, b: Hex, t: number): Color {
  const ca = srgb(a);
  const cb = srgb(b);
  return new Color().setRGB(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t, SRGBColorSpace);
}

/** Mezcla para pintar en canvas 2D. */
export function mixCss(a: Hex, b: Hex, t: number, alpha = 1): string {
  const ca = srgb(a);
  const cb = srgb(b);
  const ch = (x: number, y: number) => Math.round((x + (y - x) * t) * 255);
  return `rgba(${ch(ca.r, cb.r)},${ch(ca.g, cb.g)},${ch(ca.b, cb.b)},${alpha})`;
}

/** Hex con alfa para canvas. */
export function rgba(hex: Hex, alpha: number): string {
  return mixCss(hex, hex, 0, alpha);
}

export const C = {
  graphite: new Color(HEX.graphite),
  ivory: new Color(HEX.ivory),
  neon: new Color(HEX.neon),
  copper: new Color(HEX.copper),
  pcb: new Color(HEX.pcb),
  soldermask: mix(HEX.graphite, HEX.pcb, 0.2),
  chipBody: mix(HEX.graphite, HEX.ivory, 0.08),
  copperHi: mix(HEX.copper, HEX.ivory, 0.55),
};
