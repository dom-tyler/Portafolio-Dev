# Formulario de contacto: configuración

Flujo: el visitante envía el formulario y llega a `POST /api/contact`. Firebase Hosting lo reenvía a la función `contact` (`apps/contact-api`). La función hace cinco cosas:

1. Valida los datos.
2. Revisa el honeypot y Turnstile.
3. Aplica un límite de 5 envíos por hora por IP.
4. Guarda el mensaje en Firestore, en `messages/{id}`.
5. Envía un correo con formato (vía Resend) a tu correo de trabajo.

El visitante nunca ve tu correo de trabajo. Está guardado como secreto en Secret Manager. El correo que recibes trae `Reply-To` con la dirección del visitante, así que al darle "Responder" le escribes directo.

## Cuentas que necesitas (las creas tú)

| Servicio | Para qué | Costo |
|---|---|---|
| [Resend](https://resend.com) | Enviar el correo con formato | Tiene plan gratuito |
| Firebase, plan **Blaze** en `portafolio-dev-4586` | Cloud Functions y Secret Manager | Pago por uso. A este volumen debería estar dentro de la capa gratuita. Configura una alerta de presupuesto. |
| [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) | Captcha invisible contra bots | Gratis |

**Resend sin dominio propio:** el remitente debe ser `onboarding@resend.dev` y Resend **solo entrega al correo con el que creaste la cuenta**. Tienes dos opciones:
- Crea la cuenta de Resend con tu correo de trabajo.
- Verifica un dominio en Resend y cambia `CONTACT_FROM`, por ejemplo a `Portafolio <contacto@tudominio.com>`.

## Pasos

1. **Firestore:** en la consola de Firebase, crea la base de datos en modo Native.
2. **Resend:** crea una API key con permiso *Sending access*.
3. **Turnstile:** crea un widget para `daniel-dev-portafolio.web.app` y `localhost`. Te da dos llaves:
   - Una *site key* pública. Va en `PUBLIC_TURNSTILE_SITE_KEY`.
   - Una *secret key*. Va en `TURNSTILE_SECRET`.
4. **Firebase CLI:**
   ```bash
   pnpm dlx firebase-tools login
   ```
5. **Secretos** (te pide cada valor; nunca van en el repo):
   ```bash
   pnpm dlx firebase-tools functions:secrets:set RESEND_API_KEY
   pnpm dlx firebase-tools functions:secrets:set CONTACT_TO_EMAIL
   pnpm dlx firebase-tools functions:secrets:set TURNSTILE_SECRET
   ```
6. **Variables públicas del sitio**, en `apps/portfolio/.env.production`. No son secretas:
   ```
   PUBLIC_CONTACT_ENDPOINT=/api/contact
   PUBLIC_TURNSTILE_SITE_KEY=<site key de Turnstile>
   ```
7. **Despliegue:**
   ```bash
   pnpm build
   pnpm dlx firebase-tools deploy --only functions:contact,firestore:rules,hosting
   ```
   `firebase.json` usa el sitio de Hosting `daniel-dev-portafolio`. Si tu sitio tiene otro nombre, cámbialo ahí.

## Desarrollo local

1. Crea `apps/contact-api/.secret.local` (está en `.gitignore`):
   ```
   RESEND_API_KEY=re_xxx
   CONTACT_TO_EMAIL=tu-correo-de-trabajo
   TURNSTILE_SECRET=
   ```
   Con `TURNSTILE_SECRET` vacío no se exige captcha.
2. Arranca los emuladores:
   ```bash
   pnpm dlx firebase-tools emulators:start --only functions,firestore
   ```
3. En `apps/portfolio/.env.development`:
   ```
   PUBLIC_CONTACT_ENDPOINT=http://127.0.0.1:5001/portafolio-dev-4586/us-central1/contact
   ```

Pruebas de la función: `pnpm --filter @portfolio/contact-api test`.

## Contrato

`POST` con JSON:
`{ name, email, company?, reason: 'proyecto'|'empleo'|'consultoria'|'otro', message, website (honeypot, vacío), turnstileToken? }`

| Respuesta | Cuándo |
|---|---|
| `200 {ok:true}` | Mensaje recibido (o honeypot lleno, que se descarta en silencio) |
| `400 {ok:false, error:'invalid', fields}` | Algún campo no pasa la validación |
| `403 captcha` | Turnstile falló o falta el token |
| `429 rate_limited` | Más de 5 envíos en una hora |
| `500 server` | No se pudo guardar el mensaje |

Si Resend falla, el mensaje queda guardado con `emailSent: false` y el admin lo sigue viendo.

## Admin: notificaciones

El admin (`AD-Portafolio`) usa la colección `messages`:
- `status: 'nuevo'`, `read: false` y `createdAt`.
- Se escucha con `onSnapshot`, ordenando por `createdAt desc`, para tener una bandeja en tiempo real y un contador de no leídos.
- Puede sumar notificaciones push con FCM más adelante.

Las reglas de `firestore.rules` solo dejan leer o actualizar `status`, `read` y `notes` a usuarios con el custom claim `admin: true`. El claim se asigna una vez con el Admin SDK y la llave de cuenta de servicio, que vive fuera del repo.

## Llave de cuenta de servicio

La función **no** necesita el JSON de la cuenta de servicio: en Cloud Functions usa las credenciales del proyecto. El JSON sirve solo para scripts locales, como asignar el claim `admin`.
- Está en `.gitignore`, pero conviene moverlo fuera de la carpeta del proyecto, por ejemplo a `~/.config/firebase/`.
- Si alguna vez se compartió o subió, revócalo en la consola (Cuentas de servicio → Claves) y genera otro.
