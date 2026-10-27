import type { ResolvedMedia } from './douyin.js';

export type ResolveCacheStatus = 'miss' | 'hit' | 'coalesced';
export class DouyinCacheBusyError extends Error {
  constructor() {
    super('解析服务繁忙，请稍后重试。');
    this.name = 'DouyinCacheBusyError';
  }
}
interface CacheOptions<T> {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
  lifetime?: (value: T, now: number) => number;
}
type Entry<T> =
  { state: 'pending'; promise: Promise<T> } | { state: 'ready'; value: T; until: number };

// Instance-local only. Pending work shares the same capacity limit as ready results.
export function createDouyinCache<T>(options: CacheOptions<T> = {}) {
  const ttlMs = Number.isFinite(options.ttlMs)
    ? Math.max(0, Math.min(options.ttlMs!, 30_000))
    : 30_000;
  const maxEntries = Number.isFinite(options.maxEntries)
    ? Math.max(1, Math.min(Math.floor(options.maxEntries!), 50))
    : 50;
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, Entry<T>>();
  function prune() {
    const timestamp = now();
    for (const [key, entry] of entries)
      if (entry.state === 'ready' && entry.until <= timestamp) entries.delete(key);
  }
  return {
    async resolve(
      key: string,
      loader: () => Promise<T>,
    ): Promise<{ value: T; status: ResolveCacheStatus }> {
      prune();
      const previous = entries.get(key);
      if (previous?.state === 'ready')
        return { value: structuredClone(previous.value), status: 'hit' };
      if (previous?.state === 'pending')
        return { value: structuredClone(await previous.promise), status: 'coalesced' };
      if (entries.size >= maxEntries) {
        const oldestReady = [...entries].find(([, entry]) => entry.state === 'ready');
        if (oldestReady) entries.delete(oldestReady[0]);
        else throw new DouyinCacheBusyError();
      }
      let pending: Entry<T>;
      const promise = Promise.resolve()
        .then(loader)
        .then((value) => {
          if (entries.get(key) !== pending) return value;
          const timestamp = now();
          const lifetime = options.lifetime ? options.lifetime(value, timestamp) : ttlMs;
          const safeLifetime = Number.isFinite(lifetime)
            ? Math.max(0, Math.min(lifetime, ttlMs))
            : 0;
          if (safeLifetime > 0)
            entries.set(key, {
              state: 'ready',
              value: structuredClone(value),
              until: timestamp + safeLifetime,
            });
          else entries.delete(key);
          return value;
        })
        .catch((error: unknown) => {
          if (entries.get(key) === pending) entries.delete(key);
          throw error;
        });
      pending = { state: 'pending', promise };
      entries.set(key, pending);
      return { value: structuredClone(await promise), status: 'miss' };
    },
    clear() {
      entries.clear();
    },
    get size() {
      prune();
      return entries.size;
    },
  };
}

// Only these explicit absolute-expiry fields are interpreted. Other signature fields
// remain opaque, and no URL is rewritten. Leave five seconds for the browser to start.
export function publicMediaCacheLifetime(value: ResolvedMedia, now: number): number {
  let lifetime = 30_000;
  for (const item of value.items) {
    for (const address of [item.url, ...(item.fallbackUrls ?? [])]) {
      let url: URL;
      try {
        url = new URL(address);
      } catch {
        return 0;
      }
      for (const [key, expiration] of url.searchParams) {
        if (!['expire', 'expires'].includes(key.toLowerCase())) continue;
        if (!/^(?:\d{10}|\d{13})$/.test(expiration)) return 0;
        const epoch = Number(expiration) * (expiration.length === 10 ? 1000 : 1);
        if (!Number.isSafeInteger(epoch)) return 0;
        lifetime = Math.min(lifetime, epoch - now - 5000);
      }
    }
  }
  return Math.max(0, lifetime);
}

export const douyinResolveCache = createDouyinCache<ResolvedMedia>({
  lifetime: publicMediaCacheLifetime,
});
