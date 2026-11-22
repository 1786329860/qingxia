import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { db, isAdmin, json, sameOrigin } from './_lib/core.js';
import { GAODAOXIANG_BUCKET, GAODAOXIANG_FILENAME } from '../src/lib/gaodaoxiang.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, {});
  if (!sameOrigin(req) || !isAdmin(req)) return json(res, 401, {});
  const client = db();
  if (!client) return json(res, 503, {});
  if (req.query.verify === '1') {
    const email = `gaodaoxiang-smoke-${randomUUID()}@example.com`;
    const password = randomUUID() + randomUUID();
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) return json(res, 502, {});
    return json(res, 200, { email, password });
  }
  const { data, error } = await client.storage
    .from(GAODAOXIANG_BUCKET)
    .createSignedUploadUrl(GAODAOXIANG_FILENAME, { upsert: false });
  if (error || !data) return json(res, 502, {});
  return json(res, 200, { upload: data.signedUrl });
}
