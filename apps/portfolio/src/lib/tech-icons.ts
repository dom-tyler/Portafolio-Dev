/**
 * Íconos de tecnologías, resueltos en build (cero JS en el cliente).
 * - Marcas: trazos de simple-icons (CC0), en un solo color (currentColor) para no romper la paleta.
 * - Conceptos sin marca (RAG, APIs, JWT…): íconos de línea propios en el estilo HUD del sitio.
 */
import * as si from 'simple-icons';

export type TechIcon = { kind: 'brand'; path: string; title: string } | { kind: 'line'; body: string; title: string };

/** Nombre tal como aparece en el contenido → slug de simple-icons (sin el prefijo `si`). */
const BRANDS: Record<string, string> = {
  C: 'C',
  'C++': 'Cplusplus',
  Java: 'Openjdk',
  Python: 'Python',
  TypeScript: 'Typescript',
  JavaScript: 'Javascript',
  React: 'React',
  'Next.js': 'Nextdotjs',
  Astro: 'Astro',
  Vite: 'Vite',
  Tailwind: 'Tailwindcss',
  'Three.js / R3F': 'Threedotjs',
  'React Three Fiber': 'Threedotjs',
  'Framer Motion': 'Framer',
  'Node.js': 'Nodedotjs',
  Express: 'Express',
  NestJS: 'Nestjs',
  FastAPI: 'Fastapi',
  'Spring Boot': 'Springboot',
  PostgreSQL: 'Postgresql',
  MongoDB: 'Mongodb',
  MySQL: 'Mysql',
  SQLite: 'Sqlite',
  Prisma: 'Prisma',
  Sequelize: 'Sequelize',
  Supabase: 'Supabase',
  Firestore: 'Firebase',
  'Firebase Auth': 'Firebase',
  'Firebase Hosting': 'Firebase',
  LangChain: 'Langchain',
  LangGraph: 'Langgraph',
  Dify: 'Dify',
  MCP: 'Modelcontextprotocol',
  'Meta / WhatsApp': 'Whatsapp',
  'Meta API': 'Meta',
  WhatsApp: 'Whatsapp',
  n8n: 'N8n',
  Cloudinary: 'Cloudinary',
  Vercel: 'Vercel',
  'GitHub Actions': 'Githubactions',
  Docker: 'Docker',
  Linux: 'Linux',
  Arduino: 'Arduino',
  'Packet Tracer': 'Cisco',
  JWT: 'Jsonwebtokens',
  'Godot 4': 'Godotengine',
  GDScript: 'Godotengine',
  WordPress: 'Wordpress',
};

// Íconos de línea propios (viewBox 24, trazo 1.5). Solo formas geométricas simples.
const LINE: Record<string, string> = {
  database: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13"/><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  api: '<path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 3-2 3 1 0 2 1.5 2 3v2c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2c0 1.5 1 3 2 3-1 0-2 1.5-2 3v2c0 2-1 3-3 3"/><circle cx="12" cy="12" r="1.2"/>',
  rag: '<path d="M6 3h8l4 4v6"/><path d="M14 3v4h4"/><path d="M6 3v18h6"/><circle cx="16.5" cy="16.5" r="3.5"/><path d="M19 19l2.5 2.5"/>',
  vectors: '<path d="M4 20V4"/><path d="M4 20h16"/><circle cx="9" cy="14" r="1.3"/><circle cx="13" cy="9" r="1.3"/><circle cx="17" cy="12" r="1.3"/><circle cx="15" cy="5.5" r="1.3"/><path d="M4 20l9-11"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="M3 9.5h18"/><path d="M6.5 15h4"/>',
  server: '<rect x="4" y="3.5" width="16" height="7" rx="1"/><rect x="4" y="13.5" width="16" height="7" rx="1"/><path d="M7.5 7h.01M7.5 17h.01"/><path d="M12 7h5M12 17h5"/>',
  gate: '<path d="M6 5h6a7 7 0 0 1 0 14H6z"/><path d="M2.5 9H6M2.5 15H6M19 12h2.5"/>',
  wave: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M5.5 12h2l1.5-4 3 8 2-6 1.5 2h3"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M7 10l3 2.5L7 15"/><path d="M12.5 15H17"/>',
  window: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M3 8.5h18"/><path d="M6 6.5h.01M8.5 6.5h.01"/><path d="M7 12.5h5M7 15.5h8"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6z"/><circle cx="12" cy="11" r="2"/><path d="M12 13v3.5"/>',
  agent: '<path d="M4 5.5h16v10H10l-4.5 3.5V15.5H4z"/><circle cx="9" cy="10.5" r="1"/><circle cx="15" cy="10.5" r="1"/><path d="M9 10.5h6"/>',
  cycle: '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1"/><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.5 3v4h-4M6.5 21v-4h4"/>',
  plug: '<path d="M9 3v4M15 3v4"/><path d="M6.5 7h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 15.5V21"/>',
  neural: '<circle cx="5" cy="7" r="1.6"/><circle cx="5" cy="17" r="1.6"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="6" r="1.6"/><circle cx="19" cy="18" r="1.6"/><path d="M6.4 7.8l3.9 3M6.4 16.2l3.9-3M13.7 11l3.8-4.1M13.7 13l3.8 4.1"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
};

const CONCEPTS: Record<string, keyof typeof LINE> = {
  SQL: 'database',
  'APIs REST': 'api',
  'API REST': 'api',
  RAG: 'rag',
  Embeddings: 'vectors',
  Bold: 'card',
  VPS: 'server',
  'Electrónica digital': 'gate',
  Proteus: 'wave',
  Intérpretes: 'terminal',
  CLI: 'terminal',
  GUI: 'window',
  RBAC: 'shield',
  'Agentes conversacionales': 'agent',
  Scrum: 'cycle',
  // Capas del sistema
  Fundamentos: 'terminal',
  Interfaz: 'window',
  API: 'api',
  Servicios: 'api',
  Datos: 'database',
  Integraciones: 'plug',
  IA: 'neural',
  Infra: 'server',
  Infraestructura: 'server',
  Hardware: 'chip',
};

type SimpleIcon = { path: string; title: string };

export function techIcon(name: string): TechIcon {
  const slug = BRANDS[name];
  if (slug) {
    const icon = (si as unknown as Record<string, SimpleIcon | undefined>)[`si${slug}`];
    if (icon) return { kind: 'brand', path: icon.path, title: icon.title };
  }
  const concept = CONCEPTS[name];
  return { kind: 'line', body: LINE[concept ?? 'chip'], title: name };
}
