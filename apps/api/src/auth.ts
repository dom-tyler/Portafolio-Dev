/**
 * Verifica el ID token de Firebase Auth que manda el admin (Authorization: Bearer <token>).
 * Firma RS256 de Google, emisor y audiencia del proyecto, y vigencia; luego lee el claim `admin`.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwks: JWTVerifyGetKey | null = null;

export interface Caller {
  admin: boolean;
  email: string | null;
}

export async function verifyIdToken(authorization: string | null, projectId: string, keys?: JWTVerifyGetKey): Promise<Caller | null> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  try {
    const { payload } = await jwtVerify(token, keys ?? jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });
    if (!payload.sub) return null;
    return {
      admin: payload.admin === true,
      email: typeof payload.email === 'string' ? payload.email : null,
    };
  } catch {
    return null;
  }
}
