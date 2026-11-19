# Portafolio · Daniel Osorio

Sitio público del portafolio. Astro estático + TypeScript + Tailwind 4. El panel de administración vive en un repositorio aparte (`AresHidalgo/AD-Portafolio`).

## Requisitos
- Node 24 (`.nvmrc`). Astro 7.4 exige Node ≥ 22.23.4.
- pnpm 10.

## Comandos
```bash
pnpm install
pnpm dev       # http://localhost:4321
pnpm build     # apps/portfolio/dist
```

## Estructura
```
apps/portfolio/          sitio Astro
  src/content/           contenido validado con Zod (projects, experience, site)
  src/components/hero/   hero de tres escenas (contrato abajo)
packages/content-schema/ esquema Zod compartido
packages/design-tokens/  paleta y tipografía (5 colores, 2 familias)
docs/CONTENT_REVIEW.md   afirmaciones pendientes de validar antes de publicar
```

## Dirección visual
Cyberpunk sobrio, con igloo.inc como referente: microtipografía HUD, línea fina y cámara continua. El HTML se renderiza primero y el 3D llega como mejora progresiva.
Paleta: grafito `#07090A`, marfil `#ECE6D9`, neón `#FF2A44`, cobre `#D4823F`, verde PCB `#1DB46E`.
Tipos: Unbounded (títulos, 650–800) e IBM Plex Mono (texto corrido, HUD y datos).

## Contrato del hero (para las variantes WebGL y video)
`src/components/hero/Hero.astro` expone:
- El slot `media`, que se monta dentro de `[data-hero-media]` (`position:absolute; inset:0`).
- El evento `hero:progress` en `window`, con `detail = { progress, scene: 1|2|3, sceneProgress }`. También está la variable CSS `--hero-p`.
- La clase `is-media-ready` sobre `[data-hero]`, que oculta el póster SVG cuando la escena ya cargó.
- El evento `hero:motion` (`{ paused }`) y el atributo `data-motion="paused"` para el botón de pausa.
- En móvil (< 768 px) y con `prefers-reduced-motion` no hay recorrido de scroll y queda el póster.

Escenas: 1 Silicio (placa y chip), 2 Interfaz (paneles de producto), 3 Servicios + IA (nodos API/DB/RAG).

### Variante WebGL (`src/components/hero/HeroWebGL.astro` + `webgl/`)
three.js vanilla con shaders propios, cargado por import dinámico tras `load` (entrada ~2 KB gzip; el chunk `stage` con three, ~160 KB gzip, solo en escritorio).
No monta con < 768 px, `prefers-reduced-motion`, ahorro de datos o sin WebGL2; si el contexto se pierde, vuelve el póster.
Una sola toma de cámara: placa PCB con corriente → cruce del die → paneles de interfaz → grafo de servicios.
