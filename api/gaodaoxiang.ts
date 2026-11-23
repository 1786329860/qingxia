import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, sameOrigin, secret } from './_lib/core.js';
import { verifiedMember } from './_lib/member.js';
import {
  GAODAOXIANG_BYTES,
  GAODAOXIANG_DOWNLOAD,
  GAODAOXIANG_FILENAME,
  GAODAOXIANG_SHA256,
} from '../src/lib/gaodaoxiang.js';

const cookieName = '__Secure-qx_installer';
const grantSeconds = 300;
const etag = `"${GAODAOXIANG_SHA256}"`;

function signature(value: string, key: string) {
  return createHmac('sha256', key)
    .update('gaodaoxiang-download:' + value)
    .digest();
}

function grantCookie(value: string, age: number) {
  return `${cookieName}=${value}; Path=${GAODAOXIANG_DOWNLOAD}; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
}

function hasGrant(req: VercelRequest, key: string, now: number) {
  const cookie = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  const match = /^(\d{10})\.([\da-f]{32})\.([\w-]{43})$/.exec(cookie ?? '');
  if (!match) return false;
  const [, expiry, nonce, mac] = match;
  const expirySeconds = Number(expiry);
  return (
    expirySeconds > now &&
    expirySeconds <= now + grantSeconds &&
    timingSafeEqual(signature(`${expiry}.${nonce}`, key), Buffer.from(mac, 'base64url'))
  );
}

function byteRange(range: string) {
  const match = /^bytes=(\d{0,12})-(\d{0,12})$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return suffix > 0
      ? { start: Math.max(0, GAODAOXIANG_BYTES - suffix), end: GAODAOXIANG_BYTES - 1 }
      : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), GAODAOXIANG_BYTES - 1) : GAODAOXIANG_BYTES - 1;
  return start <= end ? { start, end } : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, no-transform');
  if (req.method === 'DELETE') {
    if (!sameOrigin(req)) return json(res, 403, { error: '请求来源不受支持' });
    res.setHeader('Set-Cookie', grantCookie('', 0));
    return res.status(204).end();
  }

  const key = secret();
  const now = Math.floor(Date.now() / 1000);
  if (req.method === 'POST') {
    if (!sameOrigin(req)) return json(res, 403, { error: '请求来源不受支持' });
    if (key.length < 32) return json(res, 503, { error: '下载服务暂不可用' });
    try {
      if (!(await verifiedMember(req))) return json(res, 401, { error: '请登录轻匣后下载' });
    } catch {
      return json(res, 502, { error: '暂时无法验证登录状态，请稍后重试' });
    }
    const value = `${now + grantSeconds}.${randomBytes(16).toString('hex')}`;
    res.setHeader(
      'Set-Cookie',
      grantCookie(`${value}.${signature(value, key).toString('base64url')}`, grantSeconds),
    );
    return res.status(204).end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD')
    return json(res, 405, { error: '不支持的请求方式' });
  if (key.length < 32 || !hasGrant(req, key, now))
    return json(res, 401, { error: '请从稿到箱页面登录后重新发起下载' });

  const storageUrl = process.env.SUPABASE_URL;
  const storageKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!storageUrl || !storageKey) return json(res, 503, { error: '下载服务暂不可用' });
  const rangeValue =
    req.headers['if-range'] && req.headers['if-range'] !== etag ? undefined : req.headers.range;
  const range = rangeValue ? byteRange(rangeValue) : null;
  if (rangeValue && !range) {
    res.setHeader('Content-Range', `bytes */${GAODAOXIANG_BYTES}`);
    return res.status(416).end();
  }
  const expectedBytes = range ? range.end - range.start + 1 : GAODAOXIANG_BYTES;
  const contentRange = range ? `bytes ${range.start}-${range.end}/${GAODAOXIANG_BYTES}` : null;
  const controller = new AbortController();
  const expireConnection = setTimeout(() => controller.abort(), 15000);
  res.once('close', () => controller.abort());
  try {
    const headers = new Headers({
      apikey: storageKey,
      Authorization: 'Bearer ' + storageKey,
      'Accept-Encoding': 'identity',
    });
    if (range) headers.set('Range', `bytes=${range.start}-${range.end}`);
    const upstream = await fetch(
      new URL(`/storage/v1/object/desktop-installers/${GAODAOXIANG_FILENAME}`, storageUrl),
      { method: req.method, headers, redirect: 'error', signal: controller.signal },
    );
    clearTimeout(expireConnection);
    if (
      upstream.status !== (range ? 206 : 200) ||
      Number(upstream.headers.get('content-length')) !== expectedBytes ||
      (range && upstream.headers.get('content-range') !== contentRange) ||
      (req.method === 'GET' && !upstream.body)
    ) {
      await upstream.body?.cancel();
      return json(res, 502, { error: '暂时无法读取安装包，请稍后重试' });
    }

    res.statusCode = range ? 206 : 200;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${GAODAOXIANG_FILENAME}"`);
    res.setHeader('Content-Length', expectedBytes);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (req.method === 'HEAD') return res.end();
    res.flushHeaders();
    await pipeline(Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>), res);
  } catch {
    if (!res.headersSent && !res.destroyed)
      return json(res, 502, { error: '下载连接失败，请稍后重试' });
    if (!res.destroyed && !res.writableEnded) res.destroy();
  } finally {
    clearTimeout(expireConnection);
  }
}
