import { test, expect, memberUser } from './member-fixture';
import type { Reminder } from '../../src/lib/reminder-templates';

test('预约贺卡的模板、预览、收件确认链接和取消可操作', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let item: Reminder | undefined;
  const id = '668cb9ca-2572-4d62-b77c-1ef060a71d80';
  const invite = '/reminders#accept=' + 'A'.repeat(43);
  await page.route('**/api/reminders**', (route) => {
    const req = route.request();
    const query = new URL(req.url()).searchParams;
    if (req.method() === 'POST' && query.get('action') === 'confirm') {
      expect(req.postDataJSON().token).toBe('A'.repeat(43));
      return route.fulfill({ json: { ok: true } });
    }
    if (req.method() === 'POST') {
      const data = req.postDataJSON();
      expect(data.recipient).toBe('friend@example.test');
      expect(data.template).toBe('anniversary');
      expect(data.due).toMatch(/Z$/);
      item = {
        id,
        recipient: data.recipient,
        recipient_name: data.name,
        message: data.message,
        template: data.template,
        due_at: data.due,
        state: 'awaiting',
      };
      return route.fulfill({ status: 201, json: { id, invite } });
    }
    if (req.method() === 'DELETE' && item) {
      item = { ...item, state: 'cancelled' };
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { items: item ? [item] : [] } });
  });
  await page.goto('/reminders');
  await expect(page.getByLabel('收件邮箱')).toHaveValue(memberUser.email);
  await page.getByRole('button', { name: /时间的两条线/ }).click();
  await page.getByLabel('收件邮箱').fill('friend@example.test');
  await page.getByLabel('收件人称呼').fill('小王');
  await page.getByLabel('贺卡正文').fill('很高兴和你一起走到今天。');
  await expect(page.getByRole('heading', { name: '纪念日快乐', exact: true })).toBeVisible();
  await expect(page.locator('.mail-card')).toContainText('很高兴和你一起走到今天。');
  await expect(page.getByText('收件人须通过你分享的链接确认', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: test.info().outputPath('anniversary-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({
    path: test.info().outputPath('anniversary-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole('button', { name: '切换浅色模式' }).click();
  await page.getByRole('button', { name: /一封蓝色短笺/ }).click();
  await expect(page.getByRole('heading', { name: '一封写给你的信', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: /时间的两条线/ }).click();
  await page.getByRole('button', { name: '预约发送' }).click();
  await expect(page.getByLabel('收件确认链接')).toHaveValue(
    new RegExp('\\/reminders#accept=A{43}$'),
  );
  await expect(page.getByText('等收件人确认', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '取消预约' }).click();
  await expect(page.getByText('已取消', { exact: true })).toBeVisible();

  await page.goto(invite);
  await page.getByRole('button', { name: '确认接收' }).click();
  await expect(page.getByText('已确认接收，轻匣会在预约时间发出。')).toBeVisible();
  await expect(page).not.toHaveURL(/#accept/);
});
