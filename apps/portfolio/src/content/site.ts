/**
 * Datos de identidad y contacto del sitio.
 * Solo canales que Daniel haya aprobado como públicos.
 * Para agregar correo o LinkedIn, completa `email` / `linkedin`.
 */
export const site = {
  name: 'Daniel Osorio Maturana',
  shortName: 'Daniel Osorio',
  role: 'Desarrollador de software',
  location: 'Medellín, Colombia',
  headline: 'Diseño sistemas de software, de la arquitectura al producto.',
  subline:
    'IA aplicada, integraciones de pagos y mensajería, y una base que empezó en algoritmos y electrónica digital.',
  statement:
    'Empiezo por entender el problema, definir los límites del sistema y tomar decisiones de arquitectura. He llevado ese enfoque a productos comerciales, integraciones de pagos y mensajería, y prototipos en software y hardware.',
  contact: {
    github: 'https://github.com/AresHidalgo',
    email: undefined as string | undefined,
    linkedin: undefined as string | undefined,
  },
  description:
    'Portafolio de Daniel Osorio Maturana, desarrollador de software en Medellín con enfoque en arquitectura, IA aplicada e integración de sistemas.',
} as const;
