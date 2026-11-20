# API del portafolio (Cloudflare Worker): configuración

`apps/api` es un Cloudflare Worker con dos rutas. Todo funciona con planes gratuitos y sin tarjeta.

| Ruta | Quién la usa | Qué hace |
|---|---|---|
| `POST /contact` | Formulario del sitio | Valida, revisa honeypot y Turnstile, aplica 5 envíos/hora por IP, guarda en Firestore (`messages`) y te envía un correo con formato vía Resend |
| `POST /publish` | Botón Publicar del admin | Verifica tu ID token de Firebase y el claim `admin`, registra `publishes/{id}` y dispara `.github/workflows/deploy.yml` |

Tu correo de trabajo vive como secreto del Worker y nunca llega al cliente. El correo que recibes trae `Reply-To` con el visitante, así que al darle "Responder" le escribes directo.

## Servicios (todos gratis)

| Servicio | Para qué | Plan |
|---|---|---|
| [Cloudflare Workers](https://dash.cloudflare.com/sign-up) | Ejecutar la API | Gratis, sin tarjeta (100.000 peticiones al día) |
| [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) | Anti-bots del formulario | Gratis |
| [Resend](https://resend.com) | Enviar el correo con formato | Gratis, sin tarjeta |
| Firebase, plan Spark | Hosting, Firestore y Auth | Gratis (no necesita Blaze) |

**Resend sin dominio propio:** el remitente debe ser `onboarding@resend.dev` y Resend **solo entrega al correo con el que creaste la cuenta**. Crea la cuenta de Resend con tu correo de trabajo. Si más adelante verificas un dominio, cambia `CONTACT_FROM` en `apps/api/wrangler.jsonc`.

## Pasos

1. **Resend:** crea la cuenta con tu correo de trabajo y una API key con permiso *Sending access*.
2. **Turnstile:** en Cloudflare, crea un widget para `daniel-dev-portafolio.web.app` y `localhost`. Te da dos llaves:
   - la *site key*, que es pública;
   - la *secret key*.
3. **Cuenta de servicio para el Worker:** en Google Cloud Console → IAM → Cuentas de servicio, crea una cuenta con solo el rol **Cloud Datastore User** y descarga su llave JSON. Guárdala fuera del repo.
   - No reutilices la del Admin SDK, que tiene permisos de más.
4. **Inicia sesión en Cloudflare** desde el repo (abre el navegador):
   ```bash
   pnpm --filter @portfolio/api exec wrangler login
   ```
5. **Secretos:** el comando te pide cada valor sin mostrarlo.
   ```bash
   cd apps/api
   pnpm exec wrangler secret put RESEND_API_KEY
   pnpm exec wrangler secret put CONTACT_TO_EMAIL
   pnpm exec wrangler secret put TURNSTILE_SECRET
   pnpm exec wrangler secret put GITHUB_PUBLISH_TOKEN
   ```
   `GITHUB_PUBLISH_TOKEN` se explica en `docs/PUBLISH_SETUP.md`.

   Para la llave de la cuenta de servicio, pásala en una sola línea y sin pegarla en el chat:
   ```bash
   python3 -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1]))))' /ruta/a/llave-worker.json | pnpm exec wrangler secret put FIREBASE_SERVICE_ACCOUNT
   ```
6. **Despliegue del Worker:**
   ```bash
   pnpm --filter @portfolio/api deploy
   ```
   Al terminar, wrangler muestra la URL, del estilo `https://portfolio-api.<tu-subdominio>.workers.dev`.
7. **Variables del sitio en GitHub** (`dom-tyler/Portafolio-Dev` → Settings → Secrets and variables → Actions → Variables):
   - `PUBLIC_CONTACT_ENDPOINT` = URL del Worker + `/contact`
   - `PUBLIC_TURNSTILE_SITE_KEY` = site key de Turnstile
8. **Admin:** en su `.env`, `VITE_API_URL` = URL del Worker, sin barra al final.

## Desarrollo local

```bash
cd apps/api
cp .dev.vars.example .dev.vars   # valores falsos; no pongas credenciales reales salvo para una prueba puntual
pnpm dev                          # http://127.0.0.1:8787
```

En el sitio, usa `PUBLIC_CONTACT_ENDPOINT=http://127.0.0.1:8787/contact`. Con `TURNSTILE_SECRET` vacío no se exige captcha. Los orígenes `localhost` siempre están permitidos por CORS.

Pruebas: `pnpm --filter @portfolio/api test`. Cubren la validación, el correo, Publicar, el cliente de Firestore, la verificación de tokens y las rutas.

## Contrato de `/contact`

`POST` con JSON:
`{ name, email, company?, reason: 'proyecto'|'empleo'|'consultoria'|'otro', message, website (honeypot, vacío), turnstileToken? }`

| Respuesta | Cuándo |
|---|---|
| `200 {ok:true}` | Recibido (o honeypot lleno, que se descarta en silencio) |
| `400 {ok:false, error:'invalid', fields}` | Algún campo no pasa la validación |
| `403 captcha` | Turnstile falló o falta el token |
| `429 rate_limited` | Más de 5 envíos en una hora |
| `500 server` | No se pudo guardar el mensaje |

Si Resend falla, el mensaje queda en Firestore con `emailSent: false` y el admin lo sigue viendo.
