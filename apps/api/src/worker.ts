/**
 * API del portafolio en Cloudflare Workers (plan gratuito).
 *   POST /contact  formulario público → valida, guarda en Firestore y envía el correo con Resend.
 *   POST /publish  botón Publicar del admin → verifica el token de admin y dispara el deploy en GitHub.
 *   GET  /         salud.
 */
import { handleContact, type ContactDeps } from './handler.js';
import { PublishError, requestPublish } from './publish.js';
import { reasonLabel } from './schema.js';
import { createFirestore, type ServiceAccount } from './firestore.js';
import { verifyIdToken } from './auth.js';

export interface Env {
  FIREBASE_PROJECT_ID: string;
  CONTACT_FROM: string;
  /** Orígenes permitidos, separados por coma. Además se permite localhost para desarrollo. */
  ALLOWED_ORIGINS: string;
  // Secretos (`wrangler secret put NOMBRE`)
  FIREBASE_SERVICE_ACCOUNT: string;
  RESEND_API_KEY: string;
  CONTACT_TO_EMAIL: string;
  TURNSTILE_SECRET?: string;
  GITHUB_PUBLISH_TOKEN?: string;
}

const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const MAX_BODY = 20_000;

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const list = allowed.split(',').map((o) => o.trim()).filter(Boolean);
  const ok = origin && (list.includes(origin) || LOCALHOST.test(origin));
  return ok
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };
}

const json = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) return null;
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function firestoreFor(env: Env) {
  return createFirestore(env.FIREBASE_PROJECT_ID, JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount);
}

async function contact(request: Request, env: Env, cors: Record<string, string>) {
  const db = firestoreFor(env);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await sha256(`portfolio-contact:${ip}`);
  const turnstileSecret = (env.TURNSTILE_SECRET ?? '').trim();

  const deps: ContactDeps = {
    verifyCaptcha: turnstileSecret
      ? async (token, remoteip) => {
          const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: new URLSearchParams({ secret: turnstileSecret, response: token, remoteip }),
          });
          return res.ok && ((await res.json()) as { success?: boolean }).success === true;
        }
      : null,

    // Ventana fija por IP (hash). Sin transacción: un desfase mínimo bajo concurrencia es aceptable aquí.
    takeRateLimit: async () => {
      const path = `rateLimits/${ipHash}`;
      const now = Date.now();
      const current = (await db.get(path)) as { count?: number; windowStart?: number } | null;
      if (!current || typeof current.windowStart !== 'number' || now - current.windowStart > RATE_LIMIT.windowMs) {
        await db.patch(path, { count: 1, windowStart: now });
        return true;
      }
      if ((current.count ?? 0) >= RATE_LIMIT.max) return false;
      await db.patch(path, { count: (current.count ?? 0) + 1 });
      return true;
    },

    save: (input, meta) =>
      db.create('messages', {
        name: input.name,
        email: input.email,
        company: input.company ?? '',
        reason: input.reason,
        reasonLabel: reasonLabel[input.reason],
        message: input.message,
        status: 'nuevo',
        read: false,
        emailSent: null,
        createdAt: new Date(),
        source: 'portfolio-form',
        ipHash,
        userAgent: meta.userAgent.slice(0, 300),
      }),

    send: async (email, replyTo) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.CONTACT_FROM,
          to: [env.CONTACT_TO_EMAIL],
          reply_to: replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },

    markEmail: (id, sent) => db.patch(`messages/${id}`, { emailSent: sent }),
    now: () => new Date(),
    log: (level, message, extra) => console[level](JSON.stringify({ message, ...extra })),
  };

  const result = await handleContact(
    { method: request.method, body: await readJson(request), ip, userAgent: request.headers.get('user-agent') ?? '' },
    deps,
  );
  return json(result.status, result.body, cors);
}

const PUBLISH_STATUS: Record<PublishError['code'], number> = {
  'permission-denied': 403,
  'failed-precondition': 412,
  'resource-exhausted': 429,
  internal: 500,
};

async function publish(request: Request, env: Env, cors: Record<string, string>) {
  const caller = await verifyIdToken(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID);
  if (!caller) return json(401, { ok: false, error: 'permission-denied', message: 'Sesión inválida o vencida.' }, cors);

  const db = firestoreFor(env);
  try {
    const { publishId } = await requestPublish(caller, {
      githubToken: env.GITHUB_PUBLISH_TOKEN ?? '',
      lastRequestedAt: async () => {
        const last = await db.latest('publishes', 'requestedAt');
        return last?.requestedAt instanceof Date ? last.requestedAt.getTime() : null;
      },
      createRecord: (requestedBy) => db.create('publishes', { status: 'requested', requestedAt: new Date(), requestedBy }),
      failRecord: (id, error) => db.patch(`publishes/${id}`, { status: 'failure', error, finishedAt: new Date() }),
      dispatch: (url, init) => fetch(url, init),
      now: () => Date.now(),
    });
    return json(200, { ok: true, publishId }, cors);
  } catch (error) {
    if (error instanceof PublishError) {
      return json(PUBLISH_STATUS[error.code], { ok: false, error: error.code, message: error.message }, cors);
    }
    console.error(JSON.stringify({ message: 'publish_failed', error: String(error) }));
    return json(500, { ok: false, error: 'internal', message: 'No se pudo iniciar la publicación.' }, cors);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGINS);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (pathname === '/' && request.method === 'GET') return json(200, { ok: true, service: 'portfolio-api' }, cors);

    try {
      if (pathname === '/contact') return await contact(request, env, cors);
      if (pathname === '/publish') {
        if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' }, cors);
        return await publish(request, env, cors);
      }
    } catch (error) {
      console.error(JSON.stringify({ message: 'unhandled', path: pathname, error: String(error) }));
      return json(500, { ok: false, error: 'server' }, cors);
    }
    return json(404, { ok: false, error: 'not_found' }, cors);
  },
} satisfies ExportedHandler<Env>;
