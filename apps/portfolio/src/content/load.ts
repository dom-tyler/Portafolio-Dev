/**
 * Fuente del contenido publicado.
 *
 * - Firestore: lo que Daniel edita en el admin. El botón "Publicar" corre el build en CI
 *   con `CONTENT_SOURCE=firestore` y credenciales, así que nada se publica sin pasar por aquí.
 * - Local: los archivos de esta carpeta (projects.ts, experience.ts). Sirven para desarrollar
 *   sin red y como carga inicial de Firestore (`pnpm --filter @portfolio/web seed`).
 *
 * `CONTENT_SOURCE`:
 *   - `firestore`: obligatorio leer Firestore; si falla, el build falla (nunca publica contenido viejo).
 *   - `local`: siempre los archivos locales.
 *   - sin definir: Firestore si hay credenciales, local si no.
 *
 * Credenciales: `FIREBASE_SERVICE_ACCOUNT` (JSON de la cuenta de servicio en una variable)
 * o `GOOGLE_APPLICATION_CREDENTIALS` (ruta al archivo).
 */
import {
  COLLECTIONS,
  onlyVisible,
  parseExperience,
  parseProjects,
  parseToolbelt,
  type Experience,
  type Project,
  type ToolbeltLayer,
} from '@portfolio/content-schema';
import { projects as localProjects } from './projects';
import { experience as localExperience, toolbelt as localToolbelt } from './experience';

export type ContentSource = 'firestore' | 'local';

interface Content {
  source: ContentSource;
  projects: Project[];
  experience: Experience[];
  toolbelt: ToolbeltLayer[];
}

const PROJECT_ID = 'portafolio-dev-4586';

function resolveSource(): ContentSource {
  const mode = (process.env.CONTENT_SOURCE ?? '').trim();
  const hasCredentials = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (mode === 'local') return 'local';
  if (mode === 'firestore') {
    if (!hasCredentials) {
      throw new Error('CONTENT_SOURCE=firestore pero no hay FIREBASE_SERVICE_ACCOUNT ni GOOGLE_APPLICATION_CREDENTIALS.');
    }
    return 'firestore';
  }
  if (mode) throw new Error(`CONTENT_SOURCE inválido: "${mode}" (usa firestore o local).`);
  return hasCredentials ? 'firestore' : 'local';
}

async function fromFirestore(): Promise<Omit<Content, 'source'>> {
  const { initializeApp, getApps, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const app =
    getApps()[0] ??
    initializeApp({
      credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
      projectId: PROJECT_ID,
    });
  const db = getFirestore(app);

  const [projects, experience, toolbelt] = await Promise.all([
    db.collection(COLLECTIONS.projects).get(),
    db.collection(COLLECTIONS.experience).get(),
    db.collection(COLLECTIONS.toolbelt).get(),
  ]);

  // Los esquemas descartan campos de control como `updatedAt`.
  const docs = <T>(snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);

  const result = {
    projects: parseProjects(docs(projects)),
    experience: parseExperience(docs(experience)),
    toolbelt: parseToolbelt(docs(toolbelt)),
  };

  if (result.projects.length === 0) {
    throw new Error('Firestore no tiene proyectos. Corre la carga inicial antes de publicar.');
  }
  return result;
}

async function load(): Promise<Content> {
  const source = resolveSource();
  const data =
    source === 'firestore'
      ? await fromFirestore()
      : { projects: localProjects, experience: localExperience, toolbelt: [...localToolbelt] };

  console.info(
    `[contenido] fuente=${source} · ${data.projects.length} proyectos · ${data.experience.length} experiencias · ${data.toolbelt.length} capas`,
  );

  return {
    source,
    projects: onlyVisible(data.projects),
    experience: onlyVisible(data.experience),
    toolbelt: onlyVisible(data.toolbelt),
  };
}

const content = await load();

export const contentSource = content.source;
export const projects = content.projects;
export const featured = projects.filter((p) => p.tier === 'destacado');
export const lab = projects.filter((p) => p.tier === 'laboratorio');
export const experience = content.experience;
export const toolbelt = content.toolbelt;
