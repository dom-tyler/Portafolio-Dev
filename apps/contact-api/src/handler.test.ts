import { describe, expect, it, vi } from 'vitest';
import { handleContact, type ContactDeps, type ContactRequest } from './handler.js';
import { formatDate, renderContactEmail } from './email.js';
import { parseContact } from './schema.js';

const valid = {
  name: 'Ana Gómez',
  email: 'ana@empresa.co',
  company: 'Empresa SAS',
  reason: 'proyecto',
  message: 'Necesitamos integrar pagos con Bold y WhatsApp en nuestra plataforma.',
  website: '',
  turnstileToken: 'tok',
};

const req = (body: unknown, method = 'POST'): ContactRequest => ({ method, body, ip: '1.2.3.4', userAgent: 'test' });

function makeDeps(overrides: Partial<ContactDeps> = {}) {
  const deps: ContactDeps = {
    verifyCaptcha: vi.fn(async () => true),
    takeRateLimit: vi.fn(async () => true),
    save: vi.fn(async () => 'msg_1'),
    send: vi.fn(async () => undefined),
    markEmail: vi.fn(async () => undefined),
    now: () => new Date('2026-11-19T15:00:00Z'),
    log: vi.fn(),
    ...overrides,
  };
  return deps;
}

describe('handleContact', () => {
  it('guarda, envía el correo con replyTo del visitante y responde 200', async () => {
    const deps = makeDeps();
    const res = await handleContact(req(valid), deps);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(deps.save).toHaveBeenCalledOnce();
    expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('Ana Gómez') }), 'ana@empresa.co');
    expect(deps.markEmail).toHaveBeenCalledWith('msg_1', true);
  });

  it('rechaza métodos distintos de POST', async () => {
    const res = await handleContact(req(valid, 'GET'), makeDeps());
    expect(res.status).toBe(405);
  });

  it('devuelve errores por campo', async () => {
    const res = await handleContact(req({ ...valid, email: 'no-es-correo', message: 'corto' }), makeDeps());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'invalid' });
    const fields = (res.body as { fields: Record<string, string> }).fields;
    expect(Object.keys(fields).sort()).toEqual(['email', 'message']);
  });

  it('honeypot lleno: responde 200 sin guardar ni enviar', async () => {
    const deps = makeDeps();
    const res = await handleContact(req({ ...valid, website: 'http://spam' }), deps);
    expect(res.status).toBe(200);
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('captcha inválido o ausente: 403', async () => {
    const bad = await handleContact(req(valid), makeDeps({ verifyCaptcha: async () => false }));
    expect(bad.status).toBe(403);
    const missing = await handleContact(req({ ...valid, turnstileToken: undefined }), makeDeps());
    expect(missing.status).toBe(403);
  });

  it('sin captcha configurado (emulador) no lo exige', async () => {
    const res = await handleContact(req({ ...valid, turnstileToken: undefined }), makeDeps({ verifyCaptcha: null }));
    expect(res.status).toBe(200);
  });

  it('sin cupo: 429 y no guarda', async () => {
    const deps = makeDeps({ takeRateLimit: async () => false });
    const res = await handleContact(req(valid), deps);
    expect(res.status).toBe(429);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('si falla el correo, el mensaje queda guardado y se responde 200', async () => {
    const deps = makeDeps({ send: async () => Promise.reject(new Error('resend down')) });
    const res = await handleContact(req(valid), deps);
    expect(res.status).toBe(200);
    expect(deps.markEmail).toHaveBeenCalledWith('msg_1', false);
  });

  it('si falla el guardado: 500', async () => {
    const res = await handleContact(req(valid), makeDeps({ save: async () => Promise.reject(new Error('db')) }));
    expect(res.status).toBe(500);
  });
});

describe('formatDate', () => {
  it('convierte a hora de Colombia', () => {
    expect(formatDate(new Date('2026-11-19T15:42:00Z'))).toBe('19 de noviembre de 2026, 10:42 a. m. (hora Colombia)');
    expect(formatDate(new Date('2026-01-01T03:05:00Z'))).toBe('31 de diciembre de 2025, 10:05 p. m. (hora Colombia)');
  });
});

describe('renderContactEmail', () => {
  it('escapa HTML y no deja saltos de línea en el asunto', () => {
    const parsed = parseContact({ ...valid, name: 'Eve\r\nBcc: x@y.z', message: '<script>alert(1)</script> mensaje largo de prueba' });
    if (!parsed.ok) throw new Error('debería ser válido');
    const email = renderContactEmail(parsed.data, { id: 'msg_1', receivedAt: new Date() });
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.text).toContain('Correo:   ana@empresa.co');
  });
});
