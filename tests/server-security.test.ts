import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn(), from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: storage.rpc, from: storage.from })),
}));
import {
  body,
  createSession,
  isAdmin,
  rateKey,
  sameOrigin,
  validPassword,
  visitorHash,
} from '../api/_lib/core';
import admin from '../api/admin';
import events from '../api/events';

const TEST_SECRET = 'test-only-session-secret-with-at-least-32-characters';
const TEST_PASSWORD = 'test-only-unique-admin-password';
const TEST_SERVICE_KEY = 'test-only-service-role-key-never-real';
const VISITOR = '12345678-1234-4123-8123-123456789abc';
function request(options: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    query: {},
    body: {},
    socket: { remoteAddress: '192.0.2.1' },
    ...options,
    headers: {
      host: 'qingxia.example',
      origin: 'https://qingxia.example',
      'content-type': 'application/json',
      ...options.headers,
    },
  } as VercelRequest;
}
function response() {
  const result = {
    statusCode: 200,
    data: undefined as unknown,
    headers: {} as Record<string, string | number | readonly string[]>,
  };
  const res = {
    setHeader: (name: string, value: string | number | readonly string[]) => {
      result.headers[name.toLowerCase()] = value;
      return res;
    },
    status: (code: number) => {
      result.statusCode = code;
      return res;
    },
    json: (data: unknown) => {
      result.data = data;
      return res;
    },
    end: () => res,
  } as unknown as VercelResponse;
  return { res, result };
}
function signedPayload(payload: unknown) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', TEST_SECRET).update(encoded).digest('base64url')}`;
}
function withSession(session = createSession()) {
  return { cookie: `unrelated=value; qingxia_admin=${session}; another=value` };
}

beforeEach(() => {
  vi.stubEnv('ADMIN_SESSION_SECRET', TEST_SECRET);
  vi.stubEnv('ADMIN_PASSWORD', TEST_PASSWORD);
  vi.stubEnv('SUPABASE_URL', 'https://unit-test.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', TEST_SERVICE_KEY);
  storage.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  storage.insert.mockReset().mockResolvedValue({ error: null });
  storage.from.mockReset().mockReturnValue({ insert: storage.insert });
});
afterEach(() => vi.unstubAllEnvs());

describe('来源和请求体限制', () => {
  it('接受生产HTTPS同源请求，并允许localhost开发HTTP', () => {
    expect(sameOrigin(request())).toBe(true);
    expect(
      sameOrigin(request({ headers: { host: 'localhost:5173', origin: 'http://localhost:5173' } })),
    ).toBe(true);
    expect(
      sameOrigin(request({ headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' } })),
    ).toBe(true);
    expect(
      sameOrigin(
        request({ headers: { host: 'qingxia.example:443', origin: 'https://qingxia.example' } }),
      ),
    ).toBe(true);
  });
  it.each([
    'https://evil.example',
    'http://qingxia.example',
    'ftp://qingxia.example',
    'https://qingxia.example:444',
    'https://user:password@qingxia.example',
    'https://qingxia.example/path',
    'https://qingxia.example?x=1',
    'null',
    '',
  ])('拒绝异源、非HTTPS或非规范来源：%s', (origin) => {
    expect(sameOrigin(request({ headers: { origin } }))).toBe(false);
  });
  it('拒绝来源缺失和伪装localhost的域名', () => {
    expect(sameOrigin(request({ headers: { origin: undefined } }))).toBe(false);
    expect(
      sameOrigin(
        request({
          headers: { host: 'localhost.evil.example', origin: 'http://localhost.evil.example' },
        }),
      ),
    ).toBe(false);
  });
  it('只接受小型JSON对象，不接受数组、表单、损坏JSON或超长内容', () => {
    expect(body(request({ body: '{"password":"example"}' }))).toEqual({ password: 'example' });
    expect(body(request({ body: { password: 'example' } }))).toEqual({ password: 'example' });
    expect(body(request({ body: ['example'] }))).toEqual({});
    expect(body(request({ body: '{not-json' }))).toEqual({});
    expect(
      body(
        request({
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: { password: 'example' },
        }),
      ),
    ).toEqual({});
    expect(body(request({ body: { extra: '文'.repeat(2000) } }))).toEqual({});
  });
});

describe('管理员会话和密码', () => {
  it('有效签名cookie通过认证，且token不包含原始密码或服务密钥', () => {
    const token = createSession();
    expect(isAdmin(request({ headers: withSession(token) }))).toBe(true);
    expect(token).not.toContain(TEST_PASSWORD);
    expect(token).not.toContain(TEST_SERVICE_KEY);
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(Object.keys(payload).sort()).toEqual(['exp', 'nonce']);
  });
  it('拒绝签名篡改、载荷篡改、附加字段及无cookie', () => {
    const token = createSession();
    const [payload, signature] = token.split('.');
    const tampered = `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    expect(isAdmin(request({ headers: withSession(tampered) }))).toBe(false);
    expect(isAdmin(request({ headers: withSession(`${payload}A.${signature}`) }))).toBe(false);
    expect(isAdmin(request({ headers: withSession(`${token}.extra`) }))).toBe(false);
    expect(isAdmin(request())).toBe(false);
  });
  it('会话在8小时后失效，并拒绝超长有效期及签名正确的畸形载荷', () => {
    const now = Date.UTC(2026, 9, 26, 1);
    const token = createSession(now);
    expect(isAdmin(request({ headers: withSession(token) }), now + 8 * 3600000 - 1)).toBe(true);
    expect(isAdmin(request({ headers: withSession(token) }), now + 8 * 3600000)).toBe(false);
    expect(
      isAdmin(
        request({ headers: withSession(signedPayload({ exp: now / 1000 + 9 * 3600 })) }),
        now,
      ),
    ).toBe(false);
    expect(
      isAdmin(request({ headers: withSession(signedPayload({ exp: 'tomorrow' })) }), now),
    ).toBe(false);
    expect(isAdmin(request({ headers: withSession(signedPayload('not-an-object')) }), now)).toBe(
      false,
    );
  });
  it('密钥过短时不能创建或验证会话，轮换密钥会让旧会话失效', () => {
    const token = createSession();
    vi.stubEnv('ADMIN_SESSION_SECRET', 'short');
    expect(() => createSession()).toThrow();
    expect(isAdmin(request({ headers: withSession(token) }))).toBe(false);
    vi.stubEnv('ADMIN_SESSION_SECRET', `${TEST_SECRET}-rotated`);
    expect(isAdmin(request({ headers: withSession(token) }))).toBe(false);
  });
  it('密码精确验证，短配置和超长输入均不能通过', () => {
    expect(validPassword(TEST_PASSWORD)).toBe(true);
    expect(validPassword(`${TEST_PASSWORD}x`)).toBe(false);
    expect(validPassword('x'.repeat(257))).toBe(false);
    expect(validPassword('')).toBe(false);
    vi.stubEnv('ADMIN_PASSWORD', 'too-short');
    expect(validPassword('too-short')).toBe(false);
  });
  it('登录成功cookie采用HttpOnly、Secure、Strict和仅API路径', async () => {
    const { res, result } = response();
    await admin(request({ body: { password: TEST_PASSWORD } }), res);
    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual({ ok: true });
    const cookie = String(result.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api');
    expect(cookie).toContain('Max-Age=28800');
    expect(cookie).not.toContain(TEST_PASSWORD);
    expect(cookie).not.toContain(TEST_SERVICE_KEY);
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('错误密码拒绝登录，限流失败也不能绕过', async () => {
    const wrong = response();
    await admin(request({ body: { password: 'incorrect-password' } }), wrong.res);
    expect(wrong.result.statusCode).toBe(401);
    expect(wrong.result.headers['set-cookie']).toBeUndefined();
    storage.rpc.mockResolvedValue({ data: false, error: null });
    const limited = response();
    await admin(request({ body: { password: TEST_PASSWORD } }), limited.res);
    expect(limited.result.statusCode).toBe(429);
    expect(limited.result.headers['set-cookie']).toBeUndefined();
  });
  it('登录、退出拒绝异源来源；退出清空安全cookie', async () => {
    for (const method of ['POST', 'DELETE']) {
      const { res, result } = response();
      await admin(
        request({
          method,
          headers: { origin: 'https://evil.example' },
          body: { password: TEST_PASSWORD },
        }),
        res,
      );
      expect(result.statusCode).toBe(403);
    }
    const { res, result } = response();
    await admin(request({ method: 'DELETE' }), res);
    expect(result.statusCode).toBe(200);
    expect(result.headers['set-cookie']).toContain('Max-Age=0');
  });
  it('数据库异常返回通用503，不向客户端泄漏服务密钥或异常内容', async () => {
    storage.rpc.mockRejectedValue(new Error(`internal diagnostic ${TEST_SERVICE_KEY}`));
    const { res, result } = response();
    await admin(request({ body: { password: TEST_PASSWORD } }), res);
    expect(result.statusCode).toBe(503);
    expect(JSON.stringify(result.data)).not.toContain(TEST_SERVICE_KEY);
    expect(result.headers['set-cookie']).toBeUndefined();
  });
});

describe('统计读取权限和日期输入', () => {
  it('没有有效cookie不能读取任何统计', async () => {
    const { res, result } = response();
    await admin(request({ method: 'GET', query: { from: '2026-10-26', to: '2026-10-26' } }), res);
    expect(result.statusCode).toBe(401);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['2026-02-31', '2026-03-05'],
    ['2026-02-29', '2026-03-01'],
    ['2026-13-01', '2026-13-02'],
    ['2026-10-27', '2026-10-26'],
    ['2026-01-01', '2026-12-31'],
    ['0000-01-01', '0000-01-02'],
  ])('拒绝不存在、倒序或超长日期：%s到%s', async (from, to) => {
    const { res, result } = response();
    await admin(request({ method: 'GET', headers: withSession(), query: { from, to } }), res);
    expect(result.statusCode).toBe(400);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it('合法日期按北京时间转换，并只返回聚合RPC结果', async () => {
    const aggregate = {
      summary: { views: 3, visitors: 2, uses: 1, success: 1 },
      daily: [],
      hourly: [],
      tools: [],
    };
    storage.rpc.mockResolvedValue({ data: aggregate, error: null });
    const { res, result } = response();
    await admin(
      request({
        method: 'GET',
        headers: withSession(),
        query: { from: '2026-10-26', to: '2026-10-26' },
      }),
      res,
    );
    expect(storage.rpc).toHaveBeenCalledWith('qingxia_stats', {
      p_from: '2026-10-25T16:00:00.000Z',
      p_to: '2026-10-26T16:00:00.000Z',
    });
    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual({
      ...aggregate,
      from: '2026-10-26',
      to: '2026-10-26',
      timeZone: 'Asia/Shanghai',
    });
    expect(storage.from).not.toHaveBeenCalled();
  });
});

describe('匿名事件最小化和限流', () => {
  it('事件只保存白名单字段和每日散列，不保存正文、完整链接或原访客ID', async () => {
    const { res, result } = response();
    await events(
      request({
        body: {
          type: 'tool_use',
          tool: 'hash',
          outcome: 'success',
          visitor: VISITOR,
          file: 'private-file-bytes',
          url: 'https://media.example/private',
          text: 'private-text',
        },
      }),
      res,
    );
    expect(result.statusCode).toBe(204);
    expect(storage.from).toHaveBeenCalledWith('qingxia_events');
    const saved = storage.insert.mock.calls[0][0];
    expect(saved).toEqual({
      event_type: 'tool_use',
      visitor_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      tool_id: 'hash',
      outcome: 'success',
      path: null,
    });
    const savedText = JSON.stringify(saved);
    for (const value of [
      VISITOR,
      'private-file-bytes',
      'https://media.example/private',
      'private-text',
    ])
      expect(savedText).not.toContain(value);
  });
  it.each([
    { type: 'pageview', path: '/admin', visitor: VISITOR },
    { type: 'pageview', path: '/tool/hash?secret=private', visitor: VISITOR },
    { type: 'tool_use', tool: 'not-a-tool', outcome: 'success', visitor: VISITOR },
    { type: 'tool_use', tool: 'hash', outcome: 'unknown', visitor: VISITOR },
    { type: 'pageview', path: '/', visitor: '-'.repeat(36) },
    { type: 'pageview', path: '/', visitor: '12345678-1234-1123-8123-123456789abc' },
  ])('拒绝未登记工具、隐私路径、畸形访客或结果：%j', async (event) => {
    const { res, result } = response();
    await events(request({ body: event }), res);
    expect(result.statusCode).toBe(400);
    expect(storage.insert).not.toHaveBeenCalled();
  });
  it('异源、非POST、超出限流及存储故障均不能写入事件', async () => {
    const event = { type: 'pageview', path: '/', visitor: VISITOR };
    const cross = response();
    await events(request({ headers: { origin: 'https://evil.example' }, body: event }), cross.res);
    expect(cross.result.statusCode).toBe(403);
    const method = response();
    await events(request({ method: 'GET', body: event }), method.res);
    expect(method.result.statusCode).toBe(405);
    storage.rpc.mockResolvedValue({ data: false, error: null });
    const limited = response();
    await events(request({ body: event }), limited.res);
    expect(limited.result.statusCode).toBe(429);
    expect(storage.insert).not.toHaveBeenCalled();
    storage.rpc.mockResolvedValue({ data: null, error: { message: TEST_SERVICE_KEY } });
    const failure = response();
    await events(request({ body: event }), failure.res);
    expect(failure.result.statusCode).toBe(503);
    expect(JSON.stringify(failure.result.data)).not.toContain(TEST_SERVICE_KEY);
    expect(storage.insert).not.toHaveBeenCalled();
  });
  it('访客散列在北京时间午夜轮换，限流散列区分用途且不暴露IP', () => {
    const before = visitorHash(VISITOR, new Date('2026-10-26T15:59:59Z'));
    const after = visitorHash(VISITOR, new Date('2026-10-26T16:00:00Z'));
    expect(before).not.toBe(after);
    expect(before).not.toContain(VISITOR);
    const key = rateKey(request(), 'events');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain('192.0.2.1');
    expect(key).not.toBe(rateKey(request(), 'login'));
  });
});

describe('静态密钥边界和SQL授权合同', () => {
  it('前端源码不引用服务密钥或站长密码环境变量，也不导入后端core', () => {
    function inspect(path: string): string[] {
      return readdirSync(path, { withFileTypes: true }).flatMap((item) =>
        item.isDirectory()
          ? inspect(join(path, item.name))
          : /\.(tsx?|jsx?)$/.test(item.name)
            ? [readFileSync(join(path, item.name), 'utf8')]
            : [],
      );
    }
    const frontend = inspect(join(process.cwd(), 'src')).join('\n');
    expect(frontend).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|ADMIN_PASSWORD|ADMIN_SESSION_SECRET|api\/_lib\/core/,
    );
  });
  it('原始事件和限流表启用RLS，匿名/普通用户无表权限，统计RPC仅授予service_role', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/001_analytics.sql'),
      'utf8',
    ).toLowerCase();
    for (const table of ['qingxia_events', 'qingxia_rate_buckets']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated`);
    }
    expect(sql).not.toMatch(/create\s+policy/);
    expect(sql).not.toMatch(/security\s+definer/);
    expect(sql).toContain(
      'revoke all on function public.qingxia_stats(timestamptz,timestamptz) from public,anon,authenticated',
    );
    expect(sql).toContain(
      'grant execute on function public.qingxia_stats(timestamptz,timestamptz) to service_role',
    );
  });
});
