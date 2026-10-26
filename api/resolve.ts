import { randomBytes, createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { body, consumeRate, db, json, sameOrigin } from './_lib/core.js';
import { extractShareURL, fetchSharePage, parseDouyinHTML, shareItemID } from './_lib/douyin.js';
const memory = new Map<string, { count: number; until: number }>();
const memoryKey = randomBytes(32);
function localLimit(req: VercelRequest) {
  const id = createHmac('sha256', memoryKey)
    .update(
      String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0],
    )
    .digest('hex');
  const now = Date.now();
  if (memory.size > 2000)
    for (const [key, value] of memory) if (value.until < now) memory.delete(key);
  if (memory.size > 5000) return false;
  const previous = memory.get(id);
  if (!previous || previous.until < now) {
    memory.set(id, { count: 1, until: now + 60000 });
    return true;
  }
  return ++previous.count <= 6;
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: '不支持的请求方式' });
  if (!sameOrigin(req)) return json(res, 403, { error: '请求来源不受支持' });
  const value = body(req).url;
  if (typeof value !== 'string' || value.length > 3000)
    return json(res, 400, { error: '分享内容无效或过长' });
  try {
    const url = extractShareURL(value);
    const allowed = db() ? await consumeRate(req, 'resolve', 6, 60) : localLimit(req);
    if (!allowed) return json(res, 429, { error: '解析请求过于频繁，请一分钟后再试。' });
    const page = await fetchSharePage(url);
    const result = parseDouyinHTML(page.html, shareItemID(page.url) || shareItemID(url));
    if (!result)
      return json(res, 422, {
        error:
          '平台未提供可读取的公开媒体信息，可能需要登录、已限制访问或更改了页面结构。本站不会绕过登录或验证码，请换一个公开分享链接或稍后重试。',
      });
    return json(res, 200, {
      ...result,
      experimental: true,
      notice: '直链可能过期，浏览器下载取决于平台跨域与防盗链设置。',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const known = /^(请粘贴|仅支持|分享|平台)/.test(message);
    return json(res, known ? 400 : 502, {
      error: known ? message : '读取平台失败或超时，请检查链接后稍后重试。',
    });
  }
}
