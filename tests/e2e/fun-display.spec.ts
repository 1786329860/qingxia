import { test, expect, type Page } from '@playwright/test';

function watchPrivacy(page: Page, markers: string[]) {
  const writes: { url: string; body: string }[] = [];
  page.on('request', (r) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()))
      writes.push({ url: r.url(), body: r.postData() || '' });
  });
  return () => {
    expect(writes.length).toBeGreaterThan(0);
    for (const entry of writes) {
      expect(new URL(entry.url).pathname).toBe('/api/events');
      const body = JSON.parse(entry.body);
      expect(
        Object.keys(body).every((key) =>
          ['type', 'path', 'tool', 'outcome', 'visitor'].includes(key),
        ),
      ).toBe(true);
      for (const marker of markers) expect(entry.body).not.toContain(marker);
    }
    return writes;
  };
}

test('趣味分类、关键词搜索、工具收藏与最近使用完整接入', async ({ page }) => {
  await page.goto('/?category=fun');
  await expect(page.locator('.tool-card')).toHaveCount(6);
  await page.getByRole('textbox', { name: '搜索工具', exact: true }).fill('转盘');
  await expect(page.locator('.tool-card')).toHaveCount(1);
  await page.getByRole('button', { name: '收藏转盘抽奖', exact: true }).click();
  await page.goto('/?view=favorites');
  await expect(page.locator('.tool-card')).toHaveCount(1);
  await expect(page.locator('.tool-card')).toContainText('转盘抽奖');
  await page.reload();
  await expect(page.locator('.tool-card')).toHaveCount(1);
  await page.goto('/tool/wheel');
  await expect(page.getByRole('heading', { name: '转盘抽奖', exact: true })).toBeVisible();
  await page.goto('/?view=recent');
  await expect(page.locator('.tool-card').first()).toContainText('转盘抽奖');
});

test('颜文字本地搜索分类、真实复制、收藏刷新与清空，正文不上传', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const privacy = watchPrivacy(page, ['LOCAL_PRIVATE_FACE_SEARCH_1127']);
  await page.goto('/tool/kaomoji');
  await expect(page.locator('.kaomoji-item')).toHaveCount(64);
  await page
    .getByRole('textbox', { name: '搜索颜文字', exact: true })
    .fill('LOCAL_PRIVATE_FACE_SEARCH_1127');
  await expect(page.locator('.kaomoji-item')).toHaveCount(0);
  await page.getByRole('textbox', { name: '搜索颜文字', exact: true }).fill('抱抱');
  await page.getByRole('button', { name: '爱意', exact: true }).click();
  expect(await page.locator('.kaomoji-item').count()).toBeGreaterThan(0);
  const first = page.locator('.kaomoji-item').first();
  const face = await first.locator('.kaomoji-face').innerText();
  await first.getByRole('button', { name: /^复制/ }).click();
  await expect(page.getByRole('status')).toHaveText('已复制到剪贴板');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(face);
  await first.getByRole('button', { name: /^收藏/ }).click();
  await page.reload();
  await page.getByRole('button', { name: /我的颜文字收藏/ }).click();
  await expect(page.locator('.kaomoji-item')).toHaveCount(1);
  await expect(page.locator('.kaomoji-face')).toHaveText(face);
  await page.getByRole('button', { name: '清空颜文字收藏', exact: true }).click();
  await expect(page.locator('.kaomoji-item')).toHaveCount(0);
  const writes = privacy();
  expect(writes.filter((x) => JSON.parse(x.body).type === 'tool_use')).toHaveLength(1);
});

test('弹幕横竖与滚动控制、减少动态、全屏不可用降级和隐私', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() =>
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false }),
  );
  const privacy = watchPrivacy(page, ['LOCAL_PRIVATE_BULLET_1127']);
  await page.goto('/tool/bullet-screen');
  await page.getByRole('textbox', { name: /弹幕文字/ }).fill('LOCAL_PRIVATE_BULLET_1127');
  await page.getByRole('combobox', { name: '文字方向', exact: true }).selectOption('vertical');
  await page.getByRole('combobox', { name: '滚动方向', exact: true }).selectOption('up');
  await page.getByRole('checkbox', { name: '文字描边', exact: true }).check();
  await page.getByRole('checkbox', { name: '闪烁（默认关闭）', exact: true }).check();
  await page.getByRole('button', { name: '开始播放', exact: true }).click();
  await expect(page.locator('.bullet-message')).toContainText('LOCAL_PRIVATE_BULLET_1127');
  expect(
    await page.locator('.bullet-message').evaluate((el) => getComputedStyle(el).writingMode),
  ).toBe('vertical-rl');
  expect(
    await page.locator('.bullet-message').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await expect(page.getByText(/系统已开启减少动态效果/)).toBeVisible();
  await page.getByRole('button', { name: '进入全屏', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不支持全屏');
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  privacy();
});

test('真实全屏退出与Wake Lock授权失败优雅降级', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          throw new DOMException('denied', 'NotAllowedError');
        },
      },
    }),
  );
  await page.goto('/tool/bullet-screen');
  await page.getByRole('checkbox', { name: '全屏时尝试保持常亮', exact: true }).check();
  await page.getByRole('button', { name: '进入全屏', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('aria-label')))
    .toBe('弹幕预览');
  await expect(page.locator('.wake-status')).toContainText('暂未获得常亮权限');
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test('Wake Lock生命周期在退出全屏和离开路由时释放', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { requests: 0, releases: 0 };
    Object.assign(window, { __wakeState: state });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          state.requests++;
          const target = new EventTarget();
          return Object.assign(target, {
            release: async () => {
              state.releases++;
              target.dispatchEvent(new Event('release'));
            },
          });
        },
      },
    });
  });
  await page.goto('/tool/bullet-screen');
  await page.getByRole('checkbox', { name: '全屏时尝试保持常亮', exact: true }).check();
  await page.getByRole('button', { name: '进入全屏', exact: true }).click();
  await expect(page.locator('.wake-status')).toContainText('已获得屏幕常亮权限');
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __wakeState: { releases: number } }).__wakeState.releases,
      ),
    )
    .toBe(1);
  await page.getByRole('button', { name: '进入全屏', exact: true }).click();
  await expect(page.locator('.wake-status')).toContainText('已获得屏幕常亮权限');
  await page.evaluate(() => {
    history.pushState({}, '', '/tool/kaomoji');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __wakeState: { releases: number } }).__wakeState.releases,
      ),
    )
    .toBe(2);
});

test('六个新工具在320和390像素无横向溢出，支持浅色主题', async ({ page }) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ['draw-lots', 'wheel', 'coin', 'dice', 'bullet-screen', 'kaomoji']) {
      await page.goto('/tool/' + id);
      await expect(page.locator('.tool-panel button').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await page.getByRole('button', { name: '切换浅色模式', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '复制开心比耶', exact: true }).focus();
  await expect(page.getByRole('button', { name: '复制开心比耶', exact: true })).toBeFocused();
});
