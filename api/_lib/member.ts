import type { VercelRequest } from '@vercel/node';
import { db } from './core.js';

export async function verifiedMember(req: VercelRequest, client = db()) {
  const authorization = req.headers.authorization;
  const token =
    typeof authorization === 'string' && /^Bearer [\w.-]{1,4096}$/.test(authorization)
      ? authorization.slice(7)
      : '';
  if (!client || !token) return null;
  const { data, error } = await client.auth.getUser(token);
  const user = data?.user;
  return !error && user?.email_confirmed_at && !user.is_anonymous ? user : null;
}
