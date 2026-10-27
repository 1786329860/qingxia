export interface ResolvedMedia {
  title: string;
  author: string;
  cover: string | null;
  kind: 'video' | 'images';
  items: { url: string; type: 'video' | 'image' }[];
}
export type ResolveStage = 'input' | 'redirect' | 'page' | 'metadata';
export class DouyinResolveError extends Error {
  constructor(
    readonly code: string,
    readonly stage: ResolveStage,
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = 'DouyinResolveError';
  }
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
  if (!found)
    throw new DouyinResolveError(
      'INVALID_SHARE_URL',
      'input',
      '请粘贴有效的抖音 HTTPS 分享链接，支持分享文案中包含链接。',
      400,
    );
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
    throw new DouyinResolveError(
      'INVALID_SHARE_URL',
      'input',
      '仅支持抖音官方 HTTPS 分享链接。',
      400,
    );
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
function hydrationSources(html: string): string[] {
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
  return scripts;
}
function parsedHydration(html: string): unknown[] {
  const values: unknown[] = [];
  for (const source of hydrationSources(html)) {
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
        values.push(JSON.parse(attempt));
        break;
      } catch {
        /* next supported hydration block */
      }
    }
  }
  return values;
}
export function parseDouyinHTML(html: string, expectedID?: string): ResolvedMedia | null {
  for (const value of parsedHydration(html)) {
    const found = findItem(value, expectedID);
    if (found) return found;
  }
  return null;
}
export function unresolvedPageError(html: string, expectedID?: string): DouyinResolveError {
  const visible = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  if (/验证码|完成安全验证|安全校验|安全验证|captcha|verify you are human/i.test(visible))
    return new DouyinResolveError(
      'PLATFORM_CHALLENGE',
      'page',
      '平台要求安全验证，本站不会绕过登录或验证码。请在抖音官方页面确认内容是否公开。',
    );
  if (/请先登录|登录后(?:才可|才能|方可)?(?:查看|访问|继续)|仅限登录用户/.test(visible))
    return new DouyinResolveError(
      'PLATFORM_LOGIN_REQUIRED',
      'page',
      '平台要求登录后查看，本站不会使用登录凭据或绕过访问限制。',
    );
  if (
    /作品(?:已|已经)?删除|内容(?:已|已经)?删除|作品不存在|内容不存在|该(?:作品|视频)不可见/.test(
      visible,
    )
  )
    return new DouyinResolveError(
      'CONTENT_UNAVAILABLE',
      'page',
      '分享内容不存在、已删除或不可见，请在抖音官方页面确认。',
      404,
    );
  if (!hydrationSources(html).length)
    return new DouyinResolveError(
      'PUBLIC_DATA_UNAVAILABLE',
      'page',
      '公开页面未包含可读取的作品数据，可能依赖浏览器脚本或受到访问限制。本站不会运行验证脚本或绕过登录和验证码。',
    );
  if (!expectedID)
    return new DouyinResolveError(
      'SHARE_ITEM_REQUIRED',
      'metadata',
      '分享页未提供可确认的作品编号，无法安全区分分享内容和推荐作品。请使用具体作品的原始分享链接。',
    );
  const data = parsedHydration(html);
  if (!data.length)
    return new DouyinResolveError(
      'PAGE_FORMAT_UNSUPPORTED',
      'metadata',
      '公开页面的数据格式暂不支持，未取得可确认的媒体信息。请稍后重试。',
    );
  const queue = [...data];
  let visited = 0;
  while (queue.length && visited++ < 15000) {
    const value = queue.shift();
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    const id = item.aweme_id ?? item.awemeId ?? item.item_id ?? item.itemId;
    if ((typeof id === 'string' || typeof id === 'number') && String(id) === expectedID)
      return new DouyinResolveError(
        'MEDIA_UNAVAILABLE',
        'metadata',
        '已定位分享作品，但公开页面没有提供本站可用的媒体直链，无法开始下载。',
      );
    for (const child of Object.values(value))
      if (child && typeof child === 'object') queue.push(child);
  }
  return new DouyinResolveError(
    'SHARED_ITEM_UNAVAILABLE',
    'metadata',
    '公开页面没有目标分享作品的数据。为避免误取推荐内容，本次不返回其他作品。',
  );
}
export async function fetchSharePage(initial: URL, fetcher: typeof fetch = fetch) {
  let url = initial;
  const deadline = Date.now() + 18000;
  try {
    for (let hop = 0; hop < 5; hop++) {
      assertShareURL(url);
      const remaining = deadline - Date.now();
      if (remaining < 1000)
        throw new DouyinResolveError('PLATFORM_TIMEOUT', 'page', '平台响应超时，请稍后再试。', 504);
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
        if (!location)
          throw new DouyinResolveError('INVALID_REDIRECT', 'redirect', '分享链接跳转无效。', 502);
        try {
          const next = new URL(location, url);
          assertShareURL(next);
          url = next;
        } catch {
          throw new DouyinResolveError(
            'UNSUPPORTED_REDIRECT',
            'redirect',
            '分享链接跳转到不受支持的地址，仅支持抖音官方 HTTPS 分享链接。',
            502,
          );
        }
        continue;
      }
      if (!response.ok) {
        void response.body?.cancel();
        if (response.status === 404 || response.status === 410)
          throw new DouyinResolveError(
            'CONTENT_UNAVAILABLE',
            'page',
            '分享内容不存在或已删除。',
            404,
          );
        if (response.status === 429)
          throw new DouyinResolveError(
            'PLATFORM_RATE_LIMITED',
            'page',
            '平台请求频率受限，请稍后再试。',
            429,
          );
        if ([401, 403, 451].includes(response.status))
          throw new DouyinResolveError(
            'PLATFORM_ACCESS_DENIED',
            'page',
            '平台暂未允许读取该分享内容，请稍后再试。',
            502,
          );
        throw new DouyinResolveError(
          'PLATFORM_HTTP_ERROR',
          'page',
          '平台服务暂时返回异常，未取得作品页面，请稍后再试。',
          502,
        );
      }
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('text/html')) {
        void response.body?.cancel();
        throw new DouyinResolveError(
          'PLATFORM_NON_HTML',
          'page',
          '平台未返回可解析的公开页面。',
          502,
        );
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new DouyinResolveError('PLATFORM_EMPTY', 'page', '平台返回了空内容。', 502);
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 4_000_000)
            throw new DouyinResolveError(
              'PLATFORM_PAGE_TOO_LARGE',
              'page',
              '平台页面超过安全解析大小限制。',
              502,
            );
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      if (!bytes) throw new DouyinResolveError('PLATFORM_EMPTY', 'page', '平台返回了空内容。', 502);
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }
      return { html: new TextDecoder().decode(buffer), url };
    }
    throw new DouyinResolveError(
      'REDIRECT_LIMIT',
      'redirect',
      '分享链接跳转次数过多，请使用作品原始分享链接。',
      502,
    );
  } catch (error) {
    if (error instanceof DouyinResolveError) throw error;
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
      throw new DouyinResolveError('PLATFORM_TIMEOUT', 'page', '平台响应超时，请稍后再试。', 504);
    throw new DouyinResolveError(
      'PLATFORM_NETWORK_ERROR',
      'page',
      '读取平台页面时发生网络错误，请稍后再试。',
      502,
    );
  }
}
