import { z } from 'zod';

/** Motivos de contacto. El valor viaja en el JSON; la etiqueta se usa en el correo y en el admin. */
export const reasonLabel = {
  proyecto: 'Proyecto',
  empleo: 'Empleo',
  consultoria: 'Consultoría',
  otro: 'Otro',
} as const;

export type Reason = keyof typeof reasonLabel;

const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} es obligatorio.` })
    .trim()
    .min(min, { error: min > 1 ? `${label} necesita al menos ${min} caracteres.` : `${label} es obligatorio.` })
    .max(max, { error: `${label} admite máximo ${max} caracteres.` });

/**
 * Contrato del formulario público (`POST /api/contact`).
 * `website` es un honeypot: un humano nunca lo llena.
 */
export const ContactSchema = z.object({
  name: text(2, 80, 'El nombre'),
  email: z
    .string({ error: 'El correo es obligatorio.' })
    .trim()
    .max(120, { error: 'El correo admite máximo 120 caracteres.' })
    .pipe(z.email({ error: 'Escribe un correo válido.' })),
  company: z.string().trim().max(120, { error: 'La empresa admite máximo 120 caracteres.' }).optional().default(''),
  reason: z.enum(['proyecto', 'empleo', 'consultoria', 'otro'], { error: 'Elige un motivo.' }),
  message: text(20, 4000, 'El mensaje'),
  website: z.string().optional().default(''),
  turnstileToken: z.string().max(4096).optional(),
});

export type ContactInput = z.infer<typeof ContactSchema>;

export type ParseResult =
  | { ok: true; data: ContactInput }
  | { ok: false; fields: Record<string, string> };

/** Valida el cuerpo y devuelve un mensaje por campo (el primero de cada uno). */
export function parseContact(body: unknown): ParseResult {
  const result = ContactSchema.safeParse(body ?? {});
  if (result.success) return { ok: true, data: result.data };
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_');
    fields[key] ??= issue.message;
  }
  return { ok: false, fields };
}
