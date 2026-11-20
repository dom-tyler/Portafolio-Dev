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
apps/contact-api/        función de Firebase del formulario de contacto (Resend + Firestore)
packages/content-schema/ esquema Zod compartido
packages/design-tokens/  paleta y tipografía (5 colores, 2 familias)
docs/CONTENT_REVIEW.md   afirmaciones pendientes de validar antes de publicar
docs/CONTACT_SETUP.md    cuentas, secretos y despliegue del formulario de contacto
```

## Formulario de contacto
`POST /api/contact` llega a la función `contact`: valida, revisa Turnstile y el límite de envíos, guarda en Firestore (`messages`) y te manda un correo con formato vía Resend. Tu correo de trabajo vive como secreto y nunca llega al cliente. La configuración paso a paso está en `docs/CONTACT_SETUP.md`.

## Dirección visual
Cyberpunk sobrio, con igloo.inc como referente: microtipografía HUD, línea fina y cámara continua. El HTML se renderiza primero y el 3D llega como mejora progresiva.
Paleta: grafito `#07090A`, marfil `#ECE6D9`, neón `#FF2A44`, cobre `#D4823F`, verde PCB `#1DB46E`.
Tipos: Instrument Sans (títulos y texto), IBM Plex Mono (HUD y datos).

## Contrato del hero (para las variantes WebGL y video)
`src/components/hero/Hero.astro` expone:
- El slot `media`, que se monta dentro de `[data-hero-media]` (`position:absolute; inset:0`).
- El evento `hero:progress` en `window`, con `detail = { progress, scene: 1|2|3, sceneProgress }`. También está la variable CSS `--hero-p`.
- La clase `is-media-ready` sobre `[data-hero]`, que oculta el póster SVG cuando la escena ya cargó.
- El evento `hero:motion` (`{ paused }`) y el atributo `data-motion="paused"` para el botón de pausa.
- En móvil (< 768 px) y con `prefers-reduced-motion` no hay recorrido de scroll y queda el póster.

Escenas: 1 Silicio (placa y chip), 2 Interfaz (paneles de producto), 3 Servicios + IA (nodos API/DB/RAG).
