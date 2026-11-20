# Admin y botón Publicar: configuración

Flujo completo:

```
Admin (PWA, tu celular)  ──escribe──▶  Firestore (projects · experience · toolbelt)
        │
        └─ Publicar ─▶ Worker /publish ─▶ GitHub Actions (deploy.yml)
                                              │ compila leyendo Firestore
                                              └─▶ Firebase Hosting  +  publishes/{id} = success
```

Los cambios que guardes en el admin **no se ven en el sitio hasta que pulses Publicar**. Así nada a medio editar llega al público. Todo funciona en planes gratuitos: Firebase Spark, Cloudflare Workers y GitHub Actions.

## Estado

- [x] Firestore creado y reglas desplegadas (`firestore.rules`).
- [x] Carga inicial hecha: 10 proyectos, 5 experiencias y 9 capas.
- [ ] Worker desplegado con sus secretos (`docs/CONTACT_SETUP.md`).
- [ ] Token de GitHub (paso 2).
- [ ] Secretos y variables del workflow (paso 3).
- [ ] Admin desplegado y permiso de admin (paso 4).

## 1. Scripts con la cuenta de servicio

Los scripts del sitio leen la llave con `GOOGLE_APPLICATION_CREDENTIALS`. La llave siempre vive fuera del repo.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/ruta/fuera/del/repo/portafolio-dev-4586-firebase-adminsdk-....json
pnpm --filter @portfolio/web seed            # simula
pnpm --filter @portfolio/web seed --write    # escribe lo que falte (no pisa lo existente)
pnpm --filter @portfolio/web set-admin tu-correo@gmail.com
```

## 2. Token de GitHub (para que el Worker dispare el deploy)

En GitHub ve a Settings → Developer settings → **Fine-grained tokens** y crea uno con:
- Repositorio: solo `dom-tyler/Portafolio-Dev`.
- Permiso: **Actions: Read and write**. Nada más.

Guárdalo con `pnpm exec wrangler secret put GITHUB_PUBLISH_TOKEN`, desde `apps/api`. **Nunca lo pegues en un chat ni en un archivo del repo.** Si se expone, revócalo y crea otro.

## 3. Secretos y variables del workflow

En `dom-tyler/Portafolio-Dev` → Settings → Secrets and variables → Actions:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `FIREBASE_SERVICE_ACCOUNT` | JSON de una cuenta de servicio con los roles **Firebase Hosting Admin** y **Cloud Datastore User** |
| Variable | `PUBLIC_CONTACT_ENDPOINT` | URL del Worker + `/contact` |
| Variable | `PUBLIC_TURNSTILE_SITE_KEY` | Site key de Turnstile |
| Variable | `DEPLOY_ENABLED` | `true`, para que los push a `main` también desplieguen. Sin esta variable solo despliega Publicar. |

## 4. Admin

1. Configura y despliega el admin (`dom-tyler/AD-Portafolio`, ver su README) en el sitio `admin-dev-portafolio`.
2. Entra una vez con Google.
3. Corre `set-admin` con tu correo (paso 1).
4. Cierra sesión y vuelve a entrar.

Solo las cuentas con ese permiso pueden leer o escribir el contenido y los mensajes.

## Qué ves en el admin

- **Inicio:** si hay cambios sin publicar, la última publicación y los mensajes sin leer.
- **Publicar:** el estado avanza en vivo de *solicitada* a *en curso* y luego a *publicada* o *falló*. Incluye un enlace al registro de GitHub Actions. Hay un minuto de espera entre publicaciones.
