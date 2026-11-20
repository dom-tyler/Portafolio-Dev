/**
 * Conexión con Firebase para los scripts de mantenimiento (Node 24 ejecuta .ts directamente).
 * Credenciales: FIREBASE_SERVICE_ACCOUNT (JSON en una variable) o GOOGLE_APPLICATION_CREDENTIALS (ruta).
 * La llave de cuenta de servicio vive FUERA del repo; nunca la pases por argumento ni la imprimas.
 */
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';

export const PROJECT_ID = 'portafolio-dev-4586';

export function initAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      'Faltan credenciales. Ejemplo:\n  GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase/portafolio-dev-4586.json pnpm --filter @portfolio/web <script>',
    );
    process.exit(1);
  }
  return (
    getApps()[0] ??
    initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault(), projectId: PROJECT_ID })
  );
}
