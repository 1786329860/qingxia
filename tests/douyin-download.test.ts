import { describe, expect, it, vi } from 'vitest';
import { downloadPublicMedia } from '../src/lib/douyin-download';

const main = 'https://v1.douyinvod.com/main.mp4';
const backup = 'https://v2.douyinvod.com/backup.mp4';
const item = { url: main, type: 'video' as const, fallbackUrls: [backup] };
const signal = () => new AbortController().signal;
const video = () =>
  new Response(new Uint8Array([0, 0, 0, 12, 102, 116, 121, 112]), {
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': '8' },
  });

describe('direct public media download', () => {
  it('uses only bounded original media alternatives and omits credentials/referrer', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(video());
    const attempts: number[] = [];
    const result = await downloadPublicMedia(
      item,
      signal(),
      (index) => attempts.push(index),
      fetcher,
    );
    expect(attempts).toEqual([0, 1]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([main, backup]);
    expect(
      fetcher.mock.calls.every(
        ([, options]) =>
          options?.credentials === 'omit' && options?.referrerPolicy === 'no-referrer',
      ),
    ).toBe(true);
    expect(result.extension).toBe('mp4');
    expect(result.blob.size).toBe(8);
  });
  it('releases a failed HTTP body and tries its legitimate backup', async () => {
    const response = new Response('expired', { status: 403 });
    const cancel = vi.spyOn(response.body!, 'cancel');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(video());
    await downloadPublicMedia(item, signal(), undefined, fetcher);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not retry a user cancellation', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async () => {
      controller.abort('user');
      throw new DOMException('cancelled', 'AbortError');
    });
    await expect(
      downloadPublicMedia(item, controller.signal, undefined, fetcher),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('rejects non-media, empty and partial responses without treating them as successful files', async () => {
    for (const response of [
      new Response('<html>restricted</html>', { headers: { 'Content-Type': 'text/html' } }),
      new Response(new Uint8Array(), { headers: { 'Content-Type': 'video/mp4' } }),
      new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-1/100' },
      }),
      new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': '2' },
      }),
      new Response(new Uint8Array([1, 2]), {
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': '100' },
      }),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(downloadPublicMedia(item, signal(), undefined, fetcher)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
  it('enforces the size ceiling before reading and never uses arbitrary addresses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('large', {
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': `${201 * 1024 * 1024}` },
      }),
    );
    await expect(downloadPublicMedia(item, signal(), undefined, fetcher)).rejects.toThrow('200 MB');
    expect(fetcher).toHaveBeenCalledOnce();
    fetcher.mockClear();
    await expect(
      downloadPublicMedia(
        { ...item, url: 'https://127.0.0.1/private' },
        signal(),
        undefined,
        fetcher,
      ),
    ).rejects.toThrow('媒体地址无效');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts a 206 only when its exposed range proves the whole file was transferred', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': 'bytes 0-1/2',
          'Content-Length': '2',
        },
      }),
    );
    expect((await downloadPublicMedia(item, signal(), undefined, fetcher)).blob.size).toBe(2);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('reports received bytes from the actual response, without inventing an unknown total', async () => {
    for (const known of [true, false]) {
      const progress = vi.fn();
      const headers: Record<string, string> = { 'Content-Type': 'video/mp4' };
      if (known) headers['Content-Length'] = '3';
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers }));
      const result = await downloadPublicMedia(item, signal(), undefined, fetcher, progress);
      expect(progress.mock.calls).toEqual([
        [0, known ? 3 : null],
        [3, known ? 3 : null],
      ]);
      expect(result.blob.size).toBe(3);
    }
  });
  it('filters unsafe alternatives, deduplicates and shares one abort signal', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network'));
    await expect(
      downloadPublicMedia(
        { ...item, fallbackUrls: ['https://evil.example/file', main, backup] },
        controller.signal,
        undefined,
        fetcher,
      ),
    ).rejects.toThrow();
    // At most two advertised fallbacks are considered, and neither allows a new valid request here.
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([main]);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});
