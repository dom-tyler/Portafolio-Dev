import { parseExperience } from '@portfolio/content-schema';

/** Trayectoria, de lo más reciente a lo más antiguo. Fechas pendientes en docs/CONTENT_REVIEW.md. */
export const experience = parseExperience([
  {
    org: 'ZETA',
    role: 'Desarrollo de software',
    period: '2025 — 2026',
    summary: 'Desarrollo en equipo a partir de historias de usuario en proyectos comerciales: pagos, IA aplicada y mensajería.',
    stack: ['NestJS', 'Python', 'LangGraph', 'Meta API'],
    kind: 'trabajo',
  },
  {
    org: 'LaboratorioZ',
    role: 'Semillero · frontend y backend',
    period: '2025 —',
    summary: 'Trabajo en JustHome, un proyecto inmobiliario formativo, con Scrum, React, Vite y Git.',
    stack: ['React', 'Vite', 'Scrum'],
    kind: 'formacion',
  },
  {
    org: 'DevsCode',
    role: 'Full stack y contacto con clientes',
    period: '2023 — 2025',
    summary: 'Iniciativa colaborativa con trabajos remunerados por encargo. Desarrollo de Dayed Inmobiliaria y del sitio de DevsCode.',
    stack: ['React', 'Node.js', 'PostgreSQL', 'Vercel'],
    kind: 'trabajo',
  },
  {
    org: 'Antena 4 / Jardín TV',
    role: 'Soporte y frontend',
    period: '2023',
    summary: 'Personalización de WordPress, transición digital y migración de activos.',
    stack: ['WordPress'],
    kind: 'trabajo',
  },
  {
    org: 'Politécnico Jaime Isaza Cadavid',
    role: 'Ingeniería Informática',
    period: 'En curso',
    summary: 'Competencias de programación y hackathons. Antes, tecnicatura en sistemas y electrónica digital con prototipos en Arduino.',
    stack: ['C', 'C++', 'Java', 'Python', 'Arduino'],
    kind: 'formacion',
  },
]);

/** Capas de herramientas. Solo tecnologías con caso asociado o experiencia referida. */
export const toolbelt = [
  { layer: 'Fundamentos', items: ['C', 'C++', 'Java', 'Python', 'TypeScript', 'SQL'] },
  { layer: 'Interfaz', items: ['React', 'Next.js', 'Astro', 'Vite', 'Tailwind', 'Three.js / R3F'] },
  { layer: 'Servicios', items: ['Node.js', 'Express', 'NestJS', 'FastAPI', 'Spring Boot', 'APIs REST'] },
  { layer: 'Datos', items: ['PostgreSQL', 'MongoDB', 'Firestore', 'Prisma', 'Supabase', 'MySQL'] },
  { layer: 'IA', items: ['LangChain', 'LangGraph', 'RAG', 'Embeddings', 'Dify', 'MCP'] },
  { layer: 'Integraciones', items: ['Meta / WhatsApp', 'Bold', 'Firebase Auth', 'n8n', 'Cloudinary'] },
  { layer: 'Infraestructura', items: ['Firebase Hosting', 'Vercel', 'GitHub Actions', 'Docker', 'VPS', 'Linux'] },
  { layer: 'Hardware', items: ['Arduino', 'Electrónica digital', 'Proteus', 'Packet Tracer'] },
] as const;
