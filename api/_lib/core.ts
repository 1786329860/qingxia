import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
export const toolIds = [
  'image-compress',
  'image-convert',
  'pdf-merge',
  'pdf-split',
  'pdf-to-images',
  'images-to-pdf',
  'pdf-compress',
  'video-frames',
  'video-gif',
  'extract-audio',
  'json',
  'base64',
  'text-lines',
  'csv-json',
  'units',
  'timestamp',
  'radix',
  'qr',
  'hash',
  'random',
  'color',
  'douyin',
];
export function json(res: VercelResponse, status: number, data: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
}
export function body(req: VercelRequest, maxBytes = 4096): Record<string, unknown> {
  try {
    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType))
      return {};
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!raw || Buffer.byteLength(raw, 'utf8') > maxBytes) return {};
    const value: unknown = typeof req.body === 'string' ? JSON.parse(raw) : req.body;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
export function sameOrigin(req: VercelRequest) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    const source = new URL(origin);
    const destination = new URL(`https://${host}`);
    if (
      source.username ||
      source.password ||
      destination.username ||
      destination.password ||
      source.origin !== origin
    )
      return false;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname);
    if (source.protocol !== 'https:' && !(local && source.protocol === 'http:')) return false;
    return source.origin === new URL(`${source.protocol}//${host}`).origin;
  } catch {
    return false;
  }
}
export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch {
    return null;
  }
}
export function secret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}
export function secureEqual(a: string, b: string) {
  const key = secret() || 'qingxia-password-comparison';
  const x = createHmac('sha256', key).update(a).digest();
  const y = createHmac('sha256', key).update(b).digest();
  return timingSafeEqual(x, y);
}
export function validPassword(input: string) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12 || password.length > 256 || !input || input.length > 256)
    return false;
  const salt = 'qingxia-admin-password-v1';
  return timingSafeEqual(scryptSync(input, salt, 32), scryptSync(password, salt, 32));
}
export function createSession(now = Date.now()) {
  if (secret().length < 32) throw new Error('后台会话密钥尚未正确配置。');
  const payload = Buffer.from(
    JSON.stringify({
      exp: Math.floor(now / 1000) + 8 * 3600,
      nonce: randomBytes(16).toString('hex'),
    }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}
export function isAdmin(req: VercelRequest, now = Date.now()) {
  if (secret().length < 32) return false;
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('qingxia_admin='))
    ?.slice(14);
  if (!cookie || cookie.length > 1000) return false;
  const [payload, sig, ...rest] = cookie.split('.');
  if (!payload || !sig || rest.length) return false;
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  if (!secureEqual(expected, sig)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return (
      typeof data.exp === 'number' &&
      data.exp > now / 1000 &&
      data.exp <= now / 1000 + 8 * 3600 + 60
    );
  } catch {
    return false;
  }
}
export function visitorHash(visitor: string, now = new Date()) {
  const day = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  return createHmac('sha256', secret()).update(`${day}:${visitor}`).digest('hex');
}
export function rateKey(req: VercelRequest, scope: string) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  return createHmac('sha256', secret()).update(`${scope}:${ip}`).digest('hex');
}
export async function consumeRate(
  req: VercelRequest,
  scope: string,
  limit: number,
  seconds: number,
) {
  const client = db();
  if (!client || secret().length < 32) return false;
  const result = await client.rpc('qingxia_rate_limit', {
    p_key: rateKey(req, scope),
    p_limit: limit,
    p_seconds: seconds,
  });
  if (result.error || typeof result.data !== 'boolean') throw new Error('限流服务暂不可用。');
  return result.data;
}
