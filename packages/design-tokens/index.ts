/**
 * Fuente única de la paleta. Máximo 5 colores; variantes por opacidad o mezcla.
 * Mantener sincronizado con tokens.css.
 */
export const colors = {
  graphite: '#07090A',
  ivory: '#ECE6D9',
  neon: '#FF2A44',
  copper: '#D4823F',
  pcb: '#1DB46E',
} as const;

export const fonts = {
  sans: "'Instrument Sans Variable', ui-sans-serif, system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
} as const;

export type ColorToken = keyof typeof colors;
