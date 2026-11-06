export interface Note {
  id: string;
  display_name: string;
  content: string;
  reply: string | null;
  created_at: string;
  own: boolean;
}
export interface Sticker {
  id: string;
  title: string;
  created_at: string;
  published: boolean;
}
export interface NoteList {
  items: Note[];
  more: boolean;
}
export function stickerUrl(id: string, download = false) {
  return '/api/community?kind=gifs&id=' + encodeURIComponent(id) + (download ? '&download=1' : '');
}
export const stickerRequest =
  '表情包会不定期更新。如果你有想要的表情包，可以在留言墙告诉我，我有空时会帮忙制作哦～';

export async function communityRequest<T>(
  query: string,
  options: { method?: string; payload?: object; token?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.payload) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', 'Bearer ' + options.token);
  const response = await fetch('/api/community?' + query, {
    method: options.method,
    body: options.payload ? JSON.stringify(options.payload) : undefined,
    headers,
    signal: options.signal,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || '社区服务暂不可用，请稍后再试');
  return data as T;
}

export const communityDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: 'long',
  day: 'numeric',
});
