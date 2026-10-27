// This module reuses the pure URL validator; it does not import server credentials or API handlers.
import { safeMediaURL } from '../../api/_lib/douyin';

export interface DownloadMedia {
  url: string;
  type: 'video' | 'image';
  fallbackUrls?: string[];
}

export async function downloadPublicMedia(
  item: DownloadMedia,
  signal: AbortSignal,
  onAttempt?: (index: number) => void,
  fetcher: typeof fetch = fetch,
  onProgress?: (received: number, total: number | null) => void,
): Promise<{ blob: Blob; extension: string }> {
  const first = safeMediaURL(item.url);
  if (!first) throw new Error('媒体地址无效，请重新解析。');
  const candidates = [
    ...new Set(
      [first, ...(Array.isArray(item.fallbackUrls) ? item.fallbackUrls.slice(0, 2) : [])]
        .filter((url): url is string => typeof url === 'string')
        .map(safeMediaURL)
        .filter((url): url is string => Boolean(url)),
    ),
  ].slice(0, 2);
  const limit = 200 * 1024 * 1024;
  let failure: unknown = new Error('媒体直链已失效或平台拒绝下载，请重新解析。');
  for (let index = 0; index < candidates.length; index++) {
    if (signal.aborted) throw new DOMException('下载已取消', 'AbortError');
    onAttempt?.(index);
    let response: Response;
    try {
      response = await fetcher(candidates[index], {
        signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (error) {
      if (signal.aborted) throw error;
      failure = error;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      continue;
    }
    if (response.url && !safeMediaURL(response.url)) {
      await response.body?.cancel().catch(() => {});
      throw new Error('媒体跳转到不受支持的地址，已停止下载。');
    }
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
    if (!(item.type === 'video' ? type.startsWith('video/') : type.startsWith('image/'))) {
      await response.body?.cancel().catch(() => {});
      throw new Error('平台返回的不是可确认的媒体文件，已停止下载。');
    }
    const expected = Number(response.headers.get('content-length'));
    const range = response.headers.get('content-range');
    const fullRange = range ? /^bytes 0-(\d+)\/(\d+)$/.exec(range) : null;
    if (
      (response.status === 206 || range) &&
      (!fullRange || Number(fullRange[1]) + 1 !== Number(fullRange[2]))
    ) {
      await response.body?.cancel().catch(() => {});
      throw new Error('平台未返回可确认的完整媒体，未保存不完整文件。');
    }
    if (expected > limit) {
      await response.body?.cancel().catch(() => {});
      throw new Error('媒体超过 200 MB 浏览器下载上限。');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('浏览器无法读取媒体内容。');
    const chunks: Uint8Array[] = [];
    let size = 0;
    let lastProgress = Date.now();
    let reportedSize = 0;
    const total = Number.isFinite(expected) && expected > 0 ? expected : null;
    onProgress?.(0, total);
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) throw new Error('媒体超过 200 MB 浏览器下载上限。');
        chunks.push(chunk.value);
        if (!reportedSize || Date.now() - lastProgress >= 150) {
          onProgress?.(size, total);
          reportedSize = size;
          lastProgress = Date.now();
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (!size) throw new Error('平台返回了空媒体文件，请重新解析。');
    if (signal.aborted) throw new DOMException('下载已取消', 'AbortError');
    if (expected > 0 && size !== expected)
      throw new Error('媒体传输不完整，未保存文件。请重新下载。');
    if (range) {
      if (
        !fullRange ||
        Number(fullRange[1]) + 1 !== Number(fullRange[2]) ||
        size !== Number(fullRange[2])
      )
        throw new Error('平台只返回了部分媒体，未保存不完整文件。');
    }
    const extension =
      type === 'image/webp'
        ? 'webp'
        : type === 'image/png'
          ? 'png'
          : type === 'image/jpeg'
            ? 'jpg'
            : type === 'video/webm'
              ? 'webm'
              : 'mp4';
    if (size !== reportedSize) onProgress?.(size, total);
    return { blob: new Blob(chunks, { type }), extension };
  }
  throw failure;
}
