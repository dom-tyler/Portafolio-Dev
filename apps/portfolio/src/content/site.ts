/**
 * Datos de identidad y contacto del sitio.
 * Solo canales que Daniel haya aprobado como públicos.
 * `email` es el correo PÚBLICO que Daniel eligió publicar. El correo de trabajo (destino del
 * formulario) NO va aquí: lo conoce solo el backend detrás de PUBLIC_CONTACT_ENDPOINT.
 */
export const site = {
  name: 'Daniel Osorio Maturana',
  shortName: 'Daniel Osorio',
  role: 'Desarrollador de software',
  location: 'Medellín, Colombia',
  kicker: 'Daniel Osorio · Software Engineer · Medellín',
  /** Titular del hero en dos líneas (la segunda va atenuada). */
  headline: ['Del silicio', 'a la IA.'] as const,
  subline: 'Arquitectura, integraciones e IA aplicada.',
  statement: 'Entiendo el problema, trazo los límites y elijo la arquitectura más simple que aguante lo que viene.',
  contact: {
    github: 'https://github.com/dom-tyler',
    email: 'daniel-dev-osoma@gmail.com',
    linkedin: 'https://www.linkedin.com/in/dom-tyler-dev',
    linkedinHandle: '@dom-tyler-dev',
  },
  description:
    'Portafolio de Daniel Osorio Maturana, desarrollador de software en Medellín con enfoque en arquitectura, IA aplicada e integración de sistemas.',
} as const;
