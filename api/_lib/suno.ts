import { sunoMedia, sunoPageURL, sunoSongID, type SunoSong } from '../../src/lib/suno-links.js';

export class SunoResolveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function readSongObject(stream: string, id: string): Record<string, unknown> | null {
  const start = stream.toLowerCase().indexOf(`"id":"${id}","entity_type":"song_schema"`);
  if (start < 0) return null;
  let depth = 1;
  let string = false;
  for (let i = start; i < stream.length; i++) {
    const char = stream[i];
    if (string && char === '\\') {
      i++;
      continue;
    }
    if (char === '"') string = !string;
    if (!string && char === '{') depth++;
    if (!string && char === '}' && --depth === 0) {
      try {
        return JSON.parse('{' + stream.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const htmlEntities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

function htmlTitle(html: string, author: unknown) {
  const title = (html.match(/<title>([^<]{1,600})<\/title>/i)?.[1] || '')
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (whole, entity: string) => {
      const key = entity.toLowerCase();
      if (key.startsWith('#')) {
        const hex = key.startsWith('#x');
        const code = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      return htmlEntities[key] || whole;
    })
    .replace(/\s+\|\s+Suno$/i, '')
    .trim();
  const suffix = typeof author === 'string' && author ? ` by ${author}` : '';
  return suffix && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

export function parseSunoSong(html: string, id: string): SunoSong {
  const chunks = [];
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      chunks.push(JSON.parse(match[1]) as string);
    } catch {
      /* ignore malformed chunks */
    }
  }
  const song = readSongObject(chunks.join(''), id);
  if (!song) throw new SunoResolveError('这个链接无法读取歌曲，可能已失效或需要登录 Suno。', 422);
  const audio = sunoMedia(song.audio_url, id);
  const video = sunoMedia(song.video_url, id);
  const sources = [
    audio?.kind !== 'mp4' ? audio : null,
    video?.kind === 'mp4' ? video : null,
  ].filter((source): source is NonNullable<typeof source> => Boolean(source));
  if (!sources.length)
    throw new SunoResolveError('这首歌的分享页没有可直接保存的音频或带音轨的视频。', 422);
  const title =
    (typeof song.title === 'string' && song.title.trim()) || htmlTitle(html, song.display_name);
  return { id, title: title.slice(0, 120) || 'Suno 歌曲', sources };
}

export async function resolveSunoSong(initial: URL, fetcher = fetch): Promise<SunoSong> {
  for (const timeout of [8000, 11000]) {
    try {
      return await readSunoPage(initial, fetcher, AbortSignal.timeout(timeout));
    } catch (error) {
      const transient =
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === 'TimeoutError') ||
        (error instanceof SunoResolveError && error.status === 503);
      if (!transient) throw error;
    }
  }
  throw new SunoResolveError('读取 Suno 分享页超时或连接不稳定，请稍后重试。', 504);
}

async function readSunoPage(initial: URL, fetcher: typeof fetch, signal: AbortSignal) {
  let url = initial;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetcher(url, {
      redirect: 'manual',
      signal,
      headers: { Accept: 'text/html' },
    });
    if ([500, 502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      throw new SunoResolveError('Suno 分享页暂时无法访问。', 503);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      const next = location && sunoPageURL(new URL(location, url).href);
      if (!next) break;
      url = next;
      continue;
    }
    const id = sunoSongID(url);
    if (
      !response.ok ||
      !id ||
      !response.headers.get('content-type')?.includes('text/html') ||
      !response.body
    ) {
      await response.body?.cancel();
      break;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 3 * 1024 * 1024) throw new SunoResolveError('歌曲页面过大，暂时无法解析。', 422);
        html += decoder.decode(part.value, { stream: true });
      }
      return parseSunoSong(html + decoder.decode(), id);
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  throw new SunoResolveError('无法打开 Suno 分享页，请检查链接是否有效、是否可以公开访问。', 422);
}
