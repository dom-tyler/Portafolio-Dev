import { createHash } from 'node:crypto';
import { onRequest } from 'firebase-functions/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { handleContact, type ContactDeps } from './handler.js';
import { reasonLabel } from './schema.js';

/** Secretos en Secret Manager (`firebase functions:secrets:set NOMBRE`). Nunca en el repo ni en el cliente. */
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const CONTACT_TO_EMAIL = defineSecret('CONTACT_TO_EMAIL');
const TURNSTILE_SECRET = defineSecret('TURNSTILE_SECRET');

/** Remitente. Sin dominio verificado en Resend, solo funciona `onboarding@resend.dev`. */
const CONTACT_FROM = defineString('CONTACT_FROM', {
  default: 'Portafolio Daniel Osorio <onboarding@resend.dev>',
});

const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

initializeApp();
const db = getFirestore();

const hashIp = (ip: string) => createHash('sha256').update(`portfolio-contact:${ip}`).digest('hex').slice(0, 32);

function clientIp(headers: Record<string, string | string[] | undefined>, fallback: string | undefined) {
  const forwarded = headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || fallback || 'unknown';
}

async function verifyTurnstile(secret: string, token: string, ip: string) {
  const form = new URLSearchParams({ secret, response: token, remoteip: ip });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

export const contact = onRequest(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY, CONTACT_TO_EMAIL, TURNSTILE_SECRET],
    maxInstances: 3,
    concurrency: 20,
    memory: '256MiB',
    timeoutSeconds: 20,
    // En producción llega por el rewrite de Hosting (mismo origen); CORS solo para desarrollo local.
    cors: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
  },
  async (req, res) => {
    const resend = new Resend(RESEND_API_KEY.value());
    const turnstileSecret = TURNSTILE_SECRET.value().trim();

    const deps: ContactDeps = {
      // Con el secreto vacío (emulador) no se exige captcha; en producción se configura siempre.
      verifyCaptcha: turnstileSecret ? (token, ip) => verifyTurnstile(turnstileSecret, token, ip) : null,

      takeRateLimit: (ip) =>
        db.runTransaction(async (tx) => {
          const ref = db.collection('rateLimits').doc(hashIp(ip));
          const snap = await tx.get(ref);
          const now = Date.now();
          const current = snap.data() as { count: number; windowStart: number } | undefined;
          if (!current || now - current.windowStart > RATE_LIMIT.windowMs) {
            tx.set(ref, { count: 1, windowStart: now });
            return true;
          }
          if (current.count >= RATE_LIMIT.max) return false;
          tx.update(ref, { count: current.count + 1 });
          return true;
        }),

      save: async (input, meta) => {
        const ref = await db.collection('messages').add({
          name: input.name,
          email: input.email,
          company: input.company ?? '',
          reason: input.reason,
          reasonLabel: reasonLabel[input.reason],
          message: input.message,
          status: 'nuevo',
          read: false,
          emailSent: null,
          createdAt: FieldValue.serverTimestamp(),
          source: 'portfolio-form',
          ipHash: hashIp(meta.ip),
          userAgent: meta.userAgent.slice(0, 300),
        });
        return ref.id;
      },

      send: async (email, replyTo) => {
        const { error } = await resend.emails.send({
          from: CONTACT_FROM.value(),
          to: [CONTACT_TO_EMAIL.value()],
          replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        if (error) throw new Error(`${error.name}: ${error.message}`);
      },

      markEmail: async (id, sent) => {
        await db.collection('messages').doc(id).update({ emailSent: sent });
      },

      now: () => new Date(),
      log: (level, message, extra) => logger[level](message, extra),
    };

    const result = await handleContact(
      {
        method: req.method,
        body: req.body,
        ip: clientIp(req.headers, req.ip),
        userAgent: String(req.headers['user-agent'] ?? ''),
      },
      deps,
    );
    res.status(result.status).json(result.body);
  },
);
