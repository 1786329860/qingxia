import { test, expect } from '@playwright/test';

test('反馈邮件地址与标题正确，邮箱可真实复制且适配移动深浅主题', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(new URL(request.url()).pathname);
  });
  await page.goto('/about');
  const contact = page.locator('.feedback-contact');
  await contact.scrollIntoViewIfNeeded();
  const email = '1786329860@qq.com';
  const href = await contact
    .getByRole('link', { name: '邮件反馈', exact: true })
    .getAttribute('href');
  const address = new URL(href!);
  expect(address.protocol).toBe('mailto:');
  expect(address.pathname).toBe(email);
  expect(address.searchParams.get('subject')).toBe('轻匣 · 反馈与建议');
  await expect(contact.getByRole('link', { name: email, exact: true })).toHaveAttribute(
    'href',
    href!,
  );
  await expect(
    page.locator('.site-footer').getByRole('link', { name: '反馈与建议', exact: true }),
  ).toHaveAttribute('href', href!);
  await contact.getByRole('button', { name: '复制邮箱', exact: true }).click();
  await expect(contact.getByRole('status')).toHaveText('邮箱已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(email);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await contact.scrollIntoViewIfNeeded();
    await expect(contact.getByRole('link', { name: '邮件反馈', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: '切换浅色模式', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await contact.getByRole('button', { name: '复制邮箱', exact: true }).focus();
  await expect(contact.getByRole('button', { name: '复制邮箱', exact: true })).toBeFocused();
  expect(writes.every((path) => path === '/api/events')).toBe(true);
});
