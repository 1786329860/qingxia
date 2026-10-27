import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/resolve';
import {
  assertShareURL,
  DouyinResolveError,
  extractShareURL,
  fetchSharePage,
  parseDouyinHTML,
  resolveDouyinShare,
  safeMediaURL,
  shareItemID,
  unresolvedPageError,
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
// Synthetic version of the observed public SSR shape. No platform IDs or signed URLs.
function jingxuanItem(overrides: Record<string, unknown> = {}) {
  return {
    gid: '123',
    title: '精选公开作品测试夹具（不是平台实测结果）',
    video_id: 'synthetic-video-id',
    cover_image_url: 'https://p3.example.douyinpic.com/cover.jpeg',
    media_user: { screen_name: '测试作者' },
    video_model: JSON.stringify({
      status: 10,
      video_id: 'synthetic-video-id',
      video_duration: 80,
      video_list: [
        {
          video_meta: { codec_type: 'h265', vwidth: 1280, vheight: 720 },
          main_url: 'https://v3.example.douyinvod.com/h265.mp4',
        },
        {
          video_meta: { codec_type: 'h264', vwidth: 1280, vheight: 720 },
          main_url: 'https://v3.example.douyinvod.com/main/playwm/?opaque=unchanged',
          backup_url: 'https://v9.example.douyinvod.com/backup/playwm/?opaque=unchanged',
        },
      ],
    }),
    ...overrides,
  };
}
function jingxuanHTML(item: Record<string, unknown> = jingxuanItem()) {
  return `<script>window._SSR_DATA = ${JSON.stringify({
    data: {
      storeState: {
        detail: { videoData: { result: item } },
        'user-page': { videoList: { result: [jingxuanItem({ gid: '999' }), videoItem] } },
      },
    },
    context: {},
    renderLevel: 0,
  })};</script>`;
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

  it('reads only the exact public SSR detail and preserves one H264 variant with its original backup', () => {
    const result = parseDouyinHTML(jingxuanHTML(), '123');
    expect(result).toMatchObject({
      title: jingxuanItem().title,
      author: '测试作者',
      kind: 'video',
    });
    expect(result?.items).toEqual([
      {
        url: 'https://v9.example.douyinvod.com/backup/playwm/?opaque=unchanged',
        type: 'video',
        fallbackUrls: ['https://v3.example.douyinvod.com/main/playwm/?opaque=unchanged'],
      },
    ]);
    expect(parseDouyinHTML(jingxuanHTML(), '999')).toBeNull();
    expect(parseDouyinHTML(jingxuanHTML())).toBeNull();
    expect(parseDouyinHTML(jingxuanHTML(jingxuanItem({ gid: '456' })), '123')).toBeNull();
  });

  it('rejects invalid or mismatched SSR models, galleries and unsupported codecs', () => {
    const models = [
      'not JSON',
      ' '.repeat(512_001),
      JSON.stringify({ video_id: 'different-id', video_list: [] }),
      JSON.stringify({ video_id: 'synthetic-video-id', video_list: {} }),
      JSON.stringify({
        video_id: 'synthetic-video-id',
        video_list: [
          { video_meta: { codec_type: 'h265' }, main_url: videoItem.video.play_addr.url_list[1] },
        ],
      }),
    ];
    for (const video_model of models)
      expect(parseDouyinHTML(jingxuanHTML(jingxuanItem({ video_model })), '123')).toBeNull();
    expect(
      parseDouyinHTML(
        jingxuanHTML({
          gid: '123',
          images: [{ url_list: ['https://p3.example.douyinpic.com/a.jpg'] }],
        }),
        '123',
      ),
    ).toBeNull();
  });

  it('validates both SSR media URLs without decoding arbitrary strings or rewriting signatures', () => {
    const invalid = [
      'https://attacker.example/file.mp4',
      'https://douyinvod.com.attacker.example/file.mp4',
      'https://user:secret@v3.example.douyinvod.com/file.mp4',
      'http://v3.example.douyinvod.com/file.mp4',
      Buffer.from('https://v3.example.douyinvod.com/file.mp4').toString('base64'),
    ];
    for (const main_url of invalid) {
      const video_model = JSON.stringify({
        video_id: 'synthetic-video-id',
        video_list: [{ video_meta: { codec_type: 'h264' }, main_url, backup_url: main_url }],
      });
      expect(parseDouyinHTML(jingxuanHTML(jingxuanItem({ video_model })), '123')).toBeNull();
    }
    const video_model = JSON.stringify({
      video_id: 'synthetic-video-id',
      video_list: [
        {
          video_meta: { codec_type: 'h264' },
          main_url: videoItem.video.play_addr.url_list[1],
          backup_url: videoItem.video.play_addr.url_list[1],
        },
      ],
    });
    expect(parseDouyinHTML(jingxuanHTML(jingxuanItem({ video_model })), '123')?.items).toEqual([
      { url: 'https://v3.example.douyinvod.com/video.mp4?a=1&b=2', type: 'video' },
    ]);
  });
});

describe('public-page failure classification', () => {
  it('separates an explicit challenge, login gate and deleted work', () => {
    expect(unresolvedPageError('<h1>请完成安全验证</h1>', '123')).toMatchObject({
      code: 'PLATFORM_CHALLENGE',
      stage: 'page',
      status: 422,
    });
    expect(unresolvedPageError('<p>登录后才能查看</p>', '123')).toMatchObject({
      code: 'PLATFORM_LOGIN_REQUIRED',
      stage: 'page',
      status: 422,
    });
    expect(unresolvedPageError('<p>作品已删除</p>', '123')).toMatchObject({
      code: 'CONTENT_UNAVAILABLE',
      stage: 'page',
      status: 404,
    });
  });

  it('does not infer a challenge from unrelated script strings or a generic login button', () => {
    const error = unresolvedPageError(
      '<script>const label="验证码";</script><button>登录</button><div id="root"></div>',
      '123',
    );
    expect(error).toMatchObject({ code: 'PUBLIC_DATA_UNAVAILABLE', stage: 'page' });
    expect(error.message).toContain('公开页面未包含');
  });

  it('distinguishes malformed data, mismatched work and absent media', () => {
    expect(unresolvedPageError('<script id="RENDER_DATA">%BAD</script>', '123').code).toBe(
      'PAGE_FORMAT_UNSUPPORTED',
    );
    expect(
      unresolvedPageError(
        `<script id="RENDER_DATA">${JSON.stringify({ aweme_id: '999', video: videoItem.video })}</script>`,
        '123',
      ).code,
    ).toBe('SHARED_ITEM_UNAVAILABLE');
    expect(
      unresolvedPageError('<script id="RENDER_DATA">{"aweme_id":"123","video":{}}</script>', '123')
        .code,
    ).toBe('MEDIA_UNAVAILABLE');
    expect(
      unresolvedPageError(`<script id="RENDER_DATA">${JSON.stringify(videoItem)}</script>`).code,
    ).toBe('SHARE_ITEM_REQUIRED');
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
    expect(shareItemID(extractShareURL('https://jingxuan.douyin.com/m/video/123'))).toBe('123');
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
    'https://jingxuan.douyin.com.attacker.example/m/video/123',
    'https://other.douyin.com/m/video/123',
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
  afterEach(() => vi.restoreAllMocks());
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

  it('preserves typed upstream status and rejects timeout/network failures without exposing URLs', async () => {
    await expect(
      fetchSharePage(
        new URL('https://www.douyin.com/video/123'),
        mockFetch(async () => htmlResponse('gone', 410)),
      ),
    ).rejects.toMatchObject({ code: 'CONTENT_UNAVAILABLE', status: 404, stage: 'page' });
    await expect(
      fetchSharePage(
        new URL('https://www.douyin.com/video/123'),
        mockFetch(async () => htmlResponse('limited', 429)),
      ),
    ).rejects.toMatchObject({ code: 'PLATFORM_RATE_LIMITED', status: 429 });
    await expect(
      fetchSharePage(
        new URL('https://www.douyin.com/video/123'),
        mockFetch(async () => {
          throw new DOMException('sensitive URL must not be echoed', 'TimeoutError');
        }),
      ),
    ).rejects.toMatchObject({ code: 'PLATFORM_TIMEOUT', status: 504 });
    const failure = fetchSharePage(
      new URL('https://www.douyin.com/video/123'),
      mockFetch(async () => {
        throw new TypeError('https://sensitive.example/?token=DO_NOT_ECHO');
      }),
    );
    await expect(failure).rejects.toBeInstanceOf(DouyinResolveError);
    await expect(failure).rejects.toMatchObject({ code: 'PLATFORM_NETWORK_ERROR', status: 502 });
    await expect(failure).rejects.not.toThrow('DO_NOT_ECHO');
  });

  it('keeps access restrictions, upstream server errors and empty HTML distinct', async () => {
    const url = new URL('https://www.douyin.com/video/123');
    await expect(
      fetchSharePage(
        url,
        mockFetch(async () => htmlResponse('forbidden', 403)),
      ),
    ).rejects.toMatchObject({ code: 'PLATFORM_ACCESS_DENIED', status: 502 });
    await expect(
      fetchSharePage(
        url,
        mockFetch(async () => htmlResponse('unavailable', 503)),
      ),
    ).rejects.toMatchObject({ code: 'PLATFORM_HTTP_ERROR', status: 502 });
    await expect(
      fetchSharePage(
        url,
        mockFetch(async () => htmlResponse('')),
      ),
    ).rejects.toMatchObject({ code: 'PLATFORM_EMPTY', status: 502 });
  });
});

describe('bounded official public-detail resolution', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['not found', 404],
    ['gone', 410],
    ['<p>作品已删除</p>', 200],
  ])(
    'does not label the original work deleted when only the public alternate is unavailable: %s',
    async (html, status) => {
      const fetcher = mockFetch(async (input) =>
        String(input).includes('jingxuan.douyin.com')
          ? htmlResponse(html as string, status as number)
          : htmlResponse('<div>公开页面</div>'),
      );
      const failure = resolveDouyinShare(new URL('https://www.douyin.com/video/123'), fetcher);
      await expect(failure).rejects.toMatchObject({
        code: 'PUBLIC_DETAIL_UNAVAILABLE',
        stage: 'metadata',
        status: 422,
      });
      await expect(failure).rejects.toThrow('公开备用页面暂不可用');
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it.each([404, 410])(
    'preserves original-share deletion semantics for HTTP %s without an alternate request',
    async (status) => {
      const fetcher = mockFetch(async () => htmlResponse('missing original', status));
      await expect(
        resolveDouyinShare(new URL('https://www.douyin.com/video/123'), fetcher),
      ).rejects.toMatchObject({
        code: 'CONTENT_UNAVAILABLE',
        stage: 'page',
        status: 404,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('uses one public canonical fallback after a short link reveals a target but no media', async () => {
    const fetcher = mockFetch(async (input) => {
      if (String(input) === 'https://v.douyin.com/abc/')
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://www.iesdouyin.com/share/video/123/' },
        });
      if (String(input) === 'https://www.iesdouyin.com/share/video/123/')
        return htmlResponse(
          '<script>window._ROUTER_DATA={"loaderData":{"video_(id)/page":{"itemId":"123"}}};</script>',
        );
      expect(String(input)).toBe('https://jingxuan.douyin.com/m/video/123');
      return htmlResponse(jingxuanHTML());
    });
    expect(
      (await resolveDouyinShare(new URL('https://v.douyin.com/abc/'), fetcher)).items[0]
        .fallbackUrls,
    ).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of vi.mocked(fetcher).mock.calls)
      expect(init).toMatchObject({ credentials: 'omit', redirect: 'manual' });
  });

  it.each([
    ['<p>请先登录后查看</p>', 200, 'PLATFORM_LOGIN_REQUIRED'],
    ['<p>请完成安全验证</p>', 200, 'PLATFORM_CHALLENGE'],
    ['<p>作品已删除</p>', 200, 'CONTENT_UNAVAILABLE'],
    ['forbidden', 403, 'PLATFORM_ACCESS_DENIED'],
    ['limited', 429, 'PLATFORM_RATE_LIMITED'],
  ])(
    'does not seek another page around an explicit restriction: %s',
    async (html, status, code) => {
      const fetcher = mockFetch(async () => htmlResponse(html as string, status as number));
      await expect(
        resolveDouyinShare(new URL('https://www.douyin.com/video/123'), fetcher),
      ).rejects.toMatchObject({ code });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('does not accept exposed media when the same page explicitly requires verification', async () => {
    const fetcher = mockFetch(async () => htmlResponse(`<h1>请完成验证码</h1>${jingxuanHTML()}`));
    await expect(
      resolveDouyinShare(new URL('https://jingxuan.douyin.com/m/video/123'), fetcher),
    ).rejects.toMatchObject({ code: 'PLATFORM_CHALLENGE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://jingxuan.douyin.com/m/video/123',
    'https://www.douyin.com/note/123',
    'https://v.douyin.com/abc/',
  ])(
    'does not repeat a canonical page, convert galleries or guess an unknown target: %s',
    async (url) => {
      const fetcher = mockFetch(async () => htmlResponse('<div>公开页面</div>'));
      await expect(resolveDouyinShare(new URL(url), fetcher)).rejects.toBeInstanceOf(
        DouyinResolveError,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('never returns a different work following canonical redirects or SSR recommendations', async () => {
    const fetcher = mockFetch(async (input) =>
      String(input).includes('jingxuan')
        ? htmlResponse(jingxuanHTML(jingxuanItem({ gid: '999' })))
        : htmlResponse('<div>公开页面</div>'),
    );
    await expect(
      resolveDouyinShare(new URL('https://www.douyin.com/video/123'), fetcher),
    ).rejects.toMatchObject({ code: 'SHARED_ITEM_UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const redirected = mockFetch(async (input) =>
      String(input).endsWith('/123')
        ? new Response(null, { status: 302, headers: { Location: '/video/456' } })
        : htmlResponse(jingxuanHTML(jingxuanItem({ gid: '456' }))),
    );
    await expect(
      resolveDouyinShare(new URL('https://www.douyin.com/video/123'), redirected),
    ).rejects.toMatchObject({ code: 'SHARED_ITEM_UNAVAILABLE' });
    expect(redirected).toHaveBeenCalledTimes(2);
  });

  it('shares the 18 second deadline rather than resetting it for the second public host', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => new AbortController().signal);
    const fetcher = mockFetch(async (input) => {
      if (String(input).includes('jingxuan')) return htmlResponse(jingxuanHTML());
      now.mockReturnValue(12_000);
      return htmlResponse('<div>公开页面</div>');
    });
    await resolveDouyinShare(new URL('https://www.douyin.com/video/123'), fetcher);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([7000, 6000]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not start a fallback when the total deadline is exhausted', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const fetcher = mockFetch(async () => {
      now.mockReturnValue(18_000);
      return htmlResponse('<div>公开页面</div>');
    });
    await expect(
      resolveDouyinShare(new URL('https://www.douyin.com/video/123'), fetcher),
    ).rejects.toMatchObject({ code: 'PLATFORM_TIMEOUT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing five-request safety cap shared with the fallback and validates every redirect', async () => {
    let calls = 0;
    const fetcher = mockFetch(async () => {
      calls++;
      if (calls === 4) return htmlResponse('<div>公开页面</div>');
      return new Response(null, { status: 302, headers: { Location: '/video/123' } });
    });
    await expect(
      resolveDouyinShare(new URL('https://www.douyin.com/video/123'), fetcher),
    ).rejects.toMatchObject({ code: 'REDIRECT_LIMIT' });
    expect(fetcher).toHaveBeenCalledTimes(5);
    const unsafe = mockFetch(async (input) =>
      String(input).includes('jingxuan')
        ? new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/' } })
        : htmlResponse('<div>公开页面</div>'),
    );
    await expect(
      resolveDouyinShare(new URL('https://www.douyin.com/video/123'), unsafe),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_REDIRECT' });
    expect(unsafe).toHaveBeenCalledTimes(2);
  });
});

function request(body: unknown, origin = 'https://qingxia.example', ip = '198.51.100.19') {
  return {
    method: 'POST',
    body,
    headers: { origin, host: 'qingxia.example', 'content-type': 'application/json' },
    socket: { remoteAddress: ip },
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

  it('returns target-verified public SSR metadata and bounded alternate URLs without claiming a download succeeded', async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      if (String(input).includes('v.douyin.com/'))
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://www.iesdouyin.com/share/video/123/' },
        });
      return htmlResponse(
        String(input).includes('jingxuan.douyin.com') ? jingxuanHTML() : '<div>公开页面</div>',
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await handler(request({ url: 'https://v.douyin.com/abc/' }, undefined, '198.51.100.24'), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: true,
        kind: 'video',
        items: [
          expect.objectContaining({
            type: 'video',
            fallbackUrls: expect.arrayContaining([expect.stringContaining('douyinvod.com')]),
          }),
        ],
        notice: expect.stringContaining('跨域'),
      }),
    );
    const payload = vi.mocked(res.json).mock.calls[0][0];
    expect(payload).not.toHaveProperty('downloadSuccess');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([input]) => !String(input).includes('douyinvod.com'))).toBe(
      true,
    );
  });

  it('rejects profile/search links before fetching or selecting any recommended work', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await handler(
      request({ url: 'https://www.douyin.com/user/profile' }, undefined, '198.51.100.20'),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SHARE_ITEM_REQUIRED', stage: 'input' }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not use the first recommended work when a short link never reveals its target ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        htmlResponse(`<script id="RENDER_DATA">${JSON.stringify(videoItem)}</script>`),
      ),
    );
    const res = response();
    await handler(request({ url: 'https://v.douyin.com/abc/' }, undefined, '198.51.100.21'), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SHARE_ITEM_REQUIRED',
        stage: 'metadata',
        experimental: true,
      }),
    );
  });

  it('returns meaningful upstream failures instead of labeling a valid URL as bad input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse('gone', 404)),
    );
    const res = response();
    await handler(
      request({ url: 'https://www.douyin.com/video/123' }, undefined, '198.51.100.22'),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONTENT_UNAVAILABLE', stage: 'page' }),
    );
  });

  it('classifies a public JavaScript shell as missing public data, not a verified login or CAPTCHA failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        htmlResponse('<html><div id="root"></div><script src="/bundle.js"></script></html>'),
      ),
    );
    const res = response();
    await handler(
      request({ url: 'https://www.douyin.com/video/123' }, undefined, '198.51.100.23'),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PUBLIC_DATA_UNAVAILABLE', stage: 'page' }),
    );
  });
});
