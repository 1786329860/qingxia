import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const primary = 'https://v1.douyinvod.com/fixture-main.webm';
const backup = 'https://v2.douyinvod.com/fixture-backup.webm';
const share = 'https://v.douyin.com/local-fixture/';

async function mockResolve(page: Page) {
  await page.route('**/api/resolve', (route) => {
    expect(route.request().postDataJSON()).toEqual({ url: share });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        title: '本地测试视频',
        author: '测试作者',
        kind: 'video',
        cover: null,
        experimental: true,
        notice: '直链可能过期。',
        items: [{ url: primary, type: 'video', fallbackUrls: [backup] }],
      }),
    });
  });
  await page.goto('/tool/douyin');
  await page
    .getByRole('textbox', { name: /抖音分享链接/ })
    .fill(`本地测试文案不能上传 ${share} 复制后观看`);
  await page.getByRole('button', { name: '解析链接', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本地测试视频', exact: true })).toBeVisible();
}

test('媒体主地址网络失败后直接尝试同作品备用地址，下载内容可解码', async ({ page }) => {
  await page.goto('/');
  const bytes = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      const context = canvas.getContext('2d')!;
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks: Blob[] = [];
      let paint: ReturnType<typeof setInterval> | undefined;
      let guard: ReturnType<typeof setTimeout> | undefined;
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          guard = setTimeout(() => reject(new Error('Fixture encoder produced no frames')), 8000);
          recorder.onerror = () => reject(new Error('Fixture encoding failed'));
          recorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
            // Cold encoders can take longer than a fixed recording duration to emit frames.
            if (chunks.length >= 3 && recorder.state === 'recording') recorder.stop();
          };
          recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
          recorder.start(100);
          let frames = 0;
          paint = setInterval(() => {
            context.fillStyle = frames++ % 2 ? '#b5e8ad' : '#163d30';
            context.fillRect(0, 0, 64, 48);
          }, 100);
        });
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      } finally {
        clearInterval(paint);
        clearTimeout(guard);
        if (recorder.state !== 'inactive') recorder.stop();
        stream.getTracks().forEach((track) => track.stop());
      }
    }),
  );
  let mainCalls = 0,
    backupCalls = 0;
  await page.route(primary, async (route) => {
    mainCalls++;
    await route.abort('failed');
  });
  await page.route(backup, async (route) => {
    backupCalls++;
    await route.fulfill({
      body: bytes,
      headers: {
        'Content-Type': 'video/webm',
        'Content-Length': `${bytes.length}`,
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  });
  await mockResolve(page);
  await expect(page.locator('link[rel="preconnect"][href="https://v1.douyinvod.com"]')).toHaveCount(
    1,
  );
  await expect(page.locator('link[rel="preconnect"][href="https://v2.douyinvod.com"]')).toHaveCount(
    1,
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载视频', exact: true }).click();
  const download = await pending;
  const downloaded = await readFile((await download.path())!);
  expect(downloaded.equals(bytes)).toBe(true);
  expect(download.suggestedFilename()).toMatch(/\.webm$/);
  expect(mainCalls).toBe(1);
  expect(backupCalls).toBe(1);
  const dimensions = await page.evaluate(async (data) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/webm' }));
    const video = document.createElement('video');
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('decode failed'));
        video.src = url;
      });
      return [video.videoWidth, video.videoHeight];
    } finally {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  }, Array.from(downloaded));
  expect(dimensions).toEqual([64, 48]);
  await expect(page.getByRole('status')).toContainText('下载已发起');
  await expect(page.getByText(/实验性工具/)).toBeVisible();
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await expect(page.locator('link[rel="preconnect"][href*="douyinvod.com"]')).toHaveCount(0);
});

test('下载进度只随真实接收字节变化，并适配桌面与移动主题', async ({ page }) => {
  await page.addInitScript(
    ({ primary }) => {
      const original = window.fetch;
      const control = window as unknown as { finishMedia: () => void };
      window.fetch = async (input, init) => {
        if (String(input) !== primary) return original(input, init);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            control.finishMedia = () => {
              controller.enqueue(new Uint8Array([3, 4, 5, 6, 7, 8]));
              controller.close();
            };
          },
        });
        return new Response(body, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '8' },
        });
      };
    },
    { primary },
  );
  await mockResolve(page);
  await page.getByRole('button', { name: '下载视频', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  for (const [width, theme] of [
    [1440, 'dark'],
    [390, 'light'],
    [320, 'dark'],
  ] as const) {
    await page.setViewportSize({ width, height: 960 });
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      animations: 'disabled',
      path: `${process.env.QINGXIA_SCREENSHOT_DIR || 'test-results'}/douyin-progress-${width}-${theme}.png`,
      fullPage: true,
    });
  }
  const pending = page.waitForEvent('download');
  await page.evaluate(() => (window as unknown as { finishMedia: () => void }).finishMedia());
  const download = await pending;
  expect((await readFile((await download.path())!)).length).toBe(8);
  await expect(page.getByRole('status')).toContainText('下载已发起');
});

test('取消下载不启动备用请求，不保存部分文件且允许重新解析', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: () => void = () => {};
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let backups = 0,
    downloads = 0;
  page.on('download', () => downloads++);
  await page.route(primary, async (route) => {
    started();
    await gate;
    await route.abort().catch(() => {});
  });
  await page.route(backup, async (route) => {
    backups++;
    await route.abort();
  });
  await mockResolve(page);
  await page.getByRole('button', { name: '下载视频', exact: true }).click();
  await requestStarted;
  await page.getByRole('button', { name: '取消下载', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('未保存不完整文件');
  release();
  expect(downloads).toBe(0);
  expect(backups).toBe(0);
  await expect(page.getByRole('button', { name: '解析链接', exact: true })).toBeEnabled();
});
