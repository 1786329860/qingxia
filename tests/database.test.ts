import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
let postgres: PGlite;
beforeAll(async () => {
  postgres = new PGlite();
  await postgres.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  await postgres.exec(
    await readFile(new URL('../supabase/migrations/001_analytics.sql', import.meta.url), 'utf8'),
  );
}, 30000);
afterAll(async () => {
  await postgres?.close();
});
beforeEach(async () => {
  await postgres.exec(
    'reset role; truncate public.qingxia_events, public.qingxia_rate_buckets restart identity;',
  );
});
describe('统计迁移在真实 PostgreSQL WASM 引擎中运行', () => {
  it('迁移可重复执行且保留现有事件', async () => {
    await postgres.query(
      "insert into qingxia_events(event_type,visitor_hash,path) values('pageview',$1,'/')",
      ['a'.repeat(64)],
    );
    await postgres.exec(
      await readFile(new URL('../supabase/migrations/001_analytics.sql', import.meta.url), 'utf8'),
    );
    const result = await postgres.query<{ n: number }>(
      'select count(*)::int as n from qingxia_events',
    );
    expect(result.rows[0].n).toBe(1);
  });
  it('匿名和普通认证角色不能读取事件或调用统计函数', async () => {
    for (const role of ['anon', 'authenticated']) {
      await postgres.exec(`set role ${role}`);
      try {
        await expect(postgres.query('select * from public.qingxia_events')).rejects.toThrow(
          /permission denied/,
        );
        await expect(
          postgres.query("select public.qingxia_stats(now()-interval '1 day',now())"),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await postgres.exec('reset role');
      }
    }
  });
  it('服务端可写入且按北京时间计算PV、日UV、成功失败与工具比例基础数据', async () => {
    await postgres.exec('set role service_role');
    const a = 'a'.repeat(64),
      b = 'b'.repeat(64);
    for (const [time, visitor, type, tool, outcome] of [
      ['2026-10-25T15:50:00Z', a, 'pageview', null, null],
      ['2026-10-25T15:51:00Z', a, 'pageview', null, null],
      ['2026-10-25T16:05:00Z', b, 'pageview', null, null],
      ['2026-10-25T16:10:00Z', b, 'tool_use', 'json', 'success'],
      ['2026-10-25T16:11:00Z', b, 'tool_use', 'json', 'error'],
    ])
      await postgres.query(
        'insert into qingxia_events(created_at,visitor_hash,event_type,path,tool_id,outcome) values($1,$2,$3,$4,$5,$6)',
        [time, visitor, type, type === 'pageview' ? '/' : null, tool, outcome],
      );
    const result = await postgres.query<{
      data: {
        summary: { views: number; visitors: number; uses: number; success: number };
        daily: { day: string; visitors: number }[];
        hourly: { hour: string }[];
        tools: { id: string; uses: number; success: number; errors: number }[];
      };
    }>("select qingxia_stats('2026-10-24T16:00:00Z','2026-10-26T16:00:00Z') as data");
    const data = result.rows[0].data;
    expect(data.summary).toEqual({ views: 3, visitors: 2, uses: 2, success: 1 });
    expect(data.daily.map((d) => d.day)).toEqual(['2026-10-25', '2026-10-26']);
    expect(data.hourly.map((d) => d.hour)).toEqual(['2026-10-25 23:00', '2026-10-26 00:00']);
    expect(data.tools).toEqual([{ id: 'json', uses: 2, success: 1, errors: 1 }]);
  });
  it('数据库共享限流达到上限拒绝，窗口过期后恢复', async () => {
    await postgres.exec('set role service_role');
    const take = async () => {
      const response = await postgres.query<{ allowed: boolean }>(
        "select qingxia_rate_limit('hashed-network-id',2,60) as allowed",
      );
      return response.rows[0].allowed;
    };
    expect(await take()).toBe(true);
    expect(await take()).toBe(true);
    expect(await take()).toBe(false);
    await postgres.query("update qingxia_rate_buckets set expires_at=now()-interval '1 second'");
    expect(await take()).toBe(true);
  });
  it('90天清理保留近期数据并删除过期事件和限流记录', async () => {
    await postgres.exec(
      "insert into qingxia_events(created_at,event_type,visitor_hash,path) values(now()-interval '91 days','pageview',repeat('a',64),'/'),(now(),'pageview',repeat('b',64),'/'); insert into qingxia_rate_buckets values('expired',1,now()-interval '2 days'),('active',1,now()+interval '1 day'); set role service_role; select qingxia_cleanup();",
    );
    const events = await postgres.query<{ n: number }>(
      'select count(*)::int as n from qingxia_events',
    );
    const buckets = await postgres.query<{ key: string }>('select key from qingxia_rate_buckets');
    expect(events.rows[0].n).toBe(1);
    expect(buckets.rows).toEqual([{ key: 'active' }]);
  });
});
