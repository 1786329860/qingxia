import { expect, test, vi } from 'vitest';
import { parseSunoSong, resolveSunoSong } from '../api/_lib/suno';
import { extractSunoShare } from '../src/lib/suno-links';

const id = '7c8c0fc9-1db5-4e99-9ccc-9257b9747554';
const video = `https://cdn1.suno.ai/${id}.mp4`;
const audio = `https://cdn2.suno.ai/${id}.mp3`;
const embed = (fields: object) =>
  `<script>self.__next_f.push([1,${JSON.stringify(
    '11:' +
      JSON.stringify({ id, entity_type: 'song_schema', title: '歌曲「示例」{"测试"}', ...fields }) +
      '\n',
  )}])</script>`;

test('只发清理后的分享 URL，保留歌曲访问所需的分享码', () => {
  expect(
    extractSunoShare(`试听 https://www.suno.com/song/${id}?sh=Safe1234&tracking=private。`)?.href,
  ).toBe(`https://suno.com/song/${id}?sh=Safe1234`);
  expect(extractSunoShare('https://suno.com.evil.test/s/Safe1234')).toBeNull();
  expect(extractSunoShare('https://suno.com@evil.test/s/Safe1234')).toBeNull();
});

test('优先返回同一首歌的音频，保留公开视频作为备用', () => {
  expect(parseSunoSong(embed({ audio_url: audio, video_url: video }), id)).toEqual({
    id,
    title: '歌曲「示例」{"测试"}',
    sources: [
      { url: audio, kind: 'mp3' },
      { url: video, kind: 'mp4' },
    ],
  });
  expect(
    parseSunoSong(
      embed({ audio_url: 'https://studio-api.prod.suno.com/api/forbidden', video_url: video }),
      id,
    ).sources,
  ).toEqual([{ url: video, kind: 'mp4' }]);
});

test('作品标题不在媒体对象中时使用页面标题并去掉作者后缀', () => {
  const page =
    '<title>Sun &amp; Moon by The Artist | Suno</title>' +
    embed({ title: undefined, display_name: 'The Artist', video_url: video });
  expect(parseSunoSong(page, id).title).toBe('Sun & Moon');
});

test('不会把其他作品、加密播放地址或任意域名当成下载地址', () => {
  expect(() =>
    parseSunoSong(
      embed({
        audio_url: `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id}.m4a`,
        video_url: `https://cdn1.suno.ai/${id.replace('7c8c', '8a8a')}.mp4`,
      }),
      id,
    ),
  ).toThrow('没有可直接保存');
  expect(() =>
    parseSunoSong(embed({ video_url: video.replace('cdn1.suno.ai', 'evil.test') }), id),
  ).toThrow('没有可直接保存');
});

test('分享短链只跟随白名单作品路由，拒绝非 Suno 跳转', async () => {
  const start = new URL('https://suno.com/s/Safe1234');
  const allowed = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: `/song/${id}?sh=Safe1234&tracking=extra` },
      }),
    )
    .mockResolvedValueOnce(
      new Response(embed({ video_url: video }), { headers: { 'Content-Type': 'text/html' } }),
    );
  await expect(resolveSunoSong(start, allowed)).resolves.toMatchObject({ id });
  expect(allowed.mock.calls[1][0]).toEqual(new URL(`https://suno.com/song/${id}?sh=Safe1234`));
  const refused = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }),
    );
  await expect(resolveSunoSong(start, refused)).rejects.toThrow('无法打开');
  expect(refused).toHaveBeenCalledTimes(1);
});

test('分享页临时断线时自动重试一次', async () => {
  const url = new URL(`https://suno.com/song/${id}`);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('connection reset'))
    .mockResolvedValueOnce(
      new Response(embed({ video_url: video }), {
        headers: { 'Content-Type': 'text/html' },
      }),
    );
  await expect(resolveSunoSong(url, fetcher)).resolves.toMatchObject({ id });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
