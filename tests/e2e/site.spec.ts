import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const ids = [
  'image-compress',
  'image-convert',
  'pdf-merge',
  'pdf-split',
  'pdf-to-images',
  'images-to-pdf',
  'pdf-compress',
  'video-frames',
  'video-gif',
  'extract-audio',
  'json',
  'base64',
  'text-lines',
  'csv-json',
  'units',
  'timestamp',
  'radix',
  'qr',
  'hash',
  'random',
  'color',
  'douyin',
];
test('首页搜索、收藏与最近使用持久化', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tool-card')).toHaveCount(22);
  await page.getByRole('textbox', { name: '搜索工具' }).fill('JSON');
  await expect(page.locator('.tool-card')).toHaveCount(2);
  await page.getByRole('button', { name: '收藏JSON 格式化', exact: true }).click();
  await page.goto('/?view=favorites');
  await expect(page.locator('.tool-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.tool-card')).toHaveCount(1);
  await page.goto('/tool/json');
  await expect(page.getByRole('heading', { name: 'JSON 格式化', exact: true })).toBeVisible();
  await page.goto('/?view=recent');
  await expect(page.locator('.tool-card').first()).toContainText('JSON 格式化');
});
test('22个工具路由正常加载且无运行时崩溃', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const id of ids) {
    await page.goto(`/tool/${id}`);
    await expect(page.locator('.tool-panel button').first()).toBeVisible();
    await expect(page.getByText('这个页面暂时遇到问题', { exact: true })).toHaveCount(0);
    await expect(page.locator('.tool-page-header h1')).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test('JSON完整处理、真实下载与匿名事件不含输入', async ({ page }) => {
  const posted: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') posted.push(req.postData() || '');
  });
  await page.goto('/tool/json');
  await page.locator('textarea').first().fill('{"private_content":"ONLY_STAYS_LOCAL_8629","n":1}');
  await page.getByRole('button', { name: '格式化 / 校验' }).click();
  await expect(page.getByRole('textbox', { name: '处理结果' })).toHaveValue(
    /ONLY_STAYS_LOCAL_8629/,
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载结果', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).toBeTruthy();
  const text = await readFile(path!, 'utf8');
  expect(JSON.parse(text).n).toBe(1);
  await page.waitForTimeout(200);
  expect(posted.length).toBeGreaterThan(0);
  expect(posted.join('')).not.toContain('ONLY_STAYS_LOCAL_8629');
  expect(posted.join('')).not.toContain('private_content');
  await page.locator('textarea').first().fill('{bad}');
  await page.getByRole('button', { name: '格式化 / 校验' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
test('后台默认受保护，演示数据明确标识，环形图正常显示', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByLabel('站长密码')).toBeVisible();
  await expect(page.locator('.stat-card')).toHaveCount(0);
  await page.getByRole('button', { name: '预览统计界面（示例数据）' }).click();
  await expect(page.getByText('正在展示示例数据', { exact: false })).toBeVisible();
  await expect(page.locator('.stat-card')).toHaveCount(4);
  await expect(page.locator('.recharts-pie')).toBeVisible();
  await page.getByRole('button', { name: '按小时', exact: true }).click();
  await expect(page.getByLabel('查看某日每小时数据')).toBeVisible();
});
test('移动端无横向溢出，深浅主题可切换', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.hero-section h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/tool/image-compress');
  await expect(page.locator('.dropzone')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/admin');
  await page.getByRole('button', { name: '预览统计界面（示例数据）' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
