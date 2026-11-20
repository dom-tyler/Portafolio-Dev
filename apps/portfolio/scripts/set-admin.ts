/**
 * Da (o quita) el permiso de administrador a una cuenta. La persona debe haber iniciado sesión
 * una vez en el admin con Google para que su usuario exista.
 *
 *   pnpm --filter @portfolio/web set-admin tu-correo@gmail.com
 *   pnpm --filter @portfolio/web set-admin tu-correo@gmail.com --revoke
 *
 * Después de cambiarlo, cierra sesión y vuelve a entrar en el admin para refrescar el token.
 */
import { getAuth } from 'firebase-admin/auth';
import { initAdmin } from './_admin.ts';

const email = process.argv.slice(2).find((a) => !a.startsWith('--'));
const revoke = process.argv.includes('--revoke');

if (!email) {
  console.error('Uso: set-admin <correo> [--revoke]');
  process.exit(1);
}

const auth = getAuth(initAdmin());
const user = await auth.getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No existe un usuario con ${email}. Inicia sesión una vez en el admin y repite.`);
  process.exit(1);
}

const claims = { ...(user.customClaims ?? {}) };
if (revoke) delete claims.admin;
else claims.admin = true;

await auth.setCustomUserClaims(user.uid, claims);
console.log(`${revoke ? 'Permiso retirado a' : 'Ahora es administrador:'} ${email} (uid ${user.uid})`);
