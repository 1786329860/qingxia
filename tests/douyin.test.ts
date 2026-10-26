import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/resolve';
import {
  assertShareURL,
  extractShareURL,
  fetchSharePage,
  parseDouyinHTML,
  safeMediaURL,
  shareItemID,
} from '../api/_lib/douyin';

const videoItem = {
  aweme_id: '123',
  desc: '公开视频测试夹具（不是平台实测结果）',
  author: { nickname: '测试作者' },
  video: {
    play_addr: {
      url_list: [
        'https://v.example.invalid/not-allowed.mp4',
        'https://v3.example.douyinvod.com/video.mp4?a=1&amp;b=2',
      ],
    },
    cover: { url_list: ['https://p3.example.douyinpic.com/cover.jpeg'] },
  },
};
function htmlResponse(html: string, status = 200) {
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
function mockFetch(
  implementation: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>,
) {
  return vi.fn(implementation) as unknown as typeof fetch;
}

describe('Douyin public hydration parsing', () => {
  it('reads URI-encoded RENDER_DATA with video and safe metadata URLs', () => {
    const data = { aweme: { detail: videoItem } };
    const html = `<html><script nonce="n" id="RENDER_DATA" type="application/json">${encodeURIComponent(JSON.stringify(data))}</script></html>`;
    const result = parseDouyinHTML(html);
    expect(result).toMatchObject({
      title: videoItem.desc,
      author: '测试作者',
      kind: 'video',
      cover: 'https://p3.example.douyinpic.com/cover.jpeg',
    });
    expect(result?.items).toEqual([
      { url: 'https://v3.example.douyinvod.com/video.mp4?a=1&b=2', type: 'video' },
    ]);
  });

  it('reads ROUTER_DATA assignment without being confused by braces or escaped quotes in strings', () => {
    const item = { ...videoItem, desc: '文字中的 } 与 {，以及 "引号" 和 \\ 路径' };
    const html = `<script>window._ROUTER_DATA = ${JSON.stringify({ loaderData: { 'video_(id)/page': { videoInfoRes: { item_list: [item] } } } })}; console.log('unrelated');</script>`;
    expect(parseDouyinHTML(html)?.title).toBe(item.desc);
  });

  it('reads image galleries and excludes unsupported external URLs', () => {
    const data = {
      item_list: [
        {
          desc: '图集',
          author: { nickname: '作者' },
          images: [
            { url_list: ['https://p3.example.douyinpic.com/one.webp'] },
            { url_list: ['https://attacker.example/two.jpg'] },
            { urlList: ['https://p9.example.byteimg.com/three.jpeg'] },
          ],
        },
      ],
    };
    const result = parseDouyinHTML(`<script id='SIGI_STATE'>${JSON.stringify(data)}</script>`);
    expect(result?.kind).toBe('images');
    expect(result?.items).toEqual([
      { url: 'https://p3.example.douyinpic.com/one.webp', type: 'image' },
      { url: 'https://p9.example.byteimg.com/three.jpeg', type: 'image' },
    ]);
  });

  it('supports mobile image_post_info galleries using display_image addresses', () => {
    const data = {
      item_list: [
        {
          desc: '移动端图集',
          image_post_info: {
            images: [
              { display_image: { url_list: ['https://p3.example.douyinpic.com/mobile.jpg'] } },
            ],
          },
        },
      ],
    };
    expect(
      parseDouyinHTML(`<script id="RENDER_DATA">${JSON.stringify(data)}</script>`)?.items,
    ).toEqual([{ url: 'https://p3.example.douyinpic.com/mobile.jpg', type: 'image' }]);
  });

  it('does not accept malformed hydration, captcha pages, or arbitrary URL strings', () => {
    expect(parseDouyinHTML('<script id="RENDER_DATA">%NOT_JSON</script>')).toBeNull();
    expect(parseDouyinHTML('<script>window._ROUTER_DATA={"unfinished":</script>')).toBeNull();
    expect(
      parseDouyinHTML(
        '<h1>请完成验证码</h1><a href="https://v3.example.douyinvod.com/a.mp4">media</a>',
      ),
    ).toBeNull();
    expect(
      parseDouyinHTML(
        '<script id="RENDER_DATA">{"video":{"play_addr":{"url_list":["https://evil.example/a.mp4"]}}}</script>',
      ),
    ).toBeNull();
  });

  it('selects the shared item rather than an unrelated recommended video', () => {
    const recommended = { ...videoItem, aweme_id: '999', desc: '不应返回的推荐作品' };
    const target = { ...videoItem, aweme_id: '123', desc: '用户实际分享的作品' };
    const html = `<script id="RENDER_DATA">${JSON.stringify({ recommended, target })}</script>`;
    expect(parseDouyinHTML(html, '123')?.title).toBe('用户实际分享的作品');
    expect(parseDouyinHTML(html, '456')).toBeNull();
  });
});

describe('share and media URL allowlists', () => {
  it('extracts the link from share copy and removes trailing punctuation / fragments', () => {
    expect(extractShareURL('分享给你 https://v.douyin.com/AbCd123/）！').href).toBe(
      'https://v.douyin.com/AbCd123/',
    );
    expect(extractShareURL('https://www.douyin.com/video/123?from=share#ignored').href).toBe(
      'https://www.douyin.com/video/123?from=share',
    );
  });

  it('handles quotation marks around pasted links', () => {
    expect(extractShareURL('分享链接：“https://v.douyin.com/AbCd123/”').href).toBe(
      'https://v.douyin.com/AbCd123/',
    );
  });

  it('recognizes canonical video / image-note paths and modal item IDs', () => {
    expect(shareItemID(new URL('https://www.iesdouyin.com/share/video/123/'))).toBe('123');
    expect(shareItemID(new URL('https://www.douyin.com/note/456'))).toBe('456');
    expect(shareItemID(new URL('https://www.douyin.com/?modal_id=789'))).toBe('789');
    expect(shareItemID(new URL('https://v.douyin.com/AbCd123/'))).toBeUndefined();
  });

  it.each([
    'http://v.douyin.com/a',
    'https://127.0.0.1/',
    'https://[::1]/',
    'https://localhost/',
    'https://v.douyin.com.evil.example/a',
    'https://evil.example/v.douyin.com/a',
    'https://user:pass@v.douyin.com/a',
    'https://v.douyin.com:8443/a',
  ])('rejects unsupported share target %s', (value) => {
    expect(() => assertShareURL(new URL(value))).toThrow();
    expect(() => extractShareURL(value)).toThrow();
  });

  it.each([
    'http://p3.douyinpic.com/a.jpg',
    'https://p3.douyinpic.com.evil.example/a.jpg',
    'https://127.0.0.1/a.jpg',
    'https://[::1]/a.jpg',
    'https://user@p3.douyinpic.com/a.jpg',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    'https://p3.douyinpic.com:8443/a.jpg',
  ])('rejects unsupported media target %s', (value) => {
    expect(safeMediaURL(value)).toBeNull();
  });
});

describe('bounded public-page retrieval', () => {
  it('follows same-platform redirects manually and returns the final URL', async () => {
    const fetcher = mockFetch(async (input) =>
      String(input) === 'https://v.douyin.com/abc/'
        ? new Response(null, {
            status: 302,
            headers: { Location: 'https://www.iesdouyin.com/share/video/123/' },
          })
        : htmlResponse('<html>public</html>'),
    );
    const result = await fetchSharePage(new URL('https://v.douyin.com/abc/'), fetcher);
    expect(result.html).toBe('<html>public</html>');
    expect(result.url.href).toBe('https://www.iesdouyin.com/share/video/123/');
    const calls = vi.mocked(fetcher).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it.each([
    'http://127.0.0.1/',
    'https://127.0.0.1/',
    'https://[::1]/',
    'https://evil.example/',
    'https://v.douyin.com.evil.example/',
    'https://user:pass@www.douyin.com/a',
    'https://www.douyin.com:8443/a',
  ])('blocks a redirected SSRF target before fetching it: %s', async (location) => {
    const fetcher = mockFetch(
      async () => new Response(null, { status: 302, headers: { Location: location } }),
    );
    await expect(fetchSharePage(new URL('https://v.douyin.com/abc/'), fetcher)).rejects.toThrow(
      '仅支持',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('limits redirect loops, non-HTML responses, missing locations and oversized pages', async () => {
    const loop = mockFetch(
      async () => new Response(null, { status: 302, headers: { Location: '/loop' } }),
    );
    await expect(fetchSharePage(new URL('https://www.douyin.com/start'), loop)).rejects.toThrow(
      '跳转次数过多',
    );
    expect(loop).toHaveBeenCalledTimes(5);
    await expect(
      fetchSharePage(
        new URL('https://www.douyin.com/start'),
        mockFetch(async () => new Response('binary', { headers: { 'Content-Type': 'video/mp4' } })),
      ),
    ).rejects.toThrow('公开页面');
    await expect(
      fetchSharePage(
        new URL('https://www.douyin.com/start'),
        mockFetch(async () => new Response(null, { status: 302 })),
      ),
    ).rejects.toThrow('跳转无效');
    await expect(
      fetchSharePage(
        new URL('https://www.douyin.com/start'),
        mockFetch(async () => htmlResponse('x'.repeat(4_000_001))),
      ),
    ).rejects.toThrow('安全解析大小');
  });

  it('reports deleted or restricted pages instead of manufacturing metadata', async () => {
    await expect(
      fetchSharePage(
        new URL('https://www.douyin.com/start'),
        mockFetch(async () => htmlResponse('missing', 404)),
      ),
    ).rejects.toThrow('不存在或已删除');
    await expect(
      fetchSharePage(
        new URL('https://www.douyin.com/start'),
        mockFetch(async () => htmlResponse('forbidden', 403)),
      ),
    ).rejects.toThrow('暂未允许');
  });
});

function request(body: unknown, origin = 'https://qingxia.example') {
  return {
    method: 'POST',
    body,
    headers: { origin, host: 'qingxia.example', 'content-type': 'application/json' },
    socket: { remoteAddress: '198.51.100.19' },
  } as unknown as VercelRequest;
}
function response() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as VercelResponse;
}

describe('resolve API safety and honest failure responses', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects off-site requests and invalid user URLs without network access', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const foreign = response();
    await handler(request({ url: 'https://v.douyin.com/abc/' }, 'https://evil.example'), foreign);
    expect(foreign.status).toHaveBeenCalledWith(403);
    const invalid = response();
    await handler(request({ url: 'https://127.0.0.1/' }), invalid);
    expect(invalid.status).toHaveBeenCalledWith(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a clear 422 when a valid public page contains no readable media', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse('<h1>请完成验证码</h1>')),
    );
    const res = response();
    await handler(request({ url: 'https://v.douyin.com/abc/' }), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('不会绕过登录或验证码') }),
    );
  });

  it('returns parser-supported metadata as experimental, without fetching or saving media', async () => {
    const fetcher = vi.fn(async () =>
      htmlResponse(
        `<script id="RENDER_DATA">${encodeURIComponent(JSON.stringify({ item_list: [videoItem] }))}</script>`,
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await handler(request({ url: 'https://www.douyin.com/video/123' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: true,
        kind: 'video',
        notice: expect.stringContaining('跨域'),
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
