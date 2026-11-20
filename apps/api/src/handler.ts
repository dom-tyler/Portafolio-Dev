import { parseContact, type ContactInput } from './schema.js';
import { renderContactEmail, type RenderedEmail } from './email.js';

/** Dependencias externas, inyectadas para poder probar el flujo sin Firebase ni Resend. */
export interface ContactDeps {
  /** Devuelve true si el token de Turnstile es válido. `null` = captcha desactivado (emulador). */
  verifyCaptcha: ((token: string, ip: string) => Promise<boolean>) | null;
  /** Devuelve true si la IP aún tiene cupo en la ventana actual. */
  takeRateLimit: (ip: string) => Promise<boolean>;
  /** Guarda el mensaje y devuelve su id. */
  save: (input: ContactInput, meta: { ip: string; userAgent: string }) => Promise<string>;
  /** Envía el correo a Daniel. */
  send: (email: RenderedEmail, replyTo: string) => Promise<void>;
  /** Marca si el correo salió o no (el mensaje ya quedó guardado para el admin). */
  markEmail: (id: string, sent: boolean) => Promise<void>;
  now: () => Date;
  log: (level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>) => void;
}

export interface ContactRequest {
  method: string;
  body: unknown;
  ip: string;
  userAgent: string;
}

export interface ContactResponse {
  status: number;
  body: { ok: true } | { ok: false; error: string; fields?: Record<string, string> };
}

export async function handleContact(req: ContactRequest, deps: ContactDeps): Promise<ContactResponse> {
  if (req.method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'method_not_allowed' } };
  }

  const parsed = parseContact(req.body);
  if (!parsed.ok) {
    return { status: 400, body: { ok: false, error: 'invalid', fields: parsed.fields } };
  }
  const data = parsed.data;

  // Honeypot lleno: se responde como éxito para no darle pistas al bot, pero no se guarda nada.
  if (data.website.trim() !== '') {
    deps.log('warn', 'honeypot', { ip: req.ip });
    return { status: 200, body: { ok: true } };
  }

  if (deps.verifyCaptcha) {
    const valid = data.turnstileToken ? await deps.verifyCaptcha(data.turnstileToken, req.ip) : false;
    if (!valid) return { status: 403, body: { ok: false, error: 'captcha' } };
  }

  if (!(await deps.takeRateLimit(req.ip))) {
    return { status: 429, body: { ok: false, error: 'rate_limited' } };
  }

  let id: string;
  try {
    id = await deps.save(data, { ip: req.ip, userAgent: req.userAgent });
  } catch (error) {
    deps.log('error', 'save_failed', { error: String(error) });
    return { status: 500, body: { ok: false, error: 'server' } };
  }

  // El mensaje ya está en Firestore (el admin lo verá); un fallo de correo no se le muestra al visitante.
  try {
    await deps.send(renderContactEmail(data, { id, receivedAt: deps.now() }), data.email);
    await deps.markEmail(id, true);
  } catch (error) {
    deps.log('error', 'email_failed', { id, error: String(error) });
    await deps.markEmail(id, false).catch(() => undefined);
  }

  return { status: 200, body: { ok: true } };
}
