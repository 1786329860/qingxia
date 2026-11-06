import { createHash, randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { body, db, json, sameOrigin, secureEqual } from './_lib/core.js';
import { verifiedMember } from './_lib/member.js';
import { sendReminder } from './_lib/reminder-mail.js';
import { isReminderTemplate, type Reminder } from '../src/lib/reminder-templates.js';

const table = 'qingxia_reminders';
const projection = 'id,recipient,recipient_name,message,template,due_at,state';
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const emailPattern = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d-]+(?:\.[a-z\d-]+)+$/i;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newInvite = () => randomBytes(32).toString('base64url');
const inviteLink = (token: string) => '/reminders#accept=' + token;

function userText(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized.length <= max &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
    ? normalized
    : '';
}

async function dispatch(req: VercelRequest, res: VercelResponse) {
  const key = process.env.REMINDER_CRON_SECRET || '';
  const auth = req.headers.authorization;
  if (
    req.method !== 'POST' ||
    key.length < 32 ||
    typeof auth !== 'string' ||
    auth.length > 128 ||
    !secureEqual(auth, 'Bearer ' + key)
  )
    return json(res, 401, { error: '授权无效' });
  const client = db();
  const sender = process.env.REMINDER_SMTP_USER;
  const password = process.env.REMINDER_SMTP_PASSWORD;
  if (!client || !sender || !password) return json(res, 503, { error: '提醒邮件尚未配置' });
  const claim = await client.rpc('qingxia_claim_reminder');
  if (claim.error) throw claim.error;
  const reminder = (claim.data as Reminder[])[0];
  if (!reminder) return res.status(204).end();
  let state: 'sent' | 'failed' | 'uncertain' = 'sent';
  try {
    await sendReminder(reminder, sender, password);
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code;
    state =
      code && ['EAUTH', 'EENVELOPE', 'ECONNECTION', 'EDNS'].includes(code) ? 'failed' : 'uncertain';
  }
  // A timeout may occur after SMTP accepts the message. Never automatically resend a claim.
  const done = await client
    .from(table)
    .update({ state, finished_at: new Date().toISOString() })
    .eq('id', reminder.id)
    .eq('state', 'sending');
  if (done.error) throw done.error;
  return json(res, 200, { state });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const { action, id } = req.query;
  try {
    if (action === 'dispatch') return await dispatch(req, res);
    if (req.method !== 'GET' && !sameOrigin(req))
      return json(res, 403, { error: '请求来源不受支持' });
    const client = db();
    if (!client) return json(res, 503, { error: '预约服务暂不可用' });
    const member = await verifiedMember(req, client);
    if (!member?.email) return json(res, 401, { error: '请登录已验证邮箱的轻匣账号' });
    const email = member.email.toLowerCase();
    const now = new Date().toISOString();

    if (req.method === 'GET') {
      const result = await client
        .from(table)
        .select(projection)
        .eq('owner_id', member.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (result.error) throw result.error;
      return json(res, 200, { items: result.data });
    }

    if (req.method === 'POST' && action === 'confirm') {
      const token = body(req).token;
      if (typeof token !== 'string' || !/^[a-z\d_-]{43}$/i.test(token))
        return json(res, 400, { error: '确认链接无效' });
      const result = await client
        .from(table)
        .update({ state: 'queued', confirmation_hash: null })
        .eq('recipient', email)
        .eq('confirmation_hash', hash(token))
        .eq('state', 'awaiting')
        .gt('due_at', now)
        .select('id')
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data
        ? json(res, 200, { ok: true })
        : json(res, 404, { error: '链接已失效，或当前账号邮箱与预约收件人不一致' });
    }

    if (req.method === 'POST' && action === undefined) {
      if (
        !process.env.REMINDER_SMTP_PASSWORD ||
        !process.env.REMINDER_SMTP_USER ||
        (process.env.REMINDER_CRON_SECRET?.length || 0) < 32
      )
        return json(res, 503, { error: '预约发信暂未启用' });
      const data = body(req, 8192);
      const recipient = userText(data.recipient, 254).toLowerCase();
      const name = userText(data.name, 40).replace(/[\r\n]+/g, ' ');
      const message = userText(data.message, 500);
      const due = typeof data.due === 'string' ? new Date(data.due) : null;
      if (!emailPattern.test(recipient) || !name || !message || !isReminderTemplate(data.template))
        return json(res, 400, { error: '请检查收件邮箱、称呼、模板和正文' });
      if (!due || !Number.isFinite(due.getTime()))
        return json(res, 400, { error: '请选择有效发送时间' });
      const token = recipient === email ? '' : newInvite();
      const result = await client.rpc('qingxia_create_reminder', {
        p_owner: member.id,
        p_recipient: recipient,
        p_name: name,
        p_message: message,
        p_template: data.template,
        p_due: due.toISOString(),
        p_hash: token ? hash(token) : null,
      });
      if (result.error?.message === 'REMINDER_DATE')
        return json(res, 400, { error: '发送时间须在 2 分钟后、365 天内' });
      if (result.error) throw result.error;
      if (!result.data) return json(res, 429, { error: '预约已达到限额，请稍后再试' });
      return json(res, 201, { id: result.data, invite: token ? inviteLink(token) : null });
    }

    if (typeof id !== 'string' || !uuid.test(id)) return json(res, 400, { error: '预约编号无效' });

    if (req.method === 'POST' && action === 'renew') {
      const token = newInvite();
      const result = await client
        .from(table)
        .update({ confirmation_hash: hash(token) })
        .eq('id', id)
        .eq('owner_id', member.id)
        .eq('state', 'awaiting')
        .gt('due_at', now)
        .select('id')
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data
        ? json(res, 200, { invite: inviteLink(token) })
        : json(res, 409, { error: '该预约不再需要收件确认' });
    }

    if (req.method === 'DELETE' && action === undefined) {
      const result = await client
        .from(table)
        .update({ state: 'cancelled', finished_at: now, confirmation_hash: null })
        .eq('id', id)
        .eq('owner_id', member.id)
        .in('state', ['awaiting', 'queued'])
        .select('id')
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data
        ? json(res, 200, { ok: true })
        : json(res, 409, { error: '该预约已开始发送、已结束或不存在' });
    }

    return json(res, 405, { error: '不支持的操作' });
  } catch {
    return json(res, 503, { error: '提醒服务暂不可用，请稍后重试' });
  }
}
