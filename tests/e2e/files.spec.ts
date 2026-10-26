import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { unzipSync } from 'fflate';

type FixtureFile = { name: string; mimeType: string; buffer: Buffer };

async function pngFixture(page: Page, name: string, width = 64, height = 48): Promise<FixtureFile> {
  const base64 = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#a7f07a';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#1a3448';
      context.fillRect(0, 0, Math.floor(width / 2), Math.floor(height / 2));
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { width, height },
  );
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

async function pdfFixture(name: string, widths: number[]): Promise<FixtureFile> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [index, width] of widths.entries()) {
    const page = doc.addPage([width, 600]);
    page.drawText(`PRIVATE_FIXTURE_PAGE_${index + 1}`, { x: 20, y: 500, size: 12, font });
  }
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

async function downloadBytes(page: Page, action: () => Promise<unknown>) {
  const pending = page.waitForEvent('download');
  await action();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).toBeTruthy();
  return { name: download.suggestedFilename(), bytes: await readFile(path!) };
}

function expectPng(bytes: Uint8Array) {
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
}

test('图片转换生成真实 AVIF 编码，浏览器可重新解码', async ({ page }) => {
  await page.goto('/tool/image-convert');
  const input = await pngFixture(page, 'avif-source.png');
  await page.locator('input[type="file"]').setInputFiles(input);
  await page.getByLabel('输出格式').selectOption('avif');
  await page.getByRole('button', { name: '开始转换', exact: true }).click();
  const downloadButton = page.getByRole('button', { name: '下载 AVIF', exact: true });
  await expect(downloadButton).toBeVisible();
  const result = await downloadBytes(page, () => downloadButton.click());
  expect(result.name).toBe('avif-source.avif');
  expect(result.bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
  expect(result.bytes.subarray(8, 32).toString('ascii')).toMatch(/avif|avis/);
  const dimensions = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: 'image/avif' }),
    );
    const size = { width: image.width, height: image.height };
    image.close();
    return size;
  }, Array.from(result.bytes));
  expect(dimensions).toEqual({ width: 64, height: 48 });
});

test('图片批量转换下载真实 ZIP，网络只发送匿名事件、不上传文件', async ({ page }) => {
  const mutations: { url: string; body: string; contentType: string }[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutations.push({
        url: request.url(),
        body: request.postData() || '',
        contentType: request.headers()['content-type'] || '',
      });
    }
  });
  await page.goto('/tool/image-convert');
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      await pngFixture(page, 'PRIVATE_IMAGE_A.png', 64, 48),
      await pngFixture(page, 'PRIVATE_IMAGE_B.png', 32, 64),
    ]);
  await page.getByLabel('输出格式').selectOption('webp');
  await page.getByRole('button', { name: '开始转换', exact: true }).click();
  await expect(page.locator('.image-result')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '开始转换', exact: true })).toBeEnabled();
  const result = await downloadBytes(page, () =>
    page.getByRole('button', { name: '打包 ZIP 下载', exact: true }).click(),
  );
  expect(result.name).toMatch(/\.zip$/);
  const entries = unzipSync(result.bytes);
  expect(Object.keys(entries).sort()).toEqual(['PRIVATE_IMAGE_A.webp', 'PRIVATE_IMAGE_B.webp']);
  for (const bytes of Object.values(entries)) {
    expect(Buffer.from(bytes.subarray(0, 4)).toString('ascii')).toBe('RIFF');
    expect(Buffer.from(bytes.subarray(8, 12)).toString('ascii')).toBe('WEBP');
  }
  await expect
    .poll(() => mutations.some((request) => request.body.includes('tool_use')))
    .toBe(true);
  expect(mutations.length).toBeGreaterThan(0);
  for (const request of mutations) {
    expect(new URL(request.url).pathname).toBe('/api/events');
    expect(request.contentType).toContain('application/json');
    const event = JSON.parse(request.body) as Record<string, unknown>;
    expect(
      Object.keys(event).every((key) =>
        ['type', 'path', 'tool', 'outcome', 'visitor'].includes(key),
      ),
    ).toBe(true);
    expect(request.body.length).toBeLessThan(300);
    expect(request.body).not.toContain('PRIVATE_IMAGE');
    expect(request.body).not.toContain('data:image');
  }
});

test('PDF 合并支持调整顺序，下载文件页数与页面顺序正确', async ({ page }) => {
  await page.goto('/tool/pdf-merge');
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      await pdfFixture('first.pdf', [300, 400]),
      await pdfFixture('second.pdf', [500]),
    ]);
  await page.getByRole('button', { name: '上移 second.pdf', exact: true }).click();
  await page.getByRole('button', { name: '合并 PDF', exact: true }).click();
  await expect(page.getByText('已合并 2 份文件，共 3 页', { exact: false })).toBeVisible();
  const result = await downloadBytes(page, () =>
    page.getByRole('button', { name: '下载结果', exact: true }).click(),
  );
  const doc = await PDFDocument.load(result.bytes);
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPages().map((pdfPage) => pdfPage.getWidth())).toEqual([500, 300, 400]);
});

test('PDF 指定范围拆分与逐页 ZIP 导出的页码准确', async ({ page }) => {
  await page.goto('/tool/pdf-split');
  await page
    .locator('input[type="file"]')
    .setInputFiles(await pdfFixture('range-source.pdf', [300, 400, 500]));
  await page.getByLabel('页码范围').fill('1,3');
  await page.getByRole('button', { name: '拆分 PDF', exact: true }).click();
  await expect(page.getByText('原文件 3 页，生成 1 份 PDF。', { exact: true })).toBeVisible();
  const selected = await downloadBytes(page, () =>
    page.getByRole('button', { name: '下载', exact: true }).click(),
  );
  const selectedDoc = await PDFDocument.load(selected.bytes);
  expect(selectedDoc.getPages().map((pdfPage) => pdfPage.getWidth())).toEqual([300, 500]);

  await page.getByLabel('导出方式').selectOption('pages');
  await page.getByLabel('页码范围').fill('2-3');
  await page.getByRole('button', { name: '拆分 PDF', exact: true }).click();
  await expect(page.getByText('原文件 3 页，生成 2 份 PDF。', { exact: true })).toBeVisible();
  const zip = await downloadBytes(page, () =>
    page.getByRole('button', { name: '打包下载 ZIP', exact: true }).click(),
  );
  const entries = unzipSync(zip.bytes);
  const names = Object.keys(entries).sort();
  expect(names).toEqual(['range-source-第002页.pdf', 'range-source-第003页.pdf']);
  const pageWidths: number[] = [];
  for (const name of names) {
    const doc = await PDFDocument.load(entries[name]);
    expect(doc.getPageCount()).toBe(1);
    pageWidths.push(doc.getPage(0).getWidth());
  }
  expect(pageWidths).toEqual([400, 500]);
});

test('PDF 所选页面渲染为真实 PNG，支持单张及批量 ZIP 下载', async ({ page }) => {
  await page.goto('/tool/pdf-to-images');
  await page
    .locator('input[type="file"]')
    .setInputFiles(await pdfFixture('render-source.pdf', [300, 400, 500]));
  await page.getByLabel('输出格式').selectOption('image/png');
  await page.getByLabel('页码范围').fill('1,3');
  await page.getByRole('button', { name: '导出图片', exact: true }).click();
  await expect(page.getByText('已生成 2 张图片', { exact: false })).toBeVisible();
  const image = await downloadBytes(page, () =>
    page.getByRole('button', { name: '下载', exact: true }).first().click(),
  );
  expectPng(image.bytes);
  expect(image.bytes.readUInt32BE(16)).toBe(500);
  expect(image.bytes.readUInt32BE(20)).toBe(1000);
  const zip = await downloadBytes(page, () =>
    page.getByRole('button', { name: '批量下载 ZIP', exact: true }).click(),
  );
  const entries = unzipSync(zip.bytes);
  expect(Object.keys(entries).sort()).toEqual([
    'render-source-第001页.png',
    'render-source-第003页.png',
  ]);
  for (const bytes of Object.values(entries)) expectPng(bytes);
});

test('图片转 PDF 保留全部图片，并按图片方向生成横纵页面', async ({ page }) => {
  await page.goto('/tool/images-to-pdf');
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      await pngFixture(page, 'wide.png', 64, 32),
      await pngFixture(page, 'tall.png', 32, 64),
    ]);
  await page.getByLabel('页面方向').selectOption('auto');
  await page.getByRole('button', { name: '生成 PDF', exact: true }).click();
  await expect(page.getByText('已生成 2 页 PDF', { exact: false })).toBeVisible();
  const result = await downloadBytes(page, () =>
    page.getByRole('button', { name: '下载结果', exact: true }).click(),
  );
  const doc = await PDFDocument.load(result.bytes);
  expect(doc.getPageCount()).toBe(2);
  expect(doc.getPage(0).getWidth()).toBeGreaterThan(doc.getPage(0).getHeight());
  expect(doc.getPage(1).getHeight()).toBeGreaterThan(doc.getPage(1).getWidth());
});
