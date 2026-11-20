# Portafolio · Daniel Osorio

Sitio público del portafolio. Astro estático + TypeScript + Tailwind 4. El panel de administración vive en un repositorio aparte (`dom-tyler/AD-Portafolio`).

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

Escenas: 1 Silicio (el chip vivo), 2 Integración (la mano lo toma), 3 Producto + IA (lo presenta y proyecta capas).

### Variante WebGL (`src/components/hero/HeroWebGL.astro` + `webgl/`)
- **Onboarding**: `BootFlag.astro` (inline en `<head>`) pone `is-booting` antes del primer pintado. El chip se enciende en el centro (contorno → pines de cobre según el progreso real de carga → pistas → latido del die), vuela hasta el hero y el titular entra decodificándose. Mínimo ~1.5 s, versión corta en revisitas (`sessionStorage`), botón "Saltar", clic o Esc para saltar; si pasa de 6 s sigue el póster. Con reduced-motion, fundido breve sin escena.
- **Chip** (`chip.ts`): QFP con biseles y marcado láser, 64 pines instanciados con emisión por pin, die con shader emisivo, hilos de unión y abanico de pistas con corriente. Late de forma irregular, se inclina hacia el cursor con un resorte, lanza un arco desde el pin más cercano, acelera la corriente en hover y entra en sobrecarga con el clic.
- **Mano** (`hand.ts`): procedural, una articulación por `Object3D`; entra desde abajo a la derecha, cierra los dedos, levanta el chip y lo presenta. **Capas** (`holo.ts`): Interfaz · API · Datos · IA.
- **Rendimiento**: three.js por import dinámico (entrada ~2.7 KB gzip; chunk `stage` ~160 KB gzip). DPR ≤ 1.75 y tiers por FPS medidos (T1 al 75 % de resolución; T2 al 60 %, sin bloom y a 30 fps). Bucle pausado fuera de vista, con la pestaña oculta o con el botón de pausa.
- **Móvil**: solo el chip (sin mano ni bloom, DPR 1) si `hardwareConcurrency >= 4` y sin ahorro de datos; si no, póster. Sin WebGL2 o si se pierde el contexto, vuelve el póster.
- **Siguiente paso (fase B, sin implementar)**: después del hero, la mano con el chip persiste en un canvas fijo y discreto; al pasar sobre una tarjeta de proyecto se encienden en el chip las capas de ese proyecto (`layers` de `packages/content-schema`).
