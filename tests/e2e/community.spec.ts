import { expect, test } from '@playwright/test';
import { memberSession, memberUser, mockMember } from './member-fixture';

const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const id = 'afbf55b6-3d45-4764-b97e-2603328ddf86';
const date = '2026-11-06T00:00:00.000Z';
const note = {
  id,
  display_name: '小匣友',
  content: '<script>请加一套问候表情</script>',
  reply: '收到！',
  created_at: date,
};
const gifRecord = { id, title: '测试表情', created_at: date, published: true };

test('游客看得到工具介绍和 GIF 下载，工具与留言需要登录', async ({ page }) => {
  await page.route('**/api/community?kind=gifs**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.has('id'))
      return route.fulfill({
        body: gif,
        contentType: 'image/gif',
        headers: query.has('download')
          ? { 'content-disposition': 'attachment; filename=qingxia.gif' }
          : {},
      });
    return route.fulfill({ json: { items: [gifRecord] } });
  });
  await page.goto('/tool/json');
  await expect(page.getByRole('heading', { name: '登录后使用这个工具' })).toBeVisible();
  await expect(page.getByRole('link', { name: '登录 / 注册' })).toHaveAttribute(
    'href',
    '/account?next=%2Ftool%2Fjson',
  );
  await page.goto('/wall');
  await expect(page.getByRole('heading', { name: '轻匣留言墙' })).toBeVisible();
  await expect(page.getByLabel('公开昵称')).toHaveCount(0);
  await page.goto('/gifs');
  await expect(page.getByText('表情包会不定期更新。', { exact: false })).toBeVisible();
  const image = page.getByRole('img', { name: gifRecord.title });
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载 ' + gifRecord.title }).click();
  expect((await downloading).suggestedFilename()).toBe('qingxia.gif');
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
});

test('注册验证码、工具返回路径和退出走完整 UI 流程', async ({ page }) => {
  await page.route('**/auth/v1/signup', (route) =>
    route.fulfill({ json: { user: { ...memberUser, email_confirmed_at: null } } }),
  );
  await page.route('**/auth/v1/verify', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ type: 'email', token: '123456' });
    return route.fulfill({ json: memberSession });
  });
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: memberUser }));
  await page.route('**/auth/v1/logout?*', (route) => route.fulfill({ status: 204 }));
  await page.goto('/tool/json');
  await page.getByRole('link', { name: '登录 / 注册' }).click();
  await page.getByRole('button', { name: '免费注册' }).click();
  await page.getByLabel('邮箱').fill(memberUser.email);
  await page.getByLabel('密码').fill('TestOnly123!');
  await page.getByRole('button', { name: '发送注册验证码' }).click();
  await page.getByLabel('邮件验证码').fill('123456');
  await page.getByRole('button', { name: '验证邮箱' }).click();
  await expect(page).toHaveURL(/\/tool\/json$/);
  await expect(page.getByRole('heading', { name: '登录后使用这个工具' })).toHaveCount(0);
  await page.getByRole('link', { name: '我的账号' }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '登录轻匣' })).toBeVisible();
});

test('找回验证码只用于重设密码，随后回到登录', async ({ page }) => {
  await page.route('**/auth/v1/recover', (route) => route.fulfill({ json: {} }));
  await page.route('**/auth/v1/verify', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ type: 'recovery', token: '123456' });
    return route.fulfill({ json: memberSession });
  });
  await page.route('**/auth/v1/user', (route) => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON()).toMatchObject({ password: 'NewTestOnly123!' });
    return route.fulfill({ json: memberUser });
  });
  await page.route('**/auth/v1/logout?*', (route) => route.fulfill({ status: 204 }));
  await page.goto('/account');
  await page.getByRole('button', { name: '忘记密码' }).click();
  await page.getByLabel('邮箱').fill(memberUser.email);
  await page.getByRole('button', { name: '发送找回验证码' }).click();
  await page.getByLabel('邮件验证码').fill('123456');
  await page.getByRole('button', { name: '验证邮箱' }).click();
  await page.getByLabel('新密码').fill('NewTestOnly123!');
  await page.getByRole('button', { name: '保存新密码' }).click();
  await expect(page.getByText('密码已更新，请用新密码登录。')).toBeVisible();
  await expect(page.getByRole('link', { name: '登录或注册' })).toBeVisible();
});

test('320px 和深色下留言以纯文本展示，发布与仅删除自己的留言可操作', async ({ page, context }) => {
  await mockMember(context);
  await page.setViewportSize({ width: 320, height: 840 });
  let own = false;
  await page.route('**/api/community?kind=notes**', (route) => {
    const method = route.request().method();
    expect(route.request().headers().authorization).toBe('Bearer ' + memberSession.access_token);
    if (method === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ name: '新昵称', content: '新建议' });
      own = true;
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (method === 'DELETE') {
      own = false;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        items: [
          ...(own ? [{ ...note, id: 'own', own: true, content: '新建议', reply: null }] : []),
          { ...note, own: false },
        ],
        more: false,
      },
    });
  });
  await page.goto('/wall');
  await page.getByRole('button', { name: '切换深色模式' }).click();
  await expect(page.getByText(note.content, { exact: true })).toBeVisible();
  await expect(page.getByText('收到！', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '删除我的留言' })).toHaveCount(0);
  await page.getByLabel('公开昵称').fill('新昵称');
  await page.getByLabel('留言', { exact: true }).fill('新建议');
  await page.getByRole('button', { name: '贴上留言墙' }).click();
  await expect(page.getByText('便利贴已贴上墙。')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除我的留言' }).click();
  await expect(page.getByText('便利贴已删除。')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('站长工作台显示账号汇总并可回复、发布和删除', async ({ page }) => {
  let reply = '';
  let stickerPublished = false;
  await page.route('**/api/admin?*', (route) =>
    route.fulfill({
      json: {
        summary: { views: 2, visitors: 1, uses: 1, success: 1 },
        daily: [],
        hourly: [],
        tools: [],
        members: { registered: 12, newRegistrations: 3, logins: 8, active: 4 },
      },
    }),
  );
  await page.route('**/api/community?manage=1&kind=notes**', (route) => {
    if (route.request().method() === 'PATCH') {
      reply = route.request().postDataJSON().reply;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { items: [{ ...note, own: false, reply }], more: false } });
  });
  await page.route('**/api/community?manage=1&kind=gifs**', (route) => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON();
      expect(data.title).toBe(gifRecord.title);
      expect(Buffer.from(data.gif, 'base64')).toEqual(gif);
      stickerPublished = true;
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (route.request().method() === 'DELETE') {
      stickerPublished = false;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { items: stickerPublished ? [gifRecord] : [] } });
  });
  await page.route('**/api/community?kind=gifs&id=*', (route) =>
    route.fulfill({ body: gif, contentType: 'image/gif' }),
  );
  await page.goto('/admin');
  await expect(page.getByText('已验证账号总数')).toBeVisible();
  await expect(page.getByText('12', { exact: true })).toBeVisible();
  await page.getByLabel('站长回复').fill('感谢建议！');
  await page.getByRole('button', { name: '保存回复' }).click();
  await expect(page.getByText('站长回复已保存')).toBeVisible();
  await expect(page.getByText('感谢建议！', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'GIF 管理' }).click();
  await page.getByLabel('表情包名称').fill(gifRecord.title);
  await page.getByLabel('GIF 文件', { exact: false }).setInputFiles({
    name: 'fixture.gif',
    mimeType: 'image/gif',
    buffer: gif,
  });
  await page.getByRole('button', { name: '上传并发布' }).click();
  await expect(page.getByText('表情包已发布')).toBeVisible();
  await expect(page.getByText(gifRecord.title, { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除 GIF' }).click();
  await expect(page.getByText('表情包已删除')).toBeVisible();
  await expect(page.getByText(gifRecord.title, { exact: true })).toHaveCount(0);
});
