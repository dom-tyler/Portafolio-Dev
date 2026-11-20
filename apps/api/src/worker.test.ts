import { describe, expect, it, vi } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import worker, { corsHeaders, type Env } from './worker.js';
import { createFirestore, fromValue, toFields, toValue } from './firestore.js';
import { verifyIdToken } from './auth.js';

const env: Env = {
  FIREBASE_PROJECT_ID: 'portafolio-dev-4586',
  CONTACT_FROM: 'Portafolio <onboarding@resend.dev>',
  ALLOWED_ORIGINS: 'https://daniel-dev-portafolio.web.app,https://admin-dev-portafolio.web.app',
  FIREBASE_SERVICE_ACCOUNT: '{}',
  RESEND_API_KEY: 'x',
  CONTACT_TO_EMAIL: 'x@y.z',
};

describe('firestore values', () => {
  it('codifica y decodifica tipos', () => {
    const date = new Date('2026-11-20T05:00:00Z');
    const fields = toFields({ s: 'a', n: 3, d: 1.5, b: true, t: date, z: null, arr: ['x', 1], m: { k: 'v' }, u: undefined });
    expect(fields).not.toHaveProperty('u');
    expect(fields.n).toEqual({ integerValue: '3' });
    expect(fields.t).toEqual({ timestampValue: '2026-11-20T05:00:00.000Z' });
    expect(fromValue({ mapValue: { fields } })).toEqual({ s: 'a', n: 3, d: 1.5, b: true, t: date, z: null, arr: ['x', 1], m: { k: 'v' } });
    expect(toValue([])).toEqual({ arrayValue: { values: [] } });
  });
});

describe('createFirestore', () => {
  it('pide token una vez, crea con id automático y hace patch con updateMask', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const sa = { client_email: 'ci@portafolio-dev-4586.iam.gserviceaccount.com', private_key: await exportPKCS8(privateKey) };
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body as string });
      if (u.startsWith('https://oauth2.googleapis.com')) return Response.json({ access_token: 'tok', expires_in: 3600 });
      if (init?.method === 'POST') return Response.json({ name: 'projects/p/databases/(default)/documents/messages/abc123' });
      return Response.json({});
    }) as unknown as typeof fetch;

    const db = createFirestore('portafolio-dev-4586', sa, fetcher);
    expect(await db.create('messages', { name: 'Ana' })).toBe('abc123');
    await db.patch('messages/abc123', { read: true, status: 'respondido' });

    expect(calls.filter((c) => c.url.startsWith('https://oauth2')).length).toBe(1);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toContain('/documents/messages/abc123?updateMask.fieldPaths=read&updateMask.fieldPaths=status');
  });
});

describe('verifyIdToken', () => {
  const PID = 'portafolio-dev-4586';
  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: number } = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(opts.iss ?? `https://securetoken.google.com/${PID}`)
        .setAudience(opts.aud ?? PID)
        .setSubject('uid_1')
        .setIssuedAt()
        .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 600)
        .sign(privateKey);
    return { keys, sign };
  }

  it('acepta un token válido y lee admin y email', async () => {
    const { keys, sign } = await setup();
    const token = await sign({ admin: true, email: 'daniel@example.com' });
    expect(await verifyIdToken(`Bearer ${token}`, PID, keys)).toEqual({ admin: true, email: 'daniel@example.com' });
  });

  it('sin claim admin devuelve admin:false', async () => {
    const { keys, sign } = await setup();
    expect(await verifyIdToken(`Bearer ${await sign({})}`, PID, keys)).toEqual({ admin: false, email: null });
  });

  it('rechaza otro proyecto, otro emisor, vencido o sin cabecera', async () => {
    const { keys, sign } = await setup();
    expect(await verifyIdToken(`Bearer ${await sign({ admin: true }, { aud: 'otro' })}`, PID, keys)).toBeNull();
    expect(await verifyIdToken(`Bearer ${await sign({ admin: true }, { iss: 'https://evil' })}`, PID, keys)).toBeNull();
    expect(await verifyIdToken(`Bearer ${await sign({ admin: true }, { exp: 1000 })}`, PID, keys)).toBeNull();
    expect(await verifyIdToken(null, PID, keys)).toBeNull();
  });
});

describe('worker', () => {
  const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://api.test${path}`, init), env);

  it('CORS solo para orígenes permitidos y localhost', () => {
    expect(corsHeaders('https://daniel-dev-portafolio.web.app', env.ALLOWED_ORIGINS)['Access-Control-Allow-Origin']).toBe(
      'https://daniel-dev-portafolio.web.app',
    );
    expect(corsHeaders('http://localhost:4321', env.ALLOWED_ORIGINS)['Access-Control-Allow-Origin']).toBe('http://localhost:4321');
    expect(corsHeaders('https://evil.com', env.ALLOWED_ORIGINS)).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('responde preflight, salud y 404', async () => {
    expect((await call('/contact', { method: 'OPTIONS', headers: { Origin: 'http://localhost:4321' } })).status).toBe(204);
    expect(await (await call('/')).json()).toEqual({ ok: true, service: 'portfolio-api' });
    expect((await call('/nada')).status).toBe(404);
  });

  it('publish sin token: 401 sin tocar Firestore', async () => {
    const res = await call('/publish', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: 'permission-denied' });
  });
});
