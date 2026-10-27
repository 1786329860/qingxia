import { test, expect, type Page, type BrowserContext } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

async function deterministicWords(context: BrowserContext, values: number[]) {
  await context.addInitScript((words: number[]) => {
    const original = crypto.getRandomValues.bind(crypto);
    let cursor = 0;
    Object.defineProperty(crypto, 'getRandomValues', {
      configurable: true,
      value: (array: Uint32Array | Uint8Array) => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = words[cursor++ % words.length];
          return array;
        }
        return original(array);
      },
    });
  }, values);
}

function watchPrivacy(page: Page) {
  const writes: { path: string; body: string }[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push({ path: new URL(request.url()).pathname, body: request.postData() || '' });
  });
  return async (privateStrings: string[] = []) => {
    await page.waitForTimeout(200);
    expect(writes.length).toBeGreaterThan(0);
    for (const entry of writes) {
      expect(entry.path).toBe('/api/events');
      const body = JSON.parse(entry.body);
      const fields =
        body.type === 'pageview'
          ? ['path', 'type', 'visitor']
          : ['outcome', 'tool', 'type', 'visitor'];
      expect(Object.keys(body).sort()).toEqual(fields);
      for (const input of privateStrings) expect(entry.body).not.toContain(input);
    }
    return writes.map((entry) => JSON.parse(entry.body));
  };
}

test('抽签去重、不放回、签池重置和复制均真实生效', async ({ page, context }) => {
  await deterministicWords(context, [0]);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const privacy = watchPrivacy(page);
  await page.goto('/tool/draw-lots');
  await page.getByLabel('显示滚动动画', { exact: true }).uncheck();
  await page
    .getByLabel('抽签名单', { exact: false })
    .fill('PRIVATE_ROSTER_A\nPRIVATE_ROSTER_A\nPRIVATE_ROSTER_B');
  await expect(page.getByText('发现 1 行同名：已去重，每个不同名字机会相同。')).toBeVisible();
  await page.getByLabel('本次抽取数量', { exact: true }).fill('2');
  await page.getByRole('button', { name: '开始抽签', exact: true }).click();
  const result = page.getByRole('list', { name: '抽签结果', exact: true });
  await expect(result.getByRole('listitem')).toHaveText(['1PRIVATE_ROSTER_A', '2PRIVATE_ROSTER_B']);
  await page.getByRole('button', { name: '复制', exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    'PRIVATE_ROSTER_A\nPRIVATE_ROSTER_B',
  );
  await page.getByRole('button', { name: '开始抽签', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('签池已空');
  await page.getByRole('button', { name: '重置签池', exact: true }).click();
  await expect(result).toHaveCount(0);
  await page.getByLabel('相同名字只保留一个', { exact: true }).uncheck();
  await page.getByLabel('本次抽取数量', { exact: true }).fill('3');
  await page.getByRole('button', { name: '开始抽签', exact: true }).click();
  await expect(result.getByRole('listitem')).toHaveText([
    '1PRIVATE_ROSTER_A',
    '2PRIVATE_ROSTER_A',
    '3PRIVATE_ROSTER_B',
  ]);
  const events = await privacy(['PRIVATE_ROSTER_A', 'PRIVATE_ROSTER_B']);
  expect(
    events.filter(
      (event) =>
        event.type === 'tool_use' && event.tool === 'draw-lots' && event.outcome === 'success',
    ),
  ).toHaveLength(2);
});

test('抽签拒绝空名单与数量不足，放回模式允许重复抽取', async ({ page, context }) => {
  await deterministicWords(context, [0]);
  const privacy = watchPrivacy(page);
  await page.goto('/tool/draw-lots');
  await page.getByLabel('显示滚动动画', { exact: true }).uncheck();
  await page.getByLabel('抽签名单', { exact: false }).fill('  \n ');
  await page.getByRole('button', { name: '开始抽签', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请先填写名单');
  await page.getByLabel('抽签名单', { exact: false }).fill('PRIVATE_SINGLE_ENTRY');
  await page.getByLabel('本次抽取数量', { exact: true }).fill('2');
  await page.getByRole('button', { name: '开始抽签', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('当前签池只有 1 个名额');
  await page.getByLabel('抽后放回签池（允许重复）', { exact: true }).check();
  await page.getByRole('button', { name: '开始抽签', exact: true }).click();
  await expect(page.getByRole('list', { name: '抽签结果' }).getByRole('listitem')).toHaveText([
    '1PRIVATE_SINGLE_ENTRY',
    '2PRIVATE_SINGLE_ENTRY',
  ]);
  await privacy(['PRIVATE_SINGLE_ENTRY']);
});

test('转盘权重边界、动画指针、复制和本机历史保存清空一致', async ({ page, context }) => {
  await deterministicWords(context, [1]);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const privacy = watchPrivacy(page);
  await page.goto('/tool/wheel');
  await page.getByRole('button', { name: '删除选项 4', exact: true }).click();
  for (const [index, label, weight] of [
    [1, 'PRIVATE_WHEEL_A', '1'],
    [2, 'PRIVATE_WHEEL_B', '3'],
    [3, 'PRIVATE_WHEEL_C', '2'],
  ] as const) {
    await page.getByLabel(`选项 ${index} 名称`, { exact: true }).fill(label);
    await page.getByLabel(`选项 ${index} 权重`, { exact: true }).fill(weight);
  }
  const spin = page.getByRole('button', { name: '转一下', exact: true });
  await spin.click();
  await expect(spin).toBeDisabled();
  await expect(page.getByRole('status', { name: '转盘结果', exact: true })).toContainText(
    '正在转动',
  );
  await expect(page.getByRole('status', { name: '转盘结果', exact: true })).toContainText(
    'PRIVATE_WHEEL_B',
  );
  const angle = await page
    .locator('.fun-wheel-face')
    .evaluate((svg: SVGElement) => Number(/rotate\(([-\d.]+)deg\)/.exec(svg.style.transform)![1]));
  // Ticket 1 falls in B's [1,4) range. Its sector is [60°,240°), centre 150°.
  expect((angle + 150) % 360).toBeCloseTo(0);
  await page.getByRole('button', { name: '复制', exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    'PRIVATE_WHEEL_B',
  );
  await expect(page.locator('.fun-history-list li')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.fun-history-list li')).toHaveCount(1);
  await expect(page.locator('.fun-history-list li')).toContainText('PRIVATE_WHEEL_B');
  await page.getByRole('button', { name: '清空历史', exact: true }).click();
  await expect(page.locator('.fun-history-list li')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.fun-history-list li')).toHaveCount(0);
  await page.getByLabel('选项 1 权重', { exact: true }).fill('0');
  await page.getByRole('button', { name: '转一下', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('权重应为 1～1,000 之间的整数');
  const events = await privacy(['PRIVATE_WHEEL_A', 'PRIVATE_WHEEL_B', 'PRIVATE_WHEEL_C']);
  expect(
    events.filter(
      (event) => event.type === 'tool_use' && event.tool === 'wheel' && event.outcome === 'success',
    ),
  ).toHaveLength(1);
});

test('抛硬币显示预定正反面、批量全部结果、累计和重置', async ({ page, context }) => {
  await deterministicWords(context, [0, 1, 0, 1]);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const privacy = watchPrivacy(page);
  await page.goto('/tool/coin');
  await page.getByLabel('播放翻转动画', { exact: true }).uncheck();
  await page.getByRole('button', { name: '抛一次', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '硬币结果', exact: true })).toHaveValue('1. 正面');
  await page.getByLabel('连续次数', { exact: false }).fill('3');
  await page.getByRole('button', { name: '连续抛掷', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '硬币结果', exact: true })).toHaveValue(
    '1. 反面　2. 正面　3. 反面',
  );
  await expect(page.locator('.fun-tally dd')).toHaveText(['2', '2', '4']);
  await page.getByRole('button', { name: '复制', exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    '反面\n正面\n反面',
  );
  await page.getByRole('button', { name: '重置统计', exact: true }).click();
  await expect(page.locator('.fun-tally dd')).toHaveText(['0', '0', '0']);
  await expect(page.getByRole('textbox', { name: '硬币结果', exact: true })).toHaveCount(0);
  await page.getByLabel('连续次数', { exact: false }).fill('0');
  await page.getByRole('button', { name: '连续抛掷', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('连续次数应为');
  const events = await privacy();
  expect(
    events.filter(
      (event) => event.type === 'tool_use' && event.tool === 'coin' && event.outcome === 'success',
    ),
  ).toHaveLength(2);
});

test('骰子数量、不同面数、点数总和、复制和键盘触发一致', async ({ page, context }) => {
  await deterministicWords(context, [0, 19]);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const privacy = watchPrivacy(page);
  await page.goto('/tool/dice');
  await page.getByLabel('显示掷骰动画', { exact: true }).uncheck();
  await page.getByRole('combobox', { name: '骰子数量', exact: true }).selectOption('6');
  await page.getByRole('combobox', { name: '每个骰子的面数', exact: true }).selectOption('20');
  await page.getByRole('button', { name: '掷骰子', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.fun-die strong')).toHaveText(['1', '20', '1', '20', '1', '20']);
  await expect(page.getByLabel('骰子总和', { exact: true })).toHaveText('63');
  await page.getByRole('button', { name: '复制', exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    '点数：1、20、1、20、1、20\n总和：63',
  );
  await page.getByRole('combobox', { name: '骰子数量', exact: true }).selectOption('1');
  for (const sides of [6, 8, 10, 12, 20]) {
    await page
      .getByRole('combobox', { name: '每个骰子的面数', exact: true })
      .selectOption(`${sides}`);
    await page.getByRole('button', { name: '掷骰子', exact: true }).click();
    const value = Number(await page.getByLabel('骰子 1 点数', { exact: true }).innerText());
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(sides);
    await expect(page.getByLabel('骰子总和', { exact: true })).toHaveText(`${value}`);
  }
  await page.getByRole('button', { name: '清空结果', exact: true }).click();
  await expect(page.locator('.fun-die')).toHaveCount(0);
  await privacy();
});

test('四个趣味工具在320和390像素无横向溢出', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ['draw-lots', 'wheel', 'coin', 'dice']) {
      await page.goto(`/tool/${id}`);
      await expect(page.locator('.tool-panel .fun-random-tool')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  }
});
