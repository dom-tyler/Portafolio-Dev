/**
 * Carga inicial: copia el contenido local (src/content) a Firestore para empezar a editarlo en el admin.
 *
 *   pnpm --filter @portfolio/web seed            → solo muestra lo que haría
 *   pnpm --filter @portfolio/web seed --write    → escribe los documentos que no existen
 *   pnpm --filter @portfolio/web seed --write --force → además sobrescribe los existentes
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@portfolio/content-schema';
import { projects } from '../src/content/projects.ts';
import { experience, toolbelt } from '../src/content/experience.ts';
import { initAdmin } from './_admin.ts';

const write = process.argv.includes('--write');
const force = process.argv.includes('--force');

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const experienceDocs = (() => {
  const used = new Set<string>();
  return experience.map((e, i) => {
    let id = e.id ?? slugify(e.org);
    while (used.has(id)) id = `${id}-${i}`;
    used.add(id);
    return { ...e, id, order: i + 1 };
  });
})();

const plan: { collection: string; id: string; data: Record<string, unknown> }[] = [
  ...projects.map((p) => ({ collection: COLLECTIONS.projects, id: p.slug, data: { ...p } })),
  ...experienceDocs.map((e) => ({ collection: COLLECTIONS.experience, id: e.id, data: { ...e } })),
  ...toolbelt.map((t) => ({ collection: COLLECTIONS.toolbelt, id: t.id, data: { ...t, items: [...t.items] } })),
];

/** Firestore rechaza `undefined`. */
const clean = (data: Record<string, unknown>) => JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

if (!write) {
  for (const p of plan) console.log(`[simulación] ${p.collection}/${p.id}`);
  console.log(`\n${plan.length} documentos. Agrega --write para escribirlos.`);
  process.exit(0);
}

const db = getFirestore(initAdmin());
let created = 0;
let skipped = 0;
let overwritten = 0;

for (const p of plan) {
  const ref = db.collection(p.collection).doc(p.id);
  const exists = (await ref.get()).exists;
  if (exists && !force) {
    skipped++;
    console.log(`omitido (ya existe) ${p.collection}/${p.id}`);
    continue;
  }
  await ref.set({ ...clean(p.data), updatedAt: FieldValue.serverTimestamp() });
  if (exists) overwritten++;
  else created++;
  console.log(`${exists ? 'sobrescrito' : 'creado'} ${p.collection}/${p.id}`);
}

console.log(`\nCreados ${created} · sobrescritos ${overwritten} · omitidos ${skipped}`);
