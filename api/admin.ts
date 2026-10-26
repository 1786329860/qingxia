import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  body,
  consumeRate,
  createSession,
  db,
  isAdmin,
  json,
  sameOrigin,
  secret,
  validPassword,
} from './_lib/core.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'DELETE') {
      if (!sameOrigin(req)) return json(res, 403, { error: '请求来源不受支持' });
      res.setHeader(
        'Set-Cookie',
        'qingxia_admin=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0',
      );
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: '请求来源不受支持' });
      if (
        !db() ||
        secret().length < 32 ||
        (process.env.ADMIN_PASSWORD?.length || 0) < 12 ||
        (process.env.ADMIN_PASSWORD?.length || 0) > 256
      )
        return json(res, 503, {
          error: '后台尚未配置。请由站长按部署说明设置数据库、后台密码及会话密钥。',
        });
      const input = body(req).password;
      if (typeof input !== 'string' || !input || input.length > 256)
        return json(res, 400, { error: '请输入后台密码' });
      if (!(await consumeRate(req, 'login', 8, 900)))
        return json(res, 429, { error: '尝试过于频繁，请 15 分钟后重试。' });
      if (!validPassword(input)) return json(res, 401, { error: '密码不正确' });
      res.setHeader(
        'Set-Cookie',
        `qingxia_admin=${createSession()}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800`,
      );
      return json(res, 200, { ok: true });
    }
    if (req.method !== 'GET') return json(res, 405, { error: '不支持的请求方式' });
    if (!isAdmin(req)) return json(res, 401, { error: '请先验证站长密码' });
    const client = db();
    if (!client) return json(res, 503, { error: '统计数据库尚未配置' });
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      return json(res, 400, { error: '日期范围无效' });
    const start = new Date(`${from}T00:00:00+08:00`);
    const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 93 * 86400000
    )
      return json(res, 400, { error: '请选择 1～93 天的日期范围' });
    if (
      from.startsWith('0000-') ||
      to.startsWith('0000-') ||
      new Date(start.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== from ||
      new Date(end.getTime() - 86400000 + 8 * 3600000).toISOString().slice(0, 10) !== to
    )
      return json(res, 400, { error: '日期范围无效' });
    const { data, error } = await client.rpc('qingxia_stats', {
      p_from: start.toISOString(),
      p_to: end.toISOString(),
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data))
      return json(res, 503, { error: '读取统计失败，请检查数据库迁移是否完成。' });
    return json(res, 200, { ...data, from, to, timeZone: 'Asia/Shanghai' });
  } catch {
    return json(res, 503, { error: '后台服务暂不可用，请稍后重试。' });
  }
}
