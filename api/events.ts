import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  body,
  consumeRate,
  db,
  json,
  sameOrigin,
  secret,
  toolIds,
  visitorHash,
} from './_lib/core.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: '不支持的请求方式' });
  if (!sameOrigin(req)) return json(res, 403, { error: '请求来源不受支持' });
  const client = db();
  if (!client || secret().length < 32) return json(res, 503, { error: '统计尚未配置' });
  const value = body(req);
  const { type, visitor, tool, outcome, path } = value;
  if (
    typeof visitor !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(visitor)
  )
    return json(res, 400, { error: '事件无效' });
  const isPage =
    type === 'pageview' &&
    typeof path === 'string' &&
    (/^\/$/.test(path) ||
      /^\/(privacy|about)$/.test(path) ||
      (/^\/tool\/[a-z-]+$/.test(path) && toolIds.includes(path.slice(6))));
  const isTool =
    type === 'tool_use' &&
    typeof tool === 'string' &&
    toolIds.includes(tool) &&
    (outcome === 'success' || outcome === 'error');
  if (!isPage && !isTool) return json(res, 400, { error: '事件无效' });
  try {
    if (!(await consumeRate(req, 'events', 240, 60)))
      return json(res, 429, { error: '请求过于频繁' });
    const { error } = await client
      .from('qingxia_events')
      .insert({
        event_type: type,
        visitor_hash: visitorHash(visitor.toLowerCase()),
        tool_id: isTool ? tool : null,
        outcome: isTool ? outcome : null,
        path: isPage ? path : null,
      });
    if (error) return json(res, 503, { error: '统计暂不可用' });
    return res.status(204).end();
  } catch {
    return json(res, 503, { error: '统计暂不可用' });
  }
}
