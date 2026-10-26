import { test, expect, type Page, type Request } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const fixtureName = 'qingxia-private-media-fixture-7391.webm';
let fixture: Buffer;
let fixtureAudioDuration = 0;

// MediaRecorder writes an open-ended WebM without a Duration element. Add the
// measured recording duration to its existing Info element so it is seekable,
// just like an ordinary exported WebM. No fixture service or native CLI is used.
function setWebMDuration(bytes: Buffer, milliseconds: number): Buffer {
  const info = bytes.indexOf(Buffer.from([0x15, 0x49, 0xa9, 0x66]));
  if (info < 0) throw new Error('Recorded fixture has no WebM Info element');
  const sizeAt = info + 4;
  let width = 1;
  while (width <= 8 && !(bytes[sizeAt] & (0x80 >> (width - 1)))) width++;
  if (width > 6) throw new Error('Unexpected WebM Info length encoding');
  let size = bytes[sizeAt] & (0xff >> width);
  for (let i = 1; i < width; i++) size = size * 256 + bytes[sizeAt + i];
  const end = sizeAt + width + size;
  const duration = Buffer.alloc(11);
  duration.set([0x44, 0x89, 0x88]);
  duration.writeDoubleBE(milliseconds, 3); // MediaRecorder's TimecodeScale is 1 ms.
  const newSize = size + duration.length;
  if (newSize >= 2 ** (7 * width) - 1)
    throw new Error('WebM fixture Info element is unexpectedly large');
  const encodedSize = Buffer.alloc(width);
  let remaining = newSize;
  for (let i = width - 1; i >= 0; i--) {
    encodedSize[i] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  encodedSize[0] |= 0x80 >> (width - 1);
  return Buffer.concat([
    bytes.subarray(0, sizeAt),
    encodedSize,
    bytes.subarray(sizeAt + width, end),
    duration,
    bytes.subarray(end),
  ]);
}

test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage();
  try {
    await page.goto(baseURL || 'http://127.0.0.1:5173');
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    const recording = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 96;
      const context = canvas.getContext('2d')!;
      const audio = new AudioContext();
      await audio.resume();
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = 440;
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      const videoStream = canvas.captureStream(12);
      const stream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      const mime = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mime))
        throw new Error('Chromium must support recording VP8/Opus WebM for this test');
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 100_000,
        audioBitsPerSecond: 32_000,
      });
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.addEventListener('stop', () => resolve(), { once: true });
        recorder.addEventListener(
          'error',
          () => reject(new Error('Browser fixture recording failed')),
          { once: true },
        );
      });
      let frame = 0;
      function draw() {
        context.fillStyle = '#152c24';
        context.fillRect(0, 0, 160, 96);
        context.fillStyle = '#b9f97d';
        context.fillRect((frame * 3) % 135, 22, 25, 25);
        context.fillStyle = '#ffffff';
        context.font = '14px sans-serif';
        context.fillText(`轻匣 ${frame++}`, 12, 80);
      }
      draw();
      const drawing = setInterval(draw, 80);
      const start = performance.now();
      oscillator.start();
      recorder.start();
      try {
        await new Promise((resolve) => setTimeout(resolve, 1600));
        const duration = performance.now() - start;
        recorder.stop();
        await stopped;
        return {
          bytes: Array.from(
            new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()),
          ),
          duration,
        };
      } finally {
        clearInterval(drawing);
        oscillator.stop();
        stream.getTracks().forEach((track) => track.stop());
        await audio.close();
      }
    });
    fixture = setWebMDuration(Buffer.from(recording.bytes), recording.duration);
    expect(fixture.subarray(0, 4).toString('hex')).toBe('1a45dfa3');
    expect(fixture.length).toBeGreaterThan(1000);
    fixtureAudioDuration = await decodeAudioDuration(page, fixture);
    expect(fixtureAudioDuration).toBeGreaterThan(0.35);
  } finally {
    await page.close();
  }
});

function watchRequests(page: Page) {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  return () => {
    const writes = requests.filter((request) => !['GET', 'HEAD'].includes(request.method()));
    for (const request of writes) {
      expect(new URL(request.url()).pathname).toBe('/api/events');
      const payload = request.postData() || '';
      expect(payload).not.toContain(fixtureName);
      expect(request.headers()['content-type']).toContain('application/json');
      const event = JSON.parse(payload);
      expect(
        Object.keys(event).every((key) =>
          ['visitor', 'type', 'path', 'tool', 'outcome'].includes(key),
        ),
      ).toBe(true);
    }
    // FFmpeg's large WASM is a same-site GET, never a request carrying the file.
    for (const request of requests.filter((request) => request.url().includes('/ffmpeg/'))) {
      expect(request.method()).toBe('GET');
      expect(request.postDataBuffer()).toBeNull();
    }
  };
}

async function uploadFixture(page: Page) {
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: fixtureName, mimeType: 'video/webm', buffer: fixture });
}

async function downloadResult(page: Page) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载结果', exact: true }).click();
  const download = await downloaded;
  const path = await download.path();
  expect(path).toBeTruthy();
  return readFile(path!);
}

async function decodeAudioDuration(page: Page, bytes: Buffer) {
  return page.evaluate(async (data) => {
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const audio = await decoder.decodeAudioData(new Uint8Array(data).buffer);
    return audio.duration;
  }, Array.from(bytes));
}

test('视频本地抽帧，ZIP 内包含可解码的真实 JPG，文件无上传', async ({ page }) => {
  const assertNoUpload = watchRequests(page);
  await page.goto('/tool/video-frames');
  await uploadFixture(page);
  await expect(page.locator('.tool-workspace .muted')).toContainText('160 × 96');
  await page.getByLabel('开始时间（秒）', { exact: true }).fill('0');
  await page.getByLabel('结束时间（秒）', { exact: true }).fill('1.2');
  await page.getByLabel('抽帧间隔（秒）', { exact: true }).fill('0.5');
  await page.getByRole('button', { name: /^开始抽帧/ }).click();
  await expect(page.getByText('已生成 3 帧', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.media-frame-card img')).toHaveCount(3);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载全部 ZIP', exact: true }).click();
  const path = await (await downloaded).path();
  expect(path).toBeTruthy();
  const zip = await readFile(path!);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  const entries = Object.entries(unzipSync(zip));
  expect(entries).toHaveLength(3);
  for (const [name, data] of entries) {
    expect(name).toMatch(/\.jpg$/);
    expect(Buffer.from(data.subarray(0, 3)).toString('hex')).toBe('ffd8ff');
    const dimensions = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
      );
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }, Array.from(data));
    expect(dimensions).toEqual({ width: 160, height: 96 });
  }
  assertNoUpload();
});

test('视频片段通过本地 WASM 生成有效 GIF 并直接下载', async ({ page }) => {
  const assertNoUpload = watchRequests(page);
  await page.goto('/tool/video-gif');
  await uploadFixture(page);
  await page.getByLabel('开始时间（秒）', { exact: true }).fill('0');
  await page.getByLabel('结束时间（秒）', { exact: true }).fill('0.6');
  await page.getByLabel('帧率（FPS）', { exact: true }).fill('10');
  await page.getByLabel('输出宽度（像素）').selectOption('320');
  await page.getByRole('button', { name: '生成 GIF', exact: true }).click();
  await expect(page.getByRole('button', { name: '下载结果', exact: true })).toBeVisible({
    timeout: 90_000,
  });
  const gif = await downloadResult(page);
  expect(gif.subarray(0, 6).toString()).toMatch(/^GIF8[79]a$/);
  expect(gif.readUInt16LE(6)).toBe(320);
  expect(gif.readUInt16LE(8)).toBe(192);
  expect(gif[gif.length - 1]).toBe(0x3b);
  await expect(page.getByAltText('生成的 GIF 预览')).toBeVisible();
  assertNoUpload();
});

test('提取真实音轨，MP3 和 WAV 均能解码且没有文件上传', async ({ page }) => {
  const assertNoUpload = watchRequests(page);
  await page.goto('/tool/extract-audio');
  await uploadFixture(page);
  await page.getByRole('button', { name: '提取音频', exact: true }).click();
  await expect(page.getByRole('button', { name: '下载结果', exact: true })).toBeVisible({
    timeout: 90_000,
  });
  const mp3 = await downloadResult(page);
  expect(mp3.length).toBeGreaterThan(1000);
  expect(
    mp3.subarray(0, 3).toString() === 'ID3' || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0),
  ).toBe(true);
  const mp3Duration = await decodeAudioDuration(page, mp3);
  expect(Math.abs(mp3Duration - fixtureAudioDuration)).toBeLessThan(0.15);
  await page.getByLabel('输出格式').selectOption('wav');
  await page.getByRole('button', { name: '提取音频', exact: true }).click();
  await expect(page.getByRole('button', { name: '下载结果', exact: true })).toBeVisible({
    timeout: 90_000,
  });
  const wav = await downloadResult(page);
  expect(wav.subarray(0, 4).toString()).toBe('RIFF');
  expect(wav.subarray(8, 12).toString()).toBe('WAVE');
  const wavDuration = await decodeAudioDuration(page, wav);
  expect(Math.abs(wavDuration - fixtureAudioDuration)).toBeLessThan(0.15);
  assertNoUpload();
});
