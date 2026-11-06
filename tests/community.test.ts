import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decodeGif } from '../api/_lib/gif';
import { verifiedMember } from '../api/_lib/member';
import handler from '../api/community';

const uid = '92a82f7c-15ed-498a-a328-8bf3d3ae87dd';
const other = '2b786005-412d-4855-871d-97005149208d';
const id = '10b20cbc-3996-4561-89c9-797e1113516e';
const gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

describe('community database boundary', () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean default false);
      create table auth.audit_log_entries (created_at timestamptz, payload jsonb);
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
    `);
    for (const file of ['001_analytics.sql', '20261106111716_member_community.sql'])
      await pg.exec(await readFile('supabase/migrations/' + file, 'utf8'));
  });
  afterAll(async () => {
    await pg?.close();
  });

  it('blocks direct client reads, mutations and privileged functions', async () => {
    for (const role of ['anon', 'authenticated']) {
      await pg.exec('set role ' + role);
      try {
        for (const table of ['qingxia_notes', 'qingxia_gifs', 'qingxia_member_days'])
          await expect(pg.exec('select * from public.' + table)).rejects.toThrow(
            /permission denied/,
          );
        await expect(
          pg.exec(`select public.qingxia_member_stats(now() - interval '1 day', now())`),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await pg.exec('reset role');
      }
    }
  });
  it('deduplicates active members and only counts verified accounts and actual login events', async () => {
    await pg.exec(`
      insert into auth.users values ('${uid}', now(), false), ('${other}', null, false);
      insert into auth.audit_log_entries values (now(), '{"action":"login"}'), (now(), '{"action":"token_refreshed"}');
      set role service_role;
      select public.qingxia_member_activity('${uid}');
      select public.qingxia_member_activity('${uid}');
    `);
    try {
      const { rows } = await pg.query(
        `select public.qingxia_member_stats(now() - interval '1 day', now() + interval '1 day') as stats`,
      );
      expect(rows[0]).toEqual({
        stats: { registered: 1, newRegistrations: 1, logins: 1, active: 1 },
      });
      const bucket = await pg.query(
        `select count(*)::int as count from public.qingxia_member_days`,
      );
      expect(bucket.rows[0]).toEqual({ count: 1 });
    } finally {
      await pg.exec('reset role');
    }
  });
});

function request(method: string, query: Record<string, string>, body?: object) {
  return {
    method,
    query,
    body,
    headers: {
      authorization: 'Bearer test-member',
      origin: 'https://qingxia.example',
      host: 'qingxia.example',
      'content-type': 'application/json',
    },
  } as unknown as VercelRequest;
}
function response() {
  const res = { status: vi.fn(), setHeader: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as VercelResponse;
}

describe('community API permissions', () => {
  it('rejects fake, unverified and anonymous users', async () => {
    const req = request('GET', { kind: 'notes' });
    for (const user of [
      null,
      { id: uid },
      { id: uid, email_confirmed_at: 'today', is_anonymous: true },
    ]) {
      const client = { auth: { getUser: async () => ({ data: { user }, error: null }) } };
      expect(await verifiedMember(req, client as never)).toBeNull();
    }
  });
  it('rejects admin requests with only a user token before touching the DB', async () => {
    for (const [method, kind] of [
      ['GET', 'notes'],
      ['PATCH', 'notes'],
      ['DELETE', 'gifs'],
      ['POST', 'gifs'],
    ]) {
      const res = response();
      await handler(request(method, { kind, manage: '1', id }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });
  it('derives note ownership from Auth, ignores forged author IDs, and refuses cross-user deletion', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const eq = vi.fn();
    const select = vi.fn(async () => ({ data: [], error: null }));
    const deletion = { eq, select };
    eq.mockReturnValue(deletion);
    const mock = {
      auth: {
        getUser: async () => ({
          data: { user: { id: uid, email_confirmed_at: 'today' } },
          error: null,
        }),
      },
      from: () => ({ insert, delete: () => deletion }),
      rpc: async () => ({ data: true, error: null }),
    };
    const core = await import('../api/_lib/core');
    const stub = vi.spyOn(core, 'db').mockReturnValue(mock as never);
    try {
      const post = response();
      await handler(
        request(
          'POST',
          { kind: 'notes' },
          { name: '昵称', content: '建议', author_id: other, reply: '伪造回复' },
        ),
        post,
      );
      expect(post.status).toHaveBeenCalledWith(201);
      expect(insert).toHaveBeenCalledWith({
        author_id: uid,
        display_name: '昵称',
        content: '建议',
      });
      const del = response();
      await handler(request('DELETE', { kind: 'notes', id }), del);
      expect(eq.mock.calls).toEqual([
        ['id', id],
        ['author_id', uid],
      ]);
      expect(del.status).toHaveBeenCalledWith(404);
      const reply = response();
      await handler(request('PATCH', { kind: 'notes', id }, { reply: '伪造' }), reply);
      expect(reply.status).toHaveBeenCalledWith(405);
    } finally {
      stub.mockRestore();
    }
  });
});

describe('GIF validation', () => {
  it('accepts an actual GIF and rejects truncation, oversized dimensions and appended payloads', () => {
    const file = Buffer.from(gif, 'base64');
    expect(decodeGif(gif)).toEqual(file);
    expect(decodeGif(file.subarray(0, -1).toString('base64'))).toBeNull();
    expect(decodeGif(Buffer.concat([file, Buffer.from('<script>')]).toString('base64'))).toBeNull();
    file.writeUInt16LE(20000, 6);
    expect(decodeGif(file.toString('base64'))).toBeNull();
  });
});
