import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { body, db, isAdmin, json, sameOrigin } from './_lib/core.js';
import { decodeGif, gifByteLimit } from './_lib/gif.js';
import { verifiedMember } from './_lib/member.js';

const bucket = 'qingxia-gifs';
const notes = 'qingxia_notes';
const gifs = 'qingxia_gifs';
const noteColumns = 'id,author_id,display_name,content,reply,created_at';
const gifColumns = 'id,title,created_at,published';
const pageSize = 24;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

function text(value: unknown, limit: number) {
  if (typeof value !== 'string') return '';
  const result = value.trim();
  return result.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)
    ? result
    : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const { kind, id } = req.query;
  if (id !== undefined && (typeof id !== 'string' || !uuid.test(id)))
    return json(res, 400, { error: '无效的条目编号' });
  if (req.method !== 'GET' && !sameOrigin(req))
    return json(res, 403, { error: '请求来源不受支持' });

  const admin = req.query.manage === '1';
  if (admin && !isAdmin(req)) return json(res, 401, { error: '请先验证站长密码' });
  if (!admin && kind === 'gifs' && req.method !== 'GET')
    return json(res, 403, { error: '此操作需要站长权限' });
  const client = db();
  if (!client) return json(res, 503, { error: '社区服务暂不可用' });

  try {
    if (kind === 'notes' || kind === 'activity') {
      const member = admin ? null : await verifiedMember(req, client);
      if (!admin && !member) return json(res, 401, { error: '请登录已验证邮箱的轻匣账号' });
      if (kind === 'activity' && member && req.method === 'POST') {
        const { error } = await client.rpc('qingxia_member_activity', { p_user: member.id });
        if (error) throw error;
        return res.status(204).end();
      }
      if (kind === 'notes') {
        if (req.method === 'GET') {
          const page = Number(req.query.page ?? 0);
          if (!Number.isSafeInteger(page) || page < 0 || page > 999)
            return json(res, 400, { error: '页码无效' });
          const { data, error } = await client
            .from(notes)
            .select(noteColumns)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize);
          if (error) throw error;
          return json(res, 200, {
            items: data.slice(0, pageSize).map(({ author_id, ...note }) => ({
              ...note,
              own: author_id === member?.id,
            })),
            more: data.length > pageSize,
          });
        }
        if (req.method === 'POST' && member) {
          const input = body(req, 8192);
          const display_name = text(input.name, 24);
          const content = text(input.content, 500);
          if (!display_name || !content)
            return json(res, 400, { error: '请填写 1～24 字昵称与 1～500 字留言' });
          const rate = await client.rpc('qingxia_rate_limit', {
            p_key: 'note:' + member.id,
            p_limit: 5,
            p_seconds: 3600,
          });
          if (rate.error) throw rate.error;
          if (!rate.data) return json(res, 429, { error: '留言太频繁，请稍后再试' });
          const { error } = await client
            .from(notes)
            .insert({ author_id: member.id, display_name, content });
          if (error) throw error;
          return json(res, 201, { ok: true });
        }
        if (req.method === 'PATCH' && admin && id) {
          const reply = text(body(req, 8192).reply, 500);
          if (!reply) return json(res, 400, { error: '请填写 1～500 字回复' });
          const { data, error } = await client
            .from(notes)
            .update({ reply })
            .eq('id', id)
            .select('id');
          if (error) throw error;
          return data.length
            ? json(res, 200, { ok: true })
            : json(res, 404, { error: '留言已不存在' });
        }
        if (req.method === 'DELETE' && id) {
          let deletion = client.from(notes).delete().eq('id', id);
          if (member) deletion = deletion.eq('author_id', member.id);
          const { data, error } = await deletion.select('id');
          if (error) throw error;
          return data.length
            ? json(res, 200, { ok: true })
            : json(res, 404, { error: '留言不存在或无权删除' });
        }
      }
    }
    if (kind === 'gifs') {
      const storage = client.storage.from(bucket);
      if (req.method === 'GET') {
        let listing = client.from(gifs).select(gifColumns);
        if (!admin) listing = listing.eq('published', true);
        if (!id) {
          const { data, error } = await listing
            .order('created_at', { ascending: false })
            .limit(100);
          if (error) throw error;
          return json(res, 200, { items: data });
        }
        const record = await listing.eq('id', id).eq('published', true).maybeSingle();
        if (record.error) throw record.error;
        if (!record.data) return json(res, 404, { error: '表情包已不存在' });
        const { data, error } = await storage.download(id + '.gif');
        if (error) throw error;
        const attachment = req.query.download === '1';
        res.setHeader('Content-Type', 'image/gif');
        res.setHeader(
          'Content-Disposition',
          attachment
            ? "attachment; filename=qingxia.gif; filename*=UTF-8''" +
                encodeURIComponent(record.data.title + '.gif').replace(
                  /['()*]/g,
                  (c) => '%' + c.charCodeAt(0).toString(16),
                )
            : 'inline',
        );
        res.setHeader('Cache-Control', 'public, max-age=120');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.status(200).end(Buffer.from(await data.arrayBuffer()));
      }
      if (req.method === 'POST') {
        const input = body(req, Math.ceil(gifByteLimit / 3) * 4 + 1024);
        const title = text(input.title, 60);
        const bytes = decodeGif(input.gif);
        if (!title || !bytes)
          return json(res, 400, {
            error: '请填写标题，并选择有效的 GIF（最多 2 MB，边长最多 1920 像素）',
          });
        const newId = randomUUID();
        const reservation = await client.rpc('qingxia_reserve_gif', {
          p_id: newId,
          p_title: title,
        });
        if (reservation.error) throw reservation.error;
        if (!reservation.data) return json(res, 409, { error: '已达 100 条上限，请先删除旧条目' });
        const path = newId + '.gif';
        const upload = await storage.upload(path, bytes, {
          contentType: 'image/gif',
          upsert: false,
        });
        if (!upload.error) {
          const publish = await client
            .from(gifs)
            .update({ published: true })
            .eq('id', newId)
            .select('id');
          if (!publish.error && publish.data.length === 1) return json(res, 201, { ok: true });
          // Leave the reservation visible to the administrator after an uncertain publish.
          throw publish.error;
        }
        const cleanup = await storage.remove([path]);
        if (!cleanup.error) await client.from(gifs).delete().eq('id', newId);
        throw upload.error;
      }
      if (req.method === 'DELETE' && id) {
        const record = await client
          .from(gifs)
          .select('published,created_at')
          .eq('id', id)
          .maybeSingle();
        if (record.error) throw record.error;
        if (!record.data) return json(res, 404, { error: '表情包已不存在' });
        if (!record.data.published && Date.now() - Date.parse(record.data.created_at) < 120_000)
          return json(res, 409, { error: '上传仍在处理，请两分钟后重试' });
        const unpublish = await client.from(gifs).update({ published: false }).eq('id', id);
        if (unpublish.error) throw unpublish.error;
        const removal = await storage.remove([id + '.gif']);
        if (removal.error) throw removal.error;
        const { error } = await client.from(gifs).delete().eq('id', id);
        if (error) throw error;
        return json(res, 200, { ok: true });
      }
    }
    return json(res, 405, { error: '不支持的操作' });
  } catch {
    return json(res, 503, { error: '操作暂未完成，请刷新确认后重试' });
  }
}
