import { z } from 'zod';

/** Estado editorial (independiente de si el caso está publicado). */
export const Tier = z.enum(['destacado', 'laboratorio', 'archivo']);

/** Estado real del producto/proyecto. Solo lo que se puede respaldar. */
export const Status = z.enum(['en-vivo', 'en-desarrollo', 'academico', 'caso-privado']);

export const Domain = z.enum([
  'frontend',
  'backend',
  'ia',
  'integraciones',
  'datos',
  'arquitectura',
  'hardware',
  'juegos',
  'lenguajes',
]);

/** Capas del sistema que el caso toca. Alimenta el diagrama de capas de cada ficha. */
export const Layer = z.enum(['interfaz', 'api', 'datos', 'integraciones', 'ia', 'infraestructura']);

export const ProjectSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(2),
  tagline: z.string().min(10).max(140),
  tier: Tier,
  status: Status,
  order: z.number().int(),
  period: z.string(),
  context: z.string(),
  role: z.string(),
  summary: z.string().min(40),
  problem: z.string().optional(),
  contribution: z.array(z.string()).min(1),
  decisions: z.array(z.object({ title: z.string(), body: z.string() })).default([]),
  stack: z.array(z.string()).min(1),
  domains: z.array(Domain).min(1),
  layers: z.array(Layer).min(1),
  /** Cómo se integra cada tecnología o servicio en el proyecto (lo edita el admin). */
  integrations: z
    .array(z.object({ name: z.string().min(1), detail: z.string().min(1) }))
    .default([]),
  links: z
    .object({
      site: z.url().optional(),
      repo: z.url().optional(),
    })
    .default({}),
  /** Oculto = queda en Firestore pero no se publica. */
  visible: z.boolean().default(true),
});

export const ExperienceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).optional(),
  org: z.string(),
  role: z.string(),
  period: z.string(),
  summary: z.string(),
  stack: z.array(z.string()).default([]),
  kind: z.enum(['trabajo', 'formacion', 'comunidad']),
  order: z.number().int().default(0),
  visible: z.boolean().default(true),
});

/** Una capa de la sección "Herramientas por capa". `items` son nombres; el sitio resuelve el ícono por nombre. */
export const ToolbeltLayerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  layer: z.string().min(1),
  order: z.number().int(),
  items: z.array(z.string().min(1)).min(1),
  visible: z.boolean().default(true),
});

/**
 * Colecciones de Firestore. El admin escribe; el sitio las lee al compilar (botón Publicar).
 * - projects/{slug}       ProjectSchema
 * - experience/{id}       ExperienceSchema
 * - toolbelt/{id}         ToolbeltLayerSchema
 * - messages/{id}         formulario de contacto (lo escribe el Worker apps/api)
 * - publishes/{id}        historial de publicaciones (lo escriben el Worker apps/api y el CI)
 */
export const COLLECTIONS = {
  projects: 'projects',
  experience: 'experience',
  toolbelt: 'toolbelt',
  messages: 'messages',
  publishes: 'publishes',
} as const;

export const PublishStatus = z.enum(['requested', 'running', 'success', 'failure']);

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectInput = z.input<typeof ProjectSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type ExperienceInput = z.input<typeof ExperienceSchema>;
export type ToolbeltLayer = z.infer<typeof ToolbeltLayerSchema>;
export type ToolbeltLayerInput = z.input<typeof ToolbeltLayerSchema>;
export type LayerName = z.infer<typeof Layer>;

export const parseProjects = (input: ProjectInput[]): Project[] => {
  const parsed = z.array(ProjectSchema).parse(input);
  const slugs = new Set<string>();
  for (const p of parsed) {
    if (slugs.has(p.slug)) throw new Error(`Slug duplicado: ${p.slug}`);
    slugs.add(p.slug);
  }
  return parsed.sort((a, b) => a.order - b.order);
};

/** Mantiene el orden de entrada salvo que `order` diga otra cosa (orden estable). */
export const parseExperience = (input: ExperienceInput[]): Experience[] =>
  z
    .array(ExperienceSchema)
    .parse(input)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.order - b.e.order || a.i - b.i)
    .map(({ e }) => e);

export const parseToolbelt = (input: ToolbeltLayerInput[]): ToolbeltLayer[] => {
  const parsed = z.array(ToolbeltLayerSchema).parse(input);
  const ids = new Set<string>();
  for (const l of parsed) {
    if (ids.has(l.id)) throw new Error(`Capa duplicada: ${l.id}`);
    ids.add(l.id);
  }
  return parsed.sort((a, b) => a.order - b.order);
};

/** Lo que se publica: solo lo visible. */
export const onlyVisible = <T extends { visible: boolean }>(items: T[]): T[] => items.filter((i) => i.visible);
