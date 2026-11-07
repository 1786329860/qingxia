import { sunoMedia, type SunoMedia } from './suno-links';

class IncompleteSunoMediaError extends Error {}

export async function readSunoMedia(
  source: SunoMedia,
  id: string,
  signal: AbortSignal,
  onProgress: (received: number, total: number) => void,
  onRetry: () => void,
  fetcher = fetch,
) {
  const media = sunoMedia(source.url, id);
  if (!media || media.kind !== source.kind) throw new Error('歌曲的媒体地址无效。');
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const idle = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resetIdle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => idle.abort(), 25_000);
    };
    resetIdle();
    try {
      return await readMediaAttempt(
        media,
        AbortSignal.any([signal, idle.signal]),
        fetcher,
        (received, total) => {
          resetIdle();
          onProgress(received, total);
        },
      );
    } catch (error) {
      signal.throwIfAborted();
      const interrupted =
        idle.signal.aborted ||
        error instanceof TypeError ||
        error instanceof IncompleteSunoMediaError;
      if (!interrupted) throw error;
      if (attempt) {
        if (idle.signal.aborted) throw new Error('Suno 媒体连接长时间没有收到数据，请稍后重试。');
        throw error;
      }
      onRetry();
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readMediaAttempt(
  media: SunoMedia,
  signal: AbortSignal,
  fetcher: typeof fetch,
  onProgress: (received: number, total: number) => void,
) {
  const response = await fetcher(media.url, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
  });
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const length = Number(response.headers.get('content-length'));
  const limit = 50 * 1024 * 1024;
  const expected =
    media.kind === 'mp4' ? 'video/mp4' : media.kind === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
  if (
    response.status !== 200 ||
    !response.body ||
    response.headers.has('content-range') ||
    type !== expected ||
    length > limit
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error('媒体无法完整读取，或文件超过 50 MB 上限。');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let last = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) throw new Error('文件超过 50 MB 上限。');
      chunks.push(next.value);
      if (Date.now() - last > 160) {
        onProgress(size, length);
        last = Date.now();
      }
    }
    signal.throwIfAborted();
    if (!size || (length > 0 && length !== size))
      throw new IncompleteSunoMediaError('媒体传输不完整，未保存文件。');
    const blob = new Blob(chunks, { type });
    const first = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const header = new TextDecoder().decode(first);
    const valid =
      media.kind === 'mp3'
        ? header.startsWith('ID3') || (first[0] === 0xff && (first[1] & 0xe0) === 0xe0)
        : header.slice(4, 8) === 'ftyp';
    if (!valid) throw new Error('媒体不是可播放的音频或视频，未保存文件。');
    onProgress(size, length);
    return blob;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
