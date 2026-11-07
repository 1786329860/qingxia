import type { VercelRequest, VercelResponse } from '@vercel/node';
import { body, consumeRate, json, sameOrigin } from './_lib/core.js';
import { verifiedMember } from './_lib/member.js';
import { resolveSunoSong, SunoResolveError } from './_lib/suno.js';
import { sunoPageURL } from '../src/lib/suno-links.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: '不支持的请求方式' });
  if (!sameOrigin(req)) return json(res, 403, { error: '请求来源不受支持' });
  const value = body(req).url;
  const url = typeof value === 'string' && value.length < 500 && sunoPageURL(value);
  if (!url) return json(res, 400, { error: '请粘贴 Suno 的单首歌曲分享链接。' });
  try {
    if (!(await verifiedMember(req)))
      return json(res, 401, { error: '请登录已验证邮箱的轻匣账号。' });
    if (!(await consumeRate(req, 'suno-resolve', 6, 60)))
      return json(res, 429, { error: '解析请求过于频繁，请一分钟后再试。' });
    return json(res, 200, await resolveSunoSong(url));
  } catch (error) {
    if (error instanceof SunoResolveError) return json(res, error.status, { error: error.message });
    return json(res, 502, { error: '读取 Suno 超时或服务暂不可用，请稍后重试。' });
  }
}
