/**
 * Lógica del botón "Publicar" del admin, separada de Firebase para poder probarla.
 * Registra la publicación en `publishes/{id}` y dispara el workflow de deploy en GitHub,
 * que reconstruye el sitio leyendo Firestore y actualiza ese mismo documento.
 */

export const PUBLISH_COOLDOWN_MS = 60_000;
export const GITHUB_REPO = 'dom-tyler/Portafolio-Dev';
export const GITHUB_WORKFLOW = 'deploy.yml';

export type PublishErrorCode = 'permission-denied' | 'failed-precondition' | 'resource-exhausted' | 'internal';

export class PublishError extends Error {
  constructor(
    readonly code: PublishErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface PublishDeps {
  githubToken: string;
  /** Milisegundos de la última solicitud registrada, o null si nunca se publicó. */
  lastRequestedAt: () => Promise<number | null>;
  createRecord: (requestedBy: string) => Promise<string>;
  failRecord: (id: string, error: string) => Promise<void>;
  dispatch: (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
  now: () => number;
}

export interface PublishCaller {
  admin: boolean;
  email: string | null;
}

export async function requestPublish(caller: PublishCaller | null, deps: PublishDeps): Promise<{ publishId: string }> {
  if (!caller?.admin) throw new PublishError('permission-denied', 'Solo el administrador puede publicar.');
  if (!deps.githubToken.trim()) {
    throw new PublishError('failed-precondition', 'Falta configurar GITHUB_PUBLISH_TOKEN en la función.');
  }

  const last = await deps.lastRequestedAt();
  if (last !== null && deps.now() - last < PUBLISH_COOLDOWN_MS) {
    throw new PublishError('resource-exhausted', 'Ya hay una publicación reciente. Espera un minuto.');
  }

  const id = await deps.createRecord(caller.email ?? 'desconocido');
  const res = await deps.dispatch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.githubToken.trim()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'portfolio-publish',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { publish_id: id } }),
    },
  );

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    await deps.failRecord(id, `GitHub respondió ${res.status}${detail ? `: ${detail}` : ''}`);
    throw new PublishError('internal', `No se pudo iniciar el despliegue (GitHub ${res.status}).`);
  }
  return { publishId: id };
}
