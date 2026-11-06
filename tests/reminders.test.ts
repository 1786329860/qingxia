import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { reminderMail, reminderMessage } from '../api/_lib/reminder-mail';
import { reminderOptions, reminderTemplates } from '../src/lib/reminder-templates';
import handler from '../api/reminders';

const owner = 'e043fe7c-f14d-4e86-b65a-21be7ca08ce5';
const address = 'reader@example.test';

describe('scheduled reminder queue', () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      insert into auth.users values ('${owner}');
    `);
    await pg.exec(await readFile('supabase/migrations/20261106121712_scheduled_cards.sql', 'utf8'));
    await pg.exec(
      await readFile('supabase/migrations/20261106124424_expand_card_occasions.sql', 'utf8'),
    );
  });
  afterAll(async () => {
    await pg?.close();
  });

  it('keeps content and claim RPC private', async () => {
    for (const role of ['anon', 'authenticated']) {
      await pg.exec('set role ' + role);
      try {
        await expect(pg.exec('select * from public.qingxia_reminders')).rejects.toThrow(
          /permission denied/,
        );
        await expect(pg.exec('select public.qingxia_claim_reminder()')).rejects.toThrow(
          /permission denied/,
        );
      } finally {
        await pg.exec('reset role');
      }
    }
  });

  it('accepts the new occasions and preserves the original three template identifiers', async () => {
    await pg.exec('begin');
    try {
      for (const key of reminderOptions) {
        await pg.query(
          "insert into public.qingxia_reminders (owner_id,recipient,recipient_name,message,template,due_at,state) values ($1,$2,'测试','测试',$3,now(),'awaiting')",
          [owner, address, key],
        );
      }
      expect(
        (
          await pg.query(
            'select count(distinct template)::int as total from public.qingxia_reminders',
          )
        ).rows,
      ).toEqual([{ total: 6 }]);
    } finally {
      await pg.exec('rollback');
    }
  });

  it('queues self-mail and requires confirmation for other recipients, claiming each due message once', async () => {
    const create = (when: string, hash: string | null) =>
      pg.query<{ id: string | null }>(
        'select public.qingxia_create_reminder($1,$2,$3,$4,$5,now()+$6::interval,$7) as id',
        [owner, address, '小王', '祝好', 'birthday', when, hash],
      );
    await expect(create('-1 minute', null)).rejects.toThrow('REMINDER_DATE');
    const self = (await create('1 hour', null)).rows[0].id;
    const invitation = (await create('1 hour', 'invite-hash')).rows[0].id;
    expect(self).toBeTruthy();
    expect(invitation).toBeTruthy();
    expect((await pg.query('select * from public.qingxia_claim_reminder()')).rows).toEqual([]);
    await pg.exec("update public.qingxia_reminders set due_at=now()-interval '1 second'");
    const claim = await pg.query('select id,state from public.qingxia_claim_reminder()');
    expect(claim.rows).toEqual([{ id: self, state: 'sending' }]);
    expect((await pg.query('select * from public.qingxia_claim_reminder()')).rows).toEqual([]);
    expect(
      (await pg.query('select state from public.qingxia_reminders where id=$1', [invitation])).rows,
    ).toEqual([{ state: 'awaiting' }]);
    await create('2 hours', null);
    await create('3 hours', null);
    expect((await create('4 hours', null)).rows[0].id).toBeNull();
  });
});

it('mail templates escape messages and use fixed headers', () => {
  const mail = reminderMail({
    id: owner,
    recipient: address,
    recipient_name: '<em>名字</em>',
    message: '你好\n<script>alert(1)</script>',
    template: 'anniversary',
    due_at: '2026-11-06T08:00:00Z',
    state: 'sending',
  });
  expect(mail.html).toContain('&lt;em&gt;名字&lt;/em&gt;');
  expect(mail.html).toContain('你好<br>&lt;script&gt;');
  expect(mail.html).not.toContain('<script>');
  expect(mail.html).toContain('cid:card-anniversary@qingxia.aixiaolv.icu');
  expect(mail.subject).toBe('轻匣来信 · 又一年，仍并肩');
});

it.each(reminderOptions)(
  'encodes %s as an actual MIME message with an embedded, matching PNG',
  async (template) => {
    const message = await reminderMessage({
      id: owner,
      recipient: address,
      recipient_name: '测试读者',
      message: '这是一封贺卡。',
      template,
      due_at: '2026-11-06T08:00:00Z',
      state: 'sending',
    });
    const cid = 'card-' + template + '@qingxia.aixiaolv.icu';
    expect(message.attachments[0].content.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(message.html).toContain(reminderTemplates[template].occasion);
    expect(message.html).not.toContain('https://qingxia.aixiaolv.icu/reminder-art');
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const wire = await transport.sendMail({ ...message, from: 'sender@example.test', to: address });
    expect(String(wire.message)).toContain('multipart/related');
    expect(String(wire.message)).toContain('Content-ID: <' + cid + '>');
  },
);

it('the dispatch endpoint rejects unauthorized requests before accessing storage or mail', async () => {
  const status = vi.fn();
  const res = { status, setHeader: vi.fn(), json: vi.fn() };
  status.mockReturnValue(res);
  const req = {
    method: 'POST',
    query: { action: 'dispatch' },
    headers: { authorization: 'Bearer invalid' },
  };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  expect(status).toHaveBeenCalledWith(401);
});
