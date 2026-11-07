const shortPath = /^\/s\/[a-z\d_-]{4,180}\/?$/i;
const songID = '[a-f\\d]{8}(?:-[a-f\\d]{4}){3}-[a-f\\d]{12}';
const songPath = new RegExp(`^/song/(${songID})/?$`, 'i');
const mediaPath = new RegExp(`^/(${songID})\\.(mp3|m4a|mp4)$`, 'i');

export function sunoPageURL(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      !['suno.com', 'www.suno.com'].includes(url.hostname) ||
      !(shortPath.test(url.pathname) || songPath.test(url.pathname))
    )
      return null;
    const clean = new URL(url.pathname.replace(/\/$/, ''), 'https://suno.com');
    const share = url.searchParams.get('sh');
    if (songPath.test(url.pathname) && share && /^[a-z\d_-]{4,180}$/i.test(share))
      clean.searchParams.set('sh', share);
    return clean;
  } catch {
    return null;
  }
}

export function extractSunoShare(text: string) {
  for (const link of text.match(/https:\/\/[^\s<>"'，。；！？、）】]+/gi) || []) {
    const url = sunoPageURL(link.replace(/[),.!;]+$/, ''));
    if (url) return url;
  }
  return null;
}

export function sunoSongID(url: URL) {
  return songPath.exec(url.pathname)?.[1].toLowerCase();
}

export function sunoMedia(value: unknown, id: string) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const match = mediaPath.exec(url.pathname);
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['cdn1.suno.ai', 'cdn2.suno.ai'].includes(url.hostname) ||
      !match ||
      match[1].toLowerCase() !== id.toLowerCase()
    )
      return null;
    const kind = match[2].toLowerCase() as 'mp3' | 'm4a' | 'mp4';
    return { url: url.href, kind };
  } catch {
    return null;
  }
}

export type SunoMedia = NonNullable<ReturnType<typeof sunoMedia>>;
export interface SunoSong {
  id: string;
  title: string;
  sources: SunoMedia[];
}
