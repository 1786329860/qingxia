import { chromium } from '../node_modules/@playwright/test/index.mjs';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const output = process.env.AVIF_PROFILE_OUTPUT || 'test-results/avif-performance.json';
const origins = (
  process.env.AVIF_PROFILE_ORIGINS || 'https://qingxia.vercel.app,https://qingxia.aixiaolv.icu'
).split(',');
const coldContexts = Number(process.env.AVIF_PROFILE_CONTEXTS || 3);
const rounds = Number(process.env.AVIF_PROFILE_ROUNDS || 2);
const selectedLeadMs = Number(process.env.AVIF_PROFILE_LEAD_MS || 0);
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    (existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
      : undefined),
  headless: true,
});
const report = {
  startedAt: new Date().toISOString(),
  browser: await browser.version(),
  conditions:
    'Windows workstation existing system proxy; fresh isolated context for each cold sample; same tab and selected files for warm repeat; 64×48 synthetic RGBA PNG',
  selectedLeadMs,
  samples: [],
};
try {
  for (const origin of origins)
    for (let contextIndex = 0; contextIndex < coldContexts; contextIndex++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const resources = [],
        writes = [],
        errors = [],
        pending = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          const body = request.postData() || '';
          let keys = [];
          try {
            keys = Object.keys(JSON.parse(body));
          } catch {}
          writes.push({
            path: new URL(request.url()).pathname,
            keys,
            bytes: body.length,
            inputPresent: /LOCAL_AVIF_SAMPLE|data:image|INPUT_ONLY_RGBA/.test(body),
          });
        }
      });
      page.on('requestfinished', (request) => {
        if (!/image-worker|avif_|\/meta-/.test(request.url())) return;
        pending.push(
          (async () => {
            const response = await request.response();
            resources.push({
              path: new URL(request.url()).pathname,
              status: response?.status(),
              type: response?.headers()['content-type'],
              timing: request.timing(),
              contentLength: Number(response?.headers()['content-length']) || null,
            });
          })().catch((e) => errors.push(e.message)),
        );
      });
      await page.addInitScript(() => {
        window.__avifProfile = { workers: [], messages: [], measures: [] };
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          constructor(url, options) {
            super(url, options);
            window.__avifProfile.workers.push({
              at: performance.now(),
              path: String(url).split('/').pop(),
            });
            this.addEventListener('message', (event) => {
              const data = event.data || {};
              window.__avifProfile.messages.push({
                at: performance.now(),
                id: data.id,
                stage: data.stage,
                elapsedMs: data.elapsedMs,
                result: !!data.result,
                ready: !!data.ready,
                error: !!data.error,
              });
            });
          }
        };
      });
      const navigationAt = Date.now();
      await page.goto(origin + '/tool/image-convert', { waitUntil: 'domcontentloaded' });
      await page.getByLabel('输出格式').waitFor({ state: 'visible', timeout: 30000 });
      const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 48;
        const x = c.getContext('2d');
        x.fillStyle = '#a7f07a';
        x.fillRect(0, 0, 64, 48);
        x.clearRect(0, 0, 16, 16);
        return c.toDataURL('image/png').split(',')[1];
      });
      await page
        .locator('input[type=file]')
        .setInputFiles({
          name: 'LOCAL_AVIF_SAMPLE.png',
          mimeType: 'image/png',
          buffer: Buffer.from(png, 'base64'),
        });
      const selectedAt = await page.evaluate(() => performance.now());
      await page.getByLabel('输出格式').selectOption('avif');
      if (selectedLeadMs) await page.waitForTimeout(selectedLeadMs);
      for (let round = 0; round < rounds; round++) {
        const before = await page.evaluate(() => ({
          time: performance.now(),
          workers: window.__avifProfile.workers.length,
          messages: window.__avifProfile.messages.length,
        }));
        const responseCount = await page.evaluate(
          () => window.__avifProfile.messages.filter((x) => x.result).length,
        );
        await page.getByRole('button', { name: '开始转换', exact: true }).click();
        await page.waitForFunction(
          (expected) => window.__avifProfile.messages.filter((x) => x.result).length > expected,
          responseCount,
          { timeout: 60000 },
        );
        const downloadButton = page.getByRole('button', { name: '下载 AVIF', exact: true });
        await downloadButton.waitFor({ state: 'visible', timeout: 60000 });
        const done = await page.evaluate(() => ({
          time: performance.now(),
          timeOrigin: performance.timeOrigin,
          profile: window.__avifProfile,
        }));
        const pendingDownload = page.waitForEvent('download');
        await downloadButton.click();
        const download = await pendingDownload;
        const bytes = await readFile(await download.path());
        const decoded = await page.evaluate(
          async (buffer) => {
            const bitmap = await createImageBitmap(
              new Blob([new Uint8Array(buffer)], { type: 'image/avif' }),
            );
            const c = document.createElement('canvas');
            c.width = bitmap.width;
            c.height = bitmap.height;
            const x = c.getContext('2d');
            x.drawImage(bitmap, 0, 0);
            const alpha = x.getImageData(0, 0, 1, 1).data[3];
            const result = { width: bitmap.width, height: bitmap.height, cornerAlpha: alpha };
            bitmap.close();
            return result;
          },
          [...bytes],
        );
        await Promise.all(pending);
        const completed = done.profile.messages.filter((m) => m.result).at(-1);
        const messages = done.profile.messages.filter((m) => m.id === completed?.id);
        const decodedAt = messages.find((m) => m.stage === 'decoding')?.elapsedMs;
        const firstEncoding = messages.find((m) => m.stage === 'encoding')?.elapsedMs;
        const encodingAt = messages.filter((m) => m.stage === 'encoding').at(-1)?.elapsedMs;
        const prepareReady = done.profile.messages.find((m) => m.ready);
        const wasmEnds = resources
          .filter((r) => r.path.endsWith('.wasm') && r.timing.responseEnd >= 0)
          .map((r) => r.timing.startTime + r.timing.responseEnd);
        const phaseTimings = {
          workerStartupMs: done.profile.messages[0]?.at - done.profile.workers[0]?.at,
          preparationMs: prepareReady?.elapsedMs,
          decodeAndCanvasMs: firstEncoding - decodedAt,
          encodeAndReturnMs: completed?.elapsedMs - encodingAt,
          postTransferReadyUpperBoundMs:
            prepareReady && wasmEnds.length
              ? Math.max(0, done.timeOrigin + prepareReady.at - Math.max(...wasmEnds))
              : undefined,
        };
        report.samples.push({
          origin,
          contextIndex,
          cache: round === 0 ? 'cold-context' : 'warm-same-tab',
          navigationMs: Date.now() - navigationAt,
          selectedToDoneMs: done.time - selectedAt,
          conversionMs: done.time - before.time,
          workersCreated: done.profile.workers.length - before.workers,
          workersOnPage: done.profile.workers.length,
          phaseTimings,
          workerMessages: done.profile.messages.slice(before.messages),
          resourceSnapshot: [...resources],
          download: {
            bytes: bytes.length,
            container: bytes.subarray(4, 8).toString('ascii'),
            failure: await download.failure(),
          },
          decoded,
          writes: [...writes],
          errors: [...errors],
        });
      }
      await context.close();
    }
  report.passed = report.samples.every(
    (x) =>
      x.download.container === 'ftyp' &&
      x.download.failure === null &&
      x.decoded.width === 64 &&
      x.decoded.height === 48 &&
      x.decoded.cornerAlpha === 0 &&
      x.writes.every((w) => w.path === '/api/events' && !w.inputPresent) &&
      !x.errors.length,
  );
} catch (error) {
  report.error = error.message;
  report.passed = false;
} finally {
  await browser.close();
  await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      error: report.error,
      samples: report.samples.map(({ origin, cache, conversionMs, workersCreated, decoded }) => ({
        origin,
        cache,
        conversionMs,
        workersCreated,
        decoded,
      })),
    },
    null,
    2,
  ),
);
if (!report.passed) process.exitCode = 1;
