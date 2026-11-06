import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reminderTemplates, type Reminder } from '../../src/lib/reminder-templates.js';

const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );

export function reminderMail(reminder: Reminder) {
  const card = reminderTemplates[reminder.template];
  const title = escapeHTML(card.occasion);
  const person = escapeHTML(reminder.recipient_name);
  const message = escapeHTML(reminder.message).replace(/\r?\n/g, '<br>');
  const cid = `card-${reminder.template}@qingxia.aixiaolv.icu`;
  const titleRow = `<tr><td style="padding:31px 8% 25px;border-top:1px solid ${card.accent}">
<p style="margin:0 0 11px;color:${card.accent};font:700 12px/1.5 Arial,sans-serif;letter-spacing:2px">${card.mark}</p>
<h1 style="margin:0;color:${card.ink};font:600 40px/1.2 'Songti SC',SimSun,Georgia,serif">${title}</h1>
</td></tr>`;
  const artRow = `<tr><td bgcolor="${card.paper}"><img src="cid:${cid}" alt="${card.name}插画" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;color:${card.ink};font:14px/2 Arial,sans-serif"></td></tr>`;
  return {
    subject: '轻匣来信 · ' + card.occasion,
    text:
      card.occasion +
      '\n\n写给 ' +
      reminder.recipient_name +
      '\n\n' +
      reminder.message +
      '\n\n这封邮件由轻匣按预约发送。',
    html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#e9e4d9">
<table role="presentation" width="100%" bgcolor="#e9e4d9" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:18px 9px 28px">
<!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
<table role="presentation" width="100%" bgcolor="${card.paper}" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;color:${card.ink}">
<tr><td style="padding:16px 8%;color:${card.ink};font:600 13px/1.45 'Microsoft YaHei',sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td>轻匣来信</td><td align="right" style="color:${card.accent}">${card.name}</td></tr></table></td></tr>
${card.layout === 'folio' ? titleRow + artRow : artRow + titleRow}
<tr><td style="padding:25px 8% 35px;color:${card.ink};font:16px/1.9 'Microsoft YaHei',Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere">
<p style="margin:0 0 15px;font-weight:bold">写给 ${person}</p>
<p style="margin:0">${message}</p>
</td></tr>
<tr><td style="padding:0 8% 22px"><p style="margin:0;border-top:1px solid ${card.accent};padding-top:16px;color:${card.accent};font:14px/1.55 'Songti SC',SimSun,Georgia,serif">${card.closing}</p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:15px 0 0;color:#554b42;font:12px/1.5 Arial,sans-serif">这封邮件由轻匣按预约发送。</p>
</td></tr></table></body></html>`,
  };
}

export async function reminderMessage(reminder: Reminder) {
  const filename = `${reminder.template}.png`;
  return {
    ...reminderMail(reminder),
    attachments: [
      {
        filename,
        content: await readFile(join(process.cwd(), 'public', 'reminder-art', filename)),
        contentType: 'image/png',
        contentDisposition: 'inline' as const,
        cid: `card-${reminder.template}@qingxia.aixiaolv.icu`,
      },
    ],
  };
}

export async function sendReminder(reminder: Reminder, sender: string, password: string) {
  const transport = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: { user: sender, pass: password },
    connectionTimeout: 6500,
    greetingTimeout: 5000,
    socketTimeout: 6500,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const result = await transport.sendMail({
    from: { name: '轻匣来信', address: sender },
    to: { name: '', address: reminder.recipient },
    messageId: `<reminder-${reminder.id}@qingxia.aixiaolv.icu>`,
    ...(await reminderMessage(reminder)),
  });
  if (result.accepted.length !== 1) throw new Error('SMTP did not accept the recipient');
}
