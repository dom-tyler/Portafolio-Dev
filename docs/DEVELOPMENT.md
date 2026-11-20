# Desarrollo · Portafolio

Guía técnica del repositorio. La presentación está en el [README](../README.md).

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

## Variables de entorno
Copia `apps/portfolio/.env.example` a `apps/portfolio/.env` y completa:

| Variable | Uso |
|---|---|
| `PUBLIC_CONTACT_ENDPOINT` | Endpoint del formulario: el Worker de `apps/api` + `/contact` (en local `http://127.0.0.1:8787/contact`). Vacía: el formulario queda deshabilitado e invita a escribir por LinkedIn. |
| `PUBLIC_TURNSTILE_SITE_KEY` | Site key de Cloudflare Turnstile. Si existe, la página de inicio carga el script y el widget (tema oscuro) y envía el token; si no, no se carga nada. |

### Contrato del formulario (backend en `apps/api`, Cloudflare Worker)
`POST` con `Content-Type: application/json`:

```ts
{ name: string /* 2–80 */, email: string /* ≤120 */, company?: string /* ≤120 */,
  reason: 'proyecto' | 'empleo' | 'consultoria' | 'otro', message: string /* 20–4000 */,
  website: string /* trampa: siempre vacío */, turnstileToken?: string }
```

Respuestas: `200 {ok:true}` · `400 {ok:false, error:'invalid', fields:{campo:'mensaje'}}` (cada mensaje se muestra en su campo) · `403 {error:'captcha'}` · `429 {error:'rate_limited'}` (se pide intentar más tarde) · `5xx {error:'server'}`.

El correo público (`site.ts → contact.email`) es distinto del correo de trabajo, que recibe el formulario y **no** está en el cliente ni en el repositorio: lo conoce solo el backend.

## Estructura
```
apps/portfolio/          sitio Astro
  src/content/           contenido: load.ts (Firestore o local), projects/experience (fuente local), site
  src/components/hero/   hero de tres escenas (contrato abajo)
apps/api/                Cloudflare Worker: /contact (formulario) y /publish (botón Publicar)
packages/content-schema/ esquema Zod compartido
packages/design-tokens/  paleta y tipografía (5 colores, 2 familias)
docs/CONTENT_REVIEW.md   afirmaciones pendientes de validar antes de publicar
docs/CONTACT_SETUP.md    cuentas, secretos y despliegue del formulario de contacto
docs/PUBLISH_SETUP.md    Firestore, admin y botón Publicar
.github/workflows/       deploy del sitio (lo dispara el admin)
```

## Contenido y publicación
El contenido publicado (proyectos, trayectoria y herramientas por capa) vive en Firestore y se edita desde el admin (`dom-tyler/AD-Portafolio`). El sitio lo lee **al compilar** en `src/content/load.ts`:
- `CONTENT_SOURCE=firestore`: lee Firestore y falla si no puede (así se publica en CI).
- `CONTENT_SOURCE=local`: usa `src/content/projects.ts` y `experience.ts`.
- Sin definir: usa Firestore si hay credenciales (`FIREBASE_SERVICE_ACCOUNT` o `GOOGLE_APPLICATION_CREDENTIALS`) y, si no, los archivos locales.

El botón **Publicar** del admin llama a `POST /publish` del Worker (`apps/api`) con el ID token de Firebase. El Worker verifica el claim `admin`, registra `publishes/{id}` y dispara `.github/workflows/deploy.yml`, que compila con Firestore, despliega Hosting y actualiza el estado que el admin ve en vivo.

Scripts (con credenciales en `GOOGLE_APPLICATION_CREDENTIALS`, fuera del repo):
- `pnpm --filter @portfolio/web seed [--write] [--force]`: carga inicial de Firestore desde los archivos locales. Sin `--write` solo simula.
- `pnpm --filter @portfolio/web set-admin <correo> [--revoke]`: da o quita el permiso de admin.

Configuración completa: `docs/PUBLISH_SETUP.md`.

## Formulario de contacto
`POST /contact` llega al Worker (`apps/api`): valida, revisa Turnstile y el límite de envíos, guarda en Firestore (`messages`) y te manda un correo con formato vía Resend. Tu correo de trabajo vive como secreto y nunca llega al cliente. La configuración paso a paso está en `docs/CONTACT_SETUP.md`.

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
