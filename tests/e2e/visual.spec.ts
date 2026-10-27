import { test, expect, type Page } from '@playwright/test';

async function pngFixture(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#92d87b';
    ctx.fillRect(0, 0, 64, 48);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return {
    name: 'VISUAL_STATE_PRESERVED.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  };
}

test('主视觉按可见性暂停，主题切换保留实例，离开路由后释放动画', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
  });
  await page.goto('/');
  const scene = page.locator('.breathing-scene');
  await expect(scene).toHaveAttribute('data-scene-mode', 'animated');
  await expect(scene).toHaveAttribute('data-scene-state', 'running');
  const first = Number(await scene.getAttribute('data-scene-frames'));
  await expect
    .poll(async () => Number(await scene.getAttribute('data-scene-frames')))
    .toBeGreaterThan(first);
  await scene.evaluate((node) => Object.assign(window, { __originalScene: node }));
  await page.getByRole('button', { name: '切换浅色模式', exact: true }).click();
  expect(
    await scene.evaluate(
      (node) => node === (window as unknown as { __originalScene: Element }).__originalScene,
    ),
  ).toBe(true);
  await page.locator('.tool-card').last().scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-scene-state', 'paused');
  const paused = Number(await scene.getAttribute('data-scene-frames'));
  await page.waitForTimeout(250);
  expect(Number(await scene.getAttribute('data-scene-frames'))).toBe(paused);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(scene).toHaveAttribute('data-scene-state', 'running');
  // This simulates the visibility event branch; it is not a claim of real device background testing.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(scene).toHaveAttribute('data-scene-state', 'paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(scene).toHaveAttribute('data-scene-state', 'running');
  await page.locator('.tool-card-link').first().click();
  await expect(scene).toHaveCount(0);
  const removedFrame = await page.evaluate(
    () =>
      (window as unknown as { __originalScene: HTMLElement }).__originalScene.dataset.sceneFrames,
  );
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __originalScene: HTMLElement }).__originalScene.dataset.sceneFrames,
    ),
  ).toBe(removedFrame);
});

test('减少动态与低设备预算保留完整静态主视觉及可用搜索', async ({ browser }) => {
  for (const mode of ['reduced-motion', 'device-budget']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference',
      hasTouch: true,
    });
    if (mode === 'device-budget')
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 2 });
        Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 1 });
      });
    const page = await context.newPage();
    await page.goto(test.info().project.use.baseURL + '/');
    const scene = page.locator('.breathing-scene');
    await expect(scene).toHaveAttribute('data-scene-state', 'static');
    await expect(scene).toHaveAttribute('data-scene-reason', mode);
    await expect(scene).toBeVisible();
    const initialFrame = await scene.getAttribute('data-scene-frames');
    await page.waitForTimeout(200);
    expect(await scene.getAttribute('data-scene-frames')).toBe(initialFrame);
    await page.getByRole('textbox', { name: '搜索工具', exact: true }).fill('JSON');
    await expect(page.locator('.tool-card')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await context.close();
  }
});

test('主题切换不会重建等待编码器的工具，取消与后续输出仍真实可用', async ({ page }) => {
  let hold = true;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/avif_enc[^?]*\.wasm$/, async (route) => {
    if (hold) await gate;
    await route.continue().catch(() => {});
  });
  await page.goto('/tool/image-convert');
  await page.locator('input[type="file"]').setInputFiles(await pngFixture(page));
  await page
    .locator('.image-tool')
    .evaluate((node) => Object.assign(window, { __originalTool: node }));
  await page.getByLabel('输出格式').selectOption('avif');
  await page.getByRole('button', { name: '开始转换', exact: true }).click();
  await page.getByRole('button', { name: '切换浅色模式', exact: true }).click();
  expect(
    await page
      .locator('.image-tool')
      .evaluate(
        (node) => node === (window as unknown as { __originalTool: Element }).__originalTool,
      ),
  ).toBe(true);
  await expect(page.locator('.file-name')).toHaveText('VISUAL_STATE_PRESERVED.png');
  await expect(page.getByRole('button', { name: '取消处理', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消处理', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('已取消');
  hold = false;
  release();
  await page.getByRole('button', { name: '开始转换', exact: true }).click();
  await expect(page.getByRole('button', { name: '下载 AVIF', exact: true })).toBeVisible({
    timeout: 30000,
  });
});

test('390与320触屏布局、键盘导航和主题对比不依赖悬停', async ({ browser }) => {
  for (const width of [390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(test.info().project.use.baseURL + '/');
    await expect(page.locator('.tool-card')).toHaveCount(28);
    await page.getByRole('button', { name: /^收藏/ }).first().tap();
    await expect(page.getByRole('button', { name: /^取消收藏/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('textbox', { name: '搜索工具', exact: true }).focus();
    await page.keyboard.type('JSON');
    await expect(page.locator('.tool-card')).toHaveCount(2);
    await page.getByRole('button', { name: '切换浅色模式', exact: true }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('textbox', { name: '搜索工具', exact: true }).focus();
    await expect(page.getByRole('textbox', { name: '搜索工具', exact: true })).toBeFocused();
    await context.close();
  }
});
