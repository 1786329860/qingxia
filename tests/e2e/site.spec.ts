import { test, expect } from './member-fixture';
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
  'audio-convert',
  'suno-download',
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
  'draw-lots',
  'wheel',
  'coin',
  'dice',
  'bullet-screen',
  'kaomoji',
];
test('首页搜索、收藏与最近使用持久化', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tool-card')).toHaveCount(ids.length);
  await page.getByRole('textbox', { name: '搜索工具' }).fill('JSON');
  await expect(page.locator('.tool-card')).toHaveCount(2);
  await page.getByRole('button', { name: '收藏JSON 格式化', exact: true }).click();
  await page.goto('/?view=favorites');
  await expect(page.locator('.tool-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.tool-card')).toHaveCount(1);
  await page.goto('/tool/json');
  await expect(page.getByRole('heading', { name: 'JSON 格式化', exact: true })).toBeVisible();
  await expect(page.locator('.tool-panel textarea').first()).toBeVisible();
  await page.goto('/?view=recent');
  await expect(page.locator('.tool-card').first()).toContainText('JSON 格式化');
});
test('快速搜索键盘操作、弹层焦点和移动导航可用', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/');
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  const dock = page.getByRole('navigation', { name: '常用入口' });
  const bounds = await dock.boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  const search = page.getByRole('button', { name: '搜索工具', exact: true });
  const brand = await page.locator('.gallery-brand-center .brand-wordmark').boundingBox();
  const searchBounds = await search.boundingBox();
  expect(brand!.x + brand!.width).toBeLessThanOrEqual(searchBounds!.x);
  await search.click();
  const dialog = page.getByRole('dialog', { name: '快速搜索工具' });
  const input = dialog.getByRole('textbox', { name: '快速搜索' });
  await expect(input).toBeFocused();
  for (let index = 0; index < 12; index++) await input.press('ArrowDown');
  await expect(dialog.locator('.command-palette-item').last()).toHaveClass(/is-selected/);
  await input.press('Escape');
  await expect(search).toBeFocused();
  const menu = page.getByRole('button', { name: '打开导航' });
  await menu.click();
  await expect(page.getByRole('button', { name: '关闭导航' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await search.click();
  await input.fill('PDF 合并');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/tool\/pdf-merge$/);
});
test('所有工具路由正常加载且无运行时崩溃', async ({ page }) => {
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
test('Suno 分享文案只提交整理后的链接，点击一次实际下载音频文件', async ({ page }) => {
  const privateLink = 'https://www.suno.com/s/ABcd-3412?tracking=PRIVATE_4321';
  const songID = 'e1963cf9-86b1-4f92-9c6e-2e03cc3a38c4';
  const mediaURL = `https://cdn1.suno.ai/${songID}.mp4`;
  const fixture = await readFile(new URL('fixtures/suno-tone.mp4', import.meta.url));
  const requests: string[] = [];
  page.on('request', (req) => requests.push(req.url() + (req.postData() || '')));
  await page.route('**/api/suno', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ url: 'https://suno.com/s/ABcd-3412' });
    await route.fulfill({
      json: { id: songID, title: '轻匣样曲', sources: [{ url: mediaURL, kind: 'mp4' }] },
    });
  });
  await page.route(mediaURL, (route) =>
    route.fulfill({
      body: fixture,
      contentType: 'video/mp4',
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Length': String(fixture.length) },
    }),
  );
  await page.goto('/tool/suno-download');
  const input = page.getByLabel('Suno 分享链接或文案');
  await input.fill('https://suno.com.evil.example/song/ABcd-3412');
  const button = page.getByRole('button', { name: '下载音频', exact: true });
  await button.click();
  await expect(page.getByText('请粘贴 Suno 的单首歌曲分享链接', { exact: false })).toBeVisible();
  expect(requests.every((value) => !value.includes('/api/suno'))).toBe(true);
  await input.fill('只在本地的整段文案：' + privateLink + '。');
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('轻匣样曲.m4a');
  const audio = await readFile((await download.path())!);
  expect(audio.toString('ascii', 4, 8)).toBe('ftyp');
  expect(audio.includes(Buffer.from('soun'))).toBe(true);
  expect(audio.includes(Buffer.from('vide'))).toBe(false);
  await expect(page.getByRole('button', { name: '再下载一次' })).toBeVisible();
  expect(requests.every((value) => !/PRIVATE_4321|只在本地/.test(value))).toBe(true);
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
