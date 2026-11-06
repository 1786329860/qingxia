import nodemailer from 'nodemailer';
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
  return {
    subject: '轻匣来信 · ' + card.occasion,
    text:
      card.occasion +
      '\n\n写给 ' +
      reminder.recipient_name +
      '\n\n' +
      reminder.message +
      '\n\n这封邮件由轻匣按预约发送。',
    html: `<div style="background:#f2f2ec;padding:20px 8px;font-family:Georgia,'Songti SC',serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse;background:${card.paper};color:${card.ink}">
<tr><td><img src="https://qingxia.aixiaolv.icu/reminder-art/${reminder.template}.png" alt="" width="560" style="width:100%;max-width:560px;height:auto;display:block;border:0"></td></tr>
<tr><td style="padding:24px 25px 16px;border-top:5px solid ${card.accent};font:600 13px Arial,sans-serif;letter-spacing:2px">${card.name} &nbsp; / &nbsp; 轻匣来信</td></tr>
<tr><td style="padding:8px 25px 0;font-size:32px;line-height:1.25;font-weight:bold">${title}</td></tr>
<tr><td style="padding:14px 25px 28px;font:16px/1.8 'Microsoft YaHei',sans-serif;overflow-wrap:anywhere"><strong>写给 ${person}</strong><br><br>${message}</td></tr>
<tr><td style="padding:13px 25px;border-top:1px solid ${card.accent};font:13px Arial,sans-serif">这封邮件由轻匣按预约发送。</td></tr>
</table></div>`,
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
    ...reminderMail(reminder),
  });
  if (result.accepted.length !== 1) throw new Error('SMTP did not accept the recipient');
}
