import { test as base, type BrowserContext } from '@playwright/test';
import { memberStorageKey } from '../../src/lib/member-storage';

export const memberUser = {
  id: '43c7a361-b7da-4def-a348-3be77559eac7',
  email: 'member@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
export const memberSession = {
  access_token: 'e2e.synthetic.member',
  refresh_token: 'e2e-refresh-token',
  token_type: 'bearer',
  expires_at: 2147483647,
  expires_in: 3600,
  user: memberUser,
};

export async function mockMember(context: BrowserContext) {
  await context.route('**/auth/v1/user', (route) => route.fulfill({ json: memberUser }));
  await context.addInitScript(
    ({ key, session }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session));
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format();
      sessionStorage.setItem('qingxia:last-member-activity', session.user.id + ':' + day);
    },
    { key: memberStorageKey, session: memberSession },
  );
}
export const test = base.extend<{ mockVerifiedMember: void }>({
  mockVerifiedMember: [
    async ({ context }, use) => {
      await mockMember(context);
      await use();
    },
    { auto: true },
  ],
});
export { expect } from '@playwright/test';
