import { reasonLabel, type ContactInput } from './schema.js';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Quita saltos de línea para que nada inyecte cabeceras ni rompa el asunto. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

const C = {
  graphite: '#07090A',
  surface: '#0E1113',
  line: '#22272A',
  ivory: '#ECE6D9',
  muted: '#9A968D',
  neon: '#FF2A44',
  copper: '#D4823F',
  pcb: '#1DB46E',
};

const MONO = "'IBM Plex Mono','SFMono-Regular',Menlo,Consolas,monospace";
const SANS = "'Helvetica Neue',Arial,sans-serif";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailMeta {
  id: string;
  receivedAt: Date;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Hora de Colombia (UTC−5 fijo, sin horario de verano). Se formatea a mano porque
 * no todos los runtimes de Node traen los datos de idioma `es-CO` en Intl.
 */
export const formatDate = (date: Date) => {
  const bogota = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  const h24 = bogota.getUTCHours();
  const h12 = h24 % 12 || 12;
  const min = String(bogota.getUTCMinutes()).padStart(2, '0');
  const period = h24 < 12 ? 'a. m.' : 'p. m.';
  return `${bogota.getUTCDate()} de ${MONTHS[bogota.getUTCMonth()]} de ${bogota.getUTCFullYear()}, ${h12}:${min} ${period} (hora Colombia)`;
};

/** Correo que recibe Daniel por cada mensaje del formulario. */
export function renderContactEmail(input: ContactInput, meta: EmailMeta): RenderedEmail {
  const reason = reasonLabel[input.reason];
  const name = oneLine(input.name);
  const company = oneLine(input.company ?? '');
  const subject = `[Portafolio] ${reason} · ${name}${company ? ` (${company})` : ''}`;
  const when = formatDate(meta.receivedAt);

  const row = (label: string, value: string) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${C.line};width:120px;vertical-align:top;font:500 11px/1.4 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${C.copper};">${label}</td>
          <td style="padding:10px 0;border-bottom:1px solid ${C.line};vertical-align:top;font:400 15px/1.5 ${SANS};color:${C.ivory};">${value}</td>
        </tr>`;

  const mailto = `mailto:${encodeURIComponent(input.email)}?subject=${encodeURIComponent(`Re: ${reason} · Portafolio`)}`;
  const messageHtml = escapeHtml(input.message).replace(/\r?\n/g, '<br />');

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.graphite};">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.message.slice(0, 120))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.graphite};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.surface};border:1px solid ${C.line};">
          <tr><td style="height:3px;background:${C.neon};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 14px;font:500 11px/1 ${MONO};letter-spacing:.16em;text-transform:uppercase;color:${C.muted};">
                <span style="display:inline-block;width:7px;height:7px;background:${C.pcb};margin-right:8px;vertical-align:middle;"></span>Nuevo mensaje · ${escapeHtml(reason)}
              </p>
              <h1 style="margin:0;font:700 26px/1.2 ${SANS};letter-spacing:-.02em;color:${C.ivory};">${escapeHtml(name)}</h1>
              ${company ? `<p style="margin:6px 0 0;font:400 15px/1.4 ${SANS};color:${C.muted};">${escapeHtml(company)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};">
                ${row('Correo', `<a href="${mailto}" style="color:${C.ivory};text-decoration:underline;">${escapeHtml(input.email)}</a>`)}
                ${row('Motivo', escapeHtml(reason))}
                ${row('Recibido', escapeHtml(when))}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px;">
              <p style="margin:0 0 10px;font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${C.copper};">Mensaje</p>
              <div style="padding:18px 20px;background:${C.graphite};border-left:2px solid ${C.neon};font:400 15px/1.65 ${SANS};color:${C.ivory};">${messageHtml}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 32px;">
              <a href="${mailto}" style="display:inline-block;padding:13px 22px;background:${C.neon};color:${C.graphite};font:600 12px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;text-decoration:none;">Responder →</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid ${C.line};font:400 11px/1.5 ${MONO};color:${C.muted};">
              ID ${escapeHtml(meta.id)} · Formulario de daniel-dev-portafolio.web.app<br />
              Responder a este correo le escribe directamente a ${escapeHtml(input.email)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Nuevo mensaje del portafolio · ${reason}`,
    '',
    `Nombre:   ${name}`,
    company ? `Empresa:  ${company}` : null,
    `Correo:   ${input.email}`,
    `Recibido: ${when}`,
    '',
    input.message,
    '',
    `ID ${meta.id}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { subject, html, text };
}
