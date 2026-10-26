export interface ResolvedMedia {
  title: string;
  author: string;
  cover: string | null;
  kind: 'video' | 'images';
  items: { url: string; type: 'video' | 'image' }[];
}
const shareHosts = new Set([
  'v.douyin.com',
  'www.douyin.com',
  'douyin.com',
  'www.iesdouyin.com',
  'iesdouyin.com',
]);
const mediaRoots = [
  'douyinvod.com',
  'douyinpic.com',
  'byteimg.com',
  'pstatp.com',
  'ibytedtos.com',
  'snssdk.com',
  'amemv.com',
  'douyin.com',
  'bytecdn.cn',
];
export function extractShareURL(input: string) {
  const found = input.match(/https:\/\/[^\s<>"'“”‘’「」【】]+/gi)?.find((value) => {
    try {
      return shareHosts.has(new URL(value).hostname);
    } catch {
      return false;
    }
  });
  if (!found) throw new Error('请粘贴有效的抖音 HTTPS 分享链接，支持分享文案中包含链接。');
  const clean = found.replace(/[，。！!）)；;]+$/g, '');
  const url = new URL(clean);
  assertShareURL(url);
  url.hash = '';
  return url;
}
export function assertShareURL(url: URL) {
  if (
    url.protocol !== 'https:' ||
    !shareHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new Error('仅支持抖音官方 HTTPS 分享链接。');
}
export function shareItemID(url: URL): string | undefined {
  assertShareURL(url);
  const path = url.pathname.match(/\/(?:video|note)\/(\d{1,32})(?:\/|$)/)?.[1];
  if (path) return path;
  for (const key of ['modal_id', 'aweme_id']) {
    const value = url.searchParams.get(key);
    if (value && /^\d{1,32}$/.test(value)) return value;
  }
  return undefined;
}
export function safeMediaURL(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value.replace(/&amp;/g, '&'));
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    )
      return null;
    if (!mediaRoots.some((root) => url.hostname === root || url.hostname.endsWith(`.${root}`)))
      return null;
    return url.href;
  } catch {
    return null;
  }
}
function firstURL(value: unknown): string | null {
  if (typeof value === 'string') return safeMediaURL(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstURL(item);
      if (url) return url;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of [
      'url_list',
      'urlList',
      'uri',
      'url',
      'download_url',
      'downloadUrl',
      'display_image',
      'displayImage',
      'origin_image',
      'original_image',
      'download_image',
    ]) {
      const url = firstURL(record[key]);
      if (url) return url;
    }
  }
  return null;
}
function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.slice(0, 300) : fallback;
}
function fromItem(item: Record<string, unknown>): ResolvedMedia | null {
  const video =
    item.video && typeof item.video === 'object' ? (item.video as Record<string, unknown>) : null;
  const images = Array.isArray(item.images)
    ? item.images
    : Array.isArray(
          item.image_post_info && typeof item.image_post_info === 'object'
            ? (item.image_post_info as Record<string, unknown>).images
            : null,
        )
      ? (item.image_post_info as { images: unknown[] }).images
      : [];
  const imageItems = images
    .map((image) => firstURL(image))
    .filter((url): url is string => !!url)
    .slice(0, 50);
  const videoURL = video
    ? firstURL(video.play_addr || video.playAddr || video.play_addr_h264 || video.download_addr)
    : null;
  if (!imageItems.length && !videoURL) return null;
  const author =
    item.author && typeof item.author === 'object' ? (item.author as Record<string, unknown>) : {};
  return {
    title: text(item.desc || item.title, '抖音分享内容'),
    author: text(author.nickname || author.name, '作者信息未提供'),
    cover: video
      ? firstURL(video.cover || video.origin_cover || video.dynamic_cover)
      : imageItems[0] || null,
    kind: imageItems.length ? 'images' : 'video',
    items: imageItems.length
      ? imageItems.map((url) => ({ url, type: 'image' as const }))
      : [{ url: videoURL!, type: 'video' }],
  };
}
function findItem(data: unknown, expectedID?: string): ResolvedMedia | null {
  const queue: unknown[] = [data];
  let visited = 0;
  while (queue.length && visited++ < 15000) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (!Array.isArray(node)) {
      const record = node as Record<string, unknown>;
      const id = record.aweme_id ?? record.awemeId ?? record.item_id ?? record.itemId;
      if (
        !expectedID ||
        ((typeof id === 'string' || typeof id === 'number') && String(id) === expectedID)
      ) {
        const found = fromItem(record);
        if (found) return found;
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return null;
}
function jsonObject(source: string, start: number) {
  let depth = 0,
    inString = false,
    escaped = false;
  for (let i = start; i < source.length && i < start + 4_000_000; i++) {
    const c = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}
export function parseDouyinHTML(html: string, expectedID?: string): ResolvedMedia | null {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*\bid=["'](?:RENDER_DATA|SIGI_STATE|__NEXT_DATA__)["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((m) => m[1]);
  for (const marker of [
    'window._ROUTER_DATA',
    'window.__INITIAL_STATE__',
    'window.__INIT_PROPS__',
  ]) {
    const at = html.indexOf(marker);
    if (at >= 0) {
      const start = html.indexOf('{', at + marker.length);
      if (start >= 0) {
        const value = jsonObject(html, start);
        if (value) scripts.push(value);
      }
    }
  }
  for (const source of scripts) {
    for (const attempt of [
      source,
      (() => {
        try {
          return decodeURIComponent(source);
        } catch {
          return '';
        }
      })(),
    ]) {
      try {
        const parsed = findItem(JSON.parse(attempt), expectedID);
        if (parsed) return parsed;
      } catch {
        /* next supported hydration block */
      }
    }
  }
  return null;
}
export async function fetchSharePage(initial: URL, fetcher: typeof fetch = fetch) {
  let url = initial;
  const deadline = Date.now() + 18000;
  for (let hop = 0; hop < 5; hop++) {
    assertShareURL(url);
    const remaining = deadline - Date.now();
    if (remaining < 1000) throw new Error('平台响应超时，请稍后再试。');
    const response = await fetcher(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(remaining, 7000)),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      void response.body?.cancel();
      if (!location) throw new Error('分享链接跳转无效。');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      void response.body?.cancel();
      throw new Error(
        response.status === 404
          ? '分享内容不存在或已删除。'
          : '平台暂未允许读取该分享内容，请稍后再试。',
      );
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      void response.body?.cancel();
      throw new Error('平台未返回可解析的公开页面。');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('平台返回了空内容。');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 4_000_000) throw new Error('平台页面超过安全解析大小限制。');
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    return { html: new TextDecoder().decode(buffer), url };
  }
  throw new Error('分享链接跳转次数过多，请使用作品原始分享链接。');
}
