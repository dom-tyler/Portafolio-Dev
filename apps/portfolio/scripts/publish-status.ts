/**
 * Lo usa el workflow de deploy para reflejar el avance en publishes/{id}, que el admin sigue en vivo.
 *
 *   node scripts/publish-status.ts <publishId> running|success|failure [runUrl]
 *
 * Sin publishId (deploy por push a main) no hace nada.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS, PublishStatus } from '@portfolio/content-schema';
import { initAdmin } from './_admin.ts';

const [id, statusArg, runUrl] = process.argv.slice(2);

if (!id) {
  console.log('Sin publishId: deploy no iniciado desde el admin, nada que actualizar.');
  process.exit(0);
}

const status = PublishStatus.parse(statusArg);
const db = getFirestore(initAdmin());

const update: Record<string, unknown> = { status };
if (runUrl) update.runUrl = runUrl;
if (status === 'running') update.startedAt = FieldValue.serverTimestamp();
if (status === 'success' || status === 'failure') update.finishedAt = FieldValue.serverTimestamp();
if (status === 'failure') update.error = 'El workflow de deploy falló. Revisa el registro en GitHub Actions.';

await db.collection(COLLECTIONS.publishes).doc(id).set(update, { merge: true });
console.log(`publishes/${id} → ${status}`);
