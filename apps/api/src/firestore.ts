/**
 * Cliente mínimo de la API REST de Firestore para el Worker (sin SDK: no corre en Workers).
 * Se autentica con una cuenta de servicio (OAuth JWT bearer) y, como el Admin SDK, no pasa por las reglas.
 */
import { SignJWT, importPKCS8 } from 'jose';

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

type Value =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } };

export type Fields = Record<string, unknown>;

export function toValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v as Fields) } };
  throw new Error(`Tipo no soportado en Firestore: ${typeof v}`);
}

/** Convierte un objeto plano a campos de Firestore. Omite `undefined`. */
export function toFields(obj: Fields): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = toValue(v);
  return out;
}

export function fromValue(v: Value): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
}

const SCOPE = 'https://www.googleapis.com/auth/datastore';
let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount, fetcher: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`OAuth de Google respondió ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, exp: now + data.expires_in };
  return data.access_token;
}

export function createFirestore(projectId: string, sa: ServiceAccount, fetcher: typeof fetch = fetch) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  async function call(url: string, init: RequestInit = {}) {
    const token = await accessToken(sa, fetcher);
    const res = await fetcher(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    return res;
  }

  const fail = async (res: Response, what: string) => {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    return new Error(`Firestore ${what} respondió ${res.status}${detail ? `: ${detail}` : ''}`);
  };

  return {
    async get(path: string): Promise<Fields | null> {
      const res = await call(`${base}/${path}`);
      if (res.status === 404) return null;
      if (!res.ok) throw await fail(res, 'get');
      const doc = (await res.json()) as { fields?: Record<string, Value> };
      return fromValue({ mapValue: { fields: doc.fields ?? {} } }) as Fields;
    },

    /** Crea un documento con id automático y devuelve el id. */
    async create(collection: string, data: Fields): Promise<string> {
      const res = await call(`${base}/${collection}`, { method: 'POST', body: JSON.stringify({ fields: toFields(data) }) });
      if (!res.ok) throw await fail(res, 'create');
      const doc = (await res.json()) as { name: string };
      return doc.name.split('/').pop()!;
    },

    /** Escribe solo los campos dados (crea el documento si no existe). */
    async patch(path: string, data: Fields): Promise<void> {
      const mask = Object.keys(data)
        .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
        .join('&');
      const res = await call(`${base}/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields: toFields(data) }) });
      if (!res.ok) throw await fail(res, 'patch');
    },

    /** Último documento de una colección según un campo, o null. */
    async latest(collection: string, field: string): Promise<Fields | null> {
      const res = await call(`${base}:runQuery`, {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: collection }],
            orderBy: [{ field: { fieldPath: field }, direction: 'DESCENDING' }],
            limit: 1,
          },
        }),
      });
      if (!res.ok) throw await fail(res, 'runQuery');
      const rows = (await res.json()) as { document?: { fields?: Record<string, Value> } }[];
      const doc = rows.find((r) => r.document)?.document;
      return doc ? (fromValue({ mapValue: { fields: doc.fields ?? {} } }) as Fields) : null;
    },
  };
}

export type Firestore = ReturnType<typeof createFirestore>;
