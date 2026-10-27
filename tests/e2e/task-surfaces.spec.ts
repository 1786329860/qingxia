import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('上传区真实拖入、空拖入保护和键盘选择生效，文件正文不上传', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(request.postData() || '');
  });
  await page.goto('/tool/image-convert');
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({
    name: 'LOCAL_UPLOAD_ORIGINAL_629.png',
    mimeType: 'image/png',
    buffer: Buffer.from('LOCAL_ONLY_BODY_629'),
  });
  await expect(page.locator('.file-name')).toHaveText('LOCAL_UPLOAD_ORIGINAL_629.png');
  const dropzone = page.locator('.dropzone');
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(['LOCAL_DROP_BODY_629'], 'LOCAL_UPLOAD_DRAGGED_629.png', { type: 'image/png' }),
    );
    return data;
  });
  await dropzone.dispatchEvent('dragenter', { dataTransfer: transfer });
  await dropzone.locator('.dropzone-icon').dispatchEvent('dragenter', { dataTransfer: transfer });
  await dropzone.locator('.dropzone-icon').dispatchEvent('dragleave', { dataTransfer: transfer });
  await expect(dropzone).toHaveAttribute('data-upload-state', 'dragging');
  await dropzone.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(dropzone).toHaveAttribute('data-upload-state', 'idle');
  await expect(page.locator('.file-name')).toHaveText([
    'LOCAL_UPLOAD_ORIGINAL_629.png',
    'LOCAL_UPLOAD_DRAGGED_629.png',
  ]);
  const empty = await page.evaluateHandle(() => new DataTransfer());
  await dropzone.dispatchEvent('drop', { dataTransfer: empty });
  await expect(page.locator('.file-name')).toHaveCount(2);
  const chooserPending = page.waitForEvent('filechooser');
  await page.locator('.dropzone-button').focus();
  await page.keyboard.press('Enter');
  const chooser = await chooserPending;
  await chooser.setFiles({
    name: 'LOCAL_UPLOAD_KEYBOARD_629.png',
    mimeType: 'image/png',
    buffer: Buffer.from('LOCAL_KEYBOARD_BODY_629'),
  });
  await expect(page.locator('.file-name')).toHaveCount(3);
  expect(writes.join('')).not.toMatch(/LOCAL_(?:UPLOAD|ONLY|DROP|KEYBOARD)/);
});

test('复制与下载反馈对应真实操作，主题切换保留输入和结果', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/tool/json');
  await page.locator('textarea').first().fill('{"private":"LOCAL_JSON_STATE_629","ok":true}');
  await page.getByRole('button', { name: '格式化 / 校验', exact: true }).click();
  const result = page.getByRole('textbox', { name: '处理结果', exact: true });
  await expect(result).toHaveValue(/LOCAL_JSON_STATE_629/);
  await page.getByRole('button', { name: '复制', exact: true }).click();
  await expect(page.getByRole('button', { name: '已复制', exact: true })).toBeVisible();
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).ok).toBe(true);
  await page.getByRole('button', { name: '切换浅色模式', exact: true }).click();
  await expect(result).toHaveValue(/LOCAL_JSON_STATE_629/);
  await expect(page.locator('textarea').first()).toHaveValue(/LOCAL_JSON_STATE_629/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载结果', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  expect(JSON.parse(await readFile(path!, 'utf8')).private).toBe('LOCAL_JSON_STATE_629');
  await page.goto('/tool/qr');
  await page.locator('textarea').first().fill('LOCAL_QR_RESULT_629');
  await page.getByRole('button', { name: '生成二维码', exact: true }).click();
  const pngPending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载结果', exact: true }).click();
  await expect(page.getByText('已请求下载，请在浏览器中查看文件。', { exact: true })).toHaveText(
    '已请求下载，请在浏览器中查看文件。',
  );
  const png = await pngPending;
  expect([...(await readFile((await png.path())!)).subarray(0, 8)]).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
});

test('后台示例与真实边界清晰，图表可读，移动筛选和表格不撑开页面', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin');
    await expect(page.getByLabel('站长密码')).toBeVisible();
    await expect(page.locator('.stat-card')).toHaveCount(0);
    await page.getByRole('button', { name: '预览统计界面（示例数据）', exact: true }).click();
    await expect(page.locator('.admin-page')).toHaveAttribute('data-mode', 'demo');
    await expect(page.getByText('正在展示示例数据', { exact: false })).toBeVisible();
    await expect(page.locator('.stat-card')).toHaveCount(4);
    await expect(page.locator('.recharts-pie')).toBeVisible();
    await page.getByRole('button', { name: '按小时', exact: true }).click();
    await expect(page.getByRole('button', { name: '按小时', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('查看某日每小时数据')).toBeVisible();
    await expect(page.locator('th[scope="row"]')).toHaveCount(6);
    await page.getByRole('region', { name: '工具使用明细，可左右滚动', exact: true }).focus();
    await expect(
      page.getByRole('region', { name: '工具使用明细，可左右滚动', exact: true }),
    ).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
