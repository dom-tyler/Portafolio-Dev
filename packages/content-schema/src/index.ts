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
  links: z
    .object({
      site: z.url().optional(),
      repo: z.url().optional(),
    })
    .default({}),
});

export const ExperienceSchema = z.object({
  org: z.string(),
  role: z.string(),
  period: z.string(),
  summary: z.string(),
  stack: z.array(z.string()).default([]),
  kind: z.enum(['trabajo', 'formacion', 'comunidad']),
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectInput = z.input<typeof ProjectSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
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

export const parseExperience = (input: z.input<typeof ExperienceSchema>[]): Experience[] =>
  z.array(ExperienceSchema).parse(input);
