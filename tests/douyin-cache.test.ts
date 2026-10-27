import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createDouyinCache,
  DouyinCacheBusyError,
  douyinResolveCache,
  publicMediaCacheLifetime,
} from '../api/_lib/douyin-cache';
import type { ResolvedMedia } from '../api/_lib/douyin';
import handler from '../api/resolve';
import { consumeRate } from '../api/_lib/core';

vi.mock('../api/_lib/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/_lib/core')>();
  return { ...original, db: vi.fn(() => ({})), consumeRate: vi.fn(async () => true) };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function media(query = ''): ResolvedMedia {
  return {
    title: '合成测试',
    author: '测试',
    cover: null,
    kind: 'video',
    items: [{ type: 'video', url: `https://v3.example.douyinvod.com/synthetic.mp4${query}` }],
  };
}

describe('bounded instance-local public metadata cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('caches only for 30 seconds, evicts expired results and returns independent values', async () => {
    const cache = createDouyinCache<ResolvedMedia>();
    const load = vi.fn(async () => media());
    const first = await cache.resolve('hash-a', load);
    first.value.title = 'must not poison shared metadata';
    expect((await cache.resolve('hash-a', load)).value.title).toBe('合成测试');
    expect((await cache.resolve('hash-a', load)).status).toBe('hit');
    vi.advanceTimersByTime(29_999);
    expect((await cache.resolve('hash-a', load)).status).toBe('hit');
    vi.advanceTimersByTime(1);
    expect(cache.size).toBe(0);
    expect((await cache.resolve('hash-a', load)).status).toBe('miss');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('coalesces the same pending link and never caches rejected work', async () => {
    const cache = createDouyinCache<ResolvedMedia>();
    const pending = deferred<ResolvedMedia>();
    const load = vi.fn(() => pending.promise);
    const first = cache.resolve('hash-a', load);
    const second = cache.resolve('hash-a', load);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
    pending.resolve(media());
    expect((await first).status).toBe('miss');
    expect((await second).status).toBe('coalesced');
    expect((await cache.resolve('hash-a', load)).status).toBe('hit');
    const failure = vi.fn(async () => {
      throw new Error('synthetic failure');
    });
    await expect(cache.resolve('hash-b', failure)).rejects.toThrow('synthetic failure');
    await expect(cache.resolve('hash-b', failure)).rejects.toThrow('synthetic failure');
    expect(failure).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(1);
  });

  it('caps ready plus pending entries at 50 and refuses more work when all slots are pending', async () => {
    const cache = createDouyinCache<ResolvedMedia>({ maxEntries: 1000 });
    const pending = Array.from({ length: 50 }, () => deferred<ResolvedMedia>());
    const work = pending.map((item, i) => cache.resolve(`hash-${i}`, () => item.promise));
    const extraLoader = vi.fn(async () => media());
    await expect(cache.resolve('overflow', extraLoader)).rejects.toBeInstanceOf(
      DouyinCacheBusyError,
    );
    expect(extraLoader).not.toHaveBeenCalled();
    expect(cache.size).toBe(50);
    pending.forEach((item) => item.resolve(media()));
    await Promise.all(work);
    await cache.resolve('replacement', extraLoader);
    expect(cache.size).toBe(50);
    expect(extraLoader).toHaveBeenCalledTimes(1);
  });

  it('evicts a ready result before pending work and clears only locally', async () => {
    const cache = createDouyinCache<ResolvedMedia>({ maxEntries: 2 });
    await cache.resolve('ready', async () => media());
    const pending = deferred<ResolvedMedia>();
    const work = cache.resolve('pending', () => pending.promise);
    await cache.resolve('replacement', async () => media());
    expect(cache.size).toBe(2);
    pending.resolve(media());
    await work;
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('shortens expiry-aware results or skips retention while still merging concurrent requests', async () => {
    const cache = createDouyinCache<ResolvedMedia>({ lifetime: publicMediaCacheLifetime });
    const seconds = Math.floor(Date.now() / 1000) + 10;
    const loader = vi.fn(async () => media(`?expires=${seconds}`));
    await cache.resolve('short', loader);
    vi.advanceTimersByTime(4999);
    expect((await cache.resolve('short', loader)).status).toBe('hit');
    vi.advanceTimersByTime(1);
    expect((await cache.resolve('short', loader)).status).toBe('miss');
    expect(cache.size).toBe(0);
    const immediate = deferred<ResolvedMedia>();
    const first = cache.resolve('expired', () => immediate.promise);
    const coalesced = cache.resolve('expired', () => Promise.resolve(media()));
    immediate.resolve(media('?expire=not-an-absolute-time'));
    expect((await first).status).toBe('miss');
    expect((await coalesced).status).toBe('coalesced');
    expect(cache.size).toBe(0);
  });

  it('interprets only explicit expire/expires epoch fields and preserves all addresses unchanged', () => {
    const now = Date.now();
    const value = media(`?Expires=${now + 12_000}&opaque=unchanged`);
    value.items[0].fallbackUrls = [
      `https://v9.example.douyinvod.com/synthetic.mp4?expire=${Math.floor(now / 1000) + 8}`,
    ];
    expect(publicMediaCacheLifetime(value, now)).toBe(3000);
    expect(value.items[0].url).toContain('opaque=unchanged');
    expect(publicMediaCacheLifetime(media('?e=1&signature=opaque'), now)).toBe(30_000);
    expect(publicMediaCacheLifetime(media('?expires=0'), now)).toBe(0);
    expect(publicMediaCacheLifetime(media(`?expire=${Math.floor(now / 1000) - 1}`), now)).toBe(0);
    expect(publicMediaCacheLifetime(media(`?expire=${now + 120_000}`), now)).toBe(30_000);
  });
});

function request(url = 'https://www.douyin.com/video/321') {
  return {
    method: 'POST',
    body: { url },
    headers: {
      origin: 'https://qingxia.example',
      host: 'qingxia.example',
      'content-type': 'application/json',
    },
    socket: { remoteAddress: '198.51.100.80' },
  } as unknown as VercelRequest;
}
function response() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as VercelResponse;
}
describe('resolve API cache integration', () => {
  beforeEach(() => {
    douyinResolveCache.clear();
    vi.mocked(consumeRate).mockResolvedValue(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it('normalizes and hashes the link, exposes safe Server-Timing and keeps rate limiting before hits', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          `<script id="RENDER_DATA">${JSON.stringify({ aweme_id: '321', desc: '合成测试', video: { play_addr: { url_list: [media().items[0].url] } } })}</script>`,
          { headers: { 'content-type': 'text/html' } },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const first = response();
    await handler(request('https://www.douyin.com/video/321#first-fragment'), first);
    expect(first.status).toHaveBeenCalledWith(200);
    expect(first.setHeader).toHaveBeenCalledWith(
      'Server-Timing',
      expect.stringMatching(/^douyin-cache;desc="miss", douyin-resolve;dur=\d+\.\d$/),
    );
    const second = response();
    await handler(request('https://www.douyin.com/video/321#different-fragment'), second);
    expect(second.status).toHaveBeenCalledWith(200);
    expect(second.setHeader).toHaveBeenCalledWith(
      'Server-Timing',
      expect.stringContaining('desc="hit"'),
    );
    expect(second.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(consumeRate).toHaveBeenCalledTimes(2);
    vi.mocked(consumeRate).mockResolvedValue(false);
    const limited = response();
    await handler(request(), limited);
    expect(limited.status).toHaveBeenCalledWith(429);
    expect(limited.setHeader).not.toHaveBeenCalledWith('Server-Timing', expect.anything());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
