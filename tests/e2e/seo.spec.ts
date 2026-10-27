import { expect, test } from '@playwright/test';
import { SITE_ORIGIN, PUBLIC_PATHS } from '../../src/lib/seo';

test('站点地图与robots返回真实文件，公开工具完整且不列私有地址', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  expect(await robots.text()).toContain('Disallow: /admin');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toMatch(/(?:text|application)\/xml/);
  const addresses = [...(await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(
    (match) => match[1],
  );
  expect(addresses.sort()).toEqual(PUBLIC_PATHS.map((path) => SITE_ORIGIN + path).sort());
  expect(addresses.some((address) => /\/admin|\/api\/|\?view=/.test(address))).toBe(false);
});

test('禁用JavaScript仍能读取首页和工具介绍，爬虫无需运行重引擎', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  const heavy: string[] = [];
  page.on('request', (request) => {
    if (/\.wasm|\/ffmpeg\/|\/vendor\/pdfjs\//.test(request.url())) heavy.push(request.url());
  });
  await page.goto('/');
  await expect(page).toHaveTitle('轻匣 - 免费无广告在线工具箱');
  await expect(page.locator('.tool-card')).toHaveCount(28);
  await expect(page.getByRole('heading', { name: /把日常小事/ })).toBeVisible();
  await page.locator('a.tool-card-link[href="/tool/douyin"]').click();
  await expect(page).toHaveTitle(/抖音链接解析.*轻匣/);
  await expect(page.getByRole('heading', { name: '抖音链接解析', exact: true })).toBeVisible();
  await expect(
    page.getByText('请启用 JavaScript 后粘贴公开作品分享链接。', { exact: false }),
  ).toBeVisible();
  expect(heavy).toEqual([]);
  await context.close();
});

test('路由切换同步独立标题、规范地址、品牌标记与个人视图不收录规则', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', SITE_ORIGIN + '/');
  expect(
    JSON.parse((await page.locator('#qingxia-structured-data').textContent()) || '{}'),
  ).toMatchObject({ '@type': 'WebSite', name: '轻匣' });
  await page.getByRole('textbox', { name: '搜索工具' }).fill('JSON');
  await page.locator('a.tool-card-link[href="/tool/json"]').click();
  await expect(page).toHaveTitle(/JSON 格式化.*轻匣/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    SITE_ORIGIN + '/tool/json',
  );
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', '轻匣');
  await page.getByRole('link', { name: '我的收藏', exact: false }).first().click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await expect(page.locator('#qingxia-structured-data')).toHaveCount(0);
  await page.getByRole('link', { name: '轻匣首页' }).click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(page.locator('#qingxia-structured-data')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
});

test('原始HTML带每页元信息，后台不预渲染统计或标为可收录', async ({ request }) => {
  for (const path of ['/about', '/privacy', '/tool/pdf-merge', '/admin']) {
    const response = await request.get(path);
    const html = await response.text();
    expect(response.status()).toBe(200);
    expect(html).toContain(`rel="canonical" href="${SITE_ORIGIN}${path}"`);
    expect(html).toContain('name="description"');
    if (path === '/admin') {
      expect(html).toContain('name="robots" content="noindex, nofollow"');
      expect(html).toContain('<div id="root"></div>');
      expect(html).not.toContain('qingxia-structured-data');
    } else {
      expect(html).toContain('name="robots" content="index, follow"');
      expect(html).toContain('<h1');
      expect(html).not.toContain('<div hidden id="S:');
    }
  }
});
