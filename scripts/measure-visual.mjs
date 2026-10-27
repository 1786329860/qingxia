import { chromium } from '../node_modules/@playwright/test/index.mjs';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const baseURL = process.env.VISUAL_PROFILE_URL || 'http://127.0.0.1:5310';
const output = process.env.VISUAL_PROFILE_OUTPUT || 'test-results/visual-performance.json';
const label = process.env.VISUAL_PROFILE_LABEL || 'sample';
const contexts = Number(process.env.VISUAL_PROFILE_CONTEXTS || 3);
const rates = (process.env.VISUAL_PROFILE_CPU || '1,4').split(',').map(Number);
const screenshotDir = process.env.VISUAL_SCREENSHOT_DIR;
const snapshotOnly = process.env.VISUAL_SNAPSHOT_ONLY === '1';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    : undefined);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  ...(process.env.VISUAL_PROFILE_PROXY
    ? { proxy: { server: process.env.VISUAL_PROFILE_PROXY } }
    : {}),
});
const report = {
  label,
  baseURL,
  checkedAt: new Date().toISOString(),
  browser: await browser.version(),
  conditions: {
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    cpuRates: rates,
    samplesPerRate: contexts,
    network: baseURL.startsWith('http://127.0.0.1')
      ? 'loopback production preview; no network throttling'
      : 'remote through configured per-process proxy',
    proxyConfigured: !!process.env.VISUAL_PROFILE_PROXY,
    reducedMotion: 'no-preference',
    limitations:
      'LCP sampled before first input at a fixed 1200ms settling window; rAF intervals during scripted native scroll are a rendering scheduling proxy, not compositor FPS or real-user INP. Search response is dispatch-to-results-plus-next-frame, not browser INP. CPU throttling is a reproducible laboratory condition, not a real low-end phone.',
  },
  screenshots: [],
  samples: [],
};
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
};
try {
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
      [320, 844],
    ])
      for (const theme of ['dark', 'light']) {
        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 1,
          reducedMotion: 'no-preference',
        });
        await context.addInitScript((t) => localStorage.setItem('qingxia:theme', t), theme);
        const page = await context.newPage();
        for (const [route, name] of [
          ['/', 'home'],
          ['/tool/image-convert', 'image'],
          ['/admin', 'admin-demo'],
        ]) {
          const response = await page.goto(baseURL + route, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });
          if (name === 'home') {
            await page.locator('.hero-section h1').waitFor();
            await page.locator('.tool-card').first().waitFor();
          }
          if (name === 'image') {
            await page.locator('input[type="file"]').waitFor({ state: 'attached' });
            await page.locator('.image-tool').waitFor();
          }
          if (name === 'admin-demo') {
            await page
              .getByRole('button', { name: '预览统计界面（示例数据）', exact: true })
              .click();
            await page.locator('.stat-card').first().waitFor();
            if ((await page.getByText('正在展示示例数据', { exact: false }).count()) !== 1)
              throw Error('Admin screenshot must visibly identify demo');
          }
          if (label.startsWith('after') && name === 'home')
            await page.locator('.breathing-scene').waitFor();
          await page.waitForFunction(
            () => !document.querySelector('.page-loading, .scene-loading'),
          );
          const fonts = await page.evaluate(async () => {
            await document.fonts.ready;
            const headingFaces = [...document.fonts].filter((font) =>
              font.family.replaceAll(/["']/g, '').includes('Qingxia Song'),
            );
            if (headingFaces.length) {
              await document.fonts.load('500 36px "Qingxia Song"', '轻匣');
              await document.fonts.ready;
              if (!headingFaces.every((font) => font.status === 'loaded'))
                throw Error('Heading font must actually load before screenshot');
            }
            return headingFaces.map((font) => ({ family: font.family, status: font.status }));
          });
          await page.waitForTimeout(1200);
          const path = join(screenshotDir, `${label}-${name}-${width}-${theme}.png`);
          await page.screenshot({ path, fullPage: false });
          report.screenshots.push({
            route,
            width,
            height,
            theme,
            path,
            status: response.status(),
            demo: name === 'admin-demo',
            fonts,
            overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          });
        }
        await context.close();
      }
  }
  if (!snapshotOnly)
    for (const cpuRate of rates)
      for (let index = 0; index < contexts; index++) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          deviceScaleFactor: 1,
          reducedMotion: 'no-preference',
        });
        await context.addInitScript(() => {
          localStorage.setItem('qingxia:theme', 'dark');
          window.__visualMeasure = { lcp: 0, longTasks: [] };
          try {
            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) window.__visualMeasure.lcp = e.startTime;
            }).observe({ type: 'largest-contentful-paint', buffered: true });
          } catch {}
          try {
            new PerformanceObserver((list) => {
              for (const e of list.getEntries())
                window.__visualMeasure.longTasks.push({ start: e.startTime, duration: e.duration });
            }).observe({ type: 'longtask', buffered: true });
          } catch {}
        });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        if (cpuRate !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
        const errors = [],
          writes = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('request', (r) => {
          if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) {
            const body = r.postData() || '';
            let keys = [];
            try {
              keys = Object.keys(JSON.parse(body));
            } catch {}
            writes.push({
              path: new URL(r.url()).pathname,
              keys,
              inputPresent: /VISUAL_LOCAL_FILE|PRIVATE_VISUAL|data:image/.test(body),
            });
          }
        });
        await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.locator('.hero-section h1').waitFor();
        await page.getByRole('textbox', { name: '搜索工具', exact: true }).waitFor();
        await page.locator('.tool-card').first().waitFor();
        const readyMs = await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()))),
            ),
        );
        await page.waitForTimeout(1200);
        const firstScreen = await page.evaluate(() => {
          const resources = performance.getEntriesByType('resource');
          const nav = performance.getEntriesByType('navigation')[0];
          return {
            fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
            lcpMs: window.__visualMeasure.lcp || null,
            domContentLoadedMs: nav.domContentLoadedEventEnd,
            loadEventMs: nav.loadEventEnd,
            resources: resources.map((r) => ({
              path: new URL(r.name).pathname,
              transferBytes: r.transferSize,
              encodedBytes: r.encodedBodySize,
              decodedBytes: r.decodedBodySize,
            })),
            longTasks: window.__visualMeasure.longTasks,
          };
        });
        const deltas = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const list = [];
              let start, last;
              const extent = Math.max(0, document.documentElement.scrollHeight - innerHeight);
              const frame = (now) => {
                start ??= now;
                if (last) list.push(now - last);
                last = now;
                const p = Math.min(1, (now - start) / 4000);
                scrollTo({ top: extent * (p < 0.5 ? p * 2 : (1 - p) * 2), behavior: 'instant' });
                if (p < 1) requestAnimationFrame(frame);
                else resolve(list);
              };
              requestAnimationFrame(frame);
            }),
        );
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        const searchResponseMs = await page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              const el = document.querySelector('input[aria-label="搜索工具"]');
              const start = performance.now();
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
                el,
                'JSON',
              );
              el.dispatchEvent(new Event('input', { bubbles: true }));
              const observe = () => {
                const cards = [...document.querySelectorAll('.tool-card')];
                if (cards.length === 2 && cards.every((c) => c.textContent.includes('JSON'))) {
                  requestAnimationFrame(() => resolve(performance.now() - start));
                } else if (performance.now() - start > 5000)
                  reject(Error('Search results did not settle'));
                else requestAnimationFrame(observe);
              };
              observe();
            }),
        );
        const homeEngineRequests = firstScreen.resources.filter((r) =>
          /ffmpeg|avif_(enc|dec)|image-worker|pdf\.worker|\/standard_fonts\//.test(r.path),
        );
        await page.goto(baseURL + '/tool/image-convert', { waitUntil: 'domcontentloaded' });
        await page.locator('input[type="file"]').waitFor({ state: 'attached' });
        const png = await page.evaluate(() => {
          const c = document.createElement('canvas');
          c.width = 64;
          c.height = 48;
          const x = c.getContext('2d');
          x.fillStyle = '#9be775';
          x.fillRect(0, 0, 64, 48);
          x.clearRect(0, 0, 8, 8);
          return c.toDataURL('image/png').split(',')[1];
        });
        await page.locator('input[type="file"]').setInputFiles({
          name: 'VISUAL_LOCAL_FILE.png',
          mimeType: 'image/png',
          buffer: Buffer.from(png, 'base64'),
        });
        const started = performance.now();
        await page.getByLabel('输出格式').selectOption('avif');
        await page.getByRole('button', { name: '开始转换', exact: true }).click();
        const download = page.getByRole('button', { name: '下载 AVIF', exact: true });
        await download.waitFor({ timeout: 30000 });
        const avifReadyMs = performance.now() - started;
        const pending = page.waitForEvent('download');
        await download.click();
        const file = await pending;
        const bytes = await readFile(await file.path());
        const decoded = await page.evaluate(async (data) => {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(data)], { type: 'image/avif' }),
          );
          const c = new OffscreenCanvas(bitmap.width, bitmap.height);
          const x = c.getContext('2d');
          x.drawImage(bitmap, 0, 0);
          const result = {
            width: bitmap.width,
            height: bitmap.height,
            alpha: x.getImageData(1, 1, 1, 1).data[3],
          };
          bitmap.close();
          return result;
        }, Array.from(bytes));
        if (
          bytes.subarray(4, 8).toString('ascii') !== 'ftyp' ||
          decoded.width !== 64 ||
          decoded.height !== 48 ||
          decoded.alpha !== 0
        )
          throw Error('AVIF output failed actual container/decode verification');
        const sample = {
          cpuRate,
          index,
          readyMs,
          firstScreen,
          scroll: {
            samples: deltas.length,
            medianMs: percentile(deltas, 0.5),
            p95Ms: percentile(deltas, 0.95),
            maxMs: Math.max(...deltas),
            over50ms: deltas.filter((n) => n > 50).length,
            over50Ratio: deltas.filter((n) => n > 50).length / deltas.length,
          },
          searchResponseMs,
          avifReadyMs,
          avifDecoded: decoded,
          avifBytes: bytes.length,
          homepageTransferBytes: firstScreen.resources.reduce((n, r) => n + r.transferBytes, 0),
          homepageEncodedBytes: firstScreen.resources.reduce((n, r) => n + r.encodedBytes, 0),
          homeEngineRequests,
          errors,
          writes,
        };
        report.samples.push(sample);
        console.log(
          JSON.stringify({
            label,
            cpuRate,
            index,
            readyMs,
            fcp: firstScreen.fcpMs,
            lcp: firstScreen.lcpMs,
            scrollP95: sample.scroll.p95Ms,
            searchResponseMs,
            avifReadyMs,
            homeEngineRequests: homeEngineRequests.length,
          }),
        );
        await context.close();
      }
} finally {
  await browser.close();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
}
